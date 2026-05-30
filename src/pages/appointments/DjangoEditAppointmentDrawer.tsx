/**
 * DjangoEditAppointmentDrawer
 *
 * Django-only drawer for editing an existing appointment.
 * Guarded by useCan("appointments.update").
 *
 * Editable fields:
 * - scheduledAt / isNight
 * - patient (swap or clear → booking mode)
 * - status
 * - service rows (employee + service pairs, cross-filtered via EmployeeService)
 * - complaints / doctorComplaints / adminComment
 *
 * On save: PATCH /api/appointments/{id}/
 */

import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import dayjs from "dayjs";
import { useNotification } from "@refinedev/core";

import { CustomDateTimePicker } from "../../components/ui";
import { roundDateTimeLocalToStep } from "../../utility/time";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useDjangoAppointmentData } from "../../hooks/useDjangoAppointmentData";
import {
  updateAppointment,
  parseBackendError,
  type DjangoAppointment,
  type DjangoAppointmentStatus,
} from "../../api/appointments";
import type { DjangoPatient } from "../../api/patients";
import type {
  DjangoEmployeeWithServices,
  DjangoCatalogServiceWithEmployees,
} from "../../hooks/useDjangoAppointmentData";

// ── types ─────────────────────────────────────────────────────────────────────

export type DjangoEditAppointmentDrawerProps = {
  open: boolean;
  onClose: () => void;
  appointment: DjangoAppointment | null;
  onSaved?: (updated: DjangoAppointment) => void;
};

type ServiceRow = {
  serviceId: number | null;
  employeeId: number | null;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
};

const STATUS_LABELS: Record<DjangoAppointmentStatus, string> = {
  scheduled: "Запланирован",
  waiting: "Ожидает",
  in_progress: "Принимается",
  completed: "Завершён",
  cancelled: "Отменён",
  no_show: "Не пришёл",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function inferWorkMode(iso: string): "day" | "night" {
  const m = iso.match(/T(\d{2}):/);
  const h = m ? Number(m[1]) : 12;
  return h >= 8 && h < 20 ? "day" : "night";
}

function nowRounded(): string {
  const t = new Date();
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  const hh = String(t.getHours()).padStart(2, "0");
  const mi = String(t.getMinutes()).padStart(2, "0");
  return roundDateTimeLocalToStep(`${yyyy}-${mm}-${dd}T${hh}:${mi}`, 15);
}

// ── component ─────────────────────────────────────────────────────────────────

const DjangoEditAppointmentDrawer: React.FC<DjangoEditAppointmentDrawerProps> = ({
  open,
  onClose,
  appointment,
  onSaved,
}) => {
  const { open: notify } = useNotification();
  const canUpdate = useCan("appointments.update");
  const { activeBranch } = usePermissions();

  const data = useDjangoAppointmentData(open);

  // ── form ────────────────────────────────────────────────────────────────
  const [scheduledAt, setScheduledAt] = React.useState<string>("");
  const [workMode, setWorkMode] = React.useState<"day" | "night">("day");
  const [status, setStatus] = React.useState<DjangoAppointmentStatus>("scheduled");
  const [isBooking, setIsBooking] = React.useState(false);
  const [selectedPatient, setSelectedPatient] = React.useState<DjangoPatient | null>(null);
  const [patientSearch, setPatientSearch] = React.useState("");
  const [serviceRows, setServiceRows] = React.useState<ServiceRow[]>([
    { serviceId: null, employeeId: null, quantity: 1, unitPrice: "", discountAmount: "" },
  ]);
  const [complaints, setComplaints] = React.useState("");
  const [doctorComplaints, setDoctorComplaints] = React.useState("");
  const [adminComment, setAdminComment] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // ── populate form from appointment ──────────────────────────────────────
  React.useEffect(() => {
    if (!open || !appointment) {
      setScheduledAt("");
      setWorkMode("day");
      setStatus("scheduled");
      setIsBooking(false);
      setSelectedPatient(null);
      setPatientSearch("");
      setServiceRows([{ serviceId: null, employeeId: null, quantity: 1, unitPrice: "", discountAmount: "" }]);
      setComplaints("");
      setDoctorComplaints("");
      setAdminComment("");
      setTouched(false);
      setSaving(false);
      setSaveError(null);
      return;
    }

    const base = appointment.scheduledAt ?? nowRounded();
    setScheduledAt(base);
    setWorkMode(appointment.isNight ? "night" : inferWorkMode(base));
    setStatus(appointment.status);
    setIsBooking(!appointment.patient);
    setComplaints(appointment.complaints ?? "");
    setDoctorComplaints(appointment.doctorComplaints ?? "");
    setAdminComment(appointment.adminComment ?? "");

    // Map existing service lines to rows
    if (appointment.services.length > 0) {
      setServiceRows(
        appointment.services.map((line) => ({
          serviceId: line.service.id,
          employeeId: line.employee.id,
          quantity: line.quantity ?? 1,
          unitPrice: line.unitPrice ?? "",
          discountAmount: line.discountAmount ?? "",
        })),
      );
    } else {
      setServiceRows([{ serviceId: null, employeeId: null, quantity: 1, unitPrice: "", discountAmount: "" }]);
    }
  }, [open, appointment]);

  // ── populate patient once data loads ────────────────────────────────────
  React.useEffect(() => {
    if (!open || !appointment?.patient || data.loading) return;
    const found = data.patients.find((p) => p.id === appointment.patient!.id);
    if (found) setSelectedPatient(found);
    else {
      // Fallback: construct a minimal option from the appointment's patient
      setSelectedPatient({
        id: appointment.patient.id,
        fullName: appointment.patient.fullName,
        phone: appointment.patient.phone,
        organizationId: 0,
        branch: null,
        secondaryPhone: null,
        birthDate: null,
        gender: "unknown",
        address: null,
        notes: null,
        source: null,
        isActive: true,
        createdAt: "",
        updatedAt: "",
      });
    }
  }, [open, appointment, data.patients, data.loading]);

  // ── patient search ───────────────────────────────────────────────────────
  const filteredPatients = React.useMemo<DjangoPatient[]>(() => {
    if (!patientSearch.trim()) return data.patients.slice(0, 20);
    const q = patientSearch.toLowerCase();
    return data.patients
      .filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.phone.includes(patientSearch.replace(/\D/g, "")),
      )
      .slice(0, 30);
  }, [data.patients, patientSearch]);

  // ── validation ───────────────────────────────────────────────────────────
  const validRows = serviceRows.filter(
    (r) => r.serviceId !== null && r.employeeId !== null,
  );

  const incompatibleRows = validRows.filter(
    (r) => !data.canEmployeeProvideService(r.employeeId, r.serviceId),
  );

  const isValid =
    !!scheduledAt &&
    (isBooking || !!selectedPatient) &&
    validRows.length > 0 &&
    incompatibleRows.length === 0;

  // ── submit ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setTouched(true);
    if (!isValid || !appointment) return;
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await updateAppointment(appointment.id, {
        patientId: isBooking ? null : (selectedPatient?.id ?? null),
        scheduledAt: dayjs(scheduledAt).toISOString(),
        isNight: workMode === "night",
        status,
        complaints: complaints.trim() || null,
        doctorComplaints: doctorComplaints.trim() || null,
        adminComment: adminComment.trim() || null,
        services: validRows.map((r) => ({
          serviceId: r.serviceId!,
          employeeId: r.employeeId!,
          quantity: r.quantity > 0 ? r.quantity : 1,
          ...(r.unitPrice.trim() ? { unitPrice: r.unitPrice.trim() } : {}),
          ...(r.discountAmount.trim() ? { discountAmount: r.discountAmount.trim() } : {}),
        })),
      });
      notify?.({ type: "success", message: "Приём обновлён" });
      onSaved?.(updated);
      onClose();
    } catch (err: unknown) {
      setSaveError(parseBackendError(err));
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (index: number, patch: Partial<ServiceRow>) => {
    setServiceRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...patch };
      return updated;
    });
  };

  if (!canUpdate) return null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={saving ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: "100vw", sm: 480, md: 520 },
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
          <Typography variant="h6">Редактировать приём</Typography>
          {appointment && (
            <Chip
              label={STATUS_LABELS[appointment.status] ?? appointment.status}
              size="small"
              variant="outlined"
            />
          )}
        </Stack>
        <IconButton onClick={saving ? undefined : onClose} size="small">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />

      {/* ── body ── */}
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
        <Stack spacing={2.5}>
          {/* ── errors ── */}
          {(saveError || data.error) && (
            <Alert severity="error" onClose={() => setSaveError(null)}>
              {saveError ?? data.error}
            </Alert>
          )}

          {data.loading && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                Загрузка справочников…
              </Typography>
            </Stack>
          )}

          {/* ── status ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Статус
            </Typography>
            <TextField
              select
              value={status}
              onChange={(e) => setStatus(e.target.value as DjangoAppointmentStatus)}
              size="small"
              fullWidth
            >
              {(Object.entries(STATUS_LABELS) as [DjangoAppointmentStatus, string][]).map(
                ([val, label]) => (
                  <MenuItem key={val} value={val}>
                    {label}
                  </MenuItem>
                ),
              )}
            </TextField>
          </Stack>

          {/* ── date/time + day/night ── */}
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Дата и время приёма *
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box flex={1}>
                <CustomDateTimePicker
                  value={scheduledAt ? dayjs(scheduledAt) : null}
                  onChange={(val) => {
                    const s = val ? val.format() : "";
                    setScheduledAt(s);
                    if (s) setWorkMode(inferWorkMode(s));
                  }}
                  ampm={false}
                  minutesStep={15}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      size: "small",
                      error: touched && !scheduledAt,
                      helperText: touched && !scheduledAt ? "Выберите дату и время" : "",
                    },
                  }}
                />
              </Box>
              <ToggleButtonGroup
                exclusive
                value={workMode}
                onChange={(_, v) => { if (v) setWorkMode(v); }}
                size="small"
              >
                <ToggleButton value="day" aria-label="День">
                  <WbSunnyOutlined fontSize="small" />
                </ToggleButton>
                <ToggleButton value="night" aria-label="Ночь">
                  <NightlightOutlined fontSize="small" />
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Stack>

          {/* ── booking toggle ── */}
          <FormControlLabel
            control={
              <Switch
                checked={isBooking}
                onChange={(e) => {
                  setIsBooking(e.target.checked);
                  if (e.target.checked) setSelectedPatient(null);
                }}
                size="small"
              />
            }
            label={
              <Typography variant="body2">Бронирование (без пациента)</Typography>
            }
          />

          {/* ── patient ── */}
          {!isBooking && (
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Пациент *
              </Typography>
              <Autocomplete<DjangoPatient>
                options={filteredPatients}
                value={selectedPatient}
                loading={data.loading}
                inputValue={patientSearch}
                onInputChange={(_, v) => setPatientSearch(v)}
                onChange={(_, v) => setSelectedPatient(v)}
                getOptionLabel={(p) =>
                  `${p.fullName}${p.phone ? ` — ${p.phone}` : ""}`
                }
                filterOptions={(x) => x}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderOption={(props, p) => (
                  <li {...props} key={p.id}>
                    <Stack>
                      <Typography variant="body2">{p.fullName}</Typography>
                      {p.phone && (
                        <Typography variant="caption" color="text.secondary">
                          {p.phone}
                        </Typography>
                      )}
                    </Stack>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    placeholder="Поиск по ФИО или телефону"
                    error={touched && !isBooking && !selectedPatient}
                    helperText={
                      touched && !isBooking && !selectedPatient
                        ? "Выберите пациента"
                        : ""
                    }
                  />
                )}
              />
            </Stack>
          )}

          {/* ── services ── */}
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Услуги *
            </Typography>

            {serviceRows.map((row, index) => {
              const availableEmployees = data.getEmployeesForService(row.serviceId);
              const availableServices = data.getServicesForEmployee(row.employeeId);

              const selectedEmployee =
                availableEmployees.find((e) => e.id === row.employeeId) ??
                data.employees.find((e) => e.id === row.employeeId) ??
                null;

              const selectedService =
                availableServices.find((s) => s.id === row.serviceId) ??
                data.services.find((s) => s.id === row.serviceId) ??
                null;

              const incompatible =
                row.serviceId !== null &&
                row.employeeId !== null &&
                !data.canEmployeeProvideService(row.employeeId, row.serviceId);

              return (
                <Stack
                  key={index}
                  spacing={1}
                  sx={{
                    p: 1.5,
                    border: "1px solid",
                    borderColor: incompatible ? "error.light" : "divider",
                    borderRadius: 1,
                  }}
                >
                  {/* Employee */}
                  <Autocomplete<DjangoEmployeeWithServices>
                    options={row.serviceId !== null ? availableEmployees : data.employees}
                    value={selectedEmployee}
                    onChange={(_, v) => {
                      updateRow(index, {
                        employeeId: v?.id ?? null,
                        serviceId:
                          row.serviceId !== null && v
                            ? data.canEmployeeProvideService(v.id, row.serviceId)
                              ? row.serviceId
                              : null
                            : row.serviceId,
                      });
                    }}
                    getOptionLabel={(e) => e.fullName}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    loading={data.loading}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder="Исполнитель"
                        error={touched && !row.employeeId}
                        helperText={touched && !row.employeeId ? "Выберите исполнителя" : ""}
                      />
                    )}
                  />

                  {/* Service + remove */}
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Autocomplete<DjangoCatalogServiceWithEmployees>
                      sx={{ flex: 1 }}
                      options={row.employeeId !== null ? availableServices : data.services}
                      value={selectedService}
                      onChange={(_, v) => {
                        updateRow(index, {
                          serviceId: v?.id ?? null,
                          employeeId:
                            row.employeeId !== null && v
                              ? data.canEmployeeProvideService(row.employeeId, v.id)
                                ? row.employeeId
                                : null
                              : row.employeeId,
                        });
                      }}
                      getOptionLabel={(s) => `${s.name} — ${s.basePrice} с`}
                      isOptionEqualToValue={(a, b) => a.id === b.id}
                      loading={data.loading}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          placeholder="Услуга"
                          error={touched && !row.serviceId}
                          helperText={touched && !row.serviceId ? "Выберите услугу" : ""}
                        />
                      )}
                    />
                    {serviceRows.length > 1 && (
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() =>
                          setServiceRows((prev) => prev.filter((_, i) => i !== index))
                        }
                        sx={{ mt: 0.5 }}
                      >
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>

                  {/* quantity / unitPrice / discountAmount */}
                  <Stack direction="row" spacing={1}>
                    <TextField
                      label="Кол-во"
                      size="small"
                      type="number"
                      value={row.quantity}
                      onChange={(e) =>
                        updateRow(index, { quantity: Math.max(1, Number(e.target.value)) })
                      }
                      inputProps={{ min: 1, step: 1 }}
                      sx={{ width: 80 }}
                    />
                    <TextField
                      label="Цена"
                      size="small"
                      value={row.unitPrice}
                      onChange={(e) => updateRow(index, { unitPrice: e.target.value })}
                      placeholder="По умолчанию"
                      InputProps={{
                        endAdornment: <InputAdornment position="end">с</InputAdornment>,
                      }}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="Скидка"
                      size="small"
                      value={row.discountAmount}
                      onChange={(e) => updateRow(index, { discountAmount: e.target.value })}
                      placeholder="0"
                      InputProps={{
                        endAdornment: <InputAdornment position="end">с</InputAdornment>,
                      }}
                      sx={{ flex: 1 }}
                    />
                  </Stack>

                  {incompatible && (
                    <Alert severity="error" sx={{ py: 0 }}>
                      Этот сотрудник не оказывает выбранную услугу
                    </Alert>
                  )}
                  {row.serviceId !== null &&
                    !data.loading &&
                    data.getEmployeesForService(row.serviceId).length === 0 && (
                      <Alert severity="warning" sx={{ py: 0 }}>
                        Нет сотрудников для этой услуги. Назначьте исполнителя в настройках.
                      </Alert>
                    )}
                </Stack>
              );
            })}

            <Button
              size="small"
              startIcon={<AddOutlined />}
              onClick={() =>
                setServiceRows((prev) => [
                  ...prev,
                  {
                    serviceId: null,
                    employeeId: prev[prev.length - 1]?.employeeId ?? null,
                    quantity: 1,
                    unitPrice: "",
                    discountAmount: "",
                  },
                ])
              }
              sx={{ alignSelf: "flex-start" }}
            >
              Добавить услугу
            </Button>

            {touched && validRows.length === 0 && (
              <Alert severity="error">
                Добавьте хотя бы одну услугу с исполнителем
              </Alert>
            )}

            {/* totalAmount display */}
            {appointment?.totalAmount && appointment.totalAmount !== "0.00" && appointment.totalAmount !== "0" && (
              <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1}>
                <Typography variant="caption" color="text.secondary">Итого (текущий):</Typography>
                <Typography variant="body2" fontWeight={600}>{appointment.totalAmount} с</Typography>
              </Stack>
            )}
          </Stack>

          {/* ── text fields ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Жалобы при обращении
            </Typography>
            <TextField
              value={complaints}
              onChange={(e) => setComplaints(e.target.value)}
              multiline
              minRows={2}
              fullWidth
              size="small"
              placeholder="Необязательно"
            />
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Жалобы (врач)
            </Typography>
            <TextField
              value={doctorComplaints}
              onChange={(e) => setDoctorComplaints(e.target.value)}
              multiline
              minRows={2}
              fullWidth
              size="small"
              placeholder="Необязательно"
            />
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Комментарий администратора
            </Typography>
            <TextField
              value={adminComment}
              onChange={(e) => setAdminComment(e.target.value)}
              multiline
              minRows={2}
              fullWidth
              size="small"
              placeholder="Необязательно"
            />
          </Stack>
        </Stack>
      </Box>

      {/* ── footer ── */}
      <Divider />
      <Box sx={{ p: 2, flexShrink: 0 }}>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={saving ? undefined : onClose} disabled={saving}>
            Отмена
          </Button>
          <Button
            variant="contained"
            disabled={saving || data.loading}
            onMouseEnter={() => { if (!touched) setTouched(true); }}
            onClick={handleSave}
            startIcon={
              saving ? <CircularProgress size={18} color="inherit" /> : undefined
            }
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
};

export default DjangoEditAppointmentDrawer;
