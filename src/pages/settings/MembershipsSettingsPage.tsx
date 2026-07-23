import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  AddOutlined,
  CloseOutlined,
  EditOutlined,
  GroupsOutlined,
  SearchOutlined,
} from "@mui/icons-material";

import SettingsLayout from "./SettingsLayout";
import { AppButton } from "../../components/ui/AppButton";
import { CanAccess } from "../../components/rbac/CanAccess";
import {
  getRoles,
  getMemberships,
  updateMembership,
  type RbacRole,
  type RbacMembership,
  type MembershipUpdatePayload,
} from "../../api/rbac";
import { ApiError } from "../../api/client";
import { usePermissions } from "../../hooks/usePermissions";
import type { RbacBranch } from "../../api/auth";

// ── Error parsing ───────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.payload && typeof err.payload === "object" && "error" in err.payload) {
      const e = (err.payload as Record<string, unknown>).error;
      if (typeof e === "string") return e;
      if (typeof e === "object" && e !== null && "message" in e) {
        return String((e as Record<string, unknown>).message);
      }
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Неизвестная ошибка";
}

// Бэкенд может вернуть один и тот же системный набор ролей по разу на каждую
// организацию. Оставляем роли активной организации — членство тоже принадлежит
// ей, и роль должна быть из той же организации.
function rolesForOrg(roles: RbacRole[], activeOrgId?: number): RbacRole[] {
  if (activeOrgId == null) return roles;
  return roles.filter((r) => r.organizationId === activeOrgId);
}

// ── MembershipFormDrawer ──────────────────────────────────────────────────────

interface MembershipFormDrawerProps {
  open: boolean;
  membership: RbacMembership | null;
  roles: RbacRole[];
  branches: RbacBranch[];
  onClose: () => void;
  onSaved: (m: RbacMembership) => void;
}

function MembershipFormDrawer({
  open,
  membership,
  roles,
  branches,
  onClose,
  onSaved,
}: MembershipFormDrawerProps) {
  const [roleId, setRoleId] = React.useState<number | "">("");
  const [crmBranches, setCrmBranches] = React.useState<RbacBranch[]>([]);
  const [isActive, setIsActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Populate from the membership when opening.
  React.useEffect(() => {
    if (!open || !membership) return;
    setError(null);
    setBusy(false);
    setRoleId(membership.role?.id ?? "");
    setIsActive(membership.isActive);
    // Map embedded BranchShort[] to the full branch options by id.
    const byId = new Map(branches.map((b) => [b.id, b]));
    setCrmBranches(
      membership.branches
        .map((b) => byId.get(b.id))
        .filter((b): b is RbacBranch => Boolean(b)),
    );
  }, [open, membership, branches]);

  const handleSubmit = async () => {
    if (!membership) return;
    setError(null);
    setBusy(true);
    try {
      const payload: MembershipUpdatePayload = {
        roleId: roleId === "" ? null : roleId,
        isActive,
        branchIds: crmBranches.map((b) => b.id),
      };
      const saved = await updateMembership(membership.id, payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 440, md: "36vw" },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        px={2.5}
        py={1.5}
      >
        <Typography variant="h6" fontWeight={600}>
          Доступы участника
        </Typography>
        <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </Stack>

      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2.5 }}>
        <Stack spacing={2.5}>
          {membership && (
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                {membership.username || membership.email || `#${membership.userId}`}
              </Typography>
              {membership.email && (
                <Typography variant="caption" color="text.secondary">
                  {membership.email}
                </Typography>
              )}
              {membership.isOwner && (
                <Chip
                  label="Владелец"
                  size="small"
                  color="primary"
                  sx={{ ml: 1, height: 18, fontSize: 10 }}
                />
              )}
            </Box>
          )}

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* ── Роль ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Роль
            </Typography>
            <TextField
              select
              value={roleId}
              onChange={(e) =>
                setRoleId(e.target.value === "" ? "" : Number(e.target.value))
              }
              fullWidth
              disabled={busy}
              SelectProps={{ displayEmpty: true }}
            >
              <MenuItem value="">Без роли</MenuItem>
              {roles.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* ── Доступ в CRM (филиалы) ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Доступ в CRM (филиалы)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Какие филиалы участник видит в системе
            </Typography>
            <Autocomplete
              multiple
              options={branches}
              value={crmBranches}
              getOptionLabel={(b) => b.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, val) => setCrmBranches(val)}
              disabled={busy}
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
                <TextField {...params} placeholder="Выберите филиалы" />
              )}
            />
          </Stack>

          {/* ── Активность ── */}
          <FormControlLabel
            control={
              <Switch
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={busy}
              />
            }
            label="Активен"
          />
        </Stack>
      </Box>

      <Divider />

      <Box px={2.5} py={1.5} display="flex" justifyContent="flex-end" gap={1.5}>
        <AppButton onClick={onClose} disabled={busy}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          onClick={handleSubmit}
          disabled={busy}
          loading={busy}
        >
          {busy ? "Сохранение…" : "Сохранить"}
        </AppButton>
      </Box>
    </Drawer>
  );
}

// ── MembershipRow ─────────────────────────────────────────────────────────────

interface MembershipRowProps {
  membership: RbacMembership;
  onEdit: () => void;
  canEdit: boolean;
}

function MembershipRow({ membership, onEdit, canEdit }: MembershipRowProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        px: 2,
        py: 1.5,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1.2fr 0.8fr 1fr auto" },
        gap: 1,
        alignItems: "center",
        transition: "box-shadow 0.15s",
        "&:hover": { boxShadow: 2 },
      }}
    >
      {/* User */}
      <Box>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <Typography variant="subtitle2" fontWeight={600}>
            {membership.username || membership.email || `#${membership.userId}`}
          </Typography>
          {membership.isOwner && (
            <Chip label="Владелец" size="small" color="primary" sx={{ height: 18, fontSize: 10 }} />
          )}
          {!membership.isActive && (
            <Chip label="Неактивен" size="small" sx={{ height: 18, fontSize: 10 }} />
          )}
        </Stack>
        {membership.email && (
          <Typography variant="caption" color="text.secondary">
            {membership.email}
          </Typography>
        )}
      </Box>

      {/* Role */}
      <Box>
        {membership.role ? (
          <Chip label={membership.role.name} size="small" variant="outlined" />
        ) : (
          <Typography variant="caption" color="text.disabled" fontStyle="italic">
            Без роли
          </Typography>
        )}
      </Box>

      {/* CRM branches */}
      <Box>
        {membership.branches.length === 0 ? (
          <Typography variant="caption" color="text.disabled" fontStyle="italic">
            Все филиалы
          </Typography>
        ) : (
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            {membership.branches.slice(0, 3).map((b) => (
              <Chip key={b.id} label={b.name} size="small" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
            ))}
            {membership.branches.length > 3 && (
              <Chip
                label={`+${membership.branches.length - 3}`}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: 10 }}
              />
            )}
          </Stack>
        )}
      </Box>

      {/* Actions */}
      <Stack direction="row" alignItems="center" gap={0.5} justifyContent="flex-end">
        {canEdit && (
          <IconButton size="small" onClick={onEdit} aria-label="Редактировать доступы">
            <EditOutlined fontSize="small" />
          </IconButton>
        )}
      </Stack>
    </Paper>
  );
}

// ── MembershipsSettingsPage ───────────────────────────────────────────────────

const MembershipsSettingsPage: React.FC = () => {
  const { activeOrganization, activeMembership } = usePermissions();
  const [memberships, setMemberships] = React.useState<RbacMembership[]>([]);
  const [roles, setRoles] = React.useState<RbacRole[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [snack, setSnack] = React.useState<string | null>(null);

  const [editing, setEditing] = React.useState<RbacMembership | null>(null);

  const branches: RbacBranch[] = React.useMemo(
    () => (activeMembership?.branches ?? []).filter((b) => b.isActive),
    [activeMembership],
  );

  const orgRoles = React.useMemo(
    () => rolesForOrg(roles, activeOrganization?.id),
    [roles, activeOrganization?.id],
  );

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [memData, rolesData] = await Promise.all([
        getMemberships(),
        getRoles(activeOrganization?.id),
      ]);
      setMemberships(memData);
      setRoles(rolesData);
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeOrganization?.id]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaved = (saved: RbacMembership) => {
    setMemberships((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
    setSnack("Доступы участника обновлены");
  };

  // Суперюзеру бэкенд отдаёт memberships всех организаций, из-за чего один и
  // тот же пользователь повторяется по разу на каждую организацию. Показываем
  // только участников активной организации — редактировать чужие отсюда всё
  // равно нельзя. Пока активная организация не определена, показываем всё.
  const orgMemberships = React.useMemo(() => {
    if (activeOrganization?.id == null) return memberships;
    return memberships.filter((m) => m.organizationId === activeOrganization.id);
  }, [memberships, activeOrganization?.id]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgMemberships;
    return orgMemberships.filter(
      (m) =>
        m.username.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.role?.name ?? "").toLowerCase().includes(q),
    );
  }, [orgMemberships, search]);

  return (
    <SettingsLayout>
      <Stack spacing={2} sx={{ height: "100%" }}>
        {/* Header */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
          gap={1.5}
        >
          <Stack direction="row" alignItems="center" gap={1}>
            <GroupsOutlined color="action" />
            <Typography variant="h6" fontWeight={600}>
              Сотрудники и доступы
            </Typography>
            {!loading && (
              <Chip label={orgMemberships.length} size="small" sx={{ height: 20 }} />
            )}
          </Stack>

          <TextField
            size="small"
            placeholder="Поиск участника…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ width: { xs: "100%", md: 240 } }}
          />
        </Stack>

        {loadError && (
          <Alert
            severity="error"
            action={
              <AppButton size="small" color="inherit" onClick={loadData}>
                Повторить
              </AppButton>
            }
          >
            {loadError}
          </Alert>
        )}

        {snack && (
          <Alert severity="success" onClose={() => setSnack(null)}>
            {snack}
          </Alert>
        )}

        {loading && (
          <Stack spacing={1}>
            {[1, 2, 3, 4].map((n) => (
              <Skeleton key={n} variant="rounded" height={64} animation="wave" />
            ))}
          </Stack>
        )}

        {!loading && !loadError && orgMemberships.length === 0 && (
          <Box
            sx={{
              flex: 1,
              minHeight: 200,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: "text.secondary",
              border: (theme) => `1px dashed ${theme.palette.divider}`,
              borderRadius: 1,
              p: 4,
              gap: 1.5,
            }}
          >
            <GroupsOutlined sx={{ fontSize: 40, color: "text.disabled" }} />
            <Typography variant="body2">Нет участников для отображения.</Typography>
            <Typography variant="caption">
              Участники добавляются при создании сотрудника (
              <AddOutlined sx={{ fontSize: 12, verticalAlign: "middle" }} /> Добавить
              сотрудника).
            </Typography>
          </Box>
        )}

        {!loading && orgMemberships.length > 0 && filtered.length === 0 && (
          <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
            <Typography variant="body2">
              Ничего не найдено по запросу «{search}».
            </Typography>
          </Box>
        )}

        {!loading && filtered.length > 0 && (
          <Stack spacing={1}>
            {filtered.map((m) => (
              <CanAccess
                key={m.id}
                permissions="rbac.memberships.update"
                fallback={
                  <MembershipRow membership={m} onEdit={() => setEditing(m)} canEdit={false} />
                }
              >
                <MembershipRow membership={m} onEdit={() => setEditing(m)} canEdit />
              </CanAccess>
            ))}
          </Stack>
        )}
      </Stack>

      <MembershipFormDrawer
        open={Boolean(editing)}
        membership={editing}
        roles={orgRoles}
        branches={branches}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
    </SettingsLayout>
  );
};

export default MembershipsSettingsPage;
