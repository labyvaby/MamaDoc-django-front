import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import EventNoteOutlined from "@mui/icons-material/EventNoteOutlined";
import FingerprintOutlined from "@mui/icons-material/FingerprintOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import DoNotDisturbAltRounded from "@mui/icons-material/DoNotDisturbAltRounded";
import { useQuery } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import {
  approveTimesheetRequest,
  clearTimesheetMarks,
  getTimesheetCell,
  rejectTimesheetRequest,
  setTimesheetMarks,
  type TimesheetAccess,
  type TimesheetCode,
  type TimesheetMarksResult,
  type TimesheetRequest,
} from "../../api/timesheet";
import { getErrorCode } from "../../api/client";
import { AppBottomSheet, TonedChip, UserAvatar } from "../../components/ui";
import { subtleBg, subtleBorder } from "../../theme/uiHelpers";
import { codeFill, codeInk } from "./codeColors";
import { formatHours, longDate, markableCodes, toNumber } from "./model";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Ручная отметка",
  skud: "По данным СКУД",
  schedule: "По расписанию",
  holiday: "Праздничный день",
};

const REQUEST_STATUS: Record<TimesheetRequest["status"], { label: string; tone: "warning" | "success" | "error" | null }> = {
  pending: { label: "Ждёт решения", tone: "warning" },
  approved: { label: "Подтверждена", tone: "success" },
  rejected: { label: "Отклонена", tone: "error" },
  canceled: { label: "Отозвана", tone: null },
};

export interface CellDrawerProps {
  open: boolean;
  employeeId: number | null;
  date: string | null;
  codes: TimesheetCode[];
  access: TimesheetAccess;
  organizationId?: number | null;
  callerEmployeeId?: number | null;
  onClose: () => void;
  onChanged: (result: TimesheetMarksResult | null) => void;
}

export const CellDrawer: React.FC<CellDrawerProps> = ({
  open,
  employeeId,
  date,
  codes,
  access,
  organizationId,
  callerEmployeeId,
  onClose,
  onChanged,
}) => {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  const byKey = React.useMemo(() => new Map(codes.map((c) => [c.key, c])), [codes]);

  const query = useQuery({
    queryKey: ["django", "timesheet", "cell", organizationId ?? null, employeeId, date],
    queryFn: ({ signal }) =>
      getTimesheetCell({ employeeId: employeeId as number, date: date as string }, organizationId, signal),
    enabled: open && employeeId != null && date != null,
  });
  const detail = query.data;

  const [code, setCode] = React.useState<string>("presence");
  const [dayHours, setDayHours] = React.useState("");
  const [nightHours, setNightHours] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [reviewComment, setReviewComment] = React.useState("");
  const [approveHours, setApproveHours] = React.useState<Record<number, string>>({});

  React.useEffect(() => {
    if (!detail) return;
    const mark = detail.mark;
    const cell = detail.cell;
    setCode(mark?.code ?? cell.code ?? "presence");
    if (mark) {
      setDayHours(formatHours(mark.dayHours).replace(",", ".") || "0");
      setNightHours(formatHours(mark.nightHours).replace(",", ".") || "0");
      setComment(mark.comment);
    } else {
      const total = toNumber(cell.hours);
      const night = toNumber(cell.nightHours);
      const fallbackDay = total ? total - night : toNumber(detail.plannedDayHours);
      setDayHours(String(Math.round(fallbackDay * 100) / 100));
      setNightHours(String(total ? night : toNumber(detail.plannedNightHours)));
      setComment("");
    }
  }, [detail]);

  const manual = detail?.cell.source === "manual";
  const canEdit = Boolean(detail) && !detail?.locked && (manual ? access.update : access.create);
  const canClear = Boolean(detail) && !detail?.locked && manual && access.delete;
  const current = detail?.cell.code ? byKey.get(detail.cell.code) : undefined;
  const skudTotal = (detail?.shifts ?? []).reduce(
    (sum, s) => sum + toNumber(s.dayHours) + toNumber(s.nightHours),
    0,
  );

  const handleError = (error: unknown) => {
    const codeName = getErrorCode(error);
    notify?.({
      type: "error",
      message:
        codeName === "TIMESHEET_CLOSED"
          ? "Месяц закрыт — изменения только после переоткрытия"
          : error instanceof Error
            ? error.message
            : "Не удалось сохранить",
    });
  };

  const save = async () => {
    if (!detail || employeeId == null || !date) return;
    setSaving(true);
    try {
      const result = await setTimesheetMarks(
        [
          {
            employeeId,
            date,
            code,
            dayHours: Number(dayHours.replace(",", ".")) || 0,
            nightHours: Number(nightHours.replace(",", ".")) || 0,
            comment,
          },
        ],
        organizationId,
      );
      notify?.({ type: "success", message: "Отметка сохранена" });
      onChanged(result);
      void query.refetch();
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (employeeId == null || !date) return;
    setSaving(true);
    try {
      const result = await clearTimesheetMarks([{ employeeId, date }], organizationId);
      notify?.({ type: "success", message: "Отметка снята — ячейка снова считается сама" });
      onChanged(result);
      void query.refetch();
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  };

  const review = async (request: TimesheetRequest, approve: boolean) => {
    setSaving(true);
    try {
      if (approve) {
        const hours = approveHours[request.id];
        await approveTimesheetRequest(
          request.id,
          {
            comment: reviewComment,
            ...(hours ? { dayHours: Number(hours.replace(",", ".")) || 0, nightHours: 0 } : {}),
          },
          organizationId,
        );
        notify?.({ type: "success", message: "Заявка подтверждена — день исправлен" });
      } else {
        await rejectTimesheetRequest(request.id, reviewComment, organizationId);
        notify?.({ type: "success", message: "Заявка отклонена" });
      }
      setReviewComment("");
      onChanged(null);
      void query.refetch();
    } catch (error) {
      const name = getErrorCode(error);
      notify?.({
        type: "error",
        message:
          name === "SELF_APPROVAL"
            ? "Свою заявку подтверждает другой сотрудник"
            : error instanceof Error
              ? error.message
              : "Не удалось",
      });
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <Box sx={{ p: { xs: 2, md: 2.5 }, display: "flex", flexDirection: "column", gap: 2 }}>
      {!detail ? (
        <Stack spacing={1.5}>
          <Skeleton variant="rounded" height={64} />
          <Skeleton variant="rounded" height={88} />
          <Skeleton variant="rounded" height={160} />
        </Stack>
      ) : (
        <>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <UserAvatar src={detail.employee.photoUrl} name={detail.employee.fullName} size={44} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography fontWeight={800} noWrap>
                {detail.employee.fullName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {longDate(detail.date)}
                {detail.holiday ? ` · ${detail.holiday}` : ""}
              </Typography>
            </Box>
            {!isPhone && (
              <IconButton onClick={onClose} aria-label="Закрыть">
                <CloseOutlined />
              </IconButton>
            )}
          </Stack>

          <Box
            sx={{
              p: 1.75,
              borderRadius: "14px",
              border: 1,
              borderColor: current ? alpha(current.color, 0.4) : "divider",
              background: current
                ? `linear-gradient(135deg, ${codeFill(theme, current.color, 1.2)}, transparent 75%)`
                : subtleBg(theme),
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  fontWeight: 900,
                  color: current ? codeInk(theme, current.color) : "text.disabled",
                  bgcolor: current ? codeFill(theme, current.color, 1.4) : subtleBg(theme, true),
                }}
              >
                {current?.letter ?? (detail.cell.state === "missing" ? "!" : "—")}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={800}>
                  {current?.name ??
                    (detail.cell.state === "missing"
                      ? "Пропуск"
                      : detail.cell.state === "pending"
                        ? "Ждём отметку"
                        : detail.cell.state === "planned"
                          ? "Рабочий день по графику"
                          : "Нет данных")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {detail.cell.source ? SOURCE_LABEL[detail.cell.source] : "Нет отметок СКУД и ручных отметок"}
                  {detail.mark?.closesBooking ? " · запись клиентов закрыта" : ""}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Fact label="Отработано" value={detail.cell.hours ? `${formatHours(detail.cell.hours)} ч` : "—"} />
              <Fact label="По графику" value={toNumber(detail.plannedHours) ? `${formatHours(detail.plannedHours)} ч` : "—"} />
              <Fact label="СКУД" value={detail.shifts.length ? `${formatHours(skudTotal)} ч` : "нет"} />
            </Stack>
          </Box>

          {detail.locked && (
            <Alert severity="info" icon={<LockOutlined fontSize="small" />} sx={{ borderRadius: "12px" }}>
              Месяц закрыт. Изменить отметку можно после переоткрытия табеля.
            </Alert>
          )}

          <Section icon={<FingerprintOutlined />} title="Смены СКУД">
            {detail.shifts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                В этот день отметок прихода нет.
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {detail.shifts.map((shift) => (
                  <Stack
                    key={shift.id}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ p: 1, borderRadius: "10px", bgcolor: subtleBg(theme) }}
                  >
                    <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {dayjs(shift.clockIn).format("HH:mm")}
                    </Typography>
                    <ArrowForwardRounded sx={{ fontSize: 14, color: "text.disabled" }} />
                    <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {shift.clockOut ? dayjs(shift.clockOut).format("HH:mm") : "на смене"}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {formatHours(toNumber(shift.dayHours) + toNumber(shift.nightHours))} ч
                      {shift.branchName ? ` · ${shift.branchName}` : ""}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Section>

          <Section icon={<EventNoteOutlined />} title="План по графику">
            {detail.plan.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                По графику не работает.
              </Typography>
            ) : (
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {detail.plan.map((interval) => (
                  <Chip
                    key={`${interval.start}-${interval.end}`}
                    size="small"
                    label={`${interval.start}–${interval.end}`}
                    sx={{ fontWeight: 700, borderRadius: "8px" }}
                  />
                ))}
              </Stack>
            )}
          </Section>

          {canEdit && (
            <Section icon={<AccessTimeOutlined />} title={manual ? "Изменить отметку" : "Поставить отметку"}>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 0.75 }}>
                {markableCodes(codes).map((item) => {
                  const selected = item.key === code;
                  return (
                    <ButtonBase
                      key={item.key}
                      onClick={() => {
                        setCode(item.key);
                        if (item.key !== "presence" && item.category !== "work") {
                          setDayHours("0");
                          setNightHours("0");
                        }
                      }}
                      sx={{
                        p: 0.75,
                        borderRadius: "10px",
                        gap: 0.75,
                        justifyContent: "flex-start",
                        border: `1px solid ${selected ? item.color : subtleBorder(theme)}`,
                        bgcolor: selected ? codeFill(theme, item.color, 1.2) : "transparent",
                        boxShadow: selected ? `0 0 0 2px ${alpha(item.color, 0.25)}` : "none",
                        transition: "all .15s ease",
                      }}
                    >
                      <Box
                        sx={{
                          minWidth: 24,
                          height: 24,
                          px: 0.5,
                          borderRadius: "7px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 900,
                          color: codeInk(theme, item.color),
                          bgcolor: codeFill(theme, item.color, 1.3),
                        }}
                      >
                        {item.letter}
                      </Box>
                      <Typography variant="caption" fontWeight={700} noWrap>
                        {item.name}
                      </Typography>
                    </ButtonBase>
                  );
                })}
              </Box>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                <TextField
                  label="Днём, ч"
                  size="small"
                  value={dayHours}
                  onChange={(e) => setDayHours(e.target.value)}
                  inputProps={{ inputMode: "decimal" }}
                  fullWidth
                />
                <TextField
                  label="Ночью, ч"
                  size="small"
                  value={nightHours}
                  onChange={(e) => setNightHours(e.target.value)}
                  inputProps={{ inputMode: "decimal" }}
                  fullWidth
                />
              </Stack>
              <Stack direction="row" spacing={0.75} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                {detail.shifts.length > 0 && (
                  <QuickHours
                    label={`По СКУД · ${formatHours(skudTotal)} ч`}
                    onClick={() => {
                      const night = detail.shifts.reduce((sum, s) => sum + toNumber(s.nightHours), 0);
                      setDayHours(String(Math.round((skudTotal - night) * 100) / 100));
                      setNightHours(String(Math.round(night * 100) / 100));
                    }}
                  />
                )}
                {toNumber(detail.plannedHours) > 0 && (
                  <QuickHours
                    label={`По графику · ${formatHours(detail.plannedHours)} ч`}
                    onClick={() => {
                      setDayHours(String(toNumber(detail.plannedDayHours)));
                      setNightHours(String(toNumber(detail.plannedNightHours)));
                    }}
                  />
                )}
                <QuickHours
                  label="Без часов"
                  onClick={() => {
                    setDayHours("0");
                    setNightHours("0");
                  }}
                />
              </Stack>
              <TextField
                label="Комментарий"
                size="small"
                fullWidth
                multiline
                minRows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                sx={{ mt: 1.5 }}
                inputProps={{ maxLength: 255 }}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                <Button
                  variant="contained"
                  onClick={() => void save()}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CheckRounded />}
                  sx={{ borderRadius: "10px", flex: 1 }}
                >
                  Сохранить
                </Button>
                {canClear && (
                  <Button color="error" onClick={() => void clear()} disabled={saving} sx={{ borderRadius: "10px" }}>
                    Снять отметку
                  </Button>
                )}
              </Stack>
            </Section>
          )}

          {detail.requests.length > 0 && (
            <Section icon={<EventNoteOutlined />} title="Заявки сотрудника">
              <Stack spacing={1}>
                {detail.requests.map((request) => {
                  const status = REQUEST_STATUS[request.status];
                  const own = callerEmployeeId != null && request.employeeId === callerEmployeeId;
                  const reviewable = request.status === "pending" && access.approve && !own;
                  return (
                    <Box key={request.id} sx={{ p: 1.25, borderRadius: "12px", border: 1, borderColor: "divider" }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TonedChip label={status.label} toneName={status.tone} />
                        <Typography variant="caption" color="text.secondary">
                          {byKey.get(request.code)?.name ?? request.code}
                          {request.startTime ? ` · ${request.startTime}–${request.endTime}` : ""}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ mt: 0.75 }}>
                        {request.reason}
                      </Typography>
                      {request.reviewComment && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                          {request.reviewedByName}: {request.reviewComment}
                        </Typography>
                      )}
                      {reviewable && (
                        <Stack spacing={1} sx={{ mt: 1.25 }}>
                          <Stack direction="row" spacing={1}>
                            <TextField
                              size="small"
                              label="Часы"
                              value={approveHours[request.id] ?? formatHours(request.requestedHours).replace(",", ".")}
                              onChange={(e) => setApproveHours((prev) => ({ ...prev, [request.id]: e.target.value }))}
                              sx={{ width: 96 }}
                            />
                            <TextField
                              size="small"
                              label="Комментарий"
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                              fullWidth
                            />
                          </Stack>
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              startIcon={<CheckRounded />}
                              onClick={() => void review(request, true)}
                              disabled={saving}
                              sx={{ borderRadius: "10px", flex: 1 }}
                            >
                              Подтвердить
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              startIcon={<DoNotDisturbAltRounded />}
                              onClick={() => void review(request, false)}
                              disabled={saving}
                              sx={{ borderRadius: "10px" }}
                            >
                              Отклонить
                            </Button>
                          </Stack>
                        </Stack>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Section>
          )}

          <Section icon={<HistoryOutlined />} title="История правок">
            {detail.revisions.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Ячейку вручную не меняли — она считается сама.
              </Typography>
            ) : (
              <Stack spacing={0} sx={{ position: "relative", pl: 2 }}>
                <Box sx={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, bgcolor: subtleBg(theme, true) }} />
                {detail.revisions.map((revision) => (
                  <Box key={revision.id} sx={{ position: "relative", pb: 1.5 }}>
                    <Box
                      sx={{
                        position: "absolute",
                        left: -15,
                        top: 5,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        bgcolor:
                          revision.action === "deleted"
                            ? "error.main"
                            : revision.action === "created"
                              ? "success.main"
                              : "primary.main",
                        boxShadow: `0 0 0 3px ${theme.palette.background.paper}`,
                      }}
                    />
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                      <SnapshotChip snapshot={revision.before} codes={byKey} />
                      <ArrowForwardRounded sx={{ fontSize: 14, color: "text.disabled" }} />
                      <SnapshotChip snapshot={revision.after} codes={byKey} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                      {revision.actorName || "Система"} · {dayjs(revision.createdAt).format("DD.MM.YYYY HH:mm")}
                      {revision.source === "schedule" ? " · по графику" : revision.source === "request" ? " · по заявке" : ""}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Section>
        </>
      )}
    </Box>
  );

  if (isPhone) {
    return (
      <AppBottomSheet open={open} onClose={onClose}>
        {body}
      </AppBottomSheet>
    );
  }
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 440, maxWidth: "100vw", borderTopLeftRadius: 16, borderBottomLeftRadius: 16 } }}
    >
      {body}
    </Drawer>
  );
};

function Fact({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <Box sx={{ flex: 1, p: 1, borderRadius: "10px", bgcolor: subtleBg(theme, true), minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" noWrap>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={800} noWrap>
        {value}
      </Typography>
    </Box>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, color: "text.secondary" }}>
        <Box sx={{ display: "flex", "& .MuiSvgIcon-root": { fontSize: 17 } }}>{icon}</Box>
        <Typography variant="caption" fontWeight={800} sx={{ letterSpacing: 0.4, textTransform: "uppercase" }}>
          {title}
        </Typography>
      </Stack>
      {children}
      <Divider sx={{ mt: 2, opacity: 0.6 }} />
    </Box>
  );
}

function QuickHours({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Chip
      size="small"
      label={label}
      onClick={onClick}
      variant="outlined"
      sx={{ borderRadius: "8px", fontWeight: 600 }}
    />
  );
}

function SnapshotChip({
  snapshot,
  codes,
}: {
  snapshot: Record<string, string> | null;
  codes: Map<string, TimesheetCode>;
}) {
  const theme = useTheme();
  if (!snapshot) {
    return <Chip size="small" label="авто" variant="outlined" sx={{ borderRadius: "7px", height: 22 }} />;
  }
  const code = codes.get(snapshot.code);
  const hours = toNumber(snapshot.dayHours) + toNumber(snapshot.nightHours);
  const color = code?.color ?? theme.palette.grey[500];
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 0.75,
        height: 22,
        borderRadius: "7px",
        fontSize: 12,
        fontWeight: 800,
        color: codeInk(theme, color),
        bgcolor: codeFill(theme, color, 1.2),
      }}
    >
      {snapshot.letter}
      {hours ? <span style={{ fontWeight: 600, opacity: 0.8 }}>{formatHours(hours)} ч</span> : null}
    </Box>
  );
}

export default CellDrawer;
