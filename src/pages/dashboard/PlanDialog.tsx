import React from "react";
import {
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";

import { AppButton } from "../../components/ui";
import { getOrganization, updateOrganization } from "../../api/organization";
import { parseBackendError } from "../../api/appointments";
import { retryAuth } from "../../hooks/usePermissions";
import { formatKGS } from "../../utility/format";
import {
  buildPlanThemeConfig,
  readRevenuePlans,
  resolvePlan,
  setPlan,
} from "./revenuePlan";

type Target = "month" | "default";

/** «1 500 000» ← «1500000», пробелы-разделители при вводе. */
const formatInput = (digits: string) =>
  digits ? Number(digits).toLocaleString("ru-RU") : "";

/**
 * Задать план выручки. Одно поле и выбор «только этот месяц / каждый месяц» —
 * поэтому диалог, а не дровер: формы на дровере у нас от трёх полей.
 *
 * ⚠ Перед сохранением перечитываем организацию: themeConfig в /auth/me/ мог
 * устареть (палитру или лендинг правили в другой вкладке), а патч пишется
 * целиком — без свежей копии мы бы откатили чужую правку.
 */
export const PlanDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  organizationId: number;
  scopeKey: string;
  scopeLabel: string;
  /** YYYY-MM текущего месяца. */
  month: string;
  themeConfig: Record<string, unknown> | null | undefined;
}> = ({ open, onClose, organizationId, scopeKey, scopeLabel, month, themeConfig }) => {
  const current = React.useMemo(
    () => resolvePlan(readRevenuePlans(themeConfig), scopeKey, month),
    [themeConfig, scopeKey, month],
  );

  const [digits, setDigits] = React.useState("");
  const [target, setTarget] = React.useState<Target>("default");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDigits(current ? String(Math.round(current.amount)) : "");
    setTarget(current?.source === "month" ? "month" : "default");
    setError(null);
  }, [open, current]);

  const monthName = dayjs(month + "-01").format("MMMM");

  const save = async (amount: number | null, which: Target) => {
    setSaving(true);
    setError(null);
    try {
      const fresh = await getOrganization(organizationId);
      const plans = setPlan(
        readRevenuePlans(fresh.themeConfig),
        scopeKey,
        which === "default" ? "default" : { month },
        amount,
      );
      await updateOrganization(organizationId, {
        themeConfig: buildPlanThemeConfig(
          fresh.themeConfig as Record<string, unknown> | null,
          plans,
        ),
      });
      // /auth/me/ — источник themeConfig для всего приложения.
      retryAuth();
      onClose();
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setSaving(false);
    }
  };

  const amount = digits ? Number(digits) : 0;

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      // ⚠ maxWidth="sm" в этой теме = 360px — ширину задаём явно.
      PaperProps={{ sx: { width: "100%", maxWidth: 440, borderRadius: "14px" } }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>План выручки</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          {scopeLabel}. С планом «Пульс» показывает, сколько нужно в день, чтобы
          успеть к концу месяца.
        </Typography>
        <Stack spacing={2}>
          <TextField
            autoFocus
            fullWidth
            label="Сумма на месяц"
            value={formatInput(digits)}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 12))}
            inputProps={{ inputMode: "numeric" }}
            InputProps={{ endAdornment: <InputAdornment position="end">сом</InputAdornment> }}
          />
          <RadioGroup value={target} onChange={(_, v) => setTarget(v as Target)}>
            <FormControlLabel
              value="default"
              control={<Radio size="small" />}
              label="На каждый месяц"
            />
            <FormControlLabel
              value="month"
              control={<Radio size="small" />}
              label={`Только на ${monthName} — сезон, праздники`}
            />
          </RadioGroup>
          {current?.source === "month" && target === "default" && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              На {monthName} уже задан свой план ({formatKGS(current.amount)}) — он останется
              важнее общего. Чтобы общий действовал и сейчас, снимите план месяца.
            </Typography>
          )}
          {error && (
            <Alert severity="error" variant="outlined" sx={{ borderRadius: "10px" }}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        {current && (
          <AppButton
            color="inherit"
            disabled={saving}
            onClick={() => save(null, current.source === "month" ? "month" : "default")}
            sx={{ mr: "auto" }}
          >
            {current.source === "month" ? `Снять план на ${monthName}` : "Снять план"}
          </AppButton>
        )}
        <AppButton color="inherit" disabled={saving} onClick={onClose}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          disabled={saving || amount <= 0}
          onClick={() => save(amount, target)}
        >
          Сохранить
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default PlanDialog;
