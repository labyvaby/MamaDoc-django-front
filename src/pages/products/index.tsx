import React from "react";
import {
  Box,
  Typography,
  List,
  ListItemButton,
  Avatar,
  Stack,
  Divider,
  Grid2,
  useMediaQuery,
  Chip,
  CircularProgress,
  IconButton,
  Button,
  alpha,
  Collapse,
  Paper,
  Tooltip,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import FilterListIcon from "@mui/icons-material/FilterList";
import { supabase } from "../../utility/supabaseClient";

import { PageHeader, AppBottomSheet, AppCard } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { getProducts, deleteProduct, type Product } from "../../services/products";
import { AddProductDrawer } from "../../components/products/AddProductDrawer";
import { EditProductDrawer } from "../../components/products/EditProductDrawer";
import ProductFilterDrawer, { ProductFilters } from "../../components/products/ProductFilterDrawer";
import { usePermissions } from "../../hooks/usePermissions";

const ProductsPage: React.FC = () => {
  usePageTitle("Товары");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { isNurse: isNurseFunc, isAdmin: isAdminFunc } = usePermissions();
  // const isNurse = isNurseFunc();
  const isAdmin = isAdminFunc();

  // Drawers
  const [addDrawerOpen, setAddDrawerOpen] = React.useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);

  // Filter Drawer
  const [filterDrawerOpen, setFilterDrawerOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<ProductFilters>({
    category: null,
    saleStatus: "all",
    stockStatus: "all",
  });

  // Data state
  const [products, setProducts] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Selection state (Desktop & Mobile)
  // On desktop, we select a product to show in the right column.
  // On mobile, selecting a product opens the bottom sheet.
  // We can use a single state variable for the currently "active" product.
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);

  const fetchProducts = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await getProducts();
      setProducts(data);
    } catch (e) {
      console.error("Failed to load products:", e);
      notify?.({ type: "error", message: "Не удалось загрузить список товаров" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  React.useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // REALTIME: Подписка на изменения товаров, цен, остатков и признаков активности
  React.useEffect(() => {
    const channel = supabase
      .channel("products-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Products" },
        () => {
          console.log("Realtime: Products changed, reloading...");
          fetchProducts();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "SellableItems" },
        () => {
          console.log("Realtime: SellableItems changed, reloading...");
          fetchProducts();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Prices" },
        () => {
          console.log("Realtime: Prices changed, reloading...");
          fetchProducts();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "StockMovements" },
        () => {
          console.log("Realtime: Stock changed, reloading...");
          fetchProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProducts]);

  // Auto-select first product on desktop if none selected
  React.useEffect(() => {
    if (!isMobile && products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0]);
    }
  }, [isMobile, products, selectedProduct]);

  const handleDelete = async (p: Product) => {
    const confirmed = await confirm({
      title: "Удалить товар?",
      message: `Вы уверены, что хотите удалить "${p.name}"? Это действие нельзя отменить.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
      variant: "error",
    });

    if (!confirmed) return;

    try {
      await deleteProduct(p.sellable_item_id);

      // If deleted product was selected, clear selection
      if (selectedProduct?.sellable_item_id === p.sellable_item_id) {
        setSelectedProduct(null);
      }

      await fetchProducts();

      notify?.({ type: "success", message: "Товар удален" });
    } catch (err: unknown) {
      console.error("Delete failed:", err);
      const message = typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : "";
      if (message === "ARCHIVED") {
        notify?.({ type: "success", message: "Товар перемещен в архив (есть история продаж)" });
        await fetchProducts();
        setSelectedProduct(null);
      } else {
        notify?.({ type: "error", message: "Не удалось удалить товар" });
      }
    }
  };

  const handleProductCreated = () => {
    fetchProducts();
  };

  const handleProductUpdated = () => {
    fetchProducts();
  };

  const handleEditClick = (p: Product) => {
    setEditingProduct(p);
    setEditDrawerOpen(true);
  };

  // Filtering Logic
  // Extract unique categories for filter
  const availableCategories = React.useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [products]);

  const filteredProducts = React.useMemo(() => {
    return products.filter((p) => {
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
        const isActive = p.is_for_sale ?? true;
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
  }, [products, searchQuery, filters]);

  // Handlers for Filter Drawer
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

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        // bgcolor: "#F4F6F8",
      }}
    >
      {/* Page Header */}
      <PageHeader
        title="Товары"
        showTitle={false}
        addButtonText={isAdmin ? "Добавить товар" : undefined}
        onAdd={isAdmin ? () => setAddDrawerOpen(true) : undefined}
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
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Товары
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => setFilterDrawerOpen(true)}
                    sx={{
                      color: isFilterActive ? "primary.onSurface" : "text.secondary",
                      bgcolor: isFilterActive ? "primary.lighter" : "transparent",
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>

              <Box sx={{ overflowY: "auto", flex: 1 }}>
                {loading ? (
                  <Box sx={{ p: 4, textAlign: "center" }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : filteredProducts.length === 0 ? (
                  <Box sx={{ p: 4, textAlign: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      {products.length === 0 ? "Список товаров пуст" : "Ничего не найдено"}
                    </Typography>
                  </Box>
                ) : (
                  <List sx={{ py: 0.5 }}>
                    {filteredProducts.map((p) => (
                      <ListItemButton
                        key={p.sellable_item_id}
                        onClick={() => {
                          if (selectedProduct?.sellable_item_id !== p.sellable_item_id) {
                            setSelectedProduct(p);
                          }
                        }}
                        selected={selectedProduct?.sellable_item_id === p.sellable_item_id}
                        sx={{
                          px: 2,
                          py: 1.5,
                          borderBottom: 1,
                          borderColor: "divider",
                          "&.Mui-selected": { bgcolor: "action.selected" },
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <Avatar
                          variant="rounded"
                          src={p.image_url}
                          sx={{
                            mr: 2,
                            width: 48,
                            height: 48,
                            bgcolor: "action.selected",
                            color: "text.secondary",
                          }}
                        >
                          {p.name.charAt(0)}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body1" sx={{ fontWeight: 500 }} noWrap>
                            {p.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {p.category ? `${p.category} • ` : ""}
                            {p.barcode || "-"}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: "right" }}>
                          {p.price && (
                            <Typography variant="body2" fontWeight={600}>
                              {p.price.toLocaleString()}
                            </Typography>
                          )}
                          {p.stock !== undefined && (
                            <Typography variant="caption" color={p.stock > 0 ? "success.main" : "error.main"}>
                              {p.stock} {p.unit}
                            </Typography>
                          )}
                        </Box>
                      </ListItemButton>
                    ))}
                  </List>
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
                readOnly={!isAdmin}
              />
            </Grid2>
          )}
        </Grid2>
      </Box>

      {/* Drawers */}
      <AddProductDrawer
        open={addDrawerOpen}
        onClose={() => setAddDrawerOpen(false)}
        onCreated={handleProductCreated}
      />

      <EditProductDrawer
        open={editDrawerOpen}
        onClose={() => setEditDrawerOpen(false)}
        product={editingProduct}
        onUpdated={handleProductUpdated}
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
                readOnly={!isAdmin}
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
  product: Product | null;
  onEdit?: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}> = ({ product, onEdit, onDelete, readOnly }) => {
  const [expanded, setExpanded] = React.useState(false);

  // Reset expanded state when product changes
  React.useEffect(() => {
    setExpanded(false);
  }, [product?.sellable_item_id]);

  if (!product) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 4,
          color: "text.secondary",
          bgcolor: "background.paper",
        }}
      >
        <Typography>Выберите товар для просмотра</Typography>
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
                    sx={{
                      border: '1px solid',
                      borderColor: 'error.main',
                      '&:hover': {
                        borderColor: 'error.dark',
                        backgroundColor: 'rgba(211, 47, 47, 0.08)',
                      }
                    }}
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
              src={product.image_url}
              sx={{
                width: "100%",
                height: "auto",
                aspectRatio: "1/1",
                bgcolor: (theme) => alpha(theme.palette.action.hover, 0.5),
                border: 1,
                borderColor: "divider",
                borderRadius: 4,
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
                    label={product.is_for_sale ? "Активен" : "Скрыт"}
                    size="small"
                    sx={{
                      bgcolor: (theme) =>
                        product.is_for_sale
                          ? alpha(theme.palette.success.main, 0.1)
                          : alpha(theme.palette.text.disabled, 0.1),
                      color: product.is_for_sale ? "success.dark" : "text.secondary",
                      fontWeight: 600,
                      borderRadius: 1.5,
                      border: 0,
                    }}
                  />
                  <Chip
                    label={product.stock && product.stock > 0 ? "В наличии" : "Нет в наличии"}
                    size="small"
                    sx={{
                      bgcolor: (theme) =>
                        product.stock && product.stock > 0
                          ? alpha(theme.palette.success.main, 0.1)
                          : alpha(theme.palette.error.main, 0.1),
                      color: product.stock && product.stock > 0 ? "success.dark" : "error.dark",
                      fontWeight: 600,
                      borderRadius: 1.5,
                      border: 0,
                    }}
                  />
                  {product.is_infusion && (
                    <Chip
                      label="Капельница"
                      size="small"
                      sx={{
                        bgcolor: (theme) => alpha(theme.palette.info.main, 0.1),
                        color: "info.dark",
                        fontWeight: 600,
                        borderRadius: 1.5,
                        border: 0,
                      }}
                    />
                  )}
                </Stack>
              </Box>

              <Divider sx={{ borderStyle: 'dashed' }} />

              {/* Attributes Grid */}
              <Grid2 container spacing={2}>
                <Grid2 size={6}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Стоимость
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {product.price ? `${product.price.toLocaleString()} сом` : "—"}
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

        <Divider sx={{ borderStyle: 'dashed', mt: 3, mb: 2 }} />

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
              borderRadius: 2,
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
                sx={{ mt: 1, textTransform: "none", fontSize: 13, p: 0, minWidth: 'auto', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
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

export default ProductsPage;
