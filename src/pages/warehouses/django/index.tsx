import React from "react";
import {
    Box,
    Grid2,
    useMediaQuery,
    Drawer,
    Typography,
    IconButton,
    Divider,
    Paper,
    Stack,
    TextField,
    MenuItem,
    Button,
    Tooltip,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import { useNotification } from "@refinedev/core";

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
    createTransfer,
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
    type MovementWarehouseOption,
} from "../../../components/storage/django/DjangoAddMovementDrawer";
import { DjangoTransferDrawer } from "../../../components/storage/django/DjangoTransferDrawer";
import { DjangoWarehouseList } from "../../../components/storage/django/DjangoWarehouseList";
import { DjangoAddWarehouseDrawer } from "../../../components/storage/django/DjangoAddWarehouseDrawer";

/**
 * Страница «Остатки» — объединяет бывшие «Склад» и «Движение товара»:
 * переключатель склада сверху, остатки + история движений (master-detail),
 * управление складами в выезжающей панели, действия Приход/Списание/Перемещение.
 */
const DjangoWarehousesPage: React.FC = () => {
    usePageTitle("Остатки");
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
    // Панель управления складами (список + CRUD)
    const [manageOpen, setManageOpen] = React.useState(false);
    // Перемещение между складами
    const [transferOpen, setTransferOpen] = React.useState(false);

    // All Products for Selector (for adding new items)
    const [availableProducts, setAvailableProducts] = React.useState<MovementProductOption[]>([]);

    // 1. Fetch Warehouses & Products
    const loadInitialData = React.useCallback(async () => {
        if (!canView) return;
        try {
            setLoadingWarehouses(true);
            const [ws, prods] = await Promise.all([getWarehouses(), getProducts()]);
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
        if (!permLoading && canView) loadInitialData();
    }, [permLoading, canView, loadInitialData]);

    // 2. Fetch Stock when Warehouse changes (с отменой предыдущего запроса).
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

    useFocusRefetch(() => {
        if (!permLoading && canView) {
            loadInitialData();
            fetchStock();
        }
    });

    // 3. Fetch Movements when Item Selected
    React.useEffect(() => {
        if (selectedItem && (isDetailsOpen || !isMobile)) {
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
    }, [selectedItem, isDetailsOpen, isMobile]);

    // Auto-select first item on desktop
    React.useEffect(() => {
        if (!isMobile && stock.length > 0 && !selectedItem) setSelectedItem(stock[0]);
    }, [isMobile, stock, selectedItem]);

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
        if (isMobile) setIsDetailsOpen(true);
    };

    const handleAddMovementClick = (mode: "in" | "out") => {
        setEditingMovement(null);
        setMovementMode(mode);
        setMovementDrawerOpen(true);
    };
    const handleGlobalAddStock = () => {
        setSelectedItem(null);
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

            const data = await fetchStock();
            const updated = data?.find((i) =>
                targetProductId
                    ? i.productId === targetProductId
                    : i.productName.toLowerCase() === (newProductName || "").toLowerCase(),
            );
            if (updated) setSelectedItem(updated);

            const refreshProductId = updated?.productId ?? targetProductId;
            if (refreshProductId) {
                const moves = await getStockMovements({ productId: refreshProductId, warehouseId: wId });
                setMovements(moves);
            }
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

    const handleConfirmTransfer = async (
        toWarehouseId: number,
        qty: number,
        comment?: string,
    ) => {
        if (!selectedItem) return;
        try {
            await createTransfer({
                productId: selectedItem.productId,
                fromWarehouseId: selectedItem.warehouseId,
                toWarehouseId,
                quantity: qty,
                comment,
            });
            notify?.({ type: "success", message: "Товар перемещён" });

            // Остаток текущего склада уменьшился — обновляем список и движения.
            const data = await fetchStock();
            const updated = data?.find((i) => i.productId === selectedItem.productId);
            setSelectedItem(updated ?? null);
            if (updated) {
                const moves = await getStockMovements({
                    productId: updated.productId,
                    warehouseId: updated.warehouseId,
                });
                setMovements(moves);
            }
        } catch (e) {
            console.error(e);
            const message = e instanceof ApiError ? e.message : "Не удалось выполнить перемещение";
            notify?.({ type: "error", message });
            throw e;
        }
    };

    // Опции складов для дровера перемещения.
    const warehouseOptions = React.useMemo<MovementWarehouseOption[]>(
        () => warehouses.map((w) => ({
            id: w.id,
            label: w.isLinked ? `${w.name} — филиал: ${w.branchName}` : w.name,
        })),
        [warehouses],
    );

    // Синхронизация выбранной позиции со свежим остатком
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
            i.productName?.toLowerCase().includes(q) || i.productBarcode?.includes(q),
        );
    }, [stock, searchQuery]);

    if (!permLoading && !canView) return <AccessDenied />;

    const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId);
    const detailsWarehouse = warehouses.find((w) => w.id === selectedItem?.warehouseId);
    const showDetailColumn = !isMobile;

    const warehouseLabel = (w: DjangoWarehouse) =>
        `${w.name}${w.isLinked ? ` — филиал: ${w.branchName}` : ""}${w.isPrimary && !w.isLinked ? " • основной" : ""}`;

    return (
        <Box
            sx={(t) => ({
                height: {
                    xs: `calc(100dvh - ${t.appLayout.header.height.mobile}px)`,
                    md: `calc(100dvh - ${t.appLayout.header.height.desktop}px)`,
                },
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                overflow: "hidden",
            })}
        >
            <PageHeader
                title="Остатки"
                showTitle={false}
                showSearch
                searchVal={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Поиск товара..."
                onAdd={canManage ? handleGlobalAddStock : undefined}
                addButtonText="Приход"
            />

            <Box
                sx={(t) => ({
                    px: t.appLayout.page.paddingX,
                    pb: t.appLayout.page.paddingY,
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    overflow: { xs: "auto", md: "hidden" },
                })}
            >
                {/* Верхняя панель: переключатель склада + действия */}
                <Paper variant="outlined" elevation={0} sx={{ p: 1.5 }}>
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.5}
                        useFlexGap
                        flexWrap="wrap"
                        alignItems={{ xs: "stretch", sm: "center" }}
                    >
                        <TextField
                            select
                            size="small"
                            label="Склад"
                            value={selectedWarehouseId ?? ""}
                            onChange={(e) => {
                                setSelectedWarehouseId(Number(e.target.value) || null);
                                setSelectedItem(null);
                            }}
                            sx={{ width: { xs: "100%", sm: 240 } }}
                            disabled={warehouses.length === 0}
                        >
                            {warehouses.length === 0 && (
                                <MenuItem value="">Складов пока нет</MenuItem>
                            )}
                            {warehouses.map((w) => (
                                <MenuItem key={w.id} value={w.id}>
                                    {warehouseLabel(w)}
                                </MenuItem>
                            ))}
                        </TextField>

                        {/* Действия: на мобиле — своя строка кнопок, тянутся по ширине */}
                        <Stack
                            direction="row"
                            spacing={1}
                            sx={{ width: { xs: "100%", sm: "auto" }, flexGrow: { sm: 1 }, justifyContent: { sm: "flex-end" } }}
                        >
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<StoreOutlined />}
                                onClick={() => setManageOpen(true)}
                                sx={{ textTransform: "none", flex: { xs: 1, sm: "0 0 auto" } }}
                            >
                                Склады ({warehouses.length})
                            </Button>

                            {canManage && (
                                <Tooltip
                                    title={
                                        !selectedItem
                                            ? "Выберите позицию в списке"
                                            : selectedItem.quantity <= 0
                                                ? "Нет остатка для перемещения"
                                                : "Переместить на другой склад"
                                    }
                                >
                                    <Box
                                        component="span"
                                        sx={{ flex: { xs: 1, sm: "0 0 auto" }, display: "inline-flex" }}
                                    >
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={<SwapHorizOutlined />}
                                            disabled={!selectedItem || selectedItem.quantity <= 0 || warehouses.length < 2}
                                            onClick={() => setTransferOpen(true)}
                                            sx={{ textTransform: "none", width: { xs: "100%", sm: "auto" } }}
                                        >
                                            Перемещение
                                        </Button>
                                    </Box>
                                </Tooltip>
                            )}
                        </Stack>
                    </Stack>
                </Paper>

                {/* master-detail: остатки + история движений */}
                <Grid2 container spacing={2} sx={{ flex: { md: 1 }, minHeight: 0, height: { xs: "auto", md: "100%" } }}>
                    <Grid2
                        size={{ xs: 12, md: showDetailColumn ? 5 : 12 }}
                        sx={{
                            height: { xs: "auto", md: "100%" },
                            display: "flex",
                            flexDirection: "column",
                            overflow: { xs: "visible", md: "hidden" },
                        }}
                    >
                        <DjangoStockList
                            stock={filteredStock}
                            selectedItem={selectedItem}
                            onSelect={handleStockClick}
                            loading={loadingStock}
                            warehouseName={selectedWarehouse?.name}
                            warehouseAddress={selectedWarehouse?.address}
                            onAdd={canManage ? handleGlobalAddStock : undefined}
                        />
                    </Grid2>

                    {showDetailColumn && (
                        <Grid2
                            size={{ xs: 12, md: 7 }}
                            sx={{
                                height: { md: "100%" },
                                display: "flex",
                                flexDirection: "column",
                                overflow: { xs: "visible", md: "hidden" },
                            }}
                        >
                            <DjangoStockDetails
                                item={selectedItem}
                                movements={movements}
                                loadingMovements={loadingMovements}
                                onAddStock={() => handleAddMovementClick("in")}
                                onRemoveStock={() => handleAddMovementClick("out")}
                                onTransfer={canManage && warehouses.length >= 2 ? () => setTransferOpen(true) : undefined}
                                warehouseName={detailsWarehouse?.name}
                                warehouseAddress={detailsWarehouse?.address}
                                onEditMovement={handleEditMovement}
                                canManage={canManage}
                            />
                        </Grid2>
                    )}
                </Grid2>
            </Box>

            {/* Панель управления складами (список + CRUD) */}
            <Drawer
                anchor="right"
                open={manageOpen}
                onClose={() => setManageOpen(false)}
                PaperProps={{ sx: { width: { xs: "100%", sm: 380 }, maxWidth: "100%" } }}
            >
                <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="h6">Склады</Typography>
                    <IconButton onClick={() => setManageOpen(false)}><CloseIcon /></IconButton>
                </Box>
                <Divider />
                <Box sx={{ p: 2, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <DjangoWarehouseList
                        warehouses={warehouses}
                        selectedId={selectedWarehouseId}
                        onSelect={(id) => {
                            setSelectedWarehouseId(id);
                            setSelectedItem(null);
                            setManageOpen(false);
                        }}
                        onAdd={handleAddWarehouse}
                        onEdit={handleEditWarehouse}
                        onUnlink={handleUnlinkWarehouse}
                        loading={loadingWarehouses}
                        canManage={canManage}
                    />
                </Box>
            </Drawer>

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

            {/* Перемещение между складами */}
            <DjangoTransferDrawer
                open={transferOpen}
                onClose={() => setTransferOpen(false)}
                item={selectedItem}
                warehouses={warehouseOptions}
                onConfirm={handleConfirmTransfer}
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
                                onTransfer={canManage && warehouses.length >= 2 ? () => setTransferOpen(true) : undefined}
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
