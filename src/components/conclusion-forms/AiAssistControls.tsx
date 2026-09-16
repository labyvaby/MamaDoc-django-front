import React from "react";
import {
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";

import { useT } from "../../i18n/VerticalProvider";
import type { AiAssistFieldState } from "./useAiAssist";

/**
 * Кнопка «Помощь AI» в шапке дровера, рядом с «Шаблонами» — одна на всю форму.
 *
 * В шапке, а не в потоке полей: врач сначала набрасывает текст и просит AI
 * причесать его уже внизу формы, а шапка не прокручивается. Нажатие просит
 * подсказки сразу по всем доступным полям; пустые не пропускаются — пустой
 * текст означает просьбу написать черновик с нуля.
 *
 * На телефоне — иконка (как «Шаблоны»): текст ломал заголовок на две строки.
 */
export const AiAssistHeaderButton: React.FC<{
  loading: boolean;
  progress: { done: number; total: number };
  compact?: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ loading, progress, compact, disabled, onClick }) => {
  const { t } = useT("appointments");
  const progressText = t("conclusion.aiAssist.progress", {
    done: progress.done,
    total: progress.total,
  });
  const icon = loading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeOutlined fontSize="small" />;
  return (
    <Tooltip title={loading ? progressText : t("conclusion.aiAssist.tooltip")}>
      <span>
        {compact ? (
          <IconButton
            size="small"
            color="primary"
            aria-label={t("conclusion.aiAssist.button")}
            onClick={onClick}
            disabled={disabled || loading}
          >
            {icon}
          </IconButton>
        ) : (
          <Button
            size="small"
            variant="outlined"
            onClick={onClick}
            disabled={disabled || loading}
            startIcon={icon}
            sx={{ whiteSpace: "nowrap" }}
          >
            {loading ? progressText : t("conclusion.aiAssist.button")}
          </Button>
        )}
      </span>
    </Tooltip>
  );
};

/**
 * Полоса под шапкой: сколько подсказок ждут решения, и массовые действия.
 * Есть только пока подсказки не разобраны — места у полей не отнимает.
 */
export const AiAssistPendingStrip: React.FC<{
  pendingCount: number;
  onApplyAll: () => void;
  onDismissAll: () => void;
}> = ({ pendingCount, onApplyAll, onDismissAll }) => {
  const { t } = useT("appointments");
  if (pendingCount <= 0) return null;
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      justifyContent="space-between"
      flexWrap="wrap"
      useFlexGap
      sx={{ px: 2, py: 1, flexShrink: 0, bgcolor: "background.default" }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center">
        <AutoAwesomeOutlined fontSize="small" color="primary" />
        <Typography variant="body2" fontWeight={600}>
          {t("conclusion.aiAssist.pending", { count: pendingCount })}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center">
        <Button size="small" variant="contained" disableElevation onClick={onApplyAll}>
          {t("conclusion.aiAssist.applyAll")}
        </Button>
        <Button size="small" color="inherit" onClick={onDismissAll}>
          {t("conclusion.aiAssist.dismissAll")}
        </Button>
      </Stack>
    </Stack>
  );
};

/** Сколько строк подсказки видно, пока врач её не развернул. */
const SUGGESTION_COLLAPSED_LINES = 4;

/**
 * Предложение AI рядом с полем.
 *
 * Главное правило гайда: пока врач не нажал «Применить», в самом поле ничего
 * не меняется — врач обязан вычитать текст. Поэтому это отдельная плашка под
 * полем, а не подмена значения; «Отклонить» просто прячет её.
 */
export const AiAssistSuggestion: React.FC<{
  state: AiAssistFieldState;
  onApply: () => void;
  onDismiss: () => void;
}> = ({ state, onApply, onDismiss }) => {
  const { t } = useT("appointments");
  // Длинную подсказку сворачиваем до нескольких строк: пять развёрнутых
  // плашек разом (одна кнопка на все поля) растягивали форму на экраны.
  // Нужна ли кнопка «Показать полностью», меряем по факту переполнения,
  // а не по числу символов — ширина дровера на телефоне и на ПК разная.
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [overflowing, setOverflowing] = React.useState(false);
  React.useLayoutEffect(() => {
    setExpanded(false);
  }, [state.suggestion]);
  React.useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [state.suggestion, expanded]);

  if (!state.suggestion) return null;
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, borderColor: "primary.main", bgcolor: "background.default" }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <AutoAwesomeOutlined fontSize="small" color="primary" />
          <Typography variant="body2" fontWeight={600}>
            {t("conclusion.aiAssist.title")}
          </Typography>
        </Stack>
        <Typography
          ref={textRef}
          variant="body2"
          sx={{
            whiteSpace: "pre-wrap",
            ...(expanded
              ? null
              : {
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: SUGGESTION_COLLAPSED_LINES,
                  overflow: "hidden",
                }),
          }}
        >
          {state.suggestion}
        </Typography>
        {(overflowing || expanded) && (
          <Button
            size="small"
            color="inherit"
            onClick={() => setExpanded((prev) => !prev)}
            sx={{ alignSelf: "flex-start", color: "text.secondary", px: 0.5, minWidth: 0 }}
          >
            {expanded ? t("conclusion.aiAssist.collapse") : t("conclusion.aiAssist.expand")}
          </Button>
        )}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button size="small" variant="contained" disableElevation onClick={onApply}>
            {t("conclusion.aiAssist.apply")}
          </Button>
          <Button size="small" color="inherit" onClick={onDismiss}>
            {t("conclusion.aiAssist.dismiss")}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {t("conclusion.aiAssist.reviewHint")}
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
};
