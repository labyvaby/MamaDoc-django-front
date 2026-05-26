import React from "react";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
  Stack,
  Typography,
  Avatar,
  LinearProgress,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import FilterListOutlined from "@mui/icons-material/FilterListOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import Tooltip from "@mui/material/Tooltip";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import SmsOutlined from "@mui/icons-material/SmsOutlined";
import AlarmOutlined from "@mui/icons-material/AlarmOutlined";
import EventRepeatOutlined from "@mui/icons-material/EventRepeat";
import EditCalendarOutlined from "@mui/icons-material/EditCalendar";
import EventBusyOutlined from "@mui/icons-material/EventBusy";

import { formatKGS } from "../../../utility/format";
import { APPOINTMENT_STATUSES, getStatusConfig, getStatusChipSx } from "../../../config/appointmentStatuses";
import dayjs from "dayjs";

import type { Appointment } from "../types";
import type { Shift } from "../../../services/shifts";

import type { EmployeesRow } from "../../expenses/types";

type AppointmentsListProps = {
  titleDate: string; // formatted dd.MM.yyyy
  loading: boolean;
  errorMsg: string | null;
  items: Appointment[];
  onOpenFilters: () => void;
  onItemClick?: (id: string) => void;
  hideDoctorFilter?: boolean;
  doctors?: EmployeesRow[];
  shifts?: Shift[];
  restrictToDoctorId?: string; // If provided, only show appointments for this doctor
  selectedDoctorName?: string | null; // For hierarchical filtering passing
  notificationsMap?: Map<string, Map<string, string>>;
};

// --- Doctor Story Item (Instagram Style) ---
type DoctorStoryItemProps = {
  name: string;
  nickname?: string;
  photoUrl?: string;
  isActive: boolean;
  onClick: () => void;
};

const DoctorStoryItem: React.FC<DoctorStoryItemProps> = ({ name, nickname, photoUrl, isActive, onClick }) => {
  const displayName = nickname || name.split(' ')[0]; // Use nickname or just first name if FIO
  const theme = useTheme();

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
          padding: "3px", // Space for gradient border
          background: isActive
            ? theme.palette.primary.main
            : "transparent",
          border: isActive ? "none" : `1.5px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Avatar
          src={photoUrl}
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

// ОПТИМИЗАЦИЯ: React.memo предотвращает ненужные ре-рендеры при неизменных пропсах
// --- Add Slot Button Component ---
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";

type AddSlotButtonProps = {
  timeStr: string;
  onClick: () => void;
};

const AddSlotButton: React.FC<AddSlotButtonProps> = ({ timeStr, onClick }) => (
  <Box
    onClick={onClick}
    sx={{
      mx: 2,
      my: 1,
      height: 44,
      border: "1px dashed",
      borderColor: "primary.main", // Always primary
      borderRadius: 1.5,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "primary.main", // Always primary
      cursor: "pointer",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05), // Light primary background
      "&:hover": {
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
        transform: "translateY(-1px)",
        boxShadow: (theme) => `0 4px 12px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)'}`,
      },
      "&:active": {
        transform: "scale(0.98)",
      },
    }}
  >
    <AddCircleOutline sx={{ fontSize: 18, mr: 1, opacity: 0.8 }} />
    <Typography variant="body2" fontWeight={600}>
      Есть окно на {timeStr}
    </Typography>
  </Box>
);

// --- Gap Calculation Logic ---

const GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30 mins
const DEFAULT_DURATION_MINS = 30; // 30 mins default duration

type GapSlot = {
  isGap: true;
  id: string; // unique key
  startTime: Date;
  timeStr: string; // HH:mm
  doctorId: string; // to associate new record with doctor
};

type RenderItem = Appointment | GapSlot;

function isGap(item: RenderItem): item is GapSlot {
  return (item as GapSlot).isGap === true;
}

const isCancelledStatus = (status?: string | null): boolean => {
  const normalized = (status ?? "").trim().toLowerCase();
  return normalized === APPOINTMENT_STATUSES.CANCELLED.toLowerCase() || normalized === "отменен";
};

const getDoctorKeysForAppointment = (item: Appointment): string[] => {
  const keys = new Set<string>();
  const services = item.parsed_services || [];

  if (Array.isArray(services) && services.length > 0) {
    services.forEach((svc) => {
      const id = svc.performer_id || svc.doctor_id;
      const name = (svc.performer_name || svc.doctor_name || "").trim().toLowerCase();
      if (id) keys.add(`id:${id}`);
      if (name) keys.add(`name:${name}`);
    });
  }

  if (item.doctor_id) keys.add(`id:${item.doctor_id}`);
  if (item.doctor_name?.trim()) keys.add(`name:${item.doctor_name.trim().toLowerCase()}`);

  return Array.from(keys);
};

const getAppointmentTimeKey = (appointmentAt: string): string => {
  const dt = dayjs(appointmentAt);
  return dt.isValid() ? String(dt.valueOf()) : appointmentAt;
};

export const AppointmentsList: React.FC<AppointmentsListProps & { onAddSlot?: (dateIso: string, doctorId?: string) => void }> = React.memo(({
  titleDate,
  loading,
  errorMsg,
  items,
  onOpenFilters,
  onItemClick,
  onAddSlot,
  hideDoctorFilter,
  doctors,
  shifts,
  restrictToDoctorId,
  selectedDoctorName,
  notificationsMap,
}) => {
  const theme = useTheme();
  const [selectedDoctor, setSelectedDoctor] = React.useState<string | null>(null);

  // Сброс локального фильтра по врачу при смене даты или внешнего фильтра
  React.useEffect(() => {
    setSelectedDoctor(null);
  }, [titleDate, selectedDoctorName]);

  const effectiveSelectedDoctor = selectedDoctorName || selectedDoctor;

  const isTitleADate = React.useMemo(() => /^\d{2}\.\d{2}\.\d{4}$/.test(titleDate), [titleDate]);

  const currentDayShifts = React.useMemo(() => {
    if (!shifts || !Array.isArray(shifts) || !isTitleADate) return [];
    const [dd, mm, yyyy] = titleDate.split(".");
    const currentDayStr = `${yyyy}-${mm}-${dd}`;
    const currentDay = dayjs(currentDayStr);

    return shifts.filter(shift => {
      if (shift.shift_date === currentDayStr) return true;
      const prevDayStr = currentDay.subtract(1, 'day').format('YYYY-MM-DD');
      if (shift.shift_date === prevDayStr) {
        const sStart = dayjs(`${shift.shift_date}T${shift.start_time}`);
        let sEnd = dayjs(`${shift.shift_date}T${shift.end_time}`);
        if (sEnd.isBefore(sStart)) sEnd = sEnd.add(1, 'day');
        return sEnd.isAfter(currentDay.startOf('day'));
      }
      return false;
    });
  }, [shifts, titleDate, isTitleADate]);

  const availableDoctors = React.useMemo(() => {
    const doctorMap = new Map<string, { id: string; name: string; photoUrl: string | null; nickname?: string }>();
    const [dd, mm, yyyy] = titleDate.split(".");
    const titleDayISO = isTitleADate ? `${yyyy}-${mm}-${dd}` : null;

    items.forEach((item) => {
      if (isTitleADate && item.appointment_day && item.appointment_day !== titleDayISO) return;
      const services = item.parsed_services || [];

      const processService = (svc: any) => {
        const docId = svc.performer_id || svc.doctor_id;
        const docName = svc.performer_name || svc.doctor_name;
        if (docId && !doctorMap.has(docId)) {
          const fullInfo = doctors?.find(d => d.id === docId);
          doctorMap.set(docId, {
            id: docId,
            name: docName || fullInfo?.full_name || "Врач",
            photoUrl: svc.performer_photo || svc.doctor_photo || fullInfo?.avatar_url || null,
            nickname: fullInfo?.nickname
          });
        }
      };

      if (Array.isArray(services) && services.length > 0) {
        services.forEach(processService);
      } else if (item.doctor_id || item.doctor_name) {
        processService({
          performer_id: item.doctor_id,
          performer_name: item.doctor_name,
          performer_photo: item.doctor_photo_url
        });
      }
    });

    currentDayShifts.forEach(shift => {
      if (shift.employes_id && !doctorMap.has(shift.employes_id)) {
        const fullInfo = doctors?.find(d => d.id === shift.employes_id);
        if (fullInfo) {
          doctorMap.set(shift.employes_id, {
            id: shift.employes_id,
            name: fullInfo.full_name || "Врач",
            photoUrl: fullInfo.avatar_url || null,
            nickname: fullInfo.nickname
          });
        }
      }
    });

    let list = Array.from(doctorMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (restrictToDoctorId) list = list.filter(d => d.id === restrictToDoctorId);
    return list;
  }, [items, doctors, currentDayShifts, restrictToDoctorId, titleDate]);

  const filteredItems = React.useMemo(() => {
    if (!effectiveSelectedDoctor) return items;
    return items.filter((item) => {
      if (item.doctor_name === effectiveSelectedDoctor) return true;
      const services = item.parsed_services || [];
      return Array.isArray(services) && services.some(svc => (svc.performer_name === effectiveSelectedDoctor) || (svc.doctor_name === effectiveSelectedDoctor));
    });
  }, [items, effectiveSelectedDoctor]);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const scrollLeft = React.useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeft.current = scrollContainerRef.current.scrollLeft;
    scrollContainerRef.current.style.cursor = 'grabbing';
    scrollContainerRef.current.style.userSelect = 'none';
  };
  const handleMouseLeave = () => { if (scrollContainerRef.current) { isDragging.current = false; scrollContainerRef.current.style.cursor = 'grab'; } };
  const handleMouseUp = () => { if (scrollContainerRef.current) { isDragging.current = false; scrollContainerRef.current.style.cursor = 'grab'; } };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX.current) * 2;
    scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const groupedItemsWithGaps = React.useMemo(() => {
    const rawGroups: Record<string, Appointment[]> = {};
    const doctorIdMap: Record<string, string> = {};
    const occupiedDoctorTimeKeys = new Set<string>();
    const [dd, mm, yyyy] = titleDate.split(".");
    const currentDayStr = isTitleADate ? `${yyyy}-${mm}-${dd}` : null;

    filteredItems.forEach((item) => {
      if (isTitleADate && item.appointment_day && item.appointment_day !== currentDayStr) return;
      if (isCancelledStatus(item.status)) return;

      const timeKey = getAppointmentTimeKey(item.appointment_at);
      const doctorKeys = getDoctorKeysForAppointment(item);
      doctorKeys.forEach((doctorKey) => occupiedDoctorTimeKeys.add(`${doctorKey}|${timeKey}`));
    });

    currentDayShifts.forEach(shift => {
      const fullInfo = doctors?.find(d => d.id === shift.employes_id);
      if (fullInfo) {
        const docName = fullInfo.full_name || "Врач";
        const docId = shift.employes_id;
        if (restrictToDoctorId && docId !== restrictToDoctorId) return;
        if (effectiveSelectedDoctor && docName !== effectiveSelectedDoctor) return;
        if (!rawGroups[docName]) rawGroups[docName] = [];
        doctorIdMap[docName] = docId;
      }
    });

    filteredItems.forEach((item) => {
      if (isTitleADate && item.appointment_day && item.appointment_day !== currentDayStr) return;
      const services = item.parsed_services || [];
      const performersMap = new Map<string, { name: string, id?: string }>();
      if (Array.isArray(services) && services.length > 0) {
        services.forEach(svc => {
          const name = svc.performer_name || svc.doctor_name;
          const id = svc.performer_id || svc.doctor_id;
          if (name) {
            const key = id || name;
            performersMap.set(key, { name, id: id ?? undefined });
            if (id) doctorIdMap[name] = id;
          }
        });
      } else if (item.doctor_name) {
        performersMap.set(item.doctor_id || item.doctor_name, { name: item.doctor_name, id: item.doctor_id });
        if (item.doctor_id) doctorIdMap[item.doctor_name] = item.doctor_id;
      }

      if (performersMap.size === 0) {
        const noDocName = "Без врача";
        if (restrictToDoctorId) return;
        if (effectiveSelectedDoctor && noDocName !== effectiveSelectedDoctor) return;
        if (!rawGroups[noDocName]) rawGroups[noDocName] = [];
        rawGroups[noDocName].push(item);
      } else {
        performersMap.forEach(perf => {
          if (restrictToDoctorId && perf.id !== restrictToDoctorId) return;
          if (effectiveSelectedDoctor && perf.name !== effectiveSelectedDoctor) return;
          if (!rawGroups[perf.name]) rawGroups[perf.name] = [];
          rawGroups[perf.name].push(item);
        });
      }
    });

    const groups: Record<string, RenderItem[]> = {};
    Object.entries(rawGroups).forEach(([docName, appts]) => {
      const sortedAppts = [...appts].sort((a, b) => a.appointment_at.localeCompare(b.appointment_at));
      const result: RenderItem[] = [];
      const docId = doctorIdMap[docName];
      const docShifts = currentDayShifts.filter(s => s.employes_id === docId);

      const getActiveShift = (date: dayjs.Dayjs) => {
        return docShifts.find(shift => {
          const sStart = dayjs(`${shift.shift_date}T${shift.start_time}`);
          let sEnd = dayjs(`${shift.shift_date}T${shift.end_time}`);
          if (sEnd.isBefore(sStart)) sEnd = sEnd.add(1, 'day');
          return (date.isAfter(sStart) || date.isSame(sStart)) && date.isBefore(sEnd);
        });
      };

      if (onAddSlot) {
        if (sortedAppts.length === 0) {
          const seenTimes = new Set<string>();
          docShifts.forEach(shift => {
            const startTime = dayjs(`${shift.shift_date}T${shift.start_time}`);
            const timeStr = startTime.format('HH:mm');
            if (!startTime.isBefore(dayjs()) && !seenTimes.has(timeStr)) {
              seenTimes.add(timeStr);
              result.push({ isGap: true, id: `empty-${shift.id}`, startTime: startTime.toDate(), timeStr, doctorId: docId || "" });
            }
          });
        } else {
          const firstStart = dayjs(sortedAppts[0].appointment_at);
          const shiftForFirst = getActiveShift(firstStart.subtract(1, 'minute'));
          if (shiftForFirst) {
            const sStart = dayjs(`${shiftForFirst.shift_date}T${shiftForFirst.start_time}`);
            if (firstStart.diff(sStart) >= GAP_THRESHOLD_MS && !sStart.isBefore(dayjs())) {
              result.push({ isGap: true, id: `gap-before-${sortedAppts[0].id}`, startTime: sStart.toDate(), timeStr: sStart.format('HH:mm'), doctorId: docId || "" });
            }
          }

          const addedGapTimeKeys = new Set<string>();
          for (let i = 0; i < sortedAppts.length; i++) {
            const current = sortedAppts[i];
            if (isCancelledStatus(current.status)) {
              const start = dayjs(current.appointment_at);
              const timeKey = getAppointmentTimeKey(current.appointment_at);
              const hasActiveAtSameTime = getDoctorKeysForAppointment(current).some((doctorKey) =>
                occupiedDoctorTimeKeys.has(`${doctorKey}|${timeKey}`)
              );
              if (!start.isBefore(dayjs()) && getActiveShift(start) && !hasActiveAtSameTime && !addedGapTimeKeys.has(timeKey)) {
                addedGapTimeKeys.add(timeKey);
                result.push({ isGap: true, id: `slot-can-${current.id}`, startTime: start.toDate(), timeStr: current.appointment_time, doctorId: docId || current.doctor_id || "" });
              }
            }
            result.push(current);
            const next = sortedAppts[i + 1];
            const currentEnd = dayjs(current.appointment_at).add(current.duration ?? DEFAULT_DURATION_MINS, 'minute');
            if (next) {
              if (dayjs(next.appointment_at).diff(currentEnd) >= GAP_THRESHOLD_MS && getActiveShift(currentEnd) && !currentEnd.isBefore(dayjs())) {
                result.push({ isGap: true, id: `gap-${current.id}-${next.id}`, startTime: currentEnd.toDate(), timeStr: currentEnd.format('HH:mm'), doctorId: docId || current.doctor_id || "" });
              }
            } else if (getActiveShift(currentEnd) && !currentEnd.isBefore(dayjs())) {
              result.push({ isGap: true, id: `gap-after-${current.id}`, startTime: currentEnd.toDate(), timeStr: currentEnd.format('HH:mm'), doctorId: docId || "" });
            }
          }
        }
      } else {
        sortedAppts.forEach(a => result.push(a));
      }
      if (result.length > 0) groups[docName] = result;
    });
    return groups;
  }, [filteredItems, onAddSlot, currentDayShifts, restrictToDoctorId, effectiveSelectedDoctor, doctors, titleDate]);

  return (
    <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardHeader
        sx={{
          pb: 1.5,
          "& .MuiCardHeader-content": { minWidth: 0 },
          "& .MuiCardHeader-action": { alignSelf: "flex-start", mt: 0.5 }
        }}
        title={
          <Stack
            direction="column"
            gap={2}
            sx={{ width: '100%' }}
          >
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
              Приемы ({titleDate})
            </Typography>

            {!hideDoctorFilter && !restrictToDoctorId && (
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
                  cursor: 'grab',
                  userSelect: 'none',
                  pb: 0.5,
                  px: 2,
                  mx: -2,
                }}
              >
                {availableDoctors.length > 0 && (
                  <Stack spacing={0.25} alignItems="center" onClick={() => setSelectedDoctor(null)} sx={{ cursor: "pointer", minWidth: 56 }}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        border: selectedDoctor === null ? `3px solid ${theme.palette.primary.main}` : `1.5px solid ${theme.palette.divider}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: selectedDoctor === null ? "primary.main" : "transparent",
                        color: selectedDoctor === null ? "primary.contrastText" : "text.secondary",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Все</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ fontWeight: selectedDoctor === null ? 700 : 500, fontSize: "0.75rem" }}>
                      Все
                    </Typography>
                  </Stack>
                )}
                {availableDoctors.map((doc) => (
                  <DoctorStoryItem
                    key={doc.id}
                    name={doc.name}
                    nickname={doc.nickname}
                    photoUrl={doc.photoUrl || undefined}
                    isActive={selectedDoctor === doc.name}
                    onClick={() => setSelectedDoctor(selectedDoctor === doc.name ? null : doc.name)}
                  />
                ))}
                <Box sx={{ minWidth: 16, flexShrink: 0 }} />
              </Box>
            )}
          </Stack>
        }
        action={
          <IconButton onClick={onOpenFilters} aria-label="Фильтры" sx={{ display: "none" }}>
            <FilterListOutlined />
          </IconButton>
        }
      />
      <Divider />
      {loading && (
        <LinearProgress sx={{ height: 2, mt: "-2px" }} />
      )}
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
        {errorMsg ? (
          <Typography sx={{ p: 2 }} variant="body2" color="error">Ошибка: {errorMsg}</Typography>
        ) : Object.keys(groupedItemsWithGaps).length === 0 ? (
          <Typography sx={{ p: 2, color: loading ? "text.disabled" : "text.primary" }} variant="body2">
            {loading ? "Загрузка…" : "Нет записей"}
          </Typography>
        ) : (
          <Stack spacing={0}>
            {Object.entries(groupedItemsWithGaps).map(([docName, groupItems]) => {
              const apptCount = groupItems.filter(i => !isGap(i)).length;
              return (
                <Box key={docName}>
                  {!restrictToDoctorId && (
                    <Box sx={{ px: 2, py: 1, bgcolor: "action.selected", borderTop: "1px solid", borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Typography variant="subtitle2" fontWeight="bold">{docName}</Typography>
                      <Chip label={`${apptCount} приемов`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700, bgcolor: 'background.paper' }} />
                    </Box>
                  )}
                  <Box>
                    {groupItems.map((item) => {
                      if (isGap(item)) {
                        return (
                          <AddSlotButton
                            key={item.id}
                            timeStr={item.timeStr}
                            onClick={() => {
                              const iso = dayjs(item.startTime).format("YYYY-MM-DDTHH:mm");
                              onAddSlot?.(iso, item.doctorId);
                            }}
                          />
                        );
                      }
                      const a = item as Appointment;
                      const cash = Number(a.paid_cash || 0);
                      const card = Number(a.paid_card || 0);
                      const balance = Number(a.paid_balance || 0);
                      const bonuses = Number(a.paid_bonuses || 0);
                      const totalAmount = Number(a.total_amount || a.total_cost || a.estimated_total || a.discount || 0);
                      const totalPaid = cash + card + balance + bonuses;
                      const isCardOnly = card > 0 && cash === 0 && balance === 0 && bonuses === 0;
                      const paymentStyleStatus = a.status === "Оплачено" && isCardOnly ? "Оплачено безналом" : a.status;
                      return (
                        <Box
                          key={a.id}
                          onClick={() => onItemClick?.(a.id)}
                          sx={{ px: 2, py: 1.25, cursor: "pointer", borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: "none" }, "&:hover": { bgcolor: (t) => t.palette.action.hover } }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
                            <Stack>
                              <Stack direction="row" alignItems="center" gap={0.5}>
                                {a.is_night && <Tooltip title="Ночной"><NightlightOutlined color="action" fontSize="small" /></Tooltip>}
                                <Typography variant="subtitle2">{a.appointment_time}</Typography>
                              </Stack>
                              <Typography variant="body2" color="text.secondary">Пациент: {a.patient_name}</Typography>
                            </Stack>
                            <Stack alignItems="flex-end">
                              <Stack direction="row" alignItems="center" gap={1}>
                                {a.status !== "Завершено" && a.status !== "Оплачено" && a.status !== "Частично оплачено" && (
                                  <Chip
                                    label={(() => {
                                      const baseLabel = getStatusConfig(a.status).label;
                                      if (a.status === "Со скидкой" && a.discount > 0) {
                                        const fullPrice = totalAmount > 0 ? totalAmount : a.discount;
                                        const percent = Math.round((a.discount / fullPrice) * 100);
                                        return percent > 0 ? `${baseLabel} (${percent}%)` : baseLabel;
                                      }
                                      return baseLabel;
                                    })()}
                                    icon={getStatusConfig(a.status).icon}
                                    size="small"
                                    sx={getStatusChipSx(a.status)}
                                  />
                                )}
                                {(() => {
                                  if (totalPaid > 0) {
                                    return (
                                      <Chip
                                        label={<Stack direction="row" alignItems="center" gap={0.5}>{cash > 0 && <PaymentsOutlined sx={{ fontSize: 16 }} />}{card > 0 && <CreditCardOutlined sx={{ fontSize: 16 }} />}{balance > 0 && <AccountBalanceWalletOutlined sx={{ fontSize: 16 }} />}{bonuses > 0 && <CardGiftcardOutlined sx={{ fontSize: 16 }} />}{a.status}</Stack>}
                                        size="small"
                                        sx={getStatusChipSx(paymentStyleStatus)}
                                      />
                                    );
                                  }
                                  return null;
                                })()}
                                {a.has_bank_confirmation && (
                                  <Tooltip title="Оплата подтверждена банком">
                                    <Chip
                                      label="✓✓"
                                      size="small"
                                      sx={{ bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 700, fontSize: "0.7rem", letterSpacing: 1, height: 20, px: 0.5 }}
                                    />
                                  </Tooltip>
                                )}
                                {(a.has_conclusion || a.conclusion || (a.diagnosis_data && a.diagnosis_data.length > 0)) && (
                                  <Tooltip title="Есть заключение"><PrintOutlinedIcon sx={{ fontSize: 20, color: "action.active", opacity: 0.8 }} /></Tooltip>
                                )}
                                {notificationsMap?.has(a.id) && (() => {
                                  const typeMap = notificationsMap.get(a.id)!;
                                  const notifConfig: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
                                    created_10m:       { label: "Запись",   Icon: SmsOutlined,          color: "success.main" },
                                    reminder_2h:       { label: "Напомин.", Icon: AlarmOutlined,         color: "info.main" },
                                    rescheduled_10m:   { label: "Перенос",  Icon: EventRepeatOutlined,   color: "warning.main" },
                                    appointment_change:{ label: "Изменение",Icon: EditCalendarOutlined,  color: "warning.main" },
                                    appointment_cancel:{ label: "Отмена",   Icon: EventBusyOutlined,     color: "error.main" },
                                  };
                                  return [...typeMap.entries()].map(([t, sentAt]) => {
                                    const cfg = notifConfig[t] ?? { label: t, Icon: SmsOutlined, color: "success.main" };
                                    const time = sentAt ? dayjs(sentAt).format("DD.MM HH:mm") : "";
                                    return (
                                      <Tooltip key={t} title={`SMS: ${cfg.label}${time ? ` · ${time}` : ""}`}>
                                        <cfg.Icon sx={{ fontSize: 16, color: cfg.color, opacity: 0.9 }} />
                                      </Tooltip>
                                    );
                                  });
                                })()}
                              </Stack>
                              {(a.total_amount != null || a.total_cost != null || a.estimated_total != null) && (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                  Итого: {formatKGS(Number(a.total_amount || a.total_cost || a.estimated_total || a.discount || 0))}
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

export default AppointmentsList;
