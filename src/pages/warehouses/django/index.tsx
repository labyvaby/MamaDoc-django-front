import React from "react";
import {
    Box,
    Grid2,
    useMediaQuery,
    Drawer,
    Typography,
    IconButton,
    Divider,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import CloseIcon from "@mui/icons-material/Close";

import { PageHeader } from "../../../components/ui";
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
    unlinkWarehouse,
    DjangoWarehouse,
    DjangoStockItem,
    DjangoStockMovement,
} from "../../../api/warehouse";

// Components
import { DjangoStockList } from "../../../components/storage/django/DjangoStockList";
import { DjangoStockDetails } from "../../../components/storage/django/DjangoStockDetails";
import {
    DjangoAddMovementDrawer,
    type MovementProductOption,
} from "../../../components/storage/django/DjangoAddMovementDrawer";
import { DjangoWarehouseList } from "../../../components/storage/django/DjangoWarehouseList";
import { DjangoAddWarehouseDrawer } from "../../../components/storage/django/DjangoAddWarehouseDrawer";

const DjangoWarehousesPage: React.FC = () => {
    usePageTitle("Склад");
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const { open: notify } = useNotification();
    const canView = useCan("warehouse.view");
    const canManage = useCan("warehouse.manage");
    const { activeBranch, loading: permLoading } = usePermissions();
    const activeBranchId = activeBranch?.id ?? null;

    // Data State
    const [warehouses, setWarehouses] = React.useState<DjangoWarehouse[]>([]);
    const [selectedWarehouseId, setSelectedWarehouseId] = React.useState<number | null>(null);
    const [stock, setStock] = React.useState<DjangoStockItem[]>([]);
    const [loadingStock, setLoadingStock] = React.useState(false);
    const [loadingWarehouses, setLoadingWarehouses] = React.useState(true);

    // Filter
    const [searchQuery, setSearchQuery] = React.useState("");

    // Details / Selection
    const [selectedItem, setSelectedItem] = React.useState<DjangoStockItem | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);

    // Movement History State (for Details)
    const [movements, setMovements] = React.useState<DjangoStockMovement[]>([]);
    const [loadingMovements, setLoadingMovements] = React.useState(false);

    // Drawers State
    const [movementDrawerOpen, setMovementDrawerOpen] = React.useState(false);
    const [movementMode, setMovementMode] = React.useState<"in" | "out">("in");
    const [editingMovement, setEditingMovement] = React.useState<DjangoStockMovement | null>(null);

    const [warehouseDrawerOpen, setWarehouseDrawerOpen] = React.useState(false);
    const [editingWarehouse, setEditingWarehouse] = React.useState<DjangoWarehouse | null>(null);

    // All Products for Selector (for adding new items)
    const [availableProducts, setAvailableProducts] = React.useState<MovementProductOption[]>([]);

    // 1. Fetch Warehouses & Products
    const loadInitialData = React.useCallback(async () => {
        if (!canView) return;
        try {
            setLoadingWarehouses(true);
            const [ws, prods] = await Promise.all([
                getWarehouses(),
                getProducts(),
            ]);
            setWarehouses(ws);
            setAvailableProducts(prods.map((p) => ({ id: p.id, label: p.name })));

            setSelectedWarehouseId((prev) => {
                if (prev !== null && ws.some((w) => w.id === prev)) return prev;
                const primary = ws.find((w) => w.isPrimary && !w.isLinked) || ws[0];
                return primary ? primary.id : null;
            });
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка загрузки данных" });
        } finally {
            setLoadingWarehouses(false);
        }
    }, [notify, canView]);

    React.useEffect(() => {
        if (!permLoading && canView) {
            loadInitialData();
        }
    }, [permLoading, canView, loadInitialData]);

    // 2. Fetch Stock when Warehouse changes.
    // Отмена предыдущего запроса: при быстром перещёлкивании складов
    // старый ответ не должен перетереть данные нового склада.
    const stockAbortRef = React.useRef<AbortController | null>(null);
    const fetchStock = React.useCallback(async () => {
        stockAbortRef.current?.abort();
        if (!selectedWarehouseId) {
            setStock([]);
            return [];
        }
        const controller = new AbortController();
        stockAbortRef.current = controller;
        try {
            setLoadingStock(true);
            const data = await getStock(selectedWarehouseId, controller.signal);
            setStock(data);
            return data;
        } catch (e) {
            if (isAbortError(e)) return [];
            console.error(e);
            notify?.({ type: "error", message: "Ошибка загрузки остатков" });
            return [];
        } finally {
            if (stockAbortRef.current === controller) setLoadingStock(false);
        }
    }, [selectedWarehouseId, notify]);

    React.useEffect(() => {
        fetchStock();
    }, [fetchStock]);

    // Обновление при возврате фокуса — изменения коллег подтянутся без F5.
    useFocusRefetch(() => {
        if (!permLoading && canView) {
            loadInitialData();
            fetchStock();
        }
    });

    // 3. Fetch Movements when Item Selected (for Details)
    React.useEffect(() => {
        if (selectedItem && isDetailsOpen) {
            const controller = new AbortController();
            const loadMoves = async () => {
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
            loadMoves();
            return () => controller.abort();
        }
        return undefined;
    }, [selectedItem, isDetailsOpen]);

    // Handlers
    const handleAddWarehouse = () => {
        setEditingWarehouse(null);
        setWarehouseDrawerOpen(true);
    };

    const handleEditWarehouse = (w: DjangoWarehouse) => {
        setEditingWarehouse(w);
        setWarehouseDrawerOpen(true);
    };

    const handleUnlinkWarehouse = async (w: DjangoWarehouse) => {
        try {
            await unlinkWarehouse(w.id);
            notify?.({ type: "success", message: `Склад «${w.name}» отключен` });
            if (selectedWarehouseId === w.id) {
                setSelectedWarehouseId(null);
                setSelectedItem(null);
            }
            loadInitialData();
        } catch (e) {
            console.error(e);
            const message = e instanceof ApiError ? e.message : "Ошибка отключения";
            notify?.({ type: "error", message });
        }
    };

    const handleStockClick = (item: DjangoStockItem) => {
        setSelectedItem(item);
        setIsDetailsOpen(true);
    };

    const handleAddMovementClick = (mode: "in" | "out") => {
        setEditingMovement(null);
        setMovementMode(mode);
        setMovementDrawerOpen(true);
    };

    const handleGlobalAddStock = () => {
        setSelectedItem(null); // Adding raw new item
        setEditingMovement(null);
        setMovementMode("in");
        setMovementDrawerOpen(true);
    };

    const handleEditMovement = (movement: DjangoStockMovement) => {
        setEditingMovement(movement);
        setMovementMode("in");
        setMovementDrawerOpen(true);
    };

    const handleCloseMovementDrawer = () => {
        setMovementDrawerOpen(false);
        setEditingMovement(null);
    };

    const handleConfirmMovement = async (
        qty: number,
        comment?: string,
        selectedProd?: MovementProductOption | null,
        amount?: number,
        paymentMethod?: "cash" | "cashless",
    ) => {
        const wId = editingMovement?.warehouseId || selectedItem?.warehouseId || selectedWarehouseId;
        if (!wId) {
            notify?.({ type: "error", message: "Склад не выбран" });
            return;
        }

        const targetProductId = editingMovement?.productId ?? selectedItem?.productId ?? selectedProd?.id ?? undefined;
        const newProductName = !targetProductId && selectedProd?.id === null ? selectedProd.label : undefined;
        if (!targetProductId && !newProductName) return;

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
                    warehouseId: wId,
                    productId: targetProductId ?? undefined,
                    newProductName,
                    quantity: qty,
                    moveType: movementMode === "out" ? "consumption" : "receipt",
                    totalCost: amount,
                    comment,
                    paymentMethod,
                });
            }

            notify?.({ type: "success", message: editingMovement ? "Приход обновлен" : "Успешно" });

            // Refresh
            const data = await fetchStock();
            const updated = data?.find((i) =>
                targetProductId
                    ? i.productId === targetProductId
                    : i.productName.toLowerCase() === (newProductName || "").toLowerCase(),
            );
            if (updated) {
                setSelectedItem(updated);
            }

            if (isDetailsOpen || editingMovement) {
                const refreshProductId = updated?.productId ?? targetProductId;
                if (refreshProductId) {
                    const moves = await getStockMovements({
                        productId: refreshProductId,
                        warehouseId: wId,
                    });
                    setMovements(moves);
                }
            }
            // Новый товар мог появиться — обновим список для автокомплита.
            if (newProductName) {
                getProducts()
                    .then((prods) => setAvailableProducts(prods.map((p) => ({ id: p.id, label: p.name }))))
                    .catch(() => undefined);
            }
            setEditingMovement(null);
        } catch (e) {
            console.error(e);
            const message = e instanceof ApiError ? e.message : "Ошибка сохранения";
            notify?.({ type: "error", message });
            throw e;
        }
    };

    // Post-Fetch stock update selected item quantity if open
    React.useEffect(() => {
        if (selectedItem && stock.length > 0) {
            const updated = stock.find((s) => s.productId === selectedItem.productId);
            if (updated) setSelectedItem(updated);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stock]);

    // Filter
    const filteredStock = React.useMemo(() => {
        if (!searchQuery) return stock;
        const q = searchQuery.toLowerCase();
        return stock.filter((i) =>
            i.productName?.toLowerCase().includes(q) ||
            i.productBarcode?.includes(q),
        );
    }, [stock, searchQuery]);

    if (!permLoading && !canView) return <AccessDenied />;

    const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId);
    const detailsWarehouse = warehouses.find((w) => w.id === selectedItem?.warehouseId);

    return (
        <Box
            sx={{
                height: { xs: "calc(100dvh - 56px)", md: "calc(100dvh - 64px)" },
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                overflow: "hidden",
            }}
        >
            <PageHeader
                title="Склад"
                showTitle={false}
                showSearch
                searchVal={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Поиск товара..."
                onAdd={canManage ? handleGlobalAddStock : undefined}
                addButtonText="Приход товара"
            />

            <Box
                sx={(theme) => ({
                    px: theme.appLayout.page.paddingX,
                    pb: theme.appLayout.page.paddingY,
                    flex: 1,
                    minHeight: 0,
                    overflowY: { xs: "auto", md: "hidden" },
                    overflowX: "hidden",
                })}
            >
                <Grid2
                    container
                    spacing={2}
                    sx={{
                        minHeight: 0,
                        height: { xs: "auto", md: "100%" },
                        alignItems: "stretch",
                    }}
                >

                    {/* Left: Warehouses */}
                    <Grid2
                        size={{ xs: 12, md: 2.5 }}
                        sx={(theme: Theme) => ({
                            position: { md: "sticky" },
                            top: { md: theme.spacing(2) },
                            alignSelf: "flex-start",
                            minHeight: 0,
                            height: {
                                xs: "auto",
                                md: "100%",
                            },
                            display: "flex",
                            flexDirection: "column",
                            overflow: { xs: "visible", md: "hidden" },
                        })}
                    >
                        <DjangoWarehouseList
                            warehouses={warehouses}
                            selectedId={selectedWarehouseId}
                            onSelect={setSelectedWarehouseId}
                            onAdd={handleAddWarehouse}
                            onEdit={handleEditWarehouse}
                            onUnlink={handleUnlinkWarehouse}
                            loading={loadingWarehouses}
                            canManage={canManage}
                        />
                    </Grid2>

                    {/* Center: Stocks List */}
                    <Grid2
                        size={{ xs: 12, md: 4.5 }}
                        sx={(theme: Theme) => ({
                            position: { md: "sticky" },
                            top: { md: theme.spacing(2) },
                            alignSelf: "flex-start",
                            minHeight: 0,
                            height: {
                                xs: "auto",
                                md: "100%",
                            },
                            display: "flex",
                            flexDirection: "column",
                            overflow: { xs: "visible", md: "hidden" },
                        })}
                    >
                        <DjangoStockList
                            stock={filteredStock}
                            selectedItem={selectedItem}
                            onSelect={handleStockClick}
                            loading={loadingStock}
                            warehouseName={selectedWarehouse?.name}
                            warehouseAddress={selectedWarehouse?.address}
                        />
                    </Grid2>

                    {/* Right: Stock Details (Desktop only) */}
                    {!isMobile && (
                        <Grid2
                            size={{ xs: 12, md: 5 }}
                            sx={(theme: Theme) => ({
                                position: { md: "sticky" },
                                top: { md: theme.spacing(2) },
                                alignSelf: "flex-start",
                                minHeight: 0,
                                height: {
                                    xs: "auto",
                                    md: "100%",
                                },
                                display: "flex",
                                flexDirection: "column",
                                overflow: { xs: "visible", md: "hidden" },
                            })}
                        >
                            <DjangoStockDetails
                                item={selectedItem}
                                movements={movements}
                                loadingMovements={loadingMovements}
                                onAddStock={() => handleAddMovementClick("in")}
                                onRemoveStock={() => handleAddMovementClick("out")}
                                warehouseName={detailsWarehouse?.name}
                                warehouseAddress={detailsWarehouse?.address}
                                onEditMovement={handleEditMovement}
                                canManage={canManage}
                            />
                        </Grid2>
                    )}
                </Grid2>
            </Box>

            {/* Warehouse Management Drawer */}
            <DjangoAddWarehouseDrawer
                open={warehouseDrawerOpen}
                onClose={() => setWarehouseDrawerOpen(false)}
                onSuccess={loadInitialData}
                editItem={editingWarehouse}
                activeBranchId={activeBranchId}
            />

            {/* Add/Remove Movement Drawer */}
            <DjangoAddMovementDrawer
                open={movementDrawerOpen}
                onClose={handleCloseMovementDrawer}
                product={selectedItem}
                mode={movementMode}
                onConfirm={handleConfirmMovement}
                availableProducts={availableProducts}
                editingMovement={editingMovement}
            />

            {/* Stock Details Drawer (Mobile only) */}
            {isMobile && (
                <Drawer
                    anchor="right"
                    open={isDetailsOpen}
                    onClose={() => setIsDetailsOpen(false)}
                    PaperProps={{ sx: { width: { xs: "100%", sm: 500 }, maxWidth: "100%" } }}
                >
                    <Box sx={{ p: 0, height: "100%" }}>
                        <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <Typography variant="h6">Детали товара</Typography>
                            <IconButton onClick={() => setIsDetailsOpen(false)}><CloseIcon /></IconButton>
                        </Box>
                        <Divider />
                        <Box sx={{ p: 2, height: "calc(100% - 60px)" }}>
                            <DjangoStockDetails
                                item={selectedItem}
                                movements={movements}
                                loadingMovements={loadingMovements}
                                onAddStock={() => handleAddMovementClick("in")}
                                onRemoveStock={() => handleAddMovementClick("out")}
                                warehouseName={detailsWarehouse?.name}
                                warehouseAddress={detailsWarehouse?.address}
                                onEditMovement={handleEditMovement}
                                canManage={canManage}
                            />
                        </Box>
                    </Box>
                </Drawer>
            )}
        </Box>
    );
};

export default DjangoWarehousesPage;
