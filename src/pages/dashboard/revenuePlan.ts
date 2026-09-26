/**
 * План выручки на месяц — цель, от которой владелец считает день.
 *
 * Хранение — `themeConfig.dashboard.plans` организации: поле уже приходит в
 * `/auth/me/` и сохраняется PATCH-ем организации, тикет бэку не нужен (тот же
 * приём, что у терминологии и лендинга). ⚠ themeConfig общий с палитрой,
 * лендингом и терминами — патчить только поверх текущего значения
 * (`buildPlanThemeConfig`).
 *
 * План ведётся на скоуп: у организации целиком и у каждого филиала свой —
 * выручка на сводке считается по активному филиалу, и сравнивать её с планом
 * всей сети было бы бессмысленно.
 *
 * У скоупа есть план «по умолчанию» (на каждый месяц) и точечные планы на
 * конкретные месяцы — сезон, праздники. Точечный побеждает.
 */

export const DASHBOARD_CONFIG_KEY = "dashboard";

export interface ScopePlan {
  /** План на любой месяц, для которого не задан свой. */
  default?: number;
  /** YYYY-MM → план на этот месяц. */
  months?: Record<string, number>;
}

export type RevenuePlans = Record<string, ScopePlan>;

/** Ключ скоупа: филиал или организация целиком. */
export const planScopeKey = (branchId: number | null | undefined): string =>
  branchId != null ? `branch:${branchId}` : "org";

const isPositive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Читаем планы из themeConfig, отбрасывая мусор: конфиг правится руками и
 * другими экранами, поэтому доверять форме нельзя.
 */
export function readRevenuePlans(themeConfig: unknown): RevenuePlans {
  const dashboard = (themeConfig as Record<string, unknown> | null | undefined)?.[
    DASHBOARD_CONFIG_KEY
  ] as Record<string, unknown> | undefined;
  const raw = dashboard?.plans;
  if (!raw || typeof raw !== "object") return {};
  const out: RevenuePlans = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const plan: ScopePlan = {};
    if (isPositive(v.default)) plan.default = v.default;
    if (v.months && typeof v.months === "object") {
      const months: Record<string, number> = {};
      for (const [m, amount] of Object.entries(v.months as Record<string, unknown>)) {
        if (/^\d{4}-\d{2}$/.test(m) && isPositive(amount)) months[m] = amount;
      }
      if (Object.keys(months).length) plan.months = months;
    }
    if (plan.default != null || plan.months) out[key] = plan;
  }
  return out;
}

/** План скоупа на месяц: точечный, иначе «по умолчанию», иначе нет. */
export function resolvePlan(
  plans: RevenuePlans,
  scopeKey: string,
  month: string,
): { amount: number; source: "month" | "default" } | null {
  const plan = plans[scopeKey];
  if (!plan) return null;
  const monthly = plan.months?.[month];
  if (monthly != null) return { amount: monthly, source: "month" };
  if (plan.default != null) return { amount: plan.default, source: "default" };
  return null;
}

/**
 * Записать план скоупа. `amount = null` — снять план (на месяц или по
 * умолчанию). Пустые скоупы вычищаем, чтобы в конфиге не копился мусор.
 */
export function setPlan(
  plans: RevenuePlans,
  scopeKey: string,
  target: { month: string } | "default",
  amount: number | null,
): RevenuePlans {
  const current: ScopePlan = { ...plans[scopeKey], months: { ...plans[scopeKey]?.months } };
  if (target === "default") {
    if (amount != null && isPositive(amount)) current.default = amount;
    else delete current.default;
  } else if (amount != null && isPositive(amount)) {
    current.months![target.month] = amount;
  } else {
    delete current.months![target.month];
  }
  if (!Object.keys(current.months ?? {}).length) delete current.months;

  const next = { ...plans };
  if (current.default == null && !current.months) delete next[scopeKey];
  else next[scopeKey] = current;
  return next;
}

/** Патч themeConfig поверх текущего значения — палитру, лендинг и термины не трогаем. */
export function buildPlanThemeConfig(
  themeConfig: Record<string, unknown> | null | undefined,
  plans: RevenuePlans,
): Record<string, unknown> {
  const next = { ...(themeConfig ?? {}) };
  const dashboard = {
    ...((next[DASHBOARD_CONFIG_KEY] as Record<string, unknown> | undefined) ?? {}),
  };
  if (Object.keys(plans).length) dashboard.plans = plans;
  else delete dashboard.plans;
  if (Object.keys(dashboard).length) next[DASHBOARD_CONFIG_KEY] = dashboard;
  else delete next[DASHBOARD_CONFIG_KEY];
  return next;
}

export interface PlanProgress {
  plan: number;
  /** Доля выполнения 0..∞ (1 = план выполнен). */
  done: number;
  /** Сколько осталось набрать; 0 — план выполнен. */
  remaining: number;
  /** Сколько нужно в день, начиная с завтра, чтобы успеть. null — дней не осталось. */
  perDayNeeded: number | null;
  /** Оценка по темпу обгоняет план. */
  onTrack: boolean | null;
}

/**
 * Где мы относительно плана. «Нужно в день» считается по оставшимся дням
 * ПОСЛЕ сегодняшнего: сегодняшняя выручка ещё идёт и уже входит в «набрано».
 */
export function planProgress(
  plan: number,
  monthToDate: number,
  dayOfMonth: number,
  daysInMonth: number,
  pace: number | null,
): PlanProgress {
  const remaining = Math.max(0, plan - monthToDate);
  const daysLeft = daysInMonth - dayOfMonth;
  return {
    plan,
    done: plan > 0 ? monthToDate / plan : 0,
    remaining,
    perDayNeeded: remaining === 0 ? 0 : daysLeft > 0 ? remaining / daysLeft : null,
    onTrack: pace == null ? null : pace >= plan,
  };
}
