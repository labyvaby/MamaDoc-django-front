import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import Grid from "@mui/material/Grid";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import dayjs from "dayjs";
import { useNotification } from "@refinedev/core";

import { AppCard, CustomDateTimePicker } from "../../components/ui";
import { CloseGuardDialog } from "../../components/common/CloseGuardDialog";
import { useCloseGuard } from "../../hooks/useCloseGuard";
import { formatKGS } from "../../utility/format";
import { roundDateTimeLocalToStep } from "../../utility/time";
import { useCan } from "../../hooks/useCan";
import { useDjangoAppointmentData } from "../../hooks/useDjangoAppointmentData";
import {
  updateAppointment,
  parseBackendError,
  type DjangoAppointment,
} from "../../api/appointments";
import { normalizeDjangoStatus } from "../../config/appointmentStatuses";
import type { DjangoPatient } from "../../api/patients";
import type {
  DjangoEmployeeWithServices,
  DjangoCatalogServiceWithEmployees,
} from "../../hooks/useDjangoAppointmentData";
import DjangoAddPatientDrawer from "../../components/patients/DjangoAddPatientDrawer";

// ── types ─────────────────────────────────────────────────────────────────────

export type DjangoEditAppointmentDrawerProps = {
  open: boolean;
  onClose: () => void;
  appointment: DjangoAppointment | null;
  onSaved?: (updated: DjangoAppointment) => void;
};

type ServiceRow = {
  /** id of the existing AppointmentServiceLine, null for new rows */
  lineId: number | null;
  serviceId: number | null;
  employeeId: number | null;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
};

// Django не имеет товаров в MVP, но держим структуру для UI совместимости с оригиналом
type ProductRow = {
  productId: string;
  quantity: number;
  name: string;
  price: number;
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

  const data = useDjangoAppointmentData(open, appointment?.branchId ?? null);

  // ── form ────────────────────────────────────────────────────────────────
  const [scheduledAt, setScheduledAt] = React.useState<string>("");
  const [workMode, setWorkMode] = React.useState<"day" | "night">("day");
  const [isBooking, setIsBooking] = React.useState(false);
  const [selectedPatient, setSelectedPatient] = React.useState<DjangoPatient | null>(null);
  const [patientSearch, setPatientSearch] = React.useState("");
  const [serviceRows, setServiceRows] = React.useState<ServiceRow[]>([
    { lineId: null, serviceId: null, employeeId: null, quantity: 1, unitPrice: "", discountAmount: "" },
  ]);
  // Товары — В разработке (Django API не поддерживает в MVP)
  const [productRows, setProductRows] = React.useState<ProductRow[]>([]);
  const [complaints, setComplaints] = React.useState("");
  const [doctorComplaints, setDoctorComplaints] = React.useState("");
  const [adminComment, setAdminComment] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [addPatientOpen, setAddPatientOpen] = React.useState(false);

  // ── isDirty для CloseGuard ───────────────────────────────────────────────
  const isDirty = React.useMemo(() => {
    if (saving || !appointment) return false;
    const initAt = appointment.scheduledAt ?? "";
    if (scheduledAt !== initAt) return true;
    const initMode = appointment.isNight ? "night" : inferWorkMode(initAt);
    if (workMode !== initMode) return true;
    if (isBooking !== !appointment.patient) return true;
    if (complaints !== (appointment.complaints ?? "")) return true;
    if (doctorComplaints !== (appointment.doctorComplaints ?? "")) return true;
    if (adminComment !== (appointment.adminComment ?? "")) return true;
    return touched;
  }, [saving, appointment, scheduledAt, workMode, isBooking, complaints, doctorComplaints, adminComment, touched]);

  const { guardedClose, confirmOpen: guardConfirmOpen, confirmClose, cancelClose } =
    useCloseGuard({ isDirty, isOpen: open, onClose });

  // ── populate form from appointment ──────────────────────────────────────
  React.useEffect(() => {
    if (!open || !appointment) {
      setScheduledAt("");
      setWorkMode("day");

      setIsBooking(false);
      setSelectedPatient(null);
      setPatientSearch("");
      setServiceRows([
        { lineId: null, serviceId: null, employeeId: null, quantity: 1, unitPrice: "", discountAmount: "" },
      ]);
      setProductRows([]);
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

    setIsBooking(!appointment.patient);
    setComplaints(appointment.complaints ?? "");
    setDoctorComplaints(appointment.doctorComplaints ?? "");
    setAdminComment(appointment.adminComment ?? "");

    if (appointment.services.length > 0) {
      setServiceRows(
        appointment.services.map((line) => ({
          lineId: line.id ?? null,
          serviceId: line.service?.id ?? null,
          employeeId: line.employee?.id ?? null,
          quantity: line.quantity ?? 1,
          unitPrice: line.unitPrice ?? "",
          discountAmount: line.discountAmount ?? "",
        })),
      );
    } else {
      setServiceRows([
        { lineId: null, serviceId: null, employeeId: null, quantity: 1, unitPrice: "", discountAmount: "" },
      ]);
    }
  }, [open, appointment]);

  // ── populate patient once data loads ────────────────────────────────────
  React.useEffect(() => {
    if (!open || !appointment?.patient || data.loading) return;
    const found = data.patients.find((p) => p.id === appointment.patient!.id);
    if (found) {
      setSelectedPatient(found);
    } else {
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

  // ── total ────────────────────────────────────────────────────────────────
  const servicesTotal = React.useMemo(() =>
    validRows.reduce((sum, r) => {
      const svc = data.services.find((s) => s.id === r.serviceId);
      return sum + (svc ? Number(svc.basePrice) * r.quantity : 0);
    }, 0),
    [validRows, data.services],
  );
  const productsTotal = productRows.reduce((sum, r) => sum + r.price * r.quantity, 0);
  const grandTotal = servicesTotal + productsTotal;

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
        complaints: complaints.trim() || null,
        doctorComplaints: doctorComplaints.trim() || null,
        adminComment: adminComment.trim() || null,
        services: validRows.map((r) => ({
          ...(r.lineId != null ? { id: r.lineId } : {}),
          serviceId: r.serviceId!,
          employeeId: r.employeeId,
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

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={saving ? undefined : guardedClose}
        PaperProps={{
          sx: {
            width: { xs: 320, sm: 480, md: 520 },
            maxWidth: "100vw",
            overscrollBehavior: "contain",
          },
        }}
      >
        <Box
          sx={{
            width: 1,
            minWidth: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* ── header ── */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            px={2}
            py={1.5}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6">Редактирование приёма</Typography>
              {appointment && (
                <Chip
                  label={normalizeDjangoStatus(appointment.status)}
                  size="small"
                  variant="outlined"
                />
              )}
            </Stack>
            <IconButton onClick={saving ? undefined : guardedClose} size="small">
              <CloseOutlined />
            </IconButton>
          </Stack>
          <Divider />

          {/* ── body ── */}
          <Box px={2} py={2} sx={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
            <Stack spacing={2}>
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

              {/* ── дата и время ── */}
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                Дата и время приёма
              </Typography>
              <Grid container spacing={1.5} alignItems="stretch">
                <Grid item xs={12} sm={7.5}>
                  <CustomDateTimePicker
                    label="Дата и время *"
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
                        InputLabelProps: { shrink: true },
                        sx: {
                          "& .MuiInputBase-root": {
                            fontSize: "1.1rem",
                            fontWeight: 500,
                          },
                        },
                        error: touched && !scheduledAt,
                        helperText: touched && !scheduledAt ? "Выберите дату и время" : "",
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={4.5} sx={{ display: "flex", alignItems: "center" }}>
                  <Box sx={{ width: 1 }}>
                    <ToggleButtonGroup
                      exclusive
                      value={workMode}
                      onChange={(_, v) => { if (v) setWorkMode(v); }}
                      size="small"
                      sx={{
                        width: 1,
                        bgcolor: "action.hover",
                        borderRadius: 1.5,
                        p: "3px",
                        border: "none",
                        "& .MuiToggleButton-root": {
                          flex: 1,
                          border: "none",
                          borderRadius: 1,
                          py: 0.75,
                          transition: "all 0.2s ease-in-out",
                          bgcolor: "transparent",
                          color: "text.disabled",
                          boxShadow: "none",
                          "&:hover": { bgcolor: "action.selected" },
                          "&.Mui-selected": {
                            bgcolor: "primary.main",
                            color: "primary.contrastText",
                            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.05)",
                            fontWeight: 600,
                            "&:hover": { bgcolor: "primary.dark" },
                          },
                        },
                      }}
                    >
                      <ToggleButton value="day" aria-label="Дневной">
                        <WbSunnyOutlined
                          sx={{
                            fontSize: 20,
                            color: workMode === "day" ? "primary.contrastText" : "text.disabled",
                          }}
                        />
                      </ToggleButton>
                      <ToggleButton value="night" aria-label="Ночной">
                        <NightlightOutlined
                          sx={{
                            fontSize: 20,
                            color: workMode === "night" ? "primary.contrastText" : "text.disabled",
                          }}
                        />
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                </Grid>
              </Grid>

              {/* ── пациент ── */}
              <Stack spacing={0.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">
                    Пациент *
                  </Typography>
                  <Button size="small" onClick={() => setAddPatientOpen(true)}>
                    + Добавить пациента
                  </Button>
                </Stack>
                <Autocomplete<DjangoPatient>
                  disabled={isBooking}
                  options={filteredPatients}
                  loading={data.loading}
                  value={selectedPatient}
                  inputValue={patientSearch}
                  onInputChange={(_, v) => setPatientSearch(v)}
                  onChange={(_, v) => setSelectedPatient(v)}
                  getOptionLabel={(p) =>
                    `${p.fullName || "Нет ФИО"} — ${p.phone || "Нет телефона"}`
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
                      placeholder="Поиск по ФИО или телефону"
                      fullWidth
                      error={touched && !isBooking && !selectedPatient}
                      helperText={
                        touched && !isBooking && !selectedPatient ? "Выберите пациента" : ""
                      }
                    />
                  )}
                />
              </Stack>

              {/* ── Кастомный Toggle бронирования (1-в-1 с оригиналом) ── */}
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: isBooking ? "warning.lighter" : "action.hover",
                  border: "1px solid",
                  borderColor: isBooking ? "warning.light" : "divider",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  "&:hover": {
                    bgcolor: isBooking ? "warning.lighter" : "action.selected",
                  },
                }}
                onClick={() => {
                  if (!isBooking) setSelectedPatient(null);
                  setIsBooking(!isBooking);
                  setTouched(true);
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Бронирование (без пациента)
                    </Typography>
                  </Stack>
                  <Box
                    sx={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      bgcolor: isBooking ? "primary.main" : "text.disabled",
                      position: "relative",
                      transition: "bgcolor 0.2s",
                    }}
                  >
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        bgcolor: "white",
                        position: "absolute",
                        top: 3,
                        left: isBooking ? 19 : 3,
                        transition: "left 0.2s",
                      }}
                    />
                  </Box>
                </Stack>
              </Box>

              {/* ── Услуги + Товары (показывается если выбран пациент или бронирование) ── */}
              {(selectedPatient || isBooking) && (
                <>
                  <AppCard variant="outlined" sx={{ bgcolor: "background.paper" }} disableContentPadding>
                    <CardContent sx={{ p: 2 }}>
                      <Stack spacing={2}>
                        {/* ── Заголовок Услуги ── */}
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                          Услуги
                        </Typography>
                        <Divider />

                        {/* ── Строки услуг ── */}
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
                            <Stack key={index} spacing={1}>
                              {index === 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  Врач / Исполнитель
                                </Typography>
                              )}
                              <Autocomplete<DjangoEmployeeWithServices>
                                fullWidth
                                options={row.serviceId !== null ? availableEmployees : data.employees}
                                loading={data.loading}
                                value={selectedEmployee}
                                onChange={(_, v) =>
                                  updateRow(index, {
                                    employeeId: v?.id ?? null,
                                    serviceId:
                                      row.serviceId !== null && v
                                        ? data.canEmployeeProvideService(v.id, row.serviceId)
                                          ? row.serviceId
                                          : null
                                        : row.serviceId,
                                  })
                                }
                                getOptionLabel={(e) => e.fullName}
                                isOptionEqualToValue={(a, b) => a.id === b.id}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder="Исполнитель"
                                    size="small"
                                    fullWidth
                                    error={touched && !row.employeeId}
                                    helperText={touched && !row.employeeId ? "Выберите исполнителя" : ""}
                                  />
                                )}
                              />
                              {index === 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  Наименование услуги
                                </Typography>
                              )}
                              <Stack direction="row" spacing={1} alignItems="flex-start">
                                <Autocomplete<DjangoCatalogServiceWithEmployees>
                                  sx={{ flex: 1 }}
                                  options={row.employeeId !== null ? availableServices : data.services}
                                  loading={data.loading}
                                  value={selectedService}
                                  onChange={(_, v) =>
                                    updateRow(index, {
                                      serviceId: v?.id ?? null,
                                      employeeId:
                                        row.employeeId !== null && v
                                          ? data.canEmployeeProvideService(row.employeeId, v.id)
                                            ? row.employeeId
                                            : null
                                          : row.employeeId,
                                    })
                                  }
                                  getOptionLabel={(s) => `${s.name} — ${s.basePrice} с`}
                                  isOptionEqualToValue={(a, b) => a.id === b.id}
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      placeholder="Услуга"
                                      size="small"
                                      fullWidth
                                      error={touched && !row.serviceId}
                                      helperText={touched && !row.serviceId ? "Выберите услугу" : ""}
                                    />
                                  )}
                                />
                                {serviceRows.length > 1 && (
                                  <Tooltip title="Удалить услугу">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() =>
                                        setServiceRows((prev) => prev.filter((_, i) => i !== index))
                                      }
                                      sx={{
                                        mt: 0.5,
                                        border: "1px solid",
                                        borderColor: "error.main",
                                        "&:hover": { backgroundColor: "rgba(211,47,47,0.08)" },
                                      }}
                                    >
                                      <DeleteOutlined fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Stack>
                              {incompatible && (
                                <Alert severity="error" sx={{ py: 0 }}>
                                  Этот сотрудник не оказывает выбранную услугу
                                </Alert>
                              )}
                            </Stack>
                          );
                        })}

                        <Button
                          size="small"
                          onClick={() =>
                            setServiceRows((prev) => [
                              ...prev,
                              {
                                lineId: null,
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
                          + Добавить услугу
                        </Button>

                        <Divider />

                        {/* ── Товары ── */}
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                          Товары
                        </Typography>

                        {productRows.length > 0 && (
                          <Stack direction="row" spacing={1.5}>
                            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                              Название товара
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ width: 96 }}>
                              Количество
                            </Typography>
                            <Box sx={{ width: 34 }} />
                          </Stack>
                        )}

                        <Stack spacing={1.5}>
                          {productRows.map((row, index) => (
                            <Stack key={index} spacing={0.5}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                {/* Название товара — заглушка (Django MVP не имеет товаров) */}
                                <TextField
                                  sx={{ flex: 1 }}
                                  size="small"
                                  value={row.name}
                                  disabled
                                  placeholder="Товар"
                                />
                                {/* Счётчик [− | N | +] */}
                                <Box
                                  sx={{
                                    border: "1px solid",
                                    borderColor: "divider",
                                    borderRadius: 1,
                                    bgcolor: "background.paper",
                                    height: 40,
                                    width: 96,
                                    display: "flex",
                                    alignItems: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  <Button
                                    size="small"
                                    onClick={() => {
                                      if (row.quantity <= 1) {
                                        setProductRows((prev) => prev.filter((_, i) => i !== index));
                                      } else {
                                        setProductRows((prev) =>
                                          prev.map((r, i) =>
                                            i === index ? { ...r, quantity: r.quantity - 1 } : r,
                                          ),
                                        );
                                      }
                                    }}
                                    sx={{ minWidth: 32, px: 0.5, minHeight: 38 }}
                                  >
                                    −
                                  </Button>
                                  <Box sx={{ flex: 1, textAlign: "center" }}>
                                    <Typography variant="body2">{row.quantity}</Typography>
                                  </Box>
                                  <Button
                                    size="small"
                                    onClick={() =>
                                      setProductRows((prev) =>
                                        prev.map((r, i) =>
                                          i === index ? { ...r, quantity: r.quantity + 1 } : r,
                                        ),
                                      )
                                    }
                                    sx={{ minWidth: 32, px: 0.5, minHeight: 38 }}
                                  >
                                    +
                                  </Button>
                                </Box>
                                <Tooltip title="Удалить товар">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() =>
                                      setProductRows((prev) => prev.filter((_, i) => i !== index))
                                    }
                                    sx={{
                                      border: "1px solid",
                                      borderColor: "error.main",
                                      "&:hover": { backgroundColor: "rgba(211,47,47,0.08)" },
                                    }}
                                  >
                                    <DeleteOutlined fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                              {/* Итого под строкой товара */}
                              <Stack direction="row" justifyContent="space-between" sx={{ px: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                  Итого:
                                </Typography>
                                <Typography variant="caption" fontWeight={600}>
                                  {formatKGS(row.price * row.quantity)}
                                </Typography>
                              </Stack>
                            </Stack>
                          ))}
                        </Stack>

                        <Button
                          size="small"
                          onClick={() =>
                            setProductRows((prev) => [
                              ...prev,
                              { productId: "", quantity: 1, name: "", price: 0 },
                            ])
                          }
                          sx={{ alignSelf: "flex-start" }}
                        >
                          + Добавить товар
                        </Button>

                        <Divider />

                        {/* ── Общая стоимость ── */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" color="text.secondary">
                            Общая стоимость
                          </Typography>
                          <Typography variant="h6" fontWeight={700}>
                            {formatKGS(grandTotal)}
                          </Typography>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </AppCard>

                  {touched && validRows.length === 0 && (
                    <Alert severity="error">
                      Добавьте хотя бы одну услугу с исполнителем
                    </Alert>
                  )}

                  {/* ── Текстовые поля ── */}
                  <TextField
                    placeholder="Жалобы при обращении"
                    value={complaints}
                    onChange={(e) => setComplaints(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                  <TextField
                    placeholder="Жалобы (врач)"
                    value={doctorComplaints}
                    onChange={(e) => setDoctorComplaints(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                  <TextField
                    placeholder={
                      isBooking
                        ? "Комментарий администратора (обязательно)"
                        : "Комментарий администратора"
                    }
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                    error={touched && isBooking && !adminComment.trim()}
                    helperText={
                      touched && isBooking && !adminComment.trim()
                        ? "Обязательное поле для бронирования"
                        : ""
                    }
                  />
                </>
              )}
            </Stack>
          </Box>

          {/* ── footer ── */}
          <Divider />
          <Box
            px={2}
            py={1.5}
            display="flex"
            justifyContent="flex-end"
            alignItems="center"
            gap={1.5}
          >
            <Button variant="outlined" onClick={saving ? undefined : guardedClose} disabled={saving}>
              Отмена
            </Button>
            <Button
              variant="contained"
              disabled={saving || data.loading}
              onMouseEnter={() => { if (!touched) setTouched(true); }}
              onClick={handleSave}
            >
              {saving ? (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={18} color="inherit" />
                  <span>Сохранение…</span>
                </Stack>
              ) : (
                "Сохранить"
              )}
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* CloseGuard диалог */}
      <CloseGuardDialog
        open={guardConfirmOpen}
        title="редактирование приёма"
        onConfirm={confirmClose}
        onCancel={cancelClose}
      />

      {/* Быстрое добавление пациента */}
      <DjangoAddPatientDrawer
        open={addPatientOpen}
        onClose={() => setAddPatientOpen(false)}
        onCreated={(p: DjangoPatient) => {
          setSelectedPatient(p);
          setAddPatientOpen(false);
        }}
      />
    </>
  );
};

export default DjangoEditAppointmentDrawer;
