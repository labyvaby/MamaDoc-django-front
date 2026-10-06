import React from "react";
import { Alert, Box, Button, Drawer, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";

import { schemeErrors, setPlans, updateBonusScheme, updatePlanRow, type BonusScheme, type MotivationRow, type MotivationSummary } from "../../api/salaryMotivation";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { parseAmount } from "./catalogFormat";

function Shell({
  open,
  title,
  busy,
  error,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const { t } = useT("realtySales");
  const id = React.useId();
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "1.1rem" }}>
          {title}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose} disabled={busy}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box
        component="form"
        id={id}
        noValidate
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}
        sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, alignContent: "start" }}
      >
        {children}
        {Boolean(error) && <Alert severity="error">{error instanceof Error && error.message ? error.message : t("common.failed")}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form={id} variant="contained" disabled={busy}>
          {t("motivation.form.save")}
        </Button>
      </Box>
    </Drawer>
  );
}

const bad = (value: string, required = true) => (value.trim() ? parseAmount(value) == null : required);

interface TierDraft {
  from: string;
  pct: string;
}

export function SchemeDrawer({ scheme, onClose, onSaved }: { scheme: BonusScheme | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const [tiers, setTiers] = React.useState<TierDraft[]>([]);
  const [teamBonus, setTeamBonus] = React.useState("");
  const [threshold, setThreshold] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (!scheme) return;
    setTiers(scheme.tiers.map((tier) => ({ from: String(tier.from), pct: String(tier.pct) })));
    setTeamBonus(String(scheme.teamBonus));
    setThreshold(String(scheme.teamThreshold));
    setTouched(false);
  }, [scheme]);
  const draft: BonusScheme = {
    tiers: tiers.map((tier) => ({ from: parseAmount(tier.from) ?? 0, pct: parseAmount(tier.pct) ?? 0 })),
    teamBonus: parseAmount(teamBonus) ?? 0,
    teamThreshold: parseAmount(threshold) ?? 0,
  };
  const fieldErrors = tiers.some((tier) => bad(tier.from) || bad(tier.pct)) || bad(teamBonus) || bad(threshold);
  const errors = schemeErrors(draft);
  const save = useMutation({ mutationFn: () => updateBonusScheme(draft, scope), onSuccess: onSaved });
  React.useEffect(() => save.reset(), [scheme]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  return (
    <Shell
      open={scheme != null}
      title={t("motivation.form.schemeTitle")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!fieldErrors && errors.length === 0) save.mutate();
      }}
    >
      {tiers.map((tier, i) => (
        <Box key={i} sx={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 1, alignItems: "start" }}>
          <TextField
            size="small"
            label={t("motivation.form.tierFrom")}
            value={tier.from}
            inputMode="decimal"
            error={touched && bad(tier.from)}
            onChange={(e) => setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
          />
          <TextField
            size="small"
            label={t("motivation.form.tierPct")}
            value={tier.pct}
            inputMode="decimal"
            error={touched && bad(tier.pct)}
            onChange={(e) => setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))}
          />
          <Tooltip title={t("motivation.form.removeTier")}>
            <IconButton aria-label={t("motivation.form.removeTier")} onClick={() => setTiers((prev) => prev.filter((_, j) => j !== i))} sx={{ color: "error.main" }}>
              <DeleteOutlineOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
      <Box>
        <Button size="small" startIcon={<AddOutlined />} onClick={() => setTiers((prev) => [...prev, { from: "", pct: "" }])}>
          {t("motivation.form.addTier")}
        </Button>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <TextField size="small" label={t("motivation.form.teamBonus")} value={teamBonus} inputMode="decimal" error={touched && bad(teamBonus)} onChange={(e) => setTeamBonus(e.target.value)} />
        <TextField size="small" label={t("motivation.form.teamThreshold")} value={threshold} inputMode="decimal" error={touched && bad(threshold)} onChange={(e) => setThreshold(e.target.value)} />
      </Box>
      {touched && (fieldErrors || errors.length > 0) && (
        <Alert severity="warning">{fieldErrors ? t("motivation.form.number") : errors.map((code) => t(`motivation.form.errors.${code}`)).join(". ")}</Alert>
      )}
    </Shell>
  );
}

export function PlansDrawer({ summary, monthLabel, onClose, onSaved }: { summary: MotivationSummary | null; monthLabel: string; onClose: () => void; onSaved: (fresh: MotivationSummary) => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const [plans, setPlansDraft] = React.useState<Record<number, string>>({});
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (!summary) return;
    setPlansDraft(Object.fromEntries(summary.rows.map((row) => [row.employeeId, row.plan ? String(row.plan) : ""])));
    setTouched(false);
  }, [summary]);
  const invalid = Object.values(plans).some((v) => bad(v, false));
  const save = useMutation({
    mutationFn: () =>
      setPlans(
        summary?.month as string,
        Object.entries(plans).map(([employeeId, value]) => ({ employeeId: Number(employeeId), plan: parseAmount(value) ?? 0 })),
        scope,
      ),
    onSuccess: onSaved,
  });
  React.useEffect(() => save.reset(), [summary]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  return (
    <Shell
      open={summary != null}
      title={t("motivation.form.plansTitle", { month: monthLabel })}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!invalid) save.mutate();
      }}
    >
      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("motivation.form.plansHint")}</Typography>
      {summary?.rows.map((row) => (
        <TextField
          key={row.employeeId}
          size="small"
          label={[row.employeeName, row.position].filter(Boolean).join(" · ")}
          value={plans[row.employeeId] ?? ""}
          inputMode="decimal"
          error={touched && bad(plans[row.employeeId] ?? "", false)}
          helperText={touched && bad(plans[row.employeeId] ?? "", false) ? t("motivation.form.number") : undefined}
          onChange={(e) => setPlansDraft((prev) => ({ ...prev, [row.employeeId]: e.target.value }))}
        />
      ))}
    </Shell>
  );
}

export function RowDrawer({ row, month, monthLabel, onClose, onSaved }: { row: MotivationRow | null; month: string; monthLabel: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const [plan, setPlan] = React.useState("");
  const [fact, setFact] = React.useState("");
  const [deals, setDeals] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (!row) return;
    setPlan(String(row.plan));
    // Факт из CRM в форме пустой: сохранение без правки не превратит его в «вручную».
    setFact(row.factSource === "manual" ? String(row.fact) : "");
    setDeals(String(row.deals));
    setTouched(false);
  }, [row]);
  const invalid = bad(plan) || bad(fact, false) || bad(deals, false);
  const save = useMutation({
    mutationFn: () => {
      const body: { month: string; plan?: number; fact?: number | null; deals?: number } = { month, plan: parseAmount(plan) ?? 0 };
      const factValue = parseAmount(fact);
      if (factValue != null) body.fact = factValue;
      else if (row?.factSource === "manual") body.fact = null;
      if (deals.trim() && parseAmount(deals) !== row?.deals) body.deals = Math.round(parseAmount(deals) ?? 0);
      return updatePlanRow(row?.employeeId as number, body, scope);
    },
    onSuccess: onSaved,
  });
  React.useEffect(() => save.reset(), [row]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  return (
    <Shell
      open={row != null}
      title={t("motivation.form.rowTitle", { name: row?.employeeName ?? "", month: monthLabel })}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!invalid) save.mutate();
      }}
    >
      <TextField size="small" label={t("motivation.form.plan")} value={plan} inputMode="decimal" error={touched && bad(plan)} onChange={(e) => setPlan(e.target.value)} />
      <TextField
        size="small"
        label={t("motivation.form.fact")}
        value={fact}
        inputMode="decimal"
        placeholder={row ? String(row.fact) : ""}
        error={touched && bad(fact, false)}
        helperText={t("motivation.form.factHint")}
        onChange={(e) => setFact(e.target.value)}
      />
      <TextField size="small" label={t("motivation.form.deals")} value={deals} inputMode="numeric" error={touched && bad(deals, false)} onChange={(e) => setDeals(e.target.value)} />
    </Shell>
  );
}
