export type ProfileTabKey = "main" | "achievements" | "documents" | "security";

export const PROFILE_TAB_KEYS: readonly ProfileTabKey[] = [
  "main",
  "achievements",
  "documents",
  "security",
];

/** `?tab=` из URL: только известный ключ, остальное игнорируем. */
export function isProfileTabKey(value: string | null | undefined): value is ProfileTabKey {
  return PROFILE_TAB_KEYS.includes(value as ProfileTabKey);
}

/** Индекс вкладки по ключу среди тех, что сейчас отрисованы. Вкладки строятся
 *  условно («Документы» появляются после загрузки employee), поэтому хранить
 *  индекс нельзя — он съезжает; ключа нет в списке → первая вкладка. */
export function resolveTabIndex(
  tabs: readonly { key: string }[],
  key: string | null | undefined,
): number {
  const index = tabs.findIndex((tab) => tab.key === key);
  return index === -1 ? 0 : index;
}
