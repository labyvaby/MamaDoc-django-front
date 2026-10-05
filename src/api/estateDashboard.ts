import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * «Рабочий стол» застройщика (AIVIO): KPI-ряд и виджеты под роль.
 *
 * Контракт — гайд бэка `frontend-dashboard-analytics.md` (05.10.2026) и
 * `docs/aivio-api/dashboard.md` бэка; формы ответов сверены с test2 06.10.2026.
 * - `GET /api/v2/estate-dashboard/summary/` — весь экран: раскладка роли
 *   (`layout` — ряды по 1–2 панели), KPI и панели. Панель без права приходит
 *   `null`, её имя — в `denied`, и в `layout` её уже нет. Панель вне раскладки
 *   роли — тоже `null` (но не в `denied`);
 * - право экрана — `estate_dashboard.view`, панели — права своих модулей;
 * - организация — заголовком `X-Organization-Id`, филиал режет бэк по сессии;
 * - деньги — строки-decimal, здесь → числа;
 * - задачи «Мой день» — задачи CRM застройщика `/api/v2/realty/tasks/`,
 *   не внутренние заявки MamaDoc `/api/tasks/`.
 */

const DASHBOARD_API = "/v2/estate-dashboard";
const TASKS_API = "/v2/realty/tasks";

type Decimal = string;
const money = (value: Decimal | number | null | undefined) => Number(value ?? 0) || 0;

/** Роли прототипа, под которые у бэка есть раскладка (`?role=` — только их). */
export const ESTATE_ROLES = ["ceo", "sales", "cfo", "accountant", "build", "foreman", "hr", "lawyer"] as const;
export type EstateRole = (typeof ESTATE_ROLES)[number];

export type PanelName =
  | "health"
  | "approvals"
  | "cash"
  | "sales"
  | "tasks"
  | "billing"
  | "construction"
  | "procurement"
  | "quality"
  | "hr"
  | "audit"
  | "integrations"
  | "handover";

/** Тон строки/плашки от бэка: `red` — плохо, `amber` — внимание, `green` — норма. */
export type Tone = "red" | "amber" | "green" | "blue" | "gray" | string;

// ─── Модель ────────────────────────────────────────────────────────────────

export interface DashboardKpis {
  deals: { value: number; newThisWeek: number } | null;
  freeUnits: { value: number; total: number } | null;
  cash: { liquid: number; escrow: number; accountsCount: number; revenueMonth: number } | null;
  approvals: { review: number; signing: number; overdue: number } | null;
  tasksToday: { open: number; done: number } | null;
}

export interface HealthPanel {
  constructionAvailable: boolean;
  budgetAvailable: boolean;
  projects: {
    projectId: number;
    projectName: string;
    color: string;
    deadlineLabel: string;
    total: number;
    sold: number;
    reserved: number;
    free: number;
    salesPct: number;
    progress: number;
    delay: number;
    tone: Tone;
    statusLabel: string;
    spent: number;
    planned: number;
    budgetPct: number;
  }[];
}

export interface ApprovalsPanel {
  total: number;
  mineCount: number;
  /** `mine` — в списке документы, ждущие именно меня; иначе — все на согласовании. */
  mode: string;
  items: {
    id: number;
    number: string;
    title: string;
    typeName: string;
    counterparty: string;
    amount: number;
    stepName: string;
    deadline: string | null;
    daysLeft: number | null;
    deadlineLabel: string;
    deadlineTone: Tone;
  }[];
}

export interface CashPanel {
  total: number;
  liquid: number;
  escrow: number;
  accountsCount: number;
  accounts: { id: number; name: string; kind: string; currency: string; balance: number; balanceNative: number }[];
  forecast: { date: string; balance: number }[];
  hasGap: boolean;
  gapDate: string | null;
  gapBalance: number;
  minBalance: number;
}

export interface SalesPanel {
  leads: number;
  amount: number;
  hot: number;
  stages: { stage: string; name: string; value: number; amount: number }[];
}

export interface RealtyTask {
  id: number;
  kind: "task" | "call" | "meeting" | "show" | string;
  text: string;
  meta: string;
  date: string;
  time: string;
  overdue: boolean;
  done?: boolean;
  leadId: number | null;
}

export interface TasksPanel {
  open: number;
  done: number;
  items: RealtyTask[];
}

export interface BillingPanel {
  overdueCount: number;
  overdueSum: number;
  items: { id: number; buyer: string; projectId: number; projectName: string; unitNumber: number; contract: string; overdue: number }[];
}

export interface ConstructionPanel {
  hasPlans: boolean;
  lateCount: number;
  items: { id: number; name: string; projectName: string; projectColor: string; contractorName: string | null; delayDays: number; tone: Tone }[];
}

export interface ProcurementPanel {
  openCount: number;
  lowStockCount: number;
  items: { id: number; number: string; title: string; projectName: string; projectColor: string; needBy: string | null; statusLabel: string; tone: Tone }[];
  lowStock: { id: number; name: string; unit: string; qty: number; min: number }[];
}

export interface QualityPanel {
  openCount: number;
  criticalCount: number;
  overdueCount: number;
  items: { id: number; title: string; projectName: string; section: string; floor: number | null; deadline: string | null; severityLabel: string; tone: Tone }[];
}

export interface HrPanel {
  employees: number;
  departments: number;
  timesheetFilledPct: number;
  timesheetClosed: boolean;
  payrollLabel: string;
  probation: number;
  absentToday: number;
  /** Вакансий в бэке нет — `null`, строку не показываем. */
  vacancies: number | null;
}

export interface AuditPanel {
  todayCount: number;
  items: { id: number; ts: string; user: string; role: string; action: string; target: string }[];
}

export interface IntegrationsPanel {
  pending: number;
  errors: number;
  connectors: { id: number; code: string; name: string; status: string; lastSync: string | null }[];
}

export interface HandoverPanel {
  activeCount: number;
  items: { id: number; number: string; buyer: string; projectName: string; unitNumber: number; date: string; time: string; statusLabel: string; tone: Tone }[];
}

export interface DashboardPanels {
  health: HealthPanel | null;
  approvals: ApprovalsPanel | null;
  cash: CashPanel | null;
  sales: SalesPanel | null;
  tasks: TasksPanel | null;
  billing: BillingPanel | null;
  construction: ConstructionPanel | null;
  procurement: ProcurementPanel | null;
  quality: QualityPanel | null;
  hr: HrPanel | null;
  audit: AuditPanel | null;
  integrations: IntegrationsPanel | null;
  handover: HandoverPanel | null;
}

export interface EstateDashboard {
  date: string;
  role: string;
  user: { name: string; firstName: string; position: string };
  /** Ряды виджетов: уже без запрещённых панелей и пустых рядов. */
  layout: PanelName[][];
  denied: string[];
  kpis: DashboardKpis;
  panels: DashboardPanels;
}

export interface EstateAlert {
  kind: string;
  tone: Tone;
  icon: string;
  title: string;
  sub: string;
  /** Экран прототипа (`edo`, `billing`, …) — куда ведёт пункт. */
  view: string;
  objectId: number | null;
}

// ─── Сырой ответ → модель ─────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
function fromRawPanels(raw: Record<string, any>): DashboardPanels {
  const p = raw ?? {};
  return {
    health: p.health
      ? { ...p.health, projects: (p.health.projects ?? []).map((x: any) => ({ ...x, spent: money(x.spent), planned: money(x.planned) })) }
      : null,
    approvals: p.approvals ? { ...p.approvals, items: (p.approvals.items ?? []).map((x: any) => ({ ...x, amount: money(x.amount) })) } : null,
    cash: p.cash
      ? {
          ...p.cash,
          total: money(p.cash.total),
          liquid: money(p.cash.liquid),
          escrow: money(p.cash.escrow),
          gapBalance: money(p.cash.gapBalance),
          minBalance: money(p.cash.minBalance),
          accounts: (p.cash.accounts ?? []).map((x: any) => ({ ...x, balance: money(x.balance), balanceNative: money(x.balanceNative) })),
          forecast: (p.cash.forecast ?? []).map((x: any) => ({ date: x.date, balance: money(x.balance) })),
        }
      : null,
    sales: p.sales
      ? { ...p.sales, amount: money(p.sales.amount), stages: (p.sales.stages ?? []).map((x: any) => ({ ...x, amount: money(x.amount) })) }
      : null,
    tasks: p.tasks ? { ...p.tasks, items: p.tasks.items ?? [] } : null,
    billing: p.billing
      ? { ...p.billing, overdueSum: money(p.billing.overdueSum), items: (p.billing.items ?? []).map((x: any) => ({ ...x, overdue: money(x.overdue) })) }
      : null,
    construction: p.construction ? { ...p.construction, items: p.construction.items ?? [] } : null,
    procurement: p.procurement ? { ...p.procurement, items: p.procurement.items ?? [], lowStock: p.procurement.lowStock ?? [] } : null,
    quality: p.quality ? { ...p.quality, items: p.quality.items ?? [] } : null,
    hr: p.hr ?? null,
    audit: p.audit ? { ...p.audit, items: p.audit.items ?? [] } : null,
    integrations: p.integrations ? { ...p.integrations, connectors: p.integrations.connectors ?? [] } : null,
    handover: p.handover ? { ...p.handover, items: p.handover.items ?? [] } : null,
  };
}

export function fromRawDashboard(raw: Record<string, any>): EstateDashboard {
  const k = raw.kpis ?? {};
  return {
    date: raw.date,
    role: raw.role,
    user: raw.user ?? { name: "", firstName: "", position: "" },
    layout: (raw.layout ?? []) as PanelName[][],
    denied: raw.denied ?? [],
    kpis: {
      deals: k.deals ?? null,
      freeUnits: k.freeUnits ?? null,
      cash: k.cash
        ? { liquid: money(k.cash.liquid), escrow: money(k.cash.escrow), accountsCount: k.cash.accountsCount ?? 0, revenueMonth: money(k.cash.revenueMonth) }
        : null,
      approvals: k.approvals ?? null,
      tasksToday: k.tasksToday ?? null,
    },
    panels: fromRawPanels(raw.panels),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── API ───────────────────────────────────────────────────────────────────

/**
 * Весь экран. `role` — предпросмотр раскладки другой роли («Сменить роль»):
 * данные и права остаются своими, меняется только набор и порядок панелей.
 */
export async function getEstateDashboard(role: EstateRole | null, scope?: RealtyScope, signal?: AbortSignal): Promise<EstateDashboard> {
  const query = role ? `?role=${role}` : "";
  const raw = await apiRequest<Record<string, unknown>>(`${DASHBOARD_API}/summary/${query}`, { headers: realtyHeaders(scope), signal });
  return fromRawDashboard(raw);
}

export async function getEstateAlerts(scope?: RealtyScope, signal?: AbortSignal): Promise<{ count: number; items: EstateAlert[] }> {
  const raw = await apiRequest<{ count?: number; items?: EstateAlert[] }>(`${DASHBOARD_API}/alerts/`, { headers: realtyHeaders(scope), signal });
  const items = raw.items ?? [];
  return { count: raw.count ?? items.length, items };
}

/** Галочка «Мой день»: бэк сам ставит/снимает `doneAt`. Только `realty.manage`. */
export async function setRealtyTaskDone(id: number, done: boolean, scope?: RealtyScope): Promise<void> {
  await apiRequest(`${TASKS_API}/${id}/`, { method: "PATCH", body: { done }, headers: realtyHeaders(scope) });
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const estateDashboardKeys = {
  all: ["django", "estate-dashboard"] as const,
  summary: (scope: RealtyScope | undefined, role: EstateRole | null) =>
    [...estateDashboardKeys.all, ...scopeKey(scope), "summary", role ?? "own"] as const,
  alerts: (scope: RealtyScope | undefined) => [...estateDashboardKeys.all, ...scopeKey(scope), "alerts"] as const,
};
