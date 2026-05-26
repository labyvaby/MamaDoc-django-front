import { supabase } from "../utility/supabaseClient";
import { DB_TABLES } from "../utility/constants";

const importMetaEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> })?.env) || {};
const DEFAULT_SERVICES_TABLE = DB_TABLES.SERVICES;
const SERVICES_WRITE = importMetaEnv.VITE_SERVICES_WRITE_TABLE || DEFAULT_SERVICES_TABLE;

// Strict DB row according to the actual schema
export interface ServiceDBRow {
  sellable_item_id: string; // Primary UUID candidate
  id?: string | number;     // Alternate ID candidate
  ID?: string | number;     // Alternate ID candidate
  name: string;             
  image_url?: string | null;
  price_som?: number | null;
  [key: string]: unknown;
}

// Frontend DTO used across the app
export type ServiceRow = {
  id: string;
  name: string;
  price?: number;
  photoUrl?: string;
  employee_id?: string | null;
  employee_ids?: string[]; 
  is_active?: boolean;
};

// Map a DB row to our DTO safely
function mapDbToDto(row: ServiceDBRow): ServiceRow {
  // Robust ID mapping similar to Services page index.tsx
  const rawId = 
    row.sellable_item_id ?? 
    row.id ?? 
    row.ID ?? 
    row["Услуга ID"] ?? 
    row["Service ID"];

  const rawName = row.name ?? row["Название услуги"] ?? row["Название"] ?? "Без названия";

  return {
    id: String(rawId ?? ""),
    name: String(rawName).trim(),
    price: row.price_som != null ? Number(row.price_som) : undefined,
    photoUrl: row.image_url || undefined,
    employee_id: typeof row.employee_id === "string" ? row.employee_id : null,
    employee_ids: Array.isArray(row.employee_ids) ? row.employee_ids : [],
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
  };
}

/**
 * Load services strictly from the "Services" table and map to DTO.
 */
export const fetchServices = async (): Promise<ServiceRow[]> => {
  try {
    // 1. Fetch Services from either the View or Write table
    // Using simple approach: prioritize VITE_SERVICES_WRITE_TABLE if it's likely a table
    const { data: servicesData, error: servicesError } = await supabase
      .schema("public")
      .from(SERVICES_WRITE)
      .select("*");
      
    if (servicesError || !Array.isArray(servicesData)) {
      console.error("fetchServices: query error", servicesError);
      return [];
    }

    const services = servicesData as ServiceDBRow[];
    // Capture IDs to fetch prices
    const itemIds = services
        .map(s => {
            const id = s.sellable_item_id ?? s.id ?? s.ID;
            return id ? String(id) : null;
        })
        .filter((id): id is string => id !== null && id.length > 0);

    // 2. Fetch Prices for these items
    const pricesMap = new Map<string, number>();
    const performersMap = new Map<string, string[]>();
    const activeMap = new Map<string, boolean>();

    if (itemIds.length > 0) {
        // Status from SellableItems
        const { data: statusData } = await supabase
            .from("SellableItems")
            .select("id, is_active")
            .in("id", itemIds);
        
        if (Array.isArray(statusData)) {
            statusData.forEach((s: any) => {
                activeMap.set(String(s.id), s.is_active);
            });
        }

        // Prices
        const { data: pricesData } = await supabase
            .schema("public")
            .from(DB_TABLES.PRICES)
            .select("sellable_item_id, price")
            .eq("is_current", true)
            .in("sellable_item_id", itemIds);
        
        if (Array.isArray(pricesData)) {
            pricesData.forEach((p: any) => {
                if (p.sellable_item_id && p.price !== undefined) {
                    pricesMap.set(String(p.sellable_item_id), Number(p.price));
                }
            });
        }

        // Employee Links
        const { data: linksData } = await supabase
            .schema("public")
            .from(DB_TABLES.EMPLOYEE_SERVICES)
            .select("service_id, employee_id")
            .in("service_id", itemIds);
        
        if (Array.isArray(linksData)) {
            linksData.forEach((l: any) => {
                if (l.service_id && l.employee_id) {
                    const sId = String(l.service_id);
                    const prev = performersMap.get(sId) || [];
                    prev.push(String(l.employee_id));
                    performersMap.set(sId, prev);
                }
            });
        }
    }

    // 3. Merge
    const rows = services.map(r => {
      const pid = String(r.sellable_item_id ?? r.id ?? r.ID ?? "");
      const priceVal = (r.price_som !== null && r.price_som !== undefined && r.price_som !== 0) 
        ? r.price_som 
        : (pricesMap.get(pid) ?? 0);
      const empIds = performersMap.get(pid) || [];
      const activeVal = activeMap.get(pid) ?? true;
      return {
        ...r,
        price_som: priceVal,
        employee_ids: empIds,
        is_active: activeVal
      };
    }) as ServiceDBRow[];

    const mapped = rows.map(mapDbToDto);
    mapped.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "ru", { sensitivity: "base" }));
    return mapped;
  } catch (e) {
    console.error("fetchServices unexpected error:", e);
    return [];
  }
};


// Paged variant kept consistent with strict typing
export type PagedResult<T> = { items: T[]; total: number };

export const fetchServicesPaged = async (
  page: number,
  rowsPerPage: number = 10
): Promise<PagedResult<ServiceRow>> => {
  const safePage = Number.isFinite(page) && page >= 0 ? Math.trunc(page) : 0;
  const size = Number.isFinite(rowsPerPage) && rowsPerPage > 0 ? Math.trunc(rowsPerPage) : 10;
  const offset = safePage * size;
  const end = offset + size - 1;

  try {
    const { data, error, count } = await supabase
      .schema("public")
      .from(DB_TABLES.SERVICES)
      .select("*", { count: "exact" })
      .range(offset, end);

    if (error || !Array.isArray(data)) {
      // eslint-disable-next-line no-console
      console.error("fetchServicesPaged: query error", error);
      return { items: [], total: 0 };
    }

    const rows = data as ServiceDBRow[];
    if (rows.length > 0 && offset === 0) {
      // eslint-disable-next-line no-console
      console.log("fetchServicesPaged first row:", rows[0]);
    }

    const mapped = rows.map(mapDbToDto);
    mapped.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "ru", { sensitivity: "base" }));

    return {
      items: mapped,
      total: typeof count === "number" ? count : mapped.length,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("fetchServicesPaged unexpected error:", e);
    return { items: [], total: 0 };
  }
};
