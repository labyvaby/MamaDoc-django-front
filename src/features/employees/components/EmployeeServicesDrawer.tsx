import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOff";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import { useNotification } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";

import { AppButton } from "../../../components/ui";
import {
  getEmployeeServices,
  assignEmployeeService,
  updateEmployeeService,
  type EmployeeServiceAssignment,
} from "../../../api/staff";
import {
  getServices,
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_OPTIONS,
  type Service,
} from "../../../api/catalog";
import { useCan } from "../../../hooks/useCan";
import { usePermissions } from "../../../hooks/usePermissions";

// ── types ─────────────────────────────────────────────────────────────────────

export type EmployeeServicesDrawerProps = {
  open: boolean;
  onClose: () => void;
  employeeId: number;
  employeeName: string;
  /** Вызывается после успешного назначения/активации/деактивации услуги,
   *  чтобы карточка сотрудника перечитала список услуг без F5. */
  onChanged?: (employeeId: number) => void;
};

type FormState = {
  /** Выбранные услуги — назначаются пачкой (у врача их бывает 30+). */
  services: Service[];
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  services: [],
  isActive: true,
};

/** Сколько POST-запросов держим в полёте одновременно (bulk-эндпоинта нет). */
const ASSIGN_CHUNK_SIZE = 5;

// ── helpers ───────────────────────────────────────────────────────────────────

function priceLabel(val: string | null): string {
  if (!val) return "";
  const n = parseFloat(val);
  return isNaN(n) ? val : `${n.toFixed(2)} с`;
}

function categoryLabel(s: Service): string {
  return s.category ? SERVICE_CATEGORY_LABELS[s.category] : "Без категории";
}

/** Порядок групп в списке: как в справочнике, «Без категории» — последней. */
function categoryRank(s: Service): number {
  const idx = s.category ? SERVICE_CATEGORY_OPTIONS.indexOf(s.category) : -1;
  return idx === -1 ? SERVICE_CATEGORY_OPTIONS.length : idx;
}

/** «услуга / услуги / услуг» — для человеческих уведомлений. */
function pluralServices(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return "услуг";
  if (mod10 === 1) return "услуга";
  if (mod10 >= 2 && mod10 <= 4) return "услуги";
  return "услуг";
}

// ── component ─────────────────────────────────────────────────────────────────
// Assignment only: pick an existing service (from the branch) and assign it.
// Editing the service itself (price/duration/name) lives on the services page,
// never here — so there is no per-assignment edit form.

const EmployeeServicesDrawer: React.FC<EmployeeServicesDrawerProps> = ({
  open,
  onClose,
  employeeId,
  employeeName,
  onChanged,
}) => {
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const canView = useCan("staff.view");
  const canEdit = useCan("staff.update");

  // Справочники формы приёма (исполнители + матрица услуга↔сотрудник)
  // кэшируются на 10 минут — без инвалидации свежая привязка не появится
  // в форме до перезагрузки страницы («услуга привязана, но нет для выбора»).
  const invalidateAppointmentFormData = React.useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["django", "appointments", "form-data"],
    });
  }, [queryClient]);
  const { activeOrganization, activeMembership, activeBranch } = usePermissions();

  const activeBranchId = activeBranch?.id ?? null;

  // Unique tenant context key — if it changes while drawer is open, abort and close.
  const contextKey = `${activeOrganization?.id ?? "null"}_${activeMembership?.id ?? "null"}_${activeBranchId ?? "null"}`;
  const currentContextKeyRef = React.useRef(contextKey);
  currentContextKeyRef.current = contextKey;
  const previousContextKeyRef = React.useRef(contextKey);

  // ── server data ───────────────────────────────────────────────────────────
  const [assignments, setAssignments] = React.useState<EmployeeServiceAssignment[]>([]);
  const [services, setServices] = React.useState<Service[]>([]);
  const [loadingData, setLoadingData] = React.useState(false);
  const [dataError, setDataError] = React.useState<string | null>(null);

  // ── add-form state ──────────────────────────────────────────────────────────
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // Прогресс пакетного назначения: сколько услуг из выбранных уже обработано.
  const [savedCount, setSavedCount] = React.useState(0);

  // ── close drawer + clear state when tenant context changes ──────────────────
  React.useEffect(() => {
    const prev = previousContextKeyRef.current;
    previousContextKeyRef.current = contextKey;
    if (contextKey === prev) return;
    if (open) onClose();
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setSavedCount(0);
    setAssignments([]);
    setServices([]);
    setDataError(null);
  }, [contextKey, open, onClose]);

  // ── load data on open ─────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open || !canView) return;
    const capturedContextKey = contextKey;
    const controller = new AbortController();
    setLoadingData(true);
    setDataError(null);
    setAssignments([]);

    Promise.all([
      // include inactive so a previously deactivated assignment is visible
      // (and can be reactivated) instead of silently re-appearing in the picker.
      getEmployeeServices(employeeId, controller.signal, { includeInactive: true }),
      getServices(activeBranchId, undefined, controller.signal),
    ])
      .then(([a, s]) => {
        if (controller.signal.aborted) return;
        if (capturedContextKey !== currentContextKeyRef.current) return;
        setAssignments(a);
        setServices(s.filter((sv) => sv.isActive));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (capturedContextKey !== currentContextKeyRef.current) return;
        setDataError(err instanceof Error ? err.message : "Ошибка загрузки данных");
      })
      .finally(() => {
        if (!controller.signal.aborted && capturedContextKey === currentContextKeyRef.current) {
          setLoadingData(false);
        }
      });

    return () => controller.abort();
  }, [open, canView, employeeId, activeBranchId, contextKey]);

  // ── reset on close ────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSaveError(null);
      setSavedCount(0);
      setAssignments([]);
      setDataError(null);
    }
  }, [open]);

  // ── add a new assignment ──────────────────────────────────────────────────
  const handleAddClick = () => {
    setForm(EMPTY_FORM);
    setSaveError(null);
    setShowForm(true);
  };

  // Bulk-эндпоинта у бэкенда нет — назначаем каждую услугу отдельным POST,
  // партиями по ASSIGN_CHUNK_SIZE: 30 услуг не выстраиваются в 30 круговых
  // задержек и при этом не заливают сервер разом. Ошибка по одной услуге не
  // отменяет остальные — неудавшиеся остаются в пикере, чтобы повторить.
  const handleSave = async () => {
    if (form.services.length === 0) return;
    const capturedContextKey = currentContextKeyRef.current;
    const picked = form.services;
    setSaveError(null);
    setSavedCount(0);
    setSaving(true);

    const created: EmployeeServiceAssignment[] = [];
    const failed: { service: Service; message: string }[] = [];

    try {
      for (let i = 0; i < picked.length; i += ASSIGN_CHUNK_SIZE) {
        const chunk = picked.slice(i, i + ASSIGN_CHUNK_SIZE);
        const results = await Promise.allSettled(
          chunk.map((s) =>
            assignEmployeeService(employeeId, {
              // Услуга всегда назначается в активном филиале — backend в
              // branch-specific режиме требует совпадения с ним, а в org-wide
              // режиме (филиал не выбран) принимает null.
              serviceId: s.id,
              branchId: activeBranchId ?? undefined,
              isActive: form.isActive,
              priceOverride: null,
              durationOverrideMinutes: null,
              notes: "",
            }),
          ),
        );
        if (capturedContextKey !== currentContextKeyRef.current) return;
        results.forEach((r, idx) => {
          if (r.status === "fulfilled") {
            created.push(r.value);
          } else {
            const reason = r.reason;
            failed.push({
              service: chunk[idx],
              message: reason instanceof Error ? reason.message : "Ошибка сохранения",
            });
          }
        });
        setSavedCount(created.length + failed.length);
      }

      if (created.length > 0) {
        // Upsert: backend may return an existing (reactivated) assignment, so
        // replace it in place rather than appending a duplicate row.
        setAssignments((prev) => {
          const byId = new Map(prev.map((a) => [a.id, a]));
          for (const a of created) byId.set(a.id, a);
          return Array.from(byId.values());
        });
        notify?.({
          type: "success",
          message:
            created.length === 1
              ? "Услуга назначена"
              : `Назначено ${created.length} ${pluralServices(created.length)}`,
        });
        invalidateAppointmentFormData();
        onChanged?.(employeeId);
      }

      if (failed.length === 0) {
        setShowForm(false);
        setForm(EMPTY_FORM);
        return;
      }

      // Оставляем в пикере только те услуги, которые не прошли.
      setForm((f) => ({ ...f, services: failed.map((x) => x.service) }));
      const details = failed
        .slice(0, 3)
        .map((x) => `${x.service.name} — ${x.message}`)
        .join("; ");
      const rest = failed.length > 3 ? ` и ещё ${failed.length - 3}` : "";
      setSaveError(
        `Не удалось назначить ${failed.length} ${pluralServices(failed.length)}: ${details}${rest}`,
      );
    } finally {
      if (capturedContextKey === currentContextKeyRef.current) {
        setSaving(false);
        setSavedCount(0);
      }
    }
  };

  // ── activate / deactivate an assignment (so a wrong add can be undone) ──────
  const handleToggleActive = async (a: EmployeeServiceAssignment, isActive: boolean) => {
    const capturedContextKey = currentContextKeyRef.current;
    try {
      const updated = await updateEmployeeService(employeeId, a.id, { isActive });
      if (capturedContextKey !== currentContextKeyRef.current) return;
      setAssignments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      notify?.({
        type: "success",
        message: isActive ? "Услуга активирована" : "Услуга деактивирована",
      });
      invalidateAppointmentFormData();
      onChanged?.(employeeId);
    } catch (err: unknown) {
      if (capturedContextKey !== currentContextKeyRef.current) return;
      notify?.({
        type: "error",
        message: err instanceof Error ? err.message : "Не удалось изменить статус",
      });
    }
  };

  // Hide services that are already assigned from the picker — кроме тех, что
  // сейчас выбраны в форме (иначе MUI ругается на value вне options).
  const assignedServiceIds = React.useMemo(
    () => new Set(assignments.map((a) => a.service.id)),
    [assignments],
  );
  const pickableServices = React.useMemo(() => {
    const selected = new Set(form.services.map((s) => s.id));
    return services
      .filter((s) => !assignedServiceIds.has(s.id) || selected.has(s.id))
      // groupBy в MUI не склеивает несмежные опции — сортируем по категории.
      .sort(
        (a, b) =>
          categoryRank(a) - categoryRank(b) || a.name.localeCompare(b.name, "ru"),
      );
  }, [services, assignedServiceIds, form.services]);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={saving ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: "100vw", sm: 520, md: 560 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      {/* ── header ── */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        px={2}
        py={1.5}
        sx={{ flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <MedicalServicesOutlined color="primary" />
          <Box>
            <Typography variant="h6" lineHeight={1.2}>
              Услуги сотрудника
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {employeeName}
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={saving ? undefined : onClose}>
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />

      {/* ── scrollable body ── */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 2,
          minHeight: 0,
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {dataError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDataError(null)}>
            {dataError}
          </Alert>
        )}

        {loadingData ? (
          <Stack alignItems="center" justifyContent="center" py={8} spacing={1}>
            <CircularProgress />
            <Typography variant="caption" color="text.secondary">
              Загрузка…
            </Typography>
          </Stack>
        ) : (
          <>
            {assignments.length === 0 && !showForm && (
              <Box
                sx={{
                  border: "1px dashed",
                  borderColor: "divider",
                  borderRadius: 1,
                  py: 6,
                  textAlign: "center",
                  mb: 2,
                }}
              >
                <MedicalServicesOutlined
                  sx={{ fontSize: 40, color: "text.disabled", mb: 1 }}
                />
                <Typography variant="body2" color="text.secondary">
                  У сотрудника пока нет услуг
                </Typography>
              </Box>
            )}

            {assignments.length > 0 && (
              <Stack spacing={1} mb={2}>
                {assignments.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    canEdit={canEdit}
                    onDeactivate={() => handleToggleActive(a, false)}
                    onActivate={() => handleToggleActive(a, true)}
                  />
                ))}
              </Stack>
            )}

            {/* ── add form (assignment only) ── */}
            {showForm && (
              <Box
                sx={{
                  border: "1px solid",
                  borderColor: "primary.light",
                  borderRadius: 1,
                  p: 2,
                  mb: 2,
                }}
              >
                <Typography variant="subtitle2" fontWeight={600} mb={1.5}>
                  Назначить услуги
                </Typography>

                {saveError && (
                  <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError(null)}>
                    {saveError}
                  </Alert>
                )}

                <Stack spacing={2}>
                  {/* services — picked from the active branch's existing services */}
                  <Stack spacing={0.5}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      spacing={1}
                    >
                      <Typography variant="body2" color="text.secondary" fontWeight={600}>
                        Услуги *
                        {form.services.length > 0 && ` — выбрано ${form.services.length}`}
                      </Typography>
                      {canEdit && pickableServices.length > 0 && (
                        <Stack direction="row" spacing={0.5}>
                          <AppButton
                            size="small"
                            disabled={saving || form.services.length === pickableServices.length}
                            onClick={() =>
                              setForm((f) => ({ ...f, services: pickableServices }))
                            }
                          >
                            Выбрать все
                          </AppButton>
                          <AppButton
                            size="small"
                            disabled={saving || form.services.length === 0}
                            onClick={() => setForm((f) => ({ ...f, services: [] }))}
                          >
                            Снять
                          </AppButton>
                        </Stack>
                      )}
                    </Stack>
                    <Autocomplete
                      multiple
                      disableCloseOnSelect
                      limitTags={6}
                      options={pickableServices}
                      value={form.services}
                      groupBy={categoryLabel}
                      getOptionLabel={(s) => s.name}
                      isOptionEqualToValue={(a, b) => a.id === b.id}
                      onChange={(_, val) => setForm((f) => ({ ...f, services: val }))}
                      disabled={!canEdit || saving}
                      noOptionsText="Нет доступных услуг в филиале"
                      renderOption={(props, option, { selected }) => (
                        <li {...props} key={option.id}>
                          <Checkbox
                            icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                            checkedIcon={<CheckBoxIcon fontSize="small" />}
                            style={{ marginRight: 8 }}
                            checked={selected}
                          />
                          {option.name}
                        </li>
                      )}
                      renderTags={(value, getTagProps) =>
                        value.map((option, index) => (
                          <Chip
                            {...getTagProps({ index })}
                            key={option.id}
                            label={option.name}
                            size="small"
                          />
                        ))
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder={
                            form.services.length === 0 ? "Выберите услуги" : undefined
                          }
                          size="small"
                        />
                      )}
                    />
                  </Stack>

                  {/* isActive — применяется ко всем выбранным услугам */}
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.isActive}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, isActive: e.target.checked }))
                        }
                        disabled={!canEdit || saving}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2">
                        {form.isActive ? "Активны" : "Неактивны"}
                      </Typography>
                    }
                  />

                  {/* form actions */}
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <AppButton
                      onClick={() => {
                        setShowForm(false);
                        setForm(EMPTY_FORM);
                        setSaveError(null);
                      }}
                      disabled={saving}
                    >
                      Отмена
                    </AppButton>
                    {canEdit && (
                      <AppButton
                        variant="contained"
                        onClick={handleSave}
                        disabled={saving || form.services.length === 0}
                      >
                        {saving ? (
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <CircularProgress size={16} />
                            <span>
                              Сохранение… {savedCount} / {form.services.length}
                            </span>
                          </Stack>
                        ) : form.services.length > 1 ? (
                          `Добавить (${form.services.length})`
                        ) : (
                          "Добавить"
                        )}
                      </AppButton>
                    )}
                  </Stack>
                </Stack>
              </Box>
            )}

            {/* add button */}
            {canEdit && !showForm && (
              <AppButton
                variant="outlined"
                startIcon={<AddOutlined />}
                onClick={handleAddClick}
                fullWidth
              >
                Добавить услуги
              </AppButton>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
};

// ── AssignmentRow (view + activate/deactivate, no edit) ─────────────────────────

type AssignmentRowProps = {
  assignment: EmployeeServiceAssignment;
  canEdit: boolean;
  onDeactivate: () => void;
  onActivate: () => void;
};

const AssignmentRow: React.FC<AssignmentRowProps> = ({
  assignment: a,
  canEdit,
  onDeactivate,
  onActivate,
}) => (
  <Box
    sx={{
      p: 1.5,
      border: "1px solid",
      borderColor: a.isActive ? "divider" : "action.disabledBackground",
      borderRadius: 1,
      bgcolor: a.isActive ? "background.paper" : "action.hover",
      opacity: a.isActive ? 1 : 0.65,
    }}
  >
    <Stack
      direction="row"
      alignItems="flex-start"
      justifyContent="space-between"
      spacing={1}
    >
      <Box flex={1} minWidth={0}>
        <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
          <Typography variant="body2" fontWeight={600} noWrap>
            {a.service.name}
          </Typography>
          {!a.isActive && <Chip label="Неактивна" size="small" color="default" />}
          {a.branch && (
            <Chip label={a.branch.name} size="small" variant="outlined" />
          )}
        </Stack>

        <Stack direction="row" spacing={2} mt={0.5} flexWrap="wrap">
          {a.priceOverride && (
            <Typography variant="caption" color="primary.onSurface">
              Цена: {priceLabel(a.priceOverride)}
            </Typography>
          )}
          {a.durationOverrideMinutes != null && (
            <Typography variant="caption" color="text.secondary">
              {a.durationOverrideMinutes} мин
            </Typography>
          )}
        </Stack>
      </Box>

      {canEdit && (
        <Stack direction="row" spacing={0.5} flexShrink={0}>
          {a.isActive ? (
            <Tooltip title="Деактивировать">
              <IconButton size="small" onClick={onDeactivate} color="warning">
                <VisibilityOffOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Активировать">
              <IconButton size="small" color="success" onClick={onActivate}>
                <CheckCircleOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      )}
    </Stack>
  </Box>
);

export default EmployeeServicesDrawer;
