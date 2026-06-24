import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  Grid,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { useNotification } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";

import { CustomDateTimePicker } from "../../components/ui";
import { roundDateTimeLocalToStep } from "../../utility/time";
import { formatKGS } from "../../utility/format";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useDjangoAppointmentData } from "../../hooks/useDjangoAppointmentData";
import { createAppointment, parseBackendError } from "../../api/appointments";
import { getPatientBalance } from "../../api/patientBalance";
import { getProducts, type DjangoProduct } from "../../api/warehouse";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
} from "../../api/queryKeys";
import type { DjangoPatient } from "../../api/patients";
import { searchPatients } from "../../api/patients";
import type {
  DjangoEmployeeWithServices,
  DjangoCatalogServiceWithEmployees,
} from "../../hooks/useDjangoAppointmentData";
import DjangoAddPatientDrawer from "../../components/patients/DjangoAddPatientDrawer";

// ── helpers ───────────────────────────────────────────────────────────────────

function inferWorkMode(iso: string): "day" | "night" {
  const m = String(iso || "").match(/T(\d{2}):/);
  if (!m) return "day";
  const h = Number(m[1]);
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

type ServiceRow = {
  serviceId: number | null;
  employeeId: number | null;
  quantity: number;
};

type ProductRow = {
  productId: number | null;
  // Хранится как строка, чтобы поле можно было полностью стереть во время
  // ввода (пустое значение). Нормализуется к >= 1 на onBlur / при сабмите.
  quantity: string;
};

// Числовое количество товара из «сырой» строки (пусто/0/мусор → 0).
function parseQty(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ── types ─────────────────────────────────────────────────────────────────────

export type DjangoAddAppointmentDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  initialDate?: string | null;
  initialEmployeeId?: number | null;
};

// ── component ─────────────────────────────────────────────────────────────────

const DjangoAddAppointmentDrawer: React.FC<DjangoAddAppointmentDrawerProps> = ({
  open,
  onClose,
  onCreated,
  initialDate,
  initialEmployeeId,
}) => {
  const { open: notify } = useNotification();
  const canCreate = useCan("appointments.create");
  const { activeBranch, activeOrganization, activeMembership } = usePermissions();

  const data = useDjangoAppointmentData(
    open,
    activeBranch?.id ?? null,
    activeOrganization?.id ?? null,
    activeMembership?.id ?? null,
  );

  // ── form state ───────────────────────────────────────────────────────────
  const [scheduledAt, setScheduledAt] = React.useState<string>("");
  const [workMode, setWorkMode] = React.useState<"day" | "night">("day");
  const [isBooking, setIsBooking] = React.useState(false);
  const [selectedPatient, setSelectedPatient] = React.useState<DjangoPatient | null>(null);
  const [patientSearch, setPatientSearch] = React.useState("");
  const [serviceRows, setServiceRows] = React.useState<ServiceRow[]>([
    { serviceId: null, employeeId: null, quantity: 1 },
  ]);
  const [productRows, setProductRows] = React.useState<ProductRow[]>([]);
  const [products, setProducts] = React.useState<DjangoProduct[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [complaints, setComplaints] = React.useState("");
  const [adminComment, setAdminComment] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [addPatientOpen, setAddPatientOpen] = React.useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = React.useState(false);
  // Чтобы ошибка была видна, даже если пользователь прокрутил вниз к «Сохранить».
  const errorRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (saveError) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [saveError]);

  // ── init / reset ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setScheduledAt("");
      setWorkMode("day");
      setIsBooking(false);
      setSelectedPatient(null);
      setPatientSearch("");
      setServiceRows([{ serviceId: null, employeeId: null, quantity: 1 }]);
      setProductRows([]);
      setComplaints("");
      setAdminComment("");
      setTouched(false);
      setSaving(false);
      setSaveError(null);
      setConfirmCloseOpen(false);
      return;
    }
    // Округляем initialDate под шаг тайм-пикера (15 мин): вызывающая сторона
    // может передать «сырое» текущее время (например 19:58), которое пикер
    // не разрешает выбрать. nowRounded() уже округлён.
    const base = initialDate ? roundDateTimeLocalToStep(initialDate, 15) : nowRounded();
    setScheduledAt(base);
    setWorkMode(inferWorkMode(base));
  }, [open, initialDate]);

  React.useEffect(() => {
    if (open && initialEmployeeId) {
      setServiceRows((prev) =>
        prev.map((r, i) => (i === 0 ? { ...r, employeeId: initialEmployeeId } : r)),
      );
    }
  }, [open, initialEmployeeId]);

  // ── load sellable products (with context stock) ────────────────────────────
  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setProductsLoading(true);
    getProducts(ctrl.signal)
      .then((list) => {
        if (ctrl.signal.aborted) return;
        // Only goods that can be sold and are currently in stock.
        setProducts(list.filter((p) => p.isActive && p.isForSale && p.stock > 0));
      })
      .catch(() => {
        /* products are optional; ignore load errors silently */
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setProductsLoading(false);
      });
    return () => ctrl.abort();
  }, [open, activeBranch?.id]);

  // ── patient search (server-side; never loads the whole patient table) ───────
  // The clinic can have tens of thousands of patients, so the autocomplete
  // queries the server with the typed term (debounced) instead of filtering a
  // fully-loaded list in memory.
  const [patientOptions, setPatientOptions] = React.useState<DjangoPatient[]>([]);
  const [patientsLoading, setPatientsLoading] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      setPatientsLoading(true);
      searchPatients(patientSearch.trim(), 30, ctrl.signal)
        .then((rows) => {
          if (!ctrl.signal.aborted) setPatientOptions(rows);
        })
        .catch(() => {
          /* abort/network — keep previous options */
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setPatientsLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [open, patientSearch]);

  // Always include the already-selected patient so it stays visible/selectable.
  const filteredPatients = React.useMemo<DjangoPatient[]>(() => {
    if (!selectedPatient) return patientOptions;
    if (patientOptions.some((p) => p.id === selectedPatient.id)) {
      return patientOptions;
    }
    return [selectedPatient, ...patientOptions];
  }, [patientOptions, selectedPatient]);

  // ── selected patient balance (debt warning) ────────────────────────────────
  const balanceQuery = useQuery({
    queryKey: djangoQueryKeys.patients.balance(selectedPatient?.id ?? 0),
    queryFn: ({ signal }) => getPatientBalance(selectedPatient!.id, signal),
    enabled: !!selectedPatient && !isBooking,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    retry: false,
  });
  const patientBalanceNum = balanceQuery.data
    ? parseFloat(balanceQuery.data.balance)
    : 0;
  const patientHasDebt = !!balanceQuery.data && patientBalanceNum < 0;

  // ── validation ────────────────────────────────────────────────────────────
  const validRows = serviceRows.filter((r) => r.serviceId !== null && r.employeeId !== null);
  const incompatibleRows = validRows.filter(
    (r) => !data.canEmployeeProvideService(r.employeeId, r.serviceId),
  );
  const validProductRows = productRows.filter(
    (r) => r.productId !== null && parseQty(r.quantity) > 0,
  );
  // A selected quantity exceeding context stock — block submit with a hint.
  const overstockedRows = validProductRows.filter((r) => {
    const p = products.find((x) => x.id === r.productId);
    return p ? parseQty(r.quantity) > p.stock : false;
  });
  const isValid =
    !!scheduledAt &&
    (isBooking || !!selectedPatient) &&
    (!isBooking || !!adminComment.trim()) &&
    validRows.length > 0 &&
    incompatibleRows.length === 0 &&
    overstockedRows.length === 0;

  // ── totals (services + goods share one bill) ───────────────────────────────
  const totalCost = React.useMemo(() => {
    const servicesSum = validRows.reduce((sum, r) => {
      const svc = data.services.find((s) => s.id === r.serviceId);
      return sum + (svc ? Number(svc.basePrice) * r.quantity : 0);
    }, 0);
    const productsSum = validProductRows.reduce((sum, r) => {
      const p = products.find((x) => x.id === r.productId);
      return sum + (p ? p.price * parseQty(r.quantity) : 0);
    }, 0);
    return servicesSum + productsSum;
  }, [validRows, data.services, validProductRows, products]);

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setTouched(true);
    if (!isValid) return;
    setSaveError(null);
    setSaving(true);
    try {
      await createAppointment({
        patientId: selectedPatient?.id ?? null,
        branchId: activeBranch?.id ?? null,
        // Scope to the active org so branch/org never mismatch (multi-org users).
        organizationId: activeOrganization?.id ?? null,
        scheduledAt: dayjs(scheduledAt).toISOString(),
        isNight: workMode === "night",
        isBooking,
        complaints: complaints.trim() || null,
        adminComment: adminComment.trim() || null,
        services: validRows.map((r) => ({
          serviceId: r.serviceId!,
          employeeId: r.employeeId,
          quantity: r.quantity > 0 ? r.quantity : 1,
        })),
        products: validProductRows.map((r) => ({
          productId: r.productId!,
          quantity: parseQty(r.quantity) > 0 ? parseQty(r.quantity) : 1,
        })),
      });
      notify?.({ type: "success", message: "Приём успешно создан!" });
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      setSaveError(parseBackendError(err));
    } finally {
      setSaving(false);
    }
  };

  // ── dirty check + guarded close ────────────────────────────────────────────
  // Грязная форма = заполнено хоть что-то значимое (дата/время не считаем — они
  // проставляются автоматически при открытии).
  const isDirty =
    selectedPatient !== null ||
    isBooking ||
    serviceRows.some((r) => r.serviceId !== null || r.employeeId !== null) ||
    serviceRows.length > 1 ||
    productRows.length > 0 ||
    complaints.trim() !== "" ||
    adminComment.trim() !== "";

  // Перехватываем все способы закрытия: крестик, «Отмена», клик по фону / Esc.
  const requestClose = () => {
    if (saving) return;
    if (isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    onClose();
  };

  const confirmDiscardAndClose = () => {
    setConfirmCloseOpen(false);
    onClose();
  };

  // ── row helpers ───────────────────────────────────────────────────────────
  const updateRow = (index: number, patch: Partial<ServiceRow>) => {
    setServiceRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...patch };
      return updated;
    });
  };

  if (!canCreate) return null;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={requestClose}
        PaperProps={{
          sx: {
            width: { xs: 390, sm: 480, md: 520 },
            maxWidth: "100vw",
            display: "flex",
            flexDirection: "column",
            overscrollBehavior: "contain",
          },
        }}
      >
        {/* ── header ── */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1,
            flexShrink: 0,
          }}
        >
          <Typography variant="h6">Добавить приём</Typography>
          <IconButton onClick={requestClose}>
            <CloseOutlined />
          </IconButton>
        </Box>
        <Divider />

        {/* ── scrollable body ── */}
        <Box
          sx={{
            p: 2,
            flex: 1,
            overflowY: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <Stack spacing={2.5}>
            {saveError && (
              <Alert ref={errorRef} severity="error" onClose={() => setSaveError(null)}>
                {saveError}
              </Alert>
            )}

            {/* ── 1. Дата и время ── */}
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
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
                      InputProps: {
                        sx: { fontSize: "1.1rem", fontWeight: 500 },
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
                        borderRadius: "6px !important",
                        py: 0.75,
                        transition: "all 0.2s ease-in-out",
                        bgcolor: "transparent",
                        color: "text.disabled",
                        "&:hover": { bgcolor: "action.selected" },
                        "&.Mui-selected": {
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                          fontWeight: 600,
                          boxShadow: "inset 0 1px 4px rgba(0,0,0,0.15)",
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

            {/* ── 2. Пациент ── */}
            <Stack spacing={0.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                  Пациент *
                </Typography>
                <Button size="small" onClick={() => setAddPatientOpen(true)}>
                  + Добавить пациента
                </Button>
              </Stack>

              <FormControlLabel
                control={
                  <Switch
                    checked={isBooking}
                    onChange={(e) => {
                      setIsBooking(e.target.checked);
                      if (e.target.checked) setSelectedPatient(null);
                    }}
                    color="primary"
                    size="small"
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Бронирование (без пациента)
                  </Typography>
                }
              />

              {!isBooking && (
                <Autocomplete<DjangoPatient>
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
                      <Box
                        sx={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 1,
                        }}
                      >
                        <Stack sx={{ minWidth: 0 }}>
                          <Typography variant="body2" noWrap>
                            {p.fullName || "Нет ФИО"}
                          </Typography>
                          {p.phone && (
                            <Typography variant="caption" color="text.secondary">
                              {p.phone}
                            </Typography>
                          )}
                        </Stack>
                      </Box>
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
              )}

              {!isBooking && patientHasDebt && (
                <Alert severity="error" variant="outlined" sx={{ mt: 1, py: 0.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    У пациента задолженность:{" "}
                    {formatKGS(Math.abs(patientBalanceNum))}
                  </Typography>
                </Alert>
              )}
            </Stack>

            {/* ── 3. Услуги (показывается только если выбран пациент или бронирование) ── */}
            {(selectedPatient || isBooking) && (
              <>
                <Card variant="outlined" sx={{ bgcolor: "background.paper" }}>
                  <CardContent sx={{ p: 2 }}>
                    <Stack spacing={2}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontWeight: 500 }}
                        >
                          Услуги и специалисты
                        </Typography>
                      </Stack>
                      <Divider />

                      {data.loading && (
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <CircularProgress size={14} />
                          <Typography variant="caption" color="text.secondary">
                            Загрузка справочников…
                          </Typography>
                        </Stack>
                      )}

                      {data.error && (
                        <Alert severity="error" sx={{ py: 0 }}>
                          {data.error}
                        </Alert>
                      )}

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
                          <React.Fragment key={index}>
                            {index > 0 && <Divider />}
                            <Stack spacing={1.5}>
                              {index === 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  Врач / Исполнитель
                                </Typography>
                              )}
                              <Autocomplete<DjangoEmployeeWithServices>
                                fullWidth
                                options={
                                  row.serviceId !== null ? availableEmployees : data.employees
                                }
                                loading={data.loading}
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
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder="Исполнитель"
                                    size="small"
                                    fullWidth
                                    error={touched && !row.employeeId}
                                    helperText={
                                      touched && !row.employeeId
                                        ? "Выберите исполнителя"
                                        : ""
                                    }
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
                                  options={
                                    row.employeeId !== null ? availableServices : data.services
                                  }
                                  loading={data.loading}
                                  value={selectedService}
                                  onChange={(_, v) => {
                                    updateRow(index, {
                                      serviceId: v?.id ?? null,
                                      employeeId:
                                        row.employeeId !== null && v
                                          ? data.canEmployeeProvideService(
                                              row.employeeId,
                                              v.id,
                                            )
                                            ? row.employeeId
                                            : null
                                          : row.employeeId,
                                    });
                                  }}
                                  getOptionLabel={(s) => `${s.name} — ${Number(s.basePrice)} с`}
                                  isOptionEqualToValue={(a, b) => a.id === b.id}
                                  renderOption={(props, s) => (
                                    <li {...props} key={s.id}>
                                      <Stack>
                                        <Typography variant="body2">{s.name}</Typography>
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                        >
                                          {Number(s.basePrice)} с
                                          {s.durationMinutes
                                            ? ` · ${s.durationMinutes} мин`
                                            : ""}
                                        </Typography>
                                      </Stack>
                                    </li>
                                  )}
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      placeholder="Услуга"
                                      size="small"
                                      fullWidth
                                      error={touched && !row.serviceId}
                                      helperText={
                                        touched && !row.serviceId ? "Выберите услугу" : ""
                                      }
                                    />
                                  )}
                                />
                                {serviceRows.length > 1 && (
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() =>
                                      setServiceRows((prev) =>
                                        prev.filter((_, i) => i !== index),
                                      )
                                    }
                                    sx={{
                                      mt: 0.5,
                                      border: "1px solid",
                                      borderColor: "error.main",
                                    }}
                                  >
                                    <DeleteOutlined fontSize="small" />
                                  </IconButton>
                                )}
                              </Stack>

                              {selectedService && (
                                <Typography variant="caption" color="text.secondary">
                                  Цена:{" "}
                                  <strong>
                                    {formatKGS(selectedService.basePrice)}
                                  </strong>
                                  {selectedService.durationMinutes
                                    ? ` · ${selectedService.durationMinutes} мин`
                                    : ""}
                                </Typography>
                              )}

                              {incompatible && (
                                <Alert severity="error" sx={{ py: 0, fontSize: "0.75rem" }}>
                                  Этот специалист не оказывает выбранную услугу
                                </Alert>
                              )}
                            </Stack>
                          </React.Fragment>
                        );
                      })}

                      <Button
                        size="small"
                        onClick={() =>
                          setServiceRows((prev) => [
                            ...prev,
                            {
                              serviceId: null,
                              employeeId: prev[prev.length - 1]?.employeeId ?? null,
                              quantity: 1,
                            },
                          ])
                        }
                        disabled={data.loading}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        + Добавить услугу
                      </Button>

                      {touched && validRows.length === 0 && (
                        <Alert severity="error" sx={{ py: 0 }}>
                          Добавьте хотя бы одну услугу с исполнителем
                        </Alert>
                      )}

                      {/* ── Список выбранных услуг (preview) ── */}
                      {validRows.length > 0 && (
                        <>
                          <Divider />
                          <Stack spacing={0.5}>
                            {validRows.map((r, i) => {
                              const svc = data.services.find((s) => s.id === r.serviceId);
                              const emp = data.employees.find((e) => e.id === r.employeeId);
                              if (!svc) return null;
                              return (
                                <Stack key={i} direction="row" justifyContent="space-between">
                                  <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: "65%" }}>
                                    {svc.name}
                                    {emp ? ` / ${emp.fullName}` : ""}
                                  </Typography>
                                  <Typography variant="caption" fontWeight={600}>
                                    {formatKGS(svc.basePrice)}
                                  </Typography>
                                </Stack>
                              );
                            })}
                          </Stack>

                          <Divider />
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                              Общая стоимость
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: "primary.onSurface" }}>
                              {formatKGS(totalCost)}
                            </Typography>
                          </Stack>
                        </>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                {/* ── 3b. Товары (необязательно) ── */}
                <Card variant="outlined" sx={{ bgcolor: "background.paper" }}>
                  <CardContent sx={{ p: 2 }}>
                    <Stack spacing={2}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontWeight: 500 }}
                        >
                          Товары
                        </Typography>
                        {productsLoading && <CircularProgress size={14} />}
                      </Stack>

                      {productRows.length > 0 && <Divider />}

                      {productRows.map((row, index) => {
                        const selectedProduct =
                          products.find((p) => p.id === row.productId) ?? null;
                        const overstocked =
                          selectedProduct !== null && parseQty(row.quantity) > selectedProduct.stock;
                        return (
                          <Stack key={index} spacing={1}>
                            <Stack direction="row" spacing={1} alignItems="flex-start">
                              <Autocomplete<DjangoProduct>
                                sx={{ flex: 1 }}
                                options={products}
                                loading={productsLoading}
                                value={selectedProduct}
                                onChange={(_, v) =>
                                  setProductRows((prev) =>
                                    prev.map((r, i) =>
                                      i === index ? { ...r, productId: v?.id ?? null } : r,
                                    ),
                                  )
                                }
                                getOptionLabel={(p) =>
                                  `${p.name} — ${formatKGS(p.price)}`
                                }
                                isOptionEqualToValue={(a, b) => a.id === b.id}
                                noOptionsText="Нет товаров в наличии"
                                renderOption={(props, p) => (
                                  <li {...props} key={p.id}>
                                    <Stack>
                                      <Typography variant="body2">{p.name}</Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {formatKGS(p.price)} · в наличии: {p.stock} {p.unit}
                                      </Typography>
                                    </Stack>
                                  </li>
                                )}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder="Товар"
                                    size="small"
                                    fullWidth
                                  />
                                )}
                              />
                              <TextField
                                type="number"
                                size="small"
                                label="Кол-во"
                                value={row.quantity}
                                onChange={(e) => {
                                  // Разрешаем пустую строку (можно стереть) и
                                  // только неотрицательные целые. Минус/точку/
                                  // мусор отбрасываем, не давая опуститься ниже 0.
                                  const raw = e.target.value;
                                  const next =
                                    raw === "" ? "" : String(Math.max(0, Math.floor(Number(raw) || 0)));
                                  setProductRows((prev) =>
                                    prev.map((r, i) =>
                                      i === index ? { ...r, quantity: next } : r,
                                    ),
                                  );
                                }}
                                onBlur={() => {
                                  // При уходе из поля пустое/0 → 1 (товар нельзя
                                  // продать в нулевом количестве).
                                  setProductRows((prev) =>
                                    prev.map((r, i) =>
                                      i === index && parseQty(r.quantity) < 1
                                        ? { ...r, quantity: "1" }
                                        : r,
                                    ),
                                  );
                                }}
                                inputProps={{ min: 0, style: { width: 56 } }}
                                error={overstocked}
                              />
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() =>
                                  setProductRows((prev) => prev.filter((_, i) => i !== index))
                                }
                                sx={{
                                  mt: 0.25,
                                  border: "1px solid",
                                  borderColor: "error.main",
                                }}
                              >
                                <DeleteOutlined fontSize="small" />
                              </IconButton>
                            </Stack>
                            {selectedProduct && (
                              <Typography variant="caption" color="text.secondary">
                                Сумма:{" "}
                                <strong>
                                  {formatKGS(selectedProduct.price * parseQty(row.quantity))}
                                </strong>
                                {overstocked
                                  ? ` · недостаточно на складе (в наличии ${selectedProduct.stock})`
                                  : ""}
                              </Typography>
                            )}
                            {overstocked && (
                              <Alert severity="error" sx={{ py: 0, fontSize: "0.75rem" }}>
                                Количество превышает остаток на складе
                              </Alert>
                            )}
                          </Stack>
                        );
                      })}

                      <Button
                        size="small"
                        onClick={() =>
                          setProductRows((prev) => [
                            ...prev,
                            { productId: null, quantity: "1" },
                          ])
                        }
                        disabled={productsLoading || products.length === 0}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        + Добавить товар
                      </Button>

                      {!productsLoading && products.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Нет товаров в наличии для продажи
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                {/* ── 4. Текстовые поля ── */}
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Жалобы при обращении
                  </Typography>
                  <TextField
                    value={complaints}
                    onChange={(e) => setComplaints(e.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                    size="small"
                    placeholder="Необязательно"
                  />
                </Stack>

                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Комментарий администратора{isBooking ? " *" : ""}
                  </Typography>
                  <TextField
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                    size="small"
                    placeholder={
                      isBooking ? "Причина бронирования (обязательно)" : "Необязательно"
                    }
                    error={touched && isBooking && !adminComment.trim()}
                    helperText={
                      touched && isBooking && !adminComment.trim()
                        ? "Обязательное поле для бронирования"
                        : ""
                    }
                  />
                </Stack>
              </>
            )}
          </Stack>
        </Box>

        {/* ── footer ── */}
        <Divider />
        <Box
          sx={{
            p: 2,
            flexShrink: 0,
            bgcolor: "background.paper",
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={requestClose} disabled={saving}>
              Отмена
            </Button>
            <Button
              variant="contained"
              disabled={saving || data.loading}
              onMouseEnter={() => { if (!touched) setTouched(true); }}
              onClick={handleSave}
              startIcon={
                saving ? <CircularProgress size={16} color="inherit" /> : undefined
              }
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </Stack>
        </Box>
      </Drawer>

      {/* Inline add-patient drawer */}
      <DjangoAddPatientDrawer
        open={addPatientOpen}
        onClose={() => setAddPatientOpen(false)}
        onCreated={(p: DjangoPatient) => {
          setSelectedPatient(p);
          setAddPatientOpen(false);
        }}
      />

      {/* Подтверждение закрытия при несохранённых данных */}
      <Dialog open={confirmCloseOpen} onClose={() => setConfirmCloseOpen(false)}>
        <DialogTitle>Закрыть без сохранения?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Введённые данные приёма будут потеряны. Закрыть форму?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCloseOpen(false)}>Продолжить ввод</Button>
          <Button onClick={confirmDiscardAndClose} color="error" variant="contained" autoFocus>
            Закрыть
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DjangoAddAppointmentDrawer;
