import React from "react";
import {
  Alert,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { DJANGO_REFERENCE_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import {
  createTuberculinTest,
  getTuberculinThresholds,
  updateTuberculinTest,
  type TuberculinKind,
  type TuberculinResult,
  type TuberculinTest,
} from "../../api/vaccinations";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import { AppButton, CustomDatePicker } from "../ui";
import { ChoiceChips } from "./ChoiceChips";
import {
  TUBERCULIN_KIND_OPTIONS,
  TUBERCULIN_RESULT_OPTIONS,
  optionLabel,
  parseSizeMm,
  suggestTuberculinResult,
} from "./reactionMeta";

const asDate = (value: Dayjs | null): string | null =>
  value && value.isValid() ? value.format("YYYY-MM-DD") : null;

interface TuberculinDialogProps {
  open: boolean;
  patientId: number;
  /** null — новая проба. */
  test: TuberculinTest | null;
  onClose: () => void;
}

/**
 * Манту или Диаскинтест: постановка (дата, серия) и оценка (дата, размер,
 * результат). Результат выбирает медсестра; система подсказывает его по
 * размеру и порогам клиники.
 */
export const TuberculinDialog: React.FC<TuberculinDialogProps> = ({ open, patientId, test, onClose }) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const { activeBranch } = usePermissions();
  const [kind, setKind] = React.useState<TuberculinKind>("mantoux");
  const [performedOn, setPerformedOn] = React.useState<string | null>(null);
  const [batchNumber, setBatchNumber] = React.useState("");
  const [readOn, setReadOn] = React.useState<string | null>(null);
  const [size, setSize] = React.useState("");
  const [result, setResult] = React.useState<TuberculinResult | "">("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setKind(test?.kind ?? "mantoux");
    setPerformedOn(test?.performedOn ?? dayjs().format("YYYY-MM-DD"));
    setBatchNumber(test?.batchNumber ?? "");
    setReadOn(test?.readOn ?? null);
    setSize(test?.indurationMm != null ? String(test.indurationMm) : "");
    setResult(test?.result ?? "");
    setNotes(test?.notes ?? "");
  }, [open, test]);

  const thresholdsQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.tuberculinThresholds(orgId),
    queryFn: ({ signal }) => getTuberculinThresholds(orgId, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const parsedSize = parseSizeMm(size);
  const suggestion = suggestTuberculinResult(kind, parsedSize.value, thresholdsQuery.data);
  const readBefore = Boolean(readOn && performedOn && readOn < performedOn);
  const canSave = Boolean(performedOn) && parsedSize.error == null && !readBefore;

  const mutation = useMutation({
    mutationFn: () => {
      const common = {
        performedOn: performedOn!,
        batchNumber: batchNumber.trim(),
        readOn,
        indurationMm: parsedSize.value,
        result,
        notes: notes.trim(),
      };
      return test
        ? updateTuberculinTest(test.id, common, orgId)
        : createTuberculinTest(
            { ...common, patientId, kind, branchId: activeBranch?.id ?? null },
            orgId,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.vaccinations.tuberculinTests(patientId, orgId),
      });
      onClose();
    },
  });

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{test ? "Проба" : "Новая проба"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {mutation.isError && (
            <Alert severity="error">
              {mutation.error instanceof Error ? mutation.error.message : "Не удалось сохранить"}
            </Alert>
          )}
          <ChoiceChips
            options={TUBERCULIN_KIND_OPTIONS}
            value={kind}
            onChange={(value) => value && setKind(value)}
            disabled={test != null}
            ariaLabel="Проба"
          />
          <Stack direction="row" gap={1.5}>
            <CustomDatePicker
              label="Поставлена"
              value={performedOn ? dayjs(performedOn) : null}
              onChange={(value) => setPerformedOn(asDate(value as Dayjs | null))}
              maxDate={dayjs()}
              slotProps={{ textField: { size: "small", fullWidth: true, required: true } }}
            />
            <TextField
              size="small"
              label="Серия"
              value={batchNumber}
              onChange={(event) => setBatchNumber(event.target.value)}
              fullWidth
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Оценка — через 72 часа
          </Typography>
          <Stack direction="row" gap={1.5}>
            <CustomDatePicker
              label="Оценена"
              value={readOn ? dayjs(readOn) : null}
              onChange={(value) => setReadOn(asDate(value as Dayjs | null))}
              maxDate={dayjs()}
              slotProps={{
                textField: {
                  size: "small",
                  fullWidth: true,
                  error: readBefore,
                  helperText: readBefore ? "Раньше постановки" : undefined,
                },
              }}
            />
            <TextField
              size="small"
              label="Инфильтрат"
              value={size}
              onChange={(event) => {
                setSize(event.target.value.replace(/[^\d]/g, ""));
                // Размер вводят в день оценки — дату подставим, её можно поправить.
                if (!readOn) setReadOn(dayjs().format("YYYY-MM-DD"));
              }}
              error={parsedSize.error != null}
              helperText={parsedSize.error ?? undefined}
              inputProps={{ inputMode: "numeric" }}
              InputProps={{ endAdornment: <InputAdornment position="end">мм</InputAdornment> }}
              sx={{ width: 150, flexShrink: 0 }}
            />
          </Stack>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
              Результат
            </Typography>
            <ChoiceChips
              options={TUBERCULIN_RESULT_OPTIONS}
              value={result}
              onChange={setResult}
              hint={suggestion}
              ariaLabel="Результат"
            />
            {suggestion && result !== suggestion && (
              <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  По размеру {parsedSize.value} мм — {optionLabel(TUBERCULIN_RESULT_OPTIONS, suggestion).toLowerCase()}
                </Typography>
                <AppButton size="small" variant="text" onClick={() => setResult(suggestion)}>
                  Выбрать
                </AppButton>
              </Stack>
            )}
          </Box>
          <TextField
            size="small"
            label="Примечание"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <Stack direction="row" spacing={1.5} sx={{ px: 3, pb: 2, justifyContent: "flex-end" }}>
        <AppButton variant="outlined" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton variant="contained" disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
          Сохранить
        </AppButton>
      </Stack>
    </Dialog>
  );
};
