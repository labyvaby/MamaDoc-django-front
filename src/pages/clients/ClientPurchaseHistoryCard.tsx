import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { AppCard, ListEmptyState, ListLoadingSkeleton, TonedChip } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import type { ClientPurchase } from "../../api/retail";
import { linesSummary, paymentsSummary, receiptDateLabel, receiptNumber, receiptStatusMeta } from "../pos/historyMeta";
import { PosAmount } from "../pos/ui";

type Props = {
  purchases: ClientPurchase[] | undefined;
  loading: boolean;
  error: string | null;
  canViewPurchases: boolean;
  onOpen: (purchase: ClientPurchase) => void;
};

/**
 * История покупок клиента: сводка (сколько раз и на сколько купил) и список
 * чеков. Строка кликабельна — открывает подробный чек, тот же, что в истории
 * продаж кассы.
 */
export default function ClientPurchaseHistoryCard({ purchases, loading, error, canViewPurchases, onOpen }: Props) {
  const stats = React.useMemo(() => {
    const completed = (purchases ?? []).filter((purchase) => purchase.status === "completed");
    const spent = completed.reduce((sum, purchase) => sum + (Number(purchase.totalAmount) || 0), 0);
    return { count: completed.length, spent, average: completed.length ? spent / completed.length : 0 };
  }, [purchases]);

  let body: React.ReactNode;
  if (!canViewPurchases) {
    body = <ListEmptyState icon={<LockOutlined />} title="История покупок недоступна" description="У вашей роли нет права на историю продаж." />;
  } else if (loading) {
    body = <ListLoadingSkeleton rows={5} />;
  } else if (error) {
    body = <ListEmptyState icon={<ErrorOutlineOutlined />} title="Не удалось загрузить покупки" description={error} />;
  } else if (!purchases?.length) {
    body = <ListEmptyState icon={<ShoppingBagOutlined />} title="Покупок пока нет" description="Чеки клиента появятся здесь после продажи на кассе." />;
  } else {
    body = (
      <Stack spacing={1} sx={{ p: 1.5 }}>
        {purchases.map((purchase) => <PurchaseRow key={purchase.id} purchase={purchase} onOpen={onOpen} />)}
      </Stack>
    );
  }

  return (
    <AppCard
      variant="outlined"
      disableContentPadding
      sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
      header={
        <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
          <Stack direction="row" alignItems="center" gap={1.25}>
            <ShoppingBagOutlined color="primary" />
            <Typography variant="h6">История покупок</Typography>
          </Stack>
          {canViewPurchases && !loading && !error && stats.count > 0 && (
            <Box sx={{ mt: 1.5, display: "grid", gap: 1, gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
              <Stat label="Покупок" value={String(stats.count)} />
              <Stat label="Потрачено" value={<PosAmount value={stats.spent} />} />
              <Stat label="Средний чек" value={<PosAmount value={Math.round(stats.average)} />} />
            </Box>
          )}
        </Box>
      }
    >
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: 1, borderColor: "divider" }}>{body}</Box>
    </AppCard>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={(t) => ({ px: 1.25, py: 1, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: subtleBg(t), minWidth: 0 })}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>{label}</Typography>
      <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ lineHeight: 1.35 }}>{value}</Typography>
    </Box>
  );
}

function PurchaseRow({ purchase, onOpen }: { purchase: ClientPurchase; onOpen: (purchase: ClientPurchase) => void }) {
  const status = receiptStatusMeta(purchase.status);
  const returned = purchase.status === "returned";
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={`Открыть чек №${receiptNumber(purchase)}`}
      onClick={() => onOpen(purchase)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(purchase);
        }
      }}
      sx={(t) => ({
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        p: 1.25,
        borderRadius: "12px",
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        cursor: "pointer",
        transition: "background-color .15s ease, border-color .15s ease, transform .15s ease",
        "&:hover": { bgcolor: subtleBg(t), borderColor: alpha(t.palette.primary.main, 0.35) },
        "&:hover .purchase-chevron": { color: "primary.main", transform: "translateX(2px)" },
        "&:active": { transform: "scale(0.995)" },
        "&:focus-visible": { outline: "none", borderColor: alpha(t.palette.primary.main, 0.6) },
      })}
    >
      <Box
        sx={(t) => ({
          width: 40,
          height: 40,
          borderRadius: "10px",
          flexShrink: 0,
          // На телефоне (sm в теме = 360) ширина строки нужнее составу чека.
          display: { xs: "none", md: "flex" },
          alignItems: "center",
          justifyContent: "center",
          color: "primary.onSurface",
          bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
          "& .MuiSvgIcon-root": { fontSize: 20 },
        })}
      >
        <ReceiptLongOutlined />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <Typography variant="body2" fontWeight={700}>Чек №{receiptNumber(purchase)}</Typography>
          <TonedChip label={status.label} toneName={status.tone} />
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" noWrap>
          {receiptDateLabel(purchase.createdAt)}{purchase.payments?.length ? ` · ${paymentsSummary(purchase.payments)}` : ""}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.25 }}>
          {linesSummary(purchase.lines)}
        </Typography>
      </Box>
      <Stack alignItems="flex-end" sx={{ flexShrink: 0 }}>
        <Typography
          variant="body2"
          fontWeight={700}
          sx={{ whiteSpace: "nowrap", color: returned ? "text.disabled" : "text.primary", textDecoration: returned ? "line-through" : "none" }}
        >
          <PosAmount value={Number(purchase.totalAmount) || 0} />
        </Typography>
        {Number(purchase.discountTotal) > 0 && (
          <Typography variant="caption" color="success.main" sx={{ whiteSpace: "nowrap" }}>
            −<PosAmount value={Number(purchase.discountTotal)} />
          </Typography>
        )}
      </Stack>
      <ChevronRightOutlined className="purchase-chevron" sx={{ color: "text.disabled", flexShrink: 0, transition: "color .15s ease, transform .15s ease" }} />
    </Box>
  );
}
