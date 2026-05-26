import { useQuery } from "@tanstack/react-query";
import { fetchMedicalStaff } from "../services/employees";
import { fetchServices, type ServiceRow } from "../services/services";
import { getProducts, type Product } from "../services/products";
import type { PatientOption } from "../pages/home/types";

// Types
type DictionariesByType = {
  patients: PatientOption[];
  employees: any[];
  services: ServiceRow[];
  products: Product[];
};

// Stable empty arrays — avoid creating new references on every render
const EMPTY_PATIENTS: PatientOption[] = [];
const EMPTY_EMPLOYEES: any[] = [];
const EMPTY_SERVICES: ServiceRow[] = [];
const EMPTY_PRODUCTS: Product[] = [];


const fetchAllDictionaries = async (): Promise<DictionariesByType> => {
  const [employees, services, products] = await Promise.all([
    fetchMedicalStaff(),
    fetchServices(),
    getProducts(),
  ]);

  return { patients: [], employees, services, products };
};

export function useDictionaries(enabled: boolean = true) {
  const { data, isLoading } = useQuery({
    queryKey: ["dictionaries", "all"],
    queryFn: fetchAllDictionaries,
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes - увеличено для уменьшения запросов
    gcTime: 30 * 60 * 1000, // 30 minutes - увеличено для хранения в памяти
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Не перезагружать при монтировании, если данные есть
    refetchOnReconnect: false, // Не перезагружать при восстановлении соединения
  });

  return {
    patients: data?.patients ?? EMPTY_PATIENTS,
    employees: data?.employees ?? EMPTY_EMPLOYEES,
    services: data?.services ?? EMPTY_SERVICES,
    products: data?.products ?? EMPTY_PRODUCTS,
    loading: isLoading,
  };
}
