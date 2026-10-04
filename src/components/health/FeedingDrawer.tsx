import React from "react";
import { TextField } from "@mui/material";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  createFeedingPeriod,
  deleteFeedingPeriod,
  updateFeedingPeriod,
  type FeedingInput,
  type FeedingPeriod,
  type FeedingType,
} from "../../api/health";
import { ChipGroup, Section } from "../../pages/patient-program/vision/VisionControls";
import { AppButton, CustomDatePicker } from "../ui";
import { HealthDrawerShell } from "./HealthDrawerShell";
import { FEEDING_SWITCH_REASONS, FEEDING_TYPES, ageLabel, feedingNeedsReason } from "./healthMeta";
import { useHealthScope, useInvalidateHealth } from "./useHealth";

interface FeedingDrawerProps {
  open: boolean;
  patientId: number;
  birthDate: string | null;
  period: FeedingPeriod | null;
  /** Новому периоду — следующий вид после текущего. */
  suggestedType: FeedingType;
  onClose: () => void;
}

/** Период вскармливания: вид, с какого числа, причина перевода по коду 112/у. */
export const FeedingDrawer: React.FC<FeedingDrawerProps> = ({ open, patientId, birthDate, period, suggestedType, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const [form, setForm] = React.useState<FeedingInput>({
    feedingType: suggestedType,
    startedOn: dayjs().format("YYYY-MM-DD"),
    switchReason: "",
    notes: "",
  });

  React.useEffect(() => {
    if (!open) return;
    setForm(
      period
        ? { feedingType: period.feedingType, startedOn: period.startedOn, switchReason: period.switchReason, notes: period.notes }
        : { feedingType: suggestedType, startedOn: dayjs().format("YYYY-MM-DD"), switchReason: "", notes: "" },
    );
  }, [open, period, suggestedType]);

  const patch = (next: Partial<FeedingInput>) => setForm((current) => ({ ...current, ...next }));
  const needsReason = feedingNeedsReason(form.feedingType);
  const age = ageLabel(birthDate, form.startedOn);

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, switchReason: needsReason ? form.switchReason : ("" as const), notes: form.notes.trim() };
      return period ? updateFeedingPeriod(scope, patientId, period.id, payload) : createFeedingPeriod(scope, patientId, payload);
    },
    onSuccess: async () => {
      enqueueSnackbar(period ? "Период обновлён" : "Вскармливание отмечено", { variant: "success" });
      await invalidate();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteFeedingPeriod(scope, patientId, (period as FeedingPeriod).id),
    onSuccess: async () => {
      enqueueSnackbar("Период удалён", { variant: "success" });
      await invalidate();
      onClose();
    },
  });

  return (
    <HealthDrawerShell
      open={open}
      title={period ? "Период вскармливания" : "Вскармливание"}
      subtitle={age ? `С возраста ${age}` : undefined}
      pending={save.isPending || remove.isPending}
      error={save.error ?? remove.error}
      canSave={Boolean(form.startedOn)}
      saveLabel={period ? "Сохранить" : "Добавить"}
      onSave={() => save.mutate()}
      onClose={onClose}
      footerStart={
        period ? (
          <AppButton color="error" startIcon={<DeleteOutlineOutlined />} loading={remove.isPending} onClick={() => remove.mutate()}>
            Удалить
          </AppButton>
        ) : undefined
      }
    >
      <Section title="Вскармливание">
        <ChipGroup<FeedingType>
          options={FEEDING_TYPES}
          selected={[form.feedingType]}
          onToggle={(value) => patch({ feedingType: value })}
        />
      </Section>
      <CustomDatePicker
        label="С какого числа"
        value={form.startedOn ? dayjs(form.startedOn) : null}
        onChange={(value) => {
          const date = value as Dayjs | null;
          patch({ startedOn: date && date.isValid() ? date.format("YYYY-MM-DD") : "" });
        }}
        slotProps={{ textField: { size: "small", fullWidth: true } }}
      />
      {needsReason && (
        <Section title="Причина перевода">
          <ChipGroup
            options={FEEDING_SWITCH_REASONS}
            selected={form.switchReason ? [form.switchReason] : []}
            tone={() => "warning"}
            onToggle={(value) => patch({ switchReason: form.switchReason === value ? "" : value })}
          />
        </Section>
      )}
      <TextField
        size="small"
        label="Примечание"
        placeholder="Смесь, объём, особенности"
        value={form.notes}
        onChange={(event) => patch({ notes: event.target.value })}
        multiline
        minRows={2}
        fullWidth
      />
    </HealthDrawerShell>
  );
};
