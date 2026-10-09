import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import dayjs from "dayjs";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import QrCode2Outlined from "@mui/icons-material/QrCode2Outlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import { useMutation } from "@tanstack/react-query";

import { repayClientDebt, type ClientDebt, type ClientDebtPaymentMethod } from "../../api/clients";
import type { DjangoCashlessMethod } from "../../api/cashlessMethods";
import { subtleBg } from "../../theme/uiHelpers";
import { parseAmountCents } from "../pos/splitPayment";
import { PosAmount } from "../pos/ui";
import {
  REPAY_METHODS,
  REPAY_METHOD_LABELS,
  centsToText,
  emptyRepayDraft,
  fillRest,
  repayBody,
  repayPlan,
  type RepayDraft,
  type RepayMode,
} from "./repayPlan";

const METHOD_ICONS: Record<ClientDebtPaymentMethod, React.ReactNode> = {
  cash: <PaymentsOutlined />,
  card: <CreditCardOutlined />,
  cashless: <QrCode2Outlined />,
};

const som = (cents: number) => `${(cents / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} с`;

/**
 * «Принять оплату долга»: сводка долга со шкалой «погашено / осталось»,
 * сумма с быстрыми кнопками, способ — один или частями (наличные + карта +
 * QR за раз), терминал банка, номер транзакции и комментарий. На телефоне —
 * во весь экран с кнопкой внизу.
 */
export default function RepayDebtDialog({ debt, clientId, organizationId, terminals, onClose, onDone }: {
  debt: ClientDebt | null;
  clientId: number;
  organizationId: number;
  terminals: DjangoCashlessMethod[];
  onClose: () => void;
  onDone: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const active = React.useMemo(() => terminals.filter((item) => item.isActive !== false), [terminals]);
  const defaultTerminal = active.find((item) => item.isDefault)?.id ?? active[0]?.id ?? null;
  const outstanding = Math.round(Number(debt?.outstanding ?? 0) * 100);
  const [draft, setDraft] = React.useState<RepayDraft>(() => emptyRepayDraft(outstanding, defaultTerminal));
  React.useEffect(() => {
    if (debt) setDraft(emptyRepayDraft(Math.round(Number(debt.outstanding) * 100), defaultTerminal));
    // Заново — только при открытии другого долга.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debt?.id]);

  const plan = repayPlan(outstanding, draft, { needTerminal: active.length > 0 });
  const mutation = useMutation({
    mutationFn: () => repayClientDebt(clientId, debt!.id, organizationId, repayBody(plan, draft)),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  const patch = (value: Partial<RepayDraft>) => setDraft((current) => ({ ...current, ...value }));
  const busy = mutation.isPending;
  const errorMessage = mutation.error instanceof Error ? mutation.error.message : mutation.isError ? "Не удалось принять оплату" : null;

  const amount = Math.round(Number(debt?.amount ?? 0) * 100);
  const closedBefore = amount - outstanding;
  const progress = amount > 0 ? (closedBefore / amount) * 100 : 0;
  const overdue = Boolean(debt?.overdue);
  const nonCashUsed = REPAY_METHODS.filter((method) => method !== "cash").some((method) =>
    draft.mode === "single" ? draft.method === method : parseAmountCents(draft.split[method]) > 0,
  );

  const quick = [
    { label: "Весь остаток", cents: outstanding },
    ...(outstanding >= 200 ? [{ label: "Половина", cents: Math.round(outstanding / 200) * 100 }] : []),
    ...[100000, 500000].filter((cents) => cents < outstanding).map((cents) => ({ label: som(cents), cents })),
  ];

  const resultTone = !plan.ready ? "error" : plan.rest === 0 ? "success" : "info";
  const resultColor = theme.palette[resultTone].main;
  const actions = (
    <Stack direction={{ xs: "column-reverse", md: "row" }} gap={1} sx={{ width: "100%" }}>
      <Button onClick={onClose} disabled={busy} color="inherit" sx={{ flex: { md: 1 }, minHeight: 48, borderRadius: "12px", bgcolor: (t) => subtleBg(t, true) }}>
        Отмена
      </Button>
      <Button
        variant="contained"
        onClick={() => mutation.mutate()}
        disabled={!plan.ready || busy}
        sx={{ flex: { md: 1.6 }, minHeight: 48, borderRadius: "12px", fontWeight: 800, fontSize: 15 }}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
      >
        {busy ? "Сохраняем…" : plan.ready ? `Принять ${som(plan.total)}` : plan.problem}
      </Button>
    </Stack>
  );

  return (
    <Dialog
      open={Boolean(debt)}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : "20px", backgroundImage: "none", display: "flex", flexDirection: "column" } }}
    >
      {debt && (
        <>
          <Stack direction="row" alignItems="flex-start" gap={1.5} sx={{ px: { xs: 2, md: 3 }, pt: { xs: "max(16px, env(safe-area-inset-top))", md: 2.5 }, pb: 1.5 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: "14px", display: "grid", placeItems: "center", flexShrink: 0, color: "primary.main", bgcolor: alpha(theme.palette.primary.main, 0.14) }}>
              <PaymentsOutlined />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.25 }}>Принять оплату долга</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                {debt.clientName ?? "Клиент"}
                {debt.receiptNumber ? ` · чек №${debt.receiptNumber}` : ""}
              </Typography>
            </Box>
            <IconButton onClick={onClose} disabled={busy} aria-label="Закрыть" sx={{ mt: -0.5, mr: -1, width: 44, height: 44 }}>
              <CloseRounded />
            </IconButton>
          </Stack>

          <Box sx={{ flex: 1, overflowY: "auto", px: { xs: 2, md: 3 }, pb: 2 }}>
            {/* Сводка долга: сколько было, сколько закрыто, сколько осталось. */}
            <Box sx={(t) => ({ p: 2, borderRadius: "16px", border: 1, borderColor: overdue ? alpha(t.palette.error.main, 0.5) : "divider", bgcolor: subtleBg(t) })}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-end" gap={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Осталось вернуть</Typography>
                  <Typography sx={{ fontSize: { xs: 28, md: 32 }, fontWeight: 900, lineHeight: 1.1, color: "error.main", whiteSpace: "nowrap" }}>
                    <PosAmount value={outstanding / 100} />
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="caption" color="text.secondary" display="block">из суммы долга</Typography>
                  <Typography fontWeight={700} sx={{ whiteSpace: "nowrap" }}><PosAmount value={amount / 100} /></Typography>
                </Box>
              </Stack>
              <LinearProgress variant="determinate" value={progress} sx={{ mt: 1.5, height: 8, borderRadius: 4, bgcolor: (t) => alpha(t.palette.error.main, 0.18), "& .MuiLinearProgress-bar": { bgcolor: "success.main", borderRadius: 4 } }} />
              <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Погашено <b><PosAmount value={closedBefore / 100} /></b>
                </Typography>
                <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: overdue ? "error.main" : "text.secondary" }}>
                  <EventOutlined sx={{ fontSize: 14 }} />
                  <Typography variant="caption" fontWeight={overdue ? 700 : 400}>
                    {debt.dueDate ? `${overdue ? "Просрочен, срок был" : "Вернуть до"} ${dayjs(debt.dueDate).format("DD.MM.YYYY")}` : "Без срока"}
                  </Typography>
                </Stack>
              </Stack>
            </Box>

            {/* Одним способом или частями. */}
            <Stack direction="row" role="tablist" aria-label="Как оплачивает" sx={(t) => ({ mt: 2, p: 0.5, borderRadius: "14px", bgcolor: subtleBg(t, true) })}>
              {([["single", "Одним способом"], ["split", "Частями"]] as Array<[RepayMode, string]>).map(([mode, label]) => {
                const selected = draft.mode === mode;
                return (
                  <ButtonBase
                    key={mode}
                    role="tab"
                    aria-selected={selected}
                    disabled={busy}
                    onClick={() => patch(mode === "split" && draft.mode === "single" ? { mode, split: { cash: "", card: "", cashless: "", [draft.method]: draft.amount } } : { mode })}
                    sx={{ flex: 1, minHeight: 44, borderRadius: "11px", fontWeight: 700, fontSize: 14, color: selected ? "text.primary" : "text.secondary", bgcolor: selected ? "background.paper" : "transparent", boxShadow: selected ? "0 1px 4px rgba(0,0,0,.25)" : "none", transition: "background-color .15s" }}
                  >
                    {label}
                  </ButtonBase>
                );
              })}
            </Stack>

            {draft.mode === "single" ? (
              <>
                <TextField
                  label="Сумма"
                  value={draft.amount}
                  onChange={(event) => patch({ amount: event.target.value })}
                  inputProps={{ inputMode: "decimal", "aria-label": "Сумма погашения", style: { fontSize: 22, fontWeight: 800 } }}
                  InputProps={{ endAdornment: <InputAdornment position="end">сом</InputAdornment> }}
                  autoFocus={!fullScreen}
                  fullWidth
                  sx={{ mt: 2, "& .MuiOutlinedInput-root": { borderRadius: "14px" } }}
                />
                <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
                  {quick.map((item) => {
                    const selected = parseAmountCents(draft.amount) === item.cents;
                    return (
                      <ButtonBase
                        key={item.label}
                        disabled={busy}
                        onClick={() => patch({ amount: centsToText(item.cents) })}
                        sx={(t) => ({ minHeight: 36, px: 1.5, borderRadius: "999px", fontSize: 13, fontWeight: 700, border: 1, borderColor: selected ? "primary.main" : "divider", color: selected ? "primary.main" : "text.secondary", bgcolor: selected ? alpha(t.palette.primary.main, 0.12) : "transparent" })}
                      >
                        {item.label}
                      </ButtonBase>
                    );
                  })}
                </Stack>

                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2, mb: 0.75 }}>Чем оплатил</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 }}>
                  {REPAY_METHODS.map((method) => (
                    <MethodTile key={method} method={method} selected={draft.method === method} disabled={busy} onClick={() => patch({ method })} />
                  ))}
                </Box>
                {draft.method !== "cash" && (
                  <TerminalChips
                    terminals={active}
                    value={draft.terminals[draft.method]}
                    title={draft.method === "card" ? "Терминал" : "QR банка"}
                    disabled={busy}
                    onChange={(id) => patch({ terminals: { ...draft.terminals, [draft.method]: id } })}
                  />
                )}
              </>
            ) : (
              <Stack gap={1} sx={{ mt: 2 }}>
                {REPAY_METHODS.map((method) => {
                  const cents = parseAmountCents(draft.split[method]);
                  const filled = Number.isFinite(cents) && cents > 0;
                  return (
                    <Box key={method} sx={(t) => ({ p: 1.25, borderRadius: "14px", border: 1, borderColor: filled ? "primary.main" : "divider", bgcolor: filled ? alpha(t.palette.primary.main, 0.08) : "transparent" })}>
                      {/* Телефон: способ и «Остаток» строкой, сумма — во всю ширину под ними. */}
                      <Box sx={{ display: "grid", alignItems: "center", gap: 1, gridTemplateColumns: { xs: "1fr auto", md: "120px minmax(0, 1fr) auto" }, gridTemplateAreas: { xs: '"label rest" "input input"', md: '"label input rest"' } }}>
                        <Stack direction="row" alignItems="center" gap={1} sx={{ gridArea: "label", minWidth: 0, color: filled ? "primary.main" : "text.secondary" }}>
                          {METHOD_ICONS[method]}
                          <Typography fontWeight={700} color="text.primary">{REPAY_METHOD_LABELS[method]}</Typography>
                        </Stack>
                        <TextField
                          size="small"
                          value={draft.split[method]}
                          placeholder="0"
                          onChange={(event) => patch({ split: { ...draft.split, [method]: event.target.value } })}
                          disabled={busy}
                          inputProps={{ inputMode: "decimal", "aria-label": `Сумма: ${REPAY_METHOD_LABELS[method]}`, style: { textAlign: "right", fontWeight: 800, fontSize: 16 } }}
                          InputProps={{ endAdornment: <InputAdornment position="end">с</InputAdornment> }}
                          sx={{ gridArea: "input", minWidth: 0, "& .MuiOutlinedInput-root": { borderRadius: "10px", minHeight: 44 } }}
                        />
                        <Button size="small" disabled={busy} onClick={() => setDraft((current) => fillRest(outstanding, current, method))} sx={{ gridArea: "rest", minHeight: { xs: 36, md: 44 }, borderRadius: "10px", whiteSpace: "nowrap", px: 1.5 }}>
                          Остаток сюда
                        </Button>
                      </Box>
                      {method !== "cash" && filled && (
                        <TerminalChips
                          compact
                          terminals={active}
                          value={draft.terminals[method]}
                          title={method === "card" ? "Терминал" : "QR банка"}
                          disabled={busy}
                          onChange={(id) => patch({ terminals: { ...draft.terminals, [method]: id } })}
                        />
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}

            {/* Итог: сколько вносит и что останется. */}
            <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 2, p: 1.5, borderRadius: "14px", bgcolor: alpha(resultColor, 0.1), border: `1px solid ${alpha(resultColor, 0.35)}` }} aria-live="polite">
              {plan.ready && plan.rest === 0 ? <CheckCircleRounded sx={{ color: resultColor }} /> : <ReceiptLongOutlined sx={{ color: resultColor }} />}
              <Typography fontWeight={700} sx={{ color: plan.ready ? "text.primary" : resultColor }}>
                {!plan.ready
                  ? plan.problem
                  : plan.rest === 0
                    ? `Вносит ${som(plan.total)} — долг будет закрыт полностью`
                    : `Вносит ${som(plan.total)} — останется ${som(plan.rest)}`}
              </Typography>
            </Stack>

            {nonCashUsed && (
              <TextField
                label="Номер транзакции (необязательно)"
                value={draft.reference}
                onChange={(event) => patch({ reference: event.target.value })}
                disabled={busy}
                fullWidth
                sx={{ mt: 2, "& .MuiOutlinedInput-root": { borderRadius: "14px" } }}
              />
            )}
            <TextField
              label="Комментарий"
              value={draft.comment}
              onChange={(event) => patch({ comment: event.target.value })}
              placeholder="«принесла часть», «перевёл муж»…"
              disabled={busy}
              fullWidth
              sx={{ mt: 2, "& .MuiOutlinedInput-root": { borderRadius: "14px" } }}
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              Деньги попадут в кассу и в открытую смену филиала. Каждый способ — отдельная строка в истории долга.
            </Typography>
            {errorMessage && <Alert severity="error" sx={{ mt: 2, borderRadius: "12px" }}>{errorMessage}</Alert>}
          </Box>

          <Box sx={{ px: { xs: 2, md: 3 }, pt: 1.5, pb: { xs: "max(16px, env(safe-area-inset-bottom))", md: 2.5 }, borderTop: 1, borderColor: "divider" }}>
            {actions}
          </Box>
        </>
      )}
    </Dialog>
  );
}

function MethodTile({ method, selected, disabled, onClick }: { method: ClientDebtPaymentMethod; selected: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <ButtonBase
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      sx={(t) => ({
        minHeight: 64,
        borderRadius: "14px",
        flexDirection: "column",
        gap: 0.5,
        border: selected ? 2 : 1,
        borderColor: selected ? "primary.main" : "divider",
        bgcolor: selected ? alpha(t.palette.primary.main, 0.12) : "transparent",
        color: selected ? "primary.main" : "text.secondary",
        fontWeight: 700,
        fontSize: 14,
        transition: "background-color .15s, border-color .15s",
      })}
    >
      {METHOD_ICONS[method]}
      <Box component="span" sx={{ color: selected ? "text.primary" : "inherit" }}>{REPAY_METHOD_LABELS[method]}</Box>
    </ButtonBase>
  );
}

/** Терминал банка: «POS Бакай», «POS МБанк». Один — просто подпись. */
function TerminalChips({ terminals, value, title, disabled, onChange, compact = false }: {
  terminals: DjangoCashlessMethod[];
  value: number | null;
  title: string;
  disabled: boolean;
  onChange: (id: number) => void;
  compact?: boolean;
}) {
  if (!terminals.length) return null;
  if (terminals.length === 1)
    return (
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: compact ? 0.75 : 1.25 }}>
        {title}: <b>{terminals[0].name}</b>
      </Typography>
    );
  return (
    <Box sx={{ mt: compact ? 1 : 1.5 }}>
      {!compact && <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>{title}</Typography>}
      <Stack direction="row" gap={0.75} flexWrap="wrap" role="radiogroup" aria-label={title}>
        {terminals.map((item) => {
          const selected = value === item.id;
          return (
            <ButtonBase
              key={item.id}
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(item.id)}
              sx={(t) => ({ minHeight: 40, px: 1.5, gap: 0.75, borderRadius: "10px", fontSize: 13, fontWeight: selected ? 800 : 600, border: selected ? 2 : 1, borderColor: selected ? "primary.main" : "divider", bgcolor: selected ? alpha(t.palette.primary.main, 0.12) : "transparent", color: selected ? "text.primary" : "text.secondary" })}
            >
              {selected ? <CheckCircleRounded sx={{ fontSize: 16, color: "primary.main" }} /> : null}
              {item.name}
            </ButtonBase>
          );
        })}
      </Stack>
    </Box>
  );
}
