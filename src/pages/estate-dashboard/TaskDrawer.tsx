import React from "react";
import { Alert, Box, Button, Drawer, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { getSalesManagers, realEstateKeys } from "../../api/realestate";
import {
  REALTY_TASK_KINDS,
  createRealtyTask,
  realtyTaskKeys,
  updateRealtyTask,
  type RealtyTaskItem,
  type RealtyTaskKind,
} from "../../api/realtyTasks";
import { estateDashboardKeys } from "../../api/estateDashboard";
import { CustomDatePicker, CustomTimePicker } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";

export type TaskDrawerMode = { kind: "create"; date: string } | { kind: "reschedule"; task: RealtyTaskItem } | { kind: "delegate"; task: RealtyTaskItem };

interface Form {
  text: string;
  kind: RealtyTaskKind;
  date: Dayjs | null;
  time: Dayjs | null;
  meta: string;
  managerId: string;
}

const timeOf = (date: string, time: string) => (time ? dayjs(`${date}T${time}`) : null);

function formFor(mode: TaskDrawerMode): Form {
  if (mode.kind === "create") {
    // Время по умолчанию — ближайший час: задачу обычно ставят «на сегодня, попозже».
    return { text: "", kind: "call", date: dayjs(mode.date), time: dayjs().add(1, "hour").startOf("hour"), meta: "", managerId: "" };
  }
  const { task } = mode;
  return {
    text: task.text,
    kind: (REALTY_TASK_KINDS as readonly string[]).includes(task.kind) ? (task.kind as RealtyTaskKind) : "task",
    date: dayjs(task.date),
    time: timeOf(task.date, task.time),
    meta: task.meta,
    managerId: task.managerId != null ? String(task.managerId) : "",
  };
}

/**
 * Новая задача «Мой день», перенос и передача другому менеджеру — одна
 * шторка, поля по режиму. Только с `realty.manage` (вызывающий не откроет её
 * без права). Ответственные — сотрудники организации (`staff.view`); без права
 * список пуст, и задача уходит без ответственного — бэк поставит автора.
 */
export function TaskDrawer({ mode, onClose }: { mode: TaskDrawerMode | null; onClose: () => void }) {
  const { t } = useT("estateDashboard");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canStaff = useCan("staff.view");
  const { control, handleSubmit, reset } = useForm<Form>({ defaultValues: mode ? formFor(mode) : undefined });

  React.useEffect(() => {
    if (mode) reset(formFor(mode));
  }, [mode, reset]);

  const managers = useQuery({
    queryKey: realEstateKeys.managers(scope),
    queryFn: () => getSalesManagers(scope),
    enabled: Boolean(mode) && mode?.kind !== "reschedule" && canStaff && scope.orgReady !== false,
    staleTime: 5 * 60_000,
  });

  const save = useMutation({
    mutationFn: async (form: Form) => {
      if (!mode) return;
      const date = form.date?.format("YYYY-MM-DD") ?? "";
      const time = form.time?.format("HH:mm") ?? "";
      const managerId = form.managerId ? Number(form.managerId) : null;
      if (mode.kind === "create") {
        await createRealtyTask({ text: form.text.trim(), kind: form.kind, date, time, meta: form.meta, managerId }, scope);
      } else if (mode.kind === "reschedule") {
        await updateRealtyTask(mode.task.id, { date, time }, scope);
      } else {
        await updateRealtyTask(mode.task.id, { managerId }, scope);
      }
    },
    onSuccess: () => {
      enqueueSnackbar(mode?.kind === "create" ? t("today.toast.created") : t("today.toast.saved"), { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: realtyTaskKeys.all });
      void queryClient.invalidateQueries({ queryKey: estateDashboardKeys.all });
      onClose();
    },
  });

  const title = mode?.kind === "reschedule" ? t("today.form.rescheduleTitle") : mode?.kind === "delegate" ? t("today.form.delegateTitle") : t("today.form.createTitle");
  const showWhat = mode?.kind === "create";
  const showWhen = mode?.kind === "create" || mode?.kind === "reschedule";
  const showWho = mode?.kind === "create" || mode?.kind === "delegate";

  return (
    <Drawer
      anchor="right"
      open={Boolean(mode)}
      onClose={save.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 440 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, fontWeight: 700, fontSize: "1.1rem" }}>
          {title}
        </Typography>
        <IconButton aria-label={t("today.form.cancel")} onClick={onClose} disabled={save.isPending}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box
        component="form"
        id="realty-task-form"
        onSubmit={handleSubmit((form) => save.mutate(form))}
        sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gap: 2, alignContent: "start" }}
      >
        {/* Текст задачи при переносе и передаче — для ориентира, без правки. */}
        {mode && mode.kind !== "create" && <Typography sx={{ fontWeight: 600 }}>{mode.task.text}</Typography>}
        {showWhat && (
          <>
            <Controller
              control={control}
              name="text"
              rules={{ validate: (v) => v.trim() !== "" || t("today.form.required") }}
              render={({ field, fieldState }) => (
                <TextField {...field} label={t("today.form.text")} size="small" multiline minRows={2} autoFocus error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
              )}
            />
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <TextField {...field} select label={t("today.form.kind")} size="small">
                  {REALTY_TASK_KINDS.map((kind) => (
                    <MenuItem key={kind} value={kind}>
                      {t(`today.kindOne.${kind}`)}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </>
        )}
        {showWhen && (
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <Controller
              control={control}
              name="date"
              rules={{ validate: (v) => (v != null && v.isValid()) || t("today.form.required") }}
              render={({ field, fieldState }) => (
                <CustomDatePicker
                  label={t("today.form.date")}
                  value={field.value}
                  onChange={(value) => field.onChange(value)}
                  slotProps={{ textField: { size: "small", error: Boolean(fieldState.error), helperText: fieldState.error?.message } }}
                />
              )}
            />
            <Controller
              control={control}
              name="time"
              render={({ field }) => (
                <CustomTimePicker
                  label={t("today.form.time")}
                  value={field.value}
                  onChange={(value) => field.onChange(value)}
                  minutesStep={5}
                  slotProps={{ textField: { size: "small" } }}
                />
              )}
            />
          </Box>
        )}
        {showWhat && (
          <Controller
            control={control}
            name="meta"
            render={({ field }) => <TextField {...field} label={t("today.form.meta")} size="small" helperText={t("today.form.metaHint")} />}
          />
        )}
        {showWho && canStaff && (
          <Controller
            control={control}
            name="managerId"
            render={({ field }) => (
              <TextField
                {...field}
                select
                label={t("today.form.manager")}
                size="small"
                disabled={managers.isLoading}
                // Пустой выбор — «Не назначен» видно сразу, а не одну подпись поля.
                slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
              >
                <MenuItem value="">{t("today.form.managerNone")}</MenuItem>
                {(managers.data ?? [])
                  .filter((m) => m.id)
                  .map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name}
                    </MenuItem>
                  ))}
              </TextField>
            )}
          />
        )}
        {save.isError && <Alert severity="error">{save.error instanceof Error && save.error.message ? save.error.message : t("today.toast.failed")}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={save.isPending}>
          {t("today.form.cancel")}
        </Button>
        <Button type="submit" form="realty-task-form" variant="contained" disabled={save.isPending}>
          {mode?.kind === "create" ? t("today.form.create") : t("today.form.save")}
        </Button>
      </Box>
    </Drawer>
  );
}
