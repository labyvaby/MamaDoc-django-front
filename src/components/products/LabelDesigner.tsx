import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import FormatAlignCenter from "@mui/icons-material/FormatAlignCenter";
import FormatAlignLeft from "@mui/icons-material/FormatAlignLeft";
import FormatAlignRight from "@mui/icons-material/FormatAlignRight";
import FormatBold from "@mui/icons-material/FormatBold";
import FormatItalic from "@mui/icons-material/FormatItalic";
import TextFieldsOutlined from "@mui/icons-material/TextFieldsOutlined";
import QrCode2Outlined from "@mui/icons-material/QrCode2Outlined";
import VerticalAlignBottom from "@mui/icons-material/VerticalAlignBottom";
import VerticalAlignCenter from "@mui/icons-material/VerticalAlignCenter";
import VerticalAlignTop from "@mui/icons-material/VerticalAlignTop";
import ZoomInOutlined from "@mui/icons-material/ZoomInOutlined";
import ZoomOutOutlined from "@mui/icons-material/ZoomOutOutlined";
import { useNotification } from "@refinedev/core";

import { ApiError } from "../../api/client";
import {
  createPriceTagTemplate,
  setDefaultPrintTemplate,
  updatePrintTemplate,
  type PriceTag,
  type PrintTemplate,
} from "../../api/printforms";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import {
  FONT_SIZE_PT,
  LABEL_FIELD_SOURCES,
  LABEL_FONTS,
  LABEL_PRESETS,
  LABEL_SIDE_MM,
  MAX_LABEL_ELEMENTS,
  MAX_LABEL_LINES,
  barcodeElement,
  buildLayoutLabelsHtml,
  elementText,
  fitElement,
  htmlKey,
  layoutToTemplate,
  newElementId,
  presetLayout,
  sheetGrid,
  textElement,
  type LabelAlign,
  type LabelBarcodeElement,
  type LabelElement,
  type LabelFieldSource,
  type LabelFontKey,
  type LabelLayout,
  type LabelMedia,
  type LabelPresetKey,
  type LabelTextElement,
  type LabelVAlign,
} from "../../utility/labelLayout";

/** Что открыть в конструкторе: сохранённый шаблон или новый из раскладки. */
export type LabelDesignerTarget = {
  templateId: number | null;
  name: string;
  layout: LabelLayout;
  isDefault: boolean;
};

const MM_TO_PX = 96 / 25.4;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3] as const;

const round1 = (value: number) => Math.round(value * 10) / 10;
const snapTo = (value: number, step: number) => Math.round(value / step) * step;

function elementTitle(element: LabelElement): string {
  if (element.kind === "barcode") return "Штрихкод";
  if (element.source === "text") return element.text.trim() || "Свой текст";
  return LABEL_FIELD_SOURCES[element.source].label;
}

/**
 * Число в мм/pt: печатать можно что угодно, значение уходит наверх только
 * когда оно число и в пределах, — иначе поле ждёт, пока человек допечатает.
 */
const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  integer?: boolean;
}> = ({ label, value, onChange, min, max, step = 0.5, unit = "мм", integer = false }) => {
  const [raw, setRaw] = React.useState(String(round1(value)));
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (!focused.current) setRaw(String(round1(value)));
  }, [value]);
  const parsed = Number(raw.replace(",", "."));
  const valid = raw.trim() !== "" && Number.isFinite(parsed) && parsed >= min && parsed <= max && (!integer || Number.isInteger(parsed));
  return (
    <TextField
      size="small"
      label={label}
      value={raw}
      error={!valid}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setRaw(String(round1(value)));
      }}
      onChange={(e) => {
        setRaw(e.target.value);
        const next = Number(e.target.value.replace(",", "."));
        if (e.target.value.trim() !== "" && Number.isFinite(next) && next >= min && next <= max && (!integer || Number.isInteger(next))) {
          onChange(next);
        }
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const next = Math.min(max, Math.max(min, round1(value + (e.key === "ArrowUp" ? step : -step))));
        setRaw(String(next));
        onChange(next);
      }}
      inputProps={{ inputMode: "decimal", "aria-label": label }}
      InputProps={unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined}
      sx={{ minWidth: 0 }}
    />
  );
};

const FONT_KEYS = Object.keys(LABEL_FONTS) as LabelFontKey[];
const SOURCE_KEYS = Object.keys(LABEL_FIELD_SOURCES) as LabelFieldSource[];

/**
 * Конструктор этикетки: элементы ставятся куда угодно, у каждого свой
 * шрифт, кегль, начертание и выравнивание. Холст — тот же HTML, что уходит
 * на печать, поэтому что видно здесь, то и напечатается.
 *
 * Шаблон общий для организации: сохраняет право `printforms.manage`.
 */
export const LabelDesigner: React.FC<{
  open: boolean;
  target: LabelDesignerTarget | null;
  /** Товар для образца на холсте. */
  sample: PriceTag;
  organizationName: string;
  onClose: () => void;
  onSaved: (template: PrintTemplate) => void;
}> = ({ open, target, sample, organizationName, onClose, onSaved }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [name, setName] = React.useState("");
  const [layout, setLayout] = React.useState<LabelLayout>(() => presetLayout(58, 40));
  const [isDefault, setIsDefault] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [addAnchor, setAddAnchor] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open || !target) return;
    setName(target.name);
    setLayout(target.layout);
    setIsDefault(target.isDefault);
    setSelectedId(null);
    setZoom(1);
    setDirty(false);
  }, [open, target]);

  const selected = layout.elements.find((element) => element.id === selectedId) ?? null;

  const changeLayout = (fn: (prev: LabelLayout) => LabelLayout) => {
    setLayout(fn);
    setDirty(true);
  };
  const updateElement = (id: string, fn: (element: LabelElement) => LabelElement) =>
    changeLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((element) =>
        element.id === id ? fitElement(fn(element), prev.widthMm, prev.heightMm) : element,
      ),
    }));
  const patchSelected = (patch: Partial<LabelTextElement> | Partial<LabelBarcodeElement>) => {
    if (selected) updateElement(selected.id, (element) => ({ ...element, ...patch }) as LabelElement);
  };
  const removeElement = (id: string) => {
    changeLayout((prev) => ({ ...prev, elements: prev.elements.filter((element) => element.id !== id) }));
    setSelectedId(null);
  };
  const duplicateElement = (id: string) => {
    const source = layout.elements.find((element) => element.id === id);
    if (!source || layout.elements.length >= MAX_LABEL_ELEMENTS) return;
    const copy = fitElement({ ...source, id: newElementId(), x: source.x + 2, y: source.y + 2 }, layout.widthMm, layout.heightMm);
    changeLayout((prev) => ({ ...prev, elements: [...prev.elements, copy] }));
    setSelectedId(copy.id);
  };
  const addElement = (kind: LabelFieldSource | "barcode") => {
    setAddAnchor(null);
    if (layout.elements.length >= MAX_LABEL_ELEMENTS) return;
    const w = Math.min(layout.widthMm - 4, kind === "barcode" ? 40 : 30);
    const base =
      kind === "barcode"
        ? barcodeElement({ x: 2, y: 2, w, h: Math.min(12, layout.heightMm - 4) })
        : textElement(kind, { x: 2, y: 2, w, h: 5 });
    const element = fitElement(base, layout.widthMm, layout.heightMm);
    changeLayout((prev) => ({ ...prev, elements: [...prev.elements, element] }));
    setSelectedId(element.id);
  };
  const setSize = (patch: Partial<Pick<LabelLayout, "widthMm" | "heightMm" | "media">>) =>
    changeLayout((prev) => {
      const next = { ...prev, ...patch };
      return { ...next, elements: next.elements.map((element) => fitElement(element, next.widthMm, next.heightMm)) };
    });
  const applyPreset = async (key: LabelPresetKey) => {
    const ok = await confirm({
      title: "Заменить раскладку заготовкой?",
      message: "Все элементы этикетки встанут заново по заготовке. Своё расположение пропадёт.",
      confirmText: "Заменить",
      cancelText: "Отмена",
      variant: "warning",
    });
    if (!ok) return;
    const preset = LABEL_PRESETS[key];
    changeLayout(() => presetLayout(preset.widthMm, preset.heightMm, preset.media));
    setSelectedId(null);
  };

  // ── Холст ──
  const [canvasBox, setCanvasBox] = React.useState<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = React.useState({ width: 600, height: 400 });
  React.useEffect(() => {
    if (!canvasBox) return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(canvasBox);
    return () => observer.disconnect();
  }, [canvasBox]);

  const labelPx = { width: layout.widthMm * MM_TO_PX, height: layout.heightMm * MM_TO_PX };
  const fit = Math.max(
    0.2,
    Math.min((canvasSize.width - 48) / labelPx.width, (canvasSize.height - 48) / labelPx.height, 10),
  );
  const scale = fit * zoom;
  const pxPerMm = MM_TO_PX * scale;

  const previewHtml = React.useMemo(
    () => buildLayoutLabelsHtml([sample], layout, { preview: true, organizationName }),
    [sample, layout, organizationName],
  );

  const drag = React.useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origin: LabelElement;
  } | null>(null);

  const startDrag = (e: React.PointerEvent, element: LabelElement, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Указатель уже отпущен — тянуть нечего, но выделение остаётся.
    }
    setSelectedId(element.id);
    drag.current = { id: element.id, mode, startX: e.clientX, startY: e.clientY, origin: element };
  };
  const moveDrag = (e: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const step = e.altKey ? 0.1 : 0.5;
    const dx = (e.clientX - state.startX) / pxPerMm;
    const dy = (e.clientY - state.startY) / pxPerMm;
    const { origin } = state;
    updateElement(state.id, (element) =>
      state.mode === "move"
        ? { ...element, x: snapTo(origin.x + dx, step), y: snapTo(origin.y + dy, step) }
        : { ...element, w: Math.max(1, snapTo(origin.w + dx, step)), h: Math.max(1, snapTo(origin.h + dy, step)) },
    );
  };
  const endDrag = () => {
    drag.current = null;
  };

  // Стрелки — сдвиг на 0,5 мм (с Shift — на 2 мм), Delete — убрать, Ctrl+D — копия.
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select, [role=listbox], [role=combobox]") || target.isContentEditable)) {
        return;
      }
      const step = e.shiftKey ? 2 : 0.5;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (moves[e.key]) {
        e.preventDefault();
        const [dx, dy] = moves[e.key];
        updateElement(selectedId, (element) => ({ ...element, x: round1(element.x + dx), y: round1(element.y + dy) }));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeElement(selectedId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateElement(selectedId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Сохранение ──
  const nameError = name.trim() === "" ? "Назовите шаблон" : null;
  const handleSave = async () => {
    if (!target || nameError) return;
    setSaving(true);
    try {
      const data = { name: name.trim(), ...layoutToTemplate(layout) };
      let saved =
        target.templateId != null
          ? await updatePrintTemplate(target.templateId, data)
          : await createPriceTagTemplate({ ...data, isDefault });
      if (isDefault && !saved.isDefault) saved = await setDefaultPrintTemplate(saved.id);
      notify?.({ type: "success", message: `Шаблон «${saved.name}» сохранён` });
      setDirty(false);
      onSaved(saved);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Не удалось сохранить шаблон";
      notify?.({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };
  const handleClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: "Закрыть без сохранения?",
        message: "Изменения этикетки пропадут.",
        confirmText: "Закрыть",
        cancelText: "Остаться",
        variant: "warning",
      });
      if (!ok) return;
    }
    onClose();
  };

  if (!target) return null;
  const grid = sheetGrid(layout);

  // ── Панель свойств ──
  const textProps = selected?.kind === "field" ? selected : null;
  const barcodeProps = selected?.kind === "barcode" ? selected : null;
  const emptyForSample = textProps ? elementText(textProps, sample, organizationName) === "" : false;

  const propsPanel = selected ? (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }} noWrap>
          {elementTitle(selected)}
        </Typography>
        <Tooltip title="Копия (Ctrl+D)">
          <IconButton size="small" onClick={() => duplicateElement(selected.id)} aria-label="Сделать копию">
            <ContentCopyOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Убрать (Delete)">
          <IconButton size="small" color="error" onClick={() => removeElement(selected.id)} aria-label="Убрать элемент">
            <DeleteOutlineOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {textProps && (
        <>
          <TextField
            select
            size="small"
            label="Что выводить"
            value={textProps.source}
            onChange={(e) => {
              const source = e.target.value as LabelFieldSource;
              patchSelected({
                source,
                prefix: LABEL_FIELD_SOURCES[source].prefix,
                suffix: LABEL_FIELD_SOURCES[source].suffix,
                text: source === "text" && !textProps.text ? "Текст" : textProps.text,
              });
            }}
          >
            {SOURCE_KEYS.map((key) => (
              <MenuItem key={key} value={key}>
                {LABEL_FIELD_SOURCES[key].label}
              </MenuItem>
            ))}
          </TextField>
          {textProps.source === "text" ? (
            <TextField
              size="small"
              label="Текст"
              value={textProps.text}
              multiline
              maxRows={4}
              onChange={(e) => patchSelected({ text: e.target.value })}
            />
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              <TextField size="small" label="Перед" value={textProps.prefix} onChange={(e) => patchSelected({ prefix: e.target.value })} />
              <TextField size="small" label="После" value={textProps.suffix} onChange={(e) => patchSelected({ suffix: e.target.value })} />
            </Box>
          )}
          {emptyForSample && (
            <Typography variant="caption" color="text.secondary">
              У образца это поле пустое — на его этикетке элемента не будет.
            </Typography>
          )}
        </>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        <NumberField label="Слева" value={selected.x} min={0} max={layout.widthMm} onChange={(x) => patchSelected({ x })} />
        <NumberField label="Сверху" value={selected.y} min={0} max={layout.heightMm} onChange={(y) => patchSelected({ y })} />
        <NumberField label="Ширина" value={selected.w} min={1} max={layout.widthMm} onChange={(w) => patchSelected({ w })} />
        <NumberField label="Высота" value={selected.h} min={1} max={layout.heightMm} onChange={(h) => patchSelected({ h })} />
      </Box>

      {textProps && (
        <>
          <TextField
            select
            size="small"
            label="Шрифт"
            value={textProps.font}
            onChange={(e) => patchSelected({ font: e.target.value as LabelFontKey })}
            InputProps={{ sx: { fontFamily: LABEL_FONTS[textProps.font].css } }}
          >
            {FONT_KEYS.map((key) => (
              <MenuItem key={key} value={key} sx={{ fontFamily: LABEL_FONTS[key].css }}>
                {LABEL_FONTS[key].label}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Slider
              size="small"
              value={textProps.fontSize}
              min={FONT_SIZE_PT.min}
              max={40}
              step={0.5}
              onChange={(_, value) => patchSelected({ fontSize: value as number })}
              aria-label="Размер шрифта"
              sx={{ flex: 1 }}
            />
            <Box sx={{ width: 104, flexShrink: 0 }}>
              <NumberField
                label="Размер"
                value={textProps.fontSize}
                min={FONT_SIZE_PT.min}
                max={FONT_SIZE_PT.max}
                unit="pt"
                onChange={(fontSize) => patchSelected({ fontSize })}
              />
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup size="small">
              <ToggleButton value="bold" selected={textProps.bold} onChange={() => patchSelected({ bold: !textProps.bold })} aria-label="Жирный">
                <FormatBold fontSize="small" />
              </ToggleButton>
              <ToggleButton value="italic" selected={textProps.italic} onChange={() => patchSelected({ italic: !textProps.italic })} aria-label="Курсив">
                <FormatItalic fontSize="small" />
              </ToggleButton>
              <ToggleButton
                value="upper"
                selected={textProps.uppercase}
                onChange={() => patchSelected({ uppercase: !textProps.uppercase })}
                aria-label="Заглавными"
                sx={{ fontWeight: 700, fontSize: 12, px: 1.25 }}
              >
                АБ
              </ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={textProps.align}
              onChange={(_, align: LabelAlign | null) => align && patchSelected({ align })}
            >
              <ToggleButton value="left" aria-label="По левому краю"><FormatAlignLeft fontSize="small" /></ToggleButton>
              <ToggleButton value="center" aria-label="По центру"><FormatAlignCenter fontSize="small" /></ToggleButton>
              <ToggleButton value="right" aria-label="По правому краю"><FormatAlignRight fontSize="small" /></ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={textProps.valign}
              onChange={(_, valign: LabelVAlign | null) => valign && patchSelected({ valign })}
            >
              <ToggleButton value="top" aria-label="Прижать вверх"><VerticalAlignTop fontSize="small" /></ToggleButton>
              <ToggleButton value="middle" aria-label="По середине"><VerticalAlignCenter fontSize="small" /></ToggleButton>
              <ToggleButton value="bottom" aria-label="Прижать вниз"><VerticalAlignBottom fontSize="small" /></ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <TextField
            select
            size="small"
            label="Строк, не больше"
            value={textProps.lines}
            onChange={(e) => patchSelected({ lines: Number(e.target.value) })}
          >
            {Array.from({ length: MAX_LABEL_LINES }, (_, i) => i + 1).map((n) => (
              <MenuItem key={n} value={n}>
                {n === 1 ? "1 — длинное обрезается «…»" : n}
              </MenuItem>
            ))}
          </TextField>
        </>
      )}

      {barcodeProps && (
        <>
          <FormControlLabel
            control={<Switch checked={barcodeProps.showDigits} onChange={(e) => patchSelected({ showDigits: e.target.checked })} />}
            label="Цифры под штрихкодом"
          />
          {barcodeProps.showDigits && (
            <NumberField
              label="Размер цифр"
              value={barcodeProps.digitsSize}
              min={FONT_SIZE_PT.min}
              max={24}
              unit="pt"
              onChange={(digitsSize) => patchSelected({ digitsSize })}
            />
          )}
          <Typography variant="caption" color="text.secondary">
            Сканер читает полосы, а не цифры: узкий штрихкод на рулоне 40 мм лучше не делать уже 30 мм.
          </Typography>
        </>
      )}
    </Stack>
  ) : (
    <Typography variant="body2" color="text.secondary">
      Нажмите на элемент на этикетке или в списке, чтобы настроить его. Перетаскивайте мышью, тяните за уголок, чтобы
      изменить размер; стрелки двигают на 0,5 мм (с Shift — на 2 мм).
    </Typography>
  );

  return (
    <Dialog open={open} onClose={() => void handleClose()} fullScreen>
      <Stack sx={{ height: "100%" }}>
        {/* Шапка */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider", flexWrap: "wrap", rowGap: 1 }}
        >
          <IconButton onClick={() => void handleClose()} aria-label="Закрыть конструктор">
            <CloseIcon />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 600, display: { xs: "none", md: "block" } }}>
            Конструктор этикетки
          </Typography>
          <TextField
            size="small"
            label="Название шаблона"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            error={Boolean(nameError)}
            sx={{ flex: 1, minWidth: 180, maxWidth: 360 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={isDefault}
                disabled={target.isDefault}
                onChange={(e) => {
                  setIsDefault(e.target.checked);
                  setDirty(true);
                }}
              />
            }
            label="Основной"
          />
          <Box sx={{ flex: { md: 1 } }} />
          <Button variant="contained" onClick={() => void handleSave()} disabled={saving || Boolean(nameError)}>
            {saving ? "Сохраняю…" : "Сохранить"}
          </Button>
        </Stack>

        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: { xs: "column", md: "row" } }}>
          {/* Холст */}
          <Stack sx={{ flex: 1, minWidth: 0, minHeight: { xs: 320, md: 0 } }}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider", flexWrap: "wrap", rowGap: 1 }}
            >
              <Box sx={{ width: 140 }}>
                <NumberField
                  label="Ширина этикетки"
                  value={layout.widthMm}
                  min={LABEL_SIDE_MM.min}
                  max={LABEL_SIDE_MM.max}
                  onChange={(widthMm) => setSize({ widthMm })}
                />
              </Box>
              <Typography color="text.secondary">×</Typography>
              <Box sx={{ width: 140 }}>
                <NumberField
                  label="Высота этикетки"
                  value={layout.heightMm}
                  min={LABEL_SIDE_MM.min}
                  max={LABEL_SIDE_MM.max}
                  onChange={(heightMm) => setSize({ heightMm })}
                />
              </Box>
              <TextField
                select
                size="small"
                label="Печать"
                value={layout.media}
                onChange={(e) => setSize({ media: e.target.value as LabelMedia })}
                sx={{ width: 190 }}
              >
                <MenuItem value="roll">Рулон (этикетка = страница)</MenuItem>
                <MenuItem value="sheet">Лист A4 с наклейками</MenuItem>
              </TextField>
              <TextField
                select
                size="small"
                label="Заготовка"
                value=""
                onChange={(e) => void applyPreset(e.target.value as LabelPresetKey)}
                sx={{ width: 170 }}
                SelectProps={{ displayEmpty: true, renderValue: () => "Подставить…" }}
                InputLabelProps={{ shrink: true }}
              >
                {(Object.keys(LABEL_PRESETS) as LabelPresetKey[]).map((key) => (
                  <MenuItem key={key} value={key}>
                    {LABEL_PRESETS[key].label}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ flex: 1 }} />
              <Tooltip title="Мельче">
                <span>
                  <IconButton
                    size="small"
                    disabled={zoom <= ZOOM_STEPS[0]}
                    onClick={() => setZoom((z) => [...ZOOM_STEPS].reverse().find((s) => s < z) ?? z)}
                    aria-label="Уменьшить"
                  >
                    <ZoomOutOutlined fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Typography variant="caption" sx={{ width: 40, textAlign: "center" }}>
                {Math.round(zoom * 100)}%
              </Typography>
              <Tooltip title="Крупнее">
                <span>
                  <IconButton
                    size="small"
                    disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                    onClick={() => setZoom((z) => ZOOM_STEPS.find((s) => s > z) ?? z)}
                    aria-label="Увеличить"
                  >
                    <ZoomInOutlined fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
            {layout.media === "sheet" && (
              <Alert severity="info" sx={{ mx: 2, mt: 1 }}>
                На лист A4 помещается {grid.cols} × {grid.rows} = {grid.cols * grid.rows} наклеек этого размера.
              </Alert>
            )}
            <Box
              ref={setCanvasBox}
              onPointerDown={() => setSelectedId(null)}
              sx={(t) => ({
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                display: "flex",
                bgcolor: t.palette.mode === "dark" ? "grey.900" : "grey.100",
                backgroundImage: `radial-gradient(${alpha(t.palette.text.primary, 0.12)} 1px, transparent 1px)`,
                backgroundSize: "16px 16px",
              })}
            >
              <Box
                sx={{
                  position: "relative",
                  m: "auto",
                  p: 3,
                  flexShrink: 0,
                }}
              >
                <Box
                  sx={{
                    position: "relative",
                    width: labelPx.width * scale,
                    height: labelPx.height * scale,
                    boxShadow: "0 1px 2px rgba(0,0,0,.25), 0 6px 20px rgba(0,0,0,.18)",
                    borderRadius: "4px",
                    bgcolor: "#fff",
                  }}
                >
                  <Box
                    key={htmlKey(previewHtml)}
                    component="iframe"
                    title="Этикетка"
                    sandbox=""
                    srcDoc={previewHtml}
                    sx={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: labelPx.width,
                      height: labelPx.height,
                      border: 0,
                      transform: `scale(${scale})`,
                      transformOrigin: "0 0",
                      pointerEvents: "none",
                      colorScheme: "light",
                    }}
                  />
                  {layout.elements.map((element) => {
                    const isSelected = element.id === selectedId;
                    return (
                      <Box
                        key={element.id}
                        role="button"
                        aria-label={elementTitle(element)}
                        onPointerDown={(e) => startDrag(e, element, "move")}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        sx={{
                          position: "absolute",
                          left: element.x * pxPerMm,
                          top: element.y * pxPerMm,
                          width: element.w * pxPerMm,
                          height: element.h * pxPerMm,
                          cursor: "move",
                          touchAction: "none",
                          outline: isSelected ? `2px solid ${theme.palette.primary.main}` : `1px dashed ${alpha("#1976d2", 0.45)}`,
                          outlineOffset: isSelected ? 0 : -1,
                          bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.06) : "transparent",
                          "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.08) },
                        }}
                      >
                        {isSelected && (
                          <Box
                            onPointerDown={(e) => startDrag(e, element, "resize")}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            aria-label="Изменить размер"
                            sx={{
                              position: "absolute",
                              right: -6,
                              bottom: -6,
                              width: 12,
                              height: 12,
                              borderRadius: "3px",
                              bgcolor: "primary.main",
                              border: "2px solid #fff",
                              cursor: "nwse-resize",
                              touchAction: "none",
                            }}
                          />
                        )}
                      </Box>
                    );
                  })}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mt: 1 }}>
                  {round1(layout.widthMm)} × {round1(layout.heightMm)} мм · образец: {sample.name}
                </Typography>
              </Box>
            </Box>
          </Stack>

          {/* Элементы и свойства */}
          <Box
            sx={{
              width: { xs: "100%", md: 360 },
              flexShrink: 0,
              borderLeft: { md: 1 },
              borderTop: { xs: 1, md: 0 },
              borderColor: "divider",
              overflowY: "auto",
              maxHeight: { xs: "45vh", md: "none" },
            }}
          >
            <Stack direction="row" alignItems="center" sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                Элементы ({layout.elements.length})
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={(e) => setAddAnchor(e.currentTarget)}>
                Добавить
              </Button>
              <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
                {SOURCE_KEYS.map((key) => (
                  <MenuItem key={key} onClick={() => addElement(key)}>
                    <ListItemIcon><TextFieldsOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText>{LABEL_FIELD_SOURCES[key].label}</ListItemText>
                  </MenuItem>
                ))}
                <Divider />
                <MenuItem onClick={() => addElement("barcode")}>
                  <ListItemIcon><QrCode2Outlined fontSize="small" /></ListItemIcon>
                  <ListItemText>Штрихкод</ListItemText>
                </MenuItem>
              </Menu>
            </Stack>
            <List dense disablePadding sx={{ px: 1 }}>
              {layout.elements.map((element) => (
                <ListItemButton
                  key={element.id}
                  selected={element.id === selectedId}
                  onClick={() => setSelectedId(element.id)}
                  sx={{ borderRadius: "8px" }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {element.kind === "barcode" ? <QrCode2Outlined fontSize="small" /> : <TextFieldsOutlined fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText
                    primary={elementTitle(element)}
                    secondary={`${round1(element.x)}, ${round1(element.y)} · ${round1(element.w)}×${round1(element.h)} мм${
                      element.kind === "field" ? ` · ${element.fontSize} pt` : ""
                    }`}
                    primaryTypographyProps={{ noWrap: true }}
                  />
                </ListItemButton>
              ))}
              {layout.elements.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1 }}>
                  Этикетка пустая — добавьте элементы.
                </Typography>
              )}
            </List>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ px: 2, pb: 2 }}>{propsPanel}</Box>
          </Box>
        </Box>
      </Stack>
      {isMobile && <Box sx={{ height: 8 }} />}
      <ConfirmDialog />
    </Dialog>
  );
};
