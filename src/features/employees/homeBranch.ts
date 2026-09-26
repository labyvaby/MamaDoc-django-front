import type { DjangoBranchShortLocal } from "./types";

/**
 * Смена основного филиала сотрудника тянет за собой набор операционных.
 *
 * Бэк при PATCH `branchId` набор `operationalBranches` не трогает (проверено на
 * test 23.09.2026: перенос 12 → 13 оставил `[12]`), а основной филиал в наборе
 * лежит всегда — без замены сотрудник остался бы виден в старом филиале, то есть
 * перенос «ошибочно заведённого» не удался бы. Поэтому старый основной филиал
 * в наборе меняется на новый; остальные операционные филиалы остаются как были,
 * а вернуть старый пользователь может руками в том же поле.
 */
export function swapHomeInOperational(
  operational: DjangoBranchShortLocal[],
  prevHomeId: number | null,
  nextHome: DjangoBranchShortLocal,
): DjangoBranchShortLocal[] {
  const rest = operational.filter((b) => b.id !== prevHomeId && b.id !== nextHome.id);
  return [nextHome, ...rest];
}
