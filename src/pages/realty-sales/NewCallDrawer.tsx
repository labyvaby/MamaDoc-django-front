import React from "react";
import { Alert, Autocomplete, Box, Button, Drawer, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useSnackbar } from "notistack";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { estateDashboardKeys } from "../../api/estateDashboard";
import { getRealEstateProjects, realEstateKeys } from "../../api/realestate";
import { CALL_DIRECTIONS, CALL_STATUSES, createCall, parseCallDuration, realtyCallKeys, type Call, type CallDirection, type CallStatus } from "../../api/realtyCalls";
import { getLeads, realtyLeadKeys, type Lead } from "../../api/realtyLeads";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatPhoneDisplay } from "../../utility/phone";
import { PhoneController } from "../realestate/ui/unit-card/PhoneController";

/** Заявка, из которой звонят («☎ Позвонить» в карточке лида): клиент и запрос уже заполнены. */
export interface CallPreset {
  leadId: number;
  client: string;
  phone: string;
  projectId: number | null;
  deal: string;
}

interface Form {
  leadId: number | null;
  client: string;
  phone: string;
  direction: CallDirection;
  status: CallStatus;
  duration: string;
  projectId: string;
  deal: string;
  result: string;
  summary: string;
  nextAction: string;
}

const emptyForm = (preset?: CallPreset | null): Form => ({
  leadId: preset?.leadId ?? null,
  client: preset?.client ?? "",
  phone: preset?.phone ?? "",
  // Из карточки лида звонит менеджер — исходящий; в журнале чаще записывают входящий.
  direction: preset ? "outgoing" : "incoming",
  status: "answered",
  duration: "",
  projectId: preset?.projectId != null ? String(preset.projectId) : "",
  deal: preset?.deal ?? "",
  result: "",
  summary: "",
  nextAction: "",
});

const LEADS_PARAMS = {};

/**
 * «Записать звонок» — `POST /api/v2/realty/calls/`. Телефонии нет: менеджер
 * записывает итог сам. Заявку можно выбрать — клиент, телефон и ЖК
 * подставятся; без неё бэк привяжет звонок к заявке с тем же телефоном.
 * Менеджер — тот, кто записывает (ставит бэк). Только с `realty.manage`.
 */
export function NewCallDrawer({
  open,
  preset,
  onClose,
  onCreated,
}: {
  open: boolean;
  preset?: CallPreset | null;
  onClose: () => void;
  onCreated: (call: Call) => void;
}) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, reset, setValue } = useForm<Form>({ defaultValues: emptyForm(preset) });
  React.useEffect(() => {
    if (open) reset(emptyForm(preset));
  }, [open, preset, reset]);
  const status = useWatch({ control, name: "status" });

  const leads = useQuery({
    queryKey: realtyLeadKeys.list(scope, LEADS_PARAMS),
    queryFn: ({ signal }) => getLeads(LEADS_PARAMS, scope, signal),
    enabled: open && !preset && scope.orgReady !== false,
    staleTime: 60_000,
  });
  const projects = useQuery({
    queryKey: realEstateKeys.projects(scope),
    queryFn: () => getRealEstateProjects(scope),
    enabled: open && scope.orgReady !== false,
    staleTime: 5 * 60_000,
  });

  const create = useMutation({
    mutationFn: (form: Form) =>
      createCall(
        {
          client: form.client,
          direction: form.direction,
          status: form.status,
          phone: form.phone || undefined,
          leadId: form.leadId,
          seconds: form.status === "answered" ? (parseCallDuration(form.duration) ?? 0) : 0,
          projectId: form.projectId ? Number(form.projectId) : null,
          deal: form.deal || undefined,
          result: form.result || undefined,
          summary: form.summary || undefined,
          nextAction: form.nextAction || undefined,
        },
        scope,
      ),
    onSuccess: (call) => {
      enqueueSnackbar(t("calls.form.created"), { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: realtyCallKeys.all });
      void queryClient.invalidateQueries({ queryKey: realtyLeadKeys.all });
      void queryClient.invalidateQueries({ queryKey: estateDashboardKeys.all });
      onCreated(call);
    },
  });

  const pickLead = (lead: Lead | null) => {
    setValue("leadId", lead?.id ?? null);
    if (!lead) return;
    setValue("client", lead.client, { shouldValidate: true });
    setValue("phone", lead.phone);
    setValue("projectId", lead.projectId != null ? String(lead.projectId) : "");
    setValue("deal", lead.project);
  };

  const selectSlot = { inputLabel: { shrink: true }, select: { displayEmpty: true } } as const;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={create.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, fontWeight: 700, fontSize: "1.1rem" }}>
          {t("calls.form.title")}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose} disabled={create.isPending}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box
        component="form"
        id="new-call"
        onSubmit={handleSubmit((form) => create.mutate(form))}
        sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, alignContent: "start" }}
      >
        {!preset && (
          <Controller
            control={control}
            name="leadId"
            render={({ field }) => (
              <Autocomplete<Lead>
                options={leads.data ?? []}
                loading={leads.isLoading}
                value={(leads.data ?? []).find((lead) => lead.id === field.value) ?? null}
                onChange={(_, lead) => pickLead(lead)}
                getOptionLabel={(lead) => lead.client}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderOption={({ key, ...props }, lead) => (
                  <li key={key} {...props}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: "0.875rem" }}>{lead.client}</Typography>
                      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                        {[lead.phone && formatPhoneDisplay(lead.phone), lead.stageName].filter(Boolean).join(" · ")}
                      </Typography>
                    </Box>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField {...params} size="small" label={t("calls.form.lead")} placeholder={t("calls.form.leadNone")} helperText={t("calls.form.leadHint")} slotProps={{ inputLabel: { shrink: true } }} />
                )}
              />
            )}
          />
        )}
        <Controller
          control={control}
          name="client"
          rules={{ validate: (v) => v.trim() !== "" || t("calls.form.required") }}
          render={({ field, fieldState }) => (
            <TextField {...field} label={t("calls.form.client")} size="small" disabled={Boolean(preset)} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
          )}
        />
        <PhoneController control={control} name="phone" label={t("calls.form.phone")} />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <TextField {...field} select label={t("calls.form.direction")} size="small">
                {CALL_DIRECTIONS.map((direction) => (
                  <MenuItem key={direction} value={direction}>
                    {t(`calls.direction.${direction}`)}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <TextField {...field} select label={t("calls.form.status")} size="small">
                {CALL_STATUSES.map((value) => (
                  <MenuItem key={value} value={value}>
                    {t(`calls.status.${value}`)}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Controller
            control={control}
            name="duration"
            rules={{ validate: (v) => status !== "answered" || parseCallDuration(v) != null || t("calls.form.durationInvalid") }}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label={t("calls.form.duration")}
                size="small"
                inputMode="numeric"
                disabled={status !== "answered"}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message ?? t("calls.form.durationHint")}
              />
            )}
          />
          <Controller
            control={control}
            name="projectId"
            render={({ field }) => (
              <TextField {...field} select label={t("calls.form.project")} size="small" slotProps={selectSlot}>
                <MenuItem value="">{t("calls.form.projectNone")}</MenuItem>
                {(projects.data ?? []).map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Box>
        <Controller control={control} name="deal" render={({ field }) => <TextField {...field} label={t("calls.form.deal")} size="small" helperText={t("calls.form.dealHint")} />} />
        <Controller control={control} name="result" render={({ field }) => <TextField {...field} label={t("calls.form.result")} size="small" helperText={t("calls.form.resultHint")} />} />
        <Controller control={control} name="summary" render={({ field }) => <TextField {...field} label={t("calls.form.summary")} size="small" multiline minRows={2} maxRows={6} />} />
        <Controller
          control={control}
          name="nextAction"
          render={({ field }) => <TextField {...field} label={t("calls.form.nextAction")} size="small" helperText={t("calls.form.nextActionHint")} />}
        />
        {create.isError && <Alert severity="error">{create.error instanceof Error && create.error.message ? create.error.message : t("common.failed")}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={create.isPending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form="new-call" variant="contained" disabled={create.isPending}>
          {t("calls.form.submit")}
        </Button>
      </Box>
    </Drawer>
  );
}
