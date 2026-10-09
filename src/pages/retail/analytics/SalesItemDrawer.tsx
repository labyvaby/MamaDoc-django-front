import React from "react";
import {
  Alert,
  Box,
  ButtonBase,
  Divider,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import KeyboardReturnOutlined from "@mui/icons-material/KeyboardReturnOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";

import { getErrorMessage } from "../../../api/client";
import type { PosSavedReceipt } from "../../../api/pos";
import {
  getPosReceipt,
  getSalesDetail,
  type SalesDetailReturn,
  type SalesDetailSale,
  type SalesFilters,
  type SalesMoney,
} from "../../../api/retailAnalytics";
import {
  ListEmptyState,
  SegmentedTabs,
  TonedChip,
  type SegmentedTab,
} from "../../../components/ui";
import { useSheetBackClose } from "../../../hooks/useSheetBackClose";
import { subtleBg, subtleBorder } from "../../../theme/uiHelpers";
import { formatKGS } from "../../../utility/format";
import { receiptDateFull, receiptDateLabel } from "../../pos/historyMeta";
import { ReceiptDetailDrawer } from "../../pos/ReceiptDetailDrawer";
import { formatQty, num, plural, receiptLabel } from "../retailAnalyticsModel";
import { retailKeys } from "./keys";
import { salesPaymentLabel } from "./salesModel";

export type SalesItemTarget = {
  title: string;
  subtitle?: string;
  modelId?: number;
  productId?: number;
  money: SalesMoney;
};

type DetailTab = "sales" | "returns";

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" noWrap display="block">
      {label}
    </Typography>
    <Typography
      sx={{
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.3,
      }}
      noWrap
    >
      {value}
    </Typography>
    {hint && (
      <Typography
        variant="caption"
        color="text.secondary"
        noWrap
        display="block"
      >
        {hint}
      </Typography>
    )}
  </Box>
);

const receiptTitle = (sale: {
  receiptId: number;
  receiptNumber: string;
  receiptComment: string;
}) =>
  `№${receiptLabel({
    id: sale.receiptId,
    number: sale.receiptNumber,
    comment: sale.receiptComment,
  })}`;

/**
 * «Детальнее» по позиции отчёта о продажах: продажи по дням, чеки с этой
 * позицией и её возвраты. Чек открывается своей карточкой, если у роли есть
 * доступ к истории продаж.
 */
export const SalesItemDrawer: React.FC<{
  target: SalesItemTarget | null;
  filters: SalesFilters;
  organizationId: number | undefined;
  canOpenReceipts: boolean;
  onClose: () => void;
}> = ({ target, filters, organizationId, canOpenReceipts, onClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const open = target !== null;
  useSheetBackClose(open, onClose, isMobile);
  const [tab, setTab] = React.useState<DetailTab>("sales");
  const [receiptId, setReceiptId] = React.useState<number | null>(null);
  React.useEffect(() => setTab("sales"), [target]);

  const params = {
    ...filters,
    modelId: target?.modelId,
    productId: target?.productId,
  };
  const detail = useQuery({
    queryKey: retailKeys.salesDetail(organizationId, params),
    queryFn: ({ signal }) => getSalesDetail(params, signal),
    enabled: open,
    staleTime: 60_000,
  });
  const receipt = useQuery<PosSavedReceipt>({
    queryKey: ["retail-analytics", organizationId, "receipt", receiptId],
    queryFn: ({ signal }) => getPosReceipt(receiptId as number, signal),
    enabled: receiptId !== null,
    staleTime: 60_000,
  });

  const money = target?.money;
  const data = detail.data;
  const tabs: SegmentedTab<DetailTab>[] = [
    { key: "sales", label: "Продажи", badge: data?.salesTotal },
    { key: "returns", label: "Возвраты", badge: data?.returnsTotal },
  ];
  const daily = React.useMemo(
    () =>
      (data?.daily ?? []).map((day) => ({
        label: dayjs(day.date).format("DD.MM"),
        quantity: num(day.quantity),
        returned: num(day.returned),
      })),
    [data]
  );
  const axisTick = { fontSize: 11, fill: theme.palette.text.secondary };

  return (
    <>
      <Drawer
        anchor={isMobile ? "bottom" : "right"}
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: { xs: "100%", md: 560 },
            maxWidth: "100vw",
            height: { xs: "92dvh", md: "100%" },
            borderTopLeftRadius: { xs: 18, md: 0 },
            borderTopRightRadius: { xs: 18, md: 0 },
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          gap={1}
          sx={{ px: 2, pt: 2, pb: 1.5 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.25 }}
            >
              {target?.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {[
                target?.subtitle,
                `${dayjs(filters.dateFrom).format("DD.MM.YYYY")} — ${dayjs(
                  filters.dateTo
                ).format("DD.MM.YYYY")}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="Закрыть">
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>
        <Divider />

        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, py: 2 }}>
          {money && (
            <Box
              sx={{
                p: 2,
                borderRadius: "14px",
                border: 1,
                borderColor: "divider",
                bgcolor: subtleBg(theme),
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: {
                  xs: "repeat(2, minmax(0, 1fr))",
                  md: "repeat(3, minmax(0, 1fr))",
                },
              }}
            >
              <Stat
                label="Выручка"
                value={formatKGS(num(money.revenue))}
                hint={`без скидки ${formatKGS(num(money.gross))}`}
              />
              <Stat
                label="Продано"
                value={`${formatQty(num(money.quantity))} шт`}
                hint={`${money.receipts} ${plural(
                  money.receipts,
                  "чек",
                  "чека",
                  "чеков"
                )}`}
              />
              <Stat label="Скидка" value={formatKGS(num(money.discount))} />
              <Stat label="Наличные" value={formatKGS(num(money.cash))} />
              <Stat label="Карта" value={formatKGS(num(money.card))} />
              <Stat
                label="Возвраты"
                value={
                  num(money.returnedAmount)
                    ? formatKGS(num(money.returnedAmount))
                    : "—"
                }
                hint={
                  num(money.returnedQuantity)
                    ? `${formatQty(num(money.returnedQuantity))} шт`
                    : undefined
                }
              />
            </Box>
          )}

          {detail.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {getErrorMessage(detail.error)}
            </Alert>
          )}

          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: "block", mt: 2.5, mb: 0.5, fontWeight: 600 }}
          >
            Продажи по дням
          </Typography>
          <Box sx={{ height: 168, mx: -1 }}>
            {detail.isLoading ? (
              <Skeleton variant="rounded" height={160} sx={{ mx: 1 }} />
            ) : daily.length === 0 ? (
              <Stack
                alignItems="center"
                justifyContent="center"
                sx={{ height: "100%" }}
              >
                <Typography variant="body2" color="text.secondary">
                  Нет продаж за период
                </Typography>
              </Stack>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={daily}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={subtleBorder(theme)}
                  />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={12}
                  />
                  <YAxis
                    tick={axisTick}
                    width={32}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    cursor={{ fill: subtleBg(theme, true) }}
                    contentStyle={{
                      borderRadius: 10,
                      border: `1px solid ${subtleBorder(theme)}`,
                      background: theme.palette.background.paper,
                      fontSize: 12,
                    }}
                    formatter={(value?: number, name?: string) => [
                      `${formatQty(value ?? 0)} шт`,
                      name === "returned" ? "Возвращено" : "Продано",
                    ]}
                  />
                  <Bar
                    dataKey="quantity"
                    stackId="day"
                    fill={theme.palette.primary.main}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="returned"
                    fill={alpha(theme.palette.error.main, 0.7)}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Box>

          <Box sx={{ mt: 2, mb: 1 }}>
            <SegmentedTabs<DetailTab>
              layoutId="sales-detail-tabs"
              tabs={tabs}
              value={tab}
              onChange={setTab}
            />
          </Box>

          {detail.isLoading ? (
            <Stack spacing={1}>
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} variant="rounded" height={64} />
              ))}
            </Stack>
          ) : tab === "sales" ? (
            !data?.sales.length ? (
              <ListEmptyState
                icon={<ReceiptLongOutlined />}
                title="Продаж нет"
              />
            ) : (
              <Stack spacing={1}>
                {data.sales.map((sale) => (
                  <SaleRow
                    key={`${sale.receiptId}-${sale.productName}-${sale.quantity}`}
                    sale={sale}
                    showProduct={target?.modelId != null}
                    onOpen={
                      canOpenReceipts
                        ? () => setReceiptId(sale.receiptId)
                        : undefined
                    }
                  />
                ))}
                {data.salesTotal > data.sales.length && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    textAlign="center"
                  >
                    Показаны последние {data.sales.length} из {data.salesTotal}.
                    Сузьте период, чтобы увидеть остальные.
                  </Typography>
                )}
              </Stack>
            )
          ) : !data?.returns.length ? (
            <ListEmptyState
              icon={<KeyboardReturnOutlined />}
              title="Возвратов нет"
            />
          ) : (
            <Stack spacing={1}>
              {data.returns.map((line) => (
                <ReturnRow
                  key={`${line.returnId}-${line.productName}`}
                  line={line}
                  onOpen={
                    canOpenReceipts
                      ? () => setReceiptId(line.receiptId)
                      : undefined
                  }
                />
              ))}
            </Stack>
          )}
        </Box>
      </Drawer>

      {receiptId !== null && receipt.isError && (
        <Alert
          severity="error"
          onClose={() => setReceiptId(null)}
          sx={{
            position: "fixed",
            bottom: 16,
            left: 16,
            right: 16,
            zIndex: 1600,
          }}
        >
          {getErrorMessage(receipt.error)}
        </Alert>
      )}
      <ReceiptDetailDrawer
        receipt={receipt.data ?? null}
        open={receiptId !== null && !!receipt.data}
        onClose={() => setReceiptId(null)}
      />
    </>
  );
};

const RowShell: React.FC<{
  onOpen?: () => void;
  children: React.ReactNode;
}> = ({ onOpen, children }) => {
  const theme = useTheme();
  const body = (
    <Stack
      direction="row"
      alignItems="center"
      gap={1.5}
      sx={{
        width: "100%",
        textAlign: "left",
        px: 1.5,
        py: 1.25,
        borderRadius: "12px",
        border: 1,
        borderColor: "divider",
        transition: "background-color .15s",
        ...(onOpen && { "&:hover": { bgcolor: subtleBg(theme) } }),
      }}
    >
      {children}
      {onOpen && (
        <ChevronRightOutlined
          fontSize="small"
          sx={{ color: "text.disabled", flexShrink: 0 }}
        />
      )}
    </Stack>
  );
  return onOpen ? (
    <ButtonBase
      onClick={onOpen}
      sx={{ borderRadius: "12px", display: "block", width: "100%" }}
    >
      {body}
    </ButtonBase>
  ) : (
    body
  );
};

const SaleRow: React.FC<{
  sale: SalesDetailSale;
  showProduct: boolean;
  onOpen?: () => void;
}> = ({ sale, showProduct, onOpen }) => {
  const discount = num(sale.discount);
  const who = [sale.seller, sale.client].filter(Boolean).join(" · ");
  return (
    <RowShell onOpen={onOpen}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {receiptTitle(sale)}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          display="block"
        >
          {[
            sale.completedAt ? receiptDateLabel(sale.completedAt) : null,
            showProduct ? sale.productName : null,
            sale.branch,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
        <Stack
          direction="row"
          gap={0.5}
          alignItems="center"
          flexWrap="wrap"
          sx={{ mt: 0.5 }}
        >
          {sale.paymentMethods.map((method) => (
            <TonedChip
              key={method}
              label={salesPaymentLabel(method)}
              toneName={method === "cash" ? "success" : "info"}
            />
          ))}
          {who && (
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ minWidth: 0 }}
            >
              {who}
            </Typography>
          )}
        </Stack>
      </Box>
      <Box sx={{ textAlign: "right", flexShrink: 0 }}>
        <Typography
          variant="body2"
          fontWeight={700}
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatKGS(num(sale.revenue))}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatQty(num(sale.quantity))} × {formatKGS(num(sale.unitPrice))}
        </Typography>
        {discount > 0 && (
          <Typography variant="caption" color="warning.main" display="block">
            скидка {formatKGS(discount)}
          </Typography>
        )}
      </Box>
    </RowShell>
  );
};

const ReturnRow: React.FC<{ line: SalesDetailReturn; onOpen?: () => void }> = ({
  line,
  onOpen,
}) => (
  <RowShell onOpen={onOpen}>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="body2" fontWeight={600} noWrap>
        {receiptDateFull(line.createdAt)}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        noWrap
        display="block"
      >
        {line.productName} · чек {receiptTitle(line)}
      </Typography>
      {line.reason && (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mt: 0.25, fontStyle: "italic" }}
        >
          «{line.reason}»
        </Typography>
      )}
    </Box>
    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
      <Typography
        variant="body2"
        fontWeight={700}
        color="error.main"
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        −{formatKGS(num(line.amount))}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {formatQty(num(line.quantity))} шт
      </Typography>
    </Box>
  </RowShell>
);
