import { describe, it, expect } from "vitest";

import {
  isTestVisibleForGender,
  filterAvailableTests,
  resolveSelectedLines,
  type BasketLine,
} from "./basketCatalog";
import type { LabTest } from "../../../api/lab";

const labTest = (over: Partial<LabTest> = {}): LabTest => ({
  id: 1,
  lisId: 100,
  parentId: null,
  title: "Общий анализ крови",
  biomaterial: "Кровь",
  requiredDay: 1,
  priceStandard: "250.00",
  priceExpress: "0",
  lisGender: "",
  requiresDoctor: false,
  hasQuestions: false,
  ...over,
});

const line = (over: Partial<BasketLine> = {}): BasketLine => ({
  testId: 1,
  count: 1,
  express: false,
  ...over,
});

describe("isTestVisibleForGender", () => {
  it("мужской анализ скрыт от пациентки", () => {
    expect(isTestVisibleForGender("1", "female")).toBe(false);
  });

  it("мужской анализ виден пациенту", () => {
    expect(isTestVisibleForGender("1", "male")).toBe(true);
  });

  it("женский анализ скрыт от пациента", () => {
    expect(isTestVisibleForGender("2", "male")).toBe(false);
  });

  it("женский анализ виден пациентке", () => {
    expect(isTestVisibleForGender("2", "female")).toBe(true);
  });

  it("пустой код — ограничения нет", () => {
    expect(isTestVisibleForGender("", "female")).toBe(true);
    expect(isTestVisibleForGender("", "male")).toBe(true);
  });

  it("неизвестный код трактуется как «ограничения нет»", () => {
    // Соответствие '1'/'2' полу не подтверждено ExpressLab (см. блокеры в
    // lab-intake-design.md) — спрятать доступный анализ хуже, чем показать
    // лишний. Так же поступает бэкенд в lab/validators.py.
    expect(isTestVisibleForGender("3", "female")).toBe(true);
    expect(isTestVisibleForGender("3", "male")).toBe(true);
  });

  it("пол пациента ещё не определён — ограничения нет", () => {
    // Пол дозаполняется в PatientSection и до этого момента равен "unknown".
    // Прятать половину каталога, пока карта не дозаполнена, хуже, чем
    // показать анализ, который потом окажется не по адресу.
    expect(isTestVisibleForGender("1", "unknown")).toBe(true);
    expect(isTestVisibleForGender("2", "unknown")).toBe(true);
  });
});

describe("filterAvailableTests", () => {
  it("прячет анализ не того пола", () => {
    const tests = [labTest({ id: 1, lisGender: "1", title: "ПСА" })];
    expect(filterAvailableTests(tests, [], "female", "")).toEqual([]);
  });

  it("фильтрует по названию без учёта регистра", () => {
    const tests = [
      labTest({ id: 1, title: "Общий анализ крови" }),
      labTest({ id: 2, title: "Глюкоза" }),
    ];
    expect(filterAvailableTests(tests, [], "female", "глюк")).toEqual([tests[1]]);
  });

  it("исключает уже выбранные анализы", () => {
    const tests = [labTest({ id: 1 }), labTest({ id: 2 })];
    expect(filterAvailableTests(tests, [line({ testId: 1 })], "female", "")).toEqual([tests[1]]);
  });

  it("дубль testId в selected не ломает исключение", () => {
    // Задвоение не должно возникать (см. BasketSection — «добавить» скрыт
    // для уже выбранного теста), но исключение не должно падать, если оно
    // всё же случилось, например из-за старого черновика formDraft.
    const tests = [labTest({ id: 1 }), labTest({ id: 2 })];
    const selected = [line({ testId: 1 }), line({ testId: 1, count: 2 })];
    expect(filterAvailableTests(tests, selected, "female", "")).toEqual([tests[1]]);
  });

  it("пустой запрос не фильтрует по названию", () => {
    const tests = [labTest({ id: 1 }), labTest({ id: 2, title: "Другое" })];
    expect(filterAvailableTests(tests, [], "female", "")).toEqual(tests);
  });

  it("пустой каталог даёт пустой список, а не падает", () => {
    expect(filterAvailableTests([], [], "female", "кровь")).toEqual([]);
  });
});

describe("resolveSelectedLines", () => {
  it("подставляет данные теста по testId", () => {
    const tests = [labTest({ id: 5, title: "Ферритин" })];
    const got = resolveSelectedLines(tests, [line({ testId: 5, count: 2, express: true })]);
    expect(got).toEqual([{ testId: 5, count: 2, express: true, test: tests[0] }]);
  });

  it("тест не найден в каталоге — test: null, а не падение", () => {
    // Каталог ещё не загрузился, либо строка восстановлена из черновика
    // (formDraft) для теста, которого сейчас нет в ответе API.
    const got = resolveSelectedLines([], [line({ testId: 9 })]);
    expect(got).toEqual([{ testId: 9, count: 1, express: false, test: null }]);
  });

  it("сохраняет порядок selected", () => {
    const tests = [labTest({ id: 1 }), labTest({ id: 2 })];
    const got = resolveSelectedLines(tests, [line({ testId: 2 }), line({ testId: 1 })]);
    expect(got.map((l) => l.testId)).toEqual([2, 1]);
  });
});
