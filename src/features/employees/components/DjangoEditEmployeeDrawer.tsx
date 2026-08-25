import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import NumbersOutlined from "@mui/icons-material/NumbersOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import { motion } from "framer-motion";
import { useNotification } from "@refinedev/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import DrawerBase from "./DrawerBase";
import {
  updateEmployee,
  getDjangoEmployee,
  uploadEmployeePhoto,
  uploadEmployeeElqr,
  deleteEmployeeElqr,
  getEmployeeServices,
  getBanks,
  assignEmployeeService,
  updateEmployeeService,
  type DjangoSpecializationShort,
  type DjangoEmployeeBranch,
  type EmployeeServiceAssignment,
  type DjangoBank,
} from "../../../api/staff";
import { getBranches } from "../../../api/organization";
import { getPublicFeatures } from "../../../api/publicBooking";
import { getServices, type Service } from "../../../api/catalog";
import { orgWide } from "../../../api/scope";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { getProducts, type DjangoProduct } from "../../../api/warehouse";
import {
  getEmployeeRule,
  putEmployeeRule,
  type EmployeeRule,
} from "../../../api/payroll";
import DjangoSalarySettings, {
  EMPTY_SALARY,
  ruleToSalaryValue,
  salaryValueToPayload,
  type SalarySettingsValue,
} from "./DjangoSalarySettings";
import type { EmployesRow } from "../types";
import { useCan } from "../../../hooks/useCan";
import { usePermissions } from "../../../hooks/usePermissions";
import { useT } from "../../../i18n/VerticalProvider";
import { CustomDatePicker, cascadeContainer, cascadeItem } from "../../../components/ui";
import { PhoneCountryCodeSelect } from "../../../components/ui/PhoneCountryCodeSelect";
import SpecializationBlock from "./SpecializationBlock";
import DocumentsBlock from "./DocumentsBlock";
import { SectionLabel, Field, Grid2, PhotoHero, ElqrUploader, StatusBadge } from "./drawerKit";
import {
  parsePhone,
  composePhone,
  formatPhoneLocalDisplay,
  getPhoneLocalMaxLength,
  handlePhonePaste,
  type PhoneCountryCode,
} from "../../../utility/phone";
import { usePhoneLocalInput } from "../../../hooks/usePhoneLocalInput";
import { capitalizeFullName } from "../../../utility/name";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../../../utility/formDraft";
import {
  validateFullName,
  validatePhoneLocal,
  validateEmail,
  validateBirthDate,
  validateTelegramId,
  validateInstagram,
  validateBankAccountNumber,
  validateInn,
  validateBik,
  validatePrepaymentAmount,
} from "../employeeValidation";

export type DjangoEditEmployeeDrawerProps = {
  record: EmployesRow | null;
  onClose: () => void;
  onUpdated: (updated: EmployesRow) => void;
};

const MotionStack = motion(Stack);
const MotionBox = motion(Box);

const isImageFile = (f: File | null) => Boolean(f && f.type.startsWith("image/"));
const isImageUrl = (u: string | null) =>
  Boolean(u && !/\.pdf($|\?)/i.test(u));

// Canonical string form of the salary value — lets us skip the PUT when the
// user never touched the salary block (avoids a needless write + request).
function serializeSalary(v: SalarySettingsValue): string {
  const num = (s: string) => String(Number(s.trim() || "0"));
  const rules = v.rules
    .map((r) => ({
      services: [...r.serviceIds].sort((a, b) => a - b),
      percent: num(r.percent),
      fixed: num(r.fixedAmount),
    }))
    .sort((a, b) => a.services.join(",").localeCompare(b.services.join(",")));
  const productRules = v.productRules
    .map((r) => ({
      products: [...r.productIds].sort((a, b) => a - b),
      percent: num(r.percent),
      fixed: num(r.fixedAmount),
    }))
    .sort((a, b) => a.products.join(",").localeCompare(b.products.join(",")));
  return JSON.stringify({
    enabled: v.enabled,
    night: num(v.nightRate),
    day: num(v.dayRate),
    appointment: num(v.appointmentRate),
    productEnabled: v.productEnabled,
    rules,
    productRules,
  });
}

/** «500.00» → «500» для поля ввода: хвостовые нули кассиру ни о чём не говорят. */
function decimalToInput(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(String(value).replace(",", "."));
  return isFinite(n) ? String(n) : String(value);
}

/** Поле ввода → decimal-строка бэка. Пустое поле при выключенной предоплате = 0. */
function inputToDecimal(value: string): string {
  const n = Number(value.trim().replace(",", "."));
  return isFinite(n) && n > 0 ? n.toFixed(2) : "0.00";
}

const serializeBranchIds = (list: DjangoEmployeeBranch[]) =>
  JSON.stringify(list.map((b) => b.id).sort((a, b) => a - b));

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Форма редактирования существующего сотрудника — поля стартуют не пустыми, а
// из загруженных данных сотрудника (baseline), поэтому черновик пишется, только
// если текущие значения отличаются от baseline (иначе «черновиком» считалась бы
// любая открытая карточка), а «Очистить» откатывает к baseline, а не к пустой
// форме. Ключ включает id сотрудника — черновик одного сотрудника не должен
// всплывать в форме другого. Услуги/зарплата/специализации/документы в черновик
// не входят — это отдельные сущности со своим собственным сохранением (услуги и
// зарплата диффятся против серверного baseline при сабмите, специализации и
// документы пишутся в API сразу же дочерними блоками). Фото/elQR — File, не
// сериализуется.

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type EditableDraftFields = {
  fullName: string;
  nickname: string;
  phoneCountry: PhoneCountryCode;
  phoneLocal: string;
  email: string;
  status: "active" | "inactive";
  clinicalRole: "doctor" | "nurse" | "other";
  onlineBookingEnabled: boolean;
  prepaymentRequired: boolean;
  prepaymentAmount: string;
  telegramId: string;
  instagram: string;
  birthDate: string;
  hiredAt: string;
  bankAccountNumber: string;
  inn: string;
  address: string;
  notes: string;
  bank: string;
  bik: string;
  operationalBranches: DjangoEmployeeBranch[];
};

type EditEmployeeDraft = EditableDraftFields & { savedAt: number };

function draftKeyFor(employeeId: number): string {
  return `mamadoc:employees:edit-draft:${employeeId}`;
}

function sameAsBaseline(a: EditableDraftFields, b: EditableDraftFields): boolean {
  return (
    a.fullName === b.fullName &&
    a.nickname === b.nickname &&
    a.phoneCountry === b.phoneCountry &&
    a.phoneLocal === b.phoneLocal &&
    a.email === b.email &&
    a.status === b.status &&
    a.clinicalRole === b.clinicalRole &&
    a.onlineBookingEnabled === b.onlineBookingEnabled &&
    a.prepaymentRequired === b.prepaymentRequired &&
    a.prepaymentAmount === b.prepaymentAmount &&
    a.telegramId === b.telegramId &&
    a.instagram === b.instagram &&
    a.birthDate === b.birthDate &&
    a.hiredAt === b.hiredAt &&
    a.bankAccountNumber === b.bankAccountNumber &&
    a.inn === b.inn &&
    a.address === b.address &&
    a.notes === b.notes &&
    a.bank === b.bank &&
    a.bik === b.bik &&
    serializeBranchIds(a.operationalBranches) === serializeBranchIds(b.operationalBranches)
  );
}

const DjangoEditEmployeeDrawer: React.FC<DjangoEditEmployeeDrawerProps> = ({
  record,
  onClose,
  onUpdated,
}) => {
  const { t } = useT("employees");
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();

  const canManagePrivate = useCan("staff.private.manage");
  const canViewSpecs = useCan("staff.specializations.view");
  const canManageSpecs = useCan("staff.specializations.manage");
  const canViewDocs = useCan("staff.documents.view");
  const canManageDocs = useCan("staff.documents.manage");
  // Привязка услуг к сотруднику. Кодов staff.services.* на бэке НЕ существует
  // (проверено по /api/rbac/permissions/ 29.07.2026) — гейт на них скрывал
  // секцию у всех, кроме суперюзера. Реальные права: каталог услуг —
  // catalog.view, изменение карточки сотрудника — staff.update. Тот же гейт,
  // что в EmployeeServicesDrawer, который ходит в те же эндпоинты
  // /staff/employees/{id}/services/.
  const canViewCatalog = useCan("catalog.view");
  const canUpdateStaff = useCan("staff.update");
  const canViewServices = canViewCatalog;
  const canManageServices = canViewCatalog && canUpdateStaff;
  const canViewPayroll = useCan("payroll.view");
  const canManagePayroll = useCan("payroll.manage");

  // ── Photo ─────────────────────────────────────────────────────────────────
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  // ── Basic fields ──────────────────────────────────────────────────────────
  const [fullName, setFullName] = React.useState("");
  const [nickname, setNickname] = React.useState("");
  const [phoneCountry, setPhoneCountry] = React.useState<PhoneCountryCode>("+996");
  const [phoneLocal, setPhoneLocal] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"active" | "inactive">("active");
  const [clinicalRole, setClinicalRole] = React.useState<"doctor" | "nurse" | "other">("other");
  // Видимость на витрине онлайн-записи. Дефолт true — как миграция бэка у врачей;
  // на окружении без поля сотрудник считается видимым (флаг ничего не скрывает).
  const [onlineBookingEnabled, setOnlineBookingEnabled] = React.useState(true);
  // Знает ли бэк это поле. Пока релиз брони не везде выложен: на окружении без
  // поля переключатель не показываем и в PATCH не шлём — неизвестное поле бэк
  // отклоняет вместе со всем запросом, и карточка перестала бы сохраняться.
  const [onlineBookingSupported, setOnlineBookingSupported] = React.useState(false);
  // Онлайн-предоплата: сумма своя у каждого врача (решение заказчика 23.08.2026),
  // орг-настройки нет. Флаг без положительной суммы бэк отклоняет (400) —
  // поэтому шлём их одним PATCH и блокируем сохранение до ввода суммы.
  const [prepaymentRequired, setPrepaymentRequired] = React.useState(false);
  const [prepaymentAmount, setPrepaymentAmount] = React.useState("");
  // Знает ли бэк пару полей — как с онлайн-записью: неизвестное поле в PATCH
  // отклоняет весь запрос, и карточка перестала бы сохраняться.
  const [prepaymentSupported, setPrepaymentSupported] = React.useState(false);
  const [telegramId, setTelegramId] = React.useState("");
  const [instagram, setInstagram] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [hiredAt, setHiredAt] = React.useState("");
  const [bankAccountNumber, setBankAccountNumber] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [bank, setBank] = React.useState("");
  const [bik, setBik] = React.useState("");
  const [banks, setBanks] = React.useState<DjangoBank[]>([]);
  const [elqrFile, setElqrFile] = React.useState<File | null>(null);
  const [elqrPreview, setElqrPreview] = React.useState<string | null>(null);
  const [elqrExisting, setElqrExisting] = React.useState<string | null>(null);
  const [specializations, setSpecializations] = React.useState<DjangoSpecializationShort[]>([]);

  // ── Черновик (localStorage) ─────────────────────────────────────────────────
  const [draftRestored, setDraftRestored] = React.useState(false);
  const baselineRef = React.useRef<EditableDraftFields | null>(null);

  // ── Операционные филиалы (карточка видна в каждом из набора) ──────────────
  const { activeBranch } = usePermissions();
  const orgId = useApiOrgId();
  // Набор меняется только из режима «все филиалы» — бэкенд в филиальном
  // контексте отклонит запрос.
  const branchScoped = activeBranch != null;
  const [allBranches, setAllBranches] = React.useState<DjangoEmployeeBranch[]>([]);
  const [operationalBranches, setOperationalBranches] = React.useState<DjangoEmployeeBranch[]>([]);
  // Исходный набор id — чтобы не слать поле, если его не трогали.
  const initialBranchIdsRef = React.useRef<string>("[]");

  // ── Services ──────────────────────────────────────────────────────────────
  const [allServices, setAllServices] = React.useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = React.useState(false);
  // Товары склада — для правил ЗП «Товары в приёмах» (недоступны без права —
  // тогда селект покажет «Товары недоступны», это не ошибка).
  const [allProducts, setAllProducts] = React.useState<DjangoProduct[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [assignments, setAssignments] = React.useState<EmployeeServiceAssignment[]>([]);
  const [selectedServices, setSelectedServices] = React.useState<Service[]>([]);

  // ── Salary ────────────────────────────────────────────────────────────────
  const [salaryLoading, setSalaryLoading] = React.useState(false);
  const [salary, setSalary] = React.useState<SalarySettingsValue>(EMPTY_SALARY);
  const initialSalaryRef = React.useRef<string>(serializeSalary(EMPTY_SALARY));

  // ── Form state ────────────────────────────────────────────────────────────
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  // Правка в середине номера не должна выбрасывать курсор в конец.
  const phoneInput = usePhoneLocalInput(
    phoneCountry,
    phoneLocal,
    (digits) => {
      setPhoneLocal(digits);
      setServerError(null);
    },
    setPhoneCountry,
  );

  /**
   * Включён ли Paylink у организации. Флаг предоплаты у врача сам по себе
   * ничего не даёт: пока `paylinkEnabled: false`, витрина отвечает на создание
   * брони «Онлайн-предоплата не настроена для этой организации» — то есть
   * записаться к такому врачу нельзя вовсе. Проверяем публичной ручкой (без
   * авторизации) и предупреждаем прямо в карточке.
   */
  const featuresQuery = useQuery({
    queryKey: ["public-booking", "features"],
    queryFn: ({ signal }) => getPublicFeatures(signal),
    enabled: prepaymentSupported,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const paylinkOff = featuresQuery.data?.paylinkEnabled === false;

  const errors = React.useMemo(
    () => ({
      fullName: validateFullName(fullName),
      phone: validatePhoneLocal(phoneLocal, phoneCountry),
      email: validateEmail(email),
      birthDate: validateBirthDate(birthDate),
      telegramId: validateTelegramId(telegramId),
      instagram: validateInstagram(instagram),
      bankAccountNumber: canManagePrivate ? validateBankAccountNumber(bankAccountNumber) : "",
      inn: canManagePrivate ? validateInn(inn) : "",
      bik: canManagePrivate ? validateBik(bik) : "",
      prepaymentAmount: validatePrepaymentAmount(prepaymentRequired, prepaymentAmount),
    }),
    [fullName, phoneLocal, phoneCountry, email, birthDate, telegramId, instagram, bankAccountNumber, inn, bik, canManagePrivate, prepaymentRequired, prepaymentAmount],
  );

  const hasErrors = Object.values(errors).some(Boolean);

  const showError = (field: string) =>
    touched[field] || submitAttempted ? errors[field as keyof typeof errors] : "";

  const touch = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  // ── Photo / elQR pick ───────────────────────────────────────────────────────
  const handlePickPhoto = React.useCallback((f: File | null) => {
    setPhotoFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(f);
    } else {
      setPhotoPreview(null);
    }
  }, []);

  const handlePickElqr = React.useCallback((f: File | null) => {
    setElqrFile(f);
    if (f && f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setElqrPreview(reader.result as string);
      reader.readAsDataURL(f);
    } else if (f) {
      setElqrPreview(null); // pdf — показываем как файл
    } else {
      setElqrPreview(null); // удаление
    }
  }, []);

  const handleBankChange = (name: string) => {
    setBank(name);
    const found = banks.find((b) => b.name === name);
    if (found) setBik(found.bik ?? "");
  };

  // ── Populate on open ──────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!record) return;

    const empId = Number(record.id);

    setPhotoFile(null);
    setPhotoPreview(record.photo_url || null);
    setFullName(record.full_name || "");
    setNickname(record.nickname || "");
    const parsed = parsePhone(record.phone || "");
    setPhoneCountry(parsed.countryCode);
    setPhoneLocal(parsed.local);
    setEmail(record.email || "");
    setStatus(record.status === "inactive" ? "inactive" : "active");
    setClinicalRole(
      record.clinicalRole === "doctor" || record.clinicalRole === "nurse"
        ? record.clinicalRole
        : "other",
    );
    setOnlineBookingEnabled(record.onlineBookingEnabled !== false);
    setOnlineBookingSupported(record.onlineBookingEnabled != null);
    setPrepaymentRequired(record.prepaymentRequired === true);
    setPrepaymentAmount(decimalToInput(record.prepaymentAmount));
    setPrepaymentSupported(record.prepaymentRequired != null);
    setTelegramId(record.telegram_id || "");
    setInstagram(record.instagram || "");
    setBirthDate(record.birth_date || "");
    setBankAccountNumber(record.bank_account_number || "");
    setInn(record.inn || "");
    setAddress(record.address || "");
    setNotes(record.notes || "");
    setBank(record.bank || "");
    setBik(record.bik || "");
    setElqrFile(null);
    setElqrExisting(record.elqr_url || null);
    setElqrPreview(record.elqr_url || null);
    setSpecializations(record._djangoSpecializations ?? []);
    setOperationalBranches(record._djangoOperationalBranches ?? []);
    initialBranchIdsRef.current = serializeBranchIds(record._djangoOperationalBranches ?? []);
    setServerError(null);
    setTouched({});
    setSubmitAttempted(false);
    setAssignments([]);
    setSelectedServices([]);
    setSalary(EMPTY_SALARY);
    initialSalaryRef.current = serializeSalary(EMPTY_SALARY);
    baselineRef.current = null;
    setDraftRestored(false);

    if (isNaN(empId) || empId <= 0) return;

    const ctrl = new AbortController();

    getDjangoEmployee(empId, ctrl.signal)
      .then((full) => {
        if (ctrl.signal.aborted) return;
        setPhotoPreview(full.photoUrl || null);
        setNickname(full.nickname || "");
        setTelegramId(full.telegramId || "");
        setInstagram(full.instagram || "");
        setBirthDate(full.birthDate || "");
        setHiredAt(full.hiredAt || "");
        setBankAccountNumber(full.bankAccountNumber || "");
        setInn(full.inn || "");
        setAddress(full.address || "");
        setNotes(full.notes || "");
        setBank(full.bank || "");
        setBik(full.bik || "");
        setElqrExisting(full.elqrUrl || null);
        setElqrPreview(full.elqrUrl || null);
        setClinicalRole(full.clinicalRole ?? "other");
        setOnlineBookingEnabled(full.onlineBookingEnabled !== false);
        setOnlineBookingSupported(full.onlineBookingEnabled != null);
        setPrepaymentRequired(full.prepaymentRequired === true);
        setPrepaymentAmount(decimalToInput(full.prepaymentAmount));
        setPrepaymentSupported(full.prepaymentRequired != null);
        setSpecializations(full.specializations ?? []);
        setOperationalBranches(full.operationalBranches ?? []);
        initialBranchIdsRef.current = serializeBranchIds(full.operationalBranches ?? []);
        const parsedFull = parsePhone(full.phone || "");
        setPhoneCountry(parsedFull.countryCode);
        setPhoneLocal(parsedFull.local);

        // Полностью загруженные данные — baseline для черновика. Затем, если
        // есть непросроченный черновик по этому сотруднику, применяем его
        // поверх baseline (восстановление несохранённого ввода).
        const baseline: EditableDraftFields = {
          fullName: record.full_name || "",
          nickname: full.nickname || "",
          phoneCountry: parsedFull.countryCode,
          phoneLocal: parsedFull.local,
          email: record.email || "",
          status: record.status === "inactive" ? "inactive" : "active",
          clinicalRole: full.clinicalRole ?? "other",
          onlineBookingEnabled: full.onlineBookingEnabled !== false,
          prepaymentRequired: full.prepaymentRequired === true,
          prepaymentAmount: decimalToInput(full.prepaymentAmount),
          telegramId: full.telegramId || "",
          instagram: full.instagram || "",
          birthDate: full.birthDate || "",
          hiredAt: full.hiredAt || "",
          bankAccountNumber: full.bankAccountNumber || "",
          inn: full.inn || "",
          address: full.address || "",
          notes: full.notes || "",
          bank: full.bank || "",
          bik: full.bik || "",
          operationalBranches: full.operationalBranches ?? [],
        };
        baselineRef.current = baseline;

        const draft = readFormDraft<EditEmployeeDraft>(draftKeyFor(empId), DRAFT_TTL_MS);
        if (draft) {
          setFullName(draft.fullName);
          setNickname(draft.nickname);
          setPhoneCountry(draft.phoneCountry);
          setPhoneLocal(draft.phoneLocal);
          setEmail(draft.email);
          setStatus(draft.status);
          setClinicalRole(draft.clinicalRole);
          // Черновик мог быть записан до появления поля — тогда считаем врача видимым.
          setOnlineBookingEnabled(draft.onlineBookingEnabled !== false);
          // Черновик мог быть записан до появления полей предоплаты.
          setPrepaymentRequired(draft.prepaymentRequired === true);
          setPrepaymentAmount(draft.prepaymentAmount ?? "");
          setTelegramId(draft.telegramId);
          setInstagram(draft.instagram);
          setBirthDate(draft.birthDate);
          setHiredAt(draft.hiredAt);
          setBankAccountNumber(draft.bankAccountNumber);
          setInn(draft.inn);
          setAddress(draft.address);
          setNotes(draft.notes);
          setBank(draft.bank);
          setBik(draft.bik);
          setOperationalBranches(draft.operationalBranches);
          setDraftRestored(true);
        } else {
          setDraftRestored(false);
        }
      })
      .catch((e) => {
        if ((e as Error)?.name !== "AbortError")
          console.warn("Could not fetch full employee:", e);
      });

    // Справочник банков (для выбора банка → подстановки БИК)
    if (canManagePrivate) {
      getBanks(ctrl.signal)
        .then((b) => { if (!ctrl.signal.aborted) setBanks(b); })
        .catch(() => {});
    }

    // Справочник филиалов организации — для набора операционных доступов.
    // orgId обязателен: без него суперюзеру/мультиорг-пользователю в список
    // попадают филиалы чужих организаций (см. getBranches).
    getBranches(orgId)
      .then((list) => {
        if (!ctrl.signal.aborted) {
          setAllBranches(list.map((b) => ({ id: b.id, name: b.name })));
        }
      })
      .catch(() => {});

    const needServices = canViewServices || canManageServices || canViewPayroll;
    const servicesPromise: Promise<Service[]> = needServices
      ? getServices(orgWide(orgId), undefined, ctrl.signal)
      : Promise.resolve([]);

    if (canViewServices || canManageServices) {
      setServicesLoading(true);
      Promise.all([
        servicesPromise,
        getEmployeeServices(empId, ctrl.signal, { includeInactive: true }),
      ])
        .then(([svcList, asgList]) => {
          if (ctrl.signal.aborted) return;
          const active = svcList.filter((s) => s.isActive);
          setAllServices(active);
          setAssignments(asgList);
          const assignedIds = new Set(
            asgList.filter((a) => a.isActive).map((a) => a.service.id),
          );
          setSelectedServices(active.filter((s) => assignedIds.has(s.id)));
        })
        .catch((e) => {
          if ((e as Error)?.name !== "AbortError")
            console.warn("Could not fetch services:", e);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setServicesLoading(false);
        });
    } else if (canViewPayroll) {
      servicesPromise
        .then((svcList) => {
          if (!ctrl.signal.aborted)
            setAllServices(svcList.filter((s) => s.isActive));
        })
        .catch(() => {});
    }

    if (canViewPayroll) {
      // Товары для правил «Товары в приёмах» (при отсутствии права — пусто).
      setProductsLoading(true);
      getProducts(ctrl.signal, { organizationId: orgId })
        .then((list) => {
          if (!ctrl.signal.aborted)
            setAllProducts(list.filter((p) => p.isActive !== false));
        })
        .catch(() => {})
        .finally(() => {
          if (!ctrl.signal.aborted) setProductsLoading(false);
        });

      setSalaryLoading(true);
      getEmployeeRule(empId, ctrl.signal)
        .then((rule: EmployeeRule) => {
          if (ctrl.signal.aborted) return;
          const value = ruleToSalaryValue(rule);
          setSalary(value);
          initialSalaryRef.current = serializeSalary(value);
        })
        .catch((e) => {
          if ((e as Error)?.name !== "AbortError")
            console.warn("Could not fetch salary rule:", e);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setSalaryLoading(false);
        });
    }

    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  // ── сохранение черновика в localStorage (защита от случайного закрытия) ────
  // flushDraftRef всегда указывает на актуальный снэпшот полей — нужен, чтобы
  // при закрытии до истечения debounce (быстрый ввод + сразу закрыть) успеть
  // синхронно записать черновик, а не потерять его вместе с отменённым таймером.
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    if (!record) return;
    const empId = Number(record.id);
    if (isNaN(empId) || empId <= 0) return;
    if (!baselineRef.current) return; // ждём загрузки baseline

    const current: EditableDraftFields = {
      fullName,
      nickname,
      phoneCountry,
      phoneLocal,
      email,
      status,
      clinicalRole,
      onlineBookingEnabled,
      prepaymentRequired,
      prepaymentAmount,
      telegramId,
      instagram,
      birthDate,
      hiredAt,
      bankAccountNumber,
      inn,
      address,
      notes,
      bank,
      bik,
      operationalBranches,
    };
    const key = draftKeyFor(empId);
    if (baselineRef.current && sameAsBaseline(current, baselineRef.current)) {
      clearFormDraft(key);
    } else {
      writeFormDraft(key, current);
    }
  };

  React.useEffect(() => {
    if (!record) return;
    const empId = Number(record.id);
    if (isNaN(empId) || empId <= 0) return;
    if (!baselineRef.current) return; // ждём загрузки baseline
    const id = setTimeout(() => flushDraftRef.current(), 400);
    return () => clearTimeout(id);
  }, [
    record, fullName, nickname, phoneCountry, phoneLocal, email, status, clinicalRole,
    onlineBookingEnabled, prepaymentRequired, prepaymentAmount, telegramId, instagram, birthDate, hiredAt, bankAccountNumber,
    inn, address, notes, bank, bik, operationalBranches,
  ]);

  const handleClose = () => {
    flushDraftRef.current();
    onClose();
  };

  const handleDiscardDraft = () => {
    if (!record) return;
    const empId = Number(record.id);
    if (!isNaN(empId) && empId > 0) clearFormDraft(draftKeyFor(empId));
    const b = baselineRef.current;
    if (b) {
      setFullName(b.fullName);
      setNickname(b.nickname);
      setPhoneCountry(b.phoneCountry);
      setPhoneLocal(b.phoneLocal);
      setEmail(b.email);
      setStatus(b.status);
      setClinicalRole(b.clinicalRole);
      setOnlineBookingEnabled(b.onlineBookingEnabled);
      setPrepaymentRequired(b.prepaymentRequired);
      setPrepaymentAmount(b.prepaymentAmount);
      setTelegramId(b.telegramId);
      setInstagram(b.instagram);
      setBirthDate(b.birthDate);
      setHiredAt(b.hiredAt);
      setBankAccountNumber(b.bankAccountNumber);
      setInn(b.inn);
      setAddress(b.address);
      setNotes(b.notes);
      setBank(b.bank);
      setBik(b.bik);
      setOperationalBranches(b.operationalBranches);
    }
    setDraftRestored(false);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (hasErrors) return;
    if (!record) return;
    const empId = Number(record.id);
    if (isNaN(empId) || empId <= 0) return;

    setBusy(true);
    setServerError(null);

    try {
      // 1. Update basic fields
      await updateEmployee(empId, {
        // Повторно нормализуем: отправить можно по Enter, не уходя из поля.
        fullName: capitalizeFullName(fullName),
        nickname: nickname.trim() || null,
        phone: composePhone(phoneCountry, phoneLocal),
        email: email.trim() || null,
        status,
        clinicalRole,
        // Только если бэк знает поле (см. onlineBookingSupported).
        ...(onlineBookingSupported && { onlineBookingEnabled }),
        // Флаг и сумму бэк проверяет парой: `true` без положительной суммы → 400.
        ...(prepaymentSupported && {
          prepaymentRequired,
          prepaymentAmount: inputToDecimal(prepaymentAmount),
        }),
        telegramId: telegramId.trim() || null,
        instagram: instagram.trim().replace(/^@/, "") || null,
        notes: notes.trim() || null,
        birthDate: birthDate || null,
        hiredAt: hiredAt || null,
        ...(canManagePrivate && {
          bankAccountNumber: bankAccountNumber.trim() || null,
          inn: inn.trim() || null,
          address: address.trim() || null,
          bank: bank.trim() || null,
          bik: bik.trim() || null,
        }),
        // Набор операционных филиалов шлём только при изменении: в режиме
        // конкретного филиала бэкенд отклоняет это поле целиком.
        ...(serializeBranchIds(operationalBranches) !== initialBranchIdsRef.current && {
          employeeBranchIds: operationalBranches.map((b) => b.id),
        }),
      });

      // 2. Photo
      if (photoFile) {
        try {
          await uploadEmployeePhoto(empId, photoFile);
        } catch {
          notify?.({ type: "error", message: "Данные сохранены, но фото не удалось загрузить" });
        }
      }

      // 2b. elQR — загрузка нового / удаление снятого
      if (canManagePrivate) {
        if (elqrFile) {
          try {
            await uploadEmployeeElqr(empId, elqrFile);
          } catch {
            notify?.({ type: "error", message: "Данные сохранены, но elQR не удалось загрузить" });
          }
        } else if (elqrExisting && !elqrPreview) {
          try {
            await deleteEmployeeElqr(empId);
          } catch {
            /* не критично */
          }
        }
      }

      // 3. Services — diff: deactivate removed, activate/add new
      if (canManageServices) {
        const selectedIds = new Set(selectedServices.map((s) => s.id));
        const assignedActiveIds = new Set(
          assignments.filter((a) => a.isActive).map((a) => a.service.id),
        );

        // Ошибки привязки нельзя глотать молча: при 403 (роли не выдано право
        // на эндпоинт) пользователь иначе видит «Сохранено», а услуги не
        // изменились.
        let servicesFailed = 0;

        for (const a of assignments) {
          if (a.isActive && !selectedIds.has(a.service.id)) {
            try {
              await updateEmployeeService(empId, a.id, { isActive: false });
            } catch (e) {
              servicesFailed += 1;
              console.warn("Could not deactivate service assignment:", e);
            }
          }
        }

        for (const svc of selectedServices) {
          if (!assignedActiveIds.has(svc.id)) {
            const existing = assignments.find((a) => a.service.id === svc.id);
            if (existing) {
              try {
                await updateEmployeeService(empId, existing.id, { isActive: true });
              } catch (e) {
                servicesFailed += 1;
                console.warn("Could not reactivate service assignment:", e);
              }
            } else {
              try {
                await assignEmployeeService(empId, { serviceId: svc.id });
              } catch (e) {
                servicesFailed += 1;
                console.warn("Could not assign service:", e);
              }
            }
          }
        }

        if (servicesFailed > 0) {
          notify?.({
            type: "error",
            message: "Данные сохранены, но услуги сотрудника не удалось обновить",
          });
        }

        // Справочники формы приёма (исполнители + матрица услуга↔сотрудник)
        // кэшируются на 10 минут — без инвалидации изменённые привязки не
        // попадут в форму создания приёма до перезагрузки страницы.
        void queryClient.invalidateQueries({
          queryKey: ["django", "appointments", "form-data"],
        });
      }

      // 4. Salary rules — only when actually changed (skip the needless PUT).
      if (
        canManagePayroll &&
        serializeSalary(salary) !== initialSalaryRef.current
      ) {
        try {
          await putEmployeeRule(empId, salaryValueToPayload(salary));
          initialSalaryRef.current = serializeSalary(salary);
        } catch (e) {
          console.warn("Could not save salary rule:", e);
          notify?.({ type: "error", message: "Данные сохранены, но правила ЗП не удалось обновить" });
        }
      }

      // 5. Reload updated record
      const updated = await getDjangoEmployee(empId);

      const updatedRow: EmployesRow = {
        ...record,
        full_name: updated.fullName,
        nickname: updated.nickname || null,
        phone: updated.phone || null,
        email: updated.email || null,
        status: updated.status,
        telegram_id: updated.telegramId || null,
        instagram: updated.instagram || null,
        birth_date: updated.birthDate || null,
        bank_account_number: updated.bankAccountNumber || null,
        inn: updated.inn || null,
        address: updated.address || null,
        notes: updated.notes || null,
        bank: updated.bank || null,
        bik: updated.bik || null,
        elqr_url: updated.elqrUrl || null,
        photo_url: updated.photoUrl || null,
        role_id: updated.role ? String(updated.role.id) : null,
        clinicalRole: updated.clinicalRole ?? "other",
        onlineBookingEnabled: updated.onlineBookingEnabled ?? null,
        prepaymentRequired: updated.prepaymentRequired ?? null,
        prepaymentAmount: updated.prepaymentAmount ?? null,
        updated_at: updated.updatedAt,
        _djangoRole: updated.role ?? null,
        _djangoSpecializations: updated.specializations ?? [],
        _djangoOperationalBranches: updated.operationalBranches ?? [],
        _fullDetailsLoaded: true,
      };

      clearFormDraft(draftKeyFor(empId));
      notify?.({ type: "success", message: "Данные сотрудника обновлены" });
      onUpdated(updatedRow);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Не удалось сохранить изменения";
      setServerError(msg);
    } finally {
      setBusy(false);
    }
  };

  const open = Boolean(record);

  const inactiveAssignments = React.useMemo(
    () => assignments.filter((a) => !a.isActive),
    [assignments],
  );

  const elqrIsImage = elqrFile ? isImageFile(elqrFile) : isImageUrl(elqrPreview);

  // «Врач» — по роли доступа (её видно в группировке списка) или по клиническому
  // типу; поля независимы, поэтому учитываем оба.
  const isDoctor =
    record?._djangoRole?.code === "doctor" || clinicalRole === "doctor";

  // Для врачей в правилах ЗП показываем только услуги, закреплённые за врачом
  // (живой выбор из вкладки «Услуги»). Дополнительно оставляем услуги, уже
  // упомянутые в правилах, — чтобы их имена/чипы отображались и правило можно
  // было отредактировать, даже если услугу открепили. Ограничение применяем
  // лишь когда привязки услуг реально загружены (есть право на их просмотр).
  const salaryServices = React.useMemo(() => {
    const restrictToAssigned =
      isDoctor && (canViewServices || canManageServices);
    if (!restrictToAssigned) return allServices;
    const referencedIds = new Set(salary.rules.flatMap((r) => r.serviceIds));
    const selectedIds = new Set(selectedServices.map((s) => s.id));
    const extras = allServices.filter(
      (s) => referencedIds.has(s.id) && !selectedIds.has(s.id),
    );
    return [...selectedServices, ...extras];
  }, [isDoctor, canViewServices, canManageServices, allServices, selectedServices, salary.rules]);

  // Подсказка врачу без закреплённых услуг: правила ЗП по услугам применять не к чему.
  const salaryServicesHint =
    isDoctor &&
    (canViewServices || canManageServices) &&
    selectedServices.length === 0
      ? t("clinicalRole.doctorNoServicesHint")
      : undefined;

  return (
    <DrawerBase
      open={open}
      title="Редактирование"
      onClose={handleClose}
      busy={busy}
      onSubmit={handleSubmit}
      submitLabel="Сохранить"
      submitDisabled={submitAttempted && hasErrors}
      headerExtra={
        draftRestored ? (
          <Tooltip title="Черновик восстановлен — очистить?">
            <IconButton onClick={handleDiscardDraft} aria-label="Очистить черновик">
              <RestoreOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : undefined
      }
    >
      <MotionStack spacing={2.5} variants={cascadeContainer} initial="hidden" animate="show">
        {serverError && <Alert severity="error">{serverError}</Alert>}

        {/* ── Личная информация ── */}
        <MotionBox variants={cascadeItem}>
          <Stack spacing={2.5}>
            <SectionLabel title="Личная информация" />
            <PhotoHero
              photoPreview={photoPreview}
              name={fullName}
              inputId="edit-employee-photo"
              onPickPhoto={handlePickPhoto}
              disabled={busy}
              footer={
                <Stack spacing={1.75}>
                  <Grid2>
                    <Field label="Дата рождения">
                      <CustomDatePicker
                        value={birthDate ? dayjs(birthDate) : null}
                        onChange={(val) => {
                          setBirthDate(val ? val.format("YYYY-MM-DD") : "");
                          touch("birthDate");
                        }}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            size: "small",
                            InputLabelProps: { shrink: true },
                            placeholder: "дд.мм.гг",
                            disabled: busy,
                            // Enter сохраняет, как в остальных полях; короткий год
                            // перехватит CustomDatePicker и допишет век.
                            onKeyDown: submitOnEnter,
                            onBlur: () => touch("birthDate"),
                            error: Boolean(showError("birthDate")),
                            helperText: showError("birthDate"),
                          },
                        }}
                      />
                    </Field>
                    {canManagePrivate && (
                      <Field label="ИНН">
                        <TextField
                          value={inn}
                          onChange={(e) => { setInn(e.target.value.replace(/\D/g, "").slice(0, 14)); setServerError(null); }}
                          onBlur={() => touch("inn")}
                          onKeyDown={submitOnEnter}
                          fullWidth
                          size="small"
                          placeholder="00000000000000"
                          disabled={busy}
                          inputProps={{ inputMode: "numeric" }}
                          error={Boolean(showError("inn"))}
                          helperText={showError("inn")}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <NumbersOutlined fontSize="small" color="disabled" />
                              </InputAdornment>
                            ),
                            endAdornment: !errors.inn && inn.length === 14 ? (
                              <InputAdornment position="end">
                                <CheckCircleOutlined fontSize="small" color="success" />
                              </InputAdornment>
                            ) : undefined,
                          }}
                        />
                      </Field>
                    )}
                  </Grid2>
                  <Grid2>
                    <Field label="Дата приёма на работу">
                      <CustomDatePicker
                        value={hiredAt ? dayjs(hiredAt) : null}
                        onChange={(val) => setHiredAt(val ? val.format("YYYY-MM-DD") : "")}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            size: "small",
                            InputLabelProps: { shrink: true },
                            placeholder: "дд.мм.гг",
                            disabled: busy,
                            onKeyDown: submitOnEnter,
                          },
                        }}
                      />
                    </Field>
                  </Grid2>
                  <Field label="Описание">
                    <TextField
                      value={notes}
                      onChange={(e) => { setNotes(e.target.value); setServerError(null); }}
                      fullWidth
                      size="small"
                      multiline
                      minRows={2}
                      placeholder="Короткое описание сотрудника"
                      disabled={busy}
                      inputProps={{ maxLength: 500 }}
                    />
                  </Field>
                  {canManagePrivate && (
                    <Field label="Адрес проживания">
                      <TextField
                        value={address}
                        onChange={(e) => { setAddress(e.target.value); setServerError(null); }}
                        fullWidth
                        size="small"
                        placeholder="Город, улица, дом, кв."
                        disabled={busy}
                        inputProps={{ maxLength: 255 }}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <PlaceOutlined fontSize="small" color="disabled" />
                            </InputAdornment>
                          ),
                        }}
                      />
                    </Field>
                  )}
                </Stack>
              }
            >
              <Field label="ФИО" required>
                <TextField
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setServerError(null); }}
                  onBlur={() => {
                    setFullName(capitalizeFullName(fullName));
                    touch("fullName");
                  }}
                  onKeyDown={submitOnEnter}
                  required
                  fullWidth
                  size="small"
                  placeholder="Иванов Иван Иванович"
                  disabled={busy}
                  error={Boolean(showError("fullName"))}
                  helperText={showError("fullName")}
                  inputProps={{ maxLength: 255 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonOutlineOutlined fontSize="small" color="disabled" />
                      </InputAdornment>
                    ),
                    endAdornment: !errors.fullName && fullName.trim() ? (
                      <InputAdornment position="end">
                        <CheckCircleOutlined fontSize="small" color="success" />
                      </InputAdornment>
                    ) : undefined,
                  }}
                />
              </Field>
              <Field label="Псевдоним">
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    onKeyDown={submitOnEnter}
                    fullWidth
                    size="small"
                    placeholder="Как в расписании"
                    disabled={busy}
                    inputProps={{ maxLength: 100 }}
                  />
                  <Box sx={{ flexShrink: 0 }}>
                    <StatusBadge
                      value={status}
                      onChange={setStatus}
                      options={["active", "inactive"]}
                      disabled={busy}
                    />
                  </Box>
                </Stack>
              </Field>
            </PhotoHero>
          </Stack>
        </MotionBox>

        {/* ── Контакты ── */}
        <MotionBox variants={cascadeItem}>
          <Stack spacing={2.5}>
            <SectionLabel title="Контакты" />

            <Field label="Телефон">
              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                <PhoneCountryCodeSelect
                  value={phoneCountry}
                  onChange={(code) => { setPhoneCountry(code); setPhoneLocal(""); }}
                  disabled={busy}
                />
                <TextField
                  value={formatPhoneLocalDisplay(phoneCountry, phoneLocal)}
                  inputRef={phoneInput.inputRef}
                  onChange={phoneInput.onChange}
                  onPaste={(e) =>
                    handlePhonePaste(e, phoneCountry, (code, local) => {
                      setPhoneCountry(code);
                      setPhoneLocal(local);
                      setServerError(null);
                    })
                  }
                  onBlur={() => touch("phone")}
                  onKeyDown={(e) => {
                    phoneInput.onKeyDown(e);
                    submitOnEnter(e);
                  }}
                  fullWidth
                  size="small"
                  placeholder={getPhoneLocalMaxLength(phoneCountry) === 10 ? "XXX XXX XXXX" : "XXX XXX XXX"}
                  disabled={busy}
                  inputProps={{ inputMode: "tel", pattern: "[0-9]*" }}
                  error={Boolean(showError("phone"))}
                  helperText={showError("phone")}
                />
              </Box>
            </Field>

            <Field label="Email">
              <TextField
                value={email}
                onChange={(e) => { setEmail(e.target.value); setServerError(null); }}
                onBlur={() => touch("email")}
                onKeyDown={submitOnEnter}
                fullWidth
                size="small"
                placeholder="example@mail.com"
                type="email"
                disabled={busy}
                error={Boolean(showError("email") && !showError("email")?.startsWith("Опечатка"))}
                helperText={showError("email")}
                FormHelperTextProps={{
                  sx: showError("email")?.startsWith("Опечатка") ? { color: "warning.main" } : undefined,
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailOutlined fontSize="small" color="disabled" />
                    </InputAdornment>
                  ),
                  endAdornment: !errors.email && email.trim() ? (
                    <InputAdornment position="end">
                      <CheckCircleOutlined fontSize="small" color="success" />
                    </InputAdornment>
                  ) : undefined,
                }}
              />
            </Field>

            <Grid2>
              <Field label="Telegram ID">
                <TextField
                  value={telegramId}
                  onChange={(e) => { setTelegramId(e.target.value.replace(/\D/g, "").slice(0, 20)); setServerError(null); }}
                  onBlur={() => touch("telegramId")}
                  onKeyDown={submitOnEnter}
                  fullWidth
                  size="small"
                  placeholder="Числовой ID"
                  disabled={busy}
                  inputProps={{ inputMode: "numeric" }}
                  error={Boolean(showError("telegramId"))}
                  helperText={showError("telegramId")}
                />
              </Field>
              <Field label="Instagram">
                <TextField
                  value={instagram}
                  onChange={(e) => { setInstagram(e.target.value); setServerError(null); }}
                  onBlur={() => touch("instagram")}
                  onKeyDown={submitOnEnter}
                  fullWidth
                  size="small"
                  placeholder="username"
                  disabled={busy}
                  InputProps={{ startAdornment: <InputAdornment position="start">@</InputAdornment> }}
                  error={Boolean(showError("instagram"))}
                  helperText={showError("instagram")}
                />
              </Field>
            </Grid2>
          </Stack>
        </MotionBox>

        {/* ── Реквизиты (под staff.private.manage) ── */}
        {canManagePrivate && (
          <MotionBox variants={cascadeItem}>
            <Stack spacing={2.5}>
              <SectionLabel
                title="Реквизиты"
                trailing={
                  <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: "text.disabled" }}>
                    <LockOutlined sx={{ fontSize: 13 }} />
                    <Box component="span" sx={{ fontSize: "0.68rem" }}>приватно</Box>
                  </Stack>
                }
              />
              <Field label="Банк">
                <TextField
                  select
                  value={bank}
                  onChange={(e) => handleBankChange(e.target.value)}
                  fullWidth
                  size="small"
                  disabled={busy}
                  SelectProps={{ displayEmpty: true }}
                  helperText={
                    banks.length === 0
                      ? "Справочник пуст — добавьте банки в Настройки → Банки"
                      : undefined
                  }
                >
                  <MenuItem value="">
                    <Box component="span" sx={{ color: "text.disabled" }}>Не выбран</Box>
                  </MenuItem>
                  {bank && !banks.some((b) => b.name === bank) && (
                    <MenuItem value={bank}>{bank}</MenuItem>
                  )}
                  {banks.map((b) => (
                    <MenuItem key={b.id} value={b.name}>{b.name}</MenuItem>
                  ))}
                </TextField>
              </Field>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 2fr" } }}>
                <Field label="БИК">
                  <TextField
                    value={bik}
                    onChange={(e) => setBik(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onBlur={() => touch("bik")}
                    onKeyDown={submitOnEnter}
                    fullWidth
                    size="small"
                    placeholder="000000"
                    disabled={busy}
                    inputProps={{ inputMode: "numeric" }}
                    error={Boolean(showError("bik"))}
                    helperText={showError("bik")}
                    InputProps={{
                      endAdornment: !errors.bik && bik.length === 6 ? (
                        <InputAdornment position="end">
                          <CheckCircleOutlined fontSize="small" color="success" />
                        </InputAdornment>
                      ) : undefined,
                    }}
                  />
                </Field>
                <Field label="Расчётный счёт">
                  <TextField
                    value={bankAccountNumber}
                    onChange={(e) => { setBankAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 16)); setServerError(null); }}
                    onBlur={() => touch("bankAccountNumber")}
                    onKeyDown={submitOnEnter}
                    fullWidth
                    size="small"
                    placeholder="0000000000000000"
                    disabled={busy}
                    inputProps={{ inputMode: "numeric" }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <CreditCardOutlined fontSize="small" />
                        </InputAdornment>
                      ),
                      endAdornment: !errors.bankAccountNumber && bankAccountNumber.length === 16 ? (
                        <InputAdornment position="end">
                          <CheckCircleOutlined fontSize="small" color="success" />
                        </InputAdornment>
                      ) : undefined,
                    }}
                    error={Boolean(showError("bankAccountNumber"))}
                    helperText={showError("bankAccountNumber") || `${bankAccountNumber.length}/16`}
                  />
                </Field>
              </Box>
              <Field label="elQR (реквизиты QR)">
                <ElqrUploader
                  previewUrl={elqrPreview}
                  isImage={elqrIsImage}
                  fileName={elqrFile?.name ?? (elqrPreview ? "elQR" : null)}
                  inputId="edit-employee-elqr"
                  onPick={handlePickElqr}
                  onRemove={() => handlePickElqr(null)}
                  disabled={busy}
                />
              </Field>
            </Stack>
          </MotionBox>
        )}

        {/* ── Тип сотрудника ── */}
        <MotionBox variants={cascadeItem}>
          <Stack spacing={2.5}>
            <SectionLabel title="Тип сотрудника" />

            <Field label="Тип" hint="Клинический тип — влияет на расписание и специализации">
              <TextField
                select
                value={clinicalRole}
                onChange={(e) => setClinicalRole(e.target.value as "doctor" | "nurse" | "other")}
                fullWidth
                size="small"
                disabled={busy}
              >
                <MenuItem value="doctor">{t("clinicalRole.doctor")}</MenuItem>
                <MenuItem value="nurse">{t("clinicalRole.nurse")}</MenuItem>
                <MenuItem value="other">{t("clinicalRole.other")}</MenuItem>
              </TextField>
            </Field>

            {/* Видимость на публичной витрине /book. Показываем только врачам:
                бэк отдаёт публично лишь clinical_role="doctor", у остальных флаг
                ничего не изменил бы. Скрытый врач пропадает и из списка, и по
                прямой ссылке (404). */}
            {onlineBookingSupported && clinicalRole === "doctor" && (
              <Paper
                elevation={0}
                variant="outlined"
                sx={{
                  p: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                }}
              >
                <Stack spacing={0.25}>
                  <Typography variant="body2">Онлайн-запись</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Показывать врача на сайте записи. Нужна хотя бы одна услуга с
                    включённой онлайн-записью — иначе врача не покажем.
                  </Typography>
                </Stack>
                <Switch
                  checked={onlineBookingEnabled}
                  onChange={(e) => setOnlineBookingEnabled(e.target.checked)}
                  disabled={busy}
                />
              </Paper>
            )}

            {/* Онлайн-предоплата этого врача. Сумма своя у каждого врача, а не
                общая на организацию (решение заказчика 23.08.2026), поэтому
                настраивается здесь, а не в настройках клиники. Флаг без суммы
                бэк отклоняет — сумму спрашиваем сразу под переключателем. */}
            {prepaymentSupported && clinicalRole === "doctor" && (
              <Paper elevation={0} variant="outlined" sx={{ p: 1 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  gap={1}
                >
                  <Stack spacing={0.25}>
                    <Typography variant="body2">Предоплата при записи</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Пациент оплачивает бронь картой, деньги попадают в оплату
                      {" "}приёма. Без оплаты бронь не подтверждается.
                    </Typography>
                  </Stack>
                  <Switch
                    checked={prepaymentRequired}
                    onChange={(e) => {
                      setPrepaymentRequired(e.target.checked);
                      touch("prepaymentAmount");
                    }}
                    disabled={busy}
                  />
                </Stack>
                {prepaymentRequired && paylinkOff && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    Онлайн-предоплата не подключена для организации — записаться
                    к этому врачу через сайт не получится, пока её не включат.
                  </Alert>
                )}
                {prepaymentRequired && (
                  <Box sx={{ mt: 1 }}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Сумма предоплаты"
                      value={prepaymentAmount}
                      onChange={(e) => setPrepaymentAmount(e.target.value)}
                      onBlur={() => touch("prepaymentAmount")}
                      onKeyDown={submitOnEnter}
                      disabled={busy}
                      error={Boolean(showError("prepaymentAmount"))}
                      helperText={showError("prepaymentAmount") || "Например, 500"}
                      inputProps={{ inputMode: "decimal" }}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">сом</InputAdornment>,
                      }}
                    />
                  </Box>
                )}
              </Paper>
            )}

            {/* ── Операционные филиалы ── */}
            <Field
              label="Филиалы (операционно)"
              hint={
                branchScoped
                  ? "Меняется только в режиме «все филиалы»"
                  : "Где сотрудник принимает — карточка видна в каждом из этих филиалов"
              }
            >
              <Autocomplete
                multiple
                size="small"
                options={allBranches}
                value={operationalBranches}
                disableCloseOnSelect
                disabled={busy || branchScoped}
                getOptionLabel={(b) => b.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                onChange={(_, v) => setOperationalBranches(v)}
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
                    placeholder={operationalBranches.length === 0 ? "Только основной филиал" : undefined}
                  />
                )}
              />
            </Field>
          </Stack>
        </MotionBox>

        {/* ── Специализации (только для врача) ── */}
        {clinicalRole === "doctor" && (canViewSpecs || canManageSpecs) && record && (
          <MotionBox variants={cascadeItem}>
            <SpecializationBlock
              employeeId={Number(record.id)}
              currentSpecializations={specializations}
              onSpecializationsChange={setSpecializations}
              canView={canViewSpecs}
              canManage={canManageSpecs}
              disabled={busy}
            />
          </MotionBox>
        )}

        {/* ── Услуги ── */}
        {(canViewServices || canManageServices) && (
          <MotionBox variants={cascadeItem}>
            <Stack spacing={2.5}>
              <SectionLabel title="Услуги" />
              <Field label="Услуги сотрудника">
                <Autocomplete
                  multiple
                  size="small"
                  limitTags={3}
                  loading={servicesLoading}
                  options={allServices}
                  value={selectedServices}
                  disableCloseOnSelect
                  disabled={!canManageServices || busy}
                  getOptionLabel={(s) =>
                    s.basePrice ? `${s.name} (${Number(s.basePrice)} с)` : s.name
                  }
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  onChange={(_, newVal) => setSelectedServices(newVal)}
                  renderOption={(props, option, { selected }) => (
                    <li {...props}>
                      <Checkbox
                        icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                        checkedIcon={<CheckBoxIcon fontSize="small" />}
                        style={{ marginRight: 8 }}
                        checked={selected}
                      />
                      {option.name}
                      {option.basePrice ? ` (${Number(option.basePrice)} с)` : ""}
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField {...params} placeholder={canManageServices ? "Выберите услуги" : ""} />
                  )}
                />
              </Field>

              {inactiveAssignments.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Неактивные услуги
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.5}>
                    {inactiveAssignments.map((a) => (
                      <Chip
                        key={a.id}
                        label={a.service.name}
                        size="small"
                        variant="outlined"
                        color="default"
                        sx={{
                          opacity: 0.7,
                          textDecoration: "line-through",
                          textDecorationColor: "text.disabled",
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          </MotionBox>
        )}

        {/* ── Зарплата ── */}
        {canViewPayroll && (
          <MotionBox variants={cascadeItem}>
            <Stack spacing={2.5}>
              <SectionLabel title="Зарплата" />
              <Box
                sx={{
                  bgcolor: "action.hover",
                  p: 2,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                {salaryLoading ? (
                  <Stack alignItems="center" py={3}>
                    <CircularProgress size={24} />
                  </Stack>
                ) : (
                  <DjangoSalarySettings
                    value={salary}
                    onChange={setSalary}
                    services={salaryServices}
                    servicesHint={salaryServicesHint}
                    loadingServices={salaryLoading}
                    products={allProducts}
                    loadingProducts={productsLoading}
                    disabled={busy || !canManagePayroll}
                  />
                )}
              </Box>
            </Stack>
          </MotionBox>
        )}

        {/* ── Документы / паспортные фото ── */}
        {(canViewDocs || canManageDocs) && record && (
          <MotionBox variants={cascadeItem}>
            <Stack spacing={2.5}>
              <SectionLabel title="Документы" />
              <DocumentsBlock
                employeeId={Number(record.id)}
                canView={canViewDocs}
                canManage={canManageDocs}
                disabled={busy}
              />
            </Stack>
          </MotionBox>
        )}
      </MotionStack>
    </DrawerBase>
  );
};

export default DjangoEditEmployeeDrawer;
