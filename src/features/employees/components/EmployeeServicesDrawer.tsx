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
};

const EMPTY_FORM: FormState = {
  serviceId: null,
  branchId: null,
  isActive: true,
};

// ── helpers ───────────────────────────────────────────────────────────────────

function priceLabel(val: string | null): string {
  if (!val) return "";
  const n = parseFloat(val);
  return isNaN(n) ? val : `${n.toFixed(2)} с`;
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
}) => {
  const { open: notify } = useNotification();
  const canView = useCan("staff.view");
  const canEdit = useCan("staff.update");
  const { activeOrganization, activeMembership, activeBranch } = usePermissions();

  const availableBranches = activeMembership?.branches ?? [];
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

  // ── close drawer + clear state when tenant context changes ──────────────────
  React.useEffect(() => {
    const prev = previousContextKeyRef.current;
    previousContextKeyRef.current = contextKey;
    if (contextKey === prev) return;
    if (open) onClose();
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaveError(null);
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
      getEmployeeServices(employeeId, controller.signal),
      getServices(activeBranchId, controller.signal),
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

  // ── reload services when branch changes in the add form ─────────────────────
  React.useEffect(() => {
    if (!showForm) return;
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
  }, [form.branchId, showForm]);

  // ── reset on close ────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSaveError(null);
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

  const handleSave = async () => {
    if (!form.serviceId) return;
    const capturedContextKey = currentContextKeyRef.current;
    setSaveError(null);
    setSaving(true);
    try {
      const created = await assignEmployeeService(employeeId, {
        serviceId: form.serviceId,
        branchId: form.branchId ?? undefined,
        isActive: form.isActive,
        priceOverride: null,
        durationOverrideMinutes: null,
        notes: "",
      });
      if (capturedContextKey !== currentContextKeyRef.current) return;
      setAssignments((prev) => [...prev, created]);
      notify?.({ type: "success", message: "Услуга назначена" });
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      if (capturedContextKey !== currentContextKeyRef.current) return;
      setSaveError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
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
    } catch (err: unknown) {
      if (capturedContextKey !== currentContextKeyRef.current) return;
      notify?.({
        type: "error",
        message: err instanceof Error ? err.message : "Не удалось изменить статус",
      });
    }
  };

  const selectedService = services.find((s) => s.id === form.serviceId) ?? null;
  // Hide services that are already assigned from the picker.
  const assignedServiceIds = new Set(assignments.map((a) => a.service.id));
  const pickableServices = services.filter((s) => !assignedServiceIds.has(s.id));

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
                  Назначить услугу
                </Typography>

                {saveError && (
                  <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError(null)}>
                    {saveError}
                  </Alert>
                )}

                <Stack spacing={2}>
                  {/* branch */}
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
                          serviceId: null,
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

                  {/* service — picked from the branch's existing services */}
                  <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      Услуга *
                    </Typography>
                    <Autocomplete
                      options={pickableServices}
                      value={selectedService}
                      getOptionLabel={(s) => s.name}
                      isOptionEqualToValue={(a, b) => a.id === b.id}
                      onChange={(_, val) =>
                        setForm((f) => ({ ...f, serviceId: val?.id ?? null }))
                      }
                      disabled={!canEdit}
                      noOptionsText="Нет доступных услуг в филиале"
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder="Выберите услугу"
                          size="small"
                        />
                      )}
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
                        disabled={saving || !form.serviceId}
                      >
                        {saving ? (
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <CircularProgress size={16} />
                            <span>Сохранение…</span>
                          </Stack>
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
            <Typography variant="caption" color="primary.main">
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
