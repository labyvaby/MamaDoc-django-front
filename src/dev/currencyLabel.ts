/**
 * Подпись валюты объекта для цен календаря: сом для KGS (как раньше), для
 * остальных валют — их код (USD, EUR…). Объект может быть в любой валюте,
 * например сертификационный объект Channex ведётся в USD.
 */
export const currencyLabel = (code?: string | null): string => {
  const value = (code ?? "").trim().toUpperCase();
  return value === "" || value === "KGS" ? "сом" : value;
};
