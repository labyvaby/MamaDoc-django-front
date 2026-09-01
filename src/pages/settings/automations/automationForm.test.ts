import { describe, expect, it } from "vitest";

import {
  PROFICHAT_PUSH_CHANNEL,
  SCHEDULE_EVENT_CODE,
  type Automation,
  type AutomationCatalogEvent,
} from "../../../api/automations";
import {
  automationToForm,
  emptySchedule,
  makeGroup,
  makeLeaf,
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
