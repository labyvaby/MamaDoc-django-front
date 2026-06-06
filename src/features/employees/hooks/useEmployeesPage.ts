import React from "react";
import type { EmployesRow } from "../types";
import { IS_DJANGO_BACKEND } from "../../../config/backend";
import { getDjangoEmployees } from "../../../api/staff";
import { mapDjangoListItemToRow } from "../viewModel";
import { usePermissions } from "../../../hooks/usePermissions";

// Supabase-only helpers: loaded dynamically so supabaseClient stays out of Django bundle
async function _supabaseFetchEmployees(supabase: any, table: string): Promise<EmployesRow[]> {
  const { data, error } = await supabase.from(table).select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  const { mapAnyToEmployee } = await import("../api");
  const raw = Array.isArray(data) ? (data as unknown[]) : [];
  return raw
    .map((r) => typeof r === "object" && r !== null ? mapAnyToEmployee(r as Record<string, unknown>) : null)
    .filter((x): x is EmployesRow => x !== null);
}

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
    return "Указанный email-адрес не существует, отклонён почтовым сервером или имеет неверный формат.";
  }
  if (msg.includes("already been registered") || msg.includes("already registered") || msg.includes("already exists")) {
    return "Пользователь с такой почтой или номером телефона уже зарегистрирован.";
  }
  if (msg.includes("password should be at least")) {
    return "Пароль должен состоять минимум из 6 символов.";
  }
  if (msg.includes("phone number format")) {
    return "Неверный формат номера телефона.";
  }
  if (msg.includes("failed to fetch") || msg.includes("network error")) {
    return "Сеть недоступна или сервер не отвечает.";
  }
  return `Ошибка: ${getErrorMessage(rawError)}`;
}


export function useEmployeesPageState() {
  const { activeOrganization, activeBranch, activeMembership } = usePermissions();
  const orgId = activeOrganization?.id ?? null;
  const branchId = activeBranch?.id ?? null;
  const membershipId = activeMembership?.id ?? null;

  // Cache key: unique per active tenant context — changing org/branch clears data
  const contextKey = `${orgId ?? "null"}_${branchId ?? "null"}_${membershipId ?? "null"}`;
  const prevContextKeyRef = React.useRef<string>(contextKey);

  const [allItems, setAllItems] = React.useState<EmployesRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Search state (debounced for server-side search in Django mode)
  const [q, setQ] = React.useState("");
  const qDebounced = useDebounced(q, 400);

  const [addOpen, setAddOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState<null | EmployesRow>(null);
  const [detailsOpen, setDetailsOpen] = React.useState<null | EmployesRow>(null);
  const [deleteOpen, setDeleteOpen] = React.useState<null | EmployesRow>(null);

  // Pagination state (server-side in Django mode)
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);

  // AbortController ref for cancelling in-flight requests
  const abortCtrlRef = React.useRef<AbortController | null>(null);

  const fetchEmployees = React.useCallback(async (page = 1, append = false) => {
    // Cancel previous in-flight request
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        // Clear stale data immediately on first page to prevent showing wrong org data
        if (page === 1) setAllItems([]);
      }
      setErrorMsg(null);

      if (IS_DJANGO_BACKEND) {
        const result = await getDjangoEmployees(
          {
            search: qDebounced.trim() || undefined,
            page,
            pageSize: 50,
          },
          ctrl.signal,
        );

        if (ctrl.signal.aborted) return;

        const mapped = result.results.map(mapDjangoListItemToRow);
        if (append) {
          setAllItems((prev) => [...prev, ...mapped]);
        } else {
          setAllItems(mapped);
        }
        setTotalCount(result.count);
        setHasMore(result.nextPage !== null);
        setCurrentPage(page);
      } else {
        const { supabase } = await import("../../../utility/supabaseClient");
        const { EMPLOYEES_SOURCE } = await import("../api");
        const mapped = await _supabaseFetchEmployees(supabase, EMPLOYEES_SOURCE);
        if (ctrl.signal.aborted) return;
        setAllItems(mapped);
        setHasMore(false);
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      const msg = getErrorMessage(e);
      console.error("Fetch employees error:", msg);
      setErrorMsg("Не удалось загрузить сотрудников");
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [qDebounced]);

  // Re-fetch when context (org/branch) changes — clear stale data first
  React.useEffect(() => {
    if (contextKey !== prevContextKeyRef.current) {
      prevContextKeyRef.current = contextKey;
      setAllItems([]);
      setDetailsOpen(null);
      setEditOpen(null);
      setDeleteOpen(null);
      setQ("");
      setCurrentPage(1);
    }
  }, [contextKey]);

  // Initial fetch + re-fetch when search or context changes.
  // In Django mode: wait until activeMembership is resolved — avoids unauthenticated or
  // pre-context requests that would return wrong-org data.
  React.useEffect(() => {
    if (IS_DJANGO_BACKEND && !membershipId) {
      // Membership not yet resolved — clear stale state, don't fire request
      setAllItems([]);
      setLoading(false);
      return;
    }
    void fetchEmployees(1, false);
    return () => {
      abortCtrlRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey, qDebounced]);

  const loadMore = React.useCallback(() => {
    if (hasMore && !loadingMore && !loading) {
      void fetchEmployees(currentPage + 1, true);
    }
  }, [hasMore, loadingMore, loading, currentPage, fetchEmployees]);

  // Filtered items (client-side search in Supabase mode; server-side in Django mode)
  const filtered = React.useMemo(() => {
    if (IS_DJANGO_BACKEND) return allItems; // server already filtered
    if (!q.trim()) return allItems;
    const term = q.trim().toLowerCase();
    return allItems.filter(
      (e) =>
        (e.full_name || "").toLowerCase().includes(term) ||
        (e.phone || "").toLowerCase().includes(term)
    );
  }, [allItems, q]);

  const publicSetItems = React.useCallback(
    (updater: EmployesRow[] | ((prev: EmployesRow[]) => EmployesRow[])) => {
      setAllItems((prev) => {
        return typeof updater === "function" ? updater(prev) : updater;
      });
    },
    []
  );

  return {
    items: allItems,
    setItems: publicSetItems,
    filtered,
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
    refetch: () => void fetchEmployees(1, false),
    totalCount,
  } as const;
}

