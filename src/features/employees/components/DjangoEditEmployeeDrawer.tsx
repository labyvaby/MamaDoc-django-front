import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import DrawerBase from "./DrawerBase";
import {
  updateEmployee,
  getDjangoEmployee,
  uploadEmployeePhoto,
  getEmployeeServices,
  assignEmployeeService,
  updateEmployeeService,
  type DjangoSpecializationShort,
  type EmployeeServiceAssignment,
} from "../../../api/staff";
import { getServices, type Service } from "../../../api/catalog";
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
import ServicePhotoUploader from "../../../components/services/ServicePhotoUploader";
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
  validateBankAccountNumber,
  validateInn,
} from "../employeeValidation";

export type DjangoEditEmployeeDrawerProps = {
  record: EmployesRow | null;
  onClose: () => void;
  onUpdated: (updated: EmployesRow) => void;
};

const STATUS_OPTIONS = [
  { value: "active", label: "Работает" },
  { value: "inactive", label: "Не работает" },
];

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
  return JSON.stringify({
    enabled: v.enabled,
    night: num(v.nightRate),
    day: num(v.dayRate),
    appointment: num(v.appointmentRate),
    rules,
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
  const [birthDate, setBirthDate] = React.useState("");
  const [bankAccountNumber, setBankAccountNumber] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [specializations, setSpecializations] = React.useState<DjangoSpecializationShort[]>([]);

  // ── Services ──────────────────────────────────────────────────────────────
  const [allServices, setAllServices] = React.useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = React.useState(false);
  const [assignments, setAssignments] = React.useState<EmployeeServiceAssignment[]>([]);
  const [selectedServices, setSelectedServices] = React.useState<Service[]>([]);

  // ── Salary ────────────────────────────────────────────────────────────────
  const [salaryLoading, setSalaryLoading] = React.useState(false);
  const [salary, setSalary] = React.useState<SalarySettingsValue>(EMPTY_SALARY);
  // Snapshot of the salary as loaded — used to skip the PUT when untouched.
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
      bankAccountNumber: canManagePrivate ? validateBankAccountNumber(bankAccountNumber) : "",
      inn: canManagePrivate ? validateInn(inn) : "",
    }),
    [fullName, phoneLocal, phoneCountry, email, birthDate, telegramId, bankAccountNumber, inn, canManagePrivate],
  );

  const hasErrors = Object.values(errors).some(Boolean);

  const showError = (field: string) =>
    touched[field] || submitAttempted ? errors[field as keyof typeof errors] : "";

  const touch = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  // ── Photo pick ────────────────────────────────────────────────────────────
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

  // ── Populate on open ──────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!record) return;

    const empId = Number(record.id);

    // Reset
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
    setBirthDate(record.birth_date || "");
    setBankAccountNumber(record.bank_account_number || "");
    setInn(record.inn || "");
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

    // Full employee detail
    getDjangoEmployee(empId, ctrl.signal)
      .then((full) => {
        if (ctrl.signal.aborted) return;
        setPhotoPreview(full.photoUrl || null);
        setNickname(full.nickname || "");
        setTelegramId(full.telegramId || "");
        setBirthDate(full.birthDate || "");
        setBankAccountNumber(full.bankAccountNumber || "");
        setInn(full.inn || "");
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

    // Services list — fetched ONCE, shared by the «Услуги» picker and the
    // salary rates dropdown (no duplicate /catalog/services request).
    const needServices = canViewServices || canManageServices || canViewPayroll;
    const servicesPromise: Promise<Service[]> = needServices
      ? getServices(null, ctrl.signal)
      : Promise.resolve([]);

    if (canViewServices || canManageServices) {
      setServicesLoading(true);
      // includeInactive: чтобы деактивированные назначения были видны в карточке
      // (показываем их отдельным блоком), а не молча пропадали. На дифф
      // сохранения это не влияет — он фильтрует по a.isActive ниже.
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
      // Payroll-only: still need the services list for the rates dropdown.
      servicesPromise
        .then((svcList) => {
          if (!ctrl.signal.aborted)
            setAllServices(svcList.filter((s) => s.isActive));
        })
        .catch(() => {});
    }

    // Salary rule — reuses the shared services list above (no extra fetch).
    if (canViewPayroll) {
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
  // Key on the employee id (a stable primitive) — NOT the record object — so
  // the loads run once per opened employee and aren't re-triggered/aborted by
  // unrelated re-renders that hand us a new object with the same id.
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
        birthDate: birthDate || null,
        ...(canManagePrivate && {
          bankAccountNumber: bankAccountNumber.trim() || null,
          inn: inn.trim() || null,
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

      // 3. Services — diff: deactivate removed, activate/add new
      if (canManageServices) {
        const selectedIds = new Set(selectedServices.map((s) => s.id));
        const assignedActiveIds = new Set(
          assignments.filter((a) => a.isActive).map((a) => a.service.id),
        );

        // Deactivate assignments that are no longer selected
        for (const a of assignments) {
          if (a.isActive && !selectedIds.has(a.service.id)) {
            try {
              await updateEmployeeService(empId, a.id, { isActive: false });
            } catch (e) {
              console.warn("Could not deactivate service assignment:", e);
            }
          }
        }

        // Re-activate or add new
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
        birth_date: updated.birthDate || null,
        bank_account_number: updated.bankAccountNumber || null,
        inn: updated.inn || null,
        photo_url: updated.photoUrl || null,
        role_id: updated.role ? String(updated.role.id) : null,
        clinicalRole: updated.clinicalRole ?? "other",
        // updated_at меняется при каждом сохранении — карточка использует его
        // как сигнатуру, чтобы перечитать услуги/связанные данные без F5.
        updated_at: updated.updatedAt,
        _djangoRole: updated.role ?? null,
        _djangoSpecializations: updated.specializations ?? [],
        _djangoOperationalBranches: updated.operationalBranches ?? [],
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

  // Деактивированные назначения услуг — показываем отдельно, чтобы они не
  // пропадали из карточки (управление статусом — в «Управление услугами»).
  const inactiveAssignments = React.useMemo(
    () => assignments.filter((a) => !a.isActive),
    [assignments],
  );

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
      <Stack spacing={3}>
        {serverError && <Alert severity="error">{serverError}</Alert>}

        {/* ── Фото ── */}
        <ServicePhotoUploader
          photoFile={photoFile}
          photoPreview={photoPreview}
          onPickPhoto={handlePickPhoto}
          inputId="edit-employee-photo"
        />

        {/* ── Зарплатные правила (как в оригинале) ── */}
        {canViewPayroll && (
          <Box
            sx={{
              bgcolor: "action.hover",
              p: 2,
              borderRadius: "14px",
              mx: -2,
              borderTop: "1px solid",
              borderBottom: "1px solid",
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
                disabled={busy || !canManagePayroll}
              />
            )}
          </Box>
        )}

        {/* ── ФИО ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            ФИО *
          </Typography>
          <TextField
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setServerError(null); }}
            onBlur={() => touch("fullName")}
            required
            fullWidth
            placeholder="Иванов Иван Иванович"
            disabled={busy}
            error={Boolean(showError("fullName"))}
            helperText={showError("fullName")}
            inputProps={{ maxLength: 255 }}
          />
        </Stack>

        {/* ── Псевдоним ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Псевдоним
          </Typography>
          <TextField
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            fullWidth
            placeholder="Как отображается в расписании"
            disabled={busy}
            inputProps={{ maxLength: 100 }}
          />
        </Stack>

        {/* ── Телефон ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Телефон
          </Typography>
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
                const digits = e.target.value.replace(/\D/g, "").slice(0, maxLen);
                setPhoneLocal(digits);
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
        </Stack>

        {/* ── Роль ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Тип сотрудника
          </Typography>
          <TextField
            select
            value={clinicalRole}
            onChange={(e) => setClinicalRole(e.target.value as "doctor" | "nurse" | "other")}
            fullWidth
            disabled={busy}
          >
            <MenuItem value="doctor">Врач</MenuItem>
            <MenuItem value="nurse">Медсестра</MenuItem>
            <MenuItem value="other">Другой сотрудник</MenuItem>
          </TextField>
        </Stack>

        {/* ── Специализации (только для врача) ── */}
        {clinicalRole === "doctor" && (canViewSpecs || canManageSpecs) && record && (
          <>
            <Divider />
            <SpecializationBlock
              employeeId={Number(record.id)}
              currentSpecializations={specializations}
              onSpecializationsChange={setSpecializations}
              canView={canViewSpecs}
              canManage={canManageSpecs}
              disabled={busy}
            />
          </>
        )}

        {/* ── Дата рождения ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Дата рождения
          </Typography>
          <CustomDatePicker
            value={birthDate ? dayjs(birthDate) : null}
            onChange={(val) => {
              setBirthDate(val ? val.format("YYYY-MM-DD") : "");
              touch("birthDate");
            }}
            slotProps={{
              textField: {
                fullWidth: true,
                InputLabelProps: { shrink: true },
                placeholder: "дд.мм.гггг",
                disabled: busy,
                onBlur: () => touch("birthDate"),
                error: Boolean(showError("birthDate")),
                helperText: showError("birthDate"),
              },
            }}
          />
        </Stack>

        {/* ── Статус ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Статус
          </Typography>
          <TextField
            select
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
            fullWidth
            disabled={busy}
          >
            {STATUS_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {/* ── Услуги ── */}
        {(canViewServices || canManageServices) && (
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Услуги
            </Typography>
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
                <TextField
                  {...params}
                  placeholder={canManageServices ? "Выберите услуги" : ""}
                />
              )}
            />

            {/* Деактивированные назначения — показываем, а не прячем. Только
                для информации; управлять ими можно в «Управление услугами». */}
            {inactiveAssignments.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
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
        )}

        {/* ── Telegram ID ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Telegram ID
          </Typography>
          <TextField
            value={telegramId}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 20);
              setTelegramId(digits);
              setServerError(null);
            }}
            onBlur={() => touch("telegramId")}
            fullWidth
            placeholder="Числовой ID"
            disabled={busy}
            inputProps={{ inputMode: "numeric" }}
            error={Boolean(showError("telegramId"))}
            helperText={showError("telegramId")}
          />
        </Stack>

        {/* ── Email ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Email
          </Typography>
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
              sx: showError("email")?.startsWith("Опечатка")
                ? { color: "warning.main" }
                : undefined,
            }}
          />
        </Stack>

        {/* ── Приватные поля ── */}
        {canManagePrivate && (
          <>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Номер расчётного счёта
              </Typography>
              <TextField
                value={bankAccountNumber}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 16);
                  setBankAccountNumber(v);
                  setServerError(null);
                }}
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
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                ИНН
              </Typography>
              <TextField
                value={inn}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 14);
                  setInn(v);
                  setServerError(null);
                }}
                onBlur={() => touch("inn")}
                fullWidth
                placeholder="00000000000000"
                disabled={busy}
                inputProps={{ inputMode: "numeric" }}
                error={Boolean(showError("inn"))}
                helperText={showError("inn") || `${inn.length}/14`}
              />
            </Stack>
          </>
        )}

        {/* ── Документы / паспортные фото ── */}
        {(canViewDocs || canManageDocs) && record && (
          <>
            <Divider />
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
