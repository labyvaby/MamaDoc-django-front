/**
 * usePatientHistory.ts
 * Хук загружает и кэширует историю приемов выбранного пациента.
 * Отвечает за: загрузку из Supabase, нормализацию полей, кэширование в localStorage,
 * инвалидацию кэша и принудительную перезагрузку.
 * Не содержит UI, только состояние и эффекты.
 */

import React from "react";
import dayjs from "dayjs";
import { supabase } from "../../utility/supabaseClient";
import type { HistoryRow, Patient } from "../../types/models";

// formatted_date из view генерируется в UTC — конвертируем в Bishkek
const formatDateBishkek = (raw: string): string => {
  // Пример raw: "04:15 02.02.2026" (UTC из to_char)
  const match = raw.match(/^(\d{2}:\d{2}) (\d{2})\.(\d{2})\.(\d{4})$/);
  if (match) {
    const [, time, dd, mm, yyyy] = match;
    const utcStr = `${yyyy}-${mm}-${dd}T${time}:00Z`;
    return dayjs(utcStr).tz("Asia/Bishkek").format("HH:mm DD.MM.YYYY");
  }
  // Если не распознали — попробуем как ISO
  const d = dayjs(raw);
  if (d.isValid()) return d.tz("Asia/Bishkek").format("HH:mm DD.MM.YYYY");
  return raw;
};

const HISTORY_CACHE_PREFIX = "patientSearch.history.v1.";

// Вспомогательные функции (локальные к хуку)
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

type HistoryCache = { ts: number; items: HistoryRow[] };

export function usePatientHistory(selected: Patient | null) {
  const [history, setHistory] = React.useState<HistoryRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Вспомогательный "тик" для принудительной перезагрузки
  const [tick, setTick] = React.useState(0);

  // AbortController на поток истории
  const ctrlRef = React.useRef<AbortController | null>(null);

  const invalidate = React.useCallback(() => {
    if (!selected) return;
    try {
      localStorage.removeItem(HISTORY_CACHE_PREFIX + selected.id);
    } catch {
      // noop
    }
  }, [selected]);

  const reload = React.useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  React.useEffect(() => {
    const prev = ctrlRef.current;
    if (prev) prev.abort();

    if (!selected) {
      setHistory([]);
      setErrorMsg(null);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        // 1) Попытка взять из кэша (отключено для отладки)
        // try {
        //   const raw = localStorage.getItem(HISTORY_CACHE_PREFIX + selected.id);
        //   if (raw) {
        //     const parsed = JSON.parse(raw) as HistoryCache;
        //     setHistory(parsed.items || []);
        //     setLoading(false);
        //     return;
        //   }
        // } catch {
        //   // игнорируем ошибки парсинга
        // }

        // 2) Загрузка истории через RPC (ранняя фильтрация по patient_id, без scan всего view)
        const { data: appointmentsData, error: appointmentsError } = await supabase
          .rpc("get_patient_history", { p_patient_id: selected.id })
          .abortSignal(ctrl.signal);

        if (appointmentsError) {
          console.error("Ошибка загрузки истории приемов:", appointmentsError);
          throw appointmentsError;
        }

        const rows = (appointmentsData ?? []) as Array<Record<string, unknown>>;

        // 3) Нормализация и сортировка
        const hist: HistoryRow[] = (rows ?? [])
          .map((r) => ({
            ...r, // Сохраняем все оригинальные поля (has_conclusion, diagnosis_code и т.д.)
            ID: String(
              (r["id"] ??
                r["ID"] ??
                r["Прием ID"] ??
                r["Appointment ID"] ??
                r["Appointment_Id"] ??
                r["Запись ID"] ??
                r["Запись"] ??
                "") as string | number
            ),
            "Дата и время": (() => {
              const raw = String(r["formatted_date"] ?? r["Дата и время"] ?? r["appointment_at"] ?? "");
              return raw ? formatDateBishkek(raw) : raw;
            })(),
            "Дата n8n": (r["Дата n8n"] as string) ?? undefined,
            "Доктор ФИО":
              (r["doctor_name"] as string) ??
              (r["Доктор ФИО"] as string) ??
              (r["Доктор"] as string) ??
              undefined,
            "Пациент ФИО":
              (r["patient_name"] as string) ??
              (normalizeFio(r) || undefined),
            Услуга:
              (r["service_names"] as string) ??
              (r["Название услуги"] as string) ??
              (r["Услуга"] as string) ??
              undefined,
            "Услуга ID": (r["Услуга ID"] as string) ?? undefined,
            Статус:
              (r["status"] as string) ??
              (r["Статус"] as string) ??
              undefined,
            Стоимость:
              r["total_amount"] != null ? Number(r["total_amount"]) :
              r["total_cost"] != null ? Number(r["total_cost"]) :
              r["Стоимость"] != null ? Number(r["Стоимость"]) :
              undefined,
            "Итого, сом":
              r["total_amount"] != null ? Number(r["total_amount"]) :
              r["total_cost"] != null ? Number(r["total_cost"]) :
              r["Итого, сом"] != null ? Number(r["Итого, сом"]) :
              undefined,
            "Жалобы при обращении":
              (r["complaints"] as string) ??
              (r["Жалобы при обращении"] as string) ??
              undefined,
            "Жалобы (врач)":
              (r["doctor_complaints"] as string) ??
              (r["Жалобы (врач)"] as string) ??
              undefined,
            "Комментарий администратора":
              (r["admin_comment"] as string) ??
              (r["Комментарий администратора"] as string) ??
              undefined,
            appointment_type:
              ((r["appointment_type"] as string) === 'procedure' ? 'procedure' : 'doctor') as 'doctor' | 'procedure',
          }))
          .filter((r) => r["Дата и время"])
          .sort((a, b) => {
            const ax = a["Дата и время"];
            const bx = b["Дата и время"];
            return ax < bx ? 1 : ax > bx ? -1 : 0;
          });

        setHistory(hist);

        // 4) Кэширование
        try {
          const payload: HistoryCache = { ts: Date.now(), items: hist };
          localStorage.setItem(HISTORY_CACHE_PREFIX + selected.id, JSON.stringify(payload));
        } catch {
          // ignore
        }
      } catch (e) {
        if (isAbortError(e)) return;
        console.error(e);
        const errObj = (typeof e === "object" && e !== null ? e : {}) as {
          message?: string;
          error_description?: string;
          hint?: string;
          details?: string;
          code?: string;
        };
        const msg =
          errObj.message ??
          errObj.error_description ??
          errObj.hint ??
          errObj.details ??
          (typeof e === "object" ? JSON.stringify(e) : String(e));
        setErrorMsg(msg);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();

    return () => {
      if (ctrlRef.current === ctrl) ctrlRef.current.abort();
    };
  }, [selected, tick]);

  // REALTIME: Подписка на изменения приемов выбранного пациента
  React.useEffect(() => {
    if (!selected) return;

    const channel = supabase
      .channel(`patient-history-${selected.id}`)
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: "Appointments", 
          filter: `patient_id=eq.${selected.id}` 
        },
        () => {
          console.log("Realtime: Patient appointments changed, reloading history...");
          reload();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selected, reload]);

  return {
    history,
    loading,
    errorMsg,
    invalidate,
    reload,
  };
}
