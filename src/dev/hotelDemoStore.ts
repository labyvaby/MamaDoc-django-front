/**
 * Демо-хранилище для функций, которых ещё нет на бэкенде (курсы валют, своя
 * цена ночей, реквизиты, текст согласия на обработку данных): по просьбе
 * заказчика всё должно работать на показе уже сейчас, а данные — пока на
 * этом устройстве (localStorage). Как только бэкенд начнёт отвечать
 * (контракт — docs/hotel-backend-tasks.md), фронт сам переходит на сервер,
 * а это хранилище перестаёт использоваться.
 *
 * Хранилище — только для демо: деньги и брони всегда идут через API.
 */
import React from "react";

const EVENT = "mamadoc:hotel-demo-change";

export const DEMO_KEYS = {
  rates: (propertyId: number) => `mamadoc:hotel-demo:rates:${propertyId}`,
  requisites: (propertyId: number) => `mamadoc:hotel-demo:requisites:${propertyId}`,
  prices: "mamadoc:hotel-demo:prices",
  consent: (propertyId: number) => `mamadoc:hotel-demo:consent:${propertyId}`,
} as const;

export function readDemo<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeDemo(key: string, value: unknown): void {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // приватный режим — демо проживёт до перезагрузки вкладки
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

/** Значение демо-хранилища с подпиской: правка в одном месте сразу видна в другом. */
export function useDemoValue<T>(key: string | null, fallback: T): T {
  const [value, setValue] = React.useState<T>(() => (key ? readDemo(key, fallback) : fallback));
  React.useEffect(() => {
    if (!key) return;
    setValue(readDemo(key, fallback));
    const onChange = (e: Event) => {
      const changed = (e as CustomEvent<string>).detail;
      if (!changed || changed === key) setValue(readDemo(key, fallback));
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
    // fallback — значение по умолчанию, не зависимость
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

// ── Оплата в валюте в демо-режиме ───────────────────────────────────────────
//
// Пока бэкенд не принимает currency в оплате, оплата в валюте записывается в
// сомах по курсу, а исходная сумма — меткой в начале комментария:
// «[USD 50 × 87.45] …». По метке карточка брони и отчёт смены показывают
// «$50», а с обновлением бэкенда новые оплаты пойдут с полями currency/exchangeRate.

const TAG = /^\[([A-Z]{3}) ([\d.]+) × ([\d.]+)\]\s*/;

export const foreignPaymentNote = (currency: string, amount: number, rate: number, note: string) =>
  `[${currency} ${Number(amount.toFixed(2))} × ${Number(rate.toFixed(4))}] ${note}`.trim();

export function parseForeignPayment(note: string): { currency: string; amount: number; rate: number; rest: string } | null {
  const m = TAG.exec(note ?? "");
  if (!m) return null;
  return { currency: m[1], amount: Number(m[2]), rate: Number(m[3]), rest: note.slice(m[0].length) };
}
