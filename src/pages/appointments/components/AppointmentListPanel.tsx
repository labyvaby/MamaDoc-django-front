import React from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
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
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import dayjs from "dayjs";

import type { AppointmentNotificationItem, DjangoAppointment } from "../../../api/appointments";
import {
  appointmentEnd,
  busyIntervals,
  busyIntervalsByEmployee,
  isCancelledStatus,
  isSlotCovered,
} from "./slotAvailability";
import { subtleBg } from "../../../theme";
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
  appointmentMoneyFlags,
  appointmentPriceChangeSummary,
  employeeMoneyTotals,
  firstFreeSlotInSegmentFor,
  firstFreeSlotAtOrAfter,
  matchesAppointmentSearch,
  matchesCancelReasons,
  matchesMoneyFlags,
  type AppointmentMoneyFlag,
} from "./listFilters";
import { buildListRows, isGap, type RenderItem } from "./listRows";
import { isAppointmentCancelReason, type AppointmentCancelReason } from "../../../api/appointments";
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
  /** Ось скидок и правок цены — так же управляемая страницей (URL) или своя. */
  moneyFlagFilter?: AppointmentMoneyFlag[];
  onMoneyFlagFilterChange?: (values: AppointmentMoneyFlag[]) => void;
  /**
   * Ось причины отмены — видна только у отменённых приёмов; та же управляемая
   * схема, что у остальных осей. См. matchesCancelReasons.
   */
  reasonFilter?: AppointmentCancelReason[];
  onReasonFilterChange?: (values: AppointmentCancelReason[]) => void;
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
   * Телефон: лента сообщает странице, куда поехал скролл, чтобы та спрятала
   * свою шапку (даты, поиск, кнопки) при движении вниз и вернула при движении
   * вверх. До первой записи на телефоне уходило больше трети экрана.
   */
  onScrollDirection?: (goingDown: boolean) => void;
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
   * Телефонный размер: аватар меньше и подпись в одну строку. Лента из 48px
   * аватаров с двухстрочными подписями занимала 74px высоты — столько же, сколько
   * запись приёма.
   */
  compact?: boolean;
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
  compact = false,
}) => {
  const bubbleSize = compact ? 40 : 48;
  const cellWidth = compact ? 54 : 64;
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
        // Ширина ячейки фиксирована: подпись шире пузыря наезжала на соседний
        // аватар (ячейка 56 против maxWidth 72 у текста).
        width: cellWidth,
        flexShrink: 0,
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
          width: bubbleSize,
          height: bubbleSize,
          borderRadius: "50%",
          padding: compact ? "2px" : "3px",
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
          fontSize: compact ? "0.65rem" : "0.75rem",
          lineHeight: 1.2,
          textAlign: "center",
          width: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          // На телефоне подпись в одну строку (вторая стоила 14px на всю
          // ленту), но не через line-clamp: он режет строку по высоте кегля и
          // срезал хвосты у «у», «р», «д». Обычный nowrap этого не делает.
          ...(compact
            ? { whiteSpace: "nowrap" }
            : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }),
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

// ─── NowLine — линия текущего времени в ленте дня ────────────────────────────
//
// Рисуется только в сегодняшнем дне и только перед первым НЕ начавшимся
// элементом каждого специалиста — приёмом или окном (см. buildListRows): у
// каждого свой ход дня. Красный — привычный цвет «сейчас» в календарях; со
// статусными чипами не путается, потому что это линия, а не чип.
// Ref — для подскролла к текущему моменту при открытии дня.

const NowLine = React.forwardRef<HTMLDivElement, { label: string }>(({ label }, ref) => (
  <Stack ref={ref} direction="row" alignItems="center" gap={1} sx={{ px: 2, py: 0.75 }}>
    <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "error.main", flexShrink: 0 }} />
    <Typography variant="caption" sx={{ color: "error.main", fontWeight: 700, whiteSpace: "nowrap" }}>
      {label}
    </Typography>
    <Box sx={{ flex: 1, height: "1px", bgcolor: "error.main", opacity: 0.45 }} />
  </Stack>
));
NowLine.displayName = "NowLine";

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

// ─── GapRun — подряд идущие свободные окна одной строкой ─────────────────────
//
// На телефоне каждая пунктирная кнопка «Есть окно на 10:30» занимала 44px, и
// день с шестью окнами состоял в основном из них. Тот же смысл — одна строка с
// временами; тап по времени открывает ту же форму записи.

const GapRun: React.FC<{
  label: string;
  times: string[];
  onPick: (index: number) => void;
}> = ({ label, times, onPick }) => (
  <Stack
    direction="row"
    alignItems="center"
    gap={0.75}
    useFlexGap
    sx={{ px: 2, py: 0.75, flexWrap: "wrap" }}
  >
    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
      {label}
    </Typography>
    {times.map((time, index) => (
      <Chip
        key={time}
        label={time}
        size="small"
        variant="outlined"
        clickable
        onClick={() => onPick(index)}
        icon={<AddCircleOutline sx={{ fontSize: 13 }} />}
        sx={{
          height: 24,
          fontWeight: 600,
          borderStyle: "dashed",
          borderColor: "primary.main",
          color: "primary.onSurface",
          "& .MuiChip-icon": { ml: 0.5, mr: -0.25, color: "primary.main" },
        }}
      />
    ))}
  </Stack>
);

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
  moneyFlagFilter,
  onMoneyFlagFilterChange,
  reasonFilter,
  onReasonFilterChange,
  onResetChipFilters,
  showPaymentFilter = false,
  showGroupTotals = false,
  showFilteredCount = true,
  groupEmployeeIds = null,
  dayShifts = null,
  onScrollDirection,
}) => {
  const { t, term } = useT("appointments");
  const theme = useTheme();
  // Границу «телефон/десктоп» ставим по md: в теме проекта sm = 360, и телефон
  // в него попадает (см. theme.ts).
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const titleDate = date ? date.format("DD.MM.YYYY") : "";

  // ── Маркер «сейчас» ───────────────────────────────────────────────────────
  // День длинный, и при 40 записях регистратор каждый раз искал текущий час
  // скроллом. Линия времени рисуется только в сегодняшнем дне и тикает раз в
  // минуту (списки обновляет поллинг, но он не двигает саму линию).
  const isToday = date ? date.isSame(dayjs(), "day") : false;
  const [nowTs, setNowTs] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!isToday) return;
    setNowTs(Date.now());
    const timer = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [isToday, titleDate]);

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
    return Array.from(map.values()).sort((a, b) => {
      // В регистратуре сначала показываем врачей, у которых уже есть приёмы
      // на выбранную дату; остальные остаются в быстром фильтре ниже.
      const aHasAppointments = a.apptCount > 0 ? 1 : 0;
      const bHasAppointments = b.apptCount > 0 ? 1 : 0;
      return (
        bHasAppointments - aHasAppointments ||
        a.name.localeCompare(b.name, "ru")
      );
    });
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

  const isMoneyControlled = moneyFlagFilter !== undefined;
  const [internalMoneyFlags, setInternalMoneyFlags] = React.useState<AppointmentMoneyFlag[]>([]);
  const selectedMoneyFlags = isMoneyControlled ? moneyFlagFilter : internalMoneyFlags;
  const setSelectedMoneyFlags = React.useCallback(
    (values: AppointmentMoneyFlag[]) => {
      if (!isMoneyControlled) setInternalMoneyFlags(values);
      onMoneyFlagFilterChange?.(values);
    },
    [isMoneyControlled, onMoneyFlagFilterChange],
  );

  const isReasonControlled = reasonFilter !== undefined;
  const [internalReasons, setInternalReasons] = React.useState<AppointmentCancelReason[]>([]);
  const selectedReasons = isReasonControlled ? reasonFilter : internalReasons;
  const setSelectedReasons = React.useCallback(
    (values: AppointmentCancelReason[]) => {
      if (!isReasonControlled) setInternalReasons(values);
      onReasonFilterChange?.(values);
    },
    [isReasonControlled, onReasonFilterChange],
  );

  React.useEffect(() => {
    if (!isStatusControlled) setInternalStatuses([]);
    if (!isPaymentControlled) setInternalPayments([]);
    if (!isMoneyControlled) setInternalMoneyFlags([]);
    if (!isReasonControlled) setInternalReasons([]);
  }, [titleDate, isStatusControlled, isPaymentControlled, isMoneyControlled, isReasonControlled]);

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

  // Счётчики оси цены: приём попадает в несколько чипов сразу (скидка + правка
  // цены — обычная пара), поэтому сумма счётчиков больше числа записей дня.
  const moneyCounts = React.useMemo(() => {
    const counts = new Map<AppointmentMoneyFlag, number>();
    for (const appt of doctorScopedItems) {
      for (const flag of appointmentMoneyFlags(appt)) {
        counts.set(flag, (counts.get(flag) ?? 0) + 1);
      }
    }
    return counts;
  }, [doctorScopedItems]);

  const reasonCounts = React.useMemo(() => {
    const counts = new Map<AppointmentCancelReason, number>();
    for (const appt of doctorScopedItems) {
      if (appt.status !== "canceled" || !isAppointmentCancelReason(appt.cancelReason)) continue;
      counts.set(appt.cancelReason, (counts.get(appt.cancelReason) ?? 0) + 1);
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
    // Оси между собой складываются через И: «Долг» + «Со скидкой» — это
    // недоплаченные чеки со скидкой, а не их объединение.
    if (selectedMoneyFlags.length > 0) {
      list = list.filter((appt) => matchesMoneyFlags(appt, selectedMoneyFlags));
    }
    if (selectedReasons.length > 0) {
      list = list.filter((appt) => matchesCancelReasons(appt, selectedReasons));
    }
    return list;
  }, [
    doctorScopedItems,
    selectedStatuses,
    selectedPayments,
    selectedMoneyFlags,
    selectedReasons,
  ]);

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

  const toggleMoneyFlag = React.useCallback(
    (value: AppointmentMoneyFlag) =>
      setSelectedMoneyFlags(
        selectedMoneyFlags.includes(value)
          ? selectedMoneyFlags.filter((v) => v !== value)
          : [...selectedMoneyFlags, value],
      ),
    [selectedMoneyFlags, setSelectedMoneyFlags],
  );

  const toggleReason = React.useCallback(
    (value: AppointmentCancelReason) =>
      setSelectedReasons(
        selectedReasons.includes(value)
          ? selectedReasons.filter((v) => v !== value)
          : [...selectedReasons, value],
      ),
    [selectedReasons, setSelectedReasons],
  );

  const resetChipFilters = React.useCallback(() => {
    if (onResetChipFilters) {
      if (!isStatusControlled) setInternalStatuses([]);
      if (!isPaymentControlled) setInternalPayments([]);
      if (!isMoneyControlled) setInternalMoneyFlags([]);
      if (!isReasonControlled) setInternalReasons([]);
      onResetChipFilters();
      return;
    }
    setSelectedStatuses([]);
    setSelectedPayments([]);
    setSelectedMoneyFlags([]);
    setSelectedReasons([]);
  }, [
    onResetChipFilters,
    isStatusControlled,
    isPaymentControlled,
    isMoneyControlled,
    isReasonControlled,
    setSelectedStatuses,
    setSelectedPayments,
    setSelectedMoneyFlags,
    setSelectedReasons,
  ]);

  // Сколько записей дня скрыто фильтрами. Без этой строки отфильтрованный
  // список выглядит как «в этот день почти никого нет».
  const activeChipCount =
    selectedStatuses.length +
    selectedPayments.length +
    selectedMoneyFlags.length +
    selectedReasons.length;
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

    // Отменённые и неявки уводим в конец группы: активные записи и свободные
    // окна остаются вверху в хронологии, а строки, по которым делать нечего,
    // не разрывают ленту. Между собой сохраняют порядок из renderItems
    // (хронологический). Свободное окно, освободившееся из-за отмены, остаётся
    // на своём времени — вниз уезжает только карточка отменённого приёма.
    const cancelledToBottom = (list: RenderItem[]): RenderItem[] => {
      const head: RenderItem[] = [];
      const tail: RenderItem[] = [];
      for (const it of list) {
        if (!isGap(it) && isCancelledStatus(it.status)) tail.push(it);
        else head.push(it);
      }
      return tail.length > 0 ? [...head, ...tail] : list;
    };

    rawGroups.forEach(({ employeeId: groupEmployeeId, name: docName, appts }) => {
      const sorted = [...appts].sort((a, b) =>
        dayjs(a.scheduledAt).valueOf() - dayjs(b.scheduledAt).valueOf(),
      );

      if (!onAddSlot) {
        result.push({
          employeeId: groupEmployeeId,
          name: docName,
          appts: sorted,
          renderItems: cancelledToBottom(sorted),
        });
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
            const slot = firstFreeSlotInSegmentFor(
              date ?? firstStart,
              { start: seg.start, end: clippedEnd },
              activeIntervals,
            );
            if (slot && slot.isBefore(firstStart)) {
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
            if (gapMs >= GAP_THRESHOLD_MS && currentEnd.isAfter(dayjs()) && slotInShift(currentEnd)) {
              const nextStart = dayjs(next.scheduledAt);
              const shiftSegment = shiftSegments?.find((s) => {
                const currentHm = currentEnd.format("HH:mm");
                return currentHm >= s.start && currentHm < s.end;
              });
              const gapSlot = shiftSegment
                ? firstFreeSlotAtOrAfter(
                    date ?? currentEnd,
                    shiftSegment,
                    activeIntervals,
                    currentEnd,
                    nextStart,
                  )
                : firstFreeSlotAtOrAfter(
                    date ?? currentEnd,
                    { start: currentEnd.format("HH:mm"), end: nextStart.format("HH:mm") },
                    activeIntervals,
                    currentEnd,
                    nextStart,
                  );
              if (!gapSlot) continue;
              const key = `gap-${current.id}-${next.id}`;
              renderItems.push({
                isGap: true,
                id: key,
                timeStr: gapSlot.format("HH:mm"),
                dateIso: gapSlot.format("YYYY-MM-DDTHH:mm"),
                employeeId: groupEmployeeId,
              });
            }
          }
        } else if (!isCancelled && i === sorted.length - 1) {
          const currentEnd = appointmentEnd(current);
          if (currentEnd.isAfter(dayjs()) && slotInShift(currentEnd)) {
            const shiftSegment = shiftSegments?.find((s) => {
              const currentHm = currentEnd.format("HH:mm");
              return currentHm >= s.start && currentHm < s.end;
            });
            const gapSlot = shiftSegment
              ? firstFreeSlotAtOrAfter(
                  date ?? currentEnd,
                  shiftSegment,
                  activeIntervals,
                  currentEnd,
                )
              : firstFreeSlotAtOrAfter(
                  date ?? currentEnd,
                  {
                    start: currentEnd.format("HH:mm"),
                    end: currentEnd.add(30, "minute").format("HH:mm"),
                  },
                  activeIntervals,
                  currentEnd,
                );
            if (!gapSlot) continue;
            renderItems.push({
              isGap: true,
              id: `gap-after-${current.id}`,
              timeStr: gapSlot.format("HH:mm"),
              dateIso: gapSlot.format("YYYY-MM-DDTHH:mm"),
              employeeId: groupEmployeeId,
            });
          }
        }
      }

      if (renderItems.length > 0) {
        result.push({
          employeeId: groupEmployeeId,
          name: docName,
          appts: sorted,
          renderItems: cancelledToBottom(renderItems),
        });
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

  const allGroupEntries = groupedItemsWithGaps;

  // Специалист на смене, но без записей, стоил на телефоне 84px (шапка группы
  // плюс плашка окна) — при этом ничего не сообщал. Такие группы прячем за одну
  // строку; при активном фильтре специалиста не прячем ничего, иначе экран
  // оказался бы пустым.
  const [freeGroupsOpen, setFreeGroupsOpen] = React.useState(false);
  // Раскрытие живёт в пределах дня: открыв другую дату, регистратор снова
  // начинает с тех, у кого есть записи.
  React.useEffect(() => {
    setFreeGroupsOpen(false);
  }, [titleDate]);
  const collapseFreeGroups =
    isMobile && selectedDoctorId == null && allGroupEntries.some((g) => g.appts.length > 0);
  const freeGroupEntries = React.useMemo(
    () => (collapseFreeGroups ? allGroupEntries.filter((g) => g.appts.length === 0) : []),
    [allGroupEntries, collapseFreeGroups],
  );
  // Раскрытые свободные смены идут в конец, а не на свои места в общем
  // порядке: строка-переключатель стоит внизу ленты, и вставка групп выше неё
  // выглядела бы как «нажал, и ничего не произошло».
  const groupEntries = React.useMemo(() => {
    if (!collapseFreeGroups) return allGroupEntries;
    const withAppts = allGroupEntries.filter((g) => g.appts.length > 0);
    return freeGroupsOpen ? [...withAppts, ...freeGroupEntries] : withAppts;
  }, [allGroupEntries, collapseFreeGroups, freeGroupEntries, freeGroupsOpen]);

  // Ближайший приём, который ещё не начался: к линии «сейчас» в его группе
  // подскроллим ленту при открытии сегодняшнего дня. Прошедшие приёмы остаются
  // выше — регистратуре нужен и вопрос «кто был только что». Именно приём, а
  // не окно: свободные смены стоят в конце ленты, и окно 08:00 у врача без
  // записей увезло бы ленту мимо всех реальных приёмов.
  const nowAnchorApptId = React.useMemo(() => {
    if (!isToday) return null;
    let best: { id: number; ts: number } | null = null;
    for (const group of groupEntries) {
      for (const item of group.renderItems) {
        if (isGap(item)) continue;
        // Отменённые уехали в конец группы — «ближайшим» их считать нельзя,
        // иначе автоскролл прыгнет к отменённой строке внизу ленты.
        if (isCancelledStatus(item.status)) continue;
        const ts = dayjs(item.scheduledAt).valueOf();
        if (ts < nowTs) continue;
        if (!best || ts < best.ts) best = { id: item.id, ts };
      }
    }
    return best?.id ?? null;
  }, [groupEntries, isToday, nowTs]);

  // Шапку страницы прячем по направлению скролла, с порогом: без него лента
  // дёргалась бы на каждый пиксель инерции.
  const lastScrollTopRef = React.useRef(0);
  const handleListScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!onScrollDirection) return;
      const top = event.currentTarget.scrollTop;
      const delta = top - lastScrollTopRef.current;
      if (Math.abs(delta) < 12) return;
      lastScrollTopRef.current = top;
      // У самого верха шапка всегда видна: иначе она не вернётся, если человек
      // остановил инерцию на первой записи.
      onScrollDirection(delta > 0 && top > 24);
    },
    [onScrollDirection],
  );

  const listScrollRef = React.useRef<HTMLDivElement>(null);
  const nowAnchorRef = React.useRef<HTMLDivElement>(null);
  const autoScrolledDateRef = React.useRef<string | null>(null);

  // Новый день читают с начала: без сброса лента оставалась там, где её
  // бросили в прошлом дне, и открывалась с середины чужого списка.
  React.useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    lastScrollTopRef.current = 0;
  }, [titleDate]);

  React.useEffect(() => {
    if (!isToday || nowAnchorApptId == null) return;
    // Один подскролл на открытый день: дальше лента слушается пользователя, а
    // не прыгает каждую минуту, когда ближайший приём сменился.
    if (autoScrolledDateRef.current === titleDate) return;
    const container = listScrollRef.current;
    const anchor = nowAnchorRef.current;
    if (!container || !anchor) return;
    autoScrolledDateRef.current = titleDate;
    const delta = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;
    // Якорь — сама линия «сейчас»: между ней и ближайшим приёмом может стоять
    // окно, и якорь на приёме увозил бы линию под липкую шапку группы. Отступ
    // оставляет над линией шапку и краешек только что закончившегося приёма.
    const target = Math.max(0, container.scrollTop + delta - 96);
    container.scrollTo({ top: target, behavior: "auto" });
    // Свой же подскролл выглядит для обработчика как рывок пальцем вниз и
    // прятал шапку сразу при открытии дня — считаем его новой точкой отсчёта.
    lastScrollTopRef.current = target;
  }, [isToday, nowAnchorApptId, titleDate]);

  // Лента исполнителей: на телефоне она делит ряд с кнопкой фильтров —
  // отдельная строка под кнопку стоила 40px, а фильтр и выбор специалиста
  // всё равно нажимают подряд.
  const doctorStrip = !hideDoctorStrip && availableDoctors.length > 0 ? (
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
                gap: isMobile ? "10px" : "12px",
                cursor: "grab",
                userSelect: "none",
                pb: isMobile ? 0 : 0.5,
                ...(isMobile ? { flex: 1, minWidth: 0 } : { px: 2, mx: -2 }),
              }}
            >
              {/* "Все" bubble */}
              <Stack
                spacing={0.25}
                alignItems="center"
                onClick={() => setSelectedDoctorId(null)}
                sx={{ cursor: "pointer", width: isMobile ? 54 : 64, flexShrink: 0 }}
              >
                <Box
                  sx={{
                    width: isMobile ? 40 : 48,
                    height: isMobile ? 40 : 48,
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
                  sx={{
                    fontWeight: selectedDoctorId === null ? 700 : 500,
                    fontSize: isMobile ? "0.65rem" : "0.75rem",
                  }}
                >
                  {t("filters.all")}
                </Typography>
              </Stack>

              {availableDoctors.map((doc) => (
                <DoctorStoryItem
                  key={doc.id}
                  compact={isMobile}
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
  ) : null;

  const chipRow = (
    <AppointmentFilterChips
      statusCounts={statusCounts}
      selectedStatuses={selectedStatuses}
      onToggleStatus={toggleStatus}
      paymentCounts={showPaymentFilter ? paymentCounts : undefined}
      selectedPayments={selectedPayments}
      onTogglePayment={showPaymentFilter ? togglePayment : undefined}
      moneyCounts={showPaymentFilter ? moneyCounts : undefined}
      selectedMoneyFlags={selectedMoneyFlags}
      onToggleMoneyFlag={showPaymentFilter ? toggleMoneyFlag : undefined}
      reasonCounts={reasonCounts}
      selectedReasons={selectedReasons}
      onToggleReason={toggleReason}
      onReset={resetChipFilters}
    />
  );

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        // На телефоне карточка со скруглениями и рамкой съедала полосу по краям
        // экрана: список идёт во всю ширину, как в мобильных приложениях.
        ...(isMobile ? { border: "none", borderRadius: 0 } : {}),
      }}
    >
      {/* ── Header: заголовок + doctor story strip ── */}
      <CardHeader
        sx={{
          pb: isMobile ? 1 : 1.5,
          pt: isMobile ? 1.5 : undefined,
          "& .MuiCardHeader-content": { minWidth: 0 },
          "& .MuiCardHeader-action": { alignSelf: "flex-start", mt: 0.5 },
        }}
        title={
          <Stack direction="column" gap={isMobile ? 1.25 : 2} sx={{ width: "100%" }}>
            {/* Заголовок «Приёмы (дата)» на телефоне дублирует выбранный день из
                ленты дат и стоил целой строки экрана — там его нет, а счётчик
                отфильтрованных уезжает в ряд с кнопкой фильтров. */}
            {!isMobile && (
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
            )}

            {isMobile ? (
              // Один ряд: фильтр, счётчик отобранных и лента исполнителей.
              // Выравнивание по верху, а не по центру: у ячеек исполнителей под
              // кружком есть подпись с именем, и центрирование по всей высоте
              // ряда опускало кнопку фильтра ниже линии аватаров. Кнопка и
              // кружок одного размера (40), поэтому по верху они совпадают.
              <Stack direction="row" alignItems="flex-start" gap={1} sx={{ minWidth: 0 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={{ height: 40, flexShrink: 0 }}
                >
                  <Badge badgeContent={activeChipCount} color="primary">
                    <IconButton
                      size="small"
                      onClick={() => setFilterSheetOpen(true)}
                      aria-label={t("filters.button")}
                      title={t("filters.button")}
                      sx={{
                        width: 40,
                        height: 40,
                        border: "1px solid",
                        borderColor: activeChipCount > 0 ? "primary.main" : "divider",
                        borderRadius: 1.5,
                        color: activeChipCount > 0 ? "primary.main" : "text.secondary",
                      }}
                    >
                      <FilterListOutlined fontSize="small" />
                    </IconButton>
                  </Badge>
                  {showFilteredCount && isFiltered && (
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {t("registry.filteredCount", {
                        shown: filteredItems.length,
                        total: items.length,
                      })}
                    </Typography>
                  )}
                </Stack>
                {doctorStrip}
              </Stack>
            ) : (
              doctorStrip
            )}

            {/* Фильтр специалиста переживает смену даты (он в URL), поэтому в
                другом дне он может указывать на того, кто в этот день не
                работает: без подсказки это выглядит как пустой день. */}
            {!hideDoctorStrip && doctorHasNoShift && (
              // Не Alert: его иконка, паддинги и фраза «Выберите другого»,
              // дублировавшая кнопку рядом, занимали на телефоне три строки —
              // больше, чем сама запись приёма. Здесь одна строка: суть, кто, и
              // как это убрать.
              <Stack
                direction="row"
                alignItems="center"
                gap={0.75}
                sx={(th) => ({
                  mt: -0.5,
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  color: "warning.main",
                  bgcolor: alpha(th.palette.warning.main, 0.12),
                })}
              >
                <EventBusyOutlined sx={{ fontSize: 16, flexShrink: 0 }} />
                <Typography
                  variant="caption"
                  sx={{ flex: 1, minWidth: 0, lineHeight: 1.3, fontWeight: 600 }}
                >
                  {t("list.doctorNotInDay", {
                    doctorName: selectedDoctorName ?? t("list.selectedDoctor"),
                  })}
                </Typography>
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => setSelectedDoctorId(null)}
                  sx={{
                    flexShrink: 0,
                    minWidth: "auto",
                    px: 0.75,
                    py: 0,
                    whiteSpace: "nowrap",
                    textTransform: "none",
                    fontWeight: 700,
                  }}
                >
                  {t("list.chooseAnotherDoctor")}
                </Button>
              </Stack>
            )}

            {/* Фильтры «ход визита | деньги». На телефоне ряд чипов не влезает
                рядом с лентой исполнителей — там вместо него кнопка, а сами
                чипы переезжают в лист снизу. */}
            {!isMobile && <Box sx={{ mt: -1 }}>{chipRow}</Box>}
          </Stack>
        }
      />

      <Divider />
      {loading && <LinearProgress sx={{ height: 2, mt: "-2px" }} />}

      {/* ── Content ── */}
      <CardContent
        ref={listScrollRef}
        onScroll={handleListScroll}
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
              // Ряды группы и место линии «сейчас» — перед первым элементом
              // (приёмом или окном), который ещё не начался; на телефоне
              // подряд идущие окна слиты в один ряд (GapRun).
              const rows = buildListRows(
                groupItems,
                isToday ? nowTs : null,
                isMobile,
                // Линию «сейчас» не вешаем на отменённые: они уведены в конец
                // группы, и над ними внизу ленты она вводила бы в заблуждение.
                (i) => isGap(i) || !isCancelledStatus(i.status),
              );
              // Линия группы с ближайшим приёмом — якорь подскролла при
              // открытии дня.
              const isNowAnchorGroup =
                nowAnchorApptId != null && groupItems.some((i) => !isGap(i) && i.id === nowAnchorApptId);
              const nowLine = (
                <NowLine
                  ref={isNowAnchorGroup ? nowAnchorRef : undefined}
                  label={t("list.nowMarker", { time: dayjs(nowTs).format("HH:mm") })}
                />
              );
              // Деньги группы — по строкам услуг этого исполнителя (см.
              // employeeMoneyTotals): чек совместного приёма иначе попал бы в
              // обе группы целиком.
              const money = showGroupTotals ? employeeMoneyTotals(appts, groupEmployeeId) : null;
              return (
                <Box key={groupEmployeeId ?? "__no_specialist__"}>
                  {/* ── Group header: имя врача + каунтер + деньги ── */}
                  <Box
                    sx={(th) => ({
                      px: 2,
                      py: 1,
                      // Шапка липнет к верху ленты: при скролле длинного дня
                      // уезжало имя специалиста, и было непонятно, чьи это
                      // приёмы. Фон непрозрачный (action.selected — alpha,
                      // сквозь него просвечивали строки).
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      bgcolor: th.palette.background.paper,
                      backgroundImage: `linear-gradient(${subtleBg(th, true)}, ${subtleBg(th, true)})`,
                      borderTop: "1px solid",
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    })}
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
                    {rows.map((row) => {
                      if (row.kind === "gaps") {
                        return (
                          <React.Fragment key={row.gaps[0].id}>
                            {row.nowLine && nowLine}
                            {isMobile ? (
                              <GapRun
                                label={t("list.freeSlotsRun")}
                                times={row.gaps.map((gap) => gap.timeStr)}
                                onPick={(index) => {
                                  const gap = row.gaps[index];
                                  onAddSlot?.(gap.dateIso, gap.employeeId);
                                }}
                              />
                            ) : (
                              row.gaps.map((gap) => (
                                <AddSlotButton
                                  key={gap.id}
                                  timeStr={gap.timeStr}
                                  onClick={() => onAddSlot?.(gap.dateIso, gap.employeeId)}
                                />
                              ))
                            )}
                          </React.Fragment>
                        );
                      }

                      // ── Строка приёма — 1-в-1 с оригиналом AppointmentsList ──
                      const a = row.appt;
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

                      // Строка собирается из готовых блоков: на телефоне они
                      // выстраиваются в три этажа (время + статус / имя /
                      // телефон + сумма), иначе ФИО и «Итого» рвались каждый на
                      // две-три строки и одна запись занимала пол-экрана.
                      const timeBlock = (
                        <Stack direction="row" alignItems="center" gap={0.5}>
                          {a.isNight && (
                            <Tooltip title={t("list.night")}>
                              <NightlightOutlined color="action" fontSize="small" />
                            </Tooltip>
                          )}
                          <Typography
                            variant="subtitle2"
                            sx={{ fontWeight: isMobile ? 700 : undefined, fontVariantNumeric: "tabular-nums" }}
                          >
                            {dayjs(a.scheduledAt).format("HH:mm")}
                          </Typography>
                        </Stack>
                      );

                      // Подпись «Пациент:» на телефоне съедала строку под само
                      // имя — там оно и так стоит первым.
                      const patientBlock = (
                        <Typography
                          variant="body2"
                          color={isMobile ? "text.primary" : "text.secondary"}
                          sx={
                            isMobile
                              ? {
                                  fontWeight: 600,
                                  lineHeight: 1.25,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }
                              : undefined
                          }
                        >
                          {isMobile ? "" : `${t("list.patientLabel")} `}
                          {a.patient?.fullName ?? "—"}
                        </Typography>
                      );

                      const phoneBlock = a.patient?.phone ? (
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatPhoneDisplay(a.patient.phone)}
                        </Typography>
                      ) : null;

                      const statusBlock = (
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="flex-end"
                          gap={isMobile ? 0.75 : 1}
                          useFlexGap
                          sx={{ flexShrink: isMobile ? 1 : 0, flexWrap: isMobile ? "wrap" : "nowrap", minWidth: 0 }}
                        >
                          {/* Статус приёма + деньги (оплата / долг / скидка /
                              страховка) — общий компонент. Та же логика
                              применяется в истории пациента и карточках
                              врача/пациента: иначе оплаченный приём выглядел там
                              как «Ожидаем», и врач с регистратором видели по
                              одному приёму разное. Факт оплаты — операционный
                              статус, виден всем ролям (врачу важно знать, закрыт
                              ли чек); финансовые действия остаются под правами. */}
                          <AppointmentStatusChips appointment={a} />

                          {/* Иконка принтера = есть заключение (приём фактически
                              завершён врачом). Род термина меняется по вертикали:
                              «Заключение готово» / «Отчёт готов» — отсюда agree(). */}
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

                          {/* По одной иконке на тип: канал, статус и время берём
                              из фактического лога отправки. */}
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
                      );

                      const priceChangeBlock = priceChange ? (
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
                            sx={{ mt: isMobile ? 0 : 0.5, color: "warning.dark", flexShrink: 0 }}
                          >
                            <PriceChangeOutlined sx={{ fontSize: 15 }} />
                            {/* На телефоне подпись не влезает рядом с суммой —
                                остаётся иконка с тем же тултипом. */}
                            {!isMobile && (
                              <Typography variant="caption" fontWeight={700}>
                                {t("list.priceChanged")}
                              </Typography>
                            )}
                          </Stack>
                        </Tooltip>
                      ) : null;

                      // Итого — стоимость услуг, не финансовая операция, поэтому
                      // видна всем (в т.ч. врачу без прав на финансы), как в оригинале.
                      const totalBlock =
                        totalAmount > 0 || previousPayableAmount != null ? (
                          <Typography
                            variant="body2"
                            color={isMobile ? "text.primary" : "text.secondary"}
                            sx={{
                              mt: isMobile ? 0 : priceChange ? 0.125 : 0.5,
                              fontWeight: isMobile ? 700 : undefined,
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {/* Слово «Итого» на телефоне уезжало на отдельную
                                строку — сумма и без него читается как сумма. */}
                            {!isMobile && `${t("list.total")} `}
                            {/* При скидке «Итого» — это то, что человек платит по
                                кассе; сумма до скидки остаётся рядом зачёркнутой,
                                иначе непонятно, от чего считался процент. Скидка
                                процентом: у оплаченного приёма чипа скидки нет
                                (там «Оплачено»), и эта строка — единственное
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
                        ) : null;

                      return (
                        <React.Fragment key={a.id}>
                          {row.nowLine && nowLine}
                        <Box
                          onClick={() => onSelect(a)}
                          sx={{
                            px: 2,
                            py: isMobile ? 1 : 1.25,
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
                          {isMobile ? (
                            <Stack gap={0.25}>
                              <Stack
                                direction="row"
                                alignItems="center"
                                justifyContent="space-between"
                                gap={1}
                              >
                                {timeBlock}
                                {statusBlock}
                              </Stack>
                              {patientBlock}
                              {(phoneBlock || totalBlock || priceChangeBlock) && (
                                <Stack
                                  direction="row"
                                  alignItems="center"
                                  justifyContent="space-between"
                                  gap={1}
                                >
                                  {phoneBlock ?? <Box />}
                                  <Stack direction="row" alignItems="center" gap={0.75}>
                                    {priceChangeBlock}
                                    {totalBlock}
                                  </Stack>
                                </Stack>
                              )}
                            </Stack>
                          ) : (
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
                              {/* Left: время + пациент */}
                              <Stack>
                                {timeBlock}
                                {patientBlock}
                                {phoneBlock}
                              </Stack>

                              {/* Right: чипы статуса + иконки оплаты + сумма */}
                              <Stack alignItems="flex-end">
                                {statusBlock}
                                {priceChangeBlock}
                                {totalBlock}
                              </Stack>
                            </Stack>
                          )}
                        </Box>
                        </React.Fragment>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        )}

        {/* Свободные специалисты — одной строкой в конце дня. Строка остаётся
            и в раскрытом виде: иначе спрятать их обратно было бы нечем. */}
        {freeGroupEntries.length > 0 && (
          <Stack
            direction="row"
            alignItems="center"
            gap={0.5}
            onClick={() => setFreeGroupsOpen((prev) => !prev)}
            sx={{
              px: 2,
              py: 1,
              cursor: "pointer",
              color: "text.secondary",
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }} noWrap>
              {freeGroupsOpen
                ? t("list.freeGroupsCollapse")
                : t("list.freeGroupsToggle", {
                    names: freeGroupEntries.map((g) => g.name.split(" ")[0]).join(", "),
                  })}
            </Typography>
            <ExpandMoreOutlined
              sx={{
                fontSize: 18,
                flexShrink: 0,
                transform: freeGroupsOpen ? "rotate(180deg)" : "none",
                transition: "transform .15s ease",
              }}
            />
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
            moneyCounts={showPaymentFilter ? moneyCounts : undefined}
            selectedMoneyFlags={selectedMoneyFlags}
            onToggleMoneyFlag={showPaymentFilter ? toggleMoneyFlag : undefined}
            reasonCounts={reasonCounts}
            selectedReasons={selectedReasons}
            onToggleReason={toggleReason}
            onReset={resetChipFilters}
            wrap
          />
        </Box>
      </AppBottomSheet>
    </Card>
  );
});

export default AppointmentListPanel;
