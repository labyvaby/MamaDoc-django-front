import React, { useEffect, useState } from "react";
import {
    Box,
    Button,
    Stack,
    TextField,
    Typography,
    Drawer,
    IconButton,
    Divider,
    Autocomplete,
    Paper,
    Chip,
    alpha,
    CircularProgress,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import { DjangoStockItem } from "../../../api/warehouse";
import type { MovementWarehouseOption } from "./DjangoAddMovementDrawer";

const noSpinnersSx = {
    "& input[type=number]": { MozAppearance: "textfield" },
    "& input[type=number]::-webkit-outer-spin-button": { WebkitAppearance: "none", margin: 0 },
    "& input[type=number]::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 },
};

interface DjangoTransferDrawerProps {
    open: boolean;
    onClose: () => void;
    /** Исходная позиция: товар + склад-источник + доступный остаток. */
    item: DjangoStockItem | null;
    /** Все видимые склады (источник будет исключён из выбора). */
    warehouses: MovementWarehouseOption[];
    onConfirm: (
        toWarehouseId: number,
        quantity: number,
        comment?: string,
    ) => Promise<void>;
}

export const DjangoTransferDrawer: React.FC<DjangoTransferDrawerProps> = ({
    open,
    onClose,
    item,
    warehouses,
    onConfirm,
}) => {
    const [quantity, setQuantity] = useState<string>("");
    const [comment, setComment] = useState("");
    const [loading, setLoading] = useState(false);
    const [toWarehouse, setToWarehouse] = useState<MovementWarehouseOption | null>(null);

    useEffect(() => {
        if (open) {
            setQuantity("");
            setComment("");
            setLoading(false);
            setToWarehouse(null);
        }
    }, [open, item]);

    // Склады назначения — все, кроме склада-источника.
    const targetOptions = React.useMemo(
        () => warehouses.filter((w) => w.id !== item?.warehouseId),
        [warehouses, item],
    );

    const available = item?.quantity ?? 0;
    const qtyNum = parseFloat(quantity) || 0;
    const overStock = qtyNum > available;
    const isValid = qtyNum > 0 && !overStock && !!toWarehouse && !!item;

    const handleSubmit = async () => {
        if (!isValid || !toWarehouse) return;
        try {
            setLoading(true);
            await onConfirm(toWarehouse.id, qtyNum, comment.trim() || undefined);
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={loading ? undefined : onClose}
            PaperProps={{
                sx: { width: { xs: 320, sm: 400 }, display: "flex", flexDirection: "column" },
            }}
        >
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
                <Typography variant="h6">Перемещение товара</Typography>
                <IconButton onClick={loading ? undefined : onClose} aria-label="Закрыть">
                    <CloseOutlined />
                </IconButton>
            </Box>

            <Stack
                spacing={3}
                sx={{
                    p: 3,
                    flex: 1,
                    overflowY: "auto",
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                    "&::-webkit-scrollbar": { display: "none" },
                }}
            >
                <Paper
                    elevation={0}
                    sx={{
                        p: 2.5,
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
                        border: "1px solid",
                        borderColor: (theme) => alpha(theme.palette.primary.main, 0.2),
                        borderRadius: 1,
                    }}
                >
                    <Stack spacing={2}>
                        {/* Товар */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.5 }}>
                                Товар
                            </Typography>
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <Inventory2Outlined sx={{ fontSize: 18, color: "primary.main" }} />
                                <Box>
                                    <Typography variant="body1" fontWeight={600}>
                                        {item?.productName ?? "—"}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Доступно: {available} {item?.productUnit || "шт"}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>

                        <Divider />

                        {/* Со склада → на склад */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.5 }}>
                                Со склада
                            </Typography>
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <StorefrontOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
                                <Typography variant="body2" fontWeight={600} noWrap>
                                    {item?.warehouseName || "—"}
                                </Typography>
                            </Stack>
                        </Box>

                        <Box>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.5 }}>
                                На склад *
                            </Typography>
                            <Autocomplete<MovementWarehouseOption, false, false, false>
                                options={targetOptions}
                                getOptionLabel={(o) => o.label || ""}
                                value={toWarehouse}
                                onChange={(_, v) => setToWarehouse(v)}
                                isOptionEqualToValue={(o, v) => o.id === v.id}
                                renderInput={(params) => (
                                    <TextField {...params} placeholder="Выберите склад..." size="small" />
                                )}
                                noOptionsText="Нет других складов"
                            />
                        </Box>

                        <Divider />

                        {/* Количество */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                Количество
                            </Typography>
                            <Stack direction="row" alignItems="center" spacing={0} sx={{ border: "1px solid", borderColor: overStock ? "error.main" : "divider", borderRadius: 1, bgcolor: "background.paper", height: 40 }}>
                                <Button
                                    size="small"
                                    onClick={() => {
                                        const current = parseFloat(quantity) || 0;
                                        const newVal = Math.max(0, current - 1);
                                        setQuantity(newVal === 0 ? "" : String(newVal));
                                    }}
                                    sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
                                >
                                    −
                                </Button>
                                <TextField
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    variant="standard"
                                    placeholder="0"
                                    autoFocus
                                    inputProps={{ style: { textAlign: "center" }, min: 0, max: available }}
                                    sx={{ flex: 1, ...noSpinnersSx }}
                                    InputProps={{ disableUnderline: true }}
                                />
                                <Button
                                    size="small"
                                    onClick={() => {
                                        const next = (parseFloat(quantity) || 0) + 1;
                                        setQuantity(String(Math.min(next, available)));
                                    }}
                                    sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
                                >
                                    +
                                </Button>
                            </Stack>
                            {overStock && (
                                <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: "block" }}>
                                    Больше, чем доступно ({available} {item?.productUnit || "шт"})
                                </Typography>
                            )}
                        </Box>

                        <Divider />

                        {/* Статус */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" color="text.secondary">
                                Статус
                            </Typography>
                            <Chip
                                label={isValid ? "Готово к перемещению" : "Не заполнено"}
                                size="small"
                                color={isValid ? "primary" : "default"}
                                icon={isValid ? <SwapHorizOutlined sx={{ fontSize: 16 }} /> : undefined}
                                sx={{ fontWeight: 600 }}
                            />
                        </Stack>
                    </Stack>
                </Paper>

                {/* Комментарий */}
                <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Комментарий
                    </Typography>
                    <TextField
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        multiline
                        rows={3}
                        fullWidth
                        placeholder="Причина или примечание к перемещению (необязательно)"
                    />
                </Stack>
            </Stack>

            {/* Footer */}
            <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
                <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    disabled={loading || !isValid}
                    onClick={handleSubmit}
                    startIcon={!loading ? <SwapHorizOutlined /> : undefined}
                >
                    {loading ? <CircularProgress size={24} color="inherit" /> : "Переместить"}
                </Button>
            </Box>
        </Drawer>
    );
};
