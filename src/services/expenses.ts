
import { supabase } from "../utility/supabaseClient";
import type { Expense } from "../pages/expenses/types";

export const ExpensesService = {
  async getAll(employeeId?: string | null) {
    let query = supabase
      .from("Expenses")
      .select("*")
      .order("created_at", { ascending: false });

    if (employeeId) {
      query = query.eq("employee_id", employeeId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as Expense[];
  },

  async create(expense: Omit<Expense, "id" | "updated_at">) {
    const { data, error } = await supabase
      .from("Expenses")
      .insert(expense)
      .select()
      .single();

    if (error) throw error;
    return data as Expense;
  },

  async update(id: number | string, updates: Partial<Expense>) {
    // Exclude id, created_at, updated_at from updates to avoid issues, though Supabase usually handles it
    const { id: _, updated_at, ...cleanUpdates } = updates as any;
    
    const { data, error } = await supabase
      .from("Expenses")
      .update(cleanUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Expense;
  },

  async delete(id: number | string) {
    const { error } = await supabase
      .from("Expenses")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  }
};
