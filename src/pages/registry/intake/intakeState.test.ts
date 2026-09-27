import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import {
  buildIntakePayload,
  existingRepresentativeIds,
  initialIntakeState,
  newRepresentative,
  paymentPreview,
  validateStep,
  withRelation,
  type IntakeState,
} from "./intakeState";

function filled(): IntakeState {
  const state = initialIntakeState();
  return {
    ...state,
    child: {
      mode: "new",
      existing: null,
      fullName: "Иванов Али",
      phone: "",
      birthDate: "2026-05-10",
      gender: "male",
      birthCertificateNumber: "",
      birthCertificateIssuedOn: "",
    },
    representatives: [
      newRepresentative({ key: "r1", fullName: "Мама", phone: "+996700000012", isPrimaryContact: true }),
    ],
    program: {
      packageId: 3,
      branchId: 14,
      responsibleEmployeeId: 7,
      termMonths: "12",
      termStartsOn: "",
      cardNumber: "",
      residenceStatus: "",
      arrivedFrom: "",
    },
    payment: { discount: 0, cash: "5000", card: "", cashlessMethodId: null },
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

  it("starts with a search of the base, as the appointment form does", () => {
    const state = initialIntakeState();
    expect(state.child.mode).toBe("existing");
    expect(validateStep("child", state).existing).toBe("wizard.child.pickRequired");
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
    state.program.packageId = null;
    state.program.termMonths = "61";
    expect(validateStep("program", state)).toEqual({
      packageId: "wizard.program.packageRequired",
      termMonths: "wizard.program.termInvalid",
    });
    const pay = filled();
    pay.payment.cash = "6000";
    expect(validateStep("payment", pay, { price: 5000 })).toEqual({ payment: "wizard.payment.overpaid" });
    pay.payment = { discount: 1000, cash: "4000", card: "", cashlessMethodId: null };
    expect(validateStep("payment", pay, { price: 5000 })).toEqual({});
    pay.payment.cash = "4500";
    expect(validateStep("payment", pay, { price: 5000 })).toEqual({ payment: "wizard.payment.overpaid" });
    pay.payment = { discount: 5000.01, cash: "", card: "", cashlessMethodId: null };
    expect(validateStep("payment", pay, { price: 5000 })).toEqual({ discount: "wizard.payment.discountTooBig" });
  });

  it("lets the child be put on file with a debt, but not without the signed contract", () => {
    const state = filled();
    state.payment = { discount: 0, cash: "", card: "", cashlessMethodId: null };
    expect(validateStep("payment", state, { price: 5000 })).toEqual({});
    expect(validateStep("payment", state, { price: 5000, contractRequired: true })).toEqual({
      contract: "wizard.payment.contractRequired",
    });
    expect(validateStep("payment", state, { price: 5000, contractRequired: true, contractSigned: true })).toEqual({});
  });

  it("counts the total, the debt and the state like the appointment payment", () => {
    const payment = { discount: 1000, cash: "1000", card: "", cashlessMethodId: null };
    expect(paymentPreview(payment, 5000)).toEqual({ payable: 4000, paid: 1000, debt: 3000, state: "partial" });
    expect(paymentPreview({ ...payment, card: "3000" }, 5000).state).toBe("paid");
    expect(paymentPreview({ ...payment, cash: "" }, 5000).state).toBe("unpaid");
    expect(paymentPreview({ ...payment, discount: 5000, cash: "" }, 5000)).toEqual({
      payable: 0,
      paid: 0,
      debt: 0,
      state: "paid",
    });
  });

  it("starts the term today unless it is back-dated", () => {
    expect(initialIntakeState().program.termStartsOn).toBe(dayjs().format("YYYY-MM-DD"));
  });

  it("builds the intake payload for a new child with a first payment", () => {
    const payload = buildIntakePayload(filled());
    expect(payload.patient.new).toEqual({
      fullName: "Иванов Али",
      phone: "",
      birthDate: "2026-05-10",
      gender: "male",
      cardNumber: "",
      birthCertificateNumber: "",
      birthCertificateIssuedOn: null,
    });
    expect(payload.representatives[0]).toMatchObject({
      relation: "mother",
      isPrimaryContact: true,
      isLegalRepresentative: true,
      new: { fullName: "Мама", phone: "+996700000012" },
    });
    expect(payload.packageId).toBe(3);
    expect(payload.termMonths).toBe(12);
    expect(payload.termStartsOn).toBeNull();
    expect(payload.discountAmount).toBeNull();
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
      birthCertificateNumber: "KR-I 1",
      birthCertificateIssuedOn: "2025-02-01",
    };
    state.representatives[0] = { ...state.representatives[0], mode: "existing", existing: {
      id: 55, fullName: "Мама", phone: "+996700000012", birthDate: null, gender: "female", cardNumber: "",
    } };
    state.program.termStartsOn = "2026-03-01";
    state.program.cardNumber = "МД-7";
    state.payment = { discount: 499.5, cash: "", card: "", cashlessMethodId: null };

    const payload = buildIntakePayload(state);
    expect(payload.patient).toEqual({
      id: 7233,
      birthDate: "2025-01-01",
      gender: "female",
      cardNumber: "МД-7",
      birthCertificateNumber: "KR-I 1",
      birthCertificateIssuedOn: "2025-02-01",
    });
    expect(payload.representatives[0]).toMatchObject({ patientId: 55 });
    expect(payload.representatives[0]).not.toHaveProperty("new");
    expect(payload.termStartsOn).toBe("2026-03-01");
    expect(payload.discountAmount).toBe("499.50");
    expect(payload.payment).toBeNull();
  });

  it("keeps the stored certificate of an existing child when the fields are left empty", () => {
    const state = filled();
    state.child = {
      ...state.child,
      mode: "existing",
      existing: { id: 7233, fullName: "Есть", phone: "", birthDate: "2025-01-01", gender: "male", cardNumber: "" },
    };
    const payload = buildIntakePayload(state);
    expect(payload.patient.birthCertificateNumber).toBeNull();
    expect(payload.patient.birthCertificateIssuedOn).toBeNull();
  });

  it("collects the adults already in the base for the family discount", () => {
    const state = filled();
    state.representatives = [
      newRepresentative({
        key: "r1",
        mode: "existing",
        existing: { id: 55, fullName: "Мама", phone: "+996700000012", birthDate: null, gender: "female", cardNumber: "" },
      }),
      newRepresentative({ key: "r2", fullName: "Папа", phone: "+996700000013" }),
    ];
    expect(existingRepresentativeIds(state)).toEqual([55]);
  });

  it("passes the title page fields of form 112", () => {
    const state = filled();
    state.program.residenceStatus = "visitor";
    state.program.arrivedFrom = " Роддом №2 ";
    const payload = buildIntakePayload(state);
    expect(payload.residenceStatus).toBe("visitor");
    expect(payload.arrivedFrom).toBe("Роддом №2");
  });
});
