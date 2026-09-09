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
  id: number;
  testId: number;
  title: string;
  fieldType: string;
  defaultValue: string;
  position: number;
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

export function getPatientLabOrders(
  patientId: number,
  signal?: AbortSignal,
): Promise<LabOrder[]> {
  return apiRequest<Listed<LabOrderRaw>>(`/lab/patients/${patientId}/orders/`, {
    signal,
  }).then((data) => data.results.map(normalizeLabOrder));
}
