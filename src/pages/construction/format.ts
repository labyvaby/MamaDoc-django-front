import type { Theme } from "@mui/material";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import { formatKGS } from "../../utility/format";

/**
 * Цвет раздела графика — из палитры темы, без хардкода: разделы стабильны
 * (`GET /stage-groups/`), незнакомый код — нейтральный серый.
 */
export function groupColor(theme: Theme, code: string): string {
  switch (code) {
    case "preparation":
      return theme.palette.grey[500];
    case "zero_cycle":
      return theme.palette.warning.dark;
    case "frame":
      return theme.palette.primary.main;
    case "envelope":
      return theme.palette.info.main;
    case "engineering":
      return theme.palette.secondary.main;
    case "finishing":
      return theme.palette.success.main;
    case "landscaping":
      return theme.palette.success.dark;
    case "handover":
      return theme.palette.primary.dark;
    default:
      return theme.palette.text.disabled;
  }
}

export type Tone = "error" | "warning" | "success" | "info" | "primary" | null;

export const stageTone = (status: string): Tone => (status === "late" ? "error" : status === "done" ? "success" : status === "active" ? "primary" : null);
export const actTone = (status: string): Tone => (status === "check" ? "warning" : status === "accepted" ? "info" : status === "paid" ? "success" : status === "rejected" ? "error" : null);
export const defectTone = (status: string): Tone => (status === "open" ? "error" : status === "fixing" ? "warning" : status === "verify" ? "info" : status === "closed" ? "success" : null);
export const severityTone = (severity: string): Tone => (severity === "critical" ? "error" : severity === "major" ? "warning" : null);
export const requestTone = (status: string): Tone =>
  status === "new" ? "warning" : status === "approved" ? "info" : status === "tender" || status === "ordered" ? "primary" : status === "delivered" ? "success" : status === "rejected" ? "error" : null;
export const orderTone = (status: string, overdue = false): Tone =>
  overdue ? "error" : status === "in_transit" ? "info" : status === "delivered" || status === "closed" ? "success" : status === "ordered" ? "primary" : null;
export const tenderTone = (status: string): Tone => (status === "open" || status === "collecting" ? "info" : status === "evaluation" ? "warning" : status === "awarded" || status === "closed" ? "success" : null);
export const inspectionTone = (result: string): Tone => (result === "ok" ? "success" : result === "warn" ? "warning" : result === "fail" ? "error" : null);

export const shortDate = (iso: string | null | undefined) => (iso ? dayjs(iso).format("DD.MM.YY") : "—");
export const fullDate = (iso: string | null | undefined) => (iso ? dayjs(iso).format("DD.MM.YYYY") : "—");
/** «янв 26» — подпись месяца на шкале Ганта. */
export const monthShort = (month: string) => dayjs(`${month}-01`).locale("ru").format("MMM YY").replace(".", "");

/** «12,5» → 12.5; пусто и мусор — null. */
export function parseNumber(value: string): number | null {
  const text = value.replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/** Сумма для тела запроса строкой-decimal; ноль, минус и мусор — null. */
export function positiveAmount(value: string): string | null {
  const number = parseNumber(value);
  return number != null && number > 0 ? String(number) : null;
}

export const isoDate = (value: dayjs.Dayjs | null) => (value && value.isValid() ? value.format("YYYY-MM-DD") : null);

type T = (key: string, opts?: Record<string, unknown>) => string;

/** «307,2 млн», «1,47 млрд», иначе полная сумма. */
export const compactSum = (value: number, t: T) =>
  Math.abs(value) >= 1_000_000_000
    ? t("common.billions", { value: (value / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) })
    : Math.abs(value) >= 1_000_000
      ? t("common.millions", { value: (value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) })
      : formatKGS(value);
