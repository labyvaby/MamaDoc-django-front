
import React from "react";
import {
  Box,
  Typography,
  List,
  ListItemButton,
  Avatar,
  Stack,
  IconButton,
  Paper,
  CircularProgress,
} from "@mui/material";
import FilterListIcon from "@mui/icons-material/FilterList";
import { StockItem } from "../../services/warehouse";

interface StockListProps {
  stock: StockItem[];
  onSelect: (item: StockItem) => void;
  loading: boolean;
  onFilterClick?: () => void;
  isFilterActive?: boolean;
  warehouseName?: string;
  warehouseAddress?: string;
  selectedItem?: StockItem | null; // Optional, not used for highlighting
}

export const StockList: React.FC<StockListProps> = ({
  stock,
  onSelect,
  loading,
  onFilterClick,
  isFilterActive,
  warehouseName,
  warehouseAddress
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
        bgcolor: 'background.paper'
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
              color: isFilterActive ? "primary.onSurface" : "text.secondary",
              bgcolor: isFilterActive ? "primary.lighter" : "transparent",
            }}
          >
            <FilterListIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      <Box sx={{ overflowY: "auto", flex: 1 }}>
        {loading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <CircularProgress size={24} />
          </Box>
        ) : stock.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Список пуст
            </Typography>
          </Box>
        ) : (
          <List sx={{ py: 0.5 }}>
            {stock.map((item) => (
              <ListItemButton
                key={item.product_id}
                onClick={() => onSelect(item)}
                sx={{
                  px: 2,
                  py: 1.5,
                  borderBottom: 1,
                  borderColor: "divider",
                  "&:hover": { bgcolor: "action.hover" },
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                <Avatar
                  variant="rounded"
                  src={item.product_image}
                  sx={{
                    mr: 2,
                    flexShrink: 0,
                    width: 40,
                    height: 40,
                    bgcolor: "action.selected",
                    color: "text.secondary",
                    fontSize: '1rem'
                  }}
                >
                  {item.product_name?.charAt(0)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                    {item.product_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap display="block">
                    {item.product_category || "Без категории"}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "right", ml: 1, flexShrink: 0 }}>
                  <Typography variant="body2" fontWeight={600} color={item.quantity > 0 ? "text.primary" : "error.main"}>
                    {item.quantity}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.product_unit || "шт"}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Paper>
  );
};
