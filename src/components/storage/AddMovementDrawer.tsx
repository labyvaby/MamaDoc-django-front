
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
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import { StockItem, StockMovement } from "../../services/warehouse";

const noSpinnersSx = {
    '& input[type=number]': { MozAppearance: 'textfield' },
    '& input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
    '& input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
};

export type MovementProductOption = {
    id: string;
    label: string;
};

interface AddMovementDrawerProps {
    open: boolean;
    onClose: () => void;
    product: StockItem | null;
    mode: "in" | "out";
    onConfirm: (quantity: number, comment?: string, selectedProduct?: MovementProductOption | null, amount?: number, paymentMethod?: 'cash' | 'cashless') => Promise<void>;
    availableProducts?: MovementProductOption[];
    editingMovement?: StockMovement | null;
}

export const AddMovementDrawer: React.FC<AddMovementDrawerProps> = ({
    open,
    onClose,
    product,
    mode,
    onConfirm,
    availableProducts = [],
    editingMovement = null,
}) => {
    const [quantity, setQuantity] = useState<string>("");
    const [amount, setAmount] = useState<string>("");
    const [comment, setComment] = useState("");
    const [loading, setLoading] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<MovementProductOption | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'cashless'>('cash');

    useEffect(() => {
        if (open) {
            setQuantity(editingMovement ? String(Math.abs(editingMovement.quantity || 0)) : "");
            setAmount(
                editingMovement?.unit_cost !== undefined && editingMovement?.unit_cost !== null
                    ? String(editingMovement.unit_cost)
                    : "",
            );
            setComment(editingMovement?.comment ?? "");
            setLoading(false);
            setSelectedProduct(null);
            setPaymentMethod(editingMovement?.payment_method ?? 'cash');
        }
    }, [open, product, editingMovement]);

    const handleSubmit = async () => {
        const qty = parseFloat(quantity);
        const amt = parseFloat(amount);
        if (isNaN(qty) || qty <= 0) return;
        if (isNaN(amt) || amt <= 0) return;
        if (!product && !selectedProduct) return;

        try {
            setLoading(true);
            await onConfirm(qty, comment, selectedProduct, amt, mode === 'in' ? paymentMethod : undefined);
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const getTitle = () => {
        if (editingMovement) return "Редактировать приход";
        if (!product && mode === 'in') return "Приход нового товара";
        if (mode === 'in') return "Приход товара";
        return "Списание товара";
    };

    const amtNum = parseFloat(amount) || 0;
    const qtyNum = parseFloat(quantity) || 0;
    const isValid = qtyNum > 0 && amtNum > 0 && (!!product || !!selectedProduct);

    const accentColor = mode === 'in' ? 'success' : 'error';

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
                <Typography variant="h6">{getTitle()}</Typography>
                <IconButton onClick={loading ? undefined : onClose} aria-label="Закрыть">
                    <CloseOutlined />
                </IconButton>
            </Box>

            <Stack
                spacing={3}
                sx={{
                    p: 3,
                    flex: 1,
                    overflowY: 'auto',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    '&::-webkit-scrollbar': { display: 'none' },
                }}
            >
                {/* Main Card */}
                <Paper
                    elevation={0}
                    sx={{
                        p: 2.5,
                        bgcolor: (theme) => alpha(theme.palette[accentColor].main, 0.04),
                        border: '1px solid',
                        borderColor: (theme) => alpha(theme.palette[accentColor].main, 0.2),
                        borderRadius: "14px",
                    }}
                >
                    <Stack spacing={2}>
                        {/* Product Section */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.5 }}>
                                Товар
                            </Typography>

                            {product ? (
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <Inventory2Outlined sx={{ fontSize: 18, color: `${accentColor}.main` }} />
                                    <Box>
                                        <Typography variant="body1" fontWeight={600}>{product.product_name}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Остаток: {product.quantity} {product.product_unit}
                                        </Typography>
                                    </Box>
                                </Stack>
                            ) : (
                                <Autocomplete<MovementProductOption, false, false, false>
                                    options={availableProducts}
                                    getOptionLabel={(option) => option.label || ""}
                                    value={selectedProduct}
                                    onChange={(_, newValue) => setSelectedProduct(newValue)}
                                    renderInput={(params) => <TextField {...params} placeholder="Поиск товара..." size="small" />}
                                    noOptionsText="Товар не найден"
                                />
                            )}
                        </Box>

                        <Divider />

                        {/* Quantity & Amount */}
                        <Stack spacing={2}>
                            {/* Количество */}
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <Box flex={1}>
                                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                        Количество
                                    </Typography>
                                    <Stack direction="row" alignItems="center" spacing={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', height: 40 }}>
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
                                            autoFocus={!!product}
                                            inputProps={{ style: { textAlign: 'center' }, min: 0 }}
                                            sx={{ flex: 1, ...noSpinnersSx }}
                                            InputProps={{ disableUnderline: true }}
                                        />
                                        <Button
                                            size="small"
                                            onClick={() => setQuantity(String((parseFloat(quantity) || 0) + 1))}
                                            sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
                                        >
                                            +
                                        </Button>
                                    </Stack>
                                </Box>

                                {/* Сумма */}
                                <Box flex={1}>
                                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                        {mode === "in" ? "Сумма закупки" : "Сумма списания"}
                                    </Typography>
                                    <TextField
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        size="small"
                                        fullWidth
                                        placeholder="0"
                                        InputProps={{
                                            endAdornment: (
                                                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                                    сом
                                                </Typography>
                                            ),
                                        }}
                                        sx={{ ...noSpinnersSx }}
                                    />
                                </Box>
                            </Stack>

                            {/* Способ оплаты (только приход) */}
                            {mode === 'in' && (
                                <>
                                    <Stack direction="row" spacing={1.5}>
                                        <Stack flex={1} spacing={0.5}>
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                Наличные
                                            </Typography>
                                            <Box
                                                onClick={() => setPaymentMethod('cash')}
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 1,
                                                    p: 1.25,
                                                    border: '1px solid',
                                                    borderColor: paymentMethod === 'cash' ? 'success.main' : 'divider',
                                                    borderRadius: 1,
                                                    bgcolor: paymentMethod === 'cash'
                                                        ? (theme) => alpha(theme.palette.success.main, 0.08)
                                                        : 'background.paper',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                }}
                                            >
                                                <PaymentsOutlined sx={{ fontSize: 18, color: paymentMethod === 'cash' ? 'success.main' : 'action.active' }} />
                                                <Typography variant="body2" fontWeight={paymentMethod === 'cash' ? 600 : 400}>
                                                    Наличные
                                                </Typography>
                                            </Box>
                                        </Stack>

                                        <Stack flex={1} spacing={0.5}>
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                Безналичные
                                            </Typography>
                                            <Box
                                                onClick={() => setPaymentMethod('cashless')}
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 1,
                                                    p: 1.25,
                                                    border: '1px solid',
                                                    borderColor: paymentMethod === 'cashless' ? 'success.main' : 'divider',
                                                    borderRadius: 1,
                                                    bgcolor: paymentMethod === 'cashless'
                                                        ? (theme) => alpha(theme.palette.success.main, 0.08)
                                                        : 'background.paper',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                }}
                                            >
                                                <CreditCardOutlined sx={{ fontSize: 18, color: paymentMethod === 'cashless' ? 'success.main' : 'action.active' }} />
                                                <Typography variant="body2" fontWeight={paymentMethod === 'cashless' ? 600 : 400}>
                                                    Безнал
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    </Stack>
                                </>
                            )}

                            <Divider />

                            {/* Итого */}
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                                    {mode === 'in' ? 'Итого к оплате' : 'Сумма списания'}
                                </Typography>
                                <Typography variant="h5" fontWeight={700} color={`${accentColor}.main`}>
                                    {amtNum > 0 ? amtNum.toLocaleString() : 0} сом
                                </Typography>
                            </Stack>

                            {/* Статус */}
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" color="text.secondary">
                                    Статус
                                </Typography>
                                <Chip
                                    label={isValid ? (editingMovement ? 'Готово к сохранению' : mode === 'in' ? 'Готово к приходу' : 'Готово к списанию') : 'Не заполнено'}
                                    size="small"
                                    color={isValid ? accentColor : 'default'}
                                    sx={{ fontWeight: 600 }}
                                />
                            </Stack>
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
                        placeholder={mode === "out" ? "Укажите причину списания" : "Укажите источник или комментарий"}
                    />
                </Stack>
            </Stack>

            {/* Footer */}
            <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    color={accentColor}
                    disabled={loading || !isValid}
                    onClick={handleSubmit}
                >
                    {loading ? <CircularProgress size={24} color="inherit" /> : editingMovement ? "Сохранить" : "Подтвердить"}
                </Button>
            </Box>
        </Drawer>
    );
};
