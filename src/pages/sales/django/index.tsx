import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
    Box,
    Grid2,
    useMediaQuery,
    useTheme,
    Stack,
    ToggleButtonGroup,
    ToggleButton,
} from "@mui/material";
import FormatListBulletedOutlined from "@mui/icons-material/FormatListBulletedOutlined";
import InventoryOutlined from "@mui/icons-material/InventoryOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import { useNotification } from "@refinedev/core";
import { useSearchParams } from "react-router";
import dayjs, { type Dayjs } from "dayjs";

import { PageHeader, AppBottomSheet } from "../../../components/ui";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { useFocusRefetch } from "../../../hooks/useFocusRefetch";
import { useRealtimeRefetch } from "../../../hooks/useRealtimeRefetch";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { ApiError, isAbortError } from "../../../api/client";
import {
    getSales,
    getSaleStats,
    getSalesByProduct,
    getSalesByDay,
    deleteSale,
    DjangoSale,
    SaleStats,
    SaleProductTotal,
    SaleDayAggregate,
    SaleListFilters,
} from "../../../api/sales";
import { getProducts } from "../../../api/warehouse";

import { DjangoSalesList } from "../../../components/sales/django/DjangoSalesList";
import { DjangoSaleDetails } from "../../../components/sales/django/DjangoSaleDetails";
import {
    DjangoSaleFormDrawer,
    type SaleProductOption,
} from "../../../components/sales/django/DjangoSaleFormDrawer";
import {
    SalesFilterBar,
    type SalesPeriodPreset,
    type SalesPaymentUI,
    type SalesStatusUI,
} from "../../../components/sales/django/SalesFilterBar";
import { SalesKpiCards } from "../../../components/sales/django/SalesKpiCards";
import { SalesByProductView } from "../../../components/sales/django/SalesByProductView";
import { SalesByDayView } from "../../../components/sales/django/SalesByDayView";

const PAGE_SIZE = 50;

type SalesView = "list" | "product" | "day";

/** Вычисляет диапазон дат YYYY-MM-DD из пресета/произвольных дат. */
function computeRange(
    period: SalesPeriodPreset,
    customFrom: Dayjs | null,
    customTo: Dayjs | null,
): { from: string | null; to: string | null } {
    const today = dayjs();
    switch (period) {
        case "today":
            return { from: today.format("YYYY-MM-DD"), to: today.format("YYYY-MM-DD") };
        case "week":
            return { from: today.subtract(6, "day").format("YYYY-MM-DD"), to: today.format("YYYY-MM-DD") };
        case "month":
            return { from: today.startOf("month").format("YYYY-MM-DD"), to: today.format("YYYY-MM-DD") };
        case "all":
            return { from: null, to: null };
        case "custom":
            return {
                from: customFrom ? customFrom.format("YYYY-MM-DD") : null,
                to: customTo ? customTo.format("YYYY-MM-DD") : null,
            };
    }
}

const DjangoSalesPage: React.FC = () => {
    usePageTitle("Продажи");
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const { open: notify } = useNotification();
    const { loading: permLoading } = usePermissions();
    const canView = useCan(["warehouse.sales.view", "warehouse.view"]);
    const canManageSales = useCan("warehouse.sales.manage");

    // ── Состояние фильтров (инициализируется из URL) ──────────────────────────
    const [searchParams, setSearchParams] = useSearchParams();
    const [period, setPeriod] = useState<SalesPeriodPreset>(
        () => (searchParams.get("period") as SalesPeriodPreset) || "month",
    );
    const [customFrom, setCustomFrom] = useState<Dayjs | null>(() => {
        const v = searchParams.get("from");
        return v ? dayjs(v) : null;
    });
    const [customTo, setCustomTo] = useState<Dayjs | null>(() => {
        const v = searchParams.get("to");
        return v ? dayjs(v) : null;
    });
    const [search, setSearch] = useState(() => searchParams.get("q") || "");
    const [paymentUI, setPaymentUI] = useState<SalesPaymentUI>(
        () => (searchParams.get("pay") as SalesPaymentUI) || "all",
    );
    const [statusUI, setStatusUI] = useState<SalesStatusUI>(
        () => (searchParams.get("status") as SalesStatusUI) || "all",
    );
    const [view, setView] = useState<SalesView>(
        () => (searchParams.get("view") as SalesView) || "list",
    );

    // Поиск с задержкой
    const [debouncedSearch, setDebouncedSearch] = useState(search);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    // Синхронизация состояния → URL (фильтр сохраняется при возврате)
    useEffect(() => {
        const p = new URLSearchParams();
        if (period !== "month") p.set("period", period);
        if (period === "custom") {
            if (customFrom) p.set("from", customFrom.format("YYYY-MM-DD"));
            if (customTo) p.set("to", customTo.format("YYYY-MM-DD"));
        }
        if (search) p.set("q", search);
        if (paymentUI !== "all") p.set("pay", paymentUI);
        if (statusUI !== "all") p.set("status", statusUI);
        if (view !== "list") p.set("view", view);
        setSearchParams(p, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period, customFrom, customTo, search, paymentUI, statusUI, view]);

    const range = useMemo(
        () => computeRange(period, customFrom, customTo),
        [period, customFrom, customTo],
    );

    // Произвольный период без обеих дат — не запрашиваем (показываем подсказку).
    const rangeReady = !(period === "custom" && (!customFrom || !customTo));

    const apiFilters = useMemo<SaleListFilters>(
        () => ({
            dateFrom: range.from,
            dateTo: range.to,
            search: debouncedSearch || null,
            paymentMethod: paymentUI === "all" ? null : paymentUI,
            status: statusUI === "all" ? null : statusUI,
        }),
        [range, debouncedSearch, paymentUI, statusUI],
    );
    const filtersKey = useMemo(() => JSON.stringify(apiFilters), [apiFilters]);

    const rangeLabel = useMemo(() => {
        if (period === "all") return "за всё время";
        if (!range.from || !range.to) return "выберите даты";
        return `с ${dayjs(range.from).format("DD.MM")} по ${dayjs(range.to).format("DD.MM")}`;
    }, [period, range]);

    const hasActiveFilters =
        period !== "month" || !!search || paymentUI !== "all" || statusUI !== "all";

    const handleReset = () => {
        setPeriod("month");
        setCustomFrom(null);
        setCustomTo(null);
        setSearch("");
        setPaymentUI("all");
        setStatusUI("all");
    };

    // ── Данные: KPI ───────────────────────────────────────────────────────────
    const [stats, setStats] = useState<SaleStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const statsAbortRef = useRef<AbortController | null>(null);
    const fetchStats = useCallback(async () => {
        statsAbortRef.current?.abort();
        const c = new AbortController();
        statsAbortRef.current = c;
        setStatsLoading(true);
        try {
            const s = await getSaleStats(apiFilters, c.signal);
            setStats(s);
        } catch (e) {
            if (isAbortError(e)) return;
            console.error(e);
        } finally {
            if (statsAbortRef.current === c) setStatsLoading(false);
        }
    }, [apiFilters]);

    // ── Данные: список (вид «Список») + пагинация ─────────────────────────────
    const [sales, setSales] = useState<DjangoSale[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const offsetRef = useRef(0);
    const [selectedSale, setSelectedSale] = useState<DjangoSale | null>(null);
    const salesAbortRef = useRef<AbortController | null>(null);

    const fetchSales = useCallback(async (reset = true) => {
        salesAbortRef.current?.abort();
        const c = new AbortController();
        salesAbortRef.current = c;
        if (reset) {
            setLoading(true);
            offsetRef.current = 0;
        } else {
            setLoadingMore(true);
        }
        try {
            const data = await getSales(
                { ...apiFilters, limit: PAGE_SIZE + 1, offset: offsetRef.current },
                c.signal,
            );
            const page = data.slice(0, PAGE_SIZE);
            if (reset) {
                setSales(page);
                setSelectedSale(page[0] ?? null);
            } else {
                setSales((prev) => [...prev, ...page]);
            }
            setHasMore(data.length > PAGE_SIZE);
            offsetRef.current += page.length;
        } catch (e) {
            if (isAbortError(e)) return;
            console.error(e);
            notify?.({ type: "error", message: "Ошибка загрузки продаж" });
        } finally {
            if (salesAbortRef.current === c) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [apiFilters, notify]);

    // ── Данные: агрегаты ──────────────────────────────────────────────────────
    const [productRows, setProductRows] = useState<SaleProductTotal[]>([]);
    const [productLoading, setProductLoading] = useState(false);
    const fetchByProduct = useCallback(async () => {
        setProductLoading(true);
        try {
            setProductRows(await getSalesByProduct(apiFilters));
        } catch (e) {
            console.error(e);
        } finally {
            setProductLoading(false);
        }
    }, [apiFilters]);

    const [dayRows, setDayRows] = useState<SaleDayAggregate[]>([]);
    const [dayLoading, setDayLoading] = useState(false);
    const fetchByDay = useCallback(async () => {
        setDayLoading(true);
        try {
            setDayRows(await getSalesByDay(apiFilters));
        } catch (e) {
            console.error(e);
        } finally {
            setDayLoading(false);
        }
    }, [apiFilters]);

    // ── Товары для drawer «Новая продажа» ─────────────────────────────────────
    const [availableProducts, setAvailableProducts] = useState<SaleProductOption[]>([]);
    const fetchProducts = useCallback(async () => {
        try {
            const prods = await getProducts();
            setAvailableProducts(prods.map((p) => ({
                id: p.id,
                label: p.name,
                price: p.price || 0,
                image: p.imageUrl,
                barcode: p.barcode,
                isActive: p.isForSale,
            })));
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        if (!permLoading && canView) fetchProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permLoading, canView]);

    // Главный эффект загрузки: KPI всегда + активный вид. Реагирует на фильтры/вид.
    useEffect(() => {
        if (permLoading || !canView || !rangeReady) return;
        fetchStats();
        if (view === "list") fetchSales(true);
        else if (view === "product") fetchByProduct();
        else fetchByDay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permLoading, canView, rangeReady, filtersKey, view]);

    useFocusRefetch(() => {
        if (permLoading || !canView || !rangeReady) return;
        fetchStats();
        if (view === "list") fetchSales(true);
        else if (view === "product") fetchByProduct();
        else fetchByDay();
    });

    // Infinite scroll (только вид «Список»)
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (view !== "list" || !sentinelRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
                    fetchSales(false);
                }
            },
            { threshold: 0.1 },
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [view, hasMore, loadingMore, loading, fetchSales]);

    useEffect(() => {
        if (!isMobile && !selectedSale && sales.length > 0) setSelectedSale(sales[0]);
    }, [sales, isMobile, selectedSale]);

    // ── Drawers / действия ────────────────────────────────────────────────────
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [saleToEdit, setSaleToEdit] = useState<DjangoSale | null>(null);

    const refetchCurrent = () => {
        fetchStats();
        if (view === "list") fetchSales(true);
        else if (view === "product") fetchByProduct();
        else fetchByDay();
    };

    // Realtime: продажи коллег (создание/правка/удаление) подтягиваются
    // мгновенно по /ws/changes/; focus-refetch остаётся страховкой.
    useRealtimeRefetch({
        entities: ["sale"],
        onEvent: refetchCurrent,
    });

    const handleDeleteSale = async (sale: DjangoSale) => {
        try {
            await deleteSale(sale.id);
            notify?.({ type: "success", message: "Продажа удалена, товары возвращены на склад" });
            if (selectedSale?.id === sale.id) setSelectedSale(null);
            refetchCurrent();
        } catch (e) {
            console.error(e);
            const message = e instanceof ApiError ? e.message : "Не удалось удалить продажу";
            notify?.({ type: "error", message });
        }
    };

    const handleEditSale = (sale: DjangoSale) => {
        setSaleToEdit(sale);
        setDrawerOpen(true);
    };

    const handleCreateClick = () => {
        setSaleToEdit(null);
        setDrawerOpen(true);
    };

    if (!permLoading && !canView) return <AccessDenied />;

    const showDetailColumn = view === "list" && !isMobile;

    return (
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <PageHeader
                title="Продажи"
                showTitle={false}
                onAdd={canManageSales ? handleCreateClick : undefined}
                addButtonText="Продажа"
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
                {/* Горизонтальная панель фильтров */}
                <SalesFilterBar
                    period={period}
                    onPeriodChange={setPeriod}
                    customFrom={customFrom}
                    customTo={customTo}
                    onCustomFromChange={setCustomFrom}
                    onCustomToChange={setCustomTo}
                    rangeLabel={rangeLabel}
                    search={search}
                    onSearchChange={setSearch}
                    paymentMethod={paymentUI}
                    onPaymentMethodChange={setPaymentUI}
                    status={statusUI}
                    onStatusChange={setStatusUI}
                    hasActiveFilters={hasActiveFilters}
                    onReset={handleReset}
                />

                {/* KPI-сводка */}
                <SalesKpiCards stats={stats} loading={statsLoading} />

                {/* Переключатель вида отчёта */}
                <ToggleButtonGroup
                    value={view}
                    exclusive
                    size="small"
                    onChange={(_, v) => v && setView(v)}
                    sx={{ alignSelf: "flex-start" }}
                >
                    <ToggleButton value="list" sx={{ textTransform: "none", gap: 0.5, px: 1.5 }}>
                        <FormatListBulletedOutlined fontSize="small" />
                        Список
                    </ToggleButton>
                    <ToggleButton value="product" sx={{ textTransform: "none", gap: 0.5, px: 1.5 }}>
                        <InventoryOutlined fontSize="small" />
                        По товарам
                    </ToggleButton>
                    <ToggleButton value="day" sx={{ textTransform: "none", gap: 0.5, px: 1.5 }}>
                        <CalendarMonthOutlined fontSize="small" />
                        По дням
                    </ToggleButton>
                </ToggleButtonGroup>

                {/* Контент по виду */}
                <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    {view === "list" && (
                        <Grid2 container spacing={2} sx={{ flex: 1, minHeight: 0, height: "100%" }}>
                            <Grid2
                                size={{ xs: 12, md: showDetailColumn ? 6 : 12 }}
                                sx={{
                                    height: { xs: "auto", md: "100%" },
                                    display: "flex",
                                    flexDirection: "column",
                                    overflow: { xs: "visible", md: "hidden" },
                                }}
                            >
                                <DjangoSalesList
                                    sales={sales}
                                    selectedSale={selectedSale}
                                    onSelect={setSelectedSale}
                                    loading={loading}
                                    loadMoreRef={hasMore ? sentinelRef : undefined}
                                    loadingMore={loadingMore}
                                />
                            </Grid2>

                            {showDetailColumn && (
                                <Grid2
                                    size={{ xs: 12, md: 6 }}
                                    sx={{
                                        height: { md: "100%" },
                                        display: "flex",
                                        flexDirection: "column",
                                        overflow: { xs: "visible", md: "hidden" },
                                    }}
                                >
                                    <Box sx={{ height: "100%", overflowY: "auto", pr: 0.5 }}>
                                        <DjangoSaleDetails
                                            sale={selectedSale}
                                            onDelete={handleDeleteSale}
                                            onEdit={handleEditSale}
                                            canEdit={canManageSales}
                                            canDelete={canManageSales}
                                        />
                                    </Box>
                                </Grid2>
                            )}
                        </Grid2>
                    )}

                    {view === "product" && (
                        <SalesByProductView rows={productRows} loading={productLoading} />
                    )}

                    {view === "day" && (
                        <SalesByDayView rows={dayRows} loading={dayLoading} />
                    )}
                </Box>
            </Box>

            <DjangoSaleFormDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                sale={saleToEdit}
                availableProducts={availableProducts}
                onSaved={refetchCurrent}
            />

            {/* Деталь на мобильном — bottom sheet (вид «Список») */}
            {isMobile && view === "list" && (
                <AppBottomSheet open={!!selectedSale} onClose={() => setSelectedSale(null)}>
                    <Box sx={{ p: 2 }}>
                        <DjangoSaleDetails
                            sale={selectedSale}
                            onDelete={handleDeleteSale}
                            onEdit={(s) => {
                                setSelectedSale(null);
                                handleEditSale(s);
                            }}
                            canEdit={canManageSales}
                            canDelete={canManageSales}
                        />
                    </Box>
                </AppBottomSheet>
            )}
        </Box>
    );
};

export default DjangoSalesPage;
