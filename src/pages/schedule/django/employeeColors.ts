import React from "react";

/**
 * Категориальная палитра для различения сотрудников на полосах календаря.
 * 7 оттенков (без красного — он уже занят семантикой «все кабинеты заняты»)
 * из проверенной CVD-safe палитры (light/dark пары), см. dataviz skill
 * references/palette.md. Порядок фиксирован — не переставлять.
 */
export const EMPLOYEE_PALETTE: { light: string; dark: string }[] = [
  { light: "#2a78d6", dark: "#3987e5" }, // синий
  { light: "#1baf7a", dark: "#199e70" }, // бирюзовый
  { light: "#eda100", dark: "#c98500" }, // жёлтый
  { light: "#008300", dark: "#008300" }, // зелёный
  { light: "#4a3aa7", dark: "#9085e9" }, // фиолетовый
  { light: "#e87ba4", dark: "#d55181" }, // розовый
  { light: "#eb6834", dark: "#d95926" }, // оранжевый
];

/** Стабильный индекс цвета в палитре по id сотрудника (не зависит от порядка списка). */
export function useEmployeeColorMap(employees: { id: number }[]): Map<number, number> {
  return React.useMemo(() => {
    const sorted = [...employees].sort((a, b) => a.id - b.id);
    return new Map(sorted.map((e, i) => [e.id, i % EMPLOYEE_PALETTE.length]));
  }, [employees]);
}

export function employeeColorHex(colorIndex: number, mode: "light" | "dark"): string {
  const slot = EMPLOYEE_PALETTE[colorIndex % EMPLOYEE_PALETTE.length];
  return mode === "dark" ? slot.dark : slot.light;
}
