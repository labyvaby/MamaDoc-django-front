import React from "react";
import {
  Box,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

import ArrowDownwardOutlined from "@mui/icons-material/ArrowDownwardOutlined";
import ArrowUpwardOutlined from "@mui/icons-material/ArrowUpwardOutlined";
import DragIndicatorOutlined from "@mui/icons-material/DragIndicatorOutlined";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";

import { AppButton } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import {
  SPAN_OPTIONS,
  moveWidget,
  reorderWidget,
  resolveSpan,
  setSpan,
  toggleHidden,
  type DashboardLayout,
  type WidgetMeta,
  type WidgetSpan,
} from "./layout";
import { useRowDrag } from "./useRowDrag";

/** Компактные подписи ширины: в строке настроек словам «Узкий/Средний» тесно. */
const SPAN_SHORT: Record<WidgetSpan, string> = { 4: "⅓", 6: "½", 12: "1" };

export type LayoutEditorProps = {
  layout: DashboardLayout;
  available: WidgetMeta[];
  onChange: (next: DashboardLayout) => void;
  onReset: () => void;
};

/**
 * Режим настройки: состав, порядок и ширина блоков.
 *
 * Порядок меняется и перетаскиванием (Pointer Events — работают пальцем), и
 * стрелками. Стрелки не рудимент: они остаются единственным способом для
 * клавиатуры и скринридера, а также страховкой, если жест не удался.
 */
export const LayoutEditor: React.FC<LayoutEditorProps> = ({
  layout,
  available,
  onChange,
  onReset,
}) => {
  const availableIds = new Set(available.map((w) => w.id));
  const rows = layout.order.filter((id) => availableIds.has(id));
  const metaById = new Map(available.map((w) => [w.id, w]));

  const handleReorder = React.useCallback(
    (from: number, to: number) => {
      const id = rows[from];
      if (!id) return;
      // Индексы приходят по видимому списку, а порядок хранится по полному:
      // переносим относительно соседа, а не по сырому номеру строки.
      const neighbour = rows[to];
      const targetIndex = layout.order.indexOf(neighbour);
      onChange({ ...layout, order: reorderWidget(layout.order, id, targetIndex) });
    },
    [layout, onChange, rows],
  );

  const drag = useRowDrag(rows.length, handleReorder);

  return (
    <Stack spacing={2}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Перетащите блоки за ручку, задайте ширину и спрячьте лишнее — настройка
        сохранится в этом браузере. Блоки, на которые у вас нет прав, в списке не
        показаны.
      </Typography>

      <Stack spacing={1}>
        {rows.map((id, index) => {
          const meta = metaById.get(id)!;
          const hidden = layout.hidden.includes(id);
          const isDragged = drag.dragIndex === index;
          const isDropTarget = drag.dropIndex === index && drag.dragIndex !== index;

          return (
            <Stack
              key={id}
              ref={drag.registerRow(index)}
              direction="row"
              alignItems="center"
              spacing={1}
              sx={(t) => ({
                p: 1.25,
                borderRadius: "10px",
                border: 1,
                borderColor: isDropTarget
                  ? alpha(t.palette.primary.main, 0.6)
                  : "divider",
                bgcolor: isDragged ? subtleBg(t, true) : subtleBg(t),
                opacity: hidden && !isDragged ? 0.55 : 1,
                flexWrap: "wrap",
                // Строку под пальцем поднимаем над остальными и сдвигаем следом
                // за курсором; переходы на время драга выключены, иначе строка
                // тянется за пальцем с задержкой.
                transform: isDragged ? `translateY(${drag.offsetY}px)` : undefined,
                zIndex: isDragged ? 2 : undefined,
                position: "relative",
                transition: isDragged ? "none" : "border-color .15s ease, background-color .15s ease",
                touchAction: drag.dragIndex == null ? undefined : "none",
              })}
            >
              <Box
                {...drag.handleProps(index)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  color: "text.disabled",
                  cursor: isDragged ? "grabbing" : "grab",
                  "&:hover": { color: "text.secondary" },
                }}
                aria-hidden
              >
                <DragIndicatorOutlined fontSize="small" />
              </Box>

              <Typography sx={{ flex: 1, fontWeight: 600, minWidth: 120 }}>
                {meta.label}
                {meta.onlyPeriod === "month" && (
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ color: "text.secondary", ml: 1 }}
                  >
                    только на «Месяце»
                  </Typography>
                )}
              </Typography>

              <ToggleButtonGroup
                size="small"
                exclusive
                value={resolveSpan(meta, layout)}
                onChange={(_, value: WidgetSpan | null) => {
                  if (value) onChange(setSpan(layout, id, value));
                }}
                sx={{
                  "& .MuiToggleButton-root": {
                    px: 1.25,
                    py: 0.25,
                    borderRadius: "7px",
                    fontWeight: 600,
                    textTransform: "none",
                  },
                }}
              >
                {SPAN_OPTIONS.map((o) => (
                  <Tooltip key={o.value} title={`${o.label} — ${o.hint}`} arrow>
                    <ToggleButton value={o.value} aria-label={`${meta.label}: ${o.label}`}>
                      {SPAN_SHORT[o.value]}
                    </ToggleButton>
                  </Tooltip>
                ))}
              </ToggleButtonGroup>

              <Tooltip title={hidden ? "Показывать" : "Спрятать"} arrow>
                <IconButton
                  size="small"
                  onClick={() => onChange({ ...layout, hidden: toggleHidden(layout.hidden, id) })}
                  aria-label={hidden ? `Показывать ${meta.label}` : `Спрятать ${meta.label}`}
                  sx={{ borderRadius: "8px" }}
                >
                  {hidden ? (
                    <VisibilityOffOutlined fontSize="small" />
                  ) : (
                    <VisibilityOutlined fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>

              <IconButton
                size="small"
                disabled={index === 0}
                onClick={() => onChange({ ...layout, order: moveWidget(layout.order, id, -1) })}
                aria-label={`Поднять ${meta.label}`}
                sx={{ borderRadius: "8px" }}
              >
                <ArrowUpwardOutlined fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                disabled={index === rows.length - 1}
                onClick={() => onChange({ ...layout, order: moveWidget(layout.order, id, 1) })}
                aria-label={`Опустить ${meta.label}`}
                sx={{ borderRadius: "8px" }}
              >
                <ArrowDownwardOutlined fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
      </Stack>

      <Box>
        <AppButton
          variant="outlined"
          startIcon={<RestartAltOutlined />}
          onClick={onReset}
          sx={(t) => ({ borderColor: alpha(t.palette.primary.main, 0.3) })}
        >
          Вернуть как было
        </AppButton>
      </Box>
    </Stack>
  );
};

export default LayoutEditor;
