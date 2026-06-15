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
  alpha,
} from "@mui/material";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import AddIcon from "@mui/icons-material/Add";
import FilterListIcon from "@mui/icons-material/FilterList";
import CheckIcon from "@mui/icons-material/Check";
import { DjangoStockItem } from "../../../api/warehouse";
import { ListLoadingSkeleton, ListEmptyState } from "../../ui";

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
}

export const DjangoStockList: React.FC<DjangoStockListProps> = ({
  stock,
  onSelect,
  loading,
  warehouseName,
  warehouseAddress,
  selectedItem,
  onAdd,
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

  const statusOptions: { value: StockStatusFilter; label: string }[] = [
    { value: "all", label: "Все" },
    { value: "in", label: "В наличии" },
    { value: "out", label: "Нет в наличии" },
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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Stack spacing={0.5}>
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
        <Tooltip title="Фильтр">
          <IconButton
            size="small"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{
              color: filterActive ? "primary.main" : "text.secondary",
              bgcolor: filterActive ? "primary.lighter" : "transparent",
            }}
          >
            <FilterListIcon fontSize="small" />
          </IconButton>
        </Tooltip>
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
              return (
                <ButtonBase
                  key={`${item.warehouseId}-${item.productId}`}
                  onClick={() => onSelect(item)}
                  focusRipple
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    width: "100%",
                    textAlign: "left",
                    p: 1.25,
                    borderRadius: 2,
                    border: 1,
                    borderColor: isSelected ? "primary.main" : "divider",
                    bgcolor: (theme) =>
                      isSelected
                        ? alpha(theme.palette.primary.main, 0.08)
                        : "background.paper",
                    transition: "border-color .15s ease, box-shadow .15s ease, transform .1s ease, background-color .15s ease",
                    "&:hover": {
                      borderColor: "primary.main",
                      boxShadow: (theme) =>
                        `0 4px 16px ${alpha(theme.palette.primary.main, 0.12)}`,
                    },
                    "&:active": { transform: "translateY(0.5px)" },
                  }}
                >
                  <Avatar
                    variant="rounded"
                    src={item.productImageUrl || undefined}
                    sx={{
                      flexShrink: 0,
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                      color: "primary.main",
                    }}
                  >
                    {item.productName?.charAt(0) || <Inventory2OutlinedIcon fontSize="small" />}
                  </Avatar>

                  <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
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
                      borderRadius: 1.5,
                      bgcolor: (theme) =>
                        alpha(
                          inStock ? theme.palette.success.main : theme.palette.error.main,
                          0.12
                        ),
                      color: inStock ? "success.main" : "error.main",
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
