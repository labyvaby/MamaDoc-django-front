import { useQuery } from "@tanstack/react-query";
import { fetchEmployees } from "../services/employees";
import type { EmployeesRow } from "../pages/expenses/types";

export function useEmployees(enabled: boolean = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["employees", "all"],
    queryFn: fetchEmployees,
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false, // Vital for preventing background refetches
  });

  return {
    employees: data ?? [],
    loading: isLoading,
    error,
  };
}
