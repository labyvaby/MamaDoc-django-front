import React from "react";
import {
  Box,
  CircularProgress,
  IconButton,
  Portal,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import LoginOutlined from "@mui/icons-material/LoginOutlined";
import { AnimatePresence, motion } from "framer-motion";
import dayjs from "dayjs";

import { AppButton, AppCard } from "../ui";
import { useCan } from "../../hooks/useCan";
import { useDjangoSkudActions } from "../../hooks/useDjangoSkud";
import { usePermissions } from "../../hooks/usePermissions";

const MotionBox = motion(Box);
const SNOOZE_MS = 30 * 60 * 1000;

function readSnooze(storageKey: string | null): number | null {
  if (!storageKey) return null;
  try {
    const value = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(value) && value > Date.now() ? value : null;
  } catch {
    return null;
  }
}

/**
 * Неблокирующее глобальное напоминание СКУД.
 *
 * Показывается только сотрудникам с отдельным правом роли, если сегодня ещё
 * не было ни одной отметки и прямо сейчас нет открытой смены. После закрытой
 * смены повторно не появляется. Крестик откладывает напоминание на 30 минут,
 * чтобы оно не мешало работе с пациентом, но не терялось до конца дня.
 */
export const AttendanceReminder: React.FC = () => {
  const canShowReminder = useCan("attendance.reminder");
  const { activeEmployee } = usePermissions();
  const today = dayjs().format("YYYY-MM-DD");
  const historyFrom = dayjs().subtract(1, "day").format("YYYY-MM-DD");
  const storageKey = activeEmployee
    ? `mamadoc:attendance-reminder:${activeEmployee.id}:${today}`
    : null;
  const [snoozedUntil, setSnoozedUntil] = React.useState<number | null>(() =>
    readSnooze(storageKey),
  );

  const {
    shifts,
    canView,
    canClock,
    currentShift,
    actionLoading,
    statusLoading,
    statusError,
    locationLoading,
    isIpCorrect,
    handleStartShift,
  } = useDjangoSkudActions(true, "me", historyFrom, today, canShowReminder);

  const hasAttendanceToday = shifts.some(
    (shift) =>
      dayjs(shift.clockIn).format("YYYY-MM-DD") === today ||
      (shift.clockOut != null &&
        dayjs(shift.clockOut).format("YYYY-MM-DD") === today),
  );

  React.useEffect(() => {
    setSnoozedUntil(readSnooze(storageKey));
  }, [storageKey]);

  React.useEffect(() => {
    if (!snoozedUntil) return;
    const remaining = snoozedUntil - Date.now();
    if (remaining <= 0) {
      setSnoozedUntil(null);
      return;
    }
    const timeoutId = window.setTimeout(() => setSnoozedUntil(null), remaining);
    return () => window.clearTimeout(timeoutId);
  }, [snoozedUntil]);

  const handleSnooze = () => {
    if (!storageKey) return;
    const until = Date.now() + SNOOZE_MS;
    try {
      window.localStorage.setItem(storageKey, String(until));
    } catch {
      // localStorage может быть недоступен в приватном режиме — локальный
      // state всё равно корректно скроет напоминание на текущей странице.
    }
    setSnoozedUntil(until);
  };

  const show =
    canShowReminder &&
    canView &&
    canClock &&
    Boolean(activeEmployee) &&
    !statusLoading &&
    !statusError &&
    !currentShift &&
    !hasAttendanceToday &&
    (snoozedUntil == null || snoozedUntil <= Date.now());

  const clockButton = (mobile: boolean) => (
    <Tooltip
      title={!locationLoading && !isIpCorrect ? "Подключитесь к Wi-Fi клиники" : ""}
      placement="bottom"
    >
      <span style={mobile ? { display: "block", width: "100%" } : undefined}>
        <AppButton
          variant="contained"
          size="small"
          fullWidth={mobile}
          loading={actionLoading}
          disabled={locationLoading || !isIpCorrect}
          startIcon={
            actionLoading ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <LoginOutlined />
            )
          }
          onClick={() => void handleStartShift()}
          sx={{ whiteSpace: "nowrap" }}
        >
          Отметиться
        </AppButton>
      </span>
    </Tooltip>
  );

  return (
    <Portal>
      <Box
        sx={(t) => ({
          position: "fixed",
          zIndex: t.zIndex.snackbar,
          top: {
            xs: `${t.appLayout.header.height.mobile + 12}px`,
            md: `${t.appLayout.header.height.desktop + 12}px`,
          },
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          px: 1.5,
          pointerEvents: "none",
        })}
      >
        <AnimatePresence>
          {show && (
            <MotionBox
              key="attendance-reminder"
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              sx={{ width: "100%", maxWidth: 720, pointerEvents: "auto" }}
            >
              <AppCard
                variant="outlined"
                elevation={0}
                disableContentPadding
                sx={(t) => ({
                  position: "relative",
                  borderColor: alpha(t.palette.primary.main, 0.35),
                  bgcolor: "background.paper",
                })}
              >
                <Stack
                  direction="row"
                  alignItems="flex-start"
                  spacing={1.5}
                  sx={{
                    p: { xs: 1.5, sm: 1.75 },
                    pb: { xs: 0, md: 1.75 },
                    pr: { xs: 7, md: 1.75 },
                  }}
                >
                  <Box
                    sx={(t) => ({
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "primary.onSurface",
                      bgcolor: alpha(
                        t.palette.primary.main,
                        t.palette.mode === "dark" ? 0.16 : 0.1,
                      ),
                      "& .MuiSvgIcon-root": { fontSize: 20 },
                    })}
                  >
                    <AccessTimeOutlined />
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0, pt: 0.125 }}>
                    <Typography
                      variant="body2"
                      fontWeight={700}
                      sx={{ letterSpacing: -0.1, lineHeight: 1.35 }}
                    >
                      Вы ещё не отметили начало рабочего дня
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.25, lineHeight: 1.4 }}
                    >
                      Отметьте приход, чтобы рабочее время учлось автоматически.
                    </Typography>
                  </Box>

                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ display: { xs: "none", md: "flex" }, flexShrink: 0 }}
                  >
                    {clockButton(false)}
                    <Tooltip title="Напомнить через 30 минут" placement="bottom">
                      <IconButton
                        aria-label="Напомнить через 30 минут"
                        onClick={handleSnooze}
                        sx={(t) => ({
                          width: 40,
                          height: 40,
                          borderRadius: "10px",
                          border: 1,
                          borderColor: "divider",
                          color: "text.secondary",
                          "&:hover": {
                            color: "text.primary",
                            borderColor: alpha(t.palette.primary.main, 0.35),
                          },
                          "& .MuiSvgIcon-root": { fontSize: 19 },
                        })}
                      >
                        <CloseOutlined />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>

                <Box sx={{ display: { xs: "block", md: "none" }, p: 1.5, pt: 1.25 }}>
                  {clockButton(true)}
                </Box>

                <Tooltip title="Напомнить через 30 минут" placement="bottom">
                  <IconButton
                    aria-label="Напомнить через 30 минут"
                    onClick={handleSnooze}
                    sx={(t) => ({
                      display: { xs: "inline-flex", md: "none" },
                      position: "absolute",
                      top: 12,
                      right: 12,
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      border: 1,
                      borderColor: "divider",
                      color: "text.secondary",
                      "&:hover": {
                        color: "text.primary",
                        borderColor: alpha(t.palette.primary.main, 0.35),
                      },
                      "& .MuiSvgIcon-root": { fontSize: 19 },
                    })}
                  >
                    <CloseOutlined />
                  </IconButton>
                </Tooltip>
              </AppCard>
            </MotionBox>
          )}
        </AnimatePresence>
      </Box>
    </Portal>
  );
};

export default AttendanceReminder;
