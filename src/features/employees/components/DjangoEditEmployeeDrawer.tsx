import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Checkbox,
  Chip,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { useNotification } from "@refinedev/core";
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
  type EmployeeServiceAssignment,
  type DjangoBank,
} from "../../../api/staff";
import { getServices, type Service } from "../../../api/catalog";
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
import { CustomDatePicker } from "../../../components/ui";
import { PhoneCountryCodeSelect } from "../../../components/ui/PhoneCountryCodeSelect";
import SpecializationBlock from "./SpecializationBlock";
import DocumentsBlock from "./DocumentsBlock";
import { SectionLabel, Field, Grid2, PhotoHero, ElqrUploader, StatusBadge } from "./drawerKit";
import {
  parsePhone,
  composePhone,
  getPhoneLocalMaxLength,
  type PhoneCountryCode,
} from "../../../utility/phone";
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

export type DjangoEditEmployeeDrawerProps = {
  record: EmployesRow | null;
  onClose: () => void;
  onUpdated: (updated: EmployesRow) => void;
};

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

const DjangoEditEmployeeDrawer: React.FC<DjangoEditEmployeeDrawerProps> = ({
  record,
  onClose,
  onUpdated,
}) => {
  const { open: notify } = useNotification();

  const canManagePrivate = useCan("staff.private.manage");
  const canViewSpecs = useCan("staff.specializations.view");
  const canManageSpecs = useCan("staff.specializations.manage");
  const canViewDocs = useCan("staff.documents.view");
  const canManageDocs = useCan("staff.documents.manage");
  const canViewServices = useCan("staff.services.view");
  const canManageServices = useCan("staff.services.manage");
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
    }),
    [fullName, phoneLocal, phoneCountry, email, birthDate, telegramId, instagram, bankAccountNumber, inn, bik, canManagePrivate],
  );

  const hasErrors = Object.values(errors).some(Boolean);

  const showError = (field: string) =>
    touched[field] || submitAttempted ? errors[field as keyof typeof errors] : "";

  const touch = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

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
    if (found) setBik(found.bik);
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
    setServerError(null);
    setTouched({});
    setSubmitAttempted(false);
    setAssignments([]);
    setSelectedServices([]);
    setSalary(EMPTY_SALARY);
    initialSalaryRef.current = serializeSalary(EMPTY_SALARY);

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
        setSpecializations(full.specializations ?? []);
        const parsedFull = parsePhone(full.phone || "");
        setPhoneCountry(parsedFull.countryCode);
        setPhoneLocal(parsedFull.local);
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

    const needServices = canViewServices || canManageServices || canViewPayroll;
    const servicesPromise: Promise<Service[]> = needServices
      ? getServices(null, ctrl.signal)
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
      getProducts(ctrl.signal)
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
        fullName: fullName.trim(),
        nickname: nickname.trim() || null,
        phone: composePhone(phoneCountry, phoneLocal),
        email: email.trim() || null,
        status,
        clinicalRole,
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

        for (const a of assignments) {
          if (a.isActive && !selectedIds.has(a.service.id)) {
            try {
              await updateEmployeeService(empId, a.id, { isActive: false });
            } catch (e) {
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
                console.warn("Could not reactivate service assignment:", e);
              }
            } else {
              try {
                await assignEmployeeService(empId, { serviceId: svc.id });
              } catch (e) {
                console.warn("Could not assign service:", e);
              }
            }
          }
        }
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
        updated_at: updated.updatedAt,
        _djangoRole: updated.role ?? null,
        _djangoSpecializations: updated.specializations ?? [],
        _djangoOperationalBranches: updated.operationalBranches ?? [],
        _fullDetailsLoaded: true,
      };

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

  return (
    <DrawerBase
      open={open}
      title="Редактирование"
      onClose={onClose}
      busy={busy}
      onSubmit={handleSubmit}
      submitLabel="Сохранить"
      submitDisabled={submitAttempted && hasErrors}
    >
      <Stack spacing={2.5}>
        {serverError && <Alert severity="error">{serverError}</Alert>}

        {/* ── Личная информация ── */}
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
                      onChange={(e) => { setInn(e.target.value.replace(/\D/g, "").slice(0, 14)); setServerError(null); }}
                      onBlur={() => touch("inn")}
                      fullWidth
                      size="small"
                      placeholder="00000000000000"
                      disabled={busy}
                      inputProps={{ inputMode: "numeric" }}
                      error={Boolean(showError("inn"))}
                      helperText={showError("inn")}
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
                    multiline
                    minRows={2}
                    placeholder="Город, улица, дом, кв."
                    disabled={busy}
                    inputProps={{ maxLength: 255 }}
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
              onBlur={() => touch("fullName")}
              required
              fullWidth
              size="small"
              placeholder="Иванов Иван Иванович"
              disabled={busy}
              error={Boolean(showError("fullName"))}
              helperText={showError("fullName")}
              inputProps={{ maxLength: 255 }}
            />
          </Field>
          <Field label="Псевдоним">
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
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

        {/* ── Контакты ── */}
        <SectionLabel title="Контакты" />

        <Field label="Телефон">
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
                setServerError(null);
              }}
              onBlur={() => touch("phone")}
              fullWidth
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
            fullWidth
            placeholder="example@mail.com"
            type="email"
            disabled={busy}
            error={Boolean(showError("email") && !showError("email")?.startsWith("Опечатка"))}
            helperText={showError("email")}
            FormHelperTextProps={{
              sx: showError("email")?.startsWith("Опечатка") ? { color: "warning.main" } : undefined,
            }}
          />
        </Field>

        <Grid2>
          <Field label="Telegram ID">
            <TextField
              value={telegramId}
              onChange={(e) => { setTelegramId(e.target.value.replace(/\D/g, "").slice(0, 20)); setServerError(null); }}
              onBlur={() => touch("telegramId")}
              fullWidth
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
              fullWidth
              placeholder="username"
              disabled={busy}
              InputProps={{ startAdornment: <InputAdornment position="start">@</InputAdornment> }}
              error={Boolean(showError("instagram"))}
              helperText={showError("instagram")}
            />
          </Field>
        </Grid2>

        {/* ── Реквизиты (под staff.private.manage) ── */}
        {canManagePrivate && (
          <>
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
                  fullWidth
                  placeholder="000000"
                  disabled={busy}
                  inputProps={{ inputMode: "numeric" }}
                  error={Boolean(showError("bik"))}
                  helperText={showError("bik")}
                />
              </Field>
              <Field label="Расчётный счёт">
                <TextField
                  value={bankAccountNumber}
                  onChange={(e) => { setBankAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 16)); setServerError(null); }}
                  onBlur={() => touch("bankAccountNumber")}
                  fullWidth
                  placeholder="0000000000000000"
                  disabled={busy}
                  inputProps={{ inputMode: "numeric" }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <CreditCardOutlined fontSize="small" />
                      </InputAdornment>
                    ),
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
          </>
        )}

        {/* ── Тип сотрудника ── */}
        <SectionLabel title="Тип сотрудника" />

        <Field label="Тип" hint="Клинический тип — влияет на расписание и специализации">
          <TextField
            select
            value={clinicalRole}
            onChange={(e) => setClinicalRole(e.target.value as "doctor" | "nurse" | "other")}
            fullWidth
            disabled={busy}
          >
            <MenuItem value="doctor">Врач</MenuItem>
            <MenuItem value="nurse">Медсестра</MenuItem>
            <MenuItem value="other">Другой</MenuItem>
          </TextField>
        </Field>

        {/* ── Специализации (только для врача) ── */}
        {clinicalRole === "doctor" && (canViewSpecs || canManageSpecs) && record && (
          <SpecializationBlock
            employeeId={Number(record.id)}
            currentSpecializations={specializations}
            onSpecializationsChange={setSpecializations}
            canView={canViewSpecs}
            canManage={canManageSpecs}
            disabled={busy}
          />
        )}

        {/* ── Услуги ── */}
        {(canViewServices || canManageServices) && (
          <>
            <SectionLabel title="Услуги" />
            <Field label="Услуги сотрудника">
              <Autocomplete
                multiple
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
          </>
        )}

        {/* ── Зарплата ── */}
        {canViewPayroll && (
          <>
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
                  services={allServices}
                  loadingServices={salaryLoading}
                  products={allProducts}
                  loadingProducts={productsLoading}
                  disabled={busy || !canManagePayroll}
                />
              )}
            </Box>
          </>
        )}

        {/* ── Документы / паспортные фото ── */}
        {(canViewDocs || canManageDocs) && record && (
          <>
            <SectionLabel title="Документы" />
            <DocumentsBlock
              employeeId={Number(record.id)}
              canView={canViewDocs}
              canManage={canManageDocs}
              disabled={busy}
            />
          </>
        )}
      </Stack>
    </DrawerBase>
  );
};

export default DjangoEditEmployeeDrawer;
