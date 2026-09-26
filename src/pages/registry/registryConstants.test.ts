import { describe, expect, it } from "vitest";

import type { DjangoPatient } from "../../api/patients";
import type { Program } from "../../api/programs";
import { DEFAULT_INACTIVITY_MONTHS, programInactivityMonths, toExistingPerson } from "./registryConstants";

function program(settings: Record<string, unknown>): Program {
  return { settings } as unknown as Program;
}

describe("registry constants", () => {
  it("reads the inactivity threshold of a program or falls back to six months", () => {
    expect(programInactivityMonths(program({ inactivityMonths: 9 }))).toBe(9);
    expect(programInactivityMonths(program({ inactivityMonths: "9" }))).toBe(DEFAULT_INACTIVITY_MONTHS);
    expect(programInactivityMonths(program({}))).toBe(DEFAULT_INACTIVITY_MONTHS);
    expect(programInactivityMonths(undefined)).toBe(6);
  });

  it("carries the birth certificate of a card into the wizard", () => {
    const patient = {
      id: 5,
      fullName: "Иванов Али",
      phone: "+996700000001",
      birthDate: "2025-06-26",
      gender: "male",
      cardNumber: "МД-7",
      birthCertificateNumber: "KR-I 123456",
      birthCertificateIssuedOn: "2025-07-01",
    } as unknown as DjangoPatient;

    expect(toExistingPerson(patient)).toEqual({
      id: 5,
      fullName: "Иванов Али",
      phone: "+996700000001",
      birthDate: "2025-06-26",
      gender: "male",
      cardNumber: "МД-7",
      birthCertificateNumber: "KR-I 123456",
      birthCertificateIssuedOn: "2025-07-01",
    });
  });
});
