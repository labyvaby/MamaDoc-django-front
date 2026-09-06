import React from "react";
import { Alert, Box, Button, Skeleton, Stack, Typography } from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import { useParams } from "react-router";

import {
  createGuestBooking,
  createWaitlistRequest,
  getProfessional,
  getProfessionalAvailableServices,
  getProfessionalAvailableTimes,
  getProfessionalCalendar,
  getProfessionalReviews,
  getProfessionalSchedule,
  type AvailableTimeSlot,
  type CalendarDay,
  type GuestBookingResult,
  type ProfessionalDetail,
  type ProfessionalReview,
  type ProfessionalScheduleBranch,
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
import { BranchesCard } from "./booking/BranchesCard";
import {
  bookableBranches,
  calendarsReady,
  dayOffDates,
  nearestAvailableDate,
  pickBranchWithSlots,
  pickDefaultBranchId,
  shortDate,
} from "./booking/schedule";
import { ServicesCard, type PickableService } from "./booking/ServicesCard";
import { DoctorCard } from "./booking/DoctorCard";
import { ReviewsDialog } from "./booking/ReviewsDialog";
import { GuestDialog, SuccessDialog } from "./booking/Dialogs";
import { WaitlistDialog } from "./booking/WaitlistDialog";
import { WAITLIST_PUBLIC_CHANNEL_ENABLED } from "../waitlist/meta";
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
  const { t: tWaitlist } = useT("waitlist");
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

  /**
   * Календари по филиалам: ключ — id филиала, "all" — выдача без branch_id
   * (когда ручка расписания филиалов не дала).
   *
   * Грузим сразу все, а не только выбранный: иначе карточка говорит «окон нет»
   * в филиале, где смен нет, умалчивая, что в соседнем они есть — врач выглядит
   * нерабочим (жалоба 02.09.2026). Филиалов у специалиста один-три, запросы
   * идут параллельно, и переключение филиала после этого не стоит ни одного
   * запроса — раньше стоило.
   */
  const [calendarByBranch, setCalendarByBranch] = React.useState<Record<string, CalendarDay[]>>({});
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
  /** Набор услуг, для которого уже сработал автовыбор единственной услуги. */
  const autoPickedKeyRef = React.useRef<string | null>(null);
  const [errors, setErrors] = React.useState({ date: false, time: false, services: false });

  const [reviewsOpen, setReviewsOpen] = React.useState(false);
  const [guestOpen, setGuestOpen] = React.useState(false);
  // Лист ожидания — выход из тупика «свободных окон нет».
  const [waitlistOpen, setWaitlistOpen] = React.useState(false);
  const [waitlistSubmitting, setWaitlistSubmitting] = React.useState(false);
  const [waitlistError, setWaitlistError] = React.useState<string | null>(null);
  const [waitlistDone, setWaitlistDone] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<GuestBookingResult | null>(null);

  /** Филиалы, где врача можно записать, с графиком (ручка расписания). */
  const [scheduleBranches, setScheduleBranches] = React.useState<ProfessionalScheduleBranch[]>([]);
  const [scheduleLoading, setScheduleLoading] = React.useState(true);
  const [pickedBranchId, setPickedBranchId] = React.useState<number | null>(null);

  /**
   * Филиал записи: выбор пациента, иначе основной филиал врача.
   *
   * Раньше источник был один — `doctor.branch` («домашний» филиал), и врача,
   * который принимает и во втором филиале, витрина туда записать не могла.
   * Список филиалов даёт ручка расписания — в карточке врача поле по-прежнему
   * одно.
   *
   * Этим же филиалом скоупим занятость (branch_id в calendar/available-times/
   * available-services, ответ бэка от 21.08.2026): без параметра бэк считает
   * занятость по всей организации, и приёмы врача в другом филиале гасили здесь
   * свободные окна. Показываем окна того филиала, в который заведём приём.
   *
   * ⚠ Сами окна бэк по филиалу не режет: available-times/ строит их по графику
   * врача независимо от branch_id (проверено на проде 28.08.2026) — branch_id
   * влияет только на то, какие приёмы считаются занятыми. Поэтому филиал —
   * осознанный выбор пациента рядом с графиком, а не вывод из времени
   * (тикет backend_ticket_schedule_multi_branch_employee.md).
   */
  const branchId = pickedBranchId ?? doctor?.branch?.id ?? null;
  const selectedBranch = scheduleBranches.find((b) => b.id === branchId) ?? null;
  // NB: ищем среди всех филиалов, а не видимых: выбранный мог стать скрытым.

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

    setScheduleLoading(true);
    setPickedBranchId(null);
    getProfessionalSchedule(idOrSlug, {}, controller.signal)
      .then((schedule) => setScheduleBranches(schedule.branches))
      .catch((e) => {
        // Расписание — дополнение к карточке: без него запись работает
        // по-старому, в основной филиал врача.
        if (!isAbortError(e)) setScheduleBranches([]);
      })
      .finally(() => setScheduleLoading(false));
    return () => controller.abort();
  }, [idOrSlug]);

  /** Ближайший свободный день филиала (или null) — по загруженным календарям. */
  const nearestDayByBranch = React.useMemo(() => {
    const out: Record<number, string | null> = {};
    for (const branch of scheduleBranches) {
      out[branch.id] = nearestAvailableDate(calendarByBranch[String(branch.id)]);
    }
    return out;
  }, [scheduleBranches, calendarByBranch]);

  /**
   * Филиалы для пациента: где врач принимает. Филиал без графика и без окон
   * скрываем — записаться туда нельзя, а «График не задан» читается как
   * недоработка. Календари при этом грузим по всем филиалам: скрывать нечего,
   * пока не знаем, есть ли где-то окна.
   */
  const visibleBranches = React.useMemo(
    () => bookableBranches(scheduleBranches, nearestDayByBranch, doctor?.branch?.id ?? null),
    [scheduleBranches, nearestDayByBranch, doctor?.branch?.id],
  );

  /**
   * Филиал по умолчанию — тот, где раньше всего есть свободное окно.
   *
   * Раньше выбирали по наличию правил в графике, и филиал с расписанием, но без
   * свободных дней в ближайшие две недели, выигрывал у филиала с окнами: карточка
   * открывалась на пустом расписании и говорила «окон нет». Ждём календари: до
   * них решать не на чем.
   */
  React.useEffect(() => {
    if (scheduleLoading || calendarLoading || pickedBranchId !== null) return;
    // Пока календари не пришли, «окон нет» ни в одном филиале — решение по
    // такой картине зафиксировало бы домашний филиал навсегда (guard выше).
    if (!calendarsReady(scheduleBranches, calendarByBranch)) return;
    const next = pickDefaultBranchId(
      visibleBranches,
      nearestDayByBranch,
      doctor?.branch?.id ?? null,
    );
    if (next !== null) setPickedBranchId(next);
  }, [
    scheduleLoading,
    calendarLoading,
    scheduleBranches,
    visibleBranches,
    calendarByBranch,
    pickedBranchId,
    doctor?.branch?.id,
    nearestDayByBranch,
  ]);

  /** Смена филиала: окна и услуги считались для прежнего — сбрасываем выбор. */
  const handleBranchChange = (id: number) => {
    if (id === branchId) return;
    setPickedBranchId(id);
    setSelectedDate(null);
    setSelectedTime(null);
    setFilteredTimes(null);
    setFilteredServices(null);
    setSelectedServices([]);
    autoPickedKeyRef.current = null;
    setStep(1);
  };

  // Календари врача — по одному на филиал. Грузим без услуги: как только услуги
  // выбраны, времена пересчитываются через available-times.
  React.useEffect(() => {
    if (!doctor || scheduleLoading) return;
    const controller = new AbortController();
    const keys: (number | null)[] = scheduleBranches.length
      ? scheduleBranches.map((b) => b.id)
      : [null];
    setCalendarLoading(true);
    Promise.all(
      keys.map((id) =>
        getProfessionalCalendar(idOrSlug, { branchId: id ?? undefined }, controller.signal)
          .then((days) => [id === null ? "all" : String(id), days] as const)
          // Филиал, чей календарь не ответил, показываем без окон, а не роняем
          // всю карточку: остальные филиалы записать по-прежнему можно.
          .catch((e) => {
            if (isAbortError(e)) throw e;
            return [id === null ? "all" : String(id), [] as CalendarDay[]] as const;
          }),
      ),
    )
      .then((entries) => setCalendarByBranch(Object.fromEntries(entries)))
      .catch((e) => {
        if (!isAbortError(e)) setCalendarByBranch({});
      })
      .finally(() => {
        if (!controller.signal.aborted) setCalendarLoading(false);
      });
    return () => controller.abort();
  }, [doctor, idOrSlug, scheduleBranches, scheduleLoading]);

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

  /** Календарь выбранного филиала. */
  const calendar = React.useMemo(
    () => calendarByBranch[branchId === null ? "all" : String(branchId)] ?? [],
    [calendarByBranch, branchId],
  );

  /**
   * Открываем ближайший свободный день выбранного филиала. Раньше это делалось
   * в then загрузки; теперь календари загружены заранее, и день выбирается и при
   * первом показе, и при переключении филиала.
   */
  React.useEffect(() => {
    if (selectedDate !== null) return;
    const firstAvailable = calendar.find((d) => d.isAvailable);
    if (!firstAvailable) return;
    setSelectedDate(firstAvailable.date);
    setStep(2);
  }, [calendar, selectedDate]);

  /** Нерабочие дни филиала: в календаре их подписываем «выходной». */
  const calendarDaysOff = React.useMemo(
    () =>
      dayOffDates(
        selectedBranch,
        calendar.filter((d) => !d.isAvailable).map((d) => d.date),
      ),
    [selectedBranch, calendar],
  );

  const selectedDay = calendar.find((d) => d.date === selectedDate) ?? null;
  /** Слоты дня: с выбранными услугами приходят с флагом busy, иначе — только свободные. */
  const slots: AvailableTimeSlot[] =
    filteredTimes ?? (selectedDay?.times ?? []).map((time) => ({ time, busy: false }));
  const hasAvailableDay = calendar.some((d) => d.isAvailable);

  /**
   * Филиал, где окна есть, когда в выбранном их нет.
   *
   * Пациент выбирает адрес сам, и «нет свободного времени» в одном филиале
   * читалось как «врач не принимает вообще» — при том что в соседнем окна есть
   * (жалоба 02.09.2026). Предлагаем переключиться, а не молчим.
   */
  const elsewhereBranch = React.useMemo(
    () =>
      hasAvailableDay || calendarLoading
        ? null
        : pickBranchWithSlots(visibleBranches, nearestDayByBranch, branchId),
    [hasAvailableDay, calendarLoading, visibleBranches, branchId, nearestDayByBranch],
  );

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

  /** Применить набор услуг и пересчитать под него свободные окна. */
  const applyServices = React.useCallback(
    async (next: number[]) => {
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
    },
    [selectedDate, selectedTime, reloadTimes],
  );

  const handleServiceToggle = (serviceId: number) => {
    const next = selectedServices.includes(serviceId)
      ? selectedServices.filter((id) => id !== serviceId)
      : [...selectedServices, serviceId];
    return applyServices(next);
  };

  /**
   * Единственная услуга — выбирать не из чего: отмечаем её сами, чтобы гость не
   * кликал по одной строке, а окна сразу считались под её длительность. Ключ
   * набора не даёт вернуть услугу, которую гость снял руками (услуга
   * необязательна, см. BOOKING_NO_SERVICE_ENABLED).
   */
  React.useEffect(() => {
    if (calendarLoading || servicesLoading) return;
    // Ждём календарь: дата приходит вместе с ним, а без даты окна под
    // длительность услуги не пересчитать.
    if (!calendar.length) return;
    const key = visibleServices.map((s) => s.id).join(",");
    if (autoPickedKeyRef.current === key) return;
    autoPickedKeyRef.current = key;
    if (visibleServices.length !== 1 || selectedServices.length > 0) return;
    void applyServices([visibleServices[0].id]);
  }, [
    calendar,
    calendarLoading,
    servicesLoading,
    visibleServices,
    selectedServices,
    applyServices,
  ]);

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

  /**
   * «Сообщите, когда освободится»: у врача нет ни одного свободного дня.
   * Заявка не занимает слот и не создаёт карту — регистратор перезвонит,
   * когда время появится (авто-SMS в v1 нет, и обещать её гостю нельзя).
   */
  const handleWaitlistSubmit = (data: { name: string; phone: string; comment: string }) => {
    if (!doctor || !branchId) return;
    setWaitlistSubmitting(true);
    setWaitlistError(null);
    createWaitlistRequest({
      professionalId: doctor.id,
      branchId,
      serviceIds: selectedServices,
      patientName: data.name,
      patientPhone: data.phone,
      comment: data.comment,
    })
      .then(() => {
        setWaitlistOpen(false);
        setWaitlistDone(true);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 429) {
          setWaitlistError(tWaitlist("publicSite.errorTooMany"));
        } else {
          setWaitlistError(tWaitlist("publicSite.errorGeneric"));
        }
      })
      .finally(() => setWaitlistSubmitting(false));
  };

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
        dayOffDates={calendarDaysOff}
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
            {visibleBranches.length > 1 && selectedBranch && (
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: -0.5 }}>
                <PlaceOutlined sx={{ fontSize: 14, color: MUTED, flexShrink: 0 }} />
                <Typography noWrap sx={{ fontSize: 12, color: MUTED }}>
                  {selectedBranch.name}
                  {selectedBranch.address ? ` · ${selectedBranch.address}` : ""}
                </Typography>
              </Stack>
            )}
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
              {/* Адрес и график — до выбора даты: пациенту важно знать, куда
                  ехать, а у врача филиалов может быть несколько. */}
              <BranchesCard
                branches={visibleBranches}
                loading={scheduleLoading}
                selectedId={branchId}
                onSelect={handleBranchChange}
                nearestByBranch={calendarLoading ? undefined : nearestDayByBranch}
              />

              <StepIndicator current={step} />

              {scheduleBlock}

              {!hasAvailableDay && !calendarLoading && elsewhereBranch && (
                <Alert
                  severity="info"
                  action={
                    <Button size="small" onClick={() => handleBranchChange(elsewhereBranch.branch.id)}>
                      {t("branches.showElsewhere")}
                    </Button>
                  }
                >
                  {t("branches.elsewhere", {
                    name: elsewhereBranch.branch.name,
                    date: shortDate(elsewhereBranch.date),
                  })}
                </Alert>
              )}

              {!hasAvailableDay && !calendarLoading && !elsewhereBranch && (
                <Alert
                  severity={waitlistDone ? "success" : "info"}
                  action={
                    WAITLIST_PUBLIC_CHANNEL_ENABLED && !waitlistDone ? (
                      <Button
                        size="small"
                        onClick={() => {
                          setWaitlistError(null);
                          setWaitlistOpen(true);
                        }}
                      >
                        {tWaitlist("publicSite.cta")}
                      </Button>
                    ) : undefined
                  }
                >
                  {waitlistDone ? tWaitlist("publicSite.successText") : t("noSlotsAvailable")}
                </Alert>
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
                    {/* Филиал в сводке — только когда их несколько: иначе это
                        строка, которая ничего не уточняет. */}
                    {visibleBranches.length > 1 && selectedBranch && (
                      <SummaryChip>
                        <PlaceOutlined sx={{ fontSize: 13, color: MUTED }} />
                        {selectedBranch.name}
                      </SummaryChip>
                    )}
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

      {WAITLIST_PUBLIC_CHANNEL_ENABLED && (
        <WaitlistDialog
          open={waitlistOpen}
          submitting={waitlistSubmitting}
          error={waitlistError}
          onClose={() => setWaitlistOpen(false)}
          onSubmit={handleWaitlistSubmit}
        />
      )}

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
