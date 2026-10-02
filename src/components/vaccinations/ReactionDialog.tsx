import React from "react";
import { Alert, Dialog, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { djangoQueryKeys } from "../../api/queryKeys";
import {
  updateRecord,
  type GeneralReaction,
  type LocalReaction,
  type VaccinationRecord,
} from "../../api/vaccinations";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { AppButton } from "../ui";
import { DoseReactionFields } from "./DoseReactionFields";
import { doseInput, parseDoseMl } from "./reactionMeta";

interface ReactionDialogProps {
  /** Проведённая прививка; null — окно закрыто. */
  record: VaccinationRecord | null;
  onClose: () => void;
  /** Сильная реакция → оформить медотвод на эту вакцину. */
  onExemption?: (record: VaccinationRecord) => void;
}

/** «Доза и реакция»: объём, местная и общая реакция, наблюдение словами. */
export const ReactionDialog: React.FC<ReactionDialogProps> = ({ record, onClose, onExemption }) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const [doseMl, setDoseMl] = React.useState("");
  const [localReaction, setLocalReaction] = React.useState<LocalReaction | "">("");
  const [generalReaction, setGeneralReaction] = React.useState<GeneralReaction | "">("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!record) return;
    setDoseMl(doseInput(record.doseMl));
    setLocalReaction(record.localReaction ?? "");
    setGeneralReaction(record.generalReaction ?? "");
    setNotes(record.reactionNotes ?? "");
  }, [record]);

  const dose = parseDoseMl(doseMl);
  const mutation = useMutation({
    mutationFn: () =>
      updateRecord(
        record!.id,
        {
          doseMl: dose.value,
          localReaction,
          generalReaction,
          reactionNotes: notes.trim(),
        },
        orgId,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
      onClose();
    },
  });

  return (
    <Dialog open={record != null} onClose={mutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Доза и реакция</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {record && (
            <Typography variant="body2" color="text.secondary">
              {record.vaccineName} · {dayjs(record.administeredAt).format("DD.MM.YYYY")}
            </Typography>
          )}
          {mutation.isError && (
            <Alert severity="error">
              {mutation.error instanceof Error ? mutation.error.message : "Не удалось сохранить"}
            </Alert>
          )}
          <DoseReactionFields
            doseMl={doseMl}
            onDoseMl={setDoseMl}
            localReaction={localReaction}
            onLocalReaction={setLocalReaction}
            generalReaction={generalReaction}
            onGeneralReaction={setGeneralReaction}
            onExemption={record && onExemption ? () => onExemption(record) : undefined}
          />
          <TextField
            size="small"
            label="Наблюдение"
            fullWidth
            multiline
            minRows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Например: покраснение 1 см, t 37,5 на следующий день"
          />
        </Stack>
      </DialogContent>
      <Stack direction="row" spacing={1.5} sx={{ px: 3, pb: 2, justifyContent: "flex-end" }}>
        <AppButton variant="outlined" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          disabled={mutation.isPending || dose.error != null}
          onClick={() => mutation.mutate()}
        >
          Сохранить
        </AppButton>
      </Stack>
    </Dialog>
  );
};
