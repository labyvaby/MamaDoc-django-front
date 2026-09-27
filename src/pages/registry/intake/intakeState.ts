import dayjs from "dayjs";

import {
  LEGAL_RELATIONS,
  type ChildGender,
  type IntakePayload,
  type Relation,
  type ResidenceStatus,
} from "../../../api/registry";

/**
 * Состояние мастера постановки на учёт и его правила — отдельно от UI,
 * чтобы проверки шагов и сборка запроса покрывались тестами.
 * Ошибки — ключи локали `registry`: шаг сам покажет текст.
 */

export type StepKey = "child" | "representatives" | "program" | "payment" | "documents";
/** Шаги до отправки; «документы» открываются после успешной постановки. */
export const FORM_STEPS: StepKey[] = ["child", "representatives", "program", "payment"];
export const STEPS: StepKey[] = [...FORM_STEPS, "documents"];

export interface ExistingPerson {
  id: number;
  fullName: string;
  phone: string;
  birthDate: string | null;
  gender: ChildGender;
  cardNumber: string;
  birthCertificateNumber?: string;
  birthCertificateIssuedOn?: string | null;
}

export interface ChildState {
  mode: "existing" | "new";
  existing: ExistingPerson | null;
  fullName: string;
  phone: string;
  birthDate: string;
  gender: ChildGender;
  birthCertificateNumber: string;
  /** YYYY-MM-DD или пусто. */
  birthCertificateIssuedOn: string;
}

export interface RepresentativeState {
  key: string;
  mode: "existing" | "new";
  existing: ExistingPerson | null;
  fullName: string;
  phone: string;
  relation: Relation;
  isLegalRepresentative: boolean;
  isPrimaryContact: boolean;
  receivesNotifications: boolean;
  joinFamily: boolean;
}

export interface ProgramState {
  /** Пакет учёта; программа (книжка) берётся из пакета. */
  packageId: number | null;
  branchId: number | null;
  responsibleEmployeeId: number | null;
  termMonths: string;
  /** YYYY-MM-DD; по умолчанию сегодня, для наблюдавшихся раньше — прошлая дата. */
  termStartsOn: string;
  /** Пусто — номер выдаст бэк по префиксу и начальному номеру программы. */
  cardNumber: string;
  /** Титул ф. 112/у: проживает постоянно / временно / приезжий; пусто — не указано. */
  residenceStatus: ResidenceStatus | "";
  arrivedFrom: string;
}

/** Оплата как в «Приёмах»: пустые суммы — постановка с долгом. */
export interface PaymentState {
  /** Скидка на кассе, сом: поле «% / с» пересчитывает проценты в сомы. */
  discount: number;
  cash: string;
  card: string;
  cashlessMethodId: number | null;
}

export interface PaymentPreview {
  payable: number;
  paid: number;
  debt: number;
  state: "paid" | "partial" | "unpaid";
}

export interface IntakeState {
  child: ChildState;
  representatives: RepresentativeState[];
  program: ProgramState;
  payment: PaymentState;
}

export type StepErrors = Record<string, string>;

const MIN_PHONE_DIGITS = 9;

export function hasPhone(phone: string | null | undefined): boolean {
  return (phone ?? "").replace(/\D/g, "").length >= MIN_PHONE_DIGITS;
}

export function toAmount(raw: string): number {
  const value = Number(raw.trim().replace(",", ".") || "0");
  return Number.isFinite(value) ? value : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** К оплате после скидки, внесено, долг и статус периода — до отправки. */
export function paymentPreview(payment: PaymentState, price: number): PaymentPreview {
  const payable = round2(Math.max(0, price - payment.discount));
  const paid = round2(toAmount(payment.cash) + toAmount(payment.card));
  const debt = round2(Math.max(0, payable - paid));
  return { payable, paid, debt, state: debt <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid" };
}

let keySeed = 0;
function nextKey(): string {
  keySeed += 1;
  return `r${Date.now().toString(36)}${keySeed}`;
}

export function newRepresentative(overrides: Partial<RepresentativeState> = {}): RepresentativeState {
  return {
    key: nextKey(),
    mode: "new",
    existing: null,
    fullName: "",
    phone: "",
    relation: "mother",
    isLegalRepresentative: true,
    isPrimaryContact: false,
    receivesNotifications: true,
    joinFamily: true,
    ...overrides,
  };
}

export function initialIntakeState(existing?: ExistingPerson | null): IntakeState {
  return {
    child: existing
      ? {
          mode: "existing",
          existing,
          fullName: existing.fullName,
          phone: existing.phone,
          birthDate: existing.birthDate ?? "",
          gender: existing.gender,
          birthCertificateNumber: existing.birthCertificateNumber ?? "",
          birthCertificateIssuedOn: existing.birthCertificateIssuedOn ?? "",
        }
      : {
          // Как в окне приёма: сначала поиск по базе, новая карточка — через форму пациента.
          mode: "existing",
          existing: null,
          fullName: "",
          phone: "",
          birthDate: "",
          gender: "unknown",
          birthCertificateNumber: "",
          birthCertificateIssuedOn: "",
        },
    representatives: [newRepresentative({ isPrimaryContact: true })],
    program: {
      packageId: null,
      branchId: null,
      responsibleEmployeeId: null,
      termMonths: "12",
      termStartsOn: dayjs().format("YYYY-MM-DD"),
      cardNumber: "",
      residenceStatus: "",
      arrivedFrom: "",
    },
    payment: { discount: 0, cash: "", card: "", cashlessMethodId: null },
  };
}

/** Роль задаёт законность по умолчанию: мама, папа, опекун — законные. */
export function withRelation(rep: RepresentativeState, relation: Relation): RepresentativeState {
  return { ...rep, relation, isLegalRepresentative: LEGAL_RELATIONS.includes(relation) };
}

/** Уже заведённые взрослые: по их семьям сервер ищет братьев и сестёр. */
export function existingRepresentativeIds(state: IntakeState): number[] {
  return state.representatives.flatMap((rep) => (rep.mode === "existing" && rep.existing ? [rep.existing.id] : []));
}

function repPhone(rep: RepresentativeState): string {
  return rep.mode === "existing" ? rep.existing?.phone ?? "" : rep.phone;
}

export interface ValidationContext {
  /** Стоимость периода (пакет с семейной скидкой) — до скидки на кассе. */
  price?: number;
  /** У программы есть бланк договора: без подписи постановку не завершить. */
  contractRequired?: boolean;
  contractSigned?: boolean;
}

export function validateStep(step: StepKey, state: IntakeState, context: ValidationContext = {}): StepErrors {
  const errors: StepErrors = {};
  if (step === "child") {
    const child = state.child;
    if (child.mode === "existing" && !child.existing) errors.existing = "wizard.child.pickRequired";
    if (child.mode === "new" && !child.fullName.trim()) errors.fullName = "wizard.child.fullNameRequired";
    if (child.gender === "unknown") errors.gender = "wizard.child.genderRequired";
    if (!child.birthDate) errors.birthDate = "wizard.child.birthDateRequired";
  }
  if (step === "representatives") {
    state.representatives.forEach((rep) => {
      const filled = rep.mode === "existing" ? rep.existing != null : rep.fullName.trim() !== "" && hasPhone(rep.phone);
      if (!filled) errors[rep.key] = "wizard.representatives.fillPerson";
    });
    const legalWithPhone = state.representatives.some((rep) => rep.isLegalRepresentative && hasPhone(repPhone(rep)));
    if (!legalWithPhone) errors.representatives = "wizard.representatives.needLegal";
    if (state.representatives.filter((rep) => rep.isPrimaryContact).length > 1) {
      errors.representatives = "wizard.representatives.onePrimary";
    }
  }
  if (step === "program") {
    const program = state.program;
    if (program.packageId == null) errors.packageId = "wizard.program.packageRequired";
    if (program.branchId == null) errors.branchId = "wizard.program.branchRequired";
    const months = Number(program.termMonths);
    if (!Number.isInteger(months) || months < 1 || months > 60) errors.termMonths = "wizard.program.termInvalid";
  }
  if (step === "payment") {
    if (context.price != null) {
      if (state.payment.discount > context.price + 0.001) errors.discount = "wizard.payment.discountTooBig";
      const preview = paymentPreview(state.payment, context.price);
      if (preview.paid > preview.payable + 0.001) errors.payment = "wizard.payment.overpaid";
    }
    if (context.contractRequired && !context.contractSigned) errors.contract = "wizard.payment.contractRequired";
  }
  return errors;
}

function amountOrNull(raw: string): string | null {
  const trimmed = raw.trim().replace(",", ".");
  return trimmed ? trimmed : null;
}

export function buildIntakePayload(state: IntakeState): IntakePayload {
  const { child, program, payment } = state;
  const cardNumber = program.cardNumber.trim();
  const certificateNumber = child.birthCertificateNumber.trim();
  const patient: IntakePayload["patient"] =
    child.mode === "existing" && child.existing
      ? {
          id: child.existing.id,
          birthDate: child.birthDate || null,
          gender: child.gender === "unknown" ? null : child.gender,
          cardNumber: cardNumber || null,
          // Пусто — не трогать сохранённое в карточке (бэк меняет только непустые поля).
          birthCertificateNumber: certificateNumber || null,
          birthCertificateIssuedOn: child.birthCertificateIssuedOn || null,
        }
      : {
          new: {
            fullName: child.fullName.trim(),
            phone: child.phone.trim(),
            birthDate: child.birthDate,
            gender: child.gender,
            cardNumber,
            birthCertificateNumber: certificateNumber,
            birthCertificateIssuedOn: child.birthCertificateIssuedOn || null,
          },
        };
  return {
    patient,
    representatives: state.representatives.map((rep) => ({
      relation: rep.relation,
      ...(rep.mode === "existing" && rep.existing
        ? { patientId: rep.existing.id }
        : { new: { fullName: rep.fullName.trim(), phone: rep.phone.trim() } }),
      isLegalRepresentative: rep.isLegalRepresentative,
      isPrimaryContact: rep.isPrimaryContact,
      receivesNotifications: rep.receivesNotifications,
      joinFamily: rep.joinFamily,
    })),
    packageId: program.packageId as number,
    branchId: program.branchId as number,
    residenceStatus: program.residenceStatus,
    arrivedFrom: program.arrivedFrom.trim(),
    responsibleEmployeeId: program.responsibleEmployeeId,
    termMonths: Number(program.termMonths),
    termStartsOn: program.termStartsOn || null,
    discountAmount: payment.discount > 0 ? payment.discount.toFixed(2) : null,
    payment:
      toAmount(payment.cash) + toAmount(payment.card) > 0
        ? {
            cashAmount: amountOrNull(payment.cash) ?? "0",
            cardAmount: amountOrNull(payment.card) ?? "0",
            cashlessMethodId: toAmount(payment.card) > 0 ? payment.cashlessMethodId : null,
          }
        : null,
  };
}
