import { apiRequest } from "./client";

// ── Types (frontend-ai-usage.md §3, server/apps/medical/ai_usage.py) ──────────
//
// Отчёт о расходе токенов ИИ-подсказок в заключениях. Только суперадмину:
// остальным бэк отвечает 403 FORBIDDEN. Учёт ведётся с 05.10.2026.

/** Счётчики, общие для итога и всех разрезов. */
export interface AiUsageCounters {
  requests: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  /** «Размышления» модели (у Gemini) — тоже оплачиваются, входят в totalTokens. */
  thinkingTokens: number;
  /** Неуспешные обращения: ошибка модели, обрыв или отмена потока (токены 0). */
  errors: number;
}

export interface AiUsageByOrganization extends AiUsageCounters {
  organizationId: number;
  organizationName: string;
  /** Разные сотрудники с карточкой; суперпользователь без карточки не считается. */
  employees: number;
  lastUsedAt: string | null;
}

export interface AiUsageByBranch extends AiUsageByOrganization {
  /** null — обращения без филиала (одна строка на организацию). */
  branchId: number | null;
  branchName: string;
}

export interface AiUsageByEmployee extends AiUsageCounters {
  /** null / "" — у пользователя нет карточки сотрудника в организации. */
  employeeId: number | null;
  employeeName: string;
  userId: number;
  username: string;
  organizationId: number;
  organizationName: string;
  /** Основной филиал за период (где больше обращений); null — чаще без филиала. */
  branchId: number | null;
  branchName: string;
  lastUsedAt: string | null;
}

export interface AiUsageByDay {
  date: string; // YYYY-MM-DD, дни без обращений бэк не отдаёт
  requests: number;
  totalTokens: number;
}

export interface AiUsageByModel extends AiUsageCounters {
  provider: string;
  model: string;
}

export interface AiUsageReport {
  period: {
    from: string;
    to: string;
    organizationId: number | null;
    branchId: number | null;
  };
  totals: AiUsageCounters;
  byOrganization: AiUsageByOrganization[];
  byBranch: AiUsageByBranch[];
  byEmployee: AiUsageByEmployee[];
  byDay: AiUsageByDay[];
  byModel: AiUsageByModel[];
}

export interface AiUsageParams {
  from?: string; // YYYY-MM-DD, включительно
  to?: string; // YYYY-MM-DD, включительно
  organizationId?: number;
  branchId?: number;
}

// ── API ────────────────────────────────────────────────────────────────────────

/** GET /api/medical/ai/usage/ — без organizationId отчёт по всем организациям. */
export function getAiUsageReport(
  params: AiUsageParams = {},
  signal?: AbortSignal,
): Promise<AiUsageReport> {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  const qs = q.toString();
  return apiRequest<AiUsageReport>(`/medical/ai/usage/${qs ? `?${qs}` : ""}`, { signal });
}
