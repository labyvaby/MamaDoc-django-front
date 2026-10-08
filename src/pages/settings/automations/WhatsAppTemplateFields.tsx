import React, { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, MenuItem, Pagination, Stack, TextField, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { getAutomationTemplates, variableLabel, type AutomationCatalogEvent } from "../../../api/automations";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { useT } from "../../../i18n/VerticalProvider";
import { type ActionForm } from "./automationForm";

const ALIASES: Record<string, string> = {
  clinic_name: "organization_name", patient_name: "client_name", doctor_name: "employee_name",
};

export function WhatsAppTemplateFields({ action, event, organizationId, disabled, errors, onChange }: {
  action: ActionForm;
  event: AutomationCatalogEvent | undefined;
  organizationId: number | undefined;
  disabled: boolean;
  errors: Record<string, string> | undefined;
  onChange: (patch: Partial<ActionForm>) => void;
}) {
  const { t } = useT("settings");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const templates = useQuery({
    queryKey: djangoQueryKeys.automations.templates(organizationId, page, query),
    queryFn: () => getAutomationTemplates({ organizationId, page, search: query }),
  });
  const inPage = templates.data?.results.find((row) => row.id === action.whatsappTemplateId);
  const selectedQuery = useQuery({
    queryKey: djangoQueryKeys.automations.templates(organizationId, 1, "", action.whatsappTemplateId ?? undefined),
    queryFn: () => getAutomationTemplates({ organizationId, templateId: action.whatsappTemplateId! }),
    enabled: action.whatsappTemplateId !== null && !inPage,
  });
  const selected = action.whatsappTemplateId === null ? undefined : inPage ?? selectedQuery.data?.results[0];
  const rows = [...(templates.data?.results ?? [])];
  if (selected && !inPage) rows.unshift(selected);
  const missing = action.whatsappTemplateId && !selected && !selectedQuery.isPending;

  return <Stack spacing={1.5}>
    <TextField size="small" label={t("automations.waba.search")} value={search}
      onChange={(e) => setSearch(e.target.value)} disabled={disabled} />
    {templates.isPending && <Stack direction="row" spacing={1} alignItems="center">
      <CircularProgress size={18} /><Typography variant="body2">{t("automations.waba.loading")}</Typography>
    </Stack>}
    {(templates.isError || selectedQuery.isError) && <Alert severity="error" action={
      <Button onClick={() => { void templates.refetch(); if (action.whatsappTemplateId) void selectedQuery.refetch(); }}>
        {t("automations.waba.retry")}
      </Button>}>
      {t("automations.waba.loadError")}
    </Alert>}
    <TextField select fullWidth size="small" label={t("automations.waba.template")}
      value={action.whatsappTemplateId ?? ""} disabled={disabled || templates.isPending}
      error={Boolean(errors?.whatsappTemplateId || missing || (selected && !selected.ready))}
      helperText={errors?.whatsappTemplateId || (missing ? t("automations.waba.missing") : selected?.unavailableReason) || t("automations.waba.templateHint")}
      onChange={(e) => {
        const row = rows.find((item) => item.id === Number(e.target.value));
        if (!row?.ready) return;
        const bindings = Object.fromEntries(row.variableOrder.map((code) => {
          const source = event?.variables.includes(code) ? code : ALIASES[code];
          return [code, source && event?.variables.includes(source) ? `{{${source}}}` : ""];
        }));
        onChange({ whatsappTemplateId: row.id, templateVariables: bindings });
      }}>
      <MenuItem value="" disabled>{t("automations.waba.choose")}</MenuItem>
      {action.whatsappTemplateId && !selected && <MenuItem value={action.whatsappTemplateId} disabled>
        {selectedQuery.isPending ? t("automations.waba.loading") : t("automations.waba.missing")}
      </MenuItem>}
      {rows.map((row) => <MenuItem key={row.id} value={row.id} disabled={!row.ready} sx={{ whiteSpace: "normal" }}>
        {row.title} · {row.language}{!row.ready ? ` · ${t("automations.waba.notReady")}` : ""}
      </MenuItem>)}
    </TextField>
    {(templates.data?.count ?? 0) > 50 && <Pagination page={page} count={Math.ceil(templates.data!.count / 50)}
      onChange={(_, next) => setPage(next)} disabled={disabled} aria-label={t("automations.waba.pages")} />}
    {templates.data?.count === 0 && !query && <Alert severity="info">
      {t("automations.waba.empty")} <Button href="/settings/notification-gateway">{t("automations.waba.gateway")}</Button>
    </Alert>}
    {templates.data?.count === 0 && query && <Typography variant="body2">{t("automations.waba.noResults")}</Typography>}
    {selected && <>
      <Box>
        <Typography variant="subtitle2">{t("automations.waba.approvedBody")}</Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selected.body}</Typography>
      </Box>
      {selected.variableOrder.length > 0 && <Typography variant="body2" color="text.secondary">
        {t("automations.waba.parametersHint")}
      </Typography>}
      {selected.variableOrder.map((code) => {
        const value = action.templateVariables[code] ?? "";
        const match = value.match(/^\{\{\s*(\w+)\s*\}\}$/);
        const source = match && event?.variables.includes(match[1]) ? match[1] : "constant";
        const update = (next: string) => onChange({ templateVariables: { ...action.templateVariables, [code]: next } });
        return <Stack key={code} spacing={1} direction={{ xs: "column", sm: "row" }}>
          <TextField select fullWidth size="small" label={t("automations.waba.parameter", {
            name: t(`whatsappTemplates.variables.${code}`, { defaultValue: code }),
          })}
            value={source} disabled={disabled} onChange={(e) => update(e.target.value === "constant" ? "" : `{{${e.target.value}}}`)}>
            <MenuItem value="constant">{t("automations.waba.constant")}</MenuItem>
            {(event?.variables ?? []).map((variable) => <MenuItem key={variable} value={variable}>{variableLabel(event, variable)}</MenuItem>)}
          </TextField>
          {source === "constant" && <TextField fullWidth size="small" label={t("automations.waba.value")}
            value={value} disabled={disabled} onChange={(e) => update(e.target.value)}
            error={Boolean(errors?.templateVariables && !value.trim())} />}
        </Stack>;
      })}
      {errors?.templateVariables && <Alert severity="error">{errors.templateVariables}</Alert>}
    </>}
  </Stack>;
}
