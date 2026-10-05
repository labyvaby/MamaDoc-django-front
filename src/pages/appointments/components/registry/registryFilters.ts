/**
 * Фильтры журнала реестров: условия-чипы командной строки + текстовый поиск.
 *
 * Условие («Пациент: Иванова», «Врач: Токтосунова», «Услуга: УЗИ») заменяет
 * прежний Drawer «Фильтры» и ленту аватарок: набор условий виден всегда и
 * снимается по одному. Матчим по id, а не по ФИО — полные однофамильцы иначе
 * сливаются в одно условие (та же причина, по которой лента аватарок в
 * регистратуре работает по employee id).
 */
import type { AppointmentServiceLine, DjangoAppointment } from "../../../../api/appointments";
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

/** Условия, разложенные по видам: внутри вида — ИЛИ, между видами — И. */
interface TokenSets {
  patients: Set<number>;
  employees: Set<number>;
  services: Set<number>;
}

function tokenSets(tokens: RegistryToken[]): TokenSets {
  const sets: TokenSets = { patients: new Set(), employees: new Set(), services: new Set() };
  for (const token of tokens) {
    if (token.kind === "patient") sets.patients.add(token.id);
    else if (token.kind === "employee") sets.employees.add(token.id);
    else if (token.kind === "service") sets.services.add(token.id);
  }
  return sets;
}

/**
 * Подходит ли строка услуги под условия исполнителя и услуги.
 *
 * Исполнитель и услуга проверяются на ОДНОЙ строке: «Врач: Исаева» + «Услуга:
 * УЗИ» — это УЗИ, которое делала Исаева, а не любой приём, где Исаева что-то
 * делала, а УЗИ провёл кто-то другой.
 */
function lineMatches(line: AppointmentServiceLine, sets: TokenSets): boolean {
  if (sets.employees.size > 0 && (line.employee?.id == null || !sets.employees.has(line.employee.id))) {
    return false;
  }
  if (sets.services.size > 0 && (line.service?.id == null || !sets.services.has(line.service.id))) {
    return false;
  }
  return true;
}

const hasLineTokens = (sets: TokenSets) => sets.employees.size > 0 || sets.services.size > 0;

/**
 * Подходит ли приём под условия.
 *
 * Условия одного вида складываются через ИЛИ: «Услуга: УЗИ» + «Услуга:
 * Анализы» — это приёмы с УЗИ или с анализами. Раньше все условия шли через И,
 * и вторая услуга оставляла только приёмы, где были обе сразу, — лента
 * пустела. Разные виды (пациент, исполнитель, услуга) по-прежнему сужают
 * срез вместе.
 */
export function matchesTokens(
  appt: DjangoAppointment,
  tokens: RegistryToken[],
  linesOf: LinesOf,
): boolean {
  if (tokens.length === 0) return true;
  const sets = tokenSets(tokens);
  if (sets.patients.size > 0 && (appt.patient?.id == null || !sets.patients.has(appt.patient.id))) {
    return false;
  }
  if (!hasLineTokens(sets)) return true;
  return linesOf(appt).some((line) => lineMatches(line, sets));
}

/**
 * Строки среза с учётом условий исполнителя и услуги.
 *
 * Отфильтровали «Услуга: УЗИ» — и сумма строки, итоги дня, выручка в сводке
 * считают только УЗИ, а не весь чек приёма, в котором оно было. Без условий
 * исполнителя/услуги возвращается исходная функция (её стабильность важна для
 * мемоизации строк ленты).
 */
export function narrowLinesOf(linesOf: LinesOf, tokens: RegistryToken[]): LinesOf {
  const sets = tokenSets(tokens);
  if (!hasLineTokens(sets)) return linesOf;
  return (appt) => linesOf(appt).filter((line) => lineMatches(line, sets));
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
