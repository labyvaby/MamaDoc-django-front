import { Alert, Box, ButtonBase, Skeleton, Typography } from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";

import { estateAnalyticsKeys, getBiSummary, type BiBudget, type BiForecast, type BiReadiness, type BiSales, type BiSignal, type BiSummary } from "../../api/estateAnalytics";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatDateRu, formatKGS } from "../../utility/format";
import { ProgressBar } from "../construction/shared";
import { cardSx, estateHref, toneColor } from "../estate-dashboard/format";
import { EmptyNote } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError, type KpiItem } from "../realty-sales/shared";
import { compactSum, shareOf } from "./format";

/**
 * «Сводная аналитика» застройщика (AIVIO, гайд `frontend-dashboard-analytics.md` §6):
 * один экран руководителя — `GET /api/v2/estate-dashboard/bi/`. Действий нет,
 * только переходы по `signals[].view`. Секция без права модуля приходит `null`
 * и не рисуется; закрытые модули перечисляем строкой сверху. Право — `estate_dashboard.view`.
 * Цвет объекта (`color`) — данные ЖК с бэка, не тема: им метим только полосы объекта.
 */
export default function BiPage() {
  const { t } = useT("estateAnalytics");
  usePageTitle(t("bi.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <BiScreen />
    </Box>
  );
}

const tooltipStyle = (theme: Theme) => ({ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 12 });
const projectColor = (theme: Theme, color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? color : theme.palette.primary.main);

function BiScreen() {
  const { t } = useT("estateAnalytics");
  const scope = useRealtyScope();
  const bi = useQuery({ queryKey: estateAnalyticsKeys.bi(scope), queryFn: ({ signal }) => getBiSummary(scope, signal), enabled: scope.orgReady !== false, staleTime: 60_000 });

  if (bi.error) return <ScreenError error={bi.error} title={t("common.loadError")} onRetry={() => void bi.refetch()} />;
  const d = bi.data;

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>
        {t("bi.subtitle")}
        {d?.date ? ` · ${t("bi.asOf", { date: formatDateRu(d.date) })}` : ""}
      </Typography>
      {d && d.denied.length > 0 && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          {t("bi.denied", { list: d.denied.map((code) => t(`bi.module.${code}`, { defaultValue: code })).join(", ") })}
        </Alert>
      )}

      <Kpis data={d} />

      {!d ? (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" } }}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={260} sx={{ borderRadius: "14px" }} />
          ))}
        </Box>
      ) : (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 3fr) minmax(0, 2fr)" }, alignItems: "start" }}>
          {d.weeks && <Weeks weeks={d.weeks} />}
          <Signals items={d.signals} />
          {d.forecast && <Forecast data={d.forecast} />}
          {d.salesByProject && <SalesByProject items={d.salesByProject} />}
          {d.readiness && <Readiness items={d.readiness} />}
          {d.budgets && <Budgets items={d.budgets} />}
        </Box>
      )}
    </>
  );
}

function Kpis({ data }: { data: BiSummary | undefined }) {
  const { t } = useT("estateAnalytics");
  if (!data) return <KpiCards items={null} />;
  const k = data.kpis;
  const items: KpiItem[] = [];
  if (k.revenue30 != null) items.push({ key: "revenue30", label: t("bi.kpi.revenue30"), value: compactSum(k.revenue30, t), hint: k.revenue30Count != null ? t("bi.kpi.revenue30Hint", { count: k.revenue30Count }) : null });
  if (k.soldUnits != null)
    items.push({
      key: "sold",
      label: t("bi.kpi.sold"),
      value: String(k.soldUnits),
      hint: k.soldAmount != null ? t("bi.kpi.soldHint", { amount: compactSum(k.soldAmount, t), reserved: k.reservedUnits ?? 0 }) : null,
    });
  if (k.avgReadiness != null) items.push({ key: "readiness", label: t("bi.kpi.readiness"), value: `${k.avgReadiness}%`, hint: k.projectsCount != null ? t("bi.kpi.readinessHint", { count: k.projectsCount }) : null });
  if (k.marginPct != null)
    items.push({
      key: "margin",
      label: t("bi.kpi.margin"),
      value: `${k.marginPct}%`,
      tone: k.marginPct < 0 ? "error" : null,
      hint: k.marginAmount != null ? t("bi.kpi.marginHint", { amount: compactSum(k.marginAmount, t), pct: k.budgetUsedPct ?? 0 }) : null,
    });
  if (items.length === 0) return null;
  return <KpiCards items={items} />;
}

function Weeks({ weeks }: { weeks: NonNullable<BiSummary["weeks"]> }) {
  const { t } = useT("estateAnalytics");
  const theme = useTheme();
  const rows = weeks.map((w) => ({ ...w, label: w.start ? formatDateRu(w.start).slice(0, 5) : "" }));
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("bi.weeks.title")} />
      <Box sx={{ px: 1, pb: 1.5, height: 240 }}>
        {rows.every((w) => w.inflow === 0) ? (
          <EmptyNote text={t("common.empty")} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v: number) => compactSum(v, t)} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} width={64} />
              <Tooltip
                contentStyle={tooltipStyle(theme)}
                cursor={{ fill: theme.palette.action.hover }}
                labelFormatter={(_, payload) => {
                  const w = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                  return w ? `${formatDateRu(w.start)} — ${formatDateRu(w.end)}` : "";
                }}
                formatter={(value) => [formatKGS(Number(value)), t("bi.weeks.inflow")]}
              />
              <Bar dataKey="inflow" fill={theme.palette.success.main} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Box>
  );
}

function Signals({ items }: { items: BiSignal[] }) {
  const { t } = useT("estateAnalytics");
  const theme = useTheme();
  const navigate = useNavigate();
  return (
    <Box sx={{ ...cardSx, minWidth: 0, gridRow: { md: "span 2" } }}>
      <CardHeader title={t("bi.signals.title")} />
      {items.length === 0 ? (
        <EmptyNote text={t("bi.signals.empty")} />
      ) : (
        <Box sx={{ pb: 1 }}>
          {items.map((s) => {
            const href = estateHref(s.view, s.objectId);
            const color = toneColor(theme, s.tone);
            return (
              <ButtonBase
                key={s.code}
                disabled={!href}
                onClick={() => href && navigate(href)}
                sx={{ width: "100%", px: 2.25, py: 1, justifyContent: "stretch", textAlign: "left", display: "flex", alignItems: "center", gap: 1.25, borderTop: 1, borderColor: "divider", "&:hover": { bgcolor: "action.hover" } }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: color }} />
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.875rem" }}>{s.title}</Typography>
                <Typography component="span" sx={{ px: 0.75, py: 0.2, borderRadius: "6px", fontSize: "0.8125rem", fontWeight: 700, whiteSpace: "nowrap", color, bgcolor: alpha(color, 0.1) }}>
                  {s.value}
                </Typography>
                {href ? <ChevronRightOutlined sx={{ fontSize: 18, color: "text.secondary" }} /> : <Box sx={{ width: 18 }} />}
              </ButtonBase>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function Forecast({ data }: { data: BiForecast }) {
  const { t } = useT("estateAnalytics");
  const theme = useTheme();
  const rows = data.points.map((p) => ({ ...p, label: p.date ? formatDateRu(p.date).slice(0, 5) : "" }));
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("bi.forecast.title")} />
      <Box sx={{ px: 2.25, pb: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("bi.forecast.today")}</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", fontVariantNumeric: "tabular-nums" }}>{compactSum(data.todayBalance, t)}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("bi.forecast.end")}</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", fontVariantNumeric: "tabular-nums", color: data.endBalance < 0 ? "error.main" : "text.primary" }}>{compactSum(data.endBalance, t)}</Typography>
        </Box>
      </Box>
      {rows.length > 1 && (
        <Box sx={{ px: 1, height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tickFormatter={(v: number) => compactSum(v, t)} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} width={64} />
              <Tooltip contentStyle={tooltipStyle(theme)} formatter={(value) => [formatKGS(Number(value)), t("bi.forecast.balance")]} />
              <ReferenceLine y={0} stroke={theme.palette.error.main} strokeDasharray="3 3" />
              <Area type="monotone" dataKey="balance" stroke={theme.palette.primary.main} fill={alpha(theme.palette.primary.main, 0.12)} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      )}
      <Typography sx={{ px: 2.25, py: 1.5, fontSize: "0.8125rem", color: data.hasGap ? "error.main" : "text.secondary" }}>
        {data.hasGap && data.gapDate ? t("bi.forecast.gap", { date: formatDateRu(data.gapDate), sum: formatKGS(data.gapBalance ?? 0) }) : t("bi.forecast.noGap")}
      </Typography>
    </Box>
  );
}

function SalesByProject({ items }: { items: BiSales[] }) {
  const { t } = useT("estateAnalytics");
  const theme = useTheme();
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("bi.sales.title")} />
      {items.length === 0 ? (
        <EmptyNote text={t("common.empty")} />
      ) : (
        <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1.5 }}>
          {items.map((p) => {
            const free = Math.max(0, p.total - p.sold - p.reserved);
            return (
              <Box key={p.projectId}>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.5 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, alignSelf: "center", bgcolor: projectColor(theme, p.color) }} />
                  <Typography noWrap sx={{ flex: 1, fontSize: "0.875rem", fontWeight: 600 }}>
                    {p.projectName}
                  </Typography>
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", whiteSpace: "nowrap" }}>{t("bi.sales.line", { sold: p.sold, total: p.total, amount: compactSum(p.revenue, t) })}</Typography>
                </Box>
                <Box sx={(th) => ({ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", bgcolor: subtleBg(th, true) })}>
                  <Box sx={{ width: `${shareOf(p.sold, p.total)}%`, bgcolor: "success.main" }} />
                  <Box sx={{ width: `${shareOf(p.reserved, p.total)}%`, bgcolor: "warning.main" }} />
                </Box>
                <Typography sx={{ mt: 0.4, fontSize: "0.72rem", color: "text.secondary" }}>
                  {t("bi.sales.sold")}: <b>{p.sold}</b> · {t("bi.sales.reserved")}: <b>{p.reserved}</b> · {t("bi.sales.free")}: <b>{free}</b>
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function Readiness({ items }: { items: BiReadiness[] }) {
  const { t } = useT("estateAnalytics");
  const theme = useTheme();
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("bi.readiness.title")} />
      {items.length === 0 ? (
        <EmptyNote text={t("common.empty")} />
      ) : (
        <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1.5 }}>
          {items.map((p) => (
            <Box key={p.projectId}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.5 }}>
                <Typography noWrap sx={{ flex: 1, fontSize: "0.875rem", fontWeight: 600 }}>
                  {p.projectName}
                </Typography>
                {p.deadlineLabel && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", whiteSpace: "nowrap" }}>{t("bi.readiness.deadline", { label: p.deadlineLabel })}</Typography>}
                <Typography sx={{ width: 44, textAlign: "right", fontSize: "0.875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{`${p.readiness}%`}</Typography>
              </Box>
              <ProgressBar value={p.readiness} color={projectColor(theme, p.color)} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function Budgets({ items }: { items: BiBudget[] }) {
  const { t } = useT("estateAnalytics");
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("bi.budgets.title")} />
      {items.length === 0 ? (
        <EmptyNote text={t("common.empty")} />
      ) : (
        <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1.5 }}>
          {items.map((p) => (
            <Box key={p.projectId}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.5 }}>
                <Typography noWrap sx={{ flex: 1, fontSize: "0.875rem", fontWeight: 600 }}>
                  {p.projectName}
                </Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", whiteSpace: "nowrap" }}>{t("bi.budgets.line", { fact: compactSum(p.fact, t), plan: compactSum(p.plan, t) })}</Typography>
                <Typography sx={{ width: 44, textAlign: "right", fontSize: "0.875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: p.pct > 100 ? "error.main" : "text.primary" }}>{`${p.pct}%`}</Typography>
              </Box>
              <ProgressBar value={p.pct} color={p.pct > 100 ? "error.main" : p.pct > 90 ? "warning.main" : "primary.main"} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
