import React from "react";
import {
  Alert,
  Box,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  createProgramModuleRecord,
  getProgramModuleRecords,
  updateProgramModuleRecord,
  type EffectiveProgramModule,
  type ProgramModuleRecord,
  type ProgramFieldDefinition,
} from "../../api/programs";
import { djangoQueryKeys } from "../../api/queryKeys";
import { AppButton, AppCard, CustomDateTimePicker, ListEmptyState } from "../../components/ui";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { subtleBg } from "../../theme/uiHelpers";

type FieldDefinition = ProgramFieldDefinition;

const MODULE_FIELDS: Array<{ match: string[]; fields: FieldDefinition[] }> = [
  {
    match: ["vacc"],
    fields: [
      { key: "vaccineName", label: "Вакцина" },
      { key: "dose", label: "Доза" },
      { key: "batchNumber", label: "Серия препарата" },
      { key: "nextDueDate", label: "Следующая вакцинация" },
    ],
  },
  {
    match: ["growth", "measure"],
    fields: [
      { key: "heightCm", label: "Рост", type: "number", suffix: "см" },
      { key: "weightKg", label: "Вес", type: "number", suffix: "кг" },
      { key: "headCircumferenceCm", label: "Окружность головы", type: "number", suffix: "см" },
    ],
  },
  {
    match: ["eye", "ophthalm"],
    fields: [
      { key: "visualAcuityRight", label: "Острота зрения — правый глаз" },
      { key: "visualAcuityLeft", label: "Острота зрения — левый глаз" },
      { key: "recommendation", label: "Рекомендация" },
    ],
  },
  {
    match: ["bone", "ortho"],
    fields: [
      { key: "posture", label: "Осанка" },
      { key: "feet", label: "Стопы" },
      { key: "recommendation", label: "Рекомендация" },
    ],
  },
  {
    match: ["lab", "analysis"],
    fields: [
      { key: "testName", label: "Исследование" },
      { key: "result", label: "Результат" },
      { key: "referenceRange", label: "Референс" },
    ],
  },
  {
    match: ["fitness", "training"],
    fields: [
      { key: "durationMinutes", label: "Продолжительность", type: "number", suffix: "мин" },
      { key: "trainer", label: "Тренер" },
      { key: "result", label: "Результат" },
    ],
  },
];

function fieldsFor(module: EffectiveProgramModule): FieldDefinition[] {
  const configured = fieldsFromSettings(module.settings);
  if (configured.length > 0) return configured;
  const key = `${module.code} ${module.moduleType}`.toLowerCase();
  return MODULE_FIELDS.find((item) => item.match.some((part) => key.includes(part)))?.fields ?? [
    { key: "result", label: "Результат" },
  ];
}

function fieldsFromSettings(settings: Record<string, unknown>): FieldDefinition[] {
  const fields = settings.fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter((field): field is FieldDefinition => (
    typeof field === "object"
    && field !== null
    && typeof (field as FieldDefinition).key === "string"
    && typeof (field as FieldDefinition).label === "string"
  ));
}

function displayValue(value: unknown, field: FieldDefinition): string | null {
  if (value === null || value === undefined || value === "") return null;
  return `${String(value)}${field.suffix ? ` ${field.suffix}` : ""}`;
}

interface RecordDrawerProps {
  open: boolean;
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  record: ProgramModuleRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

const RecordDrawer: React.FC<RecordDrawerProps> = ({ open, enrollmentId, module, scope, record, onClose, onSaved }) => {
  const { enqueueSnackbar } = useSnackbar();
  const fields = React.useMemo(
    () => record ? fieldsFromSettings(record.schemaSnapshot) : fieldsFor(module),
    [module, record],
  );
  const [occurredAt, setOccurredAt] = React.useState<Dayjs | null>(dayjs());
  const [title, setTitle] = React.useState("");
  const [status, setStatus] = React.useState("completed");
  const [notes, setNotes] = React.useState("");
  const [data, setData] = React.useState<Record<string, string | boolean>>({});

  React.useEffect(() => {
    if (!open) return;
    setOccurredAt(record ? dayjs(record.occurredAt) : dayjs());
    setTitle(record?.title ?? "");
    setStatus(record?.status ?? "completed");
    setNotes(record?.notes ?? "");
    setData(Object.fromEntries(
      fields.map((field) => [
        field.key,
        field.type === "boolean"
          ? Boolean(record?.data[field.key])
          : String(record?.data[field.key] ?? ""),
      ]),
    ));
  }, [fields, open, record]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
      occurredAt: occurredAt!.toISOString(),
      title: title.trim(),
      status,
      notes: notes.trim(),
      data: Object.fromEntries(
        fields
          .filter((field) => (
            field.type === "boolean"
            || String(data[field.key] ?? "").trim()
          ))
          .map((field) => [
            field.key,
            field.type === "boolean"
              ? Boolean(data[field.key])
              : field.type === "number"
                ? Number(data[field.key])
                : String(data[field.key] ?? "").trim(),
          ]),
      ),
      };
      return record
        ? updateProgramModuleRecord(scope, enrollmentId, record.id, payload)
        : createProgramModuleRecord(scope, enrollmentId, {
            ...payload,
            programModuleId: module.id,
          });
    },
    onSuccess: () => {
      enqueueSnackbar(record ? "Запись обновлена" : "Запись сохранена", { variant: "success" });
      onSaved();
      onClose();
    },
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600}>{record ? "Редактирование записи" : "Новая запись"}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap display="block">{module.name}</Typography>
        </Box>
        <IconButton onClick={mutation.isPending ? undefined : onClose} aria-label="Закрыть" edge="end"><CloseOutlined /></IconButton>
      </Stack>
      <Divider />

      <Stack gap={1.5} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, py: 2 }}>
        {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
        <CustomDateTimePicker
          label="Дата и время"
          value={occurredAt}
          onChange={setOccurredAt}
          slotProps={{ textField: { fullWidth: true } }}
        />
        <TextField label="Название записи" value={title} onChange={(event) => setTitle(event.target.value)} required fullWidth />
        <TextField select label="Статус" value={status} onChange={(event) => setStatus(event.target.value)} fullWidth>
          <MenuItem value="completed">Выполнено</MenuItem>
          <MenuItem value="planned">Запланировано</MenuItem>
          <MenuItem value="missed">Пропущено</MenuItem>
        </TextField>
        {fields.map((field) => field.type === "boolean" ? (
          <FormControlLabel
            key={field.key}
            control={(
              <Switch
                checked={Boolean(data[field.key])}
                onChange={(event) => setData((current) => ({ ...current, [field.key]: event.target.checked }))}
              />
            )}
            label={field.label}
          />
        ) : (
          <TextField
            key={field.key}
            label={field.label}
            type={field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : field.type === "number" ? "number" : "text"}
            value={data[field.key] ?? ""}
            onChange={(event) => setData((current) => ({ ...current, [field.key]: event.target.value }))}
            select={field.type === "select"}
            multiline={field.type === "textarea"}
            minRows={field.type === "textarea" ? 3 : undefined}
            required={field.required}
            slotProps={field.type === "number" ? { htmlInput: { min: 0, step: "any" } } : undefined}
            fullWidth
          >
            {field.type === "select" && field.options?.map((option) => (
              <MenuItem key={String(option)} value={option}>{String(option)}</MenuItem>
            ))}
          </TextField>
        ))}
        <TextField label="Заметка" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={3} fullWidth />
      </Stack>

      <Divider />
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2.5, py: 1.5 }}>
        <AppButton onClick={onClose} disabled={mutation.isPending}>Отмена</AppButton>
        <AppButton
          variant="contained"
          startIcon={record ? <EditOutlined /> : <AddOutlined />}
          loading={mutation.isPending}
          disabled={!occurredAt?.isValid() || !title.trim()}
          onClick={() => mutation.mutate()}
        >
          {record ? "Сохранить" : "Добавить"}
        </AppButton>
      </Stack>
    </Drawer>
  );
};

interface ModuleRecordsProps {
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  canManage: boolean;
  icon: React.ReactNode;
}

export const ModuleRecords: React.FC<ModuleRecordsProps> = ({ enrollmentId, module, scope, canManage, icon }) => {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingRecord, setEditingRecord] = React.useState<ProgramModuleRecord | null>(null);
  const queryKey = djangoQueryKeys.programs.records(enrollmentId, module.id, scope);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getProgramModuleRecords(scope, enrollmentId, module.id, signal),
    enabled: scope.isReady && scope.orgReady,
  });
  const fields = fieldsFor(module);

  return (
    <>
      <AppCard
        variant="outlined"
        title={module.name}
        subheader={typeof module.settings.description === "string" ? module.settings.description : module.moduleType}
        headerActions={canManage ? (
          <AppButton variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setDrawerOpen(true)}>
            Добавить запись
          </AppButton>
        ) : undefined}
      >
        {query.error ? (
          <Alert severity="error">Не удалось загрузить записи раздела.</Alert>
        ) : query.isLoading ? (
          <Typography variant="body2" color="text.secondary">Загрузка записей…</Typography>
        ) : !query.data?.results.length ? (
          <ListEmptyState
            icon={icon}
            title="Записей пока нет"
            description="Добавьте первый результат, осмотр или запланированное событие."
            action={canManage ? <AppButton variant="outlined" startIcon={<AddOutlined />} onClick={() => setDrawerOpen(true)}>Добавить запись</AppButton> : undefined}
          />
        ) : (
          <Stack gap={1.25}>
            {query.data.results.map((record) => {
              const recordFields = fieldsFromSettings(record.schemaSnapshot);
              const details = (recordFields.length > 0 ? recordFields : fields)
                .map((field) => ({ label: field.label, value: displayValue(record.data[field.key], field) }))
                .filter((item) => item.value);
              return (
                <Box
                  key={record.id}
                  sx={(theme) => ({
                    p: 1.75,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: "10px",
                    bgcolor: subtleBg(theme),
                  })}
                >
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600}>{record.title}</Typography>
                      <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                        <Stack direction="row" gap={0.5} alignItems="center">
                          <CalendarMonthOutlined sx={{ fontSize: 16 }} color="action" />
                          <Typography variant="caption" color="text.secondary">{dayjs(record.occurredAt).format("DD.MM.YYYY HH:mm")}</Typography>
                        </Stack>
                        {record.createdByName && (
                          <Stack direction="row" gap={0.5} alignItems="center">
                            <PersonOutlineOutlined sx={{ fontSize: 16 }} color="action" />
                            <Typography variant="caption" color="text.secondary">{record.createdByName}</Typography>
                          </Stack>
                        )}
                      </Stack>
                    </Box>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <Chip
                        size="small"
                        color={record.status === "completed" ? "success" : "default"}
                        label={record.status === "completed" ? "Выполнено" : record.status === "planned" ? "Запланировано" : "Пропущено"}
                        sx={{ borderRadius: "7px" }}
                      />
                      {canManage && (
                        <IconButton
                          size="small"
                          aria-label={`Редактировать ${record.title}`}
                          onClick={() => { setEditingRecord(record); setDrawerOpen(true); }}
                        >
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </Stack>
                  {details.length > 0 && (
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1, mt: 1.25 }}>
                      {details.map((item) => (
                        <Box key={item.label}>
                          <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                          <Typography variant="body2" fontWeight={600}>{item.value}</Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                  {record.notes && (
                    <Stack direction="row" gap={0.75} sx={{ mt: 1.25 }}>
                      <NotesOutlined sx={{ fontSize: 17, mt: 0.15 }} color="action" />
                      <Typography variant="body2" color="text.secondary">{record.notes}</Typography>
                    </Stack>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
      </AppCard>

      <RecordDrawer
        open={drawerOpen}
        enrollmentId={enrollmentId}
        module={module}
        scope={scope}
        record={editingRecord}
        onClose={() => { setDrawerOpen(false); setEditingRecord(null); }}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey });
          void queryClient.invalidateQueries({
            queryKey: djangoQueryKeys.programs.upcoming(enrollmentId, scope),
          });
        }}
      />
    </>
  );
};

export default ModuleRecords;
