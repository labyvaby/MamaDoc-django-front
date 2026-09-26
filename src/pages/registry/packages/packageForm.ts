import type { ProgramPackage, ProgramPackagePayload } from "../../../api/programs";

/** Форма пакета — строки полей ввода, как в остальных окнах учёта. */
export interface PackageForm {
  name: string;
  price: string;
  listPrice: string;
  termMonths: string;
  familyDiscount: string;
  visitDiscount: string;
  description: string;
  isActive: boolean;
}

export type PackageFormErrors = Partial<Record<keyof PackageForm, string>>;

const MONEY_RE = /^\d{1,10}(?:[.,]\d{1,2})?$/;

export function packageToForm(pkg: ProgramPackage | null): PackageForm {
  if (!pkg) {
    return {
      name: "",
      price: "",
      listPrice: "",
      termMonths: "12",
      familyDiscount: "0",
      visitDiscount: "0",
      description: "",
      isActive: true,
    };
  }
  return {
    name: pkg.name,
    price: pkg.priceAmount,
    listPrice: pkg.listPriceAmount ?? "",
    termMonths: String(pkg.termMonths),
    familyDiscount: String(pkg.familyDiscountPercent),
    visitDiscount: String(pkg.visitDiscountPercent),
    description: pkg.description,
    isActive: pkg.isActive,
  };
}

function intIn(raw: string, min: number, max: number): boolean {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isInteger(value) && value >= min && value <= max;
}

function money(raw: string): string {
  return raw.trim().replace(",", ".");
}

/** Ошибки — ключи локали `registry`: окно само покажет текст. */
export function validatePackageForm(form: PackageForm): PackageFormErrors {
  const errors: PackageFormErrors = {};
  if (!form.name.trim()) errors.name = "packages.errors.name";
  if (!MONEY_RE.test(form.price.trim())) errors.price = "packages.errors.price";
  if (form.listPrice.trim()) {
    if (!MONEY_RE.test(form.listPrice.trim())) errors.listPrice = "packages.errors.price";
    else if (!errors.price && Number(money(form.listPrice)) < Number(money(form.price))) {
      errors.listPrice = "packages.errors.listPrice";
    }
  }
  if (!intIn(form.termMonths, 1, 60)) errors.termMonths = "packages.errors.term";
  if (!intIn(form.familyDiscount, 0, 100)) errors.familyDiscount = "packages.errors.percent";
  if (!intIn(form.visitDiscount, 0, 100)) errors.visitDiscount = "packages.errors.percent";
  return errors;
}

export function formToPayload(form: PackageForm): ProgramPackagePayload {
  return {
    name: form.name.trim(),
    priceAmount: money(form.price),
    listPriceAmount: form.listPrice.trim() ? money(form.listPrice) : null,
    termMonths: Number(form.termMonths),
    familyDiscountPercent: Number(form.familyDiscount),
    visitDiscountPercent: Number(form.visitDiscount),
    description: form.description.trim(),
    isActive: form.isActive,
  };
}
