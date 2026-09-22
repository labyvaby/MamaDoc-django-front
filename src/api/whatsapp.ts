import { apiRequest } from "./client";
import { scopeParams, type Scope } from "./scope";

/**
 * WhatsApp организации: подключение к Raven и зеркало каталога шаблонов.
 *
 * Контракт — `docs/whatsapp-templates-mvp.md` в backend-репозитории. Модель
 * MVP: шаблоны создаются и согласовываются в WhatsApp Manager, Raven
 * синхронизирует их и отправляет, CRM только выбирает шаблон в автоматизации
 * и подставляет данные. Текста сообщения здесь нет и быть не может — Meta
 * принимает только одобренный шаблон.
 *
 * Подключение — самообслуживание: администратор организации вводит пять
 * значений из Meta (WABA ID, Phone number ID, токен, App ID, App secret),
 * CRM относит их в Raven и не хранит; Raven проверяет токен, создаёт
 * подключение, сам прописывает свой вебхук в приложении организации и
 * подписывает приложение на WABA. Итог этой настройки приходит в
 * `connection.setup`. Привязка через список подключений Raven остаётся
 * суперадмину как ремонтный путь.
 */

const BASE = "/v2/notifications/whatsapp";

/** Локальный переключатель привязки; статус самого Raven приходит отдельно. */
export type WhatsAppConnectionStatus = "active" | "disabled";

/**
 * Вердикт Meta по шаблону, как его передал Raven. Отправлять можно только
 * `APPROVED`; остальные статусы объясняются в `problemLabel`.
 */
export type WhatsAppTemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | (string & {});

/**
 * Подключение организации глазами интерфейса.
 *
 * `configured: false` — привязки нет вовсе, тогда остальных полей не будет.
 * `usable` требует сразу трёх вещей: привязка включена здесь, Raven отвечает
 * `active`, и номер в Raven помечен этой же организацией. Иначе `problem`
 * несёт машинный код, а `problemLabel` — готовую фразу для экрана.
 */
export interface WhatsAppConnectionInfo {
  configured: boolean;
  usable: boolean;
  problem: string;
  problemLabel: string;
  ravenConnectionId?: string;
  status?: WhatsAppConnectionStatus | string;
  ravenStatus?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  wabaId?: string;
  qualityRating?: string;
  ravenLastError?: string;
  ravenCheckedAt?: string | null;
  syncedAt?: string | null;
  lastSyncError?: string;
  templatesSyncedAt?: string | null;
  /** Состояние настройки Meta со стороны Raven; есть у каждого подключения. */
  setup?: WhatsAppSetupInfo;
}

/**
 * Как далеко Raven продвинулся в настройке приложения Meta организации.
 *
 * `webhookConfirmed` — единственное, что важно по-настоящему: Meta дёрнула
 * callback URL Raven, значит статусы доставки и вердикты по шаблонам будут
 * приходить. Пока его нет, экран показывает `webhookUrl` и
 * `webhookVerifyToken` для ручного ввода в App Dashboard и причину, по
 * которой автоматика не прошла.
 */
export interface WhatsAppSetupInfo {
  appId: string;
  webhookUrl: string;
  webhookVerifyToken: string;
  /** Raven прописал callback URL в приложении через Graph API. */
  webhookRegistered: boolean;
  webhookRegisteredAt: string | null;
  /** Meta прошла проверку URL — вебхук живой. */
  webhookConfirmed: boolean;
  webhookVerifiedAt: string | null;
  webhookError: string;
  /** Приложение подписано на события WABA (без этого Meta ничего не шлёт). */
  appSubscribed: boolean;
  appSubscribedAt: string | null;
  appSubscriptionError: string;
}

/**
 * Одно слово о настройке Meta — для чипа на карточке подключения.
 *
 * `noApp` — подключение без пары App ID + App secret: Raven'у некуда
 * прописать вебхук, это не ошибка, а осознанное «пока без статусов».
 */
export type WhatsAppSetupState = "confirmed" | "pending" | "failed" | "noApp";

export function setupState(setup: WhatsAppSetupInfo | undefined): WhatsAppSetupState {
  if (!setup) return "pending";
  if (setup.webhookConfirmed && setup.appSubscribed) return "confirmed";
  if (!setup.appId) return "noApp";
  if (setup.webhookError || setup.appSubscriptionError) return "failed";
  return "pending";
}

/**
 * Форма «Подключить WhatsApp»: три значения из Meta, по желанию пара
 * App ID + App secret (только вместе — без неё вебхука не будет) и подпись.
 */
export interface WhatsAppConnectInput {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  appId?: string;
  appSecret?: string;
  displayName?: string;
  displayPhoneNumber?: string;
  organizationId?: number;
}

/** Одна строка зеркала каталога — то, что Raven знает о шаблоне Meta. */
export interface WhatsAppTemplate {
  /** ID шаблона в Raven — именно он сохраняется в правиле (`templateId`). */
  id: string;
  metaTemplateId: string;
  name: string;
  language: string;
  category: string;
  status: WhatsAppTemplateStatus;
  /** Текст BODY с позиционными `{{1}}..{{n}}`. */
  bodyText: string;
  /** Сколько параметров ждёт шаблон; столько же привязок должно быть в правиле. */
  parameterCount: number;
  /** MVP поддерживает только текст с позиционными параметрами. */
  supported: boolean;
  unsupportedReason: string;
  rejectionReason: string;
  /** Meta всё ещё отдаёт шаблон; удалённые остаются в истории как недоступные. */
  available: boolean;
  /** Одобрен ∧ поддерживается ∧ доступен — можно активировать правило. */
  sendable: boolean;
  problem: string;
  problemLabel: string;
  syncedAt: string | null;
}

export interface WhatsAppParameterSource {
  code: string;
  label: string;
}

/** Итог «Обновить шаблоны»: что Raven увидел в Meta и что изменилось в зеркале. */
export interface WhatsAppSyncResult {
  templatesSeen?: number;
  created?: number;
  updated?: number;
  removed?: number;
}

/** Ответ экрана «Настройки → WhatsApp» и результата обновления/привязки. */
export interface WhatsAppSettings {
  organizationId: number;
  connection: WhatsAppConnectionInfo;
  templates: WhatsAppTemplate[];
  syncResult: WhatsAppSyncResult;
  /** Привязка сделана, но первый синк не удался — причина словами. */
  syncError: string;
  /** Подсказка про WhatsApp Manager, готовая к показу. */
  hint: string;
}

/** Подключение в проекте Raven — список для выбора суперадмином. */
export interface RavenConnection {
  id: string;
  displayName: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  wabaId: string | null;
  status: string | null;
  /** Чем номер помечен в Raven; должно совпадать с id организации. */
  externalOrganizationId: string | null;
  /** К какой организации CRM подключение уже привязано здесь. */
  boundOrganizationId: number | null;
}

export interface WhatsAppBindInput {
  ravenConnectionId: string;
  status: WhatsAppConnectionStatus;
  organizationId?: number;
}

/**
 * Скоуп: организация уходит в query (`organizationId`) — бэк принимает и
 * заголовок, и этот параметр, а остальные модули фронта уже используют
 * параметр. Без него суперадмин получит не ту организацию, что на экране.
 */
function orgQuery(scope: Scope): string {
  const qs = scopeParams({ organizationId: scope.organizationId }).toString();
  return qs ? `?${qs}` : "";
}

export function getWhatsAppSettings(
  scope: Scope = {},
  signal?: AbortSignal,
): Promise<WhatsAppSettings> {
  return apiRequest<WhatsAppSettings>(`${BASE}/${orgQuery(scope)}`, { signal });
}

/**
 * «Обновить шаблоны»: Raven перечитывает каталог из Meta, CRM обновляет
 * зеркало. Если Raven не ответил — 502 `RAVEN_UNAVAILABLE` с его причиной,
 * зеркало остаётся прежним.
 */
export function syncWhatsAppTemplates(
  scope: Scope = {},
  signal?: AbortSignal,
): Promise<WhatsAppSettings> {
  return apiRequest<WhatsAppSettings>(`${BASE}/templates/sync/${orgQuery(scope)}`, {
    method: "POST",
    body: {},
    signal,
  });
}

/**
 * Подключить WhatsApp по данным из Meta. Токен и secret только проходят
 * через CRM. Отказы Raven приходят как VALIDATION_ERROR по полям формы
 * (`accessToken` — Meta не приняла, `wabaId` / `phoneNumberId` — уже
 * подключены), недоступность Raven — 502 `RAVEN_UNAVAILABLE`.
 */
export function connectWhatsApp(
  input: WhatsAppConnectInput,
  signal?: AbortSignal,
): Promise<WhatsAppSettings> {
  const scope = orgQuery({ organizationId: input.organizationId });
  return apiRequest<WhatsAppSettings>(`${BASE}/connect/${scope}`, {
    method: "POST",
    body: input,
    signal,
  });
}

/** Повторить настройку Meta (вебхук, подписка, каталог) с данными, сохранёнными в Raven. */
export function retryWhatsAppSetup(
  scope: Scope = {},
  signal?: AbortSignal,
): Promise<WhatsAppSettings> {
  return apiRequest<WhatsAppSettings>(`${BASE}/setup/${orgQuery(scope)}`, {
    method: "POST",
    body: {},
    signal,
  });
}

/** Только superadmin: подключения проекта Raven с пометкой, кто их уже занял. */
export function getRavenConnections(signal?: AbortSignal): Promise<RavenConnection[]> {
  return apiRequest<RavenConnection[]>(`${BASE}/raven-connections/`, { signal });
}

/** Только superadmin: привязать организацию к подключению и сразу синхронизировать. */
export function bindWhatsAppConnection(
  input: WhatsAppBindInput,
  signal?: AbortSignal,
): Promise<WhatsAppSettings> {
  const scope = orgQuery({ organizationId: input.organizationId });
  return apiRequest<WhatsAppSettings>(`${BASE}/connection/${scope}`, {
    method: "PUT",
    body: input,
    signal,
  });
}

/** Плейсхолдеры `{{1}}..{{n}}` в тексте шаблона — в порядке появления. */
const PLACEHOLDER = /\{\{(\d+)\}\}/g;

/**
 * Подставить значения в текст шаблона так же, как это делает бэк в dry-run:
 * `{{i}}` → `values[i-1]`, отсутствующее значение — пустая строка.
 */
export function renderTemplatePreview(bodyText: string, values: string[]): string {
  return bodyText.replace(PLACEHOLDER, (_match, index: string) => {
    const position = Number(index) - 1;
    return position >= 0 && position < values.length ? values[position] : "";
  });
}

/**
 * Разбить текст шаблона на куски «текст» / «плейсхолдер», чтобы подсветить
 * `{{n}}` в предпросмотре. Номер — как в шаблоне, с единицы.
 */
export type TemplateBodyPart =
  | { kind: "text"; text: string }
  | { kind: "placeholder"; index: number };

export function splitTemplateBody(bodyText: string): TemplateBodyPart[] {
  const parts: TemplateBodyPart[] = [];
  let last = 0;
  for (const match of bodyText.matchAll(PLACEHOLDER)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: "text", text: bodyText.slice(last, start) });
    parts.push({ kind: "placeholder", index: Number(match[1]) });
    last = start + match[0].length;
  }
  if (last < bodyText.length) parts.push({ kind: "text", text: bodyText.slice(last) });
  return parts;
}
