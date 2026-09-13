import { describe, expect, it } from "vitest";

import {
  PROFICHAT_PUSH_CHANNEL,
  SCHEDULE_EVENT_CODE,
  WHATSAPP_CHANNEL,
  type Automation,
  type AutomationCatalogEvent,
  type AutomationWhatsAppCatalog,
} from "../../../api/automations";
import type { WhatsAppTemplate } from "../../../api/whatsapp";
import {
  automationToForm,
  emptySchedule,
  fitParameters,
  makeGroup,
  makeLeaf,
  needsTemplateSetup,
  nodeDepth,
  relevantPayloadFields,
  removeNode,
  retargetForm,
  samplePayload,
  supportsBranchFilter,
  supportsTitle,
  templateVariables,
  toSaveInput,
  validateForm,
  type ActionForm,
  type AutomationForm,
} from "./automationForm";

const APPOINTMENT_EVENT: AutomationCatalogEvent = {
  code: "appointment.created",
  label: "Запись создана",
  module: "appointments",
  fields: [
    {
      code: "status",
      label: "Статус записи",
      fieldType: "select",
      operators: ["eq", "neq", "in", "not_in", "exists"],
      options: [{ value: "confirmed", label: "Подтверждён" }],
    },
    {
      code: "branch_id",
      label: "Филиал",
      fieldType: "branch",
      operators: ["eq", "in", "exists"],
      options: [],
      hidden: true,
    },
    {
      code: "total_amount",
      label: "Сумма записи",
      fieldType: "decimal",
      operators: ["gte", "lte", "exists"],
      options: [],
    },
  ],
  variables: ["client_name", "client_phone", "employee_phone", "appointment_date"],
  variableLabels: {
    client_name: "ФИО клиента",
    client_phone: "Телефон клиента",
    employee_phone: "Телефон сотрудника",
    appointment_date: "Дата записи",
  },
};

const CLIENT_EVENT: AutomationCatalogEvent = {
  code: "client.created",
  label: "Клиент создан",
  module: "clients",
  fields: [
    {
      code: "client_type",
      label: "Тип клиента",
      fieldType: "select",
      operators: ["eq", "neq"],
      options: [{ value: "company", label: "Юридическое лицо" }],
    },
  ],
  variables: ["client_name", "client_email"],
  variableLabels: { client_name: "ФИО клиента" },
};

const LABELS = {
  nameRequired: "name",
  eventRequired: "event",
  actionsRequired: "actions",
  valueRequired: "value",
  emptyGroup: "empty-group",
  unknownField: (code: string) => `unknown:${code}`,
  bodyRequired: "body",
  delayRange: "delay",
  weekdaysRequired: "weekdays",
  intervalRange: "interval",
  timeRequired: "time",
  phoneRequired: "phone",
  templateRequired: "template",
  templateNotFound: "template-missing",
  activationBlocked: (reason: string) => `blocked:${reason}`,
  parameterCount: (expected: number, actual: number) => `count:${expected}/${actual}`,
  parameterFieldRequired: (index: number) => `field:${index}`,
  parameterValueRequired: (index: number) => `value:${index}`,
  parameterFieldUnknown: (index: number, field: string) => `unknown-field:${index}:${field}`,
};

function baseForm(overrides: Partial<AutomationForm> = {}): AutomationForm {
  return {
    name: "Правило",
    eventCode: "appointment.created",
    status: "active",
    branchId: null,
    conditions: null,
    schedule: emptySchedule(),
    actions: [
      {
        key: "a1",
        actionType: "send_message",
        delayMinutes: "10",
        channel: "sms",
        recipientField: "client_phone",
        recipientPhone: "",
        title: "",
        body: "Здравствуйте, {{client_name}}!",
        templateId: "",
        language: "",
        parameters: [],
      },
    ],
    ...overrides,
  };
}

describe("toSaveInput", () => {
  it("отправляет `{}` когда условий нет", () => {
    expect(toSaveInput(baseForm()).conditions).toEqual({});
  });

  it("для in/not_in кладёт массив, даже с одним элементом", () => {
    const leaf = makeLeaf("status", "in");
    leaf.values = ["confirmed"];
    const input = toSaveInput(baseForm({ conditions: leaf }));
    expect(input.conditions).toEqual({
      field: "status",
      operator: "in",
      value: ["confirmed"],
    });
  });

  it("для exists не отправляет value вовсе", () => {
    const leaf = makeLeaf("status", "exists");
    leaf.value = "мусор";
    expect(toSaveInput(baseForm({ conditions: leaf }))).toMatchObject({
      conditions: { field: "status", operator: "exists" },
    });
    expect(
      Object.keys(toSaveInput(baseForm({ conditions: leaf })).conditions),
    ).not.toContain("value");
  });

  it("не тащит локальные ключи узлов на бэк", () => {
    const group = makeGroup("and");
    group.items = [makeLeaf("status", "eq")];
    const serialized = JSON.stringify(toSaveInput(baseForm({ conditions: group })));
    expect(serialized).not.toContain('"key"');
    expect(serialized).not.toContain('"kind"');
  });

  it("organizationId уходит только когда он известен", () => {
    expect(toSaveInput(baseForm())).not.toHaveProperty("organizationId");
    expect(toSaveInput(baseForm(), 42).organizationId).toBe(42);
  });

  it("собирает config действия из плоских полей формы", () => {
    expect(toSaveInput(baseForm()).actions[0]).toEqual({
      actionType: "send_message",
      delayMinutes: 10,
      config: {
        channel: "sms",
        recipientField: "client_phone",
        body: "Здравствуйте, {{client_name}}!",
      },
    });
  });
});

describe("automationToForm", () => {
  it("разбирает массив value обратно в список значений", () => {
    const automation = {
      id: 1,
      organizationId: 42,
      branchId: null,
      branchName: null,
      name: "Правило",
      eventCode: "appointment.created",
      eventLabel: "Запись создана",
      status: "active",
      conditions: { field: "status", operator: "in", value: ["confirmed", "arrived"] },
      actions: [
        {
          id: 5,
          position: 0,
          actionType: "send_message",
          delayMinutes: 10,
          config: { channel: "sms", recipientField: "client_phone", body: "текст" },
        },
      ],
      createdAt: "2026-08-26T10:00:00+06:00",
      updatedAt: "2026-08-26T10:00:00+06:00",
    } as Automation;

    const form = automationToForm(automation);
    expect(form.conditions).toMatchObject({
      kind: "leaf",
      field: "status",
      values: ["confirmed", "arrived"],
      value: "",
    });
  });

  it("пустые условия становятся null, а не пустым листом", () => {
    const automation = { conditions: {}, actions: [], status: "draft" } as unknown as Automation;
    expect(automationToForm(automation).conditions).toBeNull();
  });
});

describe("retargetForm", () => {
  it("вычищает условия, которых нет у нового события", () => {
    const group = makeGroup("and");
    group.items = [makeLeaf("status", "eq"), makeLeaf("total_amount", "gte")];
    const result = retargetForm(baseForm({ conditions: group }), CLIENT_EVENT);
    expect(result.changed).toBe(true);
    expect(result.form.conditions).toBeNull();
    expect(result.form.eventCode).toBe("client.created");
  });

  it("подменяет получателя, если такой переменной у события нет", () => {
    const result = retargetForm(baseForm(), CLIENT_EVENT);
    expect(result.form.actions[0].recipientField).toBe("client_name");
  });

  it("совместимую форму оставляет без изменений", () => {
    const leaf = makeLeaf("status", "eq");
    leaf.value = "confirmed";
    const result = retargetForm(baseForm({ conditions: leaf }), APPOINTMENT_EVENT);
    expect(result.changed).toBe(false);
    expect(result.form.conditions).toEqual(leaf);
  });
});

describe("validateForm", () => {
  it("требует значение у операторов, которым оно нужно", () => {
    const errors = validateForm(
      baseForm({ conditions: makeLeaf("status", "eq") }),
      APPOINTMENT_EVENT,
      LABELS,
    );
    expect(Object.values(errors.conditions)).toContain("value");
  });

  it("не требует значение у exists", () => {
    const errors = validateForm(
      baseForm({ conditions: makeLeaf("status", "exists") }),
      APPOINTMENT_EVENT,
      LABELS,
    );
    expect(errors.conditions).toEqual({});
  });

  it("ловит пустую группу", () => {
    const errors = validateForm(
      baseForm({ conditions: makeGroup("and") }),
      APPOINTMENT_EVENT,
      LABELS,
    );
    expect(Object.values(errors.conditions)).toContain("empty-group");
  });

  it("ловит поле, отсутствующее у события", () => {
    const errors = validateForm(
      baseForm({ conditions: makeLeaf("client_type", "eq") }),
      APPOINTMENT_EVENT,
      LABELS,
    );
    expect(Object.values(errors.conditions)).toContain("unknown:client_type");
  });

  it("отклоняет задержку вне диапазона и нечисловую", () => {
    const form = baseForm();
    form.actions[0].delayMinutes = "999999999";
    expect(validateForm(form, APPOINTMENT_EVENT, LABELS).actionFields.a1.delayMinutes).toBe(
      "delay",
    );
    form.actions[0].delayMinutes = "";
    expect(validateForm(form, APPOINTMENT_EVENT, LABELS).actionFields.a1.delayMinutes).toBe(
      "delay",
    );
  });

  it("требует непустой текст сообщения", () => {
    const form = baseForm();
    form.actions[0].body = "   ";
    expect(validateForm(form, APPOINTMENT_EVENT, LABELS).actionFields.a1.body).toBe("body");
  });
});

describe("дерево условий", () => {
  it("nodeDepth считает вложенность от 1", () => {
    const inner = makeGroup("or");
    inner.items = [makeLeaf("status", "eq")];
    const outer = makeGroup("and");
    outer.items = [inner];
    expect(nodeDepth(outer)).toBe(3);
  });

  it("removeNode вырезает узел по ключу", () => {
    const leaf = makeLeaf("status", "eq");
    const group = makeGroup("and");
    group.items = [leaf, makeLeaf("total_amount", "gte")];
    const next = removeNode(group, leaf.key);
    expect(next && next.kind === "group" && next.items).toHaveLength(1);
  });
});

describe("templateVariables", () => {
  it("находит переменные с пробелами и без", () => {
    expect(templateVariables("Привет, {{client_name}} и {{ appointment_date }}!")).toEqual([
      "client_name",
      "appointment_date",
    ]);
  });

  it("не считает переменной вложенный путь", () => {
    expect(templateVariables("{{client.name}}")).toEqual([]);
  });
});

describe("relevantPayloadFields", () => {
  it("собирает поля условий, получателя и переменные текста", () => {
    const leaf = makeLeaf("status", "eq");
    leaf.value = "confirmed";
    const roles = relevantPayloadFields(baseForm({ conditions: leaf }));
    expect(roles.get("status")).toEqual(["condition"]);
    expect(roles.get("client_phone")).toEqual(["recipient"]);
    expect(roles.get("client_name")).toEqual(["template"]);
  });

  it("не тянет поля, которые правило не использует", () => {
    const roles = relevantPayloadFields(baseForm());
    expect(roles.has("service_name")).toBe(false);
    expect(roles.has("branch_id")).toBe(false);
  });

  it("одно поле может быть и получателем, и переменной текста", () => {
    const form = baseForm();
    form.actions[0].body = "Ваш номер {{client_phone}}";
    expect(relevantPayloadFields(form).get("client_phone")).toEqual([
      "recipient",
      "template",
    ]);
  });
});


describe("samplePayload", () => {
  it("не выносит в прогон скрытые ID-шные поля", () => {
    const keys = Object.keys(samplePayload(APPOINTMENT_EVENT, baseForm()));
    expect(keys).not.toContain("branch_id");
    expect(keys).toContain("client_phone");
    expect(keys).toContain("total_amount");
  });

  it("возвращает скрытое поле, если оно уже используется в условии", () => {
    const leaf = makeLeaf("branch_id", "eq");
    leaf.value = "3";
    const keys = Object.keys(
      samplePayload(APPOINTMENT_EVENT, baseForm({ conditions: leaf })),
    );
    expect(keys).toContain("branch_id");
  });
});


describe("supportsBranchFilter", () => {
  it("true только для события с branch_id", () => {
    expect(supportsBranchFilter(APPOINTMENT_EVENT)).toBe(true);
    expect(supportsBranchFilter(CLIENT_EVENT)).toBe(false);
    expect(supportsBranchFilter(undefined)).toBe(false);
  });
});

describe("канал ProfiChat push", () => {
  it("заголовок есть только у push", () => {
    expect(supportsTitle(PROFICHAT_PUSH_CHANNEL)).toBe(true);
    expect(supportsTitle("sms")).toBe(false);
    expect(supportsTitle("whatsapp")).toBe(false);
  });

  it("сохраняет заголовок для push", () => {
    const form = baseForm();
    form.actions[0].channel = PROFICHAT_PUSH_CHANNEL;
    form.actions[0].title = "Напоминание";

    const config = toSaveInput(form).actions[0].config;
    expect(config.channel).toBe(PROFICHAT_PUSH_CHANNEL);
    expect(config.title).toBe("Напоминание");
  });

  it("не пишет заголовок в конфиг SMS", () => {
    const form = baseForm();
    form.actions[0].title = "Останется в форме";

    expect(toSaveInput(form).actions[0].config).not.toHaveProperty("title");
  });

  it("читает заголовок сохранённого правила", () => {
    const automation = {
      id: 1,
      organizationId: 1,
      branchId: null,
      name: "Пуш",
      eventCode: "appointment.created",
      status: "active",
      conditions: {},
      actions: [
        {
          id: 1,
          position: 0,
          actionType: "send_message",
          delayMinutes: 0,
          config: {
            channel: PROFICHAT_PUSH_CHANNEL,
            recipientField: "client_phone",
            title: "Запись создана",
            body: "Ждём вас",
          },
        },
      ],
      createdAt: "",
      updatedAt: "",
    } as unknown as Automation;

    expect(automationToForm(automation).actions[0].title).toBe("Запись создана");
  });

  it("переменные заголовка попадают в форму пробного прогона", () => {
    const form = baseForm();
    form.actions[0].channel = PROFICHAT_PUSH_CHANNEL;
    form.actions[0].title = "Здравствуйте, {{client_name}}";
    form.actions[0].body = "Ждём вас";

    expect(relevantPayloadFields(form).get("client_name")).toContain("template");
  });
});

describe("правило по расписанию", () => {
  const scheduled = (overrides: Partial<AutomationForm> = {}) =>
    baseForm({
      eventCode: SCHEDULE_EVENT_CODE,
      actions: [
        {
          key: "a1",
          actionType: "send_message",
          delayMinutes: "0",
          channel: "sms",
          recipientField: "client_phone",
          recipientPhone: "+996700000001",
          title: "",
          body: "Планёрка.",
          templateId: "",
          language: "",
          parameters: [],
        },
      ],
      ...overrides,
    });

  it("отправляет периодичность и телефон вместо переменной получателя", () => {
    const input = toSaveInput(scheduled());

    expect(input.schedule).toEqual({
      kind: "weekly",
      time: "10:00",
      weekdays: [0],
    });
    expect(input.actions[0].config.recipientPhone).toBe("+996700000001");
    expect(input.actions[0].config.recipientField).toBeUndefined();
  });

  it("интервальное повторение уходит числом", () => {
    const input = toSaveInput(
      scheduled({
        schedule: { ...emptySchedule(), kind: "interval_days", intervalDays: "2" },
      }),
    );

    expect(input.schedule).toEqual({
      kind: "interval_days",
      time: "10:00",
      intervalDays: 2,
    });
  });

  it("условия к расписанию не уходят", () => {
    const leaf = makeLeaf("status", "eq");
    leaf.value = "confirmed";

    expect(toSaveInput(scheduled({ conditions: leaf })).conditions).toEqual({});
  });

  it("требует день недели и телефон", () => {
    const errors = validateForm(
      scheduled({
        schedule: { ...emptySchedule(), weekdays: [] },
        actions: [
          {
            key: "a1",
            actionType: "send_message",
            delayMinutes: "0",
            channel: "sms",
            recipientField: "client_phone",
            recipientPhone: "",
            title: "",
            body: "Планёрка.",
            templateId: "",
            language: "",
            parameters: [],
          },
        ],
      }),
      undefined,
      LABELS,
    );

    expect(errors.schedule).toBe("weekdays");
    expect(errors.actionFields.a1.recipientPhone).toBe("phone");
  });

  it("проверяет границы интервала", () => {
    const errors = validateForm(
      scheduled({
        schedule: { ...emptySchedule(), kind: "interval_days", intervalDays: "0" },
      }),
      undefined,
      LABELS,
    );

    expect(errors.schedule).toBe("interval");
  });
});

// ── WhatsApp: шаблон вместо текста ───────────────────────────────────────────

const REMINDER_TEMPLATE: WhatsAppTemplate = {
  id: "tpl-1",
  metaTemplateId: "1001",
  name: "appointment_reminder",
  language: "ru",
  category: "UTILITY",
  status: "APPROVED",
  bodyText: "Здравствуйте, {{1}}! Ждём вас {{2}}.",
  parameterCount: 2,
  supported: true,
  unsupportedReason: "",
  rejectionReason: "",
  available: true,
  sendable: true,
  problem: "",
  problemLabel: "",
  syncedAt: "2026-09-13T09:05:00Z",
};

const PENDING_TEMPLATE: WhatsAppTemplate = {
  ...REMINDER_TEMPLATE,
  id: "tpl-2",
  name: "promo",
  status: "PENDING",
  bodyText: "Акция для {{1}}",
  parameterCount: 1,
  sendable: false,
  problem: "template_not_approved",
  problemLabel: "Шаблон не одобрен Meta.",
};

const WHATSAPP_CATALOG: AutomationWhatsAppCatalog = {
  connection: {
    configured: true,
    usable: true,
    problem: "",
    problemLabel: "",
    displayPhoneNumber: "+996700000099",
  },
  templates: [REMINDER_TEMPLATE, PENDING_TEMPLATE],
  parameterSources: [
    { code: "event", label: "Поле события" },
    { code: "constant", label: "Постоянное значение" },
  ],
};

function whatsappAction(overrides: Partial<ActionForm> = {}): ActionForm {
  return {
    key: "w1",
    actionType: "send_message",
    delayMinutes: "0",
    channel: WHATSAPP_CHANNEL,
    recipientField: "client_phone",
    recipientPhone: "",
    title: "",
    body: "",
    templateId: "tpl-1",
    language: "ru",
    parameters: [
      { source: "event", field: "client_name", value: "" },
      { source: "constant", field: "", value: "завтра" },
    ],
    ...overrides,
  };
}

describe("WhatsApp-действие", () => {
  it("уходит шаблоном и привязками, без текста", () => {
    const input = toSaveInput(baseForm({ actions: [whatsappAction({ body: "старый текст" })] }));

    expect(input.actions[0].config).toEqual({
      channel: WHATSAPP_CHANNEL,
      recipientField: "client_phone",
      templateId: "tpl-1",
      language: "ru",
      parameters: [
        { source: "event", field: "client_name" },
        { source: "constant", value: "завтра" },
      ],
    });
    expect(input.actions[0].config).not.toHaveProperty("body");
  });

  it("читает шаблон и привязки из сохранённого правила", () => {
    const automation = {
      id: 1,
      organizationId: 1,
      branchId: null,
      branchName: null,
      name: "wa",
      eventCode: "appointment.created",
      eventLabel: "Запись создана",
      status: "draft",
      conditions: {},
      schedule: {},
      nextRunAt: null,
      lastRunAt: null,
      createdAt: "",
      updatedAt: "",
      actions: [
        {
          id: 5,
          position: 0,
          actionType: "send_message",
          delayMinutes: 0,
          config: {
            channel: WHATSAPP_CHANNEL,
            templateId: "tpl-1",
            language: "ru",
            recipientField: "client_phone",
            parameters: [
              { source: "event", field: "client_name" },
              { source: "constant", value: "завтра" },
            ],
          },
        },
      ],
    } as unknown as Automation;

    const action = automationToForm(automation).actions[0];
    expect(action.templateId).toBe("tpl-1");
    expect(action.language).toBe("ru");
    expect(action.parameters).toEqual([
      { source: "event", field: "client_name", value: "" },
      { source: "constant", field: "", value: "завтра" },
    ]);
    expect(needsTemplateSetup(action)).toBe(false);
  });

  it("старое правило с текстом без шаблона требует настройки", () => {
    expect(
      needsTemplateSetup(whatsappAction({ templateId: "", body: "Здравствуйте!" })),
    ).toBe(true);
    expect(needsTemplateSetup(whatsappAction({ templateId: "", body: "" }))).toBe(false);
  });

  it("fitParameters подгоняет привязки под число параметров шаблона", () => {
    const kept = fitParameters(
      [{ source: "constant", field: "", value: "x" }],
      REMINDER_TEMPLATE,
      false,
    );
    expect(kept).toEqual([
      { source: "constant", field: "", value: "x" },
      { source: "event", field: "", value: "" },
    ]);
    // У расписания новые позиции — константами: данных события там нет.
    expect(fitParameters([], PENDING_TEMPLATE, true)).toEqual([
      { source: "constant", field: "", value: "" },
    ]);
    expect(fitParameters(kept, undefined, false)).toEqual([]);
  });

  it("валидная привязка проходит проверку", () => {
    const errors = validateForm(
      baseForm({ actions: [whatsappAction()] }),
      APPOINTMENT_EVENT,
      LABELS,
      WHATSAPP_CATALOG,
    );
    expect(errors.actionFields).toEqual({});
  });

  it("требует шаблон и не требует текст", () => {
    const errors = validateForm(
      baseForm({ actions: [whatsappAction({ templateId: "", parameters: [] })] }),
      APPOINTMENT_EVENT,
      LABELS,
      WHATSAPP_CATALOG,
    );
    expect(errors.actionFields.w1).toEqual({ templateId: "template" });
  });

  it("ловит шаблон, пропавший из каталога", () => {
    const errors = validateForm(
      baseForm({ actions: [whatsappAction({ templateId: "tpl-gone" })] }),
      APPOINTMENT_EVENT,
      LABELS,
      WHATSAPP_CATALOG,
    );
    expect(errors.actionFields.w1.templateId).toBe("template-missing");
  });

  it("сверяет число привязок и заполненность каждой", () => {
    const errors = validateForm(
      baseForm({
        actions: [
          whatsappAction({
            parameters: [
              { source: "event", field: "", value: "" },
              { source: "constant", field: "", value: "  " },
              { source: "event", field: "client_email", value: "" },
            ],
          }),
        ],
      }),
      APPOINTMENT_EVENT,
      LABELS,
      WHATSAPP_CATALOG,
    );
    expect(errors.actionFields.w1).toEqual({
      parameters: "count:2/3",
      parameter0: "field:1",
      parameter1: "value:2",
      parameter2: "unknown-field:3:client_email",
    });
  });

  it("активное правило требует одобренный шаблон и рабочее подключение", () => {
    const pending = whatsappAction({
      templateId: "tpl-2",
      parameters: [{ source: "event", field: "client_name", value: "" }],
    });
    const active = validateForm(
      baseForm({ status: "active", actions: [pending] }),
      APPOINTMENT_EVENT,
      LABELS,
      WHATSAPP_CATALOG,
    );
    expect(active.actionFields.w1.templateId).toBe("blocked:Шаблон не одобрен Meta.");

    // Черновик с шаблоном на модерации — нормальный сценарий.
    const draft = validateForm(
      baseForm({ status: "draft", actions: [pending] }),
      APPOINTMENT_EVENT,
      LABELS,
      WHATSAPP_CATALOG,
    );
    expect(draft.actionFields).toEqual({});

    const offline: AutomationWhatsAppCatalog = {
      ...WHATSAPP_CATALOG,
      connection: {
        configured: true,
        usable: false,
        problem: "connection_disabled",
        problemLabel: "Подключение WhatsApp отключено.",
      },
    };
    const blocked = validateForm(
      baseForm({ status: "active", actions: [whatsappAction()] }),
      APPOINTMENT_EVENT,
      LABELS,
      offline,
    );
    expect(blocked.actionFields.w1.templateId).toBe("blocked:Подключение WhatsApp отключено.");
  });

  it("без каталога проверяет только выбор шаблона", () => {
    const errors = validateForm(
      baseForm({ status: "active", actions: [whatsappAction({ templateId: "tpl-gone" })] }),
      APPOINTMENT_EVENT,
      LABELS,
    );
    expect(errors.actionFields).toEqual({});
  });

  it("привязанные поля события попадают в форму пробного прогона", () => {
    const roles = relevantPayloadFields(baseForm({ actions: [whatsappAction()] }));
    expect(roles.get("client_name")).toEqual(["template"]);
    expect(roles.get("client_phone")).toEqual(["recipient"]);
    expect(roles.has("завтра")).toBe(false);
  });

  it("смена события сбрасывает привязки к пропавшим полям", () => {
    const result = retargetForm(
      baseForm({ actions: [whatsappAction({ recipientField: "client_name" })] }),
      CLIENT_EVENT,
    );
    // client_name есть у обоих событий: и получатель, и привязка остаются.
    expect(result.changed).toBe(false);
    expect(result.form.actions[0].parameters[0].field).toBe("client_name");

    const gone = retargetForm(
      baseForm({
        actions: [
          whatsappAction({
            recipientField: "client_name",
            parameters: [{ source: "event", field: "appointment_date", value: "" }],
          }),
        ],
      }),
      CLIENT_EVENT,
    );
    expect(gone.changed).toBe(true);
    expect(gone.form.actions[0].parameters).toEqual([
      { source: "event", field: "", value: "" },
    ]);
  });
});
