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
  Checkbox,
  Menu,
  ListItemIcon,
  ListItemText,
  LinearProgress,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import FilterListIcon from "@mui/icons-material/FilterListOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import TouchAppOutlinedIcon from "@mui/icons-material/TouchAppOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import CloseIcon from "@mui/icons-material/Close";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import SellOutlined from "@mui/icons-material/SellOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import dayjs from "dayjs";

import { PageHeader, AppBottomSheet, AppCard, ListLoadingSkeleton, ListEmptyState, InfoTile, SelectionMark, selectionHintHoverSx } from "../../../components/ui";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import { subtleBg } from "../../../theme";
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
  getProductCostPrice,
  deleteProduct,
  updateProduct,
  getProductCategoryTree,
  DjangoProduct,
  DjangoProductCategoryNode,
  DjangoPriceHistoryEntry,
  DjangoProductImage,
} from "../../../api/warehouse";
import { formatKGS } from "../../../utility/format";
import { DjangoProductFormDrawer } from "../../../components/products/django/DjangoProductFormDrawer";
import { DjangoProductImageSlider } from "../../../components/products/django/DjangoProductImageSlider";
import ProductFilterDrawer, { ProductFilters } from "../../../components/products/ProductFilterDrawer";
import { describeFailures, runBulk, toggleSelection, type BulkResult } from "../../../utility/bulkSelection";
import { GroupSelectButton } from "../../../components/storage/GroupSelectButton";
import { BulkCategoryDialog, BulkPriceDialog, type CategoryChoice } from "./BulkProductDialogs";
import { exportProductsXlsx } from "./exportProductsXlsx";
import { PrintLabelsDialog, type LabelPrintItem } from "../../../components/products/PrintLabelsDialog";
import { priceTagFromProduct } from "../../../utility/productLabels";
import { PRINTFORMS_PERMISSIONS } from "../../../api/printforms";
import { useLongPress } from "../../../hooks/useLongPress";
import { hapticTap } from "../../../utility/haptics";

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
  /** Приглушённый нейтральный бейдж (строка и так затемнена). */
  muted: boolean;
};
const getStockState = (p: DjangoProduct): StockState => {
  const stock = p.stock || 0;
  const unit = p.unit || "шт";
  const min = (p as unknown as { lowStockThreshold?: number }).lowStockThreshold ?? 0;
  if (stock <= 0) {
    return { label: "Нет в наличии", color: "error", icon: null, out: true, muted: true };
  }
  if (min > 0 && stock <= min) {
    return { label: `Мало: ${stock} ${unit}`, color: "warning", icon: <WarningAmberOutlined sx={{ fontSize: 14 }} />, out: false, muted: false };
  }
  return { label: `${stock} ${unit}`, color: "success", icon: null, out: false, muted: false };
};

/** Сколько строк списка товаров дорисовывается за раз. */
const LIST_PAGE = 100;

const DjangoProductsPage: React.FC = () => {
  usePageTitle("Товары");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { loading: permLoading, activeOrganization, activeBranch } = usePermissions();
  const isRetail = activeOrganization?.vertical === "retail";
  // Орг-контекст обязателен суперпользователю/мультиорг-аккаунту.
  const orgId = useApiOrgId();
  const canView = useCan(["warehouse.view", "warehouse.sales.view"]);
  const canManage = useCan("warehouse.manage");
  const canViewCost = useCan("procurement.view");
  const canPrintLabels = useCan(PRINTFORMS_PERMISSIONS.print);

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

  // Массовый выбор: отдельно от «открытого» товара справа. Якорь — последняя
  // строка, отмеченная без Shift, от неё считается диапазон.
  const [checkedIds, setCheckedIds] = React.useState<Set<number>>(() => new Set());
  const anchorIdRef = React.useRef<number | null>(null);
  const [bulkMenuAnchor, setBulkMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [bulkProgress, setBulkProgress] = React.useState<{ label: string; done: number; total: number } | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = React.useState(false);
  const [categoryTree, setCategoryTree] = React.useState<DjangoProductCategoryNode[] | null>(null);
  // Этикетки: одна карточка или выбранные строки; null — окно закрыто.
  const [labelItems, setLabelItems] = React.useState<LabelPrintItem[] | null>(null);

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
      // Удалённые и ушедшие в архив товары из выбора выпадают.
      setCheckedIds((prev) => {
        if (prev.size === 0) return prev;
        const alive = new Set(data.map((p) => p.id));
        const next = new Set([...prev].filter((id) => alive.has(id)));
        return next.size === prev.size ? prev : next;
      });
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

  // Realtime: изменения товаров коллегами (создание/правка/архив/фото)
  // подтягиваются мгновенно по /ws/changes/; focus-refetch выше остаётся
  // страховкой на случай обрыва сокета.
  useRealtimeRefetch({
    entities: ["product"],
    onEvent: () => {
      if (!permLoading && canView) {
        fetchProducts();
        fetchCategories();
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

  const filteredProducts = React.useMemo(() => {
    const list = products.filter((p) => {
      // 1. Text Search
      const q = searchQuery.toLowerCase();
      const matchSearch =
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        // Бренд-свойство, а не часть названия — как в поиске кассы.
        (p.attributes ?? []).some(
          (a) => a.role === "generic" && /^(бренд|brand)$/i.test(a.attributeName.trim()) && a.value.toLowerCase().includes(q),
        );

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

  // Сводка по наличию — для чипов-фильтров над списком.
  const stockCounts = React.useMemo(() => {
    let out = 0;
    for (const p of products) {
      if ((p.stock || 0) <= 0) out += 1;
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

  // ── Массовый выбор и действия ──
  const visibleIds = React.useMemo(() => filteredProducts.map((p) => p.id), [filteredProducts]);

  // Строки рисуются порциями: каталог в тысячи карточек (у «Монограм» 6700)
  // целиком — это десятки тысяч MUI-узлов и секунды на каждый ввод в поиск.
  // Следующая порция — когда низ списка подходит к краю прокрутки.
  const [renderLimit, setRenderLimit] = React.useState(LIST_PAGE);
  const listScrollRef = React.useRef<HTMLDivElement>(null);
  const listSentinelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => setRenderLimit(LIST_PAGE), [filteredProducts]);
  const renderedProducts = React.useMemo(
    () => filteredProducts.slice(0, renderLimit),
    [filteredProducts, renderLimit],
  );
  const hasMoreRows = renderLimit < filteredProducts.length;
  React.useEffect(() => {
    const node = listSentinelRef.current;
    if (!node || !hasMoreRows) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRenderLimit((n) => n + LIST_PAGE);
        }
      },
      { root: listScrollRef.current, rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreRows, renderLimit]);
  // В порядке списка на экране (так же уйдут в Excel), скрытые фильтром — в конце.
  const checkedProducts = React.useMemo(() => {
    const visible = filteredProducts.filter((p) => checkedIds.has(p.id));
    const shown = new Set(visible.map((p) => p.id));
    return [...visible, ...products.filter((p) => checkedIds.has(p.id) && !shown.has(p.id))];
  }, [filteredProducts, products, checkedIds]);
  const visibleCheckedCount = visibleIds.filter((id) => checkedIds.has(id)).length;
  const allVisibleChecked = visibleIds.length > 0 && visibleCheckedCount === visibleIds.length;
  const hiddenCheckedCount = checkedIds.size - visibleCheckedCount;
  const checkedTotals = React.useMemo(() => {
    let value = 0;
    for (const p of checkedProducts) value += p.price * Math.max(0, p.stock || 0);
    return { value };
  }, [checkedProducts]);
  const bulkBusy = bulkProgress !== null;
  const hasChecked = checkedIds.size > 0;

  const toggleChecked = (id: number, shift: boolean) => {
    setCheckedIds((prev) => toggleSelection(prev, visibleIds, id, anchorIdRef.current, shift));
    if (!shift) anchorIdRef.current = id;
  };

  const toggleAllVisible = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (allVisibleChecked) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    anchorIdRef.current = null;
  };

  // Долгое нажатие включает выбор и отмечает строку (повторное — не снимает).
  const startSelection = (id: number) => {
    setCheckedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    anchorIdRef.current = id;
  };
  const longPress = useLongPress((id) => {
    hapticTap();
    startSelection(id);
  }, !bulkBusy);

  // Группа (категория/бренд/сезон) отмечается разом; Shift-диапазон после
  // неё считается заново.
  const setGroupChecked = (next: Set<number>) => {
    setCheckedIds(next);
    anchorIdRef.current = null;
  };

  const clearChecked = () => {
    setCheckedIds(new Set());
    anchorIdRef.current = null;
  };

  const nameOf = (id: number) => products.find((p) => p.id === id)?.name ?? `#${id}`;

  /** Прогоняет действие по выбранным, сообщает итог и оставляет выбранными только сбойные. */
  const runBulkAction = async (
    label: string,
    ids: number[],
    action: (id: number) => Promise<unknown>,
    successMessage: (result: BulkResult) => string,
  ) => {
    setBulkMenuAnchor(null);
    if (ids.length === 0) {
      notify?.({ type: "success", message: "Менять нечего — у выбранных товаров уже так" });
      return;
    }
    setBulkProgress({ label, done: 0, total: ids.length });
    const result = await runBulk(ids, action, {
      onProgress: (done) => setBulkProgress({ label, done, total: ids.length }),
    });
    setBulkProgress(null);
    await fetchProducts();
    if (result.failed.length === 0) {
      notify?.({ type: "success", message: successMessage(result) });
      clearChecked();
    } else {
      setCheckedIds(new Set(result.failed.map((f) => f.id)));
      notify?.({
        type: "error",
        message: `Готово ${result.done.length} из ${ids.length}. Не получилось: ${describeFailures(result.failed, nameOf)}`,
      });
    }
  };

  const handleBulkSaleStatus = (isForSale: boolean) => {
    const ids = checkedProducts.filter((p) => (p.isForSale ?? true) !== isForSale).map((p) => p.id);
    void runBulkAction(
      isForSale ? "Включаю в продажу" : "Скрываю из продажи",
      ids,
      (id) => updateProduct(id, { isForSale }),
      (r) => `${isForSale ? "В продаже" : "Скрыто из продажи"}: ${r.done.length}`,
    );
  };

  const openCategoryDialog = async () => {
    setBulkMenuAnchor(null);
    if (isRetail) {
      try {
        setCategoryTree(await getProductCategoryTree(undefined, orgId));
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Не удалось загрузить категории";
        notify?.({ type: "error", message });
        return;
      }
    } else {
      setCategoryTree(null);
    }
    setCategoryDialogOpen(true);
  };

  const handleBulkCategory = (choice: CategoryChoice) => {
    setCategoryDialogOpen(false);
    const ids = checkedProducts
      .filter((p) => ("categoryId" in choice ? p.categoryId !== choice.categoryId : p.category !== choice.name))
      .map((p) => p.id);
    void runBulkAction(
      "Меняю категорию",
      ids,
      (id) =>
        updateProduct(
          id,
          "categoryId" in choice ? { categoryId: choice.categoryId, category: choice.name } : { category: choice.name },
        ),
      (r) => `Категория «${choice.name}» у ${r.done.length} товаров`,
    );
  };

  const handleBulkPrice = (prices: Map<number, number>) => {
    setPriceDialogOpen(false);
    void runBulkAction(
      "Меняю цены",
      [...prices.keys()],
      (id) => updateProduct(id, { price: prices.get(id) }),
      (r) => `Цена изменена у ${r.done.length} товаров`,
    );
  };

  const handleBulkExport = async () => {
    setBulkMenuAnchor(null);
    try {
      await exportProductsXlsx(checkedProducts);
    } catch (e) {
      console.error("Export failed:", e);
      notify?.({ type: "error", message: "Не удалось выгрузить файл" });
    }
  };

  const toLabelItem = (p: DjangoProduct): LabelPrintItem => ({
    productId: p.id,
    stock: p.stock || 0,
    preview: priceTagFromProduct(p),
  });

  const handleBulkLabels = () => {
    setBulkMenuAnchor(null);
    setLabelItems(checkedProducts.map(toLabelItem));
  };

  const handleBulkDelete = async () => {
    setBulkMenuAnchor(null);
    const ids = checkedProducts.map((p) => p.id);
    const confirmed = await confirm({
      title: `Удалить товары (${ids.length})?`,
      message:
        "Товары с историей движений и продаж уйдут в архив, остальные удалятся насовсем. Действие нельзя отменить.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      variant: "error",
    });
    if (!confirmed) return;
    let archived = 0;
    void runBulkAction(
      "Удаляю",
      ids,
      async (id) => {
        if (await deleteProduct(id)) archived += 1;
      },
      (r) =>
        archived > 0
          ? `Удалено: ${r.done.length - archived}, в архив: ${archived}`
          : `Удалено товаров: ${r.done.length}`,
    );
  };

  // Один и тот же ключ в обеих шапках: при первом выборе шапка меняется,
  // а окно групп остаётся открытым — можно отметить несколько групп подряд.
  const groupSelect = (
    <GroupSelectButton
      key="group-select"
      items={filteredProducts}
      checkedIds={checkedIds}
      onCheckedChange={setGroupChecked}
      disabled={loading || bulkBusy}
      layoutId="products-group-select"
    />
  );

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
              {/* Шапка списка. Пока что-то выбрано, на её месте — панель
                  массовых действий той же высоты: список не прыгает, и
                  следующий клик (в том числе с Shift) попадает в свою строку. */}
              <Box
                sx={(t) => ({
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 1,
                  minHeight: 64,
                  px: 1.5,
                  py: 1.5,
                  borderBottom: 1,
                  borderColor: "divider",
                  bgcolor: hasChecked
                    ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06)
                    : undefined,
                })}
              >
                {hasChecked && (
                <Tooltip title={allVisibleChecked ? "Снять выбор" : "Выбрать все в списке"}>
                  <span>
                    <Checkbox
                      size="small"
                      checked={allVisibleChecked}
                      indeterminate={visibleCheckedCount > 0 && !allVisibleChecked}
                      disabled={loading || bulkBusy || visibleIds.length === 0}
                      onChange={toggleAllVisible}
                      inputProps={{ "aria-label": "Выбрать все товары в списке" }}
                      sx={{ ml: -0.5, p: 0.5 }}
                    />
                  </span>
                </Tooltip>
                )}
                {hasChecked ? (
                  <>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        Выбрано: {checkedIds.size}
                        {hiddenCheckedCount > 0 && (
                          <Typography component="span" variant="body2" color="text.secondary">
                            {` (${hiddenCheckedCount} скрыто фильтром)`}
                          </Typography>
                        )}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {bulkProgress
                          ? `${bulkProgress.label}… ${bulkProgress.done} из ${bulkProgress.total}`
                          : `Остаток на ${Math.round(checkedTotals.value).toLocaleString()} сом`}
                      </Typography>
                    </Box>
                    {groupSelect}
                    <Button
                      size="small"
                      variant="contained"
                      endIcon={<MoreHorizIcon fontSize="small" />}
                      disabled={bulkBusy}
                      onClick={(e) => setBulkMenuAnchor(e.currentTarget)}
                      sx={{ textTransform: "none", flexShrink: 0 }}
                    >
                      Действия
                    </Button>
                    <Tooltip title="Снять выбор">
                      <span>
                        <IconButton size="small" disabled={bulkBusy} onClick={clearChecked} aria-label="Снять выбор">
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </>
                ) : (
                  <>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                      Товары ({isFilterActive ? `${filteredProducts.length} из ${products.length}` : products.length})
                    </Typography>
                    {groupSelect}
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
                  </>
                )}
                {bulkProgress && (
                  <LinearProgress
                    variant="determinate"
                    value={(bulkProgress.done / bulkProgress.total) * 100}
                    sx={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3 }}
                  />
                )}
                <Menu
                  anchorEl={bulkMenuAnchor}
                  open={Boolean(bulkMenuAnchor)}
                  onClose={() => setBulkMenuAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  {canManage && [
                    <MenuItem key="on" onClick={() => handleBulkSaleStatus(true)}>
                      <ListItemIcon><VisibilityOutlined fontSize="small" /></ListItemIcon>
                      <ListItemText>Включить в продажу</ListItemText>
                    </MenuItem>,
                    <MenuItem key="off" onClick={() => handleBulkSaleStatus(false)}>
                      <ListItemIcon><VisibilityOffOutlined fontSize="small" /></ListItemIcon>
                      <ListItemText>Скрыть из продажи</ListItemText>
                    </MenuItem>,
                    <MenuItem key="cat" onClick={() => void openCategoryDialog()}>
                      <ListItemIcon><CategoryOutlined fontSize="small" /></ListItemIcon>
                      <ListItemText>Сменить категорию</ListItemText>
                    </MenuItem>,
                    <MenuItem
                      key="price"
                      onClick={() => {
                        setBulkMenuAnchor(null);
                        setPriceDialogOpen(true);
                      }}
                    >
                      <ListItemIcon><SellOutlined fontSize="small" /></ListItemIcon>
                      <ListItemText>Изменить цену</ListItemText>
                    </MenuItem>,
                  ]}
                  {canPrintLabels && (
                    <MenuItem onClick={handleBulkLabels}>
                      <ListItemIcon><PrintOutlined fontSize="small" /></ListItemIcon>
                      <ListItemText>Печать этикеток</ListItemText>
                    </MenuItem>
                  )}
                  <MenuItem onClick={() => void handleBulkExport()}>
                    <ListItemIcon><FileDownloadOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText>Выгрузить в Excel</ListItemText>
                  </MenuItem>
                  {canManage && <Divider />}
                  {canManage && (
                    <MenuItem onClick={() => void handleBulkDelete()} sx={{ color: "error.main" }}>
                      <ListItemIcon><DeleteOutlineOutlined fontSize="small" color="error" /></ListItemIcon>
                      <ListItemText>Удалить</ListItemText>
                    </MenuItem>
                  )}
                </Menu>
              </Box>

              {/* Сводка по наличию — кликабельные чипы-фильтры */}
              <Stack
                direction="row"
                gap={0.75}
                flexWrap="wrap"
                sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}
              >
                {([
                  { value: "all" as const, label: "Все", count: stockCounts.total, tone: null },
                  { value: "in_stock" as const, label: "В наличии", count: stockCounts.inStock, tone: "success" as const },
                  { value: "out_of_stock" as const, label: "Нет в наличии", count: stockCounts.out, tone: "error" as const },
                ]).map((o) => {
                  const active = filters.stockStatus === o.value;
                  const accent = o.tone ? theme.palette[o.tone].main : theme.palette.primary.main;
                  const accentText = o.tone
                    ? theme.palette.mode === "dark"
                      ? theme.palette[o.tone].light
                      : theme.palette[o.tone].dark
                    : "primary.onSurface";
                  return (
                    <Chip
                      key={o.value}
                      size="small"
                      clickable
                      onClick={() => setFilters((f) => ({ ...f, stockStatus: o.value }))}
                      label={`${o.label} · ${o.count}`}
                      sx={(t) => ({
                        height: 26,
                        borderRadius: "8px",
                        fontWeight: 500,
                        border: 1,
                        borderColor: active ? alpha(accent, 0.4) : "divider",
                        color: active ? accentText : "text.secondary",
                        bgcolor: active
                          ? alpha(accent, t.palette.mode === "dark" ? 0.16 : 0.08)
                          : "transparent",
                        "&:hover": {
                          bgcolor: active
                            ? alpha(accent, t.palette.mode === "dark" ? 0.22 : 0.12)
                            : subtleBg(t, true),
                        },
                      })}
                    />
                  );
                })}
              </Stack>

              {/* Категории — горизонтальная лента чипов */}
              {availableCategories.length > 0 && (
                <Box
                  sx={{
                    px: 1.5,
                    py: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    display: "flex",
                    gap: 0.75,
                    overflowX: "auto",
                    scrollbarWidth: "none",
                    "&::-webkit-scrollbar": { display: "none" },
                  }}
                >
                  <Chip
                    size="small"
                    clickable
                    label="Все категории"
                    onClick={() => setFilters((f) => ({ ...f, category: null }))}
                    sx={(t) => ({
                      height: 26,
                      borderRadius: "8px",
                      fontWeight: 500,
                      flexShrink: 0,
                      border: 1,
                      borderColor: !filters.category ? alpha(t.palette.primary.main, 0.4) : "divider",
                      color: !filters.category ? "primary.onSurface" : "text.secondary",
                      bgcolor: !filters.category
                        ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08)
                        : "transparent",
                    })}
                  />
                  {availableCategories.map((cat) => {
                    const active = filters.category === cat;
                    return (
                      <Chip
                        key={cat}
                        size="small"
                        clickable
                        label={cat}
                        onClick={() =>
                          setFilters((f) => ({ ...f, category: f.category === cat ? null : cat }))
                        }
                        sx={(t) => ({
                          height: 26,
                          borderRadius: "8px",
                          fontWeight: 500,
                          flexShrink: 0,
                          border: 1,
                          borderColor: active ? alpha(t.palette.primary.main, 0.4) : "divider",
                          color: active ? "primary.onSurface" : "text.secondary",
                          bgcolor: active
                            ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08)
                            : "transparent",
                          "&:hover": {
                            bgcolor: active
                              ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.22 : 0.12)
                              : subtleBg(t, true),
                          },
                        })}
                      />
                    );
                  })}
                </Box>
              )}

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

              <Box ref={listScrollRef} sx={{ overflowY: "auto", flex: 1 }}>
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
                    {renderedProducts.map((p) => {
                      const isChecked = checkedIds.has(p.id);
                      const isSelected = selectedProduct?.id === p.id;
                      const stockState = getStockState(p);
                      return (
                        <ButtonBase
                          key={p.id}
                          focusRipple
                          {...longPress.bind(p.id)}
                          role={hasChecked ? "checkbox" : undefined}
                          aria-checked={hasChecked ? isChecked : undefined}
                          // Shift-клик иначе выделяет текст строк вместо диапазона.
                          onMouseDown={(e: React.MouseEvent) => {
                            if (e.shiftKey) e.preventDefault();
                          }}
                          onClick={(e: React.MouseEvent) => {
                            // Хвост долгого нажатия: отметку оно уже поставило.
                            if (longPress.consumeClick()) return;
                            // Как в галерее: пока идёт выбор, тап отмечает строку.
                            // Ctrl/Cmd/Shift-клик — то же с мыши, без долгого нажатия.
                            if (hasChecked || e.ctrlKey || e.metaKey || e.shiftKey) {
                              if (!bulkBusy) toggleChecked(p.id, e.shiftKey);
                              return;
                            }
                            if (selectedProduct?.id !== p.id) {
                              setSelectedProduct(p);
                            }
                          }}
                          sx={{
                            // Долгое касание не должно выделять текст и звать
                            // системное меню iOS.
                            userSelect: "none",
                            WebkitUserSelect: "none",
                            WebkitTouchCallout: "none",
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                            width: "100%",
                            textAlign: "left",
                            p: 1.25,
                            borderRadius: "14px",
                            border: 1,
                            borderColor: isSelected ? "primary.main" : isChecked ? (theme) => alpha(theme.palette.primary.main, 0.4) : "divider",
                            bgcolor: (theme) =>
                              isChecked ? alpha(theme.palette.primary.main, 0.08) : "background.paper",
                            transition:
                              "border-color .15s ease, background-color .15s ease",
                            ...selectionHintHoverSx,
                            "&:hover": {
                              borderColor: (theme) => alpha(theme.palette.primary.main, 0.28),
                              bgcolor: (theme) => subtleBg(theme, true),
                            },
                          }}
                        >
                          {/* Фото; в режиме выбора поверх него — отметка, как в галерее.
                              Левая часть приглушается, если товара нет в наличии. */}
                          <Box sx={{ position: "relative", flexShrink: 0, width: 48, height: 48 }}>
                            <Avatar
                              variant="rounded"
                              src={p.imageThumbnailUrl ?? p.imageUrl ?? undefined}
                              sx={{
                                width: 48,
                                height: 48,
                                borderRadius: "14px",
                                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                                color: "primary.onSurface",
                                opacity: stockState.out && !hasChecked ? 0.55 : 1,
                              }}
                            >
                              {p.name.charAt(0) || <Inventory2OutlinedIcon fontSize="small" />}
                            </Avatar>
                            {hasChecked ? (
                              <SelectionMark checked={isChecked} />
                            ) : (
                              !bulkBusy && <SelectionMark checked={false} onStart={() => startSelection(p.id)} />
                            )}
                          </Box>
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
                              sx={(theme) => ({
                                height: 22,
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                borderRadius: "7px",
                                // «Нет в наличии» — нейтральный приглушённый бейдж:
                                // строка и так затемнена, красный на каждой строке шумит.
                                bgcolor: stockState.muted
                                  ? subtleBg(theme, true)
                                  : alpha(theme.palette[stockState.color].main, 0.12),
                                color: stockState.muted
                                  ? "text.secondary"
                                  : `${stockState.color}.main`,
                                "& .MuiChip-icon": {
                                  color: stockState.muted
                                    ? "text.secondary"
                                    : `${stockState.color}.main`,
                                  ml: 0.5,
                                },
                                "& .MuiChip-label": { px: 0.75 },
                              })}
                            />
                          </Stack>
                        </ButtonBase>
                      );
                    })}
                    {hasMoreRows && <Box ref={listSentinelRef} sx={{ height: "1px" }} />}
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
                canViewCost={canViewCost}
                onPrintLabels={canPrintLabels ? () => selectedProduct && setLabelItems([toLabelItem(selectedProduct)]) : undefined}
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
                canViewCost={canViewCost}
                onPrintLabels={canPrintLabels ? () => selectedProduct && setLabelItems([toLabelItem(selectedProduct)]) : undefined}
              />
            </Box>
          )}
        </AppBottomSheet>
      )}

      <BulkCategoryDialog
        open={categoryDialogOpen}
        count={checkedIds.size}
        tree={categoryTree}
        legacyCategories={availableCategories}
        onClose={() => setCategoryDialogOpen(false)}
        onSubmit={handleBulkCategory}
      />
      <PrintLabelsDialog
        open={labelItems !== null}
        items={labelItems ?? []}
        branchId={activeBranch?.id ?? null}
        stockHint="остаток как в списке товаров"
        onClose={() => setLabelItems(null)}
      />
      <BulkPriceDialog
        open={priceDialogOpen}
        products={checkedProducts}
        onClose={() => setPriceDialogOpen(false)}
        onSubmit={handleBulkPrice}
      />

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
  canViewCost?: boolean;
  /** Есть только у тех, кому можно печатать (`printforms.print`). */
  onPrintLabels?: () => void;
}> = ({ product, onEdit, onDelete, readOnly, canViewCost = false, onPrintLabels }) => {
  const [expanded, setExpanded] = React.useState(false);

  // История цен — ленивая подгрузка при выборе товара.
  const [priceHistory, setPriceHistory] = React.useState<DjangoPriceHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  // Галерея товара — слайдер сам держит текущий слайд.
  const [gallery, setGallery] = React.useState<DjangoProductImage[]>([]);
  const [costPrice, setCostPrice] = React.useState<string | null>(null);

  // Reset expanded state when product changes
  React.useEffect(() => {
    setExpanded(false);
    setHistoryOpen(false);
    setPriceHistory([]);
    setCostPrice(null);
  }, [product?.id]);

  React.useEffect(() => {
    if (!product || !canViewCost) {
      setCostPrice(null);
      return undefined;
    }
    const controller = new AbortController();
    void getProductCostPrice(product.id, controller.signal)
      .then((result) => setCostPrice(result.costPrice))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setCostPrice(null);
      });
    return () => controller.abort();
  }, [canViewCost, product?.id]);

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
            {(!readOnly || onPrintLabels) && (
              <Stack
                direction="row"
                spacing={{ xs: 0.5, sm: 1 }}
                alignItems="center"
                flexWrap="wrap"
                sx={{ gap: { xs: 0.5, sm: 1 } }}
              >
                {onPrintLabels && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<PrintOutlined />}
                    onClick={onPrintLabels}
                  >
                    Этикетка
                  </Button>
                )}
                {!readOnly && (
                  <>
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
                  </>
                )}
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
                {canViewCost && costPrice !== null && (
                  <InfoTile
                    icon={<PaymentsOutlined />}
                    label="Себестоимость"
                    value={formatKGS(Number(costPrice))}
                    active={Number(costPrice) > 0}
                  />
                )}
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
