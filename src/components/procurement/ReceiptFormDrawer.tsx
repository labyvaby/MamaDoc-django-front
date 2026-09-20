import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import AddAPhotoOutlined from "@mui/icons-material/AddAPhotoOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import PersonAddAltOutlined from "@mui/icons-material/PersonAddAltOutlined";

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
} from "../../api/procurement";
import { djangoQueryKeys } from "../../api/queryKeys";
import { getProducts, getWarehouses, type DjangoProduct, type DjangoWarehouse } from "../../api/warehouse";
import { useInvoicePhotos } from "../../hooks/useInvoicePhotos";
import { INVOICE_DOCUMENT_ACCEPT } from "../../utility/imageCompression";
import { CustomDateTimePicker, CustomDatePicker, InvoicePhotosField } from "../ui";
import { formatMoney } from "./meta";

const CURRENCIES = ["KGS", "USD", "RUB", "KZT", "EUR", "CNY"];

type ProductOption = { id: number; label: string; unit: string; sku: string };

interface FormLine {
  key: string;
  product: ProductOption | null;
  quantity: string;
  price: string;
  lotNumber: string;
  expiresAt: Dayjs | null;
  /** Строка пришла из распознавания: показываем исходный текст и кандидатов. */
  recognized?: {
    name: string;
    modelCode: string | null;
    color: string | null;
    size: string | null;
    candidates: RecognizedCandidate[];
    matchScore: number | null;
  };
}

const newLine = (): FormLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  product: null,
  quantity: "",
  price: "",
  lotNumber: "",
  expiresAt: null,
});

/** Пикер даты-времени шагает по 15 минут: «сейчас» округляем вниз, иначе поле красное. */
const roundToStep = (value: Dayjs): Dayjs => value.minute(Math.floor(value.minute() / 15) * 15).second(0).millisecond(0);

const toNumber = (raw: string): number => {
  const n = Number(String(raw).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export interface ReceiptFormDrawerProps {
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
}

/**
 * «Новая накладная»: приход от поставщика. Снимок или PDF накладной — не только фото
 * к документу: если распознавание включено, модель читает его, и форма
 * заполняется поставщиком, номером, датой и позициями; несопоставленные
 * позиции остаются с подсказками, выбор — за человеком. Ничего не пишется,
 * пока приход не проведён.
 */
export const ReceiptFormDrawer: React.FC<ReceiptFormDrawerProps> = ({
  open,
  onClose,
  onCreated,
  scope,
  activeBranchId,
  suppliers,
  recognitionEnabled,
  recognitionHint,
  onCreateSupplier,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();

  const [supplierId, setSupplierId] = React.useState<number | "">("");
  const [warehouseId, setWarehouseId] = React.useState<number | "">("");
  const [number, setNumber] = React.useState("");
  const [supplierNumber, setSupplierNumber] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState<Dayjs | null>(roundToStep(dayjs()));
  const [dueAt, setDueAt] = React.useState<Dayjs | null>(null);
  const [currency, setCurrency] = React.useState("KGS");
  const [exchangeRate, setExchangeRate] = React.useState("1");
  const [comment, setComment] = React.useState("");
  const [lines, setLines] = React.useState<FormLine[]>([newLine()]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [recognizing, setRecognizing] = React.useState(false);
  const [recognition, setRecognition] = React.useState<RecognitionResult | null>(null);
  const [recognitionError, setRecognitionError] = React.useState<string | null>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);

  const photos = useInvoicePhotos({ target: "goodsReceipt", entityId: null, organizationId: scope.organizationId ?? null, open });

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

  // Сброс при открытии + дефолты: номер по счётчику, основной склад филиала.
  React.useEffect(() => {
    if (!open) return;
    setSupplierId("");
    setNumber("");
    setSupplierNumber("");
    setReceivedAt(roundToStep(dayjs()));
    setDueAt(null);
    setCurrency("KGS");
    setExchangeRate("1");
    setComment("");
    setLines([newLine()]);
    setError(null);
    setRecognition(null);
    setRecognitionError(null);
    setRecognizing(false);
  }, [open]);

  React.useEffect(() => {
    if (open && nextNumberQuery.data?.number) setNumber((prev) => prev || nextNumberQuery.data.number);
  }, [open, nextNumberQuery.data]);

  React.useEffect(() => {
    if (!open || warehouseId !== "" || warehouses.length === 0) return;
    const own = warehouses.filter((w) => !w.isLinked && (activeBranchId == null || w.branchId === activeBranchId));
    const primary = own.find((w) => w.isPrimary) ?? own[0] ?? warehouses[0];
    if (primary) setWarehouseId(primary.id);
  }, [open, warehouses, warehouseId, activeBranchId]);

  // Валюта поставщика — в форму по умолчанию.
  React.useEffect(() => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (supplier?.defaultCurrency) setCurrency(supplier.defaultCurrency);
  }, [supplierId, suppliers]);

  const updateLine = (key: string, patch: Partial<FormLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : [newLine()]));

  const lineTotal = (line: FormLine) => toNumber(line.quantity) * toNumber(line.price);
  const rate = currency === "KGS" ? 1 : toNumber(exchangeRate) || 1;
  const total = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const filledLines = lines.filter((l) => l.product && toNumber(l.quantity) > 0);
  const unmatched = lines.filter((l) => l.recognized && !l.product);

  const isValid = supplierId !== "" && warehouseId !== "" && filledLines.length > 0 && lines.every((l) => !l.product || toNumber(l.quantity) > 0);

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
      if (result.document.currency && CURRENCIES.includes(result.document.currency)) setCurrency(result.document.currency);
      const recognizedLines: FormLine[] = result.lines.map((line) => {
        const matched = line.match ? productById.get(line.match.id) ?? null : null;
        const expires = line.expiresAt ? dayjs(line.expiresAt) : null;
        return {
          ...newLine(),
          product: matched,
          quantity: line.quantity ? String(Number(line.quantity)) : "",
          price: line.price ? String(Number(line.price)) : "",
          lotNumber: line.lotNumber ?? "",
          expiresAt: expires && expires.isValid() ? expires : null,
          recognized: {
            name: line.name,
            modelCode: line.modelCode,
            color: line.color,
            size: line.size,
            candidates: line.candidates,
            matchScore: line.match?.score ?? null,
          },
        };
      });
      if (recognizedLines.length > 0) {
        setLines((prev) => {
          const kept = prev.filter((l) => l.product || l.quantity || l.price);
          return [...kept, ...recognizedLines];
        });
      }
    },
    [productById, supplierId, supplierNumber],
  );

  const handlePhoto = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setRecognitionError(null);
    // Фото — к накладной в любом случае; распознавание — если разрешено.
    await photos.pick(files);
    if (!recognitionEnabled) return;
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
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

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
          lines: filledLines.map((l) => ({
            productId: l.product!.id,
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
      const { failed } = await photos.flush(created.id);
      await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.procurement.all });
      notify?.({
        type: failed ? "error" : "success",
        message: failed ? `Накладная ${created.number} проведена, но ${failed} фото не загрузилось` : `Накладная ${created.number} проведена`,
      });
      onCreated(created);
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось провести накладную"));
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || recognizing;

  const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.5 }}>
      {children}
    </Typography>
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 560 }, maxWidth: "100%", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Box>
          <Typography variant="h6">Новая накладная</Typography>
          <Typography variant="caption" color="text.secondary">
            Приход от поставщика · себестоимость партий зафиксируется по курсу дня
          </Typography>
        </Box>
        <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </Box>

      <Stack spacing={2.5} sx={{ p: 2, flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* Распознавание по фото */}
        <Box
          sx={(t) => ({
            p: 1.5,
            borderRadius: "10px",
            border: "1px dashed",
            borderColor: recognition ? alpha(t.palette.success.main, 0.5) : alpha(t.palette.primary.main, 0.4),
            bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.08 : 0.04),
          })}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={(t) => ({
                width: 40,
                height: 40,
                borderRadius: "10px",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                color: "primary.onSurface",
                bgcolor: alpha(t.palette.primary.main, 0.12),
              })}
            >
              {recognizing ? <CircularProgress size={20} /> : <AutoAwesomeOutlined />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {recognizing ? "Распознаём накладную…" : recognition ? "Накладная распознана" : "Заполнить по фото или PDF"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {recognizing
                  ? "Обычно 10–30 секунд. Файл уже прикреплён к накладной."
                  : recognition
                    ? `${recognition.totals.linesCount} поз., сопоставлено ${recognition.totals.matchedCount} · уверенность ${Math.round(recognition.confidence * 100)}%`
                    : recognitionEnabled
                      ? "Снимите документ или выберите PDF — поставщик, номер, дата и позиции заполнятся сами."
                      : recognitionHint ?? "Распознавание недоступно — файл сохранится к накладной."}
              </Typography>
            </Box>
            <input
              ref={cameraRef}
              type="file"
              accept={INVOICE_DOCUMENT_ACCEPT}
              hidden
              onChange={(e) => void handlePhoto(e.target.files)}
            />
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
          {recognizing && <LinearProgress sx={{ mt: 1.5, borderRadius: 1 }} />}
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
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        {/* Шапка */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
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
              slotProps={{ textField: { size: "small", fullWidth: true, placeholder: "Не оговорён" } }}
            />
          </Box>
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
        </Box>

        <Divider />

        {/* Позиции */}
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Позиции{" "}
              <Typography component="span" variant="caption" color="text.secondary">
                {filledLines.length > 0 ? `· ${filledLines.length}` : ""}
              </Typography>
            </Typography>
            {unmatched.length > 0 && (
              <Chip size="small" color="warning" variant="outlined" label={`${unmatched.length} без товара`} sx={{ height: 22 }} />
            )}
          </Stack>
          {productsQuery.isLoading && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}
          <Stack spacing={1}>
            {lines.map((line, index) => {
              const candidateIds = new Set((line.recognized?.candidates ?? []).map((c) => c.id));
              const options = line.recognized
                ? [
                    ...(line.recognized.candidates.map((c) => productById.get(c.id)).filter(Boolean) as ProductOption[]),
                    ...productOptions.filter((p) => !candidateIds.has(p.id)),
                  ]
                : productOptions;
              const scoreOf = (id: number) => line.recognized?.candidates.find((c) => c.id === id)?.score;
              return (
                <Box
                  key={line.key}
                  sx={(t) => ({
                    p: 1.25,
                    borderRadius: "10px",
                    border: 1,
                    borderColor: line.recognized && !line.product ? alpha(t.palette.warning.main, 0.5) : "divider",
                  })}
                >
                  {line.recognized && (
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                      {line.product ? (
                        <CheckCircleOutlined sx={{ fontSize: 16, color: "success.main" }} />
                      ) : (
                        <ErrorOutlineOutlined sx={{ fontSize: 16, color: "warning.main" }} />
                      )}
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
                        В документе: «{line.recognized.name}»
                        {[line.recognized.modelCode, line.recognized.color, line.recognized.size]
                          .filter(Boolean)
                          .map((part) => ` · ${part}`)
                          .join("")}
                        {line.recognized.matchScore != null && line.product ? ` · совпадение ${line.recognized.matchScore}%` : ""}
                      </Typography>
                    </Stack>
                  )}
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "flex-start" }}>
                    <Autocomplete<ProductOption, false, false, false>
                      options={options}
                      value={line.product}
                      onChange={(_, value) => updateLine(line.key, { product: value })}
                      getOptionLabel={(o) => o.label}
                      isOptionEqualToValue={(a, b) => a.id === b.id}
                      loading={productsQuery.isLoading}
                      size="small"
                      sx={{ flex: 1, minWidth: 0 }}
                      renderOption={(props, option) => {
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
                    <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                      <TextField
                        size="small"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        placeholder="Кол-во"
                        inputProps={{ inputMode: "decimal", style: { textAlign: "right" } }}
                        sx={{ width: { xs: "50%", sm: 88 } }}
                        InputProps={{ endAdornment: line.product ? <Typography variant="caption" color="text.secondary">{line.product.unit}</Typography> : undefined }}
                      />
                      <TextField
                        size="small"
                        value={line.price}
                        onChange={(e) => updateLine(line.key, { price: e.target.value })}
                        placeholder="Цена"
                        inputProps={{ inputMode: "decimal", style: { textAlign: "right" } }}
                        sx={{ width: { xs: "50%", sm: 104 } }}
                      />
                      {!isMobile && (
                        <IconButton size="small" onClick={() => removeLine(line.key)} aria-label="Удалить позицию" sx={{ mt: 0.25 }}>
                          <DeleteOutlineOutlined fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75 }}>
                    <TextField
                      size="small"
                      value={line.lotNumber}
                      onChange={(e) => updateLine(line.key, { lotNumber: e.target.value })}
                      placeholder="Партия"
                      sx={{ flex: 1, "& .MuiInputBase-root": { minHeight: 34 } }}
                    />
                    <CustomDatePicker
                      value={line.expiresAt}
                      onChange={(v) => updateLine(line.key, { expiresAt: v as Dayjs | null })}
                      shortYearMode="future"
                      slotProps={{ textField: { size: "small", placeholder: "Годен до", sx: { flex: 1, "& .MuiInputBase-root": { minHeight: 34 } } } }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 90, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {lineTotal(line) > 0 ? formatMoney(lineTotal(line)) : "—"}
                    </Typography>
                    {isMobile && (
                      <IconButton size="small" onClick={() => removeLine(line.key)} aria-label="Удалить позицию">
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }} flexWrap="wrap" gap={1}>
            <Button variant="text" size="small" startIcon={<AddOutlined />} onClick={() => setLines((prev) => [...prev, newLine()])}>
              Добавить позицию
            </Button>
            <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              Итого: {formatMoney(total)} {currency}
              {currency !== "KGS" && (
                <Typography component="span" variant="caption" color="text.secondary">
                  {" "}
                  ≈ {formatMoney(total * rate)} сом
                </Typography>
              )}
            </Typography>
          </Stack>
        </Box>

        <Divider />

        <InvoicePhotosField state={photos} disabled={busy} />

        <Box>
          <Label>Комментарий</Label>
          <TextField
            fullWidth
            size="small"
            multiline
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Состояние товара, расхождения с заказом…"
          />
        </Box>
      </Stack>

      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", display: "flex", gap: 1, flexDirection: { xs: "column-reverse", sm: "row" }, justifyContent: "flex-end" }}>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={busy} sx={{ borderColor: "divider" }}>
          Отмена
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!isValid || busy} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleOutlined />}>
          Провести приход
        </Button>
      </Box>
    </Drawer>
  );
};

export default ReceiptFormDrawer;
