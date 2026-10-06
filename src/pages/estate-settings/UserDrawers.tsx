import React from "react";
import { Alert, Box, Button, Drawer, FormControlLabel, IconButton, MenuItem, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { inviteUser, updateOrgUser, type InviteInput, type MatrixRole, type OrgUser } from "../../api/estateSettings";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { StatusPill } from "../construction/shared";
import { useWorkingEmployees } from "../estate-ops/hooks";
import { ConfirmDialog, FormDrawer, InfoRow } from "../realty-finance/shared";
import { errorMessage, useRefreshSettings, useSettingsCan } from "./hooks";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Карточка участника: роль, флаг 2FA, блокировка (`PATCH /users/<id>/`). */
export function UserDrawer({ user, open, roles, onClose }: { user: OrgUser | null; open: boolean; roles: MatrixRole[]; onClose: () => void }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const refresh = useRefreshSettings();
  const { enqueueSnackbar } = useSnackbar();
  const perms = useSettingsCan();
  const { activeMembership } = usePermissions();
  const [blockOpen, setBlockOpen] = React.useState(false);
  // `id` участника = id членства: себя узнаём по активному членству (бэк и так не даст заблокировать себя — 400).
  const isMe = user != null && activeMembership?.id === user.id;
  const canEdit = perms.usersUpdate && user != null && !user.isOwner;

  const update = useMutation({
    mutationFn: (body: { status?: "active" | "blocked"; roleId?: number; twoFa?: boolean }) => updateOrgUser((user as OrgUser).id, body, scope),
    onSuccess: (_, body) => {
      setBlockOpen(false);
      refresh({ access: body.roleId != null && isMe });
      enqueueSnackbar(body.status === "blocked" ? t("roles.users.blocked") : body.status === "active" ? t("roles.users.unblocked") : body.roleId != null ? t("roles.users.roleChanged") : t("roles.users.twoFaChanged"), { variant: "success" });
    },
    onError: (error) => {
      if (!blockOpen) enqueueSnackbar(errorMessage(error, t("common.failed")), { variant: "error" });
    },
  });
  React.useEffect(() => {
    setBlockOpen(false);
    update.reset();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс при смене карточки

  // Роль пользователя может не попасть в матрицу (нет rbac.roles.view) — оставляем её в списке подписью из пользователя.
  const roleOptions = user?.roleId != null && !roles.some((r) => r.id === user.roleId) ? [...roles, { id: user.roleId, label: user.roleName, isSystem: true } as MatrixRole] : roles;

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 440 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("roles.users.cardTitle")}</Typography>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {user?.name || user?.email || ""}
          </Typography>
        </Box>
        {user && <StatusPill label={t(`roles.users.status_${user.status}`, { defaultValue: user.status })} tone={user.status === "blocked" ? "error" : "success"} />}
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2.25, alignContent: "start" }}>
        {!user ? (
          <Alert severity="info">{t("common.emptyFiltered")}</Alert>
        ) : (
          <>
            <Box>
              {user.position && <InfoRow label={t("roles.users.position")} value={user.position} />}
              <InfoRow label={t("roles.users.email")} value={user.email || "—"} />
              <InfoRow label={t("roles.users.lastLogin")} value={user.lastLogin ? dayjs(user.lastLogin).format("DD.MM.YYYY HH:mm") : t("common.never")} />
            </Box>
            {canEdit ? (
              <TextField
                select
                size="small"
                label={t("roles.users.changeRole")}
                value={user.roleId ?? ""}
                disabled={update.isPending}
                onChange={(e) => {
                  const roleId = Number(e.target.value);
                  if (roleId && roleId !== user.roleId) update.mutate({ roleId });
                }}
              >
                {roleOptions.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.label}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <InfoRow label={t("roles.users.role")} value={[user.roleName, user.isOwner ? t("roles.users.owner") : null].filter(Boolean).join(" · ") || "—"} />
            )}
            <Box>
              <FormControlLabel
                control={<Switch checked={user.twoFa} disabled={!canEdit || update.isPending} onChange={(e) => update.mutate({ twoFa: e.target.checked })} />}
                label={t("roles.users.twoFaSwitch")}
              />
              <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("roles.users.twoFaNote")}</Typography>
            </Box>
            {canEdit && !isMe && (
              <Box>
                {user.status === "blocked" ? (
                  <Button variant="outlined" onClick={() => update.mutate({ status: "active" })} disabled={update.isPending}>
                    {t("roles.users.unblock")}
                  </Button>
                ) : (
                  <Button variant="outlined" color="error" onClick={() => setBlockOpen(true)} disabled={update.isPending}>
                    {t("roles.users.block")}
                  </Button>
                )}
              </Box>
            )}
          </>
        )}
      </Box>
      <ConfirmDialog
        open={blockOpen}
        title={t("roles.users.blockTitle")}
        text={t("roles.users.blockText", { name: user?.name || user?.email || "" })}
        confirmLabel={t("roles.users.block")}
        danger
        busy={update.isPending}
        error={update.error}
        onConfirm={() => update.mutate({ status: "blocked" })}
        onClose={() => {
          setBlockOpen(false);
          update.reset();
        }}
      />
    </Drawer>
  );
}

/**
 * «Пригласить пользователя» (`POST /users/invite/`): сотрудник из кадров
 * (без учётки в организации) или e-mail с именем. Письмо бэк не шлёт.
 */
export function InviteDrawer({ open, roles, users, onClose, onInvited }: { open: boolean; roles: MatrixRole[]; users: OrgUser[]; onClose: () => void; onInvited: (user: OrgUser) => void }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const refresh = useRefreshSettings();
  const { enqueueSnackbar } = useSnackbar();
  const canPersonnel = useCan("personnel.view");
  const employees = useWorkingEmployees(open && canPersonnel);
  const taken = React.useMemo(() => new Set(users.map((u) => u.employeeId).filter((id): id is number => id != null)), [users]);
  const free = employees.filter((e) => !taken.has(e.id));
  const [mode, setMode] = React.useState<"employee" | "email">("employee");
  const [employeeId, setEmployeeId] = React.useState<number | "">("");
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [roleId, setRoleId] = React.useState<number | "">("");
  const [twoFa, setTwoFa] = React.useState(true);
  const [touched, setTouched] = React.useState(false);
  const assignable = roles.filter((r) => !r.isSystem);

  const save = useMutation({
    mutationFn: (input: InviteInput) => inviteUser(input, scope),
    onSuccess: (user) => {
      refresh();
      enqueueSnackbar(t("roles.users.invitedDone"), { variant: "success" });
      onClose();
      onInvited(user);
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setMode(canPersonnel ? "employee" : "email");
    setEmployeeId("");
    setEmail("");
    setName("");
    setRoleId("");
    setTwoFa(true);
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  const employeeMode = mode === "employee";
  const emailBad = !EMAIL.test(email.trim());
  const invalid = roleId === "" || (employeeMode ? employeeId === "" : emailBad || !name.trim());

  return (
    <FormDrawer
      open={open}
      title={t("roles.users.inviteTitle")}
      submitLabel={t("roles.users.inviteSend")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (invalid || typeof roleId !== "number") return;
        save.mutate(employeeMode ? { employeeId: Number(employeeId), roleId, twoFa } : { email: email.trim(), name: name.trim(), roleId, twoFa });
      }}
    >
      {canPersonnel && (
        <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} fullWidth>
          <ToggleButton value="employee">{t("roles.users.inviteBy_employee")}</ToggleButton>
          <ToggleButton value="email">{t("roles.users.inviteBy_email")}</ToggleButton>
        </ToggleButtonGroup>
      )}
      {employeeMode ? (
        free.length === 0 ? (
          <Alert severity="info">{t("roles.users.noEmployees")}</Alert>
        ) : (
          <TextField
            select
            size="small"
            label={t("roles.users.employee")}
            value={employeeId}
            onChange={(e) => setEmployeeId(Number(e.target.value))}
            error={touched && employeeId === ""}
            helperText={touched && employeeId === "" ? t("common.required") : t("roles.users.employeeHint")}
          >
            {free.map((e) => (
              <MenuItem key={e.id} value={e.id}>
                {[e.name, e.position].filter(Boolean).join(" · ")}
              </MenuItem>
            ))}
          </TextField>
        )
      ) : (
        <>
          <TextField size="small" label={t("roles.users.inviteName")} value={name} onChange={(e) => setName(e.target.value)} error={touched && !name.trim()} helperText={touched && !name.trim() ? t("common.required") : undefined} />
          <TextField
            size="small"
            type="email"
            label={t("roles.users.inviteEmail")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={touched && emailBad}
            helperText={touched && emailBad ? t("roles.users.badEmail") : undefined}
          />
        </>
      )}
      <TextField select size="small" label={t("roles.users.inviteRole")} value={roleId} onChange={(e) => setRoleId(Number(e.target.value))} error={touched && roleId === ""} helperText={touched && roleId === "" ? t("common.required") : undefined}>
        {assignable.map((r) => (
          <MenuItem key={r.id} value={r.id}>
            {r.label}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel control={<Switch checked={twoFa} onChange={(e) => setTwoFa(e.target.checked)} />} label={t("roles.users.inviteTwoFa")} />
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("roles.users.inviteNote")}</Typography>
    </FormDrawer>
  );
}
