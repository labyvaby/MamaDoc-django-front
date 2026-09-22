import React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";

import { formatKGS } from "../../utility/format";

export type LabOrdersFilter = "all" | "pending";

/** Счётчики плиток. Приходят посчитанными — компонент ничего не считает сам. */
export interface LabOrdersSummary {
  total: number;
  pending: number;
  amount: number;
}

type Props = {
  stats: LabOrdersSummary;
  value: LabOrdersFilter;
  onChange: (next: LabOrdersFilter) => void;
  canViewFinance: boolean;
};

/**
 * Плитки над лентой заказов; они же фильтры.
 *
 * Плитка «Не отправлены» — единственное место, где виден оплаченный, но
 * зависший заказ: дровер к тому моменту уже закрыт. Устроено по образцу
 * `src/pages/appointments/components/registry/RegistrySummaryBar.tsx`, чтобы
 * жест был знакомым.
 */
const LabOrdersSummaryBar: React.FC<Props> = ({
  stats,
  value,
  onChange,
  canViewFinance,
}) => {
  const tile = (
    key: LabOrdersFilter,
    label: string,
    figure: string,
    danger = false,
  ) => {
    const active = value === key;
    return (
      <Paper
        // role/tabIndex/onKeyDown — как у кликабельных строк в
        // PatientHistoryPanel: плитка работает фильтром и должна быть
        // доступна не только мышью.
        role="button"
        tabIndex={0}
        onClick={() => onChange(key)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onChange(key);
          }
        }}
        sx={{
          px: 2,
          py: 1.25,
          cursor: "pointer",
          flex: "1 1 140px",
          borderWidth: active ? 2 : 1,
          borderStyle: "solid",
          borderColor: active ? "primary.main" : "divider",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6" color={danger ? "warning.main" : undefined}>
          {figure}
        </Typography>
      </Paper>
    );
  };

  return (
    <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
      {tile("all", "Всего заказов", String(stats.total))}
      {tile("pending", "Не отправлены", String(stats.pending), stats.pending > 0)}
      {canViewFinance ? (
        <Box sx={{ flex: "1 1 140px" }}>
          {tile("all", "Сумма", formatKGS(stats.amount))}
        </Box>
      ) : null}
    </Stack>
  );
};

export default LabOrdersSummaryBar;
