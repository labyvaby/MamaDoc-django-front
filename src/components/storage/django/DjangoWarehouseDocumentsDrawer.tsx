import React from "react";
import {
    Alert,
    Box,
    Button,
    ButtonBase,
    Checkbox,
    Chip,
    CircularProgress,
    Divider,
    Drawer,
    IconButton,
    ListItemText,
    MenuItem,
    Paper,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
    alpha,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import PriceChangeOutlined from "@mui/icons-material/PriceChangeOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import { useNotification } from "@refinedev/core";

import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { ApiError, isAbortError } from "../../../api/client";
import {
    applyReprice,
    cancelWarehouseInventoryCount,
    closeWarehouseInventoryCount,
    createRepriceDraft,
    getInventoryCountDetail,
    getInventoryCounts,
    getRepriceDetail,
    getRepriceDocuments,
    type DjangoProduct,
    type DjangoWarehouse,
    type WarehouseInventoryCount,
    type WarehouseInventoryDetail,
    type WarehouseReprice,
    type WarehouseRepriceDetail,
    startWarehouseInventoryCount,
    submitInventoryCountLines,
} from "../../../api/warehouse";

type DrawerTab = 0 | 1;

interface DjangoWarehouseDocumentsDrawerProps {
    open: boolean;
    onClose: () => void;
    warehouses: DjangoWarehouse[];
    products: DjangoProduct[];
    defaultWarehouseId: number | null;
    activeBranchId: number | null;
    organizationId?: number;
    onChanged: () => void;
}

const money = (value: string | number | null | undefined) => {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return `${parsed.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} сом`;
};

const statusLabel: Record<string, string> = {
    counting: "В работе",
    completed: "Завершена",
    canceled: "Отменена",
    draft: "Черновик",
    applied: "Применена",
};

export const DjangoWarehouseDocumentsDrawer: React.FC<DjangoWarehouseDocumentsDrawerProps> = ({
    open,
    onClose,
    warehouses,
    products,
    defaultWarehouseId,
    activeBranchId,
    organizationId,
    onChanged,
}) => {
    const { open: notify } = useNotification();
    const { confirm, ConfirmDialog } = useConfirmDialog();
    const [tab, setTab] = React.useState<DrawerTab>(0);
    const [busy, setBusy] = React.useState(false);
    const [loadingList, setLoadingList] = React.useState(false);
    const [warehouseId, setWarehouseId] = React.useState<number | "">(defaultWarehouseId ?? "");
    const [comment, setComment] = React.useState("");
    const [inventoryCounts, setInventoryCounts] = React.useState<WarehouseInventoryCount[]>([]);
    const [inventoryDetail, setInventoryDetail] = React.useState<WarehouseInventoryDetail | null>(null);
    const [reprices, setReprices] = React.useState<WarehouseReprice[]>([]);
    const [repriceDetail, setRepriceDetail] = React.useState<WarehouseRepriceDetail | null>(null);
    const [repriceMode, setRepriceMode] = React.useState<"fixed" | "markup">("fixed");
    const [markupPercent, setMarkupPercent] = React.useState("");
    const [productSearch, setProductSearch] = React.useState("");
    const [selectedProductIds, setSelectedProductIds] = React.useState<number[]>([]);
    const [fixedPrices, setFixedPrices] = React.useState<Record<number, string>>({});

    const loadLists = React.useCallback(async (signal?: AbortSignal) => {
        try {
            setLoadingList(true);
            const [counts, documents] = await Promise.all([
                getInventoryCounts({ organizationId }, signal),
                getRepriceDocuments({ branchId: activeBranchId ?? undefined, organizationId }, signal),
            ]);
            setInventoryCounts(counts);
            setReprices(documents);
        } catch (error) {
            if (!isAbortError(error)) {
                console.error(error);
                notify?.({ type: "error", message: "Не удалось загрузить документы склада" });
            }
        } finally {
            if (!signal?.aborted) setLoadingList(false);
        }
    }, [activeBranchId, notify, organizationId]);

    React.useEffect(() => {
        if (!open) return undefined;
        const controller = new AbortController();
        setTab(0);
        setWarehouseId(defaultWarehouseId ?? "");
        setComment("");
        setInventoryDetail(null);
        setRepriceDetail(null);
        setRepriceMode("fixed");
        setMarkupPercent("");
        setProductSearch("");
        setSelectedProductIds([]);
        setFixedPrices({});
        void loadLists(controller.signal);
        return () => controller.abort();
    }, [defaultWarehouseId, loadLists, open]);

    const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId);
    const visibleProducts = React.useMemo(() => {
        const query = productSearch.trim().toLocaleLowerCase();
        if (!query) return products;
        return products.filter((product) =>
            product.name.toLocaleLowerCase().includes(query)
            || product.barcode.toLocaleLowerCase().includes(query)
            || product.category.toLocaleLowerCase().includes(query),
        );
    }, [productSearch, products]);

    const handleStartInventory = async () => {
        if (typeof warehouseId !== "number") {
            notify?.({ type: "error", message: "Выберите склад" });
            return;
        }
        try {
            setBusy(true);
            const detail = await startWarehouseInventoryCount({ warehouseId, comment: comment.trim(), organizationId });
            setInventoryDetail(detail);
            setComment("");
            await loadLists();
            notify?.({ type: "success", message: `Инвентаризация склада «${selectedWarehouse?.name ?? ""}» открыта` });
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Не удалось открыть инвентаризацию";
            notify?.({ type: "error", message });
        } finally {
            setBusy(false);
        }
    };

    const handleOpenInventory = async (id: number) => {
        try {
            setBusy(true);
            setInventoryDetail(await getInventoryCountDetail(id, organizationId));
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Не удалось открыть документ";
            notify?.({ type: "error", message });
        } finally {
            setBusy(false);
        }
    };

    const handleCountedChange = (lineId: number, value: string) => {
        setInventoryDetail((current) => current
            ? { ...current, lines: current.lines.map((line) => line.id === lineId ? { ...line, counted: value } : line) }
            : current);
    };

    const handleSaveInventory = async () => {
        if (!inventoryDetail) return;
        const lines = inventoryDetail.lines
            .filter((line) => line.counted != null && line.counted.trim() !== "")
            .map((line) => ({ productId: line.productId, quantity: line.counted!.trim() }));
        if (lines.length === 0) {
            notify?.({ type: "error", message: "Введите фактическое количество хотя бы для одной позиции" });
            return;
        }
        try {
            setBusy(true);
            setInventoryDetail(await submitInventoryCountLines(inventoryDetail.document.id, lines, organizationId));
            await loadLists();
            notify?.({ type: "success", message: `Сохранено позиций: ${lines.length}` });
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Не удалось сохранить подсчёт";
            notify?.({ type: "error", message });
        } finally {
            setBusy(false);
        }
    };

    const handleCloseInventory = async () => {
        if (!inventoryDetail) return;
        const uncounted = inventoryDetail.lines.filter((line) => line.counted == null || line.counted.trim() === "").length;
        const approved = await confirm({
            title: "Провести инвентаризацию?",
            message: uncounted > 0
                ? `${uncounted} позиций ещё не посчитаны. Они не будут изменены. Провести только сохранённые результаты?`
                : "Разницы будут проведены движениями по складу. Это действие нельзя отменить.",
            confirmText: "Провести",
            variant: "warning",
        });
        if (!approved) return;
        try {
            setBusy(true);
            await closeWarehouseInventoryCount(inventoryDetail.document.id, organizationId);
            notify?.({ type: "success", message: "Инвентаризация проведена" });
            setInventoryDetail(null);
            await loadLists();
            onChanged();
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Не удалось провести инвентаризацию";
            notify?.({ type: "error", message });
        } finally {
            setBusy(false);
        }
    };

    const handleCancelInventory = async () => {
        if (!inventoryDetail) return;
        const approved = await confirm({
            title: "Отменить инвентаризацию?",
            message: "Документ будет закрыт без проведения разниц.",
            confirmText: "Отменить документ",
            variant: "error",
        });
        if (!approved) return;
        try {
            setBusy(true);
            await cancelWarehouseInventoryCount(inventoryDetail.document.id, organizationId);
            setInventoryDetail(null);
            await loadLists();
            notify?.({ type: "success", message: "Инвентаризация отменена" });
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Не удалось отменить документ";
            notify?.({ type: "error", message });
        } finally {
            setBusy(false);
        }
    };

    const toggleProduct = (id: number) => {
        setSelectedProductIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    };

    const handleCreateReprice = async () => {
        if (selectedProductIds.length === 0) {
            notify?.({ type: "error", message: "Выберите товары для переоценки" });
            return;
        }
        if (repriceMode === "fixed" && selectedProductIds.some((id) => !fixedPrices[id] || Number(fixedPrices[id]) <= 0)) {
            notify?.({ type: "error", message: "Укажите новую цену для каждого выбранного товара" });
            return;
        }
        if (repriceMode === "markup" && (!markupPercent || Number(markupPercent) <= 0)) {
            notify?.({ type: "error", message: "Укажите наценку больше нуля" });
            return;
        }
        try {
            setBusy(true);
            const detail = await createRepriceDraft({
                branchId: activeBranchId ?? undefined,
                mode: repriceMode,
                products: selectedProductIds.map((productId) => ({
                    productId,
                    ...(repriceMode === "fixed" ? { newPrice: fixedPrices[productId].trim() } : {}),
                })),
                markupPercent: repriceMode === "markup" ? markupPercent.trim() : undefined,
                comment: comment.trim(),
                organizationId,
            });
            setRepriceDetail(detail);
            setComment("");
            await loadLists();
            notify?.({ type: "success", message: "Черновик переоценки создан" });
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Не удалось создать переоценку";
            notify?.({ type: "error", message });
        } finally {
            setBusy(false);
        }
    };

    const handleOpenReprice = async (id: number) => {
        try {
            setBusy(true);
            setRepriceDetail(await getRepriceDetail(id, organizationId));
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Не удалось открыть документ";
            notify?.({ type: "error", message });
        } finally {
            setBusy(false);
        }
    };

    const handleApplyReprice = async () => {
        if (!repriceDetail) return;
        const approved = await confirm({
            title: "Применить переоценку?",
            message: "Цены выбранных товаров изменятся. Сначала проверьте новые цены в списке ниже.",
            confirmText: "Применить цены",
            variant: "warning",
        });
        if (!approved) return;
        try {
            setBusy(true);
            setRepriceDetail(await applyReprice(repriceDetail.document.id, organizationId));
            await loadLists();
            onChanged();
            notify?.({ type: "success", message: "Цены применены" });
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Не удалось применить переоценку";
            notify?.({ type: "error", message });
        } finally {
            setBusy(false);
        }
    };

    const renderInventory = () => (
        <Stack spacing={2} sx={{ p: 2, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {!inventoryDetail ? (
                <>
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Stack spacing={1.5}>
                            <Typography variant="subtitle2">Новый пересчёт</Typography>
                            <TextField
                                select
                                size="small"
                                label="Склад"
                                value={warehouseId}
                                onChange={(event) => setWarehouseId(event.target.value ? Number(event.target.value) : "")}
                                fullWidth
                            >
                                <MenuItem value="">Выберите склад</MenuItem>
                                {warehouses.map((warehouse) => <MenuItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</MenuItem>)}
                            </TextField>
                            <TextField
                                size="small"
                                label="Комментарий"
                                placeholder="Например, пересчёт перед закрытием"
                                value={comment}
                                onChange={(event) => setComment(event.target.value)}
                                multiline
                                minRows={2}
                            />
                            <Button variant="contained" onClick={handleStartInventory} disabled={busy || typeof warehouseId !== "number"} startIcon={<FactCheckOutlined />}>
                                Открыть инвентаризацию
                            </Button>
                        </Stack>
                    </Paper>
                    <Typography variant="caption" color="text.secondary">Последние документы</Typography>
                    {loadingList ? <CircularProgress size={24} sx={{ alignSelf: "center" }} /> : inventoryCounts.length === 0 ? (
                        <Alert severity="info">Инвентаризаций пока нет.</Alert>
                    ) : inventoryCounts.slice(0, 8).map((document) => (
                        <ButtonBase key={document.id} onClick={() => void handleOpenInventory(document.id)} sx={{ display: "block", textAlign: "left", borderRadius: 1 }}>
                            <Paper variant="outlined" sx={{ p: 1.25, "&:hover": { borderColor: "primary.main" } }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                                    <ListItemText primary={document.warehouseName} secondary={`${new Date(document.createdAt).toLocaleString("ru-RU")} • ${document.countedTotal}/${document.lineTotal} посчитано`} />
                                    <Chip size="small" label={statusLabel[document.status] ?? document.status} color={document.status === "completed" ? "success" : document.status === "counting" ? "warning" : "default"} />
                                </Stack>
                            </Paper>
                        </ButtonBase>
                    ))}
                </>
            ) : (
                <>
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                            <Box>
                                <Typography variant="subtitle2">{inventoryDetail.document.warehouseName}</Typography>
                                <Typography variant="caption" color="text.secondary">Документ №{inventoryDetail.document.id} • строк: {inventoryDetail.lines.length}</Typography>
                            </Box>
                            <Chip size="small" label={statusLabel[inventoryDetail.document.status] ?? inventoryDetail.document.status} color="warning" />
                        </Stack>
                    </Paper>
                    <Alert severity="info">Учётный остаток скрыт до ввода фактического количества — так продажа во время пересчёта не искажает результат.</Alert>
                    <Stack spacing={1}>
                        {inventoryDetail.lines.map((line) => (
                            <Paper key={line.id} variant="outlined" sx={{ p: 1.25 }}>
                                <Stack direction="row" alignItems="center" gap={1}>
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography variant="body2" fontWeight={600} noWrap>{line.productName}</Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap>{line.sku || "Без SKU"}{line.attributes.length ? ` • ${line.attributes.map((attribute) => attribute.value).join(" / ")}` : ""}</Typography>
                                        {line.difference != null && <Typography variant="caption" color={Number(line.difference) < 0 ? "error.main" : "success.main"} display="block">Разница: {line.difference}</Typography>}
                                    </Box>
                                    <TextField
                                        size="small"
                                        label="Факт"
                                        value={line.counted ?? ""}
                                        onChange={(event) => handleCountedChange(line.id, event.target.value)}
                                        type="number"
                                        sx={{ width: 100 }}
                                        inputProps={{ min: 0, step: "any" }}
                                        disabled={busy || inventoryDetail.document.status !== "counting"}
                                    />
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                    {inventoryDetail.document.status === "counting" && (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                            <Button variant="outlined" onClick={handleSaveInventory} disabled={busy} fullWidth>Сохранить подсчёт</Button>
                            <Button variant="contained" onClick={handleCloseInventory} disabled={busy} fullWidth>Провести разницы</Button>
                            <Button color="error" onClick={handleCancelInventory} disabled={busy} fullWidth>Отменить</Button>
                        </Stack>
                    )}
                    {busy && <CircularProgress size={22} sx={{ alignSelf: "center" }} />}
                </>
            )}
        </Stack>
    );

    const renderReprice = () => (
        <Stack spacing={2} sx={{ p: 2, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {!repriceDetail ? (
                <>
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Stack spacing={1.5}>
                            <Typography variant="subtitle2">Новый документ переоценки</Typography>
                            <TextField
                                select
                                size="small"
                                label="Режим"
                                value={repriceMode}
                                onChange={(event) => setRepriceMode(event.target.value as "fixed" | "markup")}
                            >
                                <MenuItem value="fixed">Указать новые цены</MenuItem>
                                <MenuItem value="markup">Наценка на себестоимость</MenuItem>
                            </TextField>
                            {repriceMode === "markup" && <TextField size="small" label="Наценка, %" type="number" value={markupPercent} onChange={(event) => setMarkupPercent(event.target.value)} inputProps={{ min: 0, step: "any" }} />}
                            <Typography variant="caption" color="text.secondary">
                                {activeBranchId ? "Изменится цена активного филиала." : "Без выбранного филиала изменится базовая цена товара."}
                            </Typography>
                            <TextField size="small" label="Поиск товара" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} />
                            <Box sx={{ maxHeight: 260, overflowY: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
                                {visibleProducts.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Товары не найдены.</Typography> : visibleProducts.map((product) => {
                                    const selected = selectedProductIds.includes(product.id);
                                    return (
                                        <ButtonBase key={product.id} onClick={() => toggleProduct(product.id)} sx={{ display: "flex", width: "100%", textAlign: "left", p: 0.75, gap: 0.5, borderBottom: 1, borderColor: "divider", bgcolor: selected ? (theme) => alpha(theme.palette.primary.main, 0.06) : "transparent" }}>
                                            <Checkbox size="small" checked={selected} tabIndex={-1} />
                                            <ListItemText primary={product.name} secondary={`${product.category || "Без категории"} • ${money(product.price)}`} />
                                            {selected && repriceMode === "fixed" && <TextField size="small" label="Новая цена" type="number" value={fixedPrices[product.id] ?? ""} onClick={(event) => event.stopPropagation()} onChange={(event) => setFixedPrices((current) => ({ ...current, [product.id]: event.target.value }))} sx={{ width: 125 }} inputProps={{ min: 0, step: "any" }} />}
                                        </ButtonBase>
                                    );
                                })}
                            </Box>
                            <TextField size="small" label="Комментарий" value={comment} onChange={(event) => setComment(event.target.value)} multiline minRows={2} />
                            <Button variant="contained" onClick={handleCreateReprice} disabled={busy} startIcon={<PriceChangeOutlined />}>Создать черновик ({selectedProductIds.length})</Button>
                        </Stack>
                    </Paper>
                    <Typography variant="caption" color="text.secondary">Последние переоценки</Typography>
                    {loadingList ? <CircularProgress size={24} sx={{ alignSelf: "center" }} /> : reprices.length === 0 ? <Alert severity="info">Документов переоценки пока нет.</Alert> : reprices.slice(0, 8).map((document) => (
                        <ButtonBase key={document.id} onClick={() => void handleOpenReprice(document.id)} sx={{ display: "block", textAlign: "left", borderRadius: 1 }}>
                            <Paper variant="outlined" sx={{ p: 1.25, "&:hover": { borderColor: "primary.main" } }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                                    <ListItemText primary={`${document.mode === "markup" ? "Наценка" : "Фиксированные цены"} • ${document.lineTotal} поз.`} secondary={`${new Date(document.createdAt).toLocaleString("ru-RU")} • ${document.branchName || "Базовая цена"}`} />
                                    <Chip size="small" label={statusLabel[document.status] ?? document.status} color={document.status === "applied" ? "success" : document.status === "draft" ? "warning" : "default"} />
                                </Stack>
                            </Paper>
                        </ButtonBase>
                    ))}
                </>
            ) : (
                <>
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                            <Box>
                                <Typography variant="subtitle2">Переоценка №{repriceDetail.document.id}</Typography>
                                <Typography variant="caption" color="text.secondary">{repriceDetail.document.branchName || "Базовая цена"} • {repriceDetail.lines.length} позиций</Typography>
                            </Box>
                            <Chip size="small" label={statusLabel[repriceDetail.document.status] ?? repriceDetail.document.status} color={repriceDetail.document.status === "applied" ? "success" : "warning"} />
                        </Stack>
                    </Paper>
                    {repriceDetail.document.skippedCount > 0 && <Alert severity="warning">Не удалось рассчитать цену для {repriceDetail.document.skippedCount} товаров — они не попадут в применение.</Alert>}
                    <Stack spacing={1}>
                        {repriceDetail.lines.map((line) => (
                            <Paper key={line.id} variant="outlined" sx={{ p: 1.25 }}>
                                <Stack direction="row" justifyContent="space-between" gap={1}>
                                    <Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={600} noWrap>{line.productName}</Typography><Typography variant="caption" color="text.secondary">{line.sku || "Без SKU"}</Typography></Box>
                                    <Stack alignItems="flex-end"><Typography variant="body2">{money(line.oldPrice)} → <b>{money(line.newPrice)}</b></Typography><Typography variant="caption" color={Number(line.difference) >= 0 ? "success.main" : "error.main"}>{Number(line.difference) >= 0 ? "+" : ""}{money(line.difference)}</Typography></Stack>
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                    {repriceDetail.document.status === "draft" && <Button variant="contained" onClick={handleApplyReprice} disabled={busy} startIcon={<CheckCircleOutlined />}>Применить цены</Button>}
                    {busy && <CircularProgress size={22} sx={{ alignSelf: "center" }} />}
                </>
            )}
        </Stack>
    );

    return (
        <>
            <Drawer anchor="right" open={open} onClose={busy ? undefined : onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 520 }, maxWidth: "100%", display: "flex", flexDirection: "column" } }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
                    <Typography variant="h6">Операции склада</Typography>
                    <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть"><CloseOutlined /></IconButton>
                </Box>
                <Divider />
                <Tabs value={tab} onChange={(_, value: DrawerTab) => { setTab(value); setInventoryDetail(null); setRepriceDetail(null); }} variant="fullWidth">
                    <Tab icon={<FactCheckOutlined fontSize="small" />} iconPosition="start" label="Инвентаризация" />
                    <Tab icon={<PriceChangeOutlined fontSize="small" />} iconPosition="start" label="Переоценка" />
                </Tabs>
                <Divider />
                {tab === 0 ? renderInventory() : renderReprice()}
            </Drawer>
            <ConfirmDialog />
        </>
    );
};

export default DjangoWarehouseDocumentsDrawer;
