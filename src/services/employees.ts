import { supabase } from "../utility/supabaseClient";
import type { EmployeesRow } from "../pages/expenses/types";
import { DB_TABLES } from "../utility/constants";

// Helper to reliably get a display string for the role/specialization
const getSpec = (r: any): string | undefined => {
  if (r.roles && typeof r.roles === 'object') {
    return r.roles.display_name || r.roles.name;
  }
  return undefined;
};

export const fetchEmployees = async (): Promise<EmployeesRow[]> => {
  try {
    const { data, error } = await supabase
      .from(DB_TABLES.EMPLOYEES)
      .select(`
        id,
        full_name,
        photo_url,
        role_id,
        roles (
          name,
          display_name
        )
      `)
      .order("full_name", { ascending: true });

    if (error || !data) return [];

    return data.map((d: any) => ({
      id: d.id,
      full_name: d.full_name || "Без имени",
      avatar_url: d.photo_url || undefined,
      specialization: getSpec(d),
    }));
  } catch (e) {
    console.error("fetchEmployees failed", e);
    return [];
  }
};

export const fetchDoctors = async (): Promise<EmployeesRow[]> => {
  try {
    // Fetch only where role is doctor
    const { data, error } = await supabase
      .from(DB_TABLES.EMPLOYEES)
      .select(`
        id,
        full_name,
        nickname,
        photo_url,
        role_id,
        roles!inner (
          name,
          display_name
        )
      `)
      .eq("roles.name", "doctor")
      .order("full_name", { ascending: true });

    if (error || !data) return [];

    return data.map((d: any) => ({
      id: d.id,
      full_name: d.full_name || "Без имени",
      nickname: d.nickname || undefined,
      avatar_url: d.photo_url || undefined,
      specialization: getSpec(d),
    }));
  } catch (e) {
    console.error("fetchDoctors failed", e);
    return [];
  }
};

export const fetchMedicalStaff = async (): Promise<EmployeesRow[]> => {
  try {
    // Fetch where role is doctor OR nurse
    const { data, error } = await supabase
      .from(DB_TABLES.EMPLOYEES)
      .select(`
        id,
        full_name,
        nickname,
        photo_url,
        role_id,
        roles!inner (
          name,
          display_name
        )
      `)
      .in("roles.name", ["doctor", "nurse"])
      .order("full_name", { ascending: true });

    if (error || !data) return [];

    return data.map((d: any) => ({
      id: d.id,
      full_name: d.full_name || "Без имени",
      nickname: d.nickname || undefined,
      avatar_url: d.photo_url || undefined,
      specialization: getSpec(d),
    }));
  } catch (e) {
    console.error("fetchMedicalStaff failed", e);
    return [];
  }
};

export const fetchNurses = async (): Promise<EmployeesRow[]> => {
  try {
    // Fetch only where role is nurse
    const { data, error } = await supabase
      .from(DB_TABLES.EMPLOYEES)
      .select(`
        id,
        full_name,
        nickname,
        photo_url,
        role_id,
        roles!inner (
          name,
          display_name
        )
      `)
      .eq("roles.name", "nurse")
      .order("full_name", { ascending: true });

    if (error || !data) return [];

    return data.map((d: any) => ({
      id: d.id,
      full_name: d.full_name || "Без имени",
      nickname: d.nickname || undefined,
      avatar_url: d.photo_url || undefined,
      specialization: getSpec(d),
    }));
  } catch (e) {
    console.error("fetchNurses failed", e);
    return [];
  }
};
