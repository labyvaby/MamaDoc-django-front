/**
 * Порядок ролей в списке: сначала те, на которых сидит больше сотрудников,
 * при равенстве — по имени. Роли без сотрудников (тестовые, заготовки)
 * оседают внизу, а рабочие — те, что реально влияют на людей — наверху.
 *
 * `counts` может быть `null`: доступы грузятся отдельным запросом и без
 * `users.view` их нет — тогда остаётся алфавит, как отдаёт API.
 */
export function sortRolesByMembers<T extends { id: number; name: string }>(
  roles: readonly T[],
  counts: ReadonlyMap<number, number> | null,
): T[] {
  return [...roles].sort((a, b) => {
    const diff = (counts?.get(b.id) ?? 0) - (counts?.get(a.id) ?? 0);
    return diff !== 0 ? diff : a.name.localeCompare(b.name, "ru");
  });
}
