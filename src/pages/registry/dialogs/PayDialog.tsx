import React from "react";
import {
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../../../api/client";
import { djangoQueryKeys } from "../../../api/queryKeys";
import {
  getTermPayments,
  recordTermPayment,
  termDue,
  voidTermPayment,
  type TermPayment,
} from "../../../api/registry";
import { AppButton, CashlessMethodSelect, ReasonDialog } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { useCanChecker } from "../../../hooks/useCan";
import { useCashlessMethods } from "../../../hooks/useCashlessMethods";
import { useT } from "../../../i18n/VerticalProvider";
import type { EnrollmentTarget } from "../enrollmentTarget";
import { formatMoney } from "../registryTabs";

interface PayDialogProps {
  open: boolean;
  scope: ActiveScope;
  target: EnrollmentTarget;
  onClose: () => void;
  onDone: () => void;
}

const MONEY_RE = /^\d{0,10}(?:[.,]\d{0,2})?$/;

function toAmount(raw: string): string {
  return raw.trim().replace(",", ".") || "0";
}

/** Приём оплаты периода и журнал его платежей с аннулированием. */
export const PayDialog: React.FC<PayDialogProps> = ({ open, scope, target, onClose, onDone }) => {
  const { t } = useT("registry");
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { can } = useCanChecker();
  const term = target.currentTerm;
  const due = term ? termDue(term) : 0;
  const [cash, setCash] = React.useState("");
  const [card, setCard] = React.useState("");
  const [methodId, setMethodId] = React.useState<number | "">("");
  const [voiding, setVoiding] = React.useState<TermPayment | null>(null);
  const cashless = useCashlessMethods(open && Number(toAmount(card)) > 0, {
    organizationId: scope.organizationId,
    branchId: target.branchId,
  });

  React.useEffect(() => {
    if (!open) return;
    setCash(due > 0 ? String(due) : "");
    setCard("");
    setMethodId("");
  }, [open, due]);

  React.useEffect(() => {
    if (methodId === "" && cashless.defaultMethodId !== "") setMethodId(cashless.defaultMethodId);
  }, [cashless.defaultMethodId, methodId]);

  const paymentsKey = term ? djangoQueryKeys.programs.termPayments(target.enrollmentId, term.id, scope) : ["noop"];
  const payments = useQuery({
    queryKey: paymentsKey,
    queryFn: ({ signal }) => getTermPayments(scope, target.enrollmentId, term!.id, signal),
    enabled: open && term != null && scope.isReady && scope.orgReady,
  });

  const total = Number(toAmount(cash)) + Number(toAmount(card));
  const cardPart = Number(toAmount(card));
  const methodMissing = cardPart > 0 && cashless.isRequired && methodId === "";
  const overpaid = total > due + 0.001;

  const pay = useMutation({
    mutationFn: () => recordTermPayment(scope, target.enrollmentId, term!.id, {
      cashAmount: toAmount(cash),
      cardAmount: toAmount(card),
      cashlessMethodId: cardPart > 0 && methodId !== "" ? methodId : null,
    }),
    onSuccess: () => {
      enqueueSnackbar(t("pay.done"), { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: paymentsKey });
      onDone();
    },
  });

  const voidPayment = useMutation({
    mutationFn: ({ payment, reason }: { payment: TermPayment; reason: string }) =>
      voidTermPayment(scope, target.enrollmentId, payment.termId, payment.id, reason),
    onSuccess: () => {
      setVoiding(null);
      enqueueSnackbar(t("pay.voidDone"), { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: paymentsKey });
      onDone();
    },
  });

  const canSubmit = term != null && total > 0 && !overpaid && !methodMissing && !cashless.blocksSubmit;
  const moneyField = (value: string, set: (v: string) => void, label: string) => (
    <TextField
      size="small"
      label={label}
      value={value}
      onChange={(e) => {
        if (MONEY_RE.test(e.target.value)) set(e.target.value);
      }}
      inputProps={{ inputMode: "decimal" }}
      fullWidth
    />
  );

  return (
    <Dialog open={open} onClose={pay.isPending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t("pay.title")}
        <Typography variant="body2" color="text.secondary">
          {target.patientName} · {target.programName}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {!term ? (
          <Alert severity="info">{t("pay.noTerm")}</Alert>
        ) : (
          <Stack gap={1.5} sx={{ mt: 0.5 }}>
            <Stack gap={0.25}>
              <Typography variant="body2">
                {t("pay.term", {
                  from: dayjs(term.startsOn).format("DD.MM.YYYY"),
                  to: dayjs(term.endsOn).format("DD.MM.YYYY"),
                })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("pay.price", { amount: formatMoney(term.priceAmount) })} ·{" "}
                {t("pay.paid", { amount: formatMoney(term.paidAmount) })}
              </Typography>
            </Stack>
            {due <= 0 ? (
              <Alert severity="success">{t("pay.nothingDue")}</Alert>
            ) : (
              <>
                <Stack direction="row" gap={1}>
                  {moneyField(cash, setCash, t("pay.cash"))}
                  {moneyField(card, setCard, t("pay.card"))}
                </Stack>
                {cardPart > 0 && cashless.methods.length > 0 && (
                  <CashlessMethodSelect
                    methods={cashless.methods}
                    value={methodId}
                    onChange={setMethodId}
                    error={methodMissing}
                    loading={cashless.isLoading}
                    loadFailed={cashless.isError}
                    label={t("pay.cashlessMethod")}
                  />
                )}
                <Typography variant="body2" color={overpaid ? "error" : "text.secondary"}>
                  {overpaid ? t("wizard.payment.overpaid") : t("payment.due", { amount: formatMoney(due) })}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("wizard.payment.noZReport")}
                </Typography>
              </>
            )}
            {(pay.error || voidPayment.error) && (
              <Alert severity="error">{getErrorMessage(pay.error ?? voidPayment.error)}</Alert>
            )}
            {(payments.data?.length ?? 0) > 0 && (
              <>
                <Divider />
                <Typography variant="subtitle2">{t("pay.history")}</Typography>
                <Stack gap={0.75}>
                  {payments.data!.map((payment) => (
                    <Stack key={payment.id} direction="row" alignItems="center" gap={1}>
                      <Stack sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ textDecoration: payment.isVoided ? "line-through" : undefined }}
                        >
                          {dayjs(payment.paidOn).format("DD.MM.YYYY")} · {formatMoney(payment.amount)} сом
                          {payment.cashlessMethodName ? ` · ${payment.cashlessMethodName}` : ""}
                        </Typography>
                        {payment.isVoided && (
                          <Typography variant="caption" color="text.secondary">
                            {t("pay.voided", { reason: payment.voidReason })}
                          </Typography>
                        )}
                      </Stack>
                      {!payment.isVoided && can("finance.refund") && (
                        <Tooltip title={t("pay.void")}>
                          <IconButton size="small" onClick={() => setVoiding(payment)} aria-label={t("pay.void")}>
                            <BlockOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={pay.isPending}>
          {t("wizard.close")}
        </AppButton>
        {term && due > 0 && (
          <AppButton variant="contained" disabled={!canSubmit || pay.isPending} onClick={() => pay.mutate()}>
            {t("pay.submit")}
          </AppButton>
        )}
      </DialogActions>
      <ReasonDialog
        open={voiding != null}
        title={t("pay.void")}
        label={t("pay.voidReason")}
        confirmText={t("pay.void")}
        loading={voidPayment.isPending}
        onCancel={() => setVoiding(null)}
        onConfirm={(reason) => voiding && voidPayment.mutate({ payment: voiding, reason })}
      />
    </Dialog>
  );
};
