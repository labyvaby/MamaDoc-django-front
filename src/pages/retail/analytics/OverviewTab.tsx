import React from "react";
import { Alert, Box, Skeleton, Stack, Typography } from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import dayjs from "dayjs";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";

import { getErrorMessage } from "../../../api/client";
import { getRecentReceipts, getRetailPnl } from "../../../api/retailAnalytics";
import {
  AppButton,
  AppCard,
  DateRangeField,
  InfoTile,
  ListEmptyState,
  ListLoadingSkeleton,
  TonedChip,
  type DateRange,
} from "../../../components/ui";
import { formatKGS } from "../../../utility/format";
import { HISTORY_PERIOD_PRESETS, receiptDateLabel, receiptStatusMeta } from "../../pos/historyMeta";
import { formatPercent, marginPercent, num, plural, presetRange, receiptLabel } from "../retailAnalyticsModel";
import { retailKeys } from "./keys";

const RECENT_LIMIT = 20;

export const OverviewTab: React.FC<{ enabled: boolean; organizationId: number | undefined }> = ({
  enabled,
  organizationId,
}) => {
  const navigate = useNavigate();
  const [range, setRange] = React.useState<DateRange>(() => presetRange("month"));
  const dateFrom = range.from.format("YYYY-MM-DD");
  const dateTo = range.to.format("YYYY-MM-DD");

  const pnl = useQuery({
    queryKey: retailKeys.pnl(organizationId, dateFrom, dateTo),
    queryFn: ({ signal }) => getRetailPnl({ dateFrom, dateTo }, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const receipts = useQuery({
    queryKey: retailKeys.receipts(organizationId),
    queryFn: ({ signal }) => getRecentReceipts(RECENT_LIMIT, signal),
    enabled,
    staleTime: 30_000,
  });

  const data = pnl.data;
  const revenue = num(data?.revenue);
  const gross = num(data?.grossMargin);
  const other = num(data?.incomes) - num(data?.expenses);
  const tiles = [
    { icon: <PaymentsOutlined />, label: "Выручка", value: formatKGS(revenue) },
    { icon: <Inventory2Outlined />, label: "Себестоимость", value: formatKGS(num(data?.cost)) },
    {
      icon: <TrendingUpOutlined />,
      label: `Валовая прибыль · маржа ${formatPercent(marginPercent(gross, revenue))}`,
      value: formatKGS(gross),
    },
    {
      icon: <AccountBalanceOutlined />,
      label: other === 0 ? "Итог периода" : `Итог · прочие ${formatKGS(other)}`,
      value: formatKGS(num(data?.netResult)),
    },
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <DateRangeField
          dense
          value={range}
          presets={HISTORY_PERIOD_PRESETS.filter((preset) => preset.key !== "all")}
          onChange={(next) => setRange(next)}
          minWidth={200}
        />
        <Typography variant="caption" color="text.secondary">
          Выручка за вычетом возвратов; себестоимость — по партиям, из которых ушёл товар.
        </Typography>
      </Stack>

      {pnl.isError && <Alert severity="error">{getErrorMessage(pnl.error)}</Alert>}
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" } }}>
        {tiles.map((tile) => (
          <Box key={tile.label}>
            {data ? (
              <InfoTile icon={tile.icon} label={tile.label} value={tile.value} />
            ) : (
              <Skeleton variant="rounded" height={64} />
            )}
          </Box>
        ))}
      </Box>

      <AppCard
        variant="outlined"
        elevation={0}
        title="Последние чеки"
        headerActions={
          <AppButton size="small" variant="text" onClick={() => navigate("/pos/history")}>
            Вся история продаж
          </AppButton>
        }
        disableContentPadding
      >
        {receipts.isLoading ? (
          <ListLoadingSkeleton rows={5} />
        ) : receipts.isError ? (
          <Alert severity="error" sx={{ m: 2 }}>
            {getErrorMessage(receipts.error)}
          </Alert>
        ) : !receipts.data?.length ? (
          <ListEmptyState icon={<ReceiptLongOutlined />} title="Чеков пока нет" />
        ) : (
          <Box>
            {receipts.data.map((receipt) => {
              const status = receiptStatusMeta(receipt.status);
              return (
                <Stack
                  key={receipt.id}
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: "divider" }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      №{receiptLabel(receipt)}
                      {receipt.clientName ? ` · ${receipt.clientName}` : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {receiptDateLabel(receipt.completedAt ?? receipt.createdAt)}
                      {" · "}
                      {receipt.lines.length} {plural(receipt.lines.length, "позиция", "позиции", "позиций")}
                    </Typography>
                  </Box>
                  <TonedChip label={status.label} toneName={status.tone} />
                  <Typography variant="body2" fontWeight={600} sx={{ minWidth: 96, textAlign: "right" }}>
                    {formatKGS(num(receipt.totalAmount))}
                  </Typography>
                </Stack>
              );
            })}
          </Box>
        )}
      </AppCard>
      <Typography variant="caption" color="text.secondary">
        Обновлено {dayjs(pnl.dataUpdatedAt || Date.now()).format("HH:mm")}
      </Typography>
    </Stack>
  );
};
