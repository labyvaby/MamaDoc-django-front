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
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import DoNotDisturbOnOutlined from "@mui/icons-material/DoNotDisturbOnOutlined";
import KeyboardArrowDownOutlined from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlined from "@mui/icons-material/KeyboardArrowUpOutlined";

import { aiCardIn, reducedMotion } from "../ai/aiMotion";

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
  const icon = loading ? (
    <CircularProgress size={16} color="inherit" />
  ) : (
    <AutoAwesomeOutlined fontSize="small" />
  );
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
            aria-label={t("conclusion.aiAssist.button")}
            onClick={onClick}
            disabled={disabled || loading}
            startIcon={icon}
            sx={{ whiteSpace: "nowrap" }}
          >
            {/* Подпись не меняем на «AI заполняет N полей…»: со строками
                бланка полей бывает 10–40, и кнопка вылезала из шапки
                (27.09.2026). Число — в тултипе, на кнопке — спиннер. */}
            {/* Шапка дровера — одна строка (08.10.2026): полная подпись
                выдавливала имя пациента. Что делает кнопка — в тултипе. */}
            {t("conclusion.aiAssist.buttonShort")}
          </Button>
        )}
      </span>
    </Tooltip>
  );
};

/**
 * Пульт колонки подсказок — слева от шапки дровера, над колонкой (08.10.2026).
 * Заменяет полосу «N подсказок» внутри дровера: всё про AI живёт слева, а
 * форма не теряет строку. Пока AI думает — вместо пульта этапы ожидания
 * (`thinking`); когда всё разобрано — короткое «Все правки разобраны».
 */
export const AiGutterPult: React.FC<{
  width: number;
  padLeft: number;
  padRight: number;
  pendingCount: number;
  /** Этапы ожидания AI — пока идёт запрос. */
  thinking?: React.ReactNode;
  /** ↑↓ между подсказками — у режима «Фокус», где раскрыта одна. */
  onStep?: (dir: 1 | -1) => void;
  onApplyAll: () => void;
  onDismissAll: () => void;
}> = ({ width, padLeft, padRight, pendingCount, thinking, onStep, onApplyAll, onDismissAll }) => {
  const { t } = useT("appointments");
  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: "100%",
        width,
        pl: `${padLeft}px`,
        pr: `${padRight}px`,
        pt: 1,
        display: "flex",
        // Сверху, а не по центру шапки: полоса ожидания выше шапки и по центру
        // уезжала за край экрана; вниз ей есть место — над первой карточкой.
        alignItems: "flex-start",
        pointerEvents: "none",
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          width: "100%",
          minHeight: 40,
          overflow: "hidden",
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          animation: `${aiCardIn} 220ms ease-out both`,
          ...reducedMotion,
        }}
      >
        {thinking ?? (
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ width: "100%", pl: 1.5, pr: 0.5, minWidth: 0 }}>
            {pendingCount > 0 ? (
              <>
                <AutoAwesomeOutlined fontSize="small" color="primary" />
                <Typography variant="body2" fontWeight={600} noWrap sx={{ minWidth: 0 }}>
                  {t("conclusion.aiAssist.pending", { count: pendingCount })}
                </Typography>
                {onStep && pendingCount > 1 && (
                  <>
                    <IconButton size="small" aria-label={t("conclusion.aiAssist.review.prev")} onClick={() => onStep(-1)}>
                      <KeyboardArrowUpOutlined fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label={t("conclusion.aiAssist.review.next")} onClick={() => onStep(1)}>
                      <KeyboardArrowDownOutlined fontSize="small" />
                    </IconButton>
                  </>
                )}
                <Box sx={{ flex: 1 }} />
                {/* В узкой колонке «Фокуса» подпись не помещается — иконкой. */}
                {onStep ? (
                  <Tooltip title={t("conclusion.aiAssist.dismissAll")}>
                    <IconButton size="small" aria-label={t("conclusion.aiAssist.dismissAll")} onClick={onDismissAll}>
                      <DoNotDisturbOnOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Button size="small" color="inherit" onClick={onDismissAll} sx={{ color: "text.secondary", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {t("conclusion.aiAssist.dismissAll")}
                  </Button>
                )}
                <Button size="small" variant="contained" disableElevation onClick={onApplyAll} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                  {t("conclusion.aiAssist.applyAll")}
                </Button>
              </>
            ) : (
              <>
                <CheckCircleOutlined fontSize="small" color="success" />
                <Typography variant="body2" color="success.main" fontWeight={500} sx={{ py: 1 }} noWrap>
                  {t("conclusion.aiAssist.allDone")}
                </Typography>
              </>
            )}
          </Stack>
        )}
      </Paper>
    </Box>
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
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
      >
        <Button
          size="small"
          variant="contained"
          disableElevation
          onClick={onReview}
        >
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
 * Поле с предложением AI над ним — там, где колонке подсказок слева от
 * дровера не хватает места (телефон, колонка приёма, узкий экран). Плашка во
 * всю ширину поля: раньше (05.10.2026) она делила строку пополам и сжимала
 * само поле вдвое — ширины подсказки и поля «разнились» (08.10.2026).
 */
export const AiSuggestionBeside: React.FC<{
  suggestion: React.ReactNode;
  children: React.ReactNode;
}> = ({ suggestion, children }) =>
  suggestion ? (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      {suggestion}
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Stack>
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
}> = ({
  state,
  current,
  title,
  onTitleClick,
  gutter,
  onPreview,
  active,
  footer,
  onApply,
  onDismiss,
}) => {
  const { t } = useT("appointments");
  const suggestion = state.suggestion;
  const isDraft = current != null && current.trim() === "";
  const parts = React.useMemo(
    () =>
      suggestion == null || current == null || isDraft
        ? null
        : diffWords(current, suggestion),
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
    : ({
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: SUGGESTION_COLLAPSED_LINES,
        overflow: "hidden",
      } as const);
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
        boxShadow: active
          ? (th) => `inset 0 0 0 1px ${th.palette.primary.main}`
          : "none",
        // Слева от дровера карточка лежит на затемнённой странице — ей нужна
        // своя плотная заливка.
        bgcolor: gutter ? "background.paper" : "background.default",
      }}
    >
      <Stack spacing={1}>
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          sx={{ minWidth: 0 }}
        >
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
          <Typography
            variant="caption"
            color={stale ? "warning.main" : "text.secondary"}
          >
            {stale
              ? t("conclusion.aiAssist.cardStale")
              : t("conclusion.aiAssist.cardDraft")}
          </Typography>
        )}
        {/* Причина правки — врач быстрее решает, принимать ли её (бэк 05.10.2026). */}
        {state.reason && (
          <Typography variant="caption" color="text.secondary">
            {t("conclusion.aiAssist.reason", { reason: state.reason })}
          </Typography>
        )}
        {parts ? (
          <AiDiffText
            ref={textRef}
            parts={parts}
            sx={{ lineHeight: 1.6, ...clampSx }}
          />
        ) : (
          <Typography
            ref={textRef}
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", ...clampSx }}
          >
            {suggestion}
          </Typography>
        )}
        {(overflowing || expanded) && (
          <Button
            size="small"
            color="inherit"
            tabIndex={-1}
            onClick={() => setExpanded((prev) => !prev)}
            sx={{
              alignSelf: "flex-start",
              color: "text.secondary",
              px: 0.5,
              minWidth: 0,
            }}
          >
            {expanded
              ? t("conclusion.aiAssist.collapse")
              : t("conclusion.aiAssist.expand")}
          </Button>
        )}
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <Button
            size="small"
            variant="contained"
            disableElevation
            onClick={onApply}
            {...preview}
          >
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
