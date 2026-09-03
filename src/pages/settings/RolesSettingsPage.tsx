import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Paper,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
} from "@mui/material";
import {
  AdminPanelSettingsOutlined,
  AddOutlined,
  CloseOutlined,
  EditOutlined,
  ContentCopyOutlined,
  GroupOutlined,
  LockOutlined,
  SearchOutlined,
} from "@mui/icons-material";

import { subtleBg } from "../../theme";
import SettingsLayout from "./SettingsLayout";
import { AppButton } from "../../components/ui/AppButton";
import { CanAccess } from "../../components/rbac/CanAccess";
import {
  getMemberships,
  getPermissions,
  getRoles,
  createRole,
  updateRole,
  type RbacPermission,
  type RbacRole,
  type RoleCreatePayload,
  type RoleUpdatePayload,
} from "../../api/rbac";
import { ApiError } from "../../api/client";
import { usePermissions, retryAuth } from "../../hooks/usePermissions";
import { useFormValidation } from "../../hooks/useFormValidation";
import { getModuleCodeForPermission } from "../../utils/moduleMapping";
import { useT } from "../../i18n/VerticalProvider";
import PermissionPicker, { type PermissionGroup } from "./roles/PermissionPicker";

// ── Category label mapping ──────────────────────────────────────────────────
// Ключи CATEGORY_LABELS фиксированы бэкендом; отображаемые подписи берутся из
// settings.json (roles.categories) через categoryLabel(cat, t), поэтому сама
// функция принимает t и не может жить на уровне модуля.

const CATEGORY_KEYS = [
  "appointments", "patients", "staff", "catalog", "content", "organization",
  "branches", "rbac", "roles", "users", "finance", "warehouse", "reports",
  "attendance", "schedule", "services", "expenses", "achievements",
  "announcements", "billing", "bookings", "chatwoot", "cleaning", "clients",
  "deals", "documents", "ecommerce", "knowledge", "loyalty", "medical",
  "messaging", "notifications", "odoctor", "offerings", "payroll", "pos",
  "printforms", "procurement", "profigram", "programs", "promotions", "retail",
  "reviews", "targets", "tasks", "tenancy", "vaccinations",
] as const;

function categoryLabel(cat: string, t: (key: string) => string): string {
  return (CATEGORY_KEYS as readonly string[]).includes(cat)
    ? t(`roles.categories.${cat}`)
    : cat;
}

// ── Group permissions by category ───────────────────────────────────────────

function groupPermissions(
  permissions: RbacPermission[],
  t: (key: string) => string,
): PermissionGroup[] {
  const map = new Map<string, RbacPermission[]>();
  for (const p of permissions) {
    const cat = p.category || p.code.split(".")[0] || "other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(p);
  }
  return Array.from(map.entries()).map(([cat, items]) => ({
    category: cat,
    label: categoryLabel(cat, t),
    items,
  }));
}

// ── Snackbar ────────────────────────────────────────────────────────────────

type SnackState = {
  open: boolean;
  severity: "success" | "error";
  message: string;
};

function useSnack() {
  const [snack, setSnack] = React.useState<SnackState>({
    open: false,
    severity: "success",
    message: "",
  });
  const show = React.useCallback(
    (severity: "success" | "error", message: string) => {
      setSnack({ open: true, severity, message });
    },
    [],
  );
  const hide = React.useCallback(() => {
    setSnack((s) => ({ ...s, open: false }));
  }, []);
  return { snack, show, hide };
}

// ── RoleFormDrawer ──────────────────────────────────────────────────────────

interface RoleFormDrawerProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: RbacRole | null;
  permissions: RbacPermission[];
  /** Роли организации — источник для «Скопировать права из роли». */
  roles: RbacRole[];
  /** Сколько активных сотрудников работает с этой ролью; undefined — данных нет. */
  memberCount?: number;
  organizationId?: number;
  onClose: () => void;
  onSaved: (role: RbacRole) => void;
}

function RoleFormDrawer({
  open,
  mode,
  initial,
  permissions,
  roles,
  memberCount,
  organizationId,
  onClose,
  onSaved,
}: RoleFormDrawerProps) {
  const { t } = useT("settings");

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
    return t("roles.unknownError");
  }

  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [selectedCodes, setSelectedCodes] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copyAnchor, setCopyAnchor] = React.useState<HTMLElement | null>(null);
  const [copiedFrom, setCopiedFrom] = React.useState<string | null>(null);

  // Reset form when opening
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setCopiedFrom(null);
    if (mode === "edit" && initial) {
      setName(initial.name);
      setCode(initial.code);
      setDescription(initial.description ?? "");
      setSelectedCodes(initial.permissions ?? []);
    } else {
      setName("");
      setCode("");
      setDescription("");
      setSelectedCodes([]);
    }
  }, [open, mode, initial]);

  const isSystemRole = mode === "edit" && !!initial?.isSystem;
  const grouped = React.useMemo(() => groupPermissions(permissions, t), [permissions, t]);

  // Право работает только при включённом модуле организации: canAccess
  // проверяет и право, и модуль. Помечаем права выключенных модулей,
  // чтобы «выдал, а оно не действует» не выглядело поломкой.
  const { enabledModules } = usePermissions();
  const isModuleOff = React.useCallback(
    (permissionCode: string) => {
      const moduleCode = getModuleCodeForPermission(permissionCode);
      return moduleCode !== null && !(enabledModules ?? []).includes(moduleCode);
    },
    [enabledModules],
  );

  // Роли-доноры для «Скопировать права»: сама редактируемая роль и роли без
  // прав в списке бесполезны.
  const donorRoles = React.useMemo(
    () =>
      roles
        .filter((r) => r.id !== initial?.id && r.permissions.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [roles, initial?.id],
  );

  const handleCopyFrom = (role: RbacRole) => {
    setSelectedCodes([...role.permissions]);
    setCopiedFrom(role.name);
    setCopyAnchor(null);
  };

  // Фокус в поиск прав экономит клик мышью, но на телефоне поднял бы клавиатуру
  // поверх формы — поэтому только для точного указателя.
  const hasFinePointer = useMediaQuery("(pointer: fine)");

  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const form = useFormValidation({
    name: name.trim() ? null : t("roles.form.nameRequired"),
    code: code.trim() ? null : t("roles.form.codeRequired"),
  });

  const handleSubmit = async () => {
    if (busy) return;
    if (!form.validate()) return;
    setError(null);
    setBusy(true);
    try {
      let saved: RbacRole;
      if (mode === "create") {
        if (organizationId == null) {
          setError("Сначала выберите организацию.");
          return;
        }
        const payload: RoleCreatePayload = {
          name: name.trim(),
          code: code.trim(),
          organizationId,
          description: description.trim(),
          permissionCodes: selectedCodes,
        };
        saved = await createRole(payload);
      } else {
        const payload: RoleUpdatePayload = {
          name: name.trim(),
          description: description.trim(),
          permissionCodes: selectedCodes,
        };
        saved = await updateRole(initial!.id, payload);
      }
      // The current user may belong to the edited role. Refresh the shared
      // /auth/me/ cache immediately so revoked menu items/buttons disappear.
      window.dispatchEvent(new Event("mamadoc:rbac-changed"));
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const title = mode === "create" ? t("roles.form.createTitle") : t("roles.form.editTitle");

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        onKeyDown: handleKeyDown,
        sx: {
          width: { xs: "100%", sm: 480, md: "40vw" },
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
          {title}
        </Typography>
        <IconButton onClick={busy ? undefined : onClose} aria-label={t("common:actions.close")}>
          <CloseOutlined />
        </IconButton>
      </Stack>

      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2.5 }}>
        <Stack spacing={2.5}>
          {isSystemRole && (
            <Alert severity="warning" icon={<LockOutlined fontSize="small" />}>
              {t("roles.form.systemWarning")}
            </Alert>
          )}

          {mode === "edit" && (memberCount ?? 0) > 0 && (
            <Alert severity="info" icon={<GroupOutlined fontSize="small" />}>
              {t("roles.form.affectsMembers", { count: memberCount })}
            </Alert>
          )}

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label={t("roles.form.nameLabel")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            disabled={busy}
            inputProps={{ maxLength: 120 }}
            InputLabelProps={{ shrink: true }}
            placeholder={t("roles.form.namePlaceholder")}
            {...form.field("name")}
          />

          <TextField
            label={t("roles.form.codeLabel")}
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_-]/g, "_"),
              )
            }
            required
            fullWidth
            disabled={busy || mode === "edit"}
            inputProps={{ maxLength: 80 }}
            InputLabelProps={{ shrink: true }}
            placeholder={t("roles.form.codePlaceholder")}
            {...form.field(
              "code",
              mode === "edit"
                ? t("roles.form.codeLocked")
                : t("roles.form.codeHint"),
            )}
          />

          <TextField
            label={t("roles.form.descriptionLabel")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            disabled={busy}
            multiline
            minRows={2}
            inputProps={{ maxLength: 500 }}
            placeholder={t("roles.form.descriptionPlaceholder")}
          />

          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              {t("roles.form.permissionsTitle")}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
              {t("roles.form.permissionsHint")}
            </Typography>

            {donorRoles.length > 0 && (
              <Stack direction="row" alignItems="center" gap={1} mb={1.5} flexWrap="wrap">
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ContentCopyOutlined />}
                  disabled={busy}
                  onClick={(e) => setCopyAnchor(e.currentTarget)}
                  sx={{ textTransform: "none" }}
                >
                  {t("roles.form.copyFromButton")}
                </Button>
                {copiedFrom && (
                  <Typography variant="caption" color="text.secondary">
                    {t("roles.form.copiedFrom", { role: copiedFrom })}
                  </Typography>
                )}
                <Menu
                  anchorEl={copyAnchor}
                  open={Boolean(copyAnchor)}
                  onClose={() => setCopyAnchor(null)}
                  slotProps={{ paper: { sx: { maxHeight: 320 } } }}
                >
                  {donorRoles.map((r) => (
                    <MenuItem key={r.id} onClick={() => handleCopyFrom(r)}>
                      <Box>
                        <Typography variant="body2">{r.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t("roles.row.permCount", { count: r.permissions.length })}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Menu>
              </Stack>
            )}

            <PermissionPicker
              grouped={grouped}
              allPermissions={permissions}
              selectedCodes={selectedCodes}
              onChange={setSelectedCodes}
              isModuleOff={isModuleOff}
              disabled={busy}
              totalCount={permissions.length}
              initialSelectedCodes={initial?.permissions ?? []}
              autoFocusSearch={hasFinePointer && mode === "edit"}
            />
          </Box>
        </Stack>
      </Box>

      <Divider />

      <Box
        px={2.5}
        py={1.5}
        display="flex"
        justifyContent="flex-end"
        gap={1.5}
      >
        <AppButton onClick={onClose} disabled={busy}>
          {t("common:actions.cancel")}
        </AppButton>
        <AppButton
          variant="contained"
          onClick={handleSubmit}
          disabled={busy}
          loading={busy}
        >
          {busy ? t("common:state.saving") : mode === "create" ? t("common:actions.create") : t("common:actions.save")}
        </AppButton>
      </Box>
    </Drawer>
  );
}

// ── RoleRow ─────────────────────────────────────────────────────────────────

interface RoleRowProps {
  role: RbacRole;
  allPermissions: RbacPermission[];
  /** Активные сотрудники с этой ролью; undefined — список доступов не загрузился. */
  memberCount?: number;
  onEdit: () => void;
  canEdit: boolean;
}

function RoleRow({ role, allPermissions, memberCount, onEdit, canEdit }: RoleRowProps) {
  const { t } = useT("settings");
  // Build a quick lookup to resolve permission names
  const permMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allPermissions) m.set(p.code, p.name || p.code);
    return m;
  }, [allPermissions]);

  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        px: 2,
        py: 1.5,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr auto" },
        gap: 1,
        alignItems: "center",
        transition: "background-color .15s ease, border-color .15s ease, color .15s ease",
        "&:hover": {
          bgcolor: subtleBg(theme, true),
          borderColor: alpha(theme.palette.primary.main, 0.28),
        },
      })}
    >
      {/* Name + code + system badge */}
      <Box>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <Typography variant="subtitle2" fontWeight={600}>
            {role.name}
          </Typography>
          {role.isSystem && (
            <Chip
              label={t("roles.row.systemChip")}
              size="small"
              color="default"
              icon={<LockOutlined />}
              sx={{ height: 18, fontSize: 10 }}
            />
          )}
          {(memberCount ?? 0) > 0 && (
            <Tooltip title={t("roles.row.memberCountTooltip")} arrow placement="top">
              <Chip
                label={t("roles.row.memberCount", { count: memberCount })}
                size="small"
                variant="outlined"
                icon={<GroupOutlined />}
                sx={{ height: 18, fontSize: 10, "& .MuiChip-icon": { fontSize: 12 } }}
              />
            </Tooltip>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
          {role.code}
        </Typography>
        {role.description ? (
          <Typography
            variant="body2"
            color="text.secondary"
            mt={0.25}
            sx={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            }}
          >
            {role.description}
          </Typography>
        ) : null}
      </Box>

      {/* Permissions summary */}
      <Box>
        {role.permissions.length === 0 ? (
          <Typography variant="caption" color="text.disabled" fontStyle="italic">
            {t("roles.row.noPermissions")}
          </Typography>
        ) : (
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            {role.permissions.slice(0, 5).map((code) => (
              <Tooltip key={code} title={code} arrow placement="top">
                <Chip
                  label={permMap.get(code) ?? code}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 20,
                    fontSize: 10,
                    maxWidth: 160,
                    "& .MuiChip-label": {
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    },
                  }}
                />
              </Tooltip>
            ))}
            {role.permissions.length > 5 && (
              <Chip
                label={`+${role.permissions.length - 5}`}
                size="small"
                variant="outlined"
                color="default"
                sx={{ height: 20, fontSize: 10 }}
              />
            )}
          </Stack>
        )}
        <Typography variant="caption" color="text.secondary" display="block" mt={0.25}>
          {t("roles.row.permCount", { count: role.permissions.length })}
        </Typography>
      </Box>

      {/* Actions */}
      <Stack direction="row" alignItems="center" gap={0.5} justifyContent="flex-end">
        {canEdit && (
          <Tooltip
            title={
              role.isSystem
                ? t("roles.row.editSystemTooltip")
                : t("roles.row.editTooltip")
            }
            placement="top"
          >
            <span>
              <IconButton
                size="small"
                onClick={onEdit}
                aria-label={t("roles.row.editAria")}
              >
                <EditOutlined fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>
    </Paper>
  );
}

// ── RolesSettingsPage ───────────────────────────────────────────────────────

const RolesSettingsPage: React.FC = () => {
  const { t } = useT("settings");

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
    return t("roles.unknownError");
  }

  const { activeOrganization } = usePermissions();
  const [roles, setRoles] = React.useState<RbacRole[]>([]);
  const [permissions, setPermissions] = React.useState<RbacPermission[]>([]);
  // null — доступы не загрузились (нет права users.view или ошибка): счётчик
  // сотрудников тогда просто не показываем, страница ролей от него не зависит.
  const [memberCounts, setMemberCounts] = React.useState<Map<number, number> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  // Drawer state
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<"create" | "edit">("create");
  const [editingRole, setEditingRole] = React.useState<RbacRole | null>(null);

  // Inline toggle snackbar
  const { snack, show: showSnack, hide: hideSnack } = useSnack();

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rolesData, permsData, membershipsData] = await Promise.all([
        getRoles(activeOrganization?.id),
        getPermissions(),
        getMemberships().catch(() => null),
      ]);
      setRoles(rolesData);
      setPermissions(permsData);
      setMemberCounts(
        membershipsData
          ? membershipsData.reduce((acc, m) => {
              if (!m.isActive || m.role?.id == null) return acc;
              acc.set(m.role.id, (acc.get(m.role.id) ?? 0) + 1);
              return acc;
            }, new Map<number, number>())
          : null,
      );
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeOrganization?.id]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    setEditingRole(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  };

  const handleOpenEdit = (role: RbacRole) => {
    setEditingRole(role);
    setDrawerMode("edit");
    setDrawerOpen(true);
  };

  const handleSaved = (saved: RbacRole) => {
    setRoles((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    // Если отредактировали собственную роль — обновить права текущей сессии
    // сразу, не дожидаясь фокус-рефетча. Остальные пользователи подтянут
    // изменения при возврате на вкладку или перезагрузке.
    retryAuth();
    showSnack(
      "success",
      drawerMode === "create" ? t("roles.createdSnack") : t("roles.updatedSnack"),
    );
  };


  // Суперюзеру бэкенд отдаёт роли всех организаций, из-за чего одинаковые
  // системные роли («Администратор», «Бухгалтер», …) повторяются по разу на
  // каждую организацию. Показываем только роли активной организации — иначе
  // можно случайно отредактировать роль чужой клиники. Пока активная
  // организация не определена, показываем всё как есть.
  const orgRoles = React.useMemo(() => {
    if (activeOrganization?.id == null) return roles;
    return roles.filter((r) => r.organizationId === activeOrganization.id);
  }, [roles, activeOrganization?.id]);

  // Filter
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgRoles;
    return orgRoles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q),
    );
  }, [orgRoles, search]);

  // Separate system and custom roles
  const systemRoles = filtered.filter((r) => r.isSystem);
  const customRoles = filtered.filter((r) => !r.isSystem);

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
            <AdminPanelSettingsOutlined color="action" />
            <Typography variant="h6" fontWeight={600}>
              {t("roles.title")}
            </Typography>
            {!loading && (
              <Chip
                label={orgRoles.length}
                size="small"
                color="default"
                sx={{ height: 20 }}
              />
            )}
          </Stack>

          <Stack
            direction="row"
            gap={1}
            alignItems="center"
            sx={{ width: { xs: "100%", md: "auto" } }}
          >
            <TextField
              size="small"
              placeholder={t("roles.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ flex: { xs: 1, md: "none" }, width: { md: 220 }, minWidth: 0 }}
            />
            <CanAccess permissions="rbac.roles.create">
              <AppButton
                variant="contained"
                startIcon={<AddOutlined />}
                onClick={handleOpenCreate}
                disabled={loading}
                sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
              >
                {t("roles.createButton")}
              </AppButton>
            </CanAccess>
          </Stack>
        </Stack>

        {/* Error */}
        {loadError && (
          <Alert
            severity="error"
            action={
              <AppButton size="small" color="inherit" onClick={loadData}>
                {t("common:actions.retry")}
              </AppButton>
            }
          >
            {loadError}
          </Alert>
        )}

        {/* Inline snackbar (simple Alert at top) */}
        {snack.open && (
          <Alert severity={snack.severity} onClose={hideSnack}>
            {snack.message}
          </Alert>
        )}

        {/* Loading skeletons */}
        {loading && (
          <Stack spacing={1}>
            {[1, 2, 3, 4].map((n) => (
              <Skeleton
                key={n}
                variant="rounded"
                height={76}
                animation="wave"
              />
            ))}
          </Stack>
        )}

        {/* Empty state */}
        {!loading && !loadError && orgRoles.length === 0 && (
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
            <AdminPanelSettingsOutlined sx={{ fontSize: 40, color: "text.disabled" }} />
            <Typography variant="body2">{t("roles.emptyTitle")}</Typography>
            <CanAccess permissions="rbac.roles.create">
              <AppButton
                variant="outlined"
                startIcon={<AddOutlined />}
                onClick={handleOpenCreate}
              >
                {t("roles.createFirst")}
              </AppButton>
            </CanAccess>
          </Box>
        )}

        {/* Search empty */}
        {!loading && orgRoles.length > 0 && filtered.length === 0 && (
          <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
            <Typography variant="body2">
              {t("roles.emptySearch", { query: search })}
            </Typography>
          </Box>
        )}

        {/* Custom roles list */}
        {!loading && customRoles.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary" mb={1} display="block">
              {t("roles.orgRolesSection")}
            </Typography>
            <Stack spacing={1}>
              {customRoles.map((role) => (
                <CanAccess
                  key={role.id}
                  permissions="rbac.roles.update"
                  fallback={
                    <RoleRow
                      role={role}
                      allPermissions={permissions}
                      memberCount={memberCounts?.get(role.id)}
                      onEdit={() => handleOpenEdit(role)}
                      canEdit={false}
                    />
                  }
                >
                  <RoleRow
                    role={role}
                    allPermissions={permissions}
                    memberCount={memberCounts?.get(role.id)}
                    onEdit={() => handleOpenEdit(role)}
                    canEdit
                  />
                </CanAccess>
              ))}
            </Stack>
          </Box>
        )}

        {/* System roles list */}
        {!loading && systemRoles.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary" mb={1} display="block">
              {t("roles.systemRolesSection")}
            </Typography>
            <Stack spacing={1}>
              {systemRoles.map((role) => (
                <CanAccess
                  key={role.id}
                  permissions="rbac.roles.update"
                  fallback={
                    <RoleRow
                      role={role}
                      allPermissions={permissions}
                      memberCount={memberCounts?.get(role.id)}
                      onEdit={() => handleOpenEdit(role)}
                      canEdit={false}
                    />
                  }
                >
                  <RoleRow
                    role={role}
                    allPermissions={permissions}
                    memberCount={memberCounts?.get(role.id)}
                    onEdit={() => handleOpenEdit(role)}
                    canEdit
                  />
                </CanAccess>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>

      {/* Edit / Create Drawer */}
      <RoleFormDrawer
        open={drawerOpen}
        mode={drawerMode}
        initial={editingRole}
        permissions={permissions}
        roles={orgRoles}
        memberCount={editingRole ? memberCounts?.get(editingRole.id) : undefined}
        organizationId={activeOrganization?.id}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />
    </SettingsLayout>
  );
};

export default RolesSettingsPage;
