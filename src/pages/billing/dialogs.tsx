import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";

import {
  PAYMENT_METHODS,
  REMINDER_CHANNELS,
  acceptBillingPayment,
  createBillingPayLink,
  remindBillingAccount,
  type BillingAccount,
  type PayLink,
  type PaymentKind,
  type PaymentMethod,
  type ReminderChannel,
} from "../../api/billing";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatDateRu, formatKGS } from "../../utility/format";

interface DialogProps {
  open: boolean;
  account: BillingAccount;
  onClose: () => void;
}

// Сообщение 400 бэк присылает по-русски («платёж больше остатка» и т. п.) — показываем как есть.
const errorText = (error: unknown) => (error instanceof Error ? error.message : "");

// ─── Принять платёж ────────────────────────────────────────────────────────

interface PaymentForm {
  kind: PaymentKind;
  amount: string;
  method: PaymentMethod;
  date: Dayjs | null;
  note: string;
}

/** Сумма по умолчанию: остаток первого взноса или следующий платёж графика. */
const defaultAmount = (account: BillingAccount, kind: PaymentKind) =>
  kind === "down_payment" ? account.downPaymentDue : (account.next?.balance ?? account.monthly);

export function PaymentDialog({ open, account, onClose, onDone }: DialogProps & { onDone: () => void }) {
  const { t } = useT("billing");
  const scope = useRealtyScope();
  const { enqueueSnackbar } = useSnackbar();
  const initialKind: PaymentKind = account.downPaymentDue > 0 ? "down_payment" : "installment";
  const { control, handleSubmit, reset, setValue, watch } = useForm<PaymentForm>({
    defaultValues: { kind: initialKind, amount: String(defaultAmount(account, initialKind) || ""), method: "cash", date: dayjs(), note: "" },
  });
  React.useEffect(() => {
    if (open) reset({ kind: initialKind, amount: String(defaultAmount(account, initialKind) || ""), method: "cash", date: dayjs(), note: "" });
  }, [open, account, initialKind, reset]);

  const accept = useMutation({
    mutationFn: (form: PaymentForm) =>
      acceptBillingPayment(
        account.id,
        { amount: Number(form.amount.replace(",", ".")), method: form.method, kind: form.kind, note: form.note.trim(), date: form.date ? form.date.format("YYYY-MM-DD") : null },
        scope,
      ),
    onSuccess: (_, form) => {
      enqueueSnackbar(t("payment.done", { sum: formatKGS(Number(form.amount.replace(",", "."))) }), { variant: "success" });
      onDone();
      onClose();
    },
  });

  const kind = watch("kind");

  return (
    <Dialog open={open} onClose={accept.isPending ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 480 } }}>
      <DialogTitle>
        {t("payment.title")}
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("payment.subtitle", { buyer: account.buyer, number: account.number })}</Typography>
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {account.downPaymentDue > 0 && (
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={field.value}
                onChange={(_, value: PaymentKind | null) => {
                  if (!value) return;
                  field.onChange(value);
                  setValue("amount", String(defaultAmount(account, value) || ""));
                }}
                aria-label={t("payment.kind")}
              >
                <ToggleButton value="down_payment">{t("payment.kindDownPayment")}</ToggleButton>
                <ToggleButton value="installment">{t("payment.kindInstallment")}</ToggleButton>
              </ToggleButtonGroup>
            )}
          />
        )}
        <Controller
          control={control}
          name="amount"
          rules={{ validate: (value) => Number(value.replace(",", ".")) > 0 || t("payment.amountRequired") }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label={t("payment.amount")}
              size="small"
              inputMode="decimal"
              autoFocus
              error={Boolean(fieldState.error)}
              helperText={
                fieldState.error?.message ??
                t("payment.amountHint", { sum: formatKGS(kind === "down_payment" ? account.downPaymentDue : account.outstanding) })
              }
            />
          )}
        />
        <Controller
          control={control}
          name="method"
          render={({ field }) => (
            <TextField {...field} select size="small" label={t("payment.method")}>
              {PAYMENT_METHODS.map((method) => (
                <MenuItem key={method} value={method}>
                  {t(`method.${method}`)}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <CustomDatePicker label={t("payment.date")} value={field.value} onChange={(value) => field.onChange(value)} disableFuture slotProps={{ textField: { size: "small" } }} />
          )}
        />
        <Controller control={control} name="note" render={({ field }) => <TextField {...field} size="small" label={t("payment.note")} multiline minRows={2} />} />
        {accept.isError && <Alert severity="error">{errorText(accept.error)}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={accept.isPending}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" disabled={accept.isPending} onClick={handleSubmit((form) => accept.mutate(form))}>
          {t("payment.submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Напомнить ─────────────────────────────────────────────────────────────

export function RemindDialog({ open, account, onClose, onDone }: DialogProps & { onDone: () => void }) {
  const { t } = useT("billing");
  const scope = useRealtyScope();
  const { enqueueSnackbar } = useSnackbar();
  const [channel, setChannel] = React.useState<ReminderChannel>("whatsapp");
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setChannel("whatsapp");
      setNote("");
    }
  }, [open]);

  const remind = useMutation({
    mutationFn: () => remindBillingAccount(account.id, channel, note.trim(), scope),
    onSuccess: () => {
      enqueueSnackbar(t("remind.done"), { variant: "success" });
      onDone();
      onClose();
    },
  });

  return (
    <Dialog open={open} onClose={remind.isPending ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 440 } }}>
      <DialogTitle>{t("remind.title")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <ToggleButtonGroup exclusive size="small" value={channel} onChange={(_, value: ReminderChannel | null) => value && setChannel(value)} aria-label={t("remind.channel")}>
          {REMINDER_CHANNELS.map((item) => (
            <ToggleButton key={item} value={item}>
              {t(`channel.${item}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField size="small" label={t("remind.note")} value={note} onChange={(event) => setNote(event.target.value)} multiline minRows={2} />
        {channel !== "call" && <Alert severity="info">{t("remind.warning")}</Alert>}
        {remind.isError && <Alert severity="error">{errorText(remind.error)}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={remind.isPending}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" disabled={remind.isPending} onClick={() => remind.mutate()}>
          {t("remind.submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Ссылка на оплату ──────────────────────────────────────────────────────

export function PayLinkDialog({ open, account, onClose }: DialogProps) {
  const { t } = useT("billing");
  const scope = useRealtyScope();
  const { enqueueSnackbar } = useSnackbar();
  const [link, setLink] = React.useState<PayLink | null>(null);
  React.useEffect(() => {
    if (open) setLink(null);
  }, [open]);

  const create = useMutation({
    mutationFn: (channel: "whatsapp" | "sms" | null) => createBillingPayLink(account.id, channel, scope),
    onSuccess: setLink,
  });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      enqueueSnackbar(t("payLink.copied"), { variant: "success" });
    } catch {
      // Буфер обмена недоступен (http, запрет браузера) — ссылка видна в поле, её можно выделить.
    }
  };

  return (
    <Dialog open={open} onClose={create.isPending ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 480 } }}>
      <DialogTitle>{t("payLink.title")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {link ? (
          <>
            <Typography sx={{ fontSize: "0.875rem" }}>{t("payLink.ready", { sum: formatKGS(link.amount), date: formatDateRu(link.expiresAt) })}</Typography>
            <TextField size="small" value={link.url} InputProps={{ readOnly: true }} onFocus={(event) => event.target.select()} />
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button variant="outlined" onClick={copy}>
                {t("payLink.copy")}
              </Button>
              <Button variant="outlined" component="a" href={link.url} target="_blank" rel="noopener noreferrer">
                {t("payLink.open")}
              </Button>
            </Box>
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{t("payLink.hint")}</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {(["whatsapp", "sms"] as const).map((channel) => (
                <Button key={channel} variant="contained" disabled={create.isPending} onClick={() => create.mutate(channel)}>
                  {t("payLink.send", { channel: t(`channel.${channel}`) })}
                </Button>
              ))}
              <Button variant="outlined" disabled={create.isPending} onClick={() => create.mutate(null)}>
                {t("payLink.copyOnly")}
              </Button>
            </Box>
          </>
        )}
        {create.isError && <Alert severity="error">{errorText(create.error)}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
