import React from "react";
import {
  Alert,
  Box,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";

import { getErrorMessage } from "../../api/client";
import { getGiftCertificateBranchReport, type GiftCertificateBranchRow } from "../../api/promotions";
import { DateRangeField, ListEmptyState, type DateRange } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import { HISTORY_PERIOD_PRESETS } from "../pos/historyMeta";
import { PosAmount } from "../pos/ui";

const amount = (value: string) => <PosAmount value={Number(value)} />;

const headSx = {
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.25,
  color: "text.secondary",
  whiteSpace: "nowrap",
} as const;

const numSx = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;

/** «4 шт · 20 000 с» — count and amount in one cell; dash when there was nothing. */
const CountAmount: React.FC<{ count: number; value: string }> = ({ count, value }) =>
  count === 0 && Number(value) === 0 ? (
    <Typography component="span" color="text.disabled">
      —
    </Typography>
  ) : (
    <>
      {amount(value)}
      <Typography component="span" variant="caption" color="text.secondary" display="block">
        {count} шт
      </Typography>
    </>
  );

const Money: React.FC<{ value: string }> = ({ value }) =>
  Number(value) === 0 ? (
    <Typography component="span" color="text.disabled">
      —
    </Typography>
  ) : (
    amount(value)
  );

const BranchRow: React.FC<{ row: GiftCertificateBranchRow; total?: boolean }> = ({ row, total }) => (
  <TableRow sx={total ? { "& td": { fontWeight: 700, borderBottom: 0 }, bgcolor: (t) => subtleBg(t) } : undefined}>
    <TableCell sx={{ fontWeight: total ? 700 : 600 }}>{total ? "Итого" : row.branchName || "Без филиала"}</TableCell>
    <TableCell sx={numSx}>
      <CountAmount count={row.soldCount} value={row.soldAmount} />
    </TableCell>
    <TableCell sx={numSx}>
      <CountAmount count={row.voidedCount} value={row.refundedAmount} />
    </TableCell>
    <TableCell sx={numSx}>
      <Money value={row.redeemedAmount} />
    </TableCell>
    <TableCell sx={numSx}>
      <Money value={row.redeemedForeignAmount} />
    </TableCell>
    <TableCell sx={numSx}>
      <Money value={row.ownRedeemedElsewhereAmount} />
    </TableCell>
    <TableCell sx={numSx}>
      <CountAmount count={row.outstandingCount} value={row.outstandingBalance} />
    </TableCell>
  </TableRow>
);

const defaultRange = (): DateRange => ({ from: dayjs().startOf("month"), to: dayjs().endOf("month") });

/**
 * Отчёт «По филиалам»: сколько сертификатов продал каждый филиал, сколько
 * ими заплатили у него и сколько его сертификатов потратили в других точках —
 * основа для взаиморасчёта между филиалами. Остаток активных не зависит от
 * периода: это долг перед держателями карт на сегодня.
 */
export const CertificateBranchReport: React.FC<{ organizationId: number | null; enabled: boolean }> = ({
  organizationId,
  enabled,
}) => {
  const [range, setRange] = React.useState<DateRange>(defaultRange);
  const params = { dateFrom: range.from.format("YYYY-MM-DD"), dateTo: range.to.format("YYYY-MM-DD") };
  const report = useQuery({
    queryKey: ["django", "promotions", "certificates", "branch-report", organizationId, params],
    queryFn: ({ signal }) => getGiftCertificateBranchReport(params, organizationId, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
  const data = report.data;
  const flows = (data?.flows ?? []).filter((flow) => Number(flow.amount) !== 0);

  return (
    <Stack gap={2}>
      <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
        <DateRangeField
          dense
          value={range}
          presets={HISTORY_PERIOD_PRESETS.filter((preset) => preset.key !== "all")}
          onChange={(next) => setRange(next)}
          minWidth={168}
        />
        <Typography variant="caption" color="text.secondary">
          Продажи и аннулирования — по дню оплаты, погашения — по дню чека. Остаток активных — на сегодня.
        </Typography>
      </Stack>

      {report.isError ? (
        <Alert severity="error">{getErrorMessage(report.error, "Не удалось загрузить отчёт по филиалам.")}</Alert>
      ) : !data ? (
        <Stack gap={1}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" height={52} sx={{ borderRadius: "12px" }} />
          ))}
        </Stack>
      ) : data.rows.length === 0 ? (
        <Box sx={{ borderRadius: "14px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
          <ListEmptyState
            icon={<StorefrontOutlined />}
            title="За период движений нет"
            description="Продайте сертификат на кассе — он появится в отчёте."
          />
        </Box>
      ) : (
        <Box
          sx={{
            borderRadius: "14px",
            border: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            overflowX: "auto",
            opacity: report.isFetching ? 0.6 : 1,
            transition: "opacity .15s ease",
          }}
        >
          <Table size="small" sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>Филиал</TableCell>
                <TableCell sx={{ ...headSx, textAlign: "right" }}>Продано</TableCell>
                <TableCell sx={{ ...headSx, textAlign: "right" }}>Аннулировано</TableCell>
                <TableCell sx={{ ...headSx, textAlign: "right" }}>Погашено в филиале</TableCell>
                <TableCell sx={{ ...headSx, textAlign: "right" }}>в т.ч. чужими</TableCell>
                <TableCell sx={{ ...headSx, textAlign: "right" }}>Свои — в других</TableCell>
                <TableCell sx={{ ...headSx, textAlign: "right" }}>Остаток активных</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rows.map((row) => (
                <BranchRow key={row.branchId ?? "none"} row={row} />
              ))}
              {data.rows.length > 1 && <BranchRow row={data.totals} total />}
            </TableBody>
          </Table>
        </Box>
      )}

      {data && flows.length > 0 && (
        <Box sx={{ p: 2, borderRadius: "14px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Где потратили проданные сертификаты
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Продан в → потрачен в, нетто за период (возвраты товара вычтены).
          </Typography>
          <Stack gap={0.75}>
            {flows.map((flow) => (
              <Stack
                key={`${flow.soldBranchId ?? "none"}-${flow.redeemedBranchId ?? "none"}`}
                direction="row"
                alignItems="center"
                gap={1}
                sx={{ minWidth: 0 }}
              >
                <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: "0 1 auto" }}>
                  {flow.soldBranchName || "Без филиала"}
                </Typography>
                <ArrowForwardOutlined sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }} />
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    minWidth: 0,
                    flex: "1 1 auto",
                    color: flow.soldBranchId === flow.redeemedBranchId ? "text.secondary" : "text.primary",
                  }}
                >
                  {flow.redeemedBranchName || "Без филиала"}
                  {flow.soldBranchId === flow.redeemedBranchId ? " (тот же филиал)" : ""}
                </Typography>
                <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {amount(flow.amount)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
};
