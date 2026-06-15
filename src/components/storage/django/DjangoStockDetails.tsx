import React from "react";
import {
    Box,
    Typography,
    Stack,
    Button,
    Divider,
    IconButton,
    Avatar,
    Chip,
    Skeleton,
    alpha,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import TouchAppOutlinedIcon from "@mui/icons-material/TouchAppOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import { AppCard, ListEmptyState } from "../../ui";
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

const TYPE_TABS: { value: FilterType; label: string }[] = [
    { value: "all", label: "Все" },
    { value: "receipt", label: "Приход" },
    { value: "consumption", label: "Списание" },
];

const DATE_RANGES: { value: number; label: string }[] = [
    { value: 7, label: "7 дней" },
    { value: 30, label: "30 дней" },
    { value: 90, label: "90 дней" },
    { value: 0, label: "Всё время" },
];

const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

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
            <AppCard
                variant="outlined"
                sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    borderColor: "divider",
                    "&:hover": { boxShadow: "none" },
                }}
                disableContentPadding
            >
                <Box sx={{ flex: 1, display: "flex" }}>
                    <ListEmptyState
                        icon={<TouchAppOutlinedIcon />}
                        title="Выберите товар"
                        description="Нажмите на позицию в списке слева, чтобы увидеть остаток и историю движений."
                    />
                </Box>
            </AppCard>
        );
    }

    const inStock = item.quantity > 0;

    return (
        <AppCard
            variant="outlined"
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                borderColor: "divider",
                "&:hover": { boxShadow: "none" },
            }}
            title={item.productName}
            subheader={
                <Typography variant="body2" color="text.secondary">
                    {item.productCategory || "Без категории"}
                    {item.productBarcode ? ` • ${item.productBarcode}` : ""}
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
                    {/* Hero: текущий остаток */}
                    <Box
                        sx={{
                            p: 2.5,
                            borderRadius: 3,
                            border: 1,
                            borderColor: (theme) =>
                                alpha(
                                    inStock ? theme.palette.success.main : theme.palette.error.main,
                                    0.25,
                                ),
                            bgcolor: (theme) =>
                                alpha(
                                    inStock ? theme.palette.success.main : theme.palette.error.main,
                                    0.06,
                                ),
                        }}
                    >
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                                    Текущий остаток
                                </Typography>
                                <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 0.5 }}>
                                    <Typography
                                        variant="h3"
                                        fontWeight={700}
                                        color={inStock ? "success.main" : "error.main"}
                                        sx={{ lineHeight: 1 }}
                                    >
                                        {item.quantity}
                                    </Typography>
                                    <Typography variant="h6" color="text.secondary" fontWeight={600}>
                                        {item.productUnit || "шт"}
                                    </Typography>
                                </Stack>
                            </Box>
                            <Chip
                                size="small"
                                label={inStock ? "В наличии" : "Нет в наличии"}
                                color={inStock ? "success" : "error"}
                                variant={inStock ? "filled" : "outlined"}
                                sx={{ fontWeight: 600, flexShrink: 0 }}
                            />
                        </Stack>

                        <Divider sx={{ my: 1.5 }} />

                        <Stack spacing={0.75}>
                            <Stack direction="row" alignItems="center" spacing={1} color="text.secondary">
                                <StorefrontOutlinedIcon sx={{ fontSize: 16 }} />
                                <Typography variant="body2" color="text.primary" fontWeight={600} noWrap>
                                    {warehouseName || item.warehouseName || "Неизвестно"}
                                </Typography>
                            </Stack>
                            {(warehouseAddress || item.warehouseAddress) && (
                                <Stack direction="row" alignItems="center" spacing={1} color="text.secondary">
                                    <PlaceOutlinedIcon sx={{ fontSize: 16 }} />
                                    <Typography variant="body2" color="text.secondary" noWrap>
                                        {warehouseAddress || item.warehouseAddress}
                                    </Typography>
                                </Stack>
                            )}
                            {item.lastUpdated && (
                                <Stack direction="row" alignItems="center" spacing={1} color="text.secondary">
                                    <ScheduleOutlinedIcon sx={{ fontSize: 16 }} />
                                    <Typography variant="body2" color="text.secondary">
                                        Обновлено: {formatDateRu(item.lastUpdated)}, {formatTime(item.lastUpdated)}
                                    </Typography>
                                </Stack>
                            )}
                        </Stack>
                    </Box>

                    {/* История движений */}
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                            История движений
                        </Typography>

                        {/* Сегмент-контрол по типу */}
                        <Box
                            sx={{
                                display: "inline-flex",
                                p: 0.5,
                                mb: 1.5,
                                borderRadius: 2,
                                bgcolor: "action.hover",
                            }}
                        >
                            {TYPE_TABS.map((tab) => {
                                const active = filter === tab.value;
                                return (
                                    <Box
                                        key={tab.value}
                                        component="button"
                                        type="button"
                                        onClick={() => setFilter(tab.value)}
                                        sx={{
                                            border: 0,
                                            cursor: "pointer",
                                            px: 1.75,
                                            py: 0.5,
                                            borderRadius: 1.5,
                                            fontSize: "0.8125rem",
                                            fontWeight: active ? 600 : 500,
                                            fontFamily: "inherit",
                                            color: active ? "primary.main" : "text.secondary",
                                            bgcolor: active ? "background.paper" : "transparent",
                                            boxShadow: active ? 1 : 0,
                                            transition: "all .15s ease",
                                        }}
                                    >
                                        {tab.label}
                                    </Box>
                                );
                            })}
                        </Box>

                        {/* Диапазон дат */}
                        <Stack direction="row" spacing={0.75} sx={{ mb: 2, flexWrap: "wrap", gap: 0.75 }}>
                            {DATE_RANGES.map((option) => {
                                const active = daysFilter === option.value;
                                return (
                                    <Chip
                                        key={option.value}
                                        label={option.label}
                                        size="small"
                                        onClick={() => setDaysFilter(option.value)}
                                        variant={active ? "filled" : "outlined"}
                                        color={active ? "primary" : "default"}
                                        sx={{ fontWeight: 500 }}
                                    />
                                );
                            })}
                        </Stack>

                        {loadingMovements ? (
                            <MovementSkeleton />
                        ) : filteredMovements.length === 0 ? (
                            <ListEmptyState
                                icon={<HistoryOutlinedIcon />}
                                title={filter === "all" ? "Движений пока нет" : "Нет записей"}
                                description={
                                    filter === "all"
                                        ? "Здесь появятся приходы и списания по этому товару."
                                        : "Под выбранные фильтры ничего не нашлось."
                                }
                            />
                        ) : (
                            <Stack spacing={1}>
                                {filteredMovements.map((move) => (
                                    <MovementRow
                                        key={move.id}
                                        move={move}
                                        editable={canManage && canEditMovement(move) && !!onEditMovement}
                                        onEdit={() => onEditMovement?.(move)}
                                    />
                                ))}
                            </Stack>
                        )}
                    </Box>
                </Stack>
            </Box>
        </AppCard>
    );
};

// ── Movement row ─────────────────────────────────────────────────────────────

const MovementRow: React.FC<{
    move: DjangoStockMovement;
    editable: boolean;
    onEdit: () => void;
}> = ({ move, editable, onEdit }) => {
    const visual = getMoveVisual(move.moveType);
    return (
        <Box
            onClick={editable ? onEdit : undefined}
            sx={{
                display: "flex",
                gap: 1.5,
                p: 1.25,
                borderRadius: 2,
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                cursor: editable ? "pointer" : "default",
                transition: "border-color .15s ease, background-color .15s ease",
                "&:hover": editable
                    ? { borderColor: "primary.main", bgcolor: "action.hover" }
                    : {},
            }}
        >
            <Avatar
                variant="rounded"
                sx={{
                    flexShrink: 0,
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: (theme) => alpha(theme.palette[visual.color].main, 0.12),
                    color: `${visual.color}.main`,
                }}
            >
                {visual.icon}
            </Avatar>

            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                            {getMoveTypeLabel(move.moveType)}
                        </Typography>
                        {editable && (
                            <IconButton
                                size="small"
                                aria-label="Редактировать приход"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit();
                                }}
                                sx={{ flexShrink: 0, color: "text.secondary", "&:hover": { color: "primary.main" } }}
                            >
                                <EditOutlinedIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        )}
                    </Stack>
                    <Typography
                        variant="body2"
                        fontWeight={700}
                        color={`${visual.color}.main`}
                        sx={{ flexShrink: 0 }}
                    >
                        {getQuantityDisplay(move.moveType, move.quantity)}
                    </Typography>
                </Stack>

                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.25 }}>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                        {formatDateRu(move.createdAt)} • {formatTime(move.createdAt)}
                        {move.createdByName ? ` • ${move.createdByName}` : ""}
                    </Typography>
                    {move.totalCost !== null && (
                        <Typography variant="caption" fontWeight={600} color="text.primary" sx={{ flexShrink: 0, ml: 1 }}>
                            {new Intl.NumberFormat("ru-RU").format(move.totalCost)} сом
                        </Typography>
                    )}
                </Stack>

                {move.comment && (
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                            mt: 0.75,
                            pl: 1.25,
                            borderLeft: 2,
                            borderColor: "divider",
                            fontSize: "0.8125rem",
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {move.comment}
                    </Typography>
                )}
            </Box>
        </Box>
    );
};

const MovementSkeleton: React.FC = () => (
    <Stack spacing={1}>
        {Array.from({ length: 3 }).map((_, i) => (
            <Box
                key={i}
                sx={{
                    display: "flex",
                    gap: 1.5,
                    p: 1.25,
                    borderRadius: 2,
                    border: 1,
                    borderColor: "divider",
                }}
            >
                <Skeleton variant="rounded" width={36} height={36} sx={{ borderRadius: 2, flexShrink: 0 }} />
                <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="40%" height={20} />
                    <Skeleton variant="text" width="65%" height={16} />
                </Box>
            </Box>
        ))}
    </Stack>
);

// ── Helpers ──────────────────────────────────────────────────────────────────

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

type MoveColor = "success" | "error" | "primary";

const getMoveVisual = (type: MoveType): { icon: React.ReactNode; color: MoveColor } => {
    switch (type) {
        case "receipt":
            return { icon: <AddIcon sx={{ fontSize: 18 }} />, color: "success" };
        case "transfer_in":
            return { icon: <SwapHorizOutlinedIcon sx={{ fontSize: 18 }} />, color: "success" };
        case "consumption":
            return { icon: <RemoveIcon sx={{ fontSize: 18 }} />, color: "error" };
        case "transfer_out":
            return { icon: <SwapHorizOutlinedIcon sx={{ fontSize: 18 }} />, color: "error" };
        case "adjustment":
        default:
            return { icon: <TuneOutlinedIcon sx={{ fontSize: 18 }} />, color: "primary" };
    }
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
