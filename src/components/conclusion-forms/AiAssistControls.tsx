import React from "react";
import {
  Box,
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
import { AiDiffText } from "./AiDiffText";
import { diffWords, sameText } from "./textDiff";
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
  /** Сколько полей ждут ответа — тултип кнопки, пока запрос идёт. */
  fieldCount: number;
  compact?: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ loading, fieldCount, compact, disabled, onClick }) => {
  const { t } = useT("appointments");
  const progressText = t("conclusion.aiAssist.progress", { count: fieldCount });
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
            {/* Подпись не меняем на «AI заполняет N полей…»: со строками
                бланка полей бывает 10–40, и кнопка вылезала из шапки
                (27.09.2026). Число — в тултипе, на кнопке — спиннер. */}
            {t("conclusion.aiAssist.button")}
          </Button>
        )}
      </span>
    </Tooltip>
  );
};

/**
 * Полоса под шапкой: сколько подсказок ждут решения, и что с ними делать.
 * Есть только пока подсказки не разобраны — места у полей не отнимает.
 *
 * Главная кнопка — «Проверить»: правки по очереди со сравнением — с
 * клавиатуры по карточкам слева от дровера, а где их нет — AiReviewDialog. «Применить все» оставлена второстепенной — вслепую принимать
 * текст AI в медицинский документ не должно быть путём по умолчанию.
 */
export const AiAssistPendingStrip: React.FC<{
  pendingCount: number;
  onReview: () => void;
  onApplyAll: () => void;
  onDismissAll: () => void;
}> = ({ pendingCount, onReview, onApplyAll, onDismissAll }) => {
  const { t } = useT("appointments");
  if (pendingCount <= 0) return null;
  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      flexWrap="wrap"
      useFlexGap
      sx={{ px: 2, py: 1, flexShrink: 0, bgcolor: "background.default" }}
    >
      {/* Кнопки сразу за счётчиком, а не у правого края: так полоса читается
          одной фразой «N подсказок — Проверить» (05.10.2026). */}
      <Stack direction="row" spacing={0.75} alignItems="center">
        <AutoAwesomeOutlined fontSize="small" color="primary" />
        <Typography variant="body2" fontWeight={600}>
          {t("conclusion.aiAssist.pending", { count: pendingCount })}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button size="small" variant="contained" disableElevation onClick={onReview}>
          {t("conclusion.aiAssist.review.open")}
        </Button>
        <Button size="small" color="inherit" onClick={onApplyAll}>
          {t("conclusion.aiAssist.applyAll")}
        </Button>
        <Button size="small" color="inherit" onClick={onDismissAll}>
          {t("conclusion.aiAssist.dismissAll")}
        </Button>
      </Stack>
    </Stack>
  );
};

/**
 * Поле с предложением AI слева от него (05.10.2026, раньше — под полем):
 * врач сверяет текст AI со своим, не прокручивая форму. Без предложения —
 * просто поле. На телефоне места на две колонки нет — плашка над полем.
 */
export const AiSuggestionBeside: React.FC<{
  suggestion: React.ReactNode;
  children: React.ReactNode;
}> = ({ suggestion, children }) =>
  suggestion ? (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" },
        gap: 1,
        alignItems: "start",
      }}
    >
      {suggestion}
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  ) : (
    <>{children}</>
  );

/** Сколько строк подсказки видно, пока врач её не развернул. */
const SUGGESTION_COLLAPSED_LINES = 4;

/**
 * Предложение AI рядом с полем: слева от дровера (AiSuggestionGutter) или у
 * самого поля на узком экране (AiSuggestionBeside).
 *
 * Главное правило гайда: пока врач не нажал «Применить», в самом поле ничего
 * не меняется — врач обязан вычитать текст. Поэтому это отдельная карточка,
 * а не подмена значения; «Отклонить» просто прячет её.
 *
 * С `current` карточка показывает не весь текст AI, а правку — что он
 * зачеркнул и что вписал (05.10.2026): так в медицинском документе не
 * проглядишь изменённое слово. Пустое поле — черновик, его показываем целиком.
 */
export const AiAssistSuggestion: React.FC<{
  state: AiAssistFieldState;
  /** Текущий текст поля: с ним карточка показывает правку, а не весь текст. */
  current?: string;
  /** Подпись карточки; в колонке подсказок — имя поля. */
  title?: string;
  /** Клик по подписи — к полю (колонка подсказок). */
  onTitleClick?: () => void;
  /** Карточка слева от дровера: без строки «Проверьте текст…» — нет места. */
  gutter?: boolean;
  /** Наведение/фокус на «Применить» — примерка текста в самом поле. */
  onPreview?: (on: boolean) => void;
  /** Карточка в фокусе разбора с клавиатуры: рамка толще, внизу — клавиши. */
  active?: boolean;
  /** Строка внизу активной карточки (подсказка по клавишам). */
  footer?: React.ReactNode;
  onApply: () => void;
  onDismiss: () => void;
}> = ({ state, current, title, onTitleClick, gutter, onPreview, active, footer, onApply, onDismiss }) => {
  const { t } = useT("appointments");
  const suggestion = state.suggestion;
  const isDraft = current != null && current.trim() === "";
  const parts = React.useMemo(
    () => (suggestion == null || current == null || isDraft ? null : diffWords(current, suggestion)),
    [suggestion, current, isDraft],
  );
  // Врач правил поле, пока AI думал: правка — против текущего текста.
  const stale =
    current != null && state.source != null && !sameText(state.source, current);

  // Длинную подсказку сворачиваем до нескольких строк: пять развёрнутых
  // карточек разом (одна кнопка на все поля) растягивали форму на экраны.
  // Нужна ли кнопка «Показать полностью», меряем по факту переполнения,
  // а не по числу символов — ширина дровера на телефоне и на ПК разная.
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [overflowing, setOverflowing] = React.useState(false);
  React.useLayoutEffect(() => {
    setExpanded(false);
  }, [suggestion]);
  React.useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [suggestion, current, expanded]);

  if (suggestion == null) return null;
  const clampSx = expanded
    ? null
    : {
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: SUGGESTION_COLLAPSED_LINES,
        overflow: "hidden",
      } as const;
  const preview = onPreview
    ? {
        onMouseEnter: () => onPreview(true),
        onMouseLeave: () => onPreview(false),
        onFocus: () => onPreview(true),
        onBlur: () => onPreview(false),
      }
    : null;
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderColor: "primary.main",
        // Активная карточка — рамка в 2px без сдвига содержимого.
        boxShadow: active ? (th) => `inset 0 0 0 1px ${th.palette.primary.main}` : "none",
        // Слева от дровера карточка лежит на затемнённой странице — ей нужна
        // своя плотная заливка.
        bgcolor: gutter ? "background.paper" : "background.default",
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
          <AutoAwesomeOutlined fontSize="small" color="primary" />
          <Typography
            variant="body2"
            fontWeight={600}
            noWrap
            {...(onTitleClick
              ? {
                  component: "button" as const,
                  type: "button" as const,
                  tabIndex: -1,
                  onClick: onTitleClick,
                  sx: {
                    p: 0,
                    border: 0,
                    bgcolor: "transparent",
                    color: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                    minWidth: 0,
                    "&:hover": { color: "primary.main" },
                  },
                }
              : null)}
          >
            {title ?? t("conclusion.aiAssist.title")}
          </Typography>
        </Stack>
        {(isDraft || stale) && (
          <Typography variant="caption" color={stale ? "warning.main" : "text.secondary"}>
            {stale ? t("conclusion.aiAssist.cardStale") : t("conclusion.aiAssist.cardDraft")}
          </Typography>
        )}
        {parts ? (
          <AiDiffText ref={textRef} parts={parts} sx={{ lineHeight: 1.6, ...clampSx }} />
        ) : (
          <Typography ref={textRef} variant="body2" sx={{ whiteSpace: "pre-wrap", ...clampSx }}>
            {suggestion}
          </Typography>
        )}
        {(overflowing || expanded) && (
          <Button
            size="small"
            color="inherit"
            tabIndex={-1}
            onClick={() => setExpanded((prev) => !prev)}
            sx={{ alignSelf: "flex-start", color: "text.secondary", px: 0.5, minWidth: 0 }}
          >
            {expanded ? t("conclusion.aiAssist.collapse") : t("conclusion.aiAssist.expand")}
          </Button>
        )}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button size="small" variant="contained" disableElevation onClick={onApply} {...preview}>
            {t("conclusion.aiAssist.apply")}
          </Button>
          <Button size="small" color="inherit" onClick={onDismiss}>
            {t("conclusion.aiAssist.dismiss")}
          </Button>
          {!gutter && (
            <Typography variant="caption" color="text.secondary">
              {t("conclusion.aiAssist.reviewHint")}
            </Typography>
          )}
        </Stack>
        {footer}
      </Stack>
    </Paper>
  );
};
