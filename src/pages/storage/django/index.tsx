import React from "react";
import {
    Box,
    useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";

import { PageHeader, AppBottomSheet } from "../../../components/ui";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { useFocusRefetch } from "../../../hooks/useFocusRefetch";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { ApiError, isAbortError } from "../../../api/client";
import {
    getWarehouses,
    getStock,
    getStockMovements,
    createStockMovement,
    updateStockMovement,
    getProducts,
    DjangoStockItem,
    DjangoStockMovement,
    DjangoWarehouse,
} from "../../../api/warehouse";

// Components
import { DjangoStockList } from "../../../components/storage/django/DjangoStockList";
import { DjangoStockDetails } from "../../../components/storage/django/DjangoStockDetails";
import {
    DjangoAddMovementDrawer,
    type MovementProductOption,
} from "../../../components/storage/django/DjangoAddMovementDrawer";

const DjangoStoragePage: React.FC = () => {
    usePageTitle("Движение товара");
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const { open: notify } = useNotification();
    const canView = useCan("warehouse.view");
    const canManage = useCan("warehouse.manage");
    const { loading: permLoading, activeBranch } = usePermissions();

    // State
    const [warehouses, setWarehouses] = React.useState<DjangoWarehouse[]>([]);
    const [stock, setStock] = React.useState<DjangoStockItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState("");

    const [selectedItem, setSelectedItem] = React.useState<DjangoStockItem | null>(null);

    // Details State
    const [movements, setMovements] = React.useState<DjangoStockMovement[]>([]);
    const [loadingMovements, setLoadingMovements] = React.useState(false);

    // Drawer State
    const [drawerOpen, setDrawerOpen] = React.useState(false);
    const [drawerMode, setDrawerMode] = React.useState<"in" | "out">("in");
    const [editingMovement, setEditingMovement] = React.useState<DjangoStockMovement | null>(null);

    // All Products for Selector
    const [availableProducts, setAvailableProducts] = React.useState<MovementProductOption[]>([]);

    // Fetch Inventory (все видимые склады контекста).
    // Отменяем предыдущий запрос: быстрые повторные вызовы не должны
    // позволить старому ответу перетереть свежие данные.
    const inventoryAbortRef = React.useRef<AbortController | null>(null);
    const fetchInventory = React.useCallback(async () => {
        inventoryAbortRef.current?.abort();
        const controller = new AbortController();
        inventoryAbortRef.current = controller;
        try {
            setLoading(true);
            const data = await getStock(undefined, controller.signal);
            setStock(data);
            return data;
        } catch (e) {
            if (isAbortError(e)) return [];
            console.error(e);
            notify?.({ type: "error", message: "Ошибка загрузки склада" });
            return [];
        } finally {
            if (inventoryAbortRef.current === controller) setLoading(false);
        }
    }, [notify]);

    // Fetch Products for dropdown
    const fetchProductsForSelector = React.useCallback(async () => {
        try {
            const prods = await getProducts();
            setAvailableProducts(prods.map((p) => ({ id: p.id, label: p.name })));
        } catch (e) {
            if (isAbortError(e)) return;
            console.error("Failed to load products for selector", e);
        }
    }, []);

    // Видимые склады — для выбора склада при приходе нового товара.
    const fetchWarehouses = React.useCallback(async () => {
        try {
            setWarehouses(await getWarehouses());
        } catch (e) {
            if (isAbortError(e)) return;
            console.error("Failed to load warehouses", e);
        }
    }, []);

    React.useEffect(() => {
        if (!permLoading && canView) {
            fetchInventory();
            fetchProductsForSelector();
            fetchWarehouses();
        }
    }, [permLoading, canView, fetchInventory, fetchProductsForSelector, fetchWarehouses]);

    // Обновление при возврате фокуса — изменения коллег подтянутся без F5.
    useFocusRefetch(() => {
        if (!permLoading && canView) {
            fetchInventory();
            fetchProductsForSelector();
            fetchWarehouses();
        }
    });

    // Fetch Movements when Item Selected
    React.useEffect(() => {
        if (selectedItem) {
            const controller = new AbortController();
            const loadMovements = async () => {
                try {
                    setLoadingMovements(true);
                    const data = await getStockMovements({
                        productId: selectedItem.productId,
                        warehouseId: selectedItem.warehouseId,
                    }, controller.signal);
                    setMovements(data);
                } catch (e) {
                    if (isAbortError(e)) return;
                    console.error(e);
                } finally {
                    if (!controller.signal.aborted) setLoadingMovements(false);
                }
            };
            loadMovements();
            return () => controller.abort();
        }
        setMovements([]);
        return undefined;
    }, [selectedItem]);

    // Auto-select first item on desktop
    React.useEffect(() => {
        if (!isMobile && stock.length > 0 && !selectedItem && !drawerOpen) {
            setSelectedItem(stock[0]);
        }
    }, [isMobile, stock, selectedItem, drawerOpen]);

    // Actions
    const handleOpenDrawer = (mode: "in" | "out") => {
        setEditingMovement(null);
        setDrawerMode(mode);
        setDrawerOpen(true);
    };

    const handleAddClick = () => {
        // Clear selection to trigger "New Item" mode in Drawer
        setSelectedItem(null);
        setEditingMovement(null);
        handleOpenDrawer("in");
    };

    const handleEditMovement = (movement: DjangoStockMovement) => {
        setEditingMovement(movement);
        setDrawerMode("in");
        setDrawerOpen(true);
    };

    const handleCloseDrawer = () => {
        setDrawerOpen(false);
        setEditingMovement(null);
    };

    const handleConfirmMovement = async (
        qty: number,
        comment?: string,
        selectedProd?: MovementProductOption | null,
        amount?: number,
        paymentMethod?: "cash" | "cashless",
        warehouseIdFromDrawer?: number,
    ) => {
        const targetProductId = editingMovement?.productId ?? selectedItem?.productId ?? selectedProd?.id ?? undefined;
        const newProductName = !targetProductId && selectedProd?.id === null ? selectedProd.label : undefined;
        if (!targetProductId && !newProductName) return;

        // Склад: у существующей позиции — её склад; у нового товара — явный
        // выбор в дровере (никаких «первых попавшихся» складов организации).
        const warehouseId = editingMovement?.warehouseId
            || selectedItem?.warehouseId
            || warehouseIdFromDrawer;

        if (!warehouseId) {
            notify?.({
                type: "error",
                message: warehouses.length === 0
                    ? "Сначала создайте склад в разделе «Склад»"
                    : "Выберите склад",
            });
            return;
        }

        try {
            if (editingMovement) {
                await updateStockMovement(editingMovement.id, {
                    quantity: qty,
                    totalCost: amount,
                    comment,
                    paymentMethod: paymentMethod ?? "cash",
                });
            } else {
                await createStockMovement({
                    warehouseId,
                    productId: targetProductId ?? undefined,
                    newProductName,
                    quantity: qty,
                    moveType: drawerMode === "out" ? "consumption" : "receipt",
                    totalCost: amount,
                    comment,
                    paymentMethod,
                });
            }

            notify?.({ type: "success", message: editingMovement ? "Приход обновлен" : "Успешно" });

            // Refresh
            const data = await fetchInventory();
            const updated = data?.find((i) =>
                i.warehouseId === warehouseId && (
                    targetProductId
                        ? i.productId === targetProductId
                        : i.productName.toLowerCase() === (newProductName || "").toLowerCase()
                ),
            );
            if (updated) {
                setSelectedItem(updated);
                const updatedMovements = await getStockMovements({
                    productId: updated.productId,
                    warehouseId,
                });
                setMovements(updatedMovements);
            }
            if (newProductName) {
                fetchProductsForSelector();
            }
            setEditingMovement(null);
        } catch (e) {
            console.error(e);
            const message = e instanceof ApiError ? e.message : "Ошибка сохранения";
            notify?.({ type: "error", message });
            throw e;
        }
    };

    // Filtered list
    const filteredStock = React.useMemo(() => {
        if (!searchQuery) return stock;
        const q = searchQuery.toLowerCase();
        return stock.filter((i) =>
            i.productName?.toLowerCase().includes(q) ||
            i.productBarcode?.includes(q),
        );
    }, [stock, searchQuery]);

    // Опции склада для дровера: подключённые склады помечаем филиалом.
    const warehouseOptions = React.useMemo(
        () => warehouses.map((w) => ({
            id: w.id,
            label: w.isLinked ? `${w.name} — филиал: ${w.branchName}` : w.name,
        })),
        [warehouses],
    );

    // Дефолт: основной склад активного филиала. В org-wide режиме дефолта
    // нет — пользователь выбирает склад явно.
    const defaultWarehouseId = React.useMemo(() => {
        if (!activeBranch) return null;
        const primary = warehouses.find((w) => w.isPrimary && !w.isLinked)
            || warehouses.find((w) => !w.isLinked)
            || warehouses[0];
        return primary?.id ?? null;
    }, [warehouses, activeBranch]);

    if (!permLoading && !canView) return <AccessDenied />;

    return (
        <Box
            sx={(theme) => ({
                height: {
                    xs: `calc(100dvh - ${theme.appLayout.header.height.mobile}px)`,
                    md: `calc(100dvh - ${theme.appLayout.header.height.desktop}px)`,
                },
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            })}
        >
            <PageHeader
                title="Движение товара"
                showTitle={false}
                showSearch
                searchVal={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Поиск товара..."
                onAdd={canManage ? handleAddClick : undefined}
                addButtonText="Добавить товар"
            />

            <Box sx={{ px: 2, pb: 2, pt: 1, flex: 1, minHeight: 0 }}>
                <Box sx={{ display: "flex", gap: 2, height: "100%" }}>
                    {/* List */}
                    <Box sx={{ flex: isMobile ? "1 1 100%" : "0 0 41.66%", minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
                        <DjangoStockList
                            stock={filteredStock}
                            selectedItem={selectedItem}
                            onSelect={setSelectedItem}
                            loading={loading}
                            onAdd={canManage ? handleAddClick : undefined}
                        />
                    </Box>

                    {/* Details Desktop */}
                    {!isMobile && (
                        <Box sx={{ flex: "1 1 0", minWidth: 0, height: "100%" }}>
                            <DjangoStockDetails
                                item={selectedItem}
                                movements={movements}
                                loadingMovements={loadingMovements}
                                onAddStock={() => handleOpenDrawer("in")}
                                onRemoveStock={() => handleOpenDrawer("out")}
                                onEditMovement={handleEditMovement}
                                canManage={canManage}
                            />
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Drawers */}
            <DjangoAddMovementDrawer
                open={drawerOpen}
                onClose={handleCloseDrawer}
                product={selectedItem}
                mode={drawerMode}
                onConfirm={handleConfirmMovement}
                availableProducts={availableProducts}
                editingMovement={editingMovement}
                warehouses={warehouseOptions}
                defaultWarehouseId={defaultWarehouseId}
            />

            {/* Mobile Sheet */}
            {isMobile && (
                <AppBottomSheet
                    open={!!selectedItem}
                    onClose={() => setSelectedItem(null)}
                >
                    {selectedItem && (
                        <Box sx={{ p: 2 }}>
                            <DjangoStockDetails
                                item={selectedItem}
                                movements={movements}
                                loadingMovements={loadingMovements}
                                onAddStock={() => handleOpenDrawer("in")}
                                onRemoveStock={() => handleOpenDrawer("out")}
                                onEditMovement={handleEditMovement}
                                canManage={canManage}
                            />
                        </Box>
                    )}
                </AppBottomSheet>
            )}

        </Box>
    );
};

export default DjangoStoragePage;
