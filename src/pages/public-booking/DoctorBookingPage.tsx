import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Link as MuiLink,
  MenuItem,
  Paper,
  Rating,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddCircleOutlineOutlined from "@mui/icons-material/AddCircleOutlineOutlined";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import ChatBubbleOutlineOutlined from "@mui/icons-material/ChatBubbleOutlineOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import SchoolOutlined from "@mui/icons-material/SchoolOutlined";
import TranslateOutlined from "@mui/icons-material/TranslateOutlined";
import { useNavigate, useParams } from "react-router";

import {
  createGuestBooking,
  getPhoneCountries,
  getProfessional,
  getProfessionalAvailableServices,
  getProfessionalAvailableTimes,
  getProfessionalCalendar,
  getProfessionalReviews,
  type CalendarDay,
  type GuestBookingResult,
  type PhoneCountry,
  type ProfessionalDetail,
  type ProfessionalReview,
} from "../../api/publicBooking";
import { ApiError, isAbortError } from "../../api/client";
import { useFormValidation } from "../../hooks/useFormValidation";
import { PublicBookingShell } from "./shell";
import {
  BOOKING_BORDER,
  BOOKING_RADIUS,
  BOOKING_SHADOW,
  CARD_BORDER,
  PILL_RADIUS,
  RATING_COLOR,
  TILE_RADIUS,
  dayTone,
  neutralTone,
  slotTone,
} from "./theme";
import { formatDayMonth, formatDuration, formatPhone, formatSom, telHref } from "./format";
import { primaryPhone, useBookingOrg } from "./useBookingOrg";
import { useT } from "../../i18n/VerticalProvider";
import { capitalizeFullName } from "../../utility/name";

/** Услуга в выборе: и из карточки врача, и из available-services одна форма. */
interface PickableService {
  id: number;
  name: string;
  durationMinutes: number;
  basePrice: string;
}

/**
 * Общий вид карточки страницы записи: белая, скруглённая, с мягкой тенью.
 * В макете рамки у карточек нет — объём даёт только тень.
 */
const CARD_SX = {
  borderRadius: BOOKING_RADIUS,
  border: "none",
  boxShadow: BOOKING_SHADOW,
} as const;

// ── Форматирование дат ───────────────────────────────────────────────────────

/** Разбор дня календаря: «пн», «4 авг» и смещение от сегодня. */
function dayParts(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const value = new Date(`${date}T00:00:00`);
  const diffDays = Math.round((value.getTime() - today.getTime()) / 86_400_000);
  const weekday = value.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
  const dayMonth = value
    .toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    .replace(".", "");
  return { diffDays, weekday, dayMonth };
}

/** Часть дня для группировки слотов: до 12 — утро, до 17 — день, дальше вечер. */
function dayPart(time: string): "morning" | "afternoon" | "evening" {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const SLOT_GROUPS = [
  { key: "morning", labelKey: "partMorning" },
  { key: "afternoon", labelKey: "partAfternoon" },
  { key: "evening", labelKey: "partEvening" },
] as const;

/** «3 августа, пн» — для итоговой панели и экрана успеха. */
function formatFullDate(date: string): string {
  const value = new Date(`${date}T00:00:00`);
  const main = value.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const weekday = value.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
  return `${main}, ${weekday}`;
}

/** Когда оставлен отзыв: «Вчера 12:36», «3 августа 12:36». */
function formatReviewDate(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  const time = value.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfDay.getTime() - value.getTime()) / 86_400_000);
  if (diffDays <= 0) return `Сегодня ${time}`;
  if (diffDays === 1) return `Вчера ${time}`;
  const main = value.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return `${main} ${time}`;
}

// ── Плитка дня ───────────────────────────────────────────────────────────────

/**
 * Плитка дня: день недели, дата и чип с числом свободных окон.
 *
 * Три состояния из макета. Зелёная — выбранный день, синяя — есть свободные
 * окна, серая — окон нет. Зелёный здесь значит «выбрано», а не «доступно»:
 * доступность несёт синий, иначе в ряду два акцента и глаз сравнивает цвета
 * вместо чтения дат.
 */
const DayTile: React.FC<{
  day: CalendarDay;
  active: boolean;
  onClick: () => void;
}> = ({ day, active, onClick }) => {
  const { t } = useT("publicBooking");
  const { diffDays, weekday, dayMonth } = dayParts(day.date);
  const dateLabel = diffDays === 0 ? t("today") : diffDays === 1 ? t("tomorrow") : dayMonth;
  const tone = active ? dayTone.picked : day.isAvailable ? dayTone.free : dayTone.empty;

  return (
    <ButtonBase
      disabled={!day.isAvailable}
      onClick={onClick}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 0.5,
        px: { xs: 1, lg: 2 },
        py: 1,
        minHeight: 84,
        border: 1,
        borderRadius: TILE_RADIUS,
        borderColor: tone.border,
        bgcolor: tone.bg,
        transition: "background-color .15s, border-color .15s",
        "&:hover:not(.Mui-disabled)": { borderColor: "primary.main" },
        "&.Mui-disabled": { borderColor: dayTone.empty.border },
      }}
    >
      <Box sx={{ textAlign: "left", width: "100%" }}>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.25,
            textTransform: "capitalize",
            whiteSpace: "nowrap",
            // День недели у ближайших дат подсвечен — так глаз находит «завтра»
            // быстрее, чем перечитывая числа.
            color: active
              ? dayTone.picked.text
              : !day.isAvailable
                ? dayTone.empty.text
                : diffDays <= 1
                  ? dayTone.free.weekday
                  : "text.secondary",
          }}
        >
          {weekday}
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.25,
            whiteSpace: "nowrap",
            color: active
              ? dayTone.picked.text
              : day.isAvailable
                ? dayTone.free.text
                : dayTone.empty.text,
          }}
        >
          {dateLabel}
        </Typography>
      </Box>
      <Box
        sx={{
          mt: "auto",
          minWidth: 67,
          px: 0.5,
          py: 0.25,
          borderRadius: PILL_RADIUS,
          bgcolor: tone.chipBg,
          color: "#FFFFFF",
          fontSize: 12,
          fontWeight: 600,
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        {day.slotsCount ? t("slots", { count: day.slotsCount }) : t("slotsNone")}
      </Box>
    </ButtonBase>
  );
};

// ── Слот времени ─────────────────────────────────────────────────────────────

const TimeSlot: React.FC<{ time: string; active: boolean; onClick: () => void }> = ({
  time,
  active,
  onClick,
}) => (
  <ButtonBase
    onClick={onClick}
    sx={{
      py: 0.5,
      px: 1.25,
      minWidth: 84,
      borderRadius: PILL_RADIUS,
      border: 1,
      fontSize: 14,
      fontWeight: 600,
      transition: "background-color .15s, border-color .15s, color .15s",
      ...(active
        ? { bgcolor: slotTone.picked.bg, borderColor: slotTone.picked.border, color: slotTone.picked.text }
        : {
            bgcolor: slotTone.idle.bg,
            borderColor: slotTone.idle.border,
            color: slotTone.idle.text,
            "&:hover": { borderColor: "primary.main", color: "primary.main" },
          }),
    }}
  >
    {time}
  </ButtonBase>
);

// ── Строка услуги ────────────────────────────────────────────────────────────

/**
 * Строка услуги: чекбокс с названием слева и цена в отдельной колонке справа.
 * Рамки у строки нет — в макете список услуг это таблица «Услуги / Цены»
 * внутри одной карточки, а не набор плиток.
 */
const ServiceRow: React.FC<{
  service: PickableService;
  checked: boolean;
  onToggle: () => void;
}> = ({ service, checked, onToggle }) => (
  <ButtonBase
    onClick={onToggle}
    sx={{
      display: "grid",
      gridTemplateColumns: "20px minmax(0, 1fr) auto",
      alignItems: "center",
      gap: 2.5,
      py: 0.75,
      px: 0.5,
      borderRadius: "6px",
      textAlign: "left",
      transition: "background-color .15s",
      "&:hover": { bgcolor: (t) => alpha(t.palette.text.primary, 0.04) },
    }}
  >
    <Box
      sx={{
        width: 20,
        height: 20,
        borderRadius: "4px",
        border: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        borderColor: checked ? slotTone.picked.bg : "#7A7878",
        bgcolor: checked ? slotTone.picked.bg : "transparent",
        color: checked ? "#FFFFFF" : "transparent",
      }}
    >
      <CheckOutlined sx={{ fontSize: 14 }} />
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography fontSize={14} fontWeight={500} lineHeight={1.3}>
        {service.name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {formatDuration(service.durationMinutes)}
      </Typography>
    </Box>
    <Typography fontSize={14} fontWeight={500} sx={{ whiteSpace: "nowrap" }}>
      {formatSom(service.basePrice)}
    </Typography>
  </ButtonBase>
);

// ── Карточка врача (левая колонка) ───────────────────────────────────────────

const FACT_ICON = { fontSize: 16, color: "text.secondary", mt: "2px", flexShrink: 0 };

/** Панель шага: каждый шаг — свой элемент, поэтому проявляется при переходе. */
const STEP_PAPER_SX = {
  p: 2,
  borderRadius: BOOKING_RADIUS,
  animation: "bookingFadeUp .28s ease both",
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
};

/** Строка факта о враче: иконка + текст в одну колонку. */
const Fact: React.FC<React.PropsWithChildren<{ icon: React.ReactNode }>> = ({
  icon,
  children,
}) => (
  <Stack direction="row" alignItems="flex-start" spacing={0.75}>
    {icon}
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  </Stack>
);

const DoctorAside: React.FC<{ doctor: ProfessionalDetail }> = ({ doctor }) => {
  const { t } = useT("publicBooking");
  const [broken, setBroken] = React.useState(false);
  const showPhoto = Boolean(doctor.photoUrl) && !broken;

  /** Где принимает: «Мама Доктор · ул. Орозбекова 112». */
  const place = [doctor.branch?.name, doctor.branch?.address].filter(Boolean).join(" · ");

  return (
    <Paper elevation={0} sx={{ ...CARD_SX, p: 2.5 }}>
      <Stack direction="row" spacing={2} alignItems="stretch">
        <Box
          sx={{
            width: { xs: 108, md: 141 },
            height: { xs: 132, md: 168 },
            flexShrink: 0,
            borderRadius: "6px",
            overflow: "hidden",
            // Заглушка нейтральная намеренно: фирменный цвет делал врачей без
            // фото самым ярким элементом страницы.
            bgcolor: (t) => neutralTone(t).bg,
          }}
        >
          {showPhoto ? (
            <Box
              component="img"
              src={doctor.photoUrl ?? undefined}
              alt={doctor.fullName}
              onError={() => setBroken(true)}
              sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <Stack
              alignItems="center"
              justifyContent="center"
              sx={{ width: "100%", height: "100%", color: (t) => neutralTone(t).fg }}
            >
              <Typography sx={{ fontSize: 36, fontWeight: 600, lineHeight: 1 }}>
                {doctor.fullName.charAt(0).toUpperCase()}
              </Typography>
            </Stack>
          )}
        </Box>

        {/* Имя и специализация сверху, рейтинг и стаж прижаты к низу фото —
            так блок выглядит собранным независимо от длины ФИО. */}
        <Stack sx={{ flexGrow: 1, minWidth: 0, justifyContent: "space-between", gap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: { xs: 16, md: 18 }, fontWeight: 500, lineHeight: 1.3 }}>
              {doctor.fullName}
            </Typography>
            {doctor.specialties.length > 0 && (
              <Typography
                sx={{ mt: 0.5, fontSize: 16, color: "text.secondary", lineHeight: 1.3 }}
              >
                {doctor.specialties.join(" • ")}
              </Typography>
            )}
          </Box>

          <Stack spacing={0.5} sx={{ minWidth: 0 }}>
            {doctor.rating != null && (
              <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap">
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography sx={{ fontSize: 14, fontWeight: 500, color: RATING_COLOR }}>
                    {doctor.rating.toFixed(1).replace(".", ",")}
                  </Typography>
                  <Rating
                    value={doctor.rating}
                    precision={0.1}
                    readOnly
                    size="small"
                    sx={{ color: RATING_COLOR, fontSize: 16 }}
                  />
                </Stack>
                {doctor.ratingCount > 0 && (
                  <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
                    · {t("reviewsCount", { count: doctor.ratingCount })}
                  </Typography>
                )}
              </Stack>
            )}
            {doctor.experienceYears > 0 && (
              <Typography sx={{ fontSize: 16, fontWeight: 500 }}>
                {t("experienceShort", { count: doctor.experienceYears })}
              </Typography>
            )}
          </Stack>
        </Stack>
      </Stack>

      {/* Ниже — то, чего в макете нет, но что бэк иногда отдаёт: у большинства
          врачей эти поля пусты, а где заполнены, гостю они полезнее пустого
          места. Порядок и размер подобраны так, чтобы не спорить с шапкой. */}
      {(place || doctor.education || doctor.languages.length > 0 || doctor.bio) && (
        <Stack spacing={0.5} sx={{ mt: 2 }}>
          {place && <Fact icon={<PlaceOutlined sx={FACT_ICON} />}>{place}</Fact>}
          {doctor.education && (
            <Fact icon={<SchoolOutlined sx={FACT_ICON} />}>{doctor.education}</Fact>
          )}
          {doctor.languages.length > 0 && (
            <Fact icon={<TranslateOutlined sx={FACT_ICON} />}>
              {doctor.languages.join(", ")}
            </Fact>
          )}
          {doctor.bio && (
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
              {doctor.bio}
            </Typography>
          )}
        </Stack>
      )}

      {!doctor.isAcceptingNew && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          {t("notAcceptingNew")}
        </Alert>
      )}
    </Paper>
  );
};

// ── Отзывы ───────────────────────────────────────────────────────────────────

/**
 * Отзывы о враче. Пустое состояние показываем явно (в макете — иконка и
 * «Отзывов пока нет»): исчезающая карточка сдвигала бы всю колонку.
 */
const Reviews: React.FC<{ reviews: ProfessionalReview[] }> = ({ reviews }) => {
  const { t } = useT("publicBooking");

  if (!reviews.length) {
    return (
      <Paper elevation={0} sx={{ ...CARD_SX, px: 2.5, pt: 2.5, pb: 5 }}>
        <Typography sx={{ fontSize: 20, fontWeight: 500, mb: 2 }}>{t("reviewsTitle")}</Typography>
        <Stack alignItems="center" spacing={2}>
          <ChatBubbleOutlineOutlined sx={{ fontSize: 64, color: "text.disabled" }} />
          <Typography sx={{ fontSize: 16, fontWeight: 500 }}>{t("noReviews")}</Typography>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ ...CARD_SX, p: 2.5 }}>
      <Typography sx={{ fontSize: 20, fontWeight: 500, mb: 2 }}>{t("reviewsTitle")}</Typography>
      <Stack spacing={2}>
        {reviews.map((r, i) => (
          <Box
            key={i}
            sx={{ p: 2, border: 1, borderColor: CARD_BORDER, borderRadius: BOOKING_RADIUS }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: (tt) => neutralTone(tt).bg,
                  color: (tt) => neutralTone(tt).fg,
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {r.patientName.charAt(0).toUpperCase()}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 500 }} noWrap>
                  {r.patientName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatReviewDate(r.date)}
                </Typography>
              </Box>
            </Stack>
            <Rating
              value={r.rating}
              readOnly
              size="small"
              sx={{ mt: 1, color: RATING_COLOR, fontSize: 16 }}
            />
            {r.comment && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                {r.comment}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Paper>
  );
};

// ── Итог выбора ──────────────────────────────────────────────────────────────

/** Что уже выбрал гость — общая форма для итоговой панели и диалога данных. */
interface BookingChoice {
  date: string | null;
  time: string | null;
  services: PickableService[];
}

function choiceTotals(services: PickableService[]) {
  return {
    price: services.reduce((sum, s) => sum + Number(s.basePrice ?? 0), 0),
    duration: services.reduce((sum, s) => sum + s.durationMinutes, 0),
  };
}

/** Строка выбора: «5 августа, ср · 12:00 · Вакцинация». */
function choiceLine(
  choice: BookingChoice,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const parts = [
    choice.date ? formatFullDate(choice.date) : null,
    choice.time,
    choice.services.length === 1
      ? choice.services[0].name
      : choice.services.length > 1
        ? t("servicesCount", { count: choice.services.length })
        : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : t("summaryEmpty");
}

/**
 * Итог и главное действие. Раньше кнопка называлась «Записаться» на всех трёх
 * шагах и была активна, даже когда выбирать ещё нечего, — теперь на шагах 1–2
 * это «Далее», а неполный выбор её выключает.
 */
const SummaryPanel: React.FC<{
  choice: BookingChoice;
  step: Step;
  canContinue: boolean;
  onContinue: () => void;
}> = ({ choice, step, canContinue, onContinue }) => {
  const { t } = useT("publicBooking");
  const { price, duration } = choiceTotals(choice.services);

  return (
    <Stack spacing={1.25}>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={{ color: choice.date ? "text.primary" : "text.secondary" }}
      >
        {choiceLine(choice, t)}
      </Typography>

      {choice.services.length > 0 && (
        <Stack direction="row" alignItems="baseline" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            {t("totalLabel")} · {formatDuration(duration)}
          </Typography>
          <Typography fontWeight={700}>{formatSom(price)}</Typography>
        </Stack>
      )}

      <Button
        fullWidth
        variant="contained"
        size="large"
        disabled={!canContinue}
        onClick={onContinue}
        endIcon={step < 3 ? <ArrowForwardOutlined /> : undefined}
        sx={{ borderRadius: 99, fontWeight: 600 }}
      >
        {step < 3 ? t("next") : t("bookAction")}
      </Button>
    </Stack>
  );
};

// ── Диалог данных гостя ──────────────────────────────────────────────────────

const GuestDialog: React.FC<{
  open: boolean;
  doctorName: string;
  choice: BookingChoice;
  countries: PhoneCountry[];
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string, phone: string, comment: string) => void;
}> = ({ open, doctorName, choice, countries, submitting, error, onClose, onSubmit }) => {
  const { t } = useT("publicBooking");
  const [name, setName] = React.useState("");
  const [dial, setDial] = React.useState("+996");
  const [phone, setPhone] = React.useState("");
  const [comment, setComment] = React.useState("");

  const digits = phone.replace(/\D/g, "");
  const v = useFormValidation({
    name: name.trim().length >= 2 ? null : t("nameRequired"),
    phone: digits.length >= 6 ? null : t("phoneRequired"),
  });

  const dialOptions = countries.length
    ? countries
    : [{ code: "KG", name: "Кыргызстан", dialCode: "+996", flag: "🇰🇬" }];

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: BOOKING_RADIUS } }}
    >
      <DialogContent sx={{ p: 3 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Box>
            <Typography fontWeight={700}>{t("guestTitle")}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t("guestHint")}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} disabled={submitting} sx={{ mt: -0.5 }}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>

        {/* Что именно подтверждает гость: без этой сводки заявка отправлялась
            «вслепую» — выбранные дата, время и услуги оставались на странице. */}
        <Paper
          variant="outlined"
          sx={{ mt: 2, p: 1.5, borderRadius: TILE_RADIUS, bgcolor: "background.default" }}
        >
          <Typography variant="body2" fontWeight={700}>
            {doctorName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {choiceLine(choice, t)}
          </Typography>
          {choice.services.length > 0 && (
            <Stack
              direction="row"
              alignItems="baseline"
              justifyContent="space-between"
              sx={{ mt: 0.75 }}
            >
              <Typography variant="caption" color="text.secondary">
                {t("totalLabel")} · {formatDuration(choiceTotals(choice.services).duration)}
              </Typography>
              <Typography fontSize={14} fontWeight={700}>
                {formatSom(choiceTotals(choice.services).price)}
              </Typography>
            </Stack>
          )}
        </Paper>

        <Stack spacing={2} sx={{ mt: 2 }}>
          <TextField
            label={t("nameLabel")}
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setName(capitalizeFullName(name))}
            required
            autoFocus
            {...v.field("name")}
          />
          <Stack direction="row" spacing={1}>
            <Select
              size="small"
              value={dial}
              onChange={(e) => setDial(e.target.value)}
              sx={{ minWidth: 112 }}
            >
              {dialOptions.map((c) => (
                <MenuItem key={c.code} value={c.dialCode}>
                  {c.flag} {c.dialCode}
                </MenuItem>
              ))}
            </Select>
            <TextField
              label={t("phoneLabel")}
              size="small"
              fullWidth
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              {...v.field("phone")}
            />
          </Stack>
          <TextField
            label={t("commentLabel")}
            size="small"
            multiline
            minRows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          {error && <Alert severity="warning">{error}</Alert>}

          <Button
            variant="contained"
            size="large"
            disabled={submitting}
            onClick={() => {
              if (!v.validate()) return;
              onSubmit(capitalizeFullName(name), `${dial}${digits}`, comment.trim());
            }}
            startIcon={
              submitting ? <CircularProgress size={16} color="inherit" /> : undefined
            }
            sx={{ borderRadius: 99, fontWeight: 600 }}
          >
            {t("submitBooking")}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

// ── Экран успеха ─────────────────────────────────────────────────────────────

const SuccessDialog: React.FC<{
  result: GuestBookingResult;
  doctor: ProfessionalDetail;
  services: PickableService[];
  onClose: () => void;
}> = ({ result, doctor, services, onClose }) => {
  const { t } = useT("publicBooking");
  const rows = [
    { icon: <EventOutlined fontSize="small" />, label: t("successDate"), value: formatFullDate(result.date) },
    { icon: <ScheduleOutlined fontSize="small" />, label: t("successTime"), value: result.time },
    {
      icon: <MedicalServicesOutlined fontSize="small" />,
      label: t("successServices"),
      value: services.map((s) => s.name).join(", ") || "—",
    },
    ...(doctor.branch?.address
      ? [
          {
            icon: <PlaceOutlined fontSize="small" />,
            label: t("successAddress"),
            value: doctor.branch.address,
          },
        ]
      : []),
  ];

  return (
    <Dialog open fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: BOOKING_RADIUS } }}>
      <DialogContent sx={{ p: 3 }}>
        <Stack alignItems="center" spacing={1}>
          <CheckCircleOutlined sx={{ fontSize: 48, color: "success.main" }} />
          <Typography fontWeight={700} fontSize={18} textAlign="center">
            {t("successTitle")}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {doctor.fullName} · {t("successHint")}
          </Typography>
        </Stack>

        <Stack spacing={1.25} sx={{ mt: 2.5 }} divider={<Divider flexItem />}>
          {rows.map((row) => (
            <Stack key={row.label} direction="row" spacing={1.25} alignItems="flex-start">
              <Box sx={{ color: "text.secondary", mt: "2px" }}>{row.icon}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary">
                  {row.label}
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {row.value}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>

        {services.length > 0 && (
          <Stack
            direction="row"
            alignItems="baseline"
            justifyContent="space-between"
            sx={{ mt: 1.5 }}
          >
            <Typography variant="body2" color="text.secondary">
              {t("totalLabel")} · {formatDuration(choiceTotals(services).duration)}
            </Typography>
            <Typography fontWeight={700}>{formatSom(choiceTotals(services).price)}</Typography>
          </Stack>
        )}

        {result.confirmationCode && (
          <Paper
            variant="outlined"
            sx={{ mt: 2, p: 1.5, borderRadius: TILE_RADIUS, textAlign: "center" }}
          >
            <Typography variant="caption" color="text.secondary">
              {t("confirmationCode")}
            </Typography>
            <Typography fontWeight={700} fontSize={18} letterSpacing={1}>
              {result.confirmationCode}
            </Typography>
          </Paper>
        )}

        <Stack component="ul" sx={{ mt: 2, pl: 2.5, m: 0, gap: 0.5 }}>
          <Typography component="li" variant="caption" color="text.secondary">
            {t("reminderOnTime")}
          </Typography>
          <Typography component="li" variant="caption" color="text.secondary">
            {t("reminderCancel")}
          </Typography>
        </Stack>

        <Button
          fullWidth
          variant="contained"
          onClick={onClose}
          sx={{ mt: 2.5, borderRadius: 99, fontWeight: 600 }}
        >
          {t("backToList")}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

// ── Страница ─────────────────────────────────────────────────────────────────

const DoctorBookingPage: React.FC = () => {
  const { t } = useT("publicBooking");
  const { idOrSlug = "" } = useParams<{ idOrSlug: string }>();
  const navigate = useNavigate();
  const { branches } = useBookingOrg();
  /** Телефон клиники — на него уводим, когда записаться онлайн нельзя. */
  const clinicPhone = primaryPhone(branches);

  const [doctor, setDoctor] = React.useState<ProfessionalDetail | null>(null);
  const [reviews, setReviews] = React.useState<ProfessionalReview[]>([]);
  const [countries, setCountries] = React.useState<PhoneCountry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [calendar, setCalendar] = React.useState<CalendarDay[]>([]);
  const [calendarLoading, setCalendarLoading] = React.useState(false);

  const [step, setStep] = React.useState<Step>(1);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [selectedTime, setSelectedTime] = React.useState<string | null>(null);
  const [selectedServices, setSelectedServices] = React.useState<number[]>([]);

  // Времена и услуги, пересчитанные бэком под текущий выбор. null — «фильтра нет»,
  // тогда показываем времена из календаря / все услуги врача.
  const [filteredTimes, setFilteredTimes] = React.useState<string[] | null>(null);
  const [filteredServices, setFilteredServices] = React.useState<PickableService[] | null>(null);
  const [timesLoading, setTimesLoading] = React.useState(false);
  const [servicesLoading, setServicesLoading] = React.useState(false);

  /** Подсказка «выберите дату/время/услугу» — показывается по клику «Записаться». */
  const [selectionError, setSelectionError] = React.useState<string | null>(null);
  const [guestOpen, setGuestOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<GuestBookingResult | null>(null);

  // Карточка врача + отзывы + страны.
  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setNotFound(false);
    setError(null);
    getProfessional(idOrSlug, controller.signal)
      .then(setDoctor)
      .catch((e) => {
        if (isAbortError(e)) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => setLoading(false));

    getProfessionalReviews(idOrSlug, { limit: 10 }, controller.signal)
      .then((r) => setReviews(r.items))
      .catch(() => {});
    getPhoneCountries(controller.signal)
      .then(setCountries)
      .catch(() => {});
    return () => controller.abort();
  }, [idOrSlug]);

  // Календарь врача. Грузим без услуги (шаг слотов по умолчанию) — как только
  // услуги выбраны, времена пересчитываются через available-times.
  React.useEffect(() => {
    if (!doctor) return;
    const controller = new AbortController();
    setCalendarLoading(true);
    getProfessionalCalendar(idOrSlug, {}, controller.signal)
      .then((days) => {
        setCalendar(days);
        // Сразу открываем ближайший свободный день — это то, что ищет пациент.
        const firstAvailable = days.find((d) => d.isAvailable);
        if (firstAvailable) setSelectedDate(firstAvailable.date);
      })
      .catch((e) => {
        if (!isAbortError(e)) setCalendar([]);
      })
      .finally(() => setCalendarLoading(false));
    return () => controller.abort();
  }, [doctor, idOrSlug]);

  const allServices: PickableService[] = React.useMemo(
    () =>
      (doctor?.services ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        basePrice: s.basePrice,
      })),
    [doctor],
  );
  const visibleServices = filteredServices ?? allServices;
  const chosenServices = React.useMemo(
    () =>
      selectedServices
        .map((id) => visibleServices.find((s) => s.id === id) ?? allServices.find((s) => s.id === id))
        .filter((s): s is PickableService => Boolean(s)),
    [selectedServices, visibleServices, allServices],
  );

  const selectedDay = calendar.find((d) => d.date === selectedDate) ?? null;
  const times = filteredTimes ?? selectedDay?.times ?? [];
  const hasAvailableDay = calendar.some((d) => d.isAvailable);

  // Бэк требует и услугу (пустой service_ids → 400), и филиал (branch_id → 400).
  // Филиал берём из основного филиала врача — единственный источник в публичном
  // каталоге. Без услуг или без филиала записаться онлайн нельзя вообще.
  const branchId = doctor?.branch?.id ?? null;
  const canBook = !doctor || (doctor.services.length > 0 && branchId !== null);

  /** Свободные времена под выбранные услуги (их суммарная длительность). */
  const reloadTimes = React.useCallback(
    async (date: string, serviceIds: number[]) => {
      if (!serviceIds.length) {
        setFilteredTimes(null);
        return null;
      }
      setTimesLoading(true);
      try {
        const res = await getProfessionalAvailableTimes(idOrSlug, date, serviceIds);
        const free = res.times.filter((slot) => !slot.busy).map((slot) => slot.time);
        setFilteredTimes(free);
        return free;
      } catch {
        setFilteredTimes(null);
        return null;
      } finally {
        setTimesLoading(false);
      }
    },
    [idOrSlug],
  );

  const handleDateChange = async (date: string) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setFilteredServices(null);
    setSelectionError(null);
    setStep(2);
    await reloadTimes(date, selectedServices);
  };

  const handleTimeChange = async (time: string) => {
    setSelectedTime(time);
    setSelectionError(null);
    setStep(3);
    if (!selectedDate) return;
    // Услуги, которые помещаются в это окно, — их и предлагаем выбрать.
    setServicesLoading(true);
    try {
      const res = await getProfessionalAvailableServices(idOrSlug, selectedDate, time);
      setFilteredServices(
        res.items.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          basePrice: s.basePrice,
        })),
      );
    } catch {
      setFilteredServices(null);
    } finally {
      setServicesLoading(false);
    }
  };

  const handleServiceToggle = async (serviceId: number) => {
    const next = selectedServices.includes(serviceId)
      ? selectedServices.filter((id) => id !== serviceId)
      : [...selectedServices, serviceId];
    setSelectedServices(next);
    setSelectionError(null);
    if (!selectedDate) return;
    const free = await reloadTimes(selectedDate, next);
    // Более длинный набор услуг может не влезть в выбранное окно — тогда время
    // сбрасываем и возвращаем пациента на шаг выбора времени.
    if (free && selectedTime && !free.includes(selectedTime)) {
      setSelectedTime(null);
      setStep(2);
    }
  };

  const handleBook = () => {
    if (!selectedDate) {
      setStep(1);
      setSelectionError(t("selectDateRequired"));
      return;
    }
    if (!selectedTime) {
      setStep(2);
      setSelectionError(t("selectTimeRequired"));
      return;
    }
    if (!selectedServices.length) {
      setStep(3);
      setSelectionError(t("selectServiceRequired"));
      return;
    }
    setSelectionError(null);
    setSubmitError(null);
    setGuestOpen(true);
  };

  const handleSubmit = (name: string, phone: string, comment: string) => {
    if (!doctor || !branchId || !selectedDate || !selectedTime) return;
    setSubmitting(true);
    setSubmitError(null);
    createGuestBooking({
      professionalId: doctor.id,
      branchId,
      serviceIds: selectedServices,
      date: selectedDate,
      time: selectedTime,
      patientName: name,
      patientPhone: phone,
      comment: comment || undefined,
    })
      .then((res) => {
        setResult(res);
        setGuestOpen(false);
      })
      .catch((e) => {
        // Тексты ошибок бэка адресованы разработчику («Не заполнены обязательные
        // поля») — гостю показываем понятное объяснение по коду ответа.
        if (!(e instanceof ApiError)) {
          setSubmitError(t("bookingFailed"));
        } else if (e.status === 404 || e.status === 405) {
          setSubmitError(t("onlineBookingSoon"));
        } else if (e.status === 409) {
          setSubmitError(t("slotTaken"));
        } else if (e.status === 429) {
          setSubmitError(t("tooManyAttempts"));
        } else if (e.status === 400) {
          setSubmitError(t("bookingFailed"));
        } else {
          setSubmitError(e.message || t("bookingFailed"));
        }
      })
      .finally(() => setSubmitting(false));
  };

  // ── Состояния загрузки/ошибок ──────────────────────────────────────────────

  if (loading) {
    return (
      <PublicBookingShell>
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 460px) 1fr" },
          }}
        >
          <Skeleton variant="rounded" height={200} sx={{ borderRadius: BOOKING_RADIUS }} />
          <Skeleton variant="rounded" height={340} sx={{ borderRadius: BOOKING_RADIUS }} />
        </Box>
      </PublicBookingShell>
    );
  }

  if (notFound || !doctor) {
    return (
      <PublicBookingShell maxWidth="md">
        <Alert severity="warning">{t("notFound")}</Alert>
        <Button
          sx={{ mt: 2 }}
          startIcon={<ArrowBackOutlined />}
          onClick={() => navigate("/book")}
        >
          {t("backToList")}
        </Button>
      </PublicBookingShell>
    );
  }

  const choice: BookingChoice = {
    date: selectedDate,
    time: selectedTime,
    services: chosenServices,
  };

  // Шаг закрыт, только когда на нём что-то выбрано: иначе «Далее»/«Записаться»
  // ведёт в никуда, а гость не понимает, чего от него хотят.
  const canContinue =
    step === 1 ? Boolean(selectedDate) : step === 2 ? Boolean(selectedTime) : selectedServices.length > 0;

  const summaryPanel = (
    <SummaryPanel
      choice={choice}
      step={step}
      canContinue={canContinue}
      onContinue={() => (step < 3 ? setStep((step + 1) as Step) : handleBook())}
    />
  );

  /**
   * Записаться нельзя вообще — вместо кнопки даём позвонить. Причину
   * («нет свободного времени») объясняет шаг выбора даты, здесь её не
   * повторяем: на мобильном оба текста оказывались друг под другом.
   */
  const callInstead = clinicPhone ? (
    <Button
      fullWidth
      variant="contained"
      size="large"
      href={telHref(clinicPhone)}
      startIcon={<PhoneOutlined />}
      sx={{ borderRadius: 99, fontWeight: 600 }}
    >
      {t("callClinic")} · {formatPhone(clinicPhone)}
    </Button>
  ) : null;

  // Пока календарь грузится, окон «нет» технически — но предлагать звонок рано.
  const footerContent = calendarLoading || hasAvailableDay ? summaryPanel : callInstead;

  return (
    <PublicBookingShell pageTitle={doctor.fullName}>
      <Button
        size="small"
        startIcon={<ArrowBackOutlined />}
        onClick={() => navigate("/book")}
        sx={{ mb: 1.5 }}
      >
        {t("backToList")}
      </Button>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          alignItems: "start",
          // Левая колонка уже правой: в ней только карточка врача, и шире она
          // была наполовину пустой у врачей без биографии и отзывов.
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 360px) minmax(0, 1fr)" },
        }}
      >
        {/* Левая колонка: врач + отзывы (на мобильных отзывы уходят вниз) */}
        <Stack spacing={2} sx={{ position: { lg: "sticky" }, top: { lg: 88 } }}>
          <DoctorAside doctor={doctor} />
          <Box sx={{ display: { xs: "none", lg: "block" } }}>
            <Reviews reviews={reviews} />
          </Box>
        </Stack>

        {/* Правая колонка: шаги записи */}
        <Stack spacing={1.5}>
          {!canBook ? (
            <Alert severity="info">{t("bookingUnavailable")}</Alert>
          ) : (
            <>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: BOOKING_RADIUS }}>
                <StepIndicator current={step} onGoTo={setStep} />
              </Paper>

              {step > 1 && (
                <Button
                  size="small"
                  startIcon={<ArrowBackOutlined />}
                  onClick={() => setStep((prev) => (prev - 1) as Step)}
                  sx={{ alignSelf: "flex-start", color: "text.secondary" }}
                >
                  {t("back")}
                </Button>
              )}

              {selectionError && <Alert severity="warning">{selectionError}</Alert>}

              {/* Шаг 1 — дата */}
              {step === 1 && (
                <Paper variant="outlined" sx={STEP_PAPER_SX}>
                  <Typography fontWeight={600} sx={{ mb: 1.5 }}>
                    {t("chooseDate")}
                  </Typography>
                  {calendarLoading ? (
                    <Box
                      sx={{
                        display: "grid",
                        gap: 1,
                        gridTemplateColumns: {
                          xs: "repeat(4, 1fr)",
                          sm: "repeat(5, 1fr)",
                          md: "repeat(6, 1fr)",
                        },
                      }}
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <Skeleton
                          key={i}
                          variant="rounded"
                          height={72}
                          sx={{ borderRadius: TILE_RADIUS }}
                        />
                      ))}
                    </Box>
                  ) : !hasAvailableDay ? (
                    <Typography variant="body2" color="text.secondary">
                      {t("noSlotsAvailable")}
                    </Typography>
                  ) : (
                    <Box
                      sx={{
                        display: "grid",
                        gap: 1,
                        gridTemplateColumns: {
                          xs: "repeat(4, 1fr)",
                          sm: "repeat(5, 1fr)",
                          md: "repeat(6, 1fr)",
                        },
                      }}
                    >
                      {calendar.map((day) => (
                        <DayTile
                          key={day.date}
                          day={day}
                          active={selectedDate === day.date}
                          onClick={() => void handleDateChange(day.date)}
                        />
                      ))}
                    </Box>
                  )}
                </Paper>
              )}

              {/* Шаг 2 — время */}
              {step === 2 && (
                <Paper variant="outlined" sx={STEP_PAPER_SX}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 1.5 }}
                  >
                    <Typography fontWeight={600}>{t("chooseTime")}</Typography>
                    {selectedDate && (
                      <Typography variant="caption" color="text.secondary">
                        {formatFullDate(selectedDate)}
                      </Typography>
                    )}
                  </Stack>
                  {timesLoading ? (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton
                          key={i}
                          variant="rounded"
                          width={76}
                          height={32}
                          sx={{ borderRadius: 99 }}
                        />
                      ))}
                    </Box>
                  ) : !selectedDate ? (
                    <Typography variant="body2" color="text.secondary">
                      {t("pickDateFirst")}
                    </Typography>
                  ) : times.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {t("noTimesForDay")}
                    </Typography>
                  ) : (
                    /* Группы утро/день/вечер: сплошная лента из 14 одинаковых
                       пилюль читается хуже, чем три коротких. */
                    <Stack spacing={1.5}>
                      {SLOT_GROUPS.map(({ key, labelKey }) => {
                        const group = times.filter((time) => dayPart(time) === key);
                        if (!group.length) return null;
                        return (
                          <Box key={key}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", mb: 0.75 }}
                            >
                              {t(labelKey)}
                            </Typography>
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                              {group.map((time) => (
                                <TimeSlot
                                  key={time}
                                  time={time}
                                  active={selectedTime === time}
                                  onClick={() => void handleTimeChange(time)}
                                />
                              ))}
                            </Box>
                          </Box>
                        );
                      })}
                    </Stack>
                  )}
                </Paper>
              )}

              {/* Шаг 3 — услуги */}
              {step === 3 && (
                <Paper variant="outlined" sx={STEP_PAPER_SX}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 1 }}
                  >
                    <Typography fontWeight={600}>{t("chooseServices")}</Typography>
                    {selectedDate && selectedTime && (
                      <Typography variant="caption" color="text.secondary">
                        {formatFullDate(selectedDate)}, {selectedTime}
                      </Typography>
                    )}
                  </Stack>
                  {servicesLoading ? (
                    <Stack spacing={1}>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} variant="rounded" height={40} />
                      ))}
                    </Stack>
                  ) : visibleServices.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {t("noServicesForSlot")}
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      {visibleServices.map((service) => (
                        <ServiceRow
                          key={service.id}
                          service={service}
                          checked={selectedServices.includes(service.id)}
                          onToggle={() => void handleServiceToggle(service.id)}
                        />
                      ))}
                    </Stack>
                  )}
                </Paper>
              )}

              {/* Итог и кнопка — десктоп. Липнет к низу окна: список услуг
                  длинный, и кнопка не должна уезжать за экран. */}
              {footerContent && (
                <Paper
                  variant="outlined"
                  sx={{
                    display: { xs: "none", lg: "block" },
                    position: "sticky",
                    bottom: 16,
                    p: 2,
                    borderRadius: BOOKING_RADIUS,
                  }}
                >
                  {footerContent}
                </Paper>
              )}
            </>
          )}

          {/* Отзывы на мобильных */}
          <Box sx={{ display: { xs: "block", lg: "none" } }}>
            <Reviews reviews={reviews} />
          </Box>
        </Stack>
      </Box>

      {/* Итог и кнопка — мобильная панель. Sticky, а не fixed: fixed-панель
          перекрывала адреса филиалов в подвале страницы. */}
      {canBook && footerContent && (
        <Paper
          elevation={0}
          sx={{
            display: { xs: "block", lg: "none" },
            position: "sticky",
            bottom: 0,
            zIndex: (t) => t.zIndex.appBar,
            // Растягиваем на всю ширину поверх боковых отступов контейнера.
            mx: -2,
            mt: 2,
            px: 2,
            pt: 1.25,
            pb: "calc(10px + env(safe-area-inset-bottom))",
            borderTop: 1,
            borderColor: "divider",
            borderRadius: 0,
          }}
        >
          {footerContent}
        </Paper>
      )}

      <GuestDialog
        open={guestOpen}
        doctorName={doctor.fullName}
        choice={choice}
        countries={countries}
        submitting={submitting}
        error={submitError}
        onClose={() => setGuestOpen(false)}
        onSubmit={handleSubmit}
      />

      {result && (
        <SuccessDialog
          result={result}
          doctor={doctor}
          services={chosenServices}
          onClose={() => navigate("/book")}
        />
      )}
    </PublicBookingShell>
  );
};

export default DoctorBookingPage;
