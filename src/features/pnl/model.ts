/** Модель экрана ОПиУ: карточки, строки таблицы, «водопад». Чистые функции над ответом API. */
import type { PnlLine, PnlReport } from "../../api/pnl";

export const num = (value: string | null | undefined): number => Number(value ?? 0);

/** Расходные строки формы: на экране и в Excel показываются со знаком «−». */
export const EXPENSE_CODES: ReadonlySet<string> = new Set(["020", "050", "070", "071", "080", "081", "120", "140", "170"]);
export const DEFAULT_EXPANDED: readonly string[] = ["010", "020", "080"];
export const SALARY_KINDS: ReadonlySet<string> = new Set(["advance", "salary"]);

export function lineByCode(report: PnlReport, code: string): PnlLine | undefined {
  return report.lines.find((line) => line.code === code);
}

export function lineTotal(report: PnlReport, code: string): number {
  return num(lineByCode(report, code)?.total);
}

export interface PnlKpi {
  code: string;
  label: string;
  value: number;
  ratioLabel: string | null;
  ratioPct: number | null;
  deltaPct: number | null;
}

const KPI_DEFS: { code: string; label: string; ratioLabel: string | null }[] = [
  { code: "010", label: "Выручка", ratioLabel: null },
  { code: "030", label: "Валовая прибыль", ratioLabel: "маржа" },
  { code: "100", label: "Операционная прибыль", ratioLabel: "маржа" },
  { code: "200", label: "Чистая прибыль", ratioLabel: "рентабельность" },
];

export function buildKpis(report: PnlReport): PnlKpi[] {
  const revenue = lineTotal(report, "010");
  return KPI_DEFS.map((def) => {
    const value = lineTotal(report, def.code);
    const previous = report.compare ? num(report.compare.totals[def.code]) : 0;
    return {
      ...def,
      value,
      ratioPct: def.ratioLabel && revenue !== 0 ? (value / revenue) * 100 : null,
      deltaPct: previous !== 0 ? ((value - previous) / Math.abs(previous)) * 100 : null,
    };
  });
}

export type PnlRowKind = PnlLine["kind"] | "detail";

export interface PnlRow {
  id: string;
  code: string;
  title: string;
  kind: PnlRowKind;
  months: number[];
  total: number;
  sharePct: number | null;
  isExpense: boolean;
  expandable: boolean;
  expanded: boolean;
  /** Обязательная строка формы без денег — показывается прочерком. */
  empty: boolean;
}

export function buildRows(report: PnlReport, expanded: ReadonlySet<string>): PnlRow[] {
  const revenue = lineTotal(report, "010");
  const keys = report.months.map((month) => month.key);
  const share = (total: number) => (revenue !== 0 && total !== 0 ? (Math.abs(total) / revenue) * 100 : null);
  const rows: PnlRow[] = [];
  for (const line of report.lines) {
    const total = num(line.total);
    const isExpense = EXPENSE_CODES.has(line.code);
    const expandable = line.kind === "group" && line.children.length > 0;
    const isOpen = expandable && expanded.has(line.code);
    rows.push({
      id: line.code, code: line.code, title: line.title, kind: line.kind,
      months: keys.map((key) => num(line.months[key])), total, sharePct: share(total),
      isExpense, expandable, expanded: isOpen,
      empty: line.kind !== "total" && total === 0 && line.children.length === 0,
    });
    if (!isOpen) continue;
    for (const child of line.children) {
      const childTotal = num(child.total);
      rows.push({
        id: child.key, code: "", title: child.title, kind: "detail",
        months: keys.map((key) => num(child.months[key])), total: childTotal, sharePct: share(childTotal),
        isExpense, expandable: false, expanded: false, empty: false,
      });
    }
  }
  return rows;
}

export type WaterfallKind = "revenue" | "down" | "up" | "net";

export interface WaterfallBar {
  key: string;
  label: string;
  /** Со знаком: расходы отрицательные. */
  value: number;
  kind: WaterfallKind;
  low: number;
  high: number;
  sharePct: number | null;
}

/** Группы, из деталей которых берутся зарплата и крупные статьи (себестоимость — отдельным столбиком). */
const WATERFALL_EXPENSE_GROUPS = ["050", "070", "080", "120", "140"];

/**
 * «Водопад» периода: выручка → себестоимость → зарплата и аванс → topCount
 * крупнейших статей → «Прочие» (всё остальное, включая прочие доходы и налог)
 * → чистая прибыль. Валовой прибыли нет (решение заказчика). «Прочие»
 * считаются остатком, поэтому столбики всегда сходятся к чистой прибыли.
 */
export function buildWaterfall(report: PnlReport, topCount = 3): WaterfallBar[] {
  const revenue = lineTotal(report, "010");
  const net = lineTotal(report, "200");
  const details = report.lines
    .filter((line) => WATERFALL_EXPENSE_GROUPS.includes(line.code))
    .flatMap((line) => line.children);
  const isSalary = (kind: string | null) => SALARY_KINDS.has(kind ?? "");
  const salary = details.filter((d) => isSalary(d.categoryKind)).reduce((sum, d) => sum + num(d.total), 0);
  const top = details
    .filter((d) => !isSalary(d.categoryKind))
    .map((d) => ({ key: d.key, label: d.title, value: num(d.total) }))
    .filter((step) => step.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, topCount);
  const steps = [
    { key: "cost", label: "Себестоимость", value: lineTotal(report, "020") },
    { key: "salary", label: "Зарплата и аванс", value: salary },
    ...top,
  ];
  const rest = revenue - net - steps.reduce((sum, step) => sum + step.value, 0);
  if (Math.abs(rest) >= 0.005) steps.push({ key: "rest", label: "Прочие", value: rest });
  const share = (value: number) => (revenue !== 0 ? (Math.abs(value) / revenue) * 100 : null);

  const bars: WaterfallBar[] = [{
    key: "revenue", label: "Выручка", value: revenue, kind: "revenue",
    low: Math.min(0, revenue), high: Math.max(0, revenue), sharePct: revenue !== 0 ? 100 : null,
  }];
  let level = revenue;
  for (const step of steps) {
    if (step.value === 0) continue;
    const next = level - step.value;
    bars.push({
      key: step.key, label: step.label, value: -step.value, kind: step.value > 0 ? "down" : "up",
      low: Math.min(level, next), high: Math.max(level, next), sharePct: share(step.value),
    });
    level = next;
  }
  bars.push({
    key: "net", label: "Чистая прибыль", value: net, kind: "net",
    low: Math.min(0, net), high: Math.max(0, net), sharePct: share(net),
  });
  return bars;
}
