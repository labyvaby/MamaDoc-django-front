import {
  MAX_DELAY_MINUTES,
  OPERATORS_WITHOUT_VALUE,
  OPERATORS_WITH_LIST_VALUE,
  isConditionGroup,
  isEmptyConditions,
  type Automation,
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
  body: string;
}

export interface AutomationForm {
  name: string;
  eventCode: string;
  status: AutomationStatus;
  branchId: number | null;
  /** null — «без условий» (`{}` в API). */
  conditions: ConditionNodeForm | null;
  actions: ActionForm[];
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
    actions: automation.actions.map((action) => ({
      key: nextKey(),
      actionType: action.actionType,
      delayMinutes: String(action.delayMinutes),
      channel: String(action.config.channel ?? "sms"),
      recipientField: String(action.config.recipientField ?? "client_phone"),
      body: String(action.config.body ?? ""),
    })),
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
    actions: form.actions.map((action) => ({
      actionType: action.actionType,
      delayMinutes: Number(action.delayMinutes) || 0,
      config: {
        channel: action.channel,
        recipientField: action.recipientField,
        body: action.body,
      },
    })),
    ...(organizationId != null ? { organizationId } : {}),
  };
}

export interface FormErrors {
  name?: string;
  eventCode?: string;
  actions?: string;
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
  if (form.conditions) walk(form.conditions);

  for (const action of form.actions) {
    const fieldErrors: Record<string, string> = {};
    if (!action.body.trim()) fieldErrors.body = labels.bodyRequired;
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

export function hasErrors(errors: FormErrors): boolean {
  return Boolean(
    errors.name ||
      errors.eventCode ||
      errors.actions ||
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
  return Boolean(event?.fields.some((field) => field.code === "branch_id"));
}

/** Черновик payload для dry run: все переменные события пустыми строками. */
export function samplePayload(
  event: AutomationCatalogEvent | undefined,
): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const variable of event?.variables ?? []) payload[variable] = "";
  for (const field of event?.fields ?? []) {
    if (!(field.code in payload)) payload[field.code] = "";
  }
  return payload;
}
