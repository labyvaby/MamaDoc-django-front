import React from "react";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { djangoQueryKeys } from "../../api/queryKeys";
import {
  createReactionCheck,
  getReactionChecks,
  updateReactionCheck,
  type FollowupWindow,
  type VaccinationRecord,
} from "../../api/vaccinations";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { AppButton, CustomDatePicker } from "../ui";
import { ChoiceChips } from "./ChoiceChips";
import { FOLLOWUP_STATE_META, SITE_LOOK_PRESETS, parseSizeMm } from "./reactionMeta";

const LOOK_OPTIONS = SITE_LOOK_PRESETS.map((value) => ({ value, label: value }));
const fmt = (date: string) => dayjs(date).format("DD.MM.YYYY");

interface CheckFormProps {
  term: FollowupWindow;
  pending: boolean;
  onSave: (value: { checkedOn: string; sizeMm: number | null; description: string }) => void;
  onCancel: () => void;
}

/** Осмотр в один срок: дата, размер, что видно — частое кнопками. */
const CheckForm: React.FC<CheckFormProps> = ({ term, pending, onSave, onCancel }) => {
  const [checkedOn, setCheckedOn] = React.useState<Dayjs | null>(
    term.check ? dayjs(term.check.checkedOn) : dayjs(),
  );
  const [size, setSize] = React.useState(term.check?.sizeMm != null ? String(term.check.sizeMm) : "");
  const [description, setDescription] = React.useState(term.check?.description ?? "");
  const parsed = parseSizeMm(size);
  const canSave = Boolean(checkedOn?.isValid()) && parsed.error == null;

  return (
    <Stack spacing={1.5} sx={{ mt: 1.25 }}>
      <Stack direction="row" gap={1.5}>
        <CustomDatePicker
          label="Осмотрено"
          value={checkedOn}
          onChange={(value) => setCheckedOn(value as Dayjs | null)}
          maxDate={dayjs()}
          slotProps={{ textField: { size: "small", fullWidth: true } }}
        />
        <TextField
          size="small"
          label="Размер"
          value={size}
          onChange={(event) => setSize(event.target.value.replace(/[^\d]/g, ""))}
          error={parsed.error != null}
          helperText={parsed.error ?? undefined}
          inputProps={{ inputMode: "numeric" }}
          InputProps={{ endAdornment: <InputAdornment position="end">мм</InputAdornment> }}
          sx={{ width: 130, flexShrink: 0 }}
        />
      </Stack>
      <ChoiceChips
        options={LOOK_OPTIONS}
        value={LOOK_OPTIONS.some((option) => option.value === description) ? description : ""}
        onChange={(value) => setDescription(value)}
        ariaLabel="Что видно"
      />
      <TextField
        size="small"
        label="Что видно на месте прививки"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        fullWidth
      />
      <Stack direction="row" gap={1} justifyContent="flex-end">
        <AppButton size="small" variant="text" onClick={onCancel} disabled={pending}>
          Отмена
        </AppButton>
        <AppButton
          size="small"
          variant="contained"
          disabled={!canSave || pending}
          onClick={() =>
            onSave({
              checkedOn: checkedOn!.format("YYYY-MM-DD"),
              sizeMm: parsed.value,
              description: description.trim(),
            })
          }
        >
          Сохранить
        </AppButton>
      </Stack>
    </Stack>
  );
};

interface ReactionChecksDialogProps {
  /** Прививка, у вакцины которой есть сроки осмотра; null — окно закрыто. */
  record: VaccinationRecord | null;
  canRecord: boolean;
  onClose: () => void;
}

/** Сетка БЦЖ: осмотр места прививки в сроки после неё (от даты прививки). */
export const ReactionChecksDialog: React.FC<ReactionChecksDialogProps> = ({ record, canRecord, onClose }) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<string | null>(null);
  const recordId = record?.id ?? 0;
  const queryKey = djangoQueryKeys.vaccinations.reactionChecks(recordId, orgId);

  React.useEffect(() => setEditing(null), [record]);

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getReactionChecks(recordId, orgId, signal),
    enabled: record != null,
  });

  const mutation = useMutation({
    mutationFn: (arg: {
      term: FollowupWindow;
      value: { checkedOn: string; sizeMm: number | null; description: string };
    }) =>
      arg.term.check
        ? updateReactionCheck(recordId, arg.term.check.id, arg.value, orgId)
        : createReactionCheck(recordId, arg.term.key, arg.value, orgId),
    onSuccess: (grid) => {
      queryClient.setQueryData(queryKey, grid);
      setEditing(null);
    },
  });

  const windows = query.data?.windows ?? [];

  return (
    <Dialog open={record != null} onClose={mutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Осмотр места прививки
        {record && (
          <Typography variant="body2" color="text.secondary">
            {record.vaccineName} от {fmt(record.administeredAt)} · сроки считаются от даты прививки
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        {query.isError ? (
          <Alert severity="error">Не удалось загрузить сетку</Alert>
        ) : query.isLoading ? (
          <Stack spacing={1}>
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} variant="rounded" height={52} />
            ))}
          </Stack>
        ) : windows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            У вакцины не заданы сроки осмотра.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {mutation.isError && (
              <Alert severity="error">
                {mutation.error instanceof Error ? mutation.error.message : "Не удалось сохранить"}
              </Alert>
            )}
            {windows.map((term) => {
              const meta = FOLLOWUP_STATE_META[term.state];
              const check = term.check;
              return (
                <Box
                  key={term.key}
                  sx={{ px: 1.5, py: 1, border: 1, borderColor: "divider", borderRadius: "10px" }}
                >
                  <Stack direction="row" alignItems="center" gap={1.5}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {term.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {check
                          ? [
                              fmt(check.checkedOn),
                              check.sizeMm != null ? `${check.sizeMm} мм` : "",
                              check.description,
                              check.checkedBy?.fullName ?? "",
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : `${fmt(term.dueFrom)} – ${fmt(term.dueTo)}`}
                      </Typography>
                    </Box>
                    <Chip size="small" color={meta.tone} variant={term.state === "done" ? "filled" : "outlined"} label={meta.label} />
                    {canRecord && editing !== term.key && (
                      <AppButton size="small" variant="text" onClick={() => setEditing(term.key)}>
                        {check ? "Изменить" : "Внести"}
                      </AppButton>
                    )}
                  </Stack>
                  {editing === term.key && (
                    <CheckForm
                      term={term}
                      pending={mutation.isPending}
                      onSave={(value) => mutation.mutate({ term, value })}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
      </DialogContent>
      <Stack direction="row" sx={{ px: 3, pb: 2, justifyContent: "flex-end" }}>
        <AppButton variant="outlined" onClick={onClose} disabled={mutation.isPending}>
          Закрыть
        </AppButton>
      </Stack>
    </Dialog>
  );
};
