/**
 * Модель формы «Зарплата сотрудника»: карточка с бэка ⇄ состояние формы ⇄
 * PATCH по разделам. Чистые функции — без React, покрыты тестами.
 *
 * Разделы сохраняются раздельно и только если изменились и разрешены:
 * у ставок, налогов и каждого своего поля — своё право (бэк отдаёт его в
 * `access` и `fields[].canEdit`), а лишний раздел в PATCH бэк отклонит 403.
 */
import type {
  SalaryCard,
  SalaryCardPatch,
  TaxBaseMode,
  TaxRates,
  TaxRegime,
  TaxSettings,
} from "../../../../api/payroll";
import {
  ruleToSalaryValue,
  salaryValueToPayload,
  type SalarySettingsValue,
} from "../DjangoSalarySettings";

/** Сентинел «Все воронки» в `pipelineIds` — общие поля правила, а не ставка воронки. */
export const ALL_PIPELINES = -1;

export type DealRuleRow = {
  id: string;
  /** ID воронок; может содержать сентинел ALL_PIPELINES. */
  pipelineIds: number[];
  percent: string;
  fixedAmount: string;
};

export type SalaryDealsValue = {
  /** Платить за сделки вообще. Выключено — все ставки по сделкам обнуляются. */
  enabled: boolean;
  rules: DealRuleRow[];
};

export type SalaryTaxValue = {
  regime: TaxRegime;
  taxBase: TaxBaseMode;
  officialSalary: string;
};

export type SalaryCardForm = {
  rates: SalarySettingsValue;
  deals: SalaryDealsValue;
  tax: SalaryTaxValue;
  /** id поля → значение, как его ввели. */
  fields: Record<number, string>;
};

export type SalarySectionKey = "rates" | "deals" | "tax" | "fields";

let dealSeq = 0;
export const newDealRuleId = () => `deal_${(dealSeq += 1)}`;

/** Число из ввода: запятая как разделитель, мусор и пустота — 0. */
export const toNumber = (value: string | number | null | undefined): number => {
  const n = parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** "10.00" → "10", "17.25" → "17.25", "0.00" → "" (пустое поле с плейсхолдером). */
export const trimAmount = (value: string | null | undefined): string => {
  const n = toNumber(value);
  return n === 0 ? "" : String(n);
};

const canonical = (value: string | number): string => String(toNumber(value));

/** Режимы, где организация удерживает налоги. */
export const WITHHOLDING_REGIMES: readonly TaxRegime[] = ["employment", "civil"];

export const isWithholding = (regime: TaxRegime) => WITHHOLDING_REGIMES.includes(regime);

// ── карточка → форма ─────────────────────────────────────────────────────────

function dealRulesFromCard(card: SalaryCard): DealRuleRow[] {
  const rows: DealRuleRow[] = [];
  const { dealPercent, dealFixedAmount, dealRates } = card.rates;
  if (toNumber(dealPercent) > 0 || toNumber(dealFixedAmount) > 0) {
    rows.push({
      id: newDealRuleId(),
      pipelineIds: [ALL_PIPELINES],
      percent: trimAmount(dealPercent),
      fixedAmount: trimAmount(dealFixedAmount),
    });
  }
  // Ставки воронок с одинаковыми % и фиксом — одно правило на несколько воронок.
  const groups = new Map<string, DealRuleRow>();
  for (const rate of dealRates) {
    const key = `${canonical(rate.percent)}|${canonical(rate.fixedAmount)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.pipelineIds.push(rate.pipelineId);
    } else {
      groups.set(key, {
        id: newDealRuleId(),
        pipelineIds: [rate.pipelineId],
        percent: trimAmount(rate.percent),
        fixedAmount: trimAmount(rate.fixedAmount),
      });
    }
  }
  return [...rows, ...groups.values()];
}

/** Ставки из правила — без «0.00» в пустых полях (там плейсхолдер). */
function ratesFromCard(card: SalaryCard): SalarySettingsValue {
  const value = ruleToSalaryValue(card.rates);
  const trimRow = <T extends { percent: string; fixedAmount: string }>(row: T): T => ({
    ...row,
    percent: trimAmount(row.percent),
    fixedAmount: trimAmount(row.fixedAmount),
  });
  return {
    ...value,
    dayRate: trimAmount(value.dayRate),
    nightRate: trimAmount(value.nightRate),
    appointmentRate: trimAmount(value.appointmentRate),
    rules: value.rules.map(trimRow),
    productRules: value.productRules.map(trimRow),
  };
}

export function cardToForm(card: SalaryCard): SalaryCardForm {
  const dealRules = dealRulesFromCard(card);
  return {
    rates: ratesFromCard(card),
    deals: { enabled: dealRules.length > 0, rules: dealRules },
    tax: {
      regime: card.tax.regime,
      taxBase: card.tax.taxBase,
      officialSalary: trimAmount(card.tax.officialSalary),
    },
    fields: Object.fromEntries(card.fields.map((f) => [f.id, trimAmount(f.value)])),
  };
}

// ── форма → PATCH ────────────────────────────────────────────────────────────

type RatesPatch = NonNullable<SalaryCardPatch["rates"]>;

function dealsPatch(deals: SalaryDealsValue): Pick<
  RatesPatch,
  "dealPercent" | "dealFixedAmount" | "dealRates"
> {
  const rules = deals.enabled ? deals.rules : [];
  const general = rules.find((r) => r.pipelineIds.includes(ALL_PIPELINES));
  return {
    dealPercent: general ? canonical(general.percent) : "0",
    dealFixedAmount: general ? canonical(general.fixedAmount) : "0",
    dealRates: rules.flatMap((r) =>
      r.pipelineIds
        .filter((id) => id !== ALL_PIPELINES)
        .map((pipelineId) => ({
          pipelineId,
          percent: canonical(r.percent),
          fixedAmount: canonical(r.fixedAmount),
        })),
    ),
  };
}

export function ratesPatch(form: SalaryCardForm): RatesPatch {
  const base = salaryValueToPayload(form.rates);
  return {
    appointmentRate: canonical(base.appointmentRate),
    dayHourlyRate: canonical(base.dayHourlyRate),
    nightHourlyRate: canonical(base.nightHourlyRate),
    productPercent: canonical(base.productPercent),
    productFixedAmount: canonical(base.productFixedAmount),
    serviceRates: base.serviceRates.map((r) => ({
      serviceId: r.serviceId,
      percent: canonical(r.percent),
      fixedAmount: canonical(r.fixedAmount),
    })),
    productRates: base.productRates.map((r) => ({
      productId: r.productId,
      percent: canonical(r.percent),
      fixedAmount: canonical(r.fixedAmount),
    })),
    ...dealsPatch(form.deals),
  };
}

export function taxPatch(form: SalaryCardForm): NonNullable<SalaryCardPatch["tax"]> {
  return {
    regime: form.tax.regime,
    taxBase: form.tax.taxBase,
    officialSalary: canonical(form.tax.officialSalary),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Какие разделы формы отличаются от загруженной карточки. */
export function dirtySections(
  form: SalaryCardForm,
  initial: SalaryCardForm,
): Record<SalarySectionKey, boolean> {
  const rates = ratesPatch(form);
  const initialRates = ratesPatch(initial);
  const { dealPercent, dealFixedAmount, dealRates, ...rest } = rates;
  const {
    dealPercent: initialDealPercent,
    dealFixedAmount: initialDealFixed,
    dealRates: initialDealRates,
    ...initialRest
  } = initialRates;
  return {
    rates: !same(rest, initialRest),
    deals: !same(
      { dealPercent, dealFixedAmount, dealRates },
      {
        dealPercent: initialDealPercent,
        dealFixedAmount: initialDealFixed,
        dealRates: initialDealRates,
      },
    ),
    tax: !same(taxPatch(form), taxPatch(initial)),
    fields: Object.keys({ ...form.fields, ...initial.fields }).some(
      (id) => toNumber(form.fields[Number(id)]) !== toNumber(initial.fields[Number(id)]),
    ),
  };
}

/**
 * PATCH из изменённых и разрешённых разделов. Пустой объект — сохранять нечего.
 * Ставки и сделки уходят одним разделом `rates` (на бэке это одно правило).
 */
export function buildSalaryPatch(
  form: SalaryCardForm,
  initial: SalaryCardForm,
  card: SalaryCard,
): SalaryCardPatch {
  const dirty = dirtySections(form, initial);
  const patch: SalaryCardPatch = {};
  if (card.access.canEditRates && (dirty.rates || dirty.deals)) {
    patch.rates = ratesPatch(form);
  }
  if (card.access.canEditTax && dirty.tax) {
    patch.tax = taxPatch(form);
  }
  const fieldValues = card.fields
    .filter((f) => f.canEdit)
    .filter((f) => toNumber(form.fields[f.id]) !== toNumber(initial.fields[f.id]))
    .map((f) => ({ fieldId: f.id, value: canonical(form.fields[f.id] ?? "") }));
  if (fieldValues.length > 0) patch.fieldValues = fieldValues;
  return patch;
}

export const isEmptyPatch = (patch: SalaryCardPatch) =>
  !patch.rates && !patch.tax && !patch.fieldValues;

// ── налоги ───────────────────────────────────────────────────────────────────

export type TaxPreview = {
  base: number;
  socialEmployee: number;
  incomeTax: number;
  socialEmployer: number;
  /** Удержано из ЗП: ПН + Соцфонд работника. */
  withheld: number;
};

const ZERO_TAXES = (base: number): TaxPreview => ({
  base,
  socialEmployee: 0,
  incomeTax: 0,
  socialEmployer: 0,
  withheld: 0,
});

export function regimeRates(settings: TaxSettings, regime: TaxRegime): TaxRates | null {
  if (regime === "employment") return settings.employment;
  if (regime === "civil") return settings.civil;
  return null;
}

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * Та же формула, что в server/apps/payroll/taxes.py — для живого превью:
 * Соцфонд работника с базы, ПН с базы за вычетом взноса и стандартного
 * вычета (не меньше нуля), Соцфонд работодателя — сверху.
 */
export function previewTaxes(
  base: number,
  rates: TaxRates | null,
  standardDeduction: number,
): TaxPreview {
  if (!rates || base <= 0) return ZERO_TAXES(Math.max(base, 0));
  const socialEmployee = cents((base * toNumber(rates.socialEmployee)) / 100);
  const taxable = Math.max(base - socialEmployee - standardDeduction, 0);
  const incomeTax = cents((taxable * toNumber(rates.incomeTax)) / 100);
  return {
    base,
    socialEmployee,
    incomeTax,
    socialEmployer: cents((base * toNumber(rates.socialEmployer)) / 100),
    withheld: cents(socialEmployee + incomeTax),
  };
}
