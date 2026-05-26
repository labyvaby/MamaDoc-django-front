
import React from "react";
import {
    Box,
    useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import { supabase } from "../../utility/supabaseClient";

import { PageHeader, AppBottomSheet } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
    getInventory,
    getStockMovements,
    createStockMovement,
    updateStockMovement,
    StockItem,
    StockMovement,
    getWarehouses
} from "../../services/warehouse";
import { getProducts } from "../../services/products";

// Components
import { StockList } from "../../components/storage/StockList";
import { StockDetails } from "../../components/storage/StockDetails";
import { AddMovementDrawer, type MovementProductOption } from "../../components/storage/AddMovementDrawer";

const StoragePage: React.FC = () => {
    usePageTitle("Движение товара"); // User asked to rename
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const { open: notify } = useNotification();

    // State
    const [stock, setStock] = React.useState<StockItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState("");

    const [selectedItem, setSelectedItem] = React.useState<StockItem | null>(null);
    const [reloadTick, setReloadTick] = React.useState(0);

    // Details State
    const [movements, setMovements] = React.useState<StockMovement[]>([]);
    const [loadingMovements, setLoadingMovements] = React.useState(false);

    // Drawer State
    const [drawerOpen, setDrawerOpen] = React.useState(false);
    const [drawerMode, setDrawerMode] = React.useState<"in" | "out">("in");
    const [editingMovement, setEditingMovement] = React.useState<StockMovement | null>(null);

    // All Products for Selector
    const [availableProducts, setAvailableProducts] = React.useState<{ id: string, label: string }[]>([]);

    // Fetch Inventory
    const fetchInventory = React.useCallback(async () => {
        try {
            setLoading(true);
            const data = await getInventory(); // Fetches all inventory? Or just primary? API default fetches all.
            setStock(data);
            return data;
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка загрузки склада" });
            return [];
        } finally {
            setLoading(false);
        }
    }, [notify]);

    // Fetch Products for dropdown
    const fetchProductsForSelector = React.useCallback(async () => {
        try {
            const prods = await getProducts();
            setAvailableProducts(prods.map(p => ({ id: p.sellable_item_id, label: p.name })));
        } catch (e) { console.error("Failed to load products for selector", e); }
    }, []);

    React.useEffect(() => {
        fetchInventory();
        fetchProductsForSelector();
    }, [fetchInventory, fetchProductsForSelector, reloadTick]);

    // Fetch Movements when Item Selected
    React.useEffect(() => {
        if (selectedItem) {
            const loadMovements = async () => {
                try {
                    setLoadingMovements(true);
                    const data = await getStockMovements(selectedItem.product_id, selectedItem.warehouse_id);
                    setMovements(data);
                } catch (e) {
                    console.error(e);
                } finally {
                    setLoadingMovements(false);
                }
            };
            loadMovements();
        } else {
            setMovements([]);
        }
    }, [selectedItem, reloadTick]);

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
        handleOpenDrawer('in');
    };

    const handleEditMovement = (movement: StockMovement) => {
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
        paymentMethod?: 'cash' | 'cashless',
    ) => {
        const targetProductId = editingMovement?.product_id || selectedItem?.product_id || selectedProd?.id;

        if (!targetProductId) return;

        // Ensure we have a warehouse ID. If new item, fetch primary warehouse.
        let warehouseId = editingMovement?.warehouse_id || selectedItem?.warehouse_id;
        if (!warehouseId) {
            const warehouses = await getWarehouses();
            warehouseId = warehouses.find(w => w.is_primary)?.id || warehouses[0]?.id;
        }

        if (!warehouseId) {
            notify?.({ type: 'error', message: 'Склад не найден' });
            return;
        }

        try {
            if (editingMovement) {
                await updateStockMovement(editingMovement.id, {
                    quantity: qty,
                    unit_cost: amount,
                    comment,
                    payment_method: paymentMethod ?? 'cash',
                });
            } else {
                let finalQty = qty;

                // Map Drawer Mode (UI) to DB Enum (Schema)
                let finalType: StockMovement['move_type'] = 'receipt';

                if (drawerMode === 'out') {
                    finalQty = -qty; // Negative for outgoing
                    finalType = 'consumption';
                } else {
                    finalType = 'receipt';
                }

                await createStockMovement({
                    warehouse_id: warehouseId,
                    product_id: targetProductId,
                    quantity: finalQty,
                    move_type: finalType,
                    reference_table: 'manual',
                    unit_cost: amount,
                    comment,
                    payment_method: paymentMethod,
                });
            }

            notify?.({ type: 'success', message: editingMovement ? 'Приход обновлен' : 'Успешно' });

            // Refresh
            const data = await fetchInventory();

            // Find and update the selected item with new data
            if (data && data.length > 0) {
                const updated = data.find(i => i.product_id === targetProductId);
                if (updated) {
                    setSelectedItem(updated);
                }
            }

            const updatedMovements = await getStockMovements(targetProductId, warehouseId);
            setMovements(updatedMovements);
            setEditingMovement(null);

        } catch (e) {
            console.error(e);
            notify?.({ type: 'error', message: 'Ошибка сохранения' });
            throw e;
        }
    };

    // REALTIME: Подписка на изменения склада и движений товара
    React.useEffect(() => {
        const channel = supabase
            .channel("storage-realtime")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "StockMovements" },
                () => {
                    console.log("Realtime: StockMovements changed, reloading...");
                    setReloadTick(t => t + 1);
                }
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "Inventory" },
                () => {
                    console.log("Realtime: Inventory changed, reloading...");
                    setReloadTick(t => t + 1);
                }
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "Warehouses" },
                () => {
                    console.log("Realtime: Warehouses changed, reloading...");
                    setReloadTick(t => t + 1);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);


    // Filtered list
    const filteredStock = React.useMemo(() => {
        if (!searchQuery) return stock;
        const q = searchQuery.toLowerCase();
        return stock.filter(i =>
            i.product_name?.toLowerCase().includes(q) ||
            i.product_barcode?.includes(q)
        );
    }, [stock, searchQuery]);

    return (
        <Box
            sx={{
                height: { xs: "calc(100dvh - 56px)", md: "calc(100dvh - 64px)" },
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}
        >
            <PageHeader
                title="Движение товара"
                showTitle={false} // Hidden as per design
                showSearch
                searchVal={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Поиск по статусу..."
                onAdd={handleAddClick}
                addButtonText="Добавить товар" // Or "Operation"
            />

            <Box sx={{ px: 2, pb: 2, pt: 1, flex: 1, minHeight: 0 }}>
                <Box sx={{ display: "flex", gap: 2, height: "100%" }}>
                    {/* List */}
                    <Box sx={{ flex: isMobile ? "1 1 100%" : "0 0 41.66%", minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
                        <StockList
                            stock={filteredStock}
                            selectedItem={selectedItem}
                            onSelect={setSelectedItem}
                            loading={loading}
                        />
                    </Box>

                    {/* Details Desktop */}
                    {!isMobile && (
                        <Box sx={{ flex: "1 1 0", minWidth: 0, height: "100%" }}>
                            <StockDetails
                                item={selectedItem}
                                movements={movements}
                                loadingMovements={loadingMovements}
                                onAddStock={() => handleOpenDrawer('in')}
                                onRemoveStock={() => handleOpenDrawer('out')}
                                onEditMovement={handleEditMovement}
                            />
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Drawers */}
            <AddMovementDrawer
                open={drawerOpen}
                onClose={handleCloseDrawer}
                product={selectedItem}
                mode={drawerMode}
                onConfirm={handleConfirmMovement}
                availableProducts={availableProducts}
                editingMovement={editingMovement}
            />

            {/* Mobile Sheet */}
            {isMobile && (
                <AppBottomSheet
                    open={!!selectedItem}
                    onClose={() => setSelectedItem(null)}
                >
                    {selectedItem && (
                        <Box sx={{ p: 2 }}>
                            <StockDetails
                                item={selectedItem}
                                movements={movements}
                                loadingMovements={loadingMovements}
                                onAddStock={() => handleOpenDrawer('in')}
                                onRemoveStock={() => handleOpenDrawer('out')}
                                onEditMovement={handleEditMovement}
                            />
                        </Box>
                    )}
                </AppBottomSheet>
            )}

        </Box>
    );
};

export default StoragePage;
