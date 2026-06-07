import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOff";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import { useNotification } from "@refinedev/core";

import { AppButton } from "../../../components/ui";
import {
  getEmployeeServices,
  assignEmployeeService,
  updateEmployeeService,
  type EmployeeServiceAssignment,
} from "../../../api/staff";
import { getServices, type Service } from "../../../api/catalog";
import { useCan } from "../../../hooks/useCan";
import { usePermissions } from "../../../hooks/usePermissions";

// ── types ─────────────────────────────────────────────────────────────────────

export type EmployeeServicesDrawerProps = {
  open: boolean;
  onClose: () => void;
  employeeId: number;
  employeeName: string;
};

type FormState = {
  serviceId: number | null;
  branchId: number | null;
  isActive: boolean;
  priceOverride: string;
  durationOverrideMinutes: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  serviceId: null,
  branchId: null,
  isActive: true,
  priceOverride: "",
  durationOverrideMinutes: "",
  notes: "",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function priceLabel(val: string | null): string {
  if (!val) return "";
  const n = parseFloat(val);
  return isNaN(n) ? val : `${n.toFixed(2)} с`;
}

// ── component ─────────────────────────────────────────────────────────────────

const EmployeeServicesDrawer: React.FC<EmployeeServicesDrawerProps> = ({
  open,
  onClose,
  employeeId,
  employeeName,
}) => {
  const { open: notify } = useNotification();
  const canView = useCan("staff.view");
  const canEdit = useCan("staff.update");
  const { activeMembership } = usePermissions();

  const availableBranches = activeMembership?.branches ?? [];

  // ── server data ───────────────────────────────────────────────────────────
  const [assignments, setAssignments] = React.useState<EmployeeServiceAssignment[]>([]);
  const [services, setServices] = React.useState<Service[]>([]);
  const [loadingData, setLoadingData] = React.useState(false);
  const [dataError, setDataError] = React.useState<string | null>(null);

  // ── form state ────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // ── load data on open ─────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open || !canView) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoadingData(true);
    setDataError(null);

    Promise.all([
      getEmployeeServices(employeeId),
      getServices(null, controller.signal),
    ])
      .then(([a, s]) => {
        if (!cancelled) {
          setAssignments(a);
          setServices(s.filter((sv) => sv.isActive));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setDataError(err instanceof Error ? err.message : "Ошибка загрузки данных");
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, canView, employeeId]);

  // ── reload services when branch changes in new-assignment form ────────────
  React.useEffect(() => {
    if (!showForm || editingId !== null) return;
    let cancelled = false;
    const controller = new AbortController();

    getServices(form.branchId, controller.signal)
      .then((s) => {
        if (!cancelled) setServices(s.filter((sv) => sv.isActive));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [form.branchId, showForm, editingId]);

  // ── reset on close ────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setSaveError(null);
      setAssignments([]);
      setDataError(null);
    }
  }, [open]);

  // ── open form for new assignment ──────────────────────────────────────────
  const handleAddClick = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setShowForm(true);
  };

  // ── open form to edit existing assignment ─────────────────────────────────
  const handleEditClick = (a: EmployeeServiceAssignment) => {
    setEditingId(a.id);
    setForm({
      serviceId: a.service.id,
      branchId: a.branch?.id ?? null,
      isActive: a.isActive,
      priceOverride: a.priceOverride ?? "",
      durationOverrideMinutes: a.durationOverrideMinutes != null
        ? String(a.durationOverrideMinutes)
        : "",
      notes: a.notes,
    });
    setSaveError(null);
    setShowForm(true);
  };

  // ── toggle active state ───────────────────────────────────────────────────
  const handleToggleActive = async (a: EmployeeServiceAssignment, isActive: boolean) => {
    try {
      const updated = await updateEmployeeService(employeeId, a.id, { isActive });
      setAssignments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      notify?.({
        type: "success",
        message: isActive ? "Услуга активирована" : "Услуга деактивирована",
      });
    } catch (err: unknown) {
      notify?.({
        type: "error",
        message: err instanceof Error ? err.message : "Не удалось изменить статус",
      });
    }
  };

  // ── save form ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.serviceId) return;
    setSaveError(null);
    setSaving(true);
    try {
      if (editingId !== null) {
        // update
        const updated = await updateEmployeeService(employeeId, editingId, {
          isActive: form.isActive,
          priceOverride: form.priceOverride.trim() || null,
          durationOverrideMinutes: form.durationOverrideMinutes.trim()
            ? Number(form.durationOverrideMinutes)
            : null,
          notes: form.notes.trim() || null,
        });
        setAssignments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        notify?.({ type: "success", message: "Назначение обновлено" });
      } else {
        // create
        const created = await assignEmployeeService(employeeId, {
          serviceId: form.serviceId,
          branchId: form.branchId ?? undefined,
          isActive: form.isActive,
          priceOverride: form.priceOverride.trim() || null,
          durationOverrideMinutes: form.durationOverrideMinutes.trim()
            ? Number(form.durationOverrideMinutes)
            : null,
          notes: form.notes.trim(),
        });
        setAssignments((prev) => [...prev, created]);
        notify?.({ type: "success", message: "Услуга назначена" });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const selectedService = services.find((s) => s.id === form.serviceId) ?? null;

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
        {/* data error */}
        {dataError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDataError(null)}>
            {dataError}
          </Alert>
        )}

        {/* loading */}
        {loadingData ? (
          <Stack alignItems="center" justifyContent="center" py={8} spacing={1}>
            <CircularProgress />
            <Typography variant="caption" color="text.secondary">
              Загрузка…
            </Typography>
          </Stack>
        ) : (
          <>
            {/* ── assignment list ── */}
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
                    onEdit={() => handleEditClick(a)}
                    onDeactivate={() => handleToggleActive(a, false)}
                    onActivate={() => handleToggleActive(a, true)}
                  />
                ))}
              </Stack>
            )}

            {/* ── add / edit form ── */}
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
                  {editingId !== null ? "Редактировать назначение" : "Новое назначение"}
                </Typography>

                {saveError && (
                  <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError(null)}>
                    {saveError}
                  </Alert>
                )}

                <Stack spacing={2}>
                  {/* service — locked when editing */}
                  <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      Услуга *
                    </Typography>
                    {editingId !== null ? (
                      <TextField
                        value={
                          assignments.find((a) => a.id === editingId)?.service.name ?? ""
                        }
                        disabled
                        fullWidth
                        size="small"
                      />
                    ) : (
                      <Autocomplete
                        options={services}
                        value={selectedService}
                        getOptionLabel={(s) => s.name}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        onChange={(_, val) =>
                          setForm((f) => ({ ...f, serviceId: val?.id ?? null }))
                        }
                        disabled={!canEdit}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Выберите услугу"
                            size="small"
                          />
                        )}
                      />
                    )}
                  </Stack>

                  {/* branch — only for new */}
                  {editingId === null && (
                    <Stack spacing={0.5}>
                      <Typography variant="body2" color="text.secondary" fontWeight={600}>
                        Филиал
                      </Typography>
                      <TextField
                        select
                        value={form.branchId ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            branchId: e.target.value === "" ? null : Number(e.target.value),
                          }))
                        }
                        fullWidth
                        size="small"
                        disabled={!canEdit}
                        SelectProps={{ displayEmpty: true }}
                      >
                        <MenuItem value="">Все доступные филиалы</MenuItem>
                        {availableBranches.map((b) => (
                          <MenuItem key={b.id} value={b.id}>
                            {b.name}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                  )}

                  {/* price override */}
                  <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      Цена (переопределение)
                    </Typography>
                    <TextField
                      value={form.priceOverride}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, priceOverride: e.target.value }))
                      }
                      placeholder={
                        selectedService
                          ? `Базовая: ${selectedService.basePrice} с`
                          : "Оставьте пустым — будет базовая цена"
                      }
                      fullWidth
                      size="small"
                      disabled={!canEdit}
                      inputProps={{ inputMode: "decimal" }}
                    />
                  </Stack>

                  {/* duration override */}
                  <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      Длительность, мин (переопределение)
                    </Typography>
                    <TextField
                      value={form.durationOverrideMinutes}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          durationOverrideMinutes: e.target.value.replace(/[^0-9]/g, ""),
                        }))
                      }
                      placeholder={
                        selectedService
                          ? `Базовая: ${selectedService.durationMinutes} мин`
                          : "Оставьте пустым — будет базовая длительность"
                      }
                      fullWidth
                      size="small"
                      disabled={!canEdit}
                      inputProps={{ inputMode: "numeric" }}
                    />
                  </Stack>

                  {/* isActive */}
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.isActive}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, isActive: e.target.checked }))
                        }
                        disabled={!canEdit}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2">
                        {form.isActive ? "Активна" : "Неактивна"}
                      </Typography>
                    }
                  />

                  {/* notes */}
                  <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      Заметки
                    </Typography>
                    <TextField
                      value={form.notes}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      fullWidth
                      size="small"
                      multiline
                      minRows={2}
                      disabled={!canEdit}
                      placeholder="Дополнительная информация"
                    />
                  </Stack>

                  {/* form actions */}
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <AppButton
                      onClick={() => {
                        setShowForm(false);
                        setEditingId(null);
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
                        disabled={saving || !form.serviceId}
                      >
                        {saving ? (
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <CircularProgress size={16} />
                            <span>Сохранение…</span>
                          </Stack>
                        ) : editingId !== null ? (
                          "Сохранить"
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
                Добавить услугу
              </AppButton>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
};

// ── AssignmentRow ─────────────────────────────────────────────────────────────

type AssignmentRowProps = {
  assignment: EmployeeServiceAssignment;
  canEdit: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
};

const AssignmentRow: React.FC<AssignmentRowProps> = ({
  assignment: a,
  canEdit,
  onEdit,
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
          {!a.isActive && (
            <Chip label="Неактивна" size="small" color="default" />
          )}
          {a.branch && (
            <Chip label={a.branch.name} size="small" variant="outlined" />
          )}
        </Stack>

        <Stack direction="row" spacing={2} mt={0.5} flexWrap="wrap">
          {a.priceOverride && (
            <Typography variant="caption" color="primary.main">
              Цена: {priceLabel(a.priceOverride)}
            </Typography>
          )}
          {a.durationOverrideMinutes != null && (
            <Typography variant="caption" color="text.secondary">
              {a.durationOverrideMinutes} мин
            </Typography>
          )}
          {a.notes && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {a.notes}
            </Typography>
          )}
        </Stack>
      </Box>

      {canEdit && (
        <Stack direction="row" spacing={0.5} flexShrink={0}>
          <Tooltip title="Редактировать">
            <IconButton size="small" onClick={onEdit}>
              <EditOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          {a.isActive && (
            <Tooltip title="Деактивировать">
              <IconButton size="small" onClick={onDeactivate} color="warning">
                <VisibilityOffOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {!a.isActive && (
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
