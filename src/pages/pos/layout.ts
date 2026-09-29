import { alpha, type Theme } from "@mui/material/styles";

import { subtleBg, subtleBorder } from "../../theme/uiHelpers";

/**
 * Токены модуля «Касса» — макет Monogram (Figma, секция «Касса», node 136:2103).
 *
 * Размеры взяты из макета один в один: рабочая область 1368×900 при сайдбаре
 * 72px, левая колонка 1028, правая панель оплаты 340. Всё, что в макете задано
 * в пикселях (высоты полос, радиусы, ширины колонок чека), живёт здесь, чтобы
 * компоненты не растаскивали magic numbers.
 *
 * Цвета макета — тёмная палитра Monogram (bg #04070F, card #131822,
 * accent #8973D5). В приложении акцент и фон задаёт пресет темы
 * (`theme/accentPalette.ts`), поэтому хексы не переносим: `posColors()`
 * раскладывает роли макета по токенам активной темы, и модуль одинаково
 * работает в светлой и тёмной.
 */

/** Высоты и отступы каркаса страницы. */
export const POS_LAYOUT = {
  /** Полоса категорий под шапкой. */
  categoryBarHeight: 41,
  /** Ширина правой панели оплаты. */
  paymentPanelWidth: 340,
  /** Горизонтальный отступ левой колонки (Check x=10 внутри контейнера 1028). */
  contentPaddingX: 10,
  /** Высота футера с клиентом (макет: 108, поиск клиента — 163, регистрация — 198). */
  clientFooterHeight: 108,
  /** Плашка «Рекомендовать клиенту». */
  recommendationHeight: 62,
} as const;

/** Радиусы макета. */
export const POS_RADIUS = {
  pill: 100,
  card: 12,
  control: 16,
  tile: 10,
  chip: 6,
  dialog: 24,
} as const;

/**
 * Роли цветов макета, разложенные по токенам активной темы.
 *
 * Соответствие макет → тема:
 * `bg-secondary #04070F` → background.default, `card-bg #131822` →
 * background.paper, `item-bg #0F141D` / `check-block-bg #070B14` → подложки
 * `subtleBg()`, `outline #151B26` / `stroke #1E2431` → divider и `subtleBorder()`,
 * `accent-purple #8973D5` → primary, `selected-bg #271D3D` → primary.lighter,
 * `red #B6706B` → error.
 */
export const posColors = (t: Theme) => ({
  /** Фон шапки, полосы категорий и страницы. */
  page: t.palette.background.default,
  /** Фон области чека — на тон отделён от страницы. */
  checkArea: subtleBg(t),
  /** Плитки: поиск, футер клиента, кнопки-«таблетки». */
  tile: subtleBg(t, true),
  /** Карточки: товар, блок оплаты, итоги. */
  card: t.palette.background.paper,
  /** Внешние границы карточек и панелей. */
  outline: t.palette.divider,
  /** Волосяные линии внутри блока (строки чека, разделители). */
  hairline: subtleBorder(t),
  /** Основной текст (в макете — чистый белый). */
  text: t.palette.text.primary,
  /** Текст кнопок и второстепенных подписей (в макете — #BDC4D1). */
  textSoft: alpha(t.palette.text.primary, 0.85),
  /** Подписи колонок, плейсхолдеры, служебные строки (в макете — #757A83). */
  textDim: t.palette.text.secondary,
  /** Акцент заливкой: кнопка оплаты, активная категория, аватар. */
  accent: t.palette.primary.main,
  /** Акцент текстом и обводкой — контраст-безопасный вариант. */
  accentText: t.palette.primary.onSurface,
  /** Подложка под акцентом: бейдж бренда, применённая скидка. */
  accentBg: t.palette.primary.lighter,
  /** Текст поверх заливки акцентом. */
  onAccent: t.palette.primary.contrastText,
  /** Отмена чека, ошибка промокода, метка «удалён». */
  danger: t.palette.error.onSurface,
  dangerBg: t.palette.error.lighter,
  /** Списания в итогах (бонусы, кешбэк, сертификат) и возврат строки. */
  positive: t.palette.success.onSurface,
  /** Разные типы списаний в итогах не должны сливаться в один цвет. */
  discount: t.palette.error.onSurface,
  bonus: t.palette.info.main,
  cashback: t.palette.warning.main,
  certificate: t.palette.success.main,
});

export type PosColors = ReturnType<typeof posColors>;
