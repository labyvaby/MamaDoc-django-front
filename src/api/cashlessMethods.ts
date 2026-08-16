import { ApiError, apiRequest } from "./client";

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
 * встаёт касса. Контракт: `MamaDoc/backend_ticket_cashless_methods.md`, способ
 * по умолчанию и удаление — `MamaDoc/backend_ticket_cashless_methods_v2.md`.
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
  /**
   * Способ подставляется в формах по умолчанию. Не более одного `true` на пару
   * (организация, филиал): бэк снимает флаг с прежнего дефолта сам, второй
   * PATCH не нужен. Снять дефолт, не назначая нового, можно — `isDefault:false`
   * поддержан отдельно. Скрытый способ дефолтом быть не может: `isActive:false`
   * сбрасывает флаг, а установка дефолта скрытому отвечает 400 (на тестовом
   * стенде 16.08.2026 ещё молча игнорировалась — 200 с `isDefault:false`),
   * поэтому UI такую кнопку у скрытых не показывает вовсе.
   */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashlessMethodCreatePayload {
  name: string;
  /** Не передан или null — способ общий для всех филиалов организации */
  branchId?: number | null;
  organizationId?: number | null;
  isDefault?: boolean;
}

/**
 * `branchId` намеренно отсутствует: бэк отвечает 400 на попытку перенести
 * способ между филиалами — прошлые операции остались бы с способом,
 * недоступным их филиалу. Смена скоупа — скрыть и создать новый.
 */
export interface CashlessMethodUpdatePayload {
  name?: string;
  isActive?: boolean;
  isDefault?: boolean;
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

/**
 * Удаляет способ физически. Способ, на который ссылается хотя бы один платёж,
 * расход или движение склада, не удаляется — бэк отвечает 409 (см.
 * `isCashlessMethodInUseError`), историю операций он не трогает.
 */
export function deleteCashlessMethod(methodId: number): Promise<void> {
  return apiRequest<void>(`/finance/cashless-methods/${methodId}/`, {
    method: "DELETE",
  });
}

/**
 * Ошибка «способ уже использован» из DELETE. Бэк отдаёт
 * `409 {detail: [{msg: "…", type: "in_use"}]}`. Статус проверяем вместе с
 * признаком: `type` может смениться, но 409 на этом эндпоинте больше ничего
 * не значит.
 */
export function isCashlessMethodInUseError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status === 409) return true;
  const detail = (err.payload as { detail?: unknown } | null)?.detail;
  if (!Array.isArray(detail)) return false;
  return detail.some(
    (item) =>
      item != null &&
      typeof item === "object" &&
      (item as Record<string, unknown>).type === "in_use",
  );
}

function detailMessages(err: ApiError): string[] {
  const detail = (err.payload as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return [detail];
  if (!Array.isArray(detail)) return [];
  return detail
    .map((item) =>
      item != null && typeof item === "object" && "msg" in item
        ? String((item as Record<string, unknown>).msg)
        : String(item),
    )
    .filter(Boolean);
}

/**
 * Текст 409 от бэка — в нём единственное место, где есть количества операций
 * («использован в 1 операции: 0 платежей, 1 расход…»): договорились (16.08.2026)
 * не выносить счётчики ни в поля ответа, ни в `usageCount` списка.
 *
 * Показываем сообщение только когда оно русское. На тестовом стенде до
 * локализации лежит английская строка, и показать её кассиру хуже, чем свой
 * текст без числа; проверка снимает зависимость от порядка деплоя фронта и
 * бэка и отпадёт сама, когда локализация доедет до прода.
 */
export function cashlessMethodInUseMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  return detailMessages(err).find((msg) => /[а-яё]/i.test(msg)) ?? null;
}

/**
 * Способ, который форма подставляет сама: дефолт филиала операции → общий
 * дефолт организации → единственный доступный способ → ничего. Список приходит
 * уже отфильтрованным по филиалу операции (общеорганизационные + филиальные),
 * поэтому филиальный дефолт здесь всегда «свой».
 *
 * Скрытые способы в формы не попадают (запрос идёт без `includeInactive`), так
 * что дополнительной проверки `isActive` не требуется — но она бесплатна и
 * страхует от справочника, загруженного с флагом.
 */
export function pickDefaultCashlessMethodId(
  methods: DjangoCashlessMethod[],
  branchId?: number | null,
): number | "" {
  const usable = methods.filter((m) => m.isActive);
  if (usable.length === 0) return "";
  const branchDefault =
    branchId != null
      ? latestDefault(usable.filter((m) => m.isDefault && m.branchId === branchId))
      : null;
  if (branchDefault) return branchDefault.id;
  const orgDefault = latestDefault(usable.filter((m) => m.isDefault && m.branchId == null));
  if (orgDefault) return orgDefault.id;
  return usable.length === 1 ? usable[0].id : "";
}

/**
 * Уникальность дефолта держит бэк, но до чистки исторических данных пара
 * (организация, филиал) может прийти с двумя `isDefault` сразу. Берём последний
 * назначенный — то же правило, по которому бэк разрешает дубли перед продом
 * («оставить последний активный»), — иначе форма подставляла бы способ по
 * случайному порядку ответа и кассир видел бы разное в разных вкладках.
 */
function latestDefault(candidates: DjangoCashlessMethod[]): DjangoCashlessMethod | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, m) => (m.updatedAt > best.updatedAt ? m : best));
}
