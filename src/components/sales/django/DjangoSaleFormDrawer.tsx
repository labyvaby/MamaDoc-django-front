import React, { useEffect, useState, useMemo } from "react";
import { useCloseGuard } from "../../../hooks/useCloseGuard";
import { CloseGuardDialog } from "../../common/CloseGuardDialog";
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
    CircularProgress,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import { useNotification } from "@refinedev/core";

import { DjangoSale, SaleWriteData, createSale, updateSale } from "../../../api/sales";
import { searchPatients, DjangoPatient } from "../../../api/patients";
import { getBranches, DjangoBranch } from "../../../api/organization";
import { ApiError, isAbortError } from "../../../api/client";
import { usePermissions } from "../../../hooks/usePermissions";
import { DiscountInput } from "../../ui";

// CSS to hide spin buttons
const noSpinnersSx = {
    "& input[type=number]": {
        MozAppearance: "textfield",
    },
    "& input[type=number]::-webkit-outer-spin-button": {
        WebkitAppearance: "none",
        margin: 0,
    },
    "& input[type=number]::-webkit-inner-spin-button": {
        WebkitAppearance: "none",
        margin: 0,
    },
};

export type SaleProductOption = {
    id: number;
    label: string;
    price: number;
    image?: string | null;
    barcode?: string;
    isActive?: boolean;
};

type PatientOption = { id: number; fullName: string; phone?: string };

interface DjangoSaleFormDrawerProps {
    open: boolean;
    onClose: () => void;
    /** null → новая продажа. */
    sale: DjangoSale | null;
    availableProducts: SaleProductOption[];
    onSaved: () => void;
}

export const DjangoSaleFormDrawer: React.FC<DjangoSaleFormDrawerProps> = ({
    open,
    onClose,
    sale,
    availableProducts,
    onSaved,
}) => {
    const { open: notify } = useNotification();
    const { activeBranch } = usePermissions();
    const isEdit = !!sale;
    const [loading, setLoading] = useState(false);
    const [touched, setTouched] = useState(false);
    const [patients, setPatients] = useState<PatientOption[]>([]);
    const [patientInput, setPatientInput] = useState("");
    const [patientsLoading, setPatientsLoading] = useState(false);

    // Org-wide режим (филиал не выбран): продажа требует явного филиала.
    const showBranchSelect = !isEdit && !activeBranch;
    const [branches, setBranches] = useState<DjangoBranch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<DjangoBranch | null>(null);

    // Form State
    const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);

    // Product Lines (multiple products support)
    const [productLines, setProductLines] = useState<Array<{
        productId: number | null;
        quantity: number | "";
    }>>([{ productId: null, quantity: 1 }]);

    // Payment State
    const [cash, setCash] = useState<number | "">("");
    const [card, setCard] = useState<number | "">("");
    const [discountPercent, setDiscountPercent] = useState<number>(0);
    const [comment, setComment] = useState("");

    const isDirty = touched || !!selectedPatient || productLines.some((l) => l.productId) || !!cash || !!card || !!comment;
    const { guardedClose, confirmOpen, confirmClose, cancelClose } = useCloseGuard({ isDirty: isDirty && !isEdit, isOpen: open, onClose });

    // Серверный поиск пациентов (debounce + отмена) — всю базу на клиент
    // не тянем; пустой запрос отдаёт первые 10 для подсказки.
    useEffect(() => {
        if (!open) return;
        const query = patientInput.trim();
        if (query.length === 1) return; // ждём минимум 2 символа

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                setPatientsLoading(true);
                const rows: DjangoPatient[] = await searchPatients(
                    query.length >= 2 ? query : "",
                    10,
                    controller.signal,
                );
                setPatients(rows.map((p) => ({
                    id: p.id,
                    fullName: p.fullName || "Без имени",
                    phone: p.phone,
                })));
            } catch (e) {
                if (isAbortError(e)) return;
                console.error("Failed to search patients", e);
            } finally {
                if (!controller.signal.aborted) setPatientsLoading(false);
            }
        }, query ? 350 : 0);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [open, patientInput]);

    // Филиалы — только когда нужен явный выбор (org-wide создание).
    useEffect(() => {
        if (!open || !showBranchSelect) return;
        getBranches()
            .then((rows) => setBranches(rows.filter((b) => b.isActive)))
            .catch((e) => console.error("Failed to load branches", e));
    }, [open, showBranchSelect]);

    // Reset / prefill on open
    useEffect(() => {
        if (open) {
            if (sale) {
                setSelectedPatient(
                    sale.patientId
                        ? { id: sale.patientId, fullName: sale.patientName || "Без имени" }
                        : null,
                );
                setProductLines(
                    sale.lines.length > 0
                        ? sale.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
                        : [{ productId: null, quantity: 1 }],
                );
                setCash(sale.paidCash || "");
                setCard(sale.paidCard || "");
                setDiscountPercent(sale.discountPercent || 0);
                setComment(sale.comment || "");
            } else {
                setSelectedPatient(null);
                setProductLines([{ productId: null, quantity: 1 }]);
                setCash("");
                setCard("");
                setDiscountPercent(0);
                setComment("");
            }
            setSelectedBranch(null);
            setTouched(false);
        }
    }, [open, sale]);

    // Calculations - based on all product lines
    const baseTotal = useMemo(() => {
        return productLines.reduce((sum, line) => {
            if (!line.productId) return sum;
            const product = availableProducts.find((p) => p.id === line.productId);
            if (!product) return sum;
            const quantity = typeof line.quantity === "number" ? line.quantity : 0;
            return sum + (product.price * quantity);
        }, 0);
    }, [productLines, availableProducts]);

    // Округление до копеек — так же считает бэкенд (quantize 0.01),
    // иначе статус «Оплачено/Частично» может разойтись с показанным итогом.
    const discountAmount = Math.round(baseTotal * discountPercent) / 100;
    const finalTotal = Math.max(0, Math.round((baseTotal - discountAmount) * 100) / 100);

    const paidCash = Number(cash || 0);
    const paidCard = Number(card || 0);
    const totalPaid = paidCash + paidCard;
    const debt = Math.max(0, finalTotal - totalPaid);

    const hasValidProduct = productLines.some((line) => line.productId && line.quantity && line.quantity > 0);

    const handleSubmit = async () => {
        setTouched(true);
        const validLines = productLines.filter((line) => line.productId && line.quantity && line.quantity > 0);
        if (validLines.length === 0) return;
        if (showBranchSelect && !selectedBranch) return;

        const data: SaleWriteData = {
            patientId: selectedPatient?.id ?? null,
            comment,
            // Цены не отправляем — бэкенд берёт их из прайс-листа товара.
            lines: validLines.map((line) => ({
                productId: line.productId as number,
                quantity: typeof line.quantity === "number" ? line.quantity : 1,
            })),
            discountPercent,
            paidCash,
            paidCard,
            ...(showBranchSelect && selectedBranch
                ? { branchId: selectedBranch.id }
                : {}),
        };

        try {
            setLoading(true);
            if (isEdit && sale) {
                await updateSale(sale.id, data);
                notify?.({ type: "success", message: "Продажа обновлена" });
            } else {
                await createSale(data);
                notify?.({ type: "success", message: "Продажа успешно создана" });
            }
            onSaved();
            onClose();
        } catch (e) {
            console.error(e);
            const message = e instanceof ApiError ? e.message : "Ошибка при сохранении продажи";
            notify?.({ type: "error", message });
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
                <Typography variant="h6">{isEdit ? "Изменить продажу" : "Новая продажа"}</Typography>
                <IconButton onClick={loading ? undefined : guardedClose}><CloseOutlined /></IconButton>
            </Box>
            <Divider />

            <Stack
                spacing={3}
                sx={{
                    p: 3,
                    flex: 1,
                    overflowY: "auto",
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                    "&::-webkit-scrollbar": {
                        display: "none",
                    },
                }}
            >

                {/* Филиал (только в org-wide режиме) */}
                {showBranchSelect && (
                    <Stack spacing={0.5}>
                        <Typography variant="body2" color={touched && !selectedBranch ? "error" : "text.secondary"} sx={{ fontWeight: 600 }}>
                            Филиал продажи *
                        </Typography>
                        <Autocomplete<DjangoBranch, false, false, false>
                            options={branches}
                            getOptionLabel={(b) => b.name}
                            value={selectedBranch}
                            onChange={(_, v) => setSelectedBranch(v)}
                            isOptionEqualToValue={(o, v) => o.id === v.id}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    placeholder="Выберите филиал..."
                                    error={touched && !selectedBranch}
                                    helperText={touched && !selectedBranch ? "Обязательное поле" : ""}
                                />
                            )}
                            noOptionsText="Нет филиалов"
                        />
                    </Stack>
                )}

                {/* Patient */}
                <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Пациент
                    </Typography>
                    <Autocomplete
                        options={patients}
                        getOptionLabel={(option) => option.fullName || ""}
                        value={selectedPatient}
                        onChange={(_, newValue) => setSelectedPatient(newValue)}
                        inputValue={patientInput}
                        onInputChange={(_, val) => setPatientInput(val)}
                        filterOptions={(x) => x}
                        loading={patientsLoading}
                        isOptionEqualToValue={(o, v) => o.id === v.id}
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
                    const selectedProduct = availableProducts.find((p) => p.id === row.productId);
                    const isProductActive = selectedProduct?.isActive !== false;

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
                                        updated[index].productId = v?.id ?? null;
                                        setProductLines(updated);
                                    }}
                                    getOptionLabel={(o) => `${o.label} — ${o.price || 0} сом`}
                                    getOptionDisabled={(o) => o.isActive === false}
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
                                                {option.isActive === false && (
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
                                                borderColor: "divider",
                                                borderRadius: 1,
                                                bgcolor: "background.paper",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                height: 40,
                                            }}
                                        >
                                            <Button
                                                size="small"
                                                onClick={() => {
                                                    const updated = [...productLines];
                                                    const currentQty = typeof row.quantity === "number" ? row.quantity : 1;
                                                    updated[index].quantity = Math.max(1, currentQty - 1);
                                                    setProductLines(updated);
                                                }}
                                                sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
                                                disabled={!isProductActive || (typeof row.quantity === "number" && row.quantity <= 1)}
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
                                                    updated[index].quantity = val === "" ? "" : Number(val);
                                                    setProductLines(updated);
                                                }}
                                                disabled={!isProductActive}
                                                inputProps={{
                                                    style: { textAlign: "center", padding: "8px 4px" },
                                                    min: 1,
                                                }}
                                                sx={{
                                                    width: 40,
                                                    ...noSpinnersSx,
                                                    "& .MuiOutlinedInput-root": {
                                                        "& fieldset": { border: "none" },
                                                    },
                                                }}
                                            />
                                            <Button
                                                size="small"
                                                onClick={() => {
                                                    const updated = [...productLines];
                                                    const currentQty = typeof row.quantity === "number" ? row.quantity : 1;
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
                                            value={selectedProduct?.barcode || ""}
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
                                            {((typeof row.quantity === "number" ? row.quantity : 0) * selectedProduct.price).toLocaleString()} сом
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
                                                alignSelf: "flex-start",
                                                border: "1px solid",
                                                borderColor: "error.main",
                                                "&:hover": {
                                                    backgroundColor: (theme) => alpha(theme.palette.error.main, 0.08),
                                                },
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
                        setProductLines([...productLines, { productId: null, quantity: 1 }]);
                    }}
                    sx={{ alignSelf: "flex-start" }}
                >
                    + Добавить товар
                </Button>

                <Divider />

                {/* Payment Card */}
                <Paper
                    elevation={0}
                    sx={{
                        p: 2.5,
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 2,
                    }}
                >
                    <Stack spacing={2}>
                        {/* Стоимость и Скидка; скидка переносится вниз на всю
                            ширину, если в строке не хватает места. */}
                        <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                            <Box sx={{ flexShrink: 0 }}>
                                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                    Стоимость
                                </Typography>
                                <Typography variant="h6" fontWeight={600} noWrap>
                                    {baseTotal.toLocaleString()} сом
                                </Typography>
                            </Box>
                            <Box sx={{ flex: "1 1 180px", minWidth: 180 }}>
                                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                    Скидка
                                </Typography>
                                <DiscountInput
                                    total={baseTotal}
                                    amount={discountAmount}
                                    defaultType="percent"
                                    onAmountChange={(amt) => {
                                        // Источник истины для продаж — процент: backend хранит
                                        // discountPercent и сам считает сумму от стоимости.
                                        const pct = baseTotal > 0
                                            ? Math.min(100, Math.max(0, Math.round((amt / baseTotal) * 1000) / 10))
                                            : 0;
                                        setDiscountPercent(pct);
                                    }}
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
                                        sx={{ minWidth: "auto", px: 1, fontSize: "0.7rem", textTransform: "none" }}
                                    >
                                        100%
                                    </Button>
                                </Stack>
                                <Stack direction="row" alignItems="center" spacing={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, bgcolor: "background.paper" }}>
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
                                        sx={{ minWidth: "auto", px: 1, fontSize: "0.7rem", textTransform: "none" }}
                                    >
                                        100%
                                    </Button>
                                </Stack>
                                <Stack direction="row" alignItems="center" spacing={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, bgcolor: "background.paper" }}>
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
                                    border: "1px solid",
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
            <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
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
                    disabled={!hasValidProduct || loading || (showBranchSelect && !selectedBranch)}
                >
                    {loading ? <CircularProgress size={24} color="inherit" /> : isEdit ? "Сохранить изменения" : "Оформить продажу"}
                </Button>
            </Box>
        </Drawer>
        <CloseGuardDialog open={confirmOpen} title="создание продажи" onConfirm={confirmClose} onCancel={cancelClose} />
        </>
    );
};
