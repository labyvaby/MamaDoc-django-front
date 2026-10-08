import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * Задачи CRM застройщика (AIVIO) — экран «Мой день» и виджет на рабочем столе.
 * Это `realty`-задачи (`/api/v2/realty/tasks/`): звонки, встречи, показы,
 * дела по лидам. Не путать с внутренними заявками MamaDoc `/api/tasks/`.
 *
 * Контракт — гайд бэка `frontend-dashboard-analytics.md` §4 и
 * `frontend-sales.md` §5 (показы — задачи `kind=show`); форма ответа сверена с
 * test2 06.10.2026.
 * - без даты бэк отдаёт сегодня; `overdue` бэк считает сам по дате и времени;
 * - смотреть — `realty.view`, менять — `realty.manage`;
 * - филиал режет бэк по сессии: задача чужого филиала → 404.
 */

const TASKS_API = "/v2/realty/tasks";

export const REALTY_TASK_KINDS = ["call", "meeting", "show", "task"] as const;
export type RealtyTaskKind = (typeof REALTY_TASK_KINDS)[number];

export interface RealtyTaskItem {
  id: number;
  kind: RealtyTaskKind | string;
  date: string;
  /** «HH:MM»; пустая строка — без времени. */
  time: string;
  text: string;
  meta: string;
  done: boolean;
  doneAt: string | null;
  /** У показов: planned / confirmed / online. */
  status: string;
  statusLabel: string;
  overdue: boolean;
  leadId: number | null;
  leadClient: string | null;
  unitId: number | null;
  unitNumber: number | null;
  managerId: number | null;
  manager: string | null;
}

export interface RealtyTaskParams {
  /** YYYY-MM-DD; без даты — сегодня. */
  date?: string;
  kind?: RealtyTaskKind | null;
  managerId?: number | null;
}

export interface RealtyTaskInput {
  text: string;
  date: string;
  time: string;
  meta?: string;
  kind: RealtyTaskKind;
  managerId?: number | null;
  /** Задача по заявке («⌖ Показ» из карточки лида). */
  leadId?: number | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const fromRaw = (raw: any): RealtyTaskItem => ({
  id: raw.id,
  kind: raw.kind ?? "task",
  date: raw.date,
  time: raw.time ?? "",
  text: raw.text ?? "",
  meta: raw.meta ?? "",
  done: Boolean(raw.done),
  doneAt: raw.doneAt ?? null,
  status: raw.status ?? "",
  statusLabel: raw.statusLabel ?? "",
  overdue: Boolean(raw.overdue),
  leadId: raw.leadId ?? null,
  leadClient: raw.leadClient ?? null,
  unitId: raw.unitId ?? null,
  unitNumber: raw.unitNumber ?? null,
  managerId: raw.managerId ?? null,
  manager: raw.manager ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getRealtyTasks(params: RealtyTaskParams, scope?: RealtyScope, signal?: AbortSignal): Promise<RealtyTaskItem[]> {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.kind) query.set("kind", params.kind);
  if (params.managerId != null) query.set("managerId", String(params.managerId));
  const qs = query.toString();
  const raw = await apiRequest<unknown[]>(`${TASKS_API}/${qs ? `?${qs}` : ""}`, { headers: realtyHeaders(scope), signal });
  return (raw ?? []).map(fromRaw);
}

export async function createRealtyTask(input: RealtyTaskInput, scope?: RealtyScope): Promise<RealtyTaskItem> {
  const body: Record<string, unknown> = { text: input.text, date: input.date, time: input.time, kind: input.kind };
  if (input.meta?.trim()) body.meta = input.meta.trim();
  if (input.managerId != null) body.managerId = input.managerId;
  if (input.leadId != null) body.leadId = input.leadId;
  return fromRaw(await apiRequest(`${TASKS_API}/`, { method: "POST", body, headers: realtyHeaders(scope) }));
}

/**
 * Галочка, перенос (`date`/`time`), делегирование (`managerId`), статус показа
 * (`status`). Бэк сам ставит/снимает `doneAt`.
 */
export async function updateRealtyTask(
  id: number,
  patch: Partial<Pick<RealtyTaskItem, "done" | "date" | "time" | "managerId">> & { status?: ShowStatus },
  scope?: RealtyScope,
): Promise<RealtyTaskItem> {
  return fromRaw(await apiRequest(`${TASKS_API}/${id}/`, { method: "PATCH", body: patch, headers: realtyHeaders(scope) }));
}

export async function deleteRealtyTask(id: number, scope?: RealtyScope): Promise<void> {
  await apiRequest(`${TASKS_API}/${id}/`, { method: "DELETE", headers: realtyHeaders(scope) });
}

/** KPI «Мой день» — считаются на клиенте из списка (гайд §4). */
export function realtyTaskStats(tasks: readonly RealtyTaskItem[]) {
  return {
    total: tasks.length,
    done: tasks.filter((t) => t.done).length,
    // «Показов и встреч» — по `kind`, не по словам в тексте, как в макете.
    visits: tasks.filter((t) => !t.done && (t.kind === "show" || t.kind === "meeting")).length,
    overdue: tasks.filter((t) => t.overdue && !t.done).length,
  };
}

/** Статусы показа (`kind=show`, гайд `frontend-sales.md` §5); подпись — `statusLabel` бэка. */
export const SHOW_STATUSES = ["planned", "confirmed", "online"] as const;
export type ShowStatus = (typeof SHOW_STATUSES)[number];

export interface ShowsSummary {
  date: string;
  today: number;
  todayDone: number;
  /** Показы текущей недели (пн–вс). */
  week: number;
  weekFrom: string;
  weekTo: string;
  /** «Перешли к выбору», % — лиды с показом за 30 дней, дошедшие до «Выбора квартиры». */
  toChoicePct: number;
  /** «Конверсия в бронь», % — дошедшие до «Бронирования». */
  toBookingPct: number;
}

/** KPI экрана «Показы» за день `date` (без даты — сегодня). */
export async function getShowsSummary(date: string | null, scope?: RealtyScope, signal?: AbortSignal): Promise<ShowsSummary> {
  const raw = await apiRequest<Partial<ShowsSummary>>(`/v2/realty/shows/summary/${date ? `?date=${date}` : ""}`, { headers: realtyHeaders(scope), signal });
  return {
    date: raw.date ?? date ?? "",
    today: Number(raw.today) || 0,
    todayDone: Number(raw.todayDone) || 0,
    week: Number(raw.week) || 0,
    weekFrom: raw.weekFrom ?? "",
    weekTo: raw.weekTo ?? "",
    toChoicePct: Number(raw.toChoicePct) || 0,
    toBookingPct: Number(raw.toBookingPct) || 0,
  };
}

/**
 * «Фокус дня» — правая панель «Моего дня» (`frontend-new-modules.md` §5, 07.10):
 * `GET /api/v2/realty/tasks/focus/` (право `realty.view`). Без `scope` бэк сам
 * решает: менеджеру — свои, руководителю — по команде. `canAct: false` —
 * подсказки без кнопок действий. Пустой `items` — «Всё под контролем».
 */
export type FocusScope = "mine" | "team";

export interface FocusItem {
  /** new-lead / overdue-tasks / reservation-expiring / shows-today / billing-overdue / alternatives / no-next-step. */
  code: string;
  /** red / amber / blue / violet. */
  tone: string;
  /** Глиф бэка («⚠», «⚡») — запасной, если коду нет своей иконки. */
  icon: string;
  title: string;
  text: string;
  count: number;
  /** Экран подсказки: leads / today / booking / billing / showings… */
  view: string;
  leadId: number | null;
  taskId: number | null;
  reservationId: number | null;
  billingAccountId: number | null;
  amount: number | null;
}

export interface TaskFocus {
  scope: FocusScope | string;
  canAct: boolean;
  items: FocusItem[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const idOrNull = (value: unknown) => (value == null || value === "" ? null : Number(value) || null);

export function fromRawFocus(raw: any): TaskFocus {
  const items: any[] = Array.isArray(raw?.items) ? raw.items.filter((item: unknown) => item && typeof item === "object") : [];
  return {
    scope: raw?.scope ?? "",
    canAct: Boolean(raw?.canAct),
    items: items.map((item) => ({
      code: item.code ?? "",
      tone: item.tone ?? "",
      icon: item.icon ?? "",
      title: item.title ?? "",
      text: item.text ?? "",
      count: Number(item.count) || 0,
      view: item.view ?? "",
      leadId: idOrNull(item.leadId),
      taskId: idOrNull(item.taskId),
      reservationId: idOrNull(item.reservationId),
      billingAccountId: idOrNull(item.billingAccountId),
      amount: item.amount == null || item.amount === "" ? null : Number(item.amount),
    })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getTaskFocus(params: { scope?: FocusScope | null; managerId?: number | null }, scope?: RealtyScope, signal?: AbortSignal): Promise<TaskFocus> {
  const query = new URLSearchParams();
  if (params.scope) query.set("scope", params.scope);
  if (params.managerId != null) query.set("managerId", String(params.managerId));
  const qs = query.toString();
  return fromRawFocus(await apiRequest(`${TASKS_API}/focus/${qs ? `?${qs}` : ""}`, { headers: realtyHeaders(scope), signal }));
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const realtyTaskKeys = {
  all: ["django", "realty-tasks"] as const,
  list: (scope: RealtyScope | undefined, params: RealtyTaskParams) => [...realtyTaskKeys.all, ...scopeKey(scope), params] as const,
  showsSummary: (scope: RealtyScope | undefined, date: string) => [...realtyTaskKeys.all, ...scopeKey(scope), "shows-summary", date] as const,
  focus: (scope: RealtyScope | undefined, focusScope: FocusScope | null) => [...realtyTaskKeys.all, ...scopeKey(scope), "focus", focusScope] as const,
};
