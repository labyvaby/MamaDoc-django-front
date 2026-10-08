import React from "react";
import {
  Alert,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";

import { patchTaxSettings, type TaxRates, type TaxSettings } from "../../../../api/payroll";
import { AppButton } from "../../../../components/ui";
import { subtleBg } from "../../../../theme/uiHelpers";
import { NumberField } from "../DjangoSalarySettings";
import { toNumber, trimAmount } from "./salaryCardModel";

type Props = {
  open: boolean;
  onClose: () => void;
  settings: TaxSettings;
  organizationId?: number | null;
  onSaved: (settings: TaxSettings) => void;
};

const RATE_FIELDS: { key: keyof TaxRates; label: string }[] = [
  { key: "incomeTax", label: "Подоходный налог" },
  { key: "socialEmployee", label: "Соцфонд работника" },
  { key: "socialEmployer", label: "Соцфонд работодателя" },
];

const REGIMES: { key: "employment" | "civil"; title: string }[] = [
  { key: "employment", title: "Трудовой договор" },
  { key: "civil", title: "Договор ГПХ" },
];

const trimRates = (rates: TaxRates): TaxRates => ({
  incomeTax: trimAmount(rates.incomeTax) || "0",
  socialEmployee: trimAmount(rates.socialEmployee) || "0",
  socialEmployer: trimAmount(rates.socialEmployer) || "0",
});

/**
 * Ставки налогов организации: одни на всех сотрудников. Меняются с
 * payroll.taxes.manage; замороженные месяцы пересчитываются только
 * перерасчётом, текущий — сразу.
 */
const TaxRatesDialog: React.FC<Props> = ({ open, onClose, settings, organizationId, onSaved }) => {
  const [draft, setDraft] = React.useState<TaxSettings>(settings);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDraft({
        standardDeduction: trimAmount(settings.standardDeduction),
        employment: trimRates(settings.employment),
        civil: trimRates(settings.civil),
      });
      setError(null);
    }
  }, [open, settings]);

  const invalid = REGIMES.some((r) =>
    RATE_FIELDS.some((f) => {
      const v = toNumber(draft[r.key][f.key]);
      return v < 0 || v > 100;
    }),
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await patchTaxSettings(
        {
          standardDeduction: String(toNumber(draft.standardDeduction)),
          employment: draft.employment,
          civil: draft.civil,
        },
        organizationId,
      );
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Не удалось сохранить ставки");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      // sm в теме проекта — 360px: ширину задаём сами.
      maxWidth={false}
      fullWidth
      PaperProps={{ sx: { borderRadius: "18px", maxWidth: 640 } }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>Ставки налогов организации</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Действуют для всех сотрудников с этим режимом. Замороженные месяцы не меняются,
          пока их не пересчитают.
        </Typography>
        <Stack spacing={2}>
          {REGIMES.map((regime) => (
            <Box
              key={regime.key}
              sx={(t) => ({ p: 1.5, borderRadius: "12px", border: 1, borderColor: "divider", bgcolor: subtleBg(t) })}
            >
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                {regime.title}
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.25 }}>
                {RATE_FIELDS.map((field) => (
                  <Box key={field.key}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                      {field.label}
                    </Typography>
                    <NumberField
                      value={draft[regime.key][field.key]}
                      onChange={(v) =>
                        setDraft((d) => ({ ...d, [regime.key]: { ...d[regime.key], [field.key]: v } }))
                      }
                      unit="%"
                      step={0.25}
                      disabled={busy}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
          <Box sx={{ maxWidth: 260 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Стандартный вычет из базы подоходного налога
            </Typography>
            <NumberField
              value={draft.standardDeduction}
              onChange={(v) => setDraft((d) => ({ ...d, standardDeduction: v }))}
              unit="с/мес"
              step={50}
              disabled={busy}
            />
          </Box>
          {invalid && <Alert severity="warning">Ставка — от 0 до 100 %.</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <AppButton variant="text" onClick={onClose} disabled={busy}>
          Отмена
        </AppButton>
        <AppButton variant="contained" onClick={save} loading={busy} disabled={invalid}>
          {busy ? "Сохраняем…" : "Сохранить ставки"}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default TaxRatesDialog;
