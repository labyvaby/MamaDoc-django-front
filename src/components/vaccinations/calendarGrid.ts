import dayjs from "dayjs";

import type { CalendarCell, CalendarCellState, CalendarGroup } from "../../api/vaccinations";

export type Tone = "success" | "info" | "warning" | "error" | "default";

export const CELL_STATE_META: Record<CalendarCellState, { label: string; tone: Tone }> = {
  done: { label: "Сделана", tone: "success" },
  done_external: { label: "Сделана (внешняя)", tone: "success" },
  draft: { label: "Не оформлена", tone: "warning" },
  due: { label: "Пора", tone: "warning" },
  overdue: { label: "Просрочена", tone: "error" },
  planned: { label: "Запланирована", tone: "info" },
  exempt: { label: "Медотвод", tone: "default" },
  refused: { label: "Отказ", tone: "default" },
  skipped: { label: "Пропущена", tone: "default" },
};

const fmt = (iso: string) => dayjs(iso).format("DD.MM.YYYY");

/** Вторая строка клетки: дата сделанной / срок / до какого числа медотвод. */
export function cellCaption(cell: CalendarCell): string {
  switch (cell.state) {
    case "done":
    case "done_external":
    case "draft":
      return cell.record ? fmt(cell.record.administeredAt) : "";
    case "exempt":
      return cell.exemptionUntil ? `до ${fmt(cell.exemptionUntil)}` : "постоянный";
    case "refused":
      return cell.refusalDate ? `с ${fmt(cell.refusalDate)}` : "";
    case "due":
      return `до ${fmt(cell.windowEnd)}`;
    default:
      return fmt(cell.dueDate);
  }
}

/** Можно ли с клетки внести внешнюю, медотвод, отказ или пропуск. */
export function cellActionable(cell: CalendarCell): boolean {
  return !["done", "done_external", "draft"].includes(cell.state);
}

/** Сводка для шапки вкладки: сколько сделано, пора, просрочено. */
export function calendarSummary(groups: CalendarGroup[]): {
  done: number;
  due: number;
  overdue: number;
  total: number;
} {
  const cells = groups.flatMap((g) => g.cells);
  return {
    done: cells.filter((c) => c.state === "done" || c.state === "done_external").length,
    due: cells.filter((c) => c.state === "due").length,
    overdue: cells.filter((c) => c.state === "overdue").length,
    total: cells.length,
  };
}
