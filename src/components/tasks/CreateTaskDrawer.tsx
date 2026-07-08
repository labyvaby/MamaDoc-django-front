import React from "react";
import {
  Alert,
  Box,
  Chip,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AttachFileOutlined from "@mui/icons-material/AttachFileOutlined";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import { Controller, useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, CustomDatePicker } from "../ui";
import { subtleBg } from "../../theme/uiHelpers";
import {
  createTask,
  getTaskCategories,
  getTaskTemplates,
  uploadTaskAttachment,
  type TaskPriority,
  type TaskTemplate,
} from "../../api/tasks";
import { getDjangoEmployees } from "../../api/staff";
import {
  djangoQueryKeys,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { guessCategoryId, TASK_PRIORITY_OPTIONS } from "../../pages/tasks/meta";
import { useApiOrgId } from "../../hooks/useApiOrgId";

type FormValues = {
  title: string;
  description: string;
  categoryId: number | "";
  assigneeId: number | "";
  dueDate: Dayjs | null;
  priority: TaskPriority | "";
};

type CreateTaskDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** tasks.manage: может задавать приоритет. */
  canManage: boolean;
  /** Фото-первый флоу: файл, снятый до открытия формы (FAB-камера). */
  initialFile?: File | null;
};

const CreateTaskDrawer: React.FC<CreateTaskDrawerProps> = ({
  open,
  onClose,
  canManage,
  initialFile = null,
}) => {
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  /** Категория выбрана автоматически (сбрасывается при ручном выборе). */
  const [autoCategory, setAutoCategory] = React.useState(false);
  /** Пользователь трогал категорию руками — не перезаписывать. */
  const touchedCategory = React.useRef(false);

  React.useEffect(() => {
    if (open) setFile(initialFile);
  }, [open, initialFile]);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: "",
      description: "",
      categoryId: "",
      assigneeId: "",
      dueDate: null,
      priority: "",
    },
  });

  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.categories,
    queryFn: ({ signal }) => getTaskCategories(orgId, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const employeesQuery = useQuery({
    queryKey: [...djangoQueryKeys.reference.employees, "tasks-assignee"],
    queryFn: ({ signal }) => getDjangoEmployees({ status: "active", pageSize: 200 }, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const templatesQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.templates,
    queryFn: ({ signal }) => getTaskTemplates(orgId, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const templates = templatesQuery.data ?? [];

  // ── Автокатегория: угадываем по названию, пока категория не тронута рукой ──
  const titleValue = watch("title");
  React.useEffect(() => {
    if (!open || touchedCategory.current) return;
    const t = setTimeout(() => {
      const guessed = guessCategoryId(titleValue ?? "", categoriesQuery.data ?? [], templates);
      if (guessed != null) {
        setValue("categoryId", guessed);
        setAutoCategory(true);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleValue, open, categoriesQuery.data, templates]);

  const applyTemplate = (tpl: TaskTemplate) => {
    setValue("title", tpl.title);
    setValue("categoryId", tpl.categoryId);
    if (canManage) setValue("priority", tpl.priority);
    setAutoCategory(true);
    touchedCategory.current = false;
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const task = await createTask(
        {
          title: values.title.trim(),
          description: values.description.trim() || undefined,
          categoryId: values.categoryId as number,
          assigneeId: values.assigneeId === "" ? undefined : (values.assigneeId as number),
          dueDate: values.dueDate ? values.dueDate.format("YYYY-MM-DD") : undefined,
          priority: canManage && values.priority !== "" ? values.priority : undefined,
        },
        orgId,
      );
      if (file) await uploadTaskAttachment(task.id, file, undefined, orgId);
      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.tasks.all });
      handleClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось создать заявку"),
  });

  const handleClose = () => {
    reset();
    setFile(null);
    setError(null);
    setAutoCategory(false);
    touchedCategory.current = false;
    onClose();
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: { xs: 320, sm: 480, md: 520 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="h6" fontWeight={600} sx={{ flex: 1, letterSpacing: -0.15 }}>
          Новая заявка
        </Typography>
        <IconButton size="small" onClick={handleClose} aria-label="Закрыть">
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Box>

      <Box
        component="form"
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5, display: "flex", flexDirection: "column", gap: 2 }}
      >
        {error && <Alert severity="error">{error}</Alert>}

        {/* ── Быстрые шаблоны из истории ── */}
        {templates.length > 0 && (
          <Box>
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ mb: 0.75 }}>
              <BoltOutlined sx={{ fontSize: 15, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                Частые заявки
              </Typography>
            </Stack>
            <Stack direction="row" gap={0.75} flexWrap="wrap">
              {templates.map((tpl) => (
                <Chip
                  key={tpl.title}
                  label={tpl.title}
                  size="small"
                  clickable
                  onClick={() => applyTemplate(tpl)}
                  sx={(t) => ({
                    height: 28,
                    borderRadius: "8px",
                    fontWeight: 500,
                    maxWidth: "100%",
                    border: 1,
                    borderColor: "divider",
                    color: "text.secondary",
                    bgcolor: "transparent",
                    "&:hover": {
                      bgcolor: subtleBg(t, true),
                      borderColor: alpha(t.palette.primary.main, 0.35),
                      color: "text.primary",
                    },
                  })}
                />
              ))}
            </Stack>
          </Box>
        )}

        <TextField
          label="Название"
          required
          fullWidth
          autoFocus
          error={!!errors.title}
          helperText={errors.title?.message}
          {...register("title", {
            required: "Укажите название",
            maxLength: { value: 200, message: "Не более 200 символов" },
          })}
        />

        <TextField
          label="Описание"
          fullWidth
          multiline
          minRows={3}
          {...register("description")}
        />

        <Controller
          name="categoryId"
          control={control}
          rules={{ required: "Выберите категорию" }}
          render={({ field }) => (
            <TextField
              select
              label="Категория"
              required
              fullWidth
              error={!!errors.categoryId}
              helperText={
                errors.categoryId?.message ??
                (autoCategory ? "Категория подставлена автоматически — проверьте" : undefined)
              }
              value={field.value === "" ? "" : String(field.value)}
              onChange={(e) => {
                touchedCategory.current = true;
                setAutoCategory(false);
                field.onChange(e.target.value === "" ? "" : Number(e.target.value));
              }}
            >
              {(categoriesQuery.data ?? []).map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        />

        <Controller
          name="assigneeId"
          control={control}
          render={({ field }) => (
            <TextField
              select
              label="Исполнитель (необязательно)"
              fullWidth
              value={field.value === "" ? "" : String(field.value)}
              onChange={(e) => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
              helperText="Пусто — заявку возьмёт любой из группы категории"
            >
              <MenuItem value="">Не назначать</MenuItem>
              {(employeesQuery.data?.results ?? []).map((e) => (
                <MenuItem key={e.id} value={String(e.id)}>
                  {e.fullName}
                </MenuItem>
              ))}
            </TextField>
          )}
        />

        <Controller
          name="dueDate"
          control={control}
          render={({ field }) => (
            <CustomDatePicker
              label="Желаемый срок"
              value={field.value}
              onChange={field.onChange}
              format="DD.MM.YYYY"
              minDate={dayjs()}
              slotProps={{ textField: { fullWidth: true } }}
            />
          )}
        />

        {canManage && (
          <Controller
            name="priority"
            control={control}
            render={({ field }) => (
              <TextField
                select
                label="Приоритет"
                fullWidth
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                helperText="Пусто — приоритет категории по умолчанию"
              >
                <MenuItem value="">По умолчанию</MenuItem>
                {TASK_PRIORITY_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        )}

        {/* Фото / файл */}
        <Stack direction="row" alignItems="center" gap={1.5}>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <AppButton
            variant="outlined"
            startIcon={<AttachFileOutlined />}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? "Заменить фото" : "Прикрепить фото"}
          </AppButton>
          {file && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
              {file.name}
            </Typography>
          )}
        </Stack>
      </Box>

      <Box sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider", display: "flex", gap: 1.5 }}>
        <AppButton variant="outlined" onClick={handleClose} sx={{ flex: 1 }}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          sx={{ flex: 1 }}
          disabled={isSubmitting || mutation.isPending}
          onClick={handleSubmit((v) => mutation.mutate(v))}
        >
          Создать заявку
        </AppButton>
      </Box>
    </Drawer>
  );
};

export default CreateTaskDrawer;
