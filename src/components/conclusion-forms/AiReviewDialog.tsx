import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DoNotDisturbOnOutlined from "@mui/icons-material/DoNotDisturbOnOutlined";
import RadioButtonUncheckedOutlined from "@mui/icons-material/RadioButtonUncheckedOutlined";

import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { AiDiffText } from "./AiDiffText";
import { diffStats, diffWords, sameText } from "./textDiff";
import type { AiAssistKey } from "./useAiAssist";

/** Поле, куда ложится правка, — живое: текст и setter с текущего рендера. */
export interface AiReviewTarget {
  key: AiAssistKey;
  label: string;
  /** Текущий текст поля (у диагноза — выбранные диагнозы строкой). */
  current: string;
  apply: (text: string) => void;
  /**
   * Снять снимок поля до применения — вернёт функцию «как было». У диагноза
   * это набор выбранных диагнозов: обратно из текста его не собрать.
   */
  capture: () => () => void;
}

/** Предложение AI, замороженное на момент открытия проверки. */
export interface AiReviewEntry {
  key: AiAssistKey;
  suggestion: string;
  /** Текст поля, ушедший в AI, — для предупреждения о правках за время ответа. */
  source?: string;
}

type Decision =
  | { status: "accepted"; before: string; text: string; restore: () => void }
  | { status: "rejected" };

/**
 * Режим проверки правок AI: предложения идут по очереди, у каждого пословное
 * сравнение с текстом врача, и решение принимается осознанно, а не пачкой
 * «Применить все» вслепую.
 *
 * Очередь замораживается при открытии: принятое уходит из подсказок хука
 * (`onResolve`), а здесь остаётся — чтобы можно было вернуться и отменить.
 * Отмена живёт, пока открыто окно; после закрытия поле — обычный текст.
 */
export const AiReviewDialog: React.FC<{
  open: boolean;
  entries: AiReviewEntry[];
  targets: AiReviewTarget[];
  /** Решение по правке принято — убрать плашку подсказки под полем. */
  onResolve: (key: AiAssistKey) => void;
  onClose: () => void;
}> = ({ open, entries, targets, onResolve, onClose }) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // Поле могло исчезнуть (врач сменил бланк при открытом окне) — такие
  // правки не показываем: применить их некуда.
  const targetByKey = React.useMemo(() => new Map(targets.map((tg) => [tg.key, tg])), [targets]);
  const queue = React.useMemo(
    () => entries.filter((entry) => targetByKey.has(entry.key)),
    [entries, targetByKey],
  );

  const [index, setIndex] = React.useState(0);
  const [decisions, setDecisions] = React.useState<Partial<Record<AiAssistKey, Decision>>>({});
  const [drafts, setDrafts] = React.useState<Partial<Record<AiAssistKey, string>>>({});
  const [editing, setEditing] = React.useState(false);
  const [view, setView] = React.useState<"diff" | "result">("diff");
  const [done, setDone] = React.useState(false);

  // Новая очередь — новая проверка: прежние решения к ней не относятся.
  React.useEffect(() => {
    if (!open) return;
    setIndex(0);
    setDecisions({});
    setDrafts({});
    setEditing(false);
    setDone(false);
  }, [open, entries]);

  const entry = queue[Math.min(index, queue.length - 1)];
  const target = entry ? targetByKey.get(entry.key) : undefined;
  const decision = entry ? decisions[entry.key] : undefined;
  const decidedCount = queue.filter((e) => decisions[e.key]).length;
  const acceptedCount = queue.filter((e) => decisions[e.key]?.status === "accepted").length;

  const goTo = (next: number) => {
    setIndex(next);
    setEditing(false);
    setDone(false);
  };

  /** К следующей неразобранной правке по кругу; нет таких — итог. */
  const advance = (resolved: Partial<Record<AiAssistKey, Decision>>) => {
    for (let step = 1; step <= queue.length; step++) {
      const next = (index + step) % queue.length;
      if (!resolved[queue[next].key]) {
        goTo(next);
        return;
      }
    }
    setEditing(false);
    setDone(true);
  };

  const decide = (key: AiAssistKey, value: Decision) => {
    const next = { ...decisions, [key]: value };
    setDecisions(next);
    onResolve(key);
    advance(next);
  };

  const suggestionText = entry ? drafts[entry.key] ?? entry.suggestion : "";

  const accept = () => {
    if (!entry || !target || decision) return;
    const text = suggestionText;
    const before = target.current;
    const restore = target.capture();
    target.apply(text);
    decide(entry.key, { status: "accepted", before, text, restore });
  };

  const reject = () => {
    if (!entry || decision) return;
    decide(entry.key, { status: "rejected" });
  };

  /** Снять решение: принятое откатываем, отклонённое снова ждёт решения. */
  const reopen = () => {
    if (!entry || !decision) return;
    if (decision.status === "accepted") decision.restore();
    const key = entry.key;
    setDecisions((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !done) {
      event.preventDefault();
      accept();
    }
  };

  const shown = React.useMemo(() => {
    if (!entry || !target) return null;
    const before = decision?.status === "accepted" ? decision.before : target.current;
    const after = decision?.status === "accepted" ? decision.text : suggestionText;
    const parts = diffWords(before, after);
    return {
      parts,
      after,
      stats: diffStats(parts),
      wasEmpty: before.trim() === "",
      // Врач правил поле, пока модель думала: сравниваем уже с новым
      // текстом, но предупреждаем — модель его не видела.
      stale:
        !decision && entry.source != null && !sameText(entry.source, target.current),
    };
  }, [entry, target, decision, suggestionText]);

  if (queue.length === 0) return null;

  const statusIcon = (key: AiAssistKey) => {
    const d = decisions[key];
    if (d?.status === "accepted") return <CheckCircleOutlined fontSize="small" color="success" />;
    if (d?.status === "rejected")
      return <DoNotDisturbOnOutlined fontSize="small" sx={{ color: "text.disabled" }} />;
    return <RadioButtonUncheckedOutlined fontSize="small" sx={{ color: "text.disabled" }} />;
  };

  const list = (
    <Stack
      sx={{
        width: 240,
        flexShrink: 0,
        overflowY: "auto",
        borderRight: 1,
        borderColor: "divider",
        py: 1,
      }}
    >
      {queue.map((item, i) => {
        const selected = !done && i === index;
        return (
          <ButtonBase
            key={item.key}
            onClick={() => goTo(i)}
            sx={{
              justifyContent: "flex-start",
              gap: 1,
              px: 2,
              py: 1,
              textAlign: "left",
              bgcolor: selected ? (th) => subtleBg(th, true) : "transparent",
              borderLeft: 2,
              borderColor: selected ? "primary.main" : "transparent",
              "&:hover": { bgcolor: (th) => subtleBg(th, true) },
            }}
          >
            {statusIcon(item.key)}
            <Typography
              variant="body2"
              noWrap
              fontWeight={selected ? 600 : 400}
              color={decisions[item.key] ? "text.secondary" : "text.primary"}
            >
              {targetByKey.get(item.key)?.label}
            </Typography>
          </ButtonBase>
        );
      })}
    </Stack>
  );

  const main =
    done || !entry || !target || !shown ? (
      <Stack spacing={1.5} alignItems="flex-start" sx={{ p: 3 }}>
        <CheckCircleOutlined color="success" />
        <Typography variant="subtitle1" fontWeight={600}>
          {t("conclusion.aiAssist.review.doneTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("conclusion.aiAssist.review.doneText", {
            accepted: acceptedCount,
            rejected: decidedCount - acceptedCount,
          })}
        </Typography>
      </Stack>
    ) : (
      <Stack spacing={1.5} sx={{ p: { xs: 2, md: 3 }, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
              {target.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {shown.wasEmpty
                ? t("conclusion.aiAssist.review.wasEmpty")
                : t("conclusion.aiAssist.review.stats", shown.stats)}
            </Typography>
          </Stack>
          {!editing && !shown.wasEmpty && (
            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_, next) => next && setView(next)}
            >
              <ToggleButton value="diff" sx={{ px: 1.25, py: 0.25 }}>
                {t("conclusion.aiAssist.review.diff")}
              </ToggleButton>
              <ToggleButton value="result" sx={{ px: 1.25, py: 0.25 }}>
                {t("conclusion.aiAssist.review.result")}
              </ToggleButton>
            </ToggleButtonGroup>
          )}
        </Stack>

        {shown.stale && <Alert severity="warning">{t("conclusion.aiAssist.review.stale")}</Alert>}

        {editing ? (
          <TextField
            multiline
            minRows={4}
            fullWidth
            autoFocus
            size="small"
            value={suggestionText}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [entry.key]: e.target.value }))}
            helperText={t("conclusion.aiAssist.review.editHint")}
          />
        ) : (
          <Box
            sx={{
              p: 1.5,
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              bgcolor: "background.paper",
            }}
          >
            {view === "diff" && !shown.wasEmpty ? (
              <AiDiffText parts={shown.parts} />
            ) : (
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
                {shown.after}
              </Typography>
            )}
          </Box>
        )}
      </Stack>
    );

  const actions = (() => {
    if (done || !entry) {
      return (
        <Button variant="contained" disableElevation onClick={onClose}>
          {t("conclusion.aiAssist.review.close")}
        </Button>
      );
    }
    if (decision) {
      return (
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            size="small"
            variant="outlined"
            color={decision.status === "accepted" ? "success" : "default"}
            label={
              decision.status === "accepted"
                ? t("conclusion.aiAssist.review.accepted")
                : t("conclusion.aiAssist.review.rejected")
            }
          />
          <Button size="small" onClick={reopen}>
            {decision.status === "accepted"
              ? t("conclusion.aiAssist.review.undo")
              : t("conclusion.aiAssist.review.reconsider")}
          </Button>
        </Stack>
      );
    }
    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap justifyContent="flex-end">
        <Button color="inherit" onClick={() => setEditing((prev) => !prev)}>
          {editing ? t("conclusion.aiAssist.review.editDone") : t("conclusion.aiAssist.review.edit")}
        </Button>
        <Button variant="outlined" color="inherit" onClick={reject}>
          {t("conclusion.aiAssist.review.reject")}
        </Button>
        <Tooltip title={t("conclusion.aiAssist.review.acceptHint")}>
          <Button
            variant="contained"
            disableElevation
            onClick={accept}
            disabled={suggestionText.trim() === ""}
          >
            {t("conclusion.aiAssist.review.accept")}
          </Button>
        </Tooltip>
      </Stack>
    );
  })();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      // Ширину задаём явно: maxWidth="sm" в этой теме — 360px.
      maxWidth={false}
      onKeyDown={handleKeyDown}
      PaperProps={{
        sx: isMobile
          ? undefined
          : { width: 920, maxWidth: "calc(100% - 32px)", height: "min(720px, calc(100% - 64px))" },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.5 }}>
        <AutoAwesomeOutlined fontSize="small" color="primary" />
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap>
            {t("conclusion.aiAssist.review.title")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("conclusion.aiAssist.review.progress", { done: decidedCount, total: queue.length })}
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose} aria-label={t("conclusion.aiAssist.review.close")}>
          <CloseOutlined />
        </IconButton>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={(decidedCount / queue.length) * 100}
        sx={{ height: 2, flexShrink: 0 }}
      />
      <DialogContent sx={{ p: 0, display: "flex", minHeight: 0 }}>
        {!isMobile && queue.length > 1 && list}
        <Box sx={{ flex: 1, minWidth: 0, overflowY: "auto" }}>{main}</Box>
      </DialogContent>
      <Divider />
      <DialogActions sx={{ px: 2, py: 1.5, justifyContent: "space-between", gap: 1 }}>
        {queue.length > 1 ? (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Tooltip title={t("conclusion.aiAssist.review.prev")}>
              <span>
                <IconButton
                  size="small"
                  onClick={() => goTo((index - 1 + queue.length) % queue.length)}
                  aria-label={t("conclusion.aiAssist.review.prev")}
                >
                  <ChevronLeftOutlined />
                </IconButton>
              </span>
            </Tooltip>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40, textAlign: "center" }}>
              {t("conclusion.aiAssist.review.position", { index: index + 1, total: queue.length })}
            </Typography>
            <Tooltip title={t("conclusion.aiAssist.review.next")}>
              <span>
                <IconButton
                  size="small"
                  onClick={() => goTo((index + 1) % queue.length)}
                  aria-label={t("conclusion.aiAssist.review.next")}
                >
                  <ChevronRightOutlined />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        ) : (
          <span />
        )}
        {actions}
      </DialogActions>
    </Dialog>
  );
};
