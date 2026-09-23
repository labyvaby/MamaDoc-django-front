import React from "react";
import { Box, ButtonBase, Dialog, IconButton, InputBase, Stack, Typography } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import MailOutlineOutlined from "@mui/icons-material/MailOutlineOutlined";
import SmsOutlined from "@mui/icons-material/SmsOutlined";
import { useTheme } from "@mui/material/styles";
import type { PosBootstrap, PosTender } from "../../api/pos";
import { POS_RADIUS, posColors } from "./layout";
import { PosAmount } from "./ui";

type CheckoutLine = { name: string; quantity: string; total: number };
const cents = (value: string) => /^\d+(?:[.,]\d{0,2})?$/.test(value) ? Math.round(Number(value.replace(",", ".")) * 100) : NaN;
const METHOD_LABELS = { cash: "Наличные", card: "Карта", cashless: "QR", split: "Частями" } as const;

export function CheckoutDialog({ open, due, bootstrap, lines, subtotal, discount, benefits, pending, error, onClose, onPay }: {
  open: boolean; due: string; bootstrap: PosBootstrap; lines: CheckoutLine[]; subtotal: number; discount: number;
  benefits: Array<{ label: string; value: number; positive?: boolean }>; pending: boolean; error: string | null;
  onClose: () => void; onPay: (payments: PosTender[]) => void;
}) {
  const c = posColors(useTheme());
  const methods = (["cash", "card", "cashless", "split"] as const).filter((method) => bootstrap.actions[method] && (method !== "split" || (bootstrap.actions.cash && bootstrap.actions.card)));
  const amount = cents(due);
  const [method, setMethod] = React.useState<(typeof methods)[number] | "">(methods[0] ?? "");
  const [received, setReceived] = React.useState(due);
  const [cashlessId, setCashlessId] = React.useState<number | "">(bootstrap.cashlessMethods[0]?.id ?? "");
  const [receiptContact, setReceiptContact] = React.useState("");
  const [receiptChannel, setReceiptChannel] = React.useState<"email" | "sms">("email");
  React.useEffect(() => { if (open) { setReceived(due); setMethod(methods[0] ?? ""); setReceiptContact(""); setReceiptChannel("email"); } }, [open, due]);
  const entered = cents(received);
  const noncash = method === "split" ? amount - entered : amount;
  const change = method === "cash" && Number.isFinite(entered) ? Math.max(0, entered - amount) : 0;
  const valid = amount === 0 || (Boolean(method) && (method === "cash" ? Number.isFinite(entered) && entered >= amount : method === "split" ? entered > 0 && noncash > 0 && cashlessId !== "" : cashlessId !== "" || method === "card"));
  const submit = () => {
    if (!valid || pending) return;
    if (amount === 0) return onPay([]);
    const payments: PosTender[] = [];
    if (method === "cash" || method === "split") payments.push({ method: "cash", amount: ((method === "cash" ? amount : entered) / 100).toFixed(2) });
    if (method !== "cash") payments.push({ method: method === "cashless" ? "cashless" : "card", amount: (noncash / 100).toFixed(2), ...(cashlessId !== "" ? { cashlessMethodId: Number(cashlessId) } : {}) });
    onPay(payments);
  };
  const quickAmounts = Array.from(new Set([amount, 500000, 1000000, 1000000, 1000000, 1000000]));
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="md" PaperProps={{ sx: { m: { xs: 1, sm: 2 }, width: { xs: "calc(100% - 16px)", sm: 900 }, maxHeight: "min(720px, calc(100vh - 32px))", overflow: "hidden", borderRadius: `${POS_RADIUS.dialog}px`, bgcolor: c.page, color: c.text, border: `1px solid ${c.outline}`, backgroundImage: "none" } }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(230px, .8fr) minmax(430px, 1.2fr)" }, minHeight: { md: 470 } }}>
        <Box sx={{ p: { xs: "18px", sm: "22px" }, bgcolor: c.checkArea, borderRight: { md: `1px solid ${c.outline}` }, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}><Typography sx={{ fontSize: 14, fontWeight: 800 }}>Оплата</Typography><Typography sx={{ fontSize: 11, color: c.textDim, whiteSpace: "nowrap" }}>{lines.length} товаров · Чек</Typography></Stack>
          <Typography sx={{ mt: "24px", mb: "10px", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: c.textDim }}>Содержание чека</Typography>
          <Stack gap="7px" sx={{ overflowY: "auto", minHeight: 0 }}>{lines.map((line, index) => <Stack key={`${line.name}-${index}`} direction="row" justifyContent="space-between" gap={1}><Box sx={{ minWidth: 0 }}><Typography sx={{ fontSize: 12, lineHeight: 1.3, color: c.textSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.name}</Typography><Typography sx={{ fontSize: 10, color: c.textDim }}>{line.quantity} шт.</Typography></Box><Typography sx={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}><PosAmount value={line.total} /></Typography></Stack>)}</Stack>
          <Stack gap="5px" sx={{ mt: "auto", pt: "20px" }}><SummaryRow label="Подытог" value={subtotal} /><SummaryRow label="Скидка" value={discount} negative />{benefits.map((item) => <SummaryRow key={item.label} label={item.label} value={item.value} negative={!item.positive} />)}<Box sx={{ height: 1, bgcolor: c.hairline, my: "8px" }} /><Stack direction="row" justifyContent="space-between" alignItems="flex-end"><Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: c.textDim }}>К оплате</Typography><Typography sx={{ fontSize: 24, fontWeight: 900 }}><PosAmount value={Number(due)} /></Typography></Stack></Stack>
        </Box>
        <Box sx={{ p: { xs: "18px", sm: "22px" }, minWidth: 0, overflowY: "auto" }}>
          <Stack direction="row" justifyContent="flex-end"><IconButton onClick={onClose} disabled={pending} size="small" sx={{ color: c.textDim }}><CloseOutlined fontSize="small" /></IconButton></Stack>
          <Stack direction="row" gap="7px" sx={{ mt: "2px", overflowX: "auto", pb: "4px" }}>{methods.map((value) => <MethodButton key={value} active={method === value} disabled={pending} onClick={() => setMethod(value)} label={METHOD_LABELS[value]} />)}</Stack>
          <Box sx={{ mt: "12px", p: "12px", borderRadius: `${POS_RADIUS.card}px`, bgcolor: c.card, border: `1px solid ${c.hairline}` }}><Stack direction="row" justifyContent="space-between" gap={2}><Metric label={method === "cash" ? "Получено" : method === "split" ? "Наличными" : "К оплате"} value={method === "cash" ? (Number.isFinite(entered) ? entered / 100 : 0) : method === "split" ? (Number.isFinite(entered) ? entered / 100 : 0) : Number(due)} /><Metric label={method === "cash" ? "Сдача" : method === "split" ? "Безналичными" : "Сумма"} value={method === "cash" ? change / 100 : method === "split" ? Math.max(0, noncash) / 100 : Number(due)} /></Stack></Box>
          {(method === "cash" || method === "split") && <InputBase value={received} onChange={(event) => setReceived(event.target.value)} disabled={pending} autoFocus inputProps={{ inputMode: "decimal", "aria-label": "Полученная сумма" }} sx={{ mt: "10px", width: "100%", height: 42, px: "14px", bgcolor: c.card, border: `1px solid ${c.hairline}`, borderRadius: `${POS_RADIUS.control}px`, fontSize: 15, color: c.text, "& input": { textAlign: "right" }, "&.Mui-focused": { borderColor: c.accent } }} />}
          <Stack direction="row" gap="5px" sx={{ mt: "7px", overflowX: "auto" }}>{quickAmounts.map((quick, index) => <ButtonBase key={`${quick}-${index}`} onClick={() => setReceived((quick / 100).toFixed(2))} disabled={pending || (method !== "cash" && method !== "split")} sx={{ minWidth: 58, px: "8px", py: "8px", borderRadius: `${POS_RADIUS.chip}px`, bgcolor: index === 0 && entered === quick ? c.accent : c.tile, color: index === 0 && entered === quick ? c.onAccent : c.textSoft, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}><PosAmount value={quick / 100} /></ButtonBase>)}</Stack>
          {method !== "cash" && method !== "split" && bootstrap.cashlessMethods.length > 0 && <Stack direction="row" gap="6px" sx={{ mt: "12px" }}>{bootstrap.cashlessMethods.map((item) => <ButtonBase key={item.id} onClick={() => setCashlessId(item.id)} sx={{ px: "10px", py: "7px", borderRadius: `${POS_RADIUS.pill}px`, bgcolor: cashlessId === item.id ? c.accentBg : c.tile, border: `1px solid ${cashlessId === item.id ? c.accent : c.hairline}`, color: c.textSoft, fontSize: 11 }}>{item.name}</ButtonBase>)}</Stack>}
          <Stack gap="7px" sx={{ mt: "28px" }}><Typography sx={{ fontSize: 10, fontWeight: 700, color: c.textDim }}>Отправить электронный чек клиенту</Typography><Stack direction={{ xs: "column", sm: "row" }} gap="6px"><InputBase value={receiptContact} onChange={(event) => setReceiptContact(event.target.value)} placeholder={receiptChannel === "email" ? "Введите email" : "Введите телефон"} disabled={pending} sx={{ flex: 1, minWidth: 0, height: 36, px: "12px", bgcolor: c.card, border: `1px solid ${c.hairline}`, borderRadius: `${POS_RADIUS.control}px`, fontSize: 12, color: c.text }} /><ButtonBase onClick={() => setReceiptChannel("email")} sx={{ px: "13px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: receiptChannel === "email" ? c.accent : c.tile, color: receiptChannel === "email" ? c.onAccent : c.textSoft, fontSize: 11, fontWeight: 700 }}><MailOutlineOutlined sx={{ fontSize: 15, mr: "4px" }} />Почта</ButtonBase><ButtonBase onClick={() => setReceiptChannel("sms")} sx={{ px: "13px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: receiptChannel === "sms" ? c.accent : c.tile, color: receiptChannel === "sms" ? c.onAccent : c.textSoft, fontSize: 11, fontWeight: 700 }}><SmsOutlined sx={{ fontSize: 15, mr: "4px" }} />SMS</ButtonBase></Stack></Stack>
          {error && <Typography sx={{ mt: "12px", color: c.danger, fontSize: 12 }}>{error}</Typography>}
          <Stack direction={{ xs: "column-reverse", sm: "row" }} gap="8px" sx={{ mt: "24px" }}><ButtonBase onClick={onClose} disabled={pending} sx={{ flex: 1, minHeight: 42, px: "14px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: c.tile, border: `1px solid ${c.hairline}`, color: c.textSoft, fontSize: 12, fontWeight: 700 }}>Вернуться к чеку</ButtonBase><ButtonBase onClick={submit} disabled={!valid || pending} sx={{ flex: 1.4, minHeight: 42, px: "14px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: c.accent, color: c.onAccent, fontSize: 12, fontWeight: 800, "&.Mui-disabled": { opacity: .4 } }}>{pending ? "Сохраняем…" : "Принять оплату"}</ButtonBase></Stack>
        </Box>
      </Box>
    </Dialog>
  );
}

function SummaryRow({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) { return <Stack direction="row" justifyContent="space-between"><Typography sx={{ fontSize: 11, color: "text.secondary" }}>{label}</Typography><Typography sx={{ fontSize: 11, color: negative ? "success.main" : "text.primary" }}><PosAmount value={value} negative={negative} /></Typography></Stack>; }
function Metric({ label, value }: { label: string; value: number }) { return <Stack gap="2px"><Typography sx={{ fontSize: 9, textTransform: "uppercase", color: "text.secondary", letterSpacing: ".06em" }}>{label}</Typography><Typography sx={{ fontSize: 25, fontWeight: 900, lineHeight: 1.1 }}><PosAmount value={value} /></Typography></Stack>; }
function MethodButton({ active, disabled, onClick, label }: { active: boolean; disabled: boolean; onClick: () => void; label: string }) { const c = posColors(useTheme()); return <ButtonBase onClick={onClick} disabled={disabled} sx={{ minWidth: 84, flex: 1, px: "10px", py: "11px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: active ? c.accentBg : c.page, border: `1px solid ${active ? c.accent : c.hairline}`, color: active ? c.text : c.textSoft, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</ButtonBase>; }
