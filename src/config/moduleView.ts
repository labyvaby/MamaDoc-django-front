/**
 * Какие модули видит пользователь. Суперпользователь платформы получает от
 * /auth/me/ все модули (правило бэка). В режиме «Меню как у клиники» он видит
 * набор выбранной организации — как её сотрудники. Без поля от бэка (старый
 * бэк) режим ничего не сужает. Возвращает один из входных массивов, поэтому
 * ссылка стабильна между рендерами.
 */
export function visibleModules(input: {
  isPlatformAdmin: boolean;
  viewAsOrganization: boolean;
  enabledModules: string[];
  organizationModules: string[] | null;
}): string[] {
  const { isPlatformAdmin, viewAsOrganization, enabledModules, organizationModules } = input;
  if (isPlatformAdmin && viewAsOrganization && organizationModules !== null) {
    return organizationModules;
  }
  return enabledModules;
}

/**
 * Обход «суперадмин видит страницу без проверки модуля» в пунктах меню
 * (Регистратура, СКУД и др.). В режиме «Меню как у клиники» обход выключен:
 * пункты идут обычной проверкой can() — модуль выбранной организации + право.
 */
export function superSeesAllPages(isSuperAdmin: boolean, viewAsOrganization: boolean): boolean {
  return isSuperAdmin && !viewAsOrganization;
}
