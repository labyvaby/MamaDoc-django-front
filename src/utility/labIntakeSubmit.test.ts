import { describe, it, expect } from "vitest";

import {
  effectivePatientInfo,
  buildPatientPatch,
  buildLabIntakeBody,
  type PatientEdits,
} from "./labIntakeSubmit";
import type { DjangoPatient } from "../api/patients";
import type { LabOrderAnswerInput, LabOrderLineInput } from "../api/lab";

// ── effectivePatientInfo ─────────────────────────────────────────────────────

const patient = (over: Partial<DjangoPatient> = {}): DjangoPatient => ({
  id: 9622,
  organizationId: 1,
  branch: null,
  fullName: "Иванова Мария Петровна",
  phone: "+996700000000",
  secondaryPhone: null,
  birthDate: "1990-05-17",
  gender: "female",
  address: null,
  notes: null,
  source: null,
  photoUrl: null,
  inn: "12345678901234",
  isBlacklisted: false,
  blacklistReason: "",
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

const edits = (over: Partial<PatientEdits> = {}): PatientEdits => ({
  inn: "",
  birthDate: null,
  gender: "",
  ...over,
});

describe("effectivePatientInfo", () => {
  it("полная карта — правки игнорируются", () => {
    expect(
      effectivePatientInfo(patient(), edits({ inn: "00000000000000", birthDate: "2000-01-01", gender: "male" })),
    ).toEqual({ inn: "12345678901234", birthDate: "1990-05-17", gender: "female" });
  });

  it("нет ИНН в карте — берётся правка", () => {
    expect(effectivePatientInfo(patient({ inn: "" }), edits({ inn: "11111111111111" }))).toEqual({
      inn: "11111111111111",
      birthDate: "1990-05-17",
      gender: "female",
    });
  });

  it("пробелы в правке ИНН обрезаются", () => {
    expect(
      effectivePatientInfo(patient({ inn: "" }), edits({ inn: "  11111111111111  " })),
    ).toEqual({ inn: "11111111111111", birthDate: "1990-05-17", gender: "female" });
  });

  it("нет даты рождения в карте — берётся правка", () => {
    expect(
      effectivePatientInfo(patient({ birthDate: null }), edits({ birthDate: "1985-03-02" })),
    ).toEqual({ inn: "12345678901234", birthDate: "1985-03-02", gender: "female" });
  });

  it("пол unknown в карте и выбранный в правке — берётся правка", () => {
    expect(
      effectivePatientInfo(patient({ gender: "unknown" }), edits({ gender: "male" })),
    ).toEqual({ inn: "12345678901234", birthDate: "1990-05-17", gender: "male" });
  });

  it("пол unknown в карте и ещё не выбран в правке — остаётся unknown", () => {
    expect(effectivePatientInfo(patient({ gender: "unknown" }), edits())).toEqual({
      inn: "12345678901234",
      birthDate: "1990-05-17",
      gender: "unknown",
    });
  });

  it("пол уже известен в карте — правка не может его перебить", () => {
    // Дозаполнение показывается только когда значения нет (PatientSection,
    // needsGender). Если оно всё же пришло — карта была бы источником лжи,
    // а не UI, поэтому карта побеждает всегда.
    expect(
      effectivePatientInfo(patient({ gender: "male" }), edits({ gender: "female" })),
    ).toEqual({ inn: "12345678901234", birthDate: "1990-05-17", gender: "male" });
  });

  it("пациент не выбран — правки со сбросом пола в unknown", () => {
    expect(
      effectivePatientInfo(null, edits({ inn: "22222222222222", birthDate: "1970-01-01", gender: "male" })),
    ).toEqual({ inn: "22222222222222", birthDate: "1970-01-01", gender: "male" });
  });

  it("пациент не выбран и правок нет — пустые значения", () => {
    expect(effectivePatientInfo(null, edits())).toEqual({
      inn: "",
      birthDate: null,
      gender: "unknown",
    });
  });
});

// ── buildPatientPatch ─────────────────────────────────────────────────────────

describe("buildPatientPatch", () => {
  it("карта уже полная — PATCH не нужен", () => {
    expect(buildPatientPatch(patient(), edits({ inn: "x", birthDate: "2000-01-01", gender: "male" }))).toBeNull();
  });

  it("не хватало ИНН — попадает в патч обрезанным", () => {
    expect(buildPatientPatch(patient({ inn: "" }), edits({ inn: "  11111111111111  " }))).toEqual({
      inn: "11111111111111",
    });
  });

  it("не хватало ИНН, но его не ввели — патч по нему не создаётся", () => {
    expect(buildPatientPatch(patient({ inn: "" }), edits({ inn: "   " }))).toBeNull();
  });

  it("не хватало даты рождения — попадает в патч", () => {
    expect(buildPatientPatch(patient({ birthDate: null }), edits({ birthDate: "1985-03-02" }))).toEqual({
      birthDate: "1985-03-02",
    });
  });

  it("пол unknown и выбран в правке — попадает в патч", () => {
    expect(buildPatientPatch(patient({ gender: "unknown" }), edits({ gender: "female" }))).toEqual({
      gender: "female",
    });
  });

  it("пол unknown, но ещё не выбран — патч по нему не создаётся", () => {
    expect(buildPatientPatch(patient({ gender: "unknown" }), edits())).toBeNull();
  });

  it("пол уже известен — правка его не переопределяет", () => {
    expect(buildPatientPatch(patient({ gender: "male" }), edits({ gender: "female" }))).toBeNull();
  });

  it("несколько недостающих полей — все три в одном патче", () => {
    expect(
      buildPatientPatch(
        patient({ inn: "", birthDate: null, gender: "unknown" }),
        edits({ inn: "11111111111111", birthDate: "1985-03-02", gender: "male" }),
      ),
    ).toEqual({ inn: "11111111111111", birthDate: "1985-03-02", gender: "male" });
  });
});

// ── buildLabIntakeBody ────────────────────────────────────────────────────────

const lines: LabOrderLineInput[] = [{ testId: 5, count: 2, express: true }];
const answers: LabOrderAnswerInput[] = [
  { lisQuestionId: 40, title: "Срок беременности", fieldType: "INTEGER", value: "12" },
];

describe("buildLabIntakeBody", () => {
  it("собирает тело целиком с безналом и скидкой", () => {
    expect(
      buildLabIntakeBody({
        patientId: 9622,
        branchId: 3,
        lines,
        answers,
        paidCash: "50",
        paidCard: "200",
        cashlessMethodId: 7,
        discountPercent: 10,
        referringDoctorId: null,
        clientTypeId: null,
        personalDataConsent: true,
      }),
    ).toEqual({
      patientId: 9622,
      branchId: 3,
      lines,
      answers,
      paidCash: "50.00",
      paidCard: "200.00",
      personalDataConsent: true,
      cashlessMethodId: 7,
      discountPercent: 10,
    });
  });

  it("без оплаты картой способ безнала не отправляется вовсе", () => {
    const body = buildLabIntakeBody({
      patientId: 1,
      branchId: 1,
      lines: [],
      answers: [],
      paidCash: "100",
      paidCard: "0",
      cashlessMethodId: null,
      discountPercent: 0,
      referringDoctorId: null,
      clientTypeId: null,
      personalDataConsent: true,
    });
    expect(body).toEqual({
      personalDataConsent: true,
      patientId: 1,
      branchId: 1,
      lines: [],
      answers: [],
      paidCash: "100.00",
      paidCard: "0.00",
    });
    expect("cashlessMethodId" in body).toBe(false);
    expect("discountPercent" in body).toBe(false);
  });

  it("нулевая скидка не отправляется", () => {
    const body = buildLabIntakeBody({
      patientId: 1,
      branchId: 1,
      lines: [],
      answers: [],
      paidCash: "0",
      paidCard: "0",
      cashlessMethodId: null,
      discountPercent: 0,
      referringDoctorId: null,
      clientTypeId: null,
      personalDataConsent: true,
    });
    expect("discountPercent" in body).toBe(false);
  });

  it("положительная скидка отправляется как есть", () => {
    const body = buildLabIntakeBody({
      patientId: 1,
      branchId: 1,
      lines: [],
      answers: [],
      paidCash: "0",
      paidCard: "0",
      cashlessMethodId: null,
      discountPercent: 15,
      referringDoctorId: null,
      clientTypeId: null,
      personalDataConsent: true,
    });
    expect(body.discountPercent).toBe(15);
  });

  it("запятая в оплате трактуется как десятичный разделитель", () => {
    const body = buildLabIntakeBody({
      patientId: 1,
      branchId: 1,
      lines: [],
      answers: [],
      paidCash: "150,5",
      paidCard: "0",
      cashlessMethodId: null,
      discountPercent: 0,
      referringDoctorId: null,
      clientTypeId: null,
      personalDataConsent: true,
    });
    expect(body.paidCash).toBe("150.50");
  });

  it("пустая строка оплаты — ноль, а не NaN", () => {
    const body = buildLabIntakeBody({
      patientId: 1,
      branchId: 1,
      lines: [],
      answers: [],
      paidCash: "",
      paidCard: "",
      cashlessMethodId: null,
      discountPercent: 0,
      referringDoctorId: null,
      clientTypeId: null,
      personalDataConsent: true,
    });
    expect(body.paidCash).toBe("0.00");
    expect(body.paidCard).toBe("0.00");
  });

  it("мусор в поле оплаты — ноль, а не NaN", () => {
    const body = buildLabIntakeBody({
      patientId: 1,
      branchId: 1,
      lines: [],
      answers: [],
      paidCash: "abc",
      paidCard: "0",
      cashlessMethodId: null,
      discountPercent: 0,
      referringDoctorId: null,
      clientTypeId: null,
      personalDataConsent: true,
    });
    expect(body.paidCash).toBe("0.00");
  });

  it("отрицательная оплата обрезается до нуля", () => {
    const body = buildLabIntakeBody({
      patientId: 1,
      branchId: 1,
      lines: [],
      answers: [],
      paidCash: "-10",
      paidCard: "0",
      cashlessMethodId: null,
      discountPercent: 0,
      referringDoctorId: null,
      clientTypeId: null,
      personalDataConsent: true,
    });
    expect(body.paidCash).toBe("0.00");
  });

  it("строки и ответы передаются как есть, без потерь", () => {
    const body = buildLabIntakeBody({
      patientId: 1,
      branchId: 1,
      lines,
      answers,
      paidCash: "0",
      paidCard: "0",
      cashlessMethodId: null,
      discountPercent: 0,
      referringDoctorId: null,
      clientTypeId: null,
      personalDataConsent: true,
    });
    expect(body.lines).toEqual(lines);
    expect(body.answers).toEqual(answers);
  });
});

describe("направивший врач в теле приёма", () => {
  const base = {
    patientId: 9622,
    branchId: 3,
    lines: [{ testId: 1, count: 1, express: false }],
    answers: [],
    paidCash: "250",
    paidCard: "0",
    cashlessMethodId: null,
    discountPercent: 0,
    referringDoctorId: null,
    clientTypeId: null,
    personalDataConsent: true,
  };

  it("выбранный врач уходит в тело запроса", () => {
    const body = buildLabIntakeBody({ ...base, referringDoctorId: 12 });

    expect(body.referringDoctorId).toBe(12);
  });

  it("без врача ключа в теле нет вовсе", () => {
    // Явный null вместо отсутствия ключа — знакомые грабли msgspec-схем
    // этого проекта, ровно как с cashlessMethodId выше.
    const body = buildLabIntakeBody({ ...base, referringDoctorId: null });

    expect("referringDoctorId" in body).toBe(false);
  });
});

describe("комментарий в теле приёма", () => {
  const base = {
    patientId: 9622,
    branchId: 3,
    lines: [],
    answers: [],
    paidCash: "0",
    paidCard: "0",
    cashlessMethodId: null,
    discountPercent: 0,
    referringDoctorId: null,
    clientTypeId: null,
    personalDataConsent: true,
  };

  it("непустой комментарий уходит без лишних пробелов", () => {
    const body = buildLabIntakeBody({ ...base, comment: "  срочно  " });

    expect(body.comment).toBe("срочно");
  });

  it("пустой комментарий ключа не создаёт", () => {
    const body = buildLabIntakeBody({ ...base, comment: "   " });

    expect("comment" in body).toBe(false);
  });
});

describe("тип клиента в теле приёма", () => {
  const base = {
    patientId: 9622,
    branchId: 3,
    lines: [],
    answers: [],
    paidCash: "0",
    paidCard: "0",
    cashlessMethodId: null,
    referringDoctorId: null,
    clientTypeId: null,
    personalDataConsent: true,
  };

  it("выбранный тип уходит вместе со своей скидкой", () => {
    // Скидка и тип — один справочник ЛИС: бэкенд отвергнет пару, где они
    // разошлись, поэтому тело собирается из одного источника.
    const body = buildLabIntakeBody({
      ...base,
      discountPercent: 10,
      clientTypeId: 7,
      personalDataConsent: true,
    });

    expect(body.clientTypeId).toBe(7);
    expect(body.discountPercent).toBe(10);
  });

  it("без типа ключа нет — бэкенд подставит нулевой", () => {
    const body = buildLabIntakeBody({
      ...base,
      discountPercent: 0,
      clientTypeId: null,
      personalDataConsent: true,
    });

    expect("clientTypeId" in body).toBe(false);
  });
});

describe("согласие в теле приёма", () => {
  it("флаг согласия уходит явно, даже когда он true", () => {
    // Бэкенд отказывает без согласия; ключ должен присутствовать всегда,
    // чтобы отказ был про согласие, а не про отсутствующее поле.
    const body = buildLabIntakeBody({
      patientId: 1,
      branchId: 1,
      lines: [],
      answers: [],
      paidCash: "0",
      paidCard: "0",
      cashlessMethodId: null,
      discountPercent: 0,
      referringDoctorId: null,
      clientTypeId: null,
      personalDataConsent: true,
    });

    expect(body.personalDataConsent).toBe(true);
  });
});
