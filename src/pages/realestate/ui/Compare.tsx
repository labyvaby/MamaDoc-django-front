import React from "react";
import { Box, Button, Dialog, DialogContent, IconButton, Paper, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";

import type { Unit } from "../../../api/realestate";
import { AppButton } from "../../../components/ui";
import { formatMoney, formatRooms, outdoorLabel, unitStatusMeta } from "../model/units";

/** Сравнить можно до 4 квартир — больше не помещается в колонки. */
export const COMPARE_LIMIT = 4;

/** Плашка снизу, пока выбраны квартиры. */
export function SelectionBar({
  count,
  onCompare,
  onExport,
  onClear,
}: {
  count: number;
  onCompare: () => void;
  onExport: () => void;
  onClear: () => void;
}) {
  if (!count) return null;
  return (
    <Paper
      role="region"
      aria-label="Выбранные квартиры"
      variant="outlined"
      sx={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: (t) => t.zIndex.appBar,
        display: "flex",
        alignItems: "center",
        gap: 1,
        py: 1,
        pr: 1,
        pl: 2,
        borderRadius: "14px",
        // Плавающая панель над шахматкой: хайрлайн (outlined) + лёгкая тень вместо тяжёлой (ui-style-guide §4).
        boxShadow: (t) => t.shadows[2],
      }}
    >
      <Typography component="b" sx={{ mr: 0.5, fontWeight: 600, whiteSpace: "nowrap", fontSize: "0.85rem" }}>
        Выбрано: {count}
      </Typography>
      <AppButton
        variant="contained"
        size="small"
        onClick={onCompare}
        disabled={count < 2}
        title={count < 2 ? "Выберите ещё хотя бы одну квартиру" : undefined}
      >
        Сравнить{count > COMPARE_LIMIT ? ` первые ${COMPARE_LIMIT}` : ""}
      </AppButton>
      <Button size="small" color="inherit" startIcon={<FileDownloadOutlined />} onClick={onExport}>
        Выгрузить
      </Button>
      <IconButton size="small" aria-label="Снять выбор" onClick={onClear}>
        <CloseOutlined fontSize="small" />
      </IconButton>
    </Paper>
  );
}

interface Row {
  label: string;
  value: (u: Unit) => React.ReactNode;
  /** Для числовых строк — какое значение лучшее. */
  best?: { of: (u: Unit) => number; prefer: "min" | "max" };
}

const rows: Row[] = [
  { label: "Цена", value: (u) => formatMoney(u.price), best: { of: (u) => u.price, prefer: "min" } },
  { label: "Цена за м²", value: (u) => formatMoney(u.pricePerSqm), best: { of: (u) => u.pricePerSqm, prefer: "min" } },
  { label: "Общая площадь", value: (u) => `${u.totalArea} м²`, best: { of: (u) => u.totalArea, prefer: "max" } },
  { label: "Жилая площадь", value: (u) => `${u.livingArea} м²`, best: { of: (u) => u.livingArea, prefer: "max" } },
  { label: "Комнат", value: (u) => formatRooms(u.rooms) },
  { label: "Этаж / секция", value: (u) => `${u.floor} / ${u.section}` },
  { label: "Сторона света", value: (u) => u.orientation },
  { label: "Вид из окон", value: (u) => u.view },
  {
    label: "Балкон / терраса",
    value: (u) => (u.outdoor ? `${outdoorLabel[u.outdoor.type]} ${u.outdoor.area} м²` : "—"),
  },
  { label: "Потолки", value: (u) => `${u.ceilingHeight} м` },
  { label: "Санузлов", value: (u) => u.bathrooms },
  { label: "Угловая", value: (u) => (u.isCorner ? "Да" : "—") },
  { label: "Панорамные окна", value: (u) => (u.hasPanoramicWindows ? "Да" : "—") },
  { label: "Статус", value: (u) => unitStatusMeta[u.status].label },
];

/** Сравнение квартир бок о бок; лучшие значения по цене и площади подсвечены. */
export function CompareDialog({
  units,
  onClose,
  onOpenUnit,
  onRemove,
}: {
  units: Unit[];
  onClose: () => void;
  onOpenUnit: (unitId: string) => void;
  onRemove: (unitId: string) => void;
}) {
  const shown = units.slice(0, COMPARE_LIMIT);
  const bestOf = (row: Row) => {
    if (!row.best || shown.length < 2) return null;
    const values = shown.map(row.best.of);
    return row.best.prefer === "min" ? Math.min(...values) : Math.max(...values);
  };

  return (
    <Dialog open onClose={onClose} fullWidth PaperProps={{ sx: { maxWidth: 1040, borderRadius: "14px" } }} aria-labelledby="realestate-compare-title">
      <IconButton aria-label="Закрыть" onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}>
        <CloseOutlined />
      </IconButton>
      <DialogContent sx={{ p: 3, pt: 3.5 }}>
        <Typography id="realestate-compare-title" variant="h6" sx={{ fontWeight: 700 }}>
          Сравнение квартир
        </Typography>
        <Typography sx={{ mt: 0.5, mb: 2, fontSize: "0.8rem", color: "text.secondary" }}>
          Лучшие значения по цене и площади подсвечены.
          {units.length > COMPARE_LIMIT && ` Показаны первые ${COMPARE_LIMIT} из ${units.length} выбранных.`}
        </Typography>
        <Box sx={{ overflowX: "auto" }}>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr>
                <Box component="th" sx={{ width: 170 }} />
                {shown.map((u) => (
                  <Box component="th" key={u.id} sx={{ px: 1.5, pb: 1.5, textAlign: "left", verticalAlign: "bottom" }}>
                    <Typography component="b" sx={{ display: "block", fontSize: "1rem", fontWeight: 700 }}>
                      №{u.number}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {formatRooms(u.rooms)} · {u.totalArea} м²
                    </Typography>
                    <Box sx={{ mt: 1, display: "flex", gap: 0.75 }}>
                      <Button size="small" variant="outlined" onClick={() => onOpenUnit(u.id)}>
                        Карточка
                      </Button>
                      <Button size="small" color="inherit" onClick={() => onRemove(u.id)} aria-label={`Убрать №${u.number} из сравнения`}>
                        Убрать
                      </Button>
                    </Box>
                  </Box>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const best = bestOf(row);
                return (
                  <Box component="tr" key={row.label} sx={{ borderTop: 1, borderColor: "divider" }}>
                    <Box component="th" sx={{ py: 1, pr: 1.5, textAlign: "left", fontSize: "0.75rem", fontWeight: 500, color: "text.secondary" }}>
                      {row.label}
                    </Box>
                    {shown.map((u) => {
                      const isBest = best !== null && row.best!.of(u) === best;
                      return (
                        <Box
                          component="td"
                          key={u.id}
                          sx={(t) => ({
                            px: 1.5,
                            py: 1,
                            ...(isBest
                              ? {
                                  bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.2 : 0.12),
                                  color: t.palette.success.onSurface,
                                  fontWeight: 700,
                                }
                              : null),
                          })}
                        >
                          {row.value(u)}
                        </Box>
                      );
                    })}
                  </Box>
                );
              })}
            </tbody>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
