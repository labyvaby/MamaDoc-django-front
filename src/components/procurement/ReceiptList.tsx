import React from "react";
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Paper,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import FilterListOutlined from "@mui/icons-material/FilterListOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CheckIcon from "@mui/icons-material/Check";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import WarehouseOutlined from "@mui/icons-material/WarehouseOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";

import type { GoodsReceipt, ProcurementSummary, ReceiptListStatus } from "../../api/procurement";
import { subtleBg } from "../../theme/uiHelpers";
import { ListEmptyState, ListLoadingSkeleton } from "../ui";
import { ReceiptStatusChip, formatMoney, formatShortDateTime, initialOf } from "./meta";

export interface ReceiptListFilterOption {
  id: number;
  label: string;
}

export interface ReceiptListProps {
  receipts: GoodsReceipt[];
  loading: boolean;
  loadFailed?: boolean;
  summary?: ProcurementSummary;
  selectedId: number | null;
  onSelect: (receipt: GoodsReceipt) => void;
  status: ReceiptListStatus | "all";
  onStatusChange: (status: ReceiptListStatus | "all") => void;
  supplierId: number | null;
  onSupplierChange: (id: number | null) => void;
  suppliers: ReceiptListFilterOption[];
  warehouseId: number | null;
  onWarehouseChange: (id: number | null) => void;
  warehouses: ReceiptListFilterOption[];
  periodLabel: string;
  scopeLabel: string;
  onAdd?: () => void;
  /** Ошибка загрузки списка — показываем текст, а не пустоту. */
  errorMessage?: string | null;
}

type FilterChipProps = {
  active: boolean;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  children: React.ReactNode;
  icon?: React.ReactElement;
};

const FilterChip: React.FC<FilterChipProps> = ({ active, onClick, children, icon }) => (
  <Chip
    size="small"
    clickable
    icon={icon}
    label={children}
    onClick={onClick}
    sx={(t) => ({
      height: 26,
      borderRadius: "8px",
      fontWeight: 500,
      border: 1,
      borderColor: active ? alpha(t.palette.primary.main, 0.4) : "divider",
      color: active ? "primary.onSurface" : "text.secondary",
      bgcolor: active ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08) : "transparent",
      "& .MuiChip-icon": { fontSize: 16, color: "inherit", ml: 0.75 },
      "&:hover": {
        bgcolor: active ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.22 : 0.12) : subtleBg(t, true),
      },
    })}
  />
);

/**
 * Список накладных — карточные строки как у «Остатков» (DjangoStockList):
 * аватар поставщика, номер и дата, склад, сумма и статус-чип. Узкий
 * контейнер (планшет, телефон) складывает сумму и статус под название —
 * container query, чтобы не зависеть от ширины окна.
 */
export const ReceiptList: React.FC<ReceiptListProps> = ({
  receipts,
  loading,
  summary,
  selectedId,
  onSelect,
  status,
  onStatusChange,
  supplierId,
  onSupplierChange,
  suppliers,
  warehouseId,
  onWarehouseChange,
  warehouses,
  periodLabel,
  scopeLabel,
  onAdd,
  errorMessage,
}) => {
  const [menu, setMenu] = React.useState<null | { anchor: HTMLElement; kind: "supplier" | "warehouse" }>(null);
  const counts = summary?.statusCounts;
  const total = counts ? counts.unpaid + counts.partial + counts.paid : receipts.length;
  const filterActive = status !== "all" || supplierId !== null || warehouseId !== null;

  const statusOptions: { value: ReceiptListStatus | "all"; label: string; count?: number }[] = [
    { value: "all", label: "Все", count: total },
    { value: "unpaid", label: "Не оплачены", count: counts?.unpaid },
    { value: "partial", label: "Частично", count: counts?.partial },
    { value: "paid", label: "Оплачены", count: counts?.paid },
    { value: "canceled", label: "Отменённые", count: summary?.canceledCount },
  ];

  const supplierLabel = suppliers.find((s) => s.id === supplierId)?.label ?? "Все поставщики";
  const warehouseLabel = warehouses.find((w) => w.id === warehouseId)?.label ?? "Все склады";

  const resetFilters = () => {
    onStatusChange("all");
    onSupplierChange(null);
    onWarehouseChange(null);
  };

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
        containerType: "inline-size",
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", gap: 1 }}>
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Накладные{" "}
            <Typography component="span" variant="subtitle1" color="text.secondary" sx={{ fontWeight: 400 }}>
              ({filterActive ? `${receipts.length} из ${total}` : total})
            </Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {periodLabel} · {scopeLabel}
          </Typography>
        </Stack>
        <Tooltip title={filterActive ? "Сбросить фильтры" : "Фильтры"}>
          <IconButton
            size="small"
            onClick={filterActive ? resetFilters : undefined}
            sx={{
              color: filterActive ? "primary.onSurface" : "text.secondary",
              bgcolor: filterActive ? "primary.lighter" : "transparent",
            }}
          >
            <FilterListOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
        {statusOptions.map((o) => (
          <FilterChip key={o.value} active={status === o.value} onClick={() => onStatusChange(o.value)}>
            {o.count != null ? `${o.label} · ${o.count}` : o.label}
          </FilterChip>
        ))}
      </Stack>

      <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
        <FilterChip
          active={supplierId !== null}
          icon={<StorefrontOutlined />}
          onClick={(e) => setMenu({ anchor: e.currentTarget, kind: "supplier" })}
        >
          <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
            {supplierLabel}
            <ExpandMoreOutlined sx={{ fontSize: 16 }} />
          </Box>
        </FilterChip>
        <FilterChip
          active={warehouseId !== null}
          icon={<WarehouseOutlined />}
          onClick={(e) => setMenu({ anchor: e.currentTarget, kind: "warehouse" })}
        >
          <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
            {warehouseLabel}
            <ExpandMoreOutlined sx={{ fontSize: 16 }} />
          </Box>
        </FilterChip>
      </Stack>

      <Menu
        anchorEl={menu?.anchor ?? null}
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        slotProps={{ paper: { sx: { minWidth: 240, maxHeight: 380 } } }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, fontWeight: 600, display: "block" }}>
          {menu?.kind === "supplier" ? "Поставщик" : "Склад"}
        </Typography>
        {(menu?.kind === "supplier"
          ? [{ id: null as number | null, label: "Все поставщики" }, ...suppliers]
          : [{ id: null as number | null, label: "Все склады" }, ...warehouses]
        ).map((option) => {
          const current = menu?.kind === "supplier" ? supplierId : warehouseId;
          const selected = current === option.id;
          return (
            <MenuItem
              key={option.id ?? "all"}
              selected={selected}
              onClick={() => {
                (menu?.kind === "supplier" ? onSupplierChange : onWarehouseChange)(option.id);
                setMenu(null);
              }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>{selected && <CheckIcon fontSize="small" color="primary" />}</ListItemIcon>
              <ListItemText primaryTypographyProps={{ variant: "body2" }}>{option.label}</ListItemText>
            </MenuItem>
          );
        })}
        <Divider />
        <MenuItem disabled={!filterActive} onClick={() => { resetFilters(); setMenu(null); }}>
          <ListItemText primaryTypographyProps={{ variant: "body2", color: "primary" }}>Сбросить фильтры</ListItemText>
        </MenuItem>
      </Menu>

      {!loading && errorMessage && (
        <Box sx={{ position: "absolute", inset: 0, top: 120, display: "flex", pointerEvents: "none" }}>
          <ListEmptyState icon={<ReceiptLongOutlined />} title="Не удалось загрузить накладные" description={errorMessage} />
        </Box>
      )}

      {!loading && !errorMessage && receipts.length === 0 && !filterActive && (
        <Box sx={{ position: "absolute", inset: 0, top: 120, display: "flex", pointerEvents: "none" }}>
          <ListEmptyState
            icon={<ReceiptLongOutlined />}
            title="Накладных пока нет"
            description="Оформите приход от поставщика — вручную или по фото накладной."
            action={
              onAdd ? (
                <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={onAdd}>
                  Новая накладная
                </Button>
              ) : undefined
            }
          />
        </Box>
      )}

      {!loading && !errorMessage && receipts.length === 0 && filterActive && (
        <Box sx={{ position: "absolute", inset: 0, top: 120, display: "flex", pointerEvents: "none" }}>
          <ListEmptyState
            icon={<FilterListOutlined />}
            title="Ничего не найдено"
            description="Под выбранные фильтры накладных нет."
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
        ) : receipts.length === 0 ? null : (
          <Stack spacing={1} sx={{ p: 1.5 }}>
            {receipts.map((receipt) => {
              const isSelected = receipt.id === selectedId;
              const canceled = receipt.status === "canceled";
              return (
                <ButtonBase
                  key={receipt.id}
                  onClick={() => onSelect(receipt)}
                  focusRipple
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 1.5,
                    rowGap: 0.75,
                    width: "100%",
                    textAlign: "left",
                    p: 1.25,
                    borderRadius: 1,
                    border: 1,
                    borderColor: isSelected ? "primary.main" : "divider",
                    bgcolor: (theme) => (isSelected ? alpha(theme.palette.primary.main, 0.08) : "background.paper"),
                    opacity: canceled ? 0.65 : 1,
                    transition: "border-color .15s ease, background-color .15s ease",
                    "&:hover": {
                      borderColor: (theme) => alpha(theme.palette.primary.main, 0.28),
                      bgcolor: (theme) => subtleBg(theme, true),
                    },
                    // Узкий список: сумма и статус — второй строкой под названием.
                    "@container (max-width: 360px)": {
                      "& .receipt-right": {
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        pt: 0.75,
                        borderTop: 1,
                        borderColor: "divider",
                      },
                    },
                  }}
                >
                  <Box
                    sx={{
                      flexShrink: 0,
                      width: 48,
                      height: 48,
                      borderRadius: 1,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 600,
                      fontSize: "1.1rem",
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                      color: "primary.onSurface",
                    }}
                  >
                    {initialOf(receipt.supplierName)}
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ rowGap: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {receipt.number}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        · {formatShortDateTime(receipt.receivedAt)}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {receipt.supplierName}
                    </Typography>
                    <Stack direction="row" gap={0.75} sx={{ mt: 0.5 }} flexWrap="wrap">
                      <Chip
                        label={receipt.branchName ? `${receipt.warehouseName} · ${receipt.branchName}` : receipt.warehouseName}
                        size="small"
                        sx={{ height: 20, fontSize: "0.7rem", fontWeight: 500, bgcolor: "action.hover", color: "text.secondary", "& .MuiChip-label": { px: 0.75 } }}
                      />
                      <Chip
                        label={`${receipt.linesCount} поз.`}
                        size="small"
                        sx={{ height: 20, fontSize: "0.7rem", fontWeight: 500, bgcolor: "action.hover", color: "text.secondary", "& .MuiChip-label": { px: 0.75 } }}
                      />
                    </Stack>
                  </Box>

                  <Stack className="receipt-right" alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(receipt.totalCost)}{" "}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                        сом
                      </Typography>
                    </Typography>
                    <ReceiptStatusChip receipt={receipt} compact />
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

export default ReceiptList;
