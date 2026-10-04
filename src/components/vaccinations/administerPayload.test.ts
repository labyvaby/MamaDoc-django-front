import { describe, expect, it } from "vitest";
import type { VaccinationRecord } from "../../api/vaccinations";
import { ApiError } from "../../api/client";
import {
  buildAdministerPayload,
  missingFromError,
  nextDoseNumber,
  type AdministerForm,
} from "./administerPayload";
import type { PatientDraft } from "./patientGaps";

const empty: PatientDraft = { gender: "unknown", birthDate: null, inn: "", innAbsentReason: "" };
const form: AdministerForm = {
  isExternal: false,
  batchId: 5,
  batchNumberManual: "",
  doseNumber: "2",
  injectionSite: "thigh",
  administeredById: 3,
  administeredAt: "2026-09-26T04:00:00.000Z",
  notes: " ",
};

describe("buildAdministerPayload", () => {
  it("числа — числами, пустое не шлём, пациента — только изменённое", () => {
    const patient: PatientDraft = { ...empty, gender: "female", birthDate: "1992-04-16", inn: "11604199201289" };
    expect(buildAdministerPayload(form, patient, empty)).toEqual({
      batchId: 5,
      doseNumber: 2,
      injectionSite: "thigh",
      administeredById: 3,
      administeredAt: "2026-09-26T04:00:00.000Z",
      patient: { gender: "female", birthDate: "1992-04-16", inn: "11604199201289" },
    });
  });
  it("внешняя: серия вместо партии, без изменений пациента — без блока patient", () => {
    const body = buildAdministerPayload(
      { ...form, isExternal: true, batchNumberManual: "AB12" },
      empty,
      empty,
    );
    expect(body.batchId).toBeUndefined();
    expect(body.batchNumberManual).toBe("AB12");
    expect(body.patient).toBeUndefined();
  });
});

describe("missingFromError", () => {
  it("берёт ключи из details.fields", () => {
    const err = new ApiError("x", 400, {
      error: { code: "VALIDATION_ERROR", message: "x", details: { fields: { "patient.gender": "a", batch: "b" } }, trace_id: "t" },
    });
    expect(missingFromError(err)).toEqual(["patient.gender", "batch"]);
    expect(missingFromError(new Error("x"))).toEqual([]);
  });
});

describe("nextDoseNumber", () => {
  const rec = (id: number, vaccineId: number, doseNumber: number, status = "pending") =>
    ({ id, vaccineId, doseNumber, status }) as unknown as VaccinationRecord;
  it("следующая после максимальной, без отменённых и самой записи", () => {
    const history = [rec(1, 7, 1), rec(2, 7, 2, "canceled"), rec(3, 8, 3), rec(4, 7, 5)];
    expect(nextDoseNumber(history, 7, 4)).toBe(2);
    expect(nextDoseNumber(history, 9)).toBe(1);
  });
});
