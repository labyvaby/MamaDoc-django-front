import {
  PAGE_PERMISSIONS,
  SETTINGS_TAB_PERMISSIONS,
} from "../../../config/accessPermissions";

/**
 * Разделы меню, которые открывает роль, — витрина для владельца: правами он
 * оперирует редко, а «Регистратура», «Касса», «Отчёты» — каждый день.
 *
 * Требования берём из PAGE_PERMISSIONS, а не переписываем: список прав раздела
 * должен меняться в одном месте вместе с гардами роутов и сайдбаром.
 *
 * ⚠ Предпросмотр отвечает только за права. За кадром остаётся то, что от роли
 * не зависит: включённые модули организации (пикер помечает такие права
 * отдельно), вертикаль бизнеса (в рознице часть разделов скрыта), роль
 * superadmin (исторические реестры «Все приёмы»/«Все процедуры» правом не
 * выдаются вовсе) и фича-флаги незавершённых модулей.
 */
export interface PreviewSection {
  /** Ключ подписи: t(`roles.preview.sections.${key}`). */
  key: string;
  /** Достаточно любого из кодов — как в can()/RequirePermission. */
  permissions: readonly string[];
}

const asList = (value: string | readonly string[]): readonly string[] =>
  Array.isArray(value) ? value : [value as string];

/** Порядок — как в сайдбаре: сначала ежедневное, потом справочное и управление. */
export const PREVIEW_SECTIONS: PreviewSection[] = [
  { key: "registratura", permissions: asList(PAGE_PERMISSIONS.appointmentsRegistry) },
  { key: "doctorRoom", permissions: asList(PAGE_PERMISSIONS.doctorRoom) },
  { key: "nurseRoom", permissions: asList(PAGE_PERMISSIONS.nurseRoom) },
  { key: "schedule", permissions: asList(PAGE_PERMISSIONS.schedule) },
  { key: "bookings", permissions: asList(PAGE_PERMISSIONS.bookings) },
  { key: "chats", permissions: asList(PAGE_PERMISSIONS.chats) },
  { key: "tasks", permissions: asList(PAGE_PERMISSIONS.tasks) },
  { key: "waitlist", permissions: asList(PAGE_PERMISSIONS.waitlist) },
  { key: "deals", permissions: asList(PAGE_PERMISSIONS.deals) },
  { key: "expenses", permissions: asList(PAGE_PERMISSIONS.expenses) },
  { key: "achievements", permissions: asList(PAGE_PERMISSIONS.achievements) },
  { key: "employees", permissions: asList(PAGE_PERMISSIONS.employees) },
  { key: "patients", permissions: asList(PAGE_PERMISSIONS.patients) },
  { key: "vaccinations", permissions: asList(PAGE_PERMISSIONS.vaccinations) },
  { key: "services", permissions: asList(PAGE_PERMISSIONS.services) },
  { key: "products", permissions: asList(PAGE_PERMISSIONS.products) },
  { key: "sales", permissions: asList(PAGE_PERMISSIONS.sales) },
  { key: "warehouses", permissions: asList(PAGE_PERMISSIONS.warehouses) },
  { key: "pos", permissions: asList(PAGE_PERMISSIONS.pos) },
  { key: "skud", permissions: asList(PAGE_PERMISSIONS.attendance) },
  { key: "cashbox", permissions: asList(PAGE_PERMISSIONS.cashbox) },
  { key: "payroll", permissions: asList(PAGE_PERMISSIONS.payroll) },
  { key: "reports", permissions: asList(PAGE_PERMISSIONS.reports) },
  { key: "reviews", permissions: asList(PAGE_PERMISSIONS.reviews) },
  { key: "notifications", permissions: asList(PAGE_PERMISSIONS.notifications) },
  // «Настройки» открываются, если доступна хотя бы одна вкладка раздела.
  {
    key: "settings",
    permissions: Array.from(
      new Set(Object.values(SETTINGS_TAB_PERMISSIONS).flatMap(asList)),
    ),
  },
];

/** Разделы меню, которые откроются с этим набором прав, в порядке сайдбара. */
export function previewSectionsFor(permissionCodes: Iterable<string>): PreviewSection[] {
  const granted = new Set(permissionCodes);
  return PREVIEW_SECTIONS.filter((section) =>
    section.permissions.some((code) => granted.has(code)),
  );
}
