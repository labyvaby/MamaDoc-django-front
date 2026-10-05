import React from "react";
import { Alert, Box, Button, Drawer, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { getRealEstateProjects, realEstateKeys } from "../../api/realestate";
import {
  PARTNER_TYPES,
  createPartner,
  createPartnerLead,
  parseAgents,
  setPartnerRates,
  type Partner,
  type PartnerLead,
  type PartnerType,
} from "../../api/realtyPartners";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { PhoneController } from "../realestate/ui/unit-card/PhoneController";
import { parseAmount } from "./catalogFormat";

function Shell({
  open,
  title,
  busy,
  error,
  submitLabel,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  busy: boolean;
  error: unknown;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
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
      <Box component="form" id={id} noValidate onSubmit={onSubmit} sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gap: 2, alignContent: "start" }}>
        {children}
        {Boolean(error) && <Alert severity="error">{error instanceof Error && error.message ? error.message : t("common.failed")}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form={id} variant="contained" disabled={busy}>
          {submitLabel}
        </Button>
      </Box>
    </Drawer>
  );
}

/** Ставки по ЖК: строка на каждый ЖК; пусто — партнёр с ЖК не работает. */
type Rates = Record<string, string>;

function useProjects(enabled: boolean) {
  const scope = useRealtyScope();
  return useQuery({
    queryKey: realEstateKeys.projects(scope),
    queryFn: () => getRealEstateProjects(scope),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 5 * 60_000,
  }).data;
}

const ratesValid = (rates: Rates) => Object.values(rates).every((v) => !v.trim() || (parseAmount(v) != null && (parseAmount(v) as number) <= 100));

const ratesBody = (rates: Rates) =>
  Object.fromEntries(
    Object.entries(rates)
      .filter(([, v]) => v.trim() && parseAmount(v) != null)
      .map(([k, v]) => [k, parseAmount(v) as number]),
  );

function RatesFields({ rates, onChange, projects }: { rates: Rates; onChange: (rates: Rates) => void; projects: { id: string; name: string }[] | undefined }) {
  const { t } = useT("realtySales");
  return (
    <Box sx={{ display: "grid", gap: 1.25 }}>
      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("partners.form.ratesHint")}</Typography>
      {(projects ?? []).map((p) => {
        const value = rates[p.id] ?? "";
        const bad = value.trim() !== "" && (parseAmount(value) == null || (parseAmount(value) as number) > 100);
        return (
          <TextField
            key={p.id}
            size="small"
            label={`${p.name} · ${t("partners.form.rates")}`}
            value={value}
            onChange={(e) => onChange({ ...rates, [p.id]: e.target.value })}
            inputMode="decimal"
            error={bad}
            helperText={bad ? t("partners.form.range", { min: 0, max: 100 }) : undefined}
          />
        );
      })}
    </Box>
  );
}

interface NewPartnerForm {
  name: string;
  type: PartnerType;
  contact: string;
  phone: string;
  agents: string;
}

export function NewPartnerDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (partner: Partner) => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const projects = useProjects(open);
  const [rates, setRates] = React.useState<Rates>({});
  const { control, handleSubmit, reset } = useForm<NewPartnerForm>({ defaultValues: { name: "", type: "agency", contact: "", phone: "", agents: "" } });
  React.useEffect(() => {
    if (!open) return;
    reset({ name: "", type: "agency", contact: "", phone: "", agents: "" });
    setRates({});
  }, [open, reset]);
  const create = useMutation({
    mutationFn: (form: NewPartnerForm) =>
      createPartner({ name: form.name, type: form.type, contact: form.contact, phone: form.phone, agents: parseAgents(form.agents), commission: ratesBody(rates) }, scope),
    onSuccess: onCreated,
  });
  React.useEffect(() => create.reset(), [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  return (
    <Shell
      open={open}
      title={t("partners.form.partnerTitle")}
      busy={create.isPending}
      error={create.error}
      submitLabel={t("partners.form.create")}
      onClose={onClose}
      onSubmit={handleSubmit((form) => {
        if (ratesValid(rates)) create.mutate(form);
      })}
    >
      <Controller
        control={control}
        name="name"
        rules={{ validate: (v) => v.trim() !== "" || t("partners.form.required") }}
        render={({ field, fieldState }) => <TextField {...field} size="small" required label={t("partners.form.name")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />}
      />
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <TextField {...field} select size="small" label={t("partners.form.type")}>
            {PARTNER_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {t(`partners.form.types.${type}`)}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Controller control={control} name="contact" render={({ field }) => <TextField {...field} size="small" label={t("partners.form.contact")} />} />
      <PhoneController control={control} name="phone" label={t("partners.form.phone")} />
      <Controller control={control} name="agents" render={({ field }) => <TextField {...field} size="small" label={t("partners.form.agents")} helperText={t("partners.form.agentsHint")} />} />
      <RatesFields rates={rates} onChange={setRates} projects={projects} />
    </Shell>
  );
}

/** «Изменить ставки» — `POST /partners/<id>/rates/`. */
export function RatesDrawer({ partner, onClose, onSaved }: { partner: Partner | null; onClose: () => void; onSaved: (partner: Partner) => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const projects = useProjects(partner != null);
  const [rates, setRates] = React.useState<Rates>({});
  React.useEffect(() => {
    if (partner) setRates(Object.fromEntries(Object.entries(partner.commission).map(([k, v]) => [k, String(v)])));
  }, [partner]);
  const save = useMutation({ mutationFn: () => setPartnerRates(partner?.id as number, ratesBody(rates), scope), onSuccess: onSaved });
  React.useEffect(() => save.reset(), [partner]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при новом партнёре
  return (
    <Shell
      open={partner != null}
      title={t("partners.form.ratesTitle", { name: partner?.name ?? "" })}
      busy={save.isPending}
      error={save.error}
      submitLabel={t("partners.form.save")}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (ratesValid(rates)) save.mutate();
      }}
    >
      <RatesFields rates={rates} onChange={setRates} projects={projects} />
    </Shell>
  );
}

interface LeadForm {
  partnerId: string;
  agent: string;
  client: string;
  phone: string;
  projectId: string;
  budget: string;
}

/** «＋ Лид от партнёра» — клиент закрепляется за партнёром; дубль телефона → 409 с текстом бэка. */
export function PartnerLeadDrawer({
  open,
  partners,
  defaultPartnerId,
  onClose,
  onCreated,
}: {
  open: boolean;
  partners: Partner[];
  defaultPartnerId: number | null;
  onClose: () => void;
  onCreated: (lead: PartnerLead) => void;
}) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const projects = useProjects(open);
  const empty = React.useCallback(
    (): LeadForm => ({ partnerId: defaultPartnerId != null ? String(defaultPartnerId) : "", agent: "", client: "", phone: "", projectId: "", budget: "" }),
    [defaultPartnerId],
  );
  const { control, handleSubmit, reset, watch } = useForm<LeadForm>({ defaultValues: empty() });
  React.useEffect(() => {
    if (open) reset(empty());
  }, [open, reset, empty]);
  const partnerId = watch("partnerId");
  const agents = partners.find((p) => String(p.id) === partnerId)?.agents ?? [];
  const create = useMutation({
    mutationFn: (form: LeadForm) =>
      createPartnerLead(
        { partnerId: Number(form.partnerId), client: form.client, phone: form.phone, agent: form.agent, projectId: form.projectId ? Number(form.projectId) : null, budget: parseAmount(form.budget) },
        scope,
      ),
    onSuccess: onCreated,
  });
  React.useEffect(() => create.reset(), [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  const selectSlot = { inputLabel: { shrink: true }, select: { displayEmpty: true } } as const;
  return (
    <Shell
      open={open}
      title={t("partners.form.leadTitle")}
      busy={create.isPending}
      error={create.error}
      submitLabel={t("partners.form.create")}
      onClose={onClose}
      onSubmit={handleSubmit((form) => create.mutate(form))}
    >
      <Controller
        control={control}
        name="partnerId"
        rules={{ validate: (v) => v !== "" || t("partners.form.required") }}
        render={({ field, fieldState }) => (
          <TextField {...field} select size="small" required label={t("partners.form.partner")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} slotProps={selectSlot}>
            {partners.map((p) => (
              <MenuItem key={p.id} value={String(p.id)} disabled={p.status === "paused"}>
                {p.name}
                {p.status === "paused" ? ` · ${t("partners.form.pausedPartner")}` : ""}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Controller
        control={control}
        name="agent"
        render={({ field }) =>
          agents.length ? (
            <TextField {...field} select size="small" label={t("partners.form.agent")} slotProps={selectSlot}>
              <MenuItem value="">—</MenuItem>
              {agents.map((agent) => (
                <MenuItem key={agent} value={agent}>
                  {agent}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField {...field} size="small" label={t("partners.form.agent")} />
          )
        }
      />
      <Controller
        control={control}
        name="client"
        rules={{ validate: (v) => v.trim() !== "" || t("partners.form.required") }}
        render={({ field, fieldState }) => <TextField {...field} size="small" required label={t("partners.form.client")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />}
      />
      <PhoneController control={control} name="phone" label={t("partners.form.phone")} requiredMessage={t("partners.form.required")} />
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <Controller
          control={control}
          name="projectId"
          render={({ field }) => (
            <TextField {...field} select size="small" label={t("partners.form.project")} slotProps={selectSlot}>
              <MenuItem value="">{t("partners.form.projectNone")}</MenuItem>
              {(projects ?? []).map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          control={control}
          name="budget"
          rules={{ validate: (v) => !v.trim() || parseAmount(v) != null || t("partners.form.number") }}
          render={({ field, fieldState }) => <TextField {...field} size="small" inputMode="decimal" label={t("partners.form.budget")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />}
        />
      </Box>
    </Shell>
  );
}
