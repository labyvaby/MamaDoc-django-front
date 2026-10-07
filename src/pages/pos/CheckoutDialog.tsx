import React from "react";
import { Box, ButtonBase, CircularProgress, Dialog, IconButton, InputBase, Stack, Typography } from "@mui/material";
import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import MailOutlineOutlined from "@mui/icons-material/MailOutlineOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import QrCode2Outlined from "@mui/icons-material/QrCode2Outlined";
import SmsOutlined from "@mui/icons-material/SmsOutlined";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { PosBootstrap, PosClientCertificate, PosTender } from "../../api/pos";
import { certificateExpiryLabel } from "../certificates/certificateMeta";
import { payableCertificates } from "./certificateCart";
import { POS_RADIUS, posColors } from "./layout";
import {
  SPLIT_LABELS,
  defaultCashlessId,
  fillRemainder,
  formatCents,
  initialSplitRows,
  parseAmountCents,
  payAllWith,
  splitPayments,
  splitState,
  type CashlessOption,
  type SplitKind,
  type SplitRow,
} from "./splitPayment";
import { PosAmount } from "./ui";

type CheckoutLine = { name: string; quantity: string; total: number; discountAmount?: number; certificate?: boolean };
type CheckoutBenefit = { label: string; value: number; tone?: "discount" | "bonus" | "cashback" | "certificate" };

/** Оплата сертификатом: сертификаты выбранного покупателя и применённый код. */
export type CheckoutCertificateOptions = {
  /** Сертификатом платят только за товары — без товаров способ недоступен. */
  hasGoods: boolean;
  clientName: string | null;
  list: PosClientCertificate[] | undefined;
  loading: boolean;
  loadError: string | null;
  /** Код, который сейчас применён к чеку (`certificateCode` в quote/checkout). */
  applied: string;
  /** Сколько сертификат списывает по расчёту сервера. */
  appliedAmount: number;
  onApply: (code: string) => void;
  /** «Выбрать покупателя» — закрыть окно и перейти к поиску клиента. */
  onPickClient: () => void;
};

const METHOD_LABELS = { cash: "Наличные", card: "Карта", cashless: "QR", split: "Частями", certificate: "Сертификат" } as const;
type Method = keyof typeof METHOD_LABELS;
type MoneyMethod = Exclude<Method, "certificate">;
const SPLIT_KINDS: readonly SplitKind[] = ["cash", "card", "cashless"];
const SPLIT_ICONS: Record<SplitKind, React.ReactNode> = {
  cash: <PaymentsOutlined sx={{ fontSize: 20 }} />,
  card: <CreditCardOutlined sx={{ fontSize: 20 }} />,
  cashless: <QrCode2Outlined sx={{ fontSize: 20 }} />,
};
/** «Всё наличными / картой / QR» — как кассир говорит это вслух. */
const PAY_ALL_LABELS: Record<SplitKind, string> = { cash: "Всё наличными", card: "Всё картой", cashless: "Всё по QR" };

/** Кнопки наличных: ровно сумма и ближайшие круглые купюрой побольше. */
const cashQuickAmounts = (amount: number) =>
  Array.from(new Set([amount, ...[50000, 100000, 500000].map((step) => Math.ceil(amount / step) * step)]))
    .filter((value) => value >= amount && value > 0)
    .slice(0, 4);

export function CheckoutDialog({ open, due, bootstrap, lines, subtotal, discount, benefits, pending, error, onClose, onPay, recalculating = false, certificate }: {
  open: boolean; due: string; bootstrap: PosBootstrap; lines: CheckoutLine[]; subtotal: number; discount: number;
  benefits: CheckoutBenefit[]; pending: boolean; error: string | null;
  onClose: () => void; onPay: (payments: PosTender[]) => void;
  /** Сервер пересчитывает чек (например, после выбора сертификата) — оплату ждём. */
  recalculating?: boolean;
  certificate?: CheckoutCertificateOptions;
}) {
  const theme = useTheme();
  const c = posColors(theme);
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const terminals: CashlessOption[] = bootstrap.cashlessMethods;
  // Терминал выбирают, только когда их заведено хоть сколько-то; без справочника безнал уходит без него.
  const needTerminal = terminals.length > 0;
  const splitKinds = SPLIT_KINDS.filter((kind) => bootstrap.actions[kind]);
  const moneyMethods = (["cash", "card", "cashless", "split"] as const).filter((method) => bootstrap.actions[method] && (method !== "split" || splitKinds.length >= 2));
  const methods: Method[] = [...moneyMethods, ...(certificate && bootstrap.actions.certificate ? (["certificate"] as const) : [])];
  const amount = parseAmountCents(due);
  const [method, setMethod] = React.useState<Method | "">(methods[0] ?? "");
  const [received, setReceived] = React.useState(due);
  const [cashlessId, setCashlessId] = React.useState<number | null>(defaultCashlessId(terminals));
  const [splitRows, setSplitRows] = React.useState<SplitRow[]>(() => initialSplitRows(splitKinds, terminals));
  const [receiptContact, setReceiptContact] = React.useState("");
  const [receiptChannel, setReceiptChannel] = React.useState<"email" | "sms">("email");
  // Окно открылось — всё с начала; у сертификата уже применённый код ведёт на его вкладку.
  React.useEffect(() => {
    if (!open) return;
    setReceived(due);
    setMethod(certificate?.applied && methods.includes("certificate") ? "certificate" : methods[0] ?? "");
    setCashlessId(defaultCashlessId(terminals));
    setSplitRows(initialSplitRows(splitKinds, terminals));
    setReceiptContact("");
    setReceiptChannel("email");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Сумма пересчиталась (сертификат, скидка) — подставляем новую, способ не трогаем.
  React.useEffect(() => {
    if (open) setReceived(due);
  }, [open, due]);
  const entered = parseAmountCents(received);
  const change = method === "cash" && Number.isFinite(entered) ? Math.max(0, entered - amount) : 0;
  const split = splitState(amount, splitRows, { needTerminal });
  const methodValid =
    method === "cash" ? Number.isFinite(entered) && entered >= amount
      : method === "split" ? split.ready
        : method === "card" || method === "cashless" ? !needTerminal || cashlessId !== null
          : false;
  const valid = !recalculating && (amount === 0 || methodValid);
  const submit = () => {
    if (!valid || pending) return;
    if (amount === 0) return onPay([]);
    if (method === "split") return onPay(splitPayments(amount, splitRows));
    const money = (amount / 100).toFixed(2);
    // Наличные уходят суммой чека: сдача остаётся у покупателя, в кассу её не пишем.
    if (method === "cash") return onPay([{ method: "cash", amount: money }]);
    onPay([{ method: method === "cashless" ? "cashless" : "card", amount: money, ...(cashlessId !== null ? { cashlessMethodId: cashlessId } : {}) }]);
  };
  const goodsCount = lines.filter((line) => !line.certificate).length;
  const certificatesCount = lines.length - goodsCount;
  const countLabel = [goodsCount ? `${goodsCount} товаров` : "", certificatesCount ? `${certificatesCount} серт.` : ""].filter(Boolean).join(" · ") || "пусто";
  // Частями: пока сумма не сошлась, кнопка говорит, чего не хватает.
  const splitBlocked = method === "split" && amount > 0 && !recalculating && !split.ready;
  const payLabel = pending ? "Сохраняем…" : recalculating ? "Пересчитываем…" : method === "certificate" && amount > 0 ? (certificate?.applied ? "Выберите способ" : "Выберите сертификат") : splitBlocked ? split.problem : "Принять оплату";

  const actionsRow = (
    <Stack direction={{ xs: "column-reverse", md: "row" }} gap="8px">
      <ButtonBase onClick={onClose} disabled={pending} sx={{ flex: 1, minHeight: { xs: 48, md: 44 }, px: "14px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: c.tile, border: `1px solid ${c.hairline}`, color: c.textSoft, fontSize: 13, fontWeight: 700 }}>Вернуться к чеку</ButtonBase>
      <ButtonBase onClick={submit} disabled={!valid || pending} aria-label={splitBlocked ? `Нельзя принять оплату: ${split.problem}` : undefined} sx={{ flex: 1.4, minHeight: { xs: 52, md: 44 }, px: "14px", gap: "8px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: c.accent, color: c.onAccent, fontSize: splitBlocked ? 13 : { xs: 15, md: 13 }, lineHeight: 1.3, py: "6px", fontWeight: 800, textAlign: "center", "&.Mui-disabled": { opacity: splitBlocked ? 1 : .4, bgcolor: splitBlocked ? c.tile : c.accent, color: splitBlocked ? c.textSoft : c.onAccent, border: splitBlocked ? `1px dashed ${c.hairline}` : "none" } }}>
        {recalculating ? <CircularProgress size={14} sx={{ color: "inherit" }} /> : null}
        {payLabel}
        {!pending && !recalculating && !splitBlocked && amount > 0 && method !== "certificate" ? <Box component="span" sx={{ opacity: .8, whiteSpace: "nowrap" }}>· <PosAmount value={amount / 100} /></Box> : null}
      </ButtonBase>
    </Stack>
  );

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      fullWidth
      maxWidth="md"
      fullScreen={fullScreen}
      PaperProps={{ sx: fullScreen
        ? { bgcolor: c.page, color: c.text, backgroundImage: "none", display: "flex", flexDirection: "column" }
        : { m: { xs: 1, sm: 2 }, width: { xs: "calc(100% - 16px)", sm: 940 }, maxHeight: "min(780px, calc(100vh - 32px))", overflow: "hidden", borderRadius: `${POS_RADIUS.dialog}px`, bgcolor: c.page, color: c.text, border: `1px solid ${c.outline}`, backgroundImage: "none" } }}
    >
      <Box sx={{ flex: fullScreen ? 1 : undefined, overflowY: fullScreen ? "auto" : undefined, display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(230px, .75fr) minmax(460px, 1.25fr)" }, minHeight: { xs: 0, md: 470 } }}>
        <Box sx={{ order: { xs: 2, md: 0 }, p: { xs: "16px", md: "22px" }, bgcolor: c.checkArea, borderRight: { md: `1px solid ${c.outline}` }, borderTop: { xs: `1px solid ${c.outline}`, md: "none" }, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}><Typography sx={{ fontSize: 14, fontWeight: 800 }}>Чек</Typography><Typography sx={{ fontSize: 11, color: c.textDim, whiteSpace: "nowrap" }}>{countLabel}</Typography></Stack>
          <Typography sx={{ mt: { xs: "12px", md: "24px" }, mb: "10px", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: c.textDim }}>Содержание чека</Typography>
          <Stack gap="7px" sx={{ overflowY: "auto", minHeight: 0 }}>{lines.map((line, index) => <Stack key={`${line.name}-${index}`} direction="row" justifyContent="space-between" gap={1}><Box sx={{ minWidth: 0 }}><Typography sx={{ fontSize: 12, lineHeight: 1.3, color: c.textSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.certificate ? <CardGiftcardOutlined sx={{ fontSize: 13, mr: "4px", verticalAlign: "-2px", color: c.accentText }} /> : null}{line.name}</Typography><Typography sx={{ fontSize: 10, color: c.textDim }}>{line.certificate ? "сертификат · без скидок" : `${line.quantity} шт.`}{line.discountAmount ? <Box component="span" sx={{ color: c.discount }}> · скидка −{line.discountAmount.toLocaleString("ru-RU")} с</Box> : null}</Typography></Box><Typography sx={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}><PosAmount value={line.total} /></Typography></Stack>)}</Stack>
          <Stack gap="5px" sx={{ mt: "auto", pt: "20px" }}><SummaryRow label="Подытог" value={subtotal} /><SummaryRow label="Скидка" value={discount} negative tone="discount" />{benefits.map((item) => <SummaryRow key={item.label} label={item.label} value={item.value} negative={item.tone !== undefined} tone={item.tone} />)}<Box sx={{ height: 1, bgcolor: c.hairline, my: "8px" }} /><Stack direction="row" justifyContent="space-between" alignItems="flex-end"><Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: c.textDim }}>К оплате</Typography><Typography sx={{ fontSize: 24, fontWeight: 900 }}><PosAmount value={Number(due)} /></Typography></Stack></Stack>
        </Box>
        <Box sx={{ order: { xs: 1, md: 0 }, p: { xs: "16px", md: "22px" }, pt: { xs: "max(12px, env(safe-area-inset-top))", md: "22px" }, minWidth: 0, overflowY: fullScreen ? undefined : "auto" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography sx={{ fontSize: { xs: 18, md: 14 }, fontWeight: 800 }}>Оплата</Typography><IconButton onClick={onClose} disabled={pending} aria-label="Закрыть" sx={{ width: 44, height: 44, color: c.textDim }}><CloseOutlined fontSize="small" /></IconButton></Stack>
          <Box role="tablist" aria-label="Способ оплаты" sx={{ mt: "2px", display: "flex", flexWrap: "wrap", gap: "7px" }}>{methods.map((value) => <MethodButton key={value} active={method === value} disabled={pending} onClick={() => setMethod(value)} label={METHOD_LABELS[value]} icon={value === "certificate" ? <CardGiftcardOutlined sx={{ fontSize: 15 }} /> : null} />)}</Box>

          {method === "certificate" && certificate ? (
            <CertificatePicker options={certificate} due={amount / 100} disabled={pending} moneyMethods={moneyMethods} onPickMethod={setMethod} />
          ) : (
            <>
              {certificate?.applied && certificate.appliedAmount > 0 ? <Typography sx={{ mt: "12px", fontSize: 12, color: c.certificate }}>Сертификат {certificate.applied} списывает <PosAmount value={certificate.appliedAmount} /> — здесь остаток.</Typography> : null}
              {method === "split" ? (
                <SplitPanel
                  due={amount}
                  rows={splitRows}
                  state={split}
                  terminals={terminals}
                  disabled={pending}
                  autoFocus={!fullScreen}
                  onChange={setSplitRows}
                />
              ) : (
                <>
                  <Box sx={{ mt: "12px", p: "12px", borderRadius: `${POS_RADIUS.card}px`, bgcolor: c.card, border: `1px solid ${c.hairline}` }}><Stack direction="row" justifyContent="space-between" gap={2}>{method === "cash" ? <><Metric label="Получено" value={Number.isFinite(entered) ? entered / 100 : 0} /><Metric label="Сдача" value={change / 100} color={change > 0 ? c.positive : undefined} /></> : <Metric label={method === "card" ? "К оплате картой" : method === "cashless" ? "К оплате по QR" : "К оплате"} value={Number(due)} />}</Stack></Box>
                  {method === "cash" && <InputBase value={received} onChange={(event) => setReceived(event.target.value)} disabled={pending} autoFocus={!fullScreen} inputProps={{ inputMode: "decimal", "aria-label": "Полученная сумма" }} sx={{ mt: "10px", width: "100%", height: 48, minHeight: 48, px: "14px", bgcolor: c.card, border: `1px solid ${c.hairline}`, borderRadius: `${POS_RADIUS.control}px`, fontSize: 16, color: c.text, "& input": { textAlign: "right" }, "&.Mui-focused": { borderColor: c.accent } }} />}
                  {method === "cash" && amount > 0 && <Stack direction="row" gap="6px" sx={{ mt: "8px", overflowX: "auto" }}>{cashQuickAmounts(amount).map((quick) => <ButtonBase key={quick} onClick={() => setReceived((quick / 100).toFixed(2))} disabled={pending} sx={{ flex: "1 0 auto", minWidth: 64, minHeight: 44, px: "10px", borderRadius: `${POS_RADIUS.chip}px`, bgcolor: entered === quick ? c.accent : c.tile, color: entered === quick ? c.onAccent : c.textSoft, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}><PosAmount value={quick / 100} /></ButtonBase>)}</Stack>}
                  {(method === "card" || method === "cashless") && <TerminalPicker terminals={terminals} value={cashlessId} onChange={setCashlessId} disabled={pending} title={method === "card" ? "Терминал для оплаты картой" : "Чей QR-код"} />}
                </>
              )}
              <Stack gap="7px" sx={{ mt: { xs: "20px", md: "24px" } }}><Typography sx={{ fontSize: 10, fontWeight: 700, color: c.textDim }}>Отправить электронный чек клиенту</Typography><Stack direction={{ xs: "column", sm: "row" }} gap="6px"><InputBase value={receiptContact} onChange={(event) => setReceiptContact(event.target.value)} placeholder={receiptChannel === "email" ? "Введите email" : "Введите телефон"} disabled={pending} sx={{ flex: 1, minWidth: 0, height: 44, minHeight: 44, px: "12px", bgcolor: c.card, border: `1px solid ${c.hairline}`, borderRadius: `${POS_RADIUS.control}px`, fontSize: 12, color: c.text }} /><Stack direction="row" gap="6px"><ButtonBase onClick={() => setReceiptChannel("email")} sx={{ flex: { xs: 1, sm: "none" }, minHeight: 44, px: "13px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: receiptChannel === "email" ? c.accent : c.tile, color: receiptChannel === "email" ? c.onAccent : c.textSoft, fontSize: 11, fontWeight: 700 }}><MailOutlineOutlined sx={{ fontSize: 15, mr: "4px" }} />Почта</ButtonBase><ButtonBase onClick={() => setReceiptChannel("sms")} sx={{ flex: { xs: 1, sm: "none" }, minHeight: 44, px: "13px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: receiptChannel === "sms" ? c.accent : c.tile, color: receiptChannel === "sms" ? c.onAccent : c.textSoft, fontSize: 11, fontWeight: 700 }}><SmsOutlined sx={{ fontSize: 15, mr: "4px" }} />SMS</ButtonBase></Stack></Stack></Stack>
            </>
          )}
          {error && <Typography role="alert" sx={{ mt: "12px", color: c.danger, fontSize: 12 }}>{error}</Typography>}
          {/* The confirm button and its «why not» stay in view while the rows scroll. */}
          {!fullScreen && <Box sx={{ position: "sticky", bottom: "-22px", zIndex: 1, mt: "16px", mx: "-22px", mb: "-22px", px: "22px", py: "14px", bgcolor: c.page, borderTop: `1px solid ${c.hairline}` }}>{actionsRow}</Box>}
        </Box>
      </Box>
      {fullScreen && (
        <Box sx={{ flexShrink: 0, px: "16px", pt: "10px", pb: "max(12px, env(safe-area-inset-bottom))", bgcolor: c.card, borderTop: `1px solid ${c.outline}` }}>{actionsRow}</Box>
      )}
    </Dialog>
  );
}

/**
 * Выбор POS-терминала банка (Бакай, МБанк, Оптима…): деньги по карте и QR
 * приходят на разные счета, поэтому кассир видит, через какой терминал
 * пробил. Один терминал — просто подпись, выбирать нечего.
 */
function TerminalPicker({ terminals, value, onChange, disabled, title, compact = false }: {
  terminals: readonly CashlessOption[]; value: number | null; onChange: (id: number) => void;
  disabled: boolean; title: string; compact?: boolean;
}) {
  const c = posColors(useTheme());
  if (!terminals.length) return null;
  if (terminals.length === 1)
    return <Typography sx={{ mt: compact ? "6px" : "12px", fontSize: 12, color: c.textDim }}>{title}: <Box component="span" sx={{ color: c.text, fontWeight: 700 }}>{terminals[0].name}</Box></Typography>;
  return (
    <Box sx={{ mt: compact ? "8px" : "12px" }}>
      {!compact && <Typography sx={{ mb: "6px", fontSize: 12, fontWeight: 700, color: c.textSoft }}>{title}</Typography>}
      <Stack role="radiogroup" aria-label={title} direction="row" gap="6px" flexWrap="wrap">
        {terminals.map((item) => {
          const selected = value === item.id;
          return (
            <ButtonBase
              key={item.id}
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(item.id)}
              sx={{ flex: { xs: "1 0 auto", md: "0 0 auto" }, minWidth: "max-content", minHeight: 44, px: "12px", gap: "6px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: selected ? c.accentBg : c.card, border: `${selected ? 2 : 1}px solid ${selected ? c.accent : c.hairline}`, color: selected ? c.text : c.textSoft, fontSize: 13, fontWeight: selected ? 800 : 600, whiteSpace: "nowrap" }}
            >
              {selected ? <CheckCircleRounded sx={{ fontSize: 16, color: c.accent }} /> : null}
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</Box>
            </ButtonBase>
          );
        })}
      </Stack>
    </Box>
  );
}

/**
 * «Частями»: строка на каждый способ со своей суммой. Сверху крупно — к
 * оплате, внесено и сколько осталось (или сдача, если наличных больше).
 */
function SplitPanel({ due, rows, state, terminals, disabled, autoFocus, onChange }: {
  due: number; rows: SplitRow[]; state: ReturnType<typeof splitState>; terminals: readonly CashlessOption[];
  disabled: boolean; autoFocus: boolean; onChange: (rows: SplitRow[]) => void;
}) {
  const c = posColors(useTheme());
  const update = (kind: SplitKind, patch: Partial<SplitRow>) => onChange(rows.map((row) => (row.kind === kind ? { ...row, ...patch } : row)));
  const exact = state.ready && state.change === 0;
  // Card/QR over the sum: not «Осталось 0» in green, but how much is too much.
  const over = Math.max(0, state.noncash - due);
  const tail = over > 0
    ? { label: "Лишнее", value: over, color: c.danger }
    : state.change > 0
    ? { label: "Сдача", value: state.change, color: c.positive }
    : { label: "Осталось", value: state.remaining, color: state.remaining > 0 ? c.danger : c.positive };
  return (
    <Box sx={{ mt: "12px" }}>
      {/* Three equal columns while the sums fit; a long sum (1 250 000 с on a
          360px phone) wraps its metric onto the next line instead of running
          into the neighbour. */}
      <Box sx={{ p: "12px 14px", borderRadius: `${POS_RADIUS.card}px`, bgcolor: c.card, border: `1px solid ${state.ready ? c.positive : c.hairline}`, display: "flex", flexWrap: "wrap", gap: "8px 12px", "& > *": { flex: "1 1 0", minWidth: "max-content" } }}>
        <Metric label="К оплате" value={due / 100} />
        <Metric label="Внесено" value={state.entered / 100} />
        <Metric label={tail.label} value={tail.value / 100} color={tail.color} icon={exact ? <CheckCircleRounded sx={{ fontSize: 18 }} /> : null} />
      </Box>
      <Typography aria-live="polite" sx={{ mt: "8px", fontSize: 13, fontWeight: 700, color: state.ready ? c.positive : state.problemKind ? c.danger : c.textSoft }}>
        {state.ready ? (state.change > 0 ? `Сумма сошлась — сдача ${formatCents(state.change)} с наличных` : "Сумма сошлась — можно принимать оплату") : state.problem}
      </Typography>
      <Stack direction="row" gap="6px" flexWrap="wrap" sx={{ mt: "10px" }}>
        {rows.map((row) => <ButtonBase key={row.kind} disabled={disabled} onClick={() => onChange(payAllWith(due, rows, row.kind))} sx={{ flex: "1 1 0", minWidth: "max-content", minHeight: 44, px: "10px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: c.tile, border: `1px solid ${c.hairline}`, color: c.textSoft, fontSize: 12, fontWeight: 700 }}>{PAY_ALL_LABELS[row.kind]}</ButtonBase>)}
      </Stack>
      <Stack gap="8px" sx={{ mt: "10px" }}>
        {rows.map((row, index) => {
          const cents = parseAmountCents(row.amount);
          const flagged = state.problemKind === row.kind;
          const filled = Number.isFinite(cents) && cents > 0;
          return (
            <Box key={row.kind} sx={{ p: "10px 12px", borderRadius: `${POS_RADIUS.card}px`, bgcolor: filled ? c.accentBg : c.card, border: `1px solid ${flagged ? c.danger : filled ? c.accent : c.hairline}` }}>
              <Stack direction={{ xs: "column", md: "row" }} alignItems={{ xs: "stretch", md: "center" }} gap="8px">
                <Stack direction="row" alignItems="center" gap="8px" sx={{ width: { md: 112 }, flexShrink: 0, color: c.text }}>
                  {SPLIT_ICONS[row.kind]}
                  <Typography sx={{ fontSize: 15, fontWeight: 800 }}>{SPLIT_LABELS[row.kind]}</Typography>
                </Stack>
                <Stack direction="row" gap="8px" sx={{ flex: 1, minWidth: 0 }}>
                  <InputBase
                    value={row.amount}
                    onChange={(event) => update(row.kind, { amount: event.target.value })}
                    disabled={disabled}
                    placeholder="0"
                    autoFocus={autoFocus && index === 0}
                    endAdornment={<Box component="span" sx={{ pl: "6px", color: c.textDim, textDecoration: "underline" }}>с</Box>}
                    inputProps={{ inputMode: "decimal", "aria-label": `Сумма: ${SPLIT_LABELS[row.kind]}`, "aria-invalid": flagged || undefined }}
                    sx={{ flex: 1, minWidth: 0, height: 48, minHeight: 48, px: "12px", bgcolor: c.page, border: `1px solid ${flagged ? c.danger : c.hairline}`, borderRadius: `${POS_RADIUS.control}px`, fontSize: 18, fontWeight: 800, color: c.text, "& input": { textAlign: "right" }, "&.Mui-focused": { borderColor: c.accent } }}
                  />
                  <ButtonBase
                    disabled={disabled || state.remaining <= 0}
                    onClick={() => onChange(fillRemainder(due, rows, row.kind))}
                    sx={{ flexShrink: 0, minHeight: 48, px: "12px", borderRadius: `${POS_RADIUS.control}px`, border: `1px solid ${c.accent}`, color: c.accentText, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", "&.Mui-disabled": { opacity: .4, borderColor: c.hairline, color: c.textDim } }}
                  >
                    Остаток сюда
                  </ButtonBase>
                </Stack>
              </Stack>
              {row.kind !== "cash" && <TerminalPicker compact terminals={terminals} value={row.cashlessMethodId} onChange={(id) => update(row.kind, { cashlessMethodId: id })} disabled={disabled} title={row.kind === "card" ? "Терминал" : "QR банка"} />}
            </Box>
          );
        })}
      </Stack>
      {rows.some((row) => row.kind === "cash") && <Typography sx={{ mt: "8px", fontSize: 11, color: c.textDim }}>Сдача выдаётся только с наличных: картой и QR — не больше суммы к оплате.</Typography>}
    </Box>
  );
}

/** Вкладка «Сертификат»: активные сертификаты покупателя, выбор одного. */
function CertificatePicker({ options, due, disabled, moneyMethods, onPickMethod }: {
  options: CheckoutCertificateOptions; due: number; disabled: boolean;
  moneyMethods: readonly MoneyMethod[]; onPickMethod: (method: MoneyMethod) => void;
}) {
  const c = posColors(useTheme());
  const list = payableCertificates(options.list);
  const note = (icon: React.ReactNode, title: string, text: string, action?: React.ReactNode) => (
    <Stack alignItems="center" gap="8px" sx={{ mt: "12px", p: "20px 16px", textAlign: "center", borderRadius: `${POS_RADIUS.card}px`, bgcolor: c.card, border: `1px dashed ${c.hairline}` }}>
      <Box sx={{ width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: c.tile, color: c.textDim }}>{icon}</Box>
      <Typography sx={{ fontSize: 14, fontWeight: 800, color: c.text }}>{title}</Typography>
      <Typography sx={{ fontSize: 12, lineHeight: 1.4, color: c.textDim, maxWidth: 320 }}>{text}</Typography>
      {action}
    </Stack>
  );

  if (!options.hasGoods)
    return note(<CardGiftcardOutlined />, "Нечего оплачивать сертификатом", "Сертификатом оплачиваются только товары, а в чеке их нет. Купить сертификат сертификатом нельзя.");
  if (!options.clientName)
    return note(
      <PersonSearchOutlined />,
      "Выберите покупателя",
      "Сертификаты привязаны к клиенту — выберите покупателя чека, и здесь появятся его сертификаты.",
      <ButtonBase onClick={options.onPickClient} sx={{ mt: "4px", minHeight: 44, px: "18px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: c.accent, color: c.onAccent, fontSize: 13, fontWeight: 800 }}>Выбрать покупателя</ButtonBase>,
    );
  if (options.loading && !options.list)
    return <Stack alignItems="center" sx={{ mt: "24px" }}><CircularProgress size={22} /></Stack>;
  if (options.loadError)
    return <Typography role="alert" sx={{ mt: "12px", p: "10px", borderRadius: `${POS_RADIUS.tile}px`, bgcolor: c.dangerBg, color: c.danger, fontSize: 12 }}>{options.loadError}</Typography>;
  if (!list.length)
    return note(<CardGiftcardOutlined />, "Активных сертификатов нет", `У покупателя ${options.clientName} нет сертификатов, которыми можно оплатить сейчас.`);

  const rest = Math.round(due * 100) / 100;
  return (
    <Stack gap="8px" sx={{ mt: "12px" }}>
      <Typography sx={{ fontSize: 12, color: c.textDim }}>Сертификаты покупателя {options.clientName} — выберите один:</Typography>
      <Stack role="radiogroup" aria-label="Сертификаты покупателя" gap="6px">
        {list.map((item) => {
          const selected = item.code === options.applied;
          return (
            <ButtonBase
              key={item.id}
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => options.onApply(selected ? "" : item.code)}
              sx={{ minHeight: 60, px: "14px", py: "10px", gap: "12px", justifyContent: "flex-start", textAlign: "left", borderRadius: `${POS_RADIUS.card}px`, bgcolor: selected ? c.accentBg : c.card, border: `1px solid ${selected ? c.accent : c.hairline}`, "&:hover": { borderColor: c.accent } }}
            >
              <Box sx={{ width: 22, height: 22, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", border: `2px solid ${selected ? c.accent : c.hairline}`, color: c.accent }}>{selected ? <CheckCircleRounded sx={{ fontSize: 22 }} /> : null}</Box>
              <Stack gap="2px" sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, letterSpacing: ".1em", color: c.text }}>{item.code}</Typography>
                <Typography sx={{ fontSize: 12, lineHeight: 1.35, color: c.textDim }}>{certificateExpiryLabel(item.expiresAt)} · номинал <PosAmount value={Number(item.nominal)} /></Typography>
              </Stack>
              <Stack alignItems="flex-end" sx={{ flexShrink: 0 }}>
                <Typography sx={{ fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: c.textDim }}>Остаток</Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 900, color: c.certificate, whiteSpace: "nowrap" }}><PosAmount value={Number(item.balance)} /></Typography>
              </Stack>
            </ButtonBase>
          );
        })}
      </Stack>
      {options.applied && options.appliedAmount > 0 && (
        <Box sx={{ mt: "4px", p: "12px", borderRadius: `${POS_RADIUS.card}px`, bgcolor: c.card, border: `1px solid ${c.hairline}` }}>
          <Stack direction="row" justifyContent="space-between" gap={1}><Typography sx={{ fontSize: 13, color: c.textDim }}>Списывается с сертификата</Typography><Typography sx={{ fontSize: 13, fontWeight: 800, color: c.certificate, whiteSpace: "nowrap" }}><PosAmount value={options.appliedAmount} negative /></Typography></Stack>
          {rest > 0 ? (
            <>
              <Stack direction="row" justifyContent="space-between" gap={1} sx={{ mt: "4px" }}><Typography sx={{ fontSize: 13, fontWeight: 700 }}>Остаток к оплате</Typography><Typography sx={{ fontSize: 15, fontWeight: 900, whiteSpace: "nowrap" }}><PosAmount value={rest} /></Typography></Stack>
              <Typography sx={{ mt: "10px", mb: "6px", fontSize: 12, color: c.textDim }}>Чем доплатить остаток:</Typography>
              <Stack direction="row" gap="6px" flexWrap="wrap">{moneyMethods.map((value) => <ButtonBase key={value} onClick={() => onPickMethod(value)} sx={{ flex: "1 1 80px", minHeight: 44, px: "10px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: c.tile, border: `1px solid ${c.hairline}`, color: c.textSoft, fontSize: 12, fontWeight: 700 }}>{METHOD_LABELS[value]}</ButtonBase>)}</Stack>
            </>
          ) : (
            <Typography sx={{ mt: "6px", fontSize: 13, fontWeight: 700, color: c.positive }}>Сертификат покрывает товары полностью.</Typography>
          )}
        </Box>
      )}
    </Stack>
  );
}

function SummaryRow({ label, value, negative = false, tone }: { label: string; value: number; negative?: boolean; tone?: "discount" | "bonus" | "cashback" | "certificate" }) {
  const c = posColors(useTheme());
  const toneColor = tone === "discount" ? c.discount : tone === "bonus" ? c.bonus : tone === "cashback" ? c.cashback : tone === "certificate" ? c.certificate : c.text;
  return <Stack direction="row" justifyContent="space-between"><Typography sx={{ fontSize: 11, color: "text.secondary" }}>{label}</Typography><Typography sx={{ fontSize: 11, color: toneColor }}><PosAmount value={value} negative={negative} /></Typography></Stack>;
}
function Metric({ label, value, color, icon }: { label: string; value: number; color?: string; icon?: React.ReactNode }) {
  return (
    <Stack gap="2px" sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: { xs: 10, md: 10 }, fontWeight: 700, textTransform: "uppercase", color: "text.secondary", letterSpacing: ".06em" }}>{label}</Typography>
      <Stack direction="row" alignItems="center" gap="4px" sx={{ color, minWidth: 0 }}>
        {icon}
        <Typography sx={{ fontSize: { xs: 18, md: 24 }, fontWeight: 900, lineHeight: 1.1, whiteSpace: "nowrap", color: "inherit" }}><PosAmount value={value} /></Typography>
      </Stack>
    </Stack>
  );
}
function MethodButton({ active, disabled, onClick, label, icon }: { active: boolean; disabled: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) { const c = posColors(useTheme()); return <ButtonBase role="tab" aria-selected={active} onClick={onClick} disabled={disabled} sx={{ flex: { xs: "1 0 calc(33.333% - 5px)", md: "1 0 auto" }, minWidth: "max-content", minHeight: { xs: 48, md: 0 }, gap: "6px", px: "12px", "& svg": { flexShrink: 0 }, py: "11px", borderRadius: `${POS_RADIUS.control}px`, bgcolor: active ? c.accentBg : c.page, border: `1px solid ${active ? c.accent : c.hairline}`, color: active ? c.text : c.textSoft, fontSize: { xs: 13, md: 11 }, fontWeight: 700, whiteSpace: "nowrap" }}>{icon}{label}</ButtonBase>; }
