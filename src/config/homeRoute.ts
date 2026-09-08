import { PAGE_PERMISSIONS } from "./accessPermissions";
import type { RoleName } from "../types/rbac";

type PermissionCheck = (permission: string | string[]) => boolean;
type ModuleCheck = (module: "cleaning" | "documents" | "knowledge") => boolean;

export interface HomeRouteContext {
  roleCode?: RoleName | string | null;
  can: PermissionCheck;
  canOpenModule: ModuleCheck;
  hasActiveEmployee?: boolean;
}

/**
 * Первая реально доступная рабочая страница авторизованного пользователя.
 *
 * Роль влияет только на приоритет: врач с несколькими правами всё равно
 * начинает с кабинета врача, медсестра — с процедурного кабинета. Доступ не
 * выводится из названия роли и всегда подтверждается permission/module-гейтом.
 */
export function resolveHomeRoute({
  roleCode,
  can,
  canOpenModule,
  hasActiveEmployee = false,
}: HomeRouteContext): string {
  const role = String(roleCode ?? "").toLowerCase();

  if (role === "doctor" && can(PAGE_PERMISSIONS.doctorRoom)) return "/doctor";
  if (role === "nurse" && can(PAGE_PERMISSIONS.nurseRoom)) return "/nurse";

  const permissionRoutes: Array<[string | string[], string]> = [
    [PAGE_PERMISSIONS.appointmentsRegistry, "/appointments"],
    [PAGE_PERMISSIONS.doctorRoom, "/doctor"],
    [PAGE_PERMISSIONS.nurseRoom, "/nurse"],
    [PAGE_PERMISSIONS.bookings, "/bookings"],
    [PAGE_PERMISSIONS.tasks, "/tasks"],
    [PAGE_PERMISSIONS.schedule, "/schedule"],
    [PAGE_PERMISSIONS.attendance, "/work-shifts"],
  ];
  for (const [permission, path] of permissionRoutes) {
    if (can(permission)) return path;
  }

  // Для уборщицы это основное рабочее место, поэтому модуль проверяем раньше
  // общих справочников и персональных отчётов.
  if (canOpenModule("cleaning")) return "/cleaning";

  const secondaryRoutes: Array<[string | string[], string]> = [
    [PAGE_PERMISSIONS.pos, "/retail"],
    [PAGE_PERMISSIONS.expenses, "/expenses"],
    [PAGE_PERMISSIONS.achievements, "/achievements"],
    [PAGE_PERMISSIONS.patients, "/patients"],
    [PAGE_PERMISSIONS.employees, "/employees"],
    [PAGE_PERMISSIONS.vaccinations, "/vaccinations"],
    [PAGE_PERMISSIONS.services, "/services"],
    [PAGE_PERMISSIONS.products, "/products"],
    [PAGE_PERMISSIONS.sales, "/sales"],
    [PAGE_PERMISSIONS.warehouses, "/warehouses"],
    [PAGE_PERMISSIONS.reports, "/reports"],
    [PAGE_PERMISSIONS.cashbox, "/cashbox"],
    [PAGE_PERMISSIONS.reviews, "/reviews"],
  ];
  for (const [permission, path] of secondaryRoutes) {
    if (can(permission)) return path;
  }

  if (hasActiveEmployee && can("payroll.view_own")) return "/salary-reports";
  if (can("payroll.view")) return "/salary-reports";
  if (canOpenModule("knowledge")) return "/knowledge";
  if (canOpenModule("documents")) return "/documents";

  // Профиль не имеет permission-гейта и доступен любому вошедшему сотруднику.
  return "/profile";
}
