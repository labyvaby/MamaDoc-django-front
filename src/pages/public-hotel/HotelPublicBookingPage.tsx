/**
 * Публичная страница прямых продаж отеля — /stay/{slug}. Гость без входа
 * выбирает даты и число гостей, видит свободные категории с ценой за весь
 * период и оставляет заявку: номер резервируется на 30 минут, администратор
 * подтверждает бронь обычным действием в CRM. Оплаты на странице нет.
 *
 * requestId (UUID) создаётся один раз на заявку и не меняется при повторе
 * после сетевой ошибки — второй брони не будет. Если гость поправил данные,
 * UUID новый (иначе бэк ответит 409 REQUEST_CONFLICT). 409 PRICE_CHANGED —
 * цена сдвинулась: показываем новую и просим подтвердить ещё раз.
 * Страница не использует cookies CRM и права сотрудников.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import PeopleOutlineOutlined from "@mui/icons-material/PeopleOutlineOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import { useParams } from "react-router";
import dayjs from "dayjs";

import { ApiError, getErrorCode } from "../../api/client";
import {
  createPublicReservation,
  getPublicAvailability,
  type PublicHotelAvailability,
  type PublicHotelCategory,
  type PublicHotelRequestData,
  type PublicHotelReservation,
} from "../../api/hotelPublic";
import { fieldError, sanitizeFieldInput, type FieldRules } from "../../dev/formRules";

const PHONE_RULES: FieldRules = { kind: "phone", required: true };
const EMAIL_RULES: FieldRules = { kind: "email" };
const NAME_RULES: FieldRules = { required: true, maxLength: 120 };
const MAX_NIGHTS = 90;

const nightsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "ночь" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "ночи" : "ночей");
const money = (v: string | number, currency: string) =>
  `${Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ${currency === "KGS" || !currency ? "сом" : currency}`;

/** Человеческий текст для ошибок, по которым гостю есть что сделать. */
function friendlyError(err: unknown, fallback: string): string {
  const code = getErrorCode(err);
  if (code === "RATE_LIMITED" || (err instanceof ApiError && err.status === 429)) return "Слишком много запросов. Подождите минуту и повторите.";
  if (err instanceof ApiError && err.status === 404) return "Бронирование через сайт для этого отеля недоступно.";
  return err instanceof Error && err.message ? err.message : fallback;
}

export const HotelPublicBookingPage: React.FC = () => {
  const { slug = "" } = useParams();
  const theme = useTheme();
  const today = dayjs().format("YYYY-MM-DD");

  const [checkIn, setCheckIn] = React.useState(dayjs().add(1, "day").format("YYYY-MM-DD"));
  const [checkOut, setCheckOut] = React.useState(dayjs().add(2, "day").format("YYYY-MM-DD"));
  const [adults, setAdults] = React.useState(2);
  const [children, setChildren] = React.useState(0);

  const [availability, setAvailability] = React.useState<PublicHotelAvailability | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);

  const [chosen, setChosen] = React.useState<PublicHotelCategory | null>(null);
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [priceChanged, setPriceChanged] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<PublicHotelReservation | null>(null);

  // UUID заявки: один на неизменное тело, новый — когда гость поправил данные.
  const requestRef = React.useRef<{ id: string; fingerprint: string } | null>(null);

  const nights = dayjs(checkOut).diff(dayjs(checkIn), "day");
  const datesError =
    !checkIn || !checkOut
      ? "Выберите даты"
      : checkIn < today
        ? "Заезд не может быть в прошлом"
        : nights < 1
          ? "Выезд должен быть позже заезда"
          : nights > MAX_NIGHTS
            ? `Не больше ${MAX_NIGHTS} ночей`
            : dayjs(checkIn).isAfter(dayjs().add(2, "year"))
              ? "Бронирование открыто не дальше чем на два года"
              : null;

  const search = async () => {
    if (datesError) return;
    setSearching(true);
    setSearchError(null);
    setChosen(null);
    setPriceChanged(null);
    try {
      const data = await getPublicAvailability(slug, { checkIn, checkOut, adults, children });
      setAvailability(data);
    } catch (err) {
      setAvailability(null);
      if (err instanceof ApiError && err.status === 404) setUnavailable(true);
      else setSearchError(friendlyError(err, "Не удалось получить свободные номера"));
    } finally {
      setSearching(false);
    }
  };

  const nameError = fieldError(fullName, NAME_RULES);
  const phoneError = fieldError(phone, PHONE_RULES);
  const emailError = fieldError(email, EMAIL_RULES);
  const formInvalid = nameError != null || phoneError != null || emailError != null || !consent;

  const submit = async () => {
    if (!chosen || !availability) return;
    if (formInvalid) {
      setShowErrors(true);
      return;
    }
    const body: Omit<PublicHotelRequestData, "requestId"> = {
      roomTypeId: chosen.id,
      checkIn: availability.checkIn,
      checkOut: availability.checkOut,
      adults,
      children,
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      dataConsent: true,
      expectedTotal: chosen.totalAmount,
      comment: comment.trim() || undefined,
    };
    const fingerprint = JSON.stringify(body);
    if (!requestRef.current || requestRef.current.fingerprint !== fingerprint) {
      requestRef.current = { id: crypto.randomUUID(), fingerprint };
    }
    setSending(true);
    setSendError(null);
    setPriceChanged(null);
    try {
      const reservation = await createPublicReservation(slug, { ...body, requestId: requestRef.current.id });
      setDone(reservation);
    } catch (err) {
      const code = getErrorCode(err);
      if (code === "PRICE_CHANGED") {
        // Цена сдвинулась — берём свежую и просим подтвердить ещё раз.
        try {
          const fresh = await getPublicAvailability(slug, { checkIn, checkOut, adults, children });
          setAvailability(fresh);
          const next = fresh.results.find((c) => c.id === chosen.id);
          if (next) {
            setChosen(next);
            setPriceChanged(`Цена изменилась: теперь ${money(next.totalAmount, fresh.currency)}. Проверьте и нажмите «Отправить заявку» ещё раз.`);
          } else {
            setChosen(null);
            setSendError("Эта категория больше недоступна на выбранные даты. Выберите другую.");
          }
        } catch {
          setSendError("Цена изменилась. Обновите страницу и повторите.");
        }
      } else if (code === "NO_AVAILABILITY") {
        setSendError("Свободных номеров этой категории на выбранные даты больше нет. Выберите другую категорию или даты.");
        setChosen(null);
        void search();
      } else if (code === "REQUEST_CONFLICT") {
        // Тот же UUID с другим телом — начинаем заявку заново.
        requestRef.current = null;
        setSendError("Заявку не удалось отправить. Нажмите «Отправить заявку» ещё раз.");
      } else {
        // Сетевая ошибка и всё остальное: UUID остаётся, повтор безопасен.
        setSendError(friendlyError(err, "Не удалось отправить заявку. Попробуйте ещё раз."));
      }
    } finally {
      setSending(false);
    }
  };

  const hotelName = availability?.propertyName;
  const currency = availability?.currency ?? "KGS";

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: alpha(theme.palette.primary.main, 0.04), py: { xs: 3, md: 6 } }}>
      <Container maxWidth="md" sx={{ px: { xs: 2, sm: 3 } }}>
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ mb: 3 }}>
          <HotelOutlined color="primary" />
          <Typography component="h1" sx={{ fontSize: { xs: 22, md: 28 }, fontWeight: 700, letterSpacing: "-0.015em" }}>
            {hotelName ? `Забронировать номер — ${hotelName}` : "Бронирование номера"}
          </Typography>
        </Stack>

        {unavailable ? (
          <Alert severity="info" variant="outlined">
            Бронирование через сайт для этого отеля сейчас недоступно. Свяжитесь с отелем по телефону.
          </Alert>
        ) : done ? (
          <Box sx={{ p: { xs: 3, md: 4 }, borderRadius: "20px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
            <Stack alignItems="center" textAlign="center" gap={1.5}>
              <CheckCircleOutlined sx={{ fontSize: 56, color: "success.main" }} />
              <Typography sx={{ fontSize: 22, fontWeight: 700 }}>Заявка принята</Typography>
              <Typography color="text.secondary">Номер брони</Typography>
              <Typography sx={{ fontSize: 30, fontWeight: 800, letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>{done.reference}</Typography>
              <Stack direction="row" alignItems="center" gap={0.75} color="text.secondary">
                <AccessTimeOutlined fontSize="small" />
                <Typography variant="body2">Номер зарезервирован до {dayjs(done.expiresAt).format("HH:mm")}</Typography>
              </Stack>
              <Typography variant="body2" sx={{ maxWidth: 460 }}>
                Сумма — {money(done.totalAmount, done.currency)}. Администратор отеля подтвердит бронь и свяжется с вами по телефону {phone}.
                Если подтверждения не будет до конца резерва, номер вернётся в продажу.
              </Typography>
            </Stack>
          </Box>
        ) : (
          <Stack gap={3}>
            {/* Поиск */}
            <Box sx={{ p: { xs: 2, md: 3 }, borderRadius: "20px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
              <Stack direction={{ xs: "column", md: "row" }} gap={2} alignItems={{ md: "flex-start" }}>
                <TextField
                  type="date"
                  label="Заезд"
                  value={checkIn}
                  onChange={(e) => {
                    setCheckIn(e.target.value);
                    if (e.target.value >= checkOut) setCheckOut(dayjs(e.target.value).add(1, "day").format("YYYY-MM-DD"));
                  }}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  type="date"
                  label="Выезд"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: checkIn || today } }}
                  error={datesError != null && nights < 1}
                  helperText={datesError ?? (nights > 0 ? `${nights} ${nightsWord(nights)}` : " ")}
                  sx={{ flex: 1 }}
                />
                <TextField select label="Взрослых" value={adults} onChange={(e) => setAdults(Number(e.target.value))} sx={{ width: { md: 130 } }} slotProps={{ input: { startAdornment: <PeopleOutlineOutlined fontSize="small" sx={{ mr: 1, color: "text.disabled" }} /> } }}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField select label="Детей" value={children} onChange={(e) => setChildren(Number(e.target.value))} sx={{ width: { md: 110 } }}>
                  {Array.from({ length: 9 }, (_, i) => i).map((n) => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </TextField>
                <Button variant="contained" disableElevation size="large" onClick={() => void search()} disabled={searching || datesError != null} sx={{ height: 56, px: 4, borderRadius: "12px", fontWeight: 700 }}>
                  {searching ? "Ищем…" : "Найти номера"}
                </Button>
              </Stack>
            </Box>

            {searchError && <Alert severity="error">{searchError}</Alert>}
            {searching && (
              <Stack alignItems="center" sx={{ py: 4 }}>
                <CircularProgress size={28} />
              </Stack>
            )}

            {/* Результаты */}
            {availability && !searching && (
              <Box>
                {availability.results.length === 0 ? (
                  <Alert severity="info" variant="outlined">
                    На эти даты свободных номеров для {adults + children} {adults + children === 1 ? "гостя" : "гостей"} нет. Попробуйте другие даты.
                  </Alert>
                ) : (
                  <Stack gap={1.5}>
                    <Typography variant="body2" color="text.secondary">
                      {dayjs(availability.checkIn).format("D MMMM")} — {dayjs(availability.checkOut).format("D MMMM")} · {nights} {nightsWord(nights)} · цена за весь период
                    </Typography>
                    {availability.results.map((c) => {
                      const on = chosen?.id === c.id;
                      return (
                        <Stack
                          key={c.id}
                          direction={{ xs: "column", md: "row" }}
                          alignItems={{ md: "center" }}
                          gap={2}
                          sx={{
                            p: 2.5,
                            borderRadius: "16px",
                            bgcolor: "background.paper",
                            border: 2,
                            borderColor: on ? "primary.main" : "divider",
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{c.name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              до {c.adultsCapacity + c.childrenCapacity} гостей · осталось {c.available}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: { md: "right" } }}>
                            <Typography sx={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(c.totalAmount, currency)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              ≈ {money(Number(c.totalAmount) / Math.max(1, nights), currency)} за ночь
                            </Typography>
                          </Box>
                          <Button variant={on ? "outlined" : "contained"} disableElevation onClick={() => { setChosen(c); setPriceChanged(null); setSendError(null); }} sx={{ borderRadius: "10px", fontWeight: 700, minWidth: 120 }}>
                            {on ? "Выбрано" : "Выбрать"}
                          </Button>
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            )}

            {/* Заявка */}
            {chosen && availability && (
              <Box sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: "20px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
                <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 0.5 }}>Ваши данные</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                  {chosen.name} · {nights} {nightsWord(nights)} · {money(chosen.totalAmount, currency)}. Номер зарезервируется на 30 минут, пока администратор подтвердит бронь.
                </Typography>
                <Stack gap={2}>
                  {priceChanged && <Alert severity="warning">{priceChanged}</Alert>}
                  {sendError && <Alert severity="error">{sendError}</Alert>}
                  <TextField
                    label="Имя и фамилия"
                    value={fullName}
                    onChange={(e) => setFullName(sanitizeFieldInput(e.target.value, NAME_RULES))}
                    error={showErrors && nameError != null}
                    helperText={showErrors ? nameError : undefined}
                    required
                    autoComplete="name"
                  />
                  <Stack direction={{ xs: "column", md: "row" }} gap={2}>
                    <TextField
                      label="Телефон"
                      value={phone}
                      onChange={(e) => setPhone(sanitizeFieldInput(e.target.value, PHONE_RULES))}
                      placeholder="+996 555 000 000"
                      error={showErrors && phoneError != null}
                      helperText={showErrors ? phoneError : undefined}
                      required
                      autoComplete="tel"
                      slotProps={{ htmlInput: { inputMode: "tel" } }}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="Эл. почта"
                      value={email}
                      onChange={(e) => setEmail(sanitizeFieldInput(e.target.value, EMAIL_RULES))}
                      error={email !== "" && emailError != null}
                      helperText={email !== "" ? emailError : "Необязательно"}
                      autoComplete="email"
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                  <TextField label="Пожелания" value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))} placeholder="Поздний заезд, детская кроватка…" multiline minRows={2} />
                  <FormControlLabel
                    control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />}
                    label={<Typography variant="body2">Согласен(на) на обработку персональных данных для бронирования</Typography>}
                    sx={{ alignItems: "flex-start", "& .MuiCheckbox-root": { pt: 0.5 } }}
                  />
                  {showErrors && !consent && (
                    <Typography variant="caption" color="error" sx={{ mt: -1.5 }}>
                      Без согласия заявку отправить нельзя
                    </Typography>
                  )}
                  <Button variant="contained" disableElevation size="large" onClick={() => void submit()} disabled={sending} sx={{ alignSelf: { md: "flex-start" }, px: 4, borderRadius: "12px", fontWeight: 700 }}>
                    {sending ? "Отправляем…" : "Отправить заявку"}
                  </Button>
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Container>
    </Box>
  );
};

export default HotelPublicBookingPage;
