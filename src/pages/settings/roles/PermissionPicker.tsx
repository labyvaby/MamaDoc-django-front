import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
  alpha,
} from "@mui/material";
import {
  KeyboardArrowRightOutlined,
  SearchOutlined,
  UnfoldLessOutlined,
  UnfoldMoreOutlined,
} from "@mui/icons-material";

import { subtleBg } from "../../../theme";
import type { RbacPermission } from "../../../api/rbac";
import { useT } from "../../../i18n/VerticalProvider";
import { buildBaseCodeMap } from "./permissionDependencies";

export interface PermissionGroup {
  category: string;
  label: string;
  items: RbacPermission[];
}

type FilterKey = "all" | "selected" | "changed" | "blocked";

interface PermissionPickerProps {
  grouped: PermissionGroup[];
  /** Полный список прав — по нему строится карта зависимостей от просмотра. */
  allPermissions: RbacPermission[];
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  isModuleOff: (code: string) => boolean;
  disabled?: boolean;
  totalCount: number;
  /** Права роли на момент открытия: база для diff и для раскрытых категорий. */
  initialSelectedCodes: string[];
  /** Ставить фокус в поиск при монтировании (только для мыши — на тач-устройстве это открывает клавиатуру). */
  autoFocusSearch?: boolean;
}

/**
 * Редактор прав роли: аккордеон категорий с мастер-переключателем, тумблеры,
 * поиск, ряд фильтров и diff несохранённых изменений. Один и тот же на
 * десктопе и на телефоне — раньше на десктопе стоял Autocomplete с грудой
 * чипов, по которому не читалось, что именно у роли включено.
 */
export default function PermissionPicker({
  grouped,
  allPermissions,
  selectedCodes,
  onChange,
  isModuleOff,
  disabled,
  totalCount,
  initialSelectedCodes,
  autoFocusSearch,
}: PermissionPickerProps) {
  const { t } = useT("settings");
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FilterKey>("all");
  // По умолчанию раскрыты категории, где у роли уже есть права.
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const init = new Set(initialSelectedCodes);
    return new Set(
      grouped.filter((g) => g.items.some((p) => init.has(p.code))).map((g) => g.category),
    );
  });

  const selected = React.useMemo(() => new Set(selectedCodes), [selectedCodes]);
  const initial = React.useMemo(() => new Set(initialSelectedCodes), [initialSelectedCodes]);
  const baseCodeMap = React.useMemo(() => buildBaseCodeMap(allPermissions), [allPermissions]);
  const q = search.trim().toLowerCase();

  // ── Diff с момента открытия ───────────────────────────────────────────────
  const added = React.useMemo(
    () => new Set([...selected].filter((c) => !initial.has(c))),
    [selected, initial],
  );
  const removed = React.useMemo(
    () => new Set([...initial].filter((c) => !selected.has(c))),
    [selected, initial],
  );
  const changedCount = added.size + removed.size;

  // Права выключенных модулей среди выбранных: выданы, но не действуют.
  const blockedCodes = React.useMemo(
    () => new Set([...selected].filter((c) => isModuleOff(c))),
    [selected, isModuleOff],
  );

  // Выбранные действия, у которых не выбран просмотр своего домена.
  const danglingCodes = React.useMemo(
    () =>
      [...selected].filter((c) => {
        const base = baseCodeMap.get(c);
        return base != null && !selected.has(base);
      }),
    [selected, baseCodeMap],
  );
  const missingBaseCodes = React.useMemo(
    () => new Set(danglingCodes.map((c) => baseCodeMap.get(c)!)),
    [danglingCodes, baseCodeMap],
  );

  // ── Изменение выбора ──────────────────────────────────────────────────────
  // Включение действия тянет за собой просмотр домена: право без него не
  // работает, а «выдал, а оно не действует» — самая дорогая ошибка на экране.
  const addWithBase = (target: Set<string>, code: string) => {
    target.add(code);
    const base = baseCodeMap.get(code);
    if (base) target.add(base);
  };

  const togglePerm = (code: string) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else addWithBase(next, code);
    onChange([...next]);
  };

  const toggleCategory = (items: RbacPermission[]) => {
    if (disabled) return;
    const codes = items.map((p) => p.code);
    const allOn = codes.every((c) => selected.has(c));
    const next = new Set(selected);
    if (allOn) codes.forEach((c) => next.delete(c));
    else codes.forEach((c) => addWithBase(next, c));
    onChange([...next]);
  };

  const addMissingBases = () => {
    if (disabled) return;
    const next = new Set(selected);
    missingBaseCodes.forEach((c) => next.add(c));
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

  // ── Фильтрация ────────────────────────────────────────────────────────────
  const matchesFilter = React.useCallback(
    (p: RbacPermission) => {
      switch (filter) {
        case "selected":
          return selected.has(p.code);
        case "changed":
          return added.has(p.code) || removed.has(p.code);
        case "blocked":
          return blockedCodes.has(p.code);
        default:
          return true;
      }
    },
    [filter, selected, added, removed, blockedCodes],
  );

  const visibleGroups = grouped
    .map((g) => ({
      ...g,
      matched: g.items.filter(
        (p) =>
          matchesFilter(p) &&
          (!q ||
            (p.name || "").toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q)),
      ),
    }))
    .filter((g) => g.matched.length > 0);

  // При поиске и под фильтром раскрываем всё: иначе результат прячется в
  // свёрнутых категориях и выглядит как «ничего не найдено».
  const forceOpen = !!q || filter !== "all";
  const allExpanded = visibleGroups.every((g) => expanded.has(g.category));
  const toggleAllExpanded = () => {
    setExpanded(allExpanded ? new Set() : new Set(grouped.map((g) => g.category)));
  };

  const filterOptions = ([
    { key: "all", label: t("roles.permissionPicker.filters.all"), count: totalCount },
    { key: "selected", label: t("roles.permissionPicker.filters.selected"), count: selected.size },
    { key: "changed", label: t("roles.permissionPicker.filters.changed"), count: changedCount },
    { key: "blocked", label: t("roles.permissionPicker.filters.blocked"), count: blockedCodes.size },
  ] as { key: FilterKey; label: string; count: number }[]).filter(
    (o) => o.key === "all" || o.count > 0 || o.key === filter,
  );

  return (
    <Box>
      {/* Липкая сводка + поиск + фильтры */}
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
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              {t("roles.permissionPicker.selectedOfTotal", { total: totalCount })}
              {selected.size ? "" : t("roles.permissionPicker.noPermissionsHint")}
            </Typography>
            {changedCount > 0 && (
              <Stack direction="row" alignItems="center" gap={0.75} mt={0.25} flexWrap="wrap">
                {added.size > 0 && (
                  <Typography variant="caption" sx={{ color: "success.main", fontWeight: 600 }}>
                    +{added.size}
                  </Typography>
                )}
                {removed.size > 0 && (
                  <Typography variant="caption" sx={{ color: "error.main", fontWeight: 600 }}>
                    −{removed.size}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {t("roles.permissionPicker.unsavedHint")}
                </Typography>
              </Stack>
            )}
          </Box>
          {changedCount > 0 && !disabled && (
            <Button
              size="small"
              onClick={() => onChange([...initialSelectedCodes])}
              sx={{ textTransform: "none", minWidth: 0, px: 1 }}
            >
              {t("roles.permissionPicker.revertButton")}
            </Button>
          )}
          {selected.size > 0 && !disabled && (
            <Button
              size="small"
              color="inherit"
              onClick={() => onChange([])}
              sx={{ textTransform: "none", minWidth: 0, px: 1, color: "text.secondary" }}
            >
              {t("roles.permissionPicker.clearButton")}
            </Button>
          )}
        </Stack>

        {danglingCodes.length > 0 && (
          <Alert
            severity="warning"
            sx={{ mb: 1, py: 0.25, "& .MuiAlert-message": { py: 0.5 } }}
            action={
              disabled ? undefined : (
                <Button color="inherit" size="small" onClick={addMissingBases} sx={{ textTransform: "none" }}>
                  {t("roles.permissionPicker.addBaseButton")}
                </Button>
              )
            }
          >
            <Typography variant="caption">
              {t("roles.permissionPicker.danglingWarning", { count: danglingCodes.length })}
            </Typography>
          </Alert>
        )}

        <TextField
          fullWidth
          size="small"
          autoFocus={autoFocusSearch}
          placeholder={t("roles.permissionPicker.searchPlaceholder")}
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

        <Stack direction="row" alignItems="center" gap={0.75} mt={1} flexWrap="wrap">
          {filterOptions.map((o) => (
            <Chip
              key={o.key}
              label={`${o.label} · ${o.count}`}
              size="small"
              clickable
              onClick={() => setFilter(o.key)}
              variant={filter === o.key ? "filled" : "outlined"}
              color={filter === o.key ? "primary" : "default"}
              sx={{ height: 26, fontSize: "0.75rem" }}
            />
          ))}
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            onClick={toggleAllExpanded}
            startIcon={allExpanded ? <UnfoldLessOutlined /> : <UnfoldMoreOutlined />}
            sx={{ textTransform: "none", color: "text.secondary", minWidth: 0, px: 0.75 }}
          >
            {allExpanded
              ? t("roles.permissionPicker.collapseAll")
              : t("roles.permissionPicker.expandAll")}
          </Button>
        </Stack>
      </Box>

      <Stack spacing={1} sx={{ mt: 1 }}>
        {visibleGroups.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ textAlign: "center", py: 3 }}>
            {t("roles.permissionPicker.noResults")}
          </Typography>
        ) : (
          visibleGroups.map((g) => {
            const selCount = g.items.filter((p) => selected.has(p.code)).length;
            const allOn = selCount === g.items.length;
            const groupAdded = g.items.filter((p) => added.has(p.code)).length;
            const groupRemoved = g.items.filter((p) => removed.has(p.code)).length;
            const open = expanded.has(g.category) || forceOpen;
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
                    <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
                      <Typography
                        variant="caption"
                        sx={{ color: selCount ? "primary.onSurface" : "text.secondary" }}
                      >
                        {t("roles.permissionPicker.ofCount", {
                          selected: selCount,
                          total: g.items.length,
                        })}
                      </Typography>
                      {groupAdded > 0 && (
                        <Typography variant="caption" sx={{ color: "success.main", fontWeight: 600 }}>
                          +{groupAdded}
                        </Typography>
                      )}
                      {groupRemoved > 0 && (
                        <Typography variant="caption" sx={{ color: "error.main", fontWeight: 600 }}>
                          −{groupRemoved}
                        </Typography>
                      )}
                    </Stack>
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
                      const isOn = selected.has(p.code);
                      const state = added.has(p.code)
                        ? "added"
                        : removed.has(p.code)
                          ? "removed"
                          : null;
                      const needsBase = isOn && missingBaseCodes.has(baseCodeMap.get(p.code) ?? "");
                      return (
                        <Stack
                          key={p.code}
                          direction="row"
                          alignItems="center"
                          gap={1}
                          sx={(theme) => ({
                            px: 1.5,
                            py: 1,
                            borderTop: i > 0 ? "1px solid" : "none",
                            borderColor: "divider",
                            borderLeft: state ? "3px solid" : "3px solid transparent",
                            borderLeftColor: state
                              ? state === "added"
                                ? "success.main"
                                : "error.main"
                              : "transparent",
                            bgcolor: state
                              ? alpha(
                                  state === "added"
                                    ? theme.palette.success.main
                                    : theme.palette.error.main,
                                  theme.palette.mode === "dark" ? 0.1 : 0.06,
                                )
                              : "transparent",
                            "&:hover": { bgcolor: state ? undefined : subtleBg(theme, true) },
                            "&:hover .perm-code": { opacity: 1 },
                          })}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={500} lineHeight={1.3}>
                              {p.name || p.code}
                            </Typography>
                            <Typography
                              className="perm-code"
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                fontFamily: "monospace",
                                fontSize: 11,
                                opacity: q ? 1 : 0.55,
                                transition: "opacity .15s ease",
                              }}
                            >
                              {p.code}
                            </Typography>
                            {off && (
                              <Typography
                                variant="caption"
                                sx={{ display: "block", color: "warning.main", fontWeight: 600, mt: 0.25 }}
                              >
                                {t("roles.permissionPicker.moduleOffHint")}
                              </Typography>
                            )}
                            {needsBase && (
                              <Typography
                                variant="caption"
                                sx={{ display: "block", color: "warning.main", fontWeight: 600, mt: 0.25 }}
                              >
                                {t("roles.permissionPicker.needsBaseHint", {
                                  code: baseCodeMap.get(p.code),
                                })}
                              </Typography>
                            )}
                          </Box>
                          <Switch
                            size="small"
                            checked={isOn}
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
