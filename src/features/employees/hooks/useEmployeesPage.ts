import React from "react";
import type { EmployesRow } from "../types";
import {
  getDjangoEmployees,
  getDjangoEmployee,
  getAllDjangoEmployees,
} from "../../../api/staff";
import { mapDjangoListItemToRow, mapDjangoFullToRow } from "../viewModel";
import { usePermissions } from "../../../hooks/usePermissions";
import { matchesEmployeeQuery } from "../search";

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
  // Ref updated synchronously on every render so async callbacks can compare
  // against the *current* context key rather than a stale closure value.
  const currentContextKeyRef = React.useRef<string>(contextKey);
  currentContextKeyRef.current = contextKey;

  const [allItems, setAllItems] = React.useState<EmployesRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Поиск: ввод дебаунсится, но фильтрация локальная — бэк ищет только по
  // ФИО/телефону и не видит специализации (см. ../search.ts).
  const [q, setQ] = React.useState("");
  const qDebounced = useDebounced(q, 300);
  const query = qDebounced.trim();
  const searching = query.length > 0;

  // Полный справочник сотрудников — источник для поиска. Грузится один раз на
  // контекст (орг/филиал), при первом же непустом запросе.
  const [directory, setDirectory] = React.useState<EmployesRow[] | null>(null);
  const [directoryLoading, setDirectoryLoading] = React.useState(false);
  const directoryKeyRef = React.useRef<string | null>(null);

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
    // Capture context at call time for stale-write detection after await
    const requestContextKey = currentContextKeyRef.current;

    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        // Clear stale data immediately on first page to prevent showing wrong org data
        if (page === 1) setAllItems([]);
      }
      setErrorMsg(null);

      {
        const result = await getDjangoEmployees(
          {
            branchId: branchId ?? undefined,
            page,
            pageSize: 50,
            organizationId: orgId ?? undefined,
          },
          ctrl.signal,
        );

        // Discard result if request was aborted or context changed since the request started
        if (ctrl.signal.aborted) return;
        if (requestContextKey !== currentContextKeyRef.current) return;

        const mapped = result.results.map(mapDjangoListItemToRow);
        if (append) {
          setAllItems((prev) => [...prev, ...mapped]);
        } else {
          setAllItems(mapped);
        }
        setTotalCount(result.count);
        setHasMore(result.nextPage !== null);
        setCurrentPage(page);
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      if (ctrl.signal.aborted) return;
      if (requestContextKey !== currentContextKeyRef.current) return;
      const msg = getErrorMessage(e);
      console.error("Fetch employees error:", msg);
      setErrorMsg("Не удалось загрузить сотрудников");
    } finally {
      if (!ctrl.signal.aborted && requestContextKey === currentContextKeyRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [contextKey, branchId, orgId]);

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
      setDirectory(null);
      setDirectoryLoading(false);
      directoryKeyRef.current = null;
    }
  }, [contextKey]);

  // Load full employee details when selected in list
  React.useEffect(() => {
    if (!detailsOpen?.id) return;

    // If we already have full details loaded, skip request
    if (detailsOpen._fullDetailsLoaded) return;

    const empId = Number(detailsOpen.id);
    if (isNaN(empId)) return;

    let active = true;
    getDjangoEmployee(empId)
      .then((fullEmp) => {
        if (!active) return;
        const fullRow = mapDjangoFullToRow(fullEmp, detailsOpen);
        const replaceRow = (rows: EmployesRow[]) =>
          rows.map((item) => (item.id === fullRow.id ? fullRow : item));
        setAllItems(replaceRow);
        setDirectory((prev) => (prev === null ? prev : replaceRow(prev)));
        setDetailsOpen(fullRow);
      })
      .catch((err) => {
        console.error("Ошибка загрузки полных деталей сотрудника:", err);
      });

    return () => {
      active = false;
    };
  }, [detailsOpen?.id]);

  // Initial fetch + re-fetch when search or context changes.
  // Wait until active membership is resolved — avoids unauthenticated or
  // pre-context requests that would return wrong-org data.
  React.useEffect(() => {
    if (!membershipId) {
      // Membership not yet resolved — clear stale state, don't fire request
      setAllItems([]);
      setLoading(false);
      return;
    }
    void fetchEmployees(1, false);
    return () => {
      abortCtrlRef.current?.abort();
    };
  }, [contextKey, fetchEmployees, membershipId]);

  // Догрузка полного справочника при первом поиске. Постранично внутри
  // getAllDjangoEmployees (потолок бэка — 200 на страницу), иначе поиск молча
  // видел бы только первую страницу списка.
  React.useEffect(() => {
    if (!searching || !membershipId) return;
    if (directoryKeyRef.current === contextKey) return;

    let active = true;
    const ctrl = new AbortController();
    setDirectoryLoading(true);
    getAllDjangoEmployees(
      { branchId: branchId ?? undefined, organizationId: orgId ?? undefined },
      ctrl.signal,
    )
      .then((rows) => {
        if (!active || ctrl.signal.aborted) return;
        if (contextKey !== currentContextKeyRef.current) return;
        directoryKeyRef.current = contextKey;
        setDirectory(rows.map(mapDjangoListItemToRow));
      })
      .catch((e: unknown) => {
        if (!active || (e as Error)?.name === "AbortError" || ctrl.signal.aborted) return;
        console.error("Fetch employees directory error:", getErrorMessage(e));
        setErrorMsg("Не удалось загрузить сотрудников");
      })
      .finally(() => {
        if (active) setDirectoryLoading(false);
      });

    return () => {
      active = false;
      ctrl.abort();
    };
  }, [searching, contextKey, membershipId, branchId, orgId]);

  const loadMore = React.useCallback(() => {
    if (hasMore && !loadingMore && !loading) {
      void fetchEmployees(currentPage + 1, true);
    }
  }, [hasMore, loadingMore, loading, currentPage, fetchEmployees]);

  // Пока полный справочник не пришёл — фильтруем уже загруженную страницу,
  // чтобы поиск отвечал сразу, а не после полной догрузки.
  const filtered = React.useMemo(() => {
    if (!searching) return allItems;
    const source = directory ?? allItems;
    return source.filter((emp) => matchesEmployeeQuery(emp, query));
  }, [searching, query, directory, allItems]);

  const publicSetItems = React.useCallback(
    (updater: EmployesRow[] | ((prev: EmployesRow[]) => EmployesRow[])) => {
      setAllItems((prev) => (typeof updater === "function" ? updater(prev) : updater));
      // Справочник поиска живёт отдельно от страницы списка: без этого
      // изменённый (или уволенный) сотрудник в результатах поиска остаётся старым.
      setDirectory((prev) =>
        prev === null ? prev : typeof updater === "function" ? updater(prev) : updater,
      );
    },
    []
  );

  return {
    items: allItems,
    setItems: publicSetItems,
    filtered,
    loading: loading || (searching && directoryLoading && directory === null),
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
    // В режиме поиска подгружать серверные страницы нечего: справочник загружен целиком.
    hasMore: searching ? false : hasMore,
    loadingMore: searching ? directoryLoading : loadingMore,
    loadMore,
    refetch: () => {
      directoryKeyRef.current = null;
      setDirectory(null);
      void fetchEmployees(1, false);
    },
    totalCount,
  } as const;
}

