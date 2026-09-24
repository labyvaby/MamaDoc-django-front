import {
  LEGAL_RELATIONS,
  type ChildGender,
  type IntakePayload,
  type Relation,
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
}

export interface ChildState {
  mode: "existing" | "new";
  existing: ExistingPerson | null;
  fullName: string;
  phone: string;
  birthDate: string;
  gender: ChildGender;
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
  programId: number | null;
  branchId: number | null;
  responsibleEmployeeId: number | null;
  termMonths: string;
  /** YYYY-MM-DD; пусто — период начнётся сегодня. */
  termStartsOn: string;
  /** Пусто — цена услуги-взноса. */
  priceAmount: string;
  /** Пусто — номер выдаст бэк по префиксу программы. */
  cardNumber: string;
}

export interface PaymentState {
  mode: "now" | "later";
  cash: string;
  card: string;
  cashlessMethodId: number | null;
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
        }
      : { mode: "new", existing: null, fullName: "", phone: "", birthDate: "", gender: "unknown" },
    representatives: [newRepresentative({ isPrimaryContact: true })],
    program: {
      programId: null,
      branchId: null,
      responsibleEmployeeId: null,
      termMonths: "12",
      termStartsOn: "",
      priceAmount: "",
      cardNumber: "",
    },
    payment: { mode: "now", cash: "", card: "", cashlessMethodId: null },
  };
}

/** Роль задаёт законность по умолчанию: мама, папа, опекун — законные. */
export function withRelation(rep: RepresentativeState, relation: Relation): RepresentativeState {
  return { ...rep, relation, isLegalRepresentative: LEGAL_RELATIONS.includes(relation) };
}

function repPhone(rep: RepresentativeState): string {
  return rep.mode === "existing" ? rep.existing?.phone ?? "" : rep.phone;
}

export interface ValidationContext {
  /** Цена периода для проверки переплаты (из программы или вручную). */
  price?: number;
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
    if (program.programId == null) errors.programId = "wizard.program.programRequired";
    if (program.branchId == null) errors.branchId = "wizard.program.branchRequired";
    const months = Number(program.termMonths);
    if (!Number.isInteger(months) || months < 1 || months > 60) errors.termMonths = "wizard.program.termInvalid";
  }
  if (step === "payment" && state.payment.mode === "now") {
    const total = toAmount(state.payment.cash) + toAmount(state.payment.card);
    if (total <= 0) errors.payment = "wizard.payment.empty";
    else if (context.price != null && total > context.price + 0.001) errors.payment = "wizard.payment.overpaid";
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
  const patient: IntakePayload["patient"] =
    child.mode === "existing" && child.existing
      ? {
          id: child.existing.id,
          birthDate: child.birthDate || null,
          gender: child.gender === "unknown" ? null : child.gender,
          cardNumber: cardNumber || null,
        }
      : {
          new: {
            fullName: child.fullName.trim(),
            phone: child.phone.trim(),
            birthDate: child.birthDate,
            gender: child.gender,
            cardNumber,
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
    programId: program.programId as number,
    branchId: program.branchId as number,
    responsibleEmployeeId: program.responsibleEmployeeId,
    termMonths: Number(program.termMonths),
    termStartsOn: program.termStartsOn || null,
    priceAmount: amountOrNull(program.priceAmount),
    payment:
      payment.mode === "now"
        ? {
            cashAmount: amountOrNull(payment.cash) ?? "0",
            cardAmount: amountOrNull(payment.card) ?? "0",
            cashlessMethodId: toAmount(payment.card) > 0 ? payment.cashlessMethodId : null,
          }
        : null,
  };
}
