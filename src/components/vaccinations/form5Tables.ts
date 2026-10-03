import type { Form5Report, Form5ReportRow } from "../../api/vaccinations";

export type Form5SectionKey = "section1" | "section2" | "section3" | "section5" | "section6";

export interface Form5SectionDef {
  key: Form5SectionKey;
  title: string;
  columns: string[];
}

/** Разделы формы 5 в порядке бланка; колонки — в порядке values с бэка. */
export const FORM5_SECTIONS: Form5SectionDef[] = [
  {
    key: "section1",
    title: "Раздел 1. Выполнение прививок",
    columns: ["В сроки", "В сроки, приезжие", "С опозданием", "Всего"],
  },
  {
    key: "section2",
    title: "Раздел 2. Медотводы от Пента детям до 1 года",
    columns: ["Временные", "Длительные", "Постоянные", "Всего"],
  },
  {
    key: "section3",
    title: "Раздел 3. Отказы от прививок",
    columns: ["Всего", "Сомнения в безопасности", "Религиозные", "Нет информации", "Другие"],
  },
  {
    key: "section5",
    title: "Раздел 5. Движение госвакцин, доз",
    columns: ["Остаток на начало", "Получено", "Использовано", "Списано", "Остаток на конец"],
  },
  {
    key: "section6",
    title: "Раздел 6. Охват прививками",
    columns: ["План", "План, приезжие", "Привито", "Привито, приезжие", "Охват, %"],
  },
];

/** Итоговая строка группы (жирным): «Всего» разделов и итоги групп раздела 1. */
export function isTotalRow(section: Form5SectionKey, row: Form5ReportRow): boolean {
  if (section === "section1") return /\.0v?$/.test(row.key);
  if (section === "section3") return row.key === "2.0";
  return false;
}

/** Ячейка: пусто — «—», проценты — с одним знаком, числа — с разделителем разрядов. */
export function formatForm5Value(section: Form5SectionKey, index: number, value: number | null): string {
  if (value == null) return "—";
  const isPercent = section === "section6" && index === 4;
  if (isPercent) return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}`;
  return value.toLocaleString("ru-RU");
}

/** Пустой ли отчёт целиком: все числа нули/пусто — подсказать про госвакцины. */
export function form5IsEmpty(report: Form5Report): boolean {
  return FORM5_SECTIONS.every(({ key }) =>
    report[key].every((row) => row.values.every((v) => v == null || v === 0)),
  );
}

/** Параметр period для API: месяц «YYYY-MM» или год «YYYY». */
export function form5Period(mode: "month" | "year", month: string): string {
  return mode === "year" ? month.slice(0, 4) : month;
}
