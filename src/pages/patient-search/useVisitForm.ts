/**
 * useVisitForm.ts
 * Хук управляет состояниями и сабмитом формы создания приема.
 * Отвечает за: хранение значений полей, валидацию, отправку в Supabase,
 * очистку полей и уведомление об успешном создании приема.
 * Не содержит UI. Контейнер-страница или диалог получают данные/колбэки из этого хука.
 */

import React from "react";
import dayjs from "dayjs";
import { supabase } from "../../utility/supabaseClient";
import type { Patient } from "../../types/models";

export type VisitFormState = {
  open: boolean;
  setOpen: (v: boolean) => void;

  dateTime: string;
  setDateTime: (v: string) => void;

  doctor: string;
  setDoctor: (v: string) => void;

  service: string;
  setService: (v: string) => void;

  price: number | "";
  setPrice: (v: number | "") => void;

  submitting: boolean;
  submit: () => Promise<void>;
  reset: () => void;
};

type Options = {
  /**
   * Колбэк вызывается после успешного создания приема.
   * Используйте его для инвалидации кэша истории и ее перезагрузки.
   */
  onSuccess?: () => void;
};

export function useVisitForm(selected: Patient | null, opts?: Options): VisitFormState {
  const [open, setOpen] = React.useState(false);
  const [dateTime, setDateTime] = React.useState("");
  const [doctor, setDoctor] = React.useState("");
  const [service, setService] = React.useState("");
  const [price, setPrice] = React.useState<number | "">("");

  const [submitting, setSubmitting] = React.useState(false);

  const reset = React.useCallback(() => {
    setDateTime("");
    setDoctor("");
    setService("");
    setPrice("");
  }, []);

  const submit = React.useCallback(async () => {
    try {
      if (!selected) return;
      if (!dateTime) return;

      setSubmitting(true);

      // Гарантируем ISO строку с часовым поясом, чтобы DB не интерпретировала как UTC
      const dtWithTz = dayjs(dateTime).format();

      const payloadCandidates: Array<Record<string, unknown>> = [
        {
          "Пациент ID": selected.id,
          "Дата и время": dtWithTz,
          Статус: "Ожидаем",
          "Доктор ФИО": doctor || null,
          "Услуга ID": service || null,
          Стоимость: price !== "" ? Number(price) : null,
        },
        {
          "Пациент ID": selected.id,
          Дата: dateTime.split("T")[0],
          Статус: "Ожидаем",
          Доктор: doctor || null,
          Услуга: service || null,
          Стоимость: price !== "" ? Number(price) : null,
        },
      ];

      let success = false;
      let lastErr: unknown = null;

      for (const tableName of ["Appointments", "appointments"]) {
        for (const payload of payloadCandidates) {
          const { error } = await supabase
            .schema("public")
            .from(tableName)
            .insert(payload as Record<string, unknown>);
          if (!error) {
            success = true;
            lastErr = null;
            break;
          }
          lastErr = error ?? lastErr;
        }
        if (success) break;
      }

      if (!success && lastErr) throw lastErr;

      // Закрываем диалог и очищаем поля
      setOpen(false);
      reset();

      // Сообщаем контейнеру для инвалидации кэша истории/перезагрузки
      opts?.onSuccess?.();
    } catch (e) {
       
      console.error(e);
      const msg =
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message?: unknown }).message)
          : typeof e === "object"
          ? JSON.stringify(e)
          : String(e);
      alert("Не удалось создать прием: " + msg);
    } finally {
      setSubmitting(false);
    }
  }, [selected, dateTime, doctor, service, price, reset, opts]);

  // Если выбранный пациент изменился — закрываем форму и чистим поля
  React.useEffect(() => {
    setOpen(false);
    reset();
  }, [selected, reset]);

  return {
    open,
    setOpen,
    dateTime,
    setDateTime,
    doctor,
    setDoctor,
    service,
    setService,
    price,
    setPrice,
    submitting,
    submit,
    reset,
  };
}
