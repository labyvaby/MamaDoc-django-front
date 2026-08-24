import React from "react";
import { Alert, Box, Button, Skeleton, Stack, Typography } from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import { useParams } from "react-router";

import {
  createGuestBooking,
  getProfessional,
  getProfessionalAvailableServices,
  getProfessionalAvailableTimes,
  getProfessionalCalendar,
  getProfessionalReviews,
  type AvailableTimeSlot,
  type CalendarDay,
  type GuestBookingResult,
  type ProfessionalDetail,
  type ProfessionalReview,
} from "../../api/publicBooking";
import { ApiError, isAbortError } from "../../api/client";
import { BOOKING_NO_SERVICE_ENABLED, PublicBookingShell } from "./shell";
import { useBookingNav } from "./orgSlug";
import { usePatientSession } from "./PatientSession";
import {
  BOOKING_PRIMARY,
  BOOKING_PRIMARY_HOVER,
  BOOKING_RADIUS,
  BOOKING_SHADOW,
  BORDER,
  CTA_SHADOW,
  CTA_SHADOW_MOBILE,
  MUTED,
  PILL_RADIUS,
  accentChip,
} from "./theme";
import { formatDayLong, formatPhone, formatPrice, formatServicesCount, telHref } from "./format";
import { primaryPhone, useBookingOrg } from "./useBookingOrg";
import { useT } from "../../i18n/VerticalProvider";
import { StepIndicator, type BookingStep } from "./booking/StepIndicator";
import { ScheduleCard } from "./booking/ScheduleCard";
import { ServicesCard, type PickableService } from "./booking/ServicesCard";
import { DoctorCard } from "./booking/DoctorCard";
import { ReviewsDialog } from "./booking/ReviewsDialog";
import { GuestDialog, SuccessDialog } from "./booking/Dialogs";
import { choiceTotals, type BookingChoice } from "./booking/choice";

/**
 * Подсказка об ошибке над блоком — как в эталоне: красный «пузырь» с хвостиком,
 * а не строка текста, которая сдвигает вёрстку.
 */
const ErrorTooltip: React.FC<{ text: string }> = ({ text }) => (
  <Box
    sx={{
      position: "absolute",
      top: -44,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 20,
      px: 2,
      py: 1,
      borderRadius: "8px",
      bgcolor: "error.main",
      color: "#FFFFFF",
      fontSize: 14,
      whiteSpace: "nowrap",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      animation: "bookingFadeUp .3s ease both",
      "&::after": {
        content: '""',
        position: "absolute",
        bottom: -4,
        left: "50%",
        width: 8,
        height: 8,
        transform: "translateX(-50%) rotate(45deg)",
        bgcolor: "error.main",
      },
    }}
  >
    {text}
  </Box>
);

/** Чип сводки над кнопкой записи (дата, время, услуги, сумма). */
const SummaryChip: React.FC<React.PropsWithChildren<{ accent?: boolean }>> = ({
  children,
  accent,
}) => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={0.75}
    sx={{
      px: 1.75,
      py: 0.75,
      borderRadius: PILL_RADIUS,
      fontSize: 13,
      fontWeight: accent ? 600 : 500,
      whiteSpace: "nowrap",
      ...(accent
        ? { bgcolor: accentChip.bg, color: accentChip.text }
        : { bgcolor: "background.paper", border: `1px solid ${BORDER}`, boxShadow: BOOKING_SHADOW }),
    }}
  >
    {children}
  </Stack>
);

/** Кнопка записи — общая для десктопной колонки и мобильной панели. */
const BookButton: React.FC<{
  onClick: () => void;
  loading: boolean;
  fullWidth?: boolean;
}> = ({ onClick, loading, fullWidth }) => {
  const { t } = useT("publicBooking");
  return (
    <Button
      onClick={onClick}
      disabled={loading}
      disableElevation
      sx={{
        width: fullWidth ? "100%" : 308,
        height: 44,
        borderRadius: PILL_RADIUS,
        fontSize: fullWidth ? 15 : 16,
        fontWeight: 600,
        color: "#FFFFFF",
        bgcolor: BOOKING_PRIMARY,
        boxShadow: fullWidth ? CTA_SHADOW_MOBILE : CTA_SHADOW,
        transition: "all .2s",
        "&:hover": { bgcolor: BOOKING_PRIMARY_HOVER },
        "&:active": { transform: "scale(0.97)" },
        "&.Mui-disabled": { bgcolor: BOOKING_PRIMARY, color: "#FFFFFF", opacity: 0.6 },
      }}
    >
      {loading ? t("bookingInProgress") : t("bookAction")}
    </Button>
  );
};

// ── Страница ─────────────────────────────────────────────────────────────────

const DoctorBookingPage: React.FC = () => {
  const { t } = useT("publicBooking");
  const { idOrSlug = "" } = useParams<{ idOrSlug: string }>();
  const { go } = useBookingNav();
  const { branches } = useBookingOrg();
  /** Телефон клиники — на него уводим, когда записаться онлайн нельзя. */
  const clinicPhone = primaryPhone(branches);
  /** Вошедший пациент: его карта заменяет ручной ввод имени и телефона (A7). */
  const { session, selectedPatient } = usePatientSession();

  const [doctor, setDoctor] = React.useState<ProfessionalDetail | null>(null);
  const [reviews, setReviews] = React.useState<ProfessionalReview[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [calendar, setCalendar] = React.useState<CalendarDay[]>([]);
  const [calendarLoading, setCalendarLoading] = React.useState(false);

  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [selectedTime, setSelectedTime] = React.useState<string | null>(null);
  const [selectedServices, setSelectedServices] = React.useState<number[]>([]);

  // Времена и услуги, пересчитанные бэком под текущий выбор. null — «фильтра нет»,
  // тогда показываем времена из календаря / все услуги врача.
  const [filteredTimes, setFilteredTimes] = React.useState<AvailableTimeSlot[] | null>(null);
  const [filteredServices, setFilteredServices] = React.useState<PickableService[] | null>(null);
  const [timesLoading, setTimesLoading] = React.useState(false);
  const [servicesLoading, setServicesLoading] = React.useState(false);

  const [step, setStep] = React.useState<BookingStep>(1);
  /**
   * Услуги показываются после первого выбора времени и дальше не прячутся,
   * даже если время сбросилось сменой даты, — поведение эталона.
   */
  const [servicesUnlocked, setServicesUnlocked] = React.useState(false);
  /** Блок услуг раскрывается под расписанием — подводим к нему взгляд. */
  const servicesRef = React.useRef<HTMLDivElement | null>(null);
  const [errors, setErrors] = React.useState({ date: false, time: false, services: false });

  const [reviewsOpen, setReviewsOpen] = React.useState(false);
  const [guestOpen, setGuestOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<GuestBookingResult | null>(null);

  /**
   * Филиал записи. В публичном каталоге источник один — основной филиал врача
   * (открытый вопрос §7.4 тикета), и он же уходит в POST /bookings/.
   *
   * Этим же филиалом скоупим занятость (branch_id в calendar/available-times/
   * available-services, ответ бэка от 21.08.2026): без параметра бэк считает
   * занятость по всей организации, и приёмы врача в другом филиале гасили здесь
   * свободные окна. Показываем окна того филиала, в который заведём приём.
   */
  const branchId = doctor?.branch?.id ?? null;

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

    getProfessionalReviews(idOrSlug, { limit: 20 }, controller.signal)
      .then((r) => setReviews(r.items))
      .catch(() => {});
    return () => controller.abort();
  }, [idOrSlug]);

  // Календарь врача. Грузим без услуги — как только услуги выбраны, времена
  // пересчитываются через available-times.
  React.useEffect(() => {
    if (!doctor) return;
    const controller = new AbortController();
    setCalendarLoading(true);
    getProfessionalCalendar(idOrSlug, { branchId }, controller.signal)
      .then((days) => {
        setCalendar(days);
        // Сразу открываем ближайший свободный день — это то, что ищет пациент.
        const firstAvailable = days.find((d) => d.isAvailable);
        if (firstAvailable) {
          setSelectedDate(firstAvailable.date);
          setStep(2);
        }
      })
      .catch((e) => {
        if (!isAbortError(e)) setCalendar([]);
      })
      .finally(() => setCalendarLoading(false));
    return () => controller.abort();
  }, [doctor, idOrSlug, branchId]);

  // Первое раскрытие блока услуг: он теперь ниже расписания и на телефоне
  // остаётся за краем экрана — иначе гость не заметит, что появился шаг 3.
  React.useEffect(() => {
    if (!servicesUnlocked) return;
    servicesRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [servicesUnlocked]);

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
        .map(
          (id) => visibleServices.find((s) => s.id === id) ?? allServices.find((s) => s.id === id),
        )
        .filter((s): s is PickableService => Boolean(s)),
    [selectedServices, visibleServices, allServices],
  );

  const selectedDay = calendar.find((d) => d.date === selectedDate) ?? null;
  /** Слоты дня: с выбранными услугами приходят с флагом busy, иначе — только свободные. */
  const slots: AvailableTimeSlot[] =
    filteredTimes ?? (selectedDay?.times ?? []).map((time) => ({ time, busy: false }));
  const hasAvailableDay = calendar.some((d) => d.isAvailable);

  // Филиал обязателен всегда (без branch_id → 400), услуга — пока бэк не
  // принимает пустой service_ids (см. BOOKING_NO_SERVICE_ENABLED).
  const canBook =
    !doctor ||
    ((BOOKING_NO_SERVICE_ENABLED || doctor.services.length > 0) && branchId !== null);

  /** Свободные времена под выбранные услуги (их суммарная длительность). */
  const reloadTimes = React.useCallback(
    async (date: string, serviceIds: number[]) => {
      if (!serviceIds.length) {
        setFilteredTimes(null);
        return null;
      }
      setTimesLoading(true);
      try {
        const res = await getProfessionalAvailableTimes(idOrSlug, date, serviceIds, branchId);
        setFilteredTimes(res.times);
        return res.times;
      } catch {
        setFilteredTimes(null);
        return null;
      } finally {
        setTimesLoading(false);
      }
    },
    [idOrSlug, branchId],
  );

  const handleDateChange = async (date: string) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setFilteredServices(null);
    setErrors((prev) => ({ ...prev, date: false }));
    setStep(2);
    await reloadTimes(date, selectedServices);
  };

  const handleTimeChange = async (time: string) => {
    setSelectedTime(time);
    setErrors((prev) => ({ ...prev, time: false }));
    setStep(3);
    setServicesUnlocked(true);
    if (!selectedDate) return;
    // Услуги, которые помещаются в это окно, — их и предлагаем выбрать.
    setServicesLoading(true);
    try {
      const res = await getProfessionalAvailableServices(idOrSlug, selectedDate, time, branchId);
      const items: PickableService[] = res.items.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMinutes: s.durationMinutes,
        basePrice: s.basePrice,
      }));
      setFilteredServices(items);
      // Услуги, недоступные на новое время, убираем из выбора — иначе их id
      // незаметно уйдут в service_ids при создании брони.
      setSelectedServices((prev) => prev.filter((id) => items.some((s) => s.id === id)));
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
    setErrors((prev) => ({ ...prev, services: false }));
    if (!selectedDate) return;
    const times = await reloadTimes(selectedDate, next);
    // Более длинный набор услуг может не влезть в выбранное окно — тогда время
    // сбрасываем и возвращаем гостя на шаг выбора времени.
    if (times && selectedTime && !times.some((s) => s.time === selectedTime && !s.busy)) {
      setSelectedTime(null);
      setStep(2);
    }
  };

  const handleBook = () => {
    const dateInvalid = !selectedDate;
    const timeInvalid = !selectedTime;
    // Услуга обязательна, пока бэк не принимает пустой service_ids
    // (см. BOOKING_NO_SERVICE_ENABLED) — иначе гость упрётся в 400 на сабмите.
    const servicesInvalid = !BOOKING_NO_SERVICE_ENABLED && selectedServices.length === 0;
    setErrors({ date: dateInvalid, time: timeInvalid, services: servicesInvalid });

    if (dateInvalid) return setStep(1);
    if (timeInvalid) return setStep(2);
    if (servicesInvalid) return setStep(3);

    setSubmitError(null);
    // Вошедшему пациенту с выбранной картой контакты вводить незачем — они уже
    // есть в сессии. Диалог остаётся доступен через «Записать другого».
    if (session && selectedPatient) {
      submitBooking(selectedPatient.fullName, session.phone, "", selectedPatient.id);
      return;
    }
    setGuestOpen(true);
  };

  const submitBooking = (
    name: string,
    phone: string,
    comment: string,
    patientId?: number,
  ) => {
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
      // Бронь садится на карту пациента только вместе с его токеном.
      ...(patientId != null && session ? { patientId, patientToken: session.token } : {}),
    })
      .then((res) => {
        setResult(res);
        setGuestOpen(false);
      })
      .catch((e) => {
        // Тексты ошибок бэка адресованы разработчику — гостю показываем
        // понятное объяснение по коду ответа.
        if (!(e instanceof ApiError)) setSubmitError(t("bookingFailed"));
        // 405 — эндпоинта создания нет (было до 03.08.2026). 404 с живым POST
        // значит другое: врач, филиал или услуга не найдены — предлагать
        // «скоро заработает» здесь неуместно.
        else if (e.status === 405) setSubmitError(t("onlineBookingSoon"));
        else if (e.status === 404) setSubmitError(t("bookingTargetGone"));
        else if (e.status === 409) setSubmitError(t("slotTaken"));
        else if (e.status === 429) setSubmitError(t("tooManyAttempts"));
        else if (e.status === 400) setSubmitError(t("bookingFailed"));
        else setSubmitError(e.message || t("bookingFailed"));
      })
      .finally(() => setSubmitting(false));
  };

  const handleGuestSubmit = (name: string, phone: string, comment: string) =>
    submitBooking(name, phone, comment);

  // ── Состояния загрузки и ошибок ────────────────────────────────────────────

  if (loading) {
    return (
      <PublicBookingShell heading={t("headingBooking")} backTo="/book/doctors">
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "550px minmax(0, 1fr)" },
          }}
        >
          <Skeleton variant="rounded" height={220} sx={{ borderRadius: BOOKING_RADIUS }} />
          <Skeleton variant="rounded" height={460} sx={{ borderRadius: BOOKING_RADIUS }} />
        </Box>
      </PublicBookingShell>
    );
  }

  if (notFound || !doctor) {
    return (
      <PublicBookingShell heading={t("headingBooking")} backTo="/book/doctors">
        <Alert severity="warning">{t("notFound")}</Alert>
        <Button
          sx={{ mt: 2 }}
          startIcon={<ArrowBackOutlined />}
          onClick={() => go("/book/doctors")}
        >
          {t("backToList")}
        </Button>
      </PublicBookingShell>
    );
  }

  const choice: BookingChoice = { date: selectedDate, time: selectedTime, services: chosenServices };
  const { price: totalPrice } = choiceTotals(chosenServices);

  /** Записаться нельзя вообще — вместо кнопки даём позвонить. */
  const callInstead = clinicPhone ? (
    <Button
      variant="contained"
      href={telHref(clinicPhone)}
      startIcon={<PhoneOutlined />}
      sx={{ height: 44, borderRadius: PILL_RADIUS, fontWeight: 600 }}
    >
      {t("callClinic")} · {formatPhone(clinicPhone)}
    </Button>
  ) : null;

  const showBookButton = calendarLoading || hasAvailableDay;

  /**
   * Кому оформляется запись, когда пациент вошёл: имя из выбранной карты вместо
   * повторного ввода контактов. «Записать другого» возвращает обычную форму —
   * с одного номера часто записывают и себя, и родственника без своей карты.
   */
  const bookingFor =
    session && selectedPatient ? (
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="center"
        flexWrap="wrap"
        gap={0.75}
        sx={{ fontSize: 13 }}
      >
        <PersonOutlineOutlined sx={{ fontSize: 16, color: MUTED }} />
        <Typography component="span" sx={{ fontSize: 13, color: MUTED }}>
          {t("bookingFor")}
        </Typography>
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 600 }}>
          {selectedPatient.fullName}
        </Typography>
        <Box
          component="button"
          type="button"
          onClick={() => setGuestOpen(true)}
          sx={{
            border: 0,
            bgcolor: "transparent",
            p: 0,
            fontFamily: "inherit",
            fontSize: 13,
            color: BOOKING_PRIMARY,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {t("bookForOther")}
        </Box>
      </Stack>
    ) : null;

  const scheduleBlock = (
    <Box sx={{ position: "relative" }}>
      {(errors.date || errors.time) && (
        <ErrorTooltip text={errors.date ? t("selectDateRequired") : t("selectTimeRequired")} />
      )}
      <ScheduleCard
        calendar={calendar}
        calendarLoading={calendarLoading}
        selectedDate={selectedDate}
        onDateChange={(date) => void handleDateChange(date)}
        selectedTime={selectedTime}
        onTimeChange={(time) => void handleTimeChange(time)}
        slots={slots}
        timesLoading={timesLoading}
        dateError={errors.date}
        timeError={errors.time}
      />
    </Box>
  );

  return (
    <PublicBookingShell
      pageTitle={doctor.fullName}
      heading={t("headingBooking")}
      backTo="/book/doctors"
      stickyBar={
        canBook && showBookButton ? (
          // Мобильная панель эталона: полупрозрачный фон с размытием,
          // строка сводки и кнопка во всю ширину.
          <Box
            sx={{
              display: { xs: "flex", lg: "none" },
              flexDirection: "column",
              gap: 1.25,
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: (tt) => tt.zIndex.appBar,
              px: 2,
              pt: 1.5,
              pb: "calc(12px + env(safe-area-inset-bottom))",
              bgcolor: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(8px)",
              borderTop: "1px solid #ECEDF1",
            }}
          >
            {submitError && (
              <Typography sx={{ fontSize: 12, color: "error.main", textAlign: "center" }}>
                {submitError}
              </Typography>
            )}
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
              <Typography noWrap sx={{ fontSize: 13, fontWeight: 500 }}>
                {selectedDate && selectedTime
                  ? `${formatDayLong(selectedDate)} · ${selectedTime}`
                  : selectedDate
                    ? formatDayLong(selectedDate)
                    : t("selectDateAndTime")}
                {chosenServices.length > 0 && (
                  <Box component="span" sx={{ color: MUTED }}>
                    {" "}
                    · {formatServicesCount(chosenServices.length)}
                  </Box>
                )}
              </Typography>
              {totalPrice > 0 && (
                <Typography
                  sx={{
                    flexShrink: 0,
                    fontWeight: 700,
                    color: BOOKING_PRIMARY,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatPrice(totalPrice)}
                </Typography>
              )}
            </Stack>
            {bookingFor}
            <BookButton onClick={handleBook} loading={submitting} fullWidth />
          </Box>
        ) : undefined
      }
    >
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
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "550px minmax(0, 1fr)" },
        }}
      >
        {/* Левая колонка: врач */}
        <DoctorCard
          doctor={doctor}
          reviewsCount={doctor.ratingCount || reviews.length}
          onOpenReviews={() => setReviewsOpen(true)}
        />

        {/* Правая колонка: шаги, расписание, услуги, действие */}
        <Stack spacing={1.5}>
          {!canBook ? (
            <Alert severity="info">{t("bookingUnavailable")}</Alert>
          ) : (
            <>
              <StepIndicator current={step} />

              {scheduleBlock}

              {!hasAvailableDay && !calendarLoading && (
                <Alert severity="info">{t("noSlotsAvailable")}</Alert>
              )}

              {/* Услуги идут ПОСЛЕ расписания: порядок шагов сверху вниз —
                  дата → время → услуги, блок раскрывается под выбранным окном. */}
              {servicesUnlocked && (
                <Box
                  ref={servicesRef}
                  sx={{
                    position: "relative",
                    borderRadius: BOOKING_RADIUS,
                    border: 2,
                    borderColor: errors.services ? "error.light" : "transparent",
                    animation: "bookingFadeUp .3s ease both",
                    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                  }}
                >
                  {errors.services && <ErrorTooltip text={t("selectServiceRequired")} />}
                  <ServicesCard
                    services={visibleServices}
                    selected={selectedServices}
                    onToggle={(id) => void handleServiceToggle(id)}
                    loading={servicesLoading}
                  />
                </Box>
              )}

              {/* Итог и кнопка — десктоп; на мобильном они в липкой панели. */}
              <Stack
                alignItems="center"
                spacing={1.5}
                sx={{ display: { xs: "none", lg: "flex" }, pt: 1, pb: 2 }}
              >
                {(selectedDate || selectedTime || chosenServices.length > 0) && (
                  <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={1}>
                    {selectedDate && (
                      <SummaryChip>
                        <EventOutlined sx={{ fontSize: 13, color: MUTED }} />
                        {formatDayLong(selectedDate)}
                      </SummaryChip>
                    )}
                    {selectedTime && (
                      <SummaryChip>
                        <ScheduleOutlined sx={{ fontSize: 13, color: MUTED }} />
                        {selectedTime}
                      </SummaryChip>
                    )}
                    {chosenServices.length > 0 && (
                      <SummaryChip>
                        {chosenServices.length === 1
                          ? chosenServices[0].name
                          : formatServicesCount(chosenServices.length)}
                      </SummaryChip>
                    )}
                    {totalPrice > 0 && <SummaryChip accent>{formatPrice(totalPrice)}</SummaryChip>}
                  </Stack>
                )}
                {bookingFor}
                {submitError && (
                  <Typography sx={{ fontSize: 14, color: "error.main", textAlign: "center" }}>
                    {submitError}
                  </Typography>
                )}
                {showBookButton ? (
                  <BookButton onClick={handleBook} loading={submitting} />
                ) : (
                  callInstead
                )}
              </Stack>
            </>
          )}
        </Stack>
      </Box>

      <ReviewsDialog
        open={reviewsOpen}
        onClose={() => setReviewsOpen(false)}
        reviews={reviews}
        rating={doctor.rating}
        total={doctor.ratingCount || reviews.length}
      />

      <GuestDialog
        open={guestOpen}
        doctorName={doctor.fullName}
        choice={choice}
        submitting={submitting}
        error={submitError}
        onClose={() => setGuestOpen(false)}
        onSubmit={handleGuestSubmit}
      />

      {result && (
        <SuccessDialog
          result={result}
          doctor={doctor}
          services={chosenServices}
          onClose={() => go("/book/doctors")}
        />
      )}
    </PublicBookingShell>
  );
};

export default DoctorBookingPage;
