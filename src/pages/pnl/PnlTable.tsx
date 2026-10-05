import React from "react";
import {
  Box, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import type { PnlReport } from "../../api/pnl";
import { formatShare, formatSom } from "../../features/pnl/format";
import { buildRows, type PnlRow } from "../../features/pnl/model";
import { monthLabel } from "../../features/pnl/period";

interface Props {
  report: PnlReport;
  expanded: ReadonlySet<string>;
  onToggle: (code: string) => void;
}

/** Таблица ОПиУ по месяцам: строки формы №2, раскрытие до категорий. */
export function PnlTable({ report, expanded, onToggle }: Props) {
  const theme = useTheme();
  const rows = React.useMemo(() => buildRows(report, expanded), [report, expanded]);
  const withYear = new Set(report.months.map((m) => m.key.slice(0, 4))).size > 1;
  const sticky = { position: "sticky" as const, left: 0, zIndex: 2 };
  // Свободная ширина — в пустую колонку в конце: иначе при одном-двух месяцах
  // «Статья» растягивается на весь экран и цифры уезжают от названий строк.
  const filler = { p: 0, borderLeft: 0 };

  const rowBg = (row: PnlRow): string | undefined => {
    if (row.code === "200") return alpha(theme.palette.success.main, 0.12);
    if (row.kind === "total") return alpha(theme.palette.primary.main, 0.06);
    return undefined;
  };
  const money = (row: PnlRow, value: number) =>
    row.empty || value === 0 ? "—" : formatSom(row.isExpense ? -value : value);

  return (
    <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...sticky, zIndex: 3, minWidth: 260, whiteSpace: "nowrap", bgcolor: "background.paper" }}>Статья</TableCell>
            <TableCell>Код</TableCell>
            {report.months.map((month) => (
              <TableCell key={month.key} align="right" sx={{ whiteSpace: "nowrap", minWidth: 110 }}>
                {monthLabel(month.key, withYear)}
                {month.open && (
                  <Typography component="div" variant="caption" color="warning.main">не закрыт</Typography>
                )}
              </TableCell>
            ))}
            <TableCell align="right" sx={{ minWidth: 120 }}>Итого</TableCell>
            <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>% выр.</TableCell>
            <TableCell data-pnl-filler aria-hidden sx={{ ...filler, width: "100%" }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const bg = rowBg(row);
            const strong = row.kind === "group" || row.kind === "total";
            const color =
              row.kind === "detail" || row.empty ? "text.secondary" : row.isExpense ? "error.main" : "text.primary";
            return (
              <TableRow key={row.id} hover sx={{ bgcolor: bg }}>
                <TableCell
                  sx={{
                    ...sticky,
                    bgcolor: bg ?? "background.paper",
                    fontWeight: strong ? 600 : 400,
                    color: row.kind === "detail" ? "text.secondary" : "text.primary",
                    pl: row.kind === "detail" ? 6 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {row.expandable ? (
                      <IconButton
                        size="small"
                        aria-label={row.expanded ? "Свернуть" : "Раскрыть"}
                        onClick={() => onToggle(row.code)}
                      >
                        {row.expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                      </IconButton>
                    ) : (
                      row.kind !== "detail" && <Box sx={{ width: 30, flexShrink: 0 }} />
                    )}
                    {row.title}
                  </Box>
                </TableCell>
                <TableCell sx={{ color: "text.disabled", fontSize: 12 }}>{row.code}</TableCell>
                {row.months.map((value, i) => (
                  <TableCell
                    key={report.months[i].key}
                    align="right"
                    sx={{ color, fontWeight: strong ? 600 : 400, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
                  >
                    {money(row, value)}
                  </TableCell>
                ))}
                <TableCell
                  align="right"
                  sx={{
                    color,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                    bgcolor: bg ?? alpha(theme.palette.primary.main, 0.03),
                  }}
                >
                  {money(row, row.total)}
                </TableCell>
                <TableCell align="right" sx={{ color: "text.secondary", fontSize: 12 }}>
                  {row.sharePct == null ? "" : formatShare(row.sharePct)}
                </TableCell>
                <TableCell data-pnl-filler aria-hidden sx={filler} />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
