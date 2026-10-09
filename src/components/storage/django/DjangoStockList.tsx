import React from "react";
import {
  Box,
  Typography,
  Avatar,
  Stack,
  IconButton,
  Paper,
  Chip,
  ButtonBase,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Tooltip,
  Checkbox,
  alpha,
} from "@mui/material";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import AddIcon from "@mui/icons-material/AddOutlined";
import FilterListIcon from "@mui/icons-material/FilterListOutlined";
import CheckIcon from "@mui/icons-material/Check";
import { subtleBg } from "../../../theme";
import { DjangoStockItem } from "../../../api/warehouse";
import { ListLoadingSkeleton, ListEmptyState, SelectionMark, selectionHintHoverSx } from "../../ui";
import { useLongPress } from "../../../hooks/useLongPress";
import { toggleSelection } from "../../../utility/bulkSelection";
import { hapticTap } from "../../../utility/haptics";
import type { GroupableItem } from "../../../utility/productGroups";
import { GroupSelectButton } from "../GroupSelectButton";

type StockStatusFilter = "all" | "in" | "out";

interface DjangoStockListProps {
  stock: DjangoStockItem[];
  onSelect: (item: DjangoStockItem) => void;
  loading: boolean;
  warehouseName?: string;
  warehouseAddress?: string;
  selectedItem?: DjangoStockItem | null;
  /** Если передан — в пустом состоянии показываем кнопку «Приход товара». */
  onAdd?: () => void;
  /**
   * Массовый выбор как в галерее (по productId). Без пропсов — список как
   * раньше: долгое нажатие ничего не делает.
   */
  checkedIds?: ReadonlySet<number>;
  onCheckedChange?: (next: Set<number>) => void;
  /** Пока идёт массовое действие — выбор заморожен. */
  selectionDisabled?: boolean;
  /** Содержимое шапки в режиме выбора: счётчик, «Действия», «Снять». */
  selectionBar?: React.ReactNode;
  /**
   * Свойства товаров по productId: у позиции склада нет бренда и сезона,
   * без них выбор группой предлагает только категории.
   */
  productAttributes?: ReadonlyMap<number, GroupableItem["attributes"]>;
}

export const DjangoStockList: React.FC<DjangoStockListProps> = ({
  stock,
  onSelect,
  loading,
  warehouseName,
  warehouseAddress,
  selectedItem,
  onAdd,
  checkedIds,
  onCheckedChange,
  selectionDisabled = false,
  selectionBar,
  productAttributes,
}) => {
  const [statusFilter, setStatusFilter] = React.useState<StockStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = React.useState<string | null>(null);
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  // Категории из текущего набора остатков.
  const categories = React.useMemo(() => {
    const set = new Set<string>();
    stock.forEach((s) => s.productCategory && set.add(s.productCategory));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [stock]);

  // Если выбранная категория исчезла из набора — сбрасываем.
  React.useEffect(() => {
    if (categoryFilter && !categories.includes(categoryFilter)) {
      setCategoryFilter(null);
    }
  }, [categories, categoryFilter]);

  const displayed = React.useMemo(() => {
    return stock.filter((item) => {
      if (statusFilter === "in" && item.quantity <= 0) return false;
      if (statusFilter === "out" && item.quantity > 0) return false;
      if (categoryFilter && item.productCategory !== categoryFilter) return false;
      return true;
    });
  }, [stock, statusFilter, categoryFilter]);

  const filterActive = statusFilter !== "all" || categoryFilter !== null;
  const resetFilters = () => {
    setStatusFilter("all");
    setCategoryFilter(null);
  };

  // Счётчики для чипов наличия (с учётом фильтра категории).
  const statusCounts = React.useMemo(() => {
    const base = categoryFilter
      ? stock.filter((s) => s.productCategory === categoryFilter)
      : stock;
    const out = base.filter((s) => s.quantity <= 0).length;
    return { all: base.length, in: base.length - out, out };
  }, [stock, categoryFilter]);

  // ── Выбор как в галерее: долгое нажатие включает, дальше тап отмечает ──
  const selectable = Boolean(checkedIds && onCheckedChange);
  const selecting = selectable && (checkedIds?.size ?? 0) > 0;
  const anchorIdRef = React.useRef<number | null>(null);
  const visibleIds = React.useMemo(() => displayed.map((i) => i.productId), [displayed]);
  const visibleChecked = checkedIds ? visibleIds.filter((id) => checkedIds.has(id)).length : 0;
  const allVisibleChecked = visibleIds.length > 0 && visibleChecked === visibleIds.length;

  const headerHeightRef = React.useRef(0);

  const groupItems = React.useMemo<GroupableItem[]>(
    () =>
      displayed.map((i) => ({
        id: i.productId,
        category: i.productCategory,
        attributes: productAttributes?.get(i.productId),
      })),
    [displayed, productAttributes],
  );
  const setGroupChecked = (next: Set<number>) => {
    anchorIdRef.current = null;
    onCheckedChange?.(next);
  };
  // Тот же ключ в шапке и в панели выбора: окно групп не закрывается,
  // когда первый выбор меняет шапку.
  const groupButton = selectable && checkedIds && (
    <GroupSelectButton
      key="group-select"
      items={groupItems}
      checkedIds={checkedIds}
      onCheckedChange={setGroupChecked}
      disabled={loading || selectionDisabled}
      layoutId="stock-group-select"
    />
  );

  const toggle = (productId: number, shift: boolean) => {
    if (!checkedIds || !onCheckedChange) return;
    onCheckedChange(toggleSelection(checkedIds, visibleIds, productId, anchorIdRef.current, shift));
    if (!shift) anchorIdRef.current = productId;
  };
  const toggleAllVisible = () => {
    if (!checkedIds || !onCheckedChange) return;
    const next = new Set(checkedIds);
    for (const id of visibleIds) {
      if (allVisibleChecked) next.delete(id);
      else next.add(id);
    }
    anchorIdRef.current = null;
    onCheckedChange(next);
  };
  const startSelection = (productId: number) => {
    if (!checkedIds || !onCheckedChange || checkedIds.has(productId)) return;
    anchorIdRef.current = productId;
    onCheckedChange(new Set(checkedIds).add(productId));
  };
  const longPress = useLongPress((productId) => {
    hapticTap();
    startSelection(productId);
  }, selectable && !selectionDisabled);

  const statusOptions: { value: StockStatusFilter; label: string; count: number }[] = [
    { value: "all", label: "Все", count: statusCounts.all },
    { value: "in", label: "В наличии", count: statusCounts.in },
    { value: "out", label: "Нет в наличии", count: statusCounts.out },
  ];

  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        bgcolor: "background.paper",
        position: "relative",
      }}
    >
      {selecting ? (
        // Панель выбора — на месте шапки и не ниже неё: список не прыгает,
        // следующий тап (и Shift-клик) попадает в свою строку.
        <Stack
          direction="row"
          alignItems="center"
          gap={1}
          sx={(t) => ({
            position: "relative",
            px: 1.5,
            py: 1,
            minHeight: headerHeightRef.current || 64,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06),
          })}
        >
          <Tooltip title={allVisibleChecked ? "Снять выбор" : "Выбрать все в списке"}>
            <span>
              <Checkbox
                size="small"
                checked={allVisibleChecked}
                indeterminate={visibleChecked > 0 && !allVisibleChecked}
                disabled={selectionDisabled || visibleIds.length === 0}
                onChange={toggleAllVisible}
                inputProps={{ "aria-label": "Выбрать все позиции в списке" }}
                sx={{ ml: -0.5, p: 0.5 }}
              />
            </span>
          </Tooltip>
          {groupButton}
          {selectionBar}
        </Stack>
      ) : (
      <Stack
        ref={(el: HTMLDivElement | null) => {
          if (el) headerHeightRef.current = el.offsetHeight;
        }}
        direction="row"
        alignItems="center"
        gap={0.5}
        sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}
      >
        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Склад ({filterActive ? `${displayed.length} из ${stock.length}` : stock.length})
          </Typography>
          {warehouseName && (
            <Typography variant="body2" fontWeight={600} color="text.primary">
              {warehouseName}
            </Typography>
          )}
          {warehouseAddress && (
            <Typography variant="caption" color="text.secondary">
              Адрес: {warehouseAddress}
            </Typography>
          )}
        </Stack>
        {groupButton}
        <Tooltip title="Фильтр">
          <IconButton
            size="small"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{
              color: filterActive ? "primary.onSurface" : "text.secondary",
              bgcolor: filterActive ? "primary.lighter" : "transparent",
            }}
          >
            <FilterListIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      )}

      {/* Видимые чипы-фильтры наличия */}
      <Stack
        direction="row"
        gap={0.75}
        flexWrap="wrap"
        sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}
      >
        {statusOptions.map((o) => {
          const active = statusFilter === o.value;
          return (
            <Chip
              key={o.value}
              size="small"
              clickable
              label={`${o.label} · ${o.count}`}
              onClick={() => setStatusFilter(o.value)}
              sx={(t) => ({
                height: 26,
                borderRadius: "8px",
                fontWeight: 500,
                border: 1,
                borderColor: active ? alpha(t.palette.primary.main, 0.4) : "divider",
                color: active ? "primary.onSurface" : "text.secondary",
                bgcolor: active
                  ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08)
                  : "transparent",
                "&:hover": {
                  bgcolor: active
                    ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.22 : 0.12)
                    : subtleBg(t, true),
                },
              })}
            />
          );
        })}
      </Stack>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { minWidth: 220, maxHeight: 380 } } }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, fontWeight: 600, display: "block" }}>
          Наличие
        </Typography>
        {statusOptions.map((o) => (
          <MenuItem key={o.value} selected={statusFilter === o.value} onClick={() => setStatusFilter(o.value)}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              {statusFilter === o.value && <CheckIcon fontSize="small" color="primary" />}
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: "body2" }}>{o.label}</ListItemText>
          </MenuItem>
        ))}

        {categories.length > 0 && <Divider />}
        {categories.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, fontWeight: 600, display: "block" }}>
            Категория
          </Typography>
        )}
        {categories.length > 0 && (
          <MenuItem selected={categoryFilter === null} onClick={() => setCategoryFilter(null)}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              {categoryFilter === null && <CheckIcon fontSize="small" color="primary" />}
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: "body2" }}>Все категории</ListItemText>
          </MenuItem>
        )}
        {categories.map((c) => (
          <MenuItem key={c} selected={categoryFilter === c} onClick={() => setCategoryFilter(c)}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              {categoryFilter === c && <CheckIcon fontSize="small" color="primary" />}
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: "body2" }}>{c}</ListItemText>
          </MenuItem>
        ))}

        <Divider />
        <MenuItem disabled={!filterActive} onClick={resetFilters}>
          <ListItemText primaryTypographyProps={{ variant: "body2", color: "primary" }}>
            Сбросить фильтры
          </ListItemText>
        </MenuItem>
      </Menu>

      {!loading && stock.length === 0 && (
        <Box sx={{ position: "absolute", inset: 0, display: "flex", pointerEvents: "none" }}>
          <ListEmptyState
            icon={<Inventory2OutlinedIcon />}
            title="Товаров пока нет"
            description="На этом складе ещё нет остатков. Оформите приход товара, чтобы он появился здесь."
            action={
              onAdd ? (
                <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={onAdd}>
                  Приход товара
                </Button>
              ) : undefined
            }
          />
        </Box>
      )}

      {!loading && stock.length > 0 && displayed.length === 0 && (
        <Box sx={{ position: "absolute", inset: 0, top: 64, display: "flex", pointerEvents: "none" }}>
          <ListEmptyState
            icon={<FilterListIcon />}
            title="Ничего не найдено"
            description="Под выбранные фильтры товаров нет."
            action={
              <Button variant="outlined" size="small" onClick={resetFilters}>
                Сбросить фильтры
              </Button>
            }
          />
        </Box>
      )}

      <Box sx={{ overflowY: "auto", flex: 1 }}>
        {loading ? (
          <ListLoadingSkeleton rows={6} />
        ) : displayed.length === 0 ? null : (
          <Stack spacing={1} sx={{ p: 1.5 }}>
            {displayed.map((item) => {
              const inStock = item.quantity > 0;
              const isSelected =
                selectedItem != null &&
                selectedItem.warehouseId === item.warehouseId &&
                selectedItem.productId === item.productId;
              const isChecked = selecting && Boolean(checkedIds?.has(item.productId));
              return (
                <ButtonBase
                  key={`${item.warehouseId}-${item.productId}`}
                  {...(selectable ? longPress.bind(item.productId) : {})}
                  data-stock-row={item.productId}
                  role={selecting ? "checkbox" : undefined}
                  aria-checked={selecting ? isChecked : undefined}
                  // Shift-клик иначе выделяет текст строк вместо диапазона.
                  onMouseDown={(e: React.MouseEvent) => {
                    if (selectable && e.shiftKey) e.preventDefault();
                  }}
                  onClick={(e: React.MouseEvent) => {
                    // Хвост долгого нажатия: отметку оно уже поставило.
                    if (longPress.consumeClick()) return;
                    // Пока идёт выбор — тап отмечает; Ctrl/Cmd/Shift — то же с мыши.
                    if (selectable && (selecting || e.ctrlKey || e.metaKey || e.shiftKey)) {
                      if (!selectionDisabled) toggle(item.productId, e.shiftKey);
                      return;
                    }
                    onSelect(item);
                  }}
                  focusRipple
                  sx={{
                    // Долгое касание не должно выделять текст и звать меню iOS.
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitTouchCallout: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    width: "100%",
                    textAlign: "left",
                    p: 1.25,
                    borderRadius: 1,
                    border: 1,
                    borderColor: isSelected
                      ? "primary.main"
                      : isChecked
                        ? (theme) => alpha(theme.palette.primary.main, 0.4)
                        : "divider",
                    // В режиме выбора заливка — только у отмеченных, иначе
                    // открытая справа позиция выглядит отмеченной.
                    bgcolor: (theme) =>
                      isChecked || (isSelected && !selecting)
                        ? alpha(theme.palette.primary.main, 0.08)
                        : "background.paper",
                    transition: "border-color .15s ease, background-color .15s ease",
                    ...selectionHintHoverSx,
                    "&:hover": {
                      borderColor: (theme) => alpha(theme.palette.primary.main, 0.28),
                      bgcolor: (theme) => subtleBg(theme, true),
                    },
                  }}
                >
                  <Box sx={{ position: "relative", flexShrink: 0, width: 48, height: 48 }}>
                    <Avatar
                      variant="rounded"
                      src={item.productImageUrl || undefined}
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 1,
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                        color: "primary.onSurface",
                        opacity: inStock || selecting ? 1 : 0.55,
                      }}
                    >
                      {item.productName?.charAt(0) || <Inventory2OutlinedIcon fontSize="small" />}
                    </Avatar>
                    {selecting ? (
                      <SelectionMark checked={isChecked} borderRadius={1} />
                    ) : (
                      selectable && !selectionDisabled && (
                        <SelectionMark checked={false} borderRadius={1} onStart={() => startSelection(item.productId)} />
                      )
                    )}
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden", opacity: inStock ? 1 : 0.55 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {item.productName}
                    </Typography>
                    <Chip
                      label={item.productCategory || "Без категории"}
                      size="small"
                      sx={{
                        mt: 0.5,
                        height: 20,
                        fontSize: "0.7rem",
                        fontWeight: 500,
                        bgcolor: "action.hover",
                        color: "text.secondary",
                        "& .MuiChip-label": { px: 0.75 },
                      }}
                    />
                  </Box>

                  <Stack
                    alignItems="center"
                    justifyContent="center"
                    sx={{
                      flexShrink: 0,
                      minWidth: 56,
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      // Нулевой остаток — нейтральный приглушённый бейдж:
                      // красный на каждой строке создаёт шум.
                      bgcolor: (theme) =>
                        inStock
                          ? alpha(theme.palette.success.main, 0.12)
                          : subtleBg(theme, true),
                      color: inStock ? "success.main" : "text.secondary",
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                      {item.quantity}
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: "0.65rem", opacity: 0.85 }}>
                      {item.productUnit || "шт"}
                    </Typography>
                  </Stack>
                </ButtonBase>
              );
            })}
          </Stack>
        )}
      </Box>
    </Paper>
  );
};
