/**
 * Маршрут настроек модуля для кнопки «Настроить» у подключённых модулей.
 * Только те коды, у которых есть свой экран настроек. Остальным кнопку не рисуем.
 * Иконки и тексты витрины — в moduleStorefront.ts.
 */
export const MODULE_SETTINGS_ROUTE: Record<string, string> = {
  deals: "/settings/deals",
  cleaning: "/settings/cleaning",
  pos: "/settings/store",
  announcements: "/settings/announcements",
  promotions: "/settings/promotions",
  procurement: "/settings/procurement",
};
