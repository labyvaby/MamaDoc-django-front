import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { PhoneCountryCodeSelect } from "../../../components/ui";
import { useT } from "../../../i18n/VerticalProvider";
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  formatPhoneLocalDisplay,
  isPhoneLocalComplete,
  normalizePhoneLocal,
  phonePlaceholder,
  type PhoneCountryCode,
} from "../../../utility/phone";
import { BOOKING_PRIMARY, BOOKING_PRIMARY_HOVER, BOOKING_RADIUS, PILL_RADIUS } from "../theme";

export interface WaitlistDialogProps {
  open: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (data: { name: string; phone: string; comment: string }) => void;
}

/**
 * «Сообщите, когда освободится» — выход из тупика «свободных окон нет».
 *
 * Обещаем ровно то, что делает система: перезвонит живой человек. Никаких
 * «пришлём SMS автоматически» — авто-уведомлений в v1 нет, и обещать их
 * гостю нельзя.
 */
export const WaitlistDialog: React.FC<WaitlistDialogProps> = ({
  open,
  submitting,
  error,
  onClose,
  onSubmit,
}) => {
  const { t } = useT("waitlist");
  const [name, setName] = React.useState("");
  const [country, setCountry] = React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [phone, setPhone] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [showPhoneError, setShowPhoneError] = React.useState(false);

  const phoneOk = isPhoneLocalComplete(country, phone);
  const canSubmit = phoneOk && name.trim().length > 1 && !submitting;

  const handleSubmit = () => {
    if (!phoneOk) {
      setShowPhoneError(true);
      return;
    }
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      phone: country + phone.replace(/\D/g, ""),
      comment: comment.trim(),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      PaperProps={{ sx: { maxWidth: 420, width: "100%", m: 2, borderRadius: BOOKING_RADIUS } }}
    >
      <DialogTitle sx={{ pb: 0.5, fontWeight: 700 }}>{t("publicSite.cta")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("publicSite.noSlotsText")}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={1.5}>
          <TextField
            label={t("publicSite.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
          />

          <Stack direction="row" spacing={1}>
            <PhoneCountryCodeSelect value={country} onChange={setCountry} />
            <TextField
              label={t("publicSite.phone")}
              value={formatPhoneLocalDisplay(country, phone)}
              onChange={(e) => setPhone(normalizePhoneLocal(country, e.target.value))}
              placeholder={phonePlaceholder(country)}
              error={showPhoneError && !phoneOk}
              fullWidth
              size="small"
              inputMode="tel"
            />
          </Stack>

          <TextField
            label={t("publicSite.comment")}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("form.commentPlaceholder")}
            multiline
            minRows={2}
            fullWidth
            size="small"
          />
        </Stack>

        <Box sx={{ mt: 2.5 }}>
          <Button
            fullWidth
            variant="contained"
            disabled={!canSubmit}
            onClick={handleSubmit}
            sx={{
              borderRadius: PILL_RADIUS,
              py: 1.25,
              textTransform: "none",
              fontWeight: 600,
              bgcolor: BOOKING_PRIMARY,
              "&:hover": { bgcolor: BOOKING_PRIMARY_HOVER },
            }}
          >
            {t("publicSite.submit")}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default WaitlistDialog;
