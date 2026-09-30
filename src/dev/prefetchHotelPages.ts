/**
 * Предзагрузка кода страниц отеля, пока браузер простаивает: переход по меню
 * и кнопки вроде «Поднять цены на эти даты» открывают страницу сразу, без
 * ожидания чанка (иначе BrowserRouter держит старую страницу, пока грузится
 * новая). Пути — те же модули, что lazy() в App.tsx/ScheduleRouter, поэтому
 * сборщик отдаёт тот же чанк и загрузка не дублируется.
 */
let started = false;

const HOTEL_PAGES: Array<() => Promise<unknown>> = [
  () => import("./HotelReceptionPage"),
  () => import("./HotelBookingsPage"),
  () => import("./HotelRoomsPage"),
  () => import("./HotelRoomFormPage"),
  () => import("./HotelRoomCategoriesPage"),
  () => import("./HotelRoomCategoryFormPage"),
  () => import("./HotelPricingRulesPage"),
  () => import("./HotelPricingRuleFormPage"),
  () => import("./HotelEventsPage"),
  () => import("./HotelHousekeepingPage"),
  () => import("./HotelKitchenPage"),
  () => import("./HotelPropertySettingsPage"),
];

export function prefetchHotelPages(): void {
  if (started) return;
  started = true;
  const run = async () => {
    // По одной: не забивать сеть на слабом интернете, пока пользователь работает.
    for (const load of HOTEL_PAGES) {
      try {
        await load();
      } catch {
        // Не удалось — страница загрузится при переходе, как раньше.
      }
    }
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(() => void run(), { timeout: 4000 });
  else window.setTimeout(() => void run(), 2000);
}
