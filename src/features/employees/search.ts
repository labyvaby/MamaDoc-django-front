/**
 * Локальный поиск по сотрудникам.
 *
 * Бэкенд `GET /staff/employees/?search=` ищет только по ФИО/телефону и не знает
 * про специализации (проверено на живом API 20.08.2026: `?search=Педиатр` →
 * `count: 0` при 5 педиатрах в орг). Фильтров вида `specializationId` там тоже
 * нет — параметр молча игнорируется и выдача не режется. Поэтому поиск по
 * специальности считается на фронте, поверх полного справочника сотрудников.
 */

import type { EmployesRow } from "./types";

/** «Ё» → «е» и нижний регистр: иначе «Ёлкина» не находится по «елкина». */
function fold(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е");
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Токены запроса: «педиатр иван» → оба должны совпасть (AND). */
export function splitQuery(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

function employeeHaystack(emp: EmployesRow): string[] {
  const parts: string[] = [];
  if (emp.full_name) parts.push(emp.full_name);
  if (emp.nickname) parts.push(emp.nickname);
  if (emp.email) parts.push(emp.email);
  for (const spec of emp._djangoSpecializations ?? []) {
    if (spec?.name) parts.push(spec.name);
  }
  return parts.map(fold);
}

/**
 * Совпадает ли сотрудник с поисковым запросом.
 *
 * Поля: ФИО, никнейм, email, специализации; телефон — по цифрам, чтобы
 * «996555» находило «+996 555 …» независимо от форматирования.
 */
export function matchesEmployeeQuery(emp: EmployesRow, query: string): boolean {
  const tokens = splitQuery(query);
  if (tokens.length === 0) return true;

  const haystack = employeeHaystack(emp);
  const phone = emp.phone ? digitsOnly(emp.phone) : "";

  return tokens.every((token) => {
    if (haystack.some((part) => part.includes(token))) return true;
    const tokenDigits = digitsOnly(token);
    // Короткие числа (1–2 цифры) дают шум почти на любом номере.
    return tokenDigits.length >= 3 && phone.includes(tokenDigits);
  });
}

export function filterEmployeesByQuery(items: EmployesRow[], query: string): EmployesRow[] {
  if (!query.trim()) return items;
  return items.filter((emp) => matchesEmployeeQuery(emp, query));
}
