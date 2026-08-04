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
 * Значения ниже сняты из макета Figma «MamaDoc» (файл OJzc0IoHxZVZYJHNs31DYp,
 * экраны specialization / doctor-cards / doctors). Хардкод цветов здесь
 * намеренный и локализован в одном файле: витрина живёт по палитре макета, а не
 * по фирменному цвету организации из CRM.
 *
 * Шрифт макета — Poppins, но в нём нет кириллицы (в Figma русский текст
 * отрисован подставленным фолбэком), поэтому оставлен шрифт приложения.
 */

/** Основное действие витрины — accents/blue из макета. */
export const BOOKING_PRIMARY = "#0088FF";

/** Основной и вторичный цвет текста макета (primary black / grey). */
const TEXT = { primary: "#312E2E", secondary: "#7A7878" };

/** Поверхности витрины: холодно-серый фон страницы и белые карточки. */
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
    // Цвета текста макета накладываем поверх: getAppTheme их не принимает,
    // а дефолтный чёрный MUI заметно холоднее, чем #312E2E из макета.
    return createTheme(base, {
      palette: { text: { primary: TEXT.primary, secondary: TEXT.secondary } },
    });
  }, []);
}

// ── Геометрия ────────────────────────────────────────────────────────────────

/** Радиус карточек макета (врач, услуги, отзывы, слоты, плитка дня). */
export const BOOKING_RADIUS = "10px";
/** Радиус карточки-контейнера на экране специализаций. */
export const PANEL_RADIUS = "20px";
/** Радиус плиток дня/услуги. Совпадает с карточками — так в макете. */
export const TILE_RADIUS = "10px";
/** Чипы, слоты времени и кнопки макета — всегда pill. */
export const PILL_RADIUS = "100px";

/** Тень карточек витрины (drop-effect макета). */
export const BOOKING_SHADOW = "0 2px 12px rgba(105, 105, 105, 0.12)";

/** Рамка неактивных элементов: слот времени, «Посмотреть ещё», день без окон. */
export const BOOKING_BORDER = "#C7C7C7";
/** Рамка плитки специализации и карточки врача в списке. */
export const CARD_BORDER = "#E6EAF0";

// ── Цвета состояний ──────────────────────────────────────────────────────────

/**
 * Плитка дня в сетке записи. Три состояния из макета:
 * зелёное — выбранный день, синее — день со свободными окнами, серое — без окон.
 * Зелёный здесь значит «выбрано», а не «доступно»: доступность несёт синий.
 */
export const dayTone = {
  picked: { bg: "#D7FFE3", border: "#008236", text: "#008236", chipBg: "#008236" },
  free: {
    bg: "#ECF1FB",
    border: "#AAC5F2",
    text: "#312E2E",
    weekday: "#1A5DD0",
    chipBg: "#1A5DD0",
  },
  empty: { bg: "transparent", border: "#C7C7C7", text: "#D4D4D4", chipBg: "#D4D4D4" },
} as const;

/** Слот времени: выбранный залит зелёным, остальные — рамкой. */
export const slotTone = {
  picked: { bg: "#34C759", text: "#FFFFFF", border: "#34C759" },
  idle: { bg: "transparent", text: "#312E2E", border: "#7A7878" },
} as const;

/**
 * Ближайшие свободные окна в карточке врача. Сегодня — зелёные, завтра — синие,
 * дальняя дата — серая: цвет кодирует «насколько скоро», а не доступность.
 */
export const nearestTone = {
  today: { label: "#34C759", chipBg: "#D7FFE3", chipText: "#008236" },
  tomorrow: { label: "#1A5DD0", chipBg: "#ECF1FB", chipText: "#1A5DD0" },
  later: { label: "#7A7878", chipBg: "#F0F0F0", chipText: "#312E2E" },
} as const;

/** Заливка счётчика «+N» у скрытых окон. */
export const MORE_CHIP_BG = "#A0A0A0";

/** Цвет рейтинга (число и звёзды). */
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

/** Мягкая тень для hover-состояний витрины (в CRM теней нет, здесь — уместны). */
export const hoverLift = (t: Theme) => ({
  transform: "translateY(-2px)",
  boxShadow: `0 8px 24px ${alpha(t.palette.primary.main, 0.16)}`,
  borderColor: t.palette.primary.main,
});
