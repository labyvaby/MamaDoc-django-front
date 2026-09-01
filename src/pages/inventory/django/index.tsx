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
    getInventoryCountDetail,
    getInventoryCounts,
    getProducts,
    getStock,
    getWarehouses,
    startWarehouseInventoryCount,
    submitInventoryCountLines,
    type DjangoProduct,
    type DjangoWarehouse,
    type WarehouseInventoryCount,
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
import { InventoryHistoryCard } from "../../../components/storage/django/inventory/InventoryHistoryCard";
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
const buildRows = (
    detail: WarehouseInventoryDetail,
    catalog: DjangoProduct[],
    stockOf: (productId: number) => number,
): CountRow[] => {
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
                // expected в документе NULL, пока строку не посчитали: бэк
                // замораживает ожидание в момент подсчёта. До этого показываем
                // текущий остаток склада — то, с чем кладовщик и сверяется.
                expected: line.expected == null ? stockOf(line.productId) : toNumber(line.expected),
                counted: line.counted == null || line.counted === "" ? null : toNumber(line.counted),
            } satisfies CountRow;
        })
        .sort((a, b) => a.name.localeCompare(b.name, "ru"));
};

/**
 * 404 на открытии документа — это не «нет маршрута», а «склад недоступен»:
 * список складов приходит по всей организации, а писать бэк разрешает только
 * в склад активного филиала (см. _writable_warehouse).
 */
const startErrorMessage = (
    error: unknown,
    warehouse: DjangoWarehouse | undefined,
    branchName: string | null,
): string => {
    if (!(error instanceof ApiError)) return "Не удалось открыть инвентаризацию";
    if (error.status !== 404) return error.message;
    const where = warehouse ? "«" + warehouse.name + "» (филиал " + warehouse.branchName + ")" : "Выбранный склад";
    const here = branchName ? ", активен филиал " + branchName : "";
    return where + " недоступен для записи" + here + " — выберите склад своего филиала или переключите филиал в шапке";
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
    const { activeEmployee, activeBranch, loading: permLoading } = usePermissions();
    const { organizationId: orgId, orgReady } = useActiveScope();
    const activeBranchId = activeBranch?.id ?? null;

    const [step, setStep] = React.useState<Step>("setup");
    const [warehouses, setWarehouses] = React.useState<DjangoWarehouse[]>([]);
    const [warehouseId, setWarehouseId] = React.useState<number | null>(null);
    const [products, setProducts] = React.useState<DjangoProduct[]>([]);
    const [stockByProduct, setStockByProduct] = React.useState<Map<number, number>>(new Map());
    const [history, setHistory] = React.useState<WarehouseInventoryCount[]>([]);
    const [historyLoading, setHistoryLoading] = React.useState(false);
    const [selectedCategories, setSelectedCategories] = React.useState<string[]>([]);
    const [onlyWithStock, setOnlyWithStock] = React.useState(true);
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState(false);

    const [countDocument, setCountDocument] = React.useState<WarehouseInventoryDetail | null>(null);
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

    const stockOf = React.useCallback(
        (productId: number) => stockByProduct.get(productId) ?? 0,
        [stockByProduct],
    );

    /** Остатки выбранного склада — источник ожидания до первого подсчёта. */
    const loadStock = React.useCallback(
        async (id: number, signal?: AbortSignal) => {
            const rows = await getStock(id, signal, orgId ?? undefined);
            setStockByProduct(new Map(rows.map((row) => [row.productId, row.quantity])));
        },
        [orgId],
    );

    const loadHistory = React.useCallback(
        async (id: number, signal?: AbortSignal) => {
            setHistoryLoading(true);
            try {
                const rows = await getInventoryCounts(
                    { warehouseId: id, organizationId: orgId ?? undefined },
                    signal,
                );
                setHistory(rows.slice(0, 6));
            } catch (error) {
                if (!isAbortError(error)) setHistory([]);
            } finally {
                setHistoryLoading(false);
            }
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
                    // Список складов бэк отдаёт по всей организации, когда фронт
                    // передаёт organizationId, а открыть документ можно только на
                    // складе активного филиала — иначе POST отвечает 404.
                    const own = warehouseList.filter(
                        (item) => activeBranchId == null || item.branchId === activeBranchId,
                    );
                    const pool = own.length ? own : warehouseList;
                    const primary = pool.find((item) => item.isPrimary);
                    return (primary ?? pool[0])?.id ?? null;
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
        [activeBranchId, loadProducts, notify, orgId],
    );

    React.useEffect(() => {
        if (!orgReady) return;
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load, orgReady]);

    // Остатки и история — по выбранному складу, поэтому перезагружаются при смене.
    React.useEffect(() => {
        if (!orgReady || warehouseId == null) return;
        const controller = new AbortController();
        void loadStock(warehouseId, controller.signal).catch((error) => {
            if (isAbortError(error)) return;
            notify?.({ type: "error", message: "Не удалось загрузить остатки склада" });
        });
        void loadHistory(warehouseId, controller.signal);
        return () => controller.abort();
    }, [loadHistory, loadStock, notify, orgReady, warehouseId]);

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

    // Свои склады сверху: чужие остаются в списке, но не подсовываются первыми.
    const warehouseOptions = React.useMemo(() => {
        const own = (item: DjangoWarehouse) => activeBranchId == null || item.branchId === activeBranchId;
        return [...warehouses].sort((a, b) => {
            if (own(a) !== own(b)) return own(a) ? -1 : 1;
            if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
            return a.name.localeCompare(b.name, "ru");
        });
    }, [activeBranchId, warehouses]);

    const categoryProducts = React.useMemo(
        () => products.filter((product) => selectedCategories.includes(categoryOf(product))),
        [products, selectedCategories],
    );

    const withStockCount = React.useMemo(
        () => categoryProducts.filter((product) => stockOf(product.id) > 0).length,
        [categoryProducts, stockOf],
    );

    // Фильтр «только с остатком» бесполезен, если на складе не лежит ничего из
    // выбранных категорий: документ вышел бы пустым.
    const filterByStock = onlyWithStock && withStockCount > 0;

    const scopeProducts = React.useMemo(
        () => (filterByStock
            ? categoryProducts.filter((product) => stockOf(product.id) > 0)
            : categoryProducts),
        [categoryProducts, filterByStock, stockOf],
    );

    // Сумма — по остатку ВЫБРАННОГО склада, а не по агрегату из карточки товара:
    // иначе экран обещает миллионы, а на этом складе товара нет вовсе.
    const scopeSum = React.useMemo(
        () => scopeProducts.reduce((total, product) => total + product.price * stockOf(product.id), 0),
        [scopeProducts, stockOf],
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
        setCountDocument(null);
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
        // Второй открытый документ на один склад — это два разных факта по одной
        // полке. Предлагаем продолжить старый, а новый открываем только явно.
        const openDoc = history.find(
            (item) => item.status === "counting" && item.warehouseId === warehouseId,
        );
        if (openDoc) {
            const approved = await confirm({
                title: "По складу уже открыт пересчёт",
                message: "Документ №" + openDoc.id + ": посчитано " + openDoc.countedTotal
                    + " из " + openDoc.lineTotal
                    + ". Его можно продолжить кнопкой «Продолжить» в истории ниже — или открыть"
                    + " ещё один документ на этот же склад.",
                confirmText: "Открыть новый документ",
                cancelText: "Не открывать",
                variant: "warning",
            });
            if (!approved) return;
        }
        setBusy(true);
        try {
            const detail = await startWarehouseInventoryCount({
                warehouseId,
                productIds: scopeProducts.map((product) => product.id),
                organizationId: orgId ?? undefined,
            });
            resetSession();
            setCountDocument(detail);
            setRows(buildRows(detail, products, stockOf));
            setStartedAt(Date.now());
            setStep("count");
            void loadHistory(warehouseId);
            notify?.({ type: "success", message: `Документ №${detail.document.id} открыт — можно пикать` });
        } catch (error) {
            notify?.({
                type: "error",
                message: startErrorMessage(
                    error,
                    warehouses.find((item) => item.id === warehouseId),
                    activeBranch?.name ?? null,
                ),
            });
        } finally {
            setBusy(false);
        }
    };

    /** Незакрытый пересчёт: строки уже в документе, факт берём из ответа бэка. */
    const openDocument = async (id: number, target: Step) => {
        setBusy(true);
        try {
            const detail = await getInventoryCountDetail(id, orgId ?? undefined);
            const fresh = buildRows(detail, products, stockOf);
            countedRef.current = new Map(
                fresh.filter((row) => row.counted != null).map((row) => [row.productId, row.counted as number]),
            );
            unknownRef.current = new Map();
            setUnknownScans([]);
            setCountDocument(detail);
            setRows(fresh);
            // Лента «пикнутых» после возврата — по времени подсчёта строки.
            setOrder(
                [...detail.lines]
                    .filter((line) => line.counted != null && line.counted !== "")
                    .sort((a, b) => (b.countedAt ?? "").localeCompare(a.countedAt ?? ""))
                    .map((line) => line.productId),
            );
            setLastScan(null);
            setPicks(0);
            setStartedAt(new Date(detail.document.createdAt).getTime() || Date.now());
            setStep(target);
        } catch (error) {
            notify?.({
                type: "error",
                message: error instanceof ApiError ? error.message : "Не удалось открыть документ",
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
            return [...current, rowFromProduct(product, stockOf(productId), next)];
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
        if (!countDocument || lines.length === 0) return false;
        setBusy(true);
        try {
            const detail = await submitInventoryCountLines(countDocument.document.id, lines, orgId ?? undefined);
            setCountDocument(detail);
            const fresh = buildRows(detail, products, stockOf);
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
        if (!countDocument) return;
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
        if (!countDocument) return;
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
            await closeWarehouseInventoryCount(countDocument.document.id, orgId ?? undefined);
            notify?.({ type: "success", message: "Инвентаризация проведена" });
            resetSession();
            setStep("setup");
            await loadProducts();
            if (warehouseId != null) {
                await loadStock(warehouseId);
                await loadHistory(warehouseId);
            }
        } catch (error) {
            notify?.({
                type: "error",
                message: error instanceof ApiError ? error.message : "Не удалось провести инвентаризацию",
            });
        } finally {
            setBusy(false);
        }
    };

    /** Отменить пересчёт по id: и текущий, и любой открытый из истории. */
    const cancelDocument = async (id: number) => {
        const approved = await confirm({
            title: "Отменить документ?",
            message: "Пересчёт закроется без проведения разниц: остатки склада не изменятся, а посчитанное в документе будет потеряно.",
            confirmText: "Отменить документ",
            variant: "error",
        });
        if (!approved) return;
        setBusy(true);
        try {
            await cancelWarehouseInventoryCount(id, orgId ?? undefined);
            notify?.({ type: "success", message: "Документ №" + id + " отменён" });
            if (countDocument?.document.id === id) {
                resetSession();
                setStep("setup");
            }
            if (warehouseId != null) void loadHistory(warehouseId);
        } catch (error) {
            notify?.({
                type: "error",
                message: error instanceof ApiError ? error.message : "Не удалось отменить документ",
            });
        } finally {
            setBusy(false);
        }
    };

    const handleCancelDocument = () => {
        if (countDocument) void cancelDocument(countDocument.document.id);
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
                : [...current, rowFromProduct(product, stockOf(product.id), scanned)]);
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
        <Box
            sx={{
                // У страницы один владелец вертикальной прокрутки. Если держать
                // overflowY на дочернем блоке, браузер получает конкурирующие
                // scroll-контейнеры из-за фиксированной высоты ThemedLayout.
                height: "100%",
                minHeight: 0,
                width: "100%",
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
                overflowX: "hidden",
                scrollbarGutter: "stable",
                pr: { md: 0.5 },
            }}
        >
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
                    flex: "0 0 auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                })}
            >
                {countDocument && (
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        <Chip
                            size="small"
                            icon={<DescriptionOutlined />}
                            label={`Документ №${countDocument.document.id}`}
                        />
                        <Chip size="small" icon={<StoreOutlined />} label={countDocument.document.warehouseName} />
                        <Chip
                            size="small"
                            label={step === "count" ? "Пересчёт идёт" : "Черновик итогов"}
                            color="primary"
                            variant="outlined"
                        />
                        {countDocument.document.startedByName && (
                            <Chip size="small" label={countDocument.document.startedByName} variant="outlined" />
                        )}
                    </Stack>
                )}

                {busy && <LinearProgress />}

                {step === "setup" && (
                    <InventorySetupCard
                        warehouses={warehouseOptions}
                        activeBranchId={activeBranchId}
                        warehouseId={warehouseId}
                        onWarehouseChange={setWarehouseId}
                        categories={categories}
                        selected={selectedCategories}
                        onToggleCategory={toggleCategory}
                        onToggleAll={toggleAllCategories}
                        scopeCount={scopeProducts.length}
                        scopeWithStock={withStockCount}
                        scopeTotal={categoryProducts.length}
                        onlyWithStock={filterByStock}
                        onToggleOnlyWithStock={() => setOnlyWithStock((current) => !current)}
                        stockFilterAvailable={withStockCount > 0}
                        scopeSum={scopeSum}
                        responsibleName={activeEmployee?.fullName ?? "—"}
                        disabled={busy || !canManage}
                    />
                )}

                {step === "setup" && (
                    <InventoryHistoryCard
                        items={history}
                        loading={historyLoading}
                        onContinue={(id) => void openDocument(id, "count")}
                        onOpen={(id) => void openDocument(id, "result")}
                        onCancel={(id) => void cancelDocument(id)}
                        onRefresh={warehouseId == null ? undefined : () => void loadHistory(warehouseId)}
                        disabled={busy}
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
