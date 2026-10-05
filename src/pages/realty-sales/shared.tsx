import React from "react";
import { Alert, Box, Button, InputBase, Skeleton, Typography } from "@mui/material";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import { ApiError, isModuleDisabled } from "../../api/client";
import { leadsStats, type Lead } from "../../api/realtyLeads";
import { AccessDenied } from "../../components/rbac/AccessDenied";
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
  return (
    <KpiCards
      items={
        stats
          ? [
              { key: "active", label: t("kpi.active"), value: String(stats.count) },
              { key: "budget", label: t("kpi.budget"), value: compactMoney(stats.budget, t) },
              { key: "conversion", label: t("kpi.conversion"), value: conversion != null ? `${conversion}%` : "—", hint: t("kpi.conversionHint") },
              { key: "hot", label: t("kpi.hot"), value: String(stats.hot) },
            ]
          : null
      }
    />
  );
}

export interface KpiItem {
  key: string;
  label: string;
  value: string;
  hint?: string | null;
  /** Цвет числа: красный — проблема, зелёный — хорошо. */
  tone?: "error" | "success" | "warning" | null;
}

/** Ряд KPI-карточек экранов продаж; `null` — скелетоны на время загрузки. */
export function KpiCards({ items, skeletons = 4 }: { items: KpiItem[] | null; skeletons?: number }) {
  return (
    <Box sx={{ mb: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } }}>
      {items
        ? items.map((item) => (
            <Box key={item.key} sx={{ ...cardSx, p: { xs: 1.75, md: 2.25 }, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                {item.label}
              </Typography>
              <Typography
                noWrap
                sx={{
                  mt: 0.75,
                  fontSize: { xs: "1.2rem", md: "1.6rem" },
                  fontWeight: 700,
                  lineHeight: 1.15,
                  fontVariantNumeric: "tabular-nums",
                  color: item.tone ? `${item.tone}.main` : "text.primary",
                }}
              >
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
        : Array.from({ length: skeletons }, (_, i) => <Skeleton key={i} variant="rounded" height={104} sx={{ borderRadius: "14px" }} />)}
    </Box>
  );
}

/** Заголовок карточки-секции экрана: название и подзаголовок слева, действие справа. */
export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <Box sx={{ px: 2.25, pt: 2, pb: 1.5, display: "flex", alignItems: "flex-start", gap: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{subtitle}</Typography>}
      </Box>
      {action}
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

/**
 * Ошибка загрузки экрана продаж: выключенный модуль и 403 — экраном «нет
 * доступа», остальное — плашкой с «Повторить».
 */
export function ScreenError({ error, onRetry, title, moduleOffHint }: { error: unknown; onRetry: () => void; title?: string; moduleOffHint?: string }) {
  const { t } = useT("realtySales");
  if (isModuleDisabled(error)) return <AccessDenied title={t("common.moduleOff")} description={moduleOffHint ?? t("common.moduleOffHint")} showBack={false} />;
  if (error instanceof ApiError && error.status === 403) return <AccessDenied />;
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      }
    >
      {title ?? t("common.loadError")}: {error instanceof Error ? error.message : ""}
    </Alert>
  );
}
