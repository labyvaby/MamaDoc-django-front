import { apiRequest } from "./client";

/**
 * Справочник способов безналичной оплаты («Оплата картой», «Бакай»,
 * «Пост-терминал»…). Один список на организацию, используется в оплате приёма,
 * расходе и приходе на склад.
 *
 * ⚠ Флаг выключен: на бэке справочника ещё нет (проверено 12.08.2026 —
 * `GET /finance/cashless-methods/` отдаёт 404, тогда как `/finance/insurers/`
 * отвечает 401, т.е. существует). Контракт согласуется тикетом
 * `MamaDoc/backend_ticket_cashless_methods.md`; после его реализации
 * переключаем флаг — других правок на фронте не требуется.
 */
export const CASHLESS_METHODS_ENABLED = false;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DjangoCashlessMethod {
  id: number;
  organizationId: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashlessMethodCreatePayload {
  name: string;
  organizationId?: number | null;
}

export interface CashlessMethodUpdatePayload {
  name?: string;
  isActive?: boolean;
}

// ── API functions ──────────────────────────────────────────────────────────────

export function getCashlessMethods(
  signal?: AbortSignal,
  options?: { includeInactive?: boolean; organizationId?: number | null },
): Promise<DjangoCashlessMethod[]> {
  const query = new URLSearchParams();
  if (options?.includeInactive) query.set("includeInactive", "1");
  if (options?.organizationId != null) {
    query.set("organizationId", String(options.organizationId));
  }
  const qs = query.toString();
  return apiRequest<DjangoCashlessMethod[]>(
    `/finance/cashless-methods/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

export function createCashlessMethod(
  payload: CashlessMethodCreatePayload,
): Promise<DjangoCashlessMethod> {
  return apiRequest<DjangoCashlessMethod>("/finance/cashless-methods/", {
    method: "POST",
    body: payload,
  });
}

export function updateCashlessMethod(
  methodId: number,
  payload: CashlessMethodUpdatePayload,
): Promise<DjangoCashlessMethod> {
  return apiRequest<DjangoCashlessMethod>(`/finance/cashless-methods/${methodId}/`, {
    method: "PATCH",
    body: payload,
  });
}
