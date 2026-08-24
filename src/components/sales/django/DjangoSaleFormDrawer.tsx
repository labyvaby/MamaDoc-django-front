import React, { useEffect, useState, useMemo, useRef } from "react";
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
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import { useNotification } from "@refinedev/core";

import { DjangoSale, SaleWriteData, createSale, updateSale } from "../../../api/sales";
import { searchPatients, DjangoPatient } from "../../../api/patients";
import { getBranches, DjangoBranch } from "../../../api/organization";
import { ApiError, isAbortError } from "../../../api/client";
import { orgWide } from "../../../api/scope";
import { usePermissions } from "../../../hooks/usePermissions";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { useCashlessMethods } from "../../../hooks/useCashlessMethods";
import { useT } from "../../../i18n/VerticalProvider";
import { DiscountInput, CashlessMethodSelect } from "../../ui";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../../../utility/formDraft";

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

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Защита от случайной потери введённых данных при закрытии дровера (крестик,
// клик по фону, Esc). Компонент работает в двух режимах:
//  - создание: черновик по общему ключу, очищается после успешного сабмита,
//    «Очистить» сбрасывает форму к пустым значениям;
//  - редактирование: ключ включает id продажи, черновик пишется только если
//    текущие значения отличаются от исходных данных продажи (baseline),
//    «Очистить» откатывает к baseline, а не к пустой форме.
// Список позиций товара (productLines) сюда намеренно НЕ входит — это
// динамический массив, завязанный на актуальный каталог/остатки, риск
// восстановить рассинхронизированные позиции выше пользы черновика для него;
// защищаем только простые top-level поля (пациент, филиал, скидка, оплата,
// комментарий).

const ADD_DRAFT_KEY = "mamadoc:sales:add-draft";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type SaleDraftFields = {
    patientId: number | null;
    patientLabel: string | null;
    branchId: number | null;
    branchLabel: string | null;
    cash: number | "";
    card: number | "";
    /** Способ безнала; в старых черновиках поля нет — читаем как «не выбран». */
    cashlessMethodId?: number | "";
    discountPercent: number;
    comment: string;
};

type SaleDraft = SaleDraftFields & { savedAt: number };

function editDraftKeyFor(saleId: number): string {
    return `mamadoc:sales:edit-draft:${saleId}`;
}

function isDraftEmpty(d: SaleDraftFields): boolean {
    return (
        !d.patientId &&
        !d.branchId &&
        !d.cash &&
        !d.card &&
        !d.discountPercent &&
        !d.comment.trim()
    );
}

function sameAsBaseline(a: SaleDraftFields, b: SaleDraftFields): boolean {
    return (
        a.patientId === b.patientId &&
        a.patientLabel === b.patientLabel &&
        a.branchId === b.branchId &&
        a.branchLabel === b.branchLabel &&
        a.cash === b.cash &&
        a.card === b.card &&
        (a.cashlessMethodId ?? "") === (b.cashlessMethodId ?? "") &&
        a.discountPercent === b.discountPercent &&
        a.comment === b.comment
    );
}

interface DjangoSaleFormDrawerProps {
    open: boolean;
    onClose: () => void;
    /** null → новая продажа. */
    sale: DjangoSale | null;
    availableProducts: SaleProductOption[];
    onSaved: () => void;
    /**
     * Бэк хранит способ безнала у продажи (см. `useSalesCashlessSupport`).
     * Пока нет — селект не показываем: выбор кассира ушёл бы в никуда, а он бы
     * считал, что терминал учтён.
     */
    cashlessSupported?: boolean;
}

export const DjangoSaleFormDrawer: React.FC<DjangoSaleFormDrawerProps> = ({
    open,
    onClose,
    sale,
    availableProducts,
    onSaved,
    cashlessSupported = false,
}) => {
    const { t } = useT("sales");
    const { open: notify } = useNotification();
    const { activeBranch } = usePermissions();
    const orgId = useApiOrgId();
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
    const [cashlessMethodId, setCashlessMethodId] = useState<number | "">("");
    const [discountPercent, setDiscountPercent] = useState<number>(0);
    const [comment, setComment] = useState("");

    // ── Способ безнала ────────────────────────────────────────────────────────
    // Скоуп — сама продажа (её организация и филиал), не активная сессия: в
    // режиме «Все филиалы» иначе предложился бы терминал соседней кассы.
    const saleBranchId = isEdit
        ? sale?.branchId ?? null
        : selectedBranch?.id ?? activeBranch?.id ?? null;
    // Пока филиал неизвестен (org-wide создание до выбора), справочник не
    // запрашиваем: ответ по всей организации — это и есть чужие терминалы.
    const branchScopeReady = saleBranchId != null;
    const {
        methods: cashlessMethods,
        isLoading: cashlessMethodsLoading,
        isError: cashlessMethodsFailed,
        isRequired: cashlessMethodRequired,
        defaultMethodId: cashlessDefaultMethodId,
        blocksSubmit: cashlessMethodsBlockSubmit,
    } = useCashlessMethods(open && cashlessSupported && branchScopeReady, {
        organizationId: sale?.organizationId ?? orgId ?? null,
        branchId: saleBranchId,
    });

    const [draftRestored, setDraftRestored] = useState(false);
    const baselineRef = useRef<SaleDraftFields | null>(null);

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
                // Только орг-скоуп: филиалом не сужаем (пациент может быть из соседнего).
                const rows: DjangoPatient[] = await searchPatients(
                    orgWide(orgId),
                    query.length >= 2 ? query : "",
                    10,
                    controller.signal,
                );
                setPatients(rows.map((p) => ({
                    id: p.id,
                    fullName: p.fullName || t("form.noName"),
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
    }, [open, patientInput, orgId]);

    // Филиалы — только когда нужен явный выбор (org-wide создание).
    useEffect(() => {
        if (!open || !showBranchSelect) return;
        getBranches(orgId)
            .then((rows) => setBranches(rows.filter((b) => b.isActive)))
            .catch((e) => console.error("Failed to load branches", e));
    }, [open, showBranchSelect, orgId]);

    // Reset / prefill on open + восстановление черновика. Список позиций
    // (productLines) не входит в черновик — восстанавливается только из
    // данных продажи (либо пустая строка при создании).
    useEffect(() => {
        if (!open) return;
        setProductLines(
            sale && sale.lines.length > 0
                ? sale.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
                : [{ productId: null, quantity: 1 }],
        );
        setSelectedBranch(null);
        setTouched(false);

        if (sale) {
            const baseline: SaleDraftFields = {
                patientId: sale.patientId ?? null,
                patientLabel: sale.patientId ? (sale.patientName || t("form.noName")) : null,
                branchId: null,
                branchLabel: null,
                cash: sale.paidCash || "",
                card: sale.paidCard || "",
                cashlessMethodId: sale.cashlessMethodId ?? "",
                discountPercent: sale.discountPercent || 0,
                comment: sale.comment || "",
            };
            baselineRef.current = baseline;

            const draft = readFormDraft<SaleDraft>(editDraftKeyFor(sale.id), DRAFT_TTL_MS);
            const next = draft ?? baseline;

            if (next.patientId && next.patientLabel) {
                setSelectedPatient({ id: next.patientId, fullName: next.patientLabel });
                setPatientInput(next.patientLabel);
            } else {
                setSelectedPatient(null);
                setPatientInput("");
            }
            setCash(next.cash);
            setCard(next.card);
            setCashlessMethodId(next.cashlessMethodId ?? "");
            setDiscountPercent(next.discountPercent);
            setComment(next.comment);
            setDraftRestored(Boolean(draft));
        } else {
            baselineRef.current = null;
            const draft = readFormDraft<SaleDraft>(ADD_DRAFT_KEY, DRAFT_TTL_MS);

            if (draft?.patientId && draft.patientLabel) {
                setSelectedPatient({ id: draft.patientId, fullName: draft.patientLabel });
                setPatientInput(draft.patientLabel);
            } else {
                setSelectedPatient(null);
                setPatientInput("");
            }
            if (draft?.branchId && draft.branchLabel) {
                setSelectedBranch({ id: draft.branchId, name: draft.branchLabel } as unknown as DjangoBranch);
            }
            setCash(draft?.cash ?? "");
            setCard(draft?.card ?? "");
            setCashlessMethodId(draft?.cashlessMethodId ?? "");
            setDiscountPercent(draft?.discountPercent ?? 0);
            setComment(draft?.comment ?? "");
            setDraftRestored(Boolean(draft));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, sale]);

    // ── сохранение черновика в localStorage (защита от случайного закрытия) ──
    // flushDraftRef всегда указывает на актуальный снэпшот полей — нужен, чтобы
    // при закрытии до истечения debounce (быстрый ввод + сразу закрыть) успеть
    // синхронно записать черновик, а не потерять его вместе с отменённым таймером.
    const flushDraftRef = useRef<() => void>(() => {});
    flushDraftRef.current = () => {
        const current: SaleDraftFields = {
            patientId: selectedPatient?.id ?? null,
            patientLabel: selectedPatient?.fullName ?? null,
            branchId: selectedBranch?.id ?? null,
            branchLabel: selectedBranch?.name ?? null,
            cash,
            card,
            cashlessMethodId,
            discountPercent,
            comment,
        };
        if (isEdit && sale) {
            const key = editDraftKeyFor(sale.id);
            if (baselineRef.current && sameAsBaseline(current, baselineRef.current)) {
                clearFormDraft(key);
            } else {
                writeFormDraft(key, current);
            }
        } else if (!isEdit) {
            if (isDraftEmpty(current)) {
                clearFormDraft(ADD_DRAFT_KEY);
            } else {
                writeFormDraft(ADD_DRAFT_KEY, current);
            }
        }
    };

    useEffect(() => {
        if (!open) return;
        const id = setTimeout(() => flushDraftRef.current(), 400);
        return () => clearTimeout(id);
    }, [open, sale, isEdit, selectedPatient, selectedBranch, cash, card, cashlessMethodId, discountPercent, comment]);

    const handleClose = () => {
        flushDraftRef.current();
        onClose();
    };

    const handleDiscardDraft = () => {
        if (isEdit && sale) {
            clearFormDraft(editDraftKeyFor(sale.id));
            const b = baselineRef.current;
            if (b) {
                if (b.patientId && b.patientLabel) {
                    setSelectedPatient({ id: b.patientId, fullName: b.patientLabel });
                    setPatientInput(b.patientLabel);
                } else {
                    setSelectedPatient(null);
                    setPatientInput("");
                }
                setCash(b.cash);
                setCard(b.card);
                setCashlessMethodId(b.cashlessMethodId ?? "");
                setDiscountPercent(b.discountPercent);
                setComment(b.comment);
            }
        } else {
            clearFormDraft(ADD_DRAFT_KEY);
            setSelectedPatient(null);
            setPatientInput("");
            setSelectedBranch(null);
            setCash("");
            setCard("");
            setCashlessMethodId("");
            setDiscountPercent(0);
            setComment("");
        }
        setDraftRestored(false);
    };

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

    // Поле способа нужно только там, где есть безналичная сумма.
    const needsCashlessMethod = cashlessSupported && paidCard > 0;
    // Способ по умолчанию (дефолт филиала, иначе единственный) — см. хук.
    useEffect(() => {
        if (!needsCashlessMethod || cashlessMethodId !== "") return;
        if (cashlessDefaultMethodId === "") return;
        setCashlessMethodId(cashlessDefaultMethodId);
    }, [needsCashlessMethod, cashlessMethodId, cashlessDefaultMethodId]);

    /**
     * Способ мешает сохранению. Непрогруженный справочник блокирует наравне с
     * невыбранным способом: пустой список из-за ошибки нельзя трактовать как
     * «способ не нужен».
     */
    const cashlessError = !needsCashlessMethod
        ? null
        : !branchScopeReady
            ? t("form.cashlessBranchFirst")
            : cashlessMethodsBlockSubmit
                ? t("form.cashlessNotLoaded")
                : cashlessMethodRequired && !cashlessMethodId
                    ? t("form.cashlessRequired")
                    : null;

    const handleSubmit = async () => {
        setTouched(true);
        const validLines = productLines.filter((line) => line.productId && line.quantity && line.quantity > 0);
        if (validLines.length === 0) return;
        if (showBranchSelect && !selectedBranch) return;
        if (cashlessError) return;

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
            // Способ отправляем только когда бэк его хранит. При правке продажи,
            // где безнал убрали, шлём null — иначе у наличной продажи остался бы
            // терминал от прошлой версии.
            ...(cashlessSupported
                ? { cashlessMethodId: paidCard > 0 && cashlessMethodId ? Number(cashlessMethodId) : null }
                : {}),
        };

        try {
            setLoading(true);
            if (isEdit && sale) {
                await updateSale(sale.id, data);
                notify?.({ type: "success", message: t("form.updated") });
            } else {
                await createSale(data);
                notify?.({ type: "success", message: t("form.created") });
            }
            clearFormDraft(isEdit && sale ? editDraftKeyFor(sale.id) : ADD_DRAFT_KEY);
            onSaved();
            onClose();
        } catch (e) {
            console.error(e);
            const message = e instanceof ApiError ? e.message : t("form.saveError");
            notify?.({ type: "error", message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={loading ? undefined : handleClose}
            PaperProps={{ sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
                <Typography variant="h6">{isEdit ? t("form.editTitle") : t("form.createTitle")}</Typography>
                <Stack direction="row" alignItems="center" gap={0.5}>
                    {draftRestored && (
                        <Tooltip title={`${t("form.draftRestored")} — ${t("form.draftDiscard").toLowerCase()}?`}>
                            <IconButton onClick={handleDiscardDraft} aria-label={t("form.draftDiscard")}>
                                <RestoreOutlined fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    <IconButton onClick={loading ? undefined : handleClose}><CloseOutlined /></IconButton>
                </Stack>
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
                            {t("form.branchLabel")}
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
                                    placeholder={t("form.branchPlaceholder")}
                                    error={touched && !selectedBranch}
                                    helperText={touched && !selectedBranch ? t("form.branchRequired") : ""}
                                />
                            )}
                            noOptionsText={t("form.noBranches")}
                        />
                    </Stack>
                )}

                {/* Patient */}
                <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {t("form.patientLabel")}
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
                        noOptionsText={patientInput.length < 2 ? t("form.patientNoOptionsShort") : t("form.patientNoOptionsEmpty")}
                        renderInput={(params) => <TextField {...params} placeholder={t("form.patientPlaceholder")} />}
                    />
                </Stack>

                {/* Products Selection - Товары */}
                <Typography variant="body2" color={touched && !hasValidProduct ? "error" : "text.secondary"} sx={{ fontWeight: 600, mb: 1 }}>
                    {t("form.productsLabel")}
                </Typography>
                {touched && !hasValidProduct && (
                    <Typography variant="caption" color="error" sx={{ mt: -0.5 }}>
                        {t("form.productsRequired")}
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
                                    getOptionLabel={(o) => t("form.productPriceOption", { label: o.label, price: o.price || 0 })}
                                    getOptionDisabled={(o) => o.isActive === false}
                                    isOptionEqualToValue={(o, v) => o.id === v.id}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder={t("form.productPlaceholder")}
                                            size="small"
                                            fullWidth
                                        />
                                    )}
                                    renderOption={(props, option) => (
                                        <li {...props}>
                                            <Stack direction="row" spacing={1} alignItems="center" width="100%">
                                                <Typography variant="body2" flex={1}>
                                                    {t("form.productPriceOption", { label: option.label, price: option.price || 0 })}
                                                </Typography>
                                                {option.isActive === false && (
                                                    <Chip label={t("form.productUnavailable")} size="small" color="error" />
                                                )}
                                            </Stack>
                                        </li>
                                    )}
                                />

                                {/* Количество и Штрихкод в одной строке */}
                                <Stack direction="row" spacing={1.5} alignItems="flex-end">
                                    <Stack spacing={0.5} sx={{ minWidth: 120 }}>
                                        <Typography variant="caption" color="text.secondary">
                                            {t("form.quantityLabel")}
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
                                            {t("form.barcodeLabel")}
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
                                            {t("form.costLabel")}
                                        </Typography>
                                        <Typography variant="body1" fontWeight={600}>
                                            {t("form.costValue", { amount: ((typeof row.quantity === "number" ? row.quantity : 0) * selectedProduct.price).toLocaleString() })}
                                        </Typography>
                                    </Box>
                                )}

                                {/* Удалить строку */}
                                {productLines.length > 1 && (
                                    <Tooltip title={t("form.removeProduct")}>
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
                    {t("form.addProduct")}
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
                        borderRadius: "14px",
                    }}
                >
                    <Stack spacing={2}>
                        {/* Стоимость и Скидка; скидка переносится вниз на всю
                            ширину, если в строке не хватает места. */}
                        <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                            <Box sx={{ flexShrink: 0 }}>
                                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                    {t("form.costLabel")}
                                </Typography>
                                <Typography variant="h6" fontWeight={600} noWrap>
                                    {t("form.costValue", { amount: baseTotal.toLocaleString() })}
                                </Typography>
                            </Box>
                            <Box sx={{ flex: "1 1 180px", minWidth: 180 }}>
                                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                    {t("form.discountLabel")}
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
                                        {t("form.cashLabel")}
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
                                        {t("form.percentAll")}
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
                                        {t("form.cardLabel")}
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
                                        {t("form.percentAll")}
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

                        {/* Конкретный способ безнала (карта / Бакай / терминал…) */}
                        {needsCashlessMethod && (
                            <Box>
                                {!branchScopeReady ? (
                                    // Org-wide создание до выбора филиала: справочник по всей
                                    // организации показал бы терминалы чужих касс.
                                    <Typography
                                        variant="body2"
                                        color={touched ? "error.main" : "text.secondary"}
                                    >
                                        {t("form.cashlessBranchFirst")}
                                    </Typography>
                                ) : (
                                    <CashlessMethodSelect
                                        methods={cashlessMethods}
                                        value={cashlessMethodId}
                                        onChange={setCashlessMethodId}
                                        error={touched && Boolean(cashlessError)}
                                        loading={cashlessMethodsLoading}
                                        loadFailed={cashlessMethodsFailed}
                                        disabled={loading}
                                        branchNote={
                                            activeBranch && saleBranchId !== activeBranch.id
                                                ? t("form.cashlessOtherBranchNote")
                                                : null
                                        }
                                    />
                                )}
                            </Box>
                        )}

                        <Divider sx={{ my: 1 }} />

                        {/* Итого к оплате */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" color="text.secondary" fontWeight={600}>
                                {t("form.totalDue")}
                            </Typography>
                            <Typography variant="h5" fontWeight={700} color="success.main">
                                {t("form.costValue", { amount: finalTotal.toLocaleString() })}
                            </Typography>
                        </Stack>

                        {/* Статус и Долг */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" color="text.secondary">
                                {t("form.statusLabel")}
                            </Typography>
                            <Chip
                                label={debt <= 0 ? t("form.statusPaid") : t("form.statusDebt")}
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
                                        {t("form.debtLabel")}
                                    </Typography>
                                    <Typography variant="h6" color="error.main" fontWeight={700}>
                                        {t("form.costValue", { amount: debt.toLocaleString() })}
                                    </Typography>
                                </Stack>
                            </Paper>
                        )}
                    </Stack>
                </Paper>

                {/* Comment */}
                <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {t("form.commentLabel")}
                    </Typography>
                    <TextField
                        fullWidth
                        multiline
                        rows={2}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={t("form.commentPlaceholder")}
                    />
                </Stack>

            </Stack>

            {/* Footer */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" fontWeight={600}>{t("form.footerTotal")}</Typography>
                    <Typography variant="h5" fontWeight={700} color={debt > 0 ? "error" : "success.main"}>
                        {t("form.costValue", { amount: finalTotal.toLocaleString() })}
                    </Typography>
                </Stack>
                <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={handleSubmit}
                    disabled={
                        !hasValidProduct ||
                        loading ||
                        (showBranchSelect && !selectedBranch) ||
                        Boolean(cashlessError)
                    }
                >
                    {loading ? <CircularProgress size={24} color="inherit" /> : isEdit ? t("form.submitEdit") : t("form.submitCreate")}
                </Button>
                {Boolean(cashlessError) && (
                    <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>
                        {cashlessError}
                    </Typography>
                )}
            </Box>
        </Drawer>
    );
};
