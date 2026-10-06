import { describe, expect, it } from "vitest";

import { auditCsv, fromRawCompany, fromRawDictionary, fromRawMatrix, fromRawUser, fromRawWebhook, nextLevel, settingsQuery, splitEvents } from "./estateSettings";

describe("матрица ролей", () => {
  it("уровни по кругу none → view → edit → approve → none", () => {
    expect(nextLevel("none")).toBe("view");
    expect(nextLevel("view")).toBe("edit");
    expect(nextLevel("edit")).toBe("approve");
    expect(nextLevel("approve")).toBe("none");
    expect(nextLevel("???")).toBe("none");
  });

  it("стандартные роли первыми, подпись из API", () => {
    const m = fromRawMatrix({
      levels: [{ id: "none", label: "—" }],
      modules: [{ id: "funnel", label: "CRM · воронка", group: "sales", groupLabel: "ПРОДАЖИ", codes: {} }],
      roles: [
        { id: 12, code: "cleaner", label: "Уборщица", isStandard: false, permissions: {} },
        { id: 9, code: "accountant", label: "Бухгалтер", isStandard: true, usersCount: 1, permissions: { funnel: "view" } },
      ],
      missingCodes: ["staff.manage"],
    });
    expect(m.roles.map((r) => r.code)).toEqual(["accountant", "cleaner"]);
    expect(m.roles[0].label).toBe("Бухгалтер");
    expect(m.roles[0].permissions.funnel).toBe("view");
    expect(m.modules[0].groupLabel).toBe("ПРОДАЖИ");
  });
});

describe("пользователи", () => {
  it("id — участник, role — id роли", () => {
    const u = fromRawUser({ id: 2, userId: 2, employeeId: 3, name: "Анна Котова", role: 4, roleCode: "sales", roleName: "Специалист отдела продаж", twoFa: true, lastLogin: "2026-10-05T16:19:50+06:00", status: "active" });
    expect(u.id).toBe(2);
    expect(u.roleId).toBe(4);
    expect(u.twoFa).toBe(true);
  });
});

describe("справочники", () => {
  it("count и items; available по умолчанию true", () => {
    const d = fromRawDictionary({ key: "budgetArticles", label: "Статьи бюджета", editable: false, editEndpoint: null, count: 10, items: [{ id: "design", name: "Проектирование" }] });
    expect(d.available).toBe(true);
    expect(d.count).toBe(10);
    expect(d.items[0].name).toBe("Проектирование");
    expect(fromRawDictionary({ key: "x", available: false, items: [{}, {}] }).count).toBe(2);
  });

  it("реквизиты: configured=false — подсказка, пустые поля — строки", () => {
    const c = fromRawCompany({ configured: false, name: null });
    expect(c.configured).toBe(false);
    expect(c.name).toBe("");
    expect(c.bik).toBe("");
  });
});

describe("вебхуки", () => {
  it("номер WH-<id>, секрет только в ответе создания", () => {
    expect(fromRawWebhook({ id: 3, url: "https://a", events: ["lead.created"], active: false }).number).toBe("WH-3");
    expect(fromRawWebhook({ id: 1, number: "WH-1", secret: "s3cr3t" }).secret).toBe("s3cr3t");
  });

  it("события из строки поля — по запятой, без дублей", () => {
    expect(splitEvents("contract.signed, payment.done,, contract.signed")).toEqual(["contract.signed", "payment.done"]);
  });
});

describe("helpers", () => {
  it("settingsQuery пропускает пустые", () => {
    expect(settingsQuery({ status: null, search: "", limit: 150 })).toBe("?limit=150");
    expect(settingsQuery({})).toBe("");
  });

  it("auditCsv: BOM, разделитель «;», кавычки", () => {
    const csv = auditCsv(
      [{ id: 1, ts: "2026-10-05", user: "Азамат", userId: 1, role: "Руководитель", action: "Изменение прав", target: "Юрист; ЭДО", details: "", module: "settings", moduleLabel: "Настройки", hash: "" }],
      ["Время", "Пользователь", "Роль", "Действие", "Объект", "Детали", "Модуль"],
    );
    expect(csv.startsWith("\uFEFFВремя;")).toBe(true);
    expect(csv).toContain('"Юрист; ЭДО"');
  });
});
