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
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import PublishOutlined from "@mui/icons-material/PublishOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import {
  createProgramConfigurationVersion,
  createProgramFromTemplate,
  getProgramConfigurationVersions,
  getPrograms,
  getProgramTemplates,
  publishProgramConfigurationVersion,
  updateProgramConfigurationVersion,
  type ProgramConfigurationSchema,
  type ProgramFieldDefinition,
} from "../../api/programs";
import { djangoQueryKeys } from "../../api/queryKeys";
import { AppButton } from "../../components/ui";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { subtleBg } from "../../theme/uiHelpers";

const FIELD_TYPES: Array<{ value: NonNullable<ProgramFieldDefinition["type"]>; label: string }> = [
  { value: "text", label: "Строка" },
  { value: "textarea", label: "Большой текст" },
  { value: "number", label: "Число" },
  { value: "date", label: "Дата" },
  { value: "datetime", label: "Дата и время" },
  { value: "boolean", label: "Да / нет" },
  { value: "select", label: "Выбор из списка" },
];

interface Props {
  open: boolean;
  programId: number | null;
  scope: ActiveScope;
  onClose: () => void;
  onChanged: () => void;
}

function programSchema(program: Awaited<ReturnType<typeof getPrograms>>["results"][number]): ProgramConfigurationSchema {
  return {
    program: {
      name: program.name,
      description: program.description,
      businessDomain: program.businessDomain,
      grantsVip: program.grantsVip,
      settings: program.settings,
    },
    modules: program.modules.map((module) => ({
      code: module.code,
      name: module.name,
      moduleType: module.moduleType,
      isEnabled: module.isEnabled,
      sortOrder: module.sortOrder,
      settings: module.settings,
    })),
  };
}

export const ProgramConstructorDrawer: React.FC<Props> = ({
  open,
  programId,
  scope,
  onClose,
  onChanged,
}) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [schema, setSchema] = React.useState<ProgramConfigurationSchema | null>(null);
  const [draftId, setDraftId] = React.useState<number | null>(null);
  const [savedSchema, setSavedSchema] = React.useState("");
  const [templateCode, setTemplateCode] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newCode, setNewCode] = React.useState("");

  const programsQuery = useQuery({
    queryKey: ["program-constructor", "programs", scope.organizationId],
    queryFn: ({ signal }) => getPrograms(scope, signal),
    enabled: open && programId !== null,
  });
  const templatesQuery = useQuery({
    queryKey: ["program-constructor", "templates", scope.organizationId],
    queryFn: ({ signal }) => getProgramTemplates(scope, signal),
    enabled: open && programId === null,
  });
  const versionsQuery = useQuery({
    queryKey: ["program-constructor", "versions", programId, scope.organizationId],
    queryFn: ({ signal }) => getProgramConfigurationVersions(scope, programId!, signal),
    enabled: open && programId !== null,
  });
  const program = programsQuery.data?.results.find((item) => item.id === programId) ?? null;

  React.useEffect(() => {
    if (!open || !program) return;
    const draft = versionsQuery.data?.results.find((item) => item.status === "draft");
    const nextSchema = draft?.schema ?? programSchema(program);
    setSchema(nextSchema);
    setSavedSchema(draft ? JSON.stringify(nextSchema) : "");
    setDraftId(draft?.id ?? null);
  }, [open, program, versionsQuery.data?.results]);

  React.useEffect(() => {
    if (!open || programId !== null || !templatesQuery.data?.results.length) return;
    const first = templatesQuery.data.results[0];
    setTemplateCode((current) => current || first.code);
    setNewName((current) => current || first.name);
    setNewCode((current) => current || `program-${Date.now().toString().slice(-6)}`);
  }, [open, programId, templatesQuery.data?.results]);

  const createMutation = useMutation({
    mutationFn: () => createProgramFromTemplate(scope, {
      templateCode,
      code: newCode.trim(),
      name: newName.trim(),
    }),
    onSuccess: () => {
      enqueueSnackbar("Программа создана из шаблона", { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["program-constructor", "programs"] });
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.all });
      onChanged();
      onClose();
    },
  });
  const saveMutation = useMutation({
    mutationFn: () => draftId === null
      ? createProgramConfigurationVersion(scope, programId!, schema!)
      : updateProgramConfigurationVersion(scope, programId!, draftId, schema!),
    onSuccess: (version) => {
      setDraftId(version.id);
      setSavedSchema(JSON.stringify(version.schema));
      enqueueSnackbar(`Черновик версии ${version.version} сохранён`, { variant: "success" });
      void versionsQuery.refetch();
    },
  });
  const publishMutation = useMutation({
    mutationFn: () => publishProgramConfigurationVersion(scope, programId!, draftId!),
    onSuccess: (version) => {
      enqueueSnackbar(`Версия ${version.version} опубликована`, { variant: "success" });
      setDraftId(null);
      void versionsQuery.refetch();
      onChanged();
    },
  });

  const updateModule = (index: number, patch: Partial<ProgramConfigurationSchema["modules"][number]>) => {
    setSchema((current) => current ? {
      ...current,
      modules: current.modules.map((module, moduleIndex) => (
        moduleIndex === index ? { ...module, ...patch } : module
      )),
    } : current);
  };
  const updateFields = (moduleIndex: number, fields: ProgramFieldDefinition[]) => {
    const module = schema!.modules[moduleIndex];
    updateModule(moduleIndex, { settings: { ...module.settings, fields } });
  };

  const busy = createMutation.isPending || saveMutation.isPending || publishMutation.isPending;
  const error = createMutation.error || saveMutation.error || publishMutation.error;
  const hasUnsavedChanges = schema !== null && JSON.stringify(schema) !== savedSchema;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: "100vw", sm: 720 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Box>
          <Typography variant="h6" fontWeight={600}>Конструктор программы</Typography>
          <Typography variant="caption" color="text.secondary">
            {programId === null ? "Создание из шаблона" : "Разделы, поля и версии конфигурации"}
          </Typography>
        </Box>
        <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть"><CloseOutlined /></IconButton>
      </Stack>
      <Divider />

      <Stack gap={2} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 2, sm: 2.5 }, py: 2 }}>
        {error && <Alert severity="error">{error.message}</Alert>}
        {programId === null ? (
          <>
            <TextField
              select
              label="Шаблон"
              value={templateCode}
              onChange={(event) => {
                const code = event.target.value;
                const template = templatesQuery.data?.results.find((item) => item.code === code);
                setTemplateCode(code);
                if (template) setNewName(template.name);
              }}
              fullWidth
            >
              {templatesQuery.data?.results.map((template) => (
                <MenuItem key={template.code} value={template.code}>
                  {template.name} · {template.businessDomain}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Название программы" value={newName} onChange={(event) => setNewName(event.target.value)} required fullWidth />
            <TextField label="Системный код" value={newCode} onChange={(event) => setNewCode(event.target.value)} required fullWidth helperText="Латиница, цифры и дефис" />
          </>
        ) : schema ? (
          <>
            <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "center" }}>
              <TextField
                label="Название"
                value={schema.program.name ?? ""}
                onChange={(event) => setSchema({ ...schema, program: { ...schema.program, name: event.target.value } })}
                fullWidth
              />
              <TextField
                label="Сфера"
                value={schema.program.businessDomain ?? "medical"}
                onChange={(event) => setSchema({ ...schema, program: { ...schema.program, businessDomain: event.target.value } })}
                sx={{ minWidth: { sm: 180 } }}
              />
            </Stack>
            <TextField
              label="Описание"
              value={schema.program.description ?? ""}
              onChange={(event) => setSchema({ ...schema, program: { ...schema.program, description: event.target.value } })}
              multiline
              minRows={2}
              fullWidth
            />
            <FormControlLabel
              control={<Switch checked={Boolean(schema.program.grantsVip)} onChange={(event) => setSchema({ ...schema, program: { ...schema.program, grantsVip: event.target.checked } })} />}
              label="Программа присваивает VIP-статус"
            />

            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="h6" fontWeight={700}>Разделы</Typography>
                <Typography variant="caption" color="text.secondary">Удалённый из новой версии раздел отключается, история сохраняется.</Typography>
              </Box>
              <AppButton
                startIcon={<AddOutlined />}
                onClick={() => setSchema({
                  ...schema,
                  modules: [...schema.modules, {
                    code: `module-${schema.modules.length + 1}`,
                    name: "Новый раздел",
                    moduleType: "custom",
                    isEnabled: true,
                    sortOrder: (schema.modules.length + 1) * 100,
                    settings: { fields: [] },
                  }],
                })}
              >
                Раздел
              </AppButton>
            </Stack>

            {schema.modules.map((module, moduleIndex) => {
              const fields = Array.isArray(module.settings.fields) ? module.settings.fields : [];
              return (
                <Box key={`${module.code}-${moduleIndex}`} sx={(theme) => ({ border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: subtleBg(theme), p: 1.75 })}>
                  <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "center" }}>
                    <TextField size="small" label="Название раздела" value={module.name} onChange={(event) => updateModule(moduleIndex, { name: event.target.value })} fullWidth />
                    <TextField size="small" label="Код" value={module.code} onChange={(event) => updateModule(moduleIndex, { code: event.target.value })} sx={{ minWidth: { sm: 160 } }} />
                    <IconButton aria-label={`Удалить ${module.name}`} onClick={() => setSchema({ ...schema, modules: schema.modules.filter((_, index) => index !== moduleIndex) })}>
                      <DeleteOutlineOutlined />
                    </IconButton>
                  </Stack>
                  <FormControlLabel
                    control={<Switch size="small" checked={module.isEnabled !== false} onChange={(event) => updateModule(moduleIndex, { isEnabled: event.target.checked })} />}
                    label="Раздел включён"
                    sx={{ mt: 0.75 }}
                  />
                  <Divider sx={{ my: 1.25 }} />
                  <Stack gap={1}>
                    {fields.map((field, fieldIndex) => (
                      <Box key={`${field.key}-${fieldIndex}`}>
                        <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "center" }}>
                          <TextField size="small" label="Подпись" value={field.label} onChange={(event) => updateFields(moduleIndex, fields.map((item, index) => index === fieldIndex ? { ...item, label: event.target.value } : item))} fullWidth />
                          <TextField size="small" label="Ключ" value={field.key} onChange={(event) => updateFields(moduleIndex, fields.map((item, index) => index === fieldIndex ? { ...item, key: event.target.value } : item))} sx={{ minWidth: { sm: 140 } }} />
                          <TextField select size="small" label="Тип" value={field.type ?? "text"} onChange={(event) => updateFields(moduleIndex, fields.map((item, index) => index === fieldIndex ? { ...item, type: event.target.value as ProgramFieldDefinition["type"], options: event.target.value === "select" ? item.options ?? ["Вариант 1"] : undefined } : item))} sx={{ minWidth: { sm: 150 } }}>
                            {FIELD_TYPES.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}
                          </TextField>
                          <FormControlLabel control={<Switch size="small" checked={Boolean(field.required)} onChange={(event) => updateFields(moduleIndex, fields.map((item, index) => index === fieldIndex ? { ...item, required: event.target.checked } : item))} />} label="Обяз." />
                          <IconButton aria-label={`Удалить поле ${field.label}`} onClick={() => updateFields(moduleIndex, fields.filter((_, index) => index !== fieldIndex))}><DeleteOutlineOutlined /></IconButton>
                        </Stack>
                        {field.type === "select" && (
                          <TextField
                            size="small"
                            fullWidth
                            label="Варианты выбора"
                            value={(field.options ?? []).join(", ")}
                            onChange={(event) => updateFields(moduleIndex, fields.map((item, index) => index === fieldIndex ? {
                              ...item,
                              options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean),
                            } : item))}
                            helperText="Перечислите варианты через запятую"
                            sx={{ mt: 1 }}
                          />
                        )}
                      </Box>
                    ))}
                    <AppButton size="small" startIcon={<AddOutlined />} onClick={() => updateFields(moduleIndex, [...fields, { key: `field${fields.length + 1}`, label: "Новое поле", type: "text" }])}>
                      Добавить поле
                    </AppButton>
                  </Stack>
                </Box>
              );
            })}
            <Stack direction="row" gap={0.75} flexWrap="wrap">
              {versionsQuery.data?.results.map((version) => (
                <Chip key={version.id} size="small" variant={version.isCurrent ? "filled" : "outlined"} color={version.isCurrent ? "primary" : "default"} label={`v${version.version} · ${version.status === "draft" ? "черновик" : "опубликована"}`} />
              ))}
            </Stack>
          </>
        ) : (
          <Typography color="text.secondary">Загрузка конструктора…</Typography>
        )}
      </Stack>

      <Divider />
      <Stack direction={{ xs: "column-reverse", sm: "row" }} justifyContent="flex-end" gap={1} sx={{ px: 2.5, py: 1.5 }}>
        <AppButton onClick={onClose} disabled={busy}>Закрыть</AppButton>
        {programId === null ? (
          <AppButton variant="contained" startIcon={<AddOutlined />} loading={createMutation.isPending} disabled={!templateCode || !newName.trim() || !newCode.trim()} onClick={() => createMutation.mutate()}>
            Создать программу
          </AppButton>
        ) : (
          <>
            <AppButton variant="outlined" startIcon={<SaveOutlined />} loading={saveMutation.isPending} disabled={!schema} onClick={() => saveMutation.mutate()}>
              Сохранить черновик
            </AppButton>
            <AppButton variant="contained" startIcon={<PublishOutlined />} loading={publishMutation.isPending} disabled={draftId === null || hasUnsavedChanges} onClick={() => publishMutation.mutate()}>
              Опубликовать
            </AppButton>
          </>
        )}
      </Stack>
    </Drawer>
  );
};
