import { describe, expect, it } from "vitest";
import {
  ageLabel,
  applyInnToPatientDraft,
  changedPatientFields,
  patientGaps,
  type PatientDraft,
} from "./patientGaps";

const empty: PatientDraft = { gender: "unknown", birthDate: null, inn: "", innAbsentReason: "" };

describe("patientGaps", () => {
  it("перечисляет пустые поля", () => {
    expect(patientGaps(empty)).toEqual(["gender", "birthDate", "inn"]);
  });
  it("причина вместо ИНН закрывает пробел", () => {
    expect(patientGaps({ ...empty, innAbsentReason: "newborn" })).toEqual(["gender", "birthDate"]);
  });
});

describe("applyInnToPatientDraft", () => {
  it("заполняет пустые пол и дату", () => {
    expect(applyInnToPatientDraft(empty, "11604199201289")).toEqual({
      draft: { gender: "female", birthDate: "1992-04-16", inn: "11604199201289", innAbsentReason: "" },
      conflict: null,
    });
  });
  it("сообщает о расхождении, не затирая", () => {
    const r = applyInnToPatientDraft({ ...empty, gender: "male" }, "11604199201289");
    expect(r.conflict).toBe("Пол не совпадает с ИНН");
    expect(r.draft.gender).toBe("male");
  });
  it("кривой ИНН — текст ошибки разбора", () => {
    expect(applyInnToPatientDraft(empty, "123").conflict).toBe("ИНН — 14 цифр");
  });
});

describe("changedPatientFields", () => {
  it("шлёт только изменённое", () => {
    const current: PatientDraft = { ...empty, gender: "female", birthDate: "1992-04-16", inn: "11604199201289" };
    expect(changedPatientFields(empty, current)).toEqual({
      gender: "female",
      birthDate: "1992-04-16",
      inn: "11604199201289",
    });
    expect(changedPatientFields(current, current)).toEqual({});
  });
});

describe("ageLabel", () => {
  const on = new Date(2026, 8, 26);
  it("годы и месяцы", () => {
    expect(ageLabel("2024-06-10", on)).toBe("2 г. 3 мес.");
    expect(ageLabel("2026-04-20", on)).toBe("5 мес.");
    expect(ageLabel("2026-09-20", on)).toBe("6 дн.");
    expect(ageLabel(null, on)).toBe("");
  });
});
