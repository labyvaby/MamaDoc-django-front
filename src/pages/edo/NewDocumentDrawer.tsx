import React from "react";
import { Alert, Box, Button, Drawer, FormControlLabel, IconButton, MenuItem, Switch, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import {
  COUNTERPARTY_TYPES,
  createEdoDocument,
  edoKeys,
  getEdoTemplates,
  type CounterpartyType,
  type EdoDirection,
  type EdoDocument,
} from "../../api/edo";
import { getRealEstateProjects, realEstateKeys } from "../../api/realestate";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";

interface Form {
  templateId: string;
  title: string;
  counterparty: string;
  counterpartyType: CounterpartyType;
  direction: EdoDirection;
  amount: string;
  date: Dayjs | null;
  deadline: Dayjs | null;
  projectId: string;
  submit: boolean;
}

const emptyForm = (): Form => ({
  templateId: "",
  title: "",
  counterparty: "",
  counterpartyType: "buyer",
  direction: "out",
  amount: "",
  date: dayjs(),
  deadline: dayjs().add(3, "day"),
  projectId: "",
  submit: false,
});

/** «＋ Документ» — документ из шаблона: маршрут согласования берётся из шаблона. */
export function NewDocumentDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (doc: EdoDocument) => void }) {
  const { t } = useT("edo");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, reset, watch } = useForm<Form>({ defaultValues: emptyForm() });
  React.useEffect(() => {
    if (open) reset(emptyForm());
  }, [open, reset]);

  const templates = useQuery({
    queryKey: edoKeys.templates(scope, false),
    queryFn: ({ signal }) => getEdoTemplates(scope, false, signal),
    enabled: open && scope.orgReady !== false,
    staleTime: 5 * 60_000,
  }).data;
  const projects = useQuery({
    queryKey: realEstateKeys.projects(scope),
    queryFn: () => getRealEstateProjects(scope),
    enabled: open && scope.orgReady !== false,
    staleTime: 5 * 60_000,
    retry: false,
  }).data;
  const template = templates?.find((item) => String(item.id) === watch("templateId"));

  const create = useMutation({
    mutationFn: (form: Form) =>
      createEdoDocument(
        {
          templateId: Number(form.templateId),
          title: form.title.trim(),
          counterparty: form.counterparty.trim(),
          counterpartyType: form.counterpartyType,
          direction: form.direction,
          amount: Number(form.amount.replace(/\s/g, "").replace(",", ".") || 0),
          date: (form.date ?? dayjs()).format("YYYY-MM-DD"),
          deadline: form.deadline ? form.deadline.format("YYYY-MM-DD") : null,
          projectId: form.projectId ? Number(form.projectId) : null,
          submit: form.submit,
        },
        scope,
      ),
    onSuccess: (doc) => {
      enqueueSnackbar(t("create.done", { number: doc.number }), { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: edoKeys.all });
      onCreated(doc);
    },
  });

  const required = (value: string) => Boolean(value.trim()) || t("create.required");

  return (
    <Drawer anchor="right" open={open} onClose={create.isPending ? undefined : onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 500 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, fontWeight: 700, fontSize: "1.1rem" }}>
          {t("create.title")}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose} disabled={create.isPending}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box component="form" id="new-edo-document" onSubmit={handleSubmit((form) => create.mutate(form))} sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gap: 2, alignContent: "start" }}>
        <Controller
          control={control}
          name="templateId"
          rules={{ validate: required }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              select
              size="small"
              label={t("create.template")}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message ?? (template ? template.routeSteps.map((s) => s.position || s.role).join(" → ") || t("create.templateHint") : t("create.templateHint"))}
            >
              {(templates ?? []).map((item) => (
                <MenuItem key={item.id} value={String(item.id)}>
                  {item.short} · {item.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          control={control}
          name="title"
          rules={{ validate: required }}
          render={({ field, fieldState }) => <TextField {...field} size="small" label={t("create.documentTitle")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />}
        />
        <Controller
          control={control}
          name="counterparty"
          rules={{ validate: required }}
          render={({ field, fieldState }) => <TextField {...field} size="small" label={t("create.counterparty")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />}
        />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
          <Controller
            control={control}
            name="counterpartyType"
            render={({ field }) => (
              <TextField {...field} select size="small" label={t("create.counterpartyType")}>
                {COUNTERPARTY_TYPES.map((item) => (
                  <MenuItem key={item} value={item}>
                    {t(`counterpartyType.${item}`)}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <TextField {...field} select size="small" label={t("create.direction")}>
                {(["out", "in", "internal"] as const).map((item) => (
                  <MenuItem key={item} value={item}>
                    {t(`directionFull.${item}`)}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="amount"
            rules={{ validate: (value) => !value.trim() || Number(value.replace(/\s/g, "").replace(",", ".")) >= 0 || t("create.required") }}
            render={({ field, fieldState }) => <TextField {...field} size="small" inputMode="decimal" label={t("create.amount")} error={Boolean(fieldState.error)} />}
          />
          {projects && projects.length > 0 ? (
            <Controller
              control={control}
              name="projectId"
              render={({ field }) => (
                <TextField {...field} select size="small" label={t("create.project")}>
                  <MenuItem value="">{t("create.projectNone")}</MenuItem>
                  {projects.map((project) => (
                    <MenuItem key={project.id} value={project.id}>
                      {project.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          ) : (
            <span />
          )}
          <Controller
            control={control}
            name="date"
            render={({ field }) => <CustomDatePicker label={t("create.date")} value={field.value} onChange={(value) => field.onChange(value)} slotProps={{ textField: { size: "small" } }} />}
          />
          <Controller
            control={control}
            name="deadline"
            render={({ field }) => <CustomDatePicker label={t("create.deadline")} value={field.value} onChange={(value) => field.onChange(value)} slotProps={{ textField: { size: "small" } }} />}
          />
        </Box>
        <Controller
          control={control}
          name="submit"
          render={({ field }) => <FormControlLabel control={<Switch checked={field.value} onChange={(_, on) => field.onChange(on)} />} label={t("create.submitNow")} />}
        />
        {create.isError && <Alert severity="error">{create.error instanceof Error ? create.error.message : ""}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={create.isPending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form="new-edo-document" variant="contained" disabled={create.isPending}>
          {t("create.submit")}
        </Button>
      </Box>
    </Drawer>
  );
}
