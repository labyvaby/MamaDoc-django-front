import { describe, expect, it } from "vitest";

import {
  buildIntakePayload,
  initialIntakeState,
  newRepresentative,
  validateStep,
  withRelation,
  type IntakeState,
} from "./intakeState";

function filled(): IntakeState {
  const state = initialIntakeState();
  return {
    ...state,
    child: { mode: "new", existing: null, fullName: "Иванов Али", phone: "", birthDate: "2026-05-10", gender: "male" },
    representatives: [
      newRepresentative({ key: "r1", fullName: "Мама", phone: "+996700000012", isPrimaryContact: true }),
    ],
    program: {
      programId: 3,
      branchId: 14,
      responsibleEmployeeId: 7,
      termMonths: "12",
      termStartsOn: "",
      priceAmount: "",
      cardNumber: "",
    },
    payment: { mode: "now", cash: "5000", card: "", cashlessMethodId: null },
  };
}

describe("intake state", () => {
  it("requires gender and birth date for the child", () => {
    const state = filled();
    state.child.gender = "unknown";
    state.child.birthDate = "";
    expect(validateStep("child", state)).toEqual({
      gender: "wizard.child.genderRequired",
      birthDate: "wizard.child.birthDateRequired",
    });
    expect(validateStep("child", filled())).toEqual({});
  });

  it("requires a picked card when the child exists", () => {
    const state = filled();
    state.child = { ...state.child, mode: "existing", existing: null };
    expect(validateStep("child", state).existing).toBe("wizard.child.pickRequired");
  });

  it("requires one legal representative with a phone and one primary contact at most", () => {
    const noLegal = filled();
    noLegal.representatives[0] = withRelation(noLegal.representatives[0], "grandmother");
    expect(validateStep("representatives", noLegal)).toEqual({
      representatives: "wizard.representatives.needLegal",
    });

    const twoPrimary = filled();
    twoPrimary.representatives.push(
      newRepresentative({ key: "r2", fullName: "Папа", phone: "+996700000013", relation: "father", isPrimaryContact: true }),
    );
    expect(validateStep("representatives", twoPrimary)).toEqual({
      representatives: "wizard.representatives.onePrimary",
    });

    const empty = filled();
    empty.representatives[0].phone = "12";
    expect(validateStep("representatives", empty).r1).toBe("wizard.representatives.fillPerson");
  });

  it("switches legal status with the relation", () => {
    const rep = newRepresentative();
    expect(withRelation(rep, "grandfather").isLegalRepresentative).toBe(false);
    expect(withRelation(rep, "guardian").isLegalRepresentative).toBe(true);
  });

  it("checks the program step and payment totals", () => {
    const state = filled();
    state.program.programId = null;
    state.program.termMonths = "61";
    expect(validateStep("program", state)).toEqual({
      programId: "wizard.program.programRequired",
      termMonths: "wizard.program.termInvalid",
    });
    const pay = filled();
    pay.payment.cash = "6000";
    expect(validateStep("payment", pay, { price: 5000 })).toEqual({ payment: "wizard.payment.overpaid" });
    pay.payment = { mode: "now", cash: "", card: "", cashlessMethodId: null };
    expect(validateStep("payment", pay, { price: 5000 })).toEqual({ payment: "wizard.payment.empty" });
    pay.payment.mode = "later";
    expect(validateStep("payment", pay, { price: 5000 })).toEqual({});
  });

  it("builds the intake payload for a new child with a first payment", () => {
    const payload = buildIntakePayload(filled());
    expect(payload.patient.new).toEqual({
      fullName: "Иванов Али",
      phone: "",
      birthDate: "2026-05-10",
      gender: "male",
      cardNumber: "",
    });
    expect(payload.representatives[0]).toMatchObject({
      relation: "mother",
      isPrimaryContact: true,
      isLegalRepresentative: true,
      new: { fullName: "Мама", phone: "+996700000012" },
    });
    expect(payload.termMonths).toBe(12);
    expect(payload.termStartsOn).toBeNull();
    expect(payload.priceAmount).toBeNull();
    expect(payload.payment).toEqual({ cashAmount: "5000", cardAmount: "0", cashlessMethodId: null });
  });

  it("uses an existing child, back-dated term and pays later", () => {
    const state = filled();
    state.child = {
      mode: "existing",
      existing: { id: 7233, fullName: "Есть", phone: "+996700000001", birthDate: null, gender: "unknown", cardNumber: "" },
      fullName: "Есть",
      phone: "+996700000001",
      birthDate: "2025-01-01",
      gender: "female",
    };
    state.representatives[0] = { ...state.representatives[0], mode: "existing", existing: {
      id: 55, fullName: "Мама", phone: "+996700000012", birthDate: null, gender: "female", cardNumber: "",
    } };
    state.program.termStartsOn = "2026-03-01";
    state.program.priceAmount = "4500,50";
    state.program.cardNumber = "МД-7";
    state.payment.mode = "later";

    const payload = buildIntakePayload(state);
    expect(payload.patient).toEqual({ id: 7233, birthDate: "2025-01-01", gender: "female", cardNumber: "МД-7" });
    expect(payload.representatives[0]).toMatchObject({ patientId: 55 });
    expect(payload.representatives[0]).not.toHaveProperty("new");
    expect(payload.termStartsOn).toBe("2026-03-01");
    expect(payload.priceAmount).toBe("4500.50");
    expect(payload.payment).toBeNull();
  });
});
