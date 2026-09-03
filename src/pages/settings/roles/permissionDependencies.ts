import type { RbacPermission } from "../../../api/rbac";

/**
 * Действия, которые без права на просмотр домена бессмысленны: список объектов
 * без чтения не открыть, а значит и создать/изменить/удалить в нём нечего.
 * ⚠ Это соглашение фронта по именам кодов, а не задокументированная бэкендом
 * матрица зависимостей: точечные действия (`attendance.clock`, `pos.sell`,
 * `printforms.print`, `vaccinations.record`) сюда намеренно не входят — они
 * выполняются с одного экрана и просмотра домена могут не требовать.
 */
const WRITE_SUFFIXES = ["create", "update", "delete", "manage"];

/** Коды просмотра домена в порядке приоритета: `x.view`, иначе `x.read`, иначе `x.list`. */
const VIEW_SUFFIXES = ["view", "read", "list"];

/**
 * Карта «право → право на просмотр того же домена».
 *
 * Домен берётся по первому сегменту кода, а не по категории: `catalog.manage`
 * лежит в категории `content`, но зависит от `catalog.view`. Коды, которые сами
 * являются разновидностью просмотра (`appointments.view_all`,
 * `payroll.view_own`, `finance.view_history`), в карту не попадают — это
 * самостоятельные права, а не надстройка над общим просмотром.
 */
export function buildBaseCodeMap(permissions: RbacPermission[]): Map<string, string> {
  const codes = new Set(permissions.map((p) => p.code));
  const map = new Map<string, string>();
  for (const p of permissions) {
    const segments = p.code.split(".");
    if (segments.length < 2) continue;
    const action = segments[segments.length - 1];
    if (!WRITE_SUFFIXES.includes(action)) continue;
    // Сначала просмотр своего подраздела (warehouse.sales.manage →
    // warehouse.sales.view), и только если такого права нет — просмотр всего
    // домена (warehouse.view).
    const scopes = [segments.slice(0, -1).join("."), segments[0]];
    const base = scopes
      .flatMap((scope) => VIEW_SUFFIXES.map((suffix) => `${scope}.${suffix}`))
      .find((c) => codes.has(c));
    if (base && base !== p.code) map.set(p.code, base);
  }
  return map;
}
