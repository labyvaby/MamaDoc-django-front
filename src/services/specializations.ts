import { supabase } from "../utility/supabaseClient";
import { DB_TABLES } from "../utility/constants";

export type SpecializationRow = {
  id: string;
  name: string;
};

export const fetchSpecializations = async (): Promise<SpecializationRow[]> => {
  try {
    const { data, error } = await supabase
      .from(DB_TABLES.SPECIALIZATIONS)
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching specializations:", error);
      return [];
    }

    return (data as any[] || []).map(r => ({
      id: r.id,
      name: r.name
    }));
  } catch (e) {
    console.error("fetchSpecializations failed", e);
    return [];
  }
};
