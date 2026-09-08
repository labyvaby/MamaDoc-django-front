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
  parseOverlapConflict,
  type AppointmentOverlapConflict,
  type AppointmentServiceLine,
  type DjangoAppointment,
} from "../../../api/appointments";
import { useT } from "../../../i18n/VerticalProvider";
import OverlapConfirmDialog from "./OverlapConfirmDialog";

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
  const [duration, setDuration] = React.useState("");
  const [overlapConflict, setOverlapConflict] =
    React.useState<AppointmentOverlapConflict | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !serviceLine) return;
    setPrice(String(serviceLine.unitPrice || serviceLine.price || ""));
    setDuration(String(serviceLine.durationMinutes || ""));
    setError(null);
    setOverlapConflict(null);
  }, [open, serviceLine]);

  const performSubmit = async (allowOverlap = false) => {
    if (!serviceLine || saving) return;

    const normalizedPrice = price.trim().replace(",", ".");
    const numericPrice = Number(normalizedPrice);
    if (!normalizedPrice || !Number.isFinite(numericPrice) || numericPrice < 0) {
      setError(t("priceOverride.invalid"));
      return;
    }
    const numericDuration = Number(duration);
    if (!Number.isInteger(numericDuration) || numericDuration <= 0) {
      setError(t("priceOverride.invalidDuration"));
      return;
    }
    const currentPrice = Number(serviceLine.unitPrice || serviceLine.price || 0);
    if (numericPrice === currentPrice && numericDuration === serviceLine.durationMinutes) {
      setError(t("priceOverride.noChanges"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await overrideAppointmentServicePrice(appointment.id, {
        serviceLineId: serviceLine.id,
        unitPrice: normalizedPrice,
        durationMinutes: numericDuration,
        allowOverlap,
      });
      onSaved(updated);
      onClose();
    } catch (requestError) {
      const conflict = parseOverlapConflict(requestError);
      if (conflict) {
        setOverlapConflict(conflict);
        return;
      }
      setError(parseBackendError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void performSubmit();
  };

  const serviceName = serviceLine?.service?.name ?? t("details.service");
  const currentPrice = serviceLine?.unitPrice || serviceLine?.price || "0";
  const currentDuration = serviceLine?.durationMinutes ?? 0;

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
            <DialogContentText>{t("priceOverride.current", {
              price: currentPrice,
              minutes: currentDuration,
            })}</DialogContentText>
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
            <TextField
              fullWidth
              required
              type="number"
              label={t("priceOverride.newDuration")}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              inputProps={{ min: 1, step: 1, inputMode: "numeric" }}
              disabled={saving || serviceLine?.allowPriceOverride === false}
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
      <OverlapConfirmDialog
        conflict={overlapConflict}
        saving={saving}
        onCancel={() => setOverlapConflict(null)}
        onConfirm={() => {
          setOverlapConflict(null);
          void performSubmit(true);
        }}
      />
    </Dialog>
  );
};

export default AppointmentPriceOverrideDialog;
