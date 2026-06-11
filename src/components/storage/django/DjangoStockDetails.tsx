import React from "react";
import {
    Box,
    Typography,
    Stack,
    Button,
    Divider,
    CircularProgress,
    List,
    ListItem,
    ListItemText,
    IconButton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { AppCard } from "../../ui";
import { formatDateRu } from "../../../utility/format";
import { DjangoStockItem, DjangoStockMovement, MoveType } from "../../../api/warehouse";

interface DjangoStockDetailsProps {
    item: DjangoStockItem | null;
    movements: DjangoStockMovement[];
    loadingMovements: boolean;
    onAddStock: () => void;
    onRemoveStock: () => void;
    warehouseName?: string;
    warehouseAddress?: string;
    onEditMovement?: (movement: DjangoStockMovement) => void;
    canManage?: boolean;
}

type FilterType = "all" | "receipt" | "consumption";

export const DjangoStockDetails: React.FC<DjangoStockDetailsProps> = ({
    item,
    movements,
    loadingMovements,
    onAddStock,
    onRemoveStock,
    warehouseName,
    warehouseAddress,
    onEditMovement,
    canManage = true,
}) => {
    const [filter, setFilter] = React.useState<FilterType>("all");
    const [daysFilter, setDaysFilter] = React.useState<number>(7); // 7, 30, 90, 0 (all)

    // Filter movements based on type and date range
    const filteredMovements = React.useMemo(() => {
        let filtered = movements;

        if (filter !== "all") {
            filtered = filtered.filter((move) => move.moveType === filter);
        }

        if (daysFilter > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysFilter);
            filtered = filtered.filter((move) => new Date(move.createdAt) >= cutoffDate);
        }

        return filtered;
    }, [movements, filter, daysFilter]);

    if (!item) {
        return (
            <Box
                sx={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: 1,
                    color: "text.secondary",
                }}
            >
                <Typography>Выберите товар для просмотра</Typography>
            </Box>
        );
    }

    return (
        <AppCard
            variant="outlined"
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                borderColor: "divider",
            }}
            title={item.productName}
            subheader={
                <Typography variant="body2" color="text.secondary">
                    Товар ID: {item.productBarcode || "Нет ID"}
                </Typography>
            }
            headerActions={
                canManage ? (
                    <Stack direction="row" spacing={1}>
                        <Button
                            variant="outlined"
                            color="primary"
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={onAddStock}
                        >
                            Приход
                        </Button>
                        <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            startIcon={<RemoveIcon />}
                            onClick={onRemoveStock}
                        >
                            Списание
                        </Button>
                    </Stack>
                ) : undefined
            }
            disableContentPadding
        >
            <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
                <Stack spacing={3}>
                    {/* Main Stats */}
                    <Box>
                        <Typography variant="body1" color="text.secondary" gutterBottom fontWeight={600}>
                            Текущий остаток
                        </Typography>
                        <Typography variant="h3" fontWeight={700}>
                            {item.quantity} {item.productUnit || "шт"}
                        </Typography>
                        <Typography variant="body2" color="text.primary" display="block" fontWeight={600} sx={{ mt: 1 }}>
                            Склад: {warehouseName || item.warehouseName || "Неизвестно"}
                        </Typography>
                        {(warehouseAddress || item.warehouseAddress) && (
                            <Typography variant="body2" color="text.secondary" display="block">
                                Адрес: {warehouseAddress || item.warehouseAddress}
                            </Typography>
                        )}
                        {item.lastUpdated && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                Обновлено: {formatDateRu(item.lastUpdated) + ", " + new Date(item.lastUpdated).toLocaleTimeString("ru-RU", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </Typography>
                        )}
                    </Box>

                    <Divider />

                    {/* History */}
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                            История движений
                        </Typography>

                        {/* Filter Tabs */}
                        <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
                            {[
                                { value: "all" as FilterType, label: "Все" },
                                { value: "receipt" as FilterType, label: "Приход" },
                                { value: "consumption" as FilterType, label: "Списание" },
                            ].map((tab) => (
                                <Box
                                    key={tab.value}
                                    onClick={() => setFilter(tab.value)}
                                    sx={{
                                        cursor: "pointer",
                                        position: "relative",
                                        pb: 0.5,
                                        "&::after": {
                                            content: '""',
                                            position: "absolute",
                                            bottom: 0,
                                            left: 0,
                                            right: 0,
                                            height: 2,
                                            bgcolor: filter === tab.value ? "primary.main" : "transparent",
                                            transition: "all 0.2s",
                                        },
                                    }}
                                >
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            fontWeight: filter === tab.value ? 600 : 400,
                                            color: filter === tab.value ? "primary.main" : "text.secondary",
                                            transition: "all 0.2s",
                                        }}
                                    >
                                        {tab.label}
                                    </Typography>
                                </Box>
                            ))}
                        </Stack>

                        {/* Date Range Filter */}
                        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 0.5 }}>
                            {[
                                { value: 7, label: "7 дней" },
                                { value: 30, label: "30 дней" },
                                { value: 90, label: "90 дней" },
                                { value: 0, label: "Все время" },
                            ].map((option) => (
                                <Button
                                    key={option.value}
                                    size="small"
                                    variant={daysFilter === option.value ? "contained" : "outlined"}
                                    onClick={() => setDaysFilter(option.value)}
                                    sx={{
                                        minWidth: "auto",
                                        px: 1.5,
                                        py: 0.5,
                                        fontSize: "0.75rem",
                                    }}
                                >
                                    {option.label}
                                </Button>
                            ))}
                        </Stack>

                        {loadingMovements ? (
                            <Box sx={{ p: 2, textAlign: "center" }}><CircularProgress size={20} /></Box>
                        ) : filteredMovements.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                {filter === "all" ? "История пуста" : "Нет записей"}
                            </Typography>
                        ) : (
                            <Box
                                sx={{
                                    maxHeight: "400px",
                                    overflowY: "auto",
                                    border: "1px solid",
                                    borderColor: "divider",
                                    borderRadius: 1,
                                }}
                            >
                                <List disablePadding>
                                    {filteredMovements.map((move) => {
                                        const title = getMoveTypeLabel(move.moveType);
                                        const isEditable = canManage && canEditMovement(move) && !!onEditMovement;

                                        return (
                                            <ListItem
                                                key={move.id}
                                                divider
                                                sx={{
                                                    py: 1,
                                                    px: 1.5,
                                                    cursor: isEditable ? "pointer" : "default",
                                                    "&:hover": isEditable ? {
                                                        bgcolor: "action.hover",
                                                    } : {},
                                                }}
                                                onClick={() => {
                                                    if (isEditable) {
                                                        onEditMovement?.(move);
                                                    }
                                                }}
                                            >
                                                <ListItemText
                                                    disableTypography
                                                    primary={
                                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                                                                <Typography variant="body2" fontWeight={600} sx={{ fontSize: "0.875rem" }} noWrap>
                                                                    {title}
                                                                </Typography>
                                                                {isEditable && (
                                                                    <IconButton
                                                                        size="small"
                                                                        aria-label="Редактировать приход"
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            onEditMovement?.(move);
                                                                        }}
                                                                        sx={{ flexShrink: 0 }}
                                                                    >
                                                                        <EditOutlinedIcon fontSize="inherit" />
                                                                    </IconButton>
                                                                )}
                                                            </Stack>
                                                            <Typography
                                                                variant="body2"
                                                                fontWeight={700}
                                                                color={getQuantityColor(move.moveType)}
                                                                sx={{ fontSize: "0.875rem", ml: 1, flexShrink: 0 }}
                                                            >
                                                                {getQuantityDisplay(move.moveType, move.quantity)}
                                                            </Typography>
                                                        </Stack>
                                                    }
                                                    secondary={
                                                        <React.Fragment>
                                                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.25 }}>
                                                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                                                                    {formatDateRu(move.createdAt)} • {new Date(move.createdAt).toLocaleTimeString("ru-RU", {
                                                                        hour: "2-digit",
                                                                        minute: "2-digit",
                                                                    })}
                                                                    {move.createdByName ? ` • ${move.createdByName}` : ""}
                                                                </Typography>
                                                                {move.totalCost !== null && (
                                                                    <Typography variant="caption" fontWeight={600} color="text.primary" sx={{ fontSize: "0.7rem" }}>
                                                                        {new Intl.NumberFormat("ru-RU").format(move.totalCost)} сом
                                                                    </Typography>
                                                                )}
                                                            </Stack>
                                                            {move.comment && (
                                                                <Box sx={{ mt: 1, p: 1, bgcolor: "action.hover", borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
                                                                    <Typography variant="body2" color="text.primary" sx={{ fontSize: "0.8125rem", whiteSpace: "pre-wrap" }}>
                                                                        {move.comment}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                        </React.Fragment>
                                                    }
                                                />
                                            </ListItem>
                                        );
                                    })}
                                </List>
                            </Box>
                        )}
                    </Box>

                </Stack>
            </Box>
        </AppCard>
    );
};

// Helpers
const getMoveTypeLabel = (type: MoveType) => {
    const map: Record<string, string> = {
        receipt: "Приход",
        consumption: "Расход",
        adjustment: "Корректировка",
        transfer_in: "Перемещение (В)",
        transfer_out: "Перемещение (Из)",
    };
    return map[type] || type;
};

const canEditMovement = (move: DjangoStockMovement) => {
    return move.moveType === "receipt" && (!move.referenceType || move.referenceType === "manual");
};

const getQuantityDisplay = (type: MoveType, quantity: number) => {
    if (type === "consumption" || type === "transfer_out") {
        return `-${Math.abs(quantity)}`;
    }
    if (type === "receipt" || type === "transfer_in") {
        return `+${quantity}`;
    }
    return quantity.toString();
};

const getQuantityColor = (type: MoveType) => {
    if (["consumption", "transfer_out"].includes(type)) return "error.main";
    if (["receipt", "transfer_in"].includes(type)) return "success.main";
    return "text.primary";
};
