import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import BookmarkAddOutlined from "@mui/icons-material/BookmarkAddOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";

import { ApiError, getErrorMessage } from "../../api/client";
import {
  createReceipt,
  getNextReceiptNumber,
  recognizeReceiptPhoto,
  type GoodsReceipt,
  type GoodsReceiptLineInput,
  type ProcurementScope,
  type ProcurementSupplier,
  type RecognitionResult,
  type RecognizedCandidate,
  type RecognizedLine,
} from "../../api/procurement";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  createProductCategory,
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
import { CustomDateTimePicker, InvoicePhotosField } from "../ui";
import { formatMoney } from "./meta";
import { NewProductFields } from "./NewProductFields";
import { RecognitionDetails } from "./RecognitionDetails";
import { SupplierFormDrawer } from "./SupplierFormDrawer";
import {
  clearReceiptDraft,
  loadReceiptDraft,
  loadReceiptDraftFiles,
  saveReceiptDraft,
  saveReceiptDraftFiles,
  type ReceiptDraftSummary,
} from "./receiptDraftStore";
import {
  brandOptions,
  buildCategoryOptions,
  draftFromRecognized,
  draftProblem,
  emptyDraft,
  matchCategory,
  newProductInput,
  seasonOptions,
  sizeLineInputs,
  sizesProblem,
  sizesTotal,
  type CategoryOption,
  type NewProductDraft,
  type SizeQuantity,
} from "./newProductDraft";

const CURRENCIES = ["KGS", "USD", "RUB", "KZT", "EUR", "CNY"];

/** `create` — не товар каталога, а пункт «Создать товар «…»» по введённому тексту. */
type ProductOption = { id: number; label: string; unit: string; sku: string; create?: boolean };

const CREATE_OPTION_ID = -1;
const filterProductOptions = createFilterOptions<ProductOption>();

/** Поставщик в выпадающем списке; `create` — пункт «Создать поставщика «…»». */
type SupplierOption = { id: number; name: string; create?: boolean };
const filterSupplierOptions = createFilterOptions<SupplierOption>();

interface FormLine {
  key: string;
  product: ProductOption | null;
  /** Товара нет в каталоге — карточка заведётся вместе с приходом. */
  newProduct?: NewProductDraft;
  quantity: string;
  /** Цена за единицу — именно она уходит на сервер (`costAmount`). */
  price: string;
  /**
   * Сумма строки, как её ввели руками (из накладной). Пусто — сумму считаем
   * из цены. Заполнена — цена за единицу выводится из неё и количества.
   */
  amount: string;
  lotNumber: string;
  expiresAt: Dayjs | null;
  /**
   * Разбивка по размерам («матрёшка»): количество строки — сумма размеров,
   * цена за единицу у всех общая. Новая карточка уходит на сервер строкой
   * прихода на каждый размер.
   */
  sizes?: SizeRow[];
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
    brand?: string | null;
    season?: string | null;
    sizes?: Array<{ size: string; quantity: string | null }>;
    /** Вид товара из документа («Пальто») — категория новой карточки. */
    category?: string | null;
    sourceName?: string | null;
    description?: string | null;
    details?: Array<{ label: string; value: string }>;
    candidates: RecognizedCandidate[];
    matchScore: number | null;
  };
}

/** Размер во вложенной строке — со своим ключом для React. */
type SizeRow = SizeQuantity & { key: string };

/** Строка в отложенной накладной: дата — строкой, остальное как в форме. */
type StoredLine = Omit<FormLine, "expiresAt"> & { expiresAt: string | null };

/** Отложенная накладная — всё, что нужно, чтобы вернуть форму как была. */
interface StoredForm {
  supplierId: number | "";
  warehouseId: number | "";
  number: string;
  supplierNumber: string;
  receivedAt: string | null;
  currency: string;
  exchangeRate: string;
  customsCost: string;
  deliveryCost: string;
  otherCosts: string;
  comment: string;
  lines: StoredLine[];
  recognition: RecognitionResult | null;
}

/** Что мешает провести приход: что не так, как исправить и куда перевести взгляд. */
interface SubmitIssue {
  message: string;
  fix: string;
  /** `data-issue` элемента, к которому прокручиваем и на котором ставим фокус. */
  target: string;
}

/**
 * Колонки позиции на md+ (десктоп; телефон в проекте — всё, что уже md, см.
 * APP_BREAKPOINTS): товар, кол-во, цена за ед., сумма, удаление. Шапка и строки — по одной сетке.
 */
const LINE_COLUMNS = "minmax(0, 1fr) 104px 124px 132px 32px";

/** Поля шапки раскладываются сами по ширине колонки — и в модалке с превью, и без. */
const FIELD_GRID = "repeat(auto-fill, minmax(220px, 1fr))";

/**
 * Этапы разбора накладной и секунда, с которой каждый начинается. Сервер
 * отвечает одним запросом, так что это не отчёт о его шагах, а честная по
 * порядку подсказка: этапы идут только вперёд, последний держится, пока
 * ответа нет, — по кругу они не бегают. Тайминги — по типичной накладной
 * (10–40 с); длинная многостраничная просто дольше стоит на последнем.
 */
const RECOGNITION_STAGES: Array<{ label: string; from: number }> = [
  { label: "Загружаем снимок…", from: 0 },
  { label: "Сканируем документ и читаем текст…", from: 2 },
  { label: "Находим поставщика, номер и дату…", from: 7 },
  { label: "Читаем позиции: названия, количество, цены…", from: 13 },
  { label: "Перепроверяем строки и итоги…", from: 24 },
  { label: "Сопоставляем товары со складом…", from: 36 },
  { label: "Почти готово — собираем форму…", from: 48 },
];

/** Этап по прошедшему времени: последний, чей порог уже пройден. */
const recognitionStageAt = (seconds: number): number =>
  RECOGNITION_STAGES.reduce((stage, item, index) => (seconds >= item.from ? index : stage), 0);

/** Потолок процента, пока сервер не ответил: 100% — только когда ответ уже есть. */
const RECOGNITION_PERCENT_CAP = 97;

/**
 * Процент по прошедшему времени: быстро в начале и всё медленнее к концу —
 * 30 с ≈ 65%, 60 с ≈ 88%, дальше подползает к потолку, но не достигает
 * его. Точным он не бывает (сервер не сообщает прогресс), зато не стоит на
 * месте и не показывает «готово» раньше времени.
 */
const recognitionPercentAt = (seconds: number): number =>
  Math.min(RECOGNITION_PERCENT_CAP, Math.floor(RECOGNITION_PERCENT_CAP * (1 - Math.exp(-seconds / 28))));

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
  amount: "",
  lotNumber: "",
  expiresAt: null,
});

const sizeRow = (size = "", quantity = ""): SizeRow => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  size,
  quantity,
});

/** Количество для поля: ноль — пустое поле, а не «0». */
const quantityText = (value: number): string => (value > 0 ? String(value) : "");

/** Строка с размером — одним или разложенными: новая категория для неё заводится вариантной. */
const hasSize = (line: FormLine): boolean => Boolean(line.sizes?.length || line.newProduct?.size.trim());

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
  brand: line.brand,
  season: line.season,
  sizes: line.sizes,
  category: line.category,
  sourceName: line.sourceName,
  description: line.description,
  details: line.details,
  candidates: line.candidates,
  matchScore: line.match?.score ?? null,
});

/** Пикер даты-времени шагает по 15 минут: «сейчас» округляем вниз, иначе поле красное. */
const roundToStep = (value: Dayjs): Dayjs => value.minute(Math.floor(value.minute() / 15) * 15).second(0).millisecond(0);

const toNumber = (raw: string): number => {
  const n = Number(String(raw).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Деньги — до копеек: сервер хранит цену за единицу с двумя знаками. */
const roundMoney = (value: number): number => Math.round(value * 100) / 100;

/** Цена за единицу из суммы строки; без количества её не вывести — пусто. */
const priceFromAmount = (amount: string, quantity: string): string => {
  const sum = toNumber(amount);
  const qty = toNumber(quantity);
  return sum > 0 && qty > 0 ? String(roundMoney(sum / qty)) : "";
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
  /**
   * Право `procurement.suppliers.manage`: поставщика нет в справочнике —
   * его заводят прямо отсюда, с реквизитами из распознанной накладной.
   */
  canCreateSupplier?: boolean;
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
  canCreateSupplier = false,
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
  /** Дату прихода подставило распознавание — с документа поставщика, не «сегодня». */
  const [receivedAtFromDocument, setReceivedAtFromDocument] = React.useState(false);
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
  /** Сколько секунд идёт разбор — от него этап и процент. */
  const [recognitionSeconds, setRecognitionSeconds] = React.useState(0);
  /** Ответ уже пришёл: коротко показываем 100% и только потом открываем форму. */
  const [recognitionDone, setRecognitionDone] = React.useState(false);
  const recognitionStage = recognitionDone ? RECOGNITION_STAGES.length - 1 : recognitionStageAt(recognitionSeconds);
  const recognitionPercent = recognitionDone ? 100 : recognitionPercentAt(recognitionSeconds);
  const [recognition, setRecognition] = React.useState<RecognitionResult | null>(null);
  const [recognitionError, setRecognitionError] = React.useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = React.useState(false);
  /** Форма поставщика поверх накладной; `initial` — реквизиты из документа. */
  const [supplierForm, setSupplierForm] = React.useState<{ open: boolean; initial?: React.ComponentProps<typeof SupplierFormDrawer>["initial"] }>({ open: false });
  /** Текст, набранный в поле поставщика, — для пункта «Создать «…»». */
  const [supplierInput, setSupplierInput] = React.useState("");
  /** После первой попытки провести поля с ошибками подсвечиваются. */
  const [showIssues, setShowIssues] = React.useState(false);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const captureRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  // Черновик — на организацию сессии, а не на явный скоуп: у обычного
  // пользователя `scope.organizationId` пуст.
  const draftOrgId = scope.organizationId ?? activeOrganization?.id ?? null;
  /** Отложенная накладная этого браузера — для карточки «Продолжить» на старте. */
  const [storedDraft, setStoredDraft] = React.useState<ReceiptDraftSummary | null>(null);
  React.useEffect(() => {
    if (open) setStoredDraft(loadReceiptDraft<StoredForm>(draftOrgId)?.summary ?? null);
  }, [open, draftOrgId]);

  React.useEffect(() => {
    if (!recognizing) {
      setRecognitionSeconds(0);
      return undefined;
    }
    // От реального времени, а не от числа тиков: фоновая вкладка тикает
    // редко, и счётчик тиков отставал бы от того, сколько человек ждёт.
    const started = Date.now();
    const timer = window.setInterval(() => setRecognitionSeconds((Date.now() - started) / 1000), 250);
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
  // Свойства нужны и дереву категорий (оси варианта), и подсказкам бренда —
  // у любой вертикали, не только у розницы.
  const attributesQuery = useQuery({
    queryKey: ["django", "procurement", "form-attributes", orgId ?? null],
    queryFn: ({ signal }) => getProductAttributes(signal, orgId),
    enabled: directoriesEnabled,
    staleTime: 60_000,
  });
  const categoryTreeQuery = useQuery({
    queryKey: ["django", "procurement", "form-category-tree", orgId ?? null],
    queryFn: ({ signal }) => getProductCategoryTree(signal, orgId),
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
  const categoryOptions = React.useMemo(
    () => (categoryTreeQuery.data && attributesQuery.data ? buildCategoryOptions(categoryTreeQuery.data, attributesQuery.data) : []),
    [categoryTreeQuery.data, attributesQuery.data],
  );
  const brands = React.useMemo(() => brandOptions(attributesQuery.data ?? []), [attributesQuery.data]);
  const seasons = React.useMemo(() => seasonOptions(attributesQuery.data ?? []), [attributesQuery.data]);
  /**
   * Новая категория из накладной («Пальто»), чьи строки с размерами, —
   * заводится вариантной: с цветом и размером организации. Так размеры
   * становятся клетками одной модели. Нет у организации этих свойств —
   * категория обычная, а размеры уходят отдельными карточками.
   */
  const matrixAxes = React.useMemo(() => {
    const active = (attributesQuery.data ?? []).filter((a) => a.isActive);
    const color = active.find((a) => a.role === "color");
    const size = active.find((a) => a.role === "size");
    if (!color || !size) return null;
    const values = (attribute: typeof color) =>
      attribute.values.filter((v) => v.isActive).sort((a, b) => a.position - b.position).map((v) => v.value);
    const pending: CategoryOption = { id: -1, label: "", matrix: true, colors: values(color), sizes: values(size) };
    return { ids: [color.id, size.id], pending };
  }, [attributesQuery.data]);
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

  /** Только что заведённый поставщик — в списке, пока справочник страницы не перечитался. */
  const [createdSuppliers, setCreatedSuppliers] = React.useState<ProcurementSupplier[]>([]);
  const supplierOptions = React.useMemo<SupplierOption[]>(() => {
    const known = new Map<number, ProcurementSupplier>();
    [...suppliers, ...createdSuppliers].forEach((s) => known.set(s.id, s));
    return Array.from(known.values())
      .filter((s) => s.isActive || s.id === supplierId)
      .map((s) => ({ id: s.id, name: s.name }));
  }, [suppliers, createdSuppliers, supplierId]);

  /** Форма нового поставщика — с тем, что о нём сказано в накладной. */
  const openSupplierCreate = (typedName?: string) => {
    const doc = recognition?.document;
    const address = doc?.supplier.address?.trim();
    setSupplierForm({
      open: true,
      initial: {
        name: (typedName ?? supplierInput).trim() || doc?.supplier.name || "",
        taxId: doc?.supplier.taxId ?? "",
        phone: doc?.supplier.phone ?? "",
        paymentTerms: doc?.paymentTerms ?? "",
        defaultCurrency: doc?.currency && CURRENCIES.includes(doc.currency) ? doc.currency : undefined,
        comment: address ? `Адрес: ${address}` : "",
      },
    });
  };

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

  // Цена и сумма строки — два входа в одно число. Что ввели последним, то и
  // держим: введённая сумма (как в накладной) при смене количества остаётся,
  // а цена за единицу пересчитывается; введённая цена — наоборот.
  const setLineQuantity = (key: string, quantity: string) =>
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        return l.amount ? { ...l, quantity, price: priceFromAmount(l.amount, quantity) } : { ...l, quantity };
      }),
    );
  const setLinePrice = (key: string, price: string) => updateLine(key, { price, amount: "" });
  const setLineAmount = (key: string, amount: string) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, amount, price: priceFromAmount(amount, l.quantity) } : l)),
    );

  // ── Размеры строки («матрёшка») ──────────────────────────────────────────
  // Верхние поля строки следуют за размерами: количество — их сумма, а
  // введённая сумма строки (как в накладной) держится — пересчитывается цена.

  const setLineSizes = (key: string, update: (rows: SizeRow[]) => SizeRow[]) =>
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const sizes = update(l.sizes ?? []);
        // Последний размер убрали — строка снова одного размера, количество остаётся.
        if (sizes.length === 0) return { ...l, sizes: undefined };
        const quantity = quantityText(sizesTotal(sizes));
        return { ...l, sizes, quantity, price: l.amount ? priceFromAmount(l.amount, quantity) : l.price };
      }),
    );
  const updateSize = (key: string, rowKey: string, patch: Partial<SizeQuantity>) =>
    setLineSizes(key, (rows) => rows.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)));
  const removeSize = (key: string, rowKey: string) => setLineSizes(key, (rows) => rows.filter((r) => r.key !== rowKey));
  const addSize = (key: string) => setLineSizes(key, (rows) => [...rows, sizeRow()]);
  /** «По размерам»: текущий размер и количество — первой вложенной строкой. */
  const splitBySizes = (key: string) =>
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const size = l.newProduct?.size.trim() || l.recognized?.size?.trim() || "";
        return {
          ...l,
          sizes: [sizeRow(size, l.quantity), sizeRow()],
          newProduct: l.newProduct ? { ...l.newProduct, size: "" } : l.newProduct,
        };
      }),
    );

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
          brands,
          seasons,
          categories: categoryOptions,
          // Артикул поставщика общий у размеров одной модели — такой не берём.
          skuIsUnique:
            Boolean(line.recognized.sku) &&
            allLines.filter((l) => l.recognized?.sku && l.recognized.sku === line.recognized?.sku).length === 1,
        })
      : emptyDraft();
    const name = typedName?.trim();
    // Вид товара из документа («Пальто») важнее: он и найден, и предложен
    // новой категорией. Нет его — последняя выбранная категория, если она
    // есть в справочнике этой организации.
    if (base.categoryId != null || base.newCategory.trim()) return { ...base, name: name || base.name };
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

  const applySeasonToNew = (season: string) =>
    setLines((prev) => prev.map((l) => (l.newProduct ? { ...l, newProduct: { ...l.newProduct, season } } : l)));

  const applyCategoryToNew = (categoryId: number | null) => {
    lastCategoryRef.current = categoryId;
    setLines((prev) => prev.map((l) => (l.newProduct ? { ...l, newProduct: { ...l.newProduct, categoryId, newCategory: "" } } : l)));
  };

  /** Новые категории, которые заведутся вариантными: у их строк есть размеры. */
  const matrixNewCategories = new Set(
    matrixAxes
      ? lines
          .filter((l) => l.newProduct && l.newProduct.categoryId == null && l.newProduct.newCategory.trim() && hasSize(l))
          .map((l) => l.newProduct!.newCategory.trim().toLowerCase())
      : [],
  );
  /** Категория черновика: из справочника либо та, что заведётся при проведении. */
  const categoryOf = (draft: NewProductDraft): CategoryOption | null =>
    draft.categoryId != null
      ? categoryById.get(draft.categoryId) ?? null
      : matrixNewCategories.has(draft.newCategory.trim().toLowerCase())
        ? matrixAxes?.pending ?? null
        : null;

  const problemOf = (line: FormLine): string | null =>
    line.newProduct
      ? draftProblem(
          // Размер у разложенной строки — в каждой вложенной, не в карточке.
          line.sizes?.length ? { ...line.newProduct, size: line.sizes[0].size || "—" } : line.newProduct,
          { categoryRequired, category: categoryOf(line.newProduct) },
        )
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
    Boolean(line.product || line.newProduct || line.quantity || line.price || line.amount || line.lotNumber || line.expiresAt || line.recognized),
  );
  const isDirty = Boolean(
    supplierId !== "" ||
    supplierNumber.trim() ||
    number.trim() !== (nextNumberQuery.data?.number ?? "") ||
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
    setReceivedAtFromDocument(false);
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
    setSupplierInput("");
    setShowIssues(false);
    setMode("start");
    photos.reset();
  }, [photos]);

  // ── Отложенная накладная ─────────────────────────────────────────────────

  /** Снимок формы для хранилища: всё, что вернёт её как была. */
  const snapshot = (): StoredForm => ({
    supplierId,
    warehouseId,
    number,
    supplierNumber,
    receivedAt: receivedAt ? receivedAt.toISOString() : null,
    currency,
    exchangeRate,
    customsCost,
    deliveryCost,
    otherCosts,
    comment,
    lines: lines.map((l) => ({ ...l, expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null })),
    recognition,
  });

  const draftSummary = (): ReceiptDraftSummary => ({
    savedAt: new Date().toISOString(),
    supplierName: suppliers.find((s) => s.id === supplierId)?.name ?? recognition?.document.supplier.name ?? null,
    linesCount: lines.filter((l) => l.product || l.newProduct || l.recognized || l.quantity).length,
    filesCount: photos.pending.length,
  });

  // Автосохранение: пока в форме что-то есть, её копия лежит в браузере —
  // закрыли вкладку, обновили страницу, ушли на другой экран — ничего не
  // пропало. Пишем с задержкой, чтобы не дёргать хранилище на каждую букву.
  const draftWriteRef = React.useRef<() => void>(() => undefined);
  draftWriteRef.current = () => saveReceiptDraft(draftOrgId, draftSummary(), snapshot());
  React.useEffect(() => {
    if (!open || mode !== "form" || saving || !isDirty) return undefined;
    const timer = window.setTimeout(() => draftWriteRef.current(), 600);
    return () => window.clearTimeout(timer);
  }, [open, mode, saving, isDirty, supplierId, warehouseId, number, supplierNumber, receivedAt, currency, exchangeRate, customsCost, deliveryCost, otherCosts, comment, lines, recognition, photos.pending.length]);
  // Файлы — отдельно и только когда меняется их набор.
  React.useEffect(() => {
    if (!open || mode !== "form" || saving) return;
    void saveReceiptDraftFiles(draftOrgId, photos.pending.map((p) => p.file));
  }, [open, mode, saving, draftOrgId, photos.pending]);

  /** Вернуть отложенную накладную в форму. */
  const restoreDraft = async () => {
    const stored = loadReceiptDraft<StoredForm>(draftOrgId);
    if (!stored) {
      setStoredDraft(null);
      return;
    }
    const form = stored.form;
    setSupplierId(form.supplierId);
    setWarehouseId(form.warehouseId);
    setNumber(form.number);
    setSupplierNumber(form.supplierNumber);
    setReceivedAt(form.receivedAt ? dayjs(form.receivedAt) : roundToStep(dayjs()));
    setReceivedAtFromDocument(false);
    setCurrency(form.currency);
    setExchangeRate(form.exchangeRate);
    setCustomsCost(form.customsCost);
    setDeliveryCost(form.deliveryCost);
    setOtherCosts(form.otherCosts);
    setComment(form.comment);
    setLines(
      form.lines.length > 0
        ? form.lines.map((l) => ({ ...l, expiresAt: l.expiresAt ? dayjs(l.expiresAt) : null }))
        : [newLine()],
    );
    setRecognition(form.recognition);
    setSupplierInput(form.supplierId === "" ? form.recognition?.document.supplier.name ?? "" : "");
    setMode("form");
    const files = await loadReceiptDraftFiles(draftOrgId);
    if (files.length > 0) await photos.pick(files);
  };

  const discardStoredDraft = () => {
    clearReceiptDraft(draftOrgId);
    setStoredDraft(null);
  };

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

  /** «Отложить»: копия уже в браузере — сохраняем свежую и закрываем. */
  const deferAndClose = () => {
    draftWriteRef.current();
    void saveReceiptDraftFiles(draftOrgId, photos.pending.map((p) => p.file));
    setCloseConfirmOpen(false);
    resetForm();
    onClose();
  };

  /** «Удалить»: и форму, и отложенную копию. */
  const discardAndClose = React.useCallback(() => {
    setCloseConfirmOpen(false);
    clearReceiptDraft(draftOrgId);
    resetForm();
    onClose();
  }, [draftOrgId, onClose, resetForm]);

  // ── Проверка перед проведением ───────────────────────────────────────────

  /** Строка, которую человек не трогал: её просто не отправляем. */
  const isBlankLine = (l: FormLine) => !l.product && !l.newProduct && !l.recognized && !l.quantity && !l.price && !l.amount;
  /** Позиции накладной — все непустые строки, в том числе ещё без товара. */
  const positionLines = lines.filter((l) => !isBlankLine(l));

  /** Что не так со строкой — текстом для продавца и тем, как это исправить. */
  const lineIssue = (line: FormLine, position: number): SubmitIssue | null => {
    if (isBlankLine(line)) return null;
    const title = line.recognized?.name ? ` («${line.recognized.name.slice(0, 60)}${line.recognized.name.length > 60 ? "…" : ""}»)` : "";
    if (!hasProduct(line)) {
      return {
        message: `Позиция ${position}${title}: не выбран товар.`,
        fix: canCreateProducts
          ? "Выберите товар из списка или нажмите «Создать товар» (для всех сразу — «Создать все» над списком). Лишнюю строку удалите корзиной справа."
          : "Выберите товар из списка. Лишнюю строку удалите корзиной справа.",
        target: `line-${line.key}`,
      };
    }
    const problem = problemOf(line);
    if (problem) {
      const fix =
        problem === "Укажите название товара"
          ? "Впишите название нового товара в строке."
          : problem === "Выберите категорию"
            ? "Выберите категорию в карточке нового товара — или сразу для всех новых в списке «Категория для всех новых»."
            : "Укажите размер или очистите цвет.";
      return { message: `Позиция ${position}${title}: ${problem.toLowerCase()}.`, fix, target: `line-${line.key}` };
    }
    const sizeIssue = line.sizes?.length ? sizesProblem(line.sizes) : null;
    if (sizeIssue) {
      return {
        message: `Позиция ${position}${title}: ${sizeIssue.charAt(0).toLowerCase()}${sizeIssue.slice(1)}.`,
        fix: "Исправьте разбивку под строкой: у каждого размера — свой размер и количество, лишний уберите крестиком.",
        target: `sizes-${line.key}`,
      };
    }
    if (toNumber(line.quantity) <= 0) {
      return { message: `Позиция ${position}${title}: не указано количество.`, fix: "Впишите, сколько единиц пришло.", target: `qty-${line.key}` };
    }
    return null;
  };

  /** Первая проблема формы сверху вниз — ровно в том порядке, в каком её видно. */
  const collectIssue = (): SubmitIssue | null => {
    if (supplierId === "") {
      return {
        message: "Не выбран поставщик.",
        fix: canCreateSupplier
          ? "Выберите поставщика из списка. Если его ещё нет — выберите в списке «Создать поставщика»."
          : "Выберите поставщика из списка.",
        target: "supplier",
      };
    }
    if (warehouseId === "") return { message: "Не выбран склад.", fix: "Выберите склад, на который пришёл товар.", target: "warehouse" };
    if (!receivedAt || !receivedAt.isValid()) return { message: "Не указана дата прихода.", fix: "Укажите дату и время, когда пришёл товар.", target: "receivedAt" };
    for (let index = 0; index < lines.length; index += 1) {
      const found = lineIssue(lines[index], index + 1);
      if (found) return found;
    }
    if (filledLines.length === 0) {
      return {
        message: "В накладной нет ни одной позиции.",
        fix: "Добавьте товар кнопкой «Добавить позицию» или загрузите фото накладной.",
        target: "lines",
      };
    }
    return null;
  };
  /** После первой попытки провести — живая подсказка: исправили, и она сменилась следующей. */
  const liveIssue = showIssues ? collectIssue() : null;

  // ── Распознавание ────────────────────────────────────────────────────────

  const applyRecognition = React.useCallback(
    (result: RecognitionResult) => {
      setRecognition(result);
      if (result.supplierMatch && supplierId === "") setSupplierId(result.supplierMatch.id);
      if (result.document.number && !supplierNumber) setSupplierNumber(result.document.number);
      if (result.document.date) {
        const parsed = dayjs(result.document.date);
        if (parsed.isValid()) {
          setReceivedAt(roundToStep(parsed.hour(dayjs().hour()).minute(dayjs().minute())));
          setReceivedAtFromDocument(true);
        }
      }
      // Поставщика нет в справочнике — его имя уже в поле, чтобы завести
      // одним нажатием («Создать «…»» в списке или кнопка в подсказке).
      if (!result.supplierMatch && result.document.supplier.name && supplierId === "") {
        setSupplierInput(result.document.supplier.name);
      }
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
        const sizes = (line.sizes ?? []).map((s) => sizeRow(s.size, s.quantity != null ? quantityText(Number(s.quantity)) : ""));
        const quantity = line.quantity ? Number(line.quantity) : null;
        // Разложенная по размерам строка: её количество — сумма размеров,
        // как и при ручной правке. Расхождение с документом — в предупреждениях.
        const lineQuantity = sizes.length
          ? quantityText(sizesTotal(sizes))
          : quantity != null && Number.isFinite(quantity)
            ? String(quantity)
            : "";
        // Цены за единицу в документе нет, есть только сумма строки — её и
        // показываем как введённую сумму, а цену выводим из неё.
        const amount = !line.price && line.total ? String(Number(line.total)) : "";
        return {
          ...newLine(),
          product: matched,
          quantity: lineQuantity,
          price: line.price ? String(Number(line.price)) : priceFromAmount(amount, lineQuantity),
          amount,
          sizes: sizes.length ? sizes : undefined,
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
    setRecognitionDone(false);
    setRecognizing(true);
    try {
      const result = await recognizeReceiptPhoto(file, scope);
      // 100% — только теперь, когда ответ есть; полсекунды, чтобы его увидели.
      setRecognitionDone(true);
      await new Promise((resolve) => window.setTimeout(resolve, 500));
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
      setRecognitionDone(false);
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

  /** Перевести взгляд на проблему: прокрутить к полю и поставить в него курсор. */
  const focusIssue = (target: string) => {
    const element = bodyRef.current?.querySelector<HTMLElement>(`[data-issue="${target}"]`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      const input = element.matches("input, textarea") ? element : element.querySelector<HTMLElement>("input:not([type=hidden]), textarea, [role=combobox], button");
      input?.focus({ preventScroll: true });
    }, 350);
  };

  /**
   * Новые категории из накладной («Пальто») — заводим перед приходом, по
   * одной на имя. Уже заведённая за это время (или только что в соседней
   * вкладке) берётся по имени, а не создаётся второй раз.
   */
  const ensureNewCategories = async (): Promise<Map<string, { id: number; matrix: boolean }>> => {
    const wanted = Array.from(
      new Set(filledLines.map((l) => l.newProduct?.categoryId == null ? l.newProduct?.newCategory.trim() : "").filter(Boolean) as string[]),
    );
    const ids = new Map<string, { id: number; matrix: boolean }>();
    for (const name of wanted) {
      const existing = matchCategory(categoryOptions, name);
      // Строки с размерами — категория с цветом и размером, иначе размеры не станут вариантами.
      const axes = matrixNewCategories.has(name.toLowerCase()) ? matrixAxes?.ids : undefined;
      const node = existing
        ? { id: existing.id, matrix: existing.matrix }
        : { id: (await createProductCategory({ name, organizationId: orgId, ...(axes ? { attributeIds: axes } : {}) })).id, matrix: Boolean(axes) };
      ids.set(name.toLowerCase(), node);
    }
    if (wanted.length > 0) await queryClient.invalidateQueries({ queryKey: ["django", "procurement", "form-category-tree"] });
    return ids;
  };

  const handleSubmit = async () => {
    if (saving || recognizing) return;
    const found = collectIssue();
    if (found) {
      setShowIssues(true);
      focusIssue(found.target);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const createdCategories = await ensureNewCategories();
      /** Черновик с id категории и её вариантностью — с учётом только что заведённых. */
      const resolveDraft = (draft: NewProductDraft): { draft: NewProductDraft; category: CategoryOption | null } => {
        if (draft.categoryId != null) return { draft, category: categoryById.get(draft.categoryId) ?? null };
        const created = createdCategories.get(draft.newCategory.trim().toLowerCase());
        const resolved = { ...draft, categoryId: created?.id ?? null, newCategory: "" };
        return { draft: resolved, category: created?.matrix ? matrixAxes?.pending ?? null : null };
      };
      const lineCost = (l: FormLine) => ({
        costAmount: String(toNumber(l.price)),
        costCurrency: currency,
        exchangeRate: String(rate),
        lotNumber: l.lotNumber.trim(),
        expiresAt: l.expiresAt ? l.expiresAt.endOf("day").toISOString() : null,
      });
      const created = await createReceipt(
        {
          supplierId: Number(supplierId),
          warehouseId: Number(warehouseId),
          number: number.trim(),
          supplierNumber: supplierNumber.trim(),
          receivedAt: receivedAt ? receivedAt.toISOString() : null,
          dueAt: null,
          comment: comment.trim(),
          customsCost: String(toNumber(customsCost)),
          deliveryCost: String(toNumber(deliveryCost)),
          otherCosts: String(toNumber(otherCosts)),
          // Новая карточка по размерам — строка прихода на каждый размер;
          // товар каталога принимает всё количество одной строкой.
          lines: filledLines.flatMap((l): GoodsReceiptLineInput[] => {
            if (l.product) return [{ productId: l.product.id, quantity: String(toNumber(l.quantity)), ...lineCost(l) }];
            const { draft, category } = resolveDraft(l.newProduct!);
            if (l.sizes?.length) {
              return sizeLineInputs(draft, category, l.sizes).map((entry) => ({ ...entry, ...lineCost(l) }));
            }
            return [{ newProduct: newProductInput(draft, category), quantity: String(toNumber(l.quantity)), ...lineCost(l) }];
          }),
        },
        scope,
      );
      const createdProducts = filledLines.reduce((sum, l) => sum + (l.newProduct ? l.sizes?.length || 1 : 0), 0);
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
      clearReceiptDraft(draftOrgId);
      resetForm();
      onCreated(created);
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось провести накладную"));
      setShowIssues(true);
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
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
              {recognitionDone ? "Готово — открываем форму" : "AI разбирает накладную…"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {recognitionSeconds >= 60 && !recognitionDone
                ? "Большая накладная — читаем дольше обычного, осталось немного."
                : "Обычно это 10–40 секунд. Форма откроется уже заполненной."}
            </Typography>
          </Box>
          <Typography
            aria-live="polite"
            sx={{ fontWeight: 800, fontSize: { xs: "1.4rem", md: "1.75rem" }, fontVariantNumeric: "tabular-nums", color: "primary.main", flexShrink: 0 }}
          >
            {recognitionPercent}%
          </Typography>
        </Stack>
        <Stack spacing={1}>
          {RECOGNITION_STAGES.map(({ label }, index) => {
            const done = recognitionDone || index < recognitionStage;
            const current = !recognitionDone && index === recognitionStage;
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
        <LinearProgress
          variant="determinate"
          value={recognitionPercent}
          sx={{ borderRadius: 1, height: 8, "& .MuiLinearProgress-bar": { transition: "transform .4s linear" } }}
        />
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
      {storedDraft && !recognizing && (
        <Box
          sx={(t) => ({
            p: { xs: 1.5, md: 2 },
            borderRadius: "16px",
            border: "1px solid",
            borderColor: alpha(t.palette.primary.main, 0.35),
            bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.1 : 0.05),
            display: "flex",
            alignItems: { xs: "stretch", md: "center" },
            flexDirection: { xs: "column", md: "row" },
            gap: 1.5,
          })}
        >
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={(t) => ({
                width: 40,
                height: 40,
                borderRadius: "10px",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                color: "primary.main",
                bgcolor: alpha(t.palette.primary.main, 0.14),
              })}
            >
              <RestoreOutlined />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Есть отложенная накладная
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {[
                  storedDraft.supplierName,
                  `позиций: ${storedDraft.linesCount}`,
                  storedDraft.filesCount > 0 ? `файлов: ${storedDraft.filesCount}` : null,
                  `сохранена ${dayjs(storedDraft.savedAt).format("DD.MM в HH:mm")}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                Новая накладная заменит отложенную.
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button color="error" size="small" onClick={discardStoredDraft}>
              Удалить
            </Button>
            <Button variant="contained" size="small" startIcon={<RestoreOutlined />} onClick={() => void restoreDraft()}>
              Продолжить
            </Button>
          </Stack>
        </Box>
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
              ? `${recognitionPercent}% · ${recognitionDone ? "Готово" : RECOGNITION_STAGES[recognitionStage].label}`
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
      {recognizing && <LinearProgress variant="determinate" value={recognitionPercent} sx={{ mt: 1.5, borderRadius: 1, height: 5 }} />}
      {recognitionError && (
        <Alert severity="warning" sx={{ mt: 1.5 }} onClose={() => setRecognitionError(null)}>
          {recognitionError}
        </Alert>
      )}
      {recognition && recognition.warnings.length > 0 && (
        <Alert severity="info" icon={<ErrorOutlineOutlined fontSize="inherit" />} sx={{ mt: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
            Проверьте перед проведением
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.25, "& li + li": { mt: 0.5 } }}>
            {recognition.warnings.map((warning) => (
              <Typography component="li" variant="body2" key={warning}>
                {warning}
              </Typography>
            ))}
          </Box>
        </Alert>
      )}
      {recognition && !recognition.supplierMatch && recognition.document.supplier.name && supplierId === "" && (
        <Alert
          severity="warning"
          sx={{ mt: 1.5, alignItems: "center" }}
          action={
            canCreateSupplier ? (
              <Button color="inherit" size="small" startIcon={<PersonAddAltOutlined />} onClick={() => openSupplierCreate()} sx={{ whiteSpace: "nowrap" }}>
                Создать
              </Button>
            ) : undefined
          }
        >
          Поставщика «{recognition.document.supplier.name}» ещё нет в справочнике —
          {canCreateSupplier ? " создайте его с реквизитами из накладной или выберите другого." : " выберите его вручную."}
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
        <Box data-issue="supplier">
          <Label>Поставщик *</Label>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Autocomplete<SupplierOption, false, false, false>
              fullWidth
              size="small"
              options={supplierOptions}
              value={supplierOptions.find((o) => o.id === supplierId) ?? null}
              inputValue={supplierInput}
              onInputChange={(_, next, reason) => {
                // Пока поставщик не выбран, Autocomplete «сбрасывает» текст в
                // пустоту — а там имя из накладной, по которому его заводят.
                if (reason === "reset" && supplierId === "") return;
                setSupplierInput(next);
              }}
              onChange={(_, next) => {
                if (next?.create) {
                  openSupplierCreate(next.name);
                  return;
                }
                setSupplierId(next ? next.id : "");
              }}
              filterOptions={(all, state) => {
                const typed = state.inputValue.trim();
                const filtered = filterSupplierOptions(all, state);
                // Нет в справочнике — «Создать поставщика «…»» с реквизитами из накладной.
                if (canCreateSupplier && typed && !all.some((o) => o.name.toLowerCase() === typed.toLowerCase())) {
                  filtered.push({ id: CREATE_OPTION_ID, name: typed, create: true });
                }
                return filtered;
              }}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderOption={(props, option) =>
                option.create ? (
                  <li {...props} key="create-supplier">
                    <PersonAddAltOutlined fontSize="small" sx={{ mr: 1, color: "success.main" }} />
                    <Typography variant="body2" sx={{ color: "success.main", fontWeight: 600 }}>
                      Создать поставщика «{option.name}»
                    </Typography>
                  </li>
                ) : (
                  <li {...props} key={option.id}>
                    {option.name}
                  </li>
                )
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Выберите или впишите поставщика"
                  error={showIssues && supplierId === ""}
                />
              )}
            />
            {canCreateSupplier && (
              <Tooltip title="Новый поставщик">
                <IconButton size="small" onClick={() => openSupplierCreate()} aria-label="Новый поставщик">
                  <PersonAddAltOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Box>
        {/* Склад один — выбирать нечего: он подставлен сам, поле не нужно. */}
        {warehouses.length !== 1 && (
          <Box data-issue="warehouse">
            <Label>Склад *</Label>
            <TextField
              select
              fullWidth
              size="small"
              value={warehouseId}
              error={showIssues && warehouseId === ""}
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
        <Box data-issue="receivedAt">
          <Label>Дата прихода *</Label>
          <CustomDateTimePicker
            value={receivedAt}
            onChange={(v) => {
              setReceivedAt(v as Dayjs | null);
              setReceivedAtFromDocument(false);
            }}
            slotProps={{ textField: { size: "small", fullWidth: true } }}
          />
          {/* Список накладных — по месяцу даты прихода: с прошлой датой
              накладная уйдёт в тот месяц и в текущем её не будет. */}
          {receivedAt && receivedAt.isValid() && !receivedAt.isSame(dayjs(), "month") && (
            <Stack direction="row" alignItems="center" columnGap={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: "warning.onSurface" }}>
                {receivedAtFromDocument ? "Дата взята с документа поставщика. " : ""}
                Накладная попадёт в список за {receivedAt.format("MMMM YYYY")}.
              </Typography>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  setReceivedAt(roundToStep(dayjs()));
                  setReceivedAtFromDocument(false);
                }}
                sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: 12 }}
              >
                Поставить сегодня
              </Button>
            </Stack>
          )}
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
    <Box data-issue="lines">
    <Section
      flush
      icon={<Inventory2Outlined />}
      title={
        <>
          Позиции{" "}
          <Typography component="span" variant="caption" color="text.secondary">
            {positionLines.length > 0 ? `· ${positionLines.length}` : ""}
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
          <Autocomplete<string, false, false, true>
            freeSolo
            size="small"
            options={seasons}
            value={newLines.every((l) => l.newProduct?.season === newLines[0]?.newProduct?.season) ? newLines[0]?.newProduct?.season ?? "" : ""}
            onChange={(_, next) => applySeasonToNew(next ?? "")}
            onBlur={(e) => {
              const typed = (e.target as HTMLInputElement).value.trim();
              if (typed) applySeasonToNew(seasons.find((known) => known.toLowerCase() === typed.toLowerCase()) ?? typed);
            }}
            sx={{ flex: 1, minWidth: 0 }}
            renderInput={(params) => (
              <TextField {...params} label="Сезон для всех новых" placeholder="Разные" InputLabelProps={{ ...params.InputLabelProps, shrink: true }} />
            )}
          />
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
        {["Товар", "Кол-во", "Цена за ед.", "Сумма", ""].map((label, i) => (
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
        const bySizes = Boolean(line.sizes?.length);
        const sizeOptions = (draft ? categoryOf(draft)?.sizes : undefined) ?? matrixAxes?.pending.sizes ?? [];
        // После попытки провести строка с проблемой — красной полосой.
        const rowIssue = showIssues ? lineIssue(line, index + 1) : null;
        return (
          <Box
            key={line.key}
            data-issue={`line-${line.key}`}
            sx={(t) => ({
              px: { xs: 1.5, md: 2 },
              py: 1.25,
              borderBottom: 1,
              borderColor: "divider",
              scrollMarginTop: 16,
              // Строка из документа, которой не нашлось товара, — акцент
              // полосой слева, а не отдельной карточкой; новая карточка —
              // зелёной полосой.
              ...(rowIssue
                ? {
                    bgcolor: alpha(t.palette.error.main, 0.07),
                    boxShadow: `inset 4px 0 0 ${t.palette.error.main}`,
                  }
                : draft
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
                gridTemplateColumns: { xs: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 32px", md: LINE_COLUMNS },
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
                // По верху, не по центру: подсказка «в учёт …» под суммой не
                // должна сдвигать поле относительно соседей.
                alignItems: "start",
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
                onChange={(e) => {
                  if (!bySizes) setLineQuantity(line.key, e.target.value);
                }}
                placeholder="Кол-во"
                // На телефоне шапки колонок нет — подпись у самого поля.
                label={isPhone ? "Кол-во" : undefined}
                error={showIssues && hasProduct(line) && toNumber(line.quantity) <= 0}
                data-issue={`qty-${line.key}`}
                sx={{ gridArea: "qty", minWidth: 0 }}
                inputProps={{
                  inputMode: "decimal",
                  style: { textAlign: "right" },
                  "aria-label": "Количество",
                  // Разложенная строка: количество — сумма размеров, правится в них.
                  readOnly: bySizes,
                  title: bySizes ? "Сумма по размерам — меняйте количество в размерах ниже" : undefined,
                }}
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
                onChange={(e) => setLinePrice(line.key, e.target.value)}
                placeholder={`за 1 ${unitLabel ?? "шт"}`}
                // Поле на телефоне ~90px: «Цена за ед.» обрезается.
                label={isPhone ? "За ед." : undefined}
                sx={{ gridArea: "price", minWidth: 0 }}
                inputProps={{ inputMode: "decimal", style: { textAlign: "right" }, "aria-label": "Цена за единицу" }}
              />
              {(() => {
                const recorded = roundMoney(lineTotal(line));
                // Сумма не делится на количество до копейки (1000 на 3 шт) —
                // в учёт уйдёт цена × количество; показываем, сколько именно.
                const drift = line.amount !== "" && recorded > 0 && Math.abs(recorded - toNumber(line.amount)) >= 0.005;
                return (
                  <TextField
                    size="small"
                    value={line.amount !== "" ? line.amount : recorded > 0 ? String(recorded) : ""}
                    onChange={(e) => setLineAmount(line.key, e.target.value)}
                    placeholder="Сумма"
                    label={isPhone ? "Сумма" : undefined}
                    helperText={drift ? `в учёт ${formatMoney(recorded)}` : undefined}
                    FormHelperTextProps={{ sx: { mx: 0, textAlign: "right", color: "warning.main" } }}
                    sx={{ gridArea: "total", minWidth: 0, "& input": { fontWeight: 700 } }}
                    inputProps={{ inputMode: "decimal", style: { textAlign: "right" }, "aria-label": "Сумма строки" }}
                  />
                );
              })()}
              <IconButton
                size="small"
                onClick={() => removeLine(line.key)}
                aria-label="Удалить позицию"
                sx={{ gridArea: "del", justifySelf: "end", mt: 0.375, color: "text.secondary", "&:hover": { color: "error.main" } }}
              >
                <DeleteOutlineOutlined fontSize="small" />
              </IconButton>
            </Box>
            {bySizes && (
              <Box data-issue={`sizes-${line.key}`} sx={{ mt: 1, scrollMarginTop: 16 }}>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75, pl: { xs: 0.5, md: 1 } }}>
                  <StraightenOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    По размерам: {line.sizes!.length} · {line.quantity || 0} {unitLabel ?? "шт"}
                  </Typography>
                </Stack>
                {line.sizes!.map((row) => {
                  const rowTotal = roundMoney(toNumber(row.quantity) * toNumber(line.price));
                  const rowIssue = showIssues && (!row.size.trim() || toNumber(row.quantity) <= 0);
                  return (
                    <Box
                      key={row.key}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 32px", md: LINE_COLUMNS },
                        gridTemplateAreas: { xs: '"size qty total del"', md: '"size qty price total del"' },
                        gap: 1,
                        alignItems: "start",
                        mb: 0.75,
                      }}
                    >
                      {/* Вложенность видна линией слева — «матрёшка» внутри строки. */}
                      <Box
                        sx={(t) => ({
                          gridArea: "size",
                          minWidth: 0,
                          display: "flex",
                          justifyContent: { xs: "stretch", md: "flex-end" },
                          pl: { xs: 1, md: 2 },
                          borderLeft: `2px solid ${alpha(t.palette.primary.main, 0.35)}`,
                        })}
                      >
                        <Autocomplete<string, false, false, true>
                          freeSolo
                          size="small"
                          options={sizeOptions}
                          value={row.size}
                          onChange={(_, next) => updateSize(line.key, row.key, { size: next ?? "" })}
                          onInputChange={(_, next) => updateSize(line.key, row.key, { size: next })}
                          sx={{ width: { xs: "100%", md: 200 }, minWidth: 0 }}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              label="Размер"
                              error={showIssues && !row.size.trim()}
                              inputProps={{ ...params.inputProps, "aria-label": "Размер" }}
                            />
                          )}
                        />
                      </Box>
                      <TextField
                        size="small"
                        value={row.quantity}
                        onChange={(e) => updateSize(line.key, row.key, { quantity: e.target.value })}
                        placeholder="Кол-во"
                        label={isPhone ? "Кол-во" : undefined}
                        error={rowIssue && toNumber(row.quantity) <= 0}
                        sx={{ gridArea: "qty", minWidth: 0 }}
                        inputProps={{ inputMode: "decimal", style: { textAlign: "right" }, "aria-label": `Количество размера ${row.size}` }}
                        InputProps={{
                          endAdornment: unitLabel ? (
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                              {unitLabel}
                            </Typography>
                          ) : undefined,
                        }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ gridArea: "price", display: { xs: "none", md: "block" }, textAlign: "right", pt: 1, fontVariantNumeric: "tabular-nums" }}
                      >
                        {toNumber(line.price) > 0 ? `× ${formatMoney(toNumber(line.price))}` : ""}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ gridArea: "total", textAlign: "right", pt: 0.875, pr: 1.75, fontVariantNumeric: "tabular-nums", color: rowTotal > 0 ? "text.primary" : "text.disabled" }}
                      >
                        {rowTotal > 0 ? formatMoney(rowTotal) : "—"}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => removeSize(line.key, row.key)}
                        aria-label={`Убрать размер ${row.size}`}
                        sx={{ gridArea: "del", justifySelf: "end", mt: 0.375, color: "text.secondary", "&:hover": { color: "error.main" } }}
                      >
                        <CloseOutlined fontSize="small" />
                      </IconButton>
                    </Box>
                  );
                })}
                <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: { xs: 0.5, md: 1 } }}>
                  <Button size="small" startIcon={<AddOutlined />} onClick={() => addSize(line.key)} sx={{ py: 0, fontSize: "0.75rem" }}>
                    Размер
                  </Button>
                  {line.product && (
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                      Выбран товар каталога — всё количество уйдёт в него одной строкой. Чтобы завести каждый размер, создайте новый товар.
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}
            {draft && !bySizes && (
              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.5 }}>
                <Button
                  size="small"
                  startIcon={<StraightenOutlined sx={{ fontSize: 16 }} />}
                  onClick={() => splitBySizes(line.key)}
                  sx={{ py: 0, fontSize: "0.75rem" }}
                >
                  Разбить по размерам
                </Button>
              </Box>
            )}
            {draft && (
              <NewProductFields
                draft={draft}
                onChange={(patch) => updateDraft(line.key, patch)}
                categories={categoryOptions}
                legacyCategories={legacyCategoriesQuery.data ?? []}
                units={units}
                brands={brands}
                seasons={seasons}
                pendingCategory={categoryOf(draft)}
                sizes={line.sizes?.map((row) => row.size)}
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
    </Box>
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

        <Box ref={bodyRef} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 1.5, md: 3 }, py: { xs: 2, md: 3 } }}>
          {mode === "start" ? startView : formView}
        </Box>

        {mode === "form" && (liveIssue || error) && (
          // Почему не проводится и что сделать — прямо над кнопкой, чтобы
          // не искать причину по всей форме. Клик — снова к проблемному месту.
          <Alert
            severity="error"
            icon={<WarningAmberOutlined fontSize="inherit" />}
            onClick={liveIssue ? () => focusIssue(liveIssue.target) : undefined}
            sx={{ mx: { xs: 1.5, md: 3 }, mb: 1, cursor: liveIssue ? "pointer" : "default", borderRadius: "12px" }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {liveIssue ? liveIssue.message : error}
            </Typography>
            {liveIssue && (
              <Typography variant="body2">
                {liveIssue.fix}
              </Typography>
            )}
          </Alert>
        )}

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
                · позиций: {positionLines.length}
                {positionLines.length - filledLines.length > 0 ? ` (без товара или количества: ${positionLines.length - filledLines.length})` : ""}
                {landedExpenses > 0 ? ` · расходы ${formatMoney(landedExpenses)} сом` : ""}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Button variant="outlined" color="inherit" onClick={requestClose} disabled={busy} sx={{ borderColor: "divider", flex: { xs: 1, md: "none" } }}>
                Отмена
              </Button>
              {isDirty && (
                <Tooltip title="Закрыть и продолжить позже — всё заполненное сохранится">
                  <Button
                    variant="outlined"
                    onClick={deferAndClose}
                    disabled={busy}
                    // На телефоне три кнопки в ряд — иконка съедает место у текста.
                    startIcon={isPhone ? undefined : <BookmarkAddOutlined />}
                    sx={{ flex: { xs: 1, md: "none" }, whiteSpace: "nowrap" }}
                  >
                    Отложить
                  </Button>
                </Tooltip>
              )}
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={busy}
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleOutlined />}
                sx={{ flex: { xs: 2, md: "none" }, px: { md: 3 }, whiteSpace: "nowrap" }}
              >
                Провести приход
              </Button>
            </Stack>
          </Stack>
        )}
      </Dialog>

      {/* Закрыть заполненную накладную: отложить (всё сохранится) или удалить. */}
      <Dialog open={closeConfirmOpen} onClose={() => setCloseConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningAmberOutlined color="warning" />
          Закрыть накладную?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Накладная ещё не проведена. Её можно отложить — всё заполненное и фото сохранятся, и при следующем
            открытии «Новой накладной» её можно будет продолжить.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: "wrap" }}>
          <Button onClick={discardAndClose} color="error" sx={{ mr: "auto" }}>
            Удалить
          </Button>
          <Button onClick={() => setCloseConfirmOpen(false)} variant="outlined" color="inherit">
            Остаться
          </Button>
          <Button onClick={deferAndClose} variant="contained" startIcon={<BookmarkAddOutlined />}>
            Отложить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Поверх накладной: Drawer по умолчанию ниже Dialog и открывался позади. */}
      <SupplierFormDrawer
        open={supplierForm.open}
        onClose={() => setSupplierForm({ open: false })}
        onSaved={(saved) => {
          setCreatedSuppliers((prev) => [...prev.filter((s) => s.id !== saved.id), saved]);
          setSupplierId(saved.id);
          setSupplierInput(saved.name);
        }}
        scope={scope}
        supplier={null}
        initial={supplierForm.initial}
        aboveModal
      />
    </>
  );
};

export default ReceiptFormDialog;
