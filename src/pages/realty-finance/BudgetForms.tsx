import React from "react";
import { Alert, TextField, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { reviseBudget, treasuryKeys, updateBudget, updateBudgetLine, type BudgetLine, type BudgetLinePatch, type ProjectBudget } from "../../api/treasury";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { amountInput, nonNegativeAmount } from "./format";
import { useRefreshTreasury } from "./hooks";
import { FormDrawer } from "./shared";

/** Ответ правки — весь бюджет: кладём его в список `/budgets/` без перезапроса. */
function usePutBudget() {
  const queryClient = useQueryClient();
  const scope = useRealtyScope();
  return (fresh: ProjectBudget) => queryClient.setQueryData<ProjectBudget[]>(treasuryKeys.budgets(scope), (prev) => prev?.map((b) => (b.projectId === fresh.projectId ? fresh : b)));
}

const bad = (value: string) => value.trim() !== "" && nonNegativeAmount(value) == null;

/** ✎ строки: план, договоры, факт и основание. Шлём только изменённые поля. */
export function LineDrawer({ budget, line, onClose }: { budget: ProjectBudget | null; line: BudgetLine | null; onClose: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const put = usePutBudget();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const [plan, setPlan] = React.useState("");
  const [committed, setCommitted] = React.useState("");
  const [fact, setFact] = React.useState("");
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (!line) return;
    setPlan(amountInput(line.plan));
    setCommitted(amountInput(line.committed));
    setFact(amountInput(line.fact));
    setNote("");
    setTouched(false);
  }, [line]);
  const patch = (): BudgetLinePatch => {
    const body: BudgetLinePatch = {};
    if (!line) return body;
    const changed = (text: string, was: number) => (nonNegativeAmount(text || "0") ?? "") !== String(was);
    if (changed(plan, line.plan)) body.plan = nonNegativeAmount(plan || "0") as string;
    if (changed(committed, line.committed)) body.committed = nonNegativeAmount(committed || "0") as string;
    if (changed(fact, line.fact)) body.fact = nonNegativeAmount(fact || "0") as string;
    if (note.trim()) body.note = note.trim();
    return body;
  };
  const save = useMutation({
    mutationFn: () => updateBudgetLine(budget?.projectId as number, line?.article as string, patch(), scope),
    onSuccess: (fresh) => {
      put(fresh);
      refresh();
      enqueueSnackbar(t("budget.form.saved"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => save.reset(), [line]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  const invalid = bad(plan) || bad(committed) || bad(fact);
  const body = patch();
  const nothing = !("plan" in body || "committed" in body || "fact" in body);
  return (
    <FormDrawer
      open={line != null}
      title={line ? t("budget.form.lineTitle", { article: line.articleName }) : ""}
      submitLabel={t("common.save")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!invalid && !nothing) save.mutate();
      }}
    >
      <TextField size="small" label={t("budget.form.plan")} value={plan} inputMode="decimal" onChange={(e) => setPlan(e.target.value)} error={touched && bad(plan)} helperText={touched && bad(plan) ? t("budget.form.number") : undefined} />
      <TextField size="small" label={t("budget.form.committed")} value={committed} inputMode="decimal" onChange={(e) => setCommitted(e.target.value)} error={touched && bad(committed)} helperText={touched && bad(committed) ? t("budget.form.number") : undefined} />
      <TextField size="small" label={t("budget.form.fact")} value={fact} inputMode="decimal" onChange={(e) => setFact(e.target.value)} error={touched && bad(fact)} helperText={touched && bad(fact) ? t("budget.form.number") : t("budget.form.factHint")} />
      <TextField size="small" label={t("budget.form.note")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
      {touched && nothing && !invalid && <Alert severity="info">{t("budget.form.nothing")}</Alert>}
    </FormDrawer>
  );
}

/**
 * «Корректировка»: индекс удорожания (`/revise/`), плановая выручка и площадь
 * ЖК (`PATCH /budgets/<id>/`, площадь — для себестоимости м², гайд §4).
 */
export function ReviseDrawer({ budget, open, onClose }: { budget: ProjectBudget | null; open: boolean; onClose: () => void }) {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const put = usePutBudget();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const [index, setIndex] = React.useState("");
  const [revenue, setRevenue] = React.useState("");
  const [area, setArea] = React.useState("");
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (!open || !budget) return;
    setIndex("");
    setRevenue(amountInput(budget.revenuePlan));
    setArea(budget.economics.areaSource === "budget" ? amountInput(budget.economics.areaTotal) : "");
    setNote("");
    setTouched(false);
  }, [open, budget]);

  const indexValue = index.trim() ? Number(index.replace(",", ".")) : null;
  const indexBad = index.trim() !== "" && (indexValue == null || !Number.isFinite(indexValue));
  const revenueChanged = budget != null && revenue.trim() !== "" && nonNegativeAmount(revenue) !== String(budget.revenuePlan);
  const areaText = area.trim() ? nonNegativeAmount(area) : null;
  const areaChanged = budget != null && area.trim() !== "" && areaText != null && Number(areaText) !== (budget.economics.areaSource === "budget" ? budget.economics.areaTotal : -1);
  const invalid = indexBad || bad(revenue) || bad(area);
  const nothing = indexValue == null && !revenueChanged && !areaChanged;

  const save = useMutation({
    mutationFn: async () => {
      const id = budget?.projectId as number;
      let fresh: ProjectBudget | null = null;
      if (indexValue != null) {
        fresh = await reviseBudget(id, { index: indexValue, ...(revenueChanged ? { revenuePlan: nonNegativeAmount(revenue) as string } : {}), ...(note.trim() ? { note: note.trim() } : {}) }, scope);
      }
      const patch: { areaTotal?: number; revenuePlan?: string; note?: string } = {};
      if (areaChanged) patch.areaTotal = Number(areaText);
      if (revenueChanged && indexValue == null) patch.revenuePlan = nonNegativeAmount(revenue) as string;
      if (Object.keys(patch).length > 0) {
        if (note.trim() && indexValue == null) patch.note = note.trim();
        fresh = await updateBudget(id, patch, scope);
      }
      return fresh;
    },
    onSuccess: (fresh) => {
      if (fresh) put(fresh);
      refresh();
      enqueueSnackbar(t("budget.form.saved"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => save.reset(), [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии

  return (
    <FormDrawer
      open={open && budget != null}
      title={t("budget.form.reviseTitle", { project: budget?.projectName ?? "" })}
      submitLabel={t("common.save")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!invalid && !nothing) save.mutate();
      }}
    >
      <TextField
        size="small"
        label={t("budget.form.index")}
        value={index}
        inputMode="decimal"
        onChange={(e) => setIndex(e.target.value)}
        error={touched && indexBad}
        helperText={touched && indexBad ? t("budget.form.number") : t("budget.form.indexHint")}
      />
      <TextField size="small" label={t("budget.form.revenuePlan")} value={revenue} inputMode="decimal" onChange={(e) => setRevenue(e.target.value)} error={touched && bad(revenue)} helperText={touched && bad(revenue) ? t("budget.form.number") : undefined} />
      <TextField
        size="small"
        label={t("budget.form.areaTotal")}
        value={area}
        inputMode="decimal"
        onChange={(e) => setArea(e.target.value)}
        error={touched && bad(area)}
        helperText={
          touched && bad(area)
            ? t("budget.form.number")
            : budget && budget.economics.areaSource !== "budget"
              ? t("budget.form.areaHint", { area: budget.economics.areaTotal.toLocaleString("ru-RU") })
              : undefined
        }
      />
      <TextField size="small" label={t("budget.form.note")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
      {touched && nothing && !invalid && (
        <Alert severity="info">
          <Typography sx={{ fontSize: "0.875rem" }}>{t("budget.form.nothing")}</Typography>
        </Alert>
      )}
    </FormDrawer>
  );
}
