import { describe, it, expect } from "vitest";

import { labQuestionFieldKind, assembleLabAnswers } from "./labQuestionFields";
import type { LabQuestion } from "../../../api/lab";

const question = (over: Partial<LabQuestion> = {}): LabQuestion => ({
  id: 1,
  lisQuestionId: 90210,
  testId: 10,
  title: "Срок беременности (недель)",
  fieldType: "INTEGER",
  defaultValue: "",
  ...over,
});

describe("labQuestionFieldKind", () => {
  it("DATE — датапикер", () => {
    expect(labQuestionFieldKind("DATE")).toBe("date");
  });

  it("BOOLEAN — переключатель", () => {
    expect(labQuestionFieldKind("BOOLEAN")).toBe("boolean");
  });

  it("INTEGER — числовое поле", () => {
    expect(labQuestionFieldKind("INTEGER")).toBe("integer");
  });

  it.each([
    "STRING",
    "SELECT",
    "FULL_NAME",
    "FULL_NAME2",
    "PIN",
    "PHONE",
    "ADDRESS",
    "PASSWORD_DATA",
  ] as const)("%s — текстовое поле", (fieldType) => {
    expect(labQuestionFieldKind(fieldType)).toBe("text");
  });

  it("неизвестный тип (будущее расширение перечисления ЛИС) — текстовое поле", () => {
    // Лучше показать вопрос обычным полем, чем спрятать его совсем из-за
    // типа, которого не было в перечислении на момент написания кода.
    expect(labQuestionFieldKind("SOME_FUTURE_TYPE")).toBe("text");
  });
});

describe("assembleLabAnswers", () => {
  it("отправляет идентификатор ЛИС, а ответы ищет по локальному", () => {
    // Числа нарочно разные: форма ключует ответы своим `id`, а в
    // лабораторию обязан уехать `lisQuestionId`. При совпадающих числах
    // подмена одного другим прошла бы мимо теста — ровно та ошибка,
    // которая до этого пряталась в бэкенде.
    const questions = [
      question({ id: 1, lisQuestionId: 501, title: "Вопрос 1", fieldType: "STRING" }),
    ];
    const got = assembleLabAnswers(questions, { 1: "ответ" });
    expect(got).toEqual([
      { lisQuestionId: 501, title: "Вопрос 1", fieldType: "STRING", value: "ответ" },
    ]);
  });

  it("отсутствующий ответ становится пустой строкой, а не undefined", () => {
    const questions = [
      question({ id: 2, lisQuestionId: 502, title: "Вопрос без ответа", fieldType: "DATE" }),
    ];
    const got = assembleLabAnswers(questions, {});
    expect(got).toEqual([
      { lisQuestionId: 502, title: "Вопрос без ответа", fieldType: "DATE", value: "" },
    ]);
  });

  it("несколько вопросов — независимая сборка каждого", () => {
    const questions = [
      question({ id: 1, lisQuestionId: 501, title: "A", fieldType: "STRING" }),
      question({ id: 2, lisQuestionId: 502, title: "B", fieldType: "BOOLEAN" }),
    ];
    const got = assembleLabAnswers(questions, { 1: "x", 2: "true" });
    expect(got).toEqual([
      { lisQuestionId: 501, title: "A", fieldType: "STRING", value: "x" },
      { lisQuestionId: 502, title: "B", fieldType: "BOOLEAN", value: "true" },
    ]);
  });

  it("пустой список вопросов даёт пустой список ответов", () => {
    expect(assembleLabAnswers([], { 1: "x" })).toEqual([]);
  });
});
