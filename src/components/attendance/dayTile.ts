import { alpha, type Theme } from "@mui/material/styles";

import type { TimesheetCell, TimesheetCode } from "../../api/timesheet";
import { codeFill, codeInk } from "../../pages/timesheet/codeColors";
import { subtleBg } from "../../theme/uiHelpers";

/** Пропуск, по которому сотрудник уже подал заявку: второй раз её не подать. */
export function isRequested(cell: TimesheetCell): boolean {
  return cell.state === "missing" && (cell.flags ?? []).includes("request");
}

/**
 * Вид дня в личных календарях («Моя посещаемость», «Мой табель») — тот же
 * язык, что в сетке табеля: явка — заливка, ручная явка — контур, пропуск —
 * красная штриховка, пропуск с заявкой — жёлтый пунктир, сегодня — пунктир.
 */
export function dayTileStyle(theme: Theme, cell: TimesheetCell, code?: TimesheetCode) {
  if (isRequested(cell)) {
    return {
      bgcolor: alpha(theme.palette.warning.main, 0.1),
      border: `1.5px dashed ${theme.palette.warning.main}`,
      color: theme.palette.warning.main,
    };
  }
  if (cell.state === "missing") {
    return {
      bgcolor: alpha(theme.palette.error.main, 0.12),
      backgroundImage: `repeating-linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.35)} 0 3px, transparent 3px 7px)`,
      border: `1px solid ${alpha(theme.palette.error.main, 0.55)}`,
      color: theme.palette.error.main,
    };
  }
  if (cell.state === "pending") {
    return {
      bgcolor: "transparent",
      border: `1.5px dashed ${theme.palette.primary.main}`,
      color: theme.palette.primary.main,
    };
  }
  if (!code || code.category === "rest") {
    return {
      bgcolor: subtleBg(theme, true),
      border: "1px solid transparent",
      color: code ? theme.palette.text.secondary : theme.palette.text.disabled,
    };
  }
  if (code.key === "presence" && cell.source === "manual") {
    // «Отметку поставил админ» — контур без заливки.
    return { bgcolor: "transparent", border: `1.5px solid ${code.color}`, color: codeInk(theme, code.color) };
  }
  return {
    bgcolor: code.key === "presence" ? code.color : codeFill(theme, code.color, 1.6),
    border: `1px solid ${alpha(code.color, 0.6)}`,
    color: code.key === "presence" ? "#fff" : codeInk(theme, code.color),
  };
}
