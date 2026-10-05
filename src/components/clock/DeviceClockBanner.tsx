import React from "react";
import { Alert, AlertTitle, Box, Button, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import { getServerSkewMs, subscribeServerSkew } from "../../api/serverClock";
import { usePermissions } from "../../hooks/usePermissions";
import {
  describeClockProblem,
  detectClockProblem,
  dismissKey,
  resolveClinicTimeZone,
  zoneOffsetMinutes,
} from "../../utils/deviceClock";

const DISMISS_STORAGE_KEY = "deviceClockBanner:dismissed";

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(key: string): void {
  try {
    sessionStorage.setItem(DISMISS_STORAGE_KEY, key);
  } catch {
    // Хранилище недоступно — плашка просто вернётся после перезагрузки.
  }
}

/**
 * Время сейчас, раз в минуту и при возврате на вкладку: поправили пояс в
 * Windows — плашка исчезает без перезагрузки страницы.
 */
function useNowEveryMinute(): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return now;
}

/**
 * Предупреждение о неверном часовом поясе или часах компьютера: время записей
 * в CRM считается по поясу компьютера, и чужой пояс сдвигает и показ, и
 * сохранение записей (см. utils/deviceClock). Закрыть можно до конца сессии
 * браузера — назавтра плашка вернётся, пока компьютер не настроят.
 */
export const DeviceClockBanner: React.FC = () => {
  const { activeBranch, activeMembership } = usePermissions();
  const skewMs = React.useSyncExternalStore(subscribeServerSkew, getServerSkewMs);
  const now = useNowEveryMinute();
  const [dismissed, setDismissed] = React.useState(readDismissed);
  // На телефоне инструкция под кнопкой — иначе плашка занимает полэкрана.
  const [howToOpen, setHowToOpen] = React.useState(false);

  const at = new Date(now);
  const clinicTimeZone = resolveClinicTimeZone(activeBranch?.timezone, activeMembership?.branches, at);
  const problem = detectClockProblem({
    deviceOffset: -at.getTimezoneOffset(),
    clinicOffset: zoneOffsetMinutes(clinicTimeZone, at),
    skewMs,
  });
  if (!problem) return null;

  const key = dismissKey(problem);
  if (dismissed === key) return null;

  const isWindows = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
  const text = describeClockProblem(problem, { clinicTimeZone, isWindows });

  const handleDismiss = () => {
    writeDismissed(key);
    setDismissed(key);
  };

  return (
    <Box sx={{ width: "100%", px: 2, pt: 1.5, pb: 0.5 }}>
      <Alert
        severity={text.severity}
        variant="filled"
        role="alert"
        action={
          <IconButton aria-label="Скрыть" color="inherit" size="small" onClick={handleDismiss}>
            <CloseIcon fontSize="inherit" />
          </IconButton>
        }
        sx={{ borderRadius: 2, boxShadow: 2, "& .MuiAlert-message": { overflow: "hidden" } }}
      >
        <AlertTitle sx={{ fontWeight: 700, mb: 0.5 }}>{text.title}</AlertTitle>
        <Typography variant="body2">{text.body}</Typography>
        <Typography
          variant="body2"
          sx={{ mt: 0.5, opacity: 0.9, display: { xs: howToOpen ? "block" : "none", md: "block" } }}
        >
          {text.howTo}
        </Typography>
        <Button
          color="inherit"
          size="small"
          variant="outlined"
          onClick={() => setHowToOpen(true)}
          sx={{ mt: 1, display: { xs: howToOpen ? "none" : "inline-flex", md: "none" } }}
        >
          Как исправить
        </Button>
      </Alert>
    </Box>
  );
};

export default DeviceClockBanner;
