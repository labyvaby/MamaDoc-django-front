import React, { useEffect, useState, useMemo } from "react";
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

import { Sale, updateSale } from "../../services/sales";
import { supabase } from "../../utility/supabaseClient";
import { useNotification } from "@refinedev/core";

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

type Props = {
    open: boolean;
    onClose: () => void;
    sale: Sale | null;
    onUpdated: (saleId: string) => void;
    availableProducts: { id: string; label: string; price: number; image?: string; barcode?: string; is_active?: boolean }[];
};

export const EditSaleDrawer: React.FC<Props> = ({ open, onClose, sale, onUpdated, availableProducts }) => {
    const { open: notify } = useNotification();
    const [loading, setLoading] = useState(false);

    // Core Data
    const [patientId, setPatientId] = useState<string | null>(null);
    const [lines, setLines] = useState<{ sellable_item_id: string; quantity: number; price: number; product_name?: string }[]>([]);

    // Payment State
    const [cash, setCash] = useState<number | "">("");
    const [card, setCard] = useState<number | "">("");
    const [discountPercent, setDiscountPercent] = useState<number>(0);
    const [userComment, setUserComment] = useState("");

    // Patients list for selector
    const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
    const [patientInput, setPatientInput] = useState("");
    const [patientsLoading, setPatientsLoading] = useState(false);

    useEffect(() => {
        if (open && sale) {
            setPatientId(sale.patient_id || null);

            // Инициализируем поиск пациента текущим значением
            if (sale.patient_id && sale.patient_name) {
                const opt = { id: sale.patient_id, label: sale.patient_name };
                setPatients([opt]);
                setPatientInput(sale.patient_name);
            } else {
                setPatients([]);
                setPatientInput("");
            }

            // Map existing lines
            if (sale.lines) {
                setLines(sale.lines.map(l => ({
                    sellable_item_id: l.sellable_item_id,
                    quantity: l.quantity,
                    price: l.price_at_sale,
                    product_name: l.product_name
                })));
            } else {
                setLines([]);
            }

            // Parse Comment for Payment Info
            // Format: "User comment\nОплата: Наличные X, Карта Y, Скидка Z% (Amount). Долг: D."
            const rawComment = sale.comment || "";
            const paymentRegex = /Оплата: Наличные (\d+), Карта (\d+), Скидка (\d+)%/;
            const match = rawComment.match(paymentRegex);

            if (match) {
                setCash(Number(match[1]) || 0);
                setCard(Number(match[2]) || 0);
                setDiscountPercent(Number(match[3]) || 0);
                const splitIndex = rawComment.indexOf("Оплата:");
                setUserComment(splitIndex > -1 ? rawComment.substring(0, splitIndex).trim() : "");
            } else {
                // Нет блока "Оплата:" в комментарии — берём из полей БД
                setUserComment(rawComment);
                setCash(sale.paid_cash ?? 0);
                setCard(sale.paid_card ?? 0);
                setDiscountPercent(0);
            }
        }
    }, [open, sale]);

    // 10 последних пациентов при открытии (если нет текущего пациента — они уже установлены выше)
    useEffect(() => {
        if (!open || (sale?.patient_id && sale?.patient_name)) return;
        const load = async () => {
            const { data } = await supabase
                .from("Patients")
                .select("id, full_name, phone")
                .order("created_at", { ascending: false })
                .limit(10);
            setPatients((data || []).map(p => ({ id: p.id, label: p.full_name || "Без имени" })));
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
                    label: p.full_name || "Без имени"
                })));
            } finally {
                if (!controller.signal.aborted) setPatientsLoading(false);
            }
        }, 400);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [patientInput]);

    // Calculations
    const baseTotal = useMemo(() => {
        return lines.reduce((sum, l) => sum + (l.quantity * l.price), 0);
    }, [lines]);

    const discountAmount = Math.round((baseTotal * discountPercent) / 100);
    const finalTotal = Math.max(0, baseTotal - discountAmount);

    const paidCash = Number(cash || 0);
    const paidCard = Number(card || 0);
    const totalPaid = paidCash + paidCard;
    const debt = Math.max(0, finalTotal - totalPaid);

    const handleSubmit = async () => {
        if (!sale) return;

        try {
            setLoading(true);

            // Reconstruct comment
            const paymentInfo = `Оплата: Наличные ${paidCash}, Карта ${paidCard}, Скидка ${discountPercent}% (${discountAmount}). Долг: ${debt}.`;
            const finalComment = [userComment, paymentInfo].filter(Boolean).join("\n");

            await updateSale(sale.id, {
                patient_id: patientId,
                comment: finalComment,
                lines: lines,
                // Передаем данные об оплате для обновления статуса
                cash: paidCash,
                card: paidCard,
                totalAmount: finalTotal
            });

            notify?.({ type: "success", message: "Продажа обновлена" });
            onUpdated(sale.id);
            onClose();
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Не удалось сохранить" });
        } finally {
            setLoading(false);
        }
    };

    const selectedPatientOption = patients.find(p => p.id === patientId) || null;

    const handleAddProduct = (product: { id: string; label: string; price: number }) => {
        if (!product) return;

        setLines(prev => {
            const existing = prev.find(l => l.sellable_item_id === product.id);
            if (existing) {
                return prev.map(l => l.sellable_item_id === product.id
                    ? { ...l, quantity: l.quantity + 1 }
                    : l
                );
            }
            return [...prev, {
                sellable_item_id: product.id,
                quantity: 1,
                price: product.price,
                product_name: product.label
            }];
        });
    };

    const handleRemoveLine = (itemId: string) => {
        setLines(prev => prev.filter(l => l.sellable_item_id !== itemId));
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={loading ? undefined : onClose}
            PaperProps={{ sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
                <Typography variant="h6">Изменить продажу</Typography>
                <IconButton onClick={loading ? undefined : onClose}><CloseOutlined /></IconButton>
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
                        getOptionLabel={(option) => option.label}
                        value={selectedPatientOption}
                        onChange={(_, newValue) => setPatientId(newValue?.id || null)}
                        inputValue={patientInput}
                        onInputChange={(_, val) => setPatientInput(val)}
                        filterOptions={(x) => x}
                        loading={patientsLoading}
                        noOptionsText={patientInput.length < 2 ? "Введите имя или телефон" : "Не найдено"}
                        renderInput={(params) => <TextField {...params} placeholder="Поиск пациента..." />}
                    />
                </Stack>

                {/* Products List - Товары */}
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
                    Товары *
                </Typography>

                {lines.map((line, index) => {
                    const product = availableProducts.find(p => p.id === line.sellable_item_id);
                    const isProductActive = product?.is_active !== false;

                    return (
                        <React.Fragment key={line.sellable_item_id}>
                            <Stack spacing={1.5}>
                                {/* Название товара и цена */}
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                    <Typography variant="body2" fontWeight={600}>
                                        {line.product_name || product?.label || "Товар"}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {line.price} сом
                                    </Typography>
                                </Stack>

                                {/* Количество и Штрихкод */}
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
                                                    setLines(lines.map(l =>
                                                        l.sellable_item_id === line.sellable_item_id
                                                            ? { ...l, quantity: Math.max(1, l.quantity - 1) }
                                                            : l
                                                    ));
                                                }}
                                                sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
                                                disabled={!isProductActive || line.quantity <= 1}
                                            >
                                                −
                                            </Button>
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={line.quantity}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const newQty = val === '' ? 1 : Number(val);
                                                    if (newQty >= 1) {
                                                        setLines(lines.map(l =>
                                                            l.sellable_item_id === line.sellable_item_id
                                                                ? { ...l, quantity: newQty }
                                                                : l
                                                        ));
                                                    }
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
                                                    setLines(lines.map(l =>
                                                        l.sellable_item_id === line.sellable_item_id
                                                            ? { ...l, quantity: l.quantity + 1 }
                                                            : l
                                                    ));
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
                                            value={product?.barcode || ''}
                                            disabled
                                        />
                                    </Stack>
                                </Stack>

                                {/* Стоимость */}
                                <Box>
                                    <Typography variant="caption" color="text.secondary">
                                        Стоимость
                                    </Typography>
                                    <Typography variant="body1" fontWeight={600}>
                                        {(line.quantity * line.price).toLocaleString()} сом
                                    </Typography>
                                </Box>

                                {/* Удалить */}
                                {lines.length > 1 && (
                                    <Tooltip title="Удалить товар">
                                        <IconButton
                                            size="small"
                                            color="error"
                                            onClick={() => handleRemoveLine(line.sellable_item_id)}
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

                            {index < lines.length - 1 && <Divider sx={{ my: 1 }} />}
                        </React.Fragment>
                    );
                })}

                {/* Add Product Control */}
                <Autocomplete
                    fullWidth
                    options={availableProducts}
                    value={null}
                    onChange={(_, newProduct) => {
                        if (newProduct) {
                            handleAddProduct(newProduct);
                        }
                    }}
                    getOptionLabel={(o) => `${o.label} — ${o.price || 0} сом`}
                    getOptionDisabled={(o) => o.is_active === false}
                    isOptionEqualToValue={(o, v) => o.id === v.id}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            placeholder="Добавить товар..."
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


                <Divider />

                {/* Payment Card - Integrated from CreateSaleDrawer */}
                <Paper
                    elevation={0}
                    sx={{
                        p: 2.5,
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2,
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

                        {/* Наличные и Безналичные */}
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
                        Комментарий
                    </Typography>
                    <TextField
                        fullWidth
                        multiline
                        rows={2}
                        value={userComment}
                        onChange={(e) => setUserComment(e.target.value)}
                        placeholder="Комментарий к заказу"
                    />
                </Stack>

            </Stack>

            {/* Footer */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" fontWeight={600}>Итого:</Typography>
                    <Typography variant="h5" fontWeight={700} color={debt > 0 ? "error" : "success.main"}>
                        {finalTotal.toLocaleString()} сом
                    </Typography>
                </Stack>
                <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={handleSubmit}
                    disabled={loading}
                >
                    {loading ? "Сохранение..." : "Сохранить изменения"}
                </Button>
            </Box>
        </Drawer>
    );
};
