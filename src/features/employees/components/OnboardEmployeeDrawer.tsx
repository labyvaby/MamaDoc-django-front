import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  InputAdornment,
  Stack,
  TextField,
} from "@mui/material";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import DrawerBase from "./DrawerBase";
import {
  onboardEmployee,
  uploadEmployeePhoto,
  getDjangoEmployee,
  getSpecializations,
  type OnboardEmployeeResponse,
  type DjangoSpecialization,
} from "../../../api/staff";
import { getRoles, type RbacRole } from "../../../api/rbac";
import { usePermissions } from "../../../hooks/usePermissions";
import type { RbacBranch } from "../../../api/auth";
import { mapDjangoFullToRow } from "../viewModel";
import type { EmployesRow } from "../types";
import { useCan } from "../../../hooks/useCan";
import { PhoneCountryCodeSelect } from "../../../components/ui/PhoneCountryCodeSelect";
import { CustomDatePicker } from "../../../components/ui";
import { SectionLabel, Field, Grid2, SegmentedControl, PhotoHero } from "./drawerKit";
import { composePhone, getPhoneLocalMaxLength, type PhoneCountryCode } from "../../../utility/phone";
import {
  validateFullName,
  validatePhoneLocal,
  validateEmail,
  validateBirthDate,
  validateTelegramId,
  validateBankAccountNumber,
  validateInn,
} from "../employeeValidation";

export type OnboardEmployeeDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (row: EmployesRow) => void;
};

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

const OnboardEmployeeDrawer: React.FC<OnboardEmployeeDrawerProps> = ({
  open,
  onClose,
  onCreated,
}) => {
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
  const [birthDate, setBirthDate] = React.useState("");
  const [bankAccountNumber, setBankAccountNumber] = React.useState("");
  const [inn, setInn] = React.useState("");

  // ── account fields ────────────────────────────────────────────────────────────
  // Логин (username) деривируется бэкендом из email/телефона, пароль не
  // задаётся при создании — сотрудник входит по SMS-коду (OTP).
  // firstName / lastName выводятся из ФИО автоматически (см. splitFullName).

  // ── role / branch ─────────────────────────────────────────────────────────────
  const [roles, setRoles] = React.useState<RbacRole[]>([]);
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

  // ── derived validation ────────────────────────────────────────────────────────
  const errors = React.useMemo(() => ({
    fullName: validateFullName(fullName),
    phone: validatePhoneLocal(phoneLocal, phoneCountry),
    email: validateEmail(email),
    birthDate: validateBirthDate(birthDate),
    telegramId: validateTelegramId(telegramId),
    bankAccountNumber: canManagePrivate ? validateBankAccountNumber(bankAccountNumber) : "",
    inn: canManagePrivate ? validateInn(inn) : "",
  }), [fullName, phoneLocal, phoneCountry, email, birthDate, telegramId, bankAccountNumber, inn, canManagePrivate]);

  // Логин выводится из email/телефона на бэкенде, поэтому требуем хотя бы одно.
  const hasLogin = Boolean(email.trim() || phoneLocal.trim());
  const hasRequiredFields =
    !errors.fullName &&
    !errors.phone &&
    !errors.email &&
    !errors.birthDate &&
    !errors.telegramId &&
    !errors.bankAccountNumber &&
    !errors.inn &&
    hasLogin &&
    roleId !== "" &&
    employeeBranches.length > 0 &&
    branches.length > 0;

  const canSubmit = hasRequiredFields && !busy;

  // Человекочитаемый список того, чего не хватает для сохранения. Используется
  // и для подсказки над кнопкой, и в сводке при попытке сохранить пустую форму,
  // чтобы кнопка не «умирала молча».
  const missingReasons = React.useMemo<string[]>(() => {
    const r: string[] = [];
    if (errors.fullName) r.push("ФИО");
    if (!hasLogin) r.push("телефон или email (нужен для входа)");
    if (errors.phone) r.push("корректный телефон");
    if (errors.email) r.push("корректный email");
    if (errors.birthDate) r.push("корректная дата рождения");
    if (errors.telegramId) r.push("корректный Telegram ID");
    if (errors.bankAccountNumber) r.push("корректный банковский счёт");
    if (errors.inn) r.push("корректный ИНН");
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

  // ── load roles + specializations ──────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingDeps(true);
    const tasks: Promise<unknown>[] = [
      // Бэкенд скоупит роли по организации (по умолчанию — активной). Передаём
      // id явно; rolesForActiveOrg — дополнительный клиентский слой на случай,
      // если контекст ещё не подхватился.
      getRoles(activeOrganization?.id).then((r) => { if (!cancelled) setRoles(rolesForActiveOrg(r, activeOrganization?.id)); }),
    ];
    if (canViewSpecs || canManageSpecs) {
      tasks.push(
        getSpecializations().then((s) => { if (!cancelled) setAllSpecializations(s); }),
      );
    }
    Promise.all(tasks)
      .catch((err) => {
        if (!cancelled)
          notify?.({ type: "error", message: `Ошибка загрузки: ${err?.message ?? err}` });
      })
      .finally(() => { if (!cancelled) setLoadingDeps(false); });
    return () => { cancelled = true; };
  }, [open, notify, canViewSpecs, canManageSpecs, activeOrganization?.id]);

  // ── preselect current branch ──────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open || employeeBranches.length > 0) return;
    const current = activeBranch
      ? branches.find((b) => b.id === activeBranch.id)
      : null;
    if (current) setEmployeeBranches([current]);
  }, [open, activeBranch, branches, employeeBranches.length]);

  // ── reset on close ────────────────────────────────────────────────────────────
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
      setBirthDate("");
      setBankAccountNumber("");
      setInn("");
      setRoleId("");
      setEmployeeBranches([]);
      setUserAccessBranches([]);
      setOverrideUserAccess(false);
      setSelectedSpecializations([]);
      setSubmitError(null);
      setBusy(false);
      setTouched({});
      setSubmitAttempted(false);
    }
  }, [open]);

  // ── photo ─────────────────────────────────────────────────────────────────────
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

  // ── submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (!canSubmit) {
      // Раньше форма молча выходила (return) — кнопка гасла, пользователь не
      // понимал почему. Теперь показываем конкретную причину.
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
        birthDate: birthDate || undefined,
        telegramId: telegramId.trim() || undefined,
        // Приватные поля отправляем только при наличии права; бэкенд тоже
        // отбрасывает их без staff.private.manage (fail-closed).
        ...(canManagePrivate && {
          bankAccountNumber: bankAccountNumber.trim() || undefined,
          inn: inn.trim() || undefined,
        }),
      };
      const res: OnboardEmployeeResponse = await onboardEmployee(payload);
      let employeeRow: EmployesRow = mapDjangoFullToRow(res.employee);

      if (photoFile) {
        try {
          await uploadEmployeePhoto(res.employee.id, photoFile);
          const fresh = await getDjangoEmployee(res.employee.id);
          employeeRow = mapDjangoFullToRow(fresh);
        } catch {
          notify?.({ type: "error", message: "Сотрудник создан, но фото не удалось загрузить" });
        }
      }

      notify?.({
        type: "success",
        message: `Сотрудник ${res.employee.fullName} создан. Логин: ${res.user.username}`,
      });
      onCreated(employeeRow);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Не удалось создать сотрудника";
      setSubmitError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerBase
      open={open}
      title="Создать сотрудника"
      onClose={onClose}
      busy={busy}
      onSubmit={handleSubmit}
      submitLabel="Создать"
      // Кнопку НЕ гасим по валидации — иначе при невалидной форме клик не
      // срабатывает и пользователь не видит причину. Блокируем только во время
      // отправки. Невалидность отлавливает handleSubmit и показывает, чего нет.
      submitDisabled={false}
    >
      <Stack spacing={2.5}>
        {submitError && (
          <Alert severity="error" onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        {/* ── Фото-герой: аватар + ФИО/Псевдоним ── */}
        <PhotoHero
          photoPreview={photoPreview}
          name={fullName}
          inputId="onboard-employee-photo"
          onPickPhoto={handlePickPhoto}
          disabled={busy}
        >
          <Field label="ФИО" required>
            <TextField
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => touch("fullName")}
              fullWidth
              size="small"
              placeholder="Иванов Иван Иванович"
              required
              disabled={busy}
              inputProps={{ maxLength: 255 }}
              error={Boolean(showError("fullName"))}
              helperText={showError("fullName")}
            />
          </Field>
          <Field label="Псевдоним">
            <TextField
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              fullWidth
              size="small"
              placeholder="Как в расписании"
              disabled={busy}
              inputProps={{ maxLength: 100 }}
            />
          </Field>
        </PhotoHero>

        {/* ── Контакты ── */}
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
                const digits = e.target.value.replace(/\D/g, "").slice(0, maxLen);
                setPhoneLocal(digits);
              }}
              fullWidth
              placeholder={getPhoneLocalMaxLength(phoneCountry) === 10 ? "XXX XXX XXXX" : "XXX XXX XXX"}
              disabled={busy}
              inputProps={{ inputMode: "tel", pattern: "[0-9]*", maxLength: getPhoneLocalMaxLength(phoneCountry) }}
            />
          </Box>
        </Field>

        <Grid2>
          <Field label="Email">
            <TextField
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => touch("email")}
              fullWidth
              placeholder="example@mail.com"
              type="email"
              disabled={busy}
              error={Boolean(showError("email") && !isWarning("email"))}
              helperText={showError("email")}
              FormHelperTextProps={{
                sx: isWarning("email") ? { color: "warning.main" } : undefined,
              }}
            />
          </Field>
          <Field label="Telegram ID">
            <TextField
              value={telegramId}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 20);
                setTelegramId(digits);
              }}
              onBlur={() => touch("telegramId")}
              fullWidth
              placeholder="Числовой ID"
              disabled={busy}
              inputProps={{ inputMode: "numeric" }}
              error={Boolean(showError("telegramId"))}
              helperText={showError("telegramId")}
            />
          </Field>
        </Grid2>

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

        {/* ── Финансы (под staff.private.manage) ── */}
        {canManagePrivate && (
          <>
            <SectionLabel
              title="Финансы"
              trailing={
                <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: "text.disabled" }}>
                  <LockOutlined sx={{ fontSize: 13 }} />
                  <Box component="span" sx={{ fontSize: "0.68rem" }}>приватно</Box>
                </Stack>
              }
            />
            <Grid2>
              <Field label="Расчётный счёт">
                <TextField
                  value={bankAccountNumber}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 16);
                    setBankAccountNumber(v);
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
              </Field>
              <Field label="ИНН">
                <TextField
                  value={inn}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 14);
                    setInn(v);
                  }}
                  onBlur={() => touch("inn")}
                  fullWidth
                  placeholder="00000000000000"
                  disabled={busy}
                  inputProps={{ inputMode: "numeric" }}
                  error={Boolean(showError("inn"))}
                  helperText={showError("inn") || `${inn.length}/14`}
                />
              </Field>
            </Grid2>
          </>
        )}

        {/* ── Роль и доступ ── */}
        <SectionLabel title="Роль и доступ" />

        <Field label="Статус">
          <SegmentedControl
            value={status}
            onChange={(v) => setStatus(v)}
            disabled={busy}
            options={[
              { value: "active", label: "Работает" },
              { value: "inactive", label: "Не работает" },
              { value: "fired", label: "Уволен" },
            ]}
          />
        </Field>

        <Field label="Тип сотрудника" hint="Клинический тип — влияет на расписание и специализации">
          <SegmentedControl
            value={clinicalRole}
            onChange={(next) => {
              setClinicalRole(next);
              if (next !== "doctor") setSelectedSpecializations([]);
            }}
            disabled={busy}
            options={[
              { value: "doctor", label: "Врач" },
              { value: "nurse", label: "Медсестра" },
              { value: "other", label: "Другой" },
            ]}
          />
        </Field>

        {/* ── Специализации (только для врача) ── */}
        {clinicalRole === "doctor" && (canViewSpecs || canManageSpecs) && (
          <Field label="Специализации">
            <Autocomplete
              multiple
              options={allSpecializations}
              getOptionLabel={(s) => s.name}
              value={selectedSpecializations}
              onChange={(_, val) => setSelectedSpecializations(val)}
              disabled={busy || loadingDeps || !canManageSpecs}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderTags={(val, getTagProps) =>
                val.map((opt, idx) => (
                  <Chip
                    {...getTagProps({ index: idx })}
                    key={opt.id}
                    label={opt.name}
                    size="small"
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={
                    loadingDeps
                      ? "Загрузка…"
                      : !canManageSpecs
                      ? "Нет прав на изменение"
                      : "Выберите специализации"
                  }
                />
              )}
            />
          </Field>
        )}

        {/* ── Роль (поиск-комбобокс: ролей у организации может быть много) ── */}
        <Field label="Роль" required hint="Права доступа и группировка в списке">
          <Autocomplete
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
              options={branches}
              value={employeeBranches}
              getOptionLabel={(b) => b.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, val) => setEmployeeBranches(val)}
              disabled={loadingDeps || busy}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    label={option.name}
                    size="small"
                    {...getTagProps({ index })}
                    key={option.id}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={loadingDeps ? "Загрузка…" : "Выберите филиалы"}
                />
              )}
            />
          )}
        </Field>

        {/* ── Доступ в CRM ── */}
        <Field label="Доступ в CRM (филиалы)" hint="Пусто — будет совпадать с филиалами работы">
          <Autocomplete
            multiple
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
                <Chip
                  label={option.name}
                  size="small"
                  {...getTagProps({ index })}
                  key={option.id}
                />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={loadingDeps ? "Загрузка…" : "Как у филиалов работы"}
              />
            )}
          />
        </Field>
      </Stack>
    </DrawerBase>
  );
};

export default OnboardEmployeeDrawer;
