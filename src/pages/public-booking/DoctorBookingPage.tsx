import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  Radio,
  Rating,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import { useNavigate, useParams } from "react-router";

import {
  createGuestBooking,
  getPhoneCountries,
  getProfessional,
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
import { formatKGS } from "../../utility/format";
import { PublicBookingShell } from "./shell";

// ── Успех записи ──────────────────────────────────────────────────────────────

const BookingSuccess: React.FC<{
  result: GuestBookingResult;
  doctorName: string;
  onDone: () => void;
}> = ({ result, doctorName, onDone }) => (
  <Paper variant="outlined" sx={{ p: 4, borderRadius: "14px", textAlign: "center" }}>
    <CheckCircleOutlined color="success" sx={{ fontSize: 56, mb: 1 }} />
    <Typography variant="h6" fontWeight={700} gutterBottom>
      Вы записаны!
    </Typography>
    <Typography color="text.secondary" sx={{ mb: 2 }}>
      {doctorName}, {result.date} в {result.time}
    </Typography>
    {result.confirmationCode && (
      <Typography variant="body2" sx={{ mb: 3 }}>
        Код подтверждения: <b>{result.confirmationCode}</b>
      </Typography>
    )}
    <Button variant="outlined" onClick={onDone}>
      К списку врачей
    </Button>
  </Paper>
);

// ── Форма гостя ───────────────────────────────────────────────────────────────

const GuestForm: React.FC<{
  countries: PhoneCountry[];
  submitting: boolean;
  /** Проверка выбора услуги/даты/времени выше по странице — идёт до полей гостя. */
  validateSelection: () => boolean;
  onSubmit: (name: string, phone: string, comment: string) => void;
}> = ({ countries, submitting, validateSelection, onSubmit }) => {
  const [name, setName] = React.useState("");
  const [dial, setDial] = React.useState("+996");
  const [phone, setPhone] = React.useState("");
  const [comment, setComment] = React.useState("");

  const digits = phone.replace(/\D/g, "");
  const v = useFormValidation({
    name: name.trim().length >= 2 ? null : "Укажите имя — минимум 2 символа",
    phone: digits.length >= 6 ? null : "Укажите номер телефона",
  });

  const handleClick = () => {
    // Сначала выбор врача/времени: если не выбрано, фокус уйдёт в календарь выше.
    if (!validateSelection()) return;
    if (!v.validate()) return;
    onSubmit(name.trim(), `${dial}${digits}`, comment.trim());
  };

  return (
    <Stack spacing={2}>
      <TextField
        label="Ваше имя"
        size="small"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        {...v.field("name")}
      />
      <Stack direction="row" spacing={1}>
        <Select
          size="small"
          value={dial}
          onChange={(e) => setDial(e.target.value)}
          sx={{ minWidth: 110 }}
        >
          {(countries.length
            ? countries
            : [{ code: "KG", name: "", dialCode: "+996", flag: "🇰🇬" }]
          ).map((c) => (
            <MenuItem key={c.code} value={c.dialCode}>
              {c.flag} {c.dialCode}
            </MenuItem>
          ))}
        </Select>
        <TextField
          label="Телефон"
          size="small"
          fullWidth
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          {...v.field("phone")}
        />
      </Stack>
      <TextField
        label="Комментарий (необязательно)"
        size="small"
        multiline
        minRows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <Button
        variant="contained"
        disabled={submitting}
        onClick={handleClick}
        startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
      >
        Записаться
      </Button>
    </Stack>
  );
};

// ── Отзывы ────────────────────────────────────────────────────────────────────

const Reviews: React.FC<{ reviews: ProfessionalReview[] }> = ({ reviews }) => {
  if (!reviews.length) return null;
  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Отзывы
      </Typography>
      <Stack spacing={1.5}>
        {reviews.map((r, i) => (
          <Paper key={i} variant="outlined" sx={{ p: 1.5, borderRadius: "12px" }}>
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
          </Paper>
        ))}
      </Stack>
    </Box>
  );
};

// ── Основная страница ─────────────────────────────────────────────────────────

const DoctorBookingPage: React.FC = () => {
  const { idOrSlug = "" } = useParams<{ idOrSlug: string }>();
  const navigate = useNavigate();

  const [doctor, setDoctor] = React.useState<ProfessionalDetail | null>(null);
  const [reviews, setReviews] = React.useState<ProfessionalReview[]>([]);
  const [countries, setCountries] = React.useState<PhoneCountry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [serviceId, setServiceId] = React.useState<number | null>(null);
  const [calendar, setCalendar] = React.useState<CalendarDay[]>([]);
  const [calendarLoading, setCalendarLoading] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [selectedTime, setSelectedTime] = React.useState<string | null>(null);

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
      .then((d) => {
        setDoctor(d);
        // По умолчанию — первая услуга (её длительность задаёт сетку слотов).
        if (d.services.length === 1) setServiceId(d.services[0].id);
      })
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

  // Календарь — зависит от выбранной услуги (её длительность → шаг слотов).
  React.useEffect(() => {
    if (!doctor) return;
    const controller = new AbortController();
    setCalendarLoading(true);
    setSelectedDate(null);
    setSelectedTime(null);
    getProfessionalCalendar(
      idOrSlug,
      { serviceId: serviceId ?? undefined },
      controller.signal,
    )
      .then(setCalendar)
      .catch((e) => {
        if (!isAbortError(e)) setCalendar([]);
      })
      .finally(() => setCalendarLoading(false));
    return () => controller.abort();
  }, [doctor, idOrSlug, serviceId]);

  const selectedDay = calendar.find((d) => d.date === selectedDate) ?? null;
  // В окне (~2 недели) может не быть ни одного свободного дня — у врача нет
  // опубликованного графика или всё занято. Тогда вместо стены серых чипов
  // показываем понятное сообщение.
  const hasAvailableDay = calendar.some((d) => d.isAvailable);

  // Выбор врача/времени — часть той же формы: без него запись не отправить.
  const selection = useFormValidation({
    service:
      !doctor || doctor.services.length === 0 || serviceId !== null
        ? null
        : "Выберите услугу",
    slot: selectedDate && selectedTime ? null : "Выберите дату и время приёма",
  });

  const handleSubmit = (name: string, phone: string, comment: string) => {
    if (!doctor || !selectedDate || !selectedTime) return;
    setSubmitting(true);
    setSubmitError(null);
    createGuestBooking({
      professionalId: doctor.id,
      serviceIds: serviceId ? [serviceId] : [],
      date: selectedDate,
      time: selectedTime,
      patientName: name,
      patientPhone: phone,
      comment: comment || undefined,
    })
      .then(setResult)
      .catch((e) => {
        // Бэк ещё не реализовал POST /bookings/ (§7) — 404/405 объясняем человечно.
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
          setSubmitError(
            "Онлайн-запись скоро заработает. Пока, пожалуйста, позвоните в клинику, " +
              "чтобы записаться на выбранное время.",
          );
        } else {
          setSubmitError(e instanceof Error ? e.message : "Не удалось записаться");
        }
      })
      .finally(() => setSubmitting(false));
  };

  if (loading) {
    return (
      <PublicBookingShell maxWidth="md">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      </PublicBookingShell>
    );
  }

  if (notFound || !doctor) {
    return (
      <PublicBookingShell maxWidth="md">
        <Alert severity="warning">Врач не найден.</Alert>
        <Button sx={{ mt: 2 }} startIcon={<ArrowBackOutlined />} onClick={() => navigate("/book")}>
          К списку врачей
        </Button>
      </PublicBookingShell>
    );
  }

  if (result) {
    return (
      <PublicBookingShell maxWidth="sm">
        <BookingSuccess
          result={result}
          doctorName={doctor.fullName}
          onDone={() => navigate("/book")}
        />
      </PublicBookingShell>
    );
  }

  return (
    <PublicBookingShell maxWidth="md">
      <Button
        size="small"
        startIcon={<ArrowBackOutlined />}
        onClick={() => navigate("/book")}
        sx={{ mb: 2 }}
      >
        К списку врачей
      </Button>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Шапка врача */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: "14px", mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar src={doctor.photoUrl ?? undefined} sx={{ width: 72, height: 72 }}>
            <PersonOutlined />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {doctor.fullName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {doctor.specialties.join(", ")}
            </Typography>
            {doctor.rating != null && (
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                <Rating value={doctor.rating} precision={0.1} readOnly size="small" />
                <Typography variant="caption" color="text.secondary">
                  {doctor.rating.toFixed(1)} ({doctor.ratingCount})
                </Typography>
              </Stack>
            )}
          </Box>
        </Stack>
        {doctor.bio && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {doctor.bio}
          </Typography>
        )}
      </Paper>

      {/* Выбор услуги */}
      {doctor.services.length > 0 && (
        <Paper
          ref={selection.anchor("service")}
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: "14px",
            mb: 2,
            ...(selection.errorOf("service") && { borderColor: "error.main" }),
          }}
        >
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Услуга
          </Typography>
          {selection.errorOf("service") && (
            <Typography variant="body2" color="error" sx={{ mb: 1 }}>
              {selection.errorOf("service")}
            </Typography>
          )}
          <Stack divider={<Divider flexItem />}>
            {doctor.services.map((s) => (
              <Stack
                key={s.id}
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ py: 0.5, cursor: "pointer" }}
                onClick={() => setServiceId(s.id)}
              >
                <Radio checked={serviceId === s.id} size="small" />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {s.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.durationMinutes} мин
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight={600}>
                  {formatKGS(s.basePrice)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Календарь */}
      <Paper
        ref={selection.anchor("slot")}
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: "14px",
          mb: 2,
          ...(selection.errorOf("slot") && { borderColor: "error.main" }),
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <EventAvailableOutlined fontSize="small" color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Выберите время
          </Typography>
        </Stack>
        {selection.errorOf("slot") && (
          <Typography variant="body2" color="error" sx={{ mb: 1 }}>
            {selection.errorOf("slot")}
          </Typography>
        )}

        {calendarLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : !hasAvailableDay ? (
          <Typography variant="body2" color="text.secondary">
            У врача сейчас нет свободного времени для онлайн-записи на ближайшие две
            недели. Выберите другого специалиста или свяжитесь с клиникой.
          </Typography>
        ) : (
          <>
            <Box sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 1 }}>
              {calendar.map((day) => (
                <Chip
                  key={day.date}
                  label={day.label}
                  disabled={!day.isAvailable}
                  color={selectedDate === day.date ? "primary" : "default"}
                  variant={selectedDate === day.date ? "filled" : "outlined"}
                  onClick={() => {
                    setSelectedDate(day.date);
                    setSelectedTime(null);
                  }}
                  sx={{ flexShrink: 0 }}
                />
              ))}
            </Box>

            {selectedDay && (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
                {selectedDay.times.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    На этот день нет свободного времени.
                  </Typography>
                ) : (
                  selectedDay.times.map((t) => (
                    <Chip
                      key={t}
                      label={t}
                      color={selectedTime === t ? "primary" : "default"}
                      variant={selectedTime === t ? "filled" : "outlined"}
                      onClick={() => setSelectedTime(t)}
                    />
                  ))
                )}
              </Box>
            )}
          </>
        )}
      </Paper>

      {/* Форма гостя — видна сразу: незаполненное подсветится по клику «Записаться» */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: "14px", mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Ваши данные
        </Typography>
        {submitError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {submitError}
          </Alert>
        )}
        <GuestForm
          countries={countries}
          submitting={submitting}
          validateSelection={selection.validate}
          onSubmit={handleSubmit}
        />
      </Paper>

      <Reviews reviews={reviews} />
    </PublicBookingShell>
  );
};

export default DoctorBookingPage;
