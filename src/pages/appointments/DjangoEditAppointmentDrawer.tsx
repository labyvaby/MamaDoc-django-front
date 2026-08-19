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
import { useTheme } from "@mui/material/styles";
import { createFilterOptions } from "@mui/material/Autocomplete";
import Grid from "@mui/material/Grid";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import ReportProblemIcon from "@mui/icons-material/ReportProblemOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import dayjs from "dayjs";
import { useNotification } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";

import { AppCard, CustomDateTimePicker } from "../../components/ui";
import { formatKGS } from "../../utility/format";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../../utility/formDraft";
import { roundDateTimeLocalToStep } from "../../utility/time";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { orgWide } from "../../api/scope";
import { parseRelatedQuantity } from "../../api/catalog";
import { useDjangoAppointmentData } from "../../hooks/useDjangoAppointmentData";
import { useFormValidation } from "../../hooks/useFormValidation";
import {
  APPOINTMENT_CONSUMPTIONS_ENABLED,
  updateAppointment,
  parseBackendError,
  parseInsufficientStock,
  parseOverlapConflict,
  type AppointmentOverlapConflict,
  type AppointmentServiceLine,
  type AppointmentStockShortage,
  type DjangoAppointment,
} from "../../api/appointments";
import OverlapConfirmDialog from "./components/OverlapConfirmDialog";
import ServicePriceField from "../../components/appointments/ServicePriceField";
import ServiceConsumptionsPreview, {
  previewBillableTotal,
} from "./components/ServiceConsumptionsPreview";
import { getStatusLabel } from "../../config/appointmentStatuses";
import { useT } from "../../i18n/VerticalProvider";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  getProducts,
  productAvailableStock,
  type DjangoProduct,
} from "../../api/warehouse";
import type { DjangoPatient } from "../../api/patients";
import { getPatient, searchPatients } from "../../api/patients";
import DjangoEditPatientDrawer from "../../components/patients/DjangoEditPatientDrawer";
import type {
  DjangoEmployeeWithServices,
  DjangoCatalogServiceWithEmployees,
} from "../../hooks/useDjangoAppointmentData";
import DjangoAddPatientDrawer from "../../components/patients/DjangoAddPatientDrawer";
import ServiceGroupShell, {
  ServiceBranch,
} from "../../components/appointments/ServiceGroupShell";
import { groupServiceRowsByEmployee } from "../../components/appointments/serviceRowGroups";
import { buildEmployeeAccentMap } from "../../components/appointments/employeeAccent";
import { attentionFieldSx } from "../../theme/uiHelpers";
import ConsumptionRowsEditor from "../../components/appointments/ConsumptionRowsEditor";
import {
  billableRowsTotal,
  hasInvalidConsumptionQuantity,
  toConsumptionRow,
  type ConsumptionRow,
} from "../../components/appointments/consumptionRows";
import { formatConsumptionWarnings } from "../../components/appointments/consumptionWarnings";
import { useStockElsewhere } from "../../hooks/useStockElsewhere";
import {
  branchStockCaption,
  branchStockWarning,
} from "../../components/appointments/branchStockHint";
import {
  stockShortageMessage,
  stockShortageRowText,
} from "../../components/appointments/stockShortage";

// ── types ─────────────────────────────────────────────────────────────────────

export type DjangoEditAppointmentDrawerProps = {
  open: boolean;
  onClose: () => void;
  appointment: DjangoAppointment | null;
  onSaved?: (updated: DjangoAppointment) => void;
};

type ServiceRow = {
  /**
   * Ключ строки для React. Индекс массива не годится: услуга добавляется в
   * середину списка (следующей услугой того же специалиста), и по индексу
   * React переиспользовал бы поля соседней строки.
   */
  uid: string;
  /**
   * Блок, в котором живёт строка. Пока исполнитель выбран, блок опознаётся по
   * нему; когда исполнителя сняли — по этому полю, иначе услуги блока
   * рассыпались бы на отдельные блоки с пустым исполнителем.
   */
  groupId: string;
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
  /** Расходники строки — снапшот из приёма плюс правки пользователя. */
  consumptions: ConsumptionRow[];
  /**
   * Пользователь правил расходники этой строки. Только тогда `consumptions`
   * уходит в PATCH: отсутствие ключа значит «не трогаем», а присутствие —
   * полную синхронизацию, поэтому форма, которая всегда шлёт `services`
   * целиком, иначе стирала бы состав.
   */
  consumptionsDirty: boolean;
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

// Редактирование товаров через PATCH: бэкенд реализовал поле ``products``,
// проверено на живом API 22.07.2026 (products применяются, остаток списывается) —
// тикет MamaDoc/backend_ticket_appointments_patch_products.md.
// Секция «Товары» редактируемая, products уходят в PATCH.
const EDIT_APPOINTMENT_PRODUCTS_ENABLED = true;

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

/** Цена единицы строки: своя (сохранённая/правленая) либо цена каталога. */
function rowUnitPrice(
  row: Pick<ServiceRow, "serviceId" | "unitPrice">,
  services: DjangoCatalogServiceWithEmployees[],
): number {
  if (row.unitPrice.trim()) return Number(row.unitPrice) || 0;
  const svc = services.find((s) => s.id === row.serviceId);
  return svc ? Number(svc.basePrice) : 0;
}

/** Сумма строки: цена × количество − скидка (не уходит ниже нуля). */
function rowAmount(
  row: Pick<ServiceRow, "serviceId" | "unitPrice" | "discountAmount" | "quantity">,
  services: DjangoCatalogServiceWithEmployees[],
): number {
  const gross = rowUnitPrice(row, services) * (row.quantity > 0 ? row.quantity : 1);
  const discount = Number(row.discountAmount) || 0;
  return Math.max(0, gross - discount);
}

let serviceRowSeq = 0;

function newServiceRow(patch: Partial<ServiceRow> = {}): ServiceRow {
  serviceRowSeq += 1;
  const uid = `row-${serviceRowSeq}`;
  return {
    uid,
    groupId: uid,
    lineId: null,
    serviceId: null,
    employeeId: null,
    quantity: 1,
    unitPrice: "",
    discountAmount: "",
    hasConclusion: false,
    consumptions: [],
    consumptionsDirty: false,
    ...patch,
  };
}

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Заменяет прежний useCloseGuard (confirm-диалог «закрыть без сохранения?»):
// вместо блокирующего диалога правки тихо сохраняются в localStorage и
// подхватываются при повторном открытии того же приёма. Ключ включает id
// приёма — форма только для редактирования существующей записи, черновик
// одного приёма не должен всплывать в форме другого.

const APPOINTMENT_EDIT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type AppointmentEditDraft = {
  savedAt: number;
  scheduledAt: string;
  workMode: "day" | "night";
  isBooking: boolean;
  selectedPatient: DjangoPatient | null;
  serviceRows: ServiceRow[];
  productRows: ProductRow[];
  complaints: string;
  doctorComplaints: string;
  adminComment: string;
};

function appointmentEditDraftKey(appointmentId: number): string {
  return `mamadoc:appointments:edit-draft:${appointmentId}`;
}

// Заглушка пациента из данных самого приёма (полный список не запрашивается) —
// используется и для заполнения формы, и для baseline-снэпшота черновика.
function patientStubFromAppointment(appointment: DjangoAppointment): DjangoPatient | null {
  if (!appointment.patient) return null;
  return {
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
  };
}

// ── component ─────────────────────────────────────────────────────────────────

const DjangoEditAppointmentDrawer: React.FC<DjangoEditAppointmentDrawerProps> = ({
  open,
  onClose,
  appointment,
  onSaved,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const canUpdate = useCan("appointments.update");
  // Право «Редактирование приёмов с медзаключением» — мягкое: разблокирует
  // смену услуги/исполнителя у строки с заключением (правка in-place, заключение
  // сохраняется). Удаление и отмена такой строки остаются недоступны для всех.
  const canEditLocked = useCan("appointments.edit_with_conclusion");
  const canUpdatePatient = useCan("patients.update");

  /**
   * Правка карты из формы приёма. Здесь пациент в форме — заглушка из самого
   * приёма (id/ФИО/телефон), поэтому перед открытием формы карту ОБЯЗАТЕЛЬНО
   * догружаем: PATCH пациента отправляет дату рождения, пол и адрес явно, и
   * заглушка молча обнулила бы их.
   */
  const [editPatient, setEditPatient] = React.useState<DjangoPatient | null>(null);
  const [editPatientOpen, setEditPatientOpen] = React.useState(false);
  const [editPatientLoading, setEditPatientLoading] = React.useState(false);
  const openEditPatient = React.useCallback(
    async (id: number) => {
      setEditPatientLoading(true);
      try {
        const fresh = await getPatient(id);
        setEditPatient(fresh);
        setEditPatientOpen(true);
      } catch {
        notify?.({ type: "error", message: t("addDrawer.editPatientFailed") });
      } finally {
        setEditPatientLoading(false);
      }
    },
    [notify, t],
  );
  const {
    activeOrganization,
    activeMembership,
    activeEmployee,
    isNurse,
  } = usePermissions();
  const orgId = useApiOrgId();

  // Процедурный кабинет: медсестра без права управления приёмами не может
  // переназначить исполнителя — поле фиксируется её employee id.
  const nurseEmployeeId =
    isNurse() && !canUpdate ? activeEmployee?.id ?? null : null;
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
    newServiceRow(),
  ]);
  const [productRows, setProductRows] = React.useState<ProductRow[]>([]);
  const [products, setProducts] = React.useState<DjangoProduct[]>([]);
  /** Каталог для расходников — без фильтров продажи и остатка. */
  const [consumableProducts, setConsumableProducts] = React.useState<DjangoProduct[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [complaints, setComplaints] = React.useState("");
  const [doctorComplaints, setDoctorComplaints] = React.useState("");
  const [adminComment, setAdminComment] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [overlapConflict, setOverlapConflict] =
    React.useState<AppointmentOverlapConflict | null>(null);
  /** Какому товару не хватило остатка на складе филиала (машинный код бэка). */
  const [shortage, setShortage] = React.useState<AppointmentStockShortage | null>(null);
  // Любая правка состава снимает пометку: она относилась к отправленным строкам.
  React.useEffect(() => {
    setShortage(null);
  }, [productRows, serviceRows]);
  const [addPatientOpen, setAddPatientOpen] = React.useState(false);
  const [draftRestored, setDraftRestored] = React.useState(false);
  // Чтобы ошибка была видна, даже если пользователь прокрутил вниз к «Сохранить».
  const errorRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (saveError) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [saveError]);

  // Baseline-снэпшот формы (исходные данные приёма) — используется решением
  // «писать ли черновик» (через isDirty ниже) и откатом «Очистить» к исходным
  // значениям, а не к пустой форме.
  const baselineRef = React.useRef<Omit<AppointmentEditDraft, "savedAt"> | null>(null);

  // ── isDirty — отличаются ли текущие значения формы от исходных данных приёма.
  // Тот же компаратор раньше решал, показывать ли CloseGuard-диалог; теперь он
  // решает, писать ли черновик в localStorage (см. flushDraftRef ниже).
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

  // ── populate form from appointment ──────────────────────────────────────
  React.useEffect(() => {
    if (!open || !appointment) {
      setScheduledAt("");
      setWorkMode("day");

      setIsBooking(false);
      setSelectedPatient(null);
      setPatientSearch("");
      setServiceRows([newServiceRow()]);
      setProductRows([]);
      setComplaints("");
      setDoctorComplaints("");
      setAdminComment("");
      setTouched(false);
      form.reset();
      setSaving(false);
      setSaveError(null);
      baselineRef.current = null;
      setDraftRestored(false);
      return;
    }

    const base = appointment.scheduledAt ?? nowRounded();
    setScheduledAt(base);
    setWorkMode(appointment.isNight ? "night" : inferWorkMode(base));

    setIsBooking(!appointment.patient);
    setComplaints(appointment.complaints ?? "");
    setDoctorComplaints(appointment.doctorComplaints ?? "");
    setAdminComment(appointment.adminComment ?? "");

    const initialServiceRows =
      appointment.services.length > 0
        ? appointment.services.map((line) =>
            newServiceRow({
              lineId: line.id ?? null,
              serviceId: line.service?.id ?? null,
              employeeId: line.employee?.id ?? null,
              quantity: line.quantity ?? 1,
              unitPrice: line.unitPrice ?? "",
              discountAmount: line.discountAmount ?? "",
              hasConclusion: lineHasConclusion(line),
              consumptions: (line.consumptions ?? []).map(toConsumptionRow),
            }),
          )
        : [newServiceRow()];
    setServiceRows(initialServiceRows);

    const initialProductRows = (appointment.productLines ?? [])
      .filter((line) => line.status !== "canceled")
      .map((line) => ({
        lineId: line.id,
        productId: line.product.id,
        quantity: String(line.quantity),
        unitPrice: Number(line.unitPrice) || Number(line.product.price) || 0,
        name: line.product.name,
        unit: line.product.unit,
      }));
    setProductRows(initialProductRows);

    // Baseline — исходные данные приёма, до наложения черновика.
    baselineRef.current = {
      scheduledAt: base,
      workMode: appointment.isNight ? "night" : inferWorkMode(base),
      isBooking: !appointment.patient,
      selectedPatient: patientStubFromAppointment(appointment),
      serviceRows: initialServiceRows,
      productRows: initialProductRows,
      complaints: appointment.complaints ?? "",
      doctorComplaints: appointment.doctorComplaints ?? "",
      adminComment: appointment.adminComment ?? "",
    };
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
    setSelectedPatient(patientStubFromAppointment(appointment));
  }, [open, appointment]);

  // ── восстановление черновика ─────────────────────────────────────────────
  // Идёт последним эффектом популяции формы (после baseline-эффекта выше,
  // эффекта-фиксации медсестры и эффекта, заполняющего пациента приёма) —
  // если черновик есть, он должен перекрыть значения, которые эти эффекты
  // только что выставили из baseline.
  React.useEffect(() => {
    if (!open || !appointment) return;
    const draft = readFormDraft<AppointmentEditDraft>(
      appointmentEditDraftKey(appointment.id),
      APPOINTMENT_EDIT_DRAFT_TTL_MS,
    );
    if (!draft) {
      setDraftRestored(false);
      return;
    }
    setScheduledAt(draft.scheduledAt);
    setWorkMode(draft.workMode);
    setIsBooking(draft.isBooking);
    setSelectedPatient(draft.selectedPatient);
    setServiceRows(draft.serviceRows);
    setProductRows(draft.productRows);
    setComplaints(draft.complaints);
    setDoctorComplaints(draft.doctorComplaints);
    setAdminComment(draft.adminComment);
    setDraftRestored(true);
  }, [open, appointment]);

  // ── сохранение черновика в localStorage (защита от случайного закрытия) ────
  // flushDraftRef всегда указывает на актуальный снэпшот полей — нужен, чтобы
  // при закрытии до истечения debounce (быстрый ввод + сразу закрыть) успеть
  // синхронно записать черновик, а не потерять его вместе с отменённым таймером.
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    if (!appointment) return;
    const key = appointmentEditDraftKey(appointment.id);
    if (!isDirty) {
      clearFormDraft(key);
      return;
    }
    writeFormDraft(key, {
      scheduledAt,
      workMode,
      isBooking,
      selectedPatient,
      serviceRows,
      productRows,
      complaints,
      doctorComplaints,
      adminComment,
    });
  };

  React.useEffect(() => {
    if (!open || !appointment) return;
    const id = setTimeout(() => flushDraftRef.current(), 400);
    return () => clearTimeout(id);
  }, [
    open, appointment, scheduledAt, workMode, isBooking, selectedPatient,
    serviceRows, productRows, complaints, doctorComplaints, adminComment,
  ]);

  const handleClose = () => {
    flushDraftRef.current();
    onClose();
  };

  const handleDiscardDraft = () => {
    if (!appointment) return;
    clearFormDraft(appointmentEditDraftKey(appointment.id));
    const b = baselineRef.current;
    if (b) {
      setScheduledAt(b.scheduledAt);
      setWorkMode(b.workMode);
      setIsBooking(b.isBooking);
      setSelectedPatient(b.selectedPatient);
      setServiceRows(b.serviceRows);
      setProductRows(b.productRows);
      setComplaints(b.complaints);
      setDoctorComplaints(b.doctorComplaints);
      setAdminComment(b.adminComment);
    }
    setDraftRestored(false);
  };

  // ── каталог товаров для секции «Товары» ────────────────────────────────────
  // Нужен только когда редактирование товаров включено; на чтение хватает
  // данных из productLines самого приёма.
  React.useEffect(() => {
    if (!open) return;
    if (!EDIT_APPOINTMENT_PRODUCTS_ENABLED && !APPOINTMENT_CONSUMPTIONS_ENABLED) return;
    const ctrl = new AbortController();
    setProductsLoading(true);
    // branchId — филиал самого приёма (не сессионный): именно с его склада бэк
    // спишет товар и по его остатку (`branchStock`) проверит сохранение.
    getProducts(ctrl.signal, {
      organizationId: orgId,
      branchId: appointment?.branchId ?? undefined,
    })
      .then((list) => {
        if (ctrl.signal.aborted) return;
        // Только товары на продажу и с остатком на складе филиала приёма.
        setProducts(
          list.filter((p) => p.isActive && p.isForSale && productAvailableStock(p) > 0),
        );
        // Расходники — не продажа: ни «на продажу», ни «остаток > 0» к ним не
        // применимы (гель не продаётся, а минусовой остаток бэк разрешает).
        setConsumableProducts(list.filter((p) => p.isActive));
      })
      .catch(() => {
        /* товары опциональны; ошибку загрузки молча игнорируем */
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setProductsLoading(false);
      });
    return () => ctrl.abort();
  }, [open, orgId, appointment?.branchId]);

  // «Есть на складе X» для товара, которого нет на складе филиала приёма: сам
  // остаток филиала приходит в product.branchStock (см. useStockElsewhere).
  const stockElsewhere = useStockElsewhere(
    open && EDIT_APPOINTMENT_PRODUCTS_ENABLED,
    orgId,
  );

  // ── patient search (server-side; never loads the whole patient table) ───────
  const [patientOptions, setPatientOptions] = React.useState<DjangoPatient[]>([]);
  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      // Только орг-скоуп: филиалом не сужаем (пациент может быть из соседнего).
      searchPatients(orgWide(orgId), patientSearch.trim(), 30, ctrl.signal)
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
  }, [open, patientSearch, orgId]);

  // Keep the appointment's patient visible even if not in the search page.
  const filteredPatients = React.useMemo<DjangoPatient[]>(() => {
    if (!selectedPatient) return patientOptions;
    if (patientOptions.some((p) => p.id === selectedPatient.id)) {
      return patientOptions;
    }
    return [selectedPatient, ...patientOptions];
  }, [patientOptions, selectedPatient]);

  // Цвет специалиста — общий для всех его строк: по форме видно, какие услуги
  // относятся к одному исполнителю.
  const employeeAccents = React.useMemo(
    () =>
      buildEmployeeAccentMap(
        serviceRows.map((r) => r.employeeId),
        theme.palette.mode,
      ),
    [serviceRows, theme.palette.mode],
  );

  // Услуги одного специалиста показываем одним блоком: он выбирается однажды,
  // услуги висят ветками на его оси.
  const serviceGroups = React.useMemo(
    () => groupServiceRowsByEmployee(serviceRows),
    [serviceRows],
  );

  // ── validation ───────────────────────────────────────────────────────────
  const validRows = serviceRows.filter(
    (r) => r.serviceId !== null && r.employeeId !== null,
  );
  const incompatibleRows = validRows.filter(
    (r) => !data.canEmployeeProvideService(r.employeeId, r.serviceId),
  );
  // Порядок ключей = порядок полей в форме: в первое незаполненное уйдёт фокус.
  const form = useFormValidation({
    scheduledAt: scheduledAt ? null : t("addDrawer.errors.dateTimeRequired"),
    patient: isBooking || selectedPatient ? null : t("addDrawer.errors.patientRequired"),
    services:
      validRows.length === 0
        ? t("addDrawer.errors.serviceRequired")
        : incompatibleRows.length > 0
          ? t("addDrawer.errors.performerMismatch")
          : null,
    // Комментарий к брони необязателен и при создании — иначе бронь без
    // комментария нельзя было бы сохранить при первой же правке.
  });

  // ── total ────────────────────────────────────────────────────────────────
  // У сохранённой строки своя цена и скидка (старая цена услуги, ручная
  // правка) — считаем по ним, иначе форма показала бы цену каталога, а приём
  // стоит другое. Цена каталога нужна только новым строкам, у которых
  // unitPrice ещё пустой.
  const servicesTotal = React.useMemo(
    () => validRows.reduce((sum, r) => sum + rowAmount(r, data.services), 0),
    [validRows, data.services],
  );
  const productsTotal = React.useMemo(
    () => productRows.reduce((sum, r) => sum + r.unitPrice * parseQty(r.quantity), 0),
    [productRows],
  );
  // Платные расходники (billable) бэк включает в сумму приёма. У сохранённой
  // строки считаем по её снапшоту расходов, у новой — по составу справочника
  // (строк расхода ещё нет, их соберёт бэк).
  const consumptionsTotal = React.useMemo(
    () =>
      validRows.reduce((sum, r) => {
        if (r.lineId != null) return sum + billableRowsTotal(r.consumptions);
        const svc = data.services.find((s) => s.id === r.serviceId);
        return svc ? sum + previewBillableTotal(svc.relatedProducts, r.quantity) : sum;
      }, 0),
    [validRows, data.services],
  );
  const grandTotal = servicesTotal + productsTotal + consumptionsTotal;
  // Суммарная длительность услуг — по ней видно, на сколько занят слот.
  const totalDuration = React.useMemo(
    () =>
      validRows.reduce((sum, r) => {
        const svc = data.services.find((s) => s.id === r.serviceId);
        return sum + (svc?.durationMinutes ?? 0) * (r.quantity > 0 ? r.quantity : 1);
      }, 0),
    [validRows, data.services],
  );

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
        isVaccine: false,
        description: "",
        comment: "",
        isForSale: true,
        isActive: true,
        imageUrl: null,
        stock: 0,
        // Товар выпал из каталога — остаток филиала неизвестен, а не «ноль»:
        // строка уже списана, предупреждать о нехватке нечего.
        branchStock: null,
        createdAt: "",
        updatedAt: "",
      }));
    return [...missing, ...products];
  }, [products, productRows]);

  // ── submit ───────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!appointment) return;
    // Показывает ошибки и уводит фокус в первое незаполненное поле.
    if (!form.validate()) return;
    // Количество расходника бэк отбивает 400-м и откатывает весь PATCH —
    // ловим до запроса (поле лежит внутри свёрнутого блока, фокус туда не ведём).
    if (serviceRows.some((r) => hasInvalidConsumptionQuantity(r.consumptions))) {
      notify?.({ type: "error", message: t("consumptions.quantityError") });
      return;
    }
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
          // Расходники шлём только когда их правили руками и строка услуги
          // существует: у пересозданной строки (lineId сброшен) id расходов
          // принадлежат старой строке — бэк ответил бы 400, а состав он и так
          // соберёт из справочника новой услуги.
          ...(APPOINTMENT_CONSUMPTIONS_ENABLED && r.consumptionsDirty && r.lineId != null
            ? {
                consumptions: r.consumptions.map((c) => ({
                  ...(c.lineId != null ? { id: c.lineId } : {}),
                  productId: c.productId,
                  quantity: String(parseRelatedQuantity(c.quantity) ?? 1),
                  autoWriteOff: c.autoWriteOff,
                  // Цену не шлём — её снапшотит бэк из прайса товара.
                  billable: c.billable,
                })),
              }
            : {}),
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
      notify?.({ type: "success", message: t("editDrawer.updated") });
      // Списание расходников могло увести остаток в минус — сообщаем отдельным
      // тостом, но сохранение это не отменяет (нехватка не блокирует).
      const warning = formatConsumptionWarnings(updated.consumptionWarnings);
      if (warning) notify?.({ type: "error", message: warning });
      // Панель деталей показывает сумму из кэша платежей (pay?.totalAmount
      // приоритетнее appt.totalAmount) — сбрасываем, иначе до staleTime видна
      // старая сумма после смены услуг.
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.appointments.payments(appointment.id),
      });
      // Слоты заключений держат serviceLineId, а смена услуги или исполнителя
      // пересоздаёт строку с новым id (строка уходит в PATCH без id). Без
      // сброса кэша колонка заключения продолжила бы работать со старым id и
      // получила бы 404 «Service line not found» на первом же сохранении.
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.appointments.conclusionSlots(appointment.id),
      });
      clearFormDraft(appointmentEditDraftKey(appointment.id));
      onSaved?.(updated);
      onClose();
    } catch (err: unknown) {
      // Org "warn" mode: show the conflict list and confirm (resend with
      // allowOverlap=true) rather than surfacing a raw error.
      const conflict = parseOverlapConflict(err);
      if (conflict && !allowOverlap) {
        setOverlapConflict(conflict);
        return;
      }
      // Нехватка остатка приходит машинным кодом — показываем склад и цифры,
      // а строку товара помечаем (см. parseInsufficientStock).
      const stockShortage = parseInsufficientStock(err);
      if (stockShortage) {
        setShortage(stockShortage);
        setSaveError(
          stockShortageMessage(
            stockShortage,
            [...products, ...consumableProducts].find(
              (p) => p.id === stockShortage.productId,
            )?.name ?? null,
          ),
        );
        return;
      }
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

  // Специалист выбирается один раз на блок, поэтому смена применяется ко всем
  // его услугам сразу. Строки с медзаключением бэк не отдаёт менять
  // (400-й «Нельзя сменить или убрать исполнителя…») — они остаются на прежнем
  // специалисте и выделяются в свой блок.
  const applyEmployeeToRows = (
    indexes: number[],
    employee: DjangoEmployeeWithServices | null,
  ) => {
    const targets = new Set(indexes);
    setServiceRows((prev) => {
      // Общий groupId на все строки блока: если исполнителя снимут, услуги
      // останутся одним блоком, а не превратятся в несколько пустых.
      const groupId = prev.find((_, i) => targets.has(i))?.groupId;
      return prev.map((row, i) => {
        if (!targets.has(i) || row.hasConclusion) return row;
        const employeeId = employee?.id ?? null;
        if (employeeId === row.employeeId) return row;
        // Удаление врача крестиком — это сброс пары «врач + услуга». При
        // очистке самой услуги врач, наоборот, остаётся выбранным.
        const keepService =
          employee !== null &&
          (row.serviceId === null ||
            data.canEmployeeProvideService(employee.id, row.serviceId));
        return {
          ...row,
          groupId: groupId ?? row.groupId,
          employeeId,
          serviceId: keepService ? row.serviceId : null,
          // Цена строки зафиксирована для старой пары услуга/исполнитель, и
          // PATCH с id её не пересчитывает — пересоздаём строку, чтобы бэк взял
          // актуальную цену новой пары.
          lineId: null,
          unitPrice: "",
          discountAmount: "",
        };
      });
    });
  };

  // Ещё одна услуга того же блока — сразу после его последней услуги, чтобы
  // блок не перескакивал в конец списка.
  const addRowAfter = (index: number, employeeId: number | null, groupId: string) => {
    setServiceRows((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, newServiceRow({ employeeId, groupId }));
      return next;
    });
  };

  if (!canUpdate) return null;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={saving ? undefined : handleClose}
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
              <Typography variant="h6">{t("editDrawer.title")}</Typography>
              {appointment && (
                <Chip
                  label={getStatusLabel(appointment.status)}
                  size="small"
                  variant="outlined"
                />
              )}
            </Stack>
            <Stack direction="row" alignItems="center" gap={0.5}>
              {draftRestored && (
                <Tooltip title={`${t("editDrawer.draftRestored")} — ${t("editDrawer.draftDiscard").toLowerCase()}?`}>
                  <IconButton onClick={handleDiscardDraft} aria-label={t("editDrawer.draftDiscard")} size="small">
                    <RestoreOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <IconButton onClick={saving ? undefined : handleClose} size="small">
                <CloseOutlined />
              </IconButton>
            </Stack>
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
                    {t("addDrawer.loadingDicts")}
                  </Typography>
                </Stack>
              )}

              {/* ── дата и время ── */}
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                {t("addDrawer.dateTimeSection")}
              </Typography>
              <Grid container spacing={1.5} alignItems="stretch">
                <Grid item xs={12} sm={7.5}>
                  <CustomDateTimePicker
                    label={t("addDrawer.dateTimeLabel")}
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
                        error: Boolean(form.errorOf("scheduledAt")),
                        helperText: form.errorOf("scheduledAt") ?? "",
                        ref: form.anchor("scheduledAt"),
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
                      <ToggleButton value="day" aria-label={t("addDrawer.day")}>
                        <WbSunnyOutlined
                          sx={{
                            fontSize: 20,
                            color: workMode === "day" ? "primary.contrastText" : "text.disabled",
                          }}
                        />
                      </ToggleButton>
                      <ToggleButton value="night" aria-label={t("addDrawer.night")}>
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
                    {t("addDrawer.patientLabel")}
                  </Typography>
                  <Button size="small" onClick={() => setAddPatientOpen(true)}>
                    {t("addDrawer.addPatient")}
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
                    t("addDrawer.patientOption", {
                      name: p.fullName || t("addDrawer.noFullName"),
                      phone: p.phone || t("addDrawer.noPhone"),
                    })
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
                      placeholder={t("addDrawer.searchPlaceholder")}
                      fullWidth
                      error={Boolean(form.errorOf("patient"))}
                      helperText={form.errorOf("patient") ?? ""}
                      ref={form.anchor("patient")}
                    />
                  )}
                />
                {!isBooking && selectedPatient && canUpdatePatient && (
                  <Button
                    size="small"
                    startIcon={<EditOutlined sx={{ fontSize: 16 }} />}
                    disabled={editPatientLoading}
                    onClick={() => void openEditPatient(selectedPatient.id)}
                    sx={{ mt: 0.5, textTransform: "none" }}
                  >
                    {t("addDrawer.editPatient")}
                  </Button>
                )}

                {!isBooking && selectedPatient?.isBlacklisted && (
                  <Alert severity="error" variant="outlined" sx={{ mt: 1, py: 0.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {t("addDrawer.blacklisted")}
                    </Typography>
                    <Typography variant="body2">
                      {t("addDrawer.blacklistReason", {
                        reason: selectedPatient.blacklistReason || t("addDrawer.notSpecified"),
                      })}
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
                      {t("addDrawer.bookingWithoutPatient")}
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
                  <Box ref={form.anchor("services")}>
                    <AppCard
                      variant="outlined"
                      sx={{ bgcolor: "background.paper" }}
                      disableContentPadding
                    >
                    <CardContent sx={{ p: 2 }}>
                      <Stack spacing={2}>
                        {/* ── Заголовок Услуги ── */}
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                          {t("editDrawer.servicesSection")}
                        </Typography>
                        <Divider />

                        {/* ── Блоки «специалист → его услуги» ── */}
                        {serviceGroups.map((group, groupIndex) => {
                          const groupIndexes = group.rows.map((r) => r.index);
                          const lastIndex = groupIndexes[groupIndexes.length - 1];
                          const groupServiceIds = group.rows
                            .map(({ row }) => row.serviceId)
                            .filter((id): id is number => id !== null);
                          // Специалист блока должен оказывать все его услуги —
                          // иначе смена исполнителя обнулила бы часть строк.
                          const employeeOptions = groupServiceIds.length
                            ? data.employees.filter((e) =>
                                groupServiceIds.every((id) =>
                                  data.canEmployeeProvideService(e.id, id),
                                ),
                              )
                            : data.employees;
                          const selectedEmployee =
                            data.employees.find((e) => e.id === group.employeeId) ?? null;
                          const availableServices = data.getServicesForEmployee(group.employeeId);
                          const accent =
                            group.employeeId !== null
                              ? (employeeAccents.get(group.employeeId) ?? null)
                              : null;
                          const groupHasError = group.rows.some(
                            ({ row }) =>
                              row.serviceId !== null &&
                              !data.canEmployeeProvideService(group.employeeId, row.serviceId),
                          );
                          // Блок целиком удаляем только когда услуг в нём больше
                          // одной (иначе хватает кнопки у самой услуги) и когда
                          // после удаления в приёме останется хотя бы одна строка.
                          const groupLocked = group.rows.some(({ row }) => row.hasConclusion);
                          const canDeleteGroup =
                            group.rows.length > 1 && serviceRows.length > group.rows.length;

                          return (
                            <ServiceGroupShell
                              key={group.key}
                              index={groupIndex}
                              accentColor={accent}
                              employeeName={selectedEmployee?.fullName ?? null}
                              hasError={groupHasError}
                              headerAction={
                                canDeleteGroup ? (
                                  <Tooltip
                                    title={
                                      groupLocked
                                        ? t("editDrawer.cannotDeleteHasConclusion")
                                        : t("serviceRow.deleteGroup")
                                    }
                                  >
                                    <span>
                                      <IconButton
                                        size="small"
                                        color="error"
                                        disabled={groupLocked}
                                        onClick={() =>
                                          setServiceRows((prev) =>
                                            prev.filter((_, i) => !groupIndexes.includes(i)),
                                          )
                                        }
                                        sx={{ p: 0.25 }}
                                      >
                                        <DeleteOutlined fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                ) : undefined
                              }
                              employeeField={
                              <Autocomplete<DjangoEmployeeWithServices>
                                fullWidth
                                // Смену исполнителя у строки с медзаключением бэк
                                // отбивает 400-й «Нельзя сменить или убрать
                                // исполнителя…» (проверено на живом API
                                // 17.07.2026) — если все услуги блока с
                                // заключением, поле блокируем сразу; при
                                // частичном совпадении такие строки останутся на
                                // прежнем специалисте (см. applyEmployeeToRows).
                                disabled={
                                  isWorkplaceNurse ||
                                  group.rows.every(({ row }) => row.hasConclusion)
                                }
                                options={employeeOptions}
                                loading={data.loading}
                                filterOptions={employeeFilter}
                                value={selectedEmployee}
                                onChange={(_, v) => applyEmployeeToRows(groupIndexes, v)}
                                getOptionLabel={(e) => e.fullName}
                                isOptionEqualToValue={(a, b) => a.id === b.id}
                                // Пустой список — почти всегда настройки, а не
                                // сбой: у услуги нет исполнителей либо нет
                                // никого на все услуги блока сразу. Объясняем,
                                // иначе регистратор упирается в «Ничего не
                                // найдено». Если варианты есть, а фильтр по
                                // введённому тексту пуст — обычный текст.
                                noOptionsText={
                                  employeeOptions.length === 0
                                    ? groupServiceIds.length > 1
                                      ? t("serviceRow.noEmployeeForAllServices")
                                      : t("serviceRow.noEmployeeForService")
                                    : t("serviceRow.noEmployeeMatches")
                                }
                                // Специализация видна в списке, а не только в
                                // поиске: помогает выбрать нужного из однофамильцев.
                                renderOption={(props, e) => (
                                  <li {...props} key={e.id}>
                                    <Stack>
                                      <Typography variant="body2">{e.fullName}</Typography>
                                      {(e.specializations ?? []).length > 0 && (
                                        <Typography variant="caption" color="text.secondary">
                                          {(e.specializations ?? []).join(", ")}
                                        </Typography>
                                      )}
                                    </Stack>
                                  </li>
                                )}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder={t("addDrawer.performer")}
                                    size="small"
                                    fullWidth
                                    error={form.attempted && group.employeeId === null}
                                    helperText={form.attempted && group.employeeId === null ? t("addDrawer.performerPlaceholder") : ""}
                                  />
                                )}
                              />
                              }
                              footer={
                                <Button
                                  size="small"
                                  onClick={() =>
                                    addRowAfter(lastIndex, group.employeeId, group.groupId)
                                  }
                                  disabled={data.loading}
                                >
                                  {t("addDrawer.addService")}
                                </Button>
                              }
                            >
                              {group.rows.map(({ row, index }, rowIndex) => {
                                const selectedService =
                                  availableServices.find((s) => s.id === row.serviceId) ??
                                  data.services.find((s) => s.id === row.serviceId) ??
                                  null;
                                const incompatible =
                                  row.serviceId !== null &&
                                  row.employeeId !== null &&
                                  !data.canEmployeeProvideService(row.employeeId, row.serviceId);
                                // Та же услуга уже есть выше у этого специалиста:
                                // не запрещаем (бывает две процедуры за приём),
                                // но предупреждаем — чаще это случайный дубль.
                                const duplicate =
                                  row.serviceId !== null &&
                                  group.rows
                                    .slice(0, rowIndex)
                                    .some(({ row: prev }) => prev.serviceId === row.serviceId);
                                const discount = Number(row.discountAmount) || 0;

                                return (
                                  <ServiceBranch
                                    key={row.uid}
                                    accentColor={accent}
                                    isLast={rowIndex === group.rows.length - 1}
                                    deleteButton={
                                      serviceRows.length > 1 ? (
                                        <Tooltip
                                          title={
                                            row.hasConclusion
                                              ? t("editDrawer.cannotDeleteHasConclusion")
                                              : t("editDrawer.deleteService")
                                          }
                                        >
                                          <span>
                                            <IconButton
                                              size="small"
                                              color="error"
                                              disabled={row.hasConclusion}
                                              onClick={() =>
                                                setServiceRows((prev) =>
                                                  prev.filter((_, i) => i !== index),
                                                )
                                              }
                                              sx={{ p: 0.25, mt: 0.75 }}
                                            >
                                              <DeleteOutlined fontSize="small" />
                                            </IconButton>
                                          </span>
                                        </Tooltip>
                                      ) : undefined
                                    }
                                    field={
                                <Autocomplete<DjangoCatalogServiceWithEmployees>
                                  fullWidth
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
                                  // Симметрично исполнителю: у выбранного
                                  // специалиста может не быть назначенных услуг.
                                  noOptionsText={
                                    row.employeeId !== null && availableServices.length === 0
                                      ? t("serviceRow.noServiceForEmployee")
                                      : t("serviceRow.noServiceMatches")
                                  }
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
                                      // Другая услуга — другой состав: бэк
                                      // пересобирает расходники из её справочника,
                                      // а прежние правки к новым строкам не
                                      // относятся (их id принадлежат старым).
                                      ...((v?.id ?? null) !== row.serviceId
                                        ? { consumptions: [], consumptionsDirty: false }
                                        : {}),
                                    })
                                  }
                                  getOptionLabel={(s) =>
                                    t("addDrawer.serviceOption", { name: s.name, price: Number(s.basePrice) })
                                  }
                                  isOptionEqualToValue={(a, b) => a.id === b.id}
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      placeholder={t("addDrawer.service")}
                                      size="small"
                                      fullWidth
                                      error={form.attempted && !row.serviceId}
                                      helperText={form.attempted && !row.serviceId ? t("addDrawer.servicePlaceholder") : ""}
                                    />
                                  )}
                                />
                                    }
                                  >
                                    {selectedService && (
                                      <ServicePriceField
                                        basePrice={selectedService.basePrice}
                                        value={row.unitPrice}
                                        // Строку с медзаключением без права
                                        // редактировать нельзя целиком — цена
                                        // не исключение.
                                        disabled={saving || (row.hasConclusion && !canEditLocked)}
                                        onChange={(next) => updateRow(index, { unitPrice: next })}
                                        suffix={
                                          <>
                                            {rowAmount(row, data.services) !==
                                            rowUnitPrice(row, data.services)
                                              ? t("editDrawer.lineTotalSuffix", {
                                                  amount: formatKGS(rowAmount(row, data.services)),
                                                })
                                              : ""}
                                            {discount > 0
                                              ? t("addDrawer.discountSuffix", {
                                                  amount: formatKGS(discount),
                                                })
                                              : ""}
                                            {selectedService.durationMinutes
                                              ? t("addDrawer.durationSuffix", {
                                                  minutes: selectedService.durationMinutes,
                                                })
                                              : ""}
                                          </>
                                        }
                                      />
                                    )}
                                    {duplicate && (
                                      <Typography variant="caption" color="warning.main">
                                        {t("serviceRow.duplicateService")}
                                      </Typography>
                                    )}
                                    {row.hasConclusion && (
                                      <Typography variant="caption" color="text.secondary">
                                        {canEditLocked
                                          ? t("editDrawer.hasConclusionHint")
                                          : t("editDrawer.hasConclusionLocked")}
                                      </Typography>
                                    )}
                                    {incompatible && (
                                      <Alert severity="error" sx={{ py: 0 }}>
                                        {t("editDrawer.specialistMismatch")}
                                      </Alert>
                                    )}
                                    {/* Расходники правим только у сохранённой
                                        строки: у новой (и у пересозданной после
                                        смены услуги) состав соберёт бэк из
                                        справочника, а id расходов ещё нет —
                                        показываем состав справочника как есть. */}
                                    {row.lineId == null && selectedService && (
                                      <ServiceConsumptionsPreview
                                        products={selectedService.relatedProducts}
                                        serviceQuantity={row.quantity}
                                      />
                                    )}
                                    {APPOINTMENT_CONSUMPTIONS_ENABLED && row.lineId != null && (
                                      <ConsumptionRowsEditor
                                        rows={row.consumptions}
                                        options={consumableProducts}
                                        disabled={saving}
                                        showErrors={form.attempted}
                                        onChange={(next) => {
                                          // touched — сигнал CloseGuard: правку
                                          // расходников нельзя потерять молча.
                                          setTouched(true);
                                          updateRow(index, {
                                            consumptions: next,
                                            consumptionsDirty: true,
                                          });
                                        }}
                                      />
                                    )}
                                  </ServiceBranch>
                                );
                              })}
                            </ServiceGroupShell>
                          );
                        })}

                        {/* Сестра процедурного кабинета исполнителя не меняет —
                            новый блок специалиста ей не нужен. */}
                        {!isWorkplaceNurse && (
                          <Button
                            size="small"
                            onClick={() =>
                              setServiceRows((prev) => [
                                ...prev,
                                newServiceRow(),
                              ])
                            }
                            sx={{ alignSelf: "flex-start" }}
                          >
                            {t("serviceRow.addSpecialist")}
                          </Button>
                        )}

                        <Divider />

                        {/* ── Товары ── */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                            {t("addDrawer.productsSection")}
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
                                ? t("editDrawer.productsLocked")
                                : t("editDrawer.productsHint")}
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
                                parseQty(row.quantity) > productAvailableStock(selectedProduct);
                              // Товар существующей строки уже списан со склада —
                              // предупреждать про остаток филиала незачем.
                              const branchWarning =
                                row.lineId === null && selectedProduct !== null && !overstocked
                                  ? branchStockWarning(
                                      stockElsewhere,
                                      selectedProduct,
                                      parseQty(row.quantity),
                                    )
                                  : null;
                              // Бэк отклонил сохранение именно из-за этого товара.
                              const rowShortage =
                                shortage && shortage.productId === row.productId
                                  ? stockShortageRowText(shortage)
                                  : null;
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
                                      noOptionsText={t("addDrawer.noProductsInStock")}
                                      renderOption={(props, p) => {
                                        const branchCaption = branchStockCaption(
                                          stockElsewhere,
                                          p,
                                        );
                                        return (
                                          <li {...props} key={p.id}>
                                            <Stack>
                                              <Typography variant="body2">{p.name}</Typography>
                                              <Typography variant="caption" color="text.secondary">
                                                {t("addDrawer.productStock", { price: formatKGS(p.price), stock: productAvailableStock(p), unit: p.unit })}
                                              </Typography>
                                              {branchCaption && (
                                                <Typography variant="caption" color="warning.main">
                                                  {branchCaption}
                                                </Typography>
                                              )}
                                            </Stack>
                                          </li>
                                        );
                                      }}
                                      renderInput={(params) => (
                                        <TextField
                                          {...params}
                                          placeholder={t("addDrawer.product")}
                                          size="small"
                                          fullWidth
                                        />
                                      )}
                                    />
                                    <TextField
                                      type="number"
                                      size="small"
                                      label={t("addDrawer.quantity")}
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
                                      {t("addDrawer.sumLabel")}{" "}
                                      <strong>
                                        {formatKGS(row.unitPrice * parseQty(row.quantity))}
                                      </strong>
                                      {overstocked
                                        ? t("addDrawer.insufficientStock", {
                                            stock: productAvailableStock(selectedProduct),
                                          })
                                        : ""}
                                    </Typography>
                                  )}
                                  {overstocked && (
                                    <Alert severity="error" sx={{ py: 0, fontSize: "0.75rem" }}>
                                      {t("addDrawer.productOverStock")}
                                    </Alert>
                                  )}
                                  {branchWarning && (
                                    <Alert severity="warning" sx={{ py: 0, fontSize: "0.75rem" }}>
                                      {branchWarning}
                                    </Alert>
                                  )}
                                  {rowShortage && (
                                    <Alert severity="error" sx={{ py: 0, fontSize: "0.75rem" }}>
                                      {rowShortage}
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
                              {t("addDrawer.addProduct")}
                            </Button>
                          </>
                        )}

                        <Divider />

                        {/* ── Итог: из чего складывается сумма ── */}
                        {validRows.length > 0 && (
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">
                              {t("addDrawer.servicesSubtotal")}
                            </Typography>
                            <Typography variant="body2">{formatKGS(servicesTotal)}</Typography>
                          </Stack>
                        )}
                        {productRows.length > 0 && (
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">
                              {t("addDrawer.productsSection")}
                            </Typography>
                            <Typography variant="body2">{formatKGS(productsTotal)}</Typography>
                          </Stack>
                        )}
                        {consumptionsTotal > 0 && (
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">
                              {t("consumptions.billableTotal")}
                            </Typography>
                            <Typography variant="body2">{formatKGS(consumptionsTotal)}</Typography>
                          </Stack>
                        )}
                        {totalDuration > 0 && (
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">
                              {t("addDrawer.durationTotal")}
                            </Typography>
                            <Typography variant="body2">
                              {t("addDrawer.minutesValue", { minutes: totalDuration })}
                            </Typography>
                          </Stack>
                        )}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" color="text.secondary">
                            {t("addDrawer.totalCost")}
                          </Typography>
                          <Typography variant="h6" fontWeight={700}>
                            {formatKGS(grandTotal)}
                          </Typography>
                        </Stack>
                      </Stack>
                    </CardContent>
                    </AppCard>
                  </Box>

                  {form.errorOf("services") && (
                    <Alert severity="error">{form.errorOf("services")}</Alert>
                  )}

                  {/* ── Текстовые поля ── */}
                  <TextField
                    placeholder={t("addDrawer.complaintsSection")}
                    value={complaints}
                    onChange={(e) => setComplaints(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                  <TextField
                    placeholder={t("editDrawer.doctorComplaints")}
                    value={doctorComplaints}
                    onChange={(e) => setDoctorComplaints(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                  <TextField
                    placeholder={t("editDrawer.adminComment")}
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                    // Бронь без пациента: подсвечиваем — комментарий здесь
                    // единственное объяснение, чьё время занято. Не обязателен.
                    helperText={isBooking ? t("addDrawer.bookingReasonHint") : undefined}
                    sx={isBooking ? attentionFieldSx : undefined}
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
            <Button variant="outlined" onClick={saving ? undefined : handleClose} disabled={saving}>
              {t("addDrawer.cancel")}
            </Button>
            <Button
              variant="contained"
              disabled={saving || data.loading}
              onClick={handleSave}
            >
              {saving ? (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={18} color="inherit" />
                  <span>{t("addDrawer.saving")}</span>
                </Stack>
              ) : (
                t("addDrawer.save")
              )}
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* Быстрое добавление пациента */}
      <DjangoAddPatientDrawer
        open={addPatientOpen}
        onClose={() => setAddPatientOpen(false)}
        onCreated={(p: DjangoPatient) => {
          setSelectedPatient(p);
          setAddPatientOpen(false);
        }}
      />

      <DjangoEditPatientDrawer
        open={editPatientOpen}
        patient={editPatient}
        onClose={() => setEditPatientOpen(false)}
        onUpdated={(p) => {
          setEditPatientOpen(false);
          setEditPatient(p);
          setSelectedPatient(p);
          void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.patients.detail(p.id) });
          void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.appointments.all });
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
