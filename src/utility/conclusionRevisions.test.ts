import { describe, expect, it } from "vitest";

import { buildRevisionHistory, diffRevision } from "./conclusionRevisions";
import type { MedicalConclusionRevision } from "../api/medical";

const revision = (
  over: Partial<MedicalConclusionRevision> = {},
): MedicalConclusionRevision => ({
  id: 1,
  conclusion: null,
  anamnesis: null,
  objective: null,
  complaints: null,
  diagnosisData: [],
  photoUrls: [],
  internalComment: null,
  status: "draft",
  formData: null,
  changedById: 161,
  changeReason: "update",
  createdAt: "2026-09-08T10:00:00Z",
  ...over,
});

describe("diffRevision", () => {
  it("первая ревизия показывает заполненные поля как появившиеся", () => {
    const changes = diffRevision(revision({ conclusion: "наблюдение" }), null);
    expect(changes).toEqual([
      { field: "conclusion", label: "Заключение", before: "", after: "наблюдение" },
    ]);
  });

  it("правка текста показывает и старое, и новое значение", () => {
    const changes = diffRevision(
      revision({ objective: "стало" }),
      revision({ objective: "было" }),
    );
    expect(changes).toEqual([
      { field: "objective", label: "Объективно", before: "было", after: "стало" },
    ]);
  });

  it("незначащие пробелы правкой не считаются", () => {
    expect(diffRevision(revision({ anamnesis: " текст " }), revision({ anamnesis: "текст" }))).toEqual(
      [],
    );
  });

  it("очистка поля видна как правка", () => {
    const changes = diffRevision(revision({ complaints: null }), revision({ complaints: "кашель" }));
    expect(changes).toEqual([
      { field: "complaints", label: "Жалобы", before: "кашель", after: "" },
    ]);
  });

  it("смена диагноза показывается человекочитаемо", () => {
    const changes = diffRevision(
      revision({ diagnosisData: [{ diagnosisCode: "J06", title: "ОРИ" }] }),
      revision({ diagnosisData: [{ diagnosisCode: "A00", title: "Холера" }] }),
    );
    expect(changes).toEqual([
      { field: "diagnosis", label: "Диагноз", before: "A00 - Холера", after: "J06 - ОРИ" },
    ]);
  });

  it("завершение заключения видно сменой статуса", () => {
    const changes = diffRevision(
      revision({ status: "completed", changeReason: "complete" }),
      revision({ status: "draft" }),
    );
    expect(changes).toEqual([
      { field: "status", label: "Статус", before: "Черновик", after: "Завершено" },
    ]);
  });

  it("правка строк бланка отмечается, но не вываливает JSON врачу", () => {
    const form = (value: string) => ({
      version: 1,
      forms: [{ formId: 1, values: { f1: value }, snapshot: null }],
    });
    const changes = diffRevision(
      revision({ formData: form("стало") }),
      revision({ formData: form("было") }),
    );
    expect(changes).toEqual([
      { field: "formData", label: "Бланк", before: "", after: "изменён" },
    ]);
  });

  it("правка, не тронувшая отслеживаемые поля, даёт пустой список", () => {
    expect(diffRevision(revision({ conclusion: "текст" }), revision({ conclusion: "текст" }))).toEqual(
      [],
    );
  });
});

describe("buildRevisionHistory", () => {
  it("сравнивает с предыдущей по времени: бэк отдаёт новые вперёд", () => {
    const history = buildRevisionHistory([
      revision({ id: 3, conclusion: "третий" }),
      revision({ id: 2, conclusion: "второй" }),
      revision({ id: 1, conclusion: "первый", changeReason: "create" }),
    ]);
    expect(history.map((entry) => entry.changes[0])).toEqual([
      { field: "conclusion", label: "Заключение", before: "второй", after: "третий" },
      { field: "conclusion", label: "Заключение", before: "первый", after: "второй" },
      { field: "conclusion", label: "Заключение", before: "", after: "первый" },
    ]);
  });
});
