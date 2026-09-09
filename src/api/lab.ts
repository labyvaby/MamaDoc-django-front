/**
 * API раздела лаборатории.
 *
 * Каталог читается из зеркала на бэкенде — живых вызовов в ЛИС при чтении нет
 * ни одного. Заказы уезжают в ЛИС одним вызовом приёма; повторная отправка и
 * перепечатка — отдельные эндпоинты.
 *
 * Тело запроса передаётся объектом: `apiRequest` сериализует его сам
 * (см. `RequestOptions.body?: unknown` в `./client`).
 */

import { apiRequest } from "./client";

// ── Каталог ────────────────────────────────────────────────────────────────

export interface LabTest {
  id: number;
  lisId: number;
  parentId: number | null;
  title: string;
  biomaterial: string;
  requiredDay: number;
  priceStandard: string;
  priceExpress: string;
  lisGender: string;
  requiresDoctor: boolean;
  hasQuestions: boolean;
}

export interface LabProfile {
  id: number;
  lisId: number;
  title: string;
  notice: string;
}

export interface LabInstrument {
  id: number;
  lisId: number;
  title: string;
  count: number;
  price: string;
  instruction: string;
}

export interface LabQuestion {
  /** Локальный ключ строки зеркала. Годится как ключ списка в React. */
  id: number;
  /**
   * Идентификатор вопроса в самой ЛИС — именно его приём обязан вернуть
   * в `LabOrderAnswerInput.lisQuestionId`: ответы ищутся по нему, а не по
   * нашему `id`. Отправить `id` вместо него значит уехать в лабораторию с
   * ответами, которые она не сопоставит ни с одним своим вопросом.
   */
  lisQuestionId: number;
  /** К какому анализу относится вопрос: при двух анализах с вопросами без
   * этого не различить, чей вопрос перед регистратором. */
  testId: number;
  title: string;
  fieldType: string;
  defaultValue: string;
}

interface Listed<T> {
  results: T[];
  count: number;
}

/**
 * Список идентификаторов для `?tests=`.
 *
 * Дубли убираются и порядок нормализуется, чтобы одинаковая корзина давала
 * одинаковый URL и попадала в кэш браузера. Пустая строка — сигнал не делать
 * запрос вовсе.
 */
export function testIdsQuery(ids: number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(",");
}

export function getLabTests(signal?: AbortSignal): Promise<LabTest[]> {
  return apiRequest<Listed<LabTest>>("/lab/tests/", { signal }).then(
    (data) => data.results,
  );
}

export function getLabProfiles(signal?: AbortSignal): Promise<LabProfile[]> {
  return apiRequest<Listed<LabProfile>>("/lab/profiles/", { signal }).then(
    (data) => data.results,
  );
}

export function getLabInstruments(
  testIds: number[],
  signal?: AbortSignal,
): Promise<LabInstrument[]> {
  const query = testIdsQuery(testIds);
  if (!query) return Promise.resolve([]);
  return apiRequest<Listed<LabInstrument>>(
    `/lab/tests/instruments/?tests=${query}`,
    { signal },
  ).then((data) => data.results);
}

export function getLabQuestions(
  testIds: number[],
  signal?: AbortSignal,
): Promise<LabQuestion[]> {
  const query = testIdsQuery(testIds);
  if (!query) return Promise.resolve([]);
  return apiRequest<Listed<LabQuestion>>(
    `/lab/tests/questions/?tests=${query}`,
    { signal },
  ).then((data) => data.results);
}

export function getLabPreparation(
  testIds: number[],
  signal?: AbortSignal,
): Promise<string[]> {
  const query = testIdsQuery(testIds);
  if (!query) return Promise.resolve([]);
  return apiRequest<Listed<string>>(`/lab/tests/preparation/?tests=${query}`, {
    signal,
  }).then((data) => data.results);
}

// ── Настройки ──────────────────────────────────────────────────────────────

/**
 * Настройки раздела лаборатории (`GET /lab/settings/`). Организация — из
 * контекста пользователя, параметров у запроса нет, как и у каталога.
 *
 * `configured` — заведена ли у организации конфигурация раздела вообще
 * (`OrganizationLabConfig`). `false` не значит, что эндпоинт сломан: приём
 * анализов у такой организации всё равно упадёт на бэкенде раньше, на своей
 * проверке, — но сами настройки отдаются без ошибки нарочно, иначе фронту
 * нечем отличить «плата выключена» от «раздел не настроен», и регистратор
 * узнавал бы об этом только из загадочного отказа на кнопке приёма.
 *
 * `chargeInstruments` — берёт ли организация отдельную плату за пробирки
 * (`OrganizationLabConfig.charge_instruments`, влияет на расчёт суммы в
 * `server/apps/lab/basket.py` и на `basketTotals.chargeTubes`). До этого
 * эндпоинта фронт хардкодил `false`; у клиник, где плата включена, приём не
 * проходил вовсе — сумма на экране не совпадала с суммой бэкенда (422
 * «Оплата не совпадает с суммой заказа»). Закрыто на бэкенде в 9138b2c.
 *
 * Больше полей контракт не содержит: внутренние идентификаторы и токен ЛИС
 * наружу не отдаются.
 */
export interface LabSettings {
  configured: boolean;
  chargeInstruments: boolean;
}

export function getLabSettings(signal?: AbortSignal): Promise<LabSettings> {
  return apiRequest<LabSettings>("/lab/settings/", { signal });
}

// ── Заказы ─────────────────────────────────────────────────────────────────

export interface LabOrderRaw {
  id: number;
  patientId: number;
  patientName: string;
  branchName: string;
  status: string;
  totalAmount: string;
  lisOrderCode: number | null;
  titles?: string[];
  createdAt: string;
}

export interface LabOrder {
  id: number;
  patientId: number;
  patientName: string;
  branchName: string;
  status: string;
  isDispatched: boolean;
  totalAmount: number;
  lisOrderCode: number | null;
  titles: string[];
  createdAt: string;
}

/**
 * Привести строку заказа к виду, удобному ленте.
 *
 * `isDispatched` выносится отдельным флагом, потому что на нём держатся
 * плитка «Не отправлены» и доступность кнопки повтора — сравнивать строку
 * статуса в каждом месте значит однажды опечататься и потерять зависшие
 * заказы.
 */
export function normalizeLabOrder(raw: LabOrderRaw): LabOrder {
  const amount = Number.parseFloat(raw.totalAmount);
  return {
    id: raw.id,
    patientId: raw.patientId,
    patientName: raw.patientName,
    branchName: raw.branchName,
    status: raw.status,
    isDispatched: raw.status === "dispatched",
    totalAmount: Number.isFinite(amount) ? amount : 0,
    lisOrderCode: raw.lisOrderCode ?? null,
    titles: raw.titles ?? [],
    createdAt: raw.createdAt,
  };
}

export interface LabOrderLineInput {
  testId: number;
  count: number;
  express: boolean;
}

export interface LabOrderAnswerInput {
  lisQuestionId: number;
  title: string;
  fieldType: string;
  value: string;
}

export interface LabIntakeInput {
  patientId: number;
  /**
   * Филиал приёма обязателен, хотя в схеме бэкенда объявлен как
   * `int | None`: контроллер требует его явно и отвечает 422 при
   * отсутствии — филиал определяет точку регистрации в ЛИС
   * (`lis_registry_id`), и выводить его молча из сессии там сознательно
   * отказались, как и в записи на приём. Сверено с фактическим
   * `LabOrderCreateInput` и `_resolve_branch` 2026-09-09.
   */
  branchId: number;
  lines: LabOrderLineInput[];
  answers: LabOrderAnswerInput[];
  paidCash: string;
  paidCard: string;
  cashlessMethodId?: number;
  discountPercent?: number;
  diagnosis?: string;
  comment?: string;
}

export interface LabLabels {
  barcodeBase64: string;
  ticketBase64: string;
}

export interface LabReceipt extends LabLabels {
  order: LabOrderRaw;
}

// ── Карточка заказа (детальная выдача) ──────────────────────────────────────

export interface LabOrderLineDetail {
  id: number;
  testId: number;
  /** Снимок названия на момент продажи — не текущее название из каталога. */
  titleSnapshot: string;
  price: string;
  countItem: number;
  isExpress: boolean;
}

export interface LabOrderInstrumentDetail {
  id: number;
  instrumentId: number;
  titleSnapshot: string;
  price: string;
  count: number;
}

export interface LabOrderDetailRaw {
  id: number;
  patientId: number;
  patientName: string;
  branchName: string;
  status: string;
  diagnosis: string;
  comment: string;
  discountPercent: number;
  totalAmount: string;
  paidCash: string;
  paidCard: string;
  lisOrderId: number | null;
  lisOrderCode: number | null;
  dispatchedAt: string | null;
  dispatchError: string;
  createdAt: string;
  lines: LabOrderLineDetail[];
  instruments: LabOrderInstrumentDetail[];
  /**
   * Ответы на вопросы ЛИС. Карточка их не показывает (план задачи 11 не
   * просит) — тип оставлен нестрогим, чтобы не выдумывать поля контракта,
   * которые нигде не читаются.
   */
  answers: unknown[];
}

export interface LabOrderDetail {
  id: number;
  patientId: number;
  patientName: string;
  branchName: string;
  /** См. normalizeLabOrder — тот же приём: сравнивать флаг, а не строку статуса. */
  isDispatched: boolean;
  diagnosis: string;
  comment: string;
  discountPercent: number;
  totalAmount: number;
  paidCash: number;
  paidCard: number;
  lisOrderId: number | null;
  lisOrderCode: number | null;
  dispatchedAt: string | null;
  dispatchError: string;
  createdAt: string;
  lines: LabOrderLineDetail[];
  instruments: LabOrderInstrumentDetail[];
}

/** Decimal-строка бэка → число; мусор (NaN, Infinity) считаем нулём, не даём ему течь в formatKGS. */
function parseMoney(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Привести детальный ответ `GET /lab/orders/<id>/` к виду карточки заказа.
 *
 * `lisOrderId` и `dispatchError` не трогаем (передаём как есть) — на них
 * держится главный сценарий раздела сегодня: пока ЛИС недоступна с сервера,
 * каждый приём даёт неотправленный заказ, и карточка обязана честно
 * показать причину и разрешить печать только того, что реально есть
 * (см. labOrderStatus.ts).
 */
export function normalizeLabOrderDetail(raw: LabOrderDetailRaw): LabOrderDetail {
  return {
    id: raw.id,
    patientId: raw.patientId,
    patientName: raw.patientName,
    branchName: raw.branchName,
    isDispatched: raw.status === "dispatched",
    diagnosis: raw.diagnosis,
    comment: raw.comment,
    discountPercent: raw.discountPercent,
    totalAmount: parseMoney(raw.totalAmount),
    paidCash: parseMoney(raw.paidCash),
    paidCard: parseMoney(raw.paidCard),
    lisOrderId: raw.lisOrderId,
    lisOrderCode: raw.lisOrderCode,
    dispatchedAt: raw.dispatchedAt,
    dispatchError: raw.dispatchError,
    createdAt: raw.createdAt,
    lines: raw.lines,
    instruments: raw.instruments,
  };
}

export function createLabOrder(body: LabIntakeInput): Promise<LabReceipt> {
  return apiRequest<LabReceipt>("/lab/orders/", {
    method: "POST",
    body,
  });
}

export function dispatchLabOrder(orderId: number): Promise<LabReceipt> {
  return apiRequest<LabReceipt>(`/lab/orders/${orderId}/dispatch/`, {
    method: "POST",
  });
}

export function getLabOrderLabels(orderId: number): Promise<LabLabels> {
  return apiRequest<LabLabels>(`/lab/orders/${orderId}/labels/`);
}

export function getLabOrders(
  params: { status?: string; branchId?: number } = {},
  signal?: AbortSignal,
): Promise<LabOrder[]> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.branchId !== undefined) {
    search.set("branchId", String(params.branchId));
  }
  const query = search.toString();
  return apiRequest<Listed<LabOrderRaw>>(
    `/lab/orders/${query ? `?${query}` : ""}`,
    { signal },
  ).then((data) => data.results.map(normalizeLabOrder));
}

/** Карточка одного заказа — GET по внутреннему id, не по номеру в ЛИС. */
export function getLabOrder(
  orderId: number,
  signal?: AbortSignal,
): Promise<LabOrderDetail> {
  return apiRequest<LabOrderDetailRaw>(`/lab/orders/${orderId}/`, {
    signal,
  }).then(normalizeLabOrderDetail);
}

export function getPatientLabOrders(
  patientId: number,
  signal?: AbortSignal,
): Promise<LabOrder[]> {
  return apiRequest<Listed<LabOrderRaw>>(`/lab/patients/${patientId}/orders/`, {
    signal,
  }).then((data) => data.results.map(normalizeLabOrder));
}
