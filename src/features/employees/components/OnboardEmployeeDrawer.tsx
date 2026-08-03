import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
} from "@mui/material";
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
import dayjs from "dayjs";

import DrawerBase from "./DrawerBase";
import {
  onboardEmployee,
  uploadEmployeePhoto,
  uploadEmployeeElqr,
  getDjangoEmployee,
  getSpecializations,
  getBanks,
  type OnboardEmployeeResponse,
  type DjangoSpecialization,
  type DjangoBank,
} from "../../../api/staff";
import { getRoles, type RbacRole } from "../../../api/rbac";
import { ApiError } from "../../../api/client";
import { usePermissions } from "../../../hooks/usePermissions";
import type { RbacBranch } from "../../../api/auth";
import { mapDjangoFullToRow } from "../viewModel";
import type { EmployesRow } from "../types";
import { useCan } from "../../../hooks/useCan";
import { useT } from "../../../i18n/VerticalProvider";
import { PhoneCountryCodeSelect } from "../../../components/ui/PhoneCountryCodeSelect";
import { CustomDatePicker, cascadeContainer, cascadeItem } from "../../../components/ui";
import { SectionLabel, Field, Grid2, PhotoHero, ElqrUploader, StatusBadge } from "./drawerKit";
import { composePhone, getPhoneLocalMaxLength, type PhoneCountryCode } from "../../../utility/phone";
import { useFormValidation } from "../../../hooks/useFormValidation";
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
} from "../employeeValidation";

export type OnboardEmployeeDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (row: EmployesRow) => void;
};

const MotionStack = motion(Stack);
const MotionBox = motion(Box);

// Разбивает ФИО («Фамилия Имя Отчество») на поля учётной записи User:
// первое слово → lastName, остальное → firstName.
function splitFullName(fullName: string): { firstName?: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  const [last, ...rest] = parts;
  return { lastName: last, firstName: rest.join(" ") };
}

// Бэкенд отдаёт роли ВСЕХ организаций, к которым у пользователя есть доступ
// (суперюзеру — вообще все роли системы). Сотрудник заводится в активной
// организации, поэтому роль обязана принадлежать ей: сначала фильтруем по
// activeOrgId, иначе в списке всплывают чужие роли. Затем сворачиваем дубли по
// `code` (а при его отсутствии — по `name`) как защитный слой. Пока активная
// организация не определена, оставляем как есть (фильтровать не по чему).
function rolesForActiveOrg(roles: RbacRole[], activeOrgId?: number): RbacRole[] {
  const scoped =
    activeOrgId == null
      ? roles
      : roles.filter((r) => r.organizationId === activeOrgId);
  const byKey = new Map<string, RbacRole>();
  for (const role of scoped) {
    const key = (role.code || role.name).trim().toLowerCase();
    if (!byKey.has(key)) byKey.set(key, role);
  }
  return Array.from(byKey.values());
}

const isImageFile = (f: File | null) => Boolean(f && f.type.startsWith("image/"));

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Онбординг — форма создания «с нуля» (id ещё нет), поэтому черновик глобальный
// (не привязан к id), пишется с debounce и очищается после успешного сабмита.
// Фото и elQR не сохраняем (File не сериализуется).

const DRAFT_STORAGE_KEY = "mamadoc:employees:onboard-draft";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type OnboardDraft = {
  savedAt: number;
  fullName: string;
  nickname: string;
  phoneCountry: PhoneCountryCode;
  phoneLocal: string;
  email: string;
  status: "active" | "inactive" | "fired";
  clinicalRole: "doctor" | "nurse" | "other";
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
  roleId: number | "";
  employeeBranches: RbacBranch[];
  userAccessBranches: RbacBranch[];
  overrideUserAccess: boolean;
  selectedSpecializations: DjangoSpecialization[];
};

function readOnboardDraft(): OnboardDraft | null {
  return readFormDraft<OnboardDraft>(DRAFT_STORAGE_KEY, DRAFT_TTL_MS);
}

function writeOnboardDraft(draft: Omit<OnboardDraft, "savedAt">): void {
  writeFormDraft(DRAFT_STORAGE_KEY, draft);
}

function clearOnboardDraft(): void {
  clearFormDraft(DRAFT_STORAGE_KEY);
}

// Филиалы работы предзаполняются активным филиалом автоматически (см. эффект
// «preselect current branch» ниже) — это системный дефолт, а не ввод
// пользователя, поэтому в «пустоте» черновика их не учитываем: иначе черновик
// писался бы при каждом открытии дровера без единого нажатия клавиши.
function isDraftEmpty(d: Omit<OnboardDraft, "savedAt">): boolean {
  return (
    !d.fullName.trim() &&
    !d.nickname.trim() &&
    !d.phoneLocal &&
    !d.email.trim() &&
    d.status === "active" &&
    d.clinicalRole === "other" &&
    !d.telegramId &&
    !d.instagram.trim() &&
    !d.birthDate &&
    !d.hiredAt &&
    !d.bankAccountNumber &&
    !d.inn &&
    !d.address.trim() &&
    !d.notes.trim() &&
    !d.bank.trim() &&
    !d.bik &&
    d.roleId === "" &&
    !d.overrideUserAccess &&
    d.selectedSpecializations.length === 0
  );
}

const OnboardEmployeeDrawer: React.FC<OnboardEmployeeDrawerProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const { t } = useT("employees");
  const { open: notify } = useNotification();
  const { activeOrganization, activeBranch, activeMembership } = usePermissions();
  const canViewSpecs = useCan("staff.specializations.view");
  const canManageSpecs = useCan("staff.specializations.manage");
  const canManagePrivate = useCan("staff.private.manage");

  // ── photo ─────────────────────────────────────────────────────────────────────
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  // ── employee fields ───────────────────────────────────────────────────────────
  const [fullName, setFullName] = React.useState("");
  const [nickname, setNickname] = React.useState("");
  const [phoneCountry, setPhoneCountry] = React.useState<PhoneCountryCode>("+996");
  const [phoneLocal, setPhoneLocal] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"active" | "inactive" | "fired">("active");
  const [clinicalRole, setClinicalRole] = React.useState<"doctor" | "nurse" | "other">("other");
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
  const [elqrFile, setElqrFile] = React.useState<File | null>(null);
  const [elqrPreview, setElqrPreview] = React.useState<string | null>(null);

  // ── role / branch ─────────────────────────────────────────────────────────────
  const [roles, setRoles] = React.useState<RbacRole[]>([]);
  const [banks, setBanks] = React.useState<DjangoBank[]>([]);
  const [allSpecializations, setAllSpecializations] = React.useState<DjangoSpecialization[]>([]);
  const [loadingDeps, setLoadingDeps] = React.useState(false);
  const branches: RbacBranch[] = React.useMemo(
    () => (activeMembership?.branches ?? []).filter((b) => b.isActive),
    [activeMembership],
  );
  const [roleId, setRoleId] = React.useState<number | "">("");
  const [employeeBranches, setEmployeeBranches] = React.useState<RbacBranch[]>([]);
  const [userAccessBranches, setUserAccessBranches] = React.useState<RbacBranch[]>([]);
  const [overrideUserAccess, setOverrideUserAccess] = React.useState(false);
  const [selectedSpecializations, setSelectedSpecializations] = React.useState<DjangoSpecialization[]>([]);

  // ── touched + submit state ────────────────────────────────────────────────────
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [draftRestored, setDraftRestored] = React.useState(false);

  // ── derived validation ────────────────────────────────────────────────────────
  const errors = React.useMemo(() => ({
    fullName: validateFullName(fullName),
    phone: validatePhoneLocal(phoneLocal, phoneCountry),
    email: validateEmail(email),
    birthDate: validateBirthDate(birthDate),
    telegramId: validateTelegramId(telegramId),
    instagram: validateInstagram(instagram),
    bankAccountNumber: canManagePrivate ? validateBankAccountNumber(bankAccountNumber) : "",
    inn: canManagePrivate ? validateInn(inn) : "",
    bik: canManagePrivate ? validateBik(bik) : "",
  }), [fullName, phoneLocal, phoneCountry, email, birthDate, telegramId, instagram, bankAccountNumber, inn, bik, canManagePrivate]);

  // Логин выводится из email/телефона на бэкенде, поэтому требуем хотя бы одно.
  const hasLogin = Boolean(email.trim() || phoneLocal.trim());
  const hasRequiredFields =
    !errors.fullName &&
    !errors.phone &&
    !errors.email &&
    !errors.birthDate &&
    !errors.telegramId &&
    !errors.instagram &&
    !errors.bankAccountNumber &&
    !errors.inn &&
    !errors.bik &&
    hasLogin &&
    roleId !== "" &&
    employeeBranches.length > 0 &&
    branches.length > 0;

  const canSubmit = hasRequiredFields && !busy;

  // Перевод фокуса в первое проблемное поле (ошибки показывает showError выше).
  // Порядок ключей = порядок полей в форме.
  const focus = useFormValidation({
    fullName: errors.fullName || null,
    phone: !hasLogin ? "Укажите телефон или email — нужен для входа" : errors.phone || null,
    email: errors.email || null,
    roleId: roleId === "" ? "Выберите роль" : null,
    employeeBranches:
      branches.length > 0 && employeeBranches.length === 0
        ? "Выберите хотя бы один филиал работы"
        : null,
  });

  // Человекочитаемый список того, чего не хватает для сохранения.
  const missingReasons = React.useMemo<string[]>(() => {
    const r: string[] = [];
    if (errors.fullName) r.push("ФИО");
    if (!hasLogin) r.push("телефон или email (нужен для входа)");
    if (errors.phone) r.push("корректный телефон");
    if (errors.email) r.push("корректный email");
    if (errors.birthDate) r.push("корректная дата рождения");
    if (errors.telegramId) r.push("корректный Telegram ID");
    if (errors.instagram) r.push("корректный Instagram");
    if (errors.bankAccountNumber) r.push("корректный банковский счёт");
    if (errors.inn) r.push("корректный ИНН");
    if (errors.bik) r.push("корректный БИК");
    if (roleId === "") r.push("роль");
    if (branches.length === 0) r.push("нет доступных филиалов в организации");
    else if (employeeBranches.length === 0) r.push("хотя бы один филиал работы");
    return r;
  }, [errors, hasLogin, roleId, branches.length, employeeBranches.length]);

  const showError = (field: string) =>
    (touched[field] || submitAttempted) ? errors[field as keyof typeof errors] : "";

  const touch = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  const isWarning = (field: string) => showError(field)?.startsWith("Опечатка");

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  // ── load roles + specializations ──────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingDeps(true);
    const tasks: Promise<unknown>[] = [
      getRoles(activeOrganization?.id).then((r) => { if (!cancelled) setRoles(rolesForActiveOrg(r, activeOrganization?.id)); }),
    ];
    if (canViewSpecs || canManageSpecs) {
      tasks.push(
        getSpecializations().then((s) => { if (!cancelled) setAllSpecializations(s); }),
      );
    }
    if (canManagePrivate) {
      tasks.push(
        getBanks().then((b) => { if (!cancelled) setBanks(b); }).catch(() => {}),
      );
    }
    Promise.all(tasks)
      .catch((err) => {
        if (!cancelled)
          notify?.({ type: "error", message: `Ошибка загрузки: ${err?.message ?? err}` });
      })
      .finally(() => { if (!cancelled) setLoadingDeps(false); });
    return () => { cancelled = true; };
  }, [open, notify, canViewSpecs, canManageSpecs, canManagePrivate, activeOrganization?.id]);

  // ── preselect current branch ──────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open || employeeBranches.length > 0) return;
    const current = activeBranch
      ? branches.find((b) => b.id === activeBranch.id)
      : null;
    if (current) setEmployeeBranches([current]);
  }, [open, activeBranch, branches, employeeBranches.length]);

  // ── restore draft / reset on close ────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setPhotoFile(null);
      setPhotoPreview(null);
      setFullName("");
      setNickname("");
      setPhoneCountry("+996");
      setPhoneLocal("");
      setEmail("");
      setStatus("active");
      setClinicalRole("other");
      setTelegramId("");
      setInstagram("");
      setBirthDate("");
      setHiredAt("");
      setBankAccountNumber("");
      setInn("");
      setAddress("");
      setNotes("");
      setBank("");
      setBik("");
      setElqrFile(null);
      setElqrPreview(null);
      setRoleId("");
      setEmployeeBranches([]);
      setUserAccessBranches([]);
      setOverrideUserAccess(false);
      setSelectedSpecializations([]);
      setSubmitError(null);
      setBusy(false);
      setTouched({});
      setSubmitAttempted(false);
      setDraftRestored(false);
      return;
    }
    const draft = readOnboardDraft();
    if (draft) {
      setFullName(draft.fullName);
      setNickname(draft.nickname);
      setPhoneCountry(draft.phoneCountry);
      setPhoneLocal(draft.phoneLocal);
      setEmail(draft.email);
      setStatus(draft.status);
      setClinicalRole(draft.clinicalRole);
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
      setRoleId(draft.roleId);
      setEmployeeBranches(draft.employeeBranches);
      setUserAccessBranches(draft.userAccessBranches);
      setOverrideUserAccess(draft.overrideUserAccess);
      setSelectedSpecializations(draft.selectedSpecializations);
      setDraftRestored(true);
    }
  }, [open]);

  // ── сохранение черновика в localStorage (защита от случайного закрытия) ────
  // flushDraftRef всегда указывает на актуальный снэпшот полей — нужен, чтобы
  // при закрытии до истечения debounce (быстрый ввод + сразу закрыть) успеть
  // синхронно записать черновик, а не потерять его вместе с отменённым таймером.
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    const draft = {
      fullName,
      nickname,
      phoneCountry,
      phoneLocal,
      email,
      status,
      clinicalRole,
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
      roleId,
      employeeBranches,
      userAccessBranches,
      overrideUserAccess,
      selectedSpecializations,
    };
    if (isDraftEmpty(draft)) {
      clearOnboardDraft();
    } else {
      writeOnboardDraft(draft);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => flushDraftRef.current(), 400);
    return () => clearTimeout(id);
  }, [
    open, fullName, nickname, phoneCountry, phoneLocal, email, status, clinicalRole,
    telegramId, instagram, birthDate, hiredAt, bankAccountNumber, inn, address, notes,
    bank, bik, roleId, employeeBranches, userAccessBranches, overrideUserAccess, selectedSpecializations,
  ]);

  const handleClose = () => {
    flushDraftRef.current();
    onClose();
  };

  const handleDiscardDraft = () => {
    clearOnboardDraft();
    setFullName("");
    setNickname("");
    setPhoneCountry("+996");
    setPhoneLocal("");
    setEmail("");
    setStatus("active");
    setClinicalRole("other");
    setTelegramId("");
    setInstagram("");
    setBirthDate("");
    setHiredAt("");
    setBankAccountNumber("");
    setInn("");
    setAddress("");
    setNotes("");
    setBank("");
    setBik("");
    setRoleId("");
    setEmployeeBranches([]);
    setUserAccessBranches([]);
    setOverrideUserAccess(false);
    setSelectedSpecializations([]);
    setDraftRestored(false);
  };

  // ── photo / elqr pickers ────────────────────────────────────────────────────────
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
    } else {
      setElqrPreview(null);
    }
  }, []);

  // ── bank select → autofill БИК из справочника ────────────────────────────────────
  const handleBankChange = (name: string) => {
    setBank(name);
    const found = banks.find((b) => b.name === name);
    if (found) setBik(found.bik ?? "");
  };

  // ── submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitAttempted(true);
    focus.validate();
    if (!canSubmit) {
      setSubmitError(
        missingReasons.length > 0
          ? `Заполните: ${missingReasons.join(", ")}.`
          : "Проверьте поля формы.",
      );
      return;
    }

    setSubmitError(null);
    setBusy(true);
    try {
      const composedPhone = composePhone(phoneCountry, phoneLocal);
      const { firstName, lastName } = splitFullName(fullName);
      const payload = {
        fullName: fullName.trim(),
        roleId: roleId as number,
        employeeBranchIds: employeeBranches.map((b) => b.id),
        organizationId: activeOrganization?.id ?? undefined,
        email: email.trim() || undefined,
        phone: composedPhone ?? undefined,
        firstName,
        lastName,
        userBranchAccessIds: overrideUserAccess
          ? userAccessBranches.map((b) => b.id)
          : undefined,
        branchId: employeeBranches[0]?.id ?? activeBranch?.id ?? null,
        status,
        clinicalRole,
        specializationIds:
          clinicalRole === "doctor" && selectedSpecializations.length > 0
            ? selectedSpecializations.map((s) => s.id)
            : undefined,
        nickname: nickname.trim() || undefined,
        notes: notes.trim() || undefined,
        birthDate: birthDate || undefined,
        hiredAt: hiredAt || undefined,
        telegramId: telegramId.trim() || undefined,
        instagram: instagram.trim().replace(/^@/, "") || undefined,
        // Приватные поля отправляем только при наличии права; бэкенд тоже
        // отбрасывает их без staff.private.manage (fail-closed).
        ...(canManagePrivate && {
          bankAccountNumber: bankAccountNumber.trim() || undefined,
          inn: inn.trim() || undefined,
          address: address.trim() || undefined,
          bank: bank.trim() || undefined,
          bik: bik.trim() || undefined,
        }),
      };
      const res: OnboardEmployeeResponse = await onboardEmployee(payload);
      let employeeRow: EmployesRow = mapDjangoFullToRow(res.employee);

      const needRefetch = Boolean(photoFile || (elqrFile && canManagePrivate));
      if (photoFile) {
        try {
          await uploadEmployeePhoto(res.employee.id, photoFile);
        } catch {
          notify?.({ type: "error", message: "Сотрудник создан, но фото не удалось загрузить" });
        }
      }
      if (elqrFile && canManagePrivate) {
        try {
          await uploadEmployeeElqr(res.employee.id, elqrFile);
        } catch {
          notify?.({ type: "error", message: "Сотрудник создан, но elQR не удалось загрузить" });
        }
      }
      if (needRefetch) {
        try {
          const fresh = await getDjangoEmployee(res.employee.id);
          employeeRow = mapDjangoFullToRow(fresh);
        } catch {
          /* оставляем базовую строку */
        }
      }

      clearOnboardDraft();
      notify?.({
        type: "success",
        message: `Сотрудник ${res.employee.fullName} создан. Логин: ${res.user.username}`,
      });
      onCreated(employeeRow);
      onClose();
    } catch (err: unknown) {
      // 5xx — сбой бэкенда, а не данные формы: не заставляем искать «неправильное» поле.
      if (err instanceof ApiError && err.status >= 500) {
        setSubmitError(
          `Сервер не смог создать сотрудника (ошибка ${err.status}). ` +
            "Данные формы сохранены в черновике — повторите позже и сообщите разработчикам.",
        );
      } else {
        setSubmitError(
          err instanceof Error ? err.message : "Не удалось создать сотрудника",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerBase
      open={open}
      title="Создать сотрудника"
      onClose={handleClose}
      busy={busy}
      onSubmit={handleSubmit}
      submitLabel="Создать"
      submitDisabled={false}
      headerExtra={
        draftRestored ? (
          <Tooltip title="Черновик восстановлен — очистить?">
            <IconButton onClick={handleDiscardDraft} aria-label="Очистить черновик">
              <RestoreOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : undefined
      }
      footerAlert={
        submitError ? (
          <Alert severity="error" onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        ) : undefined
      }
    >
      <MotionStack spacing={2.5} variants={cascadeContainer} initial="hidden" animate="show">
        {/* ── Личная информация: фото + ФИО/Псевдоним + Дата рождения/ИНН ── */}
        <MotionBox variants={cascadeItem}>
          <Stack spacing={2.5}>
            <SectionLabel title="Личная информация" />
            <PhotoHero
              photoPreview={photoPreview}
              name={fullName}
              inputId="onboard-employee-photo"
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
                            placeholder: "дд.мм.гггг",
                            disabled: busy,
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
                          onChange={(e) => setInn(e.target.value.replace(/\D/g, "").slice(0, 14))}
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
                            placeholder: "дд.мм.гггг",
                            disabled: busy,
                          },
                        }}
                      />
                    </Field>
                  </Grid2>
                  <Field label="Описание">
                    <TextField
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
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
                        onChange={(e) => setAddress(e.target.value)}
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
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => touch("fullName")}
                  onKeyDown={submitOnEnter}
                  fullWidth
                  size="small"
                  placeholder="Иванов Иван Иванович"
                  required
                  disabled={busy}
                  inputProps={{ maxLength: 255 }}
                  error={Boolean(showError("fullName"))}
                  helperText={showError("fullName")}
                  ref={focus.anchor("fullName")}
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
                      options={["active", "inactive", "fired"]}
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

            <Field label="Телефон" hint="Телефон или email — нужен для входа по SMS-коду">
              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                <PhoneCountryCodeSelect
                  value={phoneCountry}
                  onChange={(code) => { setPhoneCountry(code); setPhoneLocal(""); }}
                  disabled={busy}
                />
                <TextField
                  value={phoneLocal}
                  onChange={(e) => {
                    const maxLen = getPhoneLocalMaxLength(phoneCountry);
                    setPhoneLocal(e.target.value.replace(/\D/g, "").slice(0, maxLen));
                  }}
                  onKeyDown={submitOnEnter}
                  fullWidth
                  size="small"
                  placeholder={getPhoneLocalMaxLength(phoneCountry) === 10 ? "XXX XXX XXXX" : "XXX XXX XXX"}
                  disabled={busy}
                  inputProps={{ inputMode: "tel", pattern: "[0-9]*", maxLength: getPhoneLocalMaxLength(phoneCountry) }}
                  ref={focus.anchor("phone")}
                  InputProps={{
                    endAdornment: !errors.phone && phoneLocal.length === getPhoneLocalMaxLength(phoneCountry) ? (
                      <InputAdornment position="end">
                        <CheckCircleOutlined fontSize="small" color="success" />
                      </InputAdornment>
                    ) : undefined,
                  }}
                />
              </Box>
            </Field>

            <Field label="Email">
              <TextField
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => touch("email")}
                onKeyDown={submitOnEnter}
                fullWidth
                size="small"
                placeholder="example@mail.com"
                type="email"
                disabled={busy}
                error={Boolean(showError("email") && !isWarning("email"))}
                helperText={showError("email")}
                ref={focus.anchor("email")}
                FormHelperTextProps={{
                  sx: isWarning("email") ? { color: "warning.main" } : undefined,
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
                  onChange={(e) => setTelegramId(e.target.value.replace(/\D/g, "").slice(0, 20))}
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
                  onChange={(e) => setInstagram(e.target.value)}
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
                    onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 16))}
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
                  isImage={isImageFile(elqrFile)}
                  fileName={elqrFile?.name ?? null}
                  inputId="onboard-employee-elqr"
                  onPick={handlePickElqr}
                  onRemove={() => handlePickElqr(null)}
                  disabled={busy}
                />
              </Field>
            </Stack>
          </MotionBox>
        )}

        {/* ── Роль и доступ ── */}
        <MotionBox variants={cascadeItem}>
          <Stack spacing={2.5}>
            <SectionLabel title="Роль и доступ" />

            <Field label="Тип сотрудника" hint="Клинический тип — влияет на расписание и специализации">
              <TextField
                select
                value={clinicalRole}
                onChange={(e) => {
                  const next = e.target.value as "doctor" | "nurse" | "other";
                  setClinicalRole(next);
                  if (next !== "doctor") setSelectedSpecializations([]);
                }}
                fullWidth
                size="small"
                disabled={busy}
              >
                <MenuItem value="doctor">{t("clinicalRole.doctor")}</MenuItem>
                <MenuItem value="nurse">{t("clinicalRole.nurse")}</MenuItem>
                <MenuItem value="other">{t("clinicalRole.other")}</MenuItem>
              </TextField>
            </Field>

            {/* ── Специализации (только для врача) ── */}
            {clinicalRole === "doctor" && (canViewSpecs || canManageSpecs) && (
              <Field label="Специализации">
                <Autocomplete
                  multiple
                  size="small"
                  options={allSpecializations}
                  getOptionLabel={(s) => s.name}
                  value={selectedSpecializations}
                  onChange={(_, val) => setSelectedSpecializations(val)}
                  disabled={busy || loadingDeps || !canManageSpecs}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderTags={(val, getTagProps) =>
                    val.map((opt, idx) => (
                      <Chip {...getTagProps({ index: idx })} key={opt.id} label={opt.name} size="small" />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder={
                        loadingDeps ? "Загрузка…" : !canManageSpecs ? "Нет прав на изменение" : "Выберите специализации"
                      }
                    />
                  )}
                />
              </Field>
            )}

            {/* ── Роль (поиск-комбобокс: ролей у организации может быть много) ── */}
            <Field label="Роль" required hint="Права доступа и группировка в списке">
              <Autocomplete
                size="small"
                options={roles}
                getOptionLabel={(r) => r.name}
                value={roles.find((r) => r.id === roleId) ?? null}
                onChange={(_, val) => setRoleId(val ? val.id : "")}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                disabled={loadingDeps || busy}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder={loadingDeps ? "Загрузка…" : "Найти роль…"}
                    error={submitAttempted && roleId === ""}
                    helperText={submitAttempted && roleId === "" ? "Выберите роль" : ""}
                    ref={focus.anchor("roleId")}
                  />
                )}
              />
            </Field>

            {/* ── Филиалы работы ── */}
            <Field label="Филиалы работы" required hint="Где сотрудник работает операционно">
              {branches.length === 0 ? (
                <Alert severity="warning">Нет доступных филиалов</Alert>
              ) : (
                <Autocomplete
                  multiple
                  size="small"
                  options={branches}
                  value={employeeBranches}
                  getOptionLabel={(b) => b.name}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  onChange={(_, val) => setEmployeeBranches(val)}
                  disabled={loadingDeps || busy}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip label={option.name} size="small" {...getTagProps({ index })} key={option.id} />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder={loadingDeps ? "Загрузка…" : "Выберите филиалы"}
                      ref={focus.anchor("employeeBranches")}
                    />
                  )}
                />
              )}
            </Field>

            {/* ── Доступ в CRM ── */}
            <Field label="Доступ в CRM (филиалы)" hint="Пусто — будет совпадать с филиалами работы">
              <Autocomplete
                multiple
                size="small"
                options={branches}
                value={userAccessBranches}
                getOptionLabel={(b) => b.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                onChange={(_, val) => {
                  setUserAccessBranches(val);
                  setOverrideUserAccess(val.length > 0);
                }}
                disabled={loadingDeps || busy}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip label={option.name} size="small" {...getTagProps({ index })} key={option.id} />
                  ))
                }
                renderInput={(params) => (
                  <TextField {...params} placeholder={loadingDeps ? "Загрузка…" : "Как у филиалов работы"} />
                )}
              />
            </Field>
          </Stack>
        </MotionBox>
      </MotionStack>
    </DrawerBase>
  );
};

export default OnboardEmployeeDrawer;
