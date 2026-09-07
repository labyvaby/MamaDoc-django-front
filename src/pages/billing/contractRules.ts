import type { BillingContract, ContractDefaults } from "../../api/billing";

/**
 * Правила начислений — один набор полей на два экрана: правила конкретного
 * контракта (`PATCH /contracts/<id>/`) и правила по умолчанию для новых
 * контрактов организации (`PATCH /contract-defaults/`). Модели на бэкенде
 * разные, но поля совпадают один в один, поэтому подписи, границы значений
 * и разбор формы живут здесь, а не дублируются в двух диалогах.
 */

/** Границы из моделей биллинга: `MAX_CHARGE_LEAD_DAYS`, `MAX_GRACE_DAYS`. */
export const MAX_CHARGE_LEAD_DAYS = 60;
export const MAX_GRACE_DAYS = 180;

/**
 * Пустая периодичность — не «не выбрано», а осмысленное «наследовать у объекта
 * продажи» (`billing_cycle` на модели `blank=True, default=''`). Поэтому пустой
 * вариант всегда первый в списке, а не отсутствует.
 */
export const CYCLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Как у объекта продажи" },
  { value: "one_time", label: "Разово" },
  { value: "package", label: "Пакет" },
  { value: "monthly", label: "Ежемесячно" },
  { value: "quarterly", label: "Ежеквартально" },
  { value: "yearly", label: "Ежегодно" },
  { value: "per_course", label: "За курс" },
  { value: "per_session", label: "За занятие" },
];

export type ContractRulesValues = {
  billingCycle: string;
  autoCharge: boolean;
  /** Строка, а не число: поле может быть пустым, пока пользователь его правит. */
  chargeLeadDays: string;
  /** Пусто = «по календарю» (на бэкенде `null`). */
  paymentTermDays: string;
  graceDays: string;
  notifyOnCharge: boolean;
  notifyDaysBeforeDue: string;
  notifyOnOverdue: boolean;
};

const asString = (value: number | null | undefined) =>
  value == null ? "" : String(value);

export function rulesFromContract(contract: BillingContract): ContractRulesValues {
  return {
    billingCycle: contract.billingCycle,
    autoCharge: contract.autoCharge,
    chargeLeadDays: asString(contract.chargeLeadDays),
    paymentTermDays: asString(contract.paymentTermDays),
    graceDays: asString(contract.graceDays),
    notifyOnCharge: contract.notifyOnCharge,
    notifyDaysBeforeDue: asString(contract.notifyDaysBeforeDue),
    notifyOnOverdue: contract.notifyOnOverdue,
  };
}

export function rulesFromDefaults(defaults: ContractDefaults): ContractRulesValues {
  return {
    billingCycle: defaults.billingCycle,
    autoCharge: defaults.autoCharge,
    chargeLeadDays: asString(defaults.chargeLeadDays),
    paymentTermDays: asString(defaults.paymentTermDays),
    graceDays: asString(defaults.graceDays),
    notifyOnCharge: defaults.notifyOnCharge,
    notifyDaysBeforeDue: asString(defaults.notifyDaysBeforeDue),
    notifyOnOverdue: defaults.notifyOnOverdue,
  };
}

/** Пустое число трактуем как 0, кроме срока оплаты — там пусто значит `null`. */
export function rulesToPayload(values: ContractRulesValues): Record<string, unknown> {
  return {
    billingCycle: values.billingCycle,
    autoCharge: values.autoCharge,
    chargeLeadDays: Number(values.chargeLeadDays || 0),
    paymentTermDays: values.paymentTermDays === "" ? null : Number(values.paymentTermDays),
    graceDays: Number(values.graceDays || 0),
    notifyOnCharge: values.notifyOnCharge,
    notifyDaysBeforeDue: Number(values.notifyDaysBeforeDue || 0),
    notifyOnOverdue: values.notifyOnOverdue,
  };
}

const inRange = (raw: string, max: number) => {
  if (raw === "") return true;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= max;
};

/** Что забракует `full_clean()` на бэкенде — ловим до отправки. */
export function rulesError(values: ContractRulesValues): string | null {
  if (!inRange(values.chargeLeadDays, MAX_CHARGE_LEAD_DAYS)) {
    return `Опережение начисления — целое число от 0 до ${MAX_CHARGE_LEAD_DAYS} дней.`;
  }
  if (!inRange(values.graceDays, MAX_GRACE_DAYS)) {
    return `Льготный период — целое число от 0 до ${MAX_GRACE_DAYS} дней.`;
  }
  if (!inRange(values.paymentTermDays, 365)) {
    return "Срок оплаты — целое число от 0 до 365 дней либо пусто.";
  }
  if (!inRange(values.notifyDaysBeforeDue, 365)) {
    return "Напоминание — целое число от 0 до 365 дней.";
  }
  return null;
}
