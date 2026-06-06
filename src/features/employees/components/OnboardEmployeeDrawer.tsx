import React from "react";
import {
  Alert,
  Autocomplete,
  Chip,
  Collapse,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import { useNotification } from "@refinedev/core";

import DrawerBase from "./DrawerBase";
import {
  onboardEmployee,
  createEmployee,
  type OnboardEmployeeResponse,
  type DjangoEmployee,
} from "../../../api/staff";
import { getBranches, type DjangoBranch } from "../../../api/organization";
import { getRoles, type RbacRole } from "../../../api/rbac";
import { usePermissions } from "../../../hooks/usePermissions";
import { mapDjangoFullToRow } from "../viewModel";
import type { EmployesRow } from "../types";

export type OnboardEmployeeDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (row: EmployesRow) => void;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function validateEmail(val: string): string {
  if (!val.trim()) return "";
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  if (!ok) return "Некорректный формат email";
  const lower = val.toLowerCase();
  if (lower.endsWith("@mai.ru")) return "Опечатка? Возможно, @mail.ru";
  if (lower.endsWith("@gmai.com") || lower.endsWith("@gamil.com"))
    return "Опечатка? Возможно, @gmail.com";
  return "";
}

// ── component ─────────────────────────────────────────────────────────────────

const OnboardEmployeeDrawer: React.FC<OnboardEmployeeDrawerProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const { open: notify } = useNotification();
  const { activeOrganization, activeBranch } = usePermissions();

  // ── access toggle ─────────────────────────────────────────────────────────────
  const [grantAccess, setGrantAccess] = React.useState(false);

  // ── base form state ───────────────────────────────────────────────────────────
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [emailError, setEmailError] = React.useState("");
  const [status, setStatus] = React.useState<"active" | "inactive" | "fired">("active");
  const [notes, setNotes] = React.useState("");

  // ── account fields (shown when grantAccess === true) ─────────────────────────
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

  // ── selects data ─────────────────────────────────────────────────────────────
  const [roles, setRoles] = React.useState<RbacRole[]>([]);
  const [branches, setBranches] = React.useState<DjangoBranch[]>([]);
  const [loadingDeps, setLoadingDeps] = React.useState(false);

  // ── selected values (account mode) ───────────────────────────────────────────
  const [roleId, setRoleId] = React.useState<number | "">("");
  const [employeeBranches, setEmployeeBranches] = React.useState<DjangoBranch[]>([]);
  const [userAccessBranches, setUserAccessBranches] = React.useState<DjangoBranch[]>([]);
  const [overrideUserAccess, setOverrideUserAccess] = React.useState(false);

  // ── submit state ─────────────────────────────────────────────────────────────
  const [busy, setBusy] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // ── load roles + branches when access toggle is on and drawer opens ───────────
  React.useEffect(() => {
    if (!open || !grantAccess) return;
    let cancelled = false;
    setLoadingDeps(true);
    Promise.all([getRoles(), getBranches()])
      .then(([r, b]) => {
        if (!cancelled) {
          setRoles(r);
          setBranches(b);
        }
      })
      .catch((err) => {
        if (!cancelled)
          notify?.({ type: "error", message: `Ошибка загрузки данных: ${err?.message ?? err}` });
      })
      .finally(() => {
        if (!cancelled) setLoadingDeps(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, grantAccess, notify]);

  // ── reset on close ────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setGrantAccess(false);
      setFullName("");
      setPhone("");
      setEmail("");
      setEmailError("");
      setFirstName("");
      setLastName("");
      setUsername("");
      setPassword("");
      setShowPassword(false);
      setStatus("active");
      setNotes("");
      setRoleId("");
      setEmployeeBranches([]);
      setUserAccessBranches([]);
      setOverrideUserAccess(false);
      setSubmitError(null);
      setBusy(false);
    }
  }, [open]);

  // ── validation ────────────────────────────────────────────────────────────────
  const canSubmit = React.useMemo(() => {
    if (!fullName.trim() || emailError || busy) return false;
    if (grantAccess) {
      return roleId !== "" && employeeBranches.length > 0;
    }
    return true;
  }, [fullName, emailError, busy, grantAccess, roleId, employeeBranches]);

  // ── submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setBusy(true);
    try {
      let employeeRow: EmployesRow;

      if (grantAccess) {
        const payload = {
          fullName: fullName.trim(),
          roleId: roleId as number,
          employeeBranchIds: employeeBranches.map((b) => b.id),
          organizationId: activeOrganization?.id ?? undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          username: username.trim() || undefined,
          password: password.trim() || undefined,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          userBranchAccessIds: overrideUserAccess
            ? userAccessBranches.map((b) => b.id)
            : undefined,
          status,
          notes: notes.trim() || undefined,
        };
        const res: OnboardEmployeeResponse = await onboardEmployee(payload);
        employeeRow = mapDjangoFullToRow(res.employee);
        notify?.({ type: "success", message: `Сотрудник ${res.employee.fullName} создан` });
      } else {
        const emp: DjangoEmployee = await createEmployee({
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
          status,
          branchId: activeBranch?.id ?? null,
          organizationId: activeOrganization?.id ?? null,
        });
        employeeRow = mapDjangoFullToRow(emp);
        notify?.({ type: "success", message: `Сотрудник ${emp.fullName} создан` });
      }

      onCreated(employeeRow);
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Не удалось создать сотрудника";
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
      submitDisabled={!canSubmit}
    >
      <Stack spacing={2.5}>
        {submitError && (
          <Alert severity="error" onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        {/* ── ФИО ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            ФИО *
          </Typography>
          <TextField
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            fullWidth
            placeholder="Иванов Иван Иванович"
            required
            disabled={busy}
          />
        </Stack>

        {/* ── Телефон ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            Телефон
          </Typography>
          <TextField
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            fullWidth
            placeholder="+996 XXX XXX XXX"
            inputProps={{ inputMode: "tel" }}
            disabled={busy}
          />
        </Stack>

        {/* ── Email ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            Email
          </Typography>
          <TextField
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(validateEmail(e.target.value));
            }}
            fullWidth
            placeholder="example@mail.com"
            type="email"
            error={!!emailError}
            helperText={emailError}
            disabled={busy}
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
            onChange={(e) =>
              setStatus(e.target.value as "active" | "inactive" | "fired")
            }
            fullWidth
            disabled={busy}
          >
            <MenuItem value="active">Работает</MenuItem>
            <MenuItem value="inactive">Не работает</MenuItem>
            <MenuItem value="fired">Уволен</MenuItem>
          </TextField>
        </Stack>

        {/* ── Заметки ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            Заметки
          </Typography>
          <TextField
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 100))}
            fullWidth
            multiline
            minRows={2}
            placeholder="Дополнительная информация (до 100 символов)"
            helperText={`${notes.length}/100`}
            disabled={busy}
          />
        </Stack>

        <Divider />

        {/* ── Предоставить доступ в систему ── */}
        <FormControlLabel
          control={
            <Switch
              checked={grantAccess}
              onChange={(e) => setGrantAccess(e.target.checked)}
              disabled={busy}
            />
          }
          label={
            <Stack>
              <Typography variant="body2" fontWeight={600}>
                Предоставить доступ в систему
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Создать учётную запись пользователя с ролью и доступом к CRM
              </Typography>
            </Stack>
          }
          sx={{ alignItems: "flex-start", ml: 0 }}
        />

        {/* ── Поля учётной записи (только при grantAccess) ── */}
        <Collapse in={grantAccess} unmountOnExit>
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

            {/* ── Username ── */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Логин (username)
              </Typography>
              <TextField
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                fullWidth
                placeholder="ivanov_ivan"
                disabled={busy}
              />
            </Stack>

            {/* ── Password ── */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Пароль (необязательно)
              </Typography>
              <TextField
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                placeholder="Минимум 8 символов"
                type={showPassword ? "text" : "password"}
                disabled={busy}
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
            </Stack>

            {/* ── Доступ к CRM ── */}
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
        </Collapse>
      </Stack>
    </DrawerBase>
  );
};

export default OnboardEmployeeDrawer;
