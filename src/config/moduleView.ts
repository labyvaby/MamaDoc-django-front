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
 * Значение поля модуля для запроса на запись. Модуль выключен → undefined:
 * поле не уходит в JSON, и бэк не перезаписывает сохранённое значение
 * (иначе форма, где поле спрятано вместе с модулем, стирала бы его).
 */
export function moduleField<T>(moduleEnabled: boolean, value: T): T | undefined {
  return moduleEnabled ? value : undefined;
}

/**
 * Обход «суперадмин видит страницу без проверки модуля» в пунктах меню
 * (Регистратура, СКУД и др.). В режиме «Меню как у клиники» обход выключен:
 * пункты идут обычной проверкой can() — модуль выбранной организации + право.
 * Режим — только у суперпользователя платформы; роль «superadmin» клиники
 * обход не теряет, даже если флаг режима остался от прежнего пользователя.
 */
export function superSeesAllPages(
  isSuperAdmin: boolean,
  isPlatformAdmin: boolean,
  viewAsOrganization: boolean,
): boolean {
  return isSuperAdmin && !(isPlatformAdmin && viewAsOrganization);
}

/**
 * Оставить ли «Меню как у клиники» после нового ответа /auth/me/. Режим
 * принадлежит тому, кто его включил: вход другого пользователя в ту же сессию
 * (например, из соседней вкладки) или пользователь не суперпользователь —
 * сброс. Обновление /auth/me/ и смена организации режим не трогают.
 */
export function keepsClinicView(
  viewAsOrganization: boolean,
  previousUserId: string | null | undefined,
  me: { user: { id: number; isSuperuser: boolean } },
): boolean {
  return viewAsOrganization && previousUserId === String(me.user.id) && Boolean(me.user.isSuperuser);
}
