/**
 * useVisitEditForm.ts
 * Хук редактирования приема: управляет состояниями формы, предзаполняет значениями из HistoryRow,
 * отправляет обновление в Supabase, сообщает об успешном сохранении.
 */

import React from "react";
import dayjs from "dayjs";
import { supabase } from "../../utility/supabaseClient";
import type { HistoryRow } from "../../types/models";
import { roundDateTimeLocalToStep } from "../../utility/time";

export type VisitEditFormState = {
  open: boolean;
  setOpen: (v: boolean) => void;

  recordId: string | null;

  dateTime: string;
  setDateTime: (v: string) => void;

  doctor: string;
  setDoctor: (v: string) => void;

  service: string;
  setService: (v: string) => void;

  price: number | "";
  setPrice: (v: number | "") => void;

  submitting: boolean;
  startEdit: (row: HistoryRow) => void;
  submit: () => Promise<void>;
  reset: () => void;
};

type Options = {
  onSuccess?: () => void;
};

/**
 * Преобразует строку формата "dd.MM.yyyy HH:mm:ss" или "yyyy-MM-dd HH:mm:ss"
 * в значение для input type="datetime-local": "yyyy-MM-ddTHH:mm:ss"
 */
const toInputDateTime = (s: string): string => {
  if (!s) return "";
  const str = String(s).trim();
  // dd.MM.yyyy HH:mm:ss
  const m1 = str.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T])(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m1) {
    const dd = m1[1], mm = m1[2], yyyy = m1[3];
    const hh = m1[4], min = m1[5], ss = m1[6] ?? "00";
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
  }
  // yyyy-MM-dd HH:mm:ss
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T])(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m2) {
    const yyyy = m2[1], mm = m2[2], dd = m2[3];
    const hh = m2[4], min = m2[5], ss = m2[6] ?? "00";
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
  }
  // ISO "yyyy-MM-ddTHH:mm"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) return str;
  return str.replace(" ", "T");
};

export function useVisitEditForm(opts?: Options): VisitEditFormState {
  const [open, setOpen] = React.useState(false);
  const [recordId, setRecordId] = React.useState<string | null>(null);

  const [dateTime, setDateTime] = React.useState("");
  const [doctor, setDoctor] = React.useState("");
  const [service, setService] = React.useState("");
  const [price, setPrice] = React.useState<number | "">("");

  const [submitting, setSubmitting] = React.useState(false);

  const reset = React.useCallback(() => {
    setRecordId(null);
    setDateTime("");
    setDoctor("");
    setService("");
    setPrice("");
  }, []);

  const startEdit = React.useCallback((row: HistoryRow) => {
    try {
      setRecordId(String(row.ID));
      setDateTime(roundDateTimeLocalToStep(toInputDateTime(String(row["Дата и время"] || "")), 5));
      setDoctor(String(row["Доктор ФИО"] || ""));
      const svcId = row["Услуга ID"];
      const svcName = row["Услуга"];
      setService(String((svcId ?? svcName ?? "") || ""));
      const sum = typeof row["Итого, сом"] === "number" ? row["Итого, сом"] : row["Стоимость"];
      setPrice(typeof sum === "number" ? sum : "");
      setOpen(true);
    } catch {
      // fallback: просто открыть пустое
      setOpen(true);
    }
  }, []);

  const submit = React.useCallback(async () => {
    try {
      if (!recordId) return;
      if (!dateTime) return;

      setSubmitting(true);

      // Гарантируем ISO строку с часовым поясом, чтобы DB не интерпретировала как UTC
      const dbDateTime = dayjs(dateTime).format();

      // Набор вариантов payload для совместимости со схемой
      const payloads: Array<Record<string, unknown>> = [
        {
          "Дата и время": dbDateTime,
          "Доктор ФИО": doctor || null,
          "Услуга ID": service || null,
          "Итого, сом": price !== "" ? Number(price) : null,
        },
        {
          "Дата и время": dbDateTime,
          Доктор: doctor || null,
          Услуга: service || null,
          Стоимость: price !== "" ? Number(price) : null,
        },
      ];

      const tables = ["Appointments", "appointments"];
      const idKeys = ["ID", "id"];

      let success = false;
      let lastErr: unknown = null;

      for (const table of tables) {
        for (const idKey of idKeys) {
          for (const payload of payloads) {
            const { error } = await supabase
              .schema("public")
              .from(table)
              .update(payload)
              .eq(idKey, recordId)
              .select("*")
              .single();
            if (!error) {
              success = true;
              lastErr = null;
              break;
            }
            lastErr = error ?? lastErr;
          }
          if (success) break;
        }
        if (success) break;
      }

      if (!success && lastErr) throw lastErr;

      setOpen(false);
      reset();
      opts?.onSuccess?.();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg =
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message?: unknown }).message)
          : typeof e === "object"
          ? JSON.stringify(e)
          : String(e);
      alert("Не удалось сохранить изменения приема: " + msg);
    } finally {
      setSubmitting(false);
    }
  }, [recordId, dateTime, doctor, service, price, reset, opts]);

  return {
    open,
    setOpen,
    recordId,
    dateTime,
    setDateTime,
    doctor,
    setDoctor,
    service,
    setService,
    price,
    setPrice,
    submitting,
    startEdit,
    submit,
    reset,
  };
}
