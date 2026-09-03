import React from "react";
import { alpha, createTheme, type Theme } from "@mui/material/styles";

import { getAppTheme } from "../../theme";

/**
 * Тема публичных страниц записи (`/book/*`).
 *
 * Витрина всегда светлая — сознательное решение: её открывает пациент по ссылке,
 * и белые карточки с фотографиями врачей читаются как страница клиники. Ни
 * настройки сотрудника в CRM (localStorage: colorScheme/primaryColor/surface),
 * ни системная тема устройства гостя сюда не протекают.
 *
 * Эталон — работающая витрина `iwork.operator.kg` (исходники `mamadoc-book`,
 * Next + Tailwind). Значения ниже сняты из её компонентов, а не из макета Figma
 * и не из её `globals.css`: в самих компонентах используются другие оттенки, и
 * именно они видны на экране.
 *
 * Шрифт эталона — системный стек Next; у нас остаётся шрифт приложения.
 */

/** Основное действие: выбранный день, слот, кнопка записи. */
export const BOOKING_PRIMARY = "#007BFF";
/** Наведение на основную кнопку. */
export const BOOKING_PRIMARY_HOVER = "#0069D9";

/** Основной и вторичный цвет текста. */
const TEXT = { primary: "#312E2E", secondary: "#7A7878" };

/** Поверхности: фон страницы и белые карточки. */
const SURFACE = { default: "#F5F5F5", paper: "#FFFFFF" };

/** Тема витрины. */
export function useBookingTheme(): Theme {
  return React.useMemo(() => {
    const base = getAppTheme("light", {
      primaryColor: BOOKING_PRIMARY,
      surface: SURFACE,
      cardSkin: "bordered",
      uiScale: "normal",
    });
    // Цвета текста накладываем поверх: getAppTheme их не принимает, а дефолтный
    // чёрный MUI заметно холоднее, чем #312E2E эталона.
    return createTheme(base, {
      palette: { text: { primary: TEXT.primary, secondary: TEXT.secondary } },
    });
  }, []);
}

// ── Геометрия ────────────────────────────────────────────────────────────────

/** Радиус карточек (`rounded-2xl`). */
export const BOOKING_RADIUS = "16px";
/** Радиус плиток дня, слотов и мелких блоков (`rounded-xl`). */
export const TILE_RADIUS = "12px";
/** Радиус крупных панелей. */
export const PANEL_RADIUS = "16px";
/** Чипы, кнопки и слоты-пилюли. */
export const PILL_RADIUS = "999px";

/** Мягкая тень карточек (`shadow-sm`). */
export const BOOKING_SHADOW = "0 1px 2px 0 rgba(0, 0, 0, 0.05)";
/** Тень выбранного дня. */
export const PICKED_DAY_SHADOW = "0 6px 16px rgba(0, 123, 255, 0.28)";
/** Тень выбранного слота времени. */
export const PICKED_SLOT_SHADOW = "0 4px 12px rgba(0, 123, 255, 0.3)";
/** Тень основной кнопки на десктопе и на мобильной панели. */
export const CTA_SHADOW = "0 8px 20px rgba(0, 123, 255, 0.3)";
export const CTA_SHADOW_MOBILE = "0 6px 16px rgba(0, 123, 255, 0.25)";

// ── Нейтрали эталона ─────────────────────────────────────────────────────────

/** Рамка карточек и плиток. */
export const BORDER = "#E7E7EE";
/** Рамка при наведении на доступный день. */
export const BORDER_HOVER = "#8FC0FF";
/** Разделители внутри карточек. */
export const DIVIDER = "#F0F1F4";
/** Приглушённые подписи (счётчики, дни недели). */
export const MUTED = "#98A2B3";
/** Текст недоступных элементов. */
export const DISABLED_TEXT = "#C6CAD2";
/** Совсем светлый служебный текст (длительность услуги). */
export const FAINT_TEXT = "#B3B8C2";
/** Рамка кнопки в карточке врача («Записаться») — из макета Figma. */
export const CARD_ACTION_BORDER = "#C7C7C7";
/**
 * Рамка блока «Свободных окон пока нет» и кнопки звонка внутри него. В макете
 * она темнее обычной кнопочной: у блока 0.5px, у кнопки 1px.
 */
export const CARD_CALL_BORDER = "#7A7878";

// ── Цвета состояний ──────────────────────────────────────────────────────────

/** Плитка дня: выбранная, доступная, без окон. */
export const dayTone = {
  picked: { bg: BOOKING_PRIMARY, border: BOOKING_PRIMARY, shadow: PICKED_DAY_SHADOW },
  free: { bg: "#FFFFFF", border: BORDER },
  empty: { bg: "#FAFAFB", border: DIVIDER },
} as const;

/** Чип «N окон» внутри плитки дня. */
export const slotsChipTone = {
  free: { bg: "#E9F9EE", text: "#1FA84A" },
  picked: { bg: "rgba(255, 255, 255, 0.2)", text: "#FFFFFF" },
  empty: { bg: "transparent", text: DISABLED_TEXT },
} as const;

/** Слот времени: свободный, выбранный, занятый. */
export const slotTone = {
  idle: { bg: "#FFFFFF", border: BORDER, text: TEXT.primary },
  picked: { bg: BOOKING_PRIMARY, border: BOOKING_PRIMARY, text: "#FFFFFF" },
  busy: { bg: "#F5F6F8", border: "transparent", text: DISABLED_TEXT },
} as const;

/** Шаги мастера: пройденный — зелёный, текущий — синий, будущий — серый. */
export const stepTone = {
  done: "#5CB85C",
  active: BOOKING_PRIMARY,
  idle: { border: "#DDE1E8", text: MUTED, line: "#E7EAEF" },
} as const;

/** Строка услуги: чекбокс, подсветка выбранной, цена. */
export const serviceTone = {
  checked: "#5CB85C",
  checkboxBorder: "#CBD2DC",
  rowPicked: "#F4FAF5",
  rowHover: "#F8FAFC",
  pricePicked: "#2E9A46",
} as const;

/** Голубой чип: специализация врача и сумма заказа. */
export const accentChip = { bg: "#EAF3FF", text: BOOKING_PRIMARY, border: "#DCEBFF" } as const;

/**
 * Ближайшие свободные окна в карточке списка врачей: сегодня — зелёные,
 * завтра — синие, дальняя дата — фиолетовая. Три разных оттенка, а не один
 * приглушённый на всё «не сегодня»: срок ближайшего окна пациент считывает
 * цветом раньше, чем читает дату.
 */
export const nearestTone = {
  today: { label: "#34C759", chipBg: "#D7FFE3", chipText: "#008236" },
  tomorrow: { label: "#1A5DD0", chipBg: "#ECF1FB", chipText: "#1A5DD0" },
  later: { label: "#6E56CF", chipBg: "#F0EDFB", chipText: "#5B46B8" },
} as const;

/** Цвет рейтинга. */
export const RATING_COLOR = "#FEA500";

/**
 * Нейтральный тон для «пустых» мест: заглушка вместо фото, служебные плашки.
 * Намеренно без фирменного цвета — иначе врач без фотографии перетягивает
 * внимание с врачей, у которых фото есть.
 */
export const neutralTone = (t: Theme) => ({
  bg: alpha(t.palette.text.primary, 0.05),
  fg: alpha(t.palette.text.primary, 0.32),
});

/**
 * Тонкий скроллбар внутри карточек. Firefox поддерживает только `scrollbar-*`,
 * WebKit — только псевдоэлементы, поэтому заданы оба набора.
 */
export const THIN_SCROLLBAR = {
  scrollbarWidth: "thin",
  scrollbarColor: "#D5D8DE transparent",
  "&::-webkit-scrollbar": { width: 6, height: 6 },
  "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
  "&::-webkit-scrollbar-thumb": { backgroundColor: "#D5D8DE", borderRadius: 999 },
} as const;

/** Мягкая тень для hover-состояний карточек списка. */
export const hoverLift = (t: Theme) => ({
  transform: "translateY(-2px)",
  boxShadow: `0 8px 24px ${alpha(t.palette.primary.main, 0.16)}`,
  borderColor: t.palette.primary.main,
});
