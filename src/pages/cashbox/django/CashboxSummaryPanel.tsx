import React from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import type { CashboxSummary } from "../../../api/cashbox";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(s: string | undefined): string {
  if (!s) return "0.00";
  const n = parseFloat(s);
  return isNaN(n) ? s : n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Sub-components ────────────────────────────────────────────────────────────

const SummaryRow: React.FC<{
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
  loading?: boolean;
}> = ({ label, value, color, bold, loading }) => (
  <Stack direction="row" justifyContent="space-between" alignItems="center">
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    {loading ? (
      <Skeleton width={80} height={20} />
    ) : (
      <Typography
        variant="body2"
        fontWeight={bold ? 700 : 500}
        color={color ?? "text.primary"}
      >
        {value} с
      </Typography>
    )}
  </Stack>
);

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  summary: CashboxSummary | null | undefined;
  isLoading: boolean;
  isFetching: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

const CashboxSummaryPanel: React.FC<Props> = ({ summary, isLoading, isFetching }) => {
  const hasBalance =
    summary &&
    (parseFloat(summary.balancePayments) > 0 || parseFloat(summary.balanceRefunds) > 0);
  const hasInsurance =
    summary &&
    (parseFloat(summary.insuranceIncome ?? "0") > 0 ||
      parseFloat(summary.insuranceRefunds ?? "0") > 0);

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "14px",
        p: 2,
        bgcolor: "background.paper",
        minWidth: 0,
      }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
        <Typography variant="subtitle2" fontWeight={700}>
          Сводка
        </Typography>
        {isFetching && !isLoading && <CircularProgress size={12} />}
        {summary && (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Chip label={`${summary.paymentCount} платежей`} size="small" variant="outlined" />
            <Chip label={`${summary.refundCount} возвратов`} size="small" variant="outlined" color={summary.refundCount > 0 ? "warning" : "default"} />
            {summary.expenseCount > 0 && (
              <Chip label={`${summary.expenseCount} расходов`} size="small" variant="outlined" color="error" />
            )}
          </Stack>
        )}
      </Stack>

      <Stack spacing={0.75}>
        {/* Cash / Card income */}
        <SummaryRow label="Наличные" value={fmt(summary?.cashIncome)} loading={isLoading} />
        <SummaryRow label="Карта" value={fmt(summary?.cardIncome)} loading={isLoading} />

        <Divider sx={{ my: 0.5 }} />

        {/* Gross */}
        <SummaryRow label="Брутто" value={fmt(summary?.grossIncome)} bold loading={isLoading} />

        {/* Refunds */}
        {(isLoading || parseFloat(summary?.refundedTotal ?? "0") > 0) && (
          <>
            <SummaryRow
              label="Возвраты"
              value={`− ${fmt(summary?.refundedTotal)}`}
              color="error.main"
              loading={isLoading}
            />
            {(isLoading || parseFloat(summary?.cashRefunds ?? "0") > 0) && (
              <SummaryRow label="  ↳ наличными" value={fmt(summary?.cashRefunds)} color="text.secondary" loading={isLoading} />
            )}
            {(isLoading || parseFloat(summary?.cardRefunds ?? "0") > 0) && (
              <SummaryRow label="  ↳ картой" value={fmt(summary?.cardRefunds)} color="text.secondary" loading={isLoading} />
            )}
          </>
        )}

        <Divider sx={{ my: 0.5 }} />

        {/* Net income (after refunds, before expenses) */}
        <SummaryRow
          label="Чистый доход"
          value={fmt(summary?.netIncome)}
          bold
          color="success.main"
          loading={isLoading}
        />

        {/* Продажи товаров (приход) */}
        {(isLoading || parseFloat(summary?.salesTotal ?? "0") > 0) && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" color="text.disabled" fontWeight={600} textTransform="uppercase">
              Продажи товаров
            </Typography>
            <SummaryRow
              label="Всего продаж"
              value={fmt(summary?.salesTotal)}
              color="success.main"
              bold
              loading={isLoading}
            />
            {(isLoading || parseFloat(summary?.salesCashIncome ?? "0") > 0) && (
              <SummaryRow label="  ↳ наличными" value={fmt(summary?.salesCashIncome)} color="text.secondary" loading={isLoading} />
            )}
            {(isLoading || parseFloat(summary?.salesCardIncome ?? "0") > 0) && (
              <SummaryRow label="  ↳ картой" value={fmt(summary?.salesCardIncome)} color="text.secondary" loading={isLoading} />
            )}
          </>
        )}

        {/* Закупки товара (расход) */}
        {(isLoading || parseFloat(summary?.supplyTotal ?? "0") > 0) && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" color="text.disabled" fontWeight={600} textTransform="uppercase">
              Закупки товара
            </Typography>
            <SummaryRow
              label="Всего закупок"
              value={`− ${fmt(summary?.supplyTotal)}`}
              color="error.main"
              bold
              loading={isLoading}
            />
            {(isLoading || parseFloat(summary?.supplyCashExpenses ?? "0") > 0) && (
              <SummaryRow label="  ↳ наличными" value={fmt(summary?.supplyCashExpenses)} color="text.secondary" loading={isLoading} />
            )}
            {(isLoading || parseFloat(summary?.supplyCardExpenses ?? "0") > 0) && (
              <SummaryRow label="  ↳ картой" value={fmt(summary?.supplyCardExpenses)} color="text.secondary" loading={isLoading} />
            )}
          </>
        )}

        {/* Expenses section */}
        {(isLoading || parseFloat(summary?.totalExpenses ?? "0") > 0) && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" color="text.disabled" fontWeight={600} textTransform="uppercase">
              Расходы
            </Typography>
            <SummaryRow
              label="Всего расходов"
              value={`− ${fmt(summary?.totalExpenses)}`}
              color="error.main"
              bold
              loading={isLoading}
            />
            {(isLoading || parseFloat(summary?.cashExpenses ?? "0") > 0) && (
              <SummaryRow label="  ↳ наличными" value={fmt(summary?.cashExpenses)} color="text.secondary" loading={isLoading} />
            )}
            {(isLoading || parseFloat(summary?.cardExpenses ?? "0") > 0) && (
              <SummaryRow label="  ↳ картой" value={fmt(summary?.cardExpenses)} color="text.secondary" loading={isLoading} />
            )}
            <Divider sx={{ my: 0.5 }} />
            <SummaryRow
              label="Чистый поток"
              value={fmt(summary?.netCashFlow)}
              bold
              color={
                !isLoading && summary && parseFloat(summary.netCashFlow) < 0
                  ? "error.main"
                  : "success.main"
              }
              loading={isLoading}
            />
          </>
        )}

        {/* Balance operations — internal, not cashbox income */}
        {(isLoading || hasBalance) && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" color="text.disabled" fontWeight={600} textTransform="uppercase">
              Внутренние операции (баланс)
            </Typography>
            <SummaryRow label="Оплата с баланса" value={fmt(summary?.balancePayments)} color="info.main" loading={isLoading} />
            <SummaryRow label="Возврат на баланс" value={fmt(summary?.balanceRefunds)} color="text.secondary" loading={isLoading} />
          </>
        )}

        {/* Insurance coverage — задолженность страховых, не наличный доход */}
        {(isLoading || hasInsurance) && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" color="text.disabled" fontWeight={600} textTransform="uppercase">
              Страховые
            </Typography>
            <SummaryRow label="Покрыто страховкой" value={fmt(summary?.insuranceIncome)} color="info.main" loading={isLoading} />
            {(isLoading || parseFloat(summary?.insuranceRefunds ?? "0") > 0) && (
              <SummaryRow label="Возвраты по страховке" value={fmt(summary?.insuranceRefunds)} color="text.secondary" loading={isLoading} />
            )}
          </>
        )}
      </Stack>
    </Box>
  );
};

export default CashboxSummaryPanel;
