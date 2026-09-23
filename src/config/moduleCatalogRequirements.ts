import type { CatalogModule } from "../api/tenancy";

/**
 * Что ещё нужно подключить, чтобы подключить модуль: требуемые модули с учётом
 * цепочки, которые не подключены, в порядке подключения — сначала то, что
 * нужно остальным. Граф приходит с бэка в `requires` (прямые требования);
 * модуль, которого нет в каталоге, называем по коду.
 */
export function missingRequirements(
  module: CatalogModule,
  catalog: CatalogModule[],
): { code: string; name: string }[] {
  const byCode = new Map(catalog.map((m) => [m.code, m]));
  const requiresOf = (code: string): string[] =>
    (code === module.code ? module.requires : byCode.get(code)?.requires) ?? [];
  const missing: { code: string; name: string }[] = [];
  const seen = new Set<string>([module.code]);

  const visit = (code: string) => {
    for (const required of requiresOf(code)) {
      if (seen.has(required)) continue;
      seen.add(required);
      visit(required);
      const entry = byCode.get(required);
      if (!entry?.isEnabled) missing.push({ code: required, name: entry?.name ?? required });
    }
  };

  visit(module.code);
  return missing;
}
