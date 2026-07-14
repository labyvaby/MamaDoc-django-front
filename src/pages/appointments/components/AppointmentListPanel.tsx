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
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";
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
import { formatKGS } from "../../../utility/format";
import {
  getStatusConfig,
  getStatusChipSx,
  normalizeDjangoStatus,
} from "../../../config/appointmentStatuses";

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
  onAddSlot?: (dateIso: string) => void;
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
}

type GapSlot = {
  isGap: true;
  id: string;
  timeStr: string;
  dateIso: string;
};

type RenderItem = DjangoAppointment | GapSlot;

function isGap(item: RenderItem): item is GapSlot {
  return (item as GapSlot).isGap === true;
}

const GAP_THRESHOLD_MS = 30 * 60 * 1000;
const DEFAULT_DURATION_MINS = 30;

const isCancelledStatus = (s?: string | null) =>
  s === "canceled" || s === "cancelled" || s === "no_show";

// ─── SMS-уведомления: маппинг тип → иконка/подпись/цвет (1-в-1 со старым фронтом) ─
const NOTIF_CONFIG: Record<
  string,
  { label: string; Icon: React.ElementType; color: string }
> = {
  created_10m: { label: "Запись", Icon: SmsOutlined, color: "success.main" },
  reminder_2h: { label: "Напомин.", Icon: AlarmOutlined, color: "info.main" },
  rescheduled_10m: { label: "Перенос", Icon: EventRepeatOutlined, color: "warning.main" },
  appointment_change: { label: "Изменение", Icon: EditCalendarOutlined, color: "warning.main" },
  appointment_cancel: { label: "Отмена", Icon: EventBusyOutlined, color: "error.main" },
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

const AddSlotButton: React.FC<{ timeStr: string; onClick: () => void }> = ({ timeStr, onClick }) => (
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
      Есть окно на {timeStr}
    </Typography>
  </Box>
);

// ─── AppointmentListPanel ─────────────────────────────────────────────────────

const AppointmentListPanel: React.FC<AppointmentListPanelProps> = React.memo(({
  items,
  loading,
  error,
  date,
  selectedId,
  canManageFinance,
  canViewFinance,
  notificationsMap,
  onSelect,
  onAddSlot,
  hideDoctorStrip = false,
  doctorFilter,
  onDoctorFilterChange,
  groupEmployeeIds = null,
}) => {
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
    console.log("availableDoctors in panel:", Array.from(map.values()));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [items, groupEmployeeIds]);

  // ── Filter items by selected doctor ──────────────────────────────────────
  const filteredItems = React.useMemo(() => {
    if (!selectedDoctor) return items;
    return items.filter((appt) =>
      appt.services.some((sl) => sl.employee?.fullName === selectedDoctor),
    );
  }, [items, selectedDoctor]);

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
        const key = "Без врача";
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
  }, [filteredItems, groupEmployeeIds]);

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

      // Интервалы активных (неотменённых) приёмов группы: слот отменённого
      // приёма считается занятым, если его начало попадает в такой интервал
      // (на это время уже записан другой пациент — окна нет).
      const activeRanges = sorted
        .filter((a) => !isCancelledStatus(a.status))
        .map((a) => {
          const from = dayjs(a.scheduledAt).valueOf();
          return { from, to: from + DEFAULT_DURATION_MINS * 60 * 1000 };
        });
      const isCoveredByActive = (t: number) =>
        activeRanges.some((r) => t >= r.from && t < r.to);

      for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const start = dayjs(current.scheduledAt);
        const isCancelled = isCancelledStatus(current.status);

        // Cancelled future appointment → show gap slot before it,
        // если на это время нет активной записи (одна плашка на слот)
        if (isCancelled && start.isAfter(dayjs()) && !isCoveredByActive(start.valueOf())) {
          const key = `gap-can-${start.valueOf()}`;
          if (!addedGapKeys.has(key)) {
            addedGapKeys.add(key);
            renderItems.push({
              isGap: true,
              id: key,
              timeStr: start.format("HH:mm"),
              dateIso: start.format("YYYY-MM-DDTHH:mm"),
            });
          }
        }

        renderItems.push(current);

        if (!isCancelled && i + 1 < sorted.length) {
          const next = sorted[i + 1];
          if (!isCancelledStatus(next.status)) {
            const currentEnd = start.add(DEFAULT_DURATION_MINS, "minute");
            const gapMs = dayjs(next.scheduledAt).valueOf() - currentEnd.valueOf();
            if (gapMs >= GAP_THRESHOLD_MS && currentEnd.isAfter(dayjs())) {
              const key = `gap-${current.id}-${next.id}`;
              renderItems.push({
                isGap: true,
                id: key,
                timeStr: currentEnd.format("HH:mm"),
                dateIso: currentEnd.format("YYYY-MM-DDTHH:mm"),
              });
            }
          }
        } else if (!isCancelled && i === sorted.length - 1) {
          const currentEnd = start.add(DEFAULT_DURATION_MINS, "minute");
          if (currentEnd.isAfter(dayjs())) {
            renderItems.push({
              isGap: true,
              id: `gap-after-${current.id}`,
              timeStr: currentEnd.format("HH:mm"),
              dateIso: currentEnd.format("YYYY-MM-DDTHH:mm"),
            });
          }
        }
      }

      if (renderItems.length > 0) result[docName] = renderItems;
    });

    return result;
  }, [rawGroups, onAddSlot]);

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

  const showPayCol = canViewFinance || canManageFinance;
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
              Приемы ({titleDate})
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
                      Все
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: selectedDoctor === null ? 700 : 500, fontSize: "0.75rem" }}
                  >
                    Все
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
          </Stack>
        }
        action={
          <IconButton aria-label="Фильтры" sx={{ display: "none" }}>
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
            Ошибка: {error}
          </Typography>
        ) : groupEntries.length === 0 ? (
          <Typography
            sx={{ p: 2, color: loading ? "text.disabled" : "text.primary" }}
            variant="body2"
          >
            {loading ? "Загрузка…" : "Нет записей"}
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
                      label={`${apptCount} приемов`}
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
                            onClick={() => onAddSlot?.(item.dateIso)}
                          />
                        );
                      }

                      // ── Строка приёма — 1-в-1 с оригиналом AppointmentsList ──
                      const a = item as DjangoAppointment;
                      const isSelected = selectedId === a.id;

                      // Суммы оплаты — на уровне строки списка методы недоступны,
                      // используем paymentStatus как proxy
                      const paidTotal = Number(a.paidTotal ?? 0);
                      const totalAmount = Number(a.totalAmount ?? 0);
                      const hasPaid = paidTotal > 0;
                      // Бэк не отдаёт hasMedicalConclusion — выводим наличие
                      // заключения из строк услуг (conclusionState/conclusionId).
                      const hasConclusion = (a.services ?? []).some(
                        (sl) =>
                          sl.conclusionId != null ||
                          sl.conclusionState === "draft" ||
                          sl.conclusionState === "completed",
                      );

                      // Определяем статус для отображения
                      const displayStatus = normalizeDjangoStatus(a.status);
                      const isCardOnly =
                        (a.paymentMethods ?? []).length === 1 &&
                        a.paymentMethods?.[0] === "card";
                      const paymentStyleStatus =
                        a.paymentStatus === "paid" && isCardOnly
                          ? "Оплачено безналом"
                          : a.paymentStatus === "paid"
                          ? "Оплачено"
                          : a.paymentStatus === "partial"
                          ? "Частично"
                          : displayStatus;

                      const statusCfg = getStatusConfig(displayStatus);
                      // Прячем статус-чип, когда состояние и так понятно по
                      // другим меткам: завершён, оплачен/частично, или есть
                      // заключение (его передаёт иконка принтера).
                      const hideStatusChip =
                        a.status === "completed" ||
                        a.paymentStatus === "paid" ||
                        a.paymentStatus === "partial" ||
                        hasConclusion;

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
                                  <Tooltip title="Ночной">
                                    <NightlightOutlined color="action" fontSize="small" />
                                  </Tooltip>
                                )}
                                <Typography variant="subtitle2">
                                  {dayjs(a.scheduledAt).format("HH:mm")}
                                </Typography>
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                Пациент: {a.patient?.fullName ?? "—"}
                              </Typography>
                              {a.patient?.phone && (
                                <Typography variant="caption" color="text.disabled">
                                  {a.patient.phone}
                                </Typography>
                              )}
                            </Stack>

                            {/* Right: чипы статуса + иконки оплаты + сумма */}
                            <Stack alignItems="flex-end">
                              <Stack direction="row" alignItems="center" gap={1}>
                                {/* Статус-чип (не показываем если завершён/оплачен) */}
                                {!hideStatusChip && (
                                  <Chip
                                    label={statusCfg.label}
                                    icon={statusCfg.icon}
                                    size="small"
                                    sx={getStatusChipSx(displayStatus)}
                                  />
                                )}

                                {/* Чип оплаты — показываем «Оплачено»/«Частично
                                    оплачено» (статус ОПЛАТЫ, не статус приёма). */}
                                {showPayCol && hasPaid && (
                                  <Chip
                                    label={
                                      <Stack direction="row" alignItems="center" gap={0.5}>
                                        {a.paymentMethods && a.paymentMethods.length > 0 ? (
                                          <>
                                            {a.paymentMethods.includes("cash") && <PaymentsOutlined sx={{ fontSize: 16 }} />}
                                            {a.paymentMethods.includes("card") && <CreditCardOutlined sx={{ fontSize: 16 }} />}
                                            {a.paymentMethods.includes("balance") && <AccountBalanceWalletOutlined sx={{ fontSize: 16 }} />}
                                            {a.paymentMethods.includes("bonus") && <CardGiftcardOutlined sx={{ fontSize: 16 }} />}
                                            {a.paymentMethods.includes("insurance") && <HealthAndSafetyOutlined sx={{ fontSize: 16 }} />}
                                          </>
                                        ) : (
                                          <PaymentsOutlined sx={{ fontSize: 16 }} />
                                        )}
                                        <span>
                                          {paymentStyleStatus === "Оплачено безналом"
                                            ? "Оплачено"
                                            : paymentStyleStatus}
                                        </span>
                                      </Stack>
                                    }
                                    size="small"
                                    sx={getStatusChipSx(paymentStyleStatus)}
                                  />
                                )}

                                {/* Бейдж «Страховка» — визит (со)оплачен страховой
                                    компанией; синий тинт, отличим от зелёного
                                    чипа оплаты в обеих темах. */}
                                {showPayCol &&
                                  (a.paymentMethods ?? []).includes("insurance") && (
                                    <Tooltip title="Оплата страховкой">
                                      <Chip
                                        label={
                                          <Stack direction="row" alignItems="center" gap={0.5}>
                                            <HealthAndSafetyOutlined sx={{ fontSize: 14 }} />
                                            <span>Страховка</span>
                                          </Stack>
                                        }
                                        size="small"
                                        sx={(t) => ({
                                          height: 24,
                                          borderRadius: "7px",
                                          fontWeight: 500,
                                          bgcolor: alpha(
                                            t.palette.info.main,
                                            t.palette.mode === "dark" ? 0.2 : 0.14,
                                          ),
                                          color:
                                            t.palette.mode === "dark"
                                              ? t.palette.info.light
                                              : t.palette.info.dark,
                                        })}
                                      />
                                    </Tooltip>
                                  )}

                                {/* Иконка принтера = есть заключение (приём
                                    фактически завершён врачом). */}
                                {hasConclusion && (
                                  <Tooltip title="Заключение готово">
                                    <PrintOutlinedIcon
                                      sx={{ fontSize: 20, color: "action.active", opacity: 0.8 }}
                                    />
                                  </Tooltip>
                                )}

                                {/* Иконки отправленных SMS-уведомлений — 1-в-1 со
                                    старым фронтом (home/AppointmentsList): по одной
                                    на тип, с типом и временем в tooltip. */}
                                {notificationsMap?.has(a.id) &&
                                  [...notificationsMap.get(a.id)!.entries()].map(([t, sentAt]) => {
                                    const cfg =
                                      NOTIF_CONFIG[t] ?? { label: t, Icon: SmsOutlined, color: "success.main" };
                                    const time = sentAt ? dayjs(sentAt).format("DD.MM HH:mm") : "";
                                    return (
                                      <Tooltip key={t} title={`SMS: ${cfg.label}${time ? ` · ${time}` : ""}`}>
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
                                  Итого: {formatKGS(totalAmount)}
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
