
import React, { useEffect, useState, useMemo } from "react";
import { useCloseGuard } from "../../hooks/useCloseGuard";
import { CloseGuardDialog } from "../common/CloseGuardDialog";
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
    Chip,
    Paper,
    alpha,
    Tooltip,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";

import { CreateSaleData } from "../../services/sales";
import { supabase } from "../../utility/supabaseClient";

// CSS to hide spin buttons
const noSpinnersSx = {
    '& input[type=number]': {
        MozAppearance: 'textfield'
    },
    '& input[type=number]::-webkit-outer-spin-button': {
        WebkitAppearance: 'none',
        margin: 0
    },
    '& input[type=number]::-webkit-inner-spin-button': {
        WebkitAppearance: 'none',
        margin: 0
    }
};

interface CreateSaleDrawerProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (data: CreateSaleData) => Promise<void>;
    availableProducts: { id: string; label: string; price: number; image?: string; barcode?: string; is_active?: boolean }[];
}

export const CreateSaleDrawer: React.FC<CreateSaleDrawerProps> = ({
    open,
    onClose,
    onConfirm,
    availableProducts
}) => {
    const [loading, setLoading] = useState(false);
    const [touched, setTouched] = useState(false);
    const [patients, setPatients] = useState<{ id: string, full_name: string }[]>([]);
    const [patientInput, setPatientInput] = useState("");
    const [patientsLoading, setPatientsLoading] = useState(false);

    // Form State
    const [selectedPatient, setSelectedPatient] = useState<{ id: string, full_name: string } | null>(null);

    // Product Lines (multiple products support) - похоже на serviceRows в приеме
    const [productLines, setProductLines] = useState<Array<{
        productId: string;
        quantity: number | '';
    }>>([{ productId: '', quantity: 1 }]);

    // Payment State
    const [cash, setCash] = useState<number | "">("");
    const [card, setCard] = useState<number | "">("");
    const [discountPercent, setDiscountPercent] = useState<number>(0);
    const [comment, setComment] = useState("");

    const isDirty = touched || !!selectedPatient || productLines.some(l => l.productId) || !!cash || !!card || !!comment;
    const { guardedClose, confirmOpen, confirmClose, cancelClose } = useCloseGuard({ isDirty, isOpen: open, onClose });

    // 10 последних пациентов при открытии
    useEffect(() => {
        if (!open) return;
        const load = async () => {
            const { data } = await supabase
                .from("Patients")
                .select("id, full_name, phone")
                .order("created_at", { ascending: false })
                .limit(10);
            setPatients((data || []).map(p => ({ id: p.id, full_name: p.full_name || "Без имени" })));
        };
        load();
    }, [open]);

    // Серверный поиск пациентов по вводу
    useEffect(() => {
        if (!patientInput || patientInput.length < 2) return;
        const controller = new AbortController();
        setPatientsLoading(true);
        const timer = setTimeout(async () => {
            try {
                const cleanQ = patientInput.trim();
                const hasDigits = /\d/.test(cleanQ);
                let q = supabase.from("Patients").select("id, full_name, phone");
                if (hasDigits) {
                    q = q.ilike("phone", `%${cleanQ}%`);
                } else {
                    q = q.ilike("full_name", `%${cleanQ}%`);
                }
                const { data, error } = await q;
                if (controller.signal.aborted) return;
                if (error) { console.error(error); return; }
                setPatients((data || []).map(p => ({
                    id: p.id,
                    full_name: p.full_name || "Без имени"
                })));
            } finally {
                if (!controller.signal.aborted) setPatientsLoading(false);
            }
        }, 400);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [patientInput]);

    // Reset on open
    useEffect(() => {
        if (open) {
            setSelectedPatient(null);
            setProductLines([{ productId: '', quantity: 1 }]);
            setCash("");
            setCard("");
            setDiscountPercent(0);
            setComment("");
            setTouched(false);
        }
    }, [open]);

    // Calculations - based on all product lines
    const baseTotal = useMemo(() => {
        return productLines.reduce((sum, line) => {
            if (!line.productId) return sum;
            const product = availableProducts.find(p => p.id === line.productId);
            if (!product) return sum;
            const quantity = typeof line.quantity === 'number' ? line.quantity : 0;
            return sum + (product.price * quantity);
        }, 0);
    }, [productLines, availableProducts]);

    const discountAmount = Math.round((baseTotal * discountPercent) / 100);
    const finalTotal = Math.max(0, baseTotal - discountAmount);

    const paidCash = Number(cash || 0);
    const paidCard = Number(card || 0);
    const totalPaid = paidCash + paidCard;
    const debt = Math.max(0, finalTotal - totalPaid);

    const hasValidProduct = productLines.some(line => line.productId && line.quantity && line.quantity > 0);

    const handleSubmit = async () => {
        setTouched(true);
        // Validate: at least one valid product line
        const validLines = productLines.filter(line => line.productId && line.quantity && line.quantity > 0);
        if (validLines.length === 0) return;

        try {
            setLoading(true);

            await onConfirm({
                patient_id: selectedPatient?.id,
                comment: comment,
                lines: validLines.map(line => {
                    const product = availableProducts.find(p => p.id === line.productId);
                    return {
                        sellable_item_id: line.productId,
                        quantity: typeof line.quantity === 'number' ? line.quantity : 1,
                        price: product?.price || 0
                    };
                }),
                // Передаем данные об оплате для определения статуса и сохранения в БД
                cash: paidCash,
                card: paidCard,
                totalAmount: finalTotal
            });
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
        <Drawer
            anchor="right"
            open={open}
            onClose={loading ? undefined : guardedClose}
            PaperProps={{ sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
                <Typography variant="h6">Новая продажа</Typography>
                <IconButton onClick={loading ? undefined : guardedClose}><CloseOutlined /></IconButton>
            </Box>
            <Divider />

            <Stack
                spacing={3}
                sx={{
                    p: 3,
                    flex: 1,
                    overflowY: 'auto',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    '&::-webkit-scrollbar': {
                        display: 'none',
                    },
                }}
            >

                {/* Patient */}
                <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Пациент
                    </Typography>
                    <Autocomplete
                        options={patients}
                        getOptionLabel={(option) => option.full_name || ""}
                        value={selectedPatient}
                        onChange={(_, newValue) => setSelectedPatient(newValue)}
                        inputValue={patientInput}
                        onInputChange={(_, val) => setPatientInput(val)}
                        filterOptions={(x) => x}
                        loading={patientsLoading}
                        noOptionsText={patientInput.length < 2 ? "Введите имя или телефон" : "Не найдено"}
                        renderInput={(params) => <TextField {...params} placeholder="Поиск пациента..." />}
                    />
                </Stack>

                {/* Products Selection - Товары */}
                <Typography variant="body2" color={touched && !hasValidProduct ? "error" : "text.secondary"} sx={{ fontWeight: 600, mb: 1 }}>
                    Товары *
                </Typography>
                {touched && !hasValidProduct && (
                    <Typography variant="caption" color="error" sx={{ mt: -0.5 }}>
                        Выберите хотя бы один товар
                    </Typography>
                )}

                {productLines.map((row, index) => {
                    const selectedProduct = availableProducts.find(p => p.id === row.productId);
                    const isProductActive = selectedProduct?.is_active !== false;

                    return (
                        <React.Fragment key={index}>
                            <Stack spacing={1.5}>
                                {/* Товар dropdown */}
                                <Autocomplete
                                    fullWidth
                                    options={availableProducts}
                                    value={selectedProduct || null}
                                    onChange={(_, v) => {
                                        const updated = [...productLines];
                                        updated[index].productId = v?.id || '';
                                        setProductLines(updated);
                                    }}
                                    getOptionLabel={(o) => `${o.label} — ${o.price || 0} сом`}
                                    getOptionDisabled={(o) => o.is_active === false}
                                    isOptionEqualToValue={(o, v) => o.id === v.id}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Товар"
                                            size="small"
                                            fullWidth
                                        />
                                    )}
                                    renderOption={(props, option) => (
                                        <li {...props}>
                                            <Stack direction="row" spacing={1} alignItems="center" width="100%">
                                                <Typography variant="body2" flex={1}>
                                                    {option.label} — {option.price || 0} сом
                                                </Typography>
                                                {option.is_active === false && (
                                                    <Chip label="Не доступен" size="small" color="error" />
                                                )}
                                            </Stack>
                                        </li>
                                    )}
                                />

                                {/* Количество и Штрихкод в одной строке */}
                                <Stack direction="row" spacing={1.5} alignItems="flex-end">
                                    <Stack spacing={0.5} sx={{ minWidth: 120 }}>
                                        <Typography variant="caption" color="text.secondary">
                                            Количество
                                        </Typography>
                                        <Box
                                            sx={{
                                                border: 1,
                                                borderColor: 'divider',
                                                borderRadius: 1,
                                                bgcolor: 'background.paper',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                height: 40,
                                            }}
                                        >
                                            <Button
                                                size="small"
                                                onClick={() => {
                                                    const updated = [...productLines];
                                                    const currentQty = typeof row.quantity === 'number' ? row.quantity : 1;
                                                    updated[index].quantity = Math.max(1, currentQty - 1);
                                                    setProductLines(updated);
                                                }}
                                                sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
                                                disabled={!isProductActive || (typeof row.quantity === 'number' && row.quantity <= 1)}
                                            >
                                                −
                                            </Button>
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={row.quantity}
                                                onChange={(e) => {
                                                    const updated = [...productLines];
                                                    const val = e.target.value;
                                                    updated[index].quantity = val === '' ? '' : Number(val);
                                                    setProductLines(updated);
                                                }}
                                                disabled={!isProductActive}
                                                inputProps={{
                                                    style: { textAlign: 'center', padding: '8px 4px' },
                                                    min: 1
                                                }}
                                                sx={{
                                                    width: 40,
                                                    ...noSpinnersSx,
                                                    '& .MuiOutlinedInput-root': {
                                                        '& fieldset': { border: 'none' }
                                                    }
                                                }}
                                            />
                                            <Button
                                                size="small"
                                                onClick={() => {
                                                    const updated = [...productLines];
                                                    const currentQty = typeof row.quantity === 'number' ? row.quantity : 1;
                                                    updated[index].quantity = currentQty + 1;
                                                    setProductLines(updated);
                                                }}
                                                sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
                                                disabled={!isProductActive}
                                            >
                                                +
                                            </Button>
                                        </Box>
                                    </Stack>

                                    <Stack spacing={0.5} sx={{ flex: 1 }}>
                                        <Typography variant="caption" color="text.secondary">
                                            Штрихкод
                                        </Typography>
                                        <TextField
                                            size="small"
                                            fullWidth
                                            value={selectedProduct?.barcode || ''}
                                            disabled
                                        />
                                    </Stack>
                                </Stack>

                                {/* Стоимость */}
                                {selectedProduct && (
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">
                                            Стоимость
                                        </Typography>
                                        <Typography variant="body1" fontWeight={600}>
                                            {((typeof row.quantity === 'number' ? row.quantity : 0) * selectedProduct.price).toLocaleString()} сом
                                        </Typography>
                                    </Box>
                                )}

                                {/* Удалить строку */}
                                {productLines.length > 1 && (
                                    <Tooltip title="Удалить товар">
                                        <IconButton
                                            size="small"
                                            color="error"
                                            onClick={() => {
                                                setProductLines(productLines.filter((_, i) => i !== index));
                                            }}
                                            sx={{
                                                alignSelf: 'flex-start',
                                                border: '1px solid',
                                                borderColor: 'error.main',
                                                '&:hover': {
                                                    backgroundColor: (theme) => alpha(theme.palette.error.main, 0.08),
                                                }
                                            }}
                                        >
                                            <DeleteOutlined fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Stack>

                            {index < productLines.length - 1 && <Divider sx={{ my: 1 }} />}
                        </React.Fragment>
                    );
                })}

                {/* Добавить ещё товар */}
                <Button
                    size="small"
                    onClick={() => {
                        setProductLines([...productLines, { productId: '', quantity: 1 }]);
                    }}
                    sx={{ alignSelf: "flex-start" }}
                >
                    + Добавить прием
                </Button>

                <Divider />

                {/* Payment Card */}
                <Paper
                    elevation={0}
                    sx={{
                        p: 2.5,
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: "14px",
                    }}
                >
                    <Stack spacing={2}>
                        {/* Стоимость и Скидка */}
                        <Stack direction="row" spacing={2} alignItems="flex-start">
                            <Box flex={1}>
                                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                    Стоимость
                                </Typography>
                                <Typography variant="h6" fontWeight={600}>
                                    {baseTotal.toLocaleString()} сом
                                </Typography>
                            </Box>
                            <Box flex={1}>
                                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                    Скидка, %
                                </Typography>
                                <TextField
                                    type="number"
                                    size="small"
                                    fullWidth
                                    value={discountPercent}
                                    onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                                    inputProps={{ min: 0, max: 100, style: { textAlign: 'center' } }}
                                    sx={{ ...noSpinnersSx }}
                                />
                            </Box>
                        </Stack>

                        {/* Наличные и Безналичные компактно */}
                        <Stack direction="row" spacing={2}>
                            <Stack flex={1} spacing={0.5}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        Наличные
                                    </Typography>
                                    <Button
                                        size="small"
                                        variant="text"
                                        onClick={() => {
                                            setCash(finalTotal);
                                            setCard(0);
                                        }}
                                        sx={{ minWidth: 'auto', px: 1, fontSize: '0.7rem', textTransform: 'none' }}
                                    >
                                        100%
                                    </Button>
                                </Stack>
                                <Stack direction="row" alignItems="center" spacing={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                                    <Box px={1}><AccountBalanceWalletOutlined color="action" fontSize="small" /></Box>
                                    <TextField
                                        variant="standard"
                                        fullWidth
                                        type="number"
                                        value={cash}
                                        onChange={(e) => {
                                            if (e.target.value === "") {
                                                setCash("");
                                            } else {
                                                const val = Number(e.target.value);
                                                const cardValue = Number(card || 0);
                                                const maxCash = Math.max(0, finalTotal - cardValue);
                                                setCash(Math.min(val, maxCash));
                                            }
                                        }}
                                        InputProps={{ disableUnderline: true }}
                                        sx={{ py: 0.5, ...noSpinnersSx }}
                                        placeholder="0"
                                    />
                                </Stack>
                            </Stack>

                            <Stack flex={1} spacing={0.5}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        Безналичные
                                    </Typography>
                                    <Button
                                        size="small"
                                        variant="text"
                                        onClick={() => {
                                            setCard(finalTotal);
                                            setCash(0);
                                        }}
                                        sx={{ minWidth: 'auto', px: 1, fontSize: '0.7rem', textTransform: 'none' }}
                                    >
                                        100%
                                    </Button>
                                </Stack>
                                <Stack direction="row" alignItems="center" spacing={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                                    <Box px={1}><CreditCardOutlined color="action" fontSize="small" /></Box>
                                    <TextField
                                        variant="standard"
                                        fullWidth
                                        type="number"
                                        value={card}
                                        onChange={(e) => {
                                            if (e.target.value === "") {
                                                setCard("");
                                            } else {
                                                const val = Number(e.target.value);
                                                const cashValue = Number(cash || 0);
                                                const maxCard = Math.max(0, finalTotal - cashValue);
                                                setCard(Math.min(val, maxCard));
                                            }
                                        }}
                                        InputProps={{ disableUnderline: true }}
                                        sx={{ py: 0.5, ...noSpinnersSx }}
                                        placeholder="0"
                                    />
                                </Stack>
                            </Stack>
                        </Stack>

                        <Divider sx={{ my: 1 }} />

                        {/* Итого к оплате */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" color="text.secondary" fontWeight={600}>
                                Итого к оплате
                            </Typography>
                            <Typography variant="h5" fontWeight={700} color="success.main">
                                {finalTotal.toLocaleString()} сом
                            </Typography>
                        </Stack>

                        {/* Статус и Долг */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" color="text.secondary">
                                Статус
                            </Typography>
                            <Chip
                                label={debt <= 0 ? "Оплачено" : "Долг"}
                                size="small"
                                color={debt <= 0 ? "success" : "error"}
                                sx={{ fontWeight: 600 }}
                            />
                        </Stack>

                        {debt > 0 && (
                            <Paper
                                elevation={0}
                                sx={{
                                    p: 1.5,
                                    bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
                                    border: '1px solid',
                                    borderColor: (theme) => alpha(theme.palette.error.main, 0.3),
                                    borderRadius: 1,
                                }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography variant="body2" color="error.main" fontWeight={600}>
                                        Долг
                                    </Typography>
                                    <Typography variant="h6" color="error.main" fontWeight={700}>
                                        {debt.toLocaleString()} сом
                                    </Typography>
                                </Stack>
                            </Paper>
                        )}
                    </Stack>
                </Paper>

                {/* Comment */}
                <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Комментарий к покупке
                    </Typography>
                    <TextField
                        fullWidth
                        multiline
                        rows={2}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Добавьте комментарий (необязательно)"
                    />
                </Stack>

            </Stack>

            {/* Footer */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" fontWeight={600}>К оплате:</Typography>
                    <Typography variant="h5" fontWeight={700} color={debt > 0 ? "error" : "success.main"}>
                        {finalTotal.toLocaleString()} сом
                    </Typography>
                </Stack>
                <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={handleSubmit}
                    disabled={!productLines.some(l => l.productId && l.quantity && l.quantity > 0) || loading}
                >
                    {loading ? "Сохранение..." : "Оформить продажу"}
                </Button>
            </Box>
        </Drawer>
        <CloseGuardDialog open={confirmOpen} title="создание продажи" onConfirm={confirmClose} onCancel={cancelClose} />
        </>
    );
};
