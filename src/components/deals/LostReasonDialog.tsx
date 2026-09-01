import React from "react";
import {
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";

import { AppButton } from "../ui";
import { useT } from "../../i18n/VerticalProvider";
import type { DealDictionaryItem } from "../../api/deals";

type LostReasonDialogProps = {
  open: boolean;
  /** Активные причины организации; пустой справочник — повод отправить в настройки. */
  reasons: DealDictionaryItem[];
  dealName?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reasonId: number, note: string) => void;
};

/**
 * Причина потери при переносе в этап `lost`.
 *
 * Спрашиваем до запроса, а не после: бэк отклоняет такой перенос без причины
 * (400), и карточка иначе прыгала бы назад с непонятной ошибкой.
 */
const LostReasonDialog: React.FC<LostReasonDialogProps> = ({
  open,
  reasons,
  dealName,
  busy,
  onClose,
  onConfirm,
}) => {
  const { t } = useT("deals");
  const [reasonId, setReasonId] = React.useState<number | "">("");
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setReasonId("");
      setNote("");
      setTouched(false);
    }
  }, [open]);

  const submit = () => {
    if (reasonId === "") {
      setTouched(true);
      return;
    }
    onConfirm(reasonId, note.trim());
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>{t("lost.title")}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 0.5 }}>
          {dealName ? (
            <TextField label={t("create.name")} value={dealName} disabled size="small" />
          ) : null}

          {reasons.length === 0 ? (
            <Alert severity="warning" variant="outlined">
              {t("lost.empty")}
            </Alert>
          ) : (
            <TextField
              select
              size="small"
              label={t("lost.reason")}
              value={reasonId}
              onChange={(e) => {
                setReasonId(e.target.value === "" ? "" : Number(e.target.value));
                setTouched(false);
              }}
              error={touched && reasonId === ""}
              helperText={touched && reasonId === "" ? t("lost.reasonRequired") : " "}
              autoFocus
            >
              {reasons.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            size="small"
            label={t("lost.note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={busy}>
          Отмена
        </AppButton>
        <AppButton
          onClick={submit}
          disabled={busy || reasons.length === 0}
          loading={busy}
        >
          {t("lost.submit")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default LostReasonDialog;
