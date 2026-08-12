import { apiRequest } from "./client";

/**
 * Справочник способов безналичной оплаты («Оплата картой», «Бакай»,
 * «Пост-терминал»…). Используется в оплате приёма, расходе и приходе на склад.
 *
 * Скоуп — организация с опциональным филиалом: `branchId: null` значит «способ
 * доступен во всех филиалах организации» (Бакай, оплата картой), заданный
 * `branchId` ограничивает способ одним филиалом (пост-терминал конкретной
 * кассы). Формы запрашивают список со скоупом **самой операции** — приёма,
 * расхода, склада, — а не активной сессии, иначе суперпользователю или
 * мультиорг-аккаунту подставится чужой филиал.
 *
 * ⚠ Флаг гасит всё разом: роут настроек, вкладку, селекты в формах и отправку
 * `cashlessMethodId`. Обратно в `false` — штатный откат, данные и миграции
 * трогать не нужно. Выкатывать включённым можно только после деплоя бэкенда:
 * при 404 селект показывает ошибку и блокирует сохранение безнала, то есть
 * встаёт касса. Контракт: `MamaDoc/backend_ticket_cashless_methods.md`.
 */
export const CASHLESS_METHODS_ENABLED = true;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DjangoCashlessMethod {
  id: number;
  organizationId: number;
  /** null — способ доступен во всех филиалах организации */
  branchId: number | null;
  /** Имя филиала джойном; null у общеорганизационного способа */
  branchName: string | null;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashlessMethodCreatePayload {
  name: string;
  /** Не передан или null — способ общий для всех филиалов организации */
  branchId?: number | null;
  organizationId?: number | null;
}

/**
 * `branchId` намеренно отсутствует: бэк отвечает 400 на попытку перенести
 * способ между филиалами — прошлые операции остались бы с способом,
 * недоступным их филиалу. Смена скоупа — скрыть и создать новый.
 */
export interface CashlessMethodUpdatePayload {
  name?: string;
  isActive?: boolean;
}

// ── API functions ──────────────────────────────────────────────────────────────

export function getCashlessMethods(
  signal?: AbortSignal,
  options?: {
    includeInactive?: boolean;
    organizationId?: number | null;
    /**
     * Филиал операции: бэк отдаёт общеорганизационные способы плюс способы
     * этого филиала. Без параметра — весь справочник организации (страница
     * настроек).
     */
    branchId?: number | null;
  },
): Promise<DjangoCashlessMethod[]> {
  const query = new URLSearchParams();
  if (options?.includeInactive) query.set("includeInactive", "1");
  if (options?.organizationId != null) {
    query.set("organizationId", String(options.organizationId));
  }
  if (options?.branchId != null) {
    query.set("branchId", String(options.branchId));
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
