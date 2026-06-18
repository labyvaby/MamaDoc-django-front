
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
    Drawer,
    IconButton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { AppCard } from "../ui";
import { formatDateRu } from "../../utility/format";
import { StockItem, StockMovement } from "../../services/warehouse";
import { AppointmentDetailsCard } from "../../pages/home/components/AppointmentDetailsCard";

interface StockDetailsProps {
    item: StockItem | null;
    movements: StockMovement[];
    loadingMovements: boolean;
    onAddStock: () => void;
    onRemoveStock: () => void;
    warehouseName?: string;
    warehouseAddress?: string;
    onEditMovement?: (movement: StockMovement) => void;
}

type FilterType = "all" | "receipt" | "consumption";

export const StockDetails: React.FC<StockDetailsProps> = ({
    item,
    movements,
    loadingMovements,
    onAddStock,
    onRemoveStock,
    warehouseName,
    warehouseAddress,
    onEditMovement,
}) => {
    const [filter, setFilter] = React.useState<FilterType>("all");
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [selectedReferenceType, setSelectedReferenceType] = React.useState<"Appointments" | "Sales" | null>(null);
    const [selectedReferenceId, setSelectedReferenceId] = React.useState<string | null>(null);
    const [daysFilter, setDaysFilter] = React.useState<number>(7); // 7, 30, 90, 0 (all)

    // Filter movements based on type and date range
    const filteredMovements = React.useMemo(() => {
        let filtered = movements;

        // Filter by type
        if (filter !== "all") {
            filtered = filtered.filter(move => move.move_type === filter);
        }

        // Filter by date range
        if (daysFilter > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysFilter);
            filtered = filtered.filter(move => new Date(move.created_at) >= cutoffDate);
        }

        return filtered;
    }, [movements, filter, daysFilter]);

    // Handle clicking on movement to open related record
    const handleMovementClick = (referenceTable: string, referenceId: string) => {
        if (referenceTable === "Appointments") {
            setSelectedReferenceType("Appointments");
            setSelectedReferenceId(referenceId);
            setDialogOpen(true);
        } else if (referenceTable === "Sales") {
            setSelectedReferenceType("Sales");
            setSelectedReferenceId(referenceId);
            setDialogOpen(true);
        }
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setSelectedReferenceType(null);
        setSelectedReferenceId(null);
    };

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
            title={item.product_name}
            subheader={
                <Typography variant="body2" color="text.secondary">
                    Товар ID: {item.product_barcode || "Нет ID"}
                </Typography>
            }
            headerActions={
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
                            {item.quantity} {item.product_unit || "шт"}
                        </Typography>
                        <Typography variant="body2" color="text.primary" display="block" fontWeight={600} sx={{ mt: 1 }}>
                            Склад: {warehouseName || "Неизвестно"}
                        </Typography>
                        {warehouseAddress && (
                            <Typography variant="body2" color="text.secondary" display="block">
                                Адрес: {warehouseAddress}
                            </Typography>
                        )}
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            Обновлено: {formatDateRu(item.last_updated) + ", " + new Date(item.last_updated).toLocaleTimeString("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </Typography>
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
                                            color: filter === tab.value ? "primary.onSurface" : "text.secondary",
                                            transition: "all 0.2s",
                                        }}
                                    >
                                        {tab.label}
                                    </Typography>
                                </Box>
                            ))}
                        </Stack>

                        {/* Date Range Filter */}
                        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}>
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
                                        minWidth: 'auto',
                                        px: 1.5,
                                        py: 0.5,
                                        fontSize: '0.75rem',
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
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1,
                                }}
                            >
                                <List disablePadding>
                                    {filteredMovements.map(move => {
                                        const title = getMoveTypeLabelWithContext(move.move_type, move.reference_table);
                                        const isClickable = move.reference_table === "Appointments" || move.reference_table === "Sales";
                                        const isEditable = canEditMovement(move) && !!onEditMovement;
                                        const isInteractive = isClickable || isEditable;

                                        return (
                                            <ListItem
                                                key={move.id}
                                                divider
                                                sx={{
                                                    py: 1,
                                                    px: 1.5,
                                                    cursor: isInteractive ? 'pointer' : 'default',
                                                    '&:hover': isInteractive ? {
                                                        bgcolor: 'action.hover'
                                                    } : {}
                                                }}
                                                onClick={() => {
                                                    if (isClickable && move.reference_id) {
                                                        handleMovementClick(move.reference_table!, move.reference_id);
                                                        return;
                                                    }

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
                                                                <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.875rem' }} noWrap>
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
                                                                color={getQuantityColor(move.move_type)}
                                                                sx={{ fontSize: '0.875rem', ml: 1, flexShrink: 0 }}
                                                            >
                                                                {getQuantityDisplay(move.move_type, move.quantity)}
                                                            </Typography>
                                                        </Stack>
                                                    }
                                                    secondary={
                                                        <React.Fragment>
                                                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.25 }}>
                                                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                                                    {formatDateRu(move.created_at)} • {new Date(move.created_at).toLocaleTimeString("ru-RU", {
                                                                        hour: "2-digit",
                                                                        minute: "2-digit",
                                                                    })}
                                                                </Typography>
                                                                {move.unit_cost !== undefined && move.unit_cost !== null && (
                                                                    <Typography variant="caption" fontWeight={600} color="text.primary" sx={{ fontSize: '0.7rem' }}>
                                                                        {new Intl.NumberFormat("ru-RU").format(move.unit_cost)} сом
                                                                    </Typography>
                                                                )}
                                                            </Stack>
                                                            {move.comment && (
                                                                <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                                                                    <Typography variant="body2" color="text.primary" sx={{ fontSize: '0.8125rem', whiteSpace: 'pre-wrap' }}>
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

            {/* Drawer for Appointment/Sale Details */}
            <Drawer
                anchor="right"
                open={dialogOpen}
                onClose={handleCloseDialog}
                sx={{
                    '& .MuiDrawer-paper': {
                        width: { xs: '100%', sm: 600, md: 700 },
                        boxSizing: 'border-box',
                    }
                }}
            >
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider'
                }}>
                    <Typography variant="h6">
                        {selectedReferenceType === "Appointments" ? "Детали приема" : "Детали продажи"}
                    </Typography>
                    <IconButton onClick={handleCloseDialog} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Box sx={{ overflowY: 'auto', flex: 1 }}>
                    {selectedReferenceType === "Appointments" && selectedReferenceId && (
                        <AppointmentDetailsCard
                            appointmentId={selectedReferenceId}
                            onClose={handleCloseDialog}
                            onUpdate={() => { }}
                            hideActionsForDoctor={true}
                        />
                    )}
                    {selectedReferenceType === "Sales" && selectedReferenceId && (
                        <Box sx={{ p: 3, textAlign: 'center' }}>
                            <Typography variant="body1" color="text.secondary">
                                Детали продажи (ID: {selectedReferenceId})
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                Компонент деталей продажи в разработке
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Drawer>
        </AppCard>
    );
};

// Helpers
const getMoveTypeLabelWithContext = (type: StockMovement['move_type'], referenceTable?: string | null) => {
    if (type === 'consumption') {
        if (referenceTable === 'Appointments') {
            return 'Расход: на прием';
        } else if (referenceTable === 'Sales') {
            return 'Расход: на продажу';
        }
        return 'Расход';
    }

    const map: Record<string, string> = {
        'receipt': 'Приход',
        'adjustment': 'Корректировка',
        'transfer_in': 'Перемещение (В)',
        'transfer_out': 'Перемещение (Из)'
    };
    return map[type] || type;
};

const canEditMovement = (move: StockMovement) => {
    return move.move_type === 'receipt' && (!move.reference_table || move.reference_table === 'manual');
};

const getQuantityDisplay = (type: StockMovement['move_type'], quantity: number) => {
    // For consumption and transfer_out, show minus sign
    if (type === 'consumption' || type === 'transfer_out') {
        return `-${Math.abs(quantity)}`;
    }
    if (type === 'receipt' || type === 'transfer_in') {
        return `+${quantity}`;
    }
    return quantity.toString();
}

const getQuantityColor = (type: StockMovement['move_type']) => {
    if (['consumption', 'transfer_out'].includes(type)) return 'error.main';
    if (['receipt', 'transfer_in'].includes(type)) return 'success.main';
    return 'text.primary';
}
