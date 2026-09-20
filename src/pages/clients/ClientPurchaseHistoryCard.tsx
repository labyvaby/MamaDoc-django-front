import React from "react";
import { Alert, Box, Card, CircularProgress, Stack, Typography } from "@mui/material";
import type { ClientPurchase } from "../../api/retail";

type Props = {
  purchases: ClientPurchase[] | undefined;
  loading: boolean;
  error: string | null;
  canViewPurchases: boolean;
};

export default function ClientPurchaseHistoryCard({ purchases, loading, error, canViewPurchases }: Props) {
  if (loading) return <Card sx={{ height: "100%", display: "grid", placeItems: "center" }}><CircularProgress size={28} /></Card>;
  if (!canViewPurchases) return <Card sx={{ height: "100%", p: 2 }}><Typography color="text.secondary">История покупок недоступна для вашей роли.</Typography></Card>;
  if (error) return <Card sx={{ height: "100%", p: 2 }}><Alert severity="error">{error}</Alert></Card>;
  return <Card sx={{ height: "100%", overflowY: "auto", p: 2 }}><Typography variant="h6" mb={1.5}>История покупок</Typography>{purchases?.length ? purchases.map((purchase) => <Box key={purchase.id} py={1.25} borderBottom={1} borderColor="divider"><Stack direction="row" justifyContent="space-between" gap={1}><Box><Typography fontWeight={600}>Чек №{purchase.number}</Typography><Typography variant="caption" color="text.secondary">{new Date(purchase.createdAt).toLocaleString("ru-RU")} · {purchase.status}</Typography></Box><Typography fontWeight={700}>{Number(purchase.totalAmount).toLocaleString("ru-RU")} сом</Typography></Stack>{purchase.lines.length > 0 && <Typography variant="body2" color="text.secondary" mt={0.5}>{purchase.lines.map((line) => `${line.productName} × ${line.quantity}`).join(", ")}</Typography>}{purchase.audit?.length > 0 && <Stack mt={1} gap={0.35}>{purchase.audit.map((entry) => <Typography key={entry.id} variant="caption" color="text.secondary">{new Date(entry.createdAt).toLocaleString("ru-RU")} · {entry.userName || "Система"} · {auditLabel(entry.action)}{entry.reason ? ` · ${entry.reason}` : ""}</Typography>)}</Stack>}</Box>) : <Typography color="text.secondary">Покупок пока нет.</Typography>}</Card>;
}

function auditLabel(action: string) {
  const labels: Record<string, string> = { checkout_completed: "чек пробит", receipt_held: "чек отложен", held_receipt_completed: "отложенный чек завершён", receipt_cancelled: "отложенный чек отменён", receipt_returned: "оформлен возврат", receipt_exchanged: "оформлен обмен" };
  return labels[action] ?? action;
}
