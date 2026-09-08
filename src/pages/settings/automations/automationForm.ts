import {
  MAX_DELAY_MINUTES,
  MAX_INTERVAL_DAYS,
  PROFICHAT_PUSH_CHANNEL,
  OPERATORS_WITHOUT_VALUE,
  OPERATORS_WITH_LIST_VALUE,
  isConditionGroup,
  isEmptyConditions,
  isScheduledEvent,
  type Automation,
  type AutomationSchedule,
  type AutomationCatalogEvent,
  type AutomationConditionNode,
  type AutomationConditions,
  type AutomationSaveInput,
  type AutomationStatus,
} from "../../../api/automations";

/**
 * Модель формы конструктора автоматизаций.
 *
 * Дерево условий в API анонимно (`{operator, items}` / `{field, operator,
 * value}`), а React-списку нужен стабильный ключ: без него удаление узла
 * посреди группы перемонтирует соседей и сбросит фокус в их полях. Поэтому в
 * форме у каждого узла есть локальный `key`, который никогда не уходит на
 * бэк — `toConditions` его снимает.
 */

let keySeq = 0;
const nextKey = (): string => `n${(keySeq += 1)}`;

export interface ConditionLeafForm {
  key: string;
  kind: "leaf";
  field: string;
  operator: string;
  /** Скаляр или список — форма всегда хранит строки, приведение при отправке. */
  value: string;
  values: string[];
}

export interface ConditionGroupForm {
  key: string;
  kind: "group";
  operator: string;
  items: ConditionNodeForm[];
}

export type ConditionNodeForm = ConditionLeafForm | ConditionGroupForm;

export interface ActionForm {
  key: string;
  actionType: string;
  delayMinutes: string;
  channel: string;
  recipientField: string;
  /** Телефон получателя у правила по расписанию; иначе не используется. */
  recipientPhone: string;
  /** Заголовок push-уведомления. Для SMS и WhatsApp не используется. */
  title: string;
  body: string;
}

/**
 * Периодичность в виде формы: числа здесь строками, как и везде в этом
 * конструкторе, — пользователь стирает поле целиком, и `0` вместо пустоты
 * подставлять нельзя.
 */
export interface ScheduleForm {
  kind: "weekly" | "interval_days";
  /** «ЧЧ:ММ», как отдаёт `<input type="time">`. */
  time: string;
  /** 0 = понедельник. */
  weekdays: number[];
  intervalDays: string;
}

export interface AutomationForm {
  name: string;
  eventCode: string;
  status: AutomationStatus;
  branchId: number | null;
  /** null — «без условий» (`{}` в API). */
  conditions: ConditionNodeForm | null;
  /** Заполнено всегда, но уходит на бэк только у правила по расписанию. */
  schedule: ScheduleForm;
  actions: ActionForm[];
}

/** Периодичность по умолчанию: каждый понедельник в 10:00. */
export function emptySchedule(): ScheduleForm {
  return { kind: "weekly", time: "10:00", weekdays: [0], intervalDays: "2" };
}

/** Правило запускается расписанием, а не событием домена. */
export function isScheduledForm(form: AutomationForm): boolean {
  return isScheduledEvent(form.eventCode);
}

export function makeLeaf(field: string, operator: string): ConditionLeafForm {
  return { key: nextKey(), kind: "leaf", field, operator, value: "", values: [] };
}

export function makeGroup(operator: string): ConditionGroupForm {
  return { key: nextKey(), kind: "group", operator, items: [] };
}

export function makeAction(recipientField: string): ActionForm {
  return {
    key: nextKey(),
    actionType: "send_message",
    delayMinutes: "0",
    channel: "sms",
    recipientField,
    recipientPhone: "",
    title: "",
    body: "",
  };
}

/** Пустая форма для «Создать автоматизацию». */
export function emptyForm(event: AutomationCatalogEvent | undefined): AutomationForm {
  return {
    name: "",
    eventCode: event?.code ?? "",
    status: "draft",
    branchId: null,
    conditions: null,
    schedule: emptySchedule(),
    actions: [makeAction(defaultRecipientField(event))],
  };
}

/** Получатель по умолчанию: `client_phone`, если событие такую переменную даёт. */
export function defaultRecipientField(
  event: AutomationCatalogEvent | undefined,
): string {
  if (!event) return "client_phone";
  return event.variables.includes("client_phone")
    ? "client_phone"
    : event.variables[0] ?? "";
}

function conditionsToForm(node: AutomationConditionNode): ConditionNodeForm {
  if (isConditionGroup(node)) {
    return {
      key: nextKey(),
      kind: "group",
      operator: node.operator,
      items: node.items.map(conditionsToForm),
    };
  }
  const raw = node.value;
  return {
    key: nextKey(),
    kind: "leaf",
    field: node.field,
    operator: node.operator,
    value: Array.isArray(raw) ? "" : raw == null ? "" : String(raw),
    values: Array.isArray(raw) ? raw.map((item) => String(item)) : [],
  };
}

export function automationToForm(automation: Automation): AutomationForm {
  return {
    name: automation.name,
    eventCode: automation.eventCode,
    status: automation.status,
    branchId: automation.branchId,
    conditions: isEmptyConditions(automation.conditions)
      ? null
      : conditionsToForm(automation.conditions as AutomationConditionNode),
    schedule: scheduleToForm(automation.schedule),
    actions: automation.actions.map((action) => ({
      key: nextKey(),
      actionType: action.actionType,
      delayMinutes: String(action.delayMinutes),
      channel: String(action.config.channel ?? "sms"),
      recipientField: String(action.config.recipientField ?? "client_phone"),
      recipientPhone: String(action.config.recipientPhone ?? ""),
      title: String(action.config.title ?? ""),
      body: String(action.config.body ?? ""),
    })),
  };
}

/**
 * Расписание из API в форму. У правила по событию его нет вовсе — тогда
 * подставляем значения по умолчанию, чтобы переключение события на
 * «По расписанию» открывало заполненные поля, а не пустые.
 */
function scheduleToForm(
  schedule: Automation["schedule"] | undefined,
): ScheduleForm {
  const fallback = emptySchedule();
  if (!schedule || !("kind" in schedule)) return fallback;
  const value = schedule as AutomationSchedule;
  return {
    kind: value.kind === "interval_days" ? "interval_days" : "weekly",
    time: value.time || fallback.time,
    weekdays: Array.isArray(value.weekdays) && value.weekdays.length
      ? [...value.weekdays].sort((a, b) => a - b)
      : fallback.weekdays,
    intervalDays: String(value.intervalDays ?? fallback.intervalDays),
  };
}

/** Форма расписания в тело запроса. Вызывать только для правила-расписания. */
export function toSchedule(form: AutomationForm): AutomationSchedule {
  const { schedule } = form;
  if (schedule.kind === "interval_days") {
    return {
      kind: "interval_days",
      time: schedule.time,
      intervalDays: Number(schedule.intervalDays) || 1,
    };
  }
  return {
    kind: "weekly",
    time: schedule.time,
    weekdays: [...schedule.weekdays].sort((a, b) => a - b),
  };
}

function leafToApi(leaf: ConditionLeafForm): AutomationConditionNode {
  if (OPERATORS_WITHOUT_VALUE.has(leaf.operator)) {
    return { field: leaf.field, operator: leaf.operator };
  }
  if (OPERATORS_WITH_LIST_VALUE.has(leaf.operator)) {
    // `in`/`not_in` всегда массив, даже с одним элементом — бэк скаляр отклонит.
    return { field: leaf.field, operator: leaf.operator, value: leaf.values };
  }
  return { field: leaf.field, operator: leaf.operator, value: leaf.value };
}

function nodeToApi(node: ConditionNodeForm): AutomationConditionNode {
  return node.kind === "group"
    ? { operator: node.operator, items: node.items.map(nodeToApi) }
    : leafToApi(node);
}

export function toConditions(form: AutomationForm): AutomationConditions {
  // У расписания условий не бывает: проверять их не на чем, и бэк такое
  // правило отклоняет целиком.
  if (isScheduledForm(form)) return {};
  return form.conditions ? nodeToApi(form.conditions) : {};
}

export function toSaveInput(
  form: AutomationForm,
  organizationId?: number,
): AutomationSaveInput {
  return {
    name: form.name.trim(),
    eventCode: form.eventCode,
    status: form.status,
    branchId: form.branchId,
    conditions: toConditions(form),
    ...(isScheduledForm(form) ? { schedule: toSchedule(form) } : {}),
    actions: form.actions.map((action) => ({
      actionType: action.actionType,
      delayMinutes: Number(action.delayMinutes) || 0,
      config: {
        channel: action.channel,
        // Получатель у расписания — конкретный номер, у события — переменная
        // payload. Класть в конфиг оба ключа незачем: бэк читает ровно тот,
        // что соответствует типу правила.
        ...(isScheduledForm(form)
          ? { recipientPhone: action.recipientPhone }
          : { recipientField: action.recipientField }),
        body: action.body,
        // Заголовок хранится только там, где он есть: у SMS и WhatsApp его
        // нет вовсе, и пустой ключ в конфиге лишь путал бы при чтении правила.
        ...(supportsTitle(action.channel) ? { title: action.title } : {}),
      },
    })),
    ...(organizationId != null ? { organizationId } : {}),
  };
}

export interface FormErrors {
  name?: string;
  eventCode?: string;
  actions?: string;
  schedule?: string;
  /** Ключ узла условия → текст ошибки. */
  conditions: Record<string, string>;
  /** Ключ действия → поле → текст ошибки. */
  actionFields: Record<string, Record<string, string>>;
}

export interface ValidationLabels {
  nameRequired: string;
  eventRequired: string;
  actionsRequired: string;
  valueRequired: string;
  emptyGroup: string;
  unknownField: (code: string) => string;
  bodyRequired: string;
  delayRange: string;
  weekdaysRequired: string;
  intervalRange: string;
  timeRequired: string;
  phoneRequired: string;
}

/**
 * Локальная проверка перед отправкой. Бэк проверяет то же самое и вернёт
 * `VALIDATION_ERROR`, но пользователю дешевле увидеть ошибку под полем, чем
 * получить общий тост после круга по сети.
 */
export function validateForm(
  form: AutomationForm,
  event: AutomationCatalogEvent | undefined,
  labels: ValidationLabels,
): FormErrors {
  const errors: FormErrors = { conditions: {}, actionFields: {} };

  if (!form.name.trim()) errors.name = labels.nameRequired;
  if (!form.eventCode) errors.eventCode = labels.eventRequired;
  if (form.actions.length === 0) errors.actions = labels.actionsRequired;

  const scheduled = isScheduledForm(form);
  if (scheduled) errors.schedule = scheduleError(form.schedule, labels);

  const knownFields = new Set((event?.fields ?? []).map((field) => field.code));
  const walk = (node: ConditionNodeForm): void => {
    if (node.kind === "group") {
      if (node.items.length === 0) errors.conditions[node.key] = labels.emptyGroup;
      node.items.forEach(walk);
      return;
    }
    if (!knownFields.has(node.field)) {
      errors.conditions[node.key] = labels.unknownField(node.field);
      return;
    }
    if (OPERATORS_WITHOUT_VALUE.has(node.operator)) return;
    const filled = OPERATORS_WITH_LIST_VALUE.has(node.operator)
      ? node.values.length > 0
      : node.value.trim() !== "";
    if (!filled) errors.conditions[node.key] = labels.valueRequired;
  };
  if (form.conditions && !scheduled) walk(form.conditions);

  for (const action of form.actions) {
    const fieldErrors: Record<string, string> = {};
    if (!action.body.trim()) fieldErrors.body = labels.bodyRequired;
    if (scheduled && !action.recipientPhone.trim()) {
      fieldErrors.recipientPhone = labels.phoneRequired;
    }
    const delay = Number(action.delayMinutes);
    if (
      action.delayMinutes.trim() === "" ||
      !Number.isFinite(delay) ||
      !Number.isInteger(delay) ||
      delay < 0 ||
      delay > MAX_DELAY_MINUTES
    ) {
      fieldErrors.delayMinutes = labels.delayRange;
    }
    if (Object.keys(fieldErrors).length) errors.actionFields[action.key] = fieldErrors;
  }

  return errors;
}

/** Ошибка периодичности или `undefined`, если она заполнена верно. */
function scheduleError(
  schedule: ScheduleForm,
  labels: ValidationLabels,
): string | undefined {
  if (!/^\d{2}:\d{2}$/.test(schedule.time)) return labels.timeRequired;
  if (schedule.kind === "weekly") {
    return schedule.weekdays.length ? undefined : labels.weekdaysRequired;
  }
  const interval = Number(schedule.intervalDays);
  const valid =
    schedule.intervalDays.trim() !== "" &&
    Number.isInteger(interval) &&
    interval >= 1 &&
    interval <= MAX_INTERVAL_DAYS;
  return valid ? undefined : labels.intervalRange;
}

export function hasErrors(errors: FormErrors): boolean {
  return Boolean(
    errors.name ||
      errors.eventCode ||
      errors.actions ||
      errors.schedule ||
      Object.keys(errors.conditions).length ||
      Object.keys(errors.actionFields).length,
  );
}

/** Глубина дерева условий: корень = 1. Бэк отклоняет узлы глубже 4. */
export function nodeDepth(node: ConditionNodeForm): number {
  if (node.kind === "leaf") return 1;
  return 1 + node.items.reduce((max, item) => Math.max(max, nodeDepth(item)), 0);
}

/** Заменить узел в дереве по ключу (иммутабельно). */
export function replaceNode(
  root: ConditionNodeForm,
  key: string,
  patch: (node: ConditionNodeForm) => ConditionNodeForm,
): ConditionNodeForm {
  if (root.key === key) return patch(root);
  if (root.kind === "group") {
    return { ...root, items: root.items.map((item) => replaceNode(item, key, patch)) };
  }
  return root;
}

/** Удалить узел по ключу. `null` — удалён корень. */
export function removeNode(
  root: ConditionNodeForm,
  key: string,
): ConditionNodeForm | null {
  if (root.key === key) return null;
  if (root.kind === "group") {
    return {
      ...root,
      items: root.items
        .map((item) => removeNode(item, key))
        .filter((item): item is ConditionNodeForm => item !== null),
    };
  }
  return root;
}

/**
 * Сброс условий и получателей, несовместимых с новым событием.
 *
 * При смене события каталог даёт другой набор полей и переменных. Оставить
 * старое поле нельзя: бэк отклонит сохранение целиком, а пользователь не
 * поймёт, какое из условий виновато.
 */
export function retargetForm(
  form: AutomationForm,
  event: AutomationCatalogEvent | undefined,
): { form: AutomationForm; changed: boolean } {
  const fields = new Set((event?.fields ?? []).map((field) => field.code));
  const variables = new Set(event?.variables ?? []);
  let changed = false;

  const prune = (node: ConditionNodeForm): ConditionNodeForm | null => {
    if (node.kind === "leaf") {
      if (fields.has(node.field)) return node;
      changed = true;
      return null;
    }
    const items = node.items
      .map(prune)
      .filter((item): item is ConditionNodeForm => item !== null);
    if (items.length === 0) {
      changed = true;
      return null;
    }
    return { ...node, items };
  };

  const conditions = form.conditions ? prune(form.conditions) : null;
  const fallbackRecipient = defaultRecipientField(event);
  const actions = form.actions.map((action) => {
    if (variables.has(action.recipientField)) return action;
    changed = true;
    return { ...action, recipientField: fallbackRecipient };
  });

  return {
    form: { ...form, eventCode: event?.code ?? "", conditions, actions },
    changed,
  };
}

/**
 * Событие без `branch_id` в payload не поддерживает фильтр по филиалу — выбор
 * нужно скрыть, а `branchId` держать `null` (docs/automations-api.md §5).
 */
export function supportsBranchFilter(
  event: AutomationCatalogEvent | undefined,
): boolean {
  // У расписания payload нет вовсе, но филиал ему нужен: от него зависят
  // часовой пояс срабатывания и переменная «Название филиала».
  if (event && isScheduledEvent(event.code)) return true;
  return Boolean(event?.fields.some((field) => field.code === "branch_id"));
}

/**
 * Есть ли у канала заголовок.
 *
 * Push показывается в шторке телефона двумя строками, поэтому у него есть
 * заголовок; SMS и WhatsApp — один сплошной текст, и заголовку там взяться
 * неоткуда.
 */
export function supportsTitle(channel: string): boolean {
  return channel === PROFICHAT_PUSH_CHANNEL;
}

/** Черновик payload для dry run: все переменные события пустыми строками. */
export function samplePayload(
  event: AutomationCatalogEvent | undefined,
  form?: AutomationForm,
): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const variable of event?.variables ?? []) payload[variable] = "";
  // Скрытые поля (ID-шные ссылки) в форму прогона не выносим: условие на них
  // теперь не собрать, а руками вводить service_id незачем. Исключение —
  // старое правило, где такое условие уже сохранено: без поля его нельзя
  // было бы проверить.
  const usedInConditions = form ? conditionFieldCodes(form.conditions) : new Set<string>();
  for (const field of event?.fields ?? []) {
    if (field.code in payload) continue;
    if (field.hidden && !usedInConditions.has(field.code)) continue;
    payload[field.code] = "";
  }
  return payload;
}

/** Коды полей, на которые ссылается дерево условий. */
function conditionFieldCodes(node: ConditionNodeForm | null): Set<string> {
  const codes = new Set<string>();
  const walk = (item: ConditionNodeForm): void => {
    if (item.kind === "group") item.items.forEach(walk);
    else codes.add(item.field);
  };
  if (node) walk(node);
  return codes;
}

/** Зачем поле нужно в пробном прогоне — показывается подписью под полем. */
export type PayloadFieldRole = "condition" | "recipient" | "template";

/** Переменные, встречающиеся в шаблоне: `{{code}}` и `{{ code }}`. */
export function templateVariables(body: string): string[] {
  return [...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]);
}

/**
 * Поля payload, которые реально влияют на результат прогона, с указанием роли.
 *
 * Событие даёт полтора десятка полей, и форма из шестнадцати пустых строк не
 * говорит, что заполнять. Значение имеют только три группы: поля из условий
 * (от них зависит совпадение), получатель (иначе отправка провалится) и
 * переменные, подставляемые в текст. Остальное на прогон не влияет вовсе.
 */
export function relevantPayloadFields(
  form: AutomationForm,
): Map<string, PayloadFieldRole[]> {
  const roles = new Map<string, PayloadFieldRole[]>();
  const add = (code: string, role: PayloadFieldRole) => {
    if (!code) return;
    const list = roles.get(code) ?? [];
    if (!list.includes(role)) list.push(role);
    roles.set(code, list);
  };

  const walk = (node: ConditionNodeForm): void => {
    if (node.kind === "group") node.items.forEach(walk);
    else add(node.field, "condition");
  };
  if (form.conditions) walk(form.conditions);

  const scheduled = isScheduledForm(form);
  for (const action of form.actions) {
    // У расписания получатель — введённый номер, а не поле payload: в форме
    // прогона ему делать нечего.
    if (!scheduled) add(action.recipientField, "recipient");
    templateVariables(action.body).forEach((code) => add(code, "template"));
    if (supportsTitle(action.channel)) {
      templateVariables(action.title).forEach((code) => add(code, "template"));
    }
  }
  return roles;
}
