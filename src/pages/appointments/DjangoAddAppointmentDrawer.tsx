import React from "react";
import {
  Alert,
  AlertTitle,
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
  Grid,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { createFilterOptions } from "@mui/material/Autocomplete";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import ReportProblemIcon from "@mui/icons-material/ReportProblemOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { useNotification } from "@refinedev/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CustomDateTimePicker } from "../../components/ui";
import { useT } from "../../i18n/VerticalProvider";
import { roundDateTimeLocalToStep } from "../../utility/time";
import { formatKGS } from "../../utility/format";
import ServicePriceField from "../../components/appointments/ServicePriceField";
import { useCan } from "../../hooks/useCan";
import DjangoEditPatientDrawer from "../../components/patients/DjangoEditPatientDrawer";
import { usePermissions } from "../../hooks/usePermissions";
import { useDjangoAppointmentData } from "../../hooks/useDjangoAppointmentData";
import { useFormValidation } from "../../hooks/useFormValidation";
import {
  APPOINTMENT_CONSUMPTIONS_ENABLED,
  createAppointment,
  getAppointments,
  parseBackendError,
  parseInsufficientStock,
  parseOverlapConflict,
  type AppointmentOverlapConflict,
  type AppointmentStockShortage,
  type DjangoAppointment,
} from "../../api/appointments";
import { parseRelatedQuantity } from "../../api/catalog";
import ConsumptionRowsEditor from "../../components/appointments/ConsumptionRowsEditor";
import {
  billableRowsTotal,
  hasInvalidConsumptionQuantity,
  serviceTemplateRows,
  type ConsumptionRow,
} from "../../components/appointments/consumptionRows";
import { orgWide } from "../../api/scope";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import OverlapConfirmDialog from "./components/OverlapConfirmDialog";
import WaitlistDrawer from "../../components/waitlist/WaitlistDrawer";
import { WAITLIST_MODULE_ENABLED } from "../../api/waitlist";
import { getPatientBalance } from "../../api/patientBalance";
import {
  getProducts,
  productAvailableStock,
  type DjangoProduct,
} from "../../api/warehouse";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
} from "../../api/queryKeys";
import type { DjangoPatient } from "../../api/patients";
import { getPatient, searchPatients } from "../../api/patients";
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
import type { RbacBranch } from "../../api/auth";
import { useStockElsewhere } from "../../hooks/useStockElsewhere";
import {
  branchStockCaption,
  branchStockWarning,
} from "../../components/appointments/branchStockHint";
import {
  stockShortageMessage,
  stockShortageRowText,
} from "../../components/appointments/stockShortage";

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
  serviceId: number | null;
  employeeId: number | null;
  quantity: number;
  /**
   * Цена строки, если её правили руками. Пустая строка — «как в прайсе»: тогда
   * `unitPrice` в запрос не уходит и цену снапшотит бэк. Правка закрыта правом
   * `appointments.price_override` (см. ServicePriceField).
   */
  unitPrice: string;
  /** Индивидуальная длительность этой услуги только в создаваемом приёме. */
  durationMinutes: string;
  /**
   * Расходники строки, когда их правили руками. Пока `null` — состав берётся из
   * справочника услуги (и следует количеству услуги), а `consumptions` в запрос
   * не уходит вовсе: бэк развернёт состав сам.
   */
  consumptions: ConsumptionRow[] | null;
};

let serviceRowSeq = 0;

function newServiceRow(patch: Partial<ServiceRow> = {}): ServiceRow {
  serviceRowSeq += 1;
  const uid = `row-${serviceRowSeq}`;
  return {
    uid,
    groupId: uid,
    serviceId: null,
    employeeId: null,
    quantity: 1,
    unitPrice: "",
    durationMinutes: "",
    consumptions: null,
    ...patch,
  };
}

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

// Статусы, при которых запись пациента считается активной — на такое же время
// вторая запись почти наверняка дубль (отменённые/завершённые не мешают).
const ACTIVE_APPT_STATUSES = new Set(["scheduled", "confirmed", "arrived", "in_progress"]);

// Бронирование без пациента: бэк принимает создание приёма без patientId
// (и с patientId:null, и без поля) — приём создаётся с patient:null и не
// попадает в SMS-рассылку до привязки пациента. Готово на бэке и задеплоено
// на прод 23.07.2026 (frontend-backend-tickets-2026-07-23.md, п.1).
const BOOKING_WITHOUT_PATIENT_ENABLED = true;

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

// ── types ─────────────────────────────────────────────────────────────────────

export type DjangoAddAppointmentDrawerProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Созданный приём отдаём вызывающей стороне: по нему закрывается запись
   * листа ожидания («записали — человек больше не ждёт»).
   */
  onCreated?: (created?: DjangoAppointment) => void;
  initialDate?: string | null;
  /**
   * Использовать initialDate как точное время, без округления к шагу
   * тайм-пикера. Передаётся при клике по свободному окну («Есть окно на
   * 12:10») — иначе время окна сдвинулось бы на соседний шаг.
   */
  initialDateExact?: boolean;
  initialEmployeeId?: number | null;
  initialServiceId?: number | null;
  /**
   * Карта пациента, на которую открыли форму (повторная запись из карточки
   * брони). Пациента подгружаем по id: у вызывающей стороны есть только он.
   */
  initialPatientId?: number | null;
  /**
   * Включать режим «Бронирование (без пациента)» при предзаполнении из окна.
   * Используется только при явном запросе вызывающей стороны.
   */
  initialBooking?: boolean;
  /**
   * Сразу показать всю форму, не дожидаясь выбора пациента. Используется при
   * клике по свободному окну врача; обычное добавление остаётся пошаговым.
   */
  showAllFieldsInitially?: boolean;
};

// ── component ─────────────────────────────────────────────────────────────────

const DjangoAddAppointmentDrawer: React.FC<DjangoAddAppointmentDrawerProps> = ({
  open,
  onClose,
  onCreated,
  initialDate,
  initialDateExact = false,
  initialEmployeeId,
  initialServiceId,
  initialPatientId = null,
  initialBooking = false,
  showAllFieldsInitially = false,
}) => {
  const { t } = useT("appointments");
  const { t: tWaitlist } = useT("waitlist");
  const theme = useTheme();
  const { open: notify } = useNotification();
  const canCreate = useCan("appointments.create");
  const canManageAppointments = useCan("appointments.update");
  // Права проверяем всегда (хук нельзя звать под условием), а флаг гасит
  // модуль: бэкенда ещё нет, и роль superadmin проходит любую проверку прав
  // (см. WAITLIST_MODULE_ENABLED в api/waitlist.ts).
  const hasWaitlistCreatePermission = useCan(["waitlist.create", "waitlist.manage"]);
  const canWaitlistCreate = WAITLIST_MODULE_ENABLED && hasWaitlistCreatePermission;
  // Опечатку в телефоне видно уже при записи — правим карту, не теряя форму.
  const canUpdatePatient = useCan("patients.update");
  const [editPatientOpen, setEditPatientOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const {
    activeBranch,
    activeOrganization,
    activeMembership,
    activeEmployee,
    isNurse,
  } = usePermissions();
  // Орг-скоуп для запросов: суперпользователю/мультиорг-аккаунту передаём явно,
  // иначе пикеры и проверка дублей смотрят не в ту организацию.
  const orgId = useApiOrgId();

  // Процедурный кабинет: медсестра без права управления приёмами создаёт
  // процедуры только на себя — поле исполнителя фиксируется её employee id. Без
  // известного employee id поле не блокируем, иначе форма станет незаполнимой.
  const nurseEmployeeId =
    isNurse() && !canManageAppointments ? activeEmployee?.id ?? null : null;
  const isWorkplaceNurse = nurseEmployeeId !== null;

  // ── form state ───────────────────────────────────────────────────────────
  const [scheduledAt, setScheduledAt] = React.useState<string>("");
  const [workMode, setWorkMode] = React.useState<"day" | "night">("day");
  const [isBooking, setIsBooking] = React.useState(false);
  const [selectedPatient, setSelectedPatient] = React.useState<DjangoPatient | null>(null);
  const [patientSearch, setPatientSearch] = React.useState("");
  const [serviceRows, setServiceRows] = React.useState<ServiceRow[]>([newServiceRow()]);
  /** Открыт дровер листа ожидания («время занято — поставить в очередь»). */
  const [waitlistOpen, setWaitlistOpen] = React.useState(false);
  const [productRows, setProductRows] = React.useState<ProductRow[]>([]);
  const [products, setProducts] = React.useState<DjangoProduct[]>([]);
  /** Каталог для расходников — без фильтров продажи и остатка. */
  const [consumableProducts, setConsumableProducts] = React.useState<DjangoProduct[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [complaints, setComplaints] = React.useState("");
  const [adminComment, setAdminComment] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // Выбор здесь относится только к создаваемому приёму. Не переключаем
  // глобальный контекст: switchContext() размонтирует страницы приложения и
  // закроет этот дровер вместе с уже заполненной формой.
  const [appointmentBranch, setAppointmentBranch] = React.useState<RbacBranch | null>(null);
  const [addPatientOpen, setAddPatientOpen] = React.useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = React.useState(false);
  const [confirmDuplicateOpen, setConfirmDuplicateOpen] = React.useState(false);
  const [overlapConflict, setOverlapConflict] =
    React.useState<AppointmentOverlapConflict | null>(null);
  /** Какому товару не хватило остатка на складе филиала (машинный код бэка). */
  const [shortage, setShortage] = React.useState<AppointmentStockShortage | null>(null);
  // Любая правка состава снимает пометку: она относилась к отправленным строкам.
  React.useEffect(() => {
    setShortage(null);
  }, [productRows, serviceRows]);
  const availableBranches = React.useMemo(
    () => (activeMembership?.branches ?? []).filter((branch) => branch.isActive),
    [activeMembership],
  );
  const effectiveBranch = appointmentBranch ?? activeBranch;
  /**
   * Сессия в режиме «Все филиалы», а филиал у пользователя ровно один —
   * выбирать нечего, подставляем его сами. Иначе форма встречала оранжевым
   * предупреждением на пол-экрана с единственной кнопкой (жалоба заказчика
   * 19.08.2026: «панель занимает рабочее пространство»).
   */
  React.useEffect(() => {
    if (!open || appointmentBranch || activeBranch) return;
    if (availableBranches.length === 1) setAppointmentBranch(availableBranches[0]);
  }, [open, appointmentBranch, activeBranch, availableBranches]);
  const data = useDjangoAppointmentData(
    open,
    effectiveBranch?.id ?? null,
    activeOrganization?.id ?? null,
    activeMembership?.id ?? null,
  );
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
      setServiceRows([newServiceRow()]);
      setProductRows([]);
      setComplaints("");
      setAdminComment("");
      form.reset();
      setSaving(false);
      setSaveError(null);
      setAppointmentBranch(null);
      setConfirmCloseOpen(false);
      setConfirmDuplicateOpen(false);
      return;
    }
    // Округляем initialDate под шаг тайм-пикера (15 мин): вызывающая сторона
    // может передать «сырое» текущее время (например 19:58), которое пикер
    // не разрешает выбрать. nowRounded() уже округлён.
    // Исключение — предзаполнение из свободного окна: время слота (например
    // 09:20 при 20-минутной услуге) должно сохраниться точно, иначе приём
    // съедет на соседний слот; вызывающая сторона помечает такое время
    // initialDateExact. Само наличие initialEmployeeId к округлению отношения
    // не имеет: врач может прийти из фильтра-ленты регистратуры, а время там —
    // «сырое» текущее (19:58), которое пикер выбрать не даёт.
    const base = initialDate
      ? initialDateExact
        ? initialDate
        : roundDateTimeLocalToStep(initialDate, 15)
      : nowRounded();
    setScheduledAt(base);
    setWorkMode(inferWorkMode(base));
    // Предзаполнение исполнителя/услуги: клик по свободному окну (врач +
    // услуга) либо выбранный в ленте регистратуры специалист (только врач).
    const isSlotPrefill = initialEmployeeId != null || initialServiceId != null;
    if (isSlotPrefill) {
      // Бронь — только по явному запросу вызывающей стороны: она раскрывает
      // секцию услуг сразу и снимает обязательность пациента.
      if (initialBooking) setIsBooking(true);
      setServiceRows([
        newServiceRow({
          serviceId: initialServiceId ?? null,
          employeeId: initialEmployeeId ?? null,
        }),
      ]);
    }
    // Инициализация — только в момент открытия. initialDate у вызывающей
    // стороны может пересчитываться на каждом ре-рендере (текущее время +
    // heartbeat каждые 2.5с) — если оставить его в deps, эффект молча
    // затирает дату, которую пользователь уже ввёл в открытой форме (приём
    // уходил на другое время, чем показывало поле).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Предзаполнение пациента по id (повторная запись из карточки брони).
  // Грузим отдельным запросом: автокомплит ищет по строке, а у вызывающей
  // стороны есть только id карты. Уже выбранного пациента не перетираем —
  // иначе запрос, вернувшийся после ручного выбора, отменил бы его.
  React.useEffect(() => {
    if (!open || initialPatientId == null) return;
    let cancelled = false;
    getPatient(initialPatientId)
      .then((p) => {
        if (cancelled) return;
        setSelectedPatient((prev) => prev ?? p);
      })
      .catch(() => {
        /* карта могла быть удалена — форма останется с пустым пациентом */
      });
    return () => {
      cancelled = true;
    };
  }, [open, initialPatientId]);

  // Если зашла медсестра — фиксируем её как исполнителя в пустых строках.
  React.useEffect(() => {
    if (!open || nurseEmployeeId === null) return;
    setServiceRows((prev) =>
      prev.map((row) => ({
        ...row,
        employeeId: row.employeeId ?? nurseEmployeeId,
      })),
    );
  }, [open, nurseEmployeeId]);

  // ── load sellable products (with branch stock) ─────────────────────────────
  // branchId обязателен: без него бэк отдаёт только агрегат `stock` по всей
  // организации, а списывает со склада филиала — пикер обещал бы остаток,
  // которого на месте нет (тикет product_stock_branch_scoping, закрыт 03.08.2026).
  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setProductsLoading(true);
    getProducts(ctrl.signal, { organizationId: orgId, branchId: effectiveBranch?.id })
      .then((list) => {
        if (ctrl.signal.aborted) return;
        // Only goods that can be sold and are currently in stock — остаток берём
        // филиальный (productAvailableStock), именно его проверит сохранение.
        setProducts(
          list.filter(
            (p) => p.isActive && p.isForSale && productAvailableStock(p) > 0,
          ),
        );
        // Расходники — не продажа: ни «на продажу», ни «остаток > 0» к ним не
        // применимы (гель не продаётся, а минусовой остаток бэк разрешает).
        setConsumableProducts(list.filter((p) => p.isActive));
      })
      .catch(() => {
        /* products are optional; ignore load errors silently */
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setProductsLoading(false);
      });
    return () => ctrl.abort();
  }, [open, effectiveBranch?.id, orgId]);

  // «Есть на складе X» для товара, которого нет на складе филиала: сам остаток
  // филиала приходит в product.branchStock, здесь — только откуда его передать.
  const stockElsewhere = useStockElsewhere(open, orgId);

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
      // Филиалом не сужаем: пациента, записанного в соседнем филиале, всё равно
      // нужно найти. Ограничиваем только организацией.
      searchPatients(orgWide(orgId), patientSearch.trim(), 30, ctrl.signal)
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
  }, [open, patientSearch, orgId]);

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

  // ── защита от дублей: активные записи пациента на выбранное время ──────────
  // Дубли реально случались (пациент записан дважды на один слот): проверяем
  // существующие записи пациента и предупреждаем до создания.
  const patientApptsQuery = useQuery({
    queryKey: djangoQueryKeys.appointments.list({
      patientId: selectedPatient?.id ?? 0,
      organizationId: orgId,
    }),
    queryFn: ({ signal }) =>
      getAppointments(orgWide(orgId), { patientId: selectedPatient!.id }, signal),
    enabled: open && !!selectedPatient && !isBooking,
    // Короткий staleTime: запись могли только что создать в соседнем окне.
    staleTime: 15_000,
    retry: false,
  });
  const duplicateAppointments = React.useMemo(() => {
    if (!selectedPatient || isBooking || !scheduledAt) return [];
    const target = dayjs(scheduledAt);
    return (patientApptsQuery.data ?? []).filter(
      (a) =>
        ACTIVE_APPT_STATUSES.has(a.status) &&
        dayjs(a.scheduledAt).isSame(target, "minute"),
    );
  }, [patientApptsQuery.data, selectedPatient, isBooking, scheduledAt]);

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

  // Расходники строки: пока их не правили — состав справочника, умноженный на
  // количество услуги (ровно то, что развернёт бэк); после правки — то, что
  // осталось в форме.
  const effectiveConsumptions = React.useCallback(
    (row: ServiceRow): ConsumptionRow[] => {
      if (row.consumptions !== null) return row.consumptions;
      const svc = data.services.find((s) => s.id === row.serviceId);
      return svc ? serviceTemplateRows(svc.relatedProducts, row.quantity) : [];
    },
    [data.services],
  );

  // ── validation ────────────────────────────────────────────────────────────
  const validRows = serviceRows.filter((r) => r.serviceId !== null && r.employeeId !== null);
  const incompatibleRows = validRows.filter(
    (r) => !data.canEmployeeProvideService(r.employeeId, r.serviceId),
  );
  const validProductRows = productRows.filter(
    (r) => r.productId !== null && parseQty(r.quantity) > 0,
  );
  // A selected quantity exceeding branch stock — block submit with a hint.
  const overstockedRows = validProductRows.filter((r) => {
    const p = products.find((x) => x.id === r.productId);
    return p ? parseQty(r.quantity) > productAvailableStock(p) : false;
  });
  // Порядок ключей = порядок полей в форме: в первое незаполненное уйдёт фокус.
  const form = useFormValidation({
    scheduledAt: scheduledAt ? null : t("addDrawer.errors.dateTimeRequired"),
    patient: isBooking || selectedPatient ? null : t("addDrawer.errors.patientRequired"),
    services:
      validRows.length === 0
        ? t("addDrawer.errors.serviceRequired")
        : incompatibleRows.length > 0
          ? t("addDrawer.errors.performerMismatch")
          : serviceRows.some(
                (r) => r.consumptions !== null && hasInvalidConsumptionQuantity(r.consumptions),
              )
            ? t("consumptions.quantityError")
            : serviceRows.some(
                (r) =>
                  r.durationMinutes.trim() !== "" &&
                  (!Number.isInteger(Number(r.durationMinutes)) || Number(r.durationMinutes) <= 0),
              )
              ? t("priceField.invalidDuration")
            : null,
    products:
      overstockedRows.length > 0 ? t("addDrawer.errors.overStock") : null,
    // Комментарий к брони необязателен: часто бронируют по звонку, когда
    // сказать про неё пока нечего, а пустое поле блокировало сохранение.
  });
  const touched = form.attempted;

  // ── totals (services + goods share one bill) ───────────────────────────────
  const servicesTotal = React.useMemo(
    () =>
      validRows.reduce((sum, r) => {
        const svc = data.services.find((s) => s.id === r.serviceId);
        if (!svc) return sum;
        // Правленая цена — та, что уйдёт в запрос; иначе регистратор назовёт
        // пациенту сумму по прайсу, а в чек попадёт другая.
        const unit = r.unitPrice.trim() ? Number(r.unitPrice) || 0 : Number(svc.basePrice);
        return sum + unit * r.quantity;
      }, 0),
    [validRows, data.services],
  );
  const productsTotal = React.useMemo(
    () =>
      validProductRows.reduce((sum, r) => {
        const p = products.find((x) => x.id === r.productId);
        return sum + (p ? p.price * parseQty(r.quantity) : 0);
      }, 0),
    [validProductRows, products],
  );
  // Платные позиции состава услуги (billable) бэк включает в сумму приёма —
  // значит и в итоге формы они должны быть, иначе регистратор назовёт пациенту
  // сумму меньше той, что попадёт в чек.
  const consumptionsTotal = React.useMemo(
    () =>
      validRows.reduce((sum, r) => sum + billableRowsTotal(effectiveConsumptions(r)), 0),
    [validRows, effectiveConsumptions],
  );
  const totalCost = servicesTotal + productsTotal + consumptionsTotal;

  // Суммарная длительность услуг — по ней видно, на сколько занят слот.
  const totalDuration = React.useMemo(
    () =>
      validRows.reduce((sum, r) => {
        const svc = data.services.find((s) => s.id === r.serviceId);
        const duration = r.durationMinutes.trim()
          ? Number(r.durationMinutes)
          : (svc?.durationMinutes ?? 0);
        return sum + duration * (r.quantity > 0 ? r.quantity : 1);
      }, 0),
    [validRows, data.services],
  );

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSave = () => {
    // Guard от повторного входа: кнопка блокируется через state с задержкой
    // на ре-рендер, быстрый двойной клик успел бы отправить два POST.
    if (saving) return;
    // Без активного филиала бэкенд отклонит запрос (branchId обязателен) —
    // не даём отправить форму, предупреждение уже показано сверху.
    if (!effectiveBranch) return;
    // Показывает ошибки и уводит фокус в первое незаполненное поле.
    if (!form.validate()) return;
    // У пациента уже есть активная запись на это время — создание только
    // через явное подтверждение (диалог вызовет performSave сам).
    if (duplicateAppointments.length > 0) {
      setConfirmDuplicateOpen(true);
      return;
    }
    void performSave();
  };

  const performSave = async (allowOverlap = false) => {
    if (saving) return;
    setSaveError(null);
    setSaving(true);
    try {
      const created = await createAppointment({
        patientId: selectedPatient?.id ?? null,
        branchId: effectiveBranch?.id ?? null,
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
          // Пустое поле не отправляем вовсе: бэк снапшотит цену из прайса сам,
          // а присланная каталожная цена — лишний повод для проверки права.
          ...(r.unitPrice.trim() ? { unitPrice: r.unitPrice.trim() } : {}),
          ...(r.durationMinutes.trim()
            ? { durationMinutes: Number(r.durationMinutes) }
            : {}),
          // Ключ уходит только когда расходники правили: его отсутствие значит
          // «развернуть состав услуги как есть», а `[]` — «без расходников»
          // (именно так убирается лишний товар из состава при записи).
          ...(APPOINTMENT_CONSUMPTIONS_ENABLED && r.consumptions !== null
            ? {
                consumptions: r.consumptions.map((c) => ({
                  productId: c.productId,
                  quantity: String(parseRelatedQuantity(c.quantity) ?? 1),
                  autoWriteOff: c.autoWriteOff,
                  billable: c.billable,
                })),
              }
            : {}),
        })),
        products: validProductRows.map((r) => ({
          productId: r.productId!,
          quantity: parseQty(r.quantity) > 0 ? parseQty(r.quantity) : 1,
        })),
        ...(allowOverlap ? { allowOverlap: true } : {}),
      });
      setOverlapConflict(null);
      notify?.({ type: "success", message: t("addDrawer.created") });
      onCreated?.(created);
      onClose();
    } catch (err: unknown) {
      // Org "warn" mode: the backend lists the conflicts and waits for
      // confirmation. Show the modal instead of a raw error; confirming
      // re-sends with allowOverlap=true.
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

  // Специалист выбирается один раз на блок, поэтому смена применяется ко всем
  // его услугам сразу; услуги, которых новый специалист не оказывает, сбрасываем.
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
        if (!targets.has(i)) return row;
        // Удаление врача крестиком — это сброс пары «врач + услуга». При
        // очистке самой услуги врач, наоборот, остаётся выбранным.
        const keepService =
          employee !== null &&
          (row.serviceId === null ||
            data.canEmployeeProvideService(employee.id, row.serviceId));
        return {
          ...row,
          groupId: groupId ?? row.groupId,
          employeeId: employee?.id ?? null,
          serviceId: keepService ? row.serviceId : null,
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
          <Typography variant="h6">{t("addDrawer.title")}</Typography>
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
            {!effectiveBranch && (
              <Alert severity="warning">
                <AlertTitle>{t("addDrawer.noBranchTitle")}</AlertTitle>
                {t("addDrawer.noBranchText")}
                {availableBranches.length > 0 ? (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="body2" sx={{ mb: 0.75, fontWeight: 600 }}>
                      {t("addDrawer.chooseBranch")}
                    </Typography>
                    <Stack spacing={0.75}>
                      {availableBranches.map((branch) => {
                        return (
                          <Button
                            key={branch.id}
                            variant="outlined"
                            color="warning"
                            fullWidth
                            onClick={() => setAppointmentBranch(branch)}
                            startIcon={<StoreOutlined />}
                            sx={{ justifyContent: "flex-start" }}
                          >
                            {branch.name}
                          </Button>
                        );
                      })}
                    </Stack>
                  </Box>
                ) : (
                  <>
                    <br />
                    {t("addDrawer.noBranchHowTo")} <b>{t("addDrawer.noBranchHowToLink")}</b>{" "}
                    {t("addDrawer.noBranchHowToTail")}
                  </>
                )}
              </Alert>
            )}
            {saveError && (
              <Alert ref={errorRef} severity="error" onClose={() => setSaveError(null)}>
                {saveError}
              </Alert>
            )}

            {/* ── 1. Дата и время ── */}
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
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
                      InputProps: {
                        sx: { fontSize: "1.1rem", fontWeight: 500 },
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

            {/* ── 2. Пациент ── */}
            <Stack spacing={0.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                  {t("addDrawer.patientLabel")}
                </Typography>
                <Button size="small" onClick={() => setAddPatientOpen(true)}>
                  {t("addDrawer.addPatient")}
                </Button>
              </Stack>

              {/* ── Кастомный Toggle бронирования (1-в-1 с оригиналом и редактированием) ── */}
              {BOOKING_WITHOUT_PATIENT_ENABLED && (
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
              )}

              {!isBooking && (
                <Autocomplete<DjangoPatient>
                  options={filteredPatients}
                  // Спиннер про поиск пациента, а не про загрузку справочников.
                  loading={patientsLoading}
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
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="body2" noWrap>
                              {p.fullName || t("addDrawer.noFullName")}
                            </Typography>
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
                      </Box>
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
              )}

              {!isBooking && selectedPatient && canUpdatePatient && (
                <Button
                  size="small"
                  startIcon={<EditOutlined sx={{ fontSize: 16 }} />}
                  onClick={() => setEditPatientOpen(true)}
                  sx={{ alignSelf: "flex-start", textTransform: "none" }}
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

              {!isBooking && patientHasDebt && (
                <Alert severity="error" variant="outlined" sx={{ mt: 1, py: 0.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t("addDrawer.patientDebt")}{" "}
                    {formatKGS(Math.abs(patientBalanceNum))}
                  </Typography>
                </Alert>
              )}

              {!isBooking && duplicateAppointments.length > 0 && (
                <Alert severity="warning" variant="outlined" sx={{ mt: 1, py: 0.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t("addDrawer.duplicateWarning")}
                  </Typography>
                  {duplicateAppointments.map((a) => {
                    const line = a.services[0];
                    const parts = [
                      dayjs(a.scheduledAt).format("D MMMM, HH:mm"),
                      line?.employee?.fullName,
                      line?.service?.name,
                    ].filter(Boolean);
                    return (
                      <Typography key={a.id} variant="body2">
                        {parts.join(" — ")}
                      </Typography>
                    );
                  })}
                  <Typography variant="body2" color="text.secondary">
                    {t("addDrawer.duplicateHint")}
                  </Typography>
                </Alert>
              )}
            </Stack>

            {/* При клике по окну врач уже известен, поэтому форму раскрываем
                сразу, но не переводим запись в режим бронирования. */}
            {(selectedPatient || isBooking || showAllFieldsInitially) && (
              <>
                <Card
                  ref={form.anchor("services")}
                  variant="outlined"
                  sx={{ bgcolor: "background.paper" }}
                >
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
                          {t("addDrawer.servicesSection")}
                        </Typography>
                      </Stack>
                      <Divider />

                      {data.loading && (
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <CircularProgress size={14} />
                          <Typography variant="caption" color="text.secondary">
                            {t("addDrawer.loadingDicts")}
                          </Typography>
                        </Stack>
                      )}

                      {data.error && (
                        <Alert severity="error" sx={{ py: 0 }}>
                          {data.error}
                        </Alert>
                      )}

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
                        // после удаления в форме останется хотя бы одна строка.
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
                                <Tooltip title={t("serviceRow.deleteGroup")}>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() =>
                                      setServiceRows((prev) =>
                                        prev.filter((_, i) => !groupIndexes.includes(i)),
                                      )
                                    }
                                    sx={{ p: 0.25 }}
                                  >
                                    <DeleteOutlined fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : undefined
                            }
                            employeeField={
                              <Autocomplete<DjangoEmployeeWithServices>
                                fullWidth
                                disabled={isWorkplaceNurse}
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
                                    error={touched && group.employeeId === null}
                                    helperText={
                                      touched && group.employeeId === null
                                        ? t("addDrawer.performerPlaceholder")
                                        : ""
                                    }
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

                              return (
                                <ServiceBranch
                                  key={row.uid}
                                  accentColor={accent}
                                  isLast={rowIndex === group.rows.length - 1}
                                  deleteButton={
                                    serviceRows.length > 1 ? (
                                      <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() =>
                                          setServiceRows((prev) =>
                                            prev.filter((_, i) => i !== index),
                                          )
                                        }
                                        sx={{ p: 0.25, mt: 0.75 }}
                                      >
                                        <DeleteOutlined fontSize="small" />
                                      </IconButton>
                                    ) : undefined
                                  }
                                  field={
                                    <Autocomplete<DjangoCatalogServiceWithEmployees>
                                      fullWidth
                                      options={
                                        row.employeeId !== null
                                          ? availableServices
                                          : data.services
                                      }
                                      loading={data.loading}
                                      value={selectedService}
                                      // Симметрично исполнителю: у выбранного
                                      // специалиста может не быть назначенных услуг.
                                      noOptionsText={
                                        row.employeeId !== null && availableServices.length === 0
                                          ? t("serviceRow.noServiceForEmployee")
                                          : t("serviceRow.noServiceMatches")
                                      }
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
                                          // Другая услуга — другой состав: правки
                                          // относились к прежним расходникам. Цену
                                          // тоже сбрасываем: пересчёт на прайс новой
                                          // услуги бэк пропускает без права.
                                          ...((v?.id ?? null) !== row.serviceId
                                            ? { consumptions: null, unitPrice: "", durationMinutes: "" }
                                            : {}),
                                        });
                                      }}
                                      getOptionLabel={(s) =>
                                        t("addDrawer.serviceOption", {
                                          name: s.name,
                                          price: Number(s.basePrice),
                                        })
                                      }
                                      isOptionEqualToValue={(a, b) => a.id === b.id}
                                      renderOption={(props, s) => (
                                        <li {...props} key={s.id}>
                                          <Stack>
                                            <Typography variant="body2">{s.name}</Typography>
                                            <Typography
                                              variant="caption"
                                              color="text.secondary"
                                            >
                                              {t("addDrawer.priceAmount", { amount: Number(s.basePrice) })}
                                              {s.durationMinutes
                                                ? t("addDrawer.durationSuffix", { minutes: s.durationMinutes })
                                                : ""}
                                            </Typography>
                                          </Stack>
                                        </li>
                                      )}
                                      renderInput={(params) => (
                                        <TextField
                                          {...params}
                                          placeholder={t("addDrawer.service")}
                                          size="small"
                                          fullWidth
                                          error={touched && !row.serviceId}
                                          helperText={
                                            touched && !row.serviceId
                                              ? t("addDrawer.servicePlaceholder")
                                              : ""
                                          }
                                        />
                                      )}
                                    />
                                  }
                                >
                                  {selectedService && (
                                    <ServicePriceField
                                      basePrice={selectedService.basePrice}
                                      value={row.unitPrice}
                                      baseDurationMinutes={selectedService.durationMinutes}
                                      durationValue={row.durationMinutes}
                                      disabled={saving}
                                      onChange={(next) => updateRow(index, { unitPrice: next })}
                                      onDurationChange={(next) =>
                                        updateRow(index, { durationMinutes: next })
                                      }
                                    />
                                  )}

                                  {/* Расходники: до сохранения строк расхода нет,
                                      поэтому основа — состав справочника услуги.
                                      Правится здесь же: лишний товар из состава
                                      (например второй флакон) убирается до записи,
                                      а не после сохранения приёма. Пока не правили —
                                      количество следует количеству услуги. */}
                                  {APPOINTMENT_CONSUMPTIONS_ENABLED &&
                                    selectedService &&
                                    (row.consumptions !== null ||
                                      selectedService.relatedProducts.length > 0) && (
                                      <ConsumptionRowsEditor
                                        rows={effectiveConsumptions(row)}
                                        options={consumableProducts}
                                        disabled={saving}
                                        showErrors={touched}
                                        onChange={(next) =>
                                          updateRow(index, { consumptions: next })
                                        }
                                      />
                                    )}

                                  {duplicate && (
                                    <Typography variant="caption" color="warning.main">
                                      {t("serviceRow.duplicateService")}
                                    </Typography>
                                  )}

                                  {incompatible && (
                                    <Alert severity="error" sx={{ py: 0, fontSize: "0.75rem" }}>
                                      {t("addDrawer.specialistMismatch")}
                                    </Alert>
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
                          disabled={data.loading}
                          sx={{ alignSelf: "flex-start" }}
                        >
                          {t("serviceRow.addSpecialist")}
                        </Button>
                      )}

                      {form.errorOf("services") && (
                        <Alert severity="error" sx={{ py: 0 }}>
                          {form.errorOf("services")}
                        </Alert>
                      )}

                    </Stack>
                  </CardContent>
                </Card>

                {/* ── 3b. Товары (необязательно) ── */}
                <Card
                  ref={form.anchor("products")}
                  variant="outlined"
                  sx={{ bgcolor: "background.paper" }}
                >
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
                          {t("addDrawer.productsSection")}
                        </Typography>
                        {productsLoading && <CircularProgress size={14} />}
                      </Stack>

                      {productRows.length > 0 && <Divider />}

                      {productRows.map((row, index) => {
                        const selectedProduct =
                          products.find((p) => p.id === row.productId) ?? null;
                        const overstocked =
                          selectedProduct !== null &&
                          parseQty(row.quantity) > productAvailableStock(selectedProduct);
                        const branchWarning =
                          selectedProduct !== null && !overstocked
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
                                options={products}
                                loading={productsLoading}
                                filterOptions={productFilter}
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
                                noOptionsText={t("addDrawer.noProductsInStock")}
                                renderOption={(props, p) => {
                                  const branchCaption = branchStockCaption(stockElsewhere, p);
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
                                {t("addDrawer.sumLabel")}{" "}
                                <strong>
                                  {formatKGS(selectedProduct.price * parseQty(row.quantity))}
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
                        onClick={() =>
                          setProductRows((prev) => [
                            ...prev,
                            { productId: null, quantity: "1" },
                          ])
                        }
                        disabled={productsLoading || products.length === 0}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        {t("addDrawer.addProduct")}
                      </Button>

                      {!productsLoading && products.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {t("addDrawer.noProductsForSale")}
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                {/* ── 3c. Итог: после обеих секций, иначе сумма меняется выше
                       того, что на неё влияет (товары) ── */}
                {(validRows.length > 0 || validProductRows.length > 0) && (
                  <Card variant="outlined" sx={{ bgcolor: "background.paper" }}>
                    <CardContent sx={{ p: 2 }}>
                      <Stack spacing={1}>
                        {validRows.length > 0 && (
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">
                              {t("addDrawer.servicesSubtotal")}
                            </Typography>
                            <Typography variant="body2">{formatKGS(servicesTotal)}</Typography>
                          </Stack>
                        )}
                        {validProductRows.length > 0 && (
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
                        <Divider />
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                        >
                          <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            {t("addDrawer.totalCost")}
                          </Typography>
                          <Typography
                            variant="h6"
                            sx={{ fontWeight: 700, color: "primary.onSurface" }}
                          >
                            {formatKGS(totalCost)}
                          </Typography>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                )}

                {/* ── 4. Текстовые поля ── */}
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    {t("addDrawer.complaintsSection")}
                  </Typography>
                  <TextField
                    value={complaints}
                    onChange={(e) => setComplaints(e.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                    size="small"
                    placeholder={t("addDrawer.optional")}
                  />
                </Stack>

                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    {t("addDrawer.adminCommentLabel")}
                  </Typography>
                  <TextField
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                    size="small"
                    placeholder={
                      isBooking ? t("addDrawer.bookingReason") : t("addDrawer.optional")
                    }
                    // У брони поле подсвечено янтарным (как тумблер брони):
                    // без пациента только комментарий и объясняет, чьё время
                    // занято. Подсказка, а не обязательное поле.
                    helperText={isBooking ? t("addDrawer.bookingReasonHint") : undefined}
                    sx={isBooking ? attentionFieldSx : undefined}
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
              {t("addDrawer.cancel")}
            </Button>
            <Button
              variant="contained"
              disabled={saving || data.loading || !effectiveBranch}
              onClick={handleSave}
              startIcon={
                saving ? <CircularProgress size={16} color="inherit" /> : undefined
              }
            >
              {saving ? t("addDrawer.saving") : t("addDrawer.save")}
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

      {/* Подтверждение создания при уже существующей записи на это время */}
      <Dialog open={confirmDuplicateOpen} onClose={() => setConfirmDuplicateOpen(false)}>
        <DialogTitle>{t("addDrawer.duplicateWarning")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("addDrawer.duplicateDialogText", {
              name: selectedPatient?.fullName || t("addDrawer.patient"),
              when: scheduledAt
                ? dayjs(scheduledAt).format("D MMMM YYYY, HH:mm")
                : t("addDrawer.thisTime"),
              performer: duplicateAppointments[0]?.services[0]?.employee?.fullName
                ? ` (${duplicateAppointments[0].services[0].employee!.fullName})`
                : "",
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDuplicateOpen(false)} autoFocus>
            {t("addDrawer.cancel")}
          </Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => {
              setConfirmDuplicateOpen(false);
              void performSave();
            }}
          >
            {t("addDrawer.createAnyway")}
          </Button>
        </DialogActions>
      </Dialog>

      <DjangoEditPatientDrawer
        open={editPatientOpen}
        patient={selectedPatient}
        onClose={() => setEditPatientOpen(false)}
        onUpdated={(p) => {
          setEditPatientOpen(false);
          // Форма продолжает работу с обновлённой картой: телефон и чёрный
          // список читаются из этого же объекта.
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
        // Время занято — чаще всего это и есть случай «запишите меня, когда
        // освободится»: предлагаем очередь вместо записи вторым на тот же слот.
        onWaitlist={
          canWaitlistCreate
            ? () => {
                setOverlapConflict(null);
                setWaitlistOpen(true);
              }
            : undefined
        }
        waitlistLabel={tWaitlist("add")}
      />

      {/* Лист ожидания: врач и услуги переносятся из наполовину заполненной формы */}
      <WaitlistDrawer
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        prefill={{
          patientId: selectedPatient?.id ?? null,
          patientName: selectedPatient?.fullName ?? null,
          phone: selectedPatient?.phone ?? null,
          employeeId: serviceRows.find((r) => r.employeeId != null)?.employeeId ?? null,
          serviceIds: serviceRows
            .map((r) => r.serviceId)
            .filter((id): id is number => id != null),
          desiredDateFrom: scheduledAt ? dayjs(scheduledAt).format("YYYY-MM-DD") : null,
        }}
        onSaved={() => onClose()}
      />

      {/* Подтверждение закрытия при несохранённых данных */}
      <Dialog open={confirmCloseOpen} onClose={() => setConfirmCloseOpen(false)}>
        <DialogTitle>{t("addDrawer.discardTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("addDrawer.discardText")}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCloseOpen(false)}>{t("addDrawer.discardKeep")}</Button>
          <Button onClick={confirmDiscardAndClose} color="error" variant="contained" autoFocus>
            {t("addDrawer.discardConfirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DjangoAddAppointmentDrawer;
