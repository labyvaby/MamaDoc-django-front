import React from "react";
import {
  Box,
  Typography,
  Avatar,
  Stack,
  Divider,
  Grid2,
  useMediaQuery,
  Chip,
  IconButton,
  Button,
  ButtonBase,
  alpha,
  Collapse,
  Paper,
  Tooltip,
  Badge,
  TextField,
  MenuItem,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import FilterListIcon from "@mui/icons-material/FilterListOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import TouchAppOutlinedIcon from "@mui/icons-material/TouchAppOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import { PageHeader, AppBottomSheet, AppCard, ListLoadingSkeleton, ListEmptyState } from "../../../components/ui";
import { subtleBg } from "../../../theme";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { useFocusRefetch } from "../../../hooks/useFocusRefetch";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { ApiError, isAbortError } from "../../../api/client";
import {
  getProducts,
  getProductCategories,
  deleteProduct,
  DjangoProduct,
} from "../../../api/warehouse";
import { DjangoProductFormDrawer } from "../../../components/products/django/DjangoProductFormDrawer";
import ProductFilterDrawer, { ProductFilters } from "../../../components/products/ProductFilterDrawer";

/**
 * Состояние остатка для бейджа в строке: нет / мало / есть.
 * Красный — только при нулевом/отрицательном остатке; «мало» — при остатке
 * ≤ минимума (lowStockThreshold, поле бэка — пока может отсутствовать).
 */
type StockState = {
  label: string;
  color: "error" | "warning" | "success";
  icon: React.ReactElement | null;
  out: boolean;
};
const getStockState = (p: DjangoProduct): StockState => {
  const stock = p.stock || 0;
  const unit = p.unit || "шт";
  const min = (p as unknown as { lowStockThreshold?: number }).lowStockThreshold ?? 0;
  if (stock <= 0) {
    return { label: "Нет в наличии", color: "error", icon: <ErrorOutlineOutlined sx={{ fontSize: 14 }} />, out: true };
  }
  if (min > 0 && stock <= min) {
    return { label: `Мало: ${stock} ${unit}`, color: "warning", icon: <WarningAmberOutlined sx={{ fontSize: 14 }} />, out: false };
  }
  return { label: `Остаток: ${stock} ${unit}`, color: "success", icon: null, out: false };
};

const DjangoProductsPage: React.FC = () => {
  usePageTitle("Товары");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { loading: permLoading } = usePermissions();
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
      const data = await getProducts(controller.signal);
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
  }, [notify]);

  const fetchCategories = React.useCallback(async () => {
    try {
      setServerCategories(await getProductCategories());
    } catch (e) {
      if (isAbortError(e)) return;
      // Не критично: фильтр откатится на категории из загруженных товаров.
      console.error("Failed to load categories:", e);
    }
  }, []);

  React.useEffect(() => {
    if (!permLoading && canView) {
      fetchProducts();
      fetchCategories();
    }
  }, [permLoading, canView, fetchProducts, fetchCategories]);

  // Обновление при возврате фокуса — изменения коллег подтянутся без F5.
  useFocusRefetch(() => {
    if (!permLoading && canView) {
      fetchProducts();
      fetchCategories();
    }
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

  const filteredProducts = React.useMemo(() => {
    const list = products.filter((p) => {
      // 1. Text Search
      const q = searchQuery.toLowerCase();
      const matchSearch =
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q));

      if (!matchSearch) return false;

      // 2. Category Filter
      if (filters.category && p.category !== filters.category) return false;

      // 3. Sale Status Filter
      if (filters.saleStatus !== "all") {
        const isActive = p.isForSale ?? true;
        if (filters.saleStatus === "active" && !isActive) return false;
        if (filters.saleStatus === "inactive" && isActive) return false;
      }

      // 4. Stock Filter
      if (filters.stockStatus !== "all") {
        const stock = p.stock || 0;
        if (filters.stockStatus === "in_stock" && stock <= 0) return false;
        if (filters.stockStatus === "out_of_stock" && stock > 0) return false;
      }

      return true;
    });

    // Сортировка
    const sorted = [...list];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    } else if (sortBy === "stock") {
      sorted.sort((a, b) => (b.stock || 0) - (a.stock || 0));
    } else if (sortBy === "price") {
      sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
    }
    return sorted;
  }, [products, searchQuery, filters, sortBy]);

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
        showSearch
        searchVal={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Поиск..."
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
                  Товары ({isFilterActive ? `${filteredProducts.length} из ${products.length}` : products.length})
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
                  <Badge badgeContent={activeFilterCount} color="primary">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<FilterListIcon fontSize="small" />}
                      onClick={() => setFilterDrawerOpen(true)}
                      sx={{ textTransform: "none" }}
                    >
                      Фильтры
                    </Button>
                  </Badge>
                </Stack>
              </Stack>

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
                ) : filteredProducts.length === 0 ? (
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
                    {filteredProducts.map((p) => {
                      const isSelected = selectedProduct?.id === p.id;
                      const stockState = getStockState(p);
                      return (
                        <ButtonBase
                          key={p.id}
                          focusRipple
                          onClick={() => {
                            if (selectedProduct?.id !== p.id) {
                              setSelectedProduct(p);
                            }
                          }}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                            width: "100%",
                            textAlign: "left",
                            p: 1.25,
                            borderRadius: "14px",
                            border: 1,
                            borderColor: isSelected ? "primary.main" : "divider",
                            bgcolor: (theme) =>
                              isSelected ? alpha(theme.palette.primary.main, 0.08) : "background.paper",
                            transition:
                              "border-color .15s ease, background-color .15s ease",
                            "&:hover": {
                              borderColor: (theme) => alpha(theme.palette.primary.main, 0.28),
                              bgcolor: (theme) => subtleBg(theme, true),
                            },
                          }}
                        >
                          {/* Левая часть приглушается, если товара нет в наличии */}
                          <Avatar
                            variant="rounded"
                            src={p.imageUrl || undefined}
                            sx={{
                              flexShrink: 0,
                              width: 48,
                              height: 48,
                              borderRadius: "14px",
                              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                              color: "primary.onSurface",
                              opacity: stockState.out ? 0.55 : 1,
                            }}
                          >
                            {p.name.charAt(0) || <Inventory2OutlinedIcon fontSize="small" />}
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0, opacity: stockState.out ? 0.55 : 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                              {p.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap display="block">
                              {p.category ? `${p.category} • ` : ""}
                              {p.barcode || "—"}
                            </Typography>
                          </Box>
                          <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                            {p.price > 0 && (
                              <Typography variant="body2" color="text.secondary">
                                {p.price.toLocaleString()} сом
                              </Typography>
                            )}
                            <Chip
                              size="small"
                              icon={stockState.icon ?? undefined}
                              label={stockState.label}
                              sx={{
                                height: 22,
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                borderRadius: "7px",
                                bgcolor: (theme) => alpha(theme.palette[stockState.color].main, 0.12),
                                color: `${stockState.color}.main`,
                                "& .MuiChip-icon": { color: `${stockState.color}.main`, ml: 0.5 },
                                "& .MuiChip-label": { px: 0.75 },
                              }}
                            />
                          </Stack>
                        </ButtonBase>
                      );
                    })}
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

  // Reset expanded state when product changes
  React.useEffect(() => {
    setExpanded(false);
  }, [product?.id]);

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
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: { xs: 1, sm: 2 },
              flexWrap: "wrap",
              pr: { xs: 0, sm: 0 },
            }}
          >
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
                    sx={(theme) => ({
                      border: "1px solid",
                      borderColor: "error.main",
                      "&:hover": {
                        borderColor: "error.dark",
                        backgroundColor: alpha(theme.palette.error.main, 0.08),
                      },
                    })}
                  >
                    <DeleteOutlineOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Box>
        </Box>
      }
      disableContentPadding
    >
      <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
        <Grid2 container spacing={3}>
          {/* Left Column: Image */}
          <Grid2 size={{ xs: 12, md: 5 }}>
            <Avatar
              variant="rounded"
              src={product.imageUrl || undefined}
              sx={{
                width: "100%",
                height: "auto",
                aspectRatio: "1/1",
                bgcolor: (theme) => alpha(theme.palette.action.hover, 0.5),
                border: 1,
                borderColor: "divider",
                borderRadius: "14px",
              }}
            >
              <Typography variant="h3" color="text.secondary">
                {product.name.charAt(0)}
              </Typography>
            </Avatar>
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

              {/* Attributes Grid */}
              <Grid2 container spacing={2}>
                <Grid2 size={6}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Стоимость
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {product.price > 0 ? `${product.price.toLocaleString()} сом` : "—"}
                  </Typography>
                </Grid2>
                <Grid2 size={6}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Остаток
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {product.stock ?? 0} {product.unit}
                  </Typography>
                </Grid2>
                <Grid2 size={6}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Ед. измерения
                  </Typography>
                  <Typography variant="body2">
                    {product.unit || "—"}
                  </Typography>
                </Grid2>
                <Grid2 size={6}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Категория
                  </Typography>
                  <Typography variant="body2">
                    {product.category || "—"}
                  </Typography>
                </Grid2>
              </Grid2>
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
      </Box>
    </AppCard>
  );
};

export default DjangoProductsPage;
