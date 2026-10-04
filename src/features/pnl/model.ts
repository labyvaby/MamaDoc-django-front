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
