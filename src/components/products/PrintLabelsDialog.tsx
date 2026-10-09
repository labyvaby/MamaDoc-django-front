import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import { useNotification } from "@refinedev/core";

import { ApiError } from "../../api/client";
import { printPriceTags, type PriceTag } from "../../api/printforms";
import { SegmentedTabs } from "../ui";
import { usePermissions } from "../../hooks/usePermissions";
import {
  DEFAULT_LABEL_CONTENT,
  LABEL_CONTENT_LABELS,
  LABEL_SIZES,
  MAX_LABELS_PER_PRINT,
  buildProductLabelsHtml,
  fillLabelsWindow,
  openLabelsWindow,
  planLabelCopies,
  type LabelContent,
  type LabelCopiesMode,
  type LabelSizeKey,
} from "../../utility/productLabels";

/** Строка печати: товар, его остаток (для «по остатку») и данные для превью. */
export type LabelPrintItem = { productId: number; stock: number; preview: PriceTag };

type Settings = { size: LabelSizeKey; content: LabelContent; mode: LabelCopiesMode; each: number };

const SETTINGS_KEY = "erkinai.productLabels.v1";
const DEFAULT_SETTINGS: Settings = { size: "58x40", content: DEFAULT_LABEL_CONTENT, mode: "one", each: 1 };

/** Размер рулона и состав этикетки — привычка конкретного рабочего места. */
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<Settings>;
    return {
      size: saved.size && saved.size in LABEL_SIZES ? saved.size : DEFAULT_SETTINGS.size,
      content: { ...DEFAULT_LABEL_CONTENT, ...saved.content },
      mode: saved.mode === "stock" || saved.mode === "each" ? saved.mode : "one",
      each: Number.isInteger(saved.each) && (saved.each ?? 0) > 0 ? (saved.each as number) : 1,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Приватный режим или квота: настройки просто не запомнятся.
  }
}

const MODE_TABS: { key: LabelCopiesMode; label: string }[] = [
  { key: "one", label: "По 1" },
  { key: "stock", label: "По остатку" },
  { key: "each", label: "По N" },
];

const MM_TO_PX = 96 / 25.4;
const PREVIEW_MAX_WIDTH = 300;
/** Поля серой подложки превью по бокам, px. */
const PREVIEW_GUTTER = 24;

const pluralGoods = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "товар";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "товара";
  return "товаров";
};

/**
 * Печать этикеток для выбранных товаров: размер этикетки, что на ней и
 * сколько копий. Цену и штрихкод на момент печати берёт сервер (цена —
 * филиала `branchId`), он же пишет печать в журнал. Кнопку открывает право
 * `printforms.print` — проверяет вызывающая страница.
 */
export const PrintLabelsDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  items: readonly LabelPrintItem[];
  /** Филиал, чья цена печатается; null — базовая цена товара. */
  branchId?: number | null;
  /** Чей остаток в режиме «по остатку» — подпись для пользователя. */
  stockHint?: string;
  onPrinted?: () => void;
}> = ({ open, onClose, items, branchId, stockHint, onPrinted }) => {
  const { open: notify } = useNotification();
  const { activeOrganization } = usePermissions();
  const [settings, setSettings] = React.useState<Settings>(loadSettings);
  const [eachRaw, setEachRaw] = React.useState(String(settings.each));
  const [busy, setBusy] = React.useState(false);
  // Ширина подложки превью: на телефоне этикетка A4 шире экрана.
  const [previewBox, setPreviewBox] = React.useState<HTMLDivElement | null>(null);
  const [previewWidth, setPreviewWidth] = React.useState(PREVIEW_MAX_WIDTH);
  React.useEffect(() => {
    if (!previewBox) return undefined;
    const observer = new ResizeObserver(([entry]) => setPreviewWidth(entry.contentRect.width));
    observer.observe(previewBox);
    return () => observer.disconnect();
  }, [previewBox]);

  React.useEffect(() => {
    if (open) setEachRaw(String(settings.each));
    // Сбрасываем поле только при открытии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (patch: Partial<Settings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });

  const each = Number(eachRaw);
  const plan = React.useMemo(
    () => planLabelCopies(items, settings.mode, settings.mode === "each" ? each : 0),
    [items, settings.mode, each],
  );
  const tooMany = plan.total > MAX_LABELS_PER_PRINT;
  const options = {
    size: settings.size,
    content: settings.content,
    organizationName: activeOrganization?.name ?? "",
  };

  const previewTag = items[0]?.preview;
  const previewHtml = React.useMemo(
    () => (previewTag ? buildProductLabelsHtml([previewTag], options, { preview: true }) : ""),
    // options — производная settings и названия организации.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewTag, settings.size, settings.content, activeOrganization?.name],
  );
  const geometry = LABEL_SIZES[settings.size];
  const frameWidth = geometry.width * MM_TO_PX + 8;
  const frameHeight = geometry.height * MM_TO_PX + 8;
  const scale = Math.min(2, Math.min(PREVIEW_MAX_WIDTH, previewWidth - PREVIEW_GUTTER) / frameWidth);

  const handlePrint = async () => {
    // Окно — синхронно по клику: после ответа сервера браузер его заблокирует.
    const win = openLabelsWindow();
    if (!win) {
      notify?.({
        type: "error",
        message: "Браузер заблокировал окно печати — разрешите всплывающие окна для этой страницы",
      });
      return;
    }
    setBusy(true);
    try {
      const result = await printPriceTags(plan.lines, branchId);
      fillLabelsWindow(win, buildProductLabelsHtml(result.data.tags, options));
      onPrinted?.();
      onClose();
    } catch (e) {
      win.close();
      const message = e instanceof ApiError ? e.message : "Не удалось подготовить этикетки";
      notify?.({ type: "error", message });
    } finally {
      setBusy(false);
    }
  };

  return (
    // Брейкпоинты темы свои (sm = 360), поэтому ширина задана явно.
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth={false}
      PaperProps={{ sx: { maxWidth: 560 } }}
    >
      <DialogTitle>Печать этикеток</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Выбрано: {items.length} {pluralGoods(items.length)}. Цена и штрихкод — на момент печати.
          </Typography>

          <TextField
            select
            fullWidth
            size="small"
            label="Размер этикетки"
            value={settings.size}
            onChange={(e) => update({ size: e.target.value as LabelSizeKey })}
          >
            {(Object.keys(LABEL_SIZES) as LabelSizeKey[]).map((key) => (
              <MenuItem key={key} value={key}>
                {LABEL_SIZES[key].label}
              </MenuItem>
            ))}
          </TextField>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Сколько печатать
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
              <SegmentedTabs<LabelCopiesMode>
                tabs={MODE_TABS}
                value={settings.mode}
                onChange={(mode) => update({ mode })}
                layoutId="print-labels-mode"
              />
              {settings.mode === "each" && (
                <TextField
                  size="small"
                  value={eachRaw}
                  onChange={(e) => {
                    setEachRaw(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n > 0) update({ each: n });
                  }}
                  inputProps={{ inputMode: "numeric", "aria-label": "Этикеток на каждый товар" }}
                  InputProps={{ endAdornment: <InputAdornment position="end">шт.</InputAdornment> }}
                  sx={{ width: 120 }}
                  error={!(Number.isInteger(each) && each > 0)}
                />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
              {settings.mode === "stock"
                ? `На каждую штуку — своя этикетка${stockHint ? ` (${stockHint})` : ""}.`
                : settings.mode === "each"
                  ? "Одинаковое количество на каждый товар."
                  : "Одна этикетка на каждый выбранный товар."}
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Что на этикетке
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr" } }}>
              {(Object.keys(LABEL_CONTENT_LABELS) as (keyof LabelContent)[]).map((key) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Checkbox
                      size="small"
                      checked={settings.content[key]}
                      onChange={(e) => update({ content: { ...settings.content, [key]: e.target.checked } })}
                    />
                  }
                  label={<Typography variant="body2">{LABEL_CONTENT_LABELS[key]}</Typography>}
                />
              ))}
            </Box>
          </Box>

          {previewHtml && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Как будет выглядеть
              </Typography>
              <Box
                ref={setPreviewBox}
                sx={(t) => ({
                  display: "flex",
                  justifyContent: "center",
                  py: 1.5,
                  borderRadius: "14px",
                  bgcolor: t.palette.mode === "dark" ? "grey.800" : "grey.100",
                })}
              >
                <Box sx={{ width: frameWidth * scale, height: frameHeight * scale, overflow: "hidden" }}>
                  <Box
                    component="iframe"
                    title="Превью этикетки"
                    sandbox=""
                    srcDoc={previewHtml}
                    sx={{
                      width: frameWidth,
                      height: frameHeight,
                      border: 0,
                      transform: `scale(${scale})`,
                      transformOrigin: "0 0",
                      pointerEvents: "none",
                      colorScheme: "light",
                    }}
                  />
                </Box>
              </Box>
            </Box>
          )}

          {plan.skipped > 0 && plan.lines.length > 0 && (
            <Alert severity="info" variant="outlined">
              {settings.mode === "stock"
                ? `${plan.skipped} ${pluralGoods(plan.skipped)} без остатка — не печатаются.`
                : `${plan.skipped} ${pluralGoods(plan.skipped)} пропущено.`}
            </Alert>
          )}
          {plan.lines.length === 0 && items.length > 0 && (
            <Alert severity="warning" variant="outlined">
              {settings.mode === "stock" ? "У выбранных товаров нет остатка." : "Укажите, сколько этикеток печатать."}
            </Alert>
          )}
          {tooMany && (
            <Alert severity="warning" variant="outlined">
              За раз — не больше {MAX_LABELS_PER_PRINT.toLocaleString("ru-RU")} этикеток. Выберите меньше товаров
              или другой режим.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          startIcon={<PrintOutlined />}
          disabled={busy || plan.lines.length === 0 || tooMany}
          onClick={() => void handlePrint()}
        >
          {busy ? "Готовлю…" : `Печать · ${plan.total.toLocaleString("ru-RU")}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
