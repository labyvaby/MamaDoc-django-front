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
  /** У анализа есть памятка подготовки — в строке корзины появится значок. */
  hasPreparation: boolean;
}

/** Строка памятки из карточки анализа. */
export interface LabKnowledgeItem {
  id: number;
  title: string;
  isPrintable: boolean;
}

/** Инструкция подготовки, приложенная к анализу. */
export interface LabPreparationInfo {
  id: number;
  kind: string;
  text: string;
}

/**
 * Полная карточка анализа (`GET /lab/tests/<id>/`).
 *
 * Список каталога намеренно короче: в нём нет ни показаний, ни подготовки, ни
 * вопросов — иначе первый же запрос тянул бы мегабайты на шесть тысяч позиций.
 * Всё это живёт здесь и грузится по одному анализу, когда его открывают.
 */
export interface LabTestCard {
  id: number;
  parentId: number | null;
  title: string;
  biomaterial: string;
  notice: string;
  indications: string;
  medicalReport: string;
  requiredDay: number;
  priceStandard: string;
  priceExpress: string;
  requiresDoctor: boolean;
  requiresNurseCheck: boolean;
  preparation: LabPreparationInfo | null;
  knowledgeItems: LabKnowledgeItem[];
  questions: LabQuestion[];
}

/**
 * Врач из справочника ЛИС (`GET /lab/doctors/`).
 *
 * Именно этих людей ЛИС показывает в колонке «Нап. врач» своего интерфейса.
 * Наш справочник сотрудников для поля не годится: заказ уезжает с
 * идентификатором врача самой ЛИС, и наш внутренний id ей ничего не говорит.
 */
export interface LabDoctor {
  id: number;
  lisId: number;
  fullName: string;
  qualification: string;
}

/**
 * Тип клиента из справочника ЛИС (`GET /lab/client-types/`).
 *
 * Это готовый список скидок клиники, который живёт в ЛИС: «СТАНДАРТ 0%»,
 * «Пенсионеры 10%», врачебные, дисконтные карты, страховки. Заказ обязан
 * уезжать с одним из них, а его скидка обязана совпадать со скидкой типа.
 */
export interface LabClientType {
  id: number;
  lisId: number;
  title: string;
  discountPercent: number;
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
  /**
   * Названия анализов набора, которым нужна эта пробирка, в порядке
   * появления в наборе. Суммарный `count` без них не отвечает на вопрос у
   * стола забора: какую пробирку под какой анализ брать.
   */
  tests: string[];
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

/**
 * Конверт списка — его отдают ТОЛЬКО ленты заказов (`/lab/orders/` и
 * `/lab/patients/<id>/orders/`). Каталожные ручки раздела отвечают голым
 * массивом, читать у них `results` нельзя: получится `undefined`, а экран
 * покажет пустой каталог, ничем не отличимый от настоящей пустоты.
 */
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
  return apiRequest<LabTest[]>("/lab/tests/", { signal });
}

export function getLabTestCard(
  testId: number,
  signal?: AbortSignal,
): Promise<LabTestCard> {
  return apiRequest<LabTestCard>(`/lab/tests/${testId}/`, { signal });
}

/**
 * Врачи для поля «направивший врач».
 *
 * Без `query` — уже известные: врачи-получатели организации, которых приносит
 * синк каталога, и все, кого раньше находили поиском. С `query` — живой поиск
 * по справочнику самой ЛИС: там двадцать тысяч человек по всем её клиникам,
 * и заранее зеркалить их целиком незачем. Найденное бэкенд осаждает в
 * зеркале, поэтому у результата уже есть наш `id`, которым и ссылается заказ.
 */
export function getLabDoctors(
  query?: string,
  signal?: AbortSignal,
): Promise<LabDoctor[]> {
  const text = (query ?? "").trim();
  const suffix = text ? `?q=${encodeURIComponent(text)}` : "";
  return apiRequest<LabDoctor[]>(`/lab/doctors/${suffix}`, { signal });
}

export function getLabClientTypes(
  signal?: AbortSignal,
): Promise<LabClientType[]> {
  return apiRequest<LabClientType[]>("/lab/client-types/", { signal });
}

export function getLabProfiles(signal?: AbortSignal): Promise<LabProfile[]> {
  return apiRequest<LabProfile[]>("/lab/profiles/", { signal });
}

export interface InstrumentSetLine {
  testId: number;
  count: number;
}

/**
 * `?tests=` для пробирок набора: `id` или `id:count`, когда сдач больше
 * одной — бэкенд множит пробирки на число сдач, иначе сумма на экране
 * не сошлась бы с расчётом приёма при «× 2». Приносные строки сюда не
 * передают вовсе (см. `LabIntakeDrawer`).
 */
export function instrumentSetQuery(lines: InstrumentSetLine[]): string {
  const counts = new Map<number, number>();
  for (const line of lines) {
    counts.set(line.testId, (counts.get(line.testId) ?? 0) + Math.max(1, line.count));
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, count]) => (count > 1 ? `${id}:${count}` : String(id)))
    .join(",");
}

export function getLabInstruments(
  lines: InstrumentSetLine[],
  signal?: AbortSignal,
): Promise<LabInstrument[]> {
  const query = instrumentSetQuery(lines);
  if (!query) return Promise.resolve([]);
  return apiRequest<LabInstrument[]>(
    `/lab/tests/instruments/?tests=${query}`,
    { signal },
  );
}

export function getLabQuestions(
  testIds: number[],
  signal?: AbortSignal,
): Promise<LabQuestion[]> {
  const query = testIdsQuery(testIds);
  if (!query) return Promise.resolve([]);
  return apiRequest<LabQuestion[]>(
    `/lab/tests/questions/?tests=${query}`,
    { signal },
  );
}

export function getLabPreparation(
  testIds: number[],
  signal?: AbortSignal,
): Promise<string[]> {
  const query = testIdsQuery(testIds);
  if (!query) return Promise.resolve([]);
  return apiRequest<string[]>(`/lab/tests/preparation/?tests=${query}`, {
    signal,
  });
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

// ── Настройка ЛИС управляющим (`lab.settings.manage`) ──────────────────────

export interface LabBranchRegistry {
  branchId: number;
  branchName: string;
  lisRegistryId: number | null;
  lisLaboratoryId: number | null;
}

export interface LabMirrorStats {
  tests: number;
  doctors: number;
  clientTypes: number;
  instruments: number;
  preparations: number;
  lastSyncedAt: string | null;
}

export interface LabConfig {
  configured: boolean;
  lisOrganizationId: number | null;
  lisDoctorId: number | null;
  chargeInstruments: boolean;
  branches: LabBranchRegistry[];
  mirror: LabMirrorStats;
}

export interface LabBranchRegistryInput {
  branchId: number;
  lisRegistryId?: number | null;
  lisLaboratoryId?: number | null;
}

export interface LabConfigInput {
  lisOrganizationId: number;
  lisDoctorId: number;
  chargeInstruments: boolean;
  branches: LabBranchRegistryInput[];
}

export function getLabConfig(signal?: AbortSignal): Promise<LabConfig> {
  return apiRequest<LabConfig>("/lab/settings/config/", { signal });
}

export function saveLabConfig(body: LabConfigInput): Promise<LabConfig> {
  return apiRequest<LabConfig>("/lab/settings/config/", { method: "PUT", body });
}

// ── Заказы ─────────────────────────────────────────────────────────────────

export interface LabOrderRaw {
  id: number;
  patientId: number;
  patientName: string;
  branchName: string;
  status: string;
  /** `null` — суммы скрыты: у сотрудника нет права `finance.view`. */
  totalAmount: string | null;
  lisOrderCode: number | null;
  titles?: string[];
  /** Кто оформил заказ в CRM; пусто у старых заказов без автора. */
  createdByName?: string;
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
  createdByName: string;
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
  const amount = Number.parseFloat(raw.totalAmount ?? "");
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
    createdByName: raw.createdByName ?? "",
    createdAt: raw.createdAt,
  };
}

export interface LabOrderLineInput {
  testId: number;
  count: number;
  express: boolean;
  /** Приносной: пациент принёс биоматериал сам, расходники не нужны. */
  broughtIn?: boolean;
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
  /**
   * Направивший врач — сотрудник той же организации. Обязателен, когда в
   * корзине есть анализ с `requiresDoctor`: такие лаборатория делает только
   * по направлению.
   */
  referringDoctorId?: number;
  /**
   * Тип клиента из справочника ЛИС — источник скидки. Его процент обязан
   * совпадать с `discountPercent`, иначе бэкенд ответит отказом. Пусто —
   * тип с нулевой скидкой.
   */
  clientTypeId?: number;
  /**
   * Согласие пациента на обработку персональных данных. Без него бэкенд
   * отвергает приём: заказ уезжает в стороннюю лабораторию с ФИО и ИНН.
   */
  personalDataConsent: boolean;
  /**
   * SMS от лаборатории о готовности результата — та же галочка, что в
   * интерфейсе ЛИС (`orderDTO.@receiver_sms`). Нужен телефон в карте.
   */
  receiverSms?: boolean;
  /** Почта для результатов (`patientDTO.email`); в карте пациента её нет. */
  resultEmail?: string;
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
  /** `null` — цена скрыта (нет `finance.view`). */
  price: string | null;
  countItem: number;
  isExpress: boolean;
  isBroughtIn: boolean;
}

export interface LabOrderInstrumentDetail {
  id: number;
  instrumentId: number;
  titleSnapshot: string;
  /** `null` — цена скрыта (нет `finance.view`). */
  price: string | null;
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
  /** ФИО направившего врача на момент приёма; пустая строка — без него. */
  referringDoctorName: string;
  /** Когда отмечено согласие на обработку ПДн; null у старых заказов. */
  personalDataConsentAt: string | null;
  receiverSms?: boolean;
  resultEmail?: string;
  discountPercent: number;
  /** Суммы `null` — скрыты: у сотрудника нет права `finance.view`. */
  totalAmount: string | null;
  paidCash: string | null;
  paidCard: string | null;
  lisOrderId: number | null;
  lisOrderCode: number | null;
  dispatchedAt: string | null;
  dispatchError: string;
  createdAt: string;
  lines: LabOrderLineDetail[];
  instruments: LabOrderInstrumentDetail[];
  createdByName?: string;
  answers: LabOrderAnswerDetail[];
}

/** Ответ на обязательный вопрос ЛИС, как сохранён в заказе. */
export interface LabOrderAnswerDetail {
  id: number;
  lisQuestionId: number;
  title: string;
  fieldType: string;
  value: string;
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
  /** ФИО направившего врача на момент приёма; пустая строка — без него. */
  referringDoctorName: string;
  /** Когда отмечено согласие на обработку ПДн; null у старых заказов. */
  personalDataConsentAt: string | null;
  /** SMS о готовности от лаборатории — как заказано при приёме. */
  receiverSms: boolean;
  /** Почта для результатов, если указали при приёме. */
  resultEmail: string;
  discountPercent: number;
  /**
   * Суммы видны этому сотруднику (`finance.view`). Без права бэкенд
   * отдаёт `null`, ниже они превращаются в нули — печатать такие нули на
   * регистрационном листе нельзя, поэтому флаг нужен отдельно.
   */
  financeVisible: boolean;
  totalAmount: number;
  paidCash: number;
  paidCard: number;
  lisOrderId: number | null;
  lisOrderCode: number | null;
  dispatchedAt: string | null;
  dispatchError: string;
  createdAt: string;
  createdByName: string;
  lines: LabOrderLineDetail[];
  instruments: LabOrderInstrumentDetail[];
  /** Ответы на вопросы ЛИС — печатаются на регистрационном листе, как у ЛИС. */
  answers: LabOrderAnswerDetail[];
}

/** Decimal-строка бэка → число; мусор (NaN, Infinity) считаем нулём, не даём ему течь в formatKGS. */
function parseMoney(raw: string | null): number {
  const n = Number.parseFloat(raw ?? "");
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
    referringDoctorName: raw.referringDoctorName ?? "",
    personalDataConsentAt: raw.personalDataConsentAt ?? null,
    receiverSms: raw.receiverSms ?? false,
    resultEmail: raw.resultEmail ?? "",
    discountPercent: raw.discountPercent,
    financeVisible: raw.totalAmount != null,
    totalAmount: parseMoney(raw.totalAmount),
    paidCash: parseMoney(raw.paidCash),
    paidCard: parseMoney(raw.paidCard),
    lisOrderId: raw.lisOrderId,
    lisOrderCode: raw.lisOrderCode,
    dispatchedAt: raw.dispatchedAt,
    dispatchError: raw.dispatchError,
    createdAt: raw.createdAt,
    createdByName: raw.createdByName ?? "",
    lines: raw.lines,
    instruments: raw.instruments,
    answers: raw.answers ?? [],
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
