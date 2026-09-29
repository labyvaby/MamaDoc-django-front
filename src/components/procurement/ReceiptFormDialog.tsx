import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";
import { alpha, keyframes, useTheme } from "@mui/material/styles";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import DocumentScannerOutlined from "@mui/icons-material/DocumentScannerOutlined";
import AddAPhotoOutlined from "@mui/icons-material/AddAPhotoOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import CloudUploadOutlined from "@mui/icons-material/CloudUploadOutlined";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CheckRounded from "@mui/icons-material/CheckRounded";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import PersonAddAltOutlined from "@mui/icons-material/PersonAddAltOutlined";
import AddCircleOutlineOutlined from "@mui/icons-material/AddCircleOutlineOutlined";
import NewReleasesOutlined from "@mui/icons-material/NewReleasesOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import LocalShippingOutlined from "@mui/icons-material/LocalShippingOutlined";
import AttachFileOutlined from "@mui/icons-material/AttachFileOutlined";
import PictureAsPdfOutlined from "@mui/icons-material/PictureAsPdfOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";

import { ApiError, getErrorMessage } from "../../api/client";
import {
  createReceipt,
  getNextReceiptNumber,
  recognizeReceiptPhoto,
  type GoodsReceipt,
  type ProcurementScope,
  type ProcurementSupplier,
  type RecognitionResult,
  type RecognizedCandidate,
  type RecognizedLine,
} from "../../api/procurement";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  getProductAttributes,
  getProductCategories,
  getProductCategoryTree,
  getProducts,
  getUnitsOfMeasure,
  getWarehouses,
  type DjangoProduct,
  type DjangoWarehouse,
} from "../../api/warehouse";
import { useInvoicePhotos } from "../../hooks/useInvoicePhotos";
import { usePermissions } from "../../hooks/usePermissions";
import { INVOICE_DOCUMENT_ACCEPT, PHOTO_ACCEPT, isPdfFile } from "../../utility/imageCompression";
import { CustomDateTimePicker, CustomDatePicker, InvoicePhotosField } from "../ui";
import { CloseGuardDialog } from "../common/CloseGuardDialog";
import { formatMoney } from "./meta";
import { NewProductFields } from "./NewProductFields";
import { RecognitionDetails } from "./RecognitionDetails";
import {
  buildCategoryOptions,
  draftFromRecognized,
  draftProblem,
  emptyDraft,
  newProductInput,
  type NewProductDraft,
} from "./newProductDraft";

const CURRENCIES = ["KGS", "USD", "RUB", "KZT", "EUR", "CNY"];

/** `create` — не товар каталога, а пункт «Создать товар «…»» по введённому тексту. */
type ProductOption = { id: number; label: string; unit: string; sku: string; create?: boolean };

const CREATE_OPTION_ID = -1;
const filterProductOptions = createFilterOptions<ProductOption>();

interface FormLine {
  key: string;
  product: ProductOption | null;
  /** Товара нет в каталоге — карточка заведётся вместе с приходом. */
  newProduct?: NewProductDraft;
  quantity: string;
  price: string;
  lotNumber: string;
  expiresAt: Dayjs | null;
  /** Строка пришла из распознавания: показываем исходный текст и кандидатов. */
  recognized?: {
    name: string;
    productName?: string | null;
    modelCode: string | null;
    color: string | null;
    size: string | null;
    barcode: string | null;
    sku: string | null;
    unit: string | null;
    candidates: RecognizedCandidate[];
    matchScore: number | null;
  };
}

/**
 * Колонки позиции на md+ (десктоп; телефон в проекте — всё, что уже md, см.
 * APP_BREAKPOINTS): товар, кол-во, цена, сумма, удаление. Шапка и строки — по одной сетке.
 */
const LINE_COLUMNS = "minmax(0, 1fr) 104px 116px 104px 32px";

/** Поля шапки раскладываются сами по ширине колонки — и в модалке с превью, и без. */
const FIELD_GRID = "repeat(auto-fill, minmax(220px, 1fr))";

const RECOGNITION_STAGES = ["Сканируем документ и читаем текст…", "Находим поставщика, номер и дату…", "Сопоставляем товары со складом…"];

const scanLine = keyframes`
  0% { top: 0%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
`;
const shimmer = keyframes`
  0% { transform: translateX(-120%) skewX(-18deg); opacity: 0; }
  20% { opacity: .8; }
  80% { opacity: .8; }
  100% { transform: translateX(420%) skewX(-18deg); opacity: 0; }
`;
const pulse = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
`;
const floatY = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
`;

const newLine = (): FormLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  product: null,
  quantity: "",
  price: "",
  lotNumber: "",
  expiresAt: null,
});

/** Что строка документа говорит о товаре — для подсказок и для новой карточки. */
const recognizedOf = (line: RecognizedLine): NonNullable<FormLine["recognized"]> => ({
  name: line.name,
  productName: line.productName,
  modelCode: line.modelCode,
  color: line.color,
  size: line.size,
  barcode: line.barcode,
  sku: line.sku,
  unit: line.unit,
  candidates: line.candidates,
  matchScore: line.match?.score ?? null,
});

/** Пикер даты-времени шагает по 15 минут: «сейчас» округляем вниз, иначе поле красное. */
const roundToStep = (value: Dayjs): Dayjs => value.minute(Math.floor(value.minute() / 15) * 15).second(0).millisecond(0);

/** Срок из условий оплаты; банковские реквизиты не интерпретируем как срок. */
const paymentDueDate = (terms: string | null, invoiceDate: string | null): Dayjs | null => {
  if (!terms || !invoiceDate) return null;
  const base = dayjs(invoiceDate);
  if (!base.isValid()) return null;
  const relative = terms.match(/\b(\d{1,4})\s*(?:дн(?:ей|я)?|days?|gg|giorni)\b/i);
  if (relative) {
    const days = Number(relative[1]);
    return days >= 0 && days <= 3650 ? base.add(days, "day").endOf("day") : null;
  }
  const explicitDate = terms.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicitDate) {
    const due = dayjs(explicitDate[1]);
    return due.isValid() ? due.endOf("day") : null;
  }
  return null;
};

const toNumber = (raw: string): number => {
  const n = Number(String(raw).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Снимок или PDF — то, что принимает распознавание; остальное из drag&drop отбрасываем. */
const isDocumentFile = (file: File): boolean => isPdfFile(file) || file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.3 }}>
    {children}
  </Typography>
);

/** Смысловой блок формы: заголовок с иконкой и рамка. */
const Section: React.FC<{
  icon: React.ReactNode;
  title: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  /** Содержимое без внутренних отступов — таблица позиций сама до краёв. */
  flush?: boolean;
}> = ({ icon, title, extra, children, flush }) => (
  <Box sx={{ border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper", overflow: "hidden" }}>
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ px: { xs: 1.5, md: 2 }, py: 1.25, borderBottom: 1, borderColor: "divider", flexWrap: "wrap", rowGap: 0.75 }}
    >
      <Box
        sx={(t) => ({
          width: 28,
          height: 28,
          borderRadius: "8px",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          color: "primary.main",
          bgcolor: alpha(t.palette.primary.main, 0.1),
          "& svg": { fontSize: 17 },
        })}
      >
        {icon}
      </Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
        {title}
      </Typography>
      {extra}
    </Stack>
    <Box sx={flush ? undefined : { p: { xs: 1.5, md: 2 } }}>{children}</Box>
  </Box>
);

type PreviewFile = { key: string; url: string; isPdf: boolean; name: string };

/**
 * Оригинал документа рядом с полями (широкий экран): распознанное сверяют
 * глазами, не открывая файл отдельно.
 */
const DocumentPreview: React.FC<{ files: PreviewFile[] }> = ({ files }) => {
  const [index, setIndex] = React.useState(0);
  const active = files[Math.min(index, files.length - 1)];
  React.useEffect(() => {
    if (index > files.length - 1) setIndex(Math.max(0, files.length - 1));
  }, [files.length, index]);
  if (!active) return null;
  return (
    <Stack spacing={1} sx={{ height: "100%", minHeight: 0 }}>
      <Box
        sx={(t) => ({
          position: "relative",
          flex: 1,
          minHeight: 320,
          borderRadius: "14px",
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
          bgcolor: t.palette.mode === "dark" ? alpha(t.palette.common.white, 0.04) : alpha(t.palette.common.black, 0.03),
        })}
      >
        {active.isPdf ? (
          <Box component="iframe" title={active.name} src={active.url} sx={{ width: "100%", height: "100%", border: 0, display: "block" }} />
        ) : (
          <Box
            component="img"
            src={active.url}
            alt={active.name}
            sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
          />
        )}
        <Tooltip title="Открыть в новой вкладке">
          <IconButton
            component="a"
            href={active.url}
            target="_blank"
            rel="noreferrer"
            size="small"
            aria-label="Открыть документ в новой вкладке"
            sx={{ position: "absolute", top: 8, right: 8, bgcolor: "background.paper", boxShadow: 1, "&:hover": { bgcolor: "background.paper" } }}
          >
            <OpenInNewOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {files.length > 1 && (
        <Stack direction="row" spacing={1}>
          {files.map((file, i) => (
            <Box
              key={file.key}
              component="button"
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Документ ${i + 1}`}
              sx={{
                width: 56,
                height: 56,
                p: 0,
                borderRadius: "10px",
                overflow: "hidden",
                cursor: "pointer",
                border: 2,
                borderColor: file.key === active.key ? "primary.main" : "divider",
                bgcolor: "action.hover",
                display: "grid",
                placeItems: "center",
                color: "error.main",
              }}
            >
              {file.isPdf ? (
                <PictureAsPdfOutlined />
              ) : (
                <Box component="img" src={file.url} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

export interface ReceiptFormDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (receipt: GoodsReceipt) => void;
  scope: ProcurementScope;
  /** Филиал сессии — чтобы подставить основной склад филиала. */
  activeBranchId: number | null;
  suppliers: ProcurementSupplier[];
  /** Право на распознавание + настройка модуля + ключ провайдера на сервере. */
  recognitionEnabled: boolean;
  recognitionHint?: string | null;
  onCreateSupplier?: () => void;
  /**
   * Право `procurement.receipts.create_products`: товара нет в каталоге — он
   * заводится прямо из строки. Без права кнопок создания в форме нет вовсе.
   */
  canCreateProducts?: boolean;
  /** Настройка модуля «Закуп в валюте»; false — накладная только в сомах, полей валюты и курса нет. */
  foreignCurrency?: boolean;
}

/**
 * «Новая накладная»: приход от поставщика — большая модалка в два шага.
 *
 * Сначала — только выбор способа: большая зона для снимка/PDF накладной
 * (перетащить, выбрать, снять камерой, вставить из буфера) и «Заполнить
 * вручную». Если распознавание включено, модель читает документ, и форма
 * открывается уже заполненной поставщиком, номером, датой и позициями;
 * несопоставленные позиции остаются с подсказками, выбор — за человеком.
 * Без распознавания файл просто прикладывается к накладной.
 *
 * Товара нет в каталоге — с правом его можно завести прямо в строке:
 * карточка создаётся вместе с приходом, а количество строки сразу становится
 * остатком. Ничего не пишется, пока приход не проведён.
 */
export const ReceiptFormDialog: React.FC<ReceiptFormDialogProps> = ({
  open,
  onClose,
  onCreated,
  scope,
  activeBranchId,
  suppliers,
  recognitionEnabled,
  recognitionHint,
  onCreateSupplier,
  canCreateProducts = false,
  foreignCurrency = true,
}) => {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("md"));
  const isWide = useMediaQuery(theme.breakpoints.up("lg"));
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const { activeOrganization } = usePermissions();
  const isRetail = activeOrganization?.vertical === "retail";

  /** `start` — выбор способа (фото или вручную), `form` — все поля накладной. */
  const [mode, setMode] = React.useState<"start" | "form">("start");
  const [dragOver, setDragOver] = React.useState(false);
  /** Превью файла, который сейчас читает модель (до того как он попал в фото накладной). */
  const [scanPreview, setScanPreview] = React.useState<{ url: string; isPdf: boolean } | null>(null);

  const [supplierId, setSupplierId] = React.useState<number | "">("");
  const [warehouseId, setWarehouseId] = React.useState<number | "">("");
  const [number, setNumber] = React.useState("");
  const [supplierNumber, setSupplierNumber] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState<Dayjs | null>(roundToStep(dayjs()));
  const [dueAt, setDueAt] = React.useState<Dayjs | null>(null);
  const [currency, setCurrency] = React.useState("KGS");
  const [exchangeRate, setExchangeRate] = React.useState("1");
  const [customsCost, setCustomsCost] = React.useState("0");
  const [deliveryCost, setDeliveryCost] = React.useState("0");
  const [otherCosts, setOtherCosts] = React.useState("0");
  const [comment, setComment] = React.useState("");
  const [lines, setLines] = React.useState<FormLine[]>([newLine()]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [recognizing, setRecognizing] = React.useState(false);
  const [recognitionStage, setRecognitionStage] = React.useState(0);
  const [recognition, setRecognition] = React.useState<RecognitionResult | null>(null);
  const [recognitionError, setRecognitionError] = React.useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = React.useState(false);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const captureRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!recognizing) {
      setRecognitionStage(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setRecognitionStage((stage) => (stage + 1) % 3);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [recognizing]);

  React.useEffect(() => () => {
    if (scanPreview) URL.revokeObjectURL(scanPreview.url);
  }, [scanPreview]);

  const photos = useInvoicePhotos({ target: "goodsReceipt", entityId: null, organizationId: scope.organizationId ?? null, open, preservePendingOnClose: true });

  const orgId = scope.organizationId ?? undefined;

  const productsQuery = useQuery({
    queryKey: ["django", "procurement", "form-products", orgId ?? null, activeBranchId],
    queryFn: ({ signal }) => getProducts(signal, { organizationId: orgId, branchId: activeBranchId ?? undefined }),
    enabled: open,
    staleTime: 60_000,
  });
  const warehousesQuery = useQuery({
    queryKey: ["django", "procurement", "form-warehouses", orgId ?? null],
    queryFn: ({ signal }) => getWarehouses(signal, orgId),
    enabled: open,
    staleTime: 60_000,
  });
  const nextNumberQuery = useQuery({
    queryKey: ["django", "procurement", "next-number", orgId ?? null],
    queryFn: ({ signal }) => getNextReceiptNumber(scope, signal),
    enabled: open,
    staleTime: 0,
  });

  // Справочники новой карточки — только тем, кто может её завести. Розница
  // ведёт дерево категорий со схемой формы (цвет × размер), клиника —
  // категорию строкой с подсказками уже заведённых значений.
  const directoriesEnabled = open && canCreateProducts;
  const categoryTreeQuery = useQuery({
    queryKey: ["django", "procurement", "form-categories", orgId ?? null],
    queryFn: async ({ signal }) => {
      const [nodes, attributes] = await Promise.all([getProductCategoryTree(signal, orgId), getProductAttributes(signal, orgId)]);
      return buildCategoryOptions(nodes, attributes);
    },
    enabled: directoriesEnabled && isRetail,
    staleTime: 60_000,
  });
  const legacyCategoriesQuery = useQuery({
    queryKey: ["django", "procurement", "form-legacy-categories", orgId ?? null],
    queryFn: ({ signal }) => getProductCategories(signal, orgId),
    enabled: directoriesEnabled && !isRetail,
    staleTime: 60_000,
  });
  const unitsQuery = useQuery({
    queryKey: ["django", "procurement", "form-units", orgId ?? null],
    queryFn: ({ signal }) => getUnitsOfMeasure(signal, orgId),
    enabled: directoriesEnabled,
    staleTime: 60_000,
  });
  const categoryOptions = React.useMemo(() => categoryTreeQuery.data ?? [], [categoryTreeQuery.data]);
  const categoryById = React.useMemo(() => new Map(categoryOptions.map((option) => [option.id, option])), [categoryOptions]);
  const units = React.useMemo(() => unitsQuery.data ?? [], [unitsQuery.data]);
  // Как в карточке товара: у розницы со справочником категория обязательна.
  const categoryRequired = isRetail && categoryOptions.length > 0;
  /** Последняя выбранная категория — новые черновики начинают с неё. */
  const lastCategoryRef = React.useRef<number | null>(null);

  const productOptions = React.useMemo<ProductOption[]>(
    () =>
      (productsQuery.data ?? [])
        .filter((p: DjangoProduct) => p.isActive)
        .map((p: DjangoProduct) => {
          const variantAttributes = (p.attributes ?? [])
            .filter((attribute) => attribute.role === "color" || attribute.role === "size")
            .map((attribute) => attribute.value)
            .filter(Boolean);
          return {
            id: p.id,
            label: [p.name, ...variantAttributes].join(" · "),
            unit: p.unit || "шт",
            sku: p.sku ?? "",
          };
        }),
    [productsQuery.data],
  );
  const productById = React.useMemo(() => new Map(productOptions.map((p) => [p.id, p])), [productOptions]);

  const warehouses = React.useMemo<DjangoWarehouse[]>(() => warehousesQuery.data ?? [], [warehousesQuery.data]);

  React.useEffect(() => {
    if (open && nextNumberQuery.data?.number) setNumber((prev) => prev || nextNumberQuery.data.number);
  }, [open, nextNumberQuery.data]);

  React.useEffect(() => {
    if (!open || warehouseId !== "" || warehouses.length === 0) return;
    const own = warehouses.filter((w) => !w.isLinked && (activeBranchId == null || w.branchId === activeBranchId));
    const primary = own.find((w) => w.isPrimary) ?? own[0] ?? warehouses[0];
    if (primary) setWarehouseId(primary.id);
  }, [open, warehouses, warehouseId, activeBranchId]);

  // Валюта поставщика — в форму по умолчанию; при закупе только в сомах — всегда сом.
  React.useEffect(() => {
    if (!foreignCurrency) {
      setCurrency("KGS");
      setExchangeRate("1");
      return;
    }
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (supplier?.defaultCurrency) setCurrency(supplier.defaultCurrency);
  }, [foreignCurrency, supplierId, suppliers]);

  const updateLine = (key: string, patch: Partial<FormLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : [newLine()]));

  // ── Новый товар из строки ────────────────────────────────────────────────

  const updateDraft = (key: string, patch: Partial<NewProductDraft>) => {
    if (patch.categoryId !== undefined) lastCategoryRef.current = patch.categoryId;
    setLines((prev) =>
      prev.map((l) => (l.key === key && l.newProduct ? { ...l, newProduct: { ...l.newProduct, ...patch } } : l)),
    );
  };

  /** Черновик для строки: из распознанного документа либо из набранного названия. */
  const draftFor = (line: FormLine, typedName: string | undefined, allLines: FormLine[]): NewProductDraft => {
    const base = line.recognized
      ? draftFromRecognized(line.recognized, {
          units,
          // Артикул поставщика общий у размеров одной модели — такой не берём.
          skuIsUnique:
            Boolean(line.recognized.sku) &&
            allLines.filter((l) => l.recognized?.sku && l.recognized.sku === line.recognized?.sku).length === 1,
        })
      : emptyDraft();
    const name = typedName?.trim();
    // Запомненная категория — только если она есть в справочнике этой организации.
    const remembered = lastCategoryRef.current;
    const categoryId = remembered != null && categoryById.has(remembered) ? remembered : null;
    return { ...base, name: name || base.name, categoryId };
  };

  const startNewProduct = (key: string, typedName?: string) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, product: null, newProduct: draftFor(l, typedName, prev) } : l)),
    );

  const cancelNewProduct = (key: string) => updateLine(key, { newProduct: undefined });

  /** «Создать все»: каждая несопоставленная строка документа — новой карточкой. */
  const createAllUnmatched = () =>
    setLines((prev) =>
      prev.map((l) => (l.recognized && !l.product && !l.newProduct ? { ...l, newProduct: draftFor(l, undefined, prev) } : l)),
    );

  const applyCategoryToNew = (categoryId: number | null) => {
    lastCategoryRef.current = categoryId;
    setLines((prev) => prev.map((l) => (l.newProduct ? { ...l, newProduct: { ...l.newProduct, categoryId } } : l)));
  };

  const problemOf = (line: FormLine): string | null =>
    line.newProduct
      ? draftProblem(line.newProduct, {
          categoryRequired,
          category: line.newProduct.categoryId != null ? categoryById.get(line.newProduct.categoryId) : null,
        })
      : null;

  const lineTotal = (line: FormLine) => toNumber(line.quantity) * toNumber(line.price);
  const rate = currency === "KGS" ? 1 : toNumber(exchangeRate) || 1;
  const total = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const landedExpenses = toNumber(customsCost) + toNumber(deliveryCost) + toNumber(otherCosts);
  const hasProduct = (l: FormLine) => Boolean(l.product || l.newProduct);
  const filledLines = lines.filter((l) => hasProduct(l) && toNumber(l.quantity) > 0);
  const unmatched = lines.filter((l) => l.recognized && !hasProduct(l));
  const newLines = lines.filter((l) => l.newProduct);
  const sharedNewCategory = newLines.every((l) => l.newProduct?.categoryId === newLines[0]?.newProduct?.categoryId)
    ? newLines[0]?.newProduct?.categoryId ?? null
    : null;

  const hasLineDraft = lines.some((line) =>
    Boolean(line.product || line.newProduct || line.quantity || line.price || line.lotNumber || line.expiresAt || line.recognized),
  );
  const isDirty = Boolean(
    supplierId !== "" ||
    supplierNumber.trim() ||
    number.trim() !== (nextNumberQuery.data?.number ?? "") ||
    dueAt ||
    currency !== "KGS" ||
    exchangeRate !== "1" ||
    landedExpenses > 0 ||
    comment.trim() ||
    hasLineDraft ||
    recognition ||
    photos.pending.length,
  );

  const resetForm = React.useCallback(() => {
    setSupplierId("");
    setWarehouseId("");
    setNumber("");
    setSupplierNumber("");
    setReceivedAt(roundToStep(dayjs()));
    setDueAt(null);
    setCurrency("KGS");
    setExchangeRate("1");
    setCustomsCost("0");
    setDeliveryCost("0");
    setOtherCosts("0");
    setComment("");
    setLines([newLine()]);
    setError(null);
    setRecognition(null);
    setRecognitionError(null);
    setRecognizing(false);
    setScanPreview(null);
    setMode("start");
    photos.reset();
  }, [photos]);

  const requestClose = React.useCallback(() => {
    if (saving || recognizing) return;
    if (isDirty) {
      setCloseConfirmOpen(true);
      return;
    }
    // Пустая форма: при следующем открытии снова предлагаем выбор способа.
    setMode("start");
    onClose();
  }, [isDirty, onClose, recognizing, saving]);

  const discardAndClose = React.useCallback(() => {
    setCloseConfirmOpen(false);
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const isValid =
    supplierId !== "" &&
    warehouseId !== "" &&
    filledLines.length > 0 &&
    lines.every((l) => !hasProduct(l) || toNumber(l.quantity) > 0) &&
    lines.every((l) => problemOf(l) == null);

  // ── Распознавание ────────────────────────────────────────────────────────

  const applyRecognition = React.useCallback(
    (result: RecognitionResult) => {
      setRecognition(result);
      if (result.supplierMatch && supplierId === "") setSupplierId(result.supplierMatch.id);
      if (result.document.number && !supplierNumber) setSupplierNumber(result.document.number);
      if (result.document.date) {
        const parsed = dayjs(result.document.date);
        if (parsed.isValid()) setReceivedAt(roundToStep(parsed.hour(dayjs().hour()).minute(dayjs().minute())));
      }
      const recognizedDueAt = paymentDueDate(result.document.paymentTerms, result.document.date);
      if (recognizedDueAt) setDueAt(recognizedDueAt);
      if (foreignCurrency && result.document.currency && CURRENCIES.includes(result.document.currency)) {
        setCurrency(result.document.currency);
      }
      const recognizedLines: FormLine[] = result.lines.map((line) => {
        const matched = line.match
          ? productById.get(line.match.id) ?? {
              id: line.match.id,
              label: line.match.name,
              unit: line.unit || "шт",
              sku: line.sku ?? "",
            }
          : null;
        const expires = line.expiresAt ? dayjs(line.expiresAt) : null;
        const quantity = line.quantity ? Number(line.quantity) : null;
        const totalPrice = line.total && quantity && quantity > 0 ? Number(line.total) / quantity : null;
        return {
          ...newLine(),
          product: matched,
          quantity: quantity != null && Number.isFinite(quantity) ? String(quantity) : "",
          price: line.price
            ? String(Number(line.price))
            : totalPrice != null && Number.isFinite(totalPrice)
              ? String(totalPrice)
              : "",
          lotNumber: line.lotNumber ?? "",
          expiresAt: expires && expires.isValid() ? expires : null,
          recognized: recognizedOf(line),
        };
      });
      if (recognizedLines.length > 0) {
        setLines((prev) => {
          const kept = prev.filter((l) => l.product || l.newProduct || l.quantity || l.price);
          return [...kept, ...recognizedLines];
        });
      }
    },
    [foreignCurrency, productById, supplierId, supplierNumber],
  );

  const handlePhoto = async (files: FileList | File[] | null) => {
    // Копия до сброса input.value: сброс очищает тот самый FileList.
    const list = Array.from(files ?? []).filter(isDocumentFile);
    if (cameraRef.current) cameraRef.current.value = "";
    if (captureRef.current) captureRef.current.value = "";
    if (list.length === 0) return;
    const file = list[0];
    setRecognitionError(null);
    // Фото — к накладной в любом случае; распознавание — если разрешено.
    await photos.pick([file]);
    if (!recognitionEnabled) {
      setMode("form");
      return;
    }
    setScanPreview({ url: URL.createObjectURL(file), isPdf: isPdfFile(file) });
    setRecognitionStage(0);
    setRecognizing(true);
    try {
      const result = await recognizeReceiptPhoto(file, scope);
      applyRecognition(result);
    } catch (e) {
      if (e instanceof ApiError && e.code === "RECOGNITION_DISABLED") {
        setRecognitionError("Распознавание выключено в настройках модуля «Закупки».");
      } else if (e instanceof ApiError && e.status === 503) {
        setRecognitionError("Распознавание сейчас недоступно — заполните накладную вручную, фото сохранится.");
      } else {
        setRecognitionError(getErrorMessage(e, "Не удалось распознать накладную"));
      }
    } finally {
      setRecognizing(false);
      setScanPreview(null);
      // И удачно, и с ошибкой — дальше работа идёт в полной форме, файл уже приложен.
      setMode("form");
    }
  };

  // Ctrl+V со снимком на стартовом экране — тот же путь, что и выбор файла.
  React.useEffect(() => {
    if (!open || mode !== "start" || recognizing || saving) return undefined;
    const onPaste = (event: ClipboardEvent) => {
      const pasted = Array.from(event.clipboardData?.files ?? []).filter(isDocumentFile);
      if (pasted.length === 0) return;
      event.preventDefault();
      void handlePhoto(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // handlePhoto пересоздаётся каждый рендер — подписка по состоянию экрана достаточна.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, recognizing, saving, recognitionEnabled]);

  // ── Сохранение ───────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createReceipt(
        {
          supplierId: Number(supplierId),
          warehouseId: Number(warehouseId),
          number: number.trim(),
          supplierNumber: supplierNumber.trim(),
          receivedAt: receivedAt ? receivedAt.toISOString() : null,
          dueAt: dueAt ? dueAt.endOf("day").toISOString() : null,
          comment: comment.trim(),
          customsCost: String(toNumber(customsCost)),
          deliveryCost: String(toNumber(deliveryCost)),
          otherCosts: String(toNumber(otherCosts)),
          lines: filledLines.map((l) => ({
            ...(l.product
              ? { productId: l.product.id }
              : {
                  newProduct: newProductInput(
                    l.newProduct!,
                    l.newProduct!.categoryId != null ? categoryById.get(l.newProduct!.categoryId) : null,
                  ),
                }),
            quantity: String(toNumber(l.quantity)),
            costAmount: String(toNumber(l.price)),
            costCurrency: currency,
            exchangeRate: String(rate),
            lotNumber: l.lotNumber.trim(),
            expiresAt: l.expiresAt ? l.expiresAt.endOf("day").toISOString() : null,
          })),
        },
        scope,
      );
      const createdProducts = filledLines.filter((l) => l.newProduct).length;
      const { failed } = await photos.flush(created.id);
      await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.procurement.all });
      // Новые карточки — в каталог и во все пикеры товаров, не только в эту форму.
      if (createdProducts > 0) await queryClient.invalidateQueries({ queryKey: ["django", "warehouse"] });
      const withProducts = createdProducts > 0 ? ` · новых товаров: ${createdProducts}` : "";
      notify?.({
        type: failed ? "error" : "success",
        message: failed
          ? `Накладная ${created.number} проведена${withProducts}, но ${failed} фото не загрузилось`
          : `Накладная ${created.number} проведена${withProducts}`,
      });
      resetForm();
      onCreated(created);
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось провести накладную"));
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || recognizing;

  const previewFiles = React.useMemo<PreviewFile[]>(
    () =>
      photos.pending.map((p) => ({ key: p.localId, url: p.previewUrl, isPdf: isPdfFile(p.file), name: p.file.name })),
    [photos.pending],
  );
  // Оригинал рядом с полями — только когда есть место (lg+); уже — плитки фото внизу.
  const showAside = mode === "form" && isWide && previewFiles.length > 0;

  const grandTotal = total + (currency === "KGS" ? landedExpenses : 0);

  const fileInputs = (
    <>
      <input ref={cameraRef} type="file" accept={INVOICE_DOCUMENT_ACCEPT} hidden onChange={(e) => void handlePhoto(e.target.files)} />
      <input ref={captureRef} type="file" accept={PHOTO_ACCEPT} capture="environment" hidden onChange={(e) => void handlePhoto(e.target.files)} />
    </>
  );

  // ── Стартовый экран ──────────────────────────────────────────────────────

  const scanningView = (
    <Box
      sx={(t) => ({
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: scanPreview ? "minmax(0, 300px) minmax(0, 1fr)" : "1fr" },
        gap: { xs: 2, md: 3 },
        alignItems: "center",
        p: { xs: 2, md: 3 },
        borderRadius: "20px",
        border: "1.5px solid",
        borderColor: alpha(t.palette.primary.main, 0.45),
        background: `linear-gradient(135deg, ${alpha(t.palette.primary.main, 0.14)}, ${alpha(t.palette.secondary.main, 0.08)} 55%, ${alpha(t.palette.primary.main, 0.04)})`,
        position: "relative",
        overflow: "hidden",
      })}
    >
      <Box
        aria-hidden
        sx={(t) => ({
          position: "absolute",
          inset: 0,
          width: "28%",
          background: `linear-gradient(90deg, transparent, ${alpha(t.palette.common.white, 0.25)}, transparent)`,
          animation: `${shimmer} 2.6s ease-in-out infinite`,
          pointerEvents: "none",
        })}
      />
      {scanPreview && (
        <Box
          sx={{
            position: "relative",
            height: { xs: 200, md: 320 },
            borderRadius: "14px",
            overflow: "hidden",
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            boxShadow: 3,
          }}
        >
          {scanPreview.isPdf ? (
            <Box sx={{ height: "100%", display: "grid", placeItems: "center", color: "error.main" }}>
              <PictureAsPdfOutlined sx={{ fontSize: 72 }} />
            </Box>
          ) : (
            <Box component="img" src={scanPreview.url} alt="Накладная" sx={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }} />
          )}
          <Box
            aria-hidden
            sx={(t) => ({
              position: "absolute",
              left: 0,
              right: 0,
              height: 3,
              bgcolor: "primary.main",
              boxShadow: `0 0 18px 6px ${alpha(t.palette.primary.main, 0.45)}`,
              animation: `${scanLine} 2.2s ease-in-out infinite`,
            })}
          />
        </Box>
      )}
      <Stack spacing={2} sx={{ position: "relative" }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={(t) => ({
              width: 52,
              height: 52,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              color: "primary.main",
              bgcolor: alpha(t.palette.primary.main, 0.18),
              animation: `${pulse} 1.8s ease-in-out infinite`,
            })}
          >
            <AutoAwesomeRounded sx={{ fontSize: 28 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
              AI разбирает накладную…
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Обычно это 10–40 секунд. Форма откроется уже заполненной.
            </Typography>
          </Box>
        </Stack>
        <Stack spacing={1}>
          {RECOGNITION_STAGES.map((label, index) => {
            const done = index < recognitionStage;
            const current = index === recognitionStage;
            return (
              <Stack key={label} direction="row" spacing={1.25} alignItems="center">
                <Box
                  sx={(t) => ({
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    border: "1.5px solid",
                    borderColor: done || current ? "primary.main" : "divider",
                    bgcolor: done ? "primary.main" : current ? alpha(t.palette.primary.main, 0.12) : "transparent",
                    color: done ? "primary.contrastText" : "primary.main",
                    transition: "all .3s ease",
                  })}
                >
                  {done ? <CheckRounded sx={{ fontSize: 16 }} /> : current ? <CircularProgress size={12} thickness={6} /> : null}
                </Box>
                <Typography variant="body2" sx={{ fontWeight: current ? 700 : 500, color: done || current ? "text.primary" : "text.secondary" }}>
                  {label}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
        <LinearProgress sx={{ borderRadius: 1, height: 6 }} />
      </Stack>
    </Box>
  );

  const startView = (
    <Stack spacing={{ xs: 2, md: 2.5 }} sx={{ width: "100%", maxWidth: 880, mx: "auto" }}>
      {photos.error && (
        <Alert severity="warning" onClose={photos.clearError}>
          {photos.error}
        </Alert>
      )}
      {recognizing ? (
        scanningView
      ) : (
        <Box
          role="button"
          tabIndex={0}
          aria-label={recognitionEnabled ? "Загрузить фото или PDF накладной для распознавания" : "Приложить фото или PDF накладной"}
          onClick={() => cameraRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              cameraRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragOver) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handlePhoto(e.dataTransfer.files);
          }}
          sx={(t) => ({
            position: "relative",
            cursor: "pointer",
            outline: "none",
            minHeight: { xs: 280, md: 360 },
            px: { xs: 2, md: 4 },
            py: { xs: 3, md: 5 },
            borderRadius: "20px",
            border: "2px dashed",
            borderColor: dragOver ? "primary.main" : alpha(t.palette.primary.main, 0.35),
            background: dragOver
              ? alpha(t.palette.primary.main, 0.12)
              : `radial-gradient(120% 90% at 50% 0%, ${alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.09)}, ${alpha(t.palette.primary.main, 0.02)} 70%)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 1.5,
            transition: "border-color .2s ease, background .2s ease, transform .2s ease",
            transform: dragOver ? "scale(1.01)" : "none",
            "&:hover, &:focus-visible": { borderColor: "primary.main", bgcolor: alpha(t.palette.primary.main, 0.05) },
          })}
        >
          <Box
            sx={(t) => ({
              width: { xs: 72, md: 88 },
              height: { xs: 72, md: 88 },
              borderRadius: "24px",
              display: "grid",
              placeItems: "center",
              color: "primary.main",
              bgcolor: alpha(t.palette.primary.main, 0.12),
              boxShadow: `0 12px 32px -12px ${alpha(t.palette.primary.main, 0.55)}`,
              animation: dragOver ? "none" : `${floatY} 3.2s ease-in-out infinite`,
              mb: 0.5,
            })}
          >
            {recognitionEnabled ? <DocumentScannerOutlined sx={{ fontSize: { xs: 36, md: 44 } }} /> : <CloudUploadOutlined sx={{ fontSize: { xs: 36, md: 44 } }} />}
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800, fontSize: { xs: "1.2rem", md: "1.5rem" }, lineHeight: 1.25 }}>
            {dragOver
              ? "Отпустите файл"
              : recognitionEnabled
                ? "Загрузите фото накладной — остальное AI заполнит сам"
                : "Приложите фото или PDF накладной"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
            {recognitionEnabled
              ? isPhone
                ? "Снимите документ камерой или выберите фото / PDF из галереи."
                : "Перетащите сюда снимок или PDF, нажмите, чтобы выбрать файл, или вставьте из буфера — Ctrl+V."
              : recognitionHint ?? "Распознавание недоступно — файл сохранится к накладной, поля заполните вручную."}
          </Typography>
          {recognitionEnabled && (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" justifyContent="center" sx={{ pt: 0.5 }}>
              {["Поставщик", "Номер и дата", "Позиции и цены", "Сопоставление со складом"].map((label) => (
                <Chip
                  key={label}
                  size="small"
                  icon={<CheckRounded />}
                  label={label}
                  variant="outlined"
                  sx={(t) => ({
                    bgcolor: "background.paper",
                    borderColor: alpha(t.palette.primary.main, 0.25),
                    "& .MuiChip-icon": { color: "success.main", fontSize: 16 },
                  })}
                />
              ))}
            </Stack>
          )}
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1}
            sx={{ pt: 1.5, width: { xs: "100%", md: "auto" } }}
            onClick={(e) => e.stopPropagation()}
          >
            {isPhone && (
              <Button
                variant="contained"
                size="large"
                startIcon={<PhotoCameraOutlined />}
                disabled={busy || !photos.canAddMore}
                onClick={() => captureRef.current?.click()}
              >
                Снять камерой
              </Button>
            )}
            <Button
              variant={isPhone ? "outlined" : "contained"}
              size="large"
              startIcon={<AddAPhotoOutlined />}
              disabled={busy || !photos.canAddMore}
              onClick={() => cameraRef.current?.click()}
              sx={{ px: 3 }}
            >
              {isPhone ? "Выбрать фото или PDF" : "Выбрать файл"}
            </Button>
          </Stack>
        </Box>
      )}

      {!recognizing && (
        <>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ color: "text.disabled" }}>
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
              или
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
          </Stack>
          <Button
            variant="outlined"
            color="inherit"
            size="large"
            startIcon={<EditNoteOutlined />}
            onClick={() => setMode("form")}
            sx={{
              alignSelf: "center",
              px: 4,
              py: 1.25,
              borderRadius: "12px",
              borderColor: "divider",
              fontWeight: 700,
              width: { xs: "100%", md: "auto" },
            }}
          >
            Заполнить вручную
          </Button>
        </>
      )}
    </Stack>
  );

  // ── Полная форма ─────────────────────────────────────────────────────────

  const recognitionCard = (
    <Box
      sx={(t) => ({
        p: 1.5,
        borderRadius: "14px",
        border: "1px dashed",
        borderColor: recognizing
          ? alpha(t.palette.primary.main, 0.72)
          : recognition
            ? alpha(t.palette.success.main, 0.5)
            : alpha(t.palette.primary.main, 0.4),
        background: recognizing
          ? `linear-gradient(135deg, ${alpha(t.palette.primary.main, 0.2)}, ${alpha(t.palette.secondary.main, 0.12)} 50%, ${alpha(t.palette.primary.main, 0.08)})`
          : recognition
            ? alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.08 : 0.04)
            : alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.08 : 0.04),
        position: "relative",
        overflow: "hidden",
        transition: "all .35s ease",
      })}
    >
      {recognizing && (
        <Box
          aria-hidden
          sx={(t) => ({
            position: "absolute",
            inset: 0,
            width: "28%",
            background: `linear-gradient(90deg, transparent, ${alpha(t.palette.common.white, 0.3)}, transparent)`,
            animation: `${shimmer} 2.4s ease-in-out infinite`,
            pointerEvents: "none",
          })}
        />
      )}
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={(t) => ({
            width: 40,
            height: 40,
            borderRadius: recognizing ? "50%" : "10px",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            color: recognition && !recognizing ? "success.main" : "primary.main",
            bgcolor: alpha(recognition && !recognizing ? t.palette.success.main : t.palette.primary.main, 0.12),
            animation: recognizing ? `${pulse} 1.8s ease-in-out infinite` : "none",
          })}
        >
          {recognizing ? <AutoAwesomeRounded /> : recognition ? <CheckCircleOutlined /> : <AutoAwesomeOutlined />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {recognizing ? "AI разбирает накладную…" : recognition ? "Накладная распознана — проверьте поля" : "Заполнить по фото или PDF"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {recognizing
              ? RECOGNITION_STAGES[recognitionStage]
              : recognition
                ? `${recognition.totals.linesCount} поз., сопоставлено ${recognition.totals.matchedCount} · итого ${recognition.document.total ?? recognition.totals.linesTotal} ${recognition.document.currency ?? ""} · уверенность ${Math.round(recognition.confidence * 100)}%`
                : recognitionEnabled
                  ? "Снимите документ или выберите PDF — поставщик, номер, дата и позиции заполнятся сами."
                  : recognitionHint ?? "Распознавание недоступно — файл сохранится к накладной."}
          </Typography>
        </Box>
        <Button
          variant={recognition ? "outlined" : "contained"}
          size="small"
          startIcon={<AddAPhotoOutlined />}
          disabled={busy || !photos.canAddMore}
          onClick={() => cameraRef.current?.click()}
          sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
        >
          {recognition ? "Ещё файл" : "Фото / PDF"}
        </Button>
      </Stack>
      {recognizing && <LinearProgress sx={{ mt: 1.5, borderRadius: 1, height: 5 }} />}
      {recognitionError && (
        <Alert severity="warning" sx={{ mt: 1.5 }} onClose={() => setRecognitionError(null)}>
          {recognitionError}
        </Alert>
      )}
      {recognition && recognition.warnings.length > 0 && (
        <Alert severity="info" icon={<ErrorOutlineOutlined fontSize="inherit" />} sx={{ mt: 1.5 }}>
          {recognition.warnings.join(" ")}
        </Alert>
      )}
      {recognition && !recognition.supplierMatch && recognition.document.supplier.name && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          Поставщик «{recognition.document.supplier.name}» не найден в справочнике — выберите вручную
          {onCreateSupplier ? " или создайте нового." : "."}
        </Alert>
      )}
      {recognition && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          {[
            recognition.document.supplier.name,
            recognition.document.supplier.taxId && `ИНН: ${recognition.document.supplier.taxId}`,
            recognition.document.supplier.phone && `Тел.: ${recognition.document.supplier.phone}`,
            recognition.document.supplier.address,
            recognition.document.buyerName && `Покупатель: ${recognition.document.buyerName}`,
            recognition.document.vatTotal && `НДС: ${recognition.document.vatTotal} ${recognition.document.currency ?? ""}`,
            recognition.document.paymentTerms && `Оплата: ${recognition.document.paymentTerms}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
      )}
      {recognition && <RecognitionDetails result={recognition} />}
    </Box>
  );

  const documentSection = (
    <Section icon={<ReceiptLongOutlined />} title="Документ">
      <Box sx={{ display: "grid", gridTemplateColumns: FIELD_GRID, gap: 1.5 }}>
        <Box>
          <Label>Поставщик *</Label>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <TextField
              select
              fullWidth
              size="small"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value === "" ? "" : Number(e.target.value))}
              SelectProps={{ displayEmpty: true }}
            >
              <MenuItem value="">
                <em>Выберите поставщика</em>
              </MenuItem>
              {suppliers
                .filter((s) => s.isActive || s.id === supplierId)
                .map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
            </TextField>
            {onCreateSupplier && (
              <Tooltip title="Новый поставщик">
                <IconButton size="small" onClick={onCreateSupplier} aria-label="Новый поставщик">
                  <PersonAddAltOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Box>
        {/* Склад один — выбирать нечего: он подставлен сам, поле не нужно. */}
        {warehouses.length !== 1 && (
          <Box>
            <Label>Склад *</Label>
            <TextField
              select
              fullWidth
              size="small"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value === "" ? "" : Number(e.target.value))}
              SelectProps={{ displayEmpty: true }}
            >
              <MenuItem value="">
                <em>Выберите склад</em>
              </MenuItem>
              {warehouses.map((w) => (
                <MenuItem key={w.id} value={w.id}>
                  {w.isLinked ? `${w.name} — филиал: ${w.branchName}` : w.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        )}
        <Box>
          <Label>Номер накладной</Label>
          <TextField fullWidth size="small" value={number} onChange={(e) => setNumber(e.target.value)} placeholder={nextNumberQuery.data?.number ?? "ПН-…"} />
        </Box>
        <Box>
          <Label>Номер у поставщика</Label>
          <TextField fullWidth size="small" value={supplierNumber} onChange={(e) => setSupplierNumber(e.target.value)} placeholder="Как в документе поставщика" />
        </Box>
        <Box>
          <Label>Дата прихода *</Label>
          <CustomDateTimePicker
            value={receivedAt}
            onChange={(v) => setReceivedAt(v as Dayjs | null)}
            slotProps={{ textField: { size: "small", fullWidth: true } }}
          />
        </Box>
        <Box>
          <Label>Срок оплаты</Label>
          <CustomDatePicker
            value={dueAt}
            onChange={(v) => setDueAt(v as Dayjs | null)}
            shortYearMode="future"
            slotProps={{ textField: { size: "small", fullWidth: true, placeholder: "Не оговорён", helperText: recognition?.document.paymentTerms ?? undefined } }}
          />
        </Box>
        {/* Закуп только в сомах (настройка модуля) — валюта и курс не нужны. */}
        {foreignCurrency && (
          <>
            <Box>
              <Label>Валюта закупа</Label>
              <TextField select fullWidth size="small" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box>
              <Label>Курс к сому</Label>
              <TextField
                fullWidth
                size="small"
                value={currency === "KGS" ? "1" : exchangeRate}
                disabled={currency === "KGS"}
                onChange={(e) => setExchangeRate(e.target.value)}
                inputProps={{ inputMode: "decimal" }}
                helperText={currency === "KGS" ? undefined : `Себестоимость = цена × ${rate}`}
              />
            </Box>
          </>
        )}
      </Box>
    </Section>
  );

  const linesSection = (
    <Section
      flush
      icon={<Inventory2Outlined />}
      title={
        <>
          Позиции{" "}
          <Typography component="span" variant="caption" color="text.secondary">
            {filledLines.length > 0 ? `· ${filledLines.length}` : ""}
          </Typography>
        </>
      }
      extra={
        <Stack direction="row" spacing={0.75} alignItems="center">
          {unmatched.length > 0 && (
            <Chip size="small" color="warning" variant="outlined" label={`${unmatched.length} без товара`} sx={{ height: 22 }} />
          )}
          {canCreateProducts && unmatched.length > 1 && (
            <Button
              size="small"
              color="success"
              startIcon={<AddCircleOutlineOutlined />}
              onClick={createAllUnmatched}
              sx={{ py: 0.25, whiteSpace: "nowrap" }}
            >
              Создать все ({unmatched.length})
            </Button>
          )}
        </Stack>
      }
    >
      {newLines.length > 1 && categoryOptions.length > 0 && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ px: { xs: 1.5, md: 2 }, py: 1, borderBottom: 1, borderColor: "divider" }}>
          <NewReleasesOutlined sx={{ fontSize: 18, color: "success.main", flexShrink: 0 }} />
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
            Новых: {newLines.length}
          </Typography>
          <TextField
            select
            size="small"
            label="Категория для всех новых"
            value={sharedNewCategory ?? ""}
            onChange={(e) => applyCategoryToNew(e.target.value === "" ? null : Number(e.target.value))}
            SelectProps={{ displayEmpty: true, MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } }}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: 1, minWidth: 0 }}
          >
            <MenuItem value="">
              <em>
                {sharedNewCategory == null && newLines.some((l) => l.newProduct?.categoryId != null) ? "Разные" : "Не выбрана"}
              </em>
            </MenuItem>
            {categoryOptions.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      )}
      {productsQuery.isLoading && <LinearProgress />}
      <Box
        sx={{
          display: { xs: "none", md: "grid" },
          gridTemplateColumns: LINE_COLUMNS,
          gap: 1,
          px: 2,
          py: 0.75,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "action.hover",
        }}
      >
        {["Товар", "Кол-во", "Цена", "Сумма", ""].map((label, i) => (
          <Typography key={i} variant="caption" color="text.secondary" sx={{ fontWeight: 600, textAlign: i === 0 ? "left" : "right" }}>
            {label}
          </Typography>
        ))}
      </Box>
      {lines.map((line, index) => {
        const candidateIds = new Set((line.recognized?.candidates ?? []).map((c) => c.id));
        const options = line.recognized
          ? [
              ...(line.recognized.candidates
                .map((c) => productById.get(c.id) ?? (line.product?.id === c.id ? line.product : null))
                .filter(Boolean) as ProductOption[]),
              ...productOptions.filter((p) => !candidateIds.has(p.id)),
            ]
          : productOptions;
        const scoreOf = (id: number) => line.recognized?.candidates.find((c) => c.id === id)?.score;
        const draft = line.newProduct;
        const unitLabel = line.product?.unit ?? (draft ? units.find((u) => u.id === draft.unitId)?.shortName ?? "шт" : undefined);
        return (
          <Box
            key={line.key}
            sx={(t) => ({
              px: { xs: 1.5, md: 2 },
              py: 1.25,
              borderBottom: 1,
              borderColor: "divider",
              // Строка из документа, которой не нашлось товара, — акцент
              // полосой слева, а не отдельной карточкой; новая карточка —
              // зелёной полосой.
              ...(draft
                ? { boxShadow: `inset 3px 0 0 ${t.palette.success.main}` }
                : line.recognized && !line.product
                  ? {
                      bgcolor: alpha(t.palette.warning.main, 0.06),
                      boxShadow: `inset 3px 0 0 ${t.palette.warning.main}`,
                    }
                  : {}),
            })}
          >
            {line.recognized && (
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                {line.product ? (
                  <CheckCircleOutlined sx={{ fontSize: 16, color: "success.main" }} />
                ) : draft ? (
                  <NewReleasesOutlined sx={{ fontSize: 16, color: "success.main" }} />
                ) : (
                  <ErrorOutlineOutlined sx={{ fontSize: 16, color: "warning.main" }} />
                )}
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  В документе: «{line.recognized.name}»
                  {[line.recognized.modelCode, line.recognized.color, line.recognized.size]
                    .filter(Boolean)
                    .map((part) => ` · ${part}`)
                    .join("")}
                  {[line.recognized.sku && `Артикул ${line.recognized.sku}`, line.recognized.barcode && `ШК ${line.recognized.barcode}`]
                    .filter(Boolean)
                    .map((part) => ` · ${part}`)
                    .join("")}
                  {line.recognized.matchScore != null && line.product ? ` · совпадение ${line.recognized.matchScore}%` : ""}
                </Typography>
                {canCreateProducts && !line.product && !draft && (
                  <Button
                    size="small"
                    color="success"
                    startIcon={<AddCircleOutlineOutlined sx={{ fontSize: 16 }} />}
                    onClick={() => startNewProduct(line.key)}
                    sx={{ py: 0, flexShrink: 0, whiteSpace: "nowrap", fontSize: "0.75rem" }}
                  >
                    Создать товар
                  </Button>
                )}
              </Stack>
            )}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "minmax(0, 1fr) minmax(0, 1fr) auto 32px", md: LINE_COLUMNS },
                // Название нового товара вводят руками — ему вся ширина строки,
                // количество и цена — строкой ниже, как на телефоне.
                gridTemplateAreas: draft
                  ? {
                      xs: '"product product product product" "qty price total del"',
                      md: '"product product product product product" ". qty price total del"',
                    }
                  : {
                      xs: '"product product product product" "qty price total del"',
                      md: '"product qty price total del"',
                    },
                gap: 1,
                alignItems: "center",
              }}
            >
              {draft ? (
                <TextField
                  size="small"
                  value={draft.name}
                  onChange={(e) => updateDraft(line.key, { name: e.target.value })}
                  placeholder="Название нового товара"
                  error={!draft.name.trim()}
                  sx={{ minWidth: 0, gridArea: "product" }}
                  inputProps={{ "aria-label": "Название нового товара" }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Chip size="small" color="success" label="Новый" sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title="Выбрать из каталога">
                          <IconButton size="small" edge="end" onClick={() => cancelNewProduct(line.key)} aria-label="Выбрать товар из каталога">
                            <CloseOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  }}
                />
              ) : (
                <Autocomplete<ProductOption, false, false, false>
                  options={options}
                  value={line.product}
                  onChange={(_, value) => {
                    if (value?.create) startNewProduct(line.key, value.label);
                    else updateLine(line.key, { product: value });
                  }}
                  filterOptions={(all, state) => {
                    const filtered = filterProductOptions(all, state);
                    const typed = state.inputValue.trim();
                    // Нет в каталоге — «Создать товар «…»» последним пунктом,
                    // и только у тех, кому это право выдано.
                    if (canCreateProducts && typed && !all.some((o) => o.label.toLowerCase() === typed.toLowerCase())) {
                      filtered.push({ id: CREATE_OPTION_ID, label: typed, unit: "", sku: "", create: true });
                    }
                    return filtered;
                  }}
                  getOptionLabel={(o) => o.label}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  loading={productsQuery.isLoading}
                  size="small"
                  sx={{ minWidth: 0, gridArea: "product" }}
                  // Колонка товара бывает узкой — список шире поля, иначе названия не прочесть.
                  slotProps={{ popper: { placement: "bottom-start", sx: { minWidth: 320 } } }}
                  renderOption={(props, option) => {
                    if (option.create) {
                      return (
                        <li {...props} key={CREATE_OPTION_ID}>
                          <AddCircleOutlineOutlined fontSize="small" sx={{ mr: 1, color: "success.main", flexShrink: 0 }} />
                          <Typography variant="body2" noWrap sx={{ color: "success.main", fontWeight: 600 }}>
                            Создать товар «{option.label}»
                          </Typography>
                        </li>
                      );
                    }
                    const score = scoreOf(option.id);
                    return (
                      <li {...props} key={option.id}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" noWrap>
                            {option.label}
                          </Typography>
                          {option.sku && (
                            <Typography variant="caption" color="text.secondary">
                              {option.sku}
                            </Typography>
                          )}
                        </Box>
                        {score != null && <Chip size="small" label={`${score}%`} sx={{ height: 20, fontSize: "0.7rem" }} />}
                      </li>
                    );
                  }}
                  renderInput={(params) => <TextField {...params} placeholder={`Товар ${index + 1}`} />}
                />
              )}
              <TextField
                size="small"
                value={line.quantity}
                onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                placeholder="Кол-во"
                sx={{ gridArea: "qty", minWidth: 0 }}
                inputProps={{ inputMode: "decimal", style: { textAlign: "right" }, "aria-label": "Количество" }}
                InputProps={{
                  endAdornment: unitLabel ? (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                      {unitLabel}
                    </Typography>
                  ) : undefined,
                }}
              />
              <TextField
                size="small"
                value={line.price}
                onChange={(e) => updateLine(line.key, { price: e.target.value })}
                placeholder="Цена"
                sx={{ gridArea: "price", minWidth: 0 }}
                inputProps={{ inputMode: "decimal", style: { textAlign: "right" }, "aria-label": "Цена" }}
              />
              <Typography
                variant="body2"
                sx={{
                  gridArea: "total",
                  fontWeight: 700,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  color: lineTotal(line) > 0 ? "text.primary" : "text.disabled",
                }}
              >
                {lineTotal(line) > 0 ? formatMoney(lineTotal(line)) : "—"}
              </Typography>
              <IconButton
                size="small"
                onClick={() => removeLine(line.key)}
                aria-label="Удалить позицию"
                sx={{ gridArea: "del", justifySelf: "end", color: "text.secondary", "&:hover": { color: "error.main" } }}
              >
                <DeleteOutlineOutlined fontSize="small" />
              </IconButton>
            </Box>
            {draft && (
              <NewProductFields
                draft={draft}
                onChange={(patch) => updateDraft(line.key, patch)}
                categories={categoryOptions}
                legacyCategories={legacyCategoriesQuery.data ?? []}
                units={units}
                problem={problemOf(line)}
                disabled={saving}
              />
            )}
          </Box>
        );
      })}
      {unmatched.length > 0 && (
        <Typography variant="caption" color="warning.main" sx={{ display: "block", px: { xs: 1.5, md: 2 }, py: 0.75, borderBottom: 1, borderColor: "divider" }}>
          Позиции без товара не войдут в приход — выберите товар из каталога
          {canCreateProducts ? " или создайте новый." : "."}
        </Typography>
      )}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={1}
        sx={{ px: { xs: 1, md: 1.5 }, py: 0.75, bgcolor: "action.hover" }}
      >
        <Button variant="text" size="small" startIcon={<AddOutlined />} onClick={() => setLines((prev) => [...prev, newLine()])}>
          Добавить позицию
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums", pr: 1 }}>
          По позициям{" "}
          <Typography component="span" variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
            {formatMoney(total)} {currency}
          </Typography>
        </Typography>
      </Stack>
    </Section>
  );

  const costsSection = (
    <Section icon={<LocalShippingOutlined />} title="Расходы на поставку" extra={<Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", md: "block" } }}>в сомах, войдут в себестоимость</Typography>}>
      <Box sx={{ display: "grid", gridTemplateColumns: FIELD_GRID, gap: 1.5 }}>
        <Box>
          <Label>Растаможка, сом</Label>
          <TextField fullWidth size="small" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} inputProps={{ inputMode: "decimal" }} />
        </Box>
        <Box>
          <Label>Доставка, сом</Label>
          <TextField fullWidth size="small" value={deliveryCost} onChange={(e) => setDeliveryCost(e.target.value)} inputProps={{ inputMode: "decimal" }} />
        </Box>
        <Box>
          <Label>Прочие расходы, сом</Label>
          <TextField fullWidth size="small" value={otherCosts} onChange={(e) => setOtherCosts(e.target.value)} inputProps={{ inputMode: "decimal" }} />
        </Box>
      </Box>
    </Section>
  );

  const extrasSection = (
    <Section icon={<AttachFileOutlined />} title="Файлы и комментарий">
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "auto minmax(0, 1fr)" }, gap: 2, alignItems: "start" }}>
        <InvoicePhotosField state={photos} disabled={busy} />
        <Box>
          <Label>Комментарий</Label>
          <TextField
            fullWidth
            size="small"
            multiline
            minRows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Состояние товара, расхождения с заказом…"
          />
        </Box>
      </Box>
    </Section>
  );

  const formView = (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: showAside ? "minmax(320px, 0.8fr) minmax(0, 1.4fr)" : "minmax(0, 1fr)",
        gap: 2.5,
        alignItems: "start",
        maxWidth: showAside ? "none" : 1080,
        mx: "auto",
        width: "100%",
      }}
    >
      {showAside && (
        <Box sx={{ position: "sticky", top: 0, height: "calc(100vh - 220px)", minHeight: 420 }}>
          <DocumentPreview files={previewFiles} />
        </Box>
      )}
      {/* Блоки не сжимаются под высоту окна — иначе карточка распознавания
          с overflow:hidden сплющивается вместо прокрутки. */}
      <Stack spacing={2} sx={{ minWidth: 0, "& > *": { flexShrink: 0 } }}>
        {recognitionCard}
        {error && <Alert severity="error">{error}</Alert>}
        {documentSection}
        {linesSection}
        {costsSection}
        {extrasSection}
      </Stack>
    </Box>
  );

  const canGoBack = mode === "form" && !isDirty && !busy;

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        fullScreen={isPhone}
        maxWidth={false}
        PaperProps={{
          sx: {
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            bgcolor: "background.default",
            ...(isPhone
              ? {}
              : {
                  m: 3,
                  borderRadius: "20px",
                  width: mode === "form" ? "min(1440px, calc(100vw - 48px))" : "min(1040px, calc(100vw - 48px))",
                  height: mode === "form" ? "calc(100vh - 48px)" : "auto",
                  maxHeight: "calc(100vh - 48px)",
                  transition: "width .25s ease",
                }),
          },
        }}
      >
        {fileInputs}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1.25, md: 1.75 }, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}
        >
          {canGoBack && (
            <Tooltip title="Назад к выбору способа">
              <IconButton onClick={() => setMode("start")} aria-label="Назад к выбору способа" edge="start">
                <ArrowBackOutlined />
              </IconButton>
            </Tooltip>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              Новая накладная
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
              {mode === "start"
                ? "Выберите, как заполнить приход"
                : `Количество встанет на склад при проведении · ${foreignCurrency ? "себестоимость — по курсу дня" : "всё в сомах"}`}
            </Typography>
          </Box>
          <IconButton onClick={requestClose} disabled={busy} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
        </Stack>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 1.5, md: 3 }, py: { xs: 2, md: 3 } }}>
          {mode === "start" ? startView : formView}
        </Box>

        {mode === "form" && (
          <Stack
            direction={{ xs: "column", md: "row" }}
            alignItems={{ xs: "stretch", md: "center" }}
            spacing={{ xs: 1.25, md: 2 }}
            sx={{
              px: { xs: 1.5, md: 3 },
              py: { xs: 1.25, md: 1.5 },
              pb: { xs: "calc(10px + env(safe-area-inset-bottom))", md: 1.5 },
              borderTop: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ flex: 1, minWidth: 0, flexWrap: "wrap", rowGap: 0.25 }}>
              <Typography variant="body2" color="text.secondary">
                Итого
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: "1.15rem", md: "1.35rem" }, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {formatMoney(grandTotal)} {currency}
              </Typography>
              {currency !== "KGS" && (
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                  ≈ {formatMoney(total * rate + landedExpenses)} сом
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                · позиций: {filledLines.length}
                {landedExpenses > 0 ? ` · расходы ${formatMoney(landedExpenses)} сом` : ""}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Button variant="outlined" color="inherit" onClick={requestClose} disabled={busy} sx={{ borderColor: "divider", flex: { xs: 1, md: "none" } }}>
                Отмена
              </Button>
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={!isValid || busy}
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleOutlined />}
                sx={{ flex: { xs: 2, md: "none" }, px: { md: 3 } }}
              >
                Провести приход
              </Button>
            </Stack>
          </Stack>
        )}
      </Dialog>
      <CloseGuardDialog
        open={closeConfirmOpen}
        title="накладную"
        onCancel={() => setCloseConfirmOpen(false)}
        onConfirm={discardAndClose}
      />
    </>
  );
};

export default ReceiptFormDialog;
