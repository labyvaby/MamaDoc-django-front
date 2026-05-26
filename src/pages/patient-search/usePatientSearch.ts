import React from "react";
import { supabase } from "../../utility/supabaseClient";
import type { Patient } from "../../types/models";
import { DB_TABLES } from "../../utility/constants";
import { parsePhone, composePhone } from "../../utility/phone";

const PER_PAGE = 30;

function useDebouncedValue<T>(value: T, delay = 100) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function isAbortError(e: unknown): boolean {
  if (!e) return false;
  if (typeof e === "object" && e !== null) {
    const any = e as { name?: string; code?: unknown; message?: unknown };
    const name = String(any.name ?? "");
    const code = String(any.code ?? "");
    const msg = String(any.message ?? "");
    if (name === "AbortError") return true;
    if (code === "ABORT_ERR" || code === "20") return true;
    if (msg.toLowerCase().includes("aborted") || msg.toLowerCase().includes("abort")) return true;
  } else if (typeof e === "string") {
    const s = e.toLowerCase();
    if (s.includes("abort")) return true;
  }
  return false;
}

function normalizeFio(row: Record<string, unknown>): string {
  const fio =
    (row["ФИО"] as string) ??
    (row["ФИО пациента"] as string) ??
    (row["Пациент ФИО"] as string) ??
    (row["Пациент"] as string) ??
    (row["full_name"] as string) ??
    (row["Full Name"] as string) ??
    (row["name"] as string) ??
    [
      (row["Фамилия"] as string) ??
        (row["Пациент Фамилия"] as string) ??
        (row["last_name"] as string) ??
        (row["surname"] as string),
      (row["Имя"] as string) ??
        (row["Пациент Имя"] as string) ??
        (row["first_name"] as string) ??
        (row["given_name"] as string),
      (row["Отчество"] as string) ??
        (row["Пациент Отчество"] as string) ??
        (row["middle_name"] as string),
    ]
      .filter(Boolean)
      .join(" ");
  return fio || "";
}
function normalizePhone(row: Record<string, unknown>): string | undefined {
  const p =
    (row["Телефон"] as string) ??
    (row["phone"] as string) ??
    (row["Номер телефона"] as string) ??
    (row["mobile"] as string) ??
    (row["phone_number"] as string) ??
    (row["mobile_phone"] as string) ??
    (row["tel"] as string) ??
    (row["Телефон 1"] as string) ??
    (row["Телефон пациента"] as string);
  return p || undefined;
}
function normalizePatientId(row: Record<string, unknown>): string {
  const id =
    String(
      row["ID"] ??
        row["Пациент ID"] ??
        row["patient_id"] ??
        row["patientId"] ??
        row["id"] ??
        ""
    ) || "";
  return id;
}

function genUuidV4(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof (crypto as unknown as { randomUUID?: () => string }).randomUUID ===
      "function"
  ) {
    return (crypto as unknown as { randomUUID: () => string }).randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface UsePatientListOptions {
  initialPatients?: Patient[];
  initialQuery?: string;
  initialHasMore?: boolean;
  skipInitialFetch?: boolean;
}

/**
 * Управляет списком пациентов: поиск и бесконечная прокрутка.
 */
export function usePatientList(options?: UsePatientListOptions) {
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [patients, setPatients] = React.useState<Patient[]>(options?.initialPatients ?? []);
  const [query, setQuery] = React.useState(options?.initialQuery ?? "");
  const debouncedQuery = useDebouncedValue(query, 400);
  const [hasMore, setHasMore] = React.useState(options?.initialHasMore ?? true);
  const skipInitialFetchRef = React.useRef(options?.skipInitialFetch ?? false);

  const listCtrlRef = React.useRef<AbortController | null>(null);
  const inFlightRef = React.useRef(false);

  const mapRows = React.useCallback((rows: Array<Record<string, unknown>>): Patient[] => {
    return rows
      .map((r) => ({
        id: normalizePatientId(r),
        fio:
          (r["full_name"] as string) ??
          (r["ФИО пациента"] as string) ??
          normalizeFio(r),
        phone:
          (r["phone"] as string) ??
          (r["Телефон"] as string) ??
          normalizePhone(r),
        inn: (r["inn"] as string) ?? (r["ИНН"] as string) ?? (r["iin"] as string) ?? null,
        photo:
          (r["photo_url"] as string) ??
          (r["фото Пациента"] as string) ??
          (r["Фото пациента"] as string) ??
          (r["Фото Пациента"] as string) ??
          (r["photo"] as string) ??
          (r["avatar"] as string) ??
          undefined,
        birth_date:
          (r["birth_date"] as string) ??
          (r["Дата рождения"] as string) ??
          undefined,
        is_blacklisted:
          (r["is_blacklisted"] as boolean) ??
          (r["В черном списке"] as boolean) ??
          false,
        blacklist_reason:
          (r["blacklist_reason"] as string) ??
          (r["blacklist reason"] as string) ??
          (r["причина"] as string) ??
          null,
      }))
      .filter((p) => p.id || p.fio);
  }, []);

  const fetchChunk = React.useCallback(
    async (offset: number, q: string) => {
      // Отменяем предыдущий запрос (даже если ещё выполняется)
      const prevCtrl = listCtrlRef.current;
      if (prevCtrl) prevCtrl.abort();
      const ctrl = new AbortController();
      listCtrlRef.current = ctrl;

      inFlightRef.current = true;
      setLoading(true);
      setErrorMsg(null);

      try {
        const res = await supabase
          .rpc("search_patients", {
            p_query: q.trim(),
            p_limit: PER_PAGE,
            p_offset: offset,
          })
          .abortSignal(ctrl.signal);

        if (res.error) throw res.error;

        const data = (res.data ?? []) as Array<Record<string, unknown>>;
        const mapped = mapRows(data);

        if (ctrl.signal.aborted) return;

        setPatients((prev) => (offset === 0 ? mapped : [...prev, ...mapped]));
        setHasMore(mapped.length === PER_PAGE);
      } catch (e) {
        if (isAbortError(e)) return;
        console.error(e);
        const errObj = (typeof e === "object" && e !== null ? e : {}) as {
          message?: string;
        };
        setErrorMsg(
          errObj.message ?? (typeof e === "object" ? JSON.stringify(e) : String(e))
        );
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
        inFlightRef.current = false;
      }
    },
    [mapRows]
  );

  const loadMore = React.useCallback(() => {
    if (loading || !hasMore || inFlightRef.current) return;
    void fetchChunk(patients.length, debouncedQuery);
  }, [loading, hasMore, patients.length, debouncedQuery, fetchChunk]);

  // Сброс и первичная загрузка при изменении поискового запроса
  React.useEffect(() => {
    // Пропускаем первый fetch если есть кешированные данные
    if (skipInitialFetchRef.current && patients.length > 0) {
      skipInitialFetchRef.current = false;
      return;
    }

    // сброс
    setPatients([]);
    setHasMore(true);
    setErrorMsg(null);
    // первичная загрузка
    void fetchChunk(0, debouncedQuery);
    return () => {
      const prev = listCtrlRef.current;
      if (prev) prev.abort();
    };
  }, [debouncedQuery, fetchChunk]);
  const reload = React.useCallback(() => {
    setPatients([]);
    setHasMore(true);
    setErrorMsg(null);
    void fetchChunk(0, debouncedQuery);
  }, [debouncedQuery, fetchChunk]);

  // Быстрое добавление пациента и перезагрузка списка с начала
  const addPatient = React.useCallback(
    async (fioRaw: string, phoneRaw?: string | null) => {
      const fio = fioRaw.trim();
      const rawPhone = (phoneRaw ?? "").trim();
      let phone: string | null = null;

      if (rawPhone) {
        const parsed = parsePhone(rawPhone);
        const localDigits = parsed.local.replace(/[^0-9]/g, "").slice(0, 9);
        phone = composePhone(parsed.countryCode, localDigits);
      }

      const patientId = genUuidV4();

      const payload: Record<string, unknown> = {
        ID: patientId,
        full_name: fio,
        phone: phone,
        birth_date: null,
      };

      const { error } = await supabase
        .schema("public")
        .from(DB_TABLES.PATIENTS)
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      // перезагрузить список с начала
      reload();
    },
    [reload]
  );

  // REALTIME: Подписка на изменения пациентов (throttled — не чаще раза в 5 сек)
  const reloadThrottleRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadRef = React.useRef(reload);
  reloadRef.current = reload;

  React.useEffect(() => {
    const channel = supabase
      .channel("patients-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: DB_TABLES.PATIENTS },
        () => {
          if (reloadThrottleRef.current) return;
          reloadThrottleRef.current = setTimeout(() => {
            reloadThrottleRef.current = null;
            reloadRef.current();
          }, 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (reloadThrottleRef.current) {
        clearTimeout(reloadThrottleRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    loading,
    errorMsg,
    patients,
    query,
    setQuery,
    hasMore,
    loadMore,
    addPatient,
    reload,
    PER_PAGE,
  };
}
