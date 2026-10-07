import React from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, IconButton, Link, MenuItem, Skeleton, TextField, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import {
  cancelCashOperation,
  createCashOperation,
  createTransfer,
  getCashOperation,
  getEscrowTerms,
  treasuryKeys,
  type CashOperation,
  type CashType,
  type TreasuryAccount,
} from "../../api/treasury";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { isoDate } from "../realty-sales/catalogFormat";
import { fullDate, pct, positiveAmount, signedSum } from "./format";
import { useAccountCurrency, useProjectOptions, useRefreshTreasury, useTreasuryAccounts, useTreasuryMeta } from "./hooks";
import { AccountSelect, ConfirmDialog, FormDrawer, InfoRow, ProjectSelect, SubPill } from "./shared";

const accountBalance = (a: TreasuryAccount) => (a.currency === "KGS" ? formatKGS(a.balance) : `${a.fx.toLocaleString("ru-RU")} ${a.currency}`);

export function NewOperationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const meta = useTreasuryMeta(open).data;
  const accounts = (useTreasuryAccounts(open).data ?? []).filter((a) => a.isActive);
  const projects = useProjectOptions(open);
  const [type, setType] = React.useState<CashType>("out");
  const [accountId, setAccountId] = React.useState<number | "">("");
  const [amount, setAmount] = React.useState("");
  const [article, setArticle] = React.useState("");
  const [counterparty, setCounterparty] = React.useState("");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [doc, setDoc] = React.useState("");
  const [note, setNote] = React.useState("");
  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const [touched, setTouched] = React.useState(false);

  const save = useMutation({
    mutationFn: () =>
      createCashOperation(
        { type, accountId: accountId as number, amount: positiveAmount(amount) as string, article, counterparty, projectId: projectId === "" ? null : projectId, doc, note, date: isoDate(date) },
        scope,
      ),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("cashbank.form.created"), { variant: "success" });
      onClose();
    },
  });

  React.useEffect(() => {
    if (!open) return;
    setType("out");
    setAccountId("");
    setAmount("");
    setArticle("");
    setCounterparty("");
    setProjectId("");
    setDoc("");
    setNote("");
    setDate(dayjs());
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  // Перевод между своими счетами — отдельной кнопкой (гайд §1): статью transfer не показываем.
  const articles = (meta?.articles ?? []).filter((a) => a.id !== "transfer" && a.group === (type === "in" ? "income" : "expense"));
  const invalid = { account: accountId === "", amount: positiveAmount(amount) == null, article: !article, counterparty: !counterparty.trim() };
  const hasErrors = Object.values(invalid).some(Boolean);

  return (
    <FormDrawer
      open={open}
      title={t("cashbank.form.operationTitle")}
      submitLabel={t("cashbank.form.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!hasErrors) save.mutate();
      }}
    >
      <Box sx={{ display: "flex", gap: 0.5 }}>
        {(["out", "in"] as const).map((key) => (
          <SubPill
            key={key}
            active={type === key}
            onClick={() => {
              setType(key);
              setArticle("");
            }}
            label={t(key === "in" ? "common.income" : "common.expense")}
          />
        ))}
      </Box>
      <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} label={t("common.account")} error={touched && invalid.account} helperText={touched && invalid.account ? t("common.required") : undefined} />
      <TextField
        size="small"
        label={t("common.amount")}
        value={amount}
        inputMode="decimal"
        onChange={(e) => setAmount(e.target.value)}
        error={touched && invalid.amount}
        helperText={touched && invalid.amount ? t("common.amountInvalid") : undefined}
      />
      <TextField
        select
        size="small"
        label={t("cashbank.form.article")}
        value={article}
        onChange={(e) => setArticle(e.target.value)}
        error={touched && invalid.article}
        helperText={touched && invalid.article ? t("common.required") : t("cashbank.form.articleHint")}
      >
        {articles.map((a) => (
          <MenuItem key={a.id} value={a.id}>
            {a.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        label={t("common.counterparty")}
        value={counterparty}
        onChange={(e) => setCounterparty(e.target.value)}
        error={touched && invalid.counterparty}
        helperText={touched && invalid.counterparty ? t("common.required") : undefined}
      />
      <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} label={t("common.project")} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        <TextField size="small" label={t("common.doc")} value={doc} onChange={(e) => setDoc(e.target.value)} />
        <CustomDatePicker label={t("common.date")} value={date} onChange={(v) => setDate(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
      </Box>
      <TextField size="small" label={t("common.note")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
    </FormDrawer>
  );
}

export function TransferDrawer({ open, fromId, onClose }: { open: boolean; fromId: number | null; onClose: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const accounts = (useTreasuryAccounts(open).data ?? []).filter((a) => a.isActive);
  const [from, setFrom] = React.useState<number | "">("");
  const [to, setTo] = React.useState<number | "">("");
  const [amount, setAmount] = React.useState("");
  const [toAmount, setToAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const [touched, setTouched] = React.useState(false);

  const fromAccount = accounts.find((a) => a.id === from);
  const toAccount = accounts.find((a) => a.id === to);
  const crossCurrency = Boolean(fromAccount && toAccount && fromAccount.currency !== toAccount.currency);

  const save = useMutation({
    mutationFn: () =>
      createTransfer(
        { from: from as number, to: to as number, amount: positiveAmount(amount) as string, toAmount: crossCurrency ? positiveAmount(toAmount) : null, note, date: isoDate(date) },
        scope,
      ),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("cashbank.form.transferred"), { variant: "success" });
      onClose();
    },
  });

  React.useEffect(() => {
    if (!open) return;
    setFrom(fromId ?? "");
    setTo("");
    setAmount("");
    setToAmount("");
    setNote("");
    setDate(dayjs());
    setTouched(false);
    save.reset();
  }, [open, fromId]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  const escrowIds = accounts.filter((a) => a.type === "escrow").map((a) => a.id);
  const invalid = {
    from: from === "" || escrowIds.includes(from),
    to: to === "" || to === from,
    amount: positiveAmount(amount) == null,
    toAmount: crossCurrency && positiveAmount(toAmount) == null,
  };
  const hasErrors = Object.values(invalid).some(Boolean);
  const fromHelper = from !== "" && escrowIds.includes(from) ? t("cashbank.form.escrowFromHint") : fromAccount ? t("cashbank.form.balance", { value: accountBalance(fromAccount) }) : touched && from === "" ? t("common.required") : undefined;

  return (
    <FormDrawer
      open={open}
      title={t("cashbank.form.transferTitle")}
      submitLabel={t("cashbank.form.transferCreate")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!hasErrors) save.mutate();
      }}
    >
      <AccountSelect accounts={accounts} value={from} onChange={setFrom} label={t("cashbank.form.from")} disabledIds={escrowIds} error={touched && invalid.from} helperText={fromHelper} />
      <AccountSelect
        accounts={accounts}
        value={to}
        onChange={setTo}
        label={t("cashbank.form.to")}
        disabledIds={from === "" ? [] : [from]}
        error={touched && invalid.to}
        helperText={touched && invalid.to ? (to !== "" && to === from ? t("cashbank.form.sameAccount") : t("common.required")) : toAccount ? t("cashbank.form.balance", { value: accountBalance(toAccount) }) : undefined}
      />
      <TextField
        size="small"
        label={fromAccount && fromAccount.currency !== "KGS" ? `${t("common.amount")}, ${fromAccount.currency}` : t("common.amount")}
        value={amount}
        inputMode="decimal"
        onChange={(e) => setAmount(e.target.value)}
        error={touched && invalid.amount}
        helperText={touched && invalid.amount ? t("common.amountInvalid") : undefined}
      />
      {crossCurrency && toAccount && (
        <TextField
          size="small"
          label={t("cashbank.form.toAmount", { currency: toAccount.currency })}
          value={toAmount}
          inputMode="decimal"
          onChange={(e) => setToAmount(e.target.value)}
          error={touched && invalid.toAmount}
          helperText={touched && invalid.toAmount ? t("common.amountInvalid") : t("cashbank.form.toAmountHint")}
        />
      )}
      <CustomDatePicker label={t("common.date")} value={date} onChange={(v) => setDate(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
      <TextField size="small" label={t("common.note")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
    </FormDrawer>
  );
}

/** Карточка операции (`?operation=`): реквизиты, документ ЭДО, отмена (сторно). */
export function OperationDrawer({ id, preview, canManage, onClose }: { id: number | null; preview: CashOperation | null; canManage: boolean; onClose: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const [confirm, setConfirm] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const query = useQuery({
    queryKey: treasuryKeys.operation(scope, id ?? 0),
    queryFn: ({ signal }) => getCashOperation(id as number, scope, signal),
    enabled: id != null && scope.orgReady !== false,
    staleTime: 30_000,
  });
  const op = query.data ?? (preview && preview.id === id ? preview : null);
  const currencyOf = useAccountCurrency(id != null);
  const cancel = useMutation({
    mutationFn: () => cancelCashOperation(id as number, reason, scope),
    onSuccess: () => {
      setConfirm(false);
      refresh();
      enqueueSnackbar(t("cashbank.operation.cancelled"), { variant: "success" });
    },
  });
  React.useEffect(() => {
    setConfirm(false);
    setReason("");
    cancel.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- новая операция — новая форма отмены

  return (
    <Drawer anchor="right" open={id != null} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 460 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "1.1rem" }}>
          {t("cashbank.operation.title", { number: op?.number ?? "" })}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
        {!op && query.isLoading && <Skeleton variant="rounded" height={260} />}
        {!op && query.error && <Alert severity="error">{query.error instanceof Error && query.error.message ? query.error.message : t("cashbank.operation.notFound")}</Alert>}
        {op && (
          <>
            <Typography sx={{ fontSize: "1.6rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: op.status === "cancelled" ? "text.disabled" : op.type === "in" ? "success.main" : "text.primary", textDecoration: op.status === "cancelled" ? "line-through" : "none" }}>
              {signedSum(op.type, op.amount, currencyOf(op.accountId))}
            </Typography>
            <Typography sx={{ mb: 2, fontSize: "0.875rem", color: "text.secondary" }}>{op.doc || op.articleName}</Typography>
            {op.isTransfer && <Alert severity="info" sx={{ mb: 2 }}>{t("cashbank.operation.transfer")}</Alert>}
            <InfoRow label={t("cashbank.operation.status")} value={t(`cashbank.operation.status_${op.status === "cancelled" ? "cancelled" : "done"}`)} tone={op.status === "cancelled" ? "error" : null} />
            <InfoRow label={t("common.date")} value={fullDate(op.date)} />
            <InfoRow label={t("common.counterparty")} value={op.counterparty || "—"} />
            <InfoRow label={t("cashbank.operation.article")} value={op.articleName || "—"} />
            <InfoRow label={t("common.project")} value={op.projectName ?? t("common.company")} />
            <InfoRow label={t("common.account")} value={op.accountName || "—"} />
            {op.doc && <InfoRow label={t("common.doc")} value={op.doc} />}
            {op.note && <InfoRow label={t("common.note")} value={op.note} />}
            {op.createdAt && <InfoRow label={t("cashbank.operation.createdAt")} value={dayjs(op.createdAt).format("DD.MM.YYYY HH:mm")} />}
            {op.status === "cancelled" && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {t("cashbank.operation.cancelledAt", { date: op.cancelledAt ? dayjs(op.cancelledAt).format("DD.MM.YYYY HH:mm") : "" })}
                {op.cancelReason ? ` · ${t("cashbank.operation.cancelReason", { reason: op.cancelReason })}` : ""}
              </Alert>
            )}
            {(op.documentId != null || op.billingAccountId != null) && (
              <Box sx={{ mt: 2, display: "grid", gap: 0.75 }}>
                {op.documentId != null && (
                  <Link component={RouterLink} to={`/edo?doc=${op.documentId}`} underline="hover" sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {t("common.openDocument")}: {op.documentNumber || op.documentTitle}
                    {op.documentTitle && op.documentNumber ? ` · ${op.documentTitle}` : ""}
                  </Link>
                )}
                {op.billingAccountId != null && (
                  <Link component={RouterLink} to={`/finance/billing?account=${op.billingAccountId}`} underline="hover" sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {t("common.openBilling")}
                  </Link>
                )}
              </Box>
            )}
          </>
        )}
      </Box>
      {op && canManage && op.status !== "cancelled" && (
        <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", borderTop: 1, borderColor: "divider" }}>
          <Button color="error" onClick={() => setConfirm(true)}>
            {t("cashbank.operation.cancel")}
          </Button>
        </Box>
      )}
      <ConfirmDialog
        open={confirm}
        title={t("cashbank.operation.cancelTitle", { number: op?.number ?? "" })}
        text={
          <>
            {t("cashbank.operation.cancelText")}
            {op?.isTransfer ? ` ${t("cashbank.operation.cancelTransfer")}` : ""}
          </>
        }
        confirmLabel={t("cashbank.operation.cancelConfirm")}
        busy={cancel.isPending}
        error={cancel.error}
        danger
        onConfirm={() => cancel.mutate()}
        onClose={() => setConfirm(false)}
      >
        <TextField size="small" label={t("cashbank.operation.cancelReasonLabel")} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </Drawer>
  );
}

export function EscrowDialog({ accountId, onClose }: { accountId: number | null; onClose: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const query = useQuery({
    queryKey: treasuryKeys.escrow(scope, accountId ?? 0),
    queryFn: ({ signal }) => getEscrowTerms(accountId as number, scope, signal),
    enabled: accountId != null && scope.orgReady !== false,
    staleTime: 60_000,
  });
  const e = query.data;
  return (
    <Dialog open={accountId != null} onClose={onClose} fullWidth PaperProps={{ sx: { maxWidth: 480 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {t("cashbank.escrow.title")}
        {e?.name ? ` · ${e.name}` : ""}
      </DialogTitle>
      <DialogContent>
        {query.isLoading && <Skeleton variant="rounded" height={200} />}
        {query.error && <Alert severity="error">{query.error instanceof Error ? query.error.message : t("common.loadError")}</Alert>}
        {e && (
          <>
            <InfoRow label={t("cashbank.escrow.balance")} value={formatKGS(e.balance)} />
            <InfoRow label={t("common.project")} value={e.projectName ?? "—"} />
            <InfoRow label={t("cashbank.escrow.contracts")} value={String(e.contractsCount)} />
            <InfoRow label={t("cashbank.escrow.condition")} value={e.releaseCondition || "—"} />
            <InfoRow label={t("cashbank.escrow.commissioning")} value={e.plannedCommissioningLabel || fullDate(e.plannedCommissioning)} />
            <InfoRow label={t("cashbank.escrow.rate")} value={pct(e.ratePct)} />
            <InfoRow label={t("cashbank.escrow.bank")} value={e.bank || "—"} />
            <InfoRow label={t("cashbank.escrow.number")} value={e.number || "—"} />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
