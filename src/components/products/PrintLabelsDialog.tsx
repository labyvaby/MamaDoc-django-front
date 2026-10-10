import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  ListSubheader,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DesignServicesOutlined from "@mui/icons-material/DesignServicesOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import { useNotification } from "@refinedev/core";

import { ApiError, isAbortError } from "../../api/client";
import {
  PRINTFORMS_PERMISSIONS,
  getPriceTagTemplates,
  printPriceTags,
  type PriceTag,
  type PrintTemplate,
} from "../../api/printforms";
import { SegmentedTabs } from "../ui";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import {
  LABEL_PRESETS,
  buildLayoutLabelsHtml,
  layoutFromTemplate,
  presetByKey,
  sheetGrid,
  type LabelLayout,
  type LabelPresetKey,
} from "../../utility/labelLayout";
import {
  MAX_LABELS_PER_PRINT,
  fillLabelsWindow,
  openLabelsWindow,
  planLabelCopies,
  type LabelCopiesMode,
} from "../../utility/productLabels";
import { LabelDesigner, type LabelDesignerTarget } from "./LabelDesigner";
import { LabelPreview } from "./LabelPreview";

/** Строка печати: товар, его остаток (для «по остатку») и данные для превью. */
export type LabelPrintItem = { productId: number; stock: number; preview: PriceTag };

/** Чем печатать: сохранённый шаблон организации или встроенная заготовка. */
type LayoutKey = `t:${number}` | `p:${LabelPresetKey}`;

type Settings = { layoutKey: LayoutKey; mode: LabelCopiesMode; each: number };

const SETTINGS_KEY = "erkinai.productLabels.v2";
const DEFAULT_SETTINGS: Settings = { layoutKey: "p:58x40", mode: "one", each: 1 };

/** Шаблон и режим копий — привычка конкретного рабочего места. */
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<Settings>;
    return {
      layoutKey: typeof saved.layoutKey === "string" && /^(t:\d+|p:.+)$/.test(saved.layoutKey) ? saved.layoutKey : DEFAULT_SETTINGS.layoutKey,
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
const PRESET_KEYS = Object.keys(LABEL_PRESETS) as LabelPresetKey[];

const pluralGoods = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "товар";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "товара";
  return "товаров";
};

const sizeLabel = (layout: LabelLayout) =>
  `${layout.widthMm} × ${layout.heightMm} мм${layout.media === "sheet" ? ", лист A4" : ""}`;

const byDefaultThenName = (a: PrintTemplate, b: PrintTemplate) =>
  Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, "ru");

/**
 * Печать этикеток для выбранных товаров: шаблон этикетки и сколько копий.
 * Шаблоны общие для организации, их рисуют в конструкторе (право
 * `printforms.manage`); без своих шаблонов есть встроенные заготовки. Цену и
 * штрихкод на момент печати берёт сервер (цена — филиала `branchId`), он же
 * пишет печать в журнал. Кнопку открывает право `printforms.print` —
 * проверяет вызывающая страница.
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
  const canDesign = useCan(PRINTFORMS_PERMISSIONS.manage);
  const organizationName = activeOrganization?.name ?? "";
  const [settings, setSettings] = React.useState<Settings>(loadSettings);
  const [eachRaw, setEachRaw] = React.useState(String(settings.each));
  const [busy, setBusy] = React.useState(false);
  const [templates, setTemplates] = React.useState<PrintTemplate[] | null>(null);
  const [designer, setDesigner] = React.useState<LabelDesignerTarget | null>(null);

  // Ширина подложки превью: на телефоне этикетка A4 шире экрана.
  const [previewBox, setPreviewBox] = React.useState<HTMLDivElement | null>(null);
  const [previewWidth, setPreviewWidth] = React.useState(PREVIEW_MAX_WIDTH);
  React.useEffect(() => {
    if (!previewBox) return undefined;
    const observer = new ResizeObserver(([entry]) => setPreviewWidth(entry.contentRect.width));
    observer.observe(previewBox);
    return () => observer.disconnect();
  }, [previewBox]);

  const loadTemplates = React.useCallback(async (signal?: AbortSignal) => {
    try {
      const rows = await getPriceTagTemplates(signal);
      setTemplates(rows.filter((t) => t.isActive).sort(byDefaultThenName));
    } catch (e) {
      if (isAbortError(e)) return;
      // Без права на список шаблонов печатают заготовками.
      setTemplates([]);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return undefined;
    setEachRaw(String(settings.each));
    const controller = new AbortController();
    void loadTemplates(controller.signal);
    return () => controller.abort();
    // Сбрасываем поле и перечитываем шаблоны только при открытии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (patch: Partial<Settings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });

  // Запомненный шаблон мог пропасть — тогда основной, а без шаблонов заготовка.
  const defaultTemplate = templates?.find((t) => t.isDefault) ?? null;
  const chosenTemplate = settings.layoutKey.startsWith("t:")
    ? (templates?.find((t) => `t:${t.id}` === settings.layoutKey) ?? null)
    : null;
  const chosenPreset = settings.layoutKey.startsWith("p:") ? (settings.layoutKey.slice(2) as LabelPresetKey) : null;
  const effectiveKey: LayoutKey =
    chosenTemplate || (chosenPreset && chosenPreset in LABEL_PRESETS)
      ? settings.layoutKey
      : defaultTemplate
        ? `t:${defaultTemplate.id}`
        : "p:58x40";
  const template = effectiveKey.startsWith("t:") ? (templates?.find((t) => `t:${t.id}` === effectiveKey) ?? null) : null;
  const layout = React.useMemo(
    () => (template ? layoutFromTemplate(template) : presetByKey(effectiveKey.slice(2) as LabelPresetKey)),
    [template, effectiveKey],
  );

  const each = Number(eachRaw);
  const plan = React.useMemo(
    () => planLabelCopies(items, settings.mode, settings.mode === "each" ? each : 0),
    [items, settings.mode, each],
  );
  const tooMany = plan.total > MAX_LABELS_PER_PRINT;

  const previewTag = items[0]?.preview;
  const frameWidth = layout.widthMm * MM_TO_PX;
  const frameHeight = layout.heightMm * MM_TO_PX;
  const scale = Math.min(3, Math.min(PREVIEW_MAX_WIDTH, previewWidth - PREVIEW_GUTTER) / frameWidth);

  const openDesigner = (mode: "edit" | "new") => {
    if (mode === "edit" && template) {
      setDesigner({ templateId: template.id, name: template.name, layout, isDefault: template.isDefault });
    } else {
      setDesigner({
        templateId: null,
        name: template ? `${template.name} (копия)` : `Этикетка ${layout.widthMm}×${layout.heightMm}`,
        layout,
        // Первый шаблон организации сразу основной: им печатают по умолчанию.
        isDefault: !defaultTemplate,
      });
    }
  };

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
      // Заготовка печатается под шаблоном по умолчанию: он нужен журналу печати.
      const result = await printPriceTags(plan.lines, branchId, template?.id ?? defaultTemplate?.id ?? null);
      const printLayout = template ? layoutFromTemplate(result) : layout;
      fillLabelsWindow(win, buildLayoutLabelsHtml(result.data.tags, printLayout, { organizationName }));
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

  const grid = sheetGrid(layout);

  return (
    <>
      {/* Брейкпоинты темы свои (sm = 360), поэтому ширина задана явно. */}
      <Dialog
        open={open && !designer}
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

            <Box>
              <TextField
                select
                fullWidth
                size="small"
                label="Шаблон этикетки"
                value={templates === null ? "" : effectiveKey}
                disabled={templates === null}
                onChange={(e) => update({ layoutKey: e.target.value as LayoutKey })}
                SelectProps={{
                  renderValue: () =>
                    templates === null
                      ? "Загружаю шаблоны…"
                      : template
                        ? `${template.name} · ${sizeLabel(layout)}`
                        : LABEL_PRESETS[effectiveKey.slice(2) as LabelPresetKey].label,
                  displayEmpty: true,
                }}
              >
                {templates && templates.length > 0 && <ListSubheader>Шаблоны организации</ListSubheader>}
                {(templates ?? []).map((t) => (
                  <MenuItem key={`t:${t.id}`} value={`t:${t.id}`}>
                    {t.name}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      {sizeLabel(layoutFromTemplate(t))}
                      {t.isDefault ? " · основной" : ""}
                    </Typography>
                  </MenuItem>
                ))}
                <ListSubheader>Заготовки</ListSubheader>
                {PRESET_KEYS.map((key) => (
                  <MenuItem key={`p:${key}`} value={`p:${key}`}>
                    {LABEL_PRESETS[key].label}
                  </MenuItem>
                ))}
              </TextField>
              {canDesign && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                  {template && (
                    <Button size="small" startIcon={<DesignServicesOutlined />} onClick={() => openDesigner("edit")}>
                      Настроить этикетку
                    </Button>
                  )}
                  <Button size="small" startIcon={<AddOutlined />} onClick={() => openDesigner("new")}>
                    {template ? "Новый шаблон" : "Сделать свой шаблон"}
                  </Button>
                </Stack>
              )}
            </Box>

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
                {layout.media === "sheet" ? ` На лист A4 — ${grid.cols * grid.rows} наклеек.` : ""}
              </Typography>
            </Box>

            {previewTag && (
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
                  <Box
                    sx={{
                      width: frameWidth * scale,
                      height: frameHeight * scale,
                      overflow: "hidden",
                      borderRadius: "4px",
                      boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                      bgcolor: "#fff",
                    }}
                  >
                    <LabelPreview tag={previewTag} layout={layout} organizationName={organizationName} scale={scale} />
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
            disabled={busy || templates === null || plan.lines.length === 0 || tooMany}
            onClick={() => void handlePrint()}
          >
            {busy ? "Готовлю…" : `Печать · ${plan.total.toLocaleString("ru-RU")}`}
          </Button>
        </DialogActions>
      </Dialog>

      {previewTag && (
        <LabelDesigner
          open={open && designer !== null}
          target={designer}
          sample={previewTag}
          organizationName={organizationName}
          onClose={() => setDesigner(null)}
          onSaved={(saved) => {
            setDesigner(null);
            update({ layoutKey: `t:${saved.id}` });
            void loadTemplates();
          }}
        />
      )}
    </>
  );
};
