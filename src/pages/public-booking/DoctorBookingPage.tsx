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
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import StarRounded from "@mui/icons-material/StarRounded";
import WorkOutlineOutlined from "@mui/icons-material/WorkOutlineOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import SchoolOutlined from "@mui/icons-material/SchoolOutlined";
import TranslateOutlined from "@mui/icons-material/TranslateOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
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
import { BOOKING_RADIUS, TILE_RADIUS, neutralTone, tileTone } from "./theme";
import { formatDuration, formatPhone, formatSom, telHref } from "./format";
import { primaryPhone, useBookingOrg } from "./useBookingOrg";
import { useT } from "../../i18n/VerticalProvider";

/** Услуга в выборе: и из карточки врача, и из available-services одна форма. */
interface PickableService {
  id: number;
  name: string;
  durationMinutes: number;
  basePrice: string;
}

type Step = 1 | 2 | 3;

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

// ── Индикатор шагов ──────────────────────────────────────────────────────────

const StepIndicator: React.FC<{ current: Step; onGoTo: (step: Step) => void }> = ({
  current,
  onGoTo,
}) => {
  const { t } = useT("publicBooking");
  const steps: { step: Step; label: string }[] = [
    { step: 1, label: t("stepDate") },
    { step: 2, label: t("stepTime") },
    { step: 3, label: t("stepServices") },
  ];

  return (
    <Stack direction="row" alignItems="flex-start">
      {steps.map(({ step, label }, index) => {
        const done = step < current;
        const active = step === current;
        return (
          <React.Fragment key={step}>
            <Stack
              alignItems="center"
              spacing={0.5}
              onClick={() => (done ? onGoTo(step) : undefined)}
              sx={{ width: 64, cursor: done ? "pointer" : "default" }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  border: 2,
                  transition: "background-color .2s, border-color .2s, color .2s",
                  ...(active && {
                    bgcolor: "primary.main",
                    borderColor: "primary.main",
                    color: "primary.contrastText",
                  }),
                  // Пройденный шаг — тот же акцент, но приглушённый: зелёный
                  // здесь вводил третий цвет и спорил с активным шагом.
                  ...(done && {
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                    borderColor: (t) => alpha(t.palette.primary.main, 0.32),
                    color: "primary.onSurface",
                  }),
                  ...(!active &&
                    !done && {
                      bgcolor: "background.paper",
                      borderColor: "divider",
                      color: "text.disabled",
                    }),
                }}
              >
                {done ? <CheckOutlined sx={{ fontSize: 15 }} /> : step}
              </Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: active || done ? "primary.onSurface" : "text.disabled",
                }}
              >
                {label}
              </Typography>
            </Stack>
            {index < steps.length - 1 && (
              <Box
                sx={{
                  flexGrow: 1,
                  height: 2,
                  mt: "13px",
                  mx: 1,
                  borderRadius: 1,
                  bgcolor: (t) => (done ? alpha(t.palette.primary.main, 0.32) : t.palette.divider),
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </Stack>
  );
};

// ── Плитка дня ───────────────────────────────────────────────────────────────

/**
 * Плитка дня. Три строки сверху вниз: день недели («Сегодня»/«Завтра» для
 * ближайших), дата, количество окон. Дата не повторяется дважды, день недели —
 * обычной строкой: в кружке-бейдже он был нечитаемо мелким.
 *
 * Цвет: белая с синей рамкой — свободна, залитая синим — выбрана, серая без
 * рамки — окон нет. Одна шкала вместо прежних «голубая / зелёная / серая».
 */
const DayTile: React.FC<{
  day: CalendarDay;
  active: boolean;
  onClick: () => void;
}> = ({ day, active, onClick }) => {
  const { t } = useT("publicBooking");
  const { diffDays, weekday, dayMonth } = dayParts(day.date);
  const caption =
    diffDays === 0 ? t("today") : diffDays === 1 ? t("tomorrow") : weekday;

  return (
    <ButtonBase
      disabled={!day.isAvailable}
      onClick={onClick}
      sx={(theme) => {
        const tone = tileTone(theme);
        return {
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 0.25,
          height: { xs: 76, lg: 84 },
          px: 0.75,
          py: 1,
          border: 1,
          borderRadius: TILE_RADIUS,
          transition: "background-color .15s, border-color .15s, color .15s",
          borderColor: active ? tone.pickedBorder : tone.idleBorder,
          bgcolor: active ? tone.pickedBg : tone.idleBg,
          color: active ? tone.pickedText : tone.idleText,
          "&:hover": { borderColor: "primary.main" },
          "&.Mui-disabled": {
            bgcolor: (t) => alpha(t.palette.text.primary, 0.03),
            borderColor: "transparent",
            color: "text.disabled",
          },
        };
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.2,
          textTransform: "capitalize",
          opacity: 0.8,
          whiteSpace: "nowrap",
        }}
      >
        {caption}
      </Typography>
      <Typography
        sx={{ fontSize: { xs: 14, lg: 15 }, fontWeight: 700, lineHeight: 1.2, whiteSpace: "nowrap" }}
      >
        {dayMonth}
      </Typography>
      <Typography
        sx={(theme) => ({
          mt: "auto",
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: "nowrap",
          // У выбранной плитки подпись наследует белый, у свободной — акцент,
          // у недоступной остаётся серой от родителя.
          color: active
            ? "inherit"
            : day.isAvailable
              ? tileTone(theme).idleHint
              : "inherit",
        })}
      >
        {day.slotsCount ? t("slots", { count: day.slotsCount }) : t("slotsNone")}
      </Typography>
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
    sx={(theme) => {
      const tone = tileTone(theme);
      return {
        height: 34,
        px: 1.75,
        borderRadius: 99,
        border: 1,
        fontSize: 13,
        fontWeight: 600,
        transition: "background-color .15s, border-color .15s, color .15s",
        ...(active
          ? { bgcolor: tone.pickedBg, borderColor: tone.pickedBorder, color: tone.pickedText }
          : {
              bgcolor: tone.idleBg,
              borderColor: tone.idleBorder,
              color: tone.idleText,
              "&:hover": { bgcolor: tone.softBg, borderColor: "primary.main" },
            }),
      };
    }}
  >
    {time}
  </ButtonBase>
);

// ── Строка услуги ────────────────────────────────────────────────────────────

/** Услуга — плитка-переключатель: выбранная подсвечена акцентом. */
const ServiceRow: React.FC<{
  service: PickableService;
  checked: boolean;
  onToggle: () => void;
}> = ({ service, checked, onToggle }) => (
  <ButtonBase
    onClick={onToggle}
    sx={(theme) => {
      const tone = tileTone(theme);
      return {
        display: "grid",
        gridTemplateColumns: "22px minmax(0, 1fr) auto",
        alignItems: "center",
        gap: 1.25,
        px: 1.25,
        py: 1,
        border: 1,
        borderRadius: TILE_RADIUS,
        textAlign: "left",
        transition: "background-color .15s, border-color .15s",
        borderColor: checked ? "primary.main" : tone.idleBorder,
        // Заливка мягкая, а не сплошная: в строке есть название и цена, их
        // нужно читать, поэтому текст остаётся тёмным.
        bgcolor: checked ? tone.softBg : "transparent",
        "&:hover": {
          borderColor: "primary.main",
        },
      };
    }}
  >
    <Box
      sx={{
        width: 22,
        height: 22,
        borderRadius: "6px",
        border: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderColor: checked ? "primary.main" : (t) => alpha(t.palette.primary.main, 0.35),
        bgcolor: checked ? "primary.main" : "transparent",
        color: checked ? "primary.contrastText" : "transparent",
      }}
    >
      <CheckOutlined sx={{ fontSize: 15 }} />
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography fontSize={14} fontWeight={600} lineHeight={1.3}>
        {service.name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {formatDuration(service.durationMinutes)}
      </Typography>
    </Box>
    <Typography fontSize={14} fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
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
  const [priceOpen, setPriceOpen] = React.useState(false);
  const showPhoto = Boolean(doctor.photoUrl) && !broken;

  // Прайс врача: цену «от» гость хочет знать до выбора времени, а полный
  // список услуг он всё равно увидит на третьем шаге.
  const minPrice = doctor.services.length
    ? Math.min(...doctor.services.map((s) => Number(s.basePrice ?? 0)))
    : null;

  /** Где принимает: «Мама Доктор · ул. Орозбекова 112». */
  const place = [doctor.branch?.name, doctor.branch?.address].filter(Boolean).join(" · ");

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: BOOKING_RADIUS }}>
      <Stack direction="row" spacing={2} alignItems="stretch">
        <Box
          sx={{
            width: { xs: 108, md: 132 },
            height: { xs: 132, md: 164 },
            flexShrink: 0,
            borderRadius: TILE_RADIUS,
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

        <Stack sx={{ flexGrow: 1, minWidth: 0, py: 0.5 }}>
          <Typography fontWeight={700} fontSize={{ xs: 15, md: 18 }} lineHeight={1.25}>
            {doctor.fullName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {doctor.specialties.join(", ")}
          </Typography>

          {/* Факты о враче идут сразу под специализацией: с mt:auto между ними
              зияла пустота, когда фактов мало (у врача нет рейтинга и стажа).
              Телефона здесь нет — он в шапке страницы, дублировать незачем. */}
          <Stack spacing={0.5} sx={{ mt: 1.25 }}>
            {doctor.rating != null && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Stack direction="row" alignItems="center" spacing={0.25}>
                  <StarRounded sx={{ fontSize: 18, color: "warning.main" }} />
                  <Typography fontSize={14} fontWeight={700} color="warning.onSurface">
                    {doctor.rating.toFixed(1)}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {doctor.ratingCount} отзывов
                </Typography>
              </Stack>
            )}
            {doctor.experienceYears > 0 && (
              <Fact icon={<WorkOutlineOutlined sx={FACT_ICON} />}>
                {t("experienceYears", { count: doctor.experienceYears })}
              </Fact>
            )}
            {place && <Fact icon={<PlaceOutlined sx={FACT_ICON} />}>{place}</Fact>}
            {doctor.services.length > 0 && (
              <Fact icon={<MedicalServicesOutlined sx={FACT_ICON} />}>
                {t("servicesCount", { count: doctor.services.length })}
                {minPrice != null && ` · ${t("priceFrom", { price: formatSom(minPrice) })}`}
              </Fact>
            )}
            {doctor.education && (
              <Fact icon={<SchoolOutlined sx={FACT_ICON} />}>{doctor.education}</Fact>
            )}
            {doctor.languages.length > 0 && (
              <Fact icon={<TranslateOutlined sx={FACT_ICON} />}>
                {doctor.languages.join(", ")}
              </Fact>
            )}
          </Stack>
        </Stack>
      </Stack>

      {doctor.bio && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
            {doctor.bio}
          </Typography>
        </>
      )}

      {!doctor.isAcceptingNew && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          {t("notAcceptingNew")}
        </Alert>
      )}

      {/* Прайс врача целиком: цены — то, о чём гость спрашивает по телефону.
          На шаге «Услуги» он выбирает из них, здесь просто смотрит. */}
      {doctor.services.length > 0 && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Button
            fullWidth
            size="small"
            onClick={() => setPriceOpen((prev) => !prev)}
            endIcon={
              <ExpandMoreOutlined
                sx={{
                  transition: "transform .2s",
                  transform: priceOpen ? "rotate(180deg)" : "none",
                }}
              />
            }
            sx={{ justifyContent: "space-between", color: "text.primary", fontWeight: 600 }}
          >
            {t("priceListTitle")}
          </Button>
          <Collapse in={priceOpen} unmountOnExit>
            <Stack spacing={0.75} sx={{ mt: 1 }}>
              {doctor.services.map((service) => (
                <Stack
                  key={service.id}
                  direction="row"
                  spacing={1}
                  alignItems="baseline"
                  justifyContent="space-between"
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2">{service.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDuration(service.durationMinutes)}
                    </Typography>
                  </Box>
                  <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: "nowrap" }}>
                    {formatSom(service.basePrice)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Collapse>
        </>
      )}
    </Paper>
  );
};

// ── Отзывы ───────────────────────────────────────────────────────────────────

const Reviews: React.FC<{ reviews: ProfessionalReview[] }> = ({ reviews }) => {
  const { t } = useT("publicBooking");
  if (!reviews.length) return null;
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: BOOKING_RADIUS }}>
      <Typography fontWeight={600} sx={{ mb: 1.5 }}>
        {t("reviewsTitle")}
      </Typography>
      <Stack spacing={1.5} divider={<Divider flexItem />}>
        {reviews.map((r, i) => (
          <Box key={i}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" fontWeight={600}>
                {r.patientName}
              </Typography>
              <Rating value={r.rating} readOnly size="small" />
            </Stack>
            {r.comment && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
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
              onSubmit(name.trim(), `${dial}${digits}`, comment.trim());
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
