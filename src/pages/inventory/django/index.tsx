import React from "react";
import { Box, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import { useNotification } from "@refinedev/core";
import QrCodeScannerOutlined from "@mui/icons-material/QrCodeScannerOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";

import { AppButton, PageHeader } from "../../../components/ui";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { useActiveScope } from "../../../hooks/useActiveScope";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { ApiError, isAbortError } from "../../../api/client";
import {
    cancelWarehouseInventoryCount,
    closeWarehouseInventoryCount,
    getProducts,
    getWarehouses,
    startWarehouseInventoryCount,
    submitInventoryCountLines,
    type DjangoProduct,
    type DjangoWarehouse,
    type WarehouseInventoryDetail,
} from "../../../api/warehouse";
import { DjangoProductFormDrawer } from "../../../components/products/django/DjangoProductFormDrawer";
import {
    InventorySetupCard,
    type InventoryCategoryOption,
} from "../../../components/storage/django/inventory/InventorySetupCard";
import {
    InventoryScanPanel,
    type LastScan,
} from "../../../components/storage/django/inventory/InventoryScanPanel";
import { InventoryResultGroups } from "../../../components/storage/django/inventory/InventoryResultGroups";
import {
    positionsLabel,
    type CountRow,
    type UnknownScan,
} from "../../../components/storage/django/inventory/inventoryModel";

type Step = "setup" | "count" | "result";

const NO_CATEGORY = "Без категории";

const categoryOf = (product: DjangoProduct) => product.category?.trim() || NO_CATEGORY;

const toNumber = (value: string | null | undefined): number => {
    if (value == null || value === "") return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const rowFromProduct = (product: DjangoProduct, expected: number, counted: number | null): CountRow => ({
    productId: product.id,
    name: product.name,
    category: product.category ?? "",
    barcode: product.barcode ?? "",
    barcodes: product.barcodes ?? [],
    unit: product.unit || "шт",
    price: product.price ?? 0,
    expected,
    counted,
});

/** Строки документа в терминах экрана: ожидание — из бэка, факт — из ответа. */
const buildRows = (detail: WarehouseInventoryDetail, catalog: DjangoProduct[]): CountRow[] => {
    const byId = new Map(catalog.map((product) => [product.id, product]));
    return detail.lines
        .map((line) => {
            const product = byId.get(line.productId);
            return {
                productId: line.productId,
                name: line.productName || product?.name || `Товар #${line.productId}`,
                category: product?.category ?? "",
                barcode: product?.barcode ?? "",
                barcodes: product?.barcodes ?? [],
                unit: product?.unit || "шт",
                price: product?.price ?? 0,
                expected: toNumber(line.expected),
                counted: line.counted == null || line.counted === "" ? null : toNumber(line.counted),
            } satisfies CountRow;
        })
        .sort((a, b) => a.name.localeCompare(b.name, "ru"));
};

const vibrate = (ms: number) => {
    try {
        navigator.vibrate?.(ms);
    } catch {
        /* вибрация не критична: на десктопе её просто нет */
    }
};

/**
 * Инвентаризация по штрихкодам: выбор охвата → пересчёт сканером → итоги по
 * разрядам расхождения. Документ живёт в бэке (`/v2/warehouse/inventory-counts/`),
 * факт по позициям накапливается локально и уходит пачкой на «Завершить пересчёт»:
 * непосчитанные строки при этом НЕ отправляются — бэк сознательно не читает их
 * как ноль, иначе провёл бы списание всего, до чего не дошли.
 */
const DjangoInventoryPage: React.FC = () => {
    usePageTitle("Инвентаризация");
    const { open: notify } = useNotification();
    const { confirm, ConfirmDialog } = useConfirmDialog();
    const canView = useCan("warehouse.view");
    const canManage = useCan("warehouse.manage");
    const { activeEmployee, loading: permLoading } = usePermissions();
    const { organizationId: orgId, orgReady } = useActiveScope();

    const [step, setStep] = React.useState<Step>("setup");
    const [warehouses, setWarehouses] = React.useState<DjangoWarehouse[]>([]);
    const [warehouseId, setWarehouseId] = React.useState<number | null>(null);
    const [products, setProducts] = React.useState<DjangoProduct[]>([]);
    const [selectedCategories, setSelectedCategories] = React.useState<string[]>([]);
    const [comment, setComment] = React.useState("");
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState(false);

    const [document, setDocument] = React.useState<WarehouseInventoryDetail | null>(null);
    const [rows, setRows] = React.useState<CountRow[]>([]);
    const [order, setOrder] = React.useState<number[]>([]);
    const [unknownScans, setUnknownScans] = React.useState<UnknownScan[]>([]);
    const [lastScan, setLastScan] = React.useState<LastScan>(null);
    const [picks, setPicks] = React.useState(0);
    const [startedAt, setStartedAt] = React.useState<number | null>(null);
    const [elapsed, setElapsed] = React.useState("00:00");
    const [newProductBarcode, setNewProductBarcode] = React.useState<string | null>(null);

    // Счётчики держим в ref: два пика в один тик React не должны потерять единицу.
    const countedRef = React.useRef<Map<number, number>>(new Map());
    const unknownRef = React.useRef<Map<string, number>>(new Map());
    const nonceRef = React.useRef(0);
    const categoriesReady = React.useRef(false);

    const loadProducts = React.useCallback(
        async (signal?: AbortSignal): Promise<DjangoProduct[]> => {
            const list = await getProducts(signal, { organizationId: orgId ?? undefined });
            setProducts(list);
            return list;
        },
        [orgId],
    );

    const load = React.useCallback(
        async (signal?: AbortSignal) => {
            setLoading(true);
            try {
                const [warehouseList] = await Promise.all([
                    getWarehouses(signal, orgId ?? undefined),
                    loadProducts(signal),
                ]);
                setWarehouses(warehouseList);
                setWarehouseId((current) => {
                    if (current != null) return current;
                    const primary = warehouseList.find((item) => item.isPrimary && !item.isLinked);
                    return (primary ?? warehouseList[0])?.id ?? null;
                });
            } catch (error) {
                if (isAbortError(error)) return;
                notify?.({
                    type: "error",
                    message: error instanceof ApiError ? error.message : "Не удалось загрузить склады и товары",
                });
            } finally {
                setLoading(false);
            }
        },
        [loadProducts, notify, orgId],
    );

    React.useEffect(() => {
        if (!orgReady) return;
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load, orgReady]);

    const categories = React.useMemo<InventoryCategoryOption[]>(() => {
        const counts = new Map<string, number>();
        products.forEach((product) => {
            const key = categoryOf(product);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        });
        return [...counts.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }, [products]);

    // Первая загрузка — выбираем всё; дальше выбор пользователя не перетираем.
    React.useEffect(() => {
        if (categoriesReady.current || categories.length === 0) return;
        categoriesReady.current = true;
        setSelectedCategories(categories.map((category) => category.name));
    }, [categories]);

    const scopeProducts = React.useMemo(
        () => products.filter((product) => selectedCategories.includes(categoryOf(product))),
        [products, selectedCategories],
    );

    // Остаток из карточки товара — агрегат по видимым складам, поэтому это
    // оценка «до старта»; точное ожидание приходит в строках документа.
    const scopeSum = React.useMemo(
        () => scopeProducts.reduce((total, product) => total + product.price * (product.stock ?? 0), 0),
        [scopeProducts],
    );

    const barcodeIndex = React.useMemo(() => {
        const index = new Map<string, number>();
        products.forEach((product) => {
            if (product.barcode) index.set(product.barcode.trim(), product.id);
            (product.barcodes ?? []).forEach((code) => {
                if (code) index.set(code.trim(), product.id);
            });
        });
        return index;
    }, [products]);

    React.useEffect(() => {
        if (step !== "count" || startedAt == null) return;
        const tick = () => {
            const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
            const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
            const ss = String(seconds % 60).padStart(2, "0");
            setElapsed(`${mm}:${ss}`);
        };
        tick();
        const timer = window.setInterval(tick, 1000);
        return () => window.clearInterval(timer);
    }, [startedAt, step]);

    const syncUnknown = () => {
        setUnknownScans(
            [...unknownRef.current.entries()]
                .map(([barcode, count]) => ({ barcode, picks: count }))
                .reverse(),
        );
    };

    const setCounted = (productId: number, value: number) => {
        countedRef.current.set(productId, value);
        setRows((current) =>
            current.map((row) => (row.productId === productId ? { ...row, counted: value } : row)),
        );
    };

    const resetSession = () => {
        countedRef.current = new Map();
        unknownRef.current = new Map();
        setUnknownScans([]);
        setRows([]);
        setOrder([]);
        setLastScan(null);
        setPicks(0);
        setStartedAt(null);
        setElapsed("00:00");
        setDocument(null);
    };

    const handleStart = async () => {
        if (!canManage) {
            notify?.({ type: "error", message: "Нет права warehouse.manage" });
            return;
        }
        if (warehouseId == null) {
            notify?.({ type: "error", message: "Выберите склад" });
            return;
        }
        if (scopeProducts.length === 0) {
            notify?.({ type: "error", message: "Выберите хотя бы одну категорию товаров" });
            return;
        }
        setBusy(true);
        try {
            const detail = await startWarehouseInventoryCount({
                warehouseId,
                productIds: scopeProducts.map((product) => product.id),
                comment: comment.trim() || undefined,
                organizationId: orgId ?? undefined,
            });
            resetSession();
            setDocument(detail);
            setRows(buildRows(detail, products));
            setStartedAt(Date.now());
            setStep("count");
            notify?.({ type: "success", message: `Документ №${detail.document.id} открыт — можно пикать` });
        } catch (error) {
            notify?.({
                type: "error",
                message: error instanceof ApiError ? error.message : "Не удалось открыть инвентаризацию",
            });
        } finally {
            setBusy(false);
        }
    };

    const handleScan = (barcode: string) => {
        const code = barcode.trim();
        if (!code) return;
        setPicks((current) => current + 1);

        const productId = barcodeIndex.get(code);
        if (productId == null) {
            unknownRef.current.set(code, (unknownRef.current.get(code) ?? 0) + 1);
            syncUnknown();
            nonceRef.current += 1;
            setLastScan({ kind: "unknown", barcode: code, nonce: nonceRef.current });
            vibrate(60);
            return;
        }

        const previous = countedRef.current.get(productId);
        const next = (previous ?? 0) + 1;
        countedRef.current.set(productId, next);

        setRows((current) => {
            if (current.some((row) => row.productId === productId)) {
                return current.map((row) => (row.productId === productId ? { ...row, counted: next } : row));
            }
            // Товар вне выбранных категорий: бэк создаст строку сам (get_or_create),
            // поэтому просто добавляем её в документ на экране.
            const product = products.find((item) => item.id === productId);
            if (!product) return current;
            notify?.({ type: "success", message: `«${product.name}» вне выбранных категорий — добавлен в документ` });
            return [...current, rowFromProduct(product, product.stock ?? 0, next)];
        });

        setOrder((current) => [productId, ...current.filter((id) => id !== productId)]);
        nonceRef.current += 1;
        setLastScan({ kind: "item", productId, first: previous == null, nonce: nonceRef.current });
        vibrate(18);
    };

    const handleAdjust = (productId: number, delta: number) => {
        const previous = countedRef.current.get(productId) ?? 0;
        const next = Math.max(0, previous + delta);
        setCounted(productId, next);
        if (delta > 0) setOrder((current) => [productId, ...current.filter((id) => id !== productId)]);
    };

    const handleZero = (productId: number) => setCounted(productId, 0);

    /** Отправить факт в документ и перечитать строки — ответ бэка авторитетнее. */
    const pushLines = async (lines: Array<{ productId: number; quantity: string }>) => {
        if (!document || lines.length === 0) return false;
        setBusy(true);
        try {
            const detail = await submitInventoryCountLines(document.document.id, lines, orgId ?? undefined);
            setDocument(detail);
            const fresh = buildRows(detail, products);
            setRows(fresh);
            countedRef.current = new Map(
                fresh.filter((row) => row.counted != null).map((row) => [row.productId, row.counted as number]),
            );
            return true;
        } catch (error) {
            notify?.({
                type: "error",
                message: error instanceof ApiError ? error.message : "Не удалось сохранить результаты подсчёта",
            });
            return false;
        } finally {
            setBusy(false);
        }
    };

    const handleFinish = async () => {
        if (!document) return;
        const counted = rows.filter((row) => row.counted != null);
        if (counted.length === 0) {
            notify?.({ type: "error", message: "Ни одна позиция не посчитана — пикните хотя бы один товар" });
            return;
        }
        const untouched = rows.length - counted.length;
        if (untouched > 0) {
            const approved = await confirm({
                title: "Завершить пересчёт?",
                message: `${positionsLabel(untouched)} не пикнуты. Они попадут в блок «Не посчитаны» и при проведении останутся без изменений — списывать их можно только вручную.`,
                confirmText: "Завершить",
                variant: "warning",
            });
            if (!approved) return;
        }
        const saved = await pushLines(
            counted.map((row) => ({ productId: row.productId, quantity: String(row.counted ?? 0) })),
        );
        if (!saved) return;
        setStep("result");
        notify?.({ type: "success", message: `Сохранено позиций: ${counted.length}` });
    };

    const handleMarkMissing = async (productIds: number[]) => {
        if (productIds.length === 0) return;
        const approved = await confirm({
            title: "Отметить отсутствующими?",
            message: `${positionsLabel(productIds.length)} получат фактический остаток ноль. При проведении их остаток спишется со склада.`,
            confirmText: "Отметить",
            variant: "warning",
        });
        if (!approved) return;
        await pushLines(productIds.map((productId) => ({ productId, quantity: "0" })));
    };

    const handleApply = async () => {
        if (!document) return;
        const pendingUnknown = unknownScans.length;
        const approved = await confirm({
            title: "Провести инвентаризацию?",
            message: pendingUnknown > 0
                ? `Осталось ${pendingUnknown} неизвестных штрихкодов — они не попадут в документ. Разницы по остальным позициям спишутся движениями склада, отменить это нельзя.`
                : "Разницы спишутся движениями по складу: недостача — расходом, излишек — приходом. Отменить проведение нельзя.",
            confirmText: "Провести",
            variant: "warning",
        });
        if (!approved) return;
        setBusy(true);
        try {
            await closeWarehouseInventoryCount(document.document.id, orgId ?? undefined);
            notify?.({ type: "success", message: "Инвентаризация проведена" });
            resetSession();
            setStep("setup");
            await loadProducts();
        } catch (error) {
            notify?.({
                type: "error",
                message: error instanceof ApiError ? error.message : "Не удалось провести инвентаризацию",
            });
        } finally {
            setBusy(false);
        }
    };

    const handleCancelDocument = async () => {
        if (!document) return;
        const approved = await confirm({
            title: "Отменить документ?",
            message: "Пересчёт закроется без проведения разниц. Посчитанное будет потеряно.",
            confirmText: "Отменить документ",
            variant: "error",
        });
        if (!approved) return;
        setBusy(true);
        try {
            await cancelWarehouseInventoryCount(document.document.id, orgId ?? undefined);
            notify?.({ type: "success", message: "Документ отменён" });
            resetSession();
            setStep("setup");
        } catch (error) {
            notify?.({
                type: "error",
                message: error instanceof ApiError ? error.message : "Не удалось отменить документ",
            });
        } finally {
            setBusy(false);
        }
    };

    /** Товар создан из неизвестного штрихкода — засчитываем ему накопленные пики. */
    const handleProductSaved = async () => {
        const barcode = newProductBarcode;
        setNewProductBarcode(null);
        let fresh: DjangoProduct[] = products;
        try {
            fresh = await loadProducts();
        } catch (error) {
            if (!isAbortError(error)) {
                notify?.({ type: "error", message: "Товар создан, но список не обновился — обновите страницу" });
            }
        }
        if (!barcode) return;
        const product = fresh.find(
            (item) => item.barcode?.trim() === barcode || (item.barcodes ?? []).includes(barcode),
        );
        if (!product) {
            notify?.({
                type: "error",
                message: `Товар создан, но штрихкод ${barcode} к нему не привязан — пикните ещё раз`,
            });
            return;
        }

        const scanned = unknownRef.current.get(barcode) ?? 1;
        unknownRef.current.delete(barcode);
        syncUnknown();

        if (step === "result") {
            await pushLines([{ productId: product.id, quantity: String(scanned) }]);
        } else {
            countedRef.current.set(product.id, scanned);
            setRows((current) => current.some((row) => row.productId === product.id)
                ? current.map((row) => (row.productId === product.id ? { ...row, counted: scanned } : row))
                : [...current, rowFromProduct(product, product.stock ?? 0, scanned)]);
            setOrder((current) => [product.id, ...current.filter((id) => id !== product.id)]);
        }
        notify?.({ type: "success", message: `«${product.name}» засчитан: ${scanned}` });
    };

    const toggleCategory = (name: string) =>
        setSelectedCategories((current) =>
            current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
        );

    const toggleAllCategories = () =>
        setSelectedCategories((current) =>
            current.length === categories.length ? [] : categories.map((category) => category.name),
        );

    if (permLoading || (loading && step === "setup")) return <LinearProgress />;
    if (!canView) return <AccessDenied />;

    const headerAction = step === "setup"
        ? { onAdd: handleStart, text: "Начать инвентаризацию", icon: <QrCodeScannerOutlined /> }
        : step === "count"
            ? { onAdd: handleFinish, text: "Завершить пересчёт", icon: <FactCheckOutlined /> }
            : { onAdd: handleApply, text: "Провести", icon: <FactCheckOutlined /> };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <PageHeader
                title="Инвентаризация"
                showTitle={false}
                onAdd={canManage ? headerAction.onAdd : undefined}
                addButtonText={headerAction.text}
                addButtonIcon={headerAction.icon}
                actions={step === "setup" ? undefined : (
                    <>
                        {step === "result" && (
                            <AppButton variant="outlined" onClick={() => setStep("count")} disabled={busy}>
                                К пересчёту
                            </AppButton>
                        )}
                        <AppButton
                            variant="text"
                            color="error"
                            onClick={handleCancelDocument}
                            disabled={busy || !canManage}
                        >
                            Отменить документ
                        </AppButton>
                    </>
                )}
            />

            <Box
                sx={(t) => ({
                    px: t.appLayout.page.paddingX,
                    pb: t.appLayout.page.paddingY,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                })}
            >
                {document && (
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        <Chip
                            size="small"
                            icon={<DescriptionOutlined />}
                            label={`Документ №${document.document.id}`}
                        />
                        <Chip size="small" icon={<StoreOutlined />} label={document.document.warehouseName} />
                        <Chip
                            size="small"
                            label={step === "count" ? "Пересчёт идёт" : "Черновик итогов"}
                            color="primary"
                            variant="outlined"
                        />
                        {document.document.startedByName && (
                            <Chip size="small" label={document.document.startedByName} variant="outlined" />
                        )}
                    </Stack>
                )}

                {busy && <LinearProgress />}

                {step === "setup" && (
                    <InventorySetupCard
                        warehouses={warehouses}
                        warehouseId={warehouseId}
                        onWarehouseChange={setWarehouseId}
                        categories={categories}
                        selected={selectedCategories}
                        onToggleCategory={toggleCategory}
                        onToggleAll={toggleAllCategories}
                        comment={comment}
                        onCommentChange={setComment}
                        scopeCount={scopeProducts.length}
                        scopeSum={scopeSum}
                        responsibleName={activeEmployee?.fullName ?? "—"}
                        disabled={busy || !canManage}
                    />
                )}

                {step === "count" && (
                    <InventoryScanPanel
                        rows={rows}
                        order={order}
                        unknownScans={unknownScans}
                        lastScan={lastScan}
                        picks={picks}
                        elapsed={elapsed}
                        onScan={handleScan}
                        onAdjust={handleAdjust}
                        onZero={handleZero}
                        onCreateUnknown={setNewProductBarcode}
                        disabled={busy || !canManage}
                    />
                )}

                {step === "result" && (
                    <>
                        <InventoryResultGroups
                            rows={rows}
                            unknownScans={unknownScans}
                            onCreateUnknown={setNewProductBarcode}
                            onMarkMissing={handleMarkMissing}
                            disabled={busy || !canManage}
                        />
                        <Typography variant="caption" color="text.secondary">
                            Недостача спишется расходом, излишек — приходом. Позиции из блока «Не посчитаны»
                            останутся без изменений.
                        </Typography>
                    </>
                )}
            </Box>

            <DjangoProductFormDrawer
                open={newProductBarcode != null}
                product={null}
                initialBarcode={newProductBarcode ?? undefined}
                onClose={() => setNewProductBarcode(null)}
                onSaved={handleProductSaved}
            />

            <ConfirmDialog />
        </Box>
    );
};

export default DjangoInventoryPage;
