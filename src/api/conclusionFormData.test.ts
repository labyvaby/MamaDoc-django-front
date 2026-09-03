import { describe, expect, it } from "vitest";

import {
  buildConclusionFormData,
  fitConclusionFormData,
  parseConclusionFormData,
} from "./conclusionFormData";
import type { ConclusionFormTemplate } from "./conclusionForms";

const template = (over: Partial<ConclusionFormTemplate> = {}): ConclusionFormTemplate => ({
  id: 5,
  name: "Карта осмотра педиатра",
  pageSize: "A4",
  orientation: "portrait",
  specializationIds: [],
  serviceIds: [],
  branchIds: [],
  isDefault: false,
  title: "Медицинское заключение",
  subtitle: "",
  showClinicHeader: true,
  headerContacts: "",
  background: { imageUrl: null, opacity: 1 },
  fields: [
    { id: "f3", label: "Температура, °C", type: "text", slot: "temperature" },
    { id: "f4", label: "Зев", type: "text" },
  ],
  footerNote: "",
  target: "conclusion",
  isActive: true,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("buildConclusionFormData", () => {
  it("складывает значения, снапшот и ручной хвост", () => {
    const data = buildConclusionFormData(template(), { f3: "37.2", f4: "спокоен" }, " Вывод ");

    expect(data?.version).toBe(1);
    expect(data?.forms[0].formId).toBe(5);
    expect(data?.forms[0].values).toEqual({ f3: "37.2", f4: "спокоен" });
    // Снапшот несёт привязки полей: по ним заключение открывается заново.
    expect(data?.forms[0].snapshot?.fields).toHaveLength(2);
    expect(data?.manual).toEqual({ conclusion: "Вывод" });
  });

  it("выбрасывает значения полей, которых в бланке уже нет", () => {
    const data = buildConclusionFormData(template(), { f3: "37.2", old: "хвост" }, "");
    expect(data?.forms[0].values).toEqual({ f3: "37.2", f4: "" });
    expect(data?.manual).toBeUndefined();
  });

  it("без бланка отдаёт null — это очистка поля на бэке", () => {
    expect(buildConclusionFormData(null, { f3: "37.2" }, "")).toBeNull();
  });
});

describe("fitConclusionFormData", () => {
  it("пропускает обычный бланк как есть", () => {
    const data = buildConclusionFormData(template(), { f3: "37.2" }, "");
    const fitted = fitConclusionFormData(data);
    expect(fitted.data).toBe(data);
    expect(fitted.droppedSnapshot).toBe(false);
  });

  it("роняет снапшот, когда подложка не влезает в лимит", () => {
    // Подложка data-URL'ом — наследство шаблонов, собранных до бэкенда бланков.
    const heavy = template({
      background: { imageUrl: `data:image/png;base64,${"A".repeat(300_000)}`, opacity: 1 },
    });
    const fitted = fitConclusionFormData(buildConclusionFormData(heavy, { f3: "37.2" }, ""));

    expect(fitted.droppedSnapshot).toBe(true);
    expect(fitted.dropped).toBe(false);
    // Значения врача при этом сохраняются — теряется только копия шаблона.
    expect(fitted.data?.forms[0].values).toEqual({ f3: "37.2", f4: "" });
    expect(fitted.data?.forms[0].snapshot).toBeNull();
  });

  it("сдаётся, когда не влезают уже сами значения", () => {
    const fitted = fitConclusionFormData(
      buildConclusionFormData(template(), { f3: "я".repeat(300_000) }, ""),
    );
    expect(fitted.dropped).toBe(true);
    expect(fitted.data).toBeNull();
  });
});

describe("parseConclusionFormData", () => {
  it("разбирает сохранённый бланк вместе со снапшотом", () => {
    const saved = buildConclusionFormData(template(), { f3: "37.2", f4: "спокоен" }, "Вывод");
    const parsed = parseConclusionFormData(saved);

    expect(parsed?.formId).toBe(5);
    expect(parsed?.values).toEqual({ f3: "37.2", f4: "спокоен" });
    expect(parsed?.manual).toBe("Вывод");
    expect(parsed?.snapshot?.title).toBe("Медицинское заключение");
    // Привязка к колонке заключения читается из снапшота, а не из настроек.
    expect(parsed?.snapshot?.fields[0].slot).toBe("temperature");
  });

  it("без снапшота отдаёт значения — шаблон возьмут актуальный", () => {
    const parsed = parseConclusionFormData({
      version: 1,
      forms: [{ formId: 7, values: { a: "1" }, snapshot: null }],
    });
    expect(parsed?.formId).toBe(7);
    expect(parsed?.snapshot).toBeNull();
  });

  it("молча отбрасывает мусор — заключение должно открыться в любом случае", () => {
    expect(parseConclusionFormData(null)).toBeNull();
    expect(parseConclusionFormData({})).toBeNull();
    expect(parseConclusionFormData({ forms: [] })).toBeNull();
    expect(parseConclusionFormData({ forms: [{ values: {} }] })).toBeNull();
  });

  it("числовые значения из будущих типов полей показывает строкой", () => {
    const parsed = parseConclusionFormData({
      version: 2,
      forms: [{ formId: 1, values: { a: 42, b: true, c: { nested: 1 } } }],
    });
    expect(parsed?.values).toEqual({ a: "42", b: "true" });
  });

  it("находит ручной текст, даже если адресат бланка сменился", () => {
    const parsed = parseConclusionFormData({
      version: 1,
      forms: [{ formId: 1, values: {} }],
      manual: { objective: "Дописано врачом" },
    });
    expect(parsed?.manual).toBe("Дописано врачом");
  });
});
