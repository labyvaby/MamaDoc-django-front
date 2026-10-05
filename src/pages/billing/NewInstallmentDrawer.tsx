import React from "react";
import { Alert, Box, Button, Drawer, FormControlLabel, IconButton, MenuItem, Switch, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { billingKeys, createBillingAccount, type BillingAccount } from "../../api/billing";
import { getProjectUnits, getRealEstateProjects, realEstateKeys } from "../../api/realestate";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { PhoneController } from "../realestate/ui/unit-card/PhoneController";

interface Form {
  projectId: string;
  unitId: string;
  buyer: string;
  phone: string;
  contract: string;
  total: string;
  downPayment: string;
  term: string;
  startDate: Dayjs | null;
  autopay: boolean;
}

const toNumber = (value: string) => Number(value.replace(/\s/g, "").replace(",", "."));

const emptyForm = (): Form => ({
  projectId: "",
  unitId: "",
  buyer: "",
  phone: "",
  contract: "",
  total: "",
  downPayment: "",
  term: "12",
  startDate: dayjs().add(1, "month").startOf("month"),
  autopay: false,
});

/**
 * «Новая рассрочка» — ручной счёт. Обычно счёт создаётся сам при продаже
 * квартиры в рассрочку; квартира обязательна — бэк привязывает счёт к ней.
 */
export function NewInstallmentDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (account: BillingAccount) => void;
}) {
  const { t } = useT("billing");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, reset, watch, setValue } = useForm<Form>({ defaultValues: emptyForm() });
  React.useEffect(() => {
    if (open) reset(emptyForm());
  }, [open, reset]);

  const projectId = watch("projectId");
  const unitId = watch("unitId");
  const projects = useQuery({
    queryKey: realEstateKeys.projects(scope),
    queryFn: () => getRealEstateProjects(scope),
    enabled: open && scope.orgReady !== false,
    staleTime: 5 * 60_000,
  }).data;
  const units = useQuery({
    queryKey: realEstateKeys.units(scope, projectId),
    queryFn: () => getProjectUnits(projectId, scope),
    enabled: open && Boolean(projectId),
    staleTime: 30_000,
  }).data;

  // Квартира выбрана — подставляем её цену, если стоимость ещё не вводили.
  React.useEffect(() => {
    const unit = units?.find((u) => u.id === unitId);
    if (unit?.price) setValue("total", String(unit.price));
  }, [unitId, units, setValue]);

  const create = useMutation({
    mutationFn: (form: Form) =>
      createBillingAccount(
        {
          unitId: Number(form.unitId),
          buyer: form.buyer.trim(),
          phone: form.phone,
          contract: form.contract.trim(),
          total: toNumber(form.total),
          downPayment: toNumber(form.downPayment || "0"),
          term: Number(form.term),
          startDate: (form.startDate ?? dayjs()).format("YYYY-MM-DD"),
          autopay: form.autopay,
        },
        scope,
      ),
    onSuccess: (account) => {
      enqueueSnackbar(t("create.done", { number: account.number }), { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: billingKeys.all });
      onCreated(account);
    },
  });

  const total = toNumber(watch("total") || "0");
  const down = toNumber(watch("downPayment") || "0");
  const term = Number(watch("term"));
  const monthly = total > down && term > 0 ? (total - down) / term : 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={create.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, fontWeight: 700, fontSize: "1.1rem" }}>
          {t("create.title")}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose} disabled={create.isPending}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box component="form" id="new-installment" onSubmit={handleSubmit((form) => create.mutate(form))} sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gap: 2, alignContent: "start" }}>
        <Controller
          control={control}
          name="projectId"
          rules={{ required: t("create.required") }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              select
              size="small"
              label={t("create.project")}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message}
              onChange={(event) => {
                field.onChange(event.target.value);
                setValue("unitId", "");
              }}
            >
              {(projects ?? []).map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          control={control}
          name="unitId"
          rules={{ required: t("create.unitHint") }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              select
              size="small"
              label={t("create.unit")}
              disabled={!projectId}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message ?? (units && units.length === 0 ? t("create.unitNone") : t("create.unitHint"))}
            >
              {(units ?? []).map((unit) => (
                <MenuItem key={unit.id} value={unit.id}>
                  №{unit.number} · {formatKGS(unit.price)}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          control={control}
          name="buyer"
          rules={{ validate: (value) => Boolean(value.trim()) || t("create.required") }}
          render={({ field, fieldState }) => (
            <TextField {...field} size="small" label={t("create.buyer")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
          )}
        />
        <PhoneController control={control} name="phone" label={t("create.phone")} requiredMessage={t("create.required")} />
        <Controller
          control={control}
          name="contract"
          render={({ field }) => <TextField {...field} size="small" label={t("create.contract")} helperText={t("create.contractHint")} />}
        />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
          <Controller
            control={control}
            name="total"
            rules={{ validate: (value) => toNumber(value) > 0 || t("create.required") }}
            render={({ field, fieldState }) => (
              <TextField {...field} size="small" inputMode="decimal" label={t("create.total")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
            )}
          />
          <Controller
            control={control}
            name="downPayment"
            rules={{ validate: (value) => toNumber(value || "0") < toNumber(watch("total") || "0") || t("create.downPaymentTooBig") }}
            render={({ field, fieldState }) => (
              <TextField {...field} size="small" inputMode="decimal" label={t("create.downPayment")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
            )}
          />
          <Controller
            control={control}
            name="term"
            rules={{ validate: (value) => (Number(value) >= 1 && Number(value) <= 360 && Number.isInteger(Number(value))) || t("create.termRange") }}
            render={({ field, fieldState }) => (
              <TextField {...field} size="small" type="number" label={t("create.term")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
            )}
          />
          <Controller
            control={control}
            name="startDate"
            render={({ field }) => (
              <CustomDatePicker label={t("create.startDate")} value={field.value} onChange={(value) => field.onChange(value)} slotProps={{ textField: { size: "small" } }} />
            )}
          />
        </Box>
        {monthly > 0 && <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{t("create.monthlyPreview", { sum: formatKGS(monthly) })}</Typography>}
        <Controller
          control={control}
          name="autopay"
          render={({ field }) => (
            <FormControlLabel control={<Switch checked={field.value} onChange={(_, checked) => field.onChange(checked)} />} label={t("create.autopay")} />
          )}
        />
        {create.isError && <Alert severity="error">{create.error instanceof Error ? create.error.message : ""}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={create.isPending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form="new-installment" variant="contained" disabled={create.isPending}>
          {t("create.submit")}
        </Button>
      </Box>
    </Drawer>
  );
}
