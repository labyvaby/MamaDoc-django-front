import { supabase } from "../utility/supabaseClient";

/**
 * Типы для системы диагнозов
 */

// Глобальный справочник диагнозов (МКБ-10)
export type Diagnosis = {
    id: string;
    code: string; // Код МКБ-10
    name: string; // Полное название
    category?: string;
    description?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
};

// Избранные диагнозы клиники (упрощенные для врачей)
export type ClinicDiagnosis = {
    id: string;
    diagnosis_code: string;
    title: string; // Упрощенное название (например, "ОРВИ")
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    // Joined fields
    // diagnosis_code is now main field
    diagnosis_full_title?: string; // Полное название из таблицы Diagnoses
};

/**
 * Получить список избранных диагнозов клиники (для выбора врачом)
 */
// Cache for clinic diagnoses
let CACHE_CLINIC_DIAGNOSES: ClinicDiagnosis[] | null = null;
let CACHE_DIAGNOSES_TIMESTAMP = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Получить список избранных диагнозов клиники (для выбора врачом)
 */
export const getClinicDiagnoses = async (includeInactive: boolean = false): Promise<ClinicDiagnosis[]> => {
    const now = Date.now();
    // Cache only for active ones (doctor's view)
    if (!includeInactive && CACHE_CLINIC_DIAGNOSES && (now - CACHE_DIAGNOSES_TIMESTAMP < CACHE_TTL)) {
        return CACHE_CLINIC_DIAGNOSES;
    }

    let query = supabase
        .from("ClinicDiagnoses")
        .select(`
            *,
            Diagnoses:diagnosis_code (
                code,
                name
            )
        `);

    if (!includeInactive) {
        query = query.eq("is_active", true);
    }

    const { data, error } = await query
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });

    if (error) throw error;

    const mapped = (data || []).map((item: any) => ({
        ...item,
        diagnosis_code: item.diagnosis_code || item.Diagnoses?.code,
        diagnosis_full_title: item.Diagnoses?.name,
    }));

    CACHE_CLINIC_DIAGNOSES = mapped;
    CACHE_DIAGNOSES_TIMESTAMP = now;

    return mapped;
};

/**
 * Получить диагноз по ID (из избранных клиники)
 */
export const getClinicDiagnosisById = async (id: string): Promise<ClinicDiagnosis | null> => {
    const { data, error } = await supabase
        .from("ClinicDiagnoses")
        .select(`
            *,
            Diagnoses:diagnosis_code (
                code,
                name
            )
        `)
        .eq("id", id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
    }

    if (!data) return null;

    return {
        ...data,
        diagnosis_code: data.diagnosis_code || data.Diagnoses?.code,
        diagnosis_full_title: data.Diagnoses?.name,
    };
};

/**
 * Получить глобальные диагнозы (для админки, не для врачей)
 * Используется только для управления справочником
 */
export const getDiagnoses = async (search?: string): Promise<Diagnosis[]> => {
    let query = supabase
        .from("Diagnoses")
        .select("*")
        .eq("is_active", true);

    if (search) {
        query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    }

    query = query.order("code", { ascending: true }).limit(100);

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
};

/**
 * Получить глобальные диагнозы (для админки)
 */
export const getAdminDiagnoses = async (search?: string, page: number = 0, pageSize: number = 20): Promise<{ data: Diagnosis[], count: number }> => {
    let query = supabase
        .from("Diagnoses")
        .select("*", { count: "exact" });

    if (search) {
        query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
        .order("code", { ascending: true })
        .range(from, to);

    if (error) throw error;

    return { 
        data: data || [], 
        count: count || 0 
    };
};

/**
 * Создать глобальный диагноз
 */
export const createDiagnosis = async (diagnosis: Partial<Diagnosis>): Promise<Diagnosis> => {
    const { data, error } = await supabase
        .from("Diagnoses")
        .insert([diagnosis])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Обновить глобальный диагноз
 */
export const updateDiagnosis = async (id: string, updates: Partial<Diagnosis>): Promise<void> => {
    const { error } = await supabase
        .from("Diagnoses")
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
        .eq("id", id);

    if (error) throw error;
};

/**
 * Удалить глобальный диагноз
 */
export const deleteDiagnosis = async (id: string): Promise<void> => {
    const { error } = await supabase
        .from("Diagnoses")
        .delete()
        .eq("id", id);

    if (error) throw error;
};

/**
 * Создать новый избранный диагноз клиники
 */
export const createClinicDiagnosis = async (
    diagnosisCode: string | null,
    title: string,
    sortOrder?: number
): Promise<ClinicDiagnosis> => {
    const { data, error } = await supabase
        .from("ClinicDiagnoses")
        .insert([
            {
                diagnosis_code: diagnosisCode,
                title,
                sort_order: sortOrder || 0,
                is_active: true,
            },
        ])
        .select()
        .single();

    if (error) throw error;

    // We need to invalidate cache
    CACHE_CLINIC_DIAGNOSES = null;

    return data;
};

/**
 * Обновить избранный диагноз клиники
 */
export const updateClinicDiagnosis = async (
    id: string,
    updates: { title?: string; sort_order?: number; is_active?: boolean }
): Promise<void> => {
    const { error } = await supabase
        .from("ClinicDiagnoses")
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq("id", id);

    if (error) throw error;
    
    // Invalidate cache
    CACHE_CLINIC_DIAGNOSES = null;
};

/**
 * Удалить избранный диагноз клиники
 */
export const deleteClinicDiagnosis = async (id: string): Promise<void> => {
    const { error } = await supabase
        .from("ClinicDiagnoses")
        .delete()
        .eq("id", id);

    if (error) throw error;

    // Invalidate cache
    CACHE_CLINIC_DIAGNOSES = null;
};
