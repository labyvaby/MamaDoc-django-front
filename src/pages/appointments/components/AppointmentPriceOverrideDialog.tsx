import React from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import PriceChangeOutlined from "@mui/icons-material/PriceChangeOutlined";

import {
  overrideAppointmentServicePrice,
  parseBackendError,
  type AppointmentServiceLine,
  type DjangoAppointment,
} from "../../../api/appointments";
import { useT } from "../../../i18n/VerticalProvider";

type AppointmentPriceOverrideDialogProps = {
  open: boolean;
  appointment: DjangoAppointment;
  serviceLine: AppointmentServiceLine | null;
  onClose: () => void;
  onSaved: (appointment: DjangoAppointment) => void;
};

const AppointmentPriceOverrideDialog: React.FC<AppointmentPriceOverrideDialogProps> = ({
  open,
  appointment,
  serviceLine,
  onClose,
  onSaved,
}) => {
  const { t } = useT("appointments");
  const [price, setPrice] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !serviceLine) return;
    setPrice(String(serviceLine.unitPrice || serviceLine.price || ""));
    setError(null);
  }, [open, serviceLine]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!serviceLine || saving) return;

    const normalizedPrice = price.trim().replace(",", ".");
    const numericPrice = Number(normalizedPrice);
    if (!normalizedPrice || !Number.isFinite(numericPrice) || numericPrice < 0) {
      setError(t("priceOverride.invalid"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await overrideAppointmentServicePrice(appointment.id, {
        serviceLineId: serviceLine.id,
        unitPrice: normalizedPrice,
      });
      onSaved(updated);
      onClose();
    } catch (requestError) {
      setError(parseBackendError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const serviceName = serviceLine?.service?.name ?? t("details.service");
  const currentPrice = serviceLine?.unitPrice || serviceLine?.price || "0";

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <PriceChangeOutlined color="primary" />
          {t("priceOverride.title")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DialogContentText>
              {t("priceOverride.service", { service: serviceName })}
            </DialogContentText>
            <DialogContentText>
              {t("priceOverride.current", { price: currentPrice })}
            </DialogContentText>
            <Alert severity="info">{t("priceOverride.hint")}</Alert>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              autoFocus
              fullWidth
              required
              type="number"
              label={t("priceOverride.newPrice")}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputProps={{ min: 0, step: "0.01", inputMode: "decimal" }}
              disabled={saving}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            {t("details.back")}
          </Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={<PriceChangeOutlined />}
            disabled={saving || !serviceLine}
          >
            {saving ? t("priceOverride.saving") : t("priceOverride.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default AppointmentPriceOverrideDialog;
