import React from "react";
import { Alert, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../../../api/client";
import {
  createPatientInteraction,
  type InteractionChannel,
  type InteractionOutcome,
} from "../../../api/programs";
import { AppButton } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { useT } from "../../../i18n/VerticalProvider";
import type { EnrollmentTarget } from "../enrollmentTarget";

const CHANNELS: InteractionChannel[] = ["call", "whatsapp", "sms", "in_person", "note"];
const OUTCOMES: InteractionOutcome[] = ["answered", "no_answer", "callback", "scheduled", "informed"];

interface InteractionDialogProps {
  open: boolean;
  scope: ActiveScope;
  target: EnrollmentTarget;
  onClose: () => void;
  onDone: () => void;
}

/** Быстрая отметка касания прямо из реестра (звонок, сообщение, заметка). */
export const InteractionDialog: React.FC<InteractionDialogProps> = ({ open, scope, target, onClose, onDone }) => {
  const { t } = useT("registry");
  const { enqueueSnackbar } = useSnackbar();
  const [channel, setChannel] = React.useState<InteractionChannel>("call");
  const [outcome, setOutcome] = React.useState<InteractionOutcome>("answered");
  const [subject, setSubject] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setChannel("call");
    setOutcome("answered");
    setSubject("");
    setNotes("");
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => createPatientInteraction(scope, target.enrollmentId, {
      occurredAt: new Date().toISOString(),
      channel,
      outcome,
      subject: subject.trim() || t(`channels.${channel}`),
      notes: notes.trim(),
    }),
    onSuccess: () => {
      enqueueSnackbar(t("interaction.done"), { variant: "success" });
      onDone();
    },
  });

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t("interaction.title")} — {target.patientName}
      </DialogTitle>
      <DialogContent>
        <Stack gap={1.5} sx={{ mt: 0.5 }}>
          <Stack direction="row" gap={1}>
            <TextField
              select
              size="small"
              fullWidth
              label={t("interaction.channel")}
              value={channel}
              onChange={(e) => setChannel(e.target.value as InteractionChannel)}
            >
              {CHANNELS.map((key) => (
                <MenuItem key={key} value={key}>
                  {t(`channels.${key}`)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              fullWidth
              label={t("interaction.outcome")}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as InteractionOutcome)}
            >
              {OUTCOMES.map((key) => (
                <MenuItem key={key} value={key}>
                  {t(`interaction.outcomes.${key}`)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            size="small"
            label={t("interaction.subject")}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            inputProps={{ maxLength: 255 }}
          />
          <TextField
            size="small"
            label={t("interaction.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={2}
          />
          {mutation.error && <Alert severity="error">{getErrorMessage(mutation.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={mutation.isPending}>
          {t("wizard.close")}
        </AppButton>
        <AppButton variant="contained" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {t("interaction.submit")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};
