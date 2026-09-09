import {
  Box,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import {
  CYCLE_OPTIONS,
  MAX_CHARGE_LEAD_DAYS,
  MAX_GRACE_DAYS,
  type ContractRulesValues,
} from "./contractRules";

type Props = {
  values: ContractRulesValues;
  onChange: (values: ContractRulesValues) => void;
  disabled?: boolean;
};

export function ContractRulesFields({ values, onChange, disabled = false }: Props) {
  const set = <K extends keyof ContractRulesValues>(key: K, value: ContractRulesValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
        <TextField
          select
          size="small"
          label="Периодичность"
          value={values.billingCycle}
          onChange={(event) => set("billingCycle", event.target.value)}
          disabled={disabled}
          helperText="Пусто — берётся у объекта продажи"
        >
          {CYCLE_OPTIONS.map((option) => (
            <MenuItem key={option.value || "inherit"} value={option.value}>{option.label}</MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="number"
          label="Выставлять за N дней"
          value={values.chargeLeadDays}
          onChange={(event) => set("chargeLeadDays", event.target.value)}
          disabled={disabled}
          inputProps={{ min: 0, max: MAX_CHARGE_LEAD_DAYS, step: 1 }}
          helperText="0 — в первый день периода"
        />
        <TextField
          size="small"
          type="number"
          label="Срок оплаты, дней"
          value={values.paymentTermDays}
          onChange={(event) => set("paymentTermDays", event.target.value)}
          disabled={disabled}
          inputProps={{ min: 0, max: 365, step: 1 }}
          helperText="Пусто — срок по календарю периода"
        />
        <TextField
          size="small"
          type="number"
          label="Льготный период, дней"
          value={values.graceDays}
          onChange={(event) => set("graceDays", event.target.value)}
          disabled={disabled}
          inputProps={{ min: 0, max: MAX_GRACE_DAYS, step: 1 }}
          helperText="Столько дней после срока не считать просрочкой"
        />
      </Box>

      <Box>
        <FormControlLabel
          control={(
            <Switch
              checked={values.autoCharge}
              onChange={(event) => set("autoCharge", event.target.checked)}
              disabled={disabled}
            />
          )}
          label="Начислять автоматически"
        />
        <Typography variant="caption" color="text.secondary" display="block">
          Выключено — начисления по контракту создаются только вручную.
        </Typography>
      </Box>

      <Box>
        <Typography variant="subtitle2" fontWeight={760}>Уведомления клиенту</Typography>
        <Stack sx={{ mt: 0.5 }}>
          <FormControlLabel
            control={(
              <Switch
                checked={values.notifyOnCharge}
                onChange={(event) => set("notifyOnCharge", event.target.checked)}
                disabled={disabled}
              />
            )}
            label="При выставлении начисления"
          />
          <FormControlLabel
            control={(
              <Switch
                checked={values.notifyOnOverdue}
                onChange={(event) => set("notifyOnOverdue", event.target.checked)}
                disabled={disabled}
              />
            )}
            label="При просрочке"
          />
        </Stack>
        <TextField
          size="small"
          type="number"
          label="Напомнить за N дней до срока"
          value={values.notifyDaysBeforeDue}
          onChange={(event) => set("notifyDaysBeforeDue", event.target.value)}
          disabled={disabled}
          inputProps={{ min: 0, max: 365, step: 1 }}
          helperText="0 — не напоминать заранее"
          sx={{ mt: 1, maxWidth: { sm: 280 } }}
        />
      </Box>
    </Stack>
  );
}
