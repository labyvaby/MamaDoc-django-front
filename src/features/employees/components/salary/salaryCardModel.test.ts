import { describe, expect, it } from "vitest";

import type { SalaryCard } from "../../../../api/payroll";
import {
  ALL_PIPELINES,
  buildSalaryPatch,
  cardToForm,
  dirtySections,
  isEmptyPatch,
  previewTaxes,
  regimeRates,
  trimAmount,
  type SalaryCardForm,
} from "./salaryCardModel";

const TAXES = {
  standardDeduction: "0.00",
  employment: { incomeTax: "10", socialEmployee: "10", socialEmployer: "17.25" },
  civil: { incomeTax: "10", socialEmployee: "10", socialEmployer: "17.25" },
};

const card = (overrides: Partial<SalaryCard> = {}): SalaryCard => ({
  employeeId: 7,
  employeeFullName: "Айгуль",
  rates: {
    appointmentRate: "100.00",
    dayHourlyRate: "0.00",
    nightHourlyRate: "0.00",
    productPercent: "0.00",
    productFixedAmount: "0.00",
    dealPercent: "5.00",
    dealFixedAmount: "0.00",
    serviceRates: [],
    productRates: [],
    dealRates: [
      { pipelineId: 1, pipelineName: "VIP", percent: "10.00", fixedAmount: "500.00" },
      { pipelineId: 2, pipelineName: "Опт", percent: "10.00", fixedAmount: "500.00" },
    ],
  },
  tax: { regime: "employment", taxBase: "official", officialSalary: "20000.00" },
  fields: [
    { id: 11, name: "Стаж", kind: "accrual", valueType: "amount", value: "3000.00", canEdit: true },
    { id: 12, name: "Секрет", kind: "deduction", valueType: "percent", value: "5.00", canEdit: false },
  ],
  taxSettings: TAXES,
  pipelines: [
    { id: 1, name: "VIP" },
    { id: 2, name: "Опт" },
  ],
  access: {
    readOnly: false,
    canEditRates: true,
    canEditTax: true,
    canManageFields: false,
    canManageTaxSettings: true,
  },
  ...overrides,
});

const clone = (form: SalaryCardForm): SalaryCardForm => JSON.parse(JSON.stringify(form));

describe("cardToForm", () => {
  it("общая ставка по сделкам — правило «Все воронки», одинаковые ставки воронок — одно правило", () => {
    const form = cardToForm(card());
    expect(form.deals.enabled).toBe(true);
    expect(form.deals.rules.map((r) => [r.pipelineIds, r.percent, r.fixedAmount])).toEqual([
      [[ALL_PIPELINES], "5", ""],
      [[1, 2], "10", "500"],
    ]);
    expect(form.tax).toEqual({ regime: "employment", taxBase: "official", officialSalary: "20000" });
    expect(form.fields).toEqual({ 11: "3000", 12: "5" });
  });

  it("без ставок по сделкам раздел выключен", () => {
    const form = cardToForm(
      card({
        rates: { ...card().rates, dealPercent: "0.00", dealRates: [] },
      }),
    );
    expect(form.deals).toEqual({ enabled: false, rules: [] });
  });
});

describe("buildSalaryPatch", () => {
  it("нетронутая форма — пустой PATCH", () => {
    const initial = cardToForm(card());
    const patch = buildSalaryPatch(clone(initial), initial, card());
    expect(isEmptyPatch(patch)).toBe(true);
    expect(dirtySections(clone(initial), initial)).toEqual({
      rates: false,
      deals: false,
      tax: false,
      fields: false,
    });
  });

  it("«10» и «10.00» — одно и то же значение", () => {
    const initial = cardToForm(card());
    const form = clone(initial);
    form.deals.rules[1].percent = "10.00";
    form.fields[11] = "3000,00";
    expect(isEmptyPatch(buildSalaryPatch(form, initial, card()))).toBe(true);
  });

  it("выключенные сделки обнуляют общую ставку и ставки воронок", () => {
    const initial = cardToForm(card());
    const form = clone(initial);
    form.deals.enabled = false;
    const patch = buildSalaryPatch(form, initial, card());
    expect(patch.rates?.dealPercent).toBe("0");
    expect(patch.rates?.dealRates).toEqual([]);
    expect(patch.rates?.appointmentRate).toBe("100");
    expect(patch.tax).toBeUndefined();
  });

  it("правило на несколько воронок раскладывается на ставку каждой", () => {
    const initial = cardToForm(card());
    const form = clone(initial);
    form.deals.rules[1].fixedAmount = "700";
    expect(buildSalaryPatch(form, initial, card()).rates?.dealRates).toEqual([
      { pipelineId: 1, percent: "10", fixedAmount: "700" },
      { pipelineId: 2, percent: "10", fixedAmount: "700" },
    ]);
  });

  it("шлёт только разрешённые разделы и поля", () => {
    const limited = card({
      access: { ...card().access, canEditRates: false },
    });
    const initial = cardToForm(limited);
    const form = clone(initial);
    form.rates.appointmentRate = "999";
    form.tax.officialSalary = "25000";
    form.fields[11] = "4000";
    form.fields[12] = "50"; // поле без права — не уходит
    const patch = buildSalaryPatch(form, initial, limited);
    expect(patch.rates).toBeUndefined();
    expect(patch.tax).toEqual({ regime: "employment", taxBase: "official", officialSalary: "25000" });
    expect(patch.fieldValues).toEqual([{ fieldId: 11, value: "4000" }]);
  });

  it("очищенное поле уходит нулём", () => {
    const initial = cardToForm(card());
    const form = clone(initial);
    form.fields[11] = "";
    expect(buildSalaryPatch(form, initial, card()).fieldValues).toEqual([
      { fieldId: 11, value: "0" },
    ]);
  });
});

describe("previewTaxes", () => {
  it("как на бэке: ПН с базы за вычетом Соцфонда", () => {
    const preview = previewTaxes(20000, regimeRates(TAXES, "employment"), 0);
    expect(preview).toEqual({
      base: 20000,
      socialEmployee: 2000,
      incomeTax: 1800,
      socialEmployer: 3450,
      withheld: 3800,
    });
  });

  it("вычет не уводит ПН в минус", () => {
    const preview = previewTaxes(500, regimeRates(TAXES, "civil"), 650);
    expect(preview.incomeTax).toBe(0);
    expect(preview.socialEmployee).toBe(50);
  });

  it("патент и без оформления — без удержаний", () => {
    expect(regimeRates(TAXES, "patent")).toBeNull();
    expect(previewTaxes(20000, regimeRates(TAXES, "unofficial"), 0).withheld).toBe(0);
  });
});

describe("trimAmount", () => {
  it("убирает нули и хвосты", () => {
    expect(trimAmount("0.00")).toBe("");
    expect(trimAmount("17.25")).toBe("17.25");
    expect(trimAmount("20000.00")).toBe("20000");
  });
});
