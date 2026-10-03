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
 *
 * Витрина: название отеля — сразу (поиск на завтра уходит при открытии, а
 * GET /public/{slug}/ отдаёт шапку, когда бэк его заведёт), оно же во вкладке
 * браузера. Фото, удобства, питание и условия отмены показываются, когда
 * сервер их присылает (PublicHotelInfo / PublicHotelCategory) — до тех пор
 * честно пишем, что условия подтвердит администратор.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  Chip,
  FormControlLabel,
  ToggleButton,
  ToggleButtonGroup,
  GlobalStyles,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import PeopleOutlineOutlined from "@mui/icons-material/PeopleOutlineOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import CallOutlined from "@mui/icons-material/CallOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import { useLocation, useParams } from "react-router";
import dayjs from "dayjs";

import { ApiError, getErrorCode } from "../../api/client";
import {
  createPublicReservation,
  getPublicAvailability,
  getPublicHotelInfo,
  type PublicHotelAvailability,
  type PublicHotelCategory,
  type PublicHotelInfo,
  type PublicHotelRequestData,
  type PublicHotelReservation,
} from "../../api/hotelPublic";
import { fieldError, sanitizeFieldInput, type FieldRules } from "../../dev/formRules";
import { HOTEL_BOARD_TYPE_LABELS } from "../../dev/hotelDisplay";
import { initialPublicHotelLang, PUBLIC_HOTEL_TEXT, type PublicHotelLang, type PublicHotelText } from "./publicHotelText";

const PHONE_RULES: FieldRules = { kind: "phone", required: true };
const EMAIL_RULES: FieldRules = { kind: "email" };
const NAME_RULES: FieldRules = { required: true, maxLength: 120 };
const MAX_NIGHTS = 90;

const moneyIn = (t: PublicHotelText) => (v: string | number, currency: string) =>
  `${Number(v).toLocaleString(t.locale, { maximumFractionDigits: 0 })} ${currency === "KGS" || !currency ? t.currencyKgs : currency}`;

/**
 * Прокрутка документа. CRM держит html/body/#root в overflow: hidden (внутри
 * layout скроллится свой контейнер), а витрина рендерится вне layout — без
 * этого всё ниже первого экрана было недостижимо: на телефоне не долистать до
 * «Отправить заявку». Как у витрины клиники (public-booking/shell.tsx).
 */
const scrollableDocument = (
  <GlobalStyles
    styles={{
      html: { height: "auto", overflow: "visible" },
      body: { height: "auto", minHeight: "100%", overflow: "visible" },
      "#root": { height: "auto", minHeight: "100%", overflow: "visible" },
    }}
  />
);

/** Фото категории: обложка, по нажатию — следующее. */
const CategoryPhoto: React.FC<{ photos: string[]; name: string; t: PublicHotelText }> = ({ photos, name, t }) => {
  const [i, setI] = React.useState(0);
  return (
    <Box
      component="button"
      type="button"
      onClick={() => setI((x) => (x + 1) % photos.length)}
      aria-label={photos.length > 1 ? t.nextPhoto(name) : t.photo(name)}
      sx={{
        position: "relative",
        flexShrink: 0,
        width: { xs: "100%", md: 200 },
        height: { xs: 190, md: 136 },
        p: 0,
        border: 0,
        borderRadius: "12px",
        overflow: "hidden",
        cursor: photos.length > 1 ? "pointer" : "default",
        bgcolor: "action.hover",
      }}
    >
      <Box component="img" src={photos[i]} alt={name} loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      {photos.length > 1 && (
        <Box sx={{ position: "absolute", right: 8, bottom: 8, px: 0.75, borderRadius: "8px", bgcolor: "rgba(0,0,0,.55)", color: "#fff", fontSize: 12, fontWeight: 700 }}>
          {i + 1}/{photos.length}
        </Box>
      )}
    </Box>
  );
};

/** Человеческий текст для ошибок, по которым гостю есть что сделать. */
function friendlyError(err: unknown, fallback: string, t: PublicHotelText, lang: PublicHotelLang): string {
  const code = getErrorCode(err);
  if (code === "RATE_LIMITED" || (err instanceof ApiError && err.status === 429)) return t.rateLimited;
  if (err instanceof ApiError && err.status === 404) return t.siteOff;
  // Тексты сервера — на русском; гостю на английском показываем свой.
  return lang === "ru" && err instanceof Error && err.message ? err.message : fallback;
}

export const HotelPublicBookingPage: React.FC = () => {
  const { slug = "" } = useParams();
  const theme = useTheme();
  const today = dayjs().format("YYYY-MM-DD");
  // Язык: ?lang=en в ссылке или язык браузера; переключатель — в шапке.
  const { search: locationSearch } = useLocation();
  const [lang, setLang] = React.useState<PublicHotelLang>(() => initialPublicHotelLang(locationSearch, navigator.language));
  const t: PublicHotelText = PUBLIC_HOTEL_TEXT[lang];
  const money = moneyIn(t);
  const dayFmt = (d: string) => dayjs(d).locale(lang === "en" ? "en" : "ru").format("D MMMM");
  React.useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

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

  // Шапка витрины: адрес, телефон, фото, условия. Старый сервер — 404, тогда без неё.
  const [info, setInfo] = React.useState<PublicHotelInfo | null>(null);
  const [infoLoaded, setInfoLoaded] = React.useState(false);
  React.useEffect(() => {
    const ctrl = new AbortController();
    getPublicHotelInfo(slug, ctrl.signal)
      .then((data) => setInfo(data && typeof data.name === "string" ? data : null))
      .catch(() => setInfo(null))
      .finally(() => {
        if (!ctrl.signal.aborted) setInfoLoaded(true);
      });
    return () => ctrl.abort();
  }, [slug]);

  // UUID заявки: один на неизменное тело, новый — когда гость поправил данные.
  const requestRef = React.useRef<{ id: string; fingerprint: string } | null>(null);

  const nights = dayjs(checkOut).diff(dayjs(checkIn), "day");
  const datesError =
    !checkIn || !checkOut
      ? t.pickDates
      : checkIn < today
        ? t.pastCheckIn
        : nights < 1
          ? t.checkOutAfter
          : nights > MAX_NIGHTS
            ? t.maxNights(MAX_NIGHTS)
            : dayjs(checkIn).isAfter(dayjs().add(2, "year"))
              ? t.tooFar
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
      else setSearchError(friendlyError(err, t.searchFailed, t, lang));
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
            setPriceChanged(t.priceChanged(money(next.totalAmount, fresh.currency)));
          } else {
            setChosen(null);
            setSendError(t.categoryGone);
          }
        } catch {
          setSendError(t.priceChangedReload);
        }
      } else if (code === "NO_AVAILABILITY") {
        setSendError(t.noAvailability);
        setChosen(null);
        void search();
      } else if (code === "REQUEST_CONFLICT") {
        // Тот же UUID с другим телом — начинаем заявку заново.
        requestRef.current = null;
        setSendError(t.retry);
      } else {
        // Сетевая ошибка и всё остальное: UUID остаётся, повтор безопасен.
        setSendError(friendlyError(err, t.sendFailed, t, lang));
      }
    } finally {
      setSending(false);
    }
  };

  // Сразу ищем на завтра: гость видит отель и цены, не нажимая ничего, — и
  // название отеля появляется в шапке, даже пока сервер не отдаёт /public/{slug}/.
  const searchRef = React.useRef(search);
  searchRef.current = search;
  const [firstSearchDone, setFirstSearchDone] = React.useState(false);
  React.useEffect(() => {
    void searchRef.current().finally(() => setFirstSearchDone(true));
  }, [slug]);

  const hotelName = info?.name || availability?.propertyName;
  const currency = availability?.currency ?? "KGS";
  const headerLoading = !hotelName && !unavailable && (!infoLoaded || !firstSearchDone);
  const contacts = [info?.address, info?.phone].filter(Boolean) as string[];
  const times = info?.checkInTime || info?.checkOutTime ? t.times(info?.checkInTime || "—", info?.checkOutTime || "—") : null;
  // Условия отмены: у тарифа категории, иначе общие отеля.
  const cancellation = chosen?.cancellationPolicy || info?.cancellationPolicy || "";

  // «Выбрать» — сразу к форме: на телефоне она под всеми категориями, её не видно.
  const formRef = React.useRef<HTMLDivElement>(null);
  const chosenId = chosen?.id;
  React.useEffect(() => {
    if (chosenId != null) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [chosenId]);

  // Вкладка браузера — с названием отеля, а не CRM.
  React.useEffect(() => {
    if (!hotelName) return undefined;
    const prev = document.title;
    document.title = `${hotelName} — ${t.titleSuffix}`;
    return () => {
      document.title = prev;
    };
  }, [hotelName, t.titleSuffix]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: alpha(theme.palette.primary.main, 0.04), py: { xs: 3, md: 6 } }}>
      {scrollableDocument}
      {/* md в теме — 768px: на десктопе поиск в одну строку не помещался и обрезал год в датах. */}
      <Container maxWidth={false} sx={{ maxWidth: 1000, px: { xs: 2, sm: 3 } }}>
        {info?.photos?.[0] && (
          <Box
            component="img"
            src={info.photos[0]}
            alt={hotelName ?? ""}
            sx={{ width: "100%", height: { xs: 180, md: 260 }, objectFit: "cover", borderRadius: "20px", display: "block", mb: 2.5 }}
          />
        )}
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={lang}
            onChange={(_, v: PublicHotelLang | null) => v && setLang(v)}
            aria-label="Language"
            sx={{ "& .MuiToggleButton-root": { px: 1.25, py: 0.25, fontWeight: 700, textTransform: "none" } }}
          >
            <ToggleButton value="ru">RU</ToggleButton>
            <ToggleButton value="en">EN</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
          {info?.logoUrl ? (
            <Box component="img" src={info.logoUrl} alt="" sx={{ width: 48, height: 48, objectFit: "contain", borderRadius: "12px", flexShrink: 0 }} />
          ) : (
            <HotelOutlined color="primary" sx={{ fontSize: 32, flexShrink: 0 }} />
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontSize: { xs: 24, md: 32 }, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
              {headerLoading ? <Skeleton width={240} /> : hotelName || t.fallbackTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {hotelName ? t.direct : headerLoading ? <Skeleton width={180} /> : t.chooseDates}
            </Typography>
            {(contacts.length > 0 || times) && (
              <Stack direction="row" gap={1.5} rowGap={0.25} flexWrap="wrap" sx={{ mt: 0.75, color: "text.secondary" }}>
                {info?.address && (
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <PlaceOutlined sx={{ fontSize: 16 }} />
                    <Typography variant="body2">{info.address}</Typography>
                  </Stack>
                )}
                {info?.phone && (
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <CallOutlined sx={{ fontSize: 16 }} />
                    <Typography variant="body2" component="a" href={`tel:${info.phone.replace(/[^\d+]/g, "")}`} sx={{ color: "inherit" }}>
                      {info.phone}
                    </Typography>
                  </Stack>
                )}
                {times && (
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <AccessTimeOutlined sx={{ fontSize: 16 }} />
                    <Typography variant="body2">{times}</Typography>
                  </Stack>
                )}
              </Stack>
            )}
          </Box>
        </Stack>

        {unavailable ? (
          <Alert severity="info" variant="outlined">
            {t.unavailable}
          </Alert>
        ) : done ? (
          <Box sx={{ p: { xs: 3, md: 4 }, borderRadius: "20px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
            <Stack alignItems="center" textAlign="center" gap={1.5}>
              <CheckCircleOutlined sx={{ fontSize: 56, color: "success.main" }} />
              <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{t.accepted}</Typography>
              <Typography color="text.secondary">{t.reference}</Typography>
              <Typography sx={{ fontSize: 30, fontWeight: 800, letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>{done.reference}</Typography>
              <Stack direction="row" alignItems="center" gap={0.75} color="text.secondary">
                <AccessTimeOutlined fontSize="small" />
                <Typography variant="body2">{t.heldUntil(dayjs(done.expiresAt).format("HH:mm"))}</Typography>
              </Stack>
              <Typography variant="body2" sx={{ maxWidth: 460 }}>
                {t.acceptedText(money(done.totalAmount, done.currency), phone)}
              </Typography>
            </Stack>
          </Box>
        ) : (
          <Stack gap={3}>
            {/* Поиск */}
            <Box sx={{ p: { xs: 2, md: 3 }, borderRadius: "20px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  alignItems: "start",
                  gridTemplateColumns: { xs: "1fr 1fr", md: "minmax(170px, 1fr) minmax(170px, 1fr) 130px 110px auto" },
                  "& > .search-btn": { gridColumn: { xs: "1 / -1", md: "auto" } },
                }}
              >
                <TextField
                  type="date"
                  label={t.checkIn}
                  value={checkIn}
                  onChange={(e) => {
                    setCheckIn(e.target.value);
                    if (e.target.value >= checkOut) setCheckOut(dayjs(e.target.value).add(1, "day").format("YYYY-MM-DD"));
                  }}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
                />
                <TextField
                  type="date"
                  label={t.checkOut}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: checkIn || today } }}
                  error={datesError != null && nights < 1}
                  helperText={datesError ?? (nights > 0 ? t.nights(nights) : " ")}
                />
                <TextField select label={t.adults} value={adults} onChange={(e) => setAdults(Number(e.target.value))} slotProps={{ input: { startAdornment: <PeopleOutlineOutlined fontSize="small" sx={{ mr: 1, color: "text.disabled" }} /> } }}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField select label={t.children} value={children} onChange={(e) => setChildren(Number(e.target.value))}>
                  {Array.from({ length: 9 }, (_, i) => i).map((n) => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  className="search-btn"
                  variant="contained"
                  disableElevation
                  size="large"
                  onClick={() => void search()}
                  disabled={searching || datesError != null}
                  sx={{ height: 56, px: 4, borderRadius: "12px", fontWeight: 700, whiteSpace: "nowrap" }}
                >
                  {searching ? t.searching : t.search}
                </Button>
              </Box>
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
                    {t.noRooms(adults + children)}
                  </Alert>
                ) : (
                  <Stack gap={1.5}>
                    <Typography variant="body2" color="text.secondary">
                      {t.periodLine(dayFmt(availability.checkIn), dayFmt(availability.checkOut), t.nights(nights))}
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
                          {c.photos && c.photos.length > 0 && <CategoryPhoto photos={c.photos} name={c.name} t={t} />}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{c.name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {t.capacity(c.adultsCapacity + c.childrenCapacity, c.available)}
                            </Typography>
                            {c.description && (
                              <Typography variant="body2" sx={{ mt: 0.75 }}>
                                {c.description}
                              </Typography>
                            )}
                            {(c.boardType || (c.amenities && c.amenities.length > 0)) && (
                              <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1 }}>
                                {c.boardType && (
                                  <Chip
                                    size="small"
                                    icon={<RestaurantOutlined />}
                                    label={t.board[c.boardType] ?? HOTEL_BOARD_TYPE_LABELS[c.boardType] ?? c.boardType}
                                    color={c.boardType === "none" ? "default" : "success"}
                                    variant="outlined"
                                  />
                                )}
                                {(c.amenities ?? []).slice(0, 6).map((a) => (
                                  <Chip key={a} size="small" label={a} variant="outlined" />
                                ))}
                                {(c.amenities?.length ?? 0) > 6 && <Chip size="small" label={t.more((c.amenities?.length ?? 0) - 6)} />}
                              </Stack>
                            )}
                          </Box>
                          <Box sx={{ textAlign: { md: "right" } }}>
                            <Typography sx={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(c.totalAmount, currency)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {t.perNight(money(Number(c.totalAmount) / Math.max(1, nights), currency))}
                            </Typography>
                          </Box>
                          <Button variant={on ? "outlined" : "contained"} disableElevation onClick={() => { setChosen(c); setPriceChanged(null); setSendError(null); }} sx={{ borderRadius: "10px", fontWeight: 700, minWidth: 120 }}>
                            {on ? t.chosen : t.choose}
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
              <Box
                ref={formRef}
                sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: "20px", bgcolor: "background.paper", border: 1, borderColor: "divider", scrollMarginTop: 16 }}
              >
                <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 0.5 }}>{t.yourDetails}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {chosen.name} · {t.nights(nights)} · {money(chosen.totalAmount, currency)}. {t.holdNote}
                </Typography>
                {/* Условия — до того, как гость оставит данные. */}
                <Stack gap={1} sx={{ mb: 2.5, p: 1.75, borderRadius: "12px", bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                  <Stack direction="row" gap={1} alignItems="flex-start">
                    <EventBusyOutlined fontSize="small" color="primary" sx={{ mt: 0.25 }} />
                    <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                      <b>{t.cancellation}</b> {cancellation || t.cancellationUnknown}
                    </Typography>
                  </Stack>
                  <Stack direction="row" gap={1} alignItems="flex-start">
                    <PaymentsOutlined fontSize="small" color="primary" sx={{ mt: 0.25 }} />
                    <Typography variant="body2">
                      <b>{t.payment}</b> {t.paymentText}
                    </Typography>
                  </Stack>
                  {times && (
                    <Stack direction="row" gap={1} alignItems="flex-start">
                      <AccessTimeOutlined fontSize="small" color="primary" sx={{ mt: 0.25 }} />
                      <Typography variant="body2">{times}</Typography>
                    </Stack>
                  )}
                </Stack>
                <Stack gap={2}>
                  {priceChanged && <Alert severity="warning">{priceChanged}</Alert>}
                  {sendError && <Alert severity="error">{sendError}</Alert>}
                  <TextField
                    label={t.fullName}
                    value={fullName}
                    onChange={(e) => setFullName(sanitizeFieldInput(e.target.value, NAME_RULES))}
                    error={showErrors && nameError != null}
                    helperText={showErrors && nameError ? (t.nameError ?? nameError) : undefined}
                    required
                    autoComplete="name"
                  />
                  <Stack direction={{ xs: "column", md: "row" }} gap={2}>
                    <TextField
                      label={t.phone}
                      value={phone}
                      onChange={(e) => setPhone(sanitizeFieldInput(e.target.value, PHONE_RULES))}
                      placeholder="+996 555 000 000"
                      error={showErrors && phoneError != null}
                      helperText={showErrors && phoneError ? (t.phoneError ?? phoneError) : undefined}
                      required
                      autoComplete="tel"
                      slotProps={{ htmlInput: { inputMode: "tel" } }}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label={t.email}
                      value={email}
                      onChange={(e) => setEmail(sanitizeFieldInput(e.target.value, EMAIL_RULES))}
                      error={email !== "" && emailError != null}
                      helperText={email !== "" && emailError ? (t.emailError ?? emailError) : t.optional}
                      autoComplete="email"
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                  <TextField label={t.wishes} value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))} placeholder={t.wishesPlaceholder} multiline minRows={2} />
                  <FormControlLabel
                    control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />}
                    label={<Typography variant="body2">{t.consent}</Typography>}
                    sx={{ alignItems: "flex-start", "& .MuiCheckbox-root": { pt: 0.5 } }}
                  />
                  {showErrors && !consent && (
                    <Typography variant="caption" color="error" sx={{ mt: -1.5 }}>
                      {t.consentRequired}
                    </Typography>
                  )}
                  <Button variant="contained" disableElevation size="large" onClick={() => void submit()} disabled={sending} sx={{ alignSelf: { md: "flex-start" }, px: 4, borderRadius: "12px", fontWeight: 700 }}>
                    {sending ? t.sending : t.send}
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
