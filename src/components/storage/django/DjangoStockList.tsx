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
  alpha,
} from "@mui/material";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import FilterListIcon from "@mui/icons-material/FilterList";
import { DjangoStockItem } from "../../../api/warehouse";
import { ListLoadingSkeleton, ListEmptyState } from "../../ui";

interface DjangoStockListProps {
  stock: DjangoStockItem[];
  onSelect: (item: DjangoStockItem) => void;
  loading: boolean;
  onFilterClick?: () => void;
  isFilterActive?: boolean;
  warehouseName?: string;
  warehouseAddress?: string;
  selectedItem?: DjangoStockItem | null;
}

export const DjangoStockList: React.FC<DjangoStockListProps> = ({
  stock,
  onSelect,
  loading,
  onFilterClick,
  isFilterActive,
  warehouseName,
  warehouseAddress,
  selectedItem,
}) => {
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
            Склад ({stock.length})
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
        {onFilterClick && (
          <IconButton
            size="small"
            onClick={onFilterClick}
            sx={{
              color: isFilterActive ? "primary.main" : "text.secondary",
              bgcolor: isFilterActive ? "primary.lighter" : "transparent",
            }}
          >
            <FilterListIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {!loading && stock.length === 0 && (
        <Box sx={{ position: "absolute", inset: 0, display: "flex", pointerEvents: "none" }}>
          <ListEmptyState
            icon={<Inventory2OutlinedIcon />}
            title="Товаров пока нет"
            description="На этом складе ещё нет остатков. Оформите приход товара, чтобы он появился здесь."
          />
        </Box>
      )}

      <Box sx={{ overflowY: "auto", flex: 1 }}>
        {loading ? (
          <ListLoadingSkeleton rows={6} />
        ) : stock.length === 0 ? null : (
          <Stack spacing={1} sx={{ p: 1.5 }}>
            {stock.map((item) => {
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
                      color: inStock ? "success.dark" : "error.main",
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
