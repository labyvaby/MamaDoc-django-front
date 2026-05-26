
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    Box,
    Grid2,
    useMediaQuery,
    useTheme,
    Paper,
    Typography,
    Stack,
    List,
    ListItemButton,
    Button,
    TextField,
    MenuItem,
    CircularProgress,
    ToggleButtonGroup,
    ToggleButton,
} from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import InventoryIcon from "@mui/icons-material/Inventory";
import { useNotification } from "@refinedev/core";
import type { Theme } from "@mui/material/styles";

import { PageHeader, AppBottomSheet } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
    getSalesList,
    getSalesDayTotals,
    createSale,
    deleteSale,
    Sale,
    CreateSaleData,
    SaleSource,
    SalesDayTotal,
} from "../../services/sales";
import { CreateSaleDrawer } from "../../components/sales/CreateSaleDrawer";
import { EditSaleDrawer } from "../../components/sales/EditSaleDrawer";
import { getProducts } from "../../services/products";
import { formatKGS } from "../../utility/format";
import { usePermissions } from "../../hooks/usePermissions";

import { SalesList } from "../../components/sales/SalesList";
import { SaleDetails } from "../../components/sales/SaleDetails";

const MONTH_NAMES = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const PAGE_SIZE = 50;

const SalesPage: React.FC = () => {
    usePageTitle("Продажи");
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const { open: notify } = useNotification();
    const { isAdmin, isRegistrator } = usePermissions();
    const canManageSales = isAdmin() || isRegistrator();

    const today = new Date();
    const todayYear = today.getFullYear().toString();
    const todayMonth = `${todayYear}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    // Фильтры
    const [selectedYear, setSelectedYear] = useState<string | null>(todayYear);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(todayMonth);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [sourceFilter, setSourceFilter] = useState<SaleSource | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterMode, setFilterMode] = useState<"date" | "products">("date");
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

    // Список продаж + пагинация
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const offsetRef = useRef(0);

    // Суммы по дням для левой панели
    const [dayTotals, setDayTotals] = useState<SalesDayTotal[]>([]);
    const [dayTotalsLoading, setDayTotalsLoading] = useState(false);

    // Master-Detail
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

    // Drawers
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editDrawerOpen, setEditDrawerOpen] = useState(false);
    const [saleToEdit, setSaleToEdit] = useState<Sale | null>(null);
    const [availableProducts, setAvailableProducts] = useState<{ id: string; label: string; price: number; image?: string; barcode?: string; is_active?: boolean }[]>([]);

    // Вычисляем from/to из фильтров
    const getDateRange = useCallback((): { from: string | null; to: string | null } => {
        if (selectedDate) return { from: selectedDate, to: selectedDate };
        if (selectedMonth) {
            const [y, m] = selectedMonth.split("-");
            const lastDay = new Date(Number(y), Number(m), 0).getDate();
            return { from: `${selectedMonth}-01`, to: `${selectedMonth}-${String(lastDay).padStart(2, "0")}` };
        }
        if (selectedYear) {
            return { from: `${selectedYear}-01-01`, to: `${selectedYear}-12-31` };
        }
        return { from: null, to: null };
    }, [selectedDate, selectedMonth, selectedYear]);

    const fetchSales = useCallback(async (reset = true) => {
        if (reset) {
            setLoading(true);
            offsetRef.current = 0;
        } else {
            setLoadingMore(true);
        }

        try {
            const { from, to } = getDateRange();
            const data = await getSalesList({
                from,
                to,
                search: searchQuery || null,
                source: sourceFilter,
                limit: PAGE_SIZE + 1,
                offset: offsetRef.current,
            });
            const page = data.slice(0, PAGE_SIZE);

            if (reset) {
                setSales(page);
                setSelectedSale(page[0] ?? null);
            } else {
                setSales(prev => [...prev, ...page]);
            }

            setHasMore(data.length > PAGE_SIZE);
            offsetRef.current += page.length;
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка загрузки продаж" });
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [getDateRange, searchQuery, sourceFilter, notify]);

    const fetchDayTotals = useCallback(async (year: string | null) => {
        setDayTotalsLoading(true);
        try {
            const data = await getSalesDayTotals(year ?? null, null);
            setDayTotals(data);
        } catch (e) {
            console.error(e);
        } finally {
            setDayTotalsLoading(false);
        }
    }, []);

    const fetchProducts = useCallback(async () => {
        try {
            const prods = await getProducts();
            setAvailableProducts(prods.map(p => ({
                id: p.sellable_item_id,
                label: p.name,
                price: p.price || 0,
                image: p.image_url,
                barcode: p.barcode,
                is_active: p.is_for_sale,
            })));
        } catch (e) { console.error(e); }
    }, []);

    // Начальная загрузка
    useEffect(() => {
        fetchProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Перезагрузка при смене фильтров
    useEffect(() => {
        fetchSales(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, selectedMonth, selectedYear, sourceFilter]);

    // Поиск с задержкой
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchDidMountRef = useRef(false);
    useEffect(() => {
        if (!searchDidMountRef.current) {
            searchDidMountRef.current = true;
            return;
        }
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => fetchSales(true), 350);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);

    // Загрузка сумм по дням при смене года/месяца
    useEffect(() => {
        fetchDayTotals(selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedYear]);

    // Доступные годы из dayTotals
    const availableYears = React.useMemo(() => {
        const years = new Set<string>();
        dayTotals.forEach(d => years.add(d.day.slice(0, 4)));
        return Array.from(years).sort((a, b) => b.localeCompare(a));
    }, [dayTotals]);

    // Только месяцы с данными из dayTotals
    const availableMonths = React.useMemo(() => {
        if (!selectedYear) return [];
        const monthMap = new Map<string, number>();
        dayTotals.forEach(d => {
            if (d.day.slice(0, 4) !== selectedYear) return;
            const monthKey = d.day.slice(0, 7);
            const monthIndex = Number(d.day.slice(5, 7)) - 1;
            if (!monthMap.has(monthKey)) monthMap.set(monthKey, monthIndex);
        });
        return Array.from(monthMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([value, monthIndex]) => ({ value, monthIndex }));
    }, [dayTotals, selectedYear]);

    // Дни с суммами для выбранного месяца
    const groupedByDay = React.useMemo(() => {
        if (!selectedMonth) return [];
        const days = dayTotals
            .filter(d => d.day.startsWith(selectedMonth))
            .map(d => ({ date: d.day, total: d.total_amount }))
            .sort((a, b) => b.date.localeCompare(a.date));

        return days;
    }, [dayTotals, selectedMonth]);

    // Группировка по товарам из загруженных продаж
    const groupedByProduct = React.useMemo(() => {
        const map = new Map<string, { name: string; count: number; total: number }>();
        for (const sale of sales) {
            for (const line of (sale.lines ?? [])) {
                const name = line.product_name ?? "Неизвестный товар";
                const existing = map.get(name);
                if (existing) {
                    existing.count += line.quantity;
                    existing.total += line.total;
                } else {
                    map.set(name, { name, count: line.quantity, total: line.total });
                }
            }
        }
        return Array.from(map.values()).sort((a, b) => b.total - a.total);
    }, [sales]);

    // Продажи, отфильтрованные по выбранному товару
    const filteredSales = React.useMemo(() => {
        if (filterMode !== "products" || !selectedProduct) return sales;
        return sales.filter(s => s.lines?.some(l => (l.product_name ?? "Неизвестный товар") === selectedProduct));
    }, [sales, filterMode, selectedProduct]);

    // Infinite scroll — sentinel element
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!sentinelRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
                    fetchSales(false);
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, loading, fetchSales]);

    // Auto-select first on desktop
    useEffect(() => {
        if (!isMobile && !selectedSale && sales.length > 0) {
            setSelectedSale(sales[0]);
        }
    }, [sales, isMobile, selectedSale]);

    const handleCreateSale = async (data: CreateSaleData) => {
        try {
            await createSale(data);
            notify?.({ type: "success", message: "Продажа успешно создана" });
            setDrawerOpen(false);
            fetchSales(true);
            fetchDayTotals(selectedYear);
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка при создании продажи" });
        }
    };

    const handleDeleteSale = async (sale: Sale) => {
        try {
            await deleteSale(sale.id);
            notify?.({ type: "success", message: "Продажа удалена" });
            if (selectedSale?.id === sale.id) setSelectedSale(null);
            fetchSales(true);
            fetchDayTotals(selectedYear);
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Не удалось удалить продажу" });
        }
    };

    const handleEditSale = (sale: Sale) => {
        setSaleToEdit(sale);
        setEditDrawerOpen(true);
    };

    const handleUpdateSuccess = () => {
        fetchSales(true);
        fetchDayTotals(selectedYear);
    };

    return (
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <PageHeader
                title="Продажи"
                showTitle={false}
                showSearch
                searchVal={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Поиск продаж..."
                onAdd={canManageSales ? () => setDrawerOpen(true) : undefined}
                addButtonText="Продажа"
            />

            <Box sx={(theme) => ({ px: theme.appLayout.page.paddingX, pb: theme.appLayout.page.paddingY, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: { xs: "auto", md: "hidden" } })}>
                <Grid2 container spacing={2} sx={{ flex: 1, minHeight: 0, height: "100%" }}>

                    {/* Period Filter Column */}
                    <Grid2
                        size={{ xs: 12, md: 2 }}
                        sx={(theme: Theme) => ({
                            position: { md: "sticky" },
                            top: { md: theme.spacing(2) },
                            alignSelf: "flex-start",
                            height: { xs: "auto", md: "100%" },
                            display: "flex",
                            flexDirection: "column",
                            overflow: { xs: "visible", md: "hidden" },
                        })}
                    >
                        <Paper
                            elevation={0}
                            variant="outlined"
                            sx={{ height: { xs: "auto", md: "100%" }, overflow: "hidden", display: "flex", flexDirection: "column" }}
                        >
                            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                    Фильтры
                                </Typography>
                                <Button
                                    size="small"
                                    onClick={() => {
                                        setSelectedYear(null);
                                        setSelectedMonth(null);
                                        setSelectedDate(null);
                                        setSelectedProduct(null);
                                    }}
                                    sx={{ textTransform: "none" }}
                                >
                                    Все продажи
                                </Button>
                            </Box>

                            {/* Переключатель По дате / По товарам */}
                            <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
                                <ToggleButtonGroup
                                    value={filterMode}
                                    exclusive
                                    onChange={(_, v) => {
                                        if (v) {
                                            setFilterMode(v);
                                            setSelectedDate(null);
                                            setSelectedProduct(null);
                                        }
                                    }}
                                    size="small"
                                    fullWidth
                                >
                                    <ToggleButton value="date" sx={{ textTransform: "none", gap: 0.5, fontSize: "0.75rem" }}>
                                        <CalendarMonthIcon fontSize="inherit" />
                                        По дате
                                    </ToggleButton>
                                    <ToggleButton value="products" sx={{ textTransform: "none", gap: 0.5, fontSize: "0.75rem" }}>
                                        <InventoryIcon fontSize="inherit" />
                                        По товарам
                                    </ToggleButton>
                                </ToggleButtonGroup>
                            </Box>

                            <Box sx={{ overflowY: "auto", flex: 1, px: 1.5, pb: 1.5 }}>
                                <Stack spacing={1.5}>
                                    {/* Источник */}
                                    <Stack spacing={0.5}>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                            Источник
                                        </Typography>
                                        <TextField
                                            select
                                            size="small"
                                            fullWidth
                                            value={sourceFilter ?? ""}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setSourceFilter(v ? v as SaleSource : null);
                                            }}
                                            SelectProps={{ displayEmpty: true }}
                                        >
                                            <MenuItem value="">Все</MenuItem>
                                            <MenuItem value="direct">Прямая продажа</MenuItem>
                                            <MenuItem value="appointment">Из приёма</MenuItem>
                                        </TextField>
                                    </Stack>

                                    {/* Год */}
                                    <Stack spacing={0.5}>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                            Год
                                        </Typography>
                                        <TextField
                                            select
                                            size="small"
                                            fullWidth
                                            value={selectedYear ?? ""}
                                            onChange={(e) => {
                                                const v = e.target.value || null;
                                                setSelectedYear(v);
                                                setSelectedMonth(null);
                                                setSelectedDate(null);
                                                setSelectedProduct(null);
                                            }}
                                            SelectProps={{ displayEmpty: true }}
                                        >
                                            <MenuItem value="">
                                                <Typography variant="body2" color="text.secondary">Все годы</Typography>
                                            </MenuItem>
                                            {availableYears.map((year) => (
                                                <MenuItem key={year} value={year}>{year}</MenuItem>
                                            ))}
                                        </TextField>
                                    </Stack>

                                    {/* Месяц */}
                                    {selectedYear && (
                                        <Stack spacing={0.5}>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                                Месяц
                                            </Typography>
                                            <TextField
                                                select
                                                size="small"
                                                fullWidth
                                                value={selectedMonth ?? ""}
                                                onChange={(e) => {
                                                    const v = e.target.value || null;
                                                    setSelectedMonth(v);
                                                    setSelectedDate(null);
                                                    setSelectedProduct(null);
                                                }}
                                                SelectProps={{ displayEmpty: true }}
                                            >
                                                <MenuItem value="">
                                                    <Typography variant="body2" color="text.secondary">Все месяцы</Typography>
                                                </MenuItem>
                                                {availableMonths.map((m) => (
                                                    <MenuItem key={m.value} value={m.value}>
                                                        {MONTH_NAMES[m.monthIndex]}
                                                    </MenuItem>
                                                ))}
                                            </TextField>
                                        </Stack>
                                    )}

                                    {/* Режим: По дате — список дней */}
                                    {filterMode === "date" && selectedMonth && (
                                        <Stack spacing={0.5}>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                                День
                                            </Typography>
                                            {dayTotalsLoading ? (
                                                <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
                                                    <CircularProgress size={20} />
                                                </Box>
                                            ) : (
                                                <List dense sx={{ py: 0 }}>
                                                    {groupedByDay.map((day) => (
                                                        <ListItemButton
                                                            key={day.date}
                                                            selected={selectedDate === day.date}
                                                            sx={{ borderRadius: 1, mb: 0.5 }}
                                                            onClick={() => setSelectedDate(selectedDate === day.date ? null : day.date)}
                                                        >
                                                            <Typography variant="body2" sx={{ flex: 1 }}>
                                                                {new Date(day.date).toLocaleDateString("ru-RU")}
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                {formatKGS(day.total)}
                                                            </Typography>
                                                        </ListItemButton>
                                                    ))}
                                                </List>
                                            )}
                                        </Stack>
                                    )}

                                    {/* Режим: По товарам — список товаров */}
                                    {filterMode === "products" && (
                                        <Stack spacing={0.5}>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                                Товары
                                            </Typography>
                                            {loading ? (
                                                <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
                                                    <CircularProgress size={20} />
                                                </Box>
                                            ) : groupedByProduct.length === 0 ? (
                                                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                                                    Нет данных за выбранный период
                                                </Typography>
                                            ) : (
                                                <List dense sx={{ py: 0 }}>
                                                    {groupedByProduct.map((product) => (
                                                        <ListItemButton
                                                            key={product.name}
                                                            selected={selectedProduct === product.name}
                                                            sx={{ borderRadius: 1, mb: 0.5, pr: 1 }}
                                                            onClick={() => setSelectedProduct(selectedProduct === product.name ? null : product.name)}
                                                        >
                                                            <Box sx={{ flex: 1, minWidth: 0, mr: 1 }}>
                                                                <Typography variant="body2" noWrap sx={{ fontWeight: selectedProduct === product.name ? 600 : 400 }}>
                                                                    {product.name}
                                                                </Typography>
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {formatKGS(product.total)}
                                                                </Typography>
                                                            </Box>
                                                            <Box sx={{ bgcolor: "primary.main", color: "primary.contrastText", borderRadius: 10, px: 0.8, py: 0.2, fontSize: "0.75rem", fontWeight: 600, minWidth: 20, textAlign: "center" }}>
                                                                {product.count}
                                                            </Box>
                                                        </ListItemButton>
                                                    ))}
                                                </List>
                                            )}
                                        </Stack>
                                    )}
                                </Stack>
                            </Box>
                        </Paper>
                    </Grid2>

                    {/* List Pane */}
                    <Grid2
                        size={{ xs: 12, md: 5 }}
                        sx={(theme: Theme) => ({
                            position: { md: "sticky" },
                            top: { md: theme.spacing(2) },
                            alignSelf: "flex-start",
                            height: { xs: "auto", md: "100%" },
                            display: "flex",
                            flexDirection: "column",
                            overflow: { xs: "visible", md: "hidden" },
                        })}
                    >
                        <SalesList
                            sales={filteredSales}
                            selectedSale={selectedSale}
                            onSelect={setSelectedSale}
                            loading={loading}
                            loadMoreRef={filterMode === "date" && hasMore ? sentinelRef : undefined}
                            loadingMore={loadingMore}
                        />
                    </Grid2>

                    {/* Details Pane (Desktop) */}
                    {!isMobile && (
                        <Grid2
                            size={{ xs: 12, md: 5 }}
                            sx={(theme: Theme) => ({
                                position: { md: "sticky" },
                                top: { md: theme.spacing(2) },
                                alignSelf: "flex-start",
                                height: { md: "100%" },
                                display: "flex",
                                flexDirection: "column",
                                overflow: { xs: "visible", md: "hidden" },
                            })}
                        >
                            <Box
                                sx={{
                                    height: "100%",
                                    overflowY: "auto",
                                    pr: 0.5,
                                    "&::-webkit-scrollbar": { width: 8 },
                                    "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
                                    "&::-webkit-scrollbar-thumb": {
                                        bgcolor: "divider",
                                        borderRadius: 1,
                                        "&:hover": { bgcolor: "action.disabled" },
                                    },
                                }}
                            >
                                <SaleDetails
                                    sale={selectedSale}
                                    onDelete={handleDeleteSale}
                                    onEdit={handleEditSale}
                                />
                            </Box>
                        </Grid2>
                    )}
                </Grid2>
            </Box>

            <CreateSaleDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                availableProducts={availableProducts}
                onConfirm={handleCreateSale}
            />

            {saleToEdit && (
                <EditSaleDrawer
                    open={editDrawerOpen}
                    onClose={() => setEditDrawerOpen(false)}
                    sale={saleToEdit}
                    onUpdated={handleUpdateSuccess}
                    availableProducts={availableProducts}
                />
            )}

            {isMobile && (
                <AppBottomSheet
                    open={!!selectedSale}
                    onClose={() => setSelectedSale(null)}
                >
                    <Box sx={{ p: 2 }}>
                        <SaleDetails
                            sale={selectedSale}
                            onDelete={handleDeleteSale}
                            onEdit={(s) => {
                                setSelectedSale(null);
                                handleEditSale(s);
                            }}
                        />
                    </Box>
                </AppBottomSheet>
            )}
        </Box>
    );
};

export default SalesPage;
