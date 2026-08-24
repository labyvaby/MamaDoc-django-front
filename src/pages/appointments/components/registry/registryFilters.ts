/**
 * Фильтры журнала реестров: условия-чипы командной строки + текстовый поиск.
 *
 * Условие («Пациент: Иванова», «Врач: Токтосунова», «Услуга: УЗИ») заменяет
 * прежний Drawer «Фильтры» и ленту аватарок: набор условий виден всегда и
 * снимается по одному. Матчим по id, а не по ФИО — полные однофамильцы иначе
 * сливаются в одно условие (та же причина, по которой лента аватарок в
 * регистратуре работает по employee id).
 */
import type { DjangoAppointment } from "../../../../api/appointments";
import { matchesAppointmentSearch } from "../listFilters";
import type { LinesOf } from "./registryStats";

export type RegistryTokenKind = "patient" | "employee" | "service";

export interface RegistryToken {
  kind: RegistryTokenKind;
  /** id сущности: пациента, сотрудника, услуги. */
  id: number;
  /** Подпись чипа. */
  label: string;
}

export const tokenKey = (token: RegistryToken) => `${token.kind}:${token.id}`;

function matchesToken(appt: DjangoAppointment, token: RegistryToken, linesOf: LinesOf): boolean {
  switch (token.kind) {
    case "patient":
      return appt.patient?.id === token.id;
    case "employee":
      return linesOf(appt).some((line) => line.employee?.id === token.id);
    case "service":
      return linesOf(appt).some((line) => line.service?.id === token.id);
    default:
      return true;
  }
}

/** Все условия должны выполняться одновременно (И, а не ИЛИ). */
export function matchesTokens(
  appt: DjangoAppointment,
  tokens: RegistryToken[],
  linesOf: LinesOf,
): boolean {
  return tokens.every((token) => matchesToken(appt, token, linesOf));
}

/** Условия + свободный текст (поиск тот же, что в регистратуре: ФИО, телефон, услуга, исполнитель). */
export function applySearch(
  items: DjangoAppointment[],
  tokens: RegistryToken[],
  query: string,
  linesOf: LinesOf,
): DjangoAppointment[] {
  const q = query.trim();
  return items.filter(
    (appt) => matchesTokens(appt, tokens, linesOf) && (!q || matchesAppointmentSearch(appt, q)),
  );
}

export interface TokenSuggestion extends RegistryToken {
  /** Сколько записей среза попадёт под условие. */
  count: number;
}

/**
 * Подсказки командной строки: что можно превратить в условие по введённому
 * тексту. Считаем по уже отфильтрованному другими условиями срезу, поэтому
 * счётчик у подсказки честный — столько и останется после клика.
 */
export function suggestTokens(
  items: DjangoAppointment[],
  query: string,
  linesOf: LinesOf,
  active: RegistryToken[],
  limitPerKind = 4,
): TokenSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const taken = new Set(active.map(tokenKey));
  const found = new Map<string, TokenSuggestion>();

  const bump = (kind: RegistryTokenKind, id: number | undefined, label: string) => {
    if (id == null || !label.toLowerCase().includes(q)) return;
    const key = `${kind}:${id}`;
    if (taken.has(key)) return;
    const existing = found.get(key);
    if (existing) existing.count += 1;
    else found.set(key, { kind, id, label, count: 1 });
  };

  for (const appt of items) {
    bump("patient", appt.patient?.id, appt.patient?.fullName ?? "");
    for (const line of linesOf(appt)) {
      bump("employee", line.employee?.id, line.employee?.fullName ?? "");
      bump("service", line.service?.id, line.service?.name ?? "");
    }
  }

  const order: RegistryTokenKind[] = ["patient", "employee", "service"];
  return order.flatMap((kind) =>
    Array.from(found.values())
      .filter((item) => item.kind === kind)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"))
      .slice(0, limitPerKind),
  );
}
