import React from "react";
import { Alert, Box, Button, Drawer, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useSnackbar } from "notistack";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { getRealEstateProjects, getSalesManagers, realEstateKeys } from "../../api/realestate";
import { LEAD_SOURCES, LEAD_TEMPS, createLead, realtyLeadKeys, type LeadDetail, type LeadTemp } from "../../api/realtyLeads";
import { estateDashboardKeys } from "../../api/estateDashboard";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { PhoneController } from "../realestate/ui/unit-card/PhoneController";

interface Form {
  client: string;
  phone: string;
  project: string;
  projectId: string;
  budget: string;
  source: string;
  managerId: string;
  temp: LeadTemp;
  task: string;
}

const toNumber = (value: string) => Number(value.replace(/\s/g, "").replace(",", "."));

/**
 * «＋ Новая заявка» — лид в CRM застройщика (`POST /api/v2/realty/leads/`).
 * Обязателен только клиент; ответственный по умолчанию — я (гайд: без
 * `managerId` лид останется ничьим). Только с `realty.manage`.
 */
export function NewLeadDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (lead: LeadDetail) => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canStaff = useCan("staff.view");
  const { activeEmployee } = usePermissions();
  const me = activeEmployee?.id != null ? String(activeEmployee.id) : "";
  const empty = React.useCallback(
    (): Form => ({ client: "", phone: "", project: "", projectId: "", budget: "", source: "", managerId: me, temp: "warm", task: "" }),
    [me],
  );
  const { control, handleSubmit, reset } = useForm<Form>({ defaultValues: empty() });
  React.useEffect(() => {
    if (open) reset(empty());
  }, [open, reset, empty]);

  const projects = useQuery({
    queryKey: realEstateKeys.projects(scope),
    queryFn: () => getRealEstateProjects(scope),
    enabled: open && scope.orgReady !== false,
    staleTime: 5 * 60_000,
  });
  const managers = useQuery({
    queryKey: realEstateKeys.managers(scope),
    queryFn: () => getSalesManagers(scope),
    enabled: open && canStaff && scope.orgReady !== false,
    staleTime: 5 * 60_000,
  });

  const create = useMutation({
    mutationFn: (form: Form) =>
      createLead(
        {
          client: form.client,
          phone: form.phone,
          project: form.project,
          projectId: form.projectId ? Number(form.projectId) : null,
          budget: form.budget.trim() ? toNumber(form.budget) : null,
          source: form.source,
          managerId: form.managerId ? Number(form.managerId) : null,
          temp: form.temp,
          task: form.task,
        },
        scope,
      ),
    onSuccess: (lead) => {
      enqueueSnackbar(t("form.created"), { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: realtyLeadKeys.all });
      void queryClient.invalidateQueries({ queryKey: estateDashboardKeys.all });
      onCreated(lead);
    },
  });

  // Менеджеров нет в справочнике (нет staff.view) — в списке хотя бы я сам.
  const managerOptions = (managers.data ?? []).filter((m) => m.id);
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
          {t("form.title")}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose} disabled={create.isPending}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box
        component="form"
        id="new-lead"
        onSubmit={handleSubmit((form) => create.mutate(form))}
        sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gap: 2, alignContent: "start" }}
      >
        <Controller
          control={control}
          name="client"
          rules={{ validate: (v) => v.trim() !== "" || t("form.required") }}
          render={({ field, fieldState }) => (
            <TextField {...field} label={t("form.client")} size="small" autoFocus error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
          )}
        />
        <PhoneController control={control} name="phone" label={t("form.phone")} />
        <Controller
          control={control}
          name="project"
          render={({ field }) => <TextField {...field} label={t("form.project")} size="small" helperText={t("form.projectHint")} />}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Controller
            control={control}
            name="projectId"
            render={({ field }) => (
              <TextField {...field} select label={t("form.projectId")} size="small" slotProps={selectSlot}>
                <MenuItem value="">{t("form.projectNone")}</MenuItem>
                {(projects.data ?? []).map((p) => (
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
            rules={{ validate: (v) => !v.trim() || (Number.isFinite(toNumber(v)) && toNumber(v) >= 0) || t("form.required") }}
            render={({ field, fieldState }) => (
              <TextField {...field} label={t("form.budget")} size="small" inputMode="decimal" error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
            )}
          />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Controller
            control={control}
            name="source"
            render={({ field }) => (
              <TextField {...field} select label={t("form.source")} size="small" slotProps={selectSlot}>
                <MenuItem value="">{t("form.sourceNone")}</MenuItem>
                {LEAD_SOURCES.map((source) => (
                  <MenuItem key={source} value={source}>
                    {source}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="temp"
            render={({ field }) => (
              <TextField {...field} select label={t("form.temp")} size="small">
                {LEAD_TEMPS.map((temp) => (
                  <MenuItem key={temp} value={temp}>
                    {t(`temp.${temp}`)}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Box>
        {canStaff && (
          <Controller
            control={control}
            name="managerId"
            render={({ field }) => (
              <TextField {...field} select label={t("form.manager")} size="small" disabled={managers.isLoading} slotProps={selectSlot}>
                <MenuItem value="">{t("form.managerNone")}</MenuItem>
                {/* «Я» может не попасть в список (другой филиал) — значение не должно пропасть. */}
                {me && !managerOptions.some((m) => m.id === me) && <MenuItem value={me}>{activeEmployee?.fullName ?? me}</MenuItem>}
                {managerOptions.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        )}
        <Controller
          control={control}
          name="task"
          render={({ field }) => <TextField {...field} label={t("form.task")} size="small" helperText={t("form.taskHint")} />}
        />
        {create.isError && <Alert severity="error">{create.error instanceof Error && create.error.message ? create.error.message : t("common.failed")}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={create.isPending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form="new-lead" variant="contained" disabled={create.isPending}>
          {t("form.submit")}
        </Button>
      </Box>
    </Drawer>
  );
}
