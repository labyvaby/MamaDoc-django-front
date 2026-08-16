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
    createFilterOptions,
    Paper,
    Chip,
    alpha,
    CircularProgress,
    InputAdornment,
    Tooltip,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import PriceChangeOutlined from "@mui/icons-material/PriceChangeOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import { motion } from "framer-motion";
import { cascadeContainer, cascadeItem, CashlessMethodSelect, InvoicePhotosField } from "../../ui";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../../../utility/formDraft";
import { DjangoStockItem, DjangoStockMovement } from "../../../api/warehouse";
import { useFormValidation } from "../../../hooks/useFormValidation";
import { useCashlessMethods } from "../../../hooks/useCashlessMethods";
import { useInvoicePhotos } from "../../../hooks/useInvoicePhotos";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { usePermissions } from "../../../hooks/usePermissions";
import { CASHLESS_METHODS_ENABLED } from "../../../api/cashlessMethods";

const noSpinnersSx = {
    "& input[type=number]": { MozAppearance: "textfield" },
    "& input[type=number]::-webkit-outer-spin-button": { WebkitAppearance: "none", margin: 0 },
    "& input[type=number]::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 },
};

export type MovementProductOption = {
    /** null → новый товар, создаётся на лету по label. */
    id: number | null;
    label: string;
    isNew?: boolean;
};

const productFilter = createFilterOptions<MovementProductOption>();

export type MovementWarehouseOption = {
    id: number;
    label: string;
    /**
     * Организация и филиал склада — скоуп для справочника способов безнала.
     * Берём у самого склада, а не у активной сессии: подключённый склад
     * (`isLinked`) живёт в другом филиале, и его закупку нельзя оплатить
     * терминалом текущей кассы.
     */
    organizationId?: number | null;
    branchId?: number | null;
};

interface DjangoAddMovementDrawerProps {
    open: boolean;
    onClose: () => void;
    product: DjangoStockItem | null;
    mode: "in" | "out";
    /**
     * Возврат созданного/обновлённого движения нужен для фото накладной: id
     * появляется только после сохранения, а фото уходят отдельным запросом.
     * Страница может вернуть void — тогда фото просто не отправятся.
     */
    onConfirm: (
        quantity: number,
        comment?: string,
        selectedProduct?: MovementProductOption | null,
        amount?: number,
        paymentMethod?: "cash" | "cashless",
        warehouseId?: number,
        cashlessMethodId?: number,
    ) => Promise<void | DjangoStockMovement | null>;
    availableProducts?: MovementProductOption[];
    editingMovement?: DjangoStockMovement | null;
    /**
     * Если передан — в режиме «новый товар» появляется обязательный выбор
     * склада (нужно странице «Движение товара», где склад не задан контекстом).
     */
    warehouses?: MovementWarehouseOption[];
    defaultWarehouseId?: number | null;
}

const MotionStack = motion(Stack);
const MotionBox = motion(Box);

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Защита от случайной потери введённых данных при закрытии дровера (крестик,
// клик по фону, Esc). Ключ черновика зависит от контекста открытия — черновик
// одного товара/движения не должен всплывать в форме для другого:
//  - редактирование движения (`editingMovement`) → ключ по id движения,
//    сравнение с исходными данными движения (baseline-diff), как в Edit-формах;
//  - открыто для конкретного товара (`product`, приход/списание) → ключ по id
//    товара, ничего не предзаполнено с сервера — обычная isDraftEmpty-проверка;
//  - «с нуля» (страница «Движение товара», товар выбирается в дровере) →
//    общий ключ, тоже isDraftEmpty-проверка.

const DRAFT_STORAGE_KEY = "mamadoc:warehouse:movement-draft";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type MovementDraft = {
    savedAt: number;
    quantity: string;
    amount: string;
    comment: string;
    paymentMethod: "cash" | "cashless";
    cashlessMethodId: number | "";
    selectedProduct: MovementProductOption | null;
    selectedWarehouse: MovementWarehouseOption | null;
};

function movementDraftKeyFor(
    product: DjangoStockItem | null,
    editingMovement: DjangoStockMovement | null,
): string {
    if (editingMovement) return `${DRAFT_STORAGE_KEY}:edit:${editingMovement.id}`;
    if (product) return `${DRAFT_STORAGE_KEY}:product:${product.warehouseId}:${product.productId}`;
    return `${DRAFT_STORAGE_KEY}:new`;
}

function isDraftEmpty(d: Omit<MovementDraft, "savedAt">): boolean {
    return (
        !d.quantity.trim() &&
        !d.amount.trim() &&
        !d.comment.trim() &&
        d.paymentMethod === "cash" &&
        d.cashlessMethodId === "" &&
        !d.selectedProduct &&
        !d.selectedWarehouse
    );
}

function sameAsMovementBaseline(
    a: Omit<MovementDraft, "savedAt">,
    b: Omit<MovementDraft, "savedAt">,
): boolean {
    return (
        a.quantity === b.quantity &&
        a.amount === b.amount &&
        a.comment === b.comment &&
        a.paymentMethod === b.paymentMethod &&
        a.cashlessMethodId === b.cashlessMethodId
    );
}

export const DjangoAddMovementDrawer: React.FC<DjangoAddMovementDrawerProps> = ({
    open,
    onClose,
    product,
    mode,
    onConfirm,
    availableProducts = [],
    editingMovement = null,
    warehouses,
    defaultWarehouseId = null,
}) => {
    const [quantity, setQuantity] = useState<string>("");
    const [amount, setAmount] = useState<string>("");
    const [comment, setComment] = useState("");
    const [loading, setLoading] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<MovementProductOption | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<"cash" | "cashless">("cash");
    const [cashlessMethodId, setCashlessMethodId] = useState<number | "">("");
    const [selectedWarehouse, setSelectedWarehouse] = useState<MovementWarehouseOption | null>(null);
    const [draftRestored, setDraftRestored] = useState(false);

    // Фото накладной: у редактируемого прихода уходят сразу, у нового копятся
    // до сохранения (id движения появляется только в ответе onConfirm).
    const orgId = useApiOrgId();
    const invoices = useInvoicePhotos({
        target: "stockMovement",
        entityId: editingMovement?.id ?? null,
        organizationId: orgId,
        open,
    });

    // Селект склада показываем только в режиме нового товара и только если
    // страница передала список (на странице «Склад» склад задан колонкой).
    const showWarehouseSelect = !product && !editingMovement && !!warehouses;

    // Baseline нужен только для editingMovement (там поля предзаполнены с
    // сервера) — для product/blank-сценариев ничего не предзаполнено, черновик
    // там просто сравнивается с «пусто» (isDraftEmpty).
    const baselineRef = React.useRef<Omit<MovementDraft, "savedAt"> | null>(null);

    useEffect(() => {
        if (open) {
            const baseline: Omit<MovementDraft, "savedAt"> = {
                quantity: editingMovement ? String(Math.abs(editingMovement.quantity || 0)) : "",
                amount:
                    editingMovement?.totalCost !== undefined && editingMovement?.totalCost !== null
                        ? String(editingMovement.totalCost)
                        : "",
                comment: editingMovement?.comment ?? "",
                paymentMethod: editingMovement?.paymentMethod ?? "cash",
                cashlessMethodId: editingMovement?.cashlessMethodId ?? "",
                selectedProduct: null,
                selectedWarehouse: warehouses?.find((w) => w.id === defaultWarehouseId) ?? null,
            };
            baselineRef.current = editingMovement ? baseline : null;

            setQuantity(baseline.quantity);
            setAmount(baseline.amount);
            setComment(baseline.comment);
            setLoading(false);
            setSelectedProduct(null);
            setPaymentMethod(baseline.paymentMethod);
            setCashlessMethodId(baseline.cashlessMethodId);
            setSelectedWarehouse(baseline.selectedWarehouse);
            setDraftRestored(false);

            const draft = readFormDraft<MovementDraft>(
                movementDraftKeyFor(product, editingMovement),
                DRAFT_TTL_MS,
            );
            if (draft) {
                setQuantity(draft.quantity);
                setAmount(draft.amount);
                setComment(draft.comment);
                setPaymentMethod(draft.paymentMethod);
                setCashlessMethodId(draft.cashlessMethodId ?? "");
                setSelectedProduct(draft.selectedProduct);
                if (draft.selectedWarehouse) setSelectedWarehouse(draft.selectedWarehouse);
                setDraftRestored(true);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, product, editingMovement, defaultWarehouseId]);

    // ── сохранение черновика в localStorage (защита от случайного закрытия) ────
    // flushDraftRef всегда указывает на актуальный снэпшот полей — нужен, чтобы
    // при закрытии до истечения debounce (быстрый ввод + сразу закрыть) успеть
    // синхронно записать черновик, а не потерять его вместе с отменённым таймером.
    const flushDraftRef = React.useRef<() => void>(() => {});
    flushDraftRef.current = () => {
        const current: Omit<MovementDraft, "savedAt"> = {
            quantity, amount, comment, paymentMethod, cashlessMethodId, selectedProduct, selectedWarehouse,
        };
        const key = movementDraftKeyFor(product, editingMovement);
        const isUnchanged = editingMovement
            ? baselineRef.current !== null && sameAsMovementBaseline(current, baselineRef.current)
            : isDraftEmpty(current);
        if (isUnchanged) {
            clearFormDraft(key);
        } else {
            writeFormDraft(key, current);
        }
    };

    useEffect(() => {
        if (!open) return;
        const id = setTimeout(() => flushDraftRef.current(), 400);
        return () => clearTimeout(id);
    }, [open, product, editingMovement, quantity, amount, comment, paymentMethod, cashlessMethodId, selectedProduct, selectedWarehouse]);

    const handleClose = () => {
        flushDraftRef.current();
        onClose();
    };

    const handleDiscardDraft = () => {
        clearFormDraft(movementDraftKeyFor(product, editingMovement));
        const b = baselineRef.current;
        if (b) {
            setQuantity(b.quantity);
            setAmount(b.amount);
            setComment(b.comment);
            setPaymentMethod(b.paymentMethod);
            setCashlessMethodId(b.cashlessMethodId);
        } else {
            setQuantity("");
            setAmount("");
            setComment("");
            setPaymentMethod("cash");
            setCashlessMethodId("");
            setSelectedProduct(null);
            setSelectedWarehouse(warehouses?.find((w) => w.id === defaultWarehouseId) ?? null);
        }
        setDraftRestored(false);
    };

    // Приход (закуп) можно проводить по 0 сом — бесплатные/бонусные поставки;
    // пустое поле суммы трактуем как 0. Для списания сумма обязательна.
    const isReceipt = mode === "in" || !!editingMovement;

    // Филиал операции: обычно он у склада. У общего склада организации
    // (`branchId: null`) берём филиал сессии — закуп всё равно проводит касса
    // конкретного филиала. Если филиала нет и там (режим «Все филиалы»),
    // справочник не запрашиваем вовсе: ответ по всей организации — это
    // терминалы чужих касс (та же дыра, что была в расходе, 16.08.2026).
    const { activeBranch } = usePermissions();
    const movementBranchId = selectedWarehouse?.branchId ?? activeBranch?.id ?? null;
    const branchScopeReady = selectedWarehouse != null && movementBranchId != null;

    // Способы безнала: нужны только приходу, оплаченному безналично.
    const {
        methods: cashlessMethods,
        isLoading: cashlessMethodsLoading,
        isError: cashlessMethodsFailed,
        isRequired: cashlessMethodRequired,
        defaultMethodId: cashlessDefaultMethodId,
        blocksSubmit: cashlessMethodsBlockSubmit,
    } = useCashlessMethods(open && isReceipt && branchScopeReady, {
        organizationId: selectedWarehouse?.organizationId ?? null,
        branchId: movementBranchId,
    });

    // Способ по умолчанию (или единственный) подставляем сами — см. хук.
    useEffect(() => {
        if (!isReceipt || paymentMethod !== "cashless") return;
        if (cashlessMethodId !== "" || cashlessDefaultMethodId === "") return;
        setCashlessMethodId(cashlessDefaultMethodId);
    }, [isReceipt, paymentMethod, cashlessMethodId, cashlessDefaultMethodId]);

    // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
    const amountRaw = isReceipt && amount.trim() === "" ? 0 : parseFloat(amount);
    const form = useFormValidation({
        product:
            product || selectedProduct || editingMovement ? null : "Выберите товар",
        warehouse:
            !showWarehouseSelect || selectedWarehouse ? null : "Выберите склад",
        quantity: parseFloat(quantity) > 0 ? null : "Укажите количество больше нуля",
        amount: !isNaN(amountRaw) && (isReceipt ? amountRaw >= 0 : amountRaw > 0)
            ? null
            : isReceipt
              ? "Сумма не может быть отрицательной"
              : "Укажите сумму списания",
        // Непрогруженный справочник тоже блокирует: пустой список из-за ошибки
        // нельзя трактовать как «способ не нужен». А пока неизвестен филиал,
        // справочник не запрошен намеренно — тогда виновата не загрузка, и
        // просим выбрать филиал, а не обновить страницу.
        cashlessMethodId:
            !isReceipt || paymentMethod !== "cashless"
                ? null
                : selectedWarehouse != null && !branchScopeReady
                    ? "Выберите филиал в шапке — способы безнала привязаны к филиалу"
                    : !branchScopeReady
                        ? null
                        : cashlessMethodsBlockSubmit
                            ? "Справочник способов не загружен — обновите страницу"
                            : cashlessMethodRequired && !cashlessMethodId
                                ? "Выберите способ безналичной оплаты"
                                : null,
    });

    const handleSubmit = async () => {
        if (!form.validate()) return;
        const qty = parseFloat(quantity);
        const amt = isReceipt && amount.trim() === "" ? 0 : parseFloat(amount);

        try {
            setLoading(true);
            const saved = await onConfirm(
                qty,
                comment,
                selectedProduct,
                amt,
                mode === "in" ? paymentMethod : undefined,
                selectedWarehouse?.id,
                CASHLESS_METHODS_ENABLED && mode === "in" && paymentMethod === "cashless" && cashlessMethodId
                    ? Number(cashlessMethodId)
                    : undefined,
            );
            // Движение уже проведено: упавшая загрузка фото его не откатывает.
            if (saved) await invoices.flush(saved.id);
            clearFormDraft(movementDraftKeyFor(product, editingMovement));
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const getTitle = () => {
        if (editingMovement) return "Редактировать приход";
        // Товар выбирается в дровере — это может быть и существующий товар,
        // и созданный на лету, поэтому не обещаем «нового».
        if (!product && mode === "in") return "Приход товара";
        if (mode === "in") return "Приход товара";
        return "Списание товара";
    };

    const amtNum = parseFloat(amount) || 0;
    const qtyNum = parseFloat(quantity) || 0;
    const amtValid = isReceipt ? amtNum >= 0 : amtNum > 0;
    const isValid = qtyNum > 0 && amtValid
        && (!!product || !!selectedProduct || !!editingMovement)
        && (!showWarehouseSelect || !!selectedWarehouse);

    const accentColor = mode === "in" ? "success" : "error";

    const submitOnEnter = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            void handleSubmit();
        }
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={loading ? undefined : handleClose}
            PaperProps={{
                sx: { width: { xs: 320, sm: 400 }, display: "flex", flexDirection: "column" },
            }}
        >
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
                <Typography variant="h6">{getTitle()}</Typography>
                <Stack direction="row" alignItems="center" gap={0.5}>
                    {draftRestored && (
                        <Tooltip title="Восстановлен черновик — сбросить?">
                            <IconButton onClick={handleDiscardDraft} aria-label="Сбросить черновик">
                                <RestoreOutlined fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    <IconButton onClick={loading ? undefined : handleClose} aria-label="Закрыть">
                        <CloseOutlined />
                    </IconButton>
                </Stack>
            </Box>

            <MotionStack
                spacing={3}
                variants={cascadeContainer}
                initial="hidden"
                animate="show"
                sx={{
                    p: 3,
                    flex: 1,
                    overflowY: "auto",
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                    "&::-webkit-scrollbar": { display: "none" },
                }}
            >
                {/* Main Card */}
                <MotionBox variants={cascadeItem}>
                <Paper
                    elevation={0}
                    sx={{
                        p: 2.5,
                        bgcolor: (theme) => alpha(theme.palette[accentColor].main, 0.04),
                        border: "1px solid",
                        borderColor: (theme) => alpha(theme.palette[accentColor].main, 0.2),
                        borderRadius: 1,
                    }}
                >
                    <Stack spacing={2}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                            Товар и склад
                        </Typography>

                        {/* Product Section */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.5 }}>
                                Товар
                            </Typography>

                            {product || editingMovement ? (
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <Inventory2Outlined sx={{ fontSize: 18, color: `${accentColor}.main` }} />
                                    <Box>
                                        <Typography variant="body1" fontWeight={600}>
                                            {product?.productName || editingMovement?.productName}
                                        </Typography>
                                        {product && (
                                            <Typography variant="caption" color="text.secondary">
                                                Остаток: {product.quantity} {product.productUnit}
                                            </Typography>
                                        )}
                                    </Box>
                                </Stack>
                            ) : (
                                <Autocomplete<MovementProductOption, false, false, false>
                                    options={availableProducts}
                                    getOptionLabel={(option) => option.label || ""}
                                    value={selectedProduct}
                                    onChange={(_, newValue) => setSelectedProduct(newValue)}
                                    filterOptions={(options, params) => {
                                        const filtered = productFilter(options, params);
                                        const input = params.inputValue.trim();
                                        const exists = options.some(
                                            (o) => o.label.toLowerCase() === input.toLowerCase(),
                                        );
                                        if (input !== "" && !exists) {
                                            filtered.push({
                                                id: null,
                                                label: input,
                                                isNew: true,
                                            });
                                        }
                                        return filtered;
                                    }}
                                    renderOption={(props, option) => (
                                        <li {...props} key={option.id ?? `new-${option.label}`}>
                                            {option.isNew ? `Создать товар «${option.label}»` : option.label}
                                        </li>
                                    )}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Поиск товара..."
                                            size="small"
                                            {...form.field("product")}
                                        />
                                    )}
                                    noOptionsText="Товар не найден"
                                />
                            )}
                        </Box>

                        {/* Склад (только для нового товара на странице движения) */}
                        {showWarehouseSelect && (
                            <Box>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.5 }}>
                                    Склад *
                                </Typography>
                                <Autocomplete<MovementWarehouseOption, false, false, false>
                                    options={warehouses ?? []}
                                    getOptionLabel={(o) => o.label || ""}
                                    value={selectedWarehouse}
                                    onChange={(_, v) => {
                                        // Способ привязан к филиалу склада — при смене склада
                                        // прежний выбор мог остаться терминалом чужой кассы.
                                        if (v?.branchId !== selectedWarehouse?.branchId) {
                                            setCashlessMethodId("");
                                        }
                                        setSelectedWarehouse(v);
                                    }}
                                    isOptionEqualToValue={(o, v) => o.id === v.id}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Выберите склад..."
                                            size="small"
                                            {...form.field("warehouse")}
                                        />
                                    )}
                                    noOptionsText="Нет складов"
                                />
                            </Box>
                        )}

                        <Divider />
                        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                            Количество и сумма
                        </Typography>

                        {/* Quantity & Amount */}
                        <Stack spacing={2}>
                            {/* Количество */}
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <Box flex={1}>
                                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                        Количество
                                    </Typography>
                                    <Stack direction="row" alignItems="center" spacing={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, bgcolor: "background.paper", height: 40 }}>
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
                                            onKeyDown={submitOnEnter}
                                            variant="standard"
                                            placeholder="0"
                                            autoFocus={!!product}
                                            inputProps={{ style: { textAlign: "center" }, min: 0 }}
                                            sx={{ flex: 1, ...noSpinnersSx }}
                                            InputProps={{ disableUnderline: true }}
                                            ref={form.anchor("quantity")}
                                        />
                                        <Button
                                            size="small"
                                            onClick={() => setQuantity(String((parseFloat(quantity) || 0) + 1))}
                                            sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
                                        >
                                            +
                                        </Button>
                                    </Stack>
                                    {form.errorOf("quantity") && (
                                        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
                                            {form.errorOf("quantity")}
                                        </Typography>
                                    )}
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
                                        onKeyDown={submitOnEnter}
                                        size="small"
                                        fullWidth
                                        placeholder="0"
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <PriceChangeOutlined fontSize="small" color="disabled" />
                                                </InputAdornment>
                                            ),
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                                        {amount.trim() !== "" && amtValid && (
                                                            <CheckCircleOutlined fontSize="small" color="success" />
                                                        )}
                                                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                                                            сом
                                                        </Typography>
                                                    </Stack>
                                                </InputAdornment>
                                            ),
                                        }}
                                        sx={{ ...noSpinnersSx }}
                                        {...form.field("amount")}
                                    />
                                </Box>
                            </Stack>

                            {/* Способ оплаты (только приход) */}
                            {mode === "in" && (
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                        Способ оплаты
                                    </Typography>
                                    <Stack direction="row" spacing={1.5}>
                                        {[
                                            { value: "cash" as const, label: "Наличные", icon: <PaymentsOutlined sx={{ fontSize: 18 }} /> },
                                            { value: "cashless" as const, label: "Безналичные", icon: <CreditCardOutlined sx={{ fontSize: 18 }} /> },
                                        ].map((opt) => {
                                            const selected = paymentMethod === opt.value;
                                            return (
                                                <Box
                                                    key={opt.value}
                                                    onClick={() => setPaymentMethod(opt.value)}
                                                    sx={{
                                                        flex: 1,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        gap: 1,
                                                        py: 1.25,
                                                        border: "1px solid",
                                                        borderColor: selected ? "success.main" : "divider",
                                                        borderRadius: 1,
                                                        color: selected ? "success.main" : "text.secondary",
                                                        bgcolor: selected
                                                            ? (theme) => alpha(theme.palette.success.main, 0.08)
                                                            : "background.paper",
                                                        cursor: "pointer",
                                                        transition: "all 0.15s ease",
                                                        "&:hover": { borderColor: "success.main" },
                                                    }}
                                                >
                                                    {opt.icon}
                                                    <Typography variant="body2" fontWeight={selected ? 600 : 500} color={selected ? "text.primary" : "text.secondary"}>
                                                        {opt.label}
                                                    </Typography>
                                                </Box>
                                            );
                                        })}
                                    </Stack>

                                    {/* Конкретный способ безнала (карта / Бакай / терминал…) */}
                                    {CASHLESS_METHODS_ENABLED && paymentMethod === "cashless" && (
                                        <Box ref={form.anchor("cashlessMethodId")} sx={{ mt: 1.5 }}>
                                            {selectedWarehouse != null && !branchScopeReady ? (
                                                // Общий склад + сессия без филиала: справочник по всей
                                                // организации показал бы терминалы чужих касс.
                                                <Typography
                                                    variant="body2"
                                                    color={
                                                        form.errorOf("cashlessMethodId")
                                                            ? "error.main"
                                                            : "text.secondary"
                                                    }
                                                >
                                                    Склад не привязан к филиалу — выберите филиал в шапке,
                                                    способы безнала у каждой кассы свои.
                                                </Typography>
                                            ) : (
                                                <CashlessMethodSelect
                                                    methods={cashlessMethods}
                                                    value={cashlessMethodId}
                                                    onChange={setCashlessMethodId}
                                                    error={Boolean(form.errorOf("cashlessMethodId"))}
                                                    loading={cashlessMethodsLoading || !branchScopeReady}
                                                    loadFailed={cashlessMethodsFailed}
                                                    disabled={loading}
                                                />
                                            )}
                                        </Box>
                                    )}
                                </Box>
                            )}

                            <Divider />

                            {/* Итого */}
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                                    {mode === "in" ? "Итого к оплате" : "Сумма списания"}
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
                                    label={isValid ? (editingMovement ? "Готово к сохранению" : mode === "in" ? "Готово к приходу" : "Готово к списанию") : "Не заполнено"}
                                    size="small"
                                    color={isValid ? accentColor : "default"}
                                    sx={{ fontWeight: 600 }}
                                />
                            </Stack>
                        </Stack>
                    </Stack>
                </Paper>
                </MotionBox>

                {/* Комментарий */}
                <MotionBox variants={cascadeItem}>
                <Stack spacing={1.5}>
                    <Divider />
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
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
                </MotionBox>

                {/* Накладная — только у прихода: списание подтверждают актом, а не ей. */}
                {isReceipt && (
                    <MotionBox variants={cascadeItem}>
                        <Stack spacing={1.5}>
                            <Divider />
                            <InvoicePhotosField state={invoices} disabled={loading} />
                        </Stack>
                    </MotionBox>
                )}
            </MotionStack>

            {/* Footer */}
            <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
                <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    color={accentColor}
                    disabled={loading}
                    onClick={handleSubmit}
                >
                    {loading ? <CircularProgress size={24} color="inherit" /> : editingMovement ? "Сохранить" : "Подтвердить"}
                </Button>
            </Box>
        </Drawer>
    );
};
