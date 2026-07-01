/**
 * EmployeeViewModel — единственное место маппинга Django DTO → UI row.
 *
 * Правила:
 * - role, specializations, operationalBranches хранятся в явных полях (без _ prefix).
 * - _djangoRole/_djangoSpecializations/_djangoOperationalBranches остаются как
 *   алиасы для обратной совместимости, пока не обновлены все компоненты.
 */

import type {
  DjangoEmployeeListItem,
  DjangoEmployee,
  DjangoRoleShort,
  DjangoSpecializationShort,
  DjangoEmployeeBranch,
} from "../../api/staff";
import type { EmployesRow } from "./types";

export type { DjangoRoleShort as EmployeeRole };
export type { DjangoSpecializationShort as EmployeeSpecialization };
export type { DjangoEmployeeBranch as EmployeeBranch };

export function mapDjangoListItemToRow(d: DjangoEmployeeListItem): EmployesRow {
  return {
    id: String(d.id),
    full_name: d.fullName || "",
    phone: d.phone || null,
    email: d.email || null,
    nickname: d.nickname || null,
    birth_date: null,
    status: d.status || null,
    telegram_id: null,
    bank_account_number: null,
    inn: null,
    photo_url: d.photoUrl || null,
    role_id: d.role ? String(d.role.id) : null,
    employee_type_id: null,
    auth_user_id: d.authUserId != null ? String(d.authUserId) : null,
    salary_rules: null,
    passport_photos: null,
    clinicalRole: d.clinicalRole ?? null,
    // Explicit fields (non-prefixed)
    _djangoRole: d.role ?? null,
    _djangoSpecializations: d.specializations ?? [],
    _djangoOperationalBranches: d.operationalBranches ?? [],
    _fullDetailsLoaded: false,
  };
}

export function mapDjangoFullToRow(
  d: DjangoEmployee,
  existing?: EmployesRow,
): EmployesRow {
  return {
    ...(existing ?? {}),
    id: String(d.id),
    full_name: d.fullName || "",
    phone: d.phone || null,
    email: d.email || null,
    nickname: d.nickname || null,
    notes: d.notes || null,
    birth_date: d.birthDate || null,
    status: d.status || null,
    telegram_id: d.telegramId || null,
    instagram: d.instagram || null,
    bank_account_number: d.bankAccountNumber || null,
    inn: d.inn || null,
    bank: d.bank || null,
    bik: d.bik || null,
    elqr_url: d.elqrUrl || null,
    photo_url: d.photoUrl || null,
    role_id: d.role ? String(d.role.id) : null,
    employee_type_id: null,
    auth_user_id: d.authUserId != null ? String(d.authUserId) : null,
    salary_rules: null,
    passport_photos: null,
    clinicalRole: d.clinicalRole ?? null,
    _djangoRole: d.role ?? null,
    _djangoSpecializations: d.specializations ?? [],
    _djangoOperationalBranches: d.operationalBranches ?? [],
    _fullDetailsLoaded: true,
  };
}
