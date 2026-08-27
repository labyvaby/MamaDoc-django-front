import { describe, expect, it } from "vitest";

import type {
  Automation,
  AutomationCatalogEvent,
} from "../../../api/automations";
import {
  automationToForm,
  makeGroup,
  makeLeaf,
  nodeDepth,
  removeNode,
  retargetForm,
  supportsBranchFilter,
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
    },
    {
      code: "total_amount",
      label: "Сумма записи",
      fieldType: "decimal",
      operators: ["gte", "lte", "exists"],
      options: [],
    },
  ],
  variables: ["client_name", "client_phone", "appointment_date"],
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
};

function baseForm(overrides: Partial<AutomationForm> = {}): AutomationForm {
  return {
    name: "Правило",
    eventCode: "appointment.created",
    status: "active",
    branchId: null,
    conditions: null,
    actions: [
      {
        key: "a1",
        actionType: "send_message",
        delayMinutes: "10",
        channel: "sms",
        recipientField: "client_phone",
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

describe("supportsBranchFilter", () => {
  it("true только для события с branch_id", () => {
    expect(supportsBranchFilter(APPOINTMENT_EVENT)).toBe(true);
    expect(supportsBranchFilter(CLIENT_EVENT)).toBe(false);
    expect(supportsBranchFilter(undefined)).toBe(false);
  });
});
