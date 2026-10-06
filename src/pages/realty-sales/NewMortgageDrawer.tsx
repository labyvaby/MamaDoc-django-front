import React from "react";
import { Alert, Autocomplete, Box, Button, Drawer, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useSnackbar } from "notistack";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { getLeads, realtyLeadKeys, type Lead } from "../../api/realtyLeads";
import { MORTGAGE_PROGRAMS, createMortgageApplication, realtyMortgageKeys, type MortgageApplication, type MortgageProgram } from "../../api/realtyMortgage";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatPhoneDisplay } from "../../utility/phone";
import { PhoneController } from "../realestate/ui/unit-card/PhoneController";
import { parseAmount } from "./catalogFormat";

/** «Создать заявку с этими параметрами» из калькулятора. */
export interface MortgagePreset {
  price: number;
  down: number;
  years: number;
  income: number | null;
}

interface Form {
  leadId: number | null;
  buyer: string;
  phone: string;
  price: string;
  down: string;
  years: string;
  income: string;
  program: MortgageProgram;
}

const formFor = (preset: MortgagePreset | null): Form => ({
  leadId: null,
  buyer: "",
  phone: "",
  price: preset ? String(preset.price) : "",
  down: preset ? String(preset.down) : "30",
  years: preset ? String(preset.years) : "15",
  income: preset?.income ? String(preset.income) : "",
  program: "standard",
});

const LEADS_PARAMS = {};

/**
 * «＋ Заявка» на ипотеку — `POST /mortgage-applications/`: покупатель, срок,
 * доход, стоимость и взнос в %. Заявку CRM можно выбрать — покупатель,
 * телефон и бюджет подставятся. Только с `realty.manage`.
 */
export function NewMortgageDrawer({
  open,
  preset,
  onClose,
  onCreated,
}: {
  open: boolean;
  preset: MortgagePreset | null;
  onClose: () => void;
  onCreated: (app: MortgageApplication) => void;
}) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, reset, setValue, getValues } = useForm<Form>({ defaultValues: formFor(preset) });
  React.useEffect(() => {
    if (open) reset(formFor(preset));
  }, [open, preset, reset]);

  const leads = useQuery({
    queryKey: realtyLeadKeys.list(scope, LEADS_PARAMS),
    queryFn: ({ signal }) => getLeads(LEADS_PARAMS, scope, signal),
    enabled: open && scope.orgReady !== false,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: (form: Form) =>
      createMortgageApplication(
        {
          buyer: form.buyer,
          phone: form.phone,
          leadId: form.leadId,
          price: parseAmount(form.price),
          down: parseAmount(form.down) ?? 0,
          years: Math.round(parseAmount(form.years) ?? 0),
          income: parseAmount(form.income) ?? 0,
          program: form.program,
        },
        scope,
      ),
    onSuccess: (app) => {
      enqueueSnackbar(t("mortgage.form.created", { number: app.number }), { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: realtyMortgageKeys.all });
      onCreated(app);
    },
  });

  const pickLead = (lead: Lead | null) => {
    setValue("leadId", lead?.id ?? null);
    if (!lead) return;
    setValue("buyer", lead.client, { shouldValidate: true });
    setValue("phone", lead.phone);
    // Бюджет заявки — стоимость, только если её ещё не ввели (калькулятор важнее).
    if (!getValues("price").trim() && lead.budget > 0) setValue("price", String(lead.budget), { shouldValidate: true });
  };

  const numberRule = (min: number, max: number, required = true) => ({
    validate: (value: string) => {
      if (!value.trim()) return required ? t("mortgage.form.required") : true;
      const parsed = parseAmount(value);
      if (parsed == null) return t("mortgage.form.number");
      return (parsed >= min && parsed <= max) || t("mortgage.form.range", { min, max: max.toLocaleString("ru-RU") });
    },
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={create.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, fontWeight: 700, fontSize: "1.1rem" }}>
          {t("mortgage.form.title")}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose} disabled={create.isPending}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box
        component="form"
        id="new-mortgage"
        noValidate
        onSubmit={handleSubmit((form) => create.mutate(form))}
        sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, alignContent: "start" }}
      >
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
                      {[lead.phone && formatPhoneDisplay(lead.phone), lead.project, lead.stageName].filter(Boolean).join(" · ")}
                    </Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => <TextField {...params} size="small" label={t("mortgage.form.lead")} placeholder={t("mortgage.form.leadNone")} slotProps={{ inputLabel: { shrink: true } }} />}
            />
          )}
        />
        <Controller
          control={control}
          name="buyer"
          rules={{ validate: (v) => v.trim() !== "" || t("mortgage.form.required") }}
          render={({ field, fieldState }) => <TextField {...field} size="small" required label={t("mortgage.form.buyer")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />}
        />
        <PhoneController control={control} name="phone" label={t("mortgage.form.phone")} />
        <Controller
          control={control}
          name="price"
          rules={numberRule(1, 10_000_000_000)}
          render={({ field, fieldState }) => (
            <TextField {...field} size="small" required inputMode="decimal" label={t("mortgage.form.price")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
          )}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Controller
            control={control}
            name="down"
            rules={numberRule(0, 99)}
            render={({ field, fieldState }) => (
              <TextField {...field} size="small" required inputMode="decimal" label={t("mortgage.form.down")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
            )}
          />
          <Controller
            control={control}
            name="years"
            rules={numberRule(1, 30)}
            render={({ field, fieldState }) => (
              <TextField {...field} size="small" required inputMode="numeric" label={t("mortgage.form.years")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
            )}
          />
        </Box>
        <Controller
          control={control}
          name="income"
          rules={numberRule(1, 1_000_000_000)}
          render={({ field, fieldState }) => (
            <TextField {...field} size="small" required inputMode="decimal" label={t("mortgage.form.income")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
          )}
        />
        <Controller
          control={control}
          name="program"
          render={({ field }) => (
            <TextField {...field} select size="small" label={t("mortgage.form.program")}>
              {MORTGAGE_PROGRAMS.map((program) => (
                <MenuItem key={program} value={program}>
                  {t(`mortgage.form.programs.${program}`)}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        {create.isError && <Alert severity="error">{create.error instanceof Error && create.error.message ? create.error.message : t("common.failed")}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={create.isPending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form="new-mortgage" variant="contained" disabled={create.isPending}>
          {t("mortgage.form.submit")}
        </Button>
      </Box>
    </Drawer>
  );
}
