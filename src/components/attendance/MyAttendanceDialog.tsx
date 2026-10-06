import React from "react";
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogContent,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, keyframes, useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";

import { getMyTimesheet } from "../../api/timesheet";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { subtleBg } from "../../theme/uiHelpers";
import { currentMonth, formatHours, MONTH_NAMES, MONTH_NAMES_GENITIVE } from "../../pages/timesheet/model";
import { dayTileStyle, isRequested } from "./dayTile";
import { RequestDialog } from "../../pages/my-timesheet/RequestDialog";

const MotionBox = motion.create(Box);

const breathe = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(20, 184, 166, .45); }
  50% { box-shadow: 0 0 0 5px rgba(20, 184, 166, 0); }
`;

export interface MyAttendanceDialogProps {
  open: boolean;
  onClose: () => void;
}

export const MyAttendanceDialog: React.FC<MyAttendanceDialogProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const organizationId = useApiOrgId();
  const month = currentMonth();
  const [requestDate, setRequestDate] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: djangoQueryKeys.timesheet.my(organizationId, month),
    queryFn: ({ signal }) => getMyTimesheet(month, organizationId, signal),
    enabled: open,
  });
  const data = query.data;
  const codes = React.useMemo(() => new Map((data?.codes ?? []).map((c) => [c.key, c])), [data]);
  const recent = React.useMemo(() => data?.recent ?? [], [data]);

  const groups = React.useMemo(() => {
    const result: { key: string; title: string; cells: typeof recent }[] = [];
    for (const item of recent) {
      const key = item.date.slice(0, 7);
      let group = result.find((g) => g.key === key);
      if (!group) {
        const monthIndex = Number(key.slice(5, 7)) - 1;
        group = { key, title: MONTH_NAMES[monthIndex] ?? key, cells: [] };
        result.push(group);
      }
      group.cells.push(item);
    }
    return result;
  }, [recent]);

  // Рабочие по графику дни, кроме отпусков и больничных: из них «отмечено» —
  // дни, где есть явка (СКУД или ручная).
  const plannedDays = recent.filter((item) => {
    if (!item.cell.plannedHours || item.cell.state === "planned") return false;
    const code = item.cell.code ? codes.get(item.cell.code) : undefined;
    return code?.category !== "leave";
  });
  const planned = plannedDays.length;
  const marked = plannedDays.filter((item) => {
    const code = item.cell.code ? codes.get(item.cell.code) : undefined;
    return code?.category === "work";
  }).length;
  const missed = recent.filter((item) => item.cell.state === "missing");

  const dateShort = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return `${d.getDate()} ${MONTH_NAMES_GENITIVE[d.getMonth()].slice(0, 3)}`;
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen={fullScreen}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: fullScreen ? 0 : "20px", overflow: "hidden" } }}
      >
        <Box
          sx={{
            position: "relative",
            px: 3,
            pt: 3,
            pb: 2,
            background: `radial-gradient(120% 80% at 0% 0%, ${alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.25 : 0.14)}, transparent 60%)`,
          }}
        >
          <IconButton onClick={onClose} sx={{ position: "absolute", top: 12, right: 12 }} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
          <Typography variant="h5" fontWeight={900} letterSpacing={-0.5}>
            Моя посещаемость
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={800}
            sx={{ letterSpacing: 1, textTransform: "uppercase" }}
          >
            Последние 30 дней · сегодня справа
          </Typography>
        </Box>
        <DialogContent sx={{ pt: 0 }}>
          {!data ? (
            <Stack spacing={1}>
              <Skeleton variant="rounded" height={140} />
              <Skeleton variant="rounded" height={60} />
            </Stack>
          ) : !data.row ? (
            <Typography color="text.secondary" sx={{ py: 3 }}>
              Ваш аккаунт не привязан к карточке сотрудника — посещаемость не считается.
            </Typography>
          ) : (
            <>
              {groups.map((group) => (
                <Box key={group.key} sx={{ mb: 1.5 }}>
                  <Typography
                    variant="caption"
                    fontWeight={800}
                    color="text.secondary"
                    sx={{ letterSpacing: 1, textTransform: "uppercase" }}
                  >
                    {group.title}
                  </Typography>
                  <MotionBox
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.015 } } }}
                    sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.75, mt: 0.75 }}
                  >
                    {group.cells.map(({ date, cell }) => {
                      const code = cell.code ? codes.get(cell.code) : undefined;
                      const style = dayTileStyle(theme, cell, code);
                      const isToday = date === data.today;
                      const requested = isRequested(cell);
                      const clickable = cell.state === "missing" && !requested;
                      return (
                        <MotionBox
                          key={date}
                          variants={{ hidden: { opacity: 0, scale: 0.7 }, show: { opacity: 1, scale: 1 } }}
                        >
                          <Tooltip
                            title={
                              `${dateShort(date)}: ${code?.name ?? (requested ? "заявка подана, ждёт решения" : cell.state === "missing" ? "пропуск" : cell.state === "pending" ? "ещё можно отметиться" : "нет данных")}` +
                              (cell.hours ? ` · ${formatHours(cell.hours)} ч` : "") +
                              (clickable ? " — нажмите, чтобы исправить" : "")
                            }
                          >
                            <Box component="span" sx={{ display: "block" }}>
                            <ButtonBase
                              disabled={!clickable}
                              onClick={() => setRequestDate(date)}
                              sx={{
                                width: "100%",
                                aspectRatio: "1",
                                borderRadius: "9px",
                                display: "flex",
                                flexDirection: "column",
                                fontSize: 11,
                                fontWeight: 800,
                                lineHeight: 1,
                                ...style,
                                ...(isToday ? { animation: `${breathe} 2s ease-in-out infinite` } : {}),
                                "&.Mui-disabled": { color: style.color },
                                transition: "transform .12s ease",
                                "&:hover": clickable ? { transform: "scale(1.08)" } : undefined,
                              }}
                            >
                              <span>{Number(date.slice(8, 10))}</span>
                              {code && code.key !== "presence" && code.category !== "rest" && (
                                <span style={{ fontSize: 8.5, opacity: 0.85, marginTop: 1 }}>{code.letter}</span>
                              )}
                            </ButtonBase>
                            </Box>
                          </Tooltip>
                        </MotionBox>
                      );
                    })}
                  </MotionBox>
                </Box>
              ))}

              <Stack direction="row" spacing={3} sx={{ my: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: 30, fontWeight: 900, color: "#14b8a6", lineHeight: 1 }}>
                    {marked} / {planned}
                  </Typography>
                  <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ letterSpacing: 1 }}>
                    ОТМЕЧЕНО
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 30, fontWeight: 900, color: "error.main", lineHeight: 1 }}>
                    {missed.length}
                  </Typography>
                  <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ letterSpacing: 1 }}>
                    ПРОПУЩЕНО
                  </Typography>
                </Box>
              </Stack>

              {missed.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="caption"
                    fontWeight={800}
                    color="text.secondary"
                    sx={{ letterSpacing: 1, textTransform: "uppercase" }}
                  >
                    Пропущенные дни — нажмите, чтобы исправить
                  </Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                    {missed.map(({ date, cell }) => {
                      const requested = isRequested(cell);
                      const tone = requested ? theme.palette.warning.main : theme.palette.error.main;
                      return (
                        <ButtonBase
                          key={date}
                          disabled={requested}
                          onClick={() => setRequestDate(date)}
                          sx={{
                            px: 1.25,
                            height: 30,
                            borderRadius: "9px",
                            fontSize: 12.5,
                            fontWeight: 800,
                            color: tone,
                            bgcolor: alpha(tone, 0.1),
                            border: `1px ${requested ? "dashed" : "solid"} ${alpha(tone, requested ? 0.7 : 0.35)}`,
                            "&:hover": { bgcolor: alpha(tone, 0.18) },
                            "&.Mui-disabled": { color: tone },
                          }}
                        >
                          {dateShort(date)}
                          {requested ? " · заявка подана" : ""}
                        </ButtonBase>
                      );
                    })}
                  </Stack>
                </Box>
              )}

              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, py: 1.5, borderTop: 1, borderColor: "divider" }}>
                {[
                  { label: "Отметился", style: { bgcolor: "#14b8a6", border: "1px solid #14b8a6" } },
                  { label: "Отметку поставил админ", style: { border: "1.5px solid #14b8a6" } },
                  {
                    label: "Пропуск",
                    style: {
                      backgroundImage: `repeating-linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.45)} 0 3px, transparent 3px 7px)`,
                      border: `1px solid ${alpha(theme.palette.error.main, 0.6)}`,
                    },
                  },
                  {
                    label: "Заявка подана",
                    style: { bgcolor: alpha(theme.palette.warning.main, 0.1), border: `1.5px dashed ${theme.palette.warning.main}` },
                  },
                  { label: "Ещё можно отметиться", style: { border: `1.5px dashed ${theme.palette.primary.main}` } },
                  { label: "Выходной по графику", style: { bgcolor: subtleBg(theme, true) } },
                  { label: "Отпуск, больничный", style: { bgcolor: alpha("#f59e0b", 0.35), border: "1px solid #f59e0b" } },
                ].map((item) => (
                  <Stack key={item.label} direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 16, height: 16, borderRadius: "5px", flexShrink: 0, ...item.style }} />
                    <Typography variant="caption" fontWeight={600}>
                      {item.label}
                    </Typography>
                  </Stack>
                ))}
              </Box>
            </>
          )}
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1, pb: 1 }}>
            <Button
              startIcon={<CalendarMonthOutlined />}
              onClick={() => {
                onClose();
                navigate("/my-timesheet");
              }}
              sx={{ borderRadius: "10px" }}
            >
              Мой табель
            </Button>
            <Button variant="contained" onClick={onClose} sx={{ borderRadius: "10px" }}>
              Закрыть
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
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
    </>
  );
};

export default MyAttendanceDialog;
