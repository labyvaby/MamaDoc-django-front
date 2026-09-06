/**
 * AbsenceConflictsDrawer — разбор приёмов, попавших под отсутствие сотрудника.
 *
 * Отметка отсутствия и судьба записанных пациентов — два разных действия: бэк
 * ничего не решает сам (не отменяет, не переносит, не подбирает замену), это
 * делает человек здесь. Дровер поднимается сразу после того, как выходной или
 * отпуск поставлен, и показывает, кто остался с приёмом в никуда.
 *
 * Что можно сделать выбранным приёмам:
 *   • отменить с причиной `doctor_absent` — пациенту уходит SMS «врач не выйдет»,
 *     а не сухое «приём отменён» (тип уведомления бэк выбирает по этой причине);
 *   • передать коллеге — исполнитель меняется на месте, строки не пересоздаются;
 *   • перенести — по одному, из карточки приёма (массовый перенос требует
 *     времени для каждого приёма отдельно, экраном это не собрать).
 *
 * Плюс задача регистратуре на обзвон: SMS не заменяет звонка тем, кто уже в
 * пути или пришёл.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { useNavigate } from "react-router";
import dayjs from "dayjs";

import {
  bulkAppointments,
  parseBackendError,
  type AppointmentBulkItem,
  type AppointmentBulkRow,
} from "../../../api/appointments";
import {
  getScheduleConflicts,
  type ScheduleConflictAppointment,
  type ScheduleExceptionKind,
} from "../../../api/scheduling";
import { createTask, getTaskCategories } from "../../../api/tasks";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../../api/queryKeys";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { useCan } from "../../../hooks/useCan";
import { getStatusChipSx, getStatusLabel } from "../../../config/appointmentStatuses";
import { formatKGS } from "../../../utility/format";
import { subtleBg } from "../../../theme/uiHelpers";

/** Отсутствие, из-за которого поднялся разбор. */
export interface AbsenceSpan {
  employeeId: number;
  employeeName: string;
  /** YYYY-MM-DD; у отсутствия на один день совпадает с dateTo. */
  dateFrom: string;
  dateTo: string;
  kind: ScheduleExceptionKind;
}

type Mode = "cancel" | "reassign";

const KIND_WORD: Partial<Record<ScheduleExceptionKind, string>> = {
  day_off: "выходной",
  vacation: "отпуск",
};

/** Приём, к которому уже нельзя относиться как к «отправим SMS и всё». */
function needsCall(appt: ScheduleConflictAppointment): boolean {
  if (appt.status === "arrived" || appt.status === "in_progress") return true;
  const start = dayjs(appt.startsAt);
  return start.isValid() && start.diff(dayjs(), "hour", true) < 3;
}

function paidAmount(appt: ScheduleConflictAppointment): number {
  const paid = Number(appt.paidTotal ?? 0);
  return Number.isFinite(paid) ? paid : 0;
}

export const AbsenceConflictsDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  absence: AbsenceSpan | null;
  /** Список сотрудников для передачи приёмов коллеге. */
  employeeOptions: { id: number; fullName: string }[];
}> = ({ open, onClose, absence, employeeOptions }) => {
  const orgId = useApiOrgId();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canCreateTask = useCan("tasks.create");

  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [mode, setMode] = React.useState<Mode>("cancel");
  const [comment, setComment] = React.useState("");
  const [notifyPatients, setNotifyPatients] = React.useState(true);
  const [replacementId, setReplacementId] = React.useState<number | null>(null);
  const [withCallTask, setWithCallTask] = React.useState(true);
  const [taskCategoryId, setTaskCategoryId] = React.useState<number | null>(null);
  const [results, setResults] = React.useState<Map<number, AppointmentBulkRow>>(new Map());
  const [error, setError] = React.useState<string | null>(null);

  const conflictsQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.conflicts({
      employeeId: absence?.employeeId ?? null,
      dateFrom: absence?.dateFrom ?? null,
      dateTo: absence?.dateTo ?? null,
      orgId,
    }),
    queryFn: ({ signal }) =>
      getScheduleConflicts(
        {
          employeeId: absence!.employeeId,
          dateFrom: absence!.dateFrom,
          dateTo: absence!.dateTo,
          organizationId: orgId,
        },
        signal,
      ),
    enabled: open && absence !== null,
    // Пока дровер открыт, список — снимок: после применения строки показывают
    // «отменён» и ошибки по каждому приёму, а рефетч затёр бы этот результат
    // (отменённые приёмы из выдачи уходят). Свежий запрос — при следующем
    // открытии: ключ не инвалидируется вместе с приёмами.
    refetchOnWindowFocus: false,
  });

  const categoriesQuery = useQuery({
    queryKey: ["django", "tasks", "categories", orgId],
    queryFn: ({ signal }) => getTaskCategories(orgId ?? undefined, signal),
    enabled: open && canCreateTask,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const conflicts = React.useMemo(() => conflictsQuery.data ?? [], [conflictsQuery.data]);
  const categories = React.useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.isActive),
    [categoriesQuery.data],
  );

  // Открытие — чистый лист: приёмы выбраны все (регистратор пришёл разобрать
  // весь список, а не по одному), режим — отмена.
  React.useEffect(() => {
    if (!open) return;
    setMode("cancel");
    setComment(absence ? `${absence.employeeName}: ${KIND_WORD[absence.kind] ?? "отсутствие"}` : "");
    setNotifyPatients(true);
    setReplacementId(null);
    setWithCallTask(true);
    setResults(new Map());
    setError(null);
  }, [open, absence]);

  React.useEffect(() => {
    setSelected(new Set(conflicts.map((appt) => appt.id)));
  }, [conflicts]);

  React.useEffect(() => {
    if (taskCategoryId === null && categories.length > 0) setTaskCategoryId(categories[0].id);
  }, [categories, taskCategoryId]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedList = React.useMemo(
    () => conflicts.filter((appt) => selected.has(appt.id)),
    [conflicts, selected],
  );
  const prepaidSelected = selectedList.filter((appt) => paidAmount(appt) > 0);
  const callSelected = selectedList.filter(needsCall);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const items: AppointmentBulkItem[] = selectedList.map((appt) =>
        mode === "cancel"
          ? { id: appt.id }
          : {
              id: appt.id,
              employeeId: replacementId!,
              // Только строки отсутствующего: без этого замещающему достанется
              // и строка медсестры того же приёма.
              fromEmployeeId: absence!.employeeId,
            },
      );
      const response = await bulkAppointments({
        action: mode === "cancel" ? "cancel" : "reassign",
        items,
        ...(mode === "cancel" ? { cancelReason: "doctor_absent" as const } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        notify: notifyPatients,
        organizationId: orgId,
      });
      // Задачу ставим только на то, что действительно применилось: обзванивать
      // пациента, у которого приём остался на месте, незачем.
      const okIds = new Set(response.results.filter((r) => r.ok).map((r) => r.id));
      const toCall = selectedList.filter((appt) => okIds.has(appt.id));
      if (withCallTask && canCreateTask && taskCategoryId !== null && toCall.length > 0) {
        await createTask(
          {
            title:
              mode === "cancel"
                ? `Обзвон: отменены приёмы (${absence!.employeeName})`
                : `Обзвон: приёмы переданы коллеге (${absence!.employeeName})`,
            description: [
              `${absence!.employeeName}: ${KIND_WORD[absence!.kind] ?? "отсутствие"} ${
                absence!.dateFrom === absence!.dateTo
                  ? dayjs(absence!.dateFrom).format("DD.MM.YYYY")
                  : `${dayjs(absence!.dateFrom).format("DD.MM.YYYY")} — ${dayjs(absence!.dateTo).format("DD.MM.YYYY")}`
              }.`,
              "",
              ...toCall.map((appt) => {
                const when = dayjs(appt.startsAt).format("DD.MM HH:mm");
                const phone = appt.patientPhone ? ` ${appt.patientPhone}` : "";
                const paid = paidAmount(appt) > 0 ? ` (оплачено ${formatKGS(paidAmount(appt))})` : "";
                return `${when} — ${appt.patientName || "без пациента"}${phone}${paid}`;
              }),
            ].join("\n"),
            categoryId: taskCategoryId,
            dueDate: dayjs().format("YYYY-MM-DD"),
          },
          orgId ?? undefined,
        );
      }
      return response;
    },
    onSuccess: (response) => {
      setResults(new Map(response.results.map((row) => [row.id, row])));
      const failed = response.results.filter((row) => !row.ok);
      // Приёмы изменились — сбрасываем списки приёмов и свободные окна. Сам
      // список конфликтов не трогаем: он держит построчный результат разбора.
      void queryClient.invalidateQueries({ queryKey: ["django", "appointments"] });
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.scheduling.availabilityAll,
      });
      if (failed.length === 0) {
        notify?.({
          type: "success",
          message: mode === "cancel" ? "Приёмы отменены" : "Приёмы переданы коллеге",
        });
      } else {
        notify?.({
          type: "error",
          message: `${failed.length} из ${response.results.length} не удалось`,
          description: "Строки с ошибкой отмечены в списке.",
        });
      }
      // Успешные снимаем с выбора: в списке остаётся то, что ещё не решено.
      setSelected((prev) => {
        const next = new Set(prev);
        for (const row of response.results) if (row.ok) next.delete(row.id);
        return next;
      });
    },
    onError: (e) => setError(parseBackendError(e)),
  });

  const busy = applyMutation.isPending;

  // Закрытие разбора — момент обновить график и списки: пока дровер открыт,
  // список конфликтов держит результат применения и не рефетчится.
  const handleClose = () => {
    void queryClient.invalidateQueries({ queryKey: ["django", "scheduling"] });
    onClose();
  };

  const canApply =
    selectedList.length > 0 && !busy && (mode === "cancel" || replacementId !== null);

  const period =
    absence === null
      ? ""
      : absence.dateFrom === absence.dateTo
        ? dayjs(absence.dateFrom).format("DD.MM.YYYY")
        : `${dayjs(absence.dateFrom).format("DD.MM.YYYY")} — ${dayjs(absence.dateTo).format("DD.MM.YYYY")}`;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : handleClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 560 },
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <EventBusyOutlined color="primary" />
          <Stack>
            <Typography variant="h6" fontWeight={600}>
              Записанные пациенты
            </Typography>
            {absence && (
              <Typography variant="caption" color="text.secondary">
                {absence.employeeName} · {KIND_WORD[absence.kind] ?? "отсутствие"} · {period}
              </Typography>
            )}
          </Stack>
        </Stack>
        <IconButton onClick={busy ? undefined : handleClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Box>
      <Divider />

      <Box sx={{ p: 2.5, flex: 1, overflowY: "auto" }}>
        {conflictsQuery.isLoading ? (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={28} />
          </Stack>
        ) : conflictsQuery.isError ? (
          <Alert severity="error">{parseBackendError(conflictsQuery.error)}</Alert>
        ) : conflicts.length === 0 ? (
          <Alert severity="success">
            На это время записанных пациентов нет — разбирать нечего.
          </Alert>
        ) : (
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Выбрано {selectedList.length} из {conflicts.length}
              </Typography>
              <Button
                size="small"
                variant="text"
                sx={{ textTransform: "none" }}
                disabled={busy}
                onClick={() =>
                  setSelected(
                    selectedList.length === conflicts.length
                      ? new Set()
                      : new Set(conflicts.map((a) => a.id)),
                  )
                }
              >
                {selectedList.length === conflicts.length ? "Снять все" : "Выбрать все"}
              </Button>
            </Stack>

            <Stack spacing={1}>
              {conflicts.map((appt) => {
                const row = results.get(appt.id);
                const paid = paidAmount(appt);
                return (
                  <Box
                    key={appt.id}
                    sx={(t) => ({
                      display: "flex",
                      gap: 1,
                      p: 1.25,
                      border: 1,
                      borderColor: row?.ok
                        ? "success.main"
                        : row && !row.ok
                          ? "error.main"
                          : "divider",
                      borderRadius: 1.5,
                      bgcolor: row?.ok ? subtleBg(t) : "transparent",
                    })}
                  >
                    <Checkbox
                      size="small"
                      checked={selected.has(appt.id)}
                      onChange={() => toggle(appt.id)}
                      disabled={busy || row?.ok === true}
                      sx={{ p: 0.5, alignSelf: "flex-start" }}
                    />
                    <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="body2" fontWeight={600}>
                          {dayjs(appt.startsAt).format("DD.MM HH:mm")}
                        </Typography>
                        <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                          {appt.patientName || "Без пациента"}
                        </Typography>
                        <Chip label={getStatusLabel(appt.status)} size="small" sx={getStatusChipSx(appt.status)} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {appt.services.join(", ") || "Услуги не указаны"}
                        {appt.branchName ? ` · ${appt.branchName}` : ""}
                      </Typography>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {appt.patientPhone && (
                          <Chip
                            size="small"
                            variant="outlined"
                            icon={<PhoneOutlined sx={{ fontSize: 14 }} />}
                            label={appt.patientPhone}
                          />
                        )}
                        {appt.isPerformerPrimary === false && (
                          <Tooltip title="Отсутствующий — исполнитель одной из строк услуг, а не врач приёма">
                            <Chip size="small" variant="outlined" label="Второй исполнитель" />
                          </Tooltip>
                        )}
                        {paid > 0 && (
                          <Chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            label={`Оплачено ${formatKGS(paid)}`}
                          />
                        )}
                        {needsCall(appt) && (
                          <Chip size="small" color="error" variant="outlined" label="Только звонок" />
                        )}
                      </Stack>
                      {row && !row.ok && (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <ErrorOutlineOutlined color="error" sx={{ fontSize: 16 }} />
                          <Typography variant="caption" color="error">
                            {row.error?.message ?? "Не удалось"}
                          </Typography>
                        </Stack>
                      )}
                      {row?.ok && (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <CheckCircleOutlined color="success" sx={{ fontSize: 16 }} />
                          <Typography variant="caption" color="success.main">
                            {mode === "cancel" ? "Отменён" : "Передан коллеге"}
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                    <Tooltip title="Открыть день в регистратуре — там приём можно перенести">
                      <IconButton
                        size="small"
                        onClick={() =>
                          navigate(`/appointments?date=${dayjs(appt.startsAt).format("YYYY-MM-DD")}`)
                        }
                        sx={{ alignSelf: "flex-start" }}
                      >
                        <OpenInNewOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                );
              })}
            </Stack>

            <Divider />

            <Stack spacing={0.75}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Что сделать с выбранными
              </Typography>
              <TextField
                select
                size="small"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                disabled={busy}
              >
                <MenuItem value="cancel">Отменить — пациенту SMS «врач не выйдет»</MenuItem>
                <MenuItem value="reassign">Передать коллеге</MenuItem>
              </TextField>
            </Stack>

            {mode === "reassign" && (
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  Кому передать *
                </Typography>
                <TextField
                  select
                  size="small"
                  value={replacementId ?? ""}
                  onChange={(e) => setReplacementId(Number(e.target.value) || null)}
                  disabled={busy}
                >
                  {employeeOptions
                    .filter((emp) => emp.id !== absence?.employeeId)
                    .map((emp) => (
                      <MenuItem key={emp.id} value={emp.id}>
                        {emp.fullName}
                      </MenuItem>
                    ))}
                </TextField>
                <Typography variant="caption" color="text.disabled">
                  Бэкенд проверит, что коллега оказывает эти услуги в филиале приёма; график
                  он не проверяет — приём вне смены разрешён.
                </Typography>
              </Stack>
            )}

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Комментарий в приём
              </Typography>
              <TextField
                size="small"
                fullWidth
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Необязательно"
                disabled={busy}
                inputProps={{ maxLength: 255 }}
              />
            </Stack>

            <Stack spacing={0.5}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Checkbox
                  size="small"
                  checked={notifyPatients}
                  onChange={(e) => setNotifyPatients(e.target.checked)}
                  disabled={busy}
                  sx={{ p: 0.5 }}
                />
                <Typography variant="body2">Уведомить пациентов</Typography>
              </Stack>
              <Typography variant="caption" color="text.disabled">
                {mode === "cancel"
                  ? notifyPatients
                    ? "Уйдёт SMS с текстом «врач не выйдет»; напоминание об отменённом приёме снимется."
                    : "Новых сообщений не будет, но напоминание об отменённом приёме всё равно снимется."
                  : notifyPatients
                    ? "Уйдёт SMS о смене врача — приём остаётся на своём времени."
                    : "Новых сообщений не будет: пациент узнает о замене только от вас."}
              </Typography>
            </Stack>

            {canCreateTask && categories.length > 0 && (
              <Stack spacing={0.5}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Checkbox
                    size="small"
                    checked={withCallTask}
                    onChange={(e) => setWithCallTask(e.target.checked)}
                    disabled={busy}
                    sx={{ p: 0.5 }}
                  />
                  <Typography variant="body2">Задача регистратуре на обзвон</Typography>
                </Stack>
                {withCallTask && (
                  <TextField
                    select
                    size="small"
                    value={taskCategoryId ?? ""}
                    onChange={(e) => setTaskCategoryId(Number(e.target.value) || null)}
                    disabled={busy}
                  >
                    {categories.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                <Typography variant="caption" color="text.disabled">
                  В задачу попадут пациенты и телефоны — те приёмы, по которым действие
                  прошло.
                </Typography>
              </Stack>
            )}

            {callSelected.length > 0 && (
              <Alert severity="warning">
                {callSelected.length}{" "}
                {callSelected.length === 1 ? "пациент" : "пациентов"} уже в пути или на месте —
                SMS им не поможет, нужен звонок.
              </Alert>
            )}
            {/* Деньги висят только при отмене: передача коллеге оплату не трогает. */}
            {mode === "cancel" && prepaidSelected.length > 0 && (
              <Alert severity="warning">
                По {prepaidSelected.length}{" "}
                {prepaidSelected.length === 1 ? "приёму" : "приёмам"} есть оплата на{" "}
                {formatKGS(prepaidSelected.reduce((sum, appt) => sum + paidAmount(appt), 0))} —
                отмена деньги не возвращает, возврат оформляется отдельно.
              </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </Box>

      {conflicts.length > 0 && (
        <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Stack direction="row" spacing={1}>
            <Button fullWidth variant="text" onClick={handleClose} disabled={busy}>
              Закрыть
            </Button>
            <Button
              fullWidth
              variant="contained"
              size="large"
              color={mode === "cancel" ? "error" : "primary"}
              onClick={() => applyMutation.mutate()}
              disabled={!canApply}
              startIcon={busy ? <CircularProgress size={20} color="inherit" /> : undefined}
            >
              {busy
                ? "Применяем…"
                : mode === "cancel"
                  ? `Отменить (${selectedList.length})`
                  : `Передать (${selectedList.length})`}
            </Button>
          </Stack>
        </Box>
      )}
    </Drawer>
  );
};

export default AbsenceConflictsDrawer;
