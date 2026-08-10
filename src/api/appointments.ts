import dayjs from "dayjs";
import { apiRequest, ApiError } from "./client";

// ── Error helpers ─────────────────────────────────────────────────────────────

/**
 * Extract a human-readable message from a backend error response.
 *
 * Supported envelopes (in priority order):
 *   { "error": "…" }                        — single string message
 *   { "detail": [{ "msg": "…" }, …] }       — Django/Pydantic array
 *   { "detail": "…" }                        — DRF string detail
 *   { "errors": { field: [msgs] } }          — field-level validation errors
 */
// Технические префиксы полей (startsAt:, service:, branch:, products: …) и
// внутренние ссылки (приём #2) мешают читать ошибку обычному пользователю.
// Чистим их, оставляя человеко-понятный текст.
const _FIELD_PREFIX = /^\s*(starts_?at|ends_?at|service|services|serviceId|branch|branchId|employee|employeeId|products|product|patient|patientId|organization|organizationId|quantity|price|unitPrice|discountAmount|nonFieldErrors|__all__)\s*:\s*/i;

function humanizeBackendMessage(raw: string): string {
  // Валидатор бэкенда: branchId обязателен, а активный филиал не выбран
  // (режим «Все филиалы»). Форма это блокирует, но ошибка может прийти и
  // другим путём — переводим её в понятную инструкцию.
  if (/\$\.parsed_body\.branchId/.test(raw)) {
    return (
      "Не выбран филиал. Нажмите на название клиники вверху бокового меню " +
      "(на телефоне сначала откройте меню кнопкой ☰), выберите нужный филиал " +
      "и попробуйте снова."
    );
  }
  return raw
    .split(";")
    .map((part) => part.replace(_FIELD_PREFIX, "").trim())
    // «приём #2» → «другой приём» (внутренний id пользователю не нужен)
    .map((part) => part.replace(/приём\s*#\d+/gi, "другой приём"))
    .filter(Boolean)
    .join(". ");
}

export function parseBackendError(err: unknown): string {
  if (err instanceof ApiError) {
    const p = err.payload as Record<string, unknown> | null | undefined;
    if (p && typeof p === "object") {
      // { error: "..." }
      if (typeof p.error === "string") return humanizeBackendMessage(p.error);

      // { detail: [{ msg: "..." }, ...] }  — Django/Pydantic validation list
      if (Array.isArray(p.detail)) {
        const msgs = (p.detail as unknown[])
          .map((item) => {
            if (item && typeof item === "object" && "msg" in item) {
              return String((item as Record<string, unknown>).msg);
            }
            return String(item);
          })
          .filter(Boolean);
        if (msgs.length) return humanizeBackendMessage(msgs.join("; "));
      }

      // { detail: "..." }  — DRF string detail
      if (typeof p.detail === "string" && p.detail) return humanizeBackendMessage(p.detail);

      // { errors: { field: [...] } }
      if (p.errors && typeof p.errors === "object") {
        const parts = Object.entries(p.errors as Record<string, unknown>).map(
          ([field, msgs]) => {
            const msgStr = Array.isArray(msgs)
              ? msgs
                  .map((m) =>
                    typeof m === "object" && m !== null
                      ? Object.values(m as Record<string, unknown>).flat().join(", ")
                      : String(m),
                  )
                  .join(", ")
              : String(msgs);
            return field === "__all__" ? msgStr : `${field}: ${msgStr}`;
          },
        );
        if (parts.length) return humanizeBackendMessage(parts.join("; "));
      }
    }
  }
  return err instanceof Error ? err.message : "Неизвестная ошибка";
}

// ── Overlap conflict (HTTP 409, org "warn" mode) ──────────────────────────────

/** One existing appointment the requested slot runs into (mirrors backend). */
export interface OverlapConflict {
  appointmentId: number;
  startsAt: string;
  endsAt: string;
  employeeId: number | null;
  employeeName: string;
  patientName: string;
}

/** Body of the HTTP 409 returned when the org "warn" mode blocks an overlap. */
export interface AppointmentOverlapConflict {
  code: "appointment_overlap";
  message: string;
  requestedSlot: { startsAt: string; endsAt: string };
  overlaps: OverlapConflict[];
}

/**
 * Detect the structured overlap conflict (409 with code "appointment_overlap").
 * Returns the parsed body, or null for any other error — callers then show the
 * confirmation modal and resend the same request with `allowOverlap: true`.
 * Keyed on the machine `code`, never on the message text.
 */
export function parseOverlapConflict(
  err: unknown,
): AppointmentOverlapConflict | null {
  if (err instanceof ApiError && err.status === 409) {
    const p = err.payload;
    if (
      p &&
      typeof p === "object" &&
      (p as Record<string, unknown>).code === "appointment_overlap"
    ) {
      return p as AppointmentOverlapConflict;
    }
  }
  return null;
}

// ── Нехватка товара при сохранении (HTTP 400, машиночитаемая) ────────────────

/**
 * Блокирующая нехватка остатка: товар не списать со склада филиала приёма.
 * Бэк с 03.08.2026 присылает её структурой, а не только русским текстом
 * (`detail[0]`: `code`/`type` = `insufficient_stock`, `productId`,
 * `warehouseId`, `warehouseName`, `required`, `available`) — тикет
 * `backend_ticket_product_stock_branch_scoping.md`, п. 3.
 *
 * Не путать с `AppointmentConsumptionWarning`: то — неблокирующее предупреждение
 * автосписания расходников (остаток уходит в минус, приём сохраняется).
 */
export interface AppointmentStockShortage {
  productId: number | null;
  warehouseId: number | null;
  warehouseName: string | null;
  /** decimal-строки/числа как пришли от бэка — только для показа. */
  required: string | null;
  available: string | null;
  /** Русский текст бэка — фолбэк, если названия склада в ответе нет. */
  msg: string | null;
}

const asStringOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : null;

const asNumberOrNull = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : null;

/**
 * Распознать нехватку остатка в ошибке сохранения приёма. Матчим по `code`/`type`
 * (регистр не важен), а не по тексту — текст терминологичен и меняется.
 * Возвращает null для любой другой ошибки: вызывающий покажет обычный saveError.
 */
export function parseInsufficientStock(
  err: unknown,
): AppointmentStockShortage | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  const p = err.payload as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== "object" || !Array.isArray(p.detail)) return null;
  for (const raw of p.detail as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const code = String(item.code ?? item.type ?? "").toLowerCase();
    if (code !== "insufficient_stock") continue;
    return {
      productId: asNumberOrNull(item.productId),
      warehouseId: asNumberOrNull(item.warehouseId),
      warehouseName: asStringOrNull(item.warehouseName),
      required: asStringOrNull(item.required),
      available: asStringOrNull(item.available),
      // Живьём msg приходит с префиксом поля («products: Недостаточно…»,
      // проверено на проде 03.08.2026) — пользователю он ни о чём не говорит.
      msg: asStringOrNull(item.msg)?.replace(/^\s*products?\s*:\s*/i, "") ?? null,
    };
  }
  return null;
}

// ── Nested shapes ─────────────────────────────────────────────────────────────

export interface AppointmentPatientShort {
  id: number;
  fullName: string;
  phone: string;
  photoUrl: string | null;
}

export interface AppointmentEmployeeShort {
  id: number;
  fullName: string;
  photoUrl: string | null;
  nickname: string | null;
}

export interface AppointmentServiceShort {
  id: number;
  name: string;
  basePrice: string;
  durationMinutes: number;
  imageUrl: string | null;
}

/**
 * Расходники услуги в приёме и их автосписание (фазы 2–3 гайда
 * `frontend-service-related-products.md`). Бэк задеплоен — проверено на живом
 * API 30.07.2026: `serviceLines[].consumptions` приходит, справочник услуги
 * отдаёт `billable`.
 *
 * Когда бэк списывает (`front_consumables_integration.md`, ответы 1–5):
 *   - `status == completed` ИЛИ `paymentStatus IN (paid, discounted)` — то есть
 *     закрытие чека списывает само, отдельный перевод в completed не нужен;
 *   - `partial` не списывает; `canceled`/`no_show` и возврат, уводящий приём из
 *     оплаченных, возвращают товар на склад;
 *   - правка состава у уже оплаченного приёма списывает/возвращает дельту.
 */
export const APPOINTMENT_CONSUMPTIONS_ENABLED = true;

/**
 * Расходник строки услуги (фазы 2–3 состава услуги, гайд
 * `frontend-service-related-products.md` §4).
 *
 * Бесплатный расходник (`billable: false`) в деньги не идёт — его стоимость
 * считается внутри цены услуги. Платный (`billable: true`, тикет
 * `backend_ticket_service_consumptions_billable.md`, кейс «Импланон»)
 * оплачивается сверх услуги: его `lineTotal` бэк включает в `totalAmount`, а
 * значит и в `payableAmount` со скидкой приёма (скидка общая на чек) и в долг.
 * В процентную базу врача за услугу платный расходник НЕ входит — процент
 * считается только от `lineTotal` строки услуги (гайд, ответы 6–8).
 *
 * ⚠ `id` — id строки расхода, НЕ id товара (в справочнике услуги наоборот).
 */
export interface AppointmentConsumption {
  id: number;
  productId: number;
  name: string;
  unit: string;
  /** Количество из состава услуги × quantity строки услуги (decimal-строка). */
  quantity: string;
  autoWriteOff: boolean;
  /** Оплачивается сверх цены услуги; false — включён в цену услуги. */
  billable?: boolean;
  /**
   * Снапшот цены товара на момент создания строки (decimal-строка): смена
   * прайса не меняет сумму уже созданного приёма. Приходит и у бесплатных
   * строк — справочно.
   */
  unitPrice?: string;
  /** `unitPrice × quantity`; "0.00" (или отсутствует) у бесплатной строки. */
  lineTotal?: string;
  /**
   * `service_template` — количество следует строке услуги (автопересчёт);
   * `manual` — оператор правил строку, автопересчёт для неё выключен.
   */
  source: "service_template" | "manual";
  /** Остаток склада филиала приёма; null — у филиала склада нет (не ноль!). */
  stockOnHand: string | null;
  /** true только когда строка будет списана и не влезает в остаток. */
  shortage: boolean;
  /** stockOnHand − quantity; null, когда списания не будет или остаток неизвестен. */
  resultingStock: string | null;
}

export interface AppointmentServiceLine {
  id: number;
  service: AppointmentServiceShort | null;
  employee: AppointmentEmployeeShort | null;
  /**
   * Effective unit price for this line.
   * ⚠ Живой ответ /appointments/ и /appointments/home/ это поле НЕ отдаёт
   * (проверено 07.08.2026) — считать деньги строки следует от `lineTotal`
   * с фолбэком на `unitPrice`/`service.basePrice`.
   */
  price: string;
  /** Сумма строки, посчитанная бэком: `unitPrice × quantity − discountAmount`. */
  lineTotal?: string;
  /** Duration snapshot — always set after migration 0012 */
  durationMinutes: number;
  quantity: number;
  /** Unit price before any discount (may equal price when no override) */
  unitPrice: string;
  /** Discount amount applied to this line */
  discountAmount: string;
  /** Требует ли строка заключения (снимок на момент записи). */
  requiresConclusion?: boolean;
  /** Состояние заключения по строке: not_required | not_created | draft | completed. */
  conclusionState?: "not_required" | "not_created" | "draft" | "completed";
  /** id заключения, если оно создано. */
  conclusionId?: number | null;
  /**
   * Расходники строки (снапшот состава услуги на момент записи: правка
   * справочника уже созданный приём не меняет). Нормализуется в массив.
   */
  consumptions: AppointmentConsumption[];
}

/**
 * Сумма платного расходника. Берём `lineTotal` бэка, а если его нет (старый
 * ответ) — считаем сами из `unitPrice × quantity`. У бесплатной строки — 0.
 */
export function consumptionLineTotal(c: AppointmentConsumption): number {
  if (!c.billable) return 0;
  const lineTotal = parseFloat(String(c.lineTotal ?? ""));
  if (Number.isFinite(lineTotal) && lineTotal > 0) return lineTotal;
  const unitPrice = parseFloat(String(c.unitPrice ?? "")) || 0;
  const quantity = parseFloat(String(c.quantity)) || 0;
  return unitPrice * quantity;
}

/** Сколько платные расходники добавляют к сумме приёма (по всем строкам услуг). */
export function billableConsumptionsTotal(services: AppointmentServiceLine[]): number {
  return services.reduce(
    (sum, line) =>
      sum + (line.consumptions ?? []).reduce((s, c) => s + consumptionLineTotal(c), 0),
    0,
  );
}

/** Compact product reference embedded in an appointment product line. */
export interface AppointmentProductShort {
  id: number;
  name: string;
  unit: string;
  price: string;
}

/** A product line within an appointment (read side). */
export interface AppointmentProductLine {
  id: number;
  product: AppointmentProductShort;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  lineTotal: string;
  status: "pending" | "completed" | "canceled";
  notes: string;
}

// ── Read ──────────────────────────────────────────────────────────────────────

// Статусы 1-в-1 с бэком (server/apps/appointments/models.py → AppointmentStatus).
// Никакого перевода — фронт оперирует теми же slug'ами, что принимает Django.
export type DjangoAppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "arrived"
  | "in_progress"
  | "completed"
  | "canceled"
  | "no_show";

// Raw shape as the backend actually sends it (snake_case fields that differ from our type)
interface RawAppointment {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Normalize a raw backend appointment object to DjangoAppointment.
 *
 * Backend contract differences:
 *   startsAt      → scheduledAt
 *   serviceLines  → services
 */
function normalizeAppointment(raw: RawAppointment): DjangoAppointment {
  // field renames
  const scheduledAt: string = raw.scheduledAt ?? raw.startsAt ?? "";
  const rawServices: RawAppointment[] = Array.isArray(raw.services)
    ? raw.services
    : Array.isArray(raw.serviceLines)
    ? raw.serviceLines
    : [];
  // consumptions нормализуем в массив: на окружении без деплоя состава поля нет,
  // и UI не должен проверять Array.isArray на каждой строке услуги.
  const services: AppointmentServiceLine[] = rawServices.map((line) => ({
    ...(line as AppointmentServiceLine),
    consumptions: Array.isArray(line.consumptions) ? line.consumptions : [],
  }));
  const productLines: AppointmentProductLine[] = Array.isArray(raw.productLines)
    ? raw.productLines
    : [];
  // Статус используем как есть — slug'и фронта совпадают с бэком.
  const status = (raw.status ?? "scheduled") as DjangoAppointmentStatus;
  const paymentMethods: string[] = Array.isArray(raw.paymentMethods)
    ? raw.paymentMethods
    : [];

  return {
    ...raw,
    scheduledAt,
    services,
    productLines,
    status,
    paymentMethods,
    consumptionWarnings: Array.isArray(raw.consumptionWarnings)
      ? raw.consumptionWarnings
      : [],
  } as DjangoAppointment;
}

/**
 * Предупреждение автосписания расходников. Заполняется только тем, что натворил
 * **этот** запрос: на обычном GET всегда пусто (проверено на живом API
 * 30.07.2026 — поле есть и в приёме, и в `PaymentSummary`).
 *
 * ⚠ Бэк описал структуру дважды и по-разному, поэтому читаем оба набора имён:
 *   - гайд §4a (списание по завершению): `code: "insufficient_stock"`, `name`,
 *     `required`, `stockOnHand`, `resultingStock`, `branchId`;
 *   - `front_consumables_integration.md` §1.3 (списание по оплате, 30.07.2026):
 *     `code: "SHORTAGE"`, `productName`, `warehouseName`, `requested`,
 *     `available`.
 * Живьём ни один вариант ещё не наблюдался (нужен приём с нехваткой остатка),
 * поэтому форматтер работает по обоим — см. `components/appointments/
 * consumptionWarnings.ts`. `warehouse_not_found` — у филиала нет склада:
 * заполнен только `branchId`, ранее списанное возвращено.
 *
 * Нехватка никогда не блокирует оплату/завершение — показываем тостом, не
 * ошибкой (гайд, ответ 11: списание неблокирующее, остаток уходит в минус).
 */
export interface AppointmentConsumptionWarning {
  /** `SHORTAGE` == `insufficient_stock`; матчим оба, регистр не важен. */
  code: string;
  branchId?: number | null;
  productId?: number | null;
  /** Имя товара: `name` (§4a) или `productName` (гайд 30.07). */
  name?: string | null;
  productName?: string | null;
  warehouseId?: number | null;
  warehouseName?: string | null;
  /** Сколько требовалось списать: `required` (§4a) или `requested`. */
  required?: string | null;
  requested?: string | null;
  /** Остаток до списания: `stockOnHand` (§4a) или `available`. */
  stockOnHand?: string | null;
  available?: string | null;
  /** Остаток после списания; в формате 30.07 бэк его не присылает. */
  resultingStock?: string | null;
}

export interface DjangoAppointment {
  id: number;
  organizationId: number;
  branchId: number | null;
  patient: AppointmentPatientShort | null;
  scheduledAt: string;
  /** Конец приёма, посчитанный бэком как начало + сумма длительностей строк
   *  услуг. Не равен scheduledAt + 30 мин: приём с несколькими услугами длиннее,
   *  и именно этот интервал бэк проверяет на пересечения при сохранении. */
  endsAt: string;
  isNight: boolean;
  status: DjangoAppointmentStatus;
  complaints: string | null;
  doctorComplaints: string | null;
  adminComment: string | null;
  services: AppointmentServiceLine[];
  /** Goods sold within this visit (deducted from the warehouse). */
  productLines: AppointmentProductLine[];
  /** True after the one-time performer price override was consumed. */
  priceOverrideUsed?: boolean;
  totalAmount: string;
  createdAt: string;
  updatedAt: string;
  /** Auth-user id создавшего/изменившего запись (проверено на проде 08.07.2026:
   *  бэк шлёт только id; имя фронт достаёт через staff.employees.authUserId). */
  createdById?: number | null;
  updatedById?: number | null;
  // Payment fields — included in list/detail responses by backend
  paymentStatus?: import("./payments").PaymentStatus;
  paidTotal?: string;
  discountAmount?: string;
  payableAmount?: string;
  debt?: string;
  paymentMethods?: string[];
  // Medical conclusion flag — true if the appointment has at least one conclusion
  hasMedicalConclusion?: boolean;
  /**
   * Что натворило списание расходников в этом запросе (см.
   * AppointmentConsumptionWarning). На GET — всегда пустой массив.
   */
  consumptionWarnings: AppointmentConsumptionWarning[];
}

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Расходник строки услуги на запись. `id` есть → обновить строку (должна
 * принадлежать этой же строке услуги, иначе 400); `id` нет → создать.
 * Один товар дважды в одной строке услуги → 400 (в приёме это ошибка формы,
 * в отличие от справочника, где дубли схлопываются).
 */
export interface AppointmentConsumptionCreate {
  id?: number | null;
  productId: number;
  /** decimal-строка; > 0. По умолчанию 1. */
  quantity?: string;
  /** По умолчанию true. */
  autoWriteOff?: boolean;
  /**
   * Платность строки. По умолчанию берётся из состава услуги; цену не
   * передаём — `unitPrice` бэк снапшотит сам из прайса товара.
   */
  billable?: boolean;
}

export interface AppointmentServiceLineCreate {
  /** When set, identifies an existing line to update in-place (diff semantics). */
  id?: number | null;
  serviceId: number;
  employeeId: number | null;
  quantity?: number;
  unitPrice?: string;
  discountAmount?: string;
  /**
   * Расходники строки. ⚠ Семантика бэка: **отсутствие ключа — не трогаем**,
   * `[]` — удалить все, присутствие — полная синхронизация (строк, которых нет
   * в массиве, не станет). Поэтому поле отправляется только когда пользователь
   * реально правил расходники: иначе обычное сохранение формы, которая всегда
   * шлёт `services` целиком, стирало бы состав.
   *
   * Правка значения переводит строку в `source: "manual"` — автопересчёт по
   * количеству услуги для неё выключается; эхо неизменённых значений
   * безопасно (бэк сравнивает и оставляет `service_template`).
   */
  consumptions?: AppointmentConsumptionCreate[];
}

/** Frontend product line (write path). Goods sold within the visit. */
export interface AppointmentProductLineCreate {
  /** When set, identifies an existing line to update in-place (diff semantics). */
  id?: number | null;
  productId: number;
  quantity?: number;
  unitPrice?: string;
  discountAmount?: string;
}

export interface CreateAppointmentPayload {
  patientId?: number | null;
  branchId?: number | null;
  /** Active organization id — sent so the backend scopes to the same org as
   *  branchId (a multi-org superuser otherwise infers the wrong organization). */
  organizationId?: number | null;
  scheduledAt: string;
  isNight?: boolean;
  isBooking?: boolean;
  complaints?: string | null;
  doctorComplaints?: string | null;
  adminComment?: string | null;
  services: AppointmentServiceLineCreate[];
  products?: AppointmentProductLineCreate[];
  /** Подтверждение пересечения при режиме организации "warn": первый запрос без
   *  него получает 409 со списком конфликтов; повтор с true — сохраняет. */
  allowOverlap?: boolean;
}

// ── Update ────────────────────────────────────────────────────────────────────

export interface UpdateAppointmentPayload {
  patientId?: number | null;
  scheduledAt?: string;
  isNight?: boolean;
  status?: DjangoAppointmentStatus;
  complaints?: string | null;
  doctorComplaints?: string | null;
  adminComment?: string | null;
  services?: AppointmentServiceLineCreate[];
  /** См. CreateAppointmentPayload.allowOverlap. */
  allowOverlap?: boolean;
  /**
   * Товары приёма. ⚠ Бэкенд ПОКА игнорирует это поле в PATCH (проверено на
   * живом API 15.07.2026: 200, но productLines не меняется) — тикет
   * MamaDoc/backend_ticket_appointments_patch_products.md.
   */
  products?: AppointmentProductLineCreate[];
}

// ── Request denormalization ───────────────────────────────────────────────────

/** Backend consumption shape (write path). */
interface BackendConsumption {
  id?: number;
  productId: number;
  quantity?: string;
  autoWriteOff?: boolean;
  billable?: boolean;
}

/** Backend service line shape (write path). */
interface BackendServiceLine {
  id?: number;
  serviceId: number;
  employeeId: number | null;
  quantity?: number;
  unitPrice?: string;
  discountAmount?: string;
  consumptions?: BackendConsumption[];
}

/** Backend product line shape (write path). */
interface BackendProductLine {
  id?: number;
  productId: number;
  quantity?: number;
  unitPrice?: string;
  discountAmount?: string;
}

/** Backend create body shape. */
interface BackendCreateBody {
  patientId?: number | null;
  branchId?: number | null;
  organizationId?: number | null;
  startsAt: string;
  isNight?: boolean;
  isBooking?: boolean;
  complaints?: string | null;
  doctorComplaints?: string | null;
  adminComment?: string | null;
  // Backend create payload (AppointmentCreatePayload) names this field
  // ``services`` — NOT ``serviceLines`` (that's the read-side name). msgspec
  // silently drops unknown keys, so a wrong name → "no service" 400.
  services: BackendServiceLine[];
  products?: BackendProductLine[];
  allowOverlap?: boolean;
}

/** Backend update body shape (all fields optional). */
interface BackendUpdateBody {
  patientId?: number | null;
  branchId?: number | null;
  startsAt?: string;
  isNight?: boolean;
  isBooking?: boolean;
  status?: string;
  complaints?: string | null;
  doctorComplaints?: string | null;
  adminComment?: string | null;
  // Backend update payload also names this ``services`` (not ``serviceLines``).
  services?: BackendServiceLine[];
  products?: BackendProductLine[];
  allowOverlap?: boolean;
}

function toBackendServiceLines(services: AppointmentServiceLineCreate[]): BackendServiceLine[] {
  return services.map(
    ({ id, serviceId, employeeId, quantity, unitPrice, discountAmount, consumptions }) => {
      const line: BackendServiceLine = { serviceId, employeeId: employeeId ?? null };
      if (id != null) line.id = id;
      if (quantity !== undefined) line.quantity = quantity;
      if (unitPrice !== undefined && unitPrice !== "") line.unitPrice = unitPrice;
      if (discountAmount !== undefined && discountAmount !== "") line.discountAmount = discountAmount;
      // Ключ доходит до бэка только когда он задан явно: undefined значит
      // «расходники не трогаем», а [] — «удалить все» (разная семантика).
      if (consumptions !== undefined) {
        line.consumptions = consumptions.map((item) => {
          const out: BackendConsumption = { productId: item.productId };
          if (item.id != null) out.id = item.id;
          if (item.quantity !== undefined && item.quantity !== "") out.quantity = item.quantity;
          if (item.autoWriteOff !== undefined) out.autoWriteOff = item.autoWriteOff;
          if (item.billable !== undefined) out.billable = item.billable;
          return out;
        });
      }
      return line;
    },
  );
}

function toBackendProducts(products: AppointmentProductLineCreate[]): BackendProductLine[] {
  return products.map(({ id, productId, quantity, unitPrice, discountAmount }) => {
    const line: BackendProductLine = { productId };
    if (id != null) line.id = id;
    if (quantity !== undefined) line.quantity = quantity;
    if (unitPrice !== undefined && unitPrice !== "") line.unitPrice = unitPrice;
    if (discountAmount !== undefined && discountAmount !== "") line.discountAmount = discountAmount;
    return line;
  });
}

function denormalizeCreatePayload(payload: CreateAppointmentPayload): BackendCreateBody {
  if (!payload.scheduledAt) throw new Error("scheduledAt обязателен");
  const startsAt = dayjs(payload.scheduledAt).toISOString();
  const body: BackendCreateBody = {
    startsAt,
    services: toBackendServiceLines(payload.services),
  };
  if (payload.products && payload.products.length > 0) {
    body.products = toBackendProducts(payload.products);
  }
  // patientId/branchId на создании — обязательные int у бэка (не int|None):
  // явный null в JSON ловит "Expected int, got null" (репорт пользователя,
  // создание приёма-брони без пациента) — поле нужно не слать вовсе, а не
  // слать null. organizationId ниже по той же причине уже был на != null.
  if (payload.patientId != null) body.patientId = payload.patientId;
  if (payload.branchId != null) body.branchId = payload.branchId;
  if (payload.organizationId != null) body.organizationId = payload.organizationId;
  if (payload.isNight !== undefined) body.isNight = payload.isNight;
  if (payload.isBooking !== undefined) body.isBooking = payload.isBooking;
  // На создании эти поля у бэкенда — обязательные строки (str = ''), null не
  // принимается. Пустое значение шлём как "", а не null.
  if (payload.complaints !== undefined) body.complaints = payload.complaints ?? "";
  if (payload.doctorComplaints !== undefined) body.doctorComplaints = payload.doctorComplaints ?? "";
  if (payload.adminComment !== undefined) body.adminComment = payload.adminComment ?? "";
  // Шлём только когда true — по умолчанию бэкенд считает false.
  if (payload.allowOverlap) body.allowOverlap = true;
  return body;
}

function denormalizeUpdatePayload(payload: UpdateAppointmentPayload): BackendUpdateBody {
  const body: BackendUpdateBody = {};
  if (payload.patientId !== undefined) body.patientId = payload.patientId;
  if (payload.isNight !== undefined) body.isNight = payload.isNight;
  if (payload.complaints !== undefined) body.complaints = payload.complaints;
  if (payload.doctorComplaints !== undefined) body.doctorComplaints = payload.doctorComplaints;
  if (payload.adminComment !== undefined) body.adminComment = payload.adminComment;
  // Статус идёт как есть — slug'и совпадают с бэком.
  if (payload.status !== undefined) {
    body.status = payload.status;
  }
  if (payload.scheduledAt) {
    body.startsAt = dayjs(payload.scheduledAt).toISOString();
  }
  if (payload.services !== undefined) {
    body.services = toBackendServiceLines(payload.services);
  }
  if (payload.products !== undefined) {
    body.products = toBackendProducts(payload.products);
  }
  if (payload.allowOverlap) body.allowOverlap = true;
  return body;
}

// ── Service-providers ────────────────────────────────────────────────────────

/**
 * One element returned by GET /api/appointments/service-providers/.
 * Mirrors the backend ServiceProviderPayload (rename='camel').
 */
export interface ServiceProvider {
  id: number;
  fullName: string;
  phone: string;
  email: string;
  /** Primary branch (null when not set). */
  branch: { id: number; name: string } | null;
  /** Specialization names — the appointment form's performer search uses them. */
  specializations: string[];
}

// ── API functions ─────────────────────────────────────────────────────────────

import { Scope, scopeParams } from "./scope";

export function getAppointments(
  scope: Scope = {},
  params?: {
    /** Filter by exact date YYYY-MM-DD. */
    date?: string;
    /** Filter by date range start YYYY-MM-DD. */
    dateFrom?: string;
    /** Filter by date range end YYYY-MM-DD. */
    dateTo?: string;
    /** Filter by appointment status. */
    status?: string;
    /** Full-text search (patient name / phone). */
    search?: string;
    /** Filter by branch id. */
    branchId?: number;
    /** Filter by employee id, or "me" for the signed-in doctor's own appointments. */
    employeeId?: number | "me";
    /** Filter by patient id. */
    patientId?: number;
    /** When true, only night appointments (?nightOnly=true). */
    nightOnly?: boolean;
  },
  signal?: AbortSignal,
): Promise<DjangoAppointment[]> {
  const query = scopeParams(scope);
  if (params?.date) query.set("date", params.date);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.branchId) query.set("branchId", String(params.branchId));
  if (params?.employeeId) query.set("employeeId", String(params.employeeId));
  if (params?.patientId) query.set("patientId", String(params.patientId));
  if (params?.nightOnly) query.set("nightOnly", "true");
  const qs = query.toString();
  return apiRequest<RawAppointment[]>(`/appointments/${qs ? `?${qs}` : ""}`, { signal }).then(
    (list) => (Array.isArray(list) ? list : []).map(normalizeAppointment),
  );
}

/** Aggregated reception-home payload (GET /api/appointments/home/). */
export interface HomeDashboard {
  /** The selected day's appointments (same shape as getAppointments). */
  appointments: DjangoAppointment[];
  /** Map of date (YYYY-MM-DD) → appointment count for the navigator window. */
  dayCounts: Record<string, number>;
  /** Newest updated_at among visible appointments (ISO), or null. */
  lastUpdate: string | null;
}

/**
 * GET /api/appointments/home/ — one round-trip for the reception home screen.
 *
 * Bundles the day's appointment list, the date-navigator counts and the
 * change-detection timestamp so the screen issues a single request instead of
 * three (list + day-counts + last-update). The backend returns dayCounts as a
 * list [{date, count}]; we fold it into a date→count map (like getDayCounts).
 */
export function getHomeDashboard(scope: Scope = {}, params: {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  search?: string;
  branchId?: number;
  employeeId?: number | "me";
  /**
   * Separate scope for the day-counts navigator (defaults to employeeId on the
   * backend). Lets the list stay full while a doctor/nurse sees only their own
   * per-day counts: pass "me" for clinicians, omit for privileged roles.
   */
  countsEmployeeId?: number | "me";
  /**
   * Filter list + day-counts by performer clinical role (e.g. "nurse" for the
   * procedure cabinet) so the navigator shows only that role's procedures.
   */
  clinicalRole?: "doctor" | "nurse" | "other";
  patientId?: number;
  nightOnly?: boolean;
}, signal?: AbortSignal): Promise<HomeDashboard> {
  // Скоуп (organizationId + branchId) из активной сессии — иначе мультиорг-
  // аккаунт/суперадмин без явного organizationId получал приёмы всех орг
  // (см. backend_ticket_appointments_org_isolation). branchId ниже в params
  // дублирует scope.branchId тем же значением — безвредно.
  const query = scopeParams(scope);
  if (params.date) query.set("date", params.date);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.branchId) query.set("branchId", String(params.branchId));
  if (params.employeeId) query.set("employeeId", String(params.employeeId));
  if (params.countsEmployeeId) {
    query.set("countsEmployeeId", String(params.countsEmployeeId));
  }
  if (params.clinicalRole) query.set("clinicalRole", params.clinicalRole);
  if (params.patientId) query.set("patientId", String(params.patientId));
  if (params.nightOnly) query.set("nightOnly", "true");
  const qs = query.toString();
  return apiRequest<{
    appointments: RawAppointment[];
    dayCounts: Array<{ date: string; count: number }> | Record<string, number>;
    lastUpdate: string | null;
  }>(`/appointments/home/${qs ? `?${qs}` : ""}`, { signal }).then((res) => {
    const dayCounts: Record<string, number> = {};
    if (Array.isArray(res.dayCounts)) {
      for (const row of res.dayCounts) dayCounts[row.date] = row.count;
    } else if (res.dayCounts) {
      Object.assign(dayCounts, res.dayCounts);
    }
    return {
      appointments: (res.appointments ?? []).map(normalizeAppointment),
      dayCounts,
      lastUpdate: res.lastUpdate ?? null,
    };
  });
}

/**
 * GET /api/appointments/service-providers/
 *
 * Returns employees who can provide services, visible to the caller.
 * With serviceId — only providers of that service; without — every employee
 * with at least one active assignment (bulk source for the appointment form's
 * performer picker: requires appointments.view, NOT staff.view, so clinicians
 * without staff access can load it).
 */
export function getServiceProviders(params?: {
  serviceId?: number;
  branchId?: number;
}, signal?: AbortSignal): Promise<ServiceProvider[]> {
  const query = new URLSearchParams();
  if (params?.serviceId) query.set("serviceId", String(params.serviceId));
  if (params?.branchId) query.set("branchId", String(params.branchId));
  const qs = query.toString();
  return apiRequest<ServiceProvider[]>(
    `/appointments/service-providers/${qs ? `?${qs}` : ""}`,
    { signal },
  ).then((items) => (Array.isArray(items) ? items : []));
}

// ── Service-assignments (bulk service↔employee matrix) ───────────────────────

/** One active service↔employee pair from GET /api/appointments/service-assignments/. */
export interface ServiceAssignment {
  serviceId: number;
  employeeId: number;
}

/**
 * GET /api/appointments/service-assignments/
 * Bulk matrix of active service↔employee pairs powering the appointment-form
 * filter (service→doctors and doctor→services). ``branchId`` narrows to pairs
 * usable in that branch, matching appointment save-time validation.
 */
export function getServiceAssignments(
  branchId?: number,
  signal?: AbortSignal,
): Promise<ServiceAssignment[]> {
  const query = new URLSearchParams();
  if (branchId != null) query.set("branchId", String(branchId));
  const qs = query.toString();
  return apiRequest<ServiceAssignment[]>(
    `/appointments/service-assignments/${qs ? `?${qs}` : ""}`,
    { signal },
  ).then((list) => (Array.isArray(list) ? list : []));
}

// ── Day counts ────────────────────────────────────────────────────────────────

/**
 * GET /api/appointments/day-counts/
 * Returns a map of date (YYYY-MM-DD) → count of appointments.
 */
export function getDayCounts(params: {
  dateFrom: string;
  dateTo: string;
  branchId?: number;
  employeeId?: number | "me";
}, signal?: AbortSignal): Promise<Record<string, number>> {
  const query = new URLSearchParams();
  query.set("dateFrom", params.dateFrom);
  query.set("dateTo", params.dateTo);
  if (params.branchId) query.set("branchId", String(params.branchId));
  if (params.employeeId) query.set("employeeId", String(params.employeeId));
  // Бэкенд возвращает список [{date, count}]; нормализуем в map date→count,
  // т.к. DateNavigation обращается как dayCounts[dateStr]. На случай старого
  // формата-объекта возвращаем его как есть.
  return apiRequest<
    Array<{ date: string; count: number }> | Record<string, number>
  >(`/appointments/day-counts/?${query.toString()}`, { signal }).then((res) => {
    if (Array.isArray(res)) {
      const map: Record<string, number> = {};
      for (const row of res) map[row.date] = row.count;
      return map;
    }
    return res ?? {};
  });
}

// ── SMS-notification icons ─────────────────────────────────────────────────────

/** Тип уведомления — 1-в-1 с Django (NotificationType) и старым фронтом. */
export type AppointmentNotificationType =
  | "created_10m"
  | "reminder_2h"
  | "rescheduled_10m"
  | "appointment_change"
  | "appointment_cancel";

/** Одна строка лога уведомления (GET /api/appointments/notifications/). */
export interface AppointmentNotificationItem {
  appointmentId: number;
  notificationType: AppointmentNotificationType | string;
  /** Время приёма шлюзом (ISO) или null, пока не отправлено. */
  sentAt: string | null;
  status: string;
}

/**
 * GET /api/appointments/notifications/?ids=1,2,3
 *
 * Лёгкий батч-эндпоинт (как getDayCounts): по списку id приёмов возвращает
 * отправленные SMS-уведомления для иконок статусов рядом с приёмом. Не утяжеляет
 * основной список приёмов. Бэкенд скоупит по видимым приёмам (тенант-изоляция),
 * чужие id молча отбрасываются. Пустой список id → запрос не уходит.
 */
export function getAppointmentNotifications(
  ids: number[],
  signal?: AbortSignal,
): Promise<AppointmentNotificationItem[]> {
  if (!ids.length) return Promise.resolve([]);
  const query = new URLSearchParams();
  query.set("ids", ids.join(","));
  return apiRequest<AppointmentNotificationItem[]>(
    `/appointments/notifications/?${query.toString()}`,
    { signal },
  ).then((list) => (Array.isArray(list) ? list : []));
}

export function getAppointment(id: number): Promise<DjangoAppointment> {
  return apiRequest<RawAppointment>(`/appointments/${id}/`).then(normalizeAppointment);
}

/**
 * Лёгкий heartbeat: максимальный updated_at среди видимых приёмов (ISO-строка
 * или null). Используется для дешёвой детекции изменений — тяжёлый список
 * перезапрашивается только когда таймстамп сдвинулся.
 */
export function getAppointmentsLastUpdate(
  branchId?: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const query = new URLSearchParams();
  if (branchId) query.set("branchId", String(branchId));
  const qs = query.toString();
  return apiRequest<{ lastUpdate: string | null; count?: number }>(
    `/appointments/last-update/${qs ? `?${qs}` : ""}`,
    { signal },
  ).then((r) => {
    // count входит в change token: hard-delete обычно не сдвигает MAX(updated_at),
    // но меняет число видимых приёмов. Старый бэк без count остаётся совместим.
    const timestamp = r.lastUpdate ?? "";
    return r.count == null ? timestamp || null : `${timestamp}:${r.count}`;
  });
}

export function createAppointment(
  payload: CreateAppointmentPayload,
): Promise<DjangoAppointment> {
  return apiRequest<RawAppointment>("/appointments/", {
    method: "POST",
    body: denormalizeCreatePayload(payload),
  }).then(normalizeAppointment);
}

export function updateAppointment(
  id: number,
  payload: UpdateAppointmentPayload,
): Promise<DjangoAppointment> {
  return apiRequest<RawAppointment>(`/appointments/${id}/`, {
    method: "PATCH",
    body: denormalizeUpdatePayload(payload),
  }).then(normalizeAppointment);
}

/**
 * Change the price of the current doctor's service line once within an
 * appointment. The backend enforces permission, performer ownership and the
 * one-time limit transactionally.
 */
export function overrideAppointmentServicePrice(
  appointmentId: number,
  payload: { serviceLineId: number; unitPrice: string | number },
): Promise<DjangoAppointment> {
  return apiRequest<RawAppointment>(
    `/appointments/${appointmentId}/price-override/`,
    {
      method: "POST",
      body: payload,
    },
  ).then(normalizeAppointment);
}

/**
 * Doctor starts the visit: transitions the appointment to "in_progress".
 *
 * Dedicated narrow endpoint so the performing doctor can start a visit
 * without the broad ``appointments.update`` permission (which is reserved
 * for managers/admins and would let one edit the whole appointment). The
 * backend only flips the status and checks the caller is a performer.
 */
export function startAppointment(id: number): Promise<DjangoAppointment> {
  return apiRequest<RawAppointment>(`/appointments/${id}/start/`, {
    method: "POST",
  }).then(normalizeAppointment);
}

export function deleteAppointment(id: number): Promise<void> {
  return apiRequest<void>(`/appointments/${id}/`, { method: "DELETE" });
}
