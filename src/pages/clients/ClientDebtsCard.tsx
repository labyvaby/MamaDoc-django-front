import React from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import dayjs from "dayjs";
import HandshakeOutlined from "@mui/icons-material/HandshakeOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import QrCode2Outlined from "@mui/icons-material/QrCode2Outlined";
import KeyboardReturnOutlined from "@mui/icons-material/KeyboardReturnOutlined";
import DoNotDisturbOnOutlined from "@mui/icons-material/DoNotDisturbOnOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppCard, ListEmptyState, ListLoadingSkeleton, TonedChip } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import {
  cancelClientDebt,
  getClientDebts,
  type ClientDebt,
  type ClientDebtPayment,
} from "../../api/clients";
import { getCashlessMethods } from "../../api/cashlessMethods";
import { PosAmount } from "../pos/ui";
import { debtStatusMeta, debtsQueryKey, paymentRowLabel } from "./debtsMeta";
import RepayDebtDialog from "./RepayDebtDialog";

/**
 * «Долги» в карточке клиента: что взял в долг на кассе, сколько осталось, до
 * какого дня обещал — и хронология каждого долга: кто принял деньги, чем и
 * когда, что вернули товаром, что списали. Погашение принимают частями прямо
 * здесь: сумма, способ, терминал — деньги уходят в открытую смену кассы.
 */

type Props = {
  clientId: number | null;
  organizationId: number | null;
  /** Филиал сессии — чьи терминалы предлагать при оплате картой/QR. */
  branchId: number | null;
  canView: boolean;
  /** `pos.debt` или `clients.debts.manage` — принять погашение. */
  canRepay: boolean;
  /** `clients.debts.manage` — списать остаток. */
  canCancel: boolean;
};

const METHOD_ICONS: Record<string, React.ReactNode> = {
  cash: <PaymentsOutlined fontSize="inherit" />,
  card: <CreditCardOutlined fontSize="inherit" />,
  cashless: <QrCode2Outlined fontSize="inherit" />,
};

const dateLabel = (iso: string) => dayjs(iso).format("DD.MM.YYYY HH:mm");

export default function ClientDebtsCard({ clientId, organizationId, branchId, canView, canRepay, canCancel }: Props) {
  const queryClient = useQueryClient();
  const enabled = Boolean(clientId && organizationId && canView);
  const debts = useQuery({
    queryKey: debtsQueryKey(organizationId, clientId),
    queryFn: ({ signal }) => getClientDebts(clientId as number, organizationId as number, {}, signal),
    enabled,
  });
  const terminals = useQuery({
    queryKey: ["cashless-methods", organizationId, branchId, "debts"],
    queryFn: ({ signal }) => getCashlessMethods(signal, { organizationId: organizationId as number, branchId: branchId ?? undefined }),
    enabled: Boolean(organizationId && canRepay),
    staleTime: 5 * 60 * 1000,
  });
  const [repayTarget, setRepayTarget] = React.useState<ClientDebt | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<ClientDebt | null>(null);

  const invalidate = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["client-debts"] });
    void queryClient.invalidateQueries({ queryKey: ["clients", organizationId] });
    // Деньги легли в кассу и в открытую смену.
    void queryClient.invalidateQueries({ queryKey: ["django", "cashbox"] });
    void queryClient.invalidateQueries({ queryKey: ["django", "shifts"] });
  }, [queryClient, organizationId]);

  const rows = debts.data ?? [];
  const open = rows.filter((debt) => debt.status === "open");
  const outstanding = open.reduce((sum, debt) => sum + Number(debt.outstanding), 0);
  const overdue = open.filter((debt) => debt.overdue).length;

  let body: React.ReactNode;
  if (!canView) {
    body = <ListEmptyState icon={<LockOutlined />} title="Долги недоступны" description="У вашей роли нет права на просмотр долгов клиентов." />;
  } else if (!clientId) {
    body = <ListEmptyState icon={<HandshakeOutlined />} title="Клиент не выбран" description="Выберите клиента в списке" />;
  } else if (debts.isLoading) {
    body = <ListLoadingSkeleton rows={3} />;
  } else if (debts.isError) {
    body = <ListEmptyState icon={<ErrorOutlineOutlined />} title="Не удалось загрузить долги" description={debts.error instanceof Error ? debts.error.message : "Ошибка"} />;
  } else if (!rows.length) {
    body = <ListEmptyState icon={<HandshakeOutlined />} title="Долгов нет" description="Долг появляется, когда на кассе чек оформляют «в долг»." />;
  } else {
    body = (
      <Stack spacing={1} sx={{ p: 1.5 }}>
        {rows.map((debt) => (
          <DebtRow
            key={debt.id}
            debt={debt}
            canRepay={canRepay}
            canCancel={canCancel}
            onRepay={() => setRepayTarget(debt)}
            onCancel={() => setCancelTarget(debt)}
          />
        ))}
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
            <HandshakeOutlined color="primary" />
            <Typography variant="h6">Долги</Typography>
          </Stack>
          {canView && rows.length > 0 && (
            <Box sx={{ mt: 1.5, display: "grid", gap: 1, gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
              <Stat label="Остаток долга" value={<PosAmount value={outstanding} />} tone={outstanding > 0 ? "error" : undefined} />
              <Stat label="Открытых" value={String(open.length)} />
              <Stat label="Просрочено" value={String(overdue)} tone={overdue > 0 ? "error" : undefined} />
            </Box>
          )}
        </Box>
      }
    >
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: 1, borderColor: "divider" }}>{body}</Box>
      {clientId && organizationId && (
        <>
          <RepayDebtDialog
            debt={repayTarget}
            clientId={clientId}
            organizationId={organizationId}
            terminals={terminals.data ?? []}
            onClose={() => setRepayTarget(null)}
            onDone={invalidate}
          />
          <CancelDebtDialog
            debt={cancelTarget}
            clientId={clientId}
            organizationId={organizationId}
            onClose={() => setCancelTarget(null)}
            onDone={invalidate}
          />
        </>
      )}
    </AppCard>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "error" }) {
  return (
    <Box sx={(t) => ({ px: 1.25, py: 1, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: subtleBg(t), minWidth: 0 })}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>{label}</Typography>
      <Typography variant="subtitle1" fontWeight={700} noWrap color={tone === "error" ? "error.main" : "text.primary"} sx={{ lineHeight: 1.35 }}>{value}</Typography>
    </Box>
  );
}

function DebtRow({ debt, canRepay, canCancel, onRepay, onCancel }: {
  debt: ClientDebt; canRepay: boolean; canCancel: boolean; onRepay: () => void; onCancel: () => void;
}) {
  const [historyOpen, setHistoryOpen] = React.useState(debt.status === "open");
  const meta = debtStatusMeta(debt);
  const isOpen = debt.status === "open";
  const payments = debt.payments ?? [];
  const source = debt.receiptNumber ? `Чек №${debt.receiptNumber}` : debt.referenceType ? "Вручную" : "Долг";
  return (
    <Box sx={(t) => ({ p: 1.5, borderRadius: "12px", border: 1, borderColor: debt.overdue ? alpha(t.palette.error.main, 0.5) : "divider", bgcolor: subtleBg(t) })}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <TonedChip label={meta.label} toneName={meta.tone} />
            <Typography variant="body2" color="text.secondary" noWrap>
              {source}
              {debt.branchName ? ` · ${debt.branchName}` : ""}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            {`Взят ${dateLabel(debt.createdAt)}`}
            {debt.createdByName ? ` · ${debt.createdByName}` : ""}
            {debt.dueDate ? ` · вернуть до ${dayjs(debt.dueDate).format("DD.MM.YYYY")}` : " · без срока"}
          </Typography>
          {debt.comment && (
            <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{debt.comment}</Typography>
          )}
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary" display="block">{isOpen ? "Осталось" : "Сумма"}</Typography>
          <Typography variant="h6" fontWeight={800} color={isOpen ? "error.main" : "text.primary"} sx={{ lineHeight: 1.2, whiteSpace: "nowrap" }}>
            <PosAmount value={Number(isOpen ? debt.outstanding : debt.amount)} />
          </Typography>
          {isOpen && Number(debt.paidAmount) > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
              из <PosAmount value={Number(debt.amount)} />
            </Typography>
          )}
        </Box>
      </Stack>

      <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1 }} flexWrap="wrap">
        {isOpen && canRepay && (
          <Button size="small" variant="contained" startIcon={<PaymentsOutlined />} onClick={onRepay}>Принять оплату</Button>
        )}
        {isOpen && canCancel && (
          <Button size="small" color="inherit" startIcon={<DoNotDisturbOnOutlined />} onClick={onCancel} sx={{ color: "text.secondary" }}>Списать</Button>
        )}
        <Button
          size="small"
          color="inherit"
          onClick={() => setHistoryOpen((value) => !value)}
          endIcon={<ExpandMoreOutlined sx={{ transition: "transform .15s", transform: historyOpen ? "rotate(180deg)" : "none" }} />}
          sx={{ ml: "auto", color: "text.secondary" }}
          aria-expanded={historyOpen}
        >
          История{payments.length ? ` (${payments.length})` : ""}
        </Button>
      </Stack>

      <Collapse in={historyOpen} unmountOnExit>
        <Stack spacing={0.75} sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: "divider" }}>
          {payments.length === 0 && (
            <Typography variant="caption" color="text.secondary">Погашений пока не было.</Typography>
          )}
          {payments.map((row) => <HistoryRow key={row.id} row={row} />)}
        </Stack>
      </Collapse>
    </Box>
  );
}

function HistoryRow({ row }: { row: ClientDebtPayment }) {
  const isMoney = row.kind === "repayment";
  const icon = row.kind === "return"
    ? <KeyboardReturnOutlined fontSize="inherit" />
    : row.kind === "write_off"
      ? <DoNotDisturbOnOutlined fontSize="inherit" />
      : METHOD_ICONS[row.method] ?? <PaymentsOutlined fontSize="inherit" />;
  return (
    <Stack direction="row" alignItems="flex-start" gap={1}>
      <Box sx={(t) => ({ mt: "2px", width: 24, height: 24, borderRadius: "8px", display: "grid", placeItems: "center", fontSize: 15, flexShrink: 0, color: isMoney ? t.palette.success.main : "text.secondary", bgcolor: alpha(isMoney ? t.palette.success.main : t.palette.text.secondary, 0.12) })}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>{paymentRowLabel(row)}</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ overflowWrap: "anywhere" }}>
          {dateLabel(row.createdAt)}
          {row.createdByName ? ` · ${row.createdByName}` : ""}
          {row.branchName ? ` · ${row.branchName}` : ""}
          {row.reference ? ` · № ${row.reference}` : ""}
        </Typography>
        {row.comment && <Typography variant="caption" display="block" sx={{ overflowWrap: "anywhere" }}>{row.comment}</Typography>}
      </Box>
      <Typography variant="body2" fontWeight={700} color={isMoney ? "success.main" : "text.secondary"} sx={{ whiteSpace: "nowrap" }}>
        −<PosAmount value={Number(row.amount)} />
      </Typography>
    </Stack>
  );
}

/** Списать остаток долга — прощённые деньги, поэтому причина обязательна. */
function CancelDebtDialog({ debt, clientId, organizationId, onClose, onDone }: {
  debt: ClientDebt | null; clientId: number; organizationId: number; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { if (debt) setReason(""); }, [debt]);
  const mutation = useMutation({
    mutationFn: () => cancelClientDebt(clientId, debt!.id, organizationId, reason.trim()),
    onSuccess: () => { onDone(); onClose(); },
  });
  const errorMessage = mutation.error instanceof Error ? mutation.error.message : mutation.isError ? "Не удалось списать долг" : null;
  return (
    <Dialog open={Boolean(debt)} onClose={mutation.isPending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Списать долг</DialogTitle>
      <DialogContent>
        {debt && (
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Alert severity="warning" variant="outlined" sx={{ borderRadius: "10px" }}>
              Остаток <b><PosAmount value={Number(debt.outstanding)} /></b> будет прощён. Уже внесённые деньги остаются в кассе, запись о списании — в истории долга.
            </Alert>
            <TextField label="Причина" value={reason} onChange={(event) => setReason(event.target.value)} multiline minRows={2} autoFocus fullWidth />
            {errorMessage && <Alert severity="error" sx={{ borderRadius: "10px" }}>{errorMessage}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>Отмена</Button>
        <Button color="error" variant="contained" onClick={() => mutation.mutate()} disabled={!reason.trim() || mutation.isPending}>
          {mutation.isPending ? "Списываем…" : "Списать"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

