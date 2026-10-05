import React from "react";
import { Box, InputBase, Skeleton, Typography } from "@mui/material";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import { leadsStats, type Lead } from "../../api/realtyLeads";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { cardSx, compactMoney } from "../estate-dashboard/format";

/**
 * Четыре KPI воронки и «Лидов» (гайд §2): число, сумма и горячие — из того же
 * списка, что на экране (с фильтрами), конверсия — из аналитики за 30 дней.
 */
export function LeadsKpis({ list, conversion }: { list: Lead[] | undefined; conversion: number | null | undefined }) {
  const { t } = useT("realtySales");
  const stats = list ? leadsStats(list) : null;
  const items = stats
    ? [
        { key: "active", value: String(stats.count), hint: null },
        { key: "budget", value: compactMoney(stats.budget, t), hint: null },
        { key: "conversion", value: conversion != null ? `${conversion}%` : "—", hint: t("kpi.conversionHint") },
        { key: "hot", value: String(stats.hot), hint: null },
      ]
    : null;
  return (
    <Box sx={{ mb: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } }}>
      {items
        ? items.map((item) => (
            <Box key={item.key} sx={{ ...cardSx, p: { xs: 1.75, md: 2.25 }, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                {t(`kpi.${item.key}`)}
              </Typography>
              <Typography noWrap sx={{ mt: 0.75, fontSize: { xs: "1.2rem", md: "1.6rem" }, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>
                {item.value}
              </Typography>
              {item.hint && (
                <Typography
                  component="span"
                  sx={(th) => ({ mt: 0.75, display: "inline-block", px: 0.75, py: 0.2, borderRadius: "6px", fontSize: "0.72rem", bgcolor: subtleBg(th, true), color: "text.secondary" })}
                >
                  {item.hint}
                </Typography>
              )}
            </Box>
          ))
        : [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={104} sx={{ borderRadius: "14px" }} />)}
    </Box>
  );
}

/** Поле поиска в стиле панели фильтров (как в Биллинге). */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <Box
      sx={(th) => ({
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.25,
        height: 32,
        minWidth: 220,
        flex: { xs: "1 1 100%", md: "0 1 300px" },
        border: 1,
        borderColor: "divider",
        borderRadius: "9px",
        bgcolor: subtleBg(th),
        "& .MuiSvgIcon-root": { fontSize: 18, color: "text.secondary" },
      })}
    >
      <SearchOutlined />
      <InputBase value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputProps={{ "aria-label": placeholder }} sx={{ flex: 1, fontSize: "0.875rem" }} />
    </Box>
  );
}
