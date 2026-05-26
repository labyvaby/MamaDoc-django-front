
import { supabase } from "../utility/supabaseClient";

export type Shift = {
  id: string;
  employes_id: string;
  shift_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm:ss
  end_time: string;   // HH:mm:ss
};

export const fetchShiftsForDate = async (date: string): Promise<Shift[]> => {
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .eq("shift_date", date);

  if (error) throw error;
  return data || [];
};
