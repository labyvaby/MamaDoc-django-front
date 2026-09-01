import React from "react";
import {
  Box,
  Typography,
  Stack,
  Divider,
  Grid2,
  useMediaQuery,
  Chip,
  IconButton,
  Button,
  Autocomplete,
  alpha,
  Collapse,
  Paper,
  Tooltip,
  Badge,
  TextField,
  MenuItem,
  InputAdornment,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import FilterListIcon from "@mui/icons-material/FilterListOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import TouchAppOutlinedIcon from "@mui/icons-material/TouchAppOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import dayjs from "dayjs";

import { PageHeader, AppBottomSheet, AppCard, ListLoadingSkeleton, ListEmptyState, InfoTile } from "../../../components/ui";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { usePermissions } from "../../../hooks/usePermissions";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { useCan } from "../../../hooks/useCan";
import { useFocusRefetch } from "../../../hooks/useFocusRefetch";
import { useRealtimeRefetch } from "../../../hooks/useRealtimeRefetch";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { ApiError, isAbortError } from "../../../api/client";
import {
  getProducts,
  getProductCategories,
  getProductPriceHistory,
  getProductGallery,
  getProductModels,
  productAvailableStock,
  deleteProduct,
  DjangoProduct,
  DjangoPriceHistoryEntry,
  DjangoProductImage,
  DjangoProductModel,
} from "../../../api/warehouse";
import { DjangoProductFormDrawer } from "../../../components/products/django/DjangoProductFormDrawer";
import { DjangoProductPositionRow } from "../../../components/products/django/DjangoProductPositionRow";
import {
  buildPositions,
  matchedVariantIds,
  positionMatches,
} from "../../../components/products/django/productPositions";
import { pluralPositions, useProductTones } from "../../../theme/productTokens";
import { DjangoProductImageSlider } from "../../../components/products/django/DjangoProductImageSlider";
import ProductFilterDrawer, { ProductFilters } from "../../../components/products/ProductFilterDrawer";

/**
 * Состояние остатка для бейджа в строке: нет / мало / есть.
 * Красный — только при нулевом/отрицательном остатке; «мало» — при остатке
 * ≤ минимума (lowStockThreshold, поле бэка — пока может отсутствовать).
 */
const DjangoProductsPage: React.FC = () => {
  usePageTitle("Товары");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const tones = useProductTones();
  const { loading: permLoading } = usePermissions();
  // Орг-контекст обязателен суперпользователю/мультиорг-аккаунту.
  const orgId = useApiOrgId();
  const canView = useCan(["warehouse.view", "warehouse.sales.view"]);
  const canManage = useCan("warehouse.manage");

  // Drawers
  const [formDrawerOpen, setFormDrawerOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<DjangoProduct | null>(null);

  // Filter Drawer
  const [filterDrawerOpen, setFilterDrawerOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<ProductFilters>({
    category: null,
    saleStatus: "all",
    stockStatus: "all",
  });
  // Сортировка списка
  const [sortBy, setSortBy] = React.useState<"name" | "stock" | "price">("name");
  // Модели: их названия нужны, чтобы позиция называлась «Пальто шерстяное
  // oversize», а не хвостом первого варианта.
  const [models, setModels] = React.useState<DjangoProductModel[]>([]);
  // Раскрытые позиции — ключ из buildPositions, переживает перерисовку списка.
  const [openKeys, setOpenKeys] = React.useState<Set<string>>(new Set());

  // Data state
  const [products, setProducts] = React.useState<DjangoProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  // Категории из отдельного эндпоинта (полный список, а не только по загруженным
  // товарам) — для дропдауна фильтра.
  const [serverCategories, setServerCategories] = React.useState<string[]>([]);

  // Selection state (Desktop & Mobile)
  const [selectedProduct, setSelectedProduct] = React.useState<DjangoProduct | null>(null);

  const productsAbortRef = React.useRef<AbortController | null>(null);
  const fetchProducts = React.useCallback(async () => {
    productsAbortRef.current?.abort();
    const controller = new AbortController();
    productsAbortRef.current = controller;
    try {
      setLoading(true);
      const data = await getProducts(controller.signal, { organizationId: orgId });
      setProducts(data);
      // Обновим выбранный товар свежими данными.
      setSelectedProduct((prev) =>
        prev ? data.find((p) => p.id === prev.id) ?? null : null,
      );
    } catch (e) {
      if (isAbortError(e)) return;
      console.error("Failed to load products:", e);
      notify?.({ type: "error", message: "Не удалось загрузить список товаров" });
    } finally {
      if (productsAbortRef.current === controller) setLoading(false);
    }
  }, [notify, orgId]);

  const fetchCategories = React.useCallback(async () => {
    try {
      setServerCategories(await getProductCategories(undefined, orgId));
    } catch (e) {
      if (isAbortError(e)) return;
      // Не критично: фильтр откатится на категории из загруженных товаров.
      console.error("Failed to load categories:", e);
    }
  }, [orgId]);

  const fetchModels = React.useCallback(async () => {
    try {
      setModels(await getProductModels(undefined, orgId));
    } catch (e) {
      if (isAbortError(e)) return;
      // Не критично: без моделей позиция назовётся по первому варианту.
      console.error("Failed to load product models:", e);
    }
  }, [orgId]);

  React.useEffect(() => {
    if (!permLoading && canView) {
      fetchProducts();
      fetchCategories();
      fetchModels();
    }
  }, [permLoading, canView, fetchProducts, fetchCategories, fetchModels]);

  // Обновление при возврате фокуса — изменения коллег подтянутся без F5.
  useFocusRefetch(() => {
    if (!permLoading && canView) {
      fetchProducts();
      fetchCategories();
      fetchModels();
    }
  });

  // Realtime: изменения товаров коллегами (создание/правка/архив/фото)
  // подтягиваются мгновенно по /ws/changes/; focus-refetch выше остаётся
  // страховкой на случай обрыва сокета.
  useRealtimeRefetch({
    entities: ["product"],
    onEvent: () => {
      if (!permLoading && canView) {
        fetchProducts();
        fetchCategories();
        fetchModels();
      }
    },
  });

  // Auto-select first product on desktop if none selected
  React.useEffect(() => {
    if (!isMobile && products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0]);
    }
  }, [isMobile, products, selectedProduct]);

  const handleDelete = async (p: DjangoProduct) => {
    const confirmed = await confirm({
      title: "Удалить товар?",
      message: `Вы уверены, что хотите удалить "${p.name}"? Это действие нельзя отменить.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
      variant: "error",
    });

    if (!confirmed) return;

    try {
      const archived = await deleteProduct(p.id);

      if (selectedProduct?.id === p.id) {
        setSelectedProduct(null);
      }
      await fetchProducts();

      notify?.({
        type: "success",
        message: archived
          ? "Товар перемещен в архив (есть история движений)"
          : "Товар удален",
      });
    } catch (err: unknown) {
      console.error("Delete failed:", err);
      const message = err instanceof ApiError ? err.message : "Не удалось удалить товар";
      notify?.({ type: "error", message });
    }
  };

  const handleAddClick = () => {
    setEditingProduct(null);
    setFormDrawerOpen(true);
  };

  const handleEditClick = (p: DjangoProduct) => {
    setEditingProduct(p);
    setFormDrawerOpen(true);
  };

  // Filtering Logic. Категории для фильтра: серверный список (полный), а при
  // его недоступности — производные от загруженных товаров.
  const availableCategories = React.useMemo(() => {
    if (serverCategories.length > 0) return serverCategories;
    const cats = new Set(products.map((p) => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [serverCategories, products]);

  /**
   * Фильтры применяем к SKU, а поиск — уже к собранной позиции: продавец ищет
   * «Хаки» или сканирует штрихкод варианта, и позиция обязана всплыть целиком,
   * своего штрихкода у неё нет.
   */
  const scopedProducts = React.useMemo(
    () =>
      products.filter((p) => {
        if (filters.category && p.category !== filters.category) return false;
        if (filters.saleStatus !== "all") {
          const isActive = p.isForSale ?? true;
          if (filters.saleStatus === "active" && !isActive) return false;
          if (filters.saleStatus === "inactive" && isActive) return false;
        }
        if (filters.stockStatus !== "all") {
          const stock = productAvailableStock(p);
          if (filters.stockStatus === "in_stock" && stock <= 0) return false;
          if (filters.stockStatus === "out_of_stock" && stock > 0) return false;
        }
        return true;
      }),
    [products, filters],
  );

  const positions = React.useMemo(
    () => buildPositions(scopedProducts, models),
    [scopedProducts, models],
  );

  const visiblePositions = React.useMemo(() => {
    const list = positions.filter((position) => positionMatches(position, searchQuery));
    const sorted = [...list];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    } else if (sortBy === "stock") {
      sorted.sort((a, b) => b.stock - a.stock);
    } else if (sortBy === "price") {
      sorted.sort((a, b) => b.priceMax - a.priceMax);
    }
    return sorted;
  }, [positions, searchQuery, sortBy]);

  /** Сколько SKU видно сейчас — позиции считаются отдельно от строк учёта. */
  const visibleSkuCount = React.useMemo(
    () => visiblePositions.reduce((sum, position) => sum + position.variants.length, 0),
    [visiblePositions],
  );

  /* Поиск, попавший внутрь варианта, сам раскрывает свою позицию: иначе
     совпадение остаётся невидимым под свёрнутой строкой. */
  const searchOpenKeys = React.useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    return new Set(
      visiblePositions
        .filter((position) => matchedVariantIds(position, searchQuery).size > 0)
        .map((position) => position.key),
    );
  }, [visiblePositions, searchQuery]);

  // Сводка по наличию — для чипов-фильтров над списком.
  const stockCounts = React.useMemo(() => {
    let out = 0;
    for (const p of products) {
      if (productAvailableStock(p) <= 0) out += 1;
    }
    return { total: products.length, out, inStock: products.length - out };
  }, [products]);

  // Кол-во активных фильтров (для бейджа на кнопке «Фильтры»)
  const activeFilterCount =
    (filters.category ? 1 : 0) +
    (filters.saleStatus !== "all" ? 1 : 0) +
    (filters.stockStatus !== "all" ? 1 : 0);

  // Чипы применённых фильтров (label + сброс конкретного фильтра)
  const activeFilterChips: { key: string; label: string; clear: () => void }[] = [
    ...(filters.category
      ? [{ key: "cat", label: filters.category, clear: () => setFilters((f) => ({ ...f, category: null })) }]
      : []),
    ...(filters.saleStatus !== "all"
      ? [{
          key: "sale",
          label: filters.saleStatus === "active" ? "В продаже" : "Скрыт",
          clear: () => setFilters((f) => ({ ...f, saleStatus: "all" })),
        }]
      : []),
    ...(filters.stockStatus !== "all"
      ? [{
          key: "stock",
          label: filters.stockStatus === "in_stock" ? "В наличии" : "Нет в наличии",
          clear: () => setFilters((f) => ({ ...f, stockStatus: "all" })),
        }]
      : []),
  ];

  const handleApplyFilters = (newFilters: ProductFilters) => {
    setFilters(newFilters);
  };

  const handleResetFilters = () => {
    setFilters({
      category: null,
      saleStatus: "all",
      stockStatus: "all",
    });
  };

  const isFilterActive = filters.category || filters.saleStatus !== "all" || filters.stockStatus !== "all";

  if (!permLoading && !canView) return <AccessDenied />;

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Page Header */}
      <PageHeader
        title="Товары"
        showTitle={false}
        addButtonText={canManage ? "Добавить товар" : undefined}
        onAdd={canManage ? handleAddClick : undefined}
      />

      <Box sx={{ px: 2, pb: 4, pt: 1, flex: 1, overflow: "hidden" }}>
        <Grid2 container spacing={2} sx={{ height: "100%" }}>
          {/* Left Column: Product List */}
          <Grid2 size={{ xs: 12, md: 5 }} sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <Paper
              elevation={0}
              variant="outlined"
              sx={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                useFlexGap
                flexWrap="wrap"
                sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", gap: 1 }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Товары ({isFilterActive ? `${visiblePositions.length} из ${positions.length}` : pluralPositions(positions.length)})
                </Typography>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <TextField
                    select
                    size="small"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    sx={{ minWidth: 150 }}
                  >
                    <MenuItem value="name">По названию</MenuItem>
                    <MenuItem value="stock">По остатку</MenuItem>
                    <MenuItem value="price">По цене</MenuItem>
                  </TextField>
                </Stack>
              </Stack>

              {/* Компактная панель: категория поиском, наличие, счётчики.
                  Ленты чипов убраны — на 30 категориях они уезжали за экран,
                  а активный фильтр было не видно. */}
              <Box
                sx={{
                  px: 1.5,
                  py: 1.25,
                  borderBottom: 1,
                  borderColor: "divider",
                  display: "grid",
                  gap: 1,
                  alignItems: "center",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr) auto",
                  },
                }}
              >
                <TextField
                  size="small"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Название, значение, SKU или штрихкод"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlined sx={{ fontSize: 18, color: "text.disabled" }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <Autocomplete
                  size="small"
                  options={availableCategories}
                  value={filters.category}
                  onChange={(_, next) => setFilters((f) => ({ ...f, category: next }))}
                  noOptionsText="Ничего не нашлось"
                  renderInput={(params) => (
                    <TextField {...params} label="Категория" placeholder="Все категории" />
                  )}
                />
                <TextField
                  select
                  size="small"
                  label="Наличие"
                  value={filters.stockStatus}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      stockStatus: e.target.value as ProductFilters["stockStatus"],
                    }))
                  }
                >
                  <MenuItem value="all">Все · {stockCounts.total}</MenuItem>
                  <MenuItem value="in_stock">В наличии · {stockCounts.inStock}</MenuItem>
                  <MenuItem value="out_of_stock">Нет в наличии · {stockCounts.out}</MenuItem>
                </TextField>
                <Badge badgeContent={activeFilterCount} color="primary">
                  <Button
                    variant="outlined"
                    startIcon={<FilterListIcon fontSize="small" />}
                    onClick={() => setFilterDrawerOpen(true)}
                    sx={{ textTransform: "none", whiteSpace: "nowrap" }}
                  >
                    Ещё
                  </Button>
                </Badge>
              </Box>

              <Box sx={{ px: 1.5, py: 1.25, borderBottom: 1, borderColor: "divider", display: "flex", gap: 1, flexWrap: "wrap" }}>
                {[
                  { v: visiblePositions.length, l: "позиций" },
                  { v: visibleSkuCount, l: "строк учёта" },
                  { v: visiblePositions.filter((x) => !x.single).length, l: "с разрезом", tone: tones.matrix },
                  { v: visiblePositions.reduce((a, x) => a + x.outCount, 0), l: "нет в наличии", tone: tones.danger },
                ].map((m) => (
                  <Box
                    key={m.l}
                    sx={{
                      display: "inline-flex",
                      alignItems: "baseline",
                      gap: "7px",
                      px: "12px",
                      py: "7px",
                      border: 1,
                      borderColor: "divider",
                      borderRadius: "9px",
                      bgcolor: tones.soft,
                    }}
                  >
                    <Box
                      component="b"
                      sx={{
                        fontSize: 16,
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                        color: m.v > 0 ? m.tone : undefined,
                      }}
                    >
                      {m.v}
                    </Box>
                    <Box component="span" sx={{ fontSize: 12, color: "text.disabled" }}>
                      {m.l}
                    </Box>
                  </Box>
                ))}
              </Box>

              {/* Чипы применённых фильтров */}
              {activeFilterChips.length > 0 && (
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  flexWrap="wrap"
                  sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider", gap: 0.75 }}
                >
                  {activeFilterChips.map((c) => (
                    <Chip
                      key={c.key}
                      label={c.label}
                      size="small"
                      onDelete={c.clear}
                      sx={{ borderRadius: "7px" }}
                    />
                  ))}
                  <Button size="small" onClick={handleResetFilters} sx={{ textTransform: "none" }}>
                    Сбросить
                  </Button>
                </Stack>
              )}

              <Box sx={{ overflowY: "auto", flex: 1 }}>
                {loading ? (
                  <ListLoadingSkeleton rows={6} />
                ) : visiblePositions.length === 0 ? (
                  <ListEmptyState
                    icon={<Inventory2OutlinedIcon />}
                    title={products.length === 0 ? "Товаров пока нет" : "Ничего не найдено"}
                    description={
                      products.length === 0
                        ? "Добавьте первый товар, чтобы он появился в каталоге."
                        : "Под текущий поиск или фильтры ничего не подошло."
                    }
                    action={
                      products.length === 0 && canManage ? (
                        <Button variant="contained" size="small" onClick={handleAddClick}>
                          Добавить товар
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <Stack spacing={1} sx={{ p: 1.5 }}>
                    {visiblePositions.map((position) => (
                      <DjangoProductPositionRow
                        key={position.key}
                        position={position}
                        open={openKeys.has(position.key) || searchOpenKeys.has(position.key)}
                        onToggle={() =>
                          setOpenKeys((prev) => {
                            const next = new Set(prev);
                            if (next.has(position.key)) next.delete(position.key);
                            else next.add(position.key);
                            return next;
                          })
                        }
                        selectedProductId={selectedProduct?.id ?? null}
                        onSelectProduct={setSelectedProduct}
                        highlighted={matchedVariantIds(position, searchQuery)}
                      />
                    ))}
                  </Stack>
                )}
              </Box>
            </Paper>
          </Grid2>

          {/* Right Column: Product Details (Desktop) */}
          {!isMobile && (
            <Grid2 size={{ xs: 12, md: 7 }} sx={{ height: "100%" }}>
              <ProductDetailCard
                product={selectedProduct}
                onEdit={() => selectedProduct && handleEditClick(selectedProduct)}
                onDelete={() => selectedProduct && handleDelete(selectedProduct)}
                readOnly={!canManage}
              />
            </Grid2>
          )}
        </Grid2>
      </Box>

      {/* Drawers */}
      <DjangoProductFormDrawer
        open={formDrawerOpen}
        onClose={() => setFormDrawerOpen(false)}
        product={editingProduct}
        onSaved={fetchProducts}
      />

      <ProductFilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filters={filters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        availableCategories={availableCategories}
      />

      {/* Mobile Details BottomSheet */}
      {isMobile && (
        <AppBottomSheet
          open={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
        >
          {selectedProduct && (
            <Box sx={{ p: 2 }}>
              <ProductDetailCard
                product={selectedProduct}
                onEdit={() => handleEditClick(selectedProduct)}
                onDelete={() => handleDelete(selectedProduct)}
                readOnly={!canManage}
              />
            </Box>
          )}
        </AppBottomSheet>
      )}

      {/* Диалог подтверждения удаления товара */}
      <ConfirmDialog />
    </Box>
  );
};

// --- ProductDetailCard Component ---

const ProductDetailCard: React.FC<{
  product: DjangoProduct | null;
  onEdit?: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}> = ({ product, onEdit, onDelete, readOnly }) => {
  const [expanded, setExpanded] = React.useState(false);

  // История цен — ленивая подгрузка при выборе товара.
  const [priceHistory, setPriceHistory] = React.useState<DjangoPriceHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  // Галерея товара — слайдер сам держит текущий слайд.
  const [gallery, setGallery] = React.useState<DjangoProductImage[]>([]);

  // Reset expanded state when product changes
  React.useEffect(() => {
    setExpanded(false);
    setHistoryOpen(false);
    setPriceHistory([]);
  }, [product?.id]);

  // Галерея — подгружаем при выборе товара.
  React.useEffect(() => {
    if (!product) {
      setGallery([]);
      return undefined;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const rows = await getProductGallery(product.id, controller.signal);
        setGallery([...rows].sort((a, b) => a.order - b.order));
      } catch (e) {
        if (isAbortError(e)) return;
        console.error("Failed to load gallery:", e);
        setGallery([]);
      }
    })();
    return () => controller.abort();
  }, [product]);

  // Подгружаем историю цен при первом раскрытии секции.
  React.useEffect(() => {
    if (!historyOpen || !product) return;
    const controller = new AbortController();
    (async () => {
      try {
        setHistoryLoading(true);
        const rows = await getProductPriceHistory(product.id, controller.signal);
        setPriceHistory(rows);
      } catch (e) {
        if (isAbortError(e)) return;
        console.error("Failed to load price history:", e);
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false);
      }
    })();
    return () => controller.abort();
  }, [historyOpen, product]);

  if (!product) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: "14px",
          bgcolor: "background.paper",
        }}
      >
        <ListEmptyState
          icon={<TouchAppOutlinedIcon />}
          title="Выберите товар"
          description="Нажмите на товар в списке слева, чтобы увидеть детали, цену и остаток."
        />
      </Box>
    );
  }

  const isLongDescription = (product.description?.length || 0) > 150;

  return (
    <AppCard
      variant="outlined"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderColor: "divider",
        "&:hover": { boxShadow: "none" },
      }}
      header={
        <Box
          sx={{
            px: 3,
            pt: 2,
            pb: 1.5,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            gap={1}
            flexWrap="wrap"
          >
            <Stack direction="row" alignItems="center" gap={1.25}>
              <Box
                sx={{
                  width: 3,
                  height: 16,
                  borderRadius: 3,
                  bgcolor: "primary.main",
                }}
              />
              <Typography variant="subtitle1" fontWeight={600}>
                Карточка товара
              </Typography>
            </Stack>
            {!readOnly && (
              <Stack
                direction="row"
                spacing={{ xs: 0.5, sm: 1 }}
                alignItems="center"
                flexWrap="wrap"
                sx={{ gap: { xs: 0.5, sm: 1 } }}
              >
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<EditOutlined />}
                  onClick={onEdit}
                >
                  Редактировать
                </Button>
                <Tooltip title="Удалить товар">
                  <IconButton
                    color="error"
                    size="small"
                    onClick={onDelete}
                  >
                    <DeleteOutlineOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Stack>
        </Box>
      }
      disableContentPadding
    >
      <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
        <Grid2 container spacing={3}>
          {/* Left Column: слайдер фотографий. key сбрасывает слайд при смене товара. */}
          <Grid2 size={{ xs: 12, md: 5 }}>
            <DjangoProductImageSlider
              key={product.id}
              images={gallery}
              fallbackUrl={product.imageUrl}
              name={product.name}
            />
          </Grid2>

          {/* Right Column: Info */}
          <Grid2 size={{ xs: 12, md: 7 }}>
            <Stack spacing={2}>
              {/* Название и штрихкод */}
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {product.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Штрихкод: {product.barcode || "—"}
                </Typography>
              </Box>

              {/* Статусы */}
              <Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                  <Chip
                    label={product.isForSale ? "Активен" : "Скрыт"}
                    size="small"
                    sx={{
                      bgcolor: (theme) =>
                        product.isForSale
                          ? alpha(theme.palette.success.main, 0.1)
                          : alpha(theme.palette.text.disabled, 0.1),
                      color: product.isForSale ? "success.dark" : "text.secondary",
                      fontWeight: 600,
                      borderRadius: "7px",
                      border: 0,
                    }}
                  />
                  <Chip
                    label={product.stock > 0 ? "В наличии" : "Нет в наличии"}
                    size="small"
                    sx={{
                      bgcolor: (theme) =>
                        product.stock > 0
                          ? alpha(theme.palette.success.main, 0.1)
                          : alpha(theme.palette.error.main, 0.1),
                      color: product.stock > 0 ? "success.dark" : "error.dark",
                      fontWeight: 600,
                      borderRadius: "7px",
                      border: 0,
                    }}
                  />
                  {product.isInfusion && (
                    <Chip
                      label="Капельница"
                      size="small"
                      sx={{
                        bgcolor: (theme) => alpha(theme.palette.info.main, 0.1),
                        color: "info.dark",
                        fontWeight: 600,
                        borderRadius: "7px",
                        border: 0,
                      }}
                    />
                  )}
                </Stack>
              </Box>

              <Divider sx={{ borderStyle: "dashed" }} />

              {/* Attributes — плитки в стиле карточек проекта */}
              <Box
                sx={{
                  display: "grid",
                  gap: 1.25,
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                }}
              >
                <InfoTile
                  icon={<PaymentsOutlined />}
                  label="Стоимость"
                  value={
                    product.price > 0 ? `${product.price.toLocaleString()} сом` : undefined
                  }
                  active={product.price > 0}
                />
                <InfoTile
                  icon={<Inventory2OutlinedIcon />}
                  label="Остаток"
                  value={`${product.stock ?? 0} ${product.unit || ""}`.trim()}
                  active={(product.stock ?? 0) > 0}
                />
                <InfoTile
                  icon={<StraightenOutlined />}
                  label="Ед. измерения"
                  value={product.unit}
                  active={Boolean(product.unit)}
                />
                <InfoTile
                  icon={<CategoryOutlined />}
                  label="Категория"
                  value={product.category}
                  active={Boolean(product.category)}
                />
              </Box>
            </Stack>
          </Grid2>
        </Grid2>

        <Divider sx={{ borderStyle: "dashed", mt: 3, mb: 2 }} />

        {/* Описание на всю ширину */}
        <Box>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Описание
          </Typography>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              bgcolor: (theme) => alpha(theme.palette.background.default, 0.5),
              borderRadius: "14px",
              border: 1,
              borderColor: "divider",
            }}
          >
            <Collapse in={expanded} collapsedSize={60}>
              <Typography
                variant="body2"
                color="text.primary"
                sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}
              >
                {product.description || "Описание отсутствует"}
              </Typography>
            </Collapse>
            {isLongDescription && (
              <Button
                size="small"
                onClick={() => setExpanded(!expanded)}
                sx={{ mt: 1, textTransform: "none", fontSize: 13, p: 0, minWidth: "auto", "&:hover": { bgcolor: "transparent", textDecoration: "underline" } }}
                disableRipple
              >
                {expanded ? "Свернуть" : "Читать полностью"}
              </Button>
            )}
          </Paper>
        </Box>

        {product.comment && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Комментарий
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
              {product.comment}
            </Typography>
          </Box>
        )}

        {/* История изменения цены */}
        <Box sx={{ mt: 2 }}>
          <Button
            size="small"
            startIcon={<HistoryOutlined fontSize="small" />}
            onClick={() => setHistoryOpen((v) => !v)}
            sx={{ textTransform: "none", px: 0, "&:hover": { bgcolor: "transparent", textDecoration: "underline" } }}
            disableRipple
          >
            {historyOpen ? "Скрыть историю цен" : "История изменения цены"}
          </Button>
          <Collapse in={historyOpen}>
            <Paper
              elevation={0}
              sx={{
                mt: 1,
                p: 1.5,
                bgcolor: (theme) => alpha(theme.palette.background.default, 0.5),
                borderRadius: "14px",
                border: 1,
                borderColor: "divider",
              }}
            >
              {historyLoading ? (
                <Typography variant="body2" color="text.secondary">
                  Загрузка…
                </Typography>
              ) : priceHistory.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  История цен пуста.
                </Typography>
              ) : (
                <Stack divider={<Divider sx={{ borderStyle: "dashed" }} />} spacing={1}>
                  {priceHistory.map((h, i) => (
                    <Stack
                      key={`${h.changedAt}-${i}`}
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      spacing={1}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {h.price.toLocaleString()} сом
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {h.changedByName || "—"}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {dayjs(h.changedAt).format("DD.MM.YYYY HH:mm")}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Paper>
          </Collapse>
        </Box>
      </Box>
    </AppCard>
  );
};

export default DjangoProductsPage;
