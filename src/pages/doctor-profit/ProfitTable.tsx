import React from "react";
import {
  Box,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from "@mui/material";
import KeyboardArrowDownOutlined from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowRightOutlined from "@mui/icons-material/KeyboardArrowRightOutlined";

import { formatKGS } from "../../utility/format";
import type { ProfitRow, ProfitSalaryParts, ProfitTotals } from "../../api/doctorProfit";
import { ReportTableCard } from "../reports/components/ReportTableCard";
import { compactTableSx } from "../reports/components/reportTableStyles";
import {
  formatMargin,
  formatMinutes,
  rowLabel,
  sortRows,
  toNumber,
  type ProfitSortKey,
  type SortDir,
} from "./profitRows";

const COLUMNS: { key: ProfitSortKey; label: string; hint?: string }[] = [
  { key: "fullName", label: "Врач" },
  { key: "totalMinutes", label: "Часы", hint: "По графику плюс приёмы вне графика — по ним делятся общие расходы" },
  { key: "revenue", label: "Выручка", hint: "Получено за приёмы месяца: оплачено минус возвраты" },
  { key: "salary", label: "Зарплата", hint: "Начислено, как в «Отчёте по ЗП»" },
  { key: "cost", label: "Себестоимость", hint: "Вакцины по цене партии, товары и расходники по закупочной цене" },
  { key: "profitDirect", label: "После прямых", hint: "Выручка − зарплата − себестоимость" },
  { key: "overhead", label: "Доля общих", hint: "Общие расходы клиники пропорционально часам врача" },
  { key: "profit", label: "Прибыль", hint: "После доли общих расходов" },
  { key: "marginPct", label: "Маржа", hint: "Прибыль ÷ выручка" },
];

const SALARY_LABELS: Record<keyof ProfitSalaryParts, string> = {
  servicePercent: "Процент с услуг",
  serviceFixed: "Фикс за услуги",
  appointment: "Ставка за приём",
  hourly: "Часы",
  bonus: "Премии",
  product: "Процент с товаров",
  cleaning: "Уборки",
};

// Колонка «Врач» закреплена: на телефоне таблица прокручивается вбок.
const stickySx = {
  position: "sticky",
  left: 0,
  zIndex: 1,
  bgcolor: "background.paper",
  minWidth: 170,
  maxWidth: 240,
} as const;

const Money: React.FC<{ value: string | number; strong?: boolean }> = ({ value, strong }) => (
  <Box
    component="span"
    sx={{
      color: toNumber(value) < 0 ? "error.main" : undefined,
      fontWeight: strong ? 700 : undefined,
      whiteSpace: "nowrap",
    }}
  >
    {formatKGS(value)}
  </Box>
);

/** Пары «подпись — сумма»; нулевые строки скрыты, если не сказано иначе. */
const Breakdown: React.FC<{ title: string; items: [string, string | number][]; keepZero?: boolean }> = ({
  title,
  items,
  keepZero = false,
}) => {
  const visible = keepZero ? items : items.filter(([, v]) => toNumber(v) !== 0);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      {visible.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          нет
        </Typography>
      ) : (
        visible.map(([label, value]) => (
          <Box key={label} sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="caption" sx={{ whiteSpace: "nowrap" }}>
              {typeof value === "number" ? value : formatKGS(value)}
            </Typography>
          </Box>
        ))
      )}
    </Box>
  );
};

const RowDetails: React.FC<{ row: ProfitRow }> = ({ row }) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, minmax(0, 1fr))" },
      gap: 2,
      py: 1.5,
      px: 1,
      maxWidth: 1100,
    }}
  >
    <Breakdown
      title="Выручка"
      keepZero
      items={[
        ["Услуги", row.revenueServices],
        ["Товары и вакцины", row.revenueProducts],
        ["Долг (справочно)", row.debt],
      ]}
    />
    <Breakdown
      title="Зарплата"
      items={(Object.keys(SALARY_LABELS) as (keyof ProfitSalaryParts)[]).map((k) => [
        SALARY_LABELS[k],
        row.salaryParts[k],
      ])}
    />
    <Breakdown
      title="Себестоимость"
      items={[
        ["Вакцины", row.costVaccines],
        ["Товары", row.costProducts],
        ["Расходники", row.costConsumables],
      ]}
    />
    <Box sx={{ minWidth: 0 }}>
      <Breakdown
        title="Доля общих расходов"
        items={[
          ["Из «Расходов»", row.overheadExpenses],
          ["Зарплата персонала", row.overheadStaff],
          ["Постоянные расходы", row.overheadFixed],
        ]}
      />
      <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.75 }}>
        {row.byAppointments
          ? `Графика нет — по приёмам: ${formatMinutes(row.outsideMinutes)}`
          : `По графику ${formatMinutes(row.scheduleMinutes)}, вне графика ${formatMinutes(row.outsideMinutes)}`}
      </Typography>
    </Box>
  </Box>
);

export const ProfitTable: React.FC<{ rows: ProfitRow[]; totals: ProfitTotals }> = ({ rows, totals }) => {
  const [sort, setSort] = React.useState<{ key: ProfitSortKey; dir: SortDir }>({ key: "profit", dir: "desc" });
  const [open, setOpen] = React.useState<Set<string>>(() => new Set());
  const sorted = React.useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort]);
  const totalMinutes = rows.reduce((acc, r) => acc + r.totalMinutes, 0);
  const unallocated = toNumber(totals.unallocated);

  const toggleSort = (key: ProfitSortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "fullName" ? "asc" : "desc" },
    );
  const rowKey = (row: ProfitRow) => String(row.employeeId ?? "none");
  const toggleRow = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <ReportTableCard
      title="По врачам"
      headerActions={
        <Typography variant="caption" color="text.secondary">
          нажмите строку — разбивка
        </Typography>
      }
    >
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ ...compactTableSx, minWidth: 960 } as object}>
          <TableHead>
            <TableRow>
              {COLUMNS.map((col, i) => (
                <TableCell
                  key={col.key}
                  align={i === 0 ? "left" : "right"}
                  sx={i === 0 ? { ...stickySx, zIndex: 2 } : { whiteSpace: "nowrap" }}
                  sortDirection={sort.key === col.key ? sort.dir : false}
                >
                  <Tooltip title={col.hint ?? ""} arrow disableHoverListener={!col.hint}>
                    <TableSortLabel
                      active={sort.key === col.key}
                      direction={sort.key === col.key ? sort.dir : "desc"}
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </Tooltip>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((row) => {
              const key = rowKey(row);
              const expanded = open.has(key);
              return (
                <React.Fragment key={key}>
                  <TableRow hover onClick={() => toggleRow(key)} sx={{ cursor: "pointer", "& > td": { borderBottom: expanded ? 0 : undefined } }}>
                    <TableCell sx={stickySx}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                        {expanded ? (
                          <KeyboardArrowDownOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
                        ) : (
                          <KeyboardArrowRightOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
                        )}
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{ fontSize: "inherit", fontStyle: row.employeeId == null ? "italic" : undefined }}
                        >
                          {rowLabel(row)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {row.employeeId == null ? "—" : formatMinutes(row.totalMinutes)}
                      {row.byAppointments && (
                        <Typography component="span" variant="caption" color="text.disabled" sx={{ display: "block", lineHeight: 1.1 }}>
                          по приёмам
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right"><Money value={row.revenue} /></TableCell>
                    <TableCell align="right"><Money value={row.salary} /></TableCell>
                    <TableCell align="right"><Money value={row.cost} /></TableCell>
                    <TableCell align="right"><Money value={row.profitDirect} /></TableCell>
                    <TableCell align="right"><Money value={row.overhead} /></TableCell>
                    <TableCell align="right"><Money value={row.profit} strong /></TableCell>
                    <TableCell align="right" sx={{ color: (row.marginPct ?? 0) < 0 ? "error.main" : undefined, whiteSpace: "nowrap" }}>
                      {formatMargin(row.marginPct)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} sx={{ py: 0, ...(expanded ? null : { borderBottom: 0 }) }}>
                      <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <RowDetails row={row} />
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
            {unallocated > 0 && (
              <TableRow>
                <TableCell sx={stickySx}>
                  <Tooltip
                    title="Общие расходы, на которые не пришлось ни одного часа врачей: например, расходы филиала без графика и приёмов"
                    arrow
                  >
                    <span>Не распределено</span>
                  </Tooltip>
                </TableCell>
                <TableCell colSpan={5} />
                <TableCell align="right"><Money value={unallocated} /></TableCell>
                <TableCell align="right"><Money value={-unallocated} /></TableCell>
                <TableCell />
              </TableRow>
            )}
            <TableRow sx={{ "& > td": { fontWeight: 700, borderTop: 2, borderTopColor: "divider" } }}>
              <TableCell sx={{ ...stickySx, fontWeight: 700 }}>Итого</TableCell>
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{formatMinutes(totalMinutes)}</TableCell>
              <TableCell align="right"><Money value={totals.revenue} strong /></TableCell>
              <TableCell align="right"><Money value={totals.salary} strong /></TableCell>
              <TableCell align="right"><Money value={totals.cost} strong /></TableCell>
              <TableCell align="right"><Money value={totals.profitDirect} strong /></TableCell>
              <TableCell align="right"><Money value={totals.overhead} strong /></TableCell>
              <TableCell align="right"><Money value={totals.profit} strong /></TableCell>
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{formatMargin(totals.marginPct)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </ReportTableCard>
  );
};

export default ProfitTable;
