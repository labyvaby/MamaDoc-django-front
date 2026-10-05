import React from "react";
import { Box, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";

import { createDebt, payDebt, type Debt, type DebtDirection } from "../../api/treasury";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { isoDate } from "../realty-sales/catalogFormat";
import { positiveAmount } from "./format";
import { useProjectOptions, useRefreshTreasury, useTreasuryAccounts, useTreasuryMeta } from "./hooks";
import { AccountSelect, ConfirmDialog, FormDrawer, ProjectSelect, SubPill } from "./shared";

/** «Оплатить» кредиторку: расход с выбранного (или основного) счёта закрывает долг и строку календаря. */
export function PayDebtDialog({ debt, onClose }: { debt: Debt | null; onClose: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const accounts = (useTreasuryAccounts(debt != null).data ?? []).filter((a) => a.isActive && a.type !== "escrow");
  const [accountId, setAccountId] = React.useState<number | "">("");
  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const pay = useMutation({
    mutationFn: () => payDebt(debt?.id as number, { accountId: accountId === "" ? null : accountId, date: isoDate(date) }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("receivables.actions.paid"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    setAccountId("");
    setDate(dayjs());
    pay.reset();
  }, [debt]); // eslint-disable-line react-hooks/exhaustive-deps -- новая строка — новая форма
  return (
    <ConfirmDialog
      open={debt != null}
      title={t("receivables.actions.payTitle")}
      text={debt ? t("receivables.actions.payText", { counterparty: debt.counterparty, doc: debt.doc || debt.number, amount: formatKGS(debt.amount) }) : null}
      confirmLabel={t("receivables.actions.payConfirm")}
      busy={pay.isPending}
      error={pay.error}
      onConfirm={() => pay.mutate()}
      onClose={onClose}
    >
      <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} label={t("common.account")} emptyLabel={t("common.mainAccount")} />
      <CustomDatePicker label={t("common.date")} value={date} onChange={(v) => setDate(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
    </ConfirmDialog>
  );
}

export function NewDebtDrawer({ open, direction: initialDirection, onClose }: { open: boolean; direction: DebtDirection; onClose: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const meta = useTreasuryMeta(open).data;
  const projects = useProjectOptions(open);
  const [direction, setDirection] = React.useState<DebtDirection>(initialDirection);
  const [counterparty, setCounterparty] = React.useState("");
  const [type, setType] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [due, setDue] = React.useState<Dayjs | null>(null);
  const [issued, setIssued] = React.useState<Dayjs | null>(null);
  const [doc, setDoc] = React.useState("");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [retention, setRetention] = React.useState(false);
  const [disputed, setDisputed] = React.useState(false);
  const [planPayment, setPlanPayment] = React.useState(true);
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () =>
      createDebt(
        {
          direction,
          counterparty,
          type,
          amount: positiveAmount(amount) as string,
          due: isoDate(due) as string,
          issued: isoDate(issued),
          doc,
          projectId: projectId === "" ? null : projectId,
          retention,
          disputed,
          planPayment,
        },
        scope,
      ),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("receivables.form.created"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setDirection(initialDirection);
    setCounterparty("");
    setType("");
    setAmount("");
    setDue(null);
    setIssued(dayjs());
    setDoc("");
    setProjectId("");
    setRetention(false);
    setDisputed(false);
    setPlanPayment(true);
    setTouched(false);
    save.reset();
  }, [open, initialDirection]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  // Рассрочки покупателей — из биллинга, вручную их не заводят.
  const types = (meta?.debtTypes ?? []).filter((d) => d.id !== "installment");
  const invalid = { counterparty: !counterparty.trim(), type: !type, amount: positiveAmount(amount) == null, due: !isoDate(due) };
  const hasErrors = Object.values(invalid).some(Boolean);
  const helper = (bad: boolean, text = t("common.required")) => (touched && bad ? text : undefined);

  return (
    <FormDrawer
      open={open}
      title={t("receivables.form.title")}
      submitLabel={t("receivables.form.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!hasErrors) save.mutate();
      }}
    >
      <Box sx={{ display: "flex", gap: 0.5 }}>
        {(["receivable", "payable"] as const).map((key) => (
          <SubPill key={key} active={direction === key} onClick={() => setDirection(key)} label={t(`receivables.tabs.${key}`)} />
        ))}
      </Box>
      <TextField size="small" label={t("common.counterparty")} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} error={touched && invalid.counterparty} helperText={helper(invalid.counterparty)} />
      <TextField select size="small" label={t("receivables.form.type")} value={type} onChange={(e) => setType(e.target.value)} error={touched && invalid.type} helperText={helper(invalid.type)}>
        {types.map((d) => (
          <MenuItem key={d.id} value={d.id}>
            {d.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField size="small" label={t("common.amount")} value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} error={touched && invalid.amount} helperText={helper(invalid.amount, t("common.amountInvalid"))} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        <CustomDatePicker label={t("receivables.form.issued")} value={issued} onChange={(v) => setIssued(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
        <CustomDatePicker
          label={t("receivables.form.due")}
          value={due}
          onChange={(v) => setDue(v as Dayjs | null)}
          slotProps={{ textField: { size: "small", fullWidth: true, error: touched && invalid.due, helperText: helper(invalid.due) } }}
        />
      </Box>
      <TextField size="small" label={t("common.doc")} value={doc} onChange={(e) => setDoc(e.target.value)} />
      <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} label={t("common.project")} />
      <Box sx={{ display: "grid" }}>
        <FormControlLabel control={<Checkbox size="small" checked={retention} onChange={(e) => setRetention(e.target.checked)} />} label={t("receivables.form.retention")} />
        <FormControlLabel control={<Checkbox size="small" checked={disputed} onChange={(e) => setDisputed(e.target.checked)} />} label={t("receivables.form.disputed")} />
        {direction === "payable" && <FormControlLabel control={<Checkbox size="small" checked={planPayment} onChange={(e) => setPlanPayment(e.target.checked)} />} label={t("receivables.form.planPayment")} />}
      </Box>
    </FormDrawer>
  );
}
