import React from "react";
import { createTheme, type Theme } from "@mui/material/styles";

import { getAppTheme } from "../../theme";
import { BOOKING_PRIMARY } from "../public-booking/theme";

/**
 * Тема лендинга `/site`.
 *
 * Отличается от темы витрины записи одним: акцент задаёт владелец в настройках
 * («Сайт» → цвет). Лендинг — лицо бизнеса, и синий цвет витрины на сайте
 * стоматологии или салона выглядит чужим. Всё остальное намеренно совпадает с
 * витриной: гость переходит с сайта на запись и не должен попадать «в другой
 * продукт».
 *
 * Страница всегда светлая — как и витрина: тёмную тему сотрудника из CRM гостю
 * показывать нельзя (см. `../public-booking/theme.ts`).
 */

/** Цвет текста — общий с витриной. */
const TEXT = { primary: "#312E2E", secondary: "#7A7878" };

/** Фон страницы и карточек. */
const SURFACE = { default: "#FFFFFF", paper: "#FFFFFF" };

/** Мягкая подложка секций, чередующихся с белыми. */
export const SECTION_BG = "#F7F8FA";

/** Рамка карточек лендинга. */
export const SITE_BORDER = "#E7E7EE";

/** Радиусы: карточка секции и мелкая плитка. */
export const SITE_RADIUS = "20px";
export const SITE_TILE_RADIUS = "14px";

/** Максимальная ширина контента — как на витрине записи. */
export const SITE_MAX_WIDTH = 1280;

export function useSiteTheme(accentColor: string | null): Theme {
  return React.useMemo(() => {
    const base = getAppTheme("light", {
      primaryColor: accentColor || BOOKING_PRIMARY,
      surface: SURFACE,
      cardSkin: "bordered",
      uiScale: "normal",
    });
    return createTheme(base, {
      palette: { text: { primary: TEXT.primary, secondary: TEXT.secondary } },
    });
  }, [accentColor]);
}
