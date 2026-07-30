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
  Skeleton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  AdminPanelSettingsOutlined,
  AddOutlined,
  CloseOutlined,
  EditOutlined,
  KeyOutlined,
  KeyboardArrowRightOutlined,
  LockOutlined,
  SearchOutlined,
} from "@mui/icons-material";
import Autocomplete from "@mui/material/Autocomplete";
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
import { useFormValidation } from "../../hooks/useFormValidation";
import { getModuleCodeForPermission } from "../../utils/moduleMapping";
import { useT } from "../../i18n/VerticalProvider";

// ── Category label mapping ──────────────────────────────────────────────────
// Ключи CATEGORY_LABELS фиксированы бэкендом; отображаемые подписи берутся из
// settings.json (roles.categories) через categoryLabel(cat, t), поэтому сама
// функция принимает t и не может жить на уровне модуля.

const CATEGORY_KEYS = [
  "appointments", "patients", "staff", "catalog", "content", "organization",
  "branches", "rbac", "roles", "users", "finance", "warehouse", "reports",
  "attendance", "schedule", "services", "expenses",
] as const;

function categoryLabel(cat: string, t: (key: string) => string): string {
  return (CATEGORY_KEYS as readonly string[]).includes(cat)
    ? t(`roles.categories.${cat}`)
    : cat;
}

// ── Permission label helper ─────────────────────────────────────────────────

function permissionLabel(p: RbacPermission): string {
  return p.name ? `${p.name} (${p.code})` : p.code;
}

// ── Group permissions by category ───────────────────────────────────────────

function groupPermissions(
  permissions: RbacPermission[],
  t: (key: string) => string,
): { category: string; label: string; items: RbacPermission[] }[] {
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

// ── MobilePermissionPicker ──────────────────────────────────────────────────
// Тач-редактор прав для мобильной версии: аккордеон категорий с мастер-
// переключателем, крупные тумблеры, поиск и липкая сводка — вместо десктопного
// Autocomplete с грудой чипов, неудобного на телефоне.

interface MobilePermissionPickerProps {
  grouped: { category: string; label: string; items: RbacPermission[] }[];
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  isModuleOff: (code: string) => boolean;
  disabled?: boolean;
  totalCount: number;
  /** Права роли на момент открытия — задают, какие категории раскрыты сразу. */
  initialSelectedCodes: string[];
}

function MobilePermissionPicker({
  grouped,
  selectedCodes,
  onChange,
  isModuleOff,
  disabled,
  totalCount,
  initialSelectedCodes,
}: MobilePermissionPickerProps) {
  const { t } = useT("settings");
  const [search, setSearch] = React.useState("");
  // По умолчанию раскрыты категории, где у роли уже есть права.
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const init = new Set(initialSelectedCodes);
    return new Set(
      grouped.filter((g) => g.items.some((p) => init.has(p.code))).map((g) => g.category),
    );
  });

  const selected = React.useMemo(() => new Set(selectedCodes), [selectedCodes]);
  const q = search.trim().toLowerCase();

  const togglePerm = (code: string) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange([...next]);
  };
  const toggleCategory = (items: RbacPermission[]) => {
    if (disabled) return;
    const codes = items.map((p) => p.code);
    const allOn = codes.every((c) => selected.has(c));
    const next = new Set(selected);
    codes.forEach((c) => (allOn ? next.delete(c) : next.add(c)));
    onChange([...next]);
  };
  const toggleExpand = (cat: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat);
      else n.add(cat);
      return n;
    });
  };

  const visibleGroups = grouped
    .map((g) => ({
      ...g,
      matched: q
        ? g.items.filter(
            (p) =>
              (p.name || "").toLowerCase().includes(q) ||
              p.code.toLowerCase().includes(q) ||
              g.label.toLowerCase().includes(q),
          )
        : g.items,
    }))
    .filter((g) => g.matched.length > 0);

  return (
    <Box>
      {/* Липкая сводка + поиск */}
      <Box sx={{ position: "sticky", top: 0, zIndex: 2, bgcolor: "background.paper", pb: 1 }}>
        <Stack
          direction="row"
          alignItems="center"
          gap={1.5}
          sx={(theme) => ({
            px: 1.5,
            py: 1,
            mb: 1,
            borderRadius: "12px",
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.16 : 0.1),
          })}
        >
          <Typography
            sx={{
              fontSize: 22,
              fontWeight: 700,
              color: "primary.onSurface",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {selected.size}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {t("roles.mobilePicker.selectedOfTotal", { total: totalCount })}
            {selected.size ? "" : t("roles.mobilePicker.noPermissionsHint")}
          </Typography>
          {selected.size > 0 && !disabled && (
            <Button
              size="small"
              onClick={() => onChange([])}
              sx={{ textTransform: "none", minWidth: 0, px: 1 }}
            >
              {t("roles.mobilePicker.clearButton")}
            </Button>
          )}
        </Stack>
        <TextField
          fullWidth
          size="small"
          placeholder={t("roles.mobilePicker.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Stack spacing={1} sx={{ mt: 1 }}>
        {visibleGroups.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ textAlign: "center", py: 3 }}>
            {t("roles.mobilePicker.noResults")}
          </Typography>
        ) : (
          visibleGroups.map((g) => {
            const selCount = g.items.filter((p) => selected.has(p.code)).length;
            const allOn = selCount === g.items.length;
            const open = expanded.has(g.category) || !!q;
            return (
              <Paper key={g.category} variant="outlined" sx={{ overflow: "hidden" }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={{ px: 1.5, py: 1.25, cursor: "pointer" }}
                  onClick={() => toggleExpand(g.category)}
                >
                  <KeyboardArrowRightOutlined
                    sx={{
                      color: open ? "primary.onSurface" : "text.disabled",
                      transform: open ? "rotate(90deg)" : "none",
                      transition: "transform .2s ease",
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {g.label}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: selCount ? "primary.onSurface" : "text.secondary" }}
                    >
                      {t("roles.mobilePicker.ofCount", { selected: selCount, total: g.items.length })}
                    </Typography>
                  </Box>
                  <Switch
                    size="small"
                    checked={allOn}
                    disabled={disabled}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleCategory(g.items)}
                  />
                </Stack>
                {open && (
                  <Box sx={{ borderTop: "1px solid", borderColor: "divider" }}>
                    {g.matched.map((p, i) => {
                      const off = isModuleOff(p.code);
                      return (
                        <Stack
                          key={p.code}
                          direction="row"
                          alignItems="center"
                          gap={1}
                          sx={{
                            px: 1.5,
                            py: 1,
                            borderTop: i > 0 ? "1px solid" : "none",
                            borderColor: "divider",
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={500} lineHeight={1.3}>
                              {p.name || p.code}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontFamily: "monospace" }}
                            >
                              {p.code}
                            </Typography>
                            {off && (
                              <Typography
                                variant="caption"
                                sx={{ display: "block", color: "warning.main", fontWeight: 600, mt: 0.25 }}
                              >
                                {t("roles.mobilePicker.moduleOffHint")}
                              </Typography>
                            )}
                          </Box>
                          <Switch
                            size="small"
                            checked={selected.has(p.code)}
                            disabled={disabled}
                            onChange={() => togglePerm(p.code)}
                          />
                        </Stack>
                      );
                    })}
                  </Box>
                )}
              </Paper>
            );
          })
        )}
      </Stack>
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

  const theme = useTheme();
  // sm=360 в теме → down("sm") почти не срабатывает на реальных телефонах;
  // берём md (768), чтобы тач-редактор прав включался на телефонах и мелких планшетах.
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

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

  // Selected permission objects (for Autocomplete value)
  const selectedPerms = React.useMemo(
    () => permissions.filter((p) => selectedCodes.includes(p.code)),
    [permissions, selectedCodes],
  );

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

  const title = mode === "create" ? t("roles.form.createTitle") : t("roles.form.editTitle");

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
            {isMobile ? (
              <MobilePermissionPicker
                grouped={grouped}
                selectedCodes={selectedCodes}
                onChange={setSelectedCodes}
                isModuleOff={isModuleOff}
                disabled={busy}
                totalCount={permissions.length}
                initialSelectedCodes={initial?.permissions ?? []}
              />
            ) : (
             <>
            {/* Quick overview by group */}
            {grouped.length > 0 && selectedCodes.length > 0 && (
              <Box mb={1.5}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
                  {t("roles.form.byCategoryLabel")}
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

            <Autocomplete
              multiple
              disableCloseOnSelect
              options={permissions}
              value={selectedPerms}
              groupBy={(option) => categoryLabel(option.category || option.code.split(".")[0] || "other", t)}
              getOptionLabel={permissionLabel}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              onChange={(_, newValue) => {
                setSelectedCodes(newValue.map((p) => p.code));
              }}
              disabled={busy}
              renderOption={(props, option, { selected }) => {
                const { key, ...rest } = props as React.LiHTMLAttributes<HTMLLIElement> & { key?: React.Key };
                return (
                  <li key={option.code} {...rest}>
                    <Checkbox
                      icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                      checkedIcon={<CheckBoxIcon fontSize="small" />}
                      style={{ marginRight: 8 }}
                      checked={selected}
                      size="small"
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" lineHeight={1.3}>
                        {option.name || option.code}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.code}
                      </Typography>
                    </Box>
                    {isModuleOff(option.code) && (
                      <Chip
                        label={t("roles.form.moduleOffChip")}
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ ml: 1, flexShrink: 0, height: 20, fontSize: "0.65rem" }}
                      />
                    )}
                  </li>
                );
              }}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                  const { key, ...tagProps } = getTagProps({ index });
                  return (
                    <Chip
                      key={option.code}
                      label={option.name || option.code}
                      size="small"
                      {...tagProps}
                    />
                  );
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={
                    selectedCodes.length === 0
                      ? t("roles.form.permissionsPlaceholder")
                      : ""
                  }
                  fullWidth
                  size="small"
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <InputAdornment position="start">
                          <KeyOutlined fontSize="small" color="action" />
                        </InputAdornment>
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
              sx={{ "& .MuiAutocomplete-listbox": { maxHeight: 320 } }}
            />
            {selectedCodes.length > 0 && (
              <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                {t("roles.form.selectedOfTotal", { selected: selectedCodes.length, total: permissions.length })}
              </Typography>
            )}
             </>
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
  onEdit: () => void;
  canEdit: boolean;
}

function RoleRow({ role, allPermissions, onEdit, canEdit }: RoleRowProps) {
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
