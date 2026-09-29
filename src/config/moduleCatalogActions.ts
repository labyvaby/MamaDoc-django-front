import type { CatalogModule } from "../api/tenancy";

/** Кнопки карточки модуля в витрине «Модули». */
export type CatalogAction = "configure" | "disable" | "enable" | "request";

/**
 * Какие кнопки показать у карточки. Переключает модули только суперпользователь
 * платформы: у него «Отключить» у подключённого и настоящее «Подключить» у
 * остальных. Клиника видит «Настроить» у подключённого (если у модуля есть
 * страница настроек) и заявку-заглушку у остальных.
 */
export function catalogActions(
  module: Pick<CatalogModule, "isEnabled">,
  opts: { isPlatformAdmin: boolean; hasSettingsRoute: boolean },
): CatalogAction[] {
  if (module.isEnabled) {
    const actions: CatalogAction[] = opts.hasSettingsRoute ? ["configure"] : [];
    return opts.isPlatformAdmin ? [...actions, "disable"] : actions;
  }
  return [opts.isPlatformAdmin ? "enable" : "request"];
}
