import React from "react";
import { alpha, type Theme } from "@mui/material/styles";

import { getAppTheme } from "../../theme";

/**
 * Тема публичных страниц записи (`/book/*`).
 *
 * Витрина всегда светлая — сознательное решение: её открывает пациент по ссылке,
 * и белые карточки с фотографиями врачей читаются как страница клиники. Ни
 * настройки сотрудника в CRM (localStorage: colorScheme/primaryColor/surface),
 * ни системная тема устройства гостя сюда не протекают.
 *
 * Цвета совпадают с booking-фронтом (репозиторий mamadoc-book): синий #007BFF —
 * основное действие, зелёный #5CB85C — подтверждённый выбор (время, услуги).
 */

/** Основной синий витрины (booking-фронт: `bg-[#007BFF]`). */
export const BOOKING_PRIMARY = "#007BFF";

/**
 * Поверхности витрины: фон страницы + карточки. Фон холодно-серый, чуть
 * голубоватый — на нём белые карточки читаются как отдельные объекты, а не как
 * пятна на сером листе.
 */
const SURFACE = { default: "#F6F8FB", paper: "#FFFFFF" };

/** Тема витрины. */
export function useBookingTheme(): Theme {
  return React.useMemo(
    () =>
      getAppTheme("light", {
        primaryColor: BOOKING_PRIMARY,
        surface: SURFACE,
        cardSkin: "bordered",
        uiScale: "normal",
      }),
    [],
  );
}

/** Радиус карточек витрины (booking-фронт: `rounded-2xl`). */
export const BOOKING_RADIUS = "16px";
/** Радиус плиток дня/услуги (booking-фронт: `rounded-[10px]`). */
export const TILE_RADIUS = "10px";

/**
 * Цвета выбора. Считаются от палитры, а не хардкодятся, чтобы смена фирменного
 * цвета не требовала правок здесь (гайд стиля: без сырых rgba).
 *
 * Синий здесь значит ровно одно — «это можно выбрать и это выбрано». Раньше
 * доступное было голубым, а выбранное зелёным: два акцента в одном ряду плиток
 * заставляют глаз сравнивать цвета вместо чтения дат. Зелёный остался за
 * подтверждением записи (экран успеха), серый — за недоступным.
 */
export const tileTone = (t: Theme) => ({
  /** Плитка свободного дня / невыбранной услуги: белая с мягкой рамкой. */
  idleBg: t.palette.background.paper,
  // 0.3, а не легче: на белой карточке более бледная рамка сливается с фоном и
  // плитки перестают читаться как кнопки.
  idleBorder: alpha(t.palette.primary.main, 0.3),
  idleText: t.palette.text.primary,
  /** Второстепенная подпись внутри плитки («14 окон»). */
  idleHint: t.palette.primary.onSurface,
  /** Выбранная плитка — залитая акцентом. */
  pickedBg: t.palette.primary.main,
  pickedBorder: t.palette.primary.main,
  pickedText: t.palette.primary.contrastText,
  /** Мягкая подсветка выбранной строки услуги (текст остаётся тёмным). */
  softBg: alpha(t.palette.primary.main, 0.06),
});

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
