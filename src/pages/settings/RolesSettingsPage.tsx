import React from "react";
import {
  Alert,
  Box,
  Chip,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import {
  AdminPanelSettingsOutlined,
  AddOutlined,
  CloseOutlined,
  EditOutlined,
  ExpandMoreOutlined,
  LockOutlined,
  SearchOutlined,
} from "@mui/icons-material";
import Checkbox from "@mui/material/Checkbox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";

import { subtleBg } from "../../theme";
import SettingsLayout from "./SettingsLayout";
import { AppButton } from "../../components/ui/AppButton";
import { CanAccess } from "../../components/rbac/CanAccess";
import {
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
import { getModuleCodeForPermission } from "../../utils/moduleMapping";

// ── Category label mapping ──────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  appointments: "Приёмы",
  patients: "Пациенты",
  staff: "Сотрудники",
  catalog: "Услуги",
  content: "Контент",
  organization: "Организация",
  branches: "Филиалы",
  rbac: "Доступы и роли",
  roles: "Роли",
  users: "Пользователи",
  finance: "Финансы",
  warehouse: "Склад",
  reports: "Отчёты",
  attendance: "СКУД",
  schedule: "Расписание",
  services: "Услуги",
  expenses: "Расходы",
};

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

// ── Group permissions by category ───────────────────────────────────────────

function groupPermissions(
  permissions: RbacPermission[],
): { category: string; label: string; items: RbacPermission[] }[] {
  const map = new Map<string, RbacPermission[]>();
  for (const p of permissions) {
    const cat = p.category || p.code.split(".")[0] || "other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(p);
  }
  return Array.from(map.entries()).map(([cat, items]) => ({
    category: cat,
    label: categoryLabel(cat),
    items,
  }));
}

// ── Error parsing ───────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (
      err.payload &&
      typeof err.payload === "object" &&
      "error" in err.payload
    ) {
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

// ── PermissionPicker: встроенный список прав по категориям ────────────────────

interface PermissionPickerProps {
  grouped: { category: string; label: string; items: RbacPermission[] }[];
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  isModuleOff: (code: string) => boolean;
  disabled?: boolean;
}

function PermissionPicker({
  grouped,
  selectedCodes,
  onChange,
  isModuleOff,
  disabled,
}: PermissionPickerProps) {
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const selectedSet = React.useMemo(() => new Set(selectedCodes), [selectedCodes]);

  const q = search.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    if (!q) return grouped;
    return grouped
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (p) =>
            (p.name || "").toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [grouped, q]);

  const toggleCat = (cat: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat);
      else n.add(cat);
      return n;
    });

  const togglePerm = (code: string) => {
    const n = new Set(selectedSet);
    if (n.has(code)) n.delete(code);
    else n.add(code);
    onChange([...n]);
  };

  const toggleGroup = (items: RbacPermission[], allSelected: boolean) => {
    const n = new Set(selectedSet);
    if (allSelected) items.forEach((p) => n.delete(p.code));
    else items.forEach((p) => n.add(p.code));
    onChange([...n]);
  };

  return (
    <Box>
      <TextField
        size="small"
        fullWidth
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск права по названию или коду…"
        disabled={disabled}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlined fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 1 }}
      />

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            Ничего не найдено
          </Typography>
        ) : (
          filtered.map((g, gi) => {
            const selectedInGroup = g.items.filter((p) => selectedSet.has(p.code)).length;
            const allSelected = selectedInGroup === g.items.length && g.items.length > 0;
            const someSelected = selectedInGroup > 0 && !allSelected;
            const isOpen = q ? true : expanded.has(g.category);
            return (
              <Box key={g.category}>
                {gi > 0 && <Divider />}
                {/* Заголовок категории — чекбокс «выбрать все» + счётчик + разворот */}
                <Stack
                  direction="row"
                  alignItems="center"
                  sx={{ px: 1, py: 0.25, bgcolor: (t) => subtleBg(t), cursor: q ? "default" : "pointer" }}
                  onClick={() => !q && toggleCat(g.category)}
                >
                  <Checkbox
                    size="small"
                    disabled={disabled}
                    checked={allSelected}
                    indeterminate={someSelected}
                    icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                    checkedIcon={<CheckBoxIcon fontSize="small" />}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleGroup(g.items, allSelected)}
                  />
                  <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
                    {g.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                    {selectedInGroup}/{g.items.length}
                  </Typography>
                  {!q && (
                    <ExpandMoreOutlined
                      fontSize="small"
                      sx={{
                        color: "text.secondary",
                        transition: "transform .15s ease",
                        transform: isOpen ? "rotate(180deg)" : "none",
                      }}
                    />
                  )}
                </Stack>
                {/* Права категории */}
                <Collapse in={isOpen} unmountOnExit>
                  <Box sx={{ py: 0.25 }}>
                    {g.items.map((p) => {
                      const checked = selectedSet.has(p.code);
                      const off = isModuleOff(p.code);
                      return (
                        <Stack
                          key={p.code}
                          direction="row"
                          alignItems="center"
                          sx={{
                            pl: 3,
                            pr: 1,
                            py: 0.25,
                            cursor: disabled ? "default" : "pointer",
                            "&:hover": { bgcolor: "action.hover" },
                          }}
                          onClick={() => !disabled && togglePerm(p.code)}
                        >
                          <Checkbox
                            size="small"
                            disabled={disabled}
                            checked={checked}
                            icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                            checkedIcon={<CheckBoxIcon fontSize="small" />}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => togglePerm(p.code)}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" lineHeight={1.3}>
                              {p.name || p.code}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {p.code}
                            </Typography>
                          </Box>
                          {off && (
                            <Chip
                              label="модуль отключён"
                              size="small"
                              color="warning"
                              variant="outlined"
                              sx={{ ml: 1, flexShrink: 0, height: 20, fontSize: "0.65rem" }}
                            />
                          )}
                        </Stack>
                      );
                    })}
                  </Box>
                </Collapse>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

// ── RoleFormDrawer ──────────────────────────────────────────────────────────

interface RoleFormDrawerProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: RbacRole | null;
  permissions: RbacPermission[];
  onClose: () => void;
  onSaved: (role: RbacRole) => void;
}

function RoleFormDrawer({
  open,
  mode,
  initial,
  permissions,
  onClose,
  onSaved,
}: RoleFormDrawerProps) {
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [selectedCodes, setSelectedCodes] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset form when opening
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
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
  const grouped = React.useMemo(() => groupPermissions(permissions), [permissions]);

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

  const canSubmit =
    !busy && name.trim().length > 0 && code.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      let saved: RbacRole;
      if (mode === "create") {
        const payload: RoleCreatePayload = {
          name: name.trim(),
          code: code.trim(),
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
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "create" ? "Создать роль" : "Редактировать роль";

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
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
        <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </Stack>

      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2.5 }}>
        <Stack spacing={2.5}>
          {isSystemRole && (
            <Alert severity="warning" icon={<LockOutlined fontSize="small" />}>
              Системная роль — сохранить изменения может только суперпользователь.
            </Alert>
          )}

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            disabled={busy}
            inputProps={{ maxLength: 120 }}
            InputLabelProps={{ shrink: true }}
            placeholder="Например: Врач-педиатр"
          />

          <TextField
            label="Код"
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
            placeholder="Например: pediatrician"
            helperText={
              mode === "edit"
                ? "Код роли нельзя изменить после создания"
                : "Только латиница, цифры, дефис и подчёркивание"
            }
          />

          <TextField
            label="Описание"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            disabled={busy}
            multiline
            minRows={2}
            inputProps={{ maxLength: 500 }}
            placeholder="Краткое описание роли (необязательно)"
          />

          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              Права доступа
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
              Выберите разрешения, которые будут назначены этой роли. Права из
              отключённых модулей организации помечены и не действуют, пока
              модуль не включён. Пользователи с этой ролью увидят изменения
              после возврата на вкладку или перезагрузки страницы.
            </Typography>
            {/* Quick overview by group */}
            {grouped.length > 0 && selectedCodes.length > 0 && (
              <Box mb={1.5}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
                  По категориям:
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {grouped.map((g) => {
                    const count = g.items.filter((p) =>
                      selectedCodes.includes(p.code),
                    ).length;
                    if (count === 0) return null;
                    return (
                      <Chip
                        key={g.category}
                        label={`${g.label} · ${count}/${g.items.length}`}
                        size="small"
                        variant="outlined"
                        color="primary"
                      />
                    );
                  })}
                </Stack>
              </Box>
            )}

            <PermissionPicker
              grouped={grouped}
              selectedCodes={selectedCodes}
              onChange={setSelectedCodes}
              isModuleOff={isModuleOff}
              disabled={busy}
            />
            {selectedCodes.length > 0 && (
              <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                Выбрано: {selectedCodes.length} из {permissions.length}
              </Typography>
            )}
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
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          loading={busy}
        >
          {busy ? "Сохранение…" : mode === "create" ? "Создать" : "Сохранить"}
        </AppButton>
      </Box>
    </Drawer>
  );
}

// ── RoleRow ─────────────────────────────────────────────────────────────────

interface RoleRowProps {
  role: RbacRole;
  allPermissions: RbacPermission[];
  onEdit: () => void;
  canEdit: boolean;
}

function RoleRow({ role, allPermissions, onEdit, canEdit }: RoleRowProps) {
  // Build a quick lookup to resolve permission names
  const permMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allPermissions) m.set(p.code, p.name || p.code);
    return m;
  }, [allPermissions]);

  return (
    <Paper
      variant="outlined"
      sx={(t) => ({
        px: 2,
        py: 1.5,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr auto" },
        gap: 1,
        alignItems: "center",
        transition: "background-color .15s ease, border-color .15s ease, color .15s ease",
        "&:hover": {
          bgcolor: subtleBg(t, true),
          borderColor: alpha(t.palette.primary.main, 0.28),
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
              label="Системная"
              size="small"
              color="default"
              icon={<LockOutlined />}
              sx={{ height: 18, fontSize: 10 }}
            />
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
            Нет прав
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
          {role.permissions.length} {role.permissions.length === 1 ? "право" : role.permissions.length < 5 ? "права" : "прав"}
        </Typography>
      </Box>

      {/* Actions */}
      <Stack direction="row" alignItems="center" gap={0.5} justifyContent="flex-end">
        {canEdit && (
          <Tooltip
            title={
              role.isSystem
                ? "Редактировать системную роль (доступно суперпользователю)"
                : "Редактировать"
            }
            placement="top"
          >
            <span>
              <IconButton
                size="small"
                onClick={onEdit}
                aria-label="Редактировать роль"
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
  const { activeOrganization, isSuperAdmin } = usePermissions();
  const [roles, setRoles] = React.useState<RbacRole[]>([]);
  const [permissions, setPermissions] = React.useState<RbacPermission[]>([]);
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
      const [rolesData, permsData] = await Promise.all([
        getRoles(activeOrganization?.id),
        getPermissions(),
      ]);
      setRoles(rolesData);
      setPermissions(permsData);
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
      drawerMode === "create" ? "Роль создана" : "Роль обновлена",
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
              Роли
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
              placeholder="Поиск роли…"
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
                Создать роль
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
                Повторить
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
            <Typography variant="body2">Нет ролей для отображения.</Typography>
            <CanAccess permissions="rbac.roles.create">
              <AppButton
                variant="outlined"
                startIcon={<AddOutlined />}
                onClick={handleOpenCreate}
              >
                Создать первую роль
              </AppButton>
            </CanAccess>
          </Box>
        )}

        {/* Search empty */}
        {!loading && orgRoles.length > 0 && filtered.length === 0 && (
          <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
            <Typography variant="body2">
              Ничего не найдено по запросу «{search}».
            </Typography>
          </Box>
        )}

        {/* Custom roles list */}
        {!loading && customRoles.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary" mb={1} display="block">
              Роли организации
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
                      onEdit={() => handleOpenEdit(role)}
                      canEdit={false}
                    />
                  }
                >
                  <RoleRow
                    role={role}
                    allPermissions={permissions}
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
              Системные роли
            </Typography>
            <Stack spacing={1}>
              {/* Бэкенд разрешает менять системные роли только Django-суперпользователю
                  (rbac/api/views.py: System roles can only be edited by a superuser). */}
              {systemRoles.map((role) => (
                <RoleRow
                  key={role.id}
                  role={role}
                  allPermissions={permissions}
                  onEdit={() => handleOpenEdit(role)}
                  canEdit={isSuperAdmin()}
                />
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
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />
    </SettingsLayout>
  );
};

export default RolesSettingsPage;
