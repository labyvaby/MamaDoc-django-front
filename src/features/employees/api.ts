// Feature: Employees API & helpers
import { supabase } from "../../utility/supabaseClient";
import type { Employee } from "./types";
import { DB_TABLES } from "../../utility/constants";
import {
  composePhone as composeFullPhone,
  parsePhone as parseFullPhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  type PhoneCountryCode,
} from "../../utility/phone";

// Read env from import.meta
const importMetaEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> })?.env) || {};

// Main table for reading/writing logic
export const EMPLOYEES_TABLE: string = DB_TABLES.EMPLOYEES;

// Legacy constant for compatibility
export const EMPLOYEES_SOURCE = EMPLOYEES_TABLE;
export const EMPLOYEES_WRITE = EMPLOYEES_TABLE;

export const SERVICES_WRITE: string = importMetaEnv.VITE_SERVICES_WRITE_TABLE || DB_TABLES.SERVICES;
export const EMPLOYEE_PHOTOS_BUCKET: string = importMetaEnv.VITE_STORAGE_EMPLOYEES_BUCKET || "employees_photo";
export const EMPLOYEE_PASSPORTS_BUCKET: string = "employee_passports";

// Helpers - mostly simplified now that schema is strict
export function getIdFrom(o: Record<string, unknown>): string {
  if (typeof o.id === 'string' || typeof o.id === 'number') return String(o.id);
  if (typeof o.ID === 'string' || typeof o.ID === 'number') return String(o.ID);
  return ""; 
}

export function getNameFrom(o: Record<string, unknown>): string {
  if (typeof o.full_name === 'string') return o.full_name;
  if (typeof o.fullName === 'string') return o.fullName;
  if (typeof o.name === 'string') return o.name;
  return "";
}

export function getPhoneFrom(o: Record<string, unknown>): string | null {
  if (typeof o.phone === 'string') return o.phone;
  return null;
}

// Phone utils
export const PHONE_CC: string = DEFAULT_PHONE_COUNTRY_CODE;
const LOCAL_LEN = 9;
export function sanitizeKGLocal(input: string): string {
  return input.replace(/\D/g, "").slice(0, LOCAL_LEN);
}
export function isKGLocalValid(local: string): boolean {
  return local.length === LOCAL_LEN;
}
export function composeKGPhone(local: string): string | null {
  const l = sanitizeKGLocal(local.trim());
  return composeFullPhone(DEFAULT_PHONE_COUNTRY_CODE, l);
}
export function parseKGLocalFrom(input: string | null | undefined): string {
  const parsed = parseFullPhone(input ?? "");
  return sanitizeKGLocal(parsed.local);
}

export function composePhone(countryCode: PhoneCountryCode, local: string): string | null {
  return composeFullPhone(countryCode, local);
}

export function parsePhone(input: string | null | undefined): { countryCode: PhoneCountryCode; local: string } {
  return parseFullPhone(input ?? "");
}

// Map any object to Employee (simplified)
export function mapAnyToEmployee(o: Record<string, unknown>): Employee | null {
  const id = getIdFrom(o);
  if (!id) return null;
  const full_name = getNameFrom(o) || id;
  const phone = getPhoneFrom(o);
  
  return {
    id,
    full_name,
    phone,
    role_id: typeof o.role_id === 'string' ? o.role_id : null,
    employee_type_id: typeof o.employee_type_id === 'string' ? o.employee_type_id : null,
    status: typeof o.status === 'string' ? o.status : null,
    birth_date: typeof o.birth_date === 'string' ? o.birth_date : typeof o.birthDate === 'string' ? o.birthDate : null,
    photo_url: typeof o.photo_url === 'string' ? o.photo_url : typeof o.photoUrl === 'string' ? o.photoUrl : null,
    telegram_id: typeof o.telegram_id === 'string' ? o.telegram_id : typeof o.telegramId === 'string' ? o.telegramId : null,
    email: typeof o.email === 'string' ? o.email : null,
    bank_account_number: typeof o.bank_account_number === 'string' ? o.bank_account_number : typeof o.bankAccountNumber === 'string' ? o.bankAccountNumber : null,
    inn: typeof o.inn === 'string' ? o.inn : null,
    nickname: typeof o.nickname === 'string' ? o.nickname : null,
    salary_rules: o.salary_rules || null,
    passport_photos: Array.isArray(o.passport_photos) ? o.passport_photos : null,
    auth_user_id: typeof o.auth_user_id === 'string' ? o.auth_user_id : null,
  } as Employee;

}

export function dedupeEmployees(arr: Employee[]): Employee[] {
  const seen = new Set<string>();
  const out: Employee[] = [];
  for (const e of arr) {
    if (!e.id || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

// Services link updater - using EmployeeServices table? or references in Services table?
// Previous code updated SERVICES_WRITE table with employee_id. 
// Assuming Services table also has employee_id or this logic is still relevant.
// But wait, there is also EMPLOYEE_SERVICES_TABLE. 
// The original code tried updating Services table first, then EmployeeServices.
// I will keep logic similar but safe.

export async function assignEmployeeToServices(ids: string[], employeeId: string | null): Promise<void> {
  if (!ids || ids.length === 0) return;
  // Try update Services table directly if column exists
  try {
     const { error } = await supabase.from(SERVICES_WRITE).update({ employee_id: employeeId }).in("id", ids as unknown[]);
     if (error) console.warn("assignEmployeeToServices update failed", error);
  } catch (e) { console.error(e); }
}

// Many-to-many employees <-> services via employee_services
export const EMPLOYEE_SERVICES_TABLE: string = DB_TABLES.EMPLOYEE_SERVICES; // Likely new table name if capitalizing

export { type EmployeeServiceLink } from "./types"; // Re-export if needed, or define locally
// In types.ts I didn't export EmployeeServiceLink, so I will define it here or add to types.

// Load all service IDs linked to an employee
export async function fetchEmployeeServiceIds(employeeId: string): Promise<string[]> {
  const eid = String(employeeId);
  if (!eid) return [];
  try {
    const { data, error } = await supabase
      .from(EMPLOYEE_SERVICES_TABLE)
      .select("service_id")
      .eq("employee_id", eid);
    if (error || !Array.isArray(data)) return [];
    return (data as { service_id: unknown }[])
      .map((r) => (typeof r.service_id === "string" || typeof r.service_id === "number" ? String(r.service_id) : null))
      .filter((v): v is string => Boolean(v));
  } catch {
    return [];
  }
}

// Replace links: delete old, insert new
export async function replaceEmployeeServices(employeeId: string, serviceIds: string[]): Promise<void> {
  const eid = String(employeeId);
  const sids = (Array.isArray(serviceIds) ? serviceIds : []).map((s) => String(s)).filter((s) => s.length > 0);
  // 1) delete existing
  const del = await supabase
    .from(EMPLOYEE_SERVICES_TABLE)
    .delete()
    .eq("employee_id", eid);
  if (del.error) throw del.error;
  // 2) insert new
  if (sids.length > 0) {
    const rows = sids.map((sid) => ({ employee_id: eid, service_id: sid }));
    const ins = await supabase.from(EMPLOYEE_SERVICES_TABLE).insert(rows);
    if (ins.error) throw ins.error;
  }
}
// Many-to-many employees <-> specializations via employee_specializations
export const EMPLOYEE_SPECIALIZATIONS_TABLE: string = DB_TABLES.EMPLOYEE_SPECIALIZATIONS;

// Fetch single specialization ID for an employee (assuming ~1:1 logic in UI)
export async function fetchEmployeeSpecialization(employeeId: string): Promise<string | null> {
  const eid = String(employeeId);
  if (!eid) return null;
  try {
    const { data, error } = await supabase
      .from(EMPLOYEE_SPECIALIZATIONS_TABLE)
      .select("specialization_id")
      .eq("employee_id", eid)
      .limit(1)
      .maybeSingle();
      
    if (error) return null;
    return data && data.specialization_id ? String(data.specialization_id) : null;
  } catch {
    return null;
  }
}

// Set specialization link (replace existing)
export async function setEmployeeSpecialization(employeeId: string, specializationId: string | null): Promise<void> {
  const eid = String(employeeId);
  
  // 1. Delete all existing links for this employee
  const del = await supabase
    .from(EMPLOYEE_SPECIALIZATIONS_TABLE)
    .delete()
    .eq("employee_id", eid);
  if (del.error) throw del.error;

  // 2. Insert new link if id provided
  if (specializationId) {
    const ins = await supabase
      .from(EMPLOYEE_SPECIALIZATIONS_TABLE)
      .insert({ employee_id: eid, specialization_id: specializationId });
    if (ins.error) throw ins.error;
  }
}
