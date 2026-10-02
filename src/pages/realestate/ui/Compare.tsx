import React from "react";
import { Box, Button, Dialog, DialogContent, IconButton, Paper, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";

import type { Unit } from "../../../api/realestate";
import { AppButton } from "../../../components/ui";
import { useT } from "../../../i18n/VerticalProvider";
import { tt } from "../../../i18n/t";
import { sectionLabel } from "../model/board";
import { formatArea, formatMoney, formatRooms, outdoorLabel, unitStatusMeta } from "../model/units";

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
  const { t } = useT("realestate");
  if (!count) return null;
  return (
    <Paper
      role="region"
      aria-label={t("compare.selectedRegion")}
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
        {t("compare.selectedCount", { count })}
      </Typography>
      <AppButton
        variant="contained"
        size="small"
        onClick={onCompare}
        disabled={count < 2}
        title={count < 2 ? t("compare.pickOneMore") : undefined}
      >
        {count > COMPARE_LIMIT ? t("compare.compareFirst", { limit: COMPARE_LIMIT }) : t("compare.compare")}
      </AppButton>
      <Button size="small" color="inherit" startIcon={<FileDownloadOutlined />} onClick={onExport}>
        {t("compare.export")}
      </Button>
      <IconButton size="small" aria-label={t("compare.clear")} onClick={onClear}>
        <CloseOutlined fontSize="small" />
      </IconButton>
    </Paper>
  );
}

interface Row {
  /** Подпись — `realestate:compare.rows.<key>`. */
  key: string;
  value: (u: Unit) => React.ReactNode;
  /** Для числовых строк — какое значение лучшее. */
  best?: { of: (u: Unit) => number; prefer: "min" | "max" };
}

const yes = (value: boolean) => (value ? tt("realestate:compare.yes") : "—");

const rows: Row[] = [
  { key: "price", value: (u) => formatMoney(u.price), best: { of: (u) => u.price, prefer: "min" } },
  { key: "pricePerSqm", value: (u) => formatMoney(u.pricePerSqm), best: { of: (u) => u.pricePerSqm, prefer: "min" } },
  { key: "totalArea", value: (u) => formatArea(u.totalArea), best: { of: (u) => u.totalArea, prefer: "max" } },
  { key: "livingArea", value: (u) => formatArea(u.livingArea), best: { of: (u) => u.livingArea, prefer: "max" } },
  { key: "rooms", value: (u) => formatRooms(u.rooms) },
  { key: "floorSection", value: (u) => `${u.floor} / ${sectionLabel(u.section)}` },
  { key: "orientation", value: (u) => u.orientation },
  { key: "view", value: (u) => u.view },
  {
    key: "outdoor",
    value: (u) => (u.outdoor ? tt("realestate:fmt.outdoorArea", { kind: outdoorLabel(u.outdoor.type), area: u.outdoor.area }) : "—"),
  },
  { key: "ceiling", value: (u) => tt("realestate:compare.ceilingValue", { value: u.ceilingHeight }) },
  { key: "bathrooms", value: (u) => u.bathrooms },
  { key: "corner", value: (u) => yes(u.isCorner) },
  { key: "panoramic", value: (u) => yes(u.hasPanoramicWindows) },
  { key: "status", value: (u) => unitStatusMeta[u.status].label },
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
  const { t } = useT("realestate");
  const shown = units.slice(0, COMPARE_LIMIT);
  const bestOf = (row: Row) => {
    if (!row.best || shown.length < 2) return null;
    const values = shown.map(row.best.of);
    return row.best.prefer === "min" ? Math.min(...values) : Math.max(...values);
  };

  return (
    <Dialog open onClose={onClose} fullWidth PaperProps={{ sx: { maxWidth: 1040, borderRadius: "14px" } }} aria-labelledby="realestate-compare-title">
      <IconButton aria-label={t("common.close")} onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}>
        <CloseOutlined />
      </IconButton>
      <DialogContent sx={{ p: 3, pt: 3.5 }}>
        <Typography id="realestate-compare-title" variant="h6" sx={{ fontWeight: 700 }}>
          {t("compare.title")}
        </Typography>
        <Typography sx={{ mt: 0.5, mb: 2, fontSize: "0.8rem", color: "text.secondary" }}>
          {t("compare.bestHint")}
          {units.length > COMPARE_LIMIT && ` ${t("compare.shownFirst", { limit: COMPARE_LIMIT, total: units.length })}`}
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
                      {formatRooms(u.rooms)} · {formatArea(u.totalArea)}
                    </Typography>
                    <Box sx={{ mt: 1, display: "flex", gap: 0.75 }}>
                      <Button size="small" variant="outlined" onClick={() => onOpenUnit(u.id)}>
                        {t("compare.card")}
                      </Button>
                      <Button size="small" color="inherit" onClick={() => onRemove(u.id)} aria-label={t("compare.removeAria", { number: u.number })}>
                        {t("compare.remove")}
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
                  <Box component="tr" key={row.key} sx={{ borderTop: 1, borderColor: "divider" }}>
                    <Box component="th" sx={{ py: 1, pr: 1.5, textAlign: "left", fontSize: "0.75rem", fontWeight: 500, color: "text.secondary" }}>
                      {t(`compare.rows.${row.key}`)}
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
