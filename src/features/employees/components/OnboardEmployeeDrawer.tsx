import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import { useNotification } from "@refinedev/core";

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
import ServicePhotoUploader from "../../../components/services/ServicePhotoUploader";
import { PhoneCountryCodeSelect } from "../../../components/ui/PhoneCountryCodeSelect";
import { composePhone, getPhoneLocalMaxLength, type PhoneCountryCode } from "../../../utility/phone";
import {
  validateFullName,
  validatePhoneLocal,
  validateEmail,
  validateUsername,
  validatePassword,
} from "../employeeValidation";

export type OnboardEmployeeDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (row: EmployesRow) => void;
};

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const suffix = Array.from({ length: 10 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
  return `MamaDoc-${suffix}`;
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

  // ── photo ─────────────────────────────────────────────────────────────────────
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  // ── employee fields ───────────────────────────────────────────────────────────
  const [fullName, setFullName] = React.useState("");
  const [phoneCountry, setPhoneCountry] = React.useState<PhoneCountryCode>("+996");
  const [phoneLocal, setPhoneLocal] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"active" | "inactive" | "fired">("active");
  const [clinicalRole, setClinicalRole] = React.useState<"doctor" | "nurse" | "other">("other");

  // ── account fields ────────────────────────────────────────────────────────────
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

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
    username: validateUsername(username),
    password: validatePassword(password),
  }), [fullName, phoneLocal, phoneCountry, email, username, password]);

  const hasLogin = Boolean(username.trim() || email.trim() || phoneLocal.trim());
  const hasRequiredFields =
    !errors.fullName &&
    !errors.phone &&
    !errors.email &&
    !errors.username &&
    !errors.password &&
    hasLogin &&
    password.length >= 8 &&
    roleId !== "" &&
    employeeBranches.length > 0 &&
    branches.length > 0;

  const canSubmit = hasRequiredFields && !busy;

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
      getRoles().then((r) => { if (!cancelled) setRoles(r); }),
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
  }, [open, notify, canViewSpecs, canManageSpecs]);

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
      setPhoneCountry("+996");
      setPhoneLocal("");
      setEmail("");
      setFirstName("");
      setLastName("");
      setUsername("");
      setPassword(generateTempPassword());
      setShowPassword(false);
      setStatus("active");
      setClinicalRole("other");
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

  React.useEffect(() => {
    if (open) {
      setPassword((current) => current || generateTempPassword());
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
    if (!canSubmit) return;

    setSubmitError(null);
    setBusy(true);
    try {
      const composedPhone = composePhone(phoneCountry, phoneLocal);
      const payload = {
        fullName: fullName.trim(),
        roleId: roleId as number,
        employeeBranchIds: employeeBranches.map((b) => b.id),
        organizationId: activeOrganization?.id ?? undefined,
        email: email.trim() || undefined,
        phone: composedPhone ?? undefined,
        username: username.trim() || undefined,
        password,                       // no trim on passwords
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
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
      submitDisabled={submitAttempted && !canSubmit}
    >
      <Stack spacing={2.5}>
        {submitError && (
          <Alert severity="error" onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        {/* ── Фото ── */}
        <ServicePhotoUploader
          photoFile={photoFile}
          photoPreview={photoPreview}
          onPickPhoto={handlePickPhoto}
          inputId="onboard-employee-photo"
        />

        {/* ── ФИО ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            ФИО *
          </Typography>
          <TextField
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onBlur={() => touch("fullName")}
            fullWidth
            placeholder="Иванов Иван Иванович"
            required
            disabled={busy}
            inputProps={{ maxLength: 255 }}
            error={Boolean(showError("fullName"))}
            helperText={showError("fullName")}
          />
        </Stack>

        {/* ── Телефон ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
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
              }}
              fullWidth
              placeholder={getPhoneLocalMaxLength(phoneCountry) === 10 ? "XXX XXX XXXX" : "XXX XXX XXX"}
              disabled={busy}
              inputProps={{ inputMode: "tel", pattern: "[0-9]*", maxLength: getPhoneLocalMaxLength(phoneCountry) }}
            />
          </Box>
        </Stack>

        {/* ── Email ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            Email
          </Typography>
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
        </Stack>

        {/* ── Статус ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            Статус
          </Typography>
          <TextField
            select
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "inactive" | "fired")}
            fullWidth
            disabled={busy}
          >
            <MenuItem value="active">Работает</MenuItem>
            <MenuItem value="inactive">Не работает</MenuItem>
            <MenuItem value="fired">Уволен</MenuItem>
          </TextField>
        </Stack>

        {/* ── Тип сотрудника ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            Тип сотрудника
          </Typography>
          <TextField
            select
            value={clinicalRole}
            onChange={(e) => {
              const next = e.target.value as "doctor" | "nurse" | "other";
              setClinicalRole(next);
              if (next !== "doctor") setSelectedSpecializations([]);
            }}
            fullWidth
            disabled={busy}
          >
            <MenuItem value="doctor">Врач</MenuItem>
            <MenuItem value="nurse">Медсестра</MenuItem>
            <MenuItem value="other">Другой сотрудник</MenuItem>
          </TextField>
        </Stack>

        {/* ── Специализации (только для врача) ── */}
        {clinicalRole === "doctor" && (canViewSpecs || canManageSpecs) && (
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Специализации
            </Typography>
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
          </Stack>
        )}

        <Divider />

        <Alert severity="info">
          При сохранении автоматически создаётся пользователь для входа в систему,
          членство в организации и карточка сотрудника.
        </Alert>

        {/* ── Учётная запись ── */}
        <Stack spacing={2.5}>
          {/* ── Имя / Фамилия ── */}
          <Stack direction="row" spacing={1.5}>
            <Stack spacing={0.5} flex={1}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Имя
              </Typography>
              <TextField
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                fullWidth
                placeholder="Иван"
                disabled={busy}
              />
            </Stack>
            <Stack spacing={0.5} flex={1}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Фамилия
              </Typography>
              <TextField
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                fullWidth
                placeholder="Иванов"
                disabled={busy}
              />
            </Stack>
          </Stack>

          {/* ── Логин ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Логин
            </Typography>
            <TextField
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => touch("username")}
              fullWidth
              placeholder="Можно оставить пустым, если указан телефон или email"
              disabled={busy}
              inputProps={{ maxLength: 150 }}
              error={Boolean(showError("username"))}
              helperText={showError("username") || "Если не указан, backend использует email или телефон"}
            />
          </Stack>

          {/* ── Пароль ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Пароль *
            </Typography>
            <TextField
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => touch("password")}
              fullWidth
              placeholder="Минимум 8 символов"
              type={showPassword ? "text" : "password"}
              disabled={busy}
              error={Boolean(showError("password"))}
              helperText={showError("password") || "Передайте этот пароль сотруднику для первого входа"}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowPassword((v) => !v)}
                      edge="end"
                    >
                      {showPassword ? (
                        <VisibilityOffOutlined fontSize="small" />
                      ) : (
                        <VisibilityOutlined fontSize="small" />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>

          {/* ── Роль ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Роль *
            </Typography>
            <TextField
              select
              value={roleId}
              onChange={(e) => setRoleId(Number(e.target.value))}
              fullWidth
              required
              disabled={loadingDeps || busy}
              SelectProps={{ displayEmpty: true }}
            >
              <MenuItem value="" disabled>
                {loadingDeps ? "Загрузка…" : "Выберите роль"}
              </MenuItem>
              {roles.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* ── Филиалы работы ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Филиалы работы *
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Где сотрудник работает операционно
            </Typography>
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
          </Stack>

          {/* ── Доступ в CRM ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Доступ в CRM (филиалы)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Оставьте пустым — будет совпадать с филиалами работы
            </Typography>
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
          </Stack>
        </Stack>
      </Stack>
    </DrawerBase>
  );
};

export default OnboardEmployeeDrawer;
