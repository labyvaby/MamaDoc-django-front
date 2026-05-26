import React from "react";
import {
  EMPLOYEES_SOURCE,
  assignEmployeeToServices,
  dedupeEmployees,
  mapAnyToEmployee,
  sanitizeKGLocal,
  isKGLocalValid,
  composeKGPhone,
  parseKGLocalFrom,
  fetchEmployeeServiceIds,
  replaceEmployeeServices,
} from "../api";
import type { EmployesRow } from "../types";
import { supabase } from "../../../utility/supabaseClient";
import { fetchServices } from "../../../services/services";
import { useSimplePageCache } from "../../../hooks/useSimplePageCache";

const PAGE_SIZE = 30;

// Хелпер для безопасного получения сообщения об ошибке (без any)
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function translateAuthError(rawError: unknown): string {
  const msg = getErrorMessage(rawError).toLowerCase();
  
  if (msg.includes("unable to validate email address") || msg.includes("invalid format") || msg.includes("invalid email")) {
    return "Указанный email-адрес не существует, отклонен почтовым сервером или имеет неверный формат. Пожалуйста, проверьте правильность адреса (например, нет ли опечатки).";
  }
  if (msg.includes("already been registered") || msg.includes("already registered") || msg.includes("already exists")) {
    return "Пользователь с такой почтой или номером телефона уже зарегистрирован в системе. Измените данные или сначала привяжите существующий аккаунт.";
  }
  if (msg.includes("password should be at least")) {
    return "Пароль должен состоять минимум из 6 символов.";
  }
  if (msg.includes("phone number format")) {
    return "Неверный формат номера телефона.";
  }
  if (msg.includes("failed to fetch") || msg.includes("network error")) {
    return "Сеть недоступна или сервер авторизации не отвечает.";
  }
  return `Ошибка регистрации в системе безопасности: ${getErrorMessage(rawError)}`;
}

export function useEmployeesPageState() {
  const [items, setItems] = React.useState<EmployesRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const [q, setQ] = React.useState("");
  const qDebounced = useDebounced(q, 300);

  const [addOpen, setAddOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState<null | EmployesRow>(null);
  const [detailsOpen, setDetailsOpen] = React.useState<null | EmployesRow>(null);
  const [deleteOpen, setDeleteOpen] = React.useState<null | EmployesRow>(null);

  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [page, setPage] = React.useState(0);

  // Кеширование состояния страницы
  const { restoreState } = useSimplePageCache('employees-page-v2', {
    items,
    q,
    detailsOpen,
  });

  const fetchEmployees = React.useCallback(async (pageNum: number, isNewSearch = false) => {
    try {
      if (isNewSearch) {
        setLoading(true);
        setErrorMsg(null);
      } else {
        setLoadingMore(true);
      }

      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // 1. Формируем запрос
      let query = supabase
        .from(EMPLOYEES_SOURCE)
        .select("*")
        .range(from, to)
        .range(from, to)
        .order("updated_at", { ascending: false }); 

      // 2. Добавляем поиск, если есть запрос
      if (qDebounced.trim()) {
        const term = `%${qDebounced.trim()}%`;
        // Новые колонки: full_name, phone
        query = query.or(`full_name.ilike.${term},phone.ilike.${term}`);
      }

      const { data, error } = await query;

      console.log("DEBUG: fetchEmployees result", { data, error, from, to });

      if (error) throw error;

      // 3. Безопасный маппинг данных без any
      const rawData = Array.isArray(data) ? (data as unknown[]) : [];
      
      const mapped: EmployesRow[] = rawData
        .map((r) => {
          if (typeof r === "object" && r !== null) {
            return mapAnyToEmployee(r as Record<string, unknown>);
          }
          return null;
        })
        .filter((x): x is EmployesRow => x !== null);

      // 4. Обновляем стейт
      setItems((prev) => {
        const newItems = isNewSearch ? mapped : prev.concat(mapped);
        return isNewSearch ? newItems : dedupeEmployees(newItems);
      });

      setHasMore(mapped.length === PAGE_SIZE);

    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      console.error("Fetch employees error:", msg);
      
      if (msg.includes("does not exist")) {
        setErrorMsg(`Ошибка базы данных: ${msg}. Проверьте названия колонок (ID vs id).`);
      } else {
        setErrorMsg("Не удалось загрузить сотрудников");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [qDebounced]);

  // Начальная загрузка с проверкой кеша
  const isInitializedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;

      // Восстанавливаем состояние из кеша
      const cached = restoreState();
      if (cached) {
        setItems(cached.items);
        setQ(cached.q);
        setDetailsOpen(cached.detailsOpen);
        setLoading(false);
        return; // Пропускаем fetch
      }
    }

    setPage(0);
    fetchEmployees(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDebounced, fetchEmployees]);

  // REALTIME: Подписка на изменения сотрудников и ролей
  React.useEffect(() => {
    const channel = supabase
      .channel("employees-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: EMPLOYEES_SOURCE },
        () => {
          console.log("Realtime: Employees changed, reloading...");
          fetchEmployees(0, true);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "roles" },
        () => {
          console.log("Realtime: Roles changed, reloading...");
          fetchEmployees(0, true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEmployees]);

  const loadMore = React.useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchEmployees(nextPage, false);
    }
  }, [loadingMore, hasMore, loading, page, fetchEmployees]);

  return {
    items,
    setItems,
    filtered: items,
    loading,
    errorMsg,
    addOpen,
    setAddOpen,
    editOpen,
    setEditOpen,
    detailsOpen,
    setDetailsOpen,
    deleteOpen,
    setDeleteOpen,
    q,
    setQ,
    hasMore,
    loadingMore,
    loadMore,
  } as const;
}

export const employeeFormUtils = {
  sanitizeKGLocal,
  isKGLocalValid,
  composeKGPhone,
  parseKGLocalFrom,
  assignEmployeeToServices,
  fetchServices,
  fetchEmployeeServiceIds,
  replaceEmployeeServices,
  translateAuthError,
};
