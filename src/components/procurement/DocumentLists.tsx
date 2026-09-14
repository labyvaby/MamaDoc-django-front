import React from "react";
import { Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography, alpha } from "@mui/material";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";

import type { SupplierPayment, SupplierPaymentMethod, SupplierReturn } from "../../api/procurement";
import { subtleBg } from "../../theme/uiHelpers";
import { ListEmptyState, ListLoadingSkeleton } from "../ui";
import { StatusChip, formatMoney, formatShortDateTime, initialOf, paymentMethodLabel } from "./meta";

const rowSx = (t: Parameters<typeof subtleBg>[0]) => ({
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  p: 1.25,
  borderRadius: 1,
  border: 1,
  borderColor: "divider",
  bgcolor: "background.paper",
  transition: "border-color .15s ease",
  "&:hover": { borderColor: alpha(t.palette.primary.main, 0.28) },
});

const smallChip = { height: 20, fontSize: "0.7rem", fontWeight: 500, bgcolor: "action.hover", color: "text.secondary", "& .MuiChip-label": { px: 0.75 } } as const;

const ListShell: React.FC<{ title: string; count: number; subtitle: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, count, subtitle, action, children }) => (
  <Paper elevation={0} variant="outlined" sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", gap: 1 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}{" "}
          <Typography component="span" variant="subtitle1" color="text.secondary" sx={{ fontWeight: 400 }}>
            ({count})
          </Typography>
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {subtitle}
        </Typography>
      </Box>
      {action}
    </Stack>
    <Box sx={{ overflowY: "auto", flex: 1, minHeight: 0 }}>{children}</Box>
  </Paper>
);

export const ReturnsList: React.FC<{
  returns: SupplierReturn[];
  loading: boolean;
  errorMessage?: string | null;
  periodLabel: string;
  onAdd?: () => void;
}> = ({ returns, loading, errorMessage, periodLabel, onAdd }) => (
  <ListShell
    title="Возвраты поставщикам"
    count={returns.length}
    subtitle={`${periodLabel} · уменьшают задолженность перед поставщиком`}
    action={
      onAdd ? (
        <Button variant="outlined" size="small" startIcon={<AddOutlined />} onClick={onAdd} sx={{ whiteSpace: "nowrap" }}>
          Новый возврат
        </Button>
      ) : undefined
    }
  >
    {loading ? (
      <ListLoadingSkeleton rows={3} />
    ) : errorMessage ? (
      <ListEmptyState icon={<UndoOutlined />} title="Не удалось загрузить возвраты" description={errorMessage} />
    ) : returns.length === 0 ? (
      <ListEmptyState icon={<UndoOutlined />} title="Возвратов не было" description="Брак, пересорт или невыкуп оформляются возвратом из карточки накладной." />
    ) : (
      <Stack spacing={1} sx={{ p: 1.5 }}>
        {returns.map((doc) => (
          <Box key={doc.id} sx={rowSx}>
            <Box sx={(t) => ({ width: 48, height: 48, borderRadius: 1, flexShrink: 0, display: "grid", placeItems: "center", fontWeight: 600, fontSize: "1.1rem", bgcolor: alpha(t.palette.primary.main, 0.1), color: "primary.onSurface" })}>
              {initialOf(doc.supplierName)}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ rowGap: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {doc.number}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  · {formatShortDateTime(doc.createdAt)}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" noWrap>
                {doc.supplierName}
                {doc.goodsReceiptNumber ? ` · по накладной ${doc.goodsReceiptNumber}` : ""}
              </Typography>
              <Stack direction="row" gap={0.75} sx={{ mt: 0.5 }} flexWrap="wrap">
                <Chip size="small" label={doc.branchName ? `${doc.warehouseName} · ${doc.branchName}` : doc.warehouseName} sx={smallChip} />
                <Chip size="small" label={`${doc.lines.length} поз.`} sx={smallChip} />
                {doc.reason && <Chip size="small" label={doc.reason.split(":")[0]} sx={smallChip} />}
              </Stack>
            </Box>
            <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                −{formatMoney(doc.totalCost)}{" "}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                  сом
                </Typography>
              </Typography>
              <StatusChip tone="info" label="Проведён" compact />
            </Stack>
          </Box>
        ))}
      </Stack>
    )}
  </ListShell>
);

const methodIcon = (method: SupplierPaymentMethod) => {
  switch (method) {
    case "cash":
      return <PaymentsOutlined />;
    case "card":
      return <CreditCardOutlined />;
    case "offset":
      return <SwapHorizOutlined />;
    default:
      return <AccountBalanceOutlined />;
  }
};

export const PaymentsList: React.FC<{
  payments: SupplierPayment[];
  loading: boolean;
  errorMessage?: string | null;
  periodLabel: string;
  canDelete: boolean;
  onDelete: (payment: SupplierPayment) => void;
  onAdd?: () => void;
  onOpenReceipt?: (receiptId: number) => void;
}> = ({ payments, loading, errorMessage, periodLabel, canDelete, onDelete, onAdd, onOpenReceipt }) => {
  const [method, setMethod] = React.useState<SupplierPaymentMethod | "all">("all");
  const visible = method === "all" ? payments : payments.filter((p) => p.paymentMethod === method);
  const counts = (m: SupplierPaymentMethod) => payments.filter((p) => p.paymentMethod === m).length;
  const options: { value: SupplierPaymentMethod | "all"; label: string; count: number }[] = [
    { value: "all", label: "Все", count: payments.length },
    { value: "cash", label: "Наличные", count: counts("cash") },
    { value: "card", label: "Карта", count: counts("card") },
    { value: "cashless", label: "Безнал", count: counts("cashless") },
    { value: "offset", label: "Взаимозачёт", count: counts("offset") },
  ];
  return (
    <ListShell
      title="Оплаты поставщикам"
      count={payments.length}
      subtitle={`${periodLabel} · все способы оплаты`}
      action={
        onAdd ? (
          <Button variant="outlined" size="small" startIcon={<AddOutlined />} onClick={onAdd} sx={{ whiteSpace: "nowrap" }}>
            Новая оплата
          </Button>
        ) : undefined
      }
    >
      <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
        {options.map((o) => {
          const active = method === o.value;
          return (
            <Chip
              key={o.value}
              size="small"
              clickable
              label={`${o.label} · ${o.count}`}
              onClick={() => setMethod(o.value)}
              sx={(t) => ({
                height: 26,
                borderRadius: "8px",
                fontWeight: 500,
                border: 1,
                borderColor: active ? alpha(t.palette.primary.main, 0.4) : "divider",
                color: active ? "primary.onSurface" : "text.secondary",
                bgcolor: active ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08) : "transparent",
                "&:hover": { bgcolor: active ? alpha(t.palette.primary.main, 0.12) : subtleBg(t, true) },
              })}
            />
          );
        })}
      </Stack>
      {loading ? (
        <ListLoadingSkeleton rows={4} />
      ) : errorMessage ? (
        <ListEmptyState icon={<PaymentsOutlined />} title="Не удалось загрузить оплаты" description={errorMessage} />
      ) : visible.length === 0 ? (
        <ListEmptyState icon={<PaymentsOutlined />} title="Оплат не было" description="Оплата проводится из карточки накладной или в счёт долга поставщику." />
      ) : (
        <Stack spacing={1} sx={{ p: 1.5 }}>
          {visible.map((payment) => (
            <Box key={payment.id} sx={rowSx}>
              <Box sx={(t) => ({ width: 48, height: 48, borderRadius: 1, flexShrink: 0, display: "grid", placeItems: "center", bgcolor: alpha(t.palette.success.main, 0.12), color: "success.onSurface" })}>
                {methodIcon(payment.paymentMethod)}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ rowGap: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {payment.supplierName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    · {formatShortDateTime(payment.paidAt)}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {payment.goodsReceiptNumber ? (
                    <>
                      По накладной{" "}
                      {onOpenReceipt && payment.goodsReceiptId ? (
                        <Box component="span" onClick={() => onOpenReceipt(payment.goodsReceiptId!)} sx={{ color: "primary.onSurface", cursor: "pointer", fontWeight: 500 }}>
                          {payment.goodsReceiptNumber}
                        </Box>
                      ) : (
                        payment.goodsReceiptNumber
                      )}
                    </>
                  ) : (
                    "В счёт задолженности"
                  )}
                  {payment.createdByName ? ` · ${payment.createdByName}` : ""}
                </Typography>
                <Stack direction="row" gap={0.75} sx={{ mt: 0.5 }} flexWrap="wrap">
                  <Chip size="small" label={paymentMethodLabel(payment.paymentMethod, payment.cashlessMethodName)} sx={smallChip} />
                  {payment.branchName && <Chip size="small" label={payment.branchName} sx={smallChip} />}
                  {payment.documentNumber && <Chip size="small" label={`№ ${payment.documentNumber}`} sx={smallChip} />}
                </Stack>
              </Box>
              <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(payment.amount)}{" "}
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                    сом
                  </Typography>
                </Typography>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <StatusChip tone="success" label="Проведена" compact />
                  {canDelete && (
                    <Tooltip title="Удалить оплату">
                      <IconButton size="small" onClick={() => onDelete(payment)} aria-label="Удалить оплату">
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </ListShell>
  );
};
