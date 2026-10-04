import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";

import { SCRIBE_IN_PROGRESS, type ScribeRecording } from "../api/scribe";
import { useT } from "../i18n/VerticalProvider";
import { useScribeClock, type ScribeRecorderApi } from "./ScribeRecorderProvider";
import { findUnfinishedRecording, unfinishedMinutes } from "./unfinishedRecording";

const mmss = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const QUEUED_LONG_MS = 5 * 60_000;

/** Что удаляем после подтверждения: свою идущую запись или незавершённую. */
type DeleteTarget = { kind: "own" } | { kind: "unfinished"; recording: ScribeRecording };

/**
 * Полоса под шапкой окна заключения: своя запись, досылка, незавершённая
 * запись, расшифровка, сбой. Действия с сервером — по одному: кнопки серые,
 * пока запрос идёт; ошибки показывает окно заключения.
 */
export const ScribeStrip: React.FC<{
  lineId: number;
  recorder: ScribeRecorderApi;
  /** Записи строки, новые первыми (контекст строки). */
  recordings: readonly ScribeRecording[];
  onRetry: (id: number) => Promise<unknown>;
  onSendAbandoned: (rec: ScribeRecording) => Promise<unknown>;
  onDeleteAbandoned: (rec: ScribeRecording) => Promise<unknown>;
}> = ({ lineId, recorder, recordings, onRetry, onSendAbandoned, onDeleteAbandoned }) => {
  const { t } = useT("scribe");
  const [pending, setPending] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<DeleteTarget | null>(null);
  const { state } = recorder;
  const own = state.lineId === lineId;
  const latest = recordings[0] ?? null;

  const run = (action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    void action()
      .catch(() => undefined)
      .finally(() => setPending(false));
  };

  const confirmDelete = () => {
    const target = toDelete;
    setToDelete(null);
    if (!target) return;
    if (target.kind === "own") void recorder.cancel();
    else run(() => onDeleteAbandoned(target.recording));
  };

  const lines: React.ReactNode[] = [];
  if (own && (state.phase === "recording" || state.phase === "paused")) {
    lines.push(<RecordingLine key="own" recorder={recorder} onDelete={() => setToDelete({ kind: "own" })} />);
  } else {
    if (own && state.phase === "stopping") {
      lines.push(<StripLine key="finishing" text={t("strip.finishing")} progress />);
    }
    // Незавершённую запись ищем по всем записям строки: более новая её не
    // прячет, а звук на сервере ждёт решения врача.
    const unfinished = findUnfinishedRecording(recordings, state.recordingId, Date.now());
    if (unfinished) {
      lines.push(
        <StripLine key="unfinished" text={t("strip.abandoned", { count: unfinishedMinutes(unfinished) })}>
          <Button size="small" disabled={pending} onClick={() => run(() => onSendAbandoned(unfinished))}>
            {t("strip.send")}
          </Button>
          <Button
            size="small"
            color="error"
            disabled={pending}
            onClick={() => setToDelete({ kind: "unfinished", recording: unfinished })}
          >
            {t("strip.delete")}
          </Button>
        </StripLine>,
      );
    }
    if (latest && latest.id !== unfinished?.id) {
      const status = statusLine(latest, t, pending, () => run(() => onRetry(latest.id)));
      if (status) lines.push(status);
    }
    // Кнопка «Запись» серая, пока пишется другой приём, — объясняем почему.
    if (
      lines.length === 0 &&
      !own &&
      state.lineId != null &&
      (state.phase === "recording" || state.phase === "paused" || state.phase === "stopping")
    ) {
      lines.push(<StripLine key="busy" text={t("strip.busyElsewhere")} />);
    }
  }

  return (
    <>
      {lines}
      <Dialog open={toDelete != null} onClose={() => setToDelete(null)} maxWidth="xs">
        <DialogTitle>{t("confirmDelete.title")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("confirmDelete.text")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setToDelete(null)}>
            {t("confirmDelete.cancel")}
          </Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>
            {t("confirmDelete.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

/** Строка состояния последней записи: очередь, расшифровка, сбой. */
function statusLine(
  latest: ScribeRecording,
  t: (key: string) => string,
  pending: boolean,
  retry: () => void,
): React.ReactNode {
  if (
    latest.status === "queued" &&
    latest.stoppedAt &&
    Date.now() - Date.parse(latest.stoppedAt) > QUEUED_LONG_MS
  ) {
    return <StripLine key="status" text={t("strip.queuedLong")} progress />;
  }
  if (SCRIBE_IN_PROGRESS.includes(latest.status)) {
    return <StripLine key="status" text={t("strip.processing")} progress />;
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
      <StripLine key="status" text={t(key)} error>
        {canRetry && (
          <Button size="small" disabled={pending} onClick={retry}>
            {t("strip.retry")}
          </Button>
        )}
      </StripLine>
    );
  }
  return null;
}

/** Идёт своя запись: таймер и громкость — из быстрого контекста. */
const RecordingLine: React.FC<{ recorder: ScribeRecorderApi; onDelete: () => void }> = ({
  recorder,
  onDelete,
}) => {
  const { t } = useT("scribe");
  const clock = useScribeClock();
  const { state } = recorder;
  const paused = state.phase === "paused";
  // Один кусок «в пути» — норма; копятся — значит, нет связи.
  const offline = recorder.pendingUploads && state.uploaded.length < state.chunks - 1;
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      useFlexGap
      sx={{ px: 2, py: 1, flexWrap: "wrap", flexShrink: 0, borderBottom: 1, borderColor: "divider" }}
    >
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
      <Button size="small" color="error" onClick={onDelete}>
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
