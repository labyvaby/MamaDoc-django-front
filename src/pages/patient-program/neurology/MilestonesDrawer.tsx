import React from "react";
import { Alert, Box, Divider, Drawer, IconButton, Stack, TextField, Typography } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import { createProgramModuleRecord, updateProgramModuleRecord, type EffectiveProgramModule, type ProgramModuleRecord } from "../../../api/programs";
import { AppButton, CustomDateTimePicker } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { MILESTONES_TITLE, type Sex } from "./neuroCatalog";
import { buildMilestonesData, changedMarks, markSources, type NeuroRecords } from "./neuroData";
import { readMarks, type MilestoneMark } from "./neuroMilestones";
import { ageLine, type AgeContext } from "./neuroNorms";
import { ChipGroup, Section } from "./NeuroControls";
import { MilestonePicker } from "./MilestonePicker";

const REPORTED = [
  { value: "parents", label: "Со слов родителей" },
  { value: "seen", label: "Видел на приёме" },
];

interface MilestonesDrawerProps {
  open: boolean;
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  /** Запись «Отметка вех развития» для правки; null — новая отметка. */
  record: ProgramModuleRecord | null;
  records: NeuroRecords;
  ages: AgeContext;
  sex: Sex;
  onClose: () => void;
  onSaved: () => void;
}

const withReported = (marks: Readonly<Record<string, MilestoneMark>>, reported: boolean): Record<string, MilestoneMark> =>
  Object.fromEntries(Object.entries(marks).map(([code, mark]) => [code, { ...mark, reported }]));

/**
 * «Отметить вехи» (ТЗ §5): дата, со слов родителей или на приёме, вехи
 * возраста и «Все вехи». Сохраняется новая запись «Отметка вех развития»
 * только с изменёнными вехами; без изменений кнопка неактивна.
 */
export const MilestonesDrawer: React.FC<MilestonesDrawerProps> = ({ open, enrollmentId, module, scope, record, records, ages, sex, onClose, onSaved }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [occurredAt, setOccurredAt] = React.useState<Dayjs | null>(dayjs());
  const [marks, setMarks] = React.useState<Record<string, MilestoneMark>>({});
  const [reported, setReported] = React.useState(true);
  const [notes, setNotes] = React.useState("");
  const initial = React.useMemo(() => (record ? readMarks(record.data.milestones) : {}), [record]);

  React.useEffect(() => {
    if (!open) return;
    setMarks(initial);
    const values = Object.values(initial);
    setReported(values.length ? values.every((mark) => mark.reported) : true);
    setOccurredAt(record ? dayjs(record.occurredAt) : dayjs().second(0).millisecond(0));
    setNotes(record?.notes ?? "");
  }, [open, record, initial]);

  const at = (occurredAt?.isValid() ? occurredAt : dayjs()).toISOString();
  const sources = React.useMemo(
    () => markSources(records, record?.id ?? null).filter((source) => !dayjs(source.at).isAfter(dayjs(at))),
    [records, record, at],
  );
  const current = withReported(marks, reported);
  const changed = changedMarks(current, initial);
  const removed = Object.keys(initial).some((code) => !(code in marks));
  const dirty =
    Object.keys(changed).length > 0 ||
    removed ||
    (record != null && (notes.trim() !== record.notes || !dayjs(record.occurredAt).isSame(occurredAt)));
  const canSave = Boolean(occurredAt?.isValid()) && dirty && (record != null || Object.keys(changed).length > 0);

  const mutation = useMutation({
    mutationFn: () => {
      const when = (occurredAt as Dayjs).toISOString();
      if (record) {
        return updateProgramModuleRecord(scope, enrollmentId, record.id, {
          occurredAt: when,
          notes: notes.trim(),
          data: buildMilestonesData(current, record.data),
        });
      }
      return createProgramModuleRecord(scope, enrollmentId, {
        programModuleId: module.id,
        occurredAt: when,
        title: MILESTONES_TITLE,
        status: "completed",
        notes: notes.trim(),
        data: buildMilestonesData(changed),
      });
    },
    onSuccess: () => {
      enqueueSnackbar(record ? "Отметки обновлены" : "Вехи отмечены", { variant: "success" });
      onSaved();
      onClose();
    },
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", md: 600 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600}>
            {record ? "Отметка вех" : "Отметить вехи"}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {ageLine(ages, at)}
          </Typography>
        </Box>
        <IconButton onClick={mutation.isPending ? undefined : onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />
      <Stack gap={2} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, py: 2 }}>
        {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
        <CustomDateTimePicker
          label="Дата отметки"
          value={occurredAt}
          onChange={setOccurredAt}
          minutesStep={1}
          slotProps={{ textField: { fullWidth: true, size: "small" } }}
        />
        <Section title="Откуда известно">
          <ChipGroup
            options={REPORTED}
            selected={[reported ? "parents" : "seen"]}
            onToggle={(value) => setReported(value === "parents")}
          />
        </Section>
        <MilestonePicker sources={sources} marks={marks} onChange={setMarks} ages={ages} at={at} sex={sex} reported={reported} />
        <TextField size="small" label="Заметка" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={2} fullWidth />
      </Stack>
      <Divider />
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ px: 2.5, py: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          {record ? "" : Object.keys(changed).length ? `Отмечено вех: ${Object.keys(changed).length}` : "Отметьте хотя бы одну веху"}
        </Typography>
        <Stack direction="row" gap={1}>
          <AppButton onClick={onClose} disabled={mutation.isPending}>
            Отмена
          </AppButton>
          <AppButton variant="contained" loading={mutation.isPending} disabled={!canSave} onClick={() => mutation.mutate()}>
            Сохранить
          </AppButton>
        </Stack>
      </Stack>
    </Drawer>
  );
};
