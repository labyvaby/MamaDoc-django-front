/**
 * Проверка номера перед выездом (задача руководителя #4130): ресепшен
 * отправляет номер на проверку горничной, она отмечает «Всё в порядке» или
 * пишет замечания, ресепшен видит результат в карточке брони и выселяет.
 *
 * Хранится в обычной задаче уборки kind = "inspection": текст заметки
 * начинается с CHECKOUT_INSPECTION_PREFIX и номера брони, результат
 * дописывается строкой «✓ …» / «⚠ …», а задача остаётся в работе до
 * выселения — так её видно в списке активных задач, который отдаёт бэкенд
 * (закрытые задачи без фильтра по датам он не отдаёт). При выселении
 * ресепшен закрывает задачу. Отдельную связь задачи с бронью попросили у
 * бэкенда — docs/hotel-backend-requests-2026-10-02.md.
 */
import dayjs from "dayjs";

import type { HotelHousekeepingTask } from "../api/hotel";

export const CHECKOUT_INSPECTION_PREFIX = "Проверка перед выездом";

export const buildInspectionNote = (reservationNumber: number, guest: string) =>
  `${CHECKOUT_INSPECTION_PREFIX} · бронь №${reservationNumber}${guest ? ` · ${guest}` : ""}`;

export const isCheckoutInspection = (t: Pick<HotelHousekeepingTask, "kind" | "note">) =>
  t.kind === "inspection" && t.note.startsWith(CHECKOUT_INSPECTION_PREFIX);

/** Задача относится к этой брони — по номеру брони в первой строке заметки. */
export const isInspectionFor = (t: Pick<HotelHousekeepingTask, "kind" | "note">, reservationNumber: number) =>
  isCheckoutInspection(t) && new RegExp(`бронь №${reservationNumber}(\\D|$)`).test(t.note.split("\n")[0]);

export interface InspectionResult {
  ok: boolean;
  text: string;
  /** «Мунара, 11:42 02.10» — кто и когда отметил. */
  signature: string;
}

const RESULT_RE = /^(✓|⚠) (.*?)(?: — ([^—]*))?$/;

/** Последний отмеченный результат проверки в заметке задачи, если он есть. */
export function parseInspectionResult(note: string): InspectionResult | null {
  const lines = note.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i > 0; i--) {
    const m = RESULT_RE.exec(lines[i]);
    if (!m) continue;
    const ok = m[1] === "✓";
    const body = m[2].trim();
    return { ok, text: ok ? "" : body.replace(/^Замечания:\s*/, ""), signature: (m[3] ?? "").trim() };
  }
  return null;
}

export function appendInspectionResult(note: string, ok: boolean, remarks: string, by: string, at: Date = new Date()): string {
  const sign = [by.trim(), dayjs(at).format("HH:mm DD.MM")].filter(Boolean).join(", ");
  const line = ok ? `✓ Всё в порядке — ${sign}` : `⚠ Замечания: ${remarks.trim().replace(/\s*\n\s*/g, "; ")} — ${sign}`;
  return `${note.trimEnd()}\n${line}`.slice(0, 2000);
}

export type InspectionState = "none" | "requested" | "checking" | "ok" | "issues";

export function inspectionState(task: HotelHousekeepingTask | undefined): InspectionState {
  if (!task) return "none";
  const result = parseInspectionResult(task.note);
  if (result) return result.ok ? "ok" : "issues";
  return task.status === "in_progress" ? "checking" : "requested";
}
