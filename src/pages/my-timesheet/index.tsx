import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, keyframes, useTheme } from "@mui/material/styles";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import EditCalendarRounded from "@mui/icons-material/EditCalendarRounded";
import HourglassTopRounded from "@mui/icons-material/HourglassTopRounded";
import LockOutlined from "@mui/icons-material/LockOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import { useQuery } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "react-router";
import dayjs from "dayjs";

import { cancelTimesheetRequest, getMyTimesheet } from "../../api/timesheet";
import { djangoQueryKeys } from "../../api/queryKeys";
import { cascadeItem, TonedChip, UserAvatar } from "../../components/ui";
import { MyAttendanceDialog } from "../../components/attendance/MyAttendanceDialog";
import { dayTileStyle, isRequested } from "../../components/attendance/dayTile";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { subtleBg } from "../../theme/uiHelpers";
import {
  codesByKey,
  compactHours,
  currentMonth,
  formatHours,
  longDate,
  monthLabel,
  plural,
  shiftMonth,
  toNumber,
  WEEKDAY_SHORT,
} from "../timesheet/model";
import { RequestDialog } from "./RequestDialog";

const MotionBox = motion.create(Box);

const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, .45); }
  50% { box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
`;

const STATUS: Record<string, { label: string; tone: "warning" | "success" | "error" | null }> = {
  pending: { label: "Ждёт решения", tone: "warning" },
  approved: { label: "Подтверждена", tone: "success" },
  rejected: { label: "Отклонена", tone: "error" },
  canceled: { label: "Отозвана", tone: null },
};

const MyTimesheetPage: React.FC = () => {
  usePageTitle("Мой табель");
  const theme = useTheme();
  const { open: notify } = useNotification();
  const organizationId = useApiOrgId();
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get("month") || currentMonth();
  const [direction, setDirection] = React.useState(0);
  const [requestDate, setRequestDate] = React.useState<string | null>(null);
  const [attendanceOpen, setAttendanceOpen] = React.useState(false);

  const query = useQuery({
    queryKey: djangoQueryKeys.timesheet.my(organizationId, month),
    queryFn: ({ signal }) => getMyTimesheet(month, organizationId, signal),
    refetchOnWindowFocus: true,
  });
  const data = query.data;
  const codes = React.useMemo(() => codesByKey(data?.codes ?? []), [data]);
  const row = data?.row ?? null;

  const goMonth = (delta: number) => {
    setDirection(delta);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("month", shiftMonth(month, delta));
        return params;
      },
      { replace: true },
    );
  };

  const cells = row?.cells ?? [];
  const firstWeekday = data?.days[0]?.weekday ?? 0;
  const totals = row?.totals;
  const plannedPast = totals?.plannedDays ?? 0;
  const markedDays = cells.filter((cell) => {
    const code = cell.code ? codes.get(cell.code) : undefined;
    return code?.category === "work" && cell.plannedHours;
  }).length;
  const leaveOnPlanned = cells.filter((cell) => {
    const code = cell.code ? codes.get(cell.code) : undefined;
    return code?.category === "leave" && cell.plannedHours;
  }).length;
  const denominator = Math.max(0, plannedPast - leaveOnPlanned);
  const percent = denominator ? Math.round((Math.min(markedDays, denominator) / denominator) * 100) : 100;
  const missed = cells.filter((cell) => cell.state === "missing");
  const pendingRequests = (data?.requests ?? []).filter((r) => r.status === "pending");

  const cancel = async (id: number) => {
    try {
      await cancelTimesheetRequest(id, organizationId);
      notify?.({ type: "success", message: "Заявка отозвана" });
      void query.refetch();
    } catch (error) {
      notify?.({ type: "error", message: error instanceof Error ? error.message : "Не удалось" });
    }
  };

  const radius = 46;
  const circumference = 2 * Math.PI * radius;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1080, mx: "auto", width: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Hero */}
      <MotionBox
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        sx={{
          position: "relative",
          overflow: "hidden",
          p: { xs: 2, md: 3 },
          borderRadius: "20px",
          border: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            background: `radial-gradient(90% 120% at 100% 0%, ${alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.22 : 0.12)}, transparent 60%)`,
            pointerEvents: "none",
          },
        }}
      >
        <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ xs: "stretch", md: "center" }} sx={{ position: "relative" }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
            <UserAvatar src={row?.employee.photoUrl} name={row?.employee.fullName} size={56} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h5" fontWeight={900} letterSpacing={-0.5} noWrap>
                {row?.employee.fullName ?? "Мой табель"}
              </Typography>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
                <IconButton size="small" onClick={() => goMonth(-1)} aria-label="Предыдущий месяц">
                  <ChevronLeftRounded fontSize="small" />
                </IconButton>
                <Box sx={{ position: "relative", minWidth: 150, height: 26, overflow: "hidden" }}>
                  <AnimatePresence initial={false} mode="popLayout" custom={direction}>
                    <MotionBox
                      key={month}
                      initial={{ opacity: 0, x: direction * 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: direction * -30 }}
                      transition={{ duration: 0.25 }}
                      sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Typography fontWeight={800}>{monthLabel(month)}</Typography>
                    </MotionBox>
                  </AnimatePresence>
                </Box>
                <IconButton size="small" onClick={() => goMonth(1)} aria-label="Следующий месяц">
                  <ChevronRightRounded fontSize="small" />
                </IconButton>
                {data?.locked && (
                  <Tooltip title="Табель месяца закрыт">
                    <LockOutlined sx={{ fontSize: 16, color: "text.disabled", ml: 0.5 }} />
                  </Tooltip>
                )}
              </Stack>
            </Box>
          </Stack>
          {totals && (
            <Stack direction="row" spacing={{ xs: 1.5, md: 2.5 }} alignItems="center">
              <Box sx={{ position: "relative", width: { xs: 88, md: 112 }, height: { xs: 88, md: 112 }, flexShrink: 0 }}>
                <svg viewBox="0 0 112 112" width="100%" height="100%">
                  <circle cx="56" cy="56" r={radius} fill="none" stroke={subtleBg(theme, true)} strokeWidth="10" />
                  <motion.circle
                    cx="56"
                    cy="56"
                    r={radius}
                    fill="none"
                    stroke="url(#my-ring)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    transform="rotate(-90 56 56)"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: circumference * (1 - percent / 100) }}
                    transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <defs>
                    <linearGradient id="my-ring" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={theme.palette.primary.main} />
                      <stop offset="100%" stopColor="#14b8a6" />
                    </linearGradient>
                  </defs>
                </svg>
                <Stack sx={{ position: "absolute", inset: 0 }} alignItems="center" justifyContent="center">
                  <Typography sx={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
                    {markedDays}/{denominator}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>
                    отмечено
                  </Typography>
                </Stack>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: { xs: 0.75, md: 1 }, flex: 1, minWidth: 0 }}>
                <Stat label="Часы" value={`${formatHours(totals.hours) || 0} ч`} />
                <Stat label="Переработка" value={toNumber(totals.overtimeHours) ? `${formatHours(totals.overtimeHours)} ч` : "—"} />
                <Stat label="Пропуски" value={String(totals.missingDays)} tone={totals.missingDays ? "error" : undefined} />
                <Stat label="Отпуск · больн." value={`${totals.vacationDays} · ${totals.sickDays}`} />
              </Box>
            </Stack>
          )}
        </Stack>
      </MotionBox>

      {query.error && (
        <Alert severity="error" sx={{ borderRadius: "12px" }}>
          {query.error instanceof Error ? query.error.message : "Не удалось загрузить табель"}
        </Alert>
      )}
      {data && !row && (
        <Alert severity="info" sx={{ borderRadius: "12px" }}>
          Ваш аккаунт не привязан к карточке сотрудника — табель не ведётся.
        </Alert>
      )}

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="stretch">
        {/* Calendar */}
        <Box sx={{ flex: 1.6, p: { xs: 1.5, md: 2 }, borderRadius: "18px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
          <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography fontWeight={800} sx={{ flex: 1 }}>
              Календарь месяца
            </Typography>
            <Button size="small" startIcon={<InsightsOutlined />} onClick={() => setAttendanceOpen(true)} sx={{ borderRadius: "10px" }}>
              30 дней
            </Button>
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: { xs: 0.5, md: 0.75 } }}>
            {WEEKDAY_SHORT.map((weekday, index) => (
              <Typography
                key={weekday}
                variant="caption"
                fontWeight={800}
                align="center"
                sx={{ color: index >= 5 ? "error.main" : "text.secondary", pb: 0.5 }}
              >
                {weekday}
              </Typography>
            ))}
            {Array.from({ length: firstWeekday }).map((_, index) => (
              <Box key={`pad-${index}`} />
            ))}
            {!data &&
              Array.from({ length: 30 }).map((_, index) => (
                <Skeleton key={index} variant="rounded" sx={{ aspectRatio: "1", height: "auto", borderRadius: "12px" }} />
              ))}
            {data && row && (
              <MotionBox
                key={month}
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.012 } } }}
                initial="hidden"
                animate="show"
                sx={{ display: "contents" }}
              >
                {cells.map((cell) => {
                  const day = data.days[cell.day - 1];
                  const code = cell.code ? codes.get(cell.code) : undefined;
                  const style = dayTileStyle(theme, cell, code);
                  const missing = cell.state === "missing";
                  const requested = isRequested(cell);
                  const clickable = missing && !requested && !data.locked;
                  return (
                    <MotionBox key={cell.day} variants={cascadeItem}>
                      <Tooltip
                        title={
                          [
                            code?.name ?? (requested ? "Пропуск — заявка подана, ждёт решения" : missing ? "Пропуск" : cell.state === "pending" ? "Сегодня — ещё можно отметиться" : cell.state === "planned" ? "Рабочий день по графику" : ""),
                            cell.hours ? `${formatHours(cell.hours)} ч` : "",
                            day?.holiday ?? "",
                            clickable ? "нажмите, чтобы исправить" : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        }
                      >
                        <ButtonBase
                          onClick={() => clickable && setRequestDate(day?.date ?? null)}
                          sx={{
                            width: "100%",
                            aspectRatio: "1",
                            borderRadius: "12px",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            alignItems: "stretch",
                            p: { xs: 0.5, md: 0.75 },
                            cursor: clickable ? "pointer" : "default",
                            ...style,
                            ...(cell.state === "planned" ? { border: `1px dashed ${theme.palette.divider}`, bgcolor: "transparent" } : {}),
                            ...(day?.isToday ? { animation: `${pulse} 2.2s ease-in-out infinite` } : {}),
                            transition: "transform .15s ease",
                            "&:hover": clickable ? { transform: "translateY(-2px)" } : undefined,
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                            <Typography sx={{ fontSize: { xs: 11, md: 12.5 }, fontWeight: 800, lineHeight: 1, color: "inherit" }}>
                              {cell.day}
                            </Typography>
                            {day?.holiday && <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#ec4899" }} />}
                          </Stack>
                          <Typography
                            sx={{
                              fontSize: { xs: 10, md: 12 },
                              fontWeight: 900,
                              lineHeight: 1,
                              alignSelf: "flex-end",
                              color: "inherit",
                              opacity: cell.state === "planned" ? 0.5 : 1,
                            }}
                          >
                            {code ? (
                              code.key === "presence" && cell.hours
                                ? compactHours(cell.hours)
                                : `${code.letter}${cell.hours ? ` ${compactHours(cell.hours)}` : ""}`
                            ) : requested ? (
                              <HourglassTopRounded sx={{ fontSize: { xs: 12, md: 14 }, display: "block" }} />
                            ) : missing ? (
                              "!"
                            ) : cell.state === "planned" ? (
                              compactHours(cell.plannedHours)
                            ) : (
                              ""
                            )}
                          </Typography>
                        </ButtonBase>
                      </Tooltip>
                    </MotionBox>
                  );
                })}
              </MotionBox>
            )}
          </Box>
          {data && (
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
              {data.codes
                .filter((code) => code.isActive && code.category !== "rest")
                .map((code) => (
                  <Stack key={code.key} direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 12, height: 12, borderRadius: "4px", bgcolor: code.color }} />
                    <Typography variant="caption" fontWeight={600}>
                      {code.letter} — {code.name}
                    </Typography>
                  </Stack>
                ))}
            </Stack>
          )}
        </Box>

        {/* Side: missed + requests */}
        <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ p: 2, borderRadius: "18px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
            <Typography fontWeight={800} gutterBottom>
              Пропущенные дни
            </Typography>
            {missed.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {data ? "Пропусков нет — так держать 🎉" : " "}
              </Typography>
            ) : (
              <>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  {plural(missed.length, "день", "дня", "дней")} по графику без отметок. Забыли отметиться — подайте
                  заявку, руководитель исправит.
                </Typography>
                <Stack spacing={0.75}>
                  {missed.map((cell) => {
                    const date = data?.days[cell.day - 1]?.date ?? "";
                    const hasRequest = (cell.flags ?? []).includes("request");
                    return (
                      <Stack
                        key={cell.day}
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{ p: 1, borderRadius: "12px", bgcolor: alpha(theme.palette.error.main, 0.06) }}
                      >
                        <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>
                          {date ? longDate(date) : cell.day}
                        </Typography>
                        {hasRequest ? (
                          <TonedChip label="Заявка подана" toneName="warning" />
                        ) : (
                          <Button
                            size="small"
                            startIcon={<EditCalendarRounded />}
                            disabled={data?.locked}
                            onClick={() => setRequestDate(date)}
                            sx={{ borderRadius: "9px" }}
                          >
                            Исправить
                          </Button>
                        )}
                      </Stack>
                    );
                  })}
                </Stack>
              </>
            )}
          </Box>

          <Box sx={{ p: 2, borderRadius: "18px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
            <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
              <Typography fontWeight={800} sx={{ flex: 1 }}>
                Мои заявки
              </Typography>
              {pendingRequests.length > 0 && <TonedChip label={`ждут: ${pendingRequests.length}`} toneName="warning" />}
            </Stack>
            {(data?.requests ?? []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Заявок пока не было.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {data?.requests.slice(0, 12).map((request) => {
                  const status = STATUS[request.status];
                  return (
                    <Box key={request.id} sx={{ p: 1.25, borderRadius: "12px", bgcolor: subtleBg(theme) }}>
                      <Stack direction="row" spacing={1} alignItems="flex-start">
                        <Typography variant="body2" fontWeight={800} sx={{ flex: 1, minWidth: 0 }}>
                          {dayjs(request.date).format("DD.MM")} · {codes.get(request.code)?.name ?? request.code}
                          {request.startTime ? ` · ${request.startTime}–${request.endTime}` : ""}
                        </Typography>
                        <TonedChip label={status?.label ?? request.status} toneName={status?.tone ?? null} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        {request.reason}
                      </Typography>
                      {request.reviewComment && (
                        <Typography variant="caption" display="block" sx={{ mt: 0.25 }}>
                          {request.reviewedByName}: {request.reviewComment}
                        </Typography>
                      )}
                      {request.status === "pending" && (
                        <Button size="small" color="inherit" onClick={() => void cancel(request.id)} sx={{ mt: 0.5, borderRadius: "8px" }}>
                          Отозвать
                        </Button>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Stack>
      </Stack>

      {data && (
        <RequestDialog
          open={requestDate != null}
          date={requestDate}
          codes={data.codes}
          organizationId={organizationId}
          onClose={() => setRequestDate(null)}
          onCreated={() => void query.refetch()}
        />
      )}
      <MyAttendanceDialog open={attendanceOpen} onClose={() => setAttendanceOpen(false)} />
    </Box>
  );
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: "error" }) {
  const theme = useTheme();
  return (
    <Box sx={{ px: { xs: 1, md: 1.25 }, py: 0.75, borderRadius: "11px", bgcolor: subtleBg(theme, true), minWidth: { xs: 0, md: 104 } }}>
      <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ fontSize: { xs: 11, md: 12 } }}>
        {label}
      </Typography>
      <Typography
        fontWeight={900}
        noWrap
        sx={{ color: tone ? `${tone}.main` : "text.primary", lineHeight: 1.2, fontSize: { xs: 15, md: 16 } }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export default MyTimesheetPage;
