import React from "react";
import { createPortal } from "react-dom";
import { Box, Button, ButtonBase, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import DoNotDisturbOnOutlined from "@mui/icons-material/DoNotDisturbOnOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import { aiCardIn, aiPop, aiStrikeDraw, aiSweep, aiUnfold, aiWordIn, reducedMotion } from "../ai/aiMotion";
import { useT } from "../../i18n/VerticalProvider";
import { AiAssistSuggestion } from "./AiAssistControls";
import { AiDiffText } from "./AiDiffText";
import { addsNewNumber, diffWords, sameText, type DiffPart } from "./textDiff";
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
  /** Соседняя подсказка (пульт над колонкой, режим «Фокус»). */
  step: (dir: 1 | -1) => void;
}

/**
 * Как колонка показывает подсказки (08.10.2026):
 * - `mirror` — «Зеркало»: карточка шириной с поле, напротив него, текст AI
 *   тем же шрифтом и с теми же переносами; карточка и поле растут по высоте
 *   вместе, поэтому карточки не налезают друг на друга и не уезжают.
 * - `focus` — «Одна в фокусе», когда на зеркало не хватает ширины: у полей
 *   метки, раскрыта одна подсказка, ↑↓ между ними.
 */
export type AiGutterMode = "mirror" | "focus";

/** Отступы колонки: слева от затемнения и справа — место под стрелку «перенести». */
export const AI_GUTTER_PAD_LEFT = 16;
export const AI_GUTTER_PAD_RIGHT = 28;
/**
 * Ширина колонки. Зеркало = поле формы (560 − 2×16) плюс отступы колонки;
 * фокус — карточка, в которой правка ещё читается целиком.
 */
export const AI_GUTTER_WIDTH: Record<AiGutterMode, number> = {
  mirror: 528 + AI_GUTTER_PAD_LEFT + AI_GUTTER_PAD_RIGHT,
  focus: 400,
};
/** Зазор между карточками, которые иначе налезли бы друг на друга. */
const AI_CARD_GAP = 8;
/** Высота метки в режиме «Фокус» — столько места она занимает в раскладке. */
const PIN_HEIGHT = 28;
/** Место «Вернуть» в раскладке — рядом с полем, чьё решение можно вернуть. */
const UNDO_SLOT = "__undo";

/**
 * Появление подсказки в зеркале (08.10.2026): карточка разворачивается из
 * поля, следом выпрыгивает стрелка «перенести», затем правки «штампуются»
 * по очереди — вписанное в карточке и заменённое в поле одновременно, чтобы
 * глаз шёл парами «стало ↔ было». Черновик пустого поля пишется по словам.
 */
const CARD_STAGGER_MS = 80;
const STAMP_START_MS = 480;
const STAMP_STEP_MS = 220;
const WORD_STEP_MS = 35;
/** Сколько длится вступление — после него анимации снимаются, правка поля их не перезапускает. */
const INTRO_MS = 3500;

const cardDelay = (index: number) => Math.min(index, 8) * CARD_STAGGER_MS;
const stampDelay = (index: number, order: number) =>
  cardDelay(index) + STAMP_START_MS + Math.min(order, 10) * STAMP_STEP_MS;

/** Номер правки (группы подряд идущих удалений/вставок) для каждой части диффа. */
const changeOrder = (parts: DiffPart[]): number[] => {
  let order = -1;
  let inChange = false;
  return parts.map((part) => {
    if (part.kind === "same") {
      inChange = false;
      return -1;
    }
    if (!inChange) order += 1;
    inChange = true;
    return order;
  });
};

/** Вступление идёт — анимации включены; после — статичная картинка. */
function useIntro() {
  const [intro, setIntro] = React.useState(true);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setIntro(false), INTRO_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return intro;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Рамка поля ввода внутри обёртки `data-ai-key` — к ней равняется карточка. */
const anchorOf = (field: HTMLElement) =>
  field.querySelector<HTMLElement>(".MuiInputBase-root") ?? field;

const textInputOf = (host: HTMLElement) =>
  host.querySelector<HTMLElement>("textarea:not([aria-hidden='true']), input:not([type='hidden'])");

/** Вернуть полю его высоту и выравнивание (снять растяжку зеркала). */
const unstretch = (el: HTMLElement) => {
  el.style.minHeight = "";
  el.style.alignItems = "";
};

/** Шрифт и внутренние отступы текста поля — карточка повторяет их один в один. */
interface FieldTypography {
  fontSize: string;
  fontFamily: string;
  lineHeight: string;
  letterSpacing: string;
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
}

const readTypography = (anchor: HTMLElement): FieldTypography | null => {
  const input = textInputOf(anchor);
  if (!input) return null;
  const cs = getComputedStyle(input);
  const host = getComputedStyle(anchor);
  const px = (a: string, b: string) => Math.round((parseFloat(a) || 0) + (parseFloat(b) || 0));
  return {
    fontSize: cs.fontSize,
    fontFamily: cs.fontFamily,
    lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing,
    padTop: px(host.paddingTop, cs.paddingTop),
    padRight: px(host.paddingRight, cs.paddingRight),
    padBottom: px(host.paddingBottom, cs.paddingBottom),
    padLeft: px(host.paddingLeft, cs.paddingLeft),
  };
};

const sameTypography = (a?: FieldTypography, b?: FieldTypography) =>
  a === b || (!!a && !!b && (Object.keys(a) as (keyof FieldTypography)[]).every((k) => a[k] === b[k]));

/** Место слота в раскладке: верх, ширина (= поле) и общая высота строки. */
interface SlotBox {
  top: number;
  width?: number;
  rowHeight?: number;
  typo?: FieldTypography;
}

const sameBox = (a: SlotBox | undefined, b: SlotBox) =>
  !!a && a.top === b.top && a.width === b.width && a.rowHeight === b.rowHeight && sameTypography(a.typo, b.typo);

/**
 * Подсказки AI слева от дровера, каждая — напротив своего поля, как заметки
 * на полях документа. Дровер не расширяется.
 *
 * Слой — потомок дровера, вынесенный за его левый край (`right: 100%`):
 * клик по карточке не считается кликом мимо дровера, а при открытии
 * карточки выезжают вместе с ним. Родитель — `position: relative` по высоте
 * формы; слой обрезается по ней сверху и снизу, а справа выпускает стрелку
 * «перенести» на край дровера.
 *
 * Позиции — в координатах содержимого формы: считаются только при изменении
 * раскладки (ResizeObserver). Прокрутка лишь сдвигает слой через transform —
 * без React-рендера, карточки не отстают от полей.
 *
 * Зеркало выравнивает строку «карточка | поле» по высоте: поле получает
 * `min-height` карточки (стилем прямо на рамке ввода — поля рисует не этот
 * компонент), карточка — высоту поля. Снимается, когда подсказки нет.
 *
 * Разбор с клавиатуры: фокус на карточке → ↑↓ между подсказками (форма
 * доезжает до поля), Enter — принять, ⌫ — отклонить, ⌘Z — вернуть, Esc — в
 * поле.
 */
export const AiSuggestionGutter = React.forwardRef<
  AiSuggestionGutterHandle,
  {
    /** Прокручиваемая колонка формы: в ней поля с `data-ai-key`. */
    scrollEl: HTMLElement | null;
    items: AiGutterItem[];
    undo: AiGutterUndo | null;
    mode: AiGutterMode;
  }
>(function AiSuggestionGutter({ scrollEl, items, undo, mode }, ref) {
  const { t } = useT("appointments");
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const slotRefs = React.useRef(new Map<string, HTMLDivElement>());
  const [boxes, setBoxes] = React.useState<Record<string, SlotBox>>({});
  /** Рамки полей, которым зеркало задало min-height, — снять, когда не нужно. */
  const stretched = React.useRef(new Set<HTMLElement>());
  /** Карточки сверху вниз — порядок переходов ↑↓. */
  const orderRef = React.useRef<string[]>([]);
  /** Карточка с фокусом (сама карточка, не её кнопка) — для ↑↓ и примерки. */
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  /** Раскрытая подсказка в режиме «Фокус». */
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  /** «Применить» под курсором — примерка без фокуса. */
  const [hoverKey, setHoverKey] = React.useState<string | null>(null);
  /**
   * Куда поставить фокус, когда раскладка обновится: на карточку с этим
   * номером (после решения с клавиатуры) или на карточку поля (после ⌘Z).
   */
  const pendingFocus = React.useRef<{ index: number } | { fieldKey: string } | null>(null);

  const liveKey = React.useCallback(
    (key: string | null) => (key && items.some((item) => item.key === key) ? key : null),
    [items],
  );
  // В фокусе раскрыта выбранная подсказка, а если её уже нет — первая по форме.
  const openSlot = mode === "focus" ? (liveKey(openKey) ?? orderRef.current.find((k) => liveKey(k)) ?? items[0]?.key ?? null) : null;

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
    const pairs = slotsSig
      .split("|")
      .filter(Boolean)
      .map((pair, index) => {
        const [id, fieldKey] = pair.split(">");
        const field = fieldOf(fieldKey);
        return { id, index, anchor: field ? anchorOf(field) : null };
      });

    // 1. Зеркало: высота строки = max(поле, карточка). Сначала все высоты —
    //    min-height верхнего поля сдвигает поля под ним.
    const rowHeights = new Map<string, number>();
    const keep = new Set<HTMLElement>();
    if (mode === "mirror") {
      for (const { id, anchor } of pairs) {
        const body = slotRefs.current.get(id)?.querySelector<HTMLElement>("[data-ai-body]");
        if (id === UNDO_SLOT || !anchor || !body) continue;
        anchor.style.minHeight = "";
        const fieldHeight = anchor.offsetHeight;
        const prev = body.style.minHeight;
        body.style.minHeight = "0px";
        const cardHeight = body.offsetHeight;
        body.style.minHeight = prev;
        const row = Math.max(fieldHeight, cardHeight);
        anchor.style.minHeight = `${row}px`;
        // Рамка MUI центрирует поле ввода по высоте — растянутое поле
        // уехало бы вниз от текста карточки и пометок зачёркивания.
        anchor.style.alignItems = "flex-start";
        rowHeights.set(id, row);
        keep.add(anchor);
      }
    }
    for (const el of stretched.current) if (!keep.has(el)) unstretch(el);
    stretched.current = keep;

    // 2. Верх каждого слота — по верху рамки поля, в координатах содержимого
    //    формы (от прокрутки не зависит).
    const origin = scrollEl.getBoundingClientRect().top - scrollEl.scrollTop;
    const placed = pairs.map(({ id, index, anchor }) => {
      const rect = anchor?.getBoundingClientRect();
      const isPin = mode === "focus" && id !== UNDO_SLOT && id !== openSlot;
      return {
        id,
        index,
        top: rect ? rect.top - origin : Number.POSITIVE_INFINITY,
        width: rect ? Math.round(rect.width) : undefined,
        typo: mode === "mirror" && anchor ? (readTypography(anchor) ?? undefined) : undefined,
        // Раскрытая подсказка «Фокуса» лежит поверх меток ниже — место в
        // очереди она занимает как метка, а не всей высотой.
        height: isPin || (mode === "focus" && id === openSlot) ? PIN_HEIGHT : (slotRefs.current.get(id)?.offsetHeight ?? 0),
      };
    });
    placed.sort((a, b) => a.top - b.top || a.index - b.index);
    const next: Record<string, SlotBox> = {};
    let floor = 0;
    for (const slot of placed) {
      const top = Math.round(Math.max(Number.isFinite(slot.top) ? slot.top : floor, floor));
      next[slot.id] = { top, width: slot.width, rowHeight: rowHeights.get(slot.id), typo: slot.typo };
      floor = top + slot.height + AI_CARD_GAP;
    }
    orderRef.current = placed.map((slot) => slot.id).filter((id) => id !== UNDO_SLOT);
    setBoxes((prev) =>
      Object.keys(next).length === Object.keys(prev).length &&
      Object.entries(next).every(([id, value]) => sameBox(prev[id], value))
        ? prev
        : next,
    );
    syncScroll();
  }, [scrollEl, fieldOf, slotsSig, syncScroll, mode, openSlot]);

  React.useLayoutEffect(() => {
    layout();
    if (!scrollEl) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    // Раскладку меняют рост полей и блоков над ними (следим за содержимым
    // формы целиком), высота самой формы и карточек.
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

  // Колонка закрылась — поля возвращают свою высоту.
  React.useEffect(
    () => () => {
      for (const el of stretched.current) unstretch(el);
      stretched.current.clear();
    },
    [],
  );

  /** Фокус на карточку и форма — к её полю. */
  const focusSlot = React.useCallback(
    (id: string | undefined) => {
      if (!id) return;
      if (mode === "focus" && id !== UNDO_SLOT) setOpenKey(id);
      // В «Фокусе» карточка появляется после рендера — фокус на неё ставит
      // эффект ниже, когда она встанет на место.
      if (mode === "focus" && id !== UNDO_SLOT && id !== openSlot) pendingFocus.current = { fieldKey: id };
      else slotRefs.current.get(id)?.focus({ preventScroll: true });
      const fieldKey = id === UNDO_SLOT ? undo?.key : id;
      if (fieldKey) fieldOf(fieldKey)?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [fieldOf, undo, mode, openSlot],
  );

  const step = React.useCallback(
    (dir: 1 | -1) => {
      const order = orderRef.current;
      if (order.length === 0) return;
      const current = mode === "focus" ? openSlot : activeKey;
      const at = current ? order.indexOf(current) : -1;
      focusSlot(order[(at + dir + order.length) % order.length]);
    },
    [mode, openSlot, activeKey, focusSlot],
  );

  React.useImperativeHandle(
    ref,
    () => ({ focusFirst: () => focusSlot(orderRef.current[0]), step }),
    [focusSlot, step],
  );

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
    if (!(target in boxes)) return;
    if (mode === "focus" && target !== UNDO_SLOT && target !== openSlot) {
      setOpenKey(target);
      return;
    }
    pendingFocus.current = null;
    slotRefs.current.get(target)?.focus({ preventScroll: true });
    if (target !== UNDO_SLOT) fieldOf(target)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [boxes, undo, mode, openSlot, fieldOf]);

  const decide = (id: string, action: "apply" | "dismiss") => {
    const item = items.find((it) => it.key === id);
    if (!item) return;
    pendingFocus.current = { index: orderRef.current.indexOf(id) };
    setHoverKey(null);
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
      const dir = e.key === "ArrowDown" ? 1 : -1;
      // С «Вернуть» — к ближайшей карточке по направлению.
      const from = at >= 0 ? at : dir > 0 ? -1 : order.length;
      focusSlot(order[Math.max(0, Math.min(order.length - 1, from + dir))]);
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

  // Примерка поверх поля — в «Фокусе»: в зеркале «было» и «стало» и так рядом.
  const previewKey = mode === "focus" ? (liveKey(hoverKey) ?? liveKey(activeKey)) : null;
  const previewItem = previewKey ? items.find((item) => item.key === previewKey) : undefined;
  useAiFieldMarks(scrollEl, liveKey(activeKey) ? [activeKey as string] : [], "data-ai-active");

  const slotSx = (id: string, index: number, width?: number) => ({
    position: "absolute" as const,
    // Карточка прижата к дровера и шириной с поле (зеркало) или с колонку.
    right: AI_GUTTER_PAD_RIGHT,
    ...(width ? { width } : { left: AI_GUTTER_PAD_LEFT }),
    top: boxes[id]?.top ?? 0,
    // До первой раскладки места у карточки нет — не мигаем ею вверху.
    visibility: id in boxes ? ("visible" as const) : ("hidden" as const),
    borderRadius: 1,
    outline: "none",
    transition: "top 200ms ease",
    // Карточки выезжают к своим полям по очереди, сверху вниз; в зеркале —
    // разворачиваются из поля.
    animation:
      mode === "mirror" && id !== UNDO_SLOT
        ? `${aiUnfold} 550ms cubic-bezier(.2,.8,.2,1) ${cardDelay(index)}ms both`
        : `${aiCardIn} 280ms ease-out ${Math.min(index, 8) * 50}ms both`,
    ...reducedMotion,
  });

  const undoLabel = isMac ? "⌘Z" : "Ctrl+Z";
  const keysHint = (
    <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 1.5, pt: 0.5 }}>
      {t("conclusion.aiAssist.keys", { undo: undoLabel })}
    </Typography>
  );
  const innerWidth = AI_GUTTER_WIDTH[mode] - AI_GUTTER_PAD_LEFT - AI_GUTTER_PAD_RIGHT;

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
        width: AI_GUTTER_WIDTH[mode],
        // Сверху и снизу — по высоте формы; справа выпускаем стрелку
        // «перенести», которая лежит на краю дровера.
        clipPath: `inset(0 -${AI_GUTTER_PAD_RIGHT}px 0 0)`,
        overflow: "visible",
      }}
    >
      <Box ref={trackRef} sx={{ position: "relative", willChange: "transform" }}>
        {items.map((item, index) => {
          const box = boxes[item.key];
          const open = mode === "mirror" || item.key === openSlot;
          return (
            <Box
              key={item.key}
              ref={slotRef(item.key)}
              data-ai-slot={item.key}
              tabIndex={open ? 0 : -1}
              role="group"
              aria-label={item.label}
              onFocus={(e) => setActiveKey(e.target === e.currentTarget ? item.key : null)}
              sx={{
                ...slotSx(
                  item.key,
                  index,
                  mode === "mirror" ? Math.min(box?.width ?? innerWidth, innerWidth) : open ? innerWidth : undefined,
                ),
                // Раскрытая подсказка «Фокуса» — поверх меток полей ниже.
                zIndex: mode === "focus" && open ? 2 : 1,
                ...(mode === "focus" && !open ? { left: "auto", width: "auto", maxWidth: innerWidth } : null),
              }}
            >
              {mode === "mirror" ? (
                <AiMirrorCard
                  item={item}
                  index={index}
                  typo={box?.typo}
                  rowHeight={box?.rowHeight}
                  active={activeKey === item.key}
                  // Строка подсказки по клавишам удлинила бы карточку, а
                  // высота карточки в зеркале — это высота строки с полем.
                  footer={null}
                  onTitleClick={() => focusField(item.key)}
                  onApply={() => decide(item.key, "apply")}
                  onDismiss={() => decide(item.key, "dismiss")}
                />
              ) : open ? (
                <AiAssistSuggestion
                  state={item.state}
                  current={item.current}
                  title={item.label}
                  onTitleClick={() => focusField(item.key)}
                  gutter
                  onPreview={(on) => setHoverKey(on ? item.key : null)}
                  active={activeKey === item.key}
                  footer={activeKey === item.key ? keysHint : null}
                  onApply={() => decide(item.key, "apply")}
                  onDismiss={() => decide(item.key, "dismiss")}
                />
              ) : (
                <AiPin label={item.label} onClick={() => focusSlot(item.key)} />
              )}
            </Box>
          );
        })}
        {undo && (
          <Box
            key={`${UNDO_SLOT}-${undo.key}-${undo.kind}`}
            ref={slotRef(UNDO_SLOT)}
            data-ai-slot={UNDO_SLOT}
            tabIndex={0}
            sx={{
              ...slotSx(UNDO_SLOT, 0),
              left: "auto",
              zIndex: 1,
              "&:focus": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
            }}
          >
            <Paper variant="outlined" sx={{ pl: 1.25, pr: 0.5, py: 0.25, borderRadius: 999 }}>
              <Stack direction="row" spacing={0.75} alignItems="center">
                {undo.kind === "applied" ? (
                  <CheckCircleOutlined fontSize="small" color="success" />
                ) : (
                  <DoNotDisturbOnOutlined fontSize="small" sx={{ color: "text.disabled" }} />
                )}
                <Typography variant="body2" noWrap>
                  {undo.kind === "applied"
                    ? t("conclusion.aiAssist.undo.applied")
                    : t("conclusion.aiAssist.undo.dismissed")}
                </Typography>
                <Button size="small" onClick={undo.onUndo} sx={{ minWidth: 0 }}>
                  {t("conclusion.aiAssist.undo.action")}
                </Button>
                <Typography variant="caption" color="text.disabled" sx={{ pr: 0.75 }}>
                  {undoLabel}
                </Typography>
              </Stack>
            </Paper>
          </Box>
        )}
      </Box>

      {/* Зеркало: удалённые слова зачёркнуты прямо в поле — «было» справа,
          «стало» в карточке слева. */}
      {mode === "mirror" &&
        scrollEl &&
        items.map((item, index) => (
          <AiFieldStrike
            key={item.key}
            index={index}
            field={fieldOf(item.key)}
            current={item.current}
            suggestion={item.state.suggestion}
          />
        ))}

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

/** Метка подсказки у поля в режиме «Фокус»: клик раскрывает её. */
const AiPin: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <ButtonBase
    onClick={onClick}
    sx={{
      height: PIN_HEIGHT,
      px: 1.25,
      gap: 0.75,
      borderRadius: 999,
      bgcolor: "background.paper",
      border: 1,
      borderColor: "divider",
      typography: "body2",
      fontWeight: 500,
      maxWidth: "100%",
      "&:hover": { borderColor: "primary.main" },
      "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
    }}
  >
    <AutoAwesomeOutlined sx={{ fontSize: 16, color: "primary.main" }} />
    <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {label}
    </Box>
  </ButtonBase>
);

/**
 * Карточка «Зеркала»: ширина, шрифт и отступы — как у поля напротив, поэтому
 * текст AI переносится по тем же строкам, что текст врача. Показывает сторону
 * «стало» (вписанное подсвечено, новые числа — отдельно); «было» с
 * зачёркнутым — в самом поле (AiFieldStrike). Подпись — на рамке, как у
 * поля MUI. Стрелка на краю дровера переносит текст в поле.
 */
const AiMirrorCard: React.FC<{
  item: AiGutterItem;
  /** Номер карточки сверху вниз — задержка появления. */
  index: number;
  typo?: FieldTypography;
  rowHeight?: number;
  active: boolean;
  footer: React.ReactNode;
  onTitleClick: () => void;
  onApply: () => void;
  onDismiss: () => void;
}> = ({ item, index, typo, rowHeight, active, footer, onTitleClick, onApply, onDismiss }) => {
  const { t } = useT("appointments");
  const intro = useIntro();
  const { suggestion, source, reason } = item.state;
  const current = item.current;
  const isDraft = current.trim() === "";
  const parts = React.useMemo(
    () => (suggestion == null || isDraft ? null : diffWords(current, suggestion)),
    [suggestion, current, isDraft],
  );
  const stale = source != null && !sameText(source, current);
  const hasNewNumber = parts ? parts.some((_, i) => addsNewNumber(parts, i)) : false;
  if (suggestion == null) return null;
  const pad = typo
    ? { pt: `${typo.padTop}px`, pr: `${typo.padRight}px`, pb: `${typo.padBottom}px`, pl: `${typo.padLeft}px` }
    : { px: 1.75, py: 1 };
  const font = typo
    ? { fontSize: typo.fontSize, fontFamily: typo.fontFamily, lineHeight: typo.lineHeight, letterSpacing: typo.letterSpacing }
    : { typography: "body1" };
  const note = stale
    ? { text: t("conclusion.aiAssist.cardStale"), color: "warning.main" }
    : reason
      ? { text: reason, color: "text.secondary" }
      : isDraft
        ? { text: t("conclusion.aiAssist.cardDraft"), color: "text.secondary" }
        : null;
  return (
    <Box sx={{ position: "relative" }}>
      <Box
        data-ai-body
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          minHeight: rowHeight,
          bgcolor: "background.paper",
          borderRadius: 1,
          // Рамка тенью внутрь, а не border: border съел бы 2px ширины текста,
          // и переносы разошлись бы с полем.
          boxShadow: (th) => `inset 0 0 0 ${active ? 2 : 1}px ${th.palette.primary.main}`,
        }}
      >
        <Typography
          component="button"
          type="button"
          tabIndex={-1}
          onClick={onTitleClick}
          variant="caption"
          sx={{
            position: "absolute",
            top: -9,
            left: 8,
            px: 0.5,
            maxWidth: "calc(100% - 16px)",
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            lineHeight: "18px",
            border: 0,
            bgcolor: "background.paper",
            color: "primary.main",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <AutoAwesomeOutlined sx={{ fontSize: 14 }} />
          {item.label}
        </Typography>
        <Box sx={{ ...pad, ...font, whiteSpace: "pre-wrap", overflowWrap: "break-word", color: "text.primary" }}>
          {parts ? (
            <AiNewSide parts={parts} index={index} intro={intro} />
          ) : intro ? (
            <AiDraftWords text={suggestion} index={index} />
          ) : (
            suggestion
          )}
        </Box>
        <Box sx={{ flex: 1 }} />
        {note && (
          <Stack direction="row" spacing={0.5} sx={{ px: typo ? `${typo.padLeft}px` : 1.75, pb: 0.75 }}>
            {hasNewNumber && parts && !stale && (
              <WarningAmberOutlined sx={{ fontSize: 15, color: "warning.main", mt: "1px" }} />
            )}
            <Typography variant="caption" color={note.color}>
              {note.text}
            </Typography>
          </Stack>
        )}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            px: 1,
            py: 0.5,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "action.hover",
            borderRadius: "0 0 4px 4px",
          }}
        >
          <Button size="small" color="inherit" onClick={onDismiss} sx={{ color: "text.secondary" }}>
            {t("conclusion.aiAssist.dismiss")}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="contained"
            disableElevation
            endIcon={<ArrowForwardOutlined />}
            onClick={onApply}
          >
            {t("conclusion.aiAssist.transfer")}
          </Button>
        </Stack>
      </Box>
      {/* Стрелка на краю дровера: подсказка слева, поле справа — «принять»
          и есть «перенести вправо». */}
      <Tooltip title={t("conclusion.aiAssist.transferHint")} placement="top">
        <IconButton
          size="small"
          tabIndex={-1}
          aria-label={t("conclusion.aiAssist.transfer")}
          onClick={onApply}
          sx={{
            position: "absolute",
            top: 6,
            right: -(AI_GUTTER_PAD_RIGHT + 15),
            width: 30,
            height: 30,
            zIndex: 2,
            border: 2,
            borderColor: "background.paper",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            "&:hover": { bgcolor: "primary.dark" },
            animation: `${aiPop} 350ms cubic-bezier(.3,1.6,.5,1) ${cardDelay(index) + 250}ms both`,
            ...reducedMotion,
          }}
        >
          <ArrowForwardOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      {footer}
    </Box>
  );
};

/** Сторона «стало»: общий текст как есть, вписанное — подсветкой, новые числа — предупреждением. */
const AiNewSide: React.FC<{ parts: DiffPart[]; index: number; intro: boolean }> = ({ parts, index, intro }) => {
  const order = changeOrder(parts);
  return (
    <>
      {parts.map((part, i) => {
        if (part.kind === "removed") return null;
        if (part.kind === "same" || part.text.trim() === "") return <React.Fragment key={i}>{part.text}</React.Fragment>;
        const warn = addsNewNumber(parts, i);
        const lead = part.text.match(/^\s*/)?.[0] ?? "";
        const tail = part.text.match(/\s*$/)?.[0] ?? "";
        return (
          <React.Fragment key={i}>
            {lead}
            <Box
              component="ins"
              sx={{
                textDecoration: "none",
                borderRadius: 0.5,
                // Заливка — фоном-картинкой: у неё анимируется ширина (штамп).
                backgroundImage: (th) => {
                  const c = alpha(warn ? th.palette.warning.main : th.palette.success.main, warn ? 0.2 : 0.14);
                  return `linear-gradient(${c}, ${c})`;
                },
                backgroundRepeat: "no-repeat",
                backgroundSize: "100% 100%",
                boxShadow: (th) => (warn ? `inset 0 -1.5px 0 ${th.palette.warning.main}` : "none"),
                ...(intro
                  ? {
                      animation: `${aiSweep} 380ms cubic-bezier(.3,.7,.2,1) ${stampDelay(index, order[i])}ms both`,
                      ...reducedMotion,
                    }
                  : null),
              }}
            >
              {part.text.trim()}
            </Box>
            {tail}
          </React.Fragment>
        );
      })}
    </>
  );
};

/** Черновик пустого поля «пишется на глазах»: слова проявляются по очереди. */
const AiDraftWords: React.FC<{ text: string; index: number }> = ({ text, index }) => {
  let word = 0;
  return (
    <>
      {text.split(/(\s+)/).map((chunk, i) => {
        if (chunk === "") return null;
        if (/^\s+$/.test(chunk)) return <React.Fragment key={i}>{chunk}</React.Fragment>;
        const delay = cardDelay(index) + 300 + Math.min(word++, 60) * WORD_STEP_MS;
        return (
          <Box
            key={i}
            component="span"
            sx={{
              display: "inline-block",
              animation: `${aiWordIn} 300ms ease-out ${delay}ms both`,
              ...reducedMotion,
            }}
          >
            {chunk}
          </Box>
        );
      })}
    </>
  );
};

/**
 * Зачёркнутое прямо в поле (зеркало): прозрачный слой с тем же текстом поверх
 * поля ввода, видны только пометки удалённых слов. Текст слоя — сторона
 * «было» правки, то есть ровно текст поля, поэтому пометки ложатся на свои
 * слова. В значение поля ничего не пишется. Только у многострочного поля:
 * у автокомплита диагноза текста под пометки нет.
 */
const AiFieldStrike: React.FC<{
  index: number;
  field: HTMLElement | null;
  current: string;
  suggestion: string | null;
}> = ({ index, field, current, suggestion }) => {
  const intro = useIntro();
  const host = field?.querySelector<HTMLElement>(".MuiInputBase-root") ?? null;
  const box = useFieldTextBox(host, "textarea:not([aria-hidden='true'])");
  // Слой — по видимой части поля ввода: свёрнутое поле (CollapsibleTextField)
  // прячет хвост текста, и пометки хвоста висели бы под полем.
  const [visibleHeight, setVisibleHeight] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const input = host?.querySelector<HTMLElement>("textarea:not([aria-hidden='true'])");
    if (!host || !input) return;
    const measure = () => setVisibleHeight(input.offsetTop + input.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(input);
    return () => observer.disconnect();
  }, [host]);
  const parts = React.useMemo(
    () => (suggestion == null || current.trim() === "" ? null : diffWords(current, suggestion)),
    [current, suggestion],
  );
  if (!host || !box || !parts || !parts.some((p) => p.kind === "removed")) return null;
  const order = changeOrder(parts);
  return createPortal(
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: visibleHeight ?? "100%",
        paddingBottom: "0 !important",
        zIndex: 1,
        overflow: "hidden",
        pointerEvents: "none",
        color: "transparent",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
      }}
      style={box}
    >
      {parts.map((part, i) =>
        part.kind === "added" ? null : part.kind === "same" ? (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        ) : (
          <Box
            key={i}
            component="span"
            sx={{
              borderRadius: 0.5,
              bgcolor: (th) => alpha(th.palette.error.main, 0.14),
              // Черта — фоном-картинкой, а не line-through: так её можно
              // прочертить слева направо в паре со «штампом» в карточке.
              backgroundImage: (th) => `linear-gradient(${th.palette.error.main}, ${th.palette.error.main})`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "0 58%",
              backgroundSize: "100% 1.5px",
              ...(intro
                ? {
                    animation: `${aiStrikeDraw} 380ms cubic-bezier(.3,.7,.2,1) ${stampDelay(index, order[i])}ms both`,
                    ...reducedMotion,
                  }
                : null),
            }}
          >
            {part.text}
          </Box>
        ),
      )}
    </Box>,
    host,
  );
};

/** Отступы и шрифт текста поля — слой поверх поля ложится буква в букву. */
function useFieldTextBox(host: HTMLElement | null, inputSelector: string) {
  const [box, setBox] = React.useState<React.CSSProperties | null>(null);
  React.useLayoutEffect(() => {
    const input = host?.querySelector<HTMLElement>(inputSelector);
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
      letterSpacing: cs.letterSpacing,
    });
  }, [host, inputSelector]);
  return box;
}

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
  const box = useFieldTextBox(host, "textarea:not([aria-hidden='true']), input:not([type='hidden'])");
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
