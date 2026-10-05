import React from "react";
import { createPortal } from "react-dom";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import DoNotDisturbOnOutlined from "@mui/icons-material/DoNotDisturbOnOutlined";

import { aiCardIn, reducedMotion } from "../ai/aiMotion";
import { useT } from "../../i18n/VerticalProvider";
import { AiAssistSuggestion } from "./AiAssistControls";
import { AiDiffText } from "./AiDiffText";
import { diffWords } from "./textDiff";
import { aiFieldOf, useAiFieldMarks } from "./aiFieldMarks";
import type { AiAssistFieldState } from "./useAiAssist";

export interface AiGutterItem {
  key: string;
  label: string;
  state: AiAssistFieldState;
  /** Текущий текст поля — для правки в карточке и примерки. */
  current: string;
  onApply: () => void;
  onDismiss: () => void;
}

/** Последнее решение по подсказке — его можно вернуть («Вернуть», ⌘Z). */
export interface AiGutterUndo {
  key: string;
  kind: "applied" | "dismissed";
  onUndo: () => void;
}

export interface AiSuggestionGutterHandle {
  /** Перейти к разбору с клавиатуры — фокус на первую карточку. */
  focusFirst: () => void;
}

/** Ширина колонки подсказок слева от дровера. */
export const AI_GUTTER_WIDTH = 320;
/** Зазор между карточками, которые иначе налезли бы друг на друга. */
const AI_CARD_GAP = 8;
/** Место «Вернуть» в раскладке — рядом с полем, чьё решение можно вернуть. */
const UNDO_SLOT = "__undo";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Подсказки AI слева от дровера, каждая — напротив своего поля
 * (05.10.2026), как заметки на полях документа. Дровер не расширяется.
 *
 * Слой — потомок дровера, вынесенный за его левый край (`right: 100%`):
 * клик по карточке не считается кликом мимо дровера, а при открытии
 * карточки выезжают вместе с ним. Родитель — `position: relative` по высоте
 * формы, слой обрезается по ней.
 *
 * Позиции — в координатах содержимого формы: считаются только при изменении
 * раскладки (ResizeObserver). Прокрутка лишь сдвигает слой через transform —
 * без React-рендера, карточки не отстают от полей. Налезающие карточки
 * сдвигаются вниз; поле, которого в форме не нашлось, — в конце очереди.
 *
 * Разбор с клавиатуры: фокус на карточке → ↑↓ между подсказками (форма
 * доезжает до поля), Enter — принять, ⌫ — отклонить, ⌘Z — вернуть, Esc — в
 * поле. У активной карточки (и при наведении на «Применить») — примерка:
 * текст AI с правкой поверх самого поля, в данные он не попадает.
 */
export const AiSuggestionGutter = React.forwardRef<
  AiSuggestionGutterHandle,
  {
    /** Прокручиваемая колонка формы: в ней поля с `data-ai-key`. */
    scrollEl: HTMLElement | null;
    items: AiGutterItem[];
    undo: AiGutterUndo | null;
  }
>(function AiSuggestionGutter({ scrollEl, items, undo }, ref) {
  const { t } = useT("appointments");
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const slotRefs = React.useRef(new Map<string, HTMLDivElement>());
  const [tops, setTops] = React.useState<Record<string, number>>({});
  /** Карточки сверху вниз — порядок переходов ↑↓. */
  const orderRef = React.useRef<string[]>([]);
  /** Карточка с фокусом (сама карточка, не её кнопка) — для ↑↓ и примерки. */
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  /** «Применить» под курсором — примерка без фокуса. */
  const [hoverKey, setHoverKey] = React.useState<string | null>(null);
  /**
   * Куда поставить фокус, когда раскладка обновится: на карточку с этим
   * номером (после решения с клавиатуры) или на карточку поля (после ⌘Z).
   */
  const pendingFocus = React.useRef<{ index: number } | { fieldKey: string } | null>(null);

  // Слот — место в раскладке: карточка или «Вернуть» у своего поля.
  const slots = React.useMemo(
    () => [
      ...items.map((item) => ({ id: item.key, fieldKey: item.key })),
      ...(undo ? [{ id: UNDO_SLOT, fieldKey: undo.key }] : []),
    ],
    [items, undo],
  );
  const slotsSig = slots.map((slot) => `${slot.id}>${slot.fieldKey}`).join("|");

  const fieldOf = React.useCallback((key: string) => aiFieldOf(scrollEl, key), [scrollEl]);

  /** Сдвиг слоя вслед за прокруткой формы — напрямую в DOM. */
  const syncScroll = React.useCallback(() => {
    if (trackRef.current && scrollEl) {
      trackRef.current.style.transform = `translateY(${-scrollEl.scrollTop}px)`;
    }
  }, [scrollEl]);

  const layout = React.useCallback(() => {
    if (!scrollEl) return;
    // Верх поля в координатах содержимого формы — от прокрутки не зависит.
    const origin = scrollEl.getBoundingClientRect().top - scrollEl.scrollTop;
    const placed = slotsSig
      .split("|")
      .filter(Boolean)
      .map((pair, index) => {
        const [id, fieldKey] = pair.split(">");
        const field = fieldOf(fieldKey);
        return {
          id,
          index,
          top: field ? field.getBoundingClientRect().top - origin : Number.POSITIVE_INFINITY,
          height: slotRefs.current.get(id)?.offsetHeight ?? 0,
        };
      });
    placed.sort((a, b) => a.top - b.top || a.index - b.index);
    const next: Record<string, number> = {};
    let floor = 0;
    for (const slot of placed) {
      const top = Math.round(Math.max(Number.isFinite(slot.top) ? slot.top : floor, floor));
      next[slot.id] = top;
      floor = top + slot.height + AI_CARD_GAP;
    }
    orderRef.current = placed.map((slot) => slot.id).filter((id) => id !== UNDO_SLOT);
    setTops((prev) =>
      Object.keys(next).length === Object.keys(prev).length &&
      Object.entries(next).every(([id, value]) => prev[id] === value)
        ? prev
        : next,
    );
    syncScroll();
  }, [scrollEl, fieldOf, slotsSig, syncScroll]);

  React.useLayoutEffect(() => {
    layout();
    if (!scrollEl) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    // Раскладку меняют рост полей и блоков над ними (следим за содержимым
    // формы целиком), высота самой формы и карточек («Показать полностью»).
    const observer = new ResizeObserver(schedule);
    observer.observe(scrollEl);
    for (const child of Array.from(scrollEl.children)) observer.observe(child);
    for (const slot of slotRefs.current.values()) observer.observe(slot);
    scrollEl.addEventListener("scroll", syncScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scrollEl.removeEventListener("scroll", syncScroll);
    };
  }, [scrollEl, layout, syncScroll]);

  /** Фокус на карточку и форма — к её полю. */
  const focusSlot = React.useCallback(
    (id: string | undefined) => {
      if (!id) return;
      slotRefs.current.get(id)?.focus({ preventScroll: true });
      const fieldKey = id === UNDO_SLOT ? undo?.key : id;
      if (fieldKey) fieldOf(fieldKey)?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [fieldOf, undo],
  );

  React.useImperativeHandle(ref, () => ({ focusFirst: () => focusSlot(orderRef.current[0]) }), [
    focusSlot,
  ]);

  // Решение с клавиатуры убрало карточку — фокус на следующую по порядку,
  // а если подсказок не осталось — на «Вернуть», чтобы ⌘Z работал дальше.
  // Ждём, пока цель встанет на место: до раскладки карточка скрыта
  // (visibility: hidden), а скрытый элемент фокус не принимает.
  React.useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const order = orderRef.current;
    const target =
      "fieldKey" in pending
        ? pending.fieldKey
        : order.length > 0
          ? order[Math.min(pending.index, order.length - 1)]
          : undo
            ? UNDO_SLOT
            : undefined;
    if (!target) {
      pendingFocus.current = null;
      return;
    }
    if (!(target in tops)) return;
    pendingFocus.current = null;
    if (target === UNDO_SLOT) slotRefs.current.get(UNDO_SLOT)?.focus({ preventScroll: true });
    else focusSlot(target);
  }, [tops, focusSlot, undo]);

  const decide = (id: string, action: "apply" | "dismiss") => {
    const item = items.find((it) => it.key === id);
    if (!item) return;
    pendingFocus.current = { index: orderRef.current.indexOf(id) };
    if (action === "apply") item.onApply();
    else item.onDismiss();
  };

  const focusField = (key: string) => {
    const field = fieldOf(key);
    if (!field) return;
    field.scrollIntoView({ block: "nearest", behavior: "smooth" });
    field
      .querySelector<HTMLElement>(
        "textarea:not([aria-hidden='true']):not([readonly]), input:not([type='hidden']):not([aria-hidden='true'])",
      )
      ?.focus({ preventScroll: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const slot = (e.target as HTMLElement).closest<HTMLElement>("[data-ai-slot]");
    const id = slot?.dataset.aiSlot;
    if (!id) return;
    const onSlot = e.target === slot;
    const order = orderRef.current;
    const at = order.indexOf(id);
    const mod = e.metaKey || e.ctrlKey;
    let handled = true;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const step = e.key === "ArrowDown" ? 1 : -1;
      // С «Вернуть» — к ближайшей карточке по направлению.
      const from = at >= 0 ? at : step > 0 ? -1 : order.length;
      focusSlot(order[Math.max(0, Math.min(order.length - 1, from + step))]);
    } else if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
      if (undo) {
        // Вернулась карточка — фокус на неё, когда она встанет на место.
        pendingFocus.current = { fieldKey: undo.key };
        undo.onUndo();
      }
    } else if (e.key === "Escape") {
      // Esc не закрывает дровер, а возвращает в поле карточки.
      focusField(id === UNDO_SLOT ? (undo?.key ?? "") : id);
    } else if (onSlot && id !== UNDO_SLOT && e.key === "Enter" && !mod) {
      decide(id, "apply");
    } else if (onSlot && id !== UNDO_SLOT && (e.key === "Backspace" || e.key === "Delete")) {
      decide(id, "dismiss");
    } else {
      handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const slotRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) slotRefs.current.set(id, el);
    else slotRefs.current.delete(id);
  };

  // Удалённая карточка blur не присылает — активной считаем только живую.
  const liveKey = (key: string | null) =>
    key && items.some((item) => item.key === key) ? key : null;
  const previewKey = liveKey(hoverKey) ?? liveKey(activeKey);
  const previewItem = previewKey ? items.find((item) => item.key === previewKey) : undefined;
  useAiFieldMarks(scrollEl, previewKey ? [previewKey] : [], "data-ai-active");

  const slotSx = (id: string, index: number) => ({
    position: "absolute" as const,
    left: 16,
    right: 12,
    top: tops[id] ?? 0,
    // До первой раскладки места у карточки нет — не мигаем ею вверху.
    visibility: id in tops ? ("visible" as const) : ("hidden" as const),
    borderRadius: 1,
    outline: "none",
    transition: "top 200ms ease",
    // Карточки выезжают к своим полям по очереди, сверху вниз.
    animation: `${aiCardIn} 280ms ease-out ${Math.min(index, 8) * 50}ms both`,
    ...reducedMotion,
  });

  const undoLabel = isMac ? "⌘Z" : "Ctrl+Z";

  return (
    <Box
      // Колесо над карточками листает форму — как будто они её часть.
      onWheel={(e) => scrollEl?.scrollBy({ top: e.deltaY })}
      onKeyDown={handleKeyDown}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActiveKey(null);
      }}
      sx={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: "100%",
        width: AI_GUTTER_WIDTH,
        overflow: "hidden",
      }}
    >
      <Box ref={trackRef} sx={{ position: "relative", willChange: "transform" }}>
        {items.map((item, index) => (
          <Box
            key={item.key}
            ref={slotRef(item.key)}
            data-ai-slot={item.key}
            tabIndex={0}
            role="group"
            aria-label={item.label}
            onFocus={(e) => setActiveKey(e.target === e.currentTarget ? item.key : null)}
            sx={slotSx(item.key, index)}
          >
            <AiAssistSuggestion
              state={item.state}
              current={item.current}
              title={item.label}
              onTitleClick={() => focusField(item.key)}
              gutter
              onPreview={(on) => setHoverKey(on ? item.key : null)}
              active={activeKey === item.key}
              footer={
                activeKey === item.key ? (
                  <Typography variant="caption" color="text.secondary" component="div">
                    {t("conclusion.aiAssist.keys", { undo: undoLabel })}
                  </Typography>
                ) : null
              }
              onApply={() => {
                setHoverKey(null);
                item.onApply();
              }}
              onDismiss={() => {
                setHoverKey(null);
                item.onDismiss();
              }}
            />
          </Box>
        ))}
        {undo && (
          <Box
            key={`${UNDO_SLOT}-${undo.key}-${undo.kind}`}
            ref={slotRef(UNDO_SLOT)}
            data-ai-slot={UNDO_SLOT}
            tabIndex={0}
            sx={{
              ...slotSx(UNDO_SLOT, 0),
              "&:focus": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
            }}
          >
            <Paper variant="outlined" sx={{ px: 1.5, py: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                {undo.kind === "applied" ? (
                  <CheckCircleOutlined fontSize="small" color="success" />
                ) : (
                  <DoNotDisturbOnOutlined fontSize="small" sx={{ color: "text.disabled" }} />
                )}
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {undo.kind === "applied"
                    ? t("conclusion.aiAssist.undo.applied")
                    : t("conclusion.aiAssist.undo.dismissed")}
                </Typography>
                <Button size="small" onClick={undo.onUndo}>
                  {t("conclusion.aiAssist.undo.action")}
                </Button>
                <Typography variant="caption" color="text.disabled">
                  {undoLabel}
                </Typography>
              </Stack>
            </Paper>
          </Box>
        )}
      </Box>

      {previewItem && scrollEl && (
        <AiFieldPreview
          field={fieldOf(previewItem.key)}
          current={previewItem.current}
          suggestion={previewItem.state.suggestion}
        />
      )}
    </Box>
  );
});

/**
 * Примерка: текст AI с правкой поверх самого поля — врач видит результат
 * в контексте формы. В значение поля ничего не пишется; поверх поля, а не
 * в него, ещё и потому, что подмена значения запустила бы автосохранение
 * черновика. Встаёт в корень инпута (у MUI он `position: relative`) и берёт
 * отступы и шрифт у самого поля ввода — текст ложится на место текста поля.
 */
const AiFieldPreview: React.FC<{
  field: HTMLElement | null;
  current: string;
  suggestion: string | null;
}> = ({ field, current, suggestion }) => {
  const { t } = useT("appointments");
  const host = field?.querySelector<HTMLElement>(".MuiInputBase-root") ?? null;
  const [box, setBox] = React.useState<React.CSSProperties | null>(null);
  React.useLayoutEffect(() => {
    const input = host?.querySelector<HTMLElement>(
      "textarea:not([aria-hidden='true']), input:not([type='hidden'])",
    );
    if (!host || !input) return setBox(null);
    const cs = getComputedStyle(input);
    const hostCs = getComputedStyle(host);
    setBox({
      paddingTop: `calc(${hostCs.paddingTop} + ${cs.paddingTop})`,
      paddingBottom: `calc(${hostCs.paddingBottom} + ${cs.paddingBottom})`,
      paddingLeft: `calc(${hostCs.paddingLeft} + ${cs.paddingLeft})`,
      paddingRight: `calc(${hostCs.paddingRight} + ${cs.paddingRight})`,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      lineHeight: cs.lineHeight,
    });
  }, [host]);
  const parts = React.useMemo(
    () => (suggestion == null || current.trim() === "" ? null : diffWords(current, suggestion)),
    [current, suggestion],
  );
  if (!host || !box || suggestion == null) return null;
  return createPortal(
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        minHeight: "100%",
        zIndex: 3,
        pointerEvents: "none",
        bgcolor: "background.paper",
        borderRadius: "inherit",
        outline: "2px solid",
        outlineColor: "primary.main",
        animation: `${aiCardIn} 160ms ease-out both`,
        ...reducedMotion,
      }}
      style={box}
    >
      <Typography
        variant="caption"
        sx={{
          position: "absolute",
          top: -10,
          right: 8,
          px: 0.75,
          lineHeight: "18px",
          bgcolor: "primary.main",
          color: "primary.contrastText",
          borderRadius: 0.5,
        }}
      >
        {t("conclusion.aiAssist.preview")}
      </Typography>
      {parts ? (
        <AiDiffText parts={parts} sx={{ font: "inherit", lineHeight: "inherit" }} />
      ) : (
        <Box sx={{ whiteSpace: "pre-wrap" }}>{suggestion}</Box>
      )}
    </Box>,
    host,
  );
};
