import React from "react";
import { Alert, Box, Button, Drawer, IconButton, Link, MenuItem, Skeleton, TextField, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import {
  calendarAction,
  cancelPlannedPayment,
  createPlannedPayment,
  deletePlannedPayment,
  getPlannedPayment,
  movePlannedPayment,
  requestTranche,
  settlePlannedPayment,
  treasuryKeys,
  type CalendarItem,
  type CashType,
} from "../../api/treasury";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { isoDate } from "../realty-sales/catalogFormat";
import { fullDate, positiveAmount, signedSum } from "./format";
import { useProjectOptions, useRefreshTreasury, useTreasuryAccounts, useTreasuryMeta } from "./hooks";
import { AccountSelect, ConfirmDialog, FormDrawer, InfoRow, ProjectSelect, SubPill } from "./shared";

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** «Оплатить» / «Получено»: счёт (пусто — основной расчётный) и дата. */
export function SettleDialog({ item, onClose, onDone }: { item: Pick<CalendarItem, "id" | "type" | "title" | "amount" | "counterparty"> | null; onClose: () => void; onDone?: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const accounts = (useTreasuryAccounts(item != null).data ?? []).filter((a) => a.isActive && a.type !== "escrow");
  const [accountId, setAccountId] = React.useState<number | "">("");
  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const incoming = item?.type === "in";
  const settle = useMutation({
    mutationFn: () => settlePlannedPayment(item as CalendarItem, { accountId: accountId === "" ? null : accountId, date: isoDate(date) }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t(incoming ? "paycal.planned.received" : "paycal.planned.paid"), { variant: "success" });
      onClose();
      onDone?.();
    },
  });
  React.useEffect(() => {
    setAccountId("");
    setDate(dayjs());
    settle.reset();
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps -- новая строка — новая форма
  return (
    <ConfirmDialog
      open={item != null}
      title={t(incoming ? "paycal.planned.receiveTitle" : "paycal.planned.payTitle")}
      text={item ? `${item.title}${item.counterparty ? ` · ${item.counterparty}` : ""} · ${signedSum(item.type, item.amount)}` : null}
      confirmLabel={t(incoming ? "paycal.planned.receiveConfirm" : "paycal.planned.payConfirm")}
      busy={settle.isPending}
      error={settle.error}
      onConfirm={() => settle.mutate()}
      onClose={onClose}
    >
      <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} label={t("common.account")} emptyLabel={t("common.mainAccount")} />
      <CustomDatePicker label={t("common.date")} value={date} onChange={(v) => setDate(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
    </ConfirmDialog>
  );
}

/** Карточка планового платежа (`?payment=`): оплатить / получить, перенести, отменить, удалить. */
export function PlannedDrawer({ id, preview, canManage, onClose }: { id: number | null; preview: CalendarItem | null; canManage: boolean; onClose: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const [settling, setSettling] = React.useState<CalendarItem | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const query = useQuery({
    queryKey: treasuryKeys.planned(scope, id ?? 0),
    queryFn: ({ signal }) => getPlannedPayment(id as number, scope, signal),
    enabled: id != null && scope.orgReady !== false,
    staleTime: 15_000,
  });
  const item = query.data ?? (preview && preview.id === id ? preview : null);
  const onError = (error: unknown) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" });
  const move = useMutation({
    mutationFn: () => movePlannedPayment(id as number, { days: 7 }, scope),
    onSuccess: (moved) => {
      refresh();
      enqueueSnackbar(t("paycal.planned.movedTo", { date: fullDate(moved.date) }), { variant: "success" });
    },
    onError,
  });
  const cancel = useMutation({
    mutationFn: () => cancelPlannedPayment(id as number, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("paycal.planned.cancelled"), { variant: "success" });
      onClose();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => deletePlannedPayment(id as number, scope),
    onSuccess: () => {
      setConfirmDelete(false);
      refresh();
      enqueueSnackbar(t("paycal.planned.deleted"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    setConfirmDelete(false);
    remove.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- новый платёж — новое подтверждение

  const action = item ? calendarAction(item) : null;
  const open = item != null && item.status !== "cancelled" && !item.done;
  const busy = move.isPending || cancel.isPending || remove.isPending;

  return (
    <Drawer anchor="right" open={id != null} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 460 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "1.1rem" }}>
          {t("paycal.planned.title")}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
        {!item && query.isLoading && <Skeleton variant="rounded" height={260} />}
        {!item && query.error && <Alert severity="error">{message(query.error, t("paycal.planned.notFound"))}</Alert>}
        {item && (
          <>
            <Typography sx={{ fontSize: "1.6rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: item.type === "in" ? "success.main" : "text.primary" }}>{signedSum(item.type, item.amount)}</Typography>
            <Typography sx={{ mb: 2, fontSize: "0.875rem", color: "text.secondary" }}>{item.title}</Typography>
            <InfoRow label={t("paycal.planned.status")} value={t(`paycal.planned.status_${item.done ? "done" : item.status || "planned"}`, { defaultValue: item.status })} tone={item.status === "cancelled" ? "error" : item.done ? "success" : null} />
            <InfoRow label={t("common.date")} value={fullDate(item.date)} />
            {item.moved && item.originalDate && <InfoRow label={t("paycal.planned.originalDate")} value={fullDate(item.originalDate)} />}
            <InfoRow label={t("common.counterparty")} value={item.counterparty || "—"} />
            <InfoRow label={t("paycal.planned.category")} value={item.categoryName || "—"} />
            <InfoRow label={t("paycal.planned.source")} value={item.sourceLabel || "—"} />
            <InfoRow label={t("common.project")} value={item.projectName ?? t("common.company")} />
            {item.doc && <InfoRow label={t("common.doc")} value={item.doc} />}
            {item.note && <InfoRow label={t("common.note")} value={item.note} />}
            {item.documentId != null && (
              <Link component={RouterLink} to={`/edo?doc=${item.documentId}`} underline="hover" sx={{ mt: 2, display: "inline-block", fontSize: "0.875rem", fontWeight: 600 }}>
                {t("common.openDocument")}
                {item.doc ? `: ${item.doc}` : ""}
              </Link>
            )}
          </>
        )}
      </Box>
      {item && canManage && open && action !== "billing" && (
        <Box sx={{ px: 2.5, py: 1.5, display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
          <Button color="error" onClick={() => setConfirmDelete(true)} disabled={busy} sx={{ mr: "auto" }}>
            {t("paycal.planned.delete")}
          </Button>
          <Button onClick={() => cancel.mutate()} disabled={busy}>
            {t("paycal.planned.cancelPayment")}
          </Button>
          <Button onClick={() => move.mutate()} disabled={busy}>
            {t("paycal.planned.moveWeek")}
          </Button>
          {(action === "pay" || action === "receive") && (
            <Button variant="contained" onClick={() => setSettling(item)} disabled={busy}>
              {t(action === "receive" ? "paycal.table.receive" : "paycal.table.pay")}
            </Button>
          )}
        </Box>
      )}
      <SettleDialog item={settling} onClose={() => setSettling(null)} onDone={onClose} />
      <ConfirmDialog
        open={confirmDelete}
        title={t("paycal.planned.deleteTitle")}
        text={t("paycal.planned.deleteText", { title: item?.title ?? "" })}
        confirmLabel={t("paycal.planned.delete")}
        busy={remove.isPending}
        error={remove.error}
        danger
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </Drawer>
  );
}

export function NewPlannedDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const meta = useTreasuryMeta(open).data;
  const projects = useProjectOptions(open);
  const [type, setType] = React.useState<CashType>("out");
  const [date, setDate] = React.useState<Dayjs | null>(null);
  const [title, setTitle] = React.useState("");
  const [counterparty, setCounterparty] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [doc, setDoc] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () =>
      createPlannedPayment(
        { type, date: isoDate(date) as string, title, counterparty, amount: positiveAmount(amount) as string, category, projectId: projectId === "" ? null : projectId, doc },
        scope,
      ),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("paycal.form.created"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setType("out");
    setDate(dayjs().add(1, "day"));
    setTitle("");
    setCounterparty("");
    setAmount("");
    setCategory("");
    setProjectId("");
    setDoc("");
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  const categories = (meta?.articles ?? []).filter((a) => a.id !== "transfer" && a.group === (type === "in" ? "income" : "expense"));
  const invalid = { date: !isoDate(date), title: !title.trim(), counterparty: !counterparty.trim(), amount: positiveAmount(amount) == null, category: !category };
  const hasErrors = Object.values(invalid).some(Boolean);
  const helper = (bad: boolean, text = t("common.required")) => (touched && bad ? text : undefined);

  return (
    <FormDrawer
      open={open}
      title={t("paycal.form.title")}
      submitLabel={t("paycal.form.create")}
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
              setCategory("");
            }}
            label={t(key === "in" ? "common.income" : "common.expense")}
          />
        ))}
      </Box>
      <TextField size="small" label={t("paycal.form.paymentTitle")} value={title} onChange={(e) => setTitle(e.target.value)} error={touched && invalid.title} helperText={helper(invalid.title)} />
      <TextField size="small" label={t("common.counterparty")} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} error={touched && invalid.counterparty} helperText={helper(invalid.counterparty)} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        <TextField size="small" label={t("common.amount")} value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} error={touched && invalid.amount} helperText={helper(invalid.amount, t("common.amountInvalid"))} />
        <CustomDatePicker
          label={t("common.date")}
          value={date}
          onChange={(v) => setDate(v as Dayjs | null)}
          slotProps={{ textField: { size: "small", fullWidth: true, error: touched && invalid.date, helperText: helper(invalid.date) } }}
        />
      </Box>
      <TextField select size="small" label={t("paycal.form.category")} value={category} onChange={(e) => setCategory(e.target.value)} error={touched && invalid.category} helperText={helper(invalid.category)}>
        {categories.map((a) => (
          <MenuItem key={a.id} value={a.id}>
            {a.name}
          </MenuItem>
        ))}
      </TextField>
      <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} label={t("common.project")} />
      <TextField size="small" label={t("common.doc")} value={doc} onChange={(e) => setDoc(e.target.value)} />
    </FormDrawer>
  );
}

/** «Запросить транш»: письмо в банк не уходит — только плановое поступление (гайд §3). */
export function TrancheDrawer({ open, suggestedAmount, onClose }: { open: boolean; suggestedAmount: number; onClose: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const projects = useProjectOptions(open);
  const [amount, setAmount] = React.useState("");
  const [counterparty, setCounterparty] = React.useState("");
  const [date, setDate] = React.useState<Dayjs | null>(null);
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [title, setTitle] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => requestTranche({ amount: positiveAmount(amount) as string, counterparty, date: isoDate(date), projectId: projectId === "" ? null : projectId, title }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("paycal.form.trancheCreated"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setAmount(suggestedAmount > 0 ? String(Math.ceil(suggestedAmount)) : "");
    setCounterparty("");
    setDate(null);
    setProjectId("");
    setTitle("");
    setTouched(false);
    save.reset();
  }, [open, suggestedAmount]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const invalid = { amount: positiveAmount(amount) == null, counterparty: !counterparty.trim() };
  return (
    <FormDrawer
      open={open}
      title={t("paycal.form.trancheTitle")}
      submitLabel={t("paycal.form.trancheCreate")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!invalid.amount && !invalid.counterparty) save.mutate();
      }}
    >
      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("paycal.form.trancheHint")}</Typography>
      <TextField size="small" label={t("common.amount")} value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} error={touched && invalid.amount} helperText={touched && invalid.amount ? t("common.amountInvalid") : undefined} />
      <TextField size="small" label={t("paycal.form.bank")} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} error={touched && invalid.counterparty} helperText={touched && invalid.counterparty ? t("common.required") : undefined} />
      <CustomDatePicker label={t("paycal.form.trancheDate")} value={date} onChange={(v) => setDate(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true, helperText: t("paycal.form.trancheDateHint") } }} />
      <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} label={t("common.project")} />
      <TextField size="small" label={t("paycal.form.paymentTitle")} value={title} onChange={(e) => setTitle(e.target.value)} />
    </FormDrawer>
  );
}
