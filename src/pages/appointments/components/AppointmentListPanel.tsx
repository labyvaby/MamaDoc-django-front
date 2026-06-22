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
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import dayjs from "dayjs";

import type { DjangoAppointment } from "../../../api/appointments";
import { formatKGS } from "../../../utility/format";
import {
  getStatusConfig,
  getStatusChipSx,
  normalizeDjangoStatus,
  DJANGO_STATUS_LABEL,
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
  onSelect: (a: DjangoAppointment) => void;
  onEdit: (a: DjangoAppointment) => void;
  onPay: (a: DjangoAppointment) => void;
  onAddSlot?: (dateIso: string) => void;
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

// ─── DoctorStoryItem — Instagram-style аватар врача ──────────────────────────

type DoctorStoryItemProps = {
  name: string;
  photoUrl?: string;
  isActive: boolean;
  onClick: () => void;
};

const DoctorStoryItem: React.FC<DoctorStoryItemProps> = ({ name, photoUrl, isActive, onClick }) => {
  const theme = useTheme();
  const displayName = name.split(" ")[0];

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
      borderRadius: 1.5,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "primary.onSurface",
      cursor: "pointer",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
      "&:hover": {
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
        transform: "translateY(-1px)",
        boxShadow: (theme) =>
          `0 4px 12px ${theme.palette.mode === "dark" ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.05)"}`,
      },
      "&:active": { transform: "scale(0.98)" },
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
  canUpdate: _canUpdate,
  canManageFinance,
  canViewFinance,
  onSelect,
  onEdit: _onEdit,
  onPay: _onPay,
  onAddSlot,
}) => {
  const theme = useTheme();
  const titleDate = date ? date.format("DD.MM.YYYY") : "";

  // ── Doctor filter state ────────────────────────────────────────────────────
  const [selectedDoctor, setSelectedDoctor] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedDoctor(null);
  }, [titleDate]);

  // ── Build doctor list from appointments (id → name, photoUrl) ─────────────
  const availableDoctors = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; photoUrl: string | null }>();
    for (const appt of items) {
      for (const sl of appt.services) {
        if (sl.employee && !map.has(String(sl.employee.id))) {
          map.set(String(sl.employee.id), {
            id: String(sl.employee.id),
            name: sl.employee.fullName,
            photoUrl: null,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [items]);

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
            .filter((sl) => sl.employee != null)
            .map((sl) => sl.employee!.fullName),
        ),
      );

      if (names.length === 0) {
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
  }, [filteredItems]);

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

      for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const start = dayjs(current.scheduledAt);
        const isCancelled = isCancelledStatus(current.status);

        // Cancelled future appointment → show gap slot before it
        if (isCancelled && start.isAfter(dayjs())) {
          const key = `gap-can-${current.id}`;
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

            {availableDoctors.length > 0 && (
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
                      const debt = Number(a.debt ?? 0);
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
                      const paymentStyleStatus =
                        a.paymentStatus === "paid" ? "Оплачено" :
                        a.paymentStatus === "partial" ? "Частично оплачено" :
                        displayStatus;

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
                                        <PaymentsOutlined sx={{ fontSize: 16 }} />
                                        <span>{paymentStyleStatus}</span>
                                      </Stack>
                                    }
                                    size="small"
                                    sx={getStatusChipSx(paymentStyleStatus)}
                                  />
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

                              {/* Долг */}
                              {showPayCol && debt > 0 && (
                                <Typography variant="caption" color="warning.main" fontWeight={700}>
                                  долг {formatKGS(a.debt)}
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
