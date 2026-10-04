import React from "react";
import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";

import { SCRIBE_IN_PROGRESS, type ScribeRecording } from "../api/scribe";
import { useT } from "../i18n/VerticalProvider";
import { useScribeClock, type ScribeRecorderApi } from "./ScribeRecorderProvider";

const mmss = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const QUEUED_LONG_MS = 5 * 60_000;

/** Полоса под шапкой окна заключения: своя запись, ожидание, сбой, брошенная. */
export const ScribeStrip: React.FC<{
  lineId: number;
  recorder: ScribeRecorderApi;
  latest: ScribeRecording | null;
  onRetry: (id: number) => void;
  onSendAbandoned: (rec: ScribeRecording) => void;
  onDeleteAbandoned: (rec: ScribeRecording) => void;
}> = ({ lineId, recorder, latest, onRetry, onSendAbandoned, onDeleteAbandoned }) => {
  const { t } = useT("scribe");
  const { state } = recorder;
  const own = state.lineId === lineId;

  if (own && (state.phase === "recording" || state.phase === "paused")) {
    return <RecordingLine recorder={recorder} />;
  }
  if (own && state.phase === "stopping") {
    return <StripLine text={t("strip.finishing")} progress />;
  }
  if (latest) {
    if (latest.status === "recording" && latest.abandoned && latest.audioAvailable) {
      const minutes = Math.max(1, Math.round((latest.chunkCount * 15) / 60));
      return (
        <StripLine text={t("strip.abandoned", { count: minutes })}>
          <Button size="small" onClick={() => onSendAbandoned(latest)}>
            {t("strip.send")}
          </Button>
          <Button size="small" color="error" onClick={() => onDeleteAbandoned(latest)}>
            {t("strip.delete")}
          </Button>
        </StripLine>
      );
    }
    if (
      latest.status === "queued" &&
      latest.stoppedAt &&
      Date.now() - Date.parse(latest.stoppedAt) > QUEUED_LONG_MS
    ) {
      return <StripLine text={t("strip.queuedLong")} progress />;
    }
    if (SCRIBE_IN_PROGRESS.includes(latest.status)) {
      return <StripLine text={t("strip.processing")} progress />;
    }
    if (latest.status === "failed") {
      const key =
        latest.errorCode === "empty"
          ? "strip.failedEmpty"
          : latest.errorCode === "daily_limit"
            ? "strip.failedLimit"
            : latest.errorCode === "llm_failed"
              ? "strip.failedLlm"
              : "strip.failed";
      const canRetry =
        latest.audioAvailable || latest.errorCode === "llm_failed" || latest.errorCode === "daily_limit";
      return (
        <StripLine text={t(key)} error>
          {canRetry && (
            <Button size="small" onClick={() => onRetry(latest.id)}>
              {t("strip.retry")}
            </Button>
          )}
        </StripLine>
      );
    }
  }
  // Кнопка «Запись» серая, пока пишется другой приём, — объясняем почему.
  if (
    !own &&
    state.lineId != null &&
    (state.phase === "recording" || state.phase === "paused" || state.phase === "stopping")
  ) {
    return <StripLine text={t("strip.busyElsewhere")} />;
  }
  return null;
};

/** Идёт своя запись: таймер и громкость — из быстрого контекста. */
const RecordingLine: React.FC<{ recorder: ScribeRecorderApi }> = ({ recorder }) => {
  const { t } = useT("scribe");
  const clock = useScribeClock();
  const { state } = recorder;
  const paused = state.phase === "paused";
  // Один кусок «в пути» — норма; копятся — значит, нет связи.
  const offline = recorder.pendingUploads && state.uploaded.length < state.chunks - 1;
  return (
    <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap sx={{ px: 2, py: 1, flexWrap: "wrap", flexShrink: 0, borderBottom: 1, borderColor: "divider" }}>
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          flexShrink: 0,
          bgcolor: paused ? "text.disabled" : "error.main",
        }}
      />
      <Typography variant="body2" fontWeight={600}>
        {t(`strip.${state.mode ?? "dictation"}`)} · {mmss(clock.elapsed)}
      </Typography>
      <Box sx={{ width: 60 }}>
        <LinearProgress variant="determinate" value={paused ? 0 : Math.round(clock.level * 100)} />
      </Box>
      <Typography variant="caption" color={offline ? "warning.main" : "text.secondary"} sx={{ flex: 1 }}>
        {offline ? t("strip.unsaved") : t("strip.saved", { time: mmss(recorder.saved) })}
      </Typography>
      <Button size="small" onClick={paused ? recorder.resume : recorder.pause}>
        {paused ? t("strip.resume") : t("strip.pause")}
      </Button>
      <Button size="small" variant="contained" onClick={recorder.stop}>
        {t("strip.stop")}
      </Button>
      <Button size="small" color="error" onClick={() => void recorder.cancel()}>
        {t("strip.delete")}
      </Button>
    </Stack>
  );
};

const StripLine: React.FC<{ text: string; progress?: boolean; error?: boolean; children?: React.ReactNode }> = ({
  text,
  progress,
  error,
  children,
}) => (
  <Box sx={{ px: 2, py: 1, flexShrink: 0, borderBottom: 1, borderColor: "divider" }}>
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography variant="body2" color={error ? "error.main" : "text.secondary"} sx={{ flex: 1 }}>
        {text}
      </Typography>
      {children}
    </Stack>
    {progress && <LinearProgress sx={{ mt: 0.5 }} />}
  </Box>
);
