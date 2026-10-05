/** Статьи ОПиУ категорий расходов — зеркало finance.expenses.models.PnlLine бэкенда. */
export type PnlLineValue =
  | "cost" | "other_operating" | "selling" | "admin"
  | "interest" | "other_non_operating" | "income_tax" | "excluded";

/** В порядке строк формы №2; code — строка формы (у «не входит» её нет). */
export const PNL_LINE_OPTIONS: { value: PnlLineValue; code: string }[] = [
  { value: "cost", code: "020" },
  { value: "other_operating", code: "050" },
  { value: "selling", code: "070" },
  { value: "admin", code: "080" },
  { value: "interest", code: "120" },
  { value: "other_non_operating", code: "140" },
  { value: "income_tax", code: "170" },
  { value: "excluded", code: "" },
];
