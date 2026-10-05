import { describe, expect, it } from "vitest";

import { edoListQuery, fromRawDocument, hasSignature } from "./edo";
import { fileNameFromDisposition, protectedFilePath } from "./protectedFile";

describe("edo: переходники и запросы", () => {
  it("шаги маршрута — по порядку, флаги согласования по умолчанию false, файлы в общем виде", () => {
    const doc = fromRawDocument({
      amount: "13155000.00",
      route: [
        { id: 2, order: 2, state: "current" },
        { id: 1, order: 1, state: "done", canApprove: true },
      ],
      signatures: [{ id: 1, party: "company", name: "Бакиров", position: "", at: "2026-09-20" }],
      versions: [{ id: 5, v: 2, at: "2026-09-21", by: "Котова", note: "правки", fileUrl: "https://x/api/v2/edo/documents/1/versions/5/download/", fileName: "ddu.pdf" }],
    } as never);
    expect(doc.amount).toBe(13155000);
    expect(doc.route.map((s) => s.id)).toEqual([1, 2]);
    expect(doc.route[1].canApproveOnBehalf).toBe(false);
    expect(doc.versions[0]).toMatchObject({ name: "ddu.pdf", version: 2 });
    expect(hasSignature(doc, "company")).toBe(true);
    expect(hasSignature(doc, "counterparty")).toBe(false);
  });

  it("срез реестра: договоры и архив — scope, у ЭДО — вкладка", () => {
    const base = { tab: "all", search: "", type: "all", projectId: null } as const;
    expect(edoListQuery({ ...base, scope: "edo", tab: "review" })).toBe("?tab=review");
    expect(edoListQuery({ ...base, scope: "contracts", tab: "review", contractStatus: "active" })).toBe("?scope=contracts&contractStatus=active");
    expect(edoListQuery({ ...base, scope: "archive", year: "2026", notExported: true })).toBe("?scope=archive&year=2026&exported=0");
  });
});

describe("protectedFile", () => {
  it("абсолютная ссылка бэка → путь через базовый адрес API", () => {
    expect(protectedFilePath("https://test2.crm.operator.kg/api/v2/edo/documents/1/versions/5/download/")).toMatch(/\/v2\/edo\/documents\/1\/versions\/5\/download\/$/);
  });

  it("имя файла из Content-Disposition, в т. ч. utf-8", () => {
    expect(fileNameFromDisposition("attachment; filename*=utf-8''%D0%94%D0%94%D0%A3.pdf")).toBe("ДДУ.pdf");
    expect(fileNameFromDisposition('attachment; filename="act.pdf"')).toBe("act.pdf");
    expect(fileNameFromDisposition(null)).toBeNull();
  });
});
