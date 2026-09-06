/**
 * Срез журнала реестров в query-параметрах: период, статус оплаты и ось цены.
 *
 * Почему URL, а не useState: журнал открывают, чтобы кому-то показать —
 * «вот все скидки за август» или «вот приёмы, где цену поднимали». Пока срез
 * жил в состоянии, ссылка вела на текущий месяц без фильтров, и собеседник
 * набирал условия заново. Плюс перезагрузка страницы больше не сбрасывает
 * отбор.
 *
 * Корзина пульса (выбранный день) осталась в состоянии компонента: это
 * мгновенный drill-down внутри уже открытого среза, а не то, чем делятся.
 *
 * Пишем через `replace` — клики по чипам не должны забивать историю браузера.
 */
import React from "react";
import { useSearchParams } from "react-router";
import dayjs from "dayjs";

import { MONEY_FLAG_OPTIONS, type AppointmentMoneyFlag } from "../listFilters";
import { PAYMENT_FILTERS, type PaymentFilter } from "./registryTypes";

const PARAM = {
  /** `2026-08` — месяц, `2026` — весь год. */
  period: "period",
  payment: "pay",
  money: "money",
} as const;

export interface RegistryPeriod {
  year: number;
  /** 0–11 или null — весь год. */
  month: number | null;
}

function parsePeriod(raw: string | null): RegistryPeriod {
  const fallback = { year: dayjs().year(), month: dayjs().month() };
  if (!raw) return fallback;

  const [yearRaw, monthRaw] = raw.split("-");
  const year = Number(yearRaw);
  // Границы года — защита от правки адреса руками: запрос за 200-й год ушёл бы
  // на бэк и вернул пустой месяц без объяснения.
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fallback;
  if (monthRaw === undefined) return { year, month: null };

  const month = Number(monthRaw);
  if (!Number.isInteger(month) || month < 1 || month > 12) return fallback;
  return { year, month: month - 1 };
}

const formatPeriod = (period: RegistryPeriod) =>
  period.month == null
    ? String(period.year)
    : `${period.year}-${String(period.month + 1).padStart(2, "0")}`;

/** Разбор csv-параметра с отбраковкой чужих значений (URL правят руками). */
function parseCsv<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (allowed as readonly string[]).includes(s));
}

export function useRegistryFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const period = React.useMemo(
    () => parsePeriod(searchParams.get(PARAM.period)),
    [searchParams],
  );
  const paymentFilter = React.useMemo<PaymentFilter>(() => {
    const raw = searchParams.get(PARAM.payment);
    return raw && (PAYMENT_FILTERS as string[]).includes(raw) ? (raw as PaymentFilter) : "all";
  }, [searchParams]);
  const moneyFlags = React.useMemo(
    () => parseCsv<AppointmentMoneyFlag>(searchParams.get(PARAM.money), MONEY_FLAG_OPTIONS),
    [searchParams],
  );

  /**
   * ⚠ Правка нескольких параметров — одним вызовом: react-router отдаёт двум
   * подряд идущим вызовам один и тот же `prev`, и второй перетирает первый.
   */
  const setParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev: URLSearchParams) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPeriod = React.useCallback(
    (next: RegistryPeriod | ((prev: RegistryPeriod) => RegistryPeriod)) => {
      const value = typeof next === "function" ? next(period) : next;
      setParams({ [PARAM.period]: formatPeriod(value) });
    },
    [period, setParams],
  );

  const setPaymentFilter = React.useCallback(
    (value: PaymentFilter) => setParams({ [PARAM.payment]: value === "all" ? null : value }),
    [setParams],
  );

  const toggleMoneyFlag = React.useCallback(
    (flag: AppointmentMoneyFlag) => {
      const next = moneyFlags.includes(flag)
        ? moneyFlags.filter((f) => f !== flag)
        : [...moneyFlags, flag];
      setParams({ [PARAM.money]: next.length ? next.join(",") : null });
    },
    [moneyFlags, setParams],
  );

  const resetFilters = React.useCallback(
    () => setParams({ [PARAM.payment]: null, [PARAM.money]: null }),
    [setParams],
  );

  return {
    period,
    setPeriod,
    paymentFilter,
    setPaymentFilter,
    moneyFlags,
    toggleMoneyFlag,
    resetFilters,
  };
}
