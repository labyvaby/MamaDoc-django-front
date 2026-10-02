/**
 * Валюты объекта (контракт — docs/hotel-backend-requests-2026-10-02.md §5):
 * курсы к базовой валюте и «режим валют» — в какой валюте сотрудник хочет
 * видеть суммы рядом с основными (пересчёт — только показ, деньги в базе
 * не меняются). Пока бэкенд отвечает 404, available: false — выбор валюты
 * в оплате и пересчёт не показываются.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";

import { ApiError } from "../api/client";
import { getExchangeRates, type HotelExchangeRate } from "../api/hotel";

const isEndpointMissing = (err: unknown) => err instanceof ApiError && (err.status === 404 || err.status === 405);

export interface ExchangeRatesState {
  available: boolean;
  baseCurrency: string;
  rates: HotelExchangeRate[];
}

/** Валюты, которые чаще всего приносят гости в Кыргызстане. */
export const COMMON_CURRENCIES = ["USD", "EUR", "RUB", "KZT", "CNY", "UZS"];

export const CURRENCY_NAMES: Record<string, string> = {
  KGS: "Сом",
  USD: "Доллар США",
  EUR: "Евро",
  RUB: "Российский рубль",
  KZT: "Казахстанский тенге",
  CNY: "Китайский юань",
  UZS: "Узбекский сум",
};

export function useExchangeRates(propertyId: number | null | undefined, baseCurrency = "KGS") {
  return useQuery<ExchangeRatesState>({
    queryKey: ["hotel", "exchangeRates", propertyId],
    queryFn: async ({ signal }) => {
      try {
        const res = await getExchangeRates(propertyId!, signal);
        return { available: true, baseCurrency: res.baseCurrency || baseCurrency, rates: res.rates.filter((r) => Number(r.rate) > 0) };
      } catch (err) {
        if (!isEndpointMissing(err)) throw err;
        return { available: false, baseCurrency, rates: [] };
      }
    },
    enabled: propertyId != null,
    staleTime: 5 * 60_000,
    retry: (count, err) => !isEndpointMissing(err) && count < 1,
  });
}

export const rateOf = (state: ExchangeRatesState | undefined, currency: string): number | null => {
  if (!state || currency === state.baseCurrency) return 1;
  const r = state.rates.find((x) => x.currency === currency);
  return r ? Number(r.rate) : null;
};

// ── «Режим валют»: в какой валюте показывать суммы рядом с основными ─────────

const KEY = "mamadoc:hotel-display-currency";
const listeners = new Set<() => void>();

function readDisplayCurrency(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

let current = typeof window === "undefined" ? "" : readDisplayCurrency();

export function setDisplayCurrency(code: string) {
  current = code;
  try {
    if (code) window.localStorage.setItem(KEY, code);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* не запомнится между сеансами — не страшно */
  }
  listeners.forEach((l) => l());
}

/** "" — показывать только базовую валюту. */
export function useDisplayCurrency(): [string, (code: string) => void] {
  const value = React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => "",
  );
  return [value, setDisplayCurrency];
}
