import type { Theme } from "@mui/material";

import { formatAcuity, type EyeStatus } from "./visionNorms";
import type { VisionSignal } from "./visionSignals";

/**
 * Общее для компонентов раздела «Зрение», что не является компонентом:
 * цвета статуса, раскладка в две колонки, тексты сигналов.
 */

export type ChipTone = "primary" | "success" | "warning" | "error";

/** Две колонки на широком экране; в теме `sm` = 360px, поэтому граница — `md`. */
export const pairGridSx = {
  display: "grid",
  gap: 1.5,
  alignItems: "start",
  gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
} as const;

export function toggleIn<T>(list: ReadonlyArray<T>, value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function statusColor(theme: Theme, status: EyeStatus): string {
  if (status === "ok") return theme.palette.success.main;
  if (status === "borderline") return theme.palette.warning.main;
  if (status === "low") return theme.palette.error.main;
  return theme.palette.grey[400];
}

const NBSP = String.fromCharCode(0xa0);
/** «0,75 D» с неразрывным пробелом: единица не отрывается от числа. */
const diopters = (value: number): string => `${value.toFixed(2).replace(".", ",")}${NBSP}D`;

export function signalText(signal: VisionSignal): { severity: "warning" | "error"; text: string } {
  if (signal.kind === "asymmetry") {
    return {
      severity: "warning",
      text: `Разница между глазами ${formatAcuity(signal.value)} — риск амблиопии, нужен офтальмолог`,
    };
  }
  if (signal.kind === "anisometropia") {
    return { severity: "warning", text: `Анизометропия: разница рефракции глаз ${diopters(signal.value)}` };
  }
  return { severity: "error", text: `Миопия прогрессирует: ${signal.eye} −${diopters(signal.value)} за год` };
}
