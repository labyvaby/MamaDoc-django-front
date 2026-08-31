import React from "react";
import {
  Avatar,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import FilterListOutlined from "@mui/icons-material/FilterListOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import PriceChangeOutlined from "@mui/icons-material/PriceChangeOutlined";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
// Иконки SMS-уведомлений — те же импорты, что в старом фронте (home/AppointmentsList).
import SmsOutlined from "@mui/icons-material/SmsOutlined";
import AlarmOutlined from "@mui/icons-material/AlarmOutlined";
import EventRepeatOutlined from "@mui/icons-material/EventRepeat";
import EditCalendarOutlined from "@mui/icons-material/EditCalendar";
import EventBusyOutlined from "@mui/icons-material/EventBusy";
import dayjs from "dayjs";

import type { AppointmentNotificationItem, DjangoAppointment } from "../../../api/appointments";
import {
  appointmentEnd,
  busyIntervals,
  busyIntervalsByEmployee,
  isCancelledStatus,
  isSlotCovered,
} from "./slotAvailability";
import { formatKGS, discountPercentOf } from "../../../utility/format";
import { formatPhoneDisplay } from "../../../utility/phone";
import { useT } from "../../../i18n/VerticalProvider";
import { agree } from "../../../i18n/formatters";
import AppointmentStatusChips from "../../../components/appointments/AppointmentStatusChips";
import { resolveAppointmentDisplayState } from "../../../components/appointments/statusChipState";
import type { StatusCode } from "../../../config/appointmentStatuses";
import type { PaymentStatus } from "../../../api/payments";
import AppointmentFilterChips from "./AppointmentFilterChips";
import {
  appointmentPriceChangeSummary,
  employeeMoneyTotals,
  firstFreeSlotInSegment,
  firstFreeSlotInSegmentFor,
  matchesAppointmentSearch,
} from "./listFilters";
import { AppBottomSheet } from "../../../components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppointmentListPanelProps {
  items: DjangoAppointment[];
  loading: boolean;
  error: string | null;
  date: import("dayjs").Dayjs | null;
  selectedId: number | null;
  canUpdate: boolean;
  canManageFinance: boolean;
  canViewFinance: boolean;
  /**
   * Иконки уведомлений по приёмам с каналом и фактическим статусом.
   * Источник — лёгкий батч-эндпоинт /api/appointments/notifications/.
   */
  notificationsMap?: Map<number, Map<string, AppointmentNotificationItem>>;
  onSelect: (a: DjangoAppointment) => void;
  onEdit: (a: DjangoAppointment) => void;
  onPay: (a: DjangoAppointment) => void;
  /**
   * Клик по «Есть окно на HH:mm». Второй аргумент — исполнитель группы, в
   * которой показано окно: форма записи открывается сразу с ним, иначе
   * регистратор выбирал бы врача заново и мог промахнуться мимо свободного.
   * null — окно в группе «без специалиста».
   */
  onAddSlot?: (dateIso: string, employeeId: number | null) => void;
  /** Скрыть ленту аватарок-исполнителей (процедурный кабинет её не показывает). */
  hideDoctorStrip?: boolean;
  /**
   * Управляемый выбор исполнителя в ленте аватарок: если проп передан
   * (не undefined), панель использует его вместо внутреннего состояния,
   * а изменения сообщает через onDoctorFilterChange. Нужно реестрам
   * («Все приёмы»/«Все процедуры»), где счётчик в тулбаре учитывает выбор.
   *
   * Контракт — employee id, а не ФИО: по имени полные однофамильцы сливались в
   * одну группу и в один фильтр.
   */
  doctorFilter?: number | null;
  onDoctorFilterChange?: (employeeId: number | null) => void;
  /**
   * Клиентский поиск по пациенту, телефону, услуге и исполнителю. Панель
   * фильтрует им items до подсчёта чипов, поэтому счётчики всегда описывают то,
   * что видно. Пусто/undefined — поиск выключен.
   */
  searchQuery?: string;
  /**
   * Фильтры статуса визита и оплаты — управляемые (страница держит их в URL).
   * Не переданы → панель ведёт своё состояние (реестры, кабинеты).
   */
  statusFilter?: StatusCode[];
  onStatusFilterChange?: (codes: StatusCode[]) => void;
  paymentFilter?: PaymentStatus[];
  onPaymentFilterChange?: (values: PaymentStatus[]) => void;
  /**
   * Сброс обеих осей сразу. Отдельный колбэк, а не два вызова подряд: владелец
   * состояния может складывать их в одно обновление (страница пишет фильтры в
   * URL, где два подряд setSearchParams перетирают друг друга).
   */
  onResetChipFilters?: () => void;
  /**
   * Показывать ось «деньги» в ряду чипов. Реестры её не включают: там свои
   * чипы-сводки по оплате живут снаружи панели.
   */
  showPaymentFilter?: boolean;
  /** Показывать суммы (начислено / оплачено) в заголовке группы исполнителя. */
  showGroupTotals?: boolean;
  /**
   * Счётчик «показано N из M» в шапке панели. Реестры его выключают: там тот же
   * счётчик уже стоит в своём тулбаре над списком.
   */
  showFilteredCount?: boolean;
  /**
   * Если задано — группировать и считать исполнителей только по этим employee id.
   * Процедурный кабинет передаёт сюда id медсестёр, чтобы совместный приём
   * врач+медсестра группировался под медсестрой, а групп врачей не было.
   */
  groupEmployeeIds?: Set<number> | null;
  /**
   * Смены сотрудников на выбранную дату (из модуля расписания): плашки
   * «Есть окно на HH:mm» показываются только внутри рабочих часов исполнителя.
   * `scheduledIds` — сотрудники, у которых на эту дату есть активное правило
   * расписания; для остальных (расписание не ведётся) ограничение не действует.
   * null/undefined — расписание недоступно, поведение как раньше.
   */
  dayShifts?: {
    scheduledIds: Set<number>;
    segments: Map<number, { start: string; end: string }[]>;
    /** Сотрудники со сменой на выбранную дату, даже если приёмов ещё нет. */
    employeeNames: Map<number, string>;
  } | null;
}

type GapSlot = {
  isGap: true;
  id: string;
  timeStr: string;
  dateIso: string;
  /** Исполнитель группы, в которой стоит окно (null — группа «без специалиста»). */
  employeeId: number | null;
};

type RenderItem = DjangoAppointment | GapSlot;

function isGap(item: RenderItem): item is GapSlot {
  return (item as GapSlot).isGap === true;
}

const GAP_THRESHOLD_MS = 30 * 60 * 1000;

// ─── SMS-уведомления: маппинг тип → иконка/цвет (1-в-1 со старым фронтом).
// Подписи живут в словаре (appointments:notifications.*).
const NOTIF_CONFIG: Record<string, { Icon: React.ElementType; color: string }> = {
  created_10m: { Icon: SmsOutlined, color: "success.main" },
  reminder_2h: { Icon: AlarmOutlined, color: "info.main" },
  rescheduled_10m: { Icon: EventRepeatOutlined, color: "warning.main" },
  appointment_change: { Icon: EditCalendarOutlined, color: "warning.main" },
  appointment_cancel: { Icon: EventBusyOutlined, color: "error.main" },
};

// ─── DoctorStoryItem — Instagram-style аватар врача ──────────────────────────

type DoctorStoryItemProps = {
  name: string;
  nickname?: string | null;
  photoUrl?: string | null;
  isActive: boolean;
  onClick: () => void;
  /**
   * У сотрудника в этот день нет ни одной записи — он в ленте потому, что у
   * него смена по графику. Приглушаем, иначе непонятно, почему он здесь.
   */
  dimmed?: boolean;
};

const DoctorStoryItem: React.FC<DoctorStoryItemProps> = ({
  name,
  nickname,
  photoUrl,
  isActive,
  onClick,
  dimmed = false,
}) => {
  const theme = useTheme();
  const { t } = useT("appointments");
  const displayName = nickname || name.split(" ")[0];

  const bubble = (
    <Stack
      spacing={0.25}
      alignItems="center"
      onClick={onClick}
      sx={{
        cursor: "pointer",
        minWidth: 56,
        transition: "all 0.2s ease",
        // Выбранный сотрудник не приглушается: активный фильтр должен читаться
        // однозначно, даже если записей у него нет.
        opacity: dimmed && !isActive ? 0.45 : 1,
        "&:active": { transform: "scale(0.92)" },
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: 48,
          height: 48,
          borderRadius: "50%",
          padding: "3px",
          background: isActive ? theme.palette.primary.main : "transparent",
          border: isActive
            ? "none"
            : dimmed
              ? `1.5px dashed ${theme.palette.divider}`
              : `1.5px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Avatar
          src={photoUrl ?? undefined}
          sx={{
            width: "100%",
            height: "100%",
            border: isActive ? `2px solid ${theme.palette.background.paper}` : "none",
            bgcolor: "primary.main",
            fontSize: "1.25rem",
            fontWeight: 700,
          }}
        >
          {name.charAt(0)}
        </Avatar>
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontWeight: isActive ? 700 : 500,
          color: isActive ? "text.primary" : "text.secondary",
          fontSize: "0.75rem",
          textAlign: "center",
          maxWidth: 72,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {displayName}
      </Typography>
    </Stack>
  );

  return dimmed && !isActive ? (
    <Tooltip title={t("list.onShiftNoBookings")}>{bubble}</Tooltip>
  ) : (
    bubble
  );
};

// ─── AddSlotButton — кнопка "Есть окно на HH:mm" ─────────────────────────────

const AddSlotButton: React.FC<{ timeStr: string; onClick: () => void }> = ({ timeStr, onClick }) => {
  const { t } = useT("appointments");
  return (
  <Box
    onClick={onClick}
    sx={{
      mx: 2,
      my: 1,
      height: 44,
      border: "1px dashed",
      borderColor: "primary.main",
      borderRadius: "10px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "primary.onSurface",
      cursor: "pointer",
      transition: "background-color .15s ease, border-color .15s ease",
      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
      "&:hover": {
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
      },
    }}
  >
    <AddCircleOutline sx={{ fontSize: 18, mr: 1, opacity: 0.8 }} />
    <Typography variant="body2" fontWeight={600}>
      {t("list.freeSlotAt", { time: timeStr })}
    </Typography>
  </Box>
  );
};

// ─── AppointmentListPanel ─────────────────────────────────────────────────────

const AppointmentListPanel: React.FC<AppointmentListPanelProps> = React.memo(({
  items,
  loading,
  error,
  date,
  selectedId,
  // Права на финансы больше не влияют на бейджи оплаты (факт оплаты — общий
  // операционный статус); canUpdate/canManageFinance/canViewFinance сохранены
  // в контракте пропсов для деталей/действий, но панелью не используются.
  notificationsMap,
  onSelect,
  onAddSlot,
  hideDoctorStrip = false,
  doctorFilter,
  onDoctorFilterChange,
  searchQuery = "",
  statusFilter,
  onStatusFilterChange,
  paymentFilter,
  onPaymentFilterChange,
  onResetChipFilters,
  showPaymentFilter = false,
  showGroupTotals = false,
  showFilteredCount = true,
  groupEmployeeIds = null,
  dayShifts = null,
}) => {
  const { t, term } = useT("appointments");
  const theme = useTheme();
  // Границу «телефон/десктоп» ставим по md: в теме проекта sm = 360, и телефон
  // в него попадает (см. theme.ts).
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const titleDate = date ? date.format("DD.MM.YYYY") : "";

  // ── Doctor filter state: управляемый (doctorFilter) или внутренний ────────
  const isDoctorControlled = doctorFilter !== undefined;
  const [internalDoctor, setInternalDoctor] = React.useState<number | null>(null);
  const selectedDoctorId = isDoctorControlled ? doctorFilter : internalDoctor;
  const setSelectedDoctorId = React.useCallback(
    (employeeId: number | null) => {
      if (!isDoctorControlled) setInternalDoctor(employeeId);
      onDoctorFilterChange?.(employeeId);
    },
    [isDoctorControlled, onDoctorFilterChange],
  );

  React.useEffect(() => {
    if (!isDoctorControlled) setInternalDoctor(null);
  }, [titleDate, isDoctorControlled]);

  // ── Build doctor list from appointments (id → name, photoUrl) ─────────────
  const availableDoctors = React.useMemo(() => {
    const map = new Map<
      number,
      { id: number; name: string; photoUrl: string | null; nickname: string | null; apptCount: number }
    >();
    for (const appt of items) {
      // Один приём считается сотруднику один раз, даже если у него в нём
      // несколько строк услуг.
      const seen = new Set<number>();
      for (const sl of appt.services) {
        if (!sl.employee) continue;
        if (groupEmployeeIds && !groupEmployeeIds.has(sl.employee.id)) continue;
        if (seen.has(sl.employee.id)) continue;
        seen.add(sl.employee.id);

        const existing = map.get(sl.employee.id);
        if (existing) {
          existing.apptCount += 1;
        } else {
          map.set(sl.employee.id, {
            id: sl.employee.id,
            name: sl.employee.fullName,
            photoUrl: sl.employee.photoUrl,
            nickname: sl.employee.nickname,
            apptCount: 1,
          });
        }
      }
    }
    // Новая смена может быть создана раньше первого приёма сотрудника.
    // Добавляем таких сотрудников из расписания, чтобы они сразу появлялись
    // в быстром фильтре регистратуры (в ленте они приглушены — записей нет).
    for (const [id, name] of dayShifts?.employeeNames ?? []) {
      if ((!groupEmployeeIds || groupEmployeeIds.has(id)) && !map.has(id)) {
        map.set(id, { id, name, photoUrl: null, nickname: null, apptCount: 0 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [items, groupEmployeeIds, dayShifts]);

  // После смены даты выбранный врач может исчезнуть из списка: на новом дне
  // у него нет ни приёмов, ни смены. Сохраняем последнее известное ФИО, чтобы
  // предупреждение всё равно было конкретным, а не «у кого-то нет смены».
  const doctorNamesRef = React.useRef(new Map<number, string>());
  React.useEffect(() => {
    for (const doctor of availableDoctors) doctorNamesRef.current.set(doctor.id, doctor.name);
  }, [availableDoctors]);

  // ── Фильтры статуса визита и оплаты ───────────────────────────────────────
  // Главные вопросы стойки — «кто уже в холле» и «с кого ещё не взяли деньги»:
  // раньше отобрать таких можно было только глазами по всему списку. Фильтруем
  // по каноническому коду, а не по метке: метка зависит от вертикали бизнеса.
  const isStatusControlled = statusFilter !== undefined;
  const [internalStatuses, setInternalStatuses] = React.useState<StatusCode[]>([]);
  const selectedStatuses = isStatusControlled ? statusFilter : internalStatuses;
  const setSelectedStatuses = React.useCallback(
    (codes: StatusCode[]) => {
      if (!isStatusControlled) setInternalStatuses(codes);
      onStatusFilterChange?.(codes);
    },
    [isStatusControlled, onStatusFilterChange],
  );

  const isPaymentControlled = paymentFilter !== undefined;
  const [internalPayments, setInternalPayments] = React.useState<PaymentStatus[]>([]);
  const selectedPayments = isPaymentControlled ? paymentFilter : internalPayments;
  const setSelectedPayments = React.useCallback(
    (values: PaymentStatus[]) => {
      if (!isPaymentControlled) setInternalPayments(values);
      onPaymentFilterChange?.(values);
    },
    [isPaymentControlled, onPaymentFilterChange],
  );

  React.useEffect(() => {
    if (!isStatusControlled) setInternalStatuses([]);
    if (!isPaymentControlled) setInternalPayments([]);
  }, [titleDate, isStatusControlled, isPaymentControlled]);

  // ── Отбор: поиск → исполнитель → чипы ─────────────────────────────────────
  // Порядок важен: счётчики чипов считаются на середине цепочки, поэтому при
  // выбранном специалисте они описывают только его приёмы (иначе «Долг · 7» на
  // фильтре одного врача означал бы долги всей клиники).
  const searchedItems = React.useMemo(() => {
    if (!searchQuery.trim()) return items;
    return items.filter((appt) => matchesAppointmentSearch(appt, searchQuery));
  }, [items, searchQuery]);

  const doctorScopedItems = React.useMemo(() => {
    if (selectedDoctorId == null) return searchedItems;
    return searchedItems.filter((appt) =>
      appt.services.some((sl) => sl.employee?.id === selectedDoctorId),
    );
  }, [searchedItems, selectedDoctorId]);

  // Счётчики обеих осей считаются от одной базы (поиск + специалист), а не друг
  // от друга: иначе цифры прыгали бы при каждом клике по соседней оси.
  //
  // Ось визита считает по единому состоянию приёма (resolveAppointmentDisplayState),
  // а не по сырому статусу из базы: бэк при оплате статус не меняет, а строка
  // после закрытия чека его чип прячет — «Пациент здесь · N» набирался давно
  // оплаченными строками, на которых написано одно лишь «Оплачено». Такие
  // приёмы теперь не попадают ни в один чип визита и видны на оси денег.
  const statusCounts = React.useMemo(() => {
    const counts = new Map<StatusCode, number>();
    for (const appt of doctorScopedItems) {
      const code = resolveAppointmentDisplayState(appt);
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return counts;
  }, [doctorScopedItems]);

  const paymentCounts = React.useMemo(() => {
    const counts = new Map<PaymentStatus, number>();
    for (const appt of doctorScopedItems) {
      const s = appt.paymentStatus;
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return counts;
  }, [doctorScopedItems]);

  const filteredItems = React.useMemo(() => {
    let list = doctorScopedItems;
    if (selectedStatuses.length > 0) {
      list = list.filter((appt) => {
        const code = resolveAppointmentDisplayState(appt);
        return code != null && selectedStatuses.includes(code);
      });
    }
    if (selectedPayments.length > 0) {
      list = list.filter(
        (appt) => appt.paymentStatus != null && selectedPayments.includes(appt.paymentStatus),
      );
    }
    return list;
  }, [doctorScopedItems, selectedStatuses, selectedPayments]);

  const toggleStatus = React.useCallback(
    (code: StatusCode) =>
      setSelectedStatuses(
        selectedStatuses.includes(code)
          ? selectedStatuses.filter((c) => c !== code)
          : [...selectedStatuses, code],
      ),
    [selectedStatuses, setSelectedStatuses],
  );

  const togglePayment = React.useCallback(
    (value: PaymentStatus) =>
      setSelectedPayments(
        selectedPayments.includes(value)
          ? selectedPayments.filter((v) => v !== value)
          : [...selectedPayments, value],
      ),
    [selectedPayments, setSelectedPayments],
  );

  const resetChipFilters = React.useCallback(() => {
    if (onResetChipFilters) {
      if (!isStatusControlled) setInternalStatuses([]);
      if (!isPaymentControlled) setInternalPayments([]);
      onResetChipFilters();
      return;
    }
    setSelectedStatuses([]);
    setSelectedPayments([]);
  }, [
    onResetChipFilters,
    isStatusControlled,
    isPaymentControlled,
    setSelectedStatuses,
    setSelectedPayments,
  ]);

  // Сколько записей дня скрыто фильтрами. Без этой строки отфильтрованный
  // список выглядит как «в этот день почти никого нет».
  const activeChipCount = selectedStatuses.length + selectedPayments.length;
  const isFiltered = filteredItems.length !== items.length;
  // Отбор по существующим записям (чипы или поиск). Фильтр по специалисту сюда
  // не входит: выбрать свободного врача и увидеть его окна — нормальный сценарий.
  const hasNarrowingFilters = activeChipCount > 0 || searchQuery.trim().length > 0;

  const [filterSheetOpen, setFilterSheetOpen] = React.useState(false);

  // Фильтр пережил смену даты, но у выбранного специалиста нет фактической
  // смены на выбранный день. `segments` уже учитывает weekday и исключения,
  // поэтому одного попадания правила в диапазон недостаточно.
  const selectedDoctor =
    selectedDoctorId == null
      ? null
      : availableDoctors.find((doctor) => doctor.id === selectedDoctorId) ?? null;
  const selectedDoctorName =
    selectedDoctor?.name ??
    (selectedDoctorId == null ? null : doctorNamesRef.current.get(selectedDoctorId)) ??
    null;
  const doctorHasNoShift =
    selectedDoctorId != null && dayShifts != null && !dayShifts.segments.has(selectedDoctorId);

  // ── Group by employee → list of appointments ──────────────────────────────
  // Mirrors оригинал: каждый приём попадает в группу каждого участвующего
  // исполнителя. Ключ группы — employee id (null = «без специалиста»): по ФИО
  // полные однофамильцы сливались в одну группу.
  const rawGroups = React.useMemo(() => {
    const groups = new Map<
      number | null,
      { employeeId: number | null; name: string; appts: DjangoAppointment[] }
    >();

    const push = (employeeId: number | null, name: string, appt: DjangoAppointment) => {
      let group = groups.get(employeeId);
      if (!group) {
        group = { employeeId, name, appts: [] };
        groups.set(employeeId, group);
      }
      group.appts.push(appt);
    };

    for (const appt of filteredItems) {
      const participants = new Map<number, string>();
      for (const sl of appt.services) {
        if (sl.employee && (!groupEmployeeIds || groupEmployeeIds.has(sl.employee.id))) {
          participants.set(sl.employee.id, sl.employee.fullName);
        }
      }

      if (participants.size === 0) {
        // В процедурном кабинете приёмы без совпадения с медсёстрами не показываем.
        if (groupEmployeeIds) continue;
        push(null, t("list.noSpecialistGroup"), appt);
      } else {
        for (const [id, name] of participants) push(id, name, appt);
      }
    }

    return Array.from(groups.values());
  }, [filteredItems, groupEmployeeIds, t]);

  // Занятость по сотрудникам считаем от ПОЛНОГО списка дня, а не от группы и не
  // от отфильтрованного среза: фильтр меняет то, что показываем, а не то, что
  // занято. Иначе приём, не попавший в группу или скрытый фильтром, не закрывал
  // слот и над ним появлялась плашка «Есть окно на HH:mm».
  const occupancyByEmployee = React.useMemo(() => busyIntervalsByEmployee(items), [items]);

  // ── Build render list per group: sort by time + insert gap slots ──────────
  const groupedItemsWithGaps = React.useMemo(() => {
    const result: {
      employeeId: number | null;
      name: string;
      appts: DjangoAppointment[];
      renderItems: RenderItem[];
    }[] = [];

    rawGroups.forEach(({ employeeId: groupEmployeeId, name: docName, appts }) => {
      const sorted = [...appts].sort((a, b) =>
        dayjs(a.scheduledAt).valueOf() - dayjs(b.scheduledAt).valueOf(),
      );

      if (!onAddSlot) {
        result.push({ employeeId: groupEmployeeId, name: docName, appts: sorted, renderItems: sorted });
        return;
      }

      const renderItems: RenderItem[] = [];
      const addedGapKeys = new Set<string>();

      // Занятые интервалы: приёмы группы ПЛЮС все приёмы этого исполнителя за
      // день (см. slotAvailability.ts) — модель занятости должна совпадать с
      // серверной, а сервер проверяет пересечение по сотруднику, не по группе.
      const activeIntervals = [
        ...busyIntervals(sorted),
        ...(groupEmployeeId != null ? occupancyByEmployee.get(groupEmployeeId) ?? [] : []),
      ];
      const isCoveredByActive = (t: number) => isSlotCovered(activeIntervals, t);

      // Рабочие часы исполнителя группы: окно нельзя предлагать вне смены
      // (например, «Есть окно на 16:00» при графике до 16:00). Если расписание
      // на сотрудника не ведётся (нет активного правила на дату) — не ограничиваем.
      let shiftSegments: { start: string; end: string }[] | null = null;
      if (dayShifts && groupEmployeeId != null && dayShifts.scheduledIds.has(groupEmployeeId)) {
        shiftSegments = dayShifts.segments.get(groupEmployeeId) ?? [];
      }
      const slotInShift = (d: dayjs.Dayjs) => {
        if (!shiftSegments) return true;
        // "HH:mm" сравниваются лексикографически (= хронологически);
        // начало слота должно быть строго раньше конца смены.
        const hm = d.format("HH:mm");
        return shiftSegments.some((s) => hm >= s.start && hm < s.end);
      };

      // Если первый приём начинается позже смены, показать первое доступное
      // окно перед ним. Раньше свободные окна строились только после приёма,
      // поэтому при смене 18:00–23:55 и приёме в 19:00 терялось окно 18:00.
      if (sorted.length > 0) {
        const first = sorted[0];
        const firstStart = dayjs(first.scheduledAt);
        if (firstStart.isAfter(dayjs())) {
          for (const seg of shiftSegments ?? []) {
            if (seg.start >= firstStart.format("HH:mm")) continue;
            const clippedEnd = seg.end < firstStart.format("HH:mm") ? seg.end : firstStart.format("HH:mm");
            const slot = firstFreeSlotInSegment(date ?? firstStart, { start: seg.start, end: clippedEnd });
            if (slot && slot.isBefore(firstStart) && !isCoveredByActive(slot.valueOf())) {
              renderItems.push({
                isGap: true,
                id: `gap-before-${first.id}-${slot.format("HH:mm")}`,
                timeStr: slot.format("HH:mm"),
                dateIso: slot.format("YYYY-MM-DDTHH:mm"),
                employeeId: groupEmployeeId,
              });
            }
          }
        }
      }

      for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const start = dayjs(current.scheduledAt);
        const isCancelled = isCancelledStatus(current.status);

        // Cancelled future appointment → show gap slot before it,
        // если на это время нет активной записи (одна плашка на слот)
        if (isCancelled && start.isAfter(dayjs()) && !isCoveredByActive(start.startOf("minute").valueOf()) && slotInShift(start)) {
          const key = `gap-can-${start.valueOf()}`;
          if (!addedGapKeys.has(key)) {
            addedGapKeys.add(key);
            renderItems.push({
              isGap: true,
              id: key,
              timeStr: start.format("HH:mm"),
              dateIso: start.format("YYYY-MM-DDTHH:mm"),
              employeeId: groupEmployeeId,
            });
          }
        }

        renderItems.push(current);

        if (!isCancelled && i + 1 < sorted.length) {
          const next = sorted[i + 1];
          if (!isCancelledStatus(next.status)) {
            const currentEnd = appointmentEnd(current);
            const gapMs = dayjs(next.scheduledAt).valueOf() - currentEnd.valueOf();
            if (gapMs >= GAP_THRESHOLD_MS && currentEnd.isAfter(dayjs()) && slotInShift(currentEnd)
                && !isCoveredByActive(currentEnd.valueOf())) {
              const key = `gap-${current.id}-${next.id}`;
              renderItems.push({
                isGap: true,
                id: key,
                timeStr: currentEnd.format("HH:mm"),
                dateIso: currentEnd.format("YYYY-MM-DDTHH:mm"),
                employeeId: groupEmployeeId,
              });
            }
          }
        } else if (!isCancelled && i === sorted.length - 1) {
          const currentEnd = appointmentEnd(current);
          if (currentEnd.isAfter(dayjs()) && slotInShift(currentEnd)
              && !isCoveredByActive(currentEnd.valueOf())) {
            renderItems.push({
              isGap: true,
              id: `gap-after-${current.id}`,
              timeStr: currentEnd.format("HH:mm"),
              dateIso: currentEnd.format("YYYY-MM-DDTHH:mm"),
              employeeId: groupEmployeeId,
            });
          }
        }
      }

      if (renderItems.length > 0) {
        result.push({ employeeId: groupEmployeeId, name: docName, appts: sorted, renderItems });
      }
    });

    // ── Свободные смены: сотрудник в графике, записей нет ─────────────────────
    // Раньше такой сотрудник был виден только в ленте аватарок, а по клику
    // показывал «Нет записей» — то есть врач, к которому как раз надо
    // записывать, выглядел как тупик. Показываем его группой с окнами.
    //
    // Под фильтрами и поиском эти группы скрыты: отбирая «Долг» или конкретного
    // пациента, регистратор спрашивает про существующие записи, и пустая смена
    // была бы шумом.
    if (onAddSlot && dayShifts && date && !hasNarrowingFilters) {
      for (const [employeeId, name] of dayShifts.employeeNames) {
        if (groupEmployeeIds && !groupEmployeeIds.has(employeeId)) continue;
        if (selectedDoctorId != null && selectedDoctorId !== employeeId) continue;
        if (result.some((g) => g.employeeId === employeeId)) continue;
        // Сотрудник с приёмами в этом дне — не «свободная смена», даже если его
        // приёмы не собрались в группу (исполнитель только в другой строке
        // услуги, приём другого филиала в выдаче). Раньше такой врач приезжал
        // второй группой с окном на начало смены поверх занятого времени.
        if (occupancyByEmployee.has(employeeId)) continue;

        const slots: RenderItem[] = [];
        // Правило и разовая смена на те же часы дают два одинаковых сегмента —
        // без дедупа это две одинаковые плашки.
        const seenSegments = new Set<string>();
        const employeeIntervals = occupancyByEmployee.get(employeeId) ?? [];
        for (const seg of dayShifts.segments.get(employeeId) ?? []) {
          const segKey = `${seg.start}-${seg.end}`;
          if (seenSegments.has(segKey)) continue;
          seenSegments.add(segKey);
          const slot = firstFreeSlotInSegmentFor(date, seg, employeeIntervals);
          if (!slot) continue;
          slots.push({
            isGap: true,
            id: `shift-${employeeId}-${seg.start}`,
            timeStr: slot.format("HH:mm"),
            dateIso: slot.format("YYYY-MM-DDTHH:mm"),
            employeeId,
          });
        }
        if (slots.length > 0) {
          result.push({ employeeId, name, appts: [], renderItems: slots });
        }
      }
    }

    return result;
  }, [
    rawGroups,
    onAddSlot,
    dayShifts,
    date,
    hasNarrowingFilters,
    groupEmployeeIds,
    selectedDoctorId,
    occupancyByEmployee,
  ]);

  // ── Drag-scroll for doctor strip ──────────────────────────────────────────
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const scrollLeftRef = React.useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeftRef.current = scrollContainerRef.current.scrollLeft;
    scrollContainerRef.current.style.cursor = "grabbing";
    scrollContainerRef.current.style.userSelect = "none";
  };
  const handleMouseLeave = () => {
    isDragging.current = false;
    if (scrollContainerRef.current) scrollContainerRef.current.style.cursor = "grab";
  };
  const handleMouseUp = () => {
    isDragging.current = false;
    if (scrollContainerRef.current) scrollContainerRef.current.style.cursor = "grab";
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollContainerRef.current.scrollLeft = scrollLeftRef.current - (x - startX.current) * 2;
  };

  const groupEntries = groupedItemsWithGaps;

  const chipRow = (
    <AppointmentFilterChips
      statusCounts={statusCounts}
      selectedStatuses={selectedStatuses}
      onToggleStatus={toggleStatus}
      paymentCounts={showPaymentFilter ? paymentCounts : undefined}
      selectedPayments={selectedPayments}
      onTogglePayment={showPaymentFilter ? togglePayment : undefined}
      onReset={resetChipFilters}
    />
  );

  return (
    <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* ── Header: заголовок + doctor story strip ── */}
      <CardHeader
        sx={{
          pb: 1.5,
          "& .MuiCardHeader-content": { minWidth: 0 },
          "& .MuiCardHeader-action": { alignSelf: "flex-start", mt: 0.5 },
        }}
        title={
          <Stack direction="column" gap={2} sx={{ width: "100%" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
              <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
                {t("list.title", { date: titleDate })}
              </Typography>
              {/* Сколько записей скрыто фильтрами: без этой строки отобранный
                  день выглядит как «сегодня почти никого нет». */}
              {showFilteredCount && isFiltered && (
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {t("registry.filteredCount", {
                    shown: filteredItems.length,
                    total: items.length,
                  })}
                </Typography>
              )}
            </Stack>

            {!hideDoctorStrip && availableDoctors.length > 0 && (
              <Box
                ref={scrollContainerRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                sx={{
                  display: "flex",
                  overflowX: "auto",
                  scrollbarWidth: "none",
                  "&::-webkit-scrollbar": { display: "none" },
                  gap: "12px",
                  cursor: "grab",
                  userSelect: "none",
                  pb: 0.5,
                  px: 2,
                  mx: -2,
                }}
              >
                {/* "Все" bubble */}
                <Stack
                  spacing={0.25}
                  alignItems="center"
                  onClick={() => setSelectedDoctorId(null)}
                  sx={{ cursor: "pointer", minWidth: 56 }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      border:
                        selectedDoctorId === null
                          ? `3px solid ${theme.palette.primary.main}`
                          : `1.5px solid ${theme.palette.divider}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: selectedDoctorId === null ? "primary.main" : "transparent",
                      color: selectedDoctorId === null ? "primary.contrastText" : "text.secondary",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {t("filters.all")}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: selectedDoctorId === null ? 700 : 500, fontSize: "0.75rem" }}
                  >
                    {t("filters.all")}
                  </Typography>
                </Stack>

                {availableDoctors.map((doc) => (
                  <DoctorStoryItem
                    key={doc.id}
                    name={doc.name}
                    nickname={doc.nickname}
                    photoUrl={doc.photoUrl ?? undefined}
                    isActive={selectedDoctorId === doc.id}
                    dimmed={doc.apptCount === 0}
                    onClick={() =>
                      setSelectedDoctorId(selectedDoctorId === doc.id ? null : doc.id)
                    }
                  />
                ))}
                <Box sx={{ minWidth: 16, flexShrink: 0 }} />
              </Box>
            )}

            {/* Фильтр специалиста переживает смену даты (он в URL), поэтому в
                другом дне он может указывать на того, кто в этот день не
                работает: без подсказки это выглядит как пустой день. */}
            {!hideDoctorStrip && doctorHasNoShift && (
              <Alert
                severity="warning"
                sx={{
                  mt: -1,
                  py: 0,
                  alignItems: "center",
                  "& .MuiAlert-message": { py: 0.75 },
                }}
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => setSelectedDoctorId(null)}
                    sx={{ whiteSpace: "nowrap", textTransform: "none" }}
                  >
                    {t("list.chooseAnotherDoctor")}
                  </Button>
                }
              >
                {t("list.doctorNotInDay", {
                  doctorName: selectedDoctorName ?? t("list.selectedDoctor"),
                })}
              </Alert>
            )}

            {/* Фильтры «ход визита | деньги». На телефоне ряд чипов не влезает
                рядом с лентой исполнителей — там вместо него кнопка, а сами
                чипы переезжают в лист снизу. */}
            {isMobile ? (
              <Box sx={{ mt: -1 }}>
                <Badge badgeContent={activeChipCount} color="primary">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<FilterListOutlined fontSize="small" />}
                    onClick={() => setFilterSheetOpen(true)}
                    sx={{ textTransform: "none" }}
                  >
                    {t("filters.button")}
                  </Button>
                </Badge>
              </Box>
            ) : (
              <Box sx={{ mt: -1 }}>{chipRow}</Box>
            )}
          </Stack>
        }
      />

      <Divider />
      {loading && <LinearProgress sx={{ height: 2, mt: "-2px" }} />}

      {/* ── Content ── */}
      <CardContent
        sx={{
          p: 0,
          "&:last-child": { pb: 0 },
          flex: 1,
          overflowY: "auto",
          msOverflowStyle: "none",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {error ? (
          <Typography sx={{ p: 2 }} variant="body2" color="error">
            {t("list.errorPrefix", { message: error })}
          </Typography>
        ) : groupEntries.length === 0 ? (
          <Typography
            sx={{ p: 2, color: loading ? "text.disabled" : "text.primary" }}
            variant="body2"
          >
            {loading ? t("list.loading") : t("list.empty")}
          </Typography>
        ) : (
          <Stack spacing={0}>
            {groupEntries.map(({ employeeId: groupEmployeeId, name: docName, appts, renderItems: groupItems }) => {
              const apptCount = groupItems.filter((i) => !isGap(i)).length;
              // Деньги группы — по строкам услуг этого исполнителя (см.
              // employeeMoneyTotals): чек совместного приёма иначе попал бы в
              // обе группы целиком.
              const money = showGroupTotals ? employeeMoneyTotals(appts, groupEmployeeId) : null;
              return (
                <Box key={groupEmployeeId ?? "__no_specialist__"}>
                  {/* ── Group header: имя врача + каунтер + деньги ── */}
                  <Box
                    sx={{
                      px: 2,
                      py: 1,
                      bgcolor: "action.selected",
                      borderTop: "1px solid",
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                      <Typography variant="subtitle2" fontWeight="bold" noWrap>
                        {docName}
                      </Typography>
                      {/* В чипе — деньги, а не счётчик приёмов: регистратуре
                          важнее видеть кассу по специалисту. Количество ушло в
                          тултип, чтобы не потерялось. Только оплаченные деньги:
                          начисленную сумму не показываем — она смешивала
                          выставленные счета с реально полученными. */}
                      <Tooltip
                        title={
                          apptCount === 0
                            ? t("list.onShiftNoBookings")
                            : t("list.count", { count: apptCount })
                        }
                      >
                        <Chip
                          // Группа свободной смены: «0 сом» читается как провал
                          // дня, а смысл обратный — время свободно.
                          label={
                            apptCount === 0
                              ? t("list.onShiftNoBookings")
                              : money != null
                                ? formatKGS(Math.round(money.paid))
                                : t("list.count", { count: apptCount })
                          }
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700, bgcolor: "background.paper", flexShrink: 0 }}
                        />
                      </Tooltip>
                    </Stack>
                  </Box>

                  {/* ── Строки приёмов / gap-слоты ── */}
                  <Box>
                    {groupItems.map((item) => {
                      if (isGap(item)) {
                        return (
                          <AddSlotButton
                            key={item.id}
                            timeStr={item.timeStr}
                            onClick={() => onAddSlot?.(item.dateIso, item.employeeId)}
                          />
                        );
                      }

                      // ── Строка приёма — 1-в-1 с оригиналом AppointmentsList ──
                      const a = item as DjangoAppointment;
                      const isSelected = selectedId === a.id;

                      // totalAmount с бэка — сумма ДО скидки. Пациент платит
                      // разницу, поэтому в «Итого» показываем её, а исходную
                      // сумму — зачёркнутой рядом.
                      const totalAmount = Number(a.totalAmount ?? 0);
                      const discountAmount = Number(a.discountAmount ?? 0);
                      const discountPercent = discountPercentOf(totalAmount, discountAmount);
                      const payableAmount = Math.max(0, totalAmount - discountAmount);
                      const priceChange = appointmentPriceChangeSummary(a);
                      const previousPayableAmount = priceChange
                        ? Math.max(0, priceChange.previousTotal - discountAmount)
                        : null;
                      // Бэк не отдаёт hasMedicalConclusion — выводим наличие
                      // заключения из строк услуг (conclusionState/conclusionId).
                      const hasConclusion = (a.services ?? []).some(
                        (sl) =>
                          sl.conclusionId != null ||
                          sl.conclusionState === "draft" ||
                          sl.conclusionState === "completed",
                      );

                      return (
                        <Box
                          key={a.id}
                          onClick={() => onSelect(a)}
                          sx={{
                            px: 2,
                            py: 1.25,
                            cursor: "pointer",
                            bgcolor: isSelected
                              ? alpha(theme.palette.primary.main, 0.08)
                              : "transparent",
                            borderLeft: isSelected
                              ? `3px solid ${theme.palette.primary.main}`
                              : "3px solid transparent",
                            borderBottom: "1px solid",
                            borderColor: "divider",
                            "&:last-child": { borderBottom: "none" },
                            "&:hover": { bgcolor: (t) => t.palette.action.hover },
                            transition: "background 150ms",
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
                            {/* Left: время + пациент */}
                            <Stack>
                              <Stack direction="row" alignItems="center" gap={0.5}>
                                {a.isNight && (
                                  <Tooltip title={t("list.night")}>
                                    <NightlightOutlined color="action" fontSize="small" />
                                  </Tooltip>
                                )}
                                <Typography variant="subtitle2">
                                  {dayjs(a.scheduledAt).format("HH:mm")}
                                </Typography>
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                {t("list.patientLabel")} {a.patient?.fullName ?? "—"}
                              </Typography>
                              {a.patient?.phone && (
                                <Typography
                                  variant="caption"
                                  color="text.disabled"
                                  sx={{ fontVariantNumeric: "tabular-nums" }}
                                >
                                  {formatPhoneDisplay(a.patient.phone)}
                                </Typography>
                              )}
                            </Stack>

                            {/* Right: чипы статуса + иконки оплаты + сумма */}
                            <Stack alignItems="flex-end">
                              <Stack direction="row" alignItems="center" gap={1}>
                                {/* Статус приёма + деньги (оплата / долг / скидка /
                                    страховка) — общий компонент. Та же логика
                                    применяется в истории пациента и карточках
                                    врача/пациента: иначе оплаченный приём
                                    выглядел там как «Ожидаем», и врач с
                                    регистратором видели по одному приёму разное.
                                    Факт оплаты — операционный статус, виден всем
                                    ролям (врачу важно знать, закрыт ли чек);
                                    финансовые действия остаются под правами. */}
                                <AppointmentStatusChips appointment={a} />

                                {/* Иконка принтера = есть заключение (приём
                                    фактически завершён врачом). Род термина
                                    меняется по вертикали: «Заключение готово»
                                    / «Отчёт готов» — отсюда agree(). */}
                                {hasConclusion && (
                                  <Tooltip
                                    title={`${t("list.conclusionSubject")} ${agree(
                                      term.conclusion.gender,
                                      ["готов", "готова", "готово"],
                                    )}`}
                                  >
                                    <PrintOutlinedIcon
                                      sx={{ fontSize: 20, color: "action.active", opacity: 0.8 }}
                                    />
                                  </Tooltip>
                                )}

                                {/* По одной иконке на тип: канал, статус и время
                                    берём из фактического лога отправки. */}
                                {notificationsMap?.has(a.id) &&
                                  [...notificationsMap.get(a.id)!.entries()].map(([notifType, notification]) => {
                                    const cfg = NOTIF_CONFIG[notifType] ?? {
                                      Icon: SmsOutlined,
                                      color: "success.main",
                                    };
                                    const label = t(`notifications.${notifType}`, {
                                      defaultValue: notifType,
                                    });
                                    const time = notification.sentAt
                                      ? dayjs(notification.sentAt).format("DD.MM HH:mm")
                                      : "";
                                    const channel = notification.channel === "whatsapp" ? "WhatsApp" : "SMS";
                                    const successful = ["queued", "sent", "delivered"].includes(notification.status);
                                    const color = notification.status === "failed"
                                      ? "error.main"
                                      : notification.status === "cancelled"
                                        ? "text.disabled"
                                        : cfg.color;
                                    return (
                                      <Tooltip
                                        key={notifType}
                                        title={`${channel}: ${label} · ${notification.status}${time ? ` · ${time}` : ""}`}
                                      >
                                        <cfg.Icon sx={{ fontSize: 16, color, opacity: successful ? 0.9 : 0.55 }} />
                                      </Tooltip>
                                    );
                                  })}
                              </Stack>

                              {priceChange && (
                                <Tooltip
                                  title={t("list.priceChangedTooltip", {
                                    service: priceChange.serviceName ?? t("details.service"),
                                    oldPrice: formatKGS(priceChange.oldUnitPrice),
                                    newPrice: formatKGS(priceChange.newUnitPrice),
                                  })}
                                >
                                  <Stack
                                    direction="row"
                                    alignItems="center"
                                    gap={0.4}
                                    sx={{ mt: 0.5, color: "warning.dark" }}
                                  >
                                    <PriceChangeOutlined sx={{ fontSize: 15 }} />
                                    <Typography variant="caption" fontWeight={700}>
                                      {t("list.priceChanged")}
                                    </Typography>
                                  </Stack>
                                </Tooltip>
                              )}

                              {/* Итого — стоимость услуг, не финансовая операция,
                                  поэтому видна всем (в т.ч. врачу без прав на
                                  финансы), как в оригинале. */}
                              {(totalAmount > 0 || previousPayableAmount != null) && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ mt: priceChange ? 0.125 : 0.5 }}
                                >
                                  {t("list.total")}{" "}
                                  {/* При скидке «Итого» — это то, что человек
                                      платит по кассе; сумма до скидки остаётся
                                      рядом зачёркнутой, иначе непонятно, от чего
                                      считался процент. Скидка процентом: у
                                      оплаченного приёма чипа скидки нет (там
                                      «Оплачено»), и эта строка — единственное
                                      место, где дисконт виден. */}
                                  {(previousPayableAmount != null || discountPercent != null) && (
                                    <Box
                                      component="span"
                                      sx={{ textDecoration: "line-through", opacity: 0.6, mr: 0.5 }}
                                    >
                                      {formatKGS(previousPayableAmount ?? totalAmount)}
                                    </Box>
                                  )}
                                  {formatKGS(discountPercent != null ? payableAmount : totalAmount)}
                                  {discountPercent != null &&
                                    t("list.discountPercentSuffix", { percent: discountPercent })}
                                </Typography>
                              )}


                            </Stack>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        )}
      </CardContent>

      {/* Мобильный лист фильтров: те же чипы, что в шапке на десктопе. */}
      <AppBottomSheet open={isMobile && filterSheetOpen} onClose={() => setFilterSheetOpen(false)}>
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
            {t("filters.button")}
          </Typography>
          <AppointmentFilterChips
            statusCounts={statusCounts}
            selectedStatuses={selectedStatuses}
            onToggleStatus={toggleStatus}
            paymentCounts={showPaymentFilter ? paymentCounts : undefined}
            selectedPayments={selectedPayments}
            onTogglePayment={showPaymentFilter ? togglePayment : undefined}
            onReset={resetChipFilters}
            wrap
          />
        </Box>
      </AppBottomSheet>
    </Card>
  );
});

export default AppointmentListPanel;
