import React from "react";
import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, CustomDatePicker } from "../ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import {
  createExemption,
  createRefusal,
  getVaccines,
  type ExemptionKind,
  type RefusalReason,
} from "../../api/vaccinations";
import { EXEMPTION_KIND_OPTIONS, REFUSAL_REASON_OPTIONS } from "../../pages/vaccinations/meta";

type BaseProps = {
  open: boolean;
  onClose: () => void;
  patientId: number | null;
  /** Подставить вакцину (например, из строки «Кому пора»). */
  vaccineId?: number | null;
};

const ALL = "all";

function useVaccineOptions(open: boolean) {
  const orgId = useApiOrgId();
  return useQuery({
    queryKey: djangoQueryKeys.vaccinations.vaccines({ orgId, picker: "exemption" }),
    queryFn: ({ signal }) => getVaccines({ organizationId: orgId }, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

/** Медотвод: вакцина (или все), вид, срок, причина — форма 5, раздел 2. */
export const ExemptionDialog: React.FC<BaseProps> = ({ open, onClose, patientId, vaccineId }) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const vaccines = useVaccineOptions(open);
  const [vaccine, setVaccine] = React.useState<string>(ALL);
  const [kind, setKind] = React.useState<ExemptionKind>("temporary");
  const [startsOn, setStartsOn] = React.useState<Dayjs | null>(dayjs());
  const [endsOn, setEndsOn] = React.useState<Dayjs | null>(dayjs().add(1, "month"));
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setVaccine(vaccineId != null ? String(vaccineId) : ALL);
    setKind("temporary");
    setStartsOn(dayjs());
    setEndsOn(dayjs().add(1, "month"));
    setReason("");
    setError(null);
  }, [open, vaccineId]);

  const mutation = useMutation({
    mutationFn: () =>
      createExemption(
        {
          patientId: patientId!,
          vaccineId: vaccine === ALL ? null : Number(vaccine),
          kind,
          startsOn: (startsOn ?? dayjs()).format("YYYY-MM-DD"),
          endsOn: kind === "permanent" || !endsOn ? null : endsOn.format("YYYY-MM-DD"),
          reason: reason.trim(),
        },
        orgId,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
      onClose();
    },
    onError: (e) => setError(errorText(e, "Не удалось сохранить медотвод")),
  });

  const invalid = !reason.trim() || (kind === "temporary" && !endsOn);

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Медотвод</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select size="small" label="Вакцина" value={vaccine} onChange={(e) => setVaccine(e.target.value)}>
            <MenuItem value={ALL}>Все прививки</MenuItem>
            {(vaccines.data ?? []).map((v) => (
              <MenuItem key={v.id} value={String(v.id)}>
                {v.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Вид"
            value={kind}
            onChange={(e) => setKind(e.target.value as ExemptionKind)}
          >
            {EXEMPTION_KIND_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1.5}>
            <CustomDatePicker
              label="С"
              value={startsOn}
              onChange={(v) => setStartsOn(v as Dayjs | null)}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
            {kind !== "permanent" && (
              <CustomDatePicker
                label={kind === "temporary" ? "По *" : "По"}
                value={endsOn}
                onChange={(v) => setEndsOn(v as Dayjs | null)}
                shortYearMode="future"
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            )}
          </Stack>
          <TextField
            size="small"
            label="Причина *"
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <Stack direction="row" spacing={1.5} sx={{ px: 3, pb: 2, justifyContent: "flex-end" }}>
        <AppButton variant="outlined" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          onClick={() => mutation.mutate()}
          disabled={invalid || patientId == null || mutation.isPending}
        >
          Сохранить
        </AppButton>
      </Stack>
    </Dialog>
  );
};

/** Отказ от прививки с причиной — форма 5, раздел 3. */
export const RefusalDialog: React.FC<BaseProps> = ({ open, onClose, patientId, vaccineId }) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const vaccines = useVaccineOptions(open);
  const [vaccine, setVaccine] = React.useState<string>(ALL);
  const [refusedOn, setRefusedOn] = React.useState<Dayjs | null>(dayjs());
  const [reason, setReason] = React.useState<RefusalReason>("safety_doubts");
  const [comment, setComment] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setVaccine(vaccineId != null ? String(vaccineId) : ALL);
    setRefusedOn(dayjs());
    setReason("safety_doubts");
    setComment("");
    setError(null);
  }, [open, vaccineId]);

  const mutation = useMutation({
    mutationFn: () =>
      createRefusal(
        {
          patientId: patientId!,
          vaccineId: vaccine === ALL ? null : Number(vaccine),
          refusedOn: (refusedOn ?? dayjs()).format("YYYY-MM-DD"),
          reason,
          comment: comment.trim(),
        },
        orgId,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
      onClose();
    },
    onError: (e) => setError(errorText(e, "Не удалось сохранить отказ")),
  });

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Отказ от прививки</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select size="small" label="Вакцина" value={vaccine} onChange={(e) => setVaccine(e.target.value)}>
            <MenuItem value={ALL}>Все прививки</MenuItem>
            {(vaccines.data ?? []).map((v) => (
              <MenuItem key={v.id} value={String(v.id)}>
                {v.name}
              </MenuItem>
            ))}
          </TextField>
          <CustomDatePicker
            label="Дата"
            value={refusedOn}
            onChange={(v) => setRefusedOn(v as Dayjs | null)}
            maxDate={dayjs()}
            slotProps={{ textField: { size: "small", fullWidth: true } }}
          />
          <TextField
            select
            size="small"
            label="Причина"
            value={reason}
            onChange={(e) => setReason(e.target.value as RefusalReason)}
          >
            {REFUSAL_REASON_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Комментарий"
            multiline
            minRows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <Stack direction="row" spacing={1.5} sx={{ px: 3, pb: 2, justifyContent: "flex-end" }}>
        <AppButton variant="outlined" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          onClick={() => mutation.mutate()}
          disabled={patientId == null || mutation.isPending}
        >
          Сохранить
        </AppButton>
      </Stack>
    </Dialog>
  );
};
