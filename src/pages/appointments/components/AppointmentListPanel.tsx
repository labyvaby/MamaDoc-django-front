import React from "react";
import {
  Avatar,
  Box,
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
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import FilterListOutlined from "@mui/icons-material/FilterListOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
// Иконки SMS-уведомлений — те же импорты, что в старом фронте (home/AppointmentsList).
import SmsOutlined from "@mui/icons-material/SmsOutlined";
import AlarmOutlined from "@mui/icons-material/AlarmOutlined";
import EventRepeatOutlined from "@mui/icons-material/EventRepeat";
import EditCalendarOutlined from "@mui/icons-material/EditCalendar";
import EventBusyOutlined from "@mui/icons-material/EventBusy";
import dayjs from "dayjs";

import type { DjangoAppointment } from "../../../api/appointments";
import {
  appointmentEnd,
  busyIntervals,
  isCancelledStatus,
  isSlotCovered,
} from "./slotAvailability";
import { formatKGS, discountPercentOf } from "../../../utility/format";
import { formatPhoneDisplay } from "../../../utility/phone";
import { useT } from "../../../i18n/VerticalProvider";
import { agree } from "../../../i18n/formatters";
import AppointmentStatusChips from "../../../components/appointments/AppointmentStatusChips";
import {
  getStatusAccent,
  getStatusLabel,
  resolveStatusCode,
} from "../../../config/appointmentStatuses";
import type { StatusCode } from "../../../config/appointmentStatuses";

/**
 * Статусы визита, по которым можно отфильтровать день. Порядок — ход визита,
 * а не алфавит: регистратор читает ленту слева направо как шкалу времени.
 * Показываем только те, что в этом дне действительно есть.
 */
const VISIT_FILTER_CODES: StatusCode[] = [
  "scheduled",
  "confirmed",
  "arrived",
  "in_progress",
  "completed",
  "canceled",
  "no_show",
];

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
   * Иконки SMS-уведомлений по приёмам: Map<appointmentId, Map<type, sentAt>>.
   * Источник — лёгкий батч-эндпоинт /api/appointments/notifications/.
   */
  notificationsMap?: Map<number, Map<string, string | null>>;
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
   */
  doctorFilter?: string | null;
  onDoctorFilterChange?: (name: string | null) => void;
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
};

const DoctorStoryItem: React.FC<DoctorStoryItemProps> = ({ name, nickname, photoUrl, isActive, onClick }) => {
  const theme = useTheme();
  const displayName = nickname || name.split(" ")[0];

  return (
    <Stack
      spacing={0.25}
      alignItems="center"
      onClick={onClick}
      sx={{
        cursor: "pointer",
        minWidth: 56,
        transition: "all 0.2s ease",
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
          border: isActive ? "none" : `1.5px solid ${theme.palette.divider}`,
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
  groupEmployeeIds = null,
  dayShifts = null,
}) => {
  const { t, term } = useT("appointments");
  const theme = useTheme();
  const titleDate = date ? date.format("DD.MM.YYYY") : "";

  // ── Doctor filter state: управляемый (doctorFilter) или внутренний ────────
  const isDoctorControlled = doctorFilter !== undefined;
  const [internalDoctor, setInternalDoctor] = React.useState<string | null>(null);
  const selectedDoctor = isDoctorControlled ? doctorFilter : internalDoctor;
  const setSelectedDoctor = React.useCallback(
    (name: string | null) => {
      if (!isDoctorControlled) setInternalDoctor(name);
      onDoctorFilterChange?.(name);
    },
    [isDoctorControlled, onDoctorFilterChange],
  );

  React.useEffect(() => {
    if (!isDoctorControlled) setInternalDoctor(null);
  }, [titleDate, isDoctorControlled]);

  // ── Build doctor list from appointments (id → name, photoUrl) ─────────────
  const availableDoctors = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; photoUrl: string | null; nickname: string | null }>();
    for (const appt of items) {
      for (const sl of appt.services) {
        if (
          sl.employee &&
          (!groupEmployeeIds || groupEmployeeIds.has(sl.employee.id)) &&
          !map.has(String(sl.employee.id))
        ) {
          map.set(String(sl.employee.id), {
            id: String(sl.employee.id),
            name: sl.employee.fullName,
            photoUrl: sl.employee.photoUrl,
            nickname: sl.employee.nickname,
          });
        }
      }
    }
    // Новая смена может быть создана раньше первого приёма сотрудника.
    // Добавляем таких сотрудников из расписания, чтобы они сразу появлялись
    // в быстром фильтре регистратуры.
    for (const [id, name] of dayShifts?.employeeNames ?? []) {
      if ((!groupEmployeeIds || groupEmployeeIds.has(id)) && !map.has(String(id))) {
        map.set(String(id), {
          id: String(id),
          name,
          photoUrl: null,
          nickname: null,
        });
      }
    }
    console.log("availableDoctors in panel:", Array.from(map.values()));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [items, groupEmployeeIds, dayShifts]);

  // ── Фильтр по статусу визита ──────────────────────────────────────────────
  // Главный вопрос стойки — «кто уже в холле»: раньше отобрать таких можно было
  // только глазами по всему списку. Фильтруем по каноническому коду, а не по
  // метке: метка зависит от вертикали бизнеса.
  const [statusFilter, setStatusFilter] = React.useState<StatusCode | null>(null);

  React.useEffect(() => {
    setStatusFilter(null);
  }, [titleDate]);

  // Отбираем только статусы, которые сегодня реально встречаются: пустой чип
  // «Неявка · 0» занимал бы место и ничего не сообщал.
  const statusCounts = React.useMemo(() => {
    const counts = new Map<StatusCode, number>();
    for (const appt of items) {
      const code = resolveStatusCode(appt.status);
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const statusChips = React.useMemo(
    () => VISIT_FILTER_CODES.filter((code) => (statusCounts.get(code) ?? 0) > 0),
    [statusCounts],
  );

  // ── Filter items by selected doctor ──────────────────────────────────────
  const filteredItems = React.useMemo(() => {
    let list = items;
    if (selectedDoctor) {
      list = list.filter((appt) =>
        appt.services.some((sl) => sl.employee?.fullName === selectedDoctor),
      );
    }
    if (statusFilter) {
      list = list.filter((appt) => resolveStatusCode(appt.status) === statusFilter);
    }
    return list;
  }, [items, selectedDoctor, statusFilter]);

  // ── Group by doctor name → list of appointments ───────────────────────────
  // Mirrors оригинал: каждый приём попадает в группу каждого участвующего врача
  const rawGroups = React.useMemo(() => {
    const groups: Record<string, DjangoAppointment[]> = {};

    for (const appt of filteredItems) {
      const names = Array.from(
        new Set(
          appt.services
            .filter(
              (sl) =>
                sl.employee != null &&
                (!groupEmployeeIds || groupEmployeeIds.has(sl.employee.id)),
            )
            .map((sl) => sl.employee!.fullName),
        ),
      );

      if (names.length === 0) {
        // В процедурном кабинете приёмы без совпадения с медсёстрами не показываем.
        if (groupEmployeeIds) continue;
        const key = t("list.noSpecialistGroup");
        if (!groups[key]) groups[key] = [];
        groups[key].push(appt);
      } else {
        for (const name of names) {
          if (!groups[name]) groups[name] = [];
          groups[name].push(appt);
        }
      }
    }

    return groups;
  }, [filteredItems, groupEmployeeIds, t]);

  // ── Build render list per group: sort by time + insert gap slots ──────────
  const groupedItemsWithGaps = React.useMemo(() => {
    const result: Record<string, RenderItem[]> = {};

    Object.entries(rawGroups).forEach(([docName, appts]) => {
      const sorted = [...appts].sort((a, b) =>
        dayjs(a.scheduledAt).valueOf() - dayjs(b.scheduledAt).valueOf(),
      );

      if (!onAddSlot) {
        result[docName] = sorted;
        return;
      }

      const renderItems: RenderItem[] = [];
      const addedGapKeys = new Set<string>();

      // Занятые интервалы активных (неотменённых) приёмов группы — см.
      // slotAvailability.ts: модель занятости должна совпадать с серверной.
      const activeIntervals = busyIntervals(sorted);
      const isCoveredByActive = (t: number) => isSlotCovered(activeIntervals, t);

      // Исполнитель группы: нужен и для рабочих часов, и для предзаполнения
      // формы при клике по окну. Группы строятся по имени, id берём из первой
      // строки услуги с этим именем.
      let groupEmployeeId: number | null = null;
      outer: for (const a of sorted) {
        for (const sl of a.services) {
          if (sl.employee && sl.employee.fullName === docName) {
            groupEmployeeId = sl.employee.id;
            break outer;
          }
        }
      }

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

      if (renderItems.length > 0) result[docName] = renderItems;
    });

    return result;
  }, [rawGroups, onAddSlot, dayShifts]);

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

  const groupEntries = Object.entries(groupedItemsWithGaps);

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
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
              {t("list.title", { date: titleDate })}
            </Typography>

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
                  onClick={() => setSelectedDoctor(null)}
                  sx={{ cursor: "pointer", minWidth: 56 }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      border:
                        selectedDoctor === null
                          ? `3px solid ${theme.palette.primary.main}`
                          : `1.5px solid ${theme.palette.divider}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: selectedDoctor === null ? "primary.main" : "transparent",
                      color: selectedDoctor === null ? "primary.contrastText" : "text.secondary",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {t("filters.all")}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: selectedDoctor === null ? 700 : 500, fontSize: "0.75rem" }}
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
                    isActive={selectedDoctor === doc.name}
                    onClick={() =>
                      setSelectedDoctor(selectedDoctor === doc.name ? null : doc.name)
                    }
                  />
                ))}
                <Box sx={{ minWidth: 16, flexShrink: 0 }} />
              </Box>
            )}

            {/* Фильтр по статусу визита: «Пациент здесь · 3» и т.п. Цвета —
                из той же палитры, что и чипы в строках, иначе клик по фильтру
                приводил бы к списку другого цвета. */}
            {statusChips.length > 0 && (
              <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: -1 }}>
                {statusChips.map((code) => {
                  const active = statusFilter === code;
                  const accent = getStatusAccent(code, theme);
                  return (
                    <Chip
                      key={code}
                      size="small"
                      clickable
                      onClick={() => setStatusFilter(active ? null : code)}
                      label={`${getStatusLabel(code)} · ${statusCounts.get(code) ?? 0}`}
                      sx={(th) => ({
                        height: 24,
                        fontWeight: 500,
                        border: 1,
                        borderColor: active ? alpha(accent.main, 0.4) : "divider",
                        color: active ? accent.text : "text.secondary",
                        bgcolor: active
                          ? alpha(accent.main, th.palette.mode === "dark" ? 0.16 : 0.08)
                          : "transparent",
                        "&:hover": {
                          bgcolor: alpha(accent.main, th.palette.mode === "dark" ? 0.22 : 0.12),
                        },
                      })}
                    />
                  );
                })}
              </Stack>
            )}
          </Stack>
        }
        action={
          <IconButton aria-label={t("filters.button")} sx={{ display: "none" }}>
            <FilterListOutlined />
          </IconButton>
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
            {groupEntries.map(([docName, groupItems]) => {
              const apptCount = groupItems.filter((i) => !isGap(i)).length;
              return (
                <Box key={docName}>
                  {/* ── Group header: имя врача + каунтер ── */}
                  <Box
                    sx={{
                      px: 2,
                      py: 1,
                      bgcolor: "action.selected",
                      borderTop: "1px solid",
                      borderBottom: "1px solid",
                      borderColor: "divider",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight="bold">
                      {docName}
                    </Typography>
                    <Chip
                      label={t("list.count", { count: apptCount })}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700, bgcolor: "background.paper" }}
                    />
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

                                {/* Иконки отправленных SMS-уведомлений — 1-в-1 со
                                    старым фронтом (home/AppointmentsList): по одной
                                    на тип, с типом и временем в tooltip. */}
                                {notificationsMap?.has(a.id) &&
                                  [...notificationsMap.get(a.id)!.entries()].map(([notifType, sentAt]) => {
                                    const cfg = NOTIF_CONFIG[notifType] ?? {
                                      Icon: SmsOutlined,
                                      color: "success.main",
                                    };
                                    const label = t(`notifications.${notifType}`, {
                                      defaultValue: notifType,
                                    });
                                    const time = sentAt ? dayjs(sentAt).format("DD.MM HH:mm") : "";
                                    return (
                                      <Tooltip key={notifType} title={`SMS: ${label}${time ? ` · ${time}` : ""}`}>
                                        <cfg.Icon sx={{ fontSize: 16, color: cfg.color, opacity: 0.9 }} />
                                      </Tooltip>
                                    );
                                  })}
                              </Stack>

                              {/* Итого — стоимость услуг, не финансовая операция,
                                  поэтому видна всем (в т.ч. врачу без прав на
                                  финансы), как в оригинале. */}
                              {totalAmount > 0 && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ mt: 0.5 }}
                                >
                                  {t("list.total")}{" "}
                                  {/* При скидке «Итого» — это то, что человек
                                      платит по кассе; сумма до скидки остаётся
                                      рядом зачёркнутой, иначе непонятно, от чего
                                      считался процент. Скидка процентом: у
                                      оплаченного приёма чипа скидки нет (там
                                      «Оплачено»), и эта строка — единственное
                                      место, где дисконт виден. */}
                                  {discountPercent != null && (
                                    <Box
                                      component="span"
                                      sx={{ textDecoration: "line-through", opacity: 0.6, mr: 0.5 }}
                                    >
                                      {formatKGS(totalAmount)}
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
    </Card>
  );
});

export default AppointmentListPanel;
