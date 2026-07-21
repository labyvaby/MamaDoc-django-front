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
import { createFilterOptions } from "@mui/material/Autocomplete";
import Grid from "@mui/material/Grid";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import ReportProblemIcon from "@mui/icons-material/ReportProblemOutlined";
import dayjs from "dayjs";
import { useNotification } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";

import { AppCard, CustomDateTimePicker } from "../../components/ui";
import { CloseGuardDialog } from "../../components/common/CloseGuardDialog";
import { useCloseGuard } from "../../hooks/useCloseGuard";
import { formatKGS } from "../../utility/format";
import { roundDateTimeLocalToStep } from "../../utility/time";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useDjangoAppointmentData } from "../../hooks/useDjangoAppointmentData";
import {
  updateAppointment,
  parseBackendError,
  parseOverlapConflict,
  type AppointmentOverlapConflict,
  type AppointmentServiceLine,
  type DjangoAppointment,
} from "../../api/appointments";
import OverlapConfirmDialog from "./components/OverlapConfirmDialog";
import { normalizeDjangoStatus } from "../../config/appointmentStatuses";
import { djangoQueryKeys } from "../../api/queryKeys";
import { getProducts, type DjangoProduct } from "../../api/warehouse";
import type { DjangoPatient } from "../../api/patients";
import { searchPatients } from "../../api/patients";
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
  /**
   * По строке уже создано медзаключение (draft/completed): бэк не даёт удалить
   * такую строку и сменить ей исполнителя; услугу менять можно, но только с
   * сохранением id (без пересоздания) и явным unitPrice.
   */
  hasConclusion: boolean;
};

type ProductRow = {
  /** id существующей AppointmentProductLine, null для новых строк */
  lineId: number | null;
  productId: number | null;
  // Строкой, чтобы поле можно было полностью стереть при вводе (как в форме
  // создания); нормализуется к >= 1 на onBlur / при сабмите.
  quantity: string;
  /** Цена за единицу: у существующих строк — из приёма, у новых — из каталога. */
  unitPrice: number;
  /** Подпись существующей строки: товар может пропасть из каталога продажи. */
  name: string;
  unit: string;
};

// Редактирование товаров через PATCH: бэкенд пока молча игнорирует поле
// ``products`` (проверено на живом API 15.07.2026, приём 12127 в тестовом
// филиале) — тикет MamaDoc/backend_ticket_appointments_patch_products.md.
// До реализации секция «Товары» работает только на чтение; после деплоя
// бэка переключить в true — payload уже прокинут.
const EDIT_APPOINTMENT_PRODUCTS_ENABLED = false;

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

// Поиск исполнителя по ФИО и специализации («гинеколог» находит врача).
const employeeFilter = createFilterOptions<DjangoEmployeeWithServices>({
  matchFrom: "any",
  stringify: (e) => `${e.fullName} ${(e.specializations ?? []).join(" ")}`,
});

// Поиск товара по названию, штрихкоду и цене.
const productFilter = createFilterOptions<DjangoProduct>({
  matchFrom: "any",
  stringify: (p) => `${p.name} ${p.barcode} ${p.price}`,
});

// Числовое количество товара из «сырой» строки (пусто/0/мусор → 0).
function parseQty(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Черновик тоже считается созданным заключением — бэк блокирует удаление строки.
function lineHasConclusion(line: AppointmentServiceLine): boolean {
  return (
    line.conclusionId != null ||
    line.conclusionState === "draft" ||
    line.conclusionState === "completed"
  );
}

const EMPTY_SERVICE_ROW: ServiceRow = {
  lineId: null,
  serviceId: null,
  employeeId: null,
  quantity: 1,
  unitPrice: "",
  discountAmount: "",
  hasConclusion: false,
};

// ── component ─────────────────────────────────────────────────────────────────

const DjangoEditAppointmentDrawer: React.FC<DjangoEditAppointmentDrawerProps> = ({
  open,
  onClose,
  appointment,
  onSaved,
}) => {
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const canUpdate = useCan("appointments.update");
  // Право «Редактирование приёмов с медзаключением» — мягкое: разблокирует
  // смену услуги/исполнителя у строки с заключением (правка in-place, заключение
  // сохраняется). Удаление и отмена такой строки остаются недоступны для всех.
  const canEditLocked = useCan("appointments.edit_with_conclusion");
  const {
    activeOrganization,
    activeMembership,
    activeEmployee,
    isNurse,
    isAdmin,
  } = usePermissions();

  // Процедурный кабинет: настоящая медсестра (не админ) не может переназначить
  // исполнителя — поле фиксируется её employee id (как в форме создания).
  const nurseEmployeeId =
    isNurse() && !isAdmin() ? activeEmployee?.id ?? null : null;
  const isWorkplaceNurse = nurseEmployeeId !== null;

  const data = useDjangoAppointmentData(
    open,
    appointment?.branchId ?? null,
    activeOrganization?.id ?? null,
    activeMembership?.id ?? null,
  );

  // ── form ────────────────────────────────────────────────────────────────
  const [scheduledAt, setScheduledAt] = React.useState<string>("");
  const [workMode, setWorkMode] = React.useState<"day" | "night">("day");
  const [isBooking, setIsBooking] = React.useState(false);
  const [selectedPatient, setSelectedPatient] = React.useState<DjangoPatient | null>(null);
  const [patientSearch, setPatientSearch] = React.useState("");
  const [serviceRows, setServiceRows] = React.useState<ServiceRow[]>([
    { ...EMPTY_SERVICE_ROW },
  ]);
  const [productRows, setProductRows] = React.useState<ProductRow[]>([]);
  const [products, setProducts] = React.useState<DjangoProduct[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [complaints, setComplaints] = React.useState("");
  const [doctorComplaints, setDoctorComplaints] = React.useState("");
  const [adminComment, setAdminComment] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [overlapConflict, setOverlapConflict] =
    React.useState<AppointmentOverlapConflict | null>(null);
  const [addPatientOpen, setAddPatientOpen] = React.useState(false);
  // Чтобы ошибка была видна, даже если пользователь прокрутил вниз к «Сохранить».
  const errorRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (saveError) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [saveError]);

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
      setServiceRows([{ ...EMPTY_SERVICE_ROW }]);
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
          hasConclusion: lineHasConclusion(line),
        })),
      );
    } else {
      setServiceRows([{ ...EMPTY_SERVICE_ROW }]);
    }

    setProductRows(
      (appointment.productLines ?? [])
        .filter((line) => line.status !== "canceled")
        .map((line) => ({
          lineId: line.id,
          productId: line.product.id,
          quantity: String(line.quantity),
          unitPrice: Number(line.unitPrice) || Number(line.product.price) || 0,
          name: line.product.name,
          unit: line.product.unit,
        })),
    );
  }, [open, appointment]);

  // Если зашла медсестра — фиксируем её как исполнителя в пустых строках
  // (например, у бронирования без услуг). Заполненные строки не трогаем.
  React.useEffect(() => {
    if (!open || nurseEmployeeId === null) return;
    setServiceRows((prev) =>
      prev.map((row) => ({
        ...row,
        employeeId: row.employeeId ?? nurseEmployeeId,
      })),
    );
  }, [open, appointment, nurseEmployeeId]);

  // ── populate patient from the appointment itself (no full list needed) ──────
  React.useEffect(() => {
    if (!open || !appointment?.patient) return;
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
      photoUrl: null,
      inn: "",
      isBlacklisted: false,
      blacklistReason: "",
      isActive: true,
      createdAt: "",
      updatedAt: "",
    });
  }, [open, appointment]);

  // ── каталог товаров для секции «Товары» ────────────────────────────────────
  // Нужен только когда редактирование товаров включено; на чтение хватает
  // данных из productLines самого приёма.
  React.useEffect(() => {
    if (!open || !EDIT_APPOINTMENT_PRODUCTS_ENABLED) return;
    const ctrl = new AbortController();
    setProductsLoading(true);
    getProducts(ctrl.signal)
      .then((list) => {
        if (ctrl.signal.aborted) return;
        // Только товары на продажу и с остатком.
        setProducts(list.filter((p) => p.isActive && p.isForSale && p.stock > 0));
      })
      .catch(() => {
        /* товары опциональны; ошибку загрузки молча игнорируем */
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setProductsLoading(false);
      });
    return () => ctrl.abort();
  }, [open]);

  // ── patient search (server-side; never loads the whole patient table) ───────
  const [patientOptions, setPatientOptions] = React.useState<DjangoPatient[]>([]);
  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      searchPatients(patientSearch.trim(), 30, ctrl.signal)
        .then((rows) => {
          if (!ctrl.signal.aborted) setPatientOptions(rows);
        })
        .catch(() => {
          /* abort/network — keep previous options */
        });
    }, 300);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [open, patientSearch]);

  // Keep the appointment's patient visible even if not in the search page.
  const filteredPatients = React.useMemo<DjangoPatient[]>(() => {
    if (!selectedPatient) return patientOptions;
    if (patientOptions.some((p) => p.id === selectedPatient.id)) {
      return patientOptions;
    }
    return [selectedPatient, ...patientOptions];
  }, [patientOptions, selectedPatient]);

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
  const productsTotal = React.useMemo(
    () => productRows.reduce((sum, r) => sum + r.unitPrice * parseQty(r.quantity), 0),
    [productRows],
  );
  const grandTotal = servicesTotal + productsTotal;

  // Каталог + товары существующих строк, выпавшие из каталога (кончился
  // остаток / сняты с продажи) — чтобы Autocomplete не терял значение строки.
  const productOptions = React.useMemo<DjangoProduct[]>(() => {
    if (!EDIT_APPOINTMENT_PRODUCTS_ENABLED) return products;
    const missing = productRows
      .filter((r) => r.productId !== null && !products.some((p) => p.id === r.productId))
      .map((r): DjangoProduct => ({
        id: r.productId!,
        organizationId: 0,
        name: r.name,
        category: "",
        barcode: "",
        unit: r.unit,
        price: r.unitPrice,
        isInfusion: false,
        description: "",
        comment: "",
        isForSale: true,
        isActive: true,
        imageUrl: null,
        stock: 0,
        createdAt: "",
        updatedAt: "",
      }));
    return [...missing, ...products];
  }, [products, productRows]);

  // ── submit ───────────────────────────────────────────────────────────────
  const handleSave = () => {
    setTouched(true);
    if (!isValid || !appointment) return;
    void performSave();
  };

  const performSave = async (allowOverlap = false) => {
    if (saving || !appointment) return;
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
        // Пока флаг выключен, products в PATCH не шлём вовсе: бэкенд поле
        // игнорирует, а слать «глухие» данные — маскировать проблему.
        ...(EDIT_APPOINTMENT_PRODUCTS_ENABLED
          ? {
              products: productRows
                .filter((r) => r.productId !== null && parseQty(r.quantity) > 0)
                .map((r) => ({
                  ...(r.lineId != null ? { id: r.lineId } : {}),
                  productId: r.productId!,
                  quantity: parseQty(r.quantity),
                })),
            }
          : {}),
        ...(allowOverlap ? { allowOverlap: true } : {}),
      });
      setOverlapConflict(null);
      notify?.({ type: "success", message: "Приём обновлён" });
      // Панель деталей показывает сумму из кэша платежей (pay?.totalAmount
      // приоритетнее appt.totalAmount) — сбрасываем, иначе до staleTime видна
      // старая сумма после смены услуг.
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.appointments.payments(appointment.id),
      });
      onSaved?.(updated);
      onClose();
    } catch (err: unknown) {
      // Org "warn" mode: show the conflict list and confirm (resend with
      // allowOverlap=true) rather than surfacing a raw error.
      const conflict = parseOverlapConflict(err);
      if (conflict && !allowOverlap) {
        setOverlapConflict(conflict);
      } else {
        setSaveError(parseBackendError(err));
      }
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
                <Alert ref={errorRef} severity="error" onClose={() => setSaveError(null)}>
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
                        borderRadius: "10px",
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
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography variant="body2">{p.fullName}</Typography>
                          {p.isBlacklisted && (
                            <ReportProblemIcon color="error" sx={{ fontSize: 16 }} />
                          )}
                        </Stack>
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
                {!isBooking && selectedPatient?.isBlacklisted && (
                  <Alert severity="error" variant="outlined" sx={{ mt: 1, py: 0.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Клиент находится в чёрном списке
                    </Typography>
                    <Typography variant="body2">
                      Причина: {selectedPatient.blacklistReason || "не указана"}
                    </Typography>
                  </Alert>
                )}
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
                      borderRadius: "999px",
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
                        bgcolor: "common.white",
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
                                // Смену исполнителя у строки с медзаключением бэк
                                // отбивает 400-й «Нельзя сменить или убрать
                                // исполнителя…» (проверено на живом API
                                // 17.07.2026) — блокируем поле сразу.
                                disabled={isWorkplaceNurse || row.hasConclusion}
                                options={row.serviceId !== null ? availableEmployees : data.employees}
                                loading={data.loading}
                                filterOptions={employeeFilter}
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
                                    // Цена строки зафиксирована для старой пары
                                    // услуга/исполнитель, и PATCH с id её не
                                    // пересчитывает — пересоздаём строку, чтобы
                                    // бэк взял актуальную цену новой пары.
                                    ...((v?.id ?? null) !== row.employeeId
                                      ? { lineId: null, unitPrice: "", discountAmount: "" }
                                      : {}),
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
                                  // Смену услуги на строке с медзаключением бэк
                                  // отбивает 400-й, если строку пересоздавать
                                  // (проверено на живом API 16–17.07.2026);
                                  // правкой in-place (id + явный unitPrice) бэк
                                  // принимает. Доступно только по праву
                                  // appointments.edit_with_conclusion — без
                                  // права поле заблокировано сразу.
                                  disabled={row.hasConclusion && !canEditLocked}
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
                                      // Смена услуги: бэк не пересчитывает цену
                                      // существующей строки (PATCH с id хранит
                                      // старый unitPrice — проверено на живом API
                                      // 14.07.2026), поэтому пересоздаём строку:
                                      // без id бэк возьмёт актуальную цену услуги.
                                      // Но строку с медзаключением пересоздавать
                                      // нельзя — удаление каскадом снесёт заключение
                                      // (OneToOne, on_delete=CASCADE). Сохраняем id
                                      // и шлём цену новой услуги явным unitPrice —
                                      // без этого бэк тихо оставляет старую цену
                                      // (id сохранён, но unitPrice не пересчитан);
                                      // смену serviceId у такой строки бэк принимает
                                      // (проверено на живом API 17.07.2026, строка
                                      // 13160).
                                      ...((v?.id ?? null) !== row.serviceId
                                        ? row.hasConclusion
                                          ? { unitPrice: v ? String(v.basePrice) : "", discountAmount: "" }
                                          : { lineId: null, unitPrice: "", discountAmount: "" }
                                        : {}),
                                    })
                                  }
                                  getOptionLabel={(s) => `${s.name} — ${Number(s.basePrice)} с`}
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
                                  <Tooltip
                                    title={
                                      row.hasConclusion
                                        ? "Нельзя удалить: по услуге уже создано медзаключение"
                                        : "Удалить услугу"
                                    }
                                  >
                                    <span>
                                      <IconButton
                                        size="small"
                                        color="error"
                                        disabled={row.hasConclusion}
                                        onClick={() =>
                                          setServiceRows((prev) => prev.filter((_, i) => i !== index))
                                        }
                                        sx={{
                                          mt: 0.5,
                                          border: "1px solid",
                                          borderColor: row.hasConclusion ? "divider" : "error.main",
                                          "&:hover": { backgroundColor: "error.lighter" },
                                        }}
                                      >
                                        <DeleteOutlined fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                )}
                              </Stack>
                              {row.hasConclusion && (
                                <Typography variant="caption" color="text.secondary">
                                  {canEditLocked
                                    ? "По услуге есть медзаключение: можно изменить услугу (заключение сохранится), сменить исполнителя или удалить строку нельзя"
                                    : "По услуге создано медзаключение — изменить услугу, сменить исполнителя или удалить строку нельзя"}
                                </Typography>
                              )}
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
                                ...EMPTY_SERVICE_ROW,
                                employeeId:
                                  nurseEmployeeId ??
                                  prev[prev.length - 1]?.employeeId ??
                                  null,
                              },
                            ])
                          }
                          sx={{ alignSelf: "flex-start" }}
                        >
                          + Добавить услугу
                        </Button>

                        <Divider />

                        {/* ── Товары ── */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                            Товары
                          </Typography>
                          {productsLoading && <CircularProgress size={14} />}
                        </Stack>

                        {!EDIT_APPOINTMENT_PRODUCTS_ENABLED && (
                          <>
                            {productRows.map((row) => (
                              <Stack
                                key={row.lineId}
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                                spacing={1}
                              >
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" noWrap>
                                    {row.name}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {parseQty(row.quantity)} {row.unit} × {formatKGS(row.unitPrice)}
                                  </Typography>
                                </Box>
                                <Typography variant="body2" fontWeight={600}>
                                  {formatKGS(row.unitPrice * parseQty(row.quantity))}
                                </Typography>
                              </Stack>
                            ))}
                            <Typography variant="caption" color="text.secondary">
                              {productRows.length > 0
                                ? "Изменить товары созданного приёма пока нельзя. Дополнительные расходники оформляются отдельной продажей в разделе «Продажи»."
                                : "Товары добавляются при создании приёма. К созданному приёму расходники (шприц, зонд и т.п.) оформляются отдельной продажей в разделе «Продажи»."}
                            </Typography>
                          </>
                        )}

                        {EDIT_APPOINTMENT_PRODUCTS_ENABLED && (
                          <>
                            {productRows.map((row, index) => {
                              const selectedProduct =
                                productOptions.find((p) => p.id === row.productId) ?? null;
                              // Для существующих строк товар уже списан со
                              // склада — остаток проверяем только у новых.
                              const overstocked =
                                row.lineId === null &&
                                selectedProduct !== null &&
                                parseQty(row.quantity) > selectedProduct.stock;
                              return (
                                <Stack key={index} spacing={1}>
                                  <Stack direction="row" spacing={1} alignItems="flex-start">
                                    <Autocomplete<DjangoProduct>
                                      sx={{ flex: 1 }}
                                      options={productOptions}
                                      loading={productsLoading}
                                      filterOptions={productFilter}
                                      value={selectedProduct}
                                      onChange={(_, v) => {
                                        setTouched(true);
                                        setProductRows((prev) =>
                                          prev.map((r, i) =>
                                            i === index
                                              ? {
                                                  ...r,
                                                  productId: v?.id ?? null,
                                                  // Смена товара = пересоздание строки:
                                                  // как и у услуг, PATCH с id не
                                                  // пересчитал бы цену.
                                                  ...((v?.id ?? null) !== r.productId
                                                    ? {
                                                        lineId: null,
                                                        unitPrice: v?.price ?? 0,
                                                        name: v?.name ?? "",
                                                        unit: v?.unit ?? "",
                                                      }
                                                    : {}),
                                                }
                                              : r,
                                          ),
                                        );
                                      }}
                                      getOptionLabel={(p) => `${p.name} — ${formatKGS(p.price)}`}
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
                                        // только неотрицательные целые.
                                        const raw = e.target.value;
                                        const next =
                                          raw === ""
                                            ? ""
                                            : String(Math.max(0, Math.floor(Number(raw) || 0)));
                                        setTouched(true);
                                        setProductRows((prev) =>
                                          prev.map((r, i) =>
                                            i === index ? { ...r, quantity: next } : r,
                                          ),
                                        );
                                      }}
                                      onBlur={() => {
                                        // При уходе из поля пустое/0 → 1.
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
                                      onClick={() => {
                                        setTouched(true);
                                        setProductRows((prev) =>
                                          prev.filter((_, i) => i !== index),
                                        );
                                      }}
                                      sx={{ mt: 0.25, border: "1px solid", borderColor: "error.main" }}
                                    >
                                      <DeleteOutlined fontSize="small" />
                                    </IconButton>
                                  </Stack>
                                  {selectedProduct && (
                                    <Typography variant="caption" color="text.secondary">
                                      Сумма:{" "}
                                      <strong>
                                        {formatKGS(row.unitPrice * parseQty(row.quantity))}
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
                              onClick={() => {
                                setTouched(true);
                                setProductRows((prev) => [
                                  ...prev,
                                  { lineId: null, productId: null, quantity: "1", unitPrice: 0, name: "", unit: "" },
                                ]);
                              }}
                              disabled={productsLoading || products.length === 0}
                              sx={{ alignSelf: "flex-start" }}
                            >
                              + Добавить товар
                            </Button>
                          </>
                        )}

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

      {/* Пересечение с приёмом сотрудника (режим организации "warn") */}
      <OverlapConfirmDialog
        conflict={overlapConflict}
        saving={saving}
        onCancel={() => setOverlapConflict(null)}
        onConfirm={() => void performSave(true)}
      />
    </>
  );
};

export default DjangoEditAppointmentDrawer;
