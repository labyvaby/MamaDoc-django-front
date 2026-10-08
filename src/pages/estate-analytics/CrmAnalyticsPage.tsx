import React from "react";
import { Box, Button, ButtonBase, Popover, Skeleton, Tooltip as MuiTooltip, Typography } from "@mui/material";
import { useTheme, type Theme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DateRangeOutlined from "@mui/icons-material/DateRangeOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";

import {
  ANALYTICS_PERIODS,
  changePct,
  estateAnalyticsKeys,
  getCrmAnalytics,
  showRate,
  type AnalyticsManager,
  type AnalyticsPeriod,
  type AnalyticsRange,
  type AnalyticsSource,
  type CrmAnalytics,
} from "../../api/estateAnalytics";
import { downloadLeadsCsv } from "../../api/realtyLeads";
import { CustomDatePicker, pillSx } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatDateRu } from "../../utility/format";
import { ProgressBar } from "../construction/shared";
import { cardSx } from "../estate-dashboard/format";
import { EmptyNote } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError } from "../realty-sales/shared";
import { compactSum, shareOf, signed } from "./format";

const isPeriod = (value: number): value is AnalyticsPeriod => (ANALYTICS_PERIODS as readonly number[]).includes(value);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * «Аналитика CRM» застройщика (AIVIO, гайд `frontend-dashboard-analytics.md` §5):
 * отчёт отдела продаж за период — `GET /api/v2/realty/analytics/summary/`.
 * Период и «Мои» — в адресе (`?period=`, `?from=&to=`, `?mine=1`), клики ведут
 * в «Лиды» с фильтром этапа / менеджера и в «Мой день». Право — `realty.view`.
 * План (`plan`, `managers[].planPct`, `projects[].planPct`), расходы каналов и
 * WhatsApp — с 07.10 (`frontend-new-modules.md` §4); нет плана → `null`, не рисуем.
 */
export default function CrmAnalyticsPage() {
  const { t } = useT("estateAnalytics");
  usePageTitle(t("crm.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <CrmAnalyticsScreen />
    </Box>
  );
}

function CrmAnalyticsScreen() {
  const { t } = useT("estateAnalytics");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { activeEmployee } = usePermissions();
  const myId = activeEmployee?.id != null ? Number(activeEmployee.id) : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [customAnchor, setCustomAnchor] = React.useState<HTMLElement | null>(null);

  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";
  const periodParam = Number(searchParams.get("period"));
  const custom = ISO.test(fromParam) && ISO.test(toParam) && fromParam <= toParam;
  const range: AnalyticsRange = React.useMemo(
    () => (custom ? { from: fromParam, to: toParam } : { period: isPeriod(periodParam) ? periodParam : 30 }),
    [custom, fromParam, toParam, periodParam],
  );
  const mine = searchParams.get("mine") === "1" && myId != null;
  const managerId = mine ? myId : null;

  const update = (patch: Record<string, string | null>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value == null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  const summary = useQuery({
    queryKey: estateAnalyticsKeys.crm(scope, range, managerId),
    queryFn: ({ signal }) => getCrmAnalytics(range, managerId, scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const exportCsv = useMutation({
    mutationFn: () => downloadLeadsCsv({ managerId }, scope),
    onError: () => enqueueSnackbar(t("crm.exportFailed"), { variant: "error" }),
  });

  if (summary.error) return <ScreenError error={summary.error} title={t("common.loadError")} onRetry={() => void summary.refetch()} />;
  const a = summary.data;
  const leadsHref = (patch: Record<string, string>) => `/realestate/leads?${new URLSearchParams({ ...patch, ...(managerId != null && !patch.managerId ? { managerId: String(managerId) } : {}) }).toString()}`;

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>
          {t("crm.subtitle")}
          {a?.dateFrom && a.dateTo ? ` · ${t("crm.range", { from: formatDateRu(a.dateFrom), to: formatDateRu(a.dateTo) })}` : ""}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
          {ANALYTICS_PERIODS.map((value) => {
            const active = !custom && "period" in range && range.period === value;
            return (
              <ButtonBase key={value} aria-pressed={active} onClick={() => update({ period: value === 30 ? null : String(value), from: null, to: null })} sx={(th) => ({ ...pillSx(th, active), whiteSpace: "nowrap" })}>
                {t(`crm.period.${value}`)}
              </ButtonBase>
            );
          })}
          <ButtonBase aria-pressed={custom} onClick={(e) => setCustomAnchor(e.currentTarget)} sx={(th) => ({ ...pillSx(th, custom), whiteSpace: "nowrap", gap: 0.5 })}>
            <DateRangeOutlined sx={{ fontSize: 16 }} />
            {custom ? t("crm.range", { from: dayjs(fromParam).format("DD.MM"), to: dayjs(toParam).format("DD.MM") }) : t("crm.period.custom")}
          </ButtonBase>
        </Box>
        <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
          {myId != null && (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <ButtonBase aria-pressed={!mine} onClick={() => update({ mine: null })} sx={(th) => ({ ...pillSx(th, !mine), whiteSpace: "nowrap" })}>
                {t("crm.team")}
              </ButtonBase>
              <ButtonBase aria-pressed={mine} onClick={() => update({ mine: "1" })} sx={(th) => ({ ...pillSx(th, mine), whiteSpace: "nowrap" })}>
                {t("crm.mine")}
              </ButtonBase>
            </Box>
          )}
          <Button variant="outlined" size="small" startIcon={<FileDownloadOutlined />} disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()} sx={{ whiteSpace: "nowrap" }}>
            {t("crm.export")}
          </Button>
        </Box>
      </Box>

      <CustomPeriodPopover
        anchor={customAnchor}
        initial={custom ? { from: fromParam, to: toParam } : a ? { from: a.dateFrom, to: a.dateTo } : null}
        onClose={() => setCustomAnchor(null)}
        onApply={(from, to) => {
          setCustomAnchor(null);
          update({ from, to, period: null });
        }}
      />

      <Kpis data={a} />

      {!a ? (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" } }}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={260} sx={{ borderRadius: "14px" }} />
          ))}
        </Box>
      ) : (
        // Две независимые колонки: карточки разной высоты не оставляют пустых дыр в сетке.
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 3fr) minmax(0, 2fr)" }, alignItems: "start" }}>
          <Box sx={{ display: "grid", gap: 1.5, minWidth: 0 }}>
            <Funnel data={a} onStage={(stage) => navigate(leadsHref({ stage }))} />
            <Dynamics data={a} />
            <Managers rows={a.managers} onOpen={(m) => navigate(leadsHref({ managerId: String(m.managerId) }))} />
            <Sources rows={a.sources} />
          </Box>
          <Box sx={{ display: "grid", gap: 1.5, minWidth: 0 }}>
            <Tasks data={a} onTasks={() => navigate(managerId != null ? "/realestate/today?mine=1" : "/realestate/today")} onNoTask={() => navigate(leadsHref({ filter: "notask" }))} />
            <Activity data={a} />
            <StageConversion data={a} />
            <Projects data={a} />
            <UnitTrends data={a} />
          </Box>
        </Box>
      )}
    </>
  );
}

function CustomPeriodPopover({ anchor, initial, onClose, onApply }: { anchor: HTMLElement | null; initial: { from: string; to: string } | null; onClose: () => void; onApply: (from: string, to: string) => void }) {
  const { t } = useT("estateAnalytics");
  const [from, setFrom] = React.useState<Dayjs | null>(null);
  const [to, setTo] = React.useState<Dayjs | null>(null);
  React.useEffect(() => {
    if (!anchor) return;
    setFrom(initial?.from ? dayjs(initial.from) : dayjs().subtract(29, "day"));
    setTo(initial?.to ? dayjs(initial.to) : dayjs());
  }, [anchor]); // eslint-disable-line react-hooks/exhaustive-deps -- значения берём при открытии
  const bad = from != null && to != null && from.isAfter(to, "day");
  const ready = from?.isValid() && to?.isValid() && !bad;
  return (
    <Popover open={anchor != null} anchorEl={anchor} onClose={onClose} anchorOrigin={{ vertical: "bottom", horizontal: "left" }} slotProps={{ paper: { sx: { p: 2, width: 300, maxWidth: "calc(100vw - 32px)" } } }}>
      <Typography sx={{ fontWeight: 700, mb: 1.5 }}>{t("crm.customTitle")}</Typography>
      <Box sx={{ display: "grid", gap: 1.5 }}>
        <CustomDatePicker label={t("crm.from")} value={from} onChange={(v) => setFrom(v)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
        <CustomDatePicker
          label={t("crm.to")}
          value={to}
          onChange={(v) => setTo(v)}
          slotProps={{ textField: { size: "small", fullWidth: true, error: bad, helperText: bad ? t("crm.badRange") : undefined } }}
        />
        <Button variant="contained" disabled={!ready} onClick={() => from && to && onApply(from.format("YYYY-MM-DD"), to.format("YYYY-MM-DD"))}>
          {t("crm.apply")}
        </Button>
      </Box>
    </Popover>
  );
}

function Kpis({ data }: { data: CrmAnalytics | undefined }) {
  const { t } = useT("estateAnalytics");
  if (!data) return <KpiCards items={null} />;
  const prev = data.previous;
  const pctHint = (cur: number, before: number | undefined) => {
    const change = changePct(cur, before);
    return change == null ? null : t("common.vsPrevious", { value: signed(change, "%") });
  };
  const rate = showRate(data);
  const prevRate = showRate(prev);
  return (
    <KpiCards
      items={[
        { key: "leads", label: t("crm.kpi.leads"), value: String(data.leads), hint: pctHint(data.leads, prev?.leads) },
        {
          key: "showRate",
          label: t("crm.kpi.showRate"),
          value: rate != null ? `${rate}%` : "—",
          hint: rate != null && prevRate != null ? t("common.vsPrevious", { value: t("common.pp", { value: signed(rate - prevRate) }) }) : null,
        },
        { key: "deals", label: t("crm.kpi.deals"), value: String(data.deals), hint: pctHint(data.deals, prev?.deals) },
        { key: "revenue", label: t("crm.kpi.revenue"), value: compactSum(data.revenue, t), hint: pctHint(data.revenue, prev?.revenue) },
      ]}
    />
  );
}

function Funnel({ data, onStage }: { data: CrmAnalytics; onStage: (stage: string) => void }) {
  const { t } = useT("estateAnalytics");
  const max = Math.max(0, ...data.stages.map((s) => s.current));
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader
        title={t("crm.funnel.title")}
        subtitle={t("crm.funnel.hint")}
        action={
          <Typography component="span" sx={(th) => ({ px: 1, py: 0.25, borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap", bgcolor: subtleBg(th, true) })}>
            {t("crm.funnel.conversion", { value: data.conversion })}
          </Typography>
        }
      />
      {data.stages.length === 0 ? (
        <EmptyNote text={t("common.empty")} />
      ) : (
        <Box sx={{ pb: 1 }}>
          <Box sx={{ px: 2.25, pb: 0.5, display: { xs: "none", sm: "grid" }, gridTemplateColumns: "minmax(0, 1fr) 72px 72px 72px", gap: 1, fontSize: "0.72rem", color: "text.secondary" }}>
            <span />
            <Box sx={{ textAlign: "right" }}>{t("crm.funnel.advanced")}</Box>
            <Box sx={{ textAlign: "right" }}>{t("crm.funnel.lost")}</Box>
            <Box sx={{ textAlign: "right" }}>{t("crm.funnel.delta")}</Box>
          </Box>
          {data.stages.map((s) => (
            <ButtonBase
              key={s.stage}
              onClick={() => onStage(s.stage)}
              sx={{ width: "100%", px: 2.25, py: 1, justifyContent: "stretch", textAlign: "left", display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr) 64px", sm: "minmax(0, 1fr) 72px 72px 72px" }, gap: 1, alignItems: "center", "&:hover": { bgcolor: "action.hover" } }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.5 }}>
                  <Typography noWrap sx={{ flex: 1, fontSize: "0.875rem", fontWeight: 600 }}>
                    {s.name}
                  </Typography>
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{t("crm.funnel.stageValue", { count: s.current, amount: compactSum(s.value, t) })}</Typography>
                </Box>
                <ProgressBar value={shareOf(s.current, max)} />
              </Box>
              <Typography sx={{ display: { xs: "none", sm: "block" }, textAlign: "right", fontSize: "0.875rem", fontVariantNumeric: "tabular-nums", color: s.advanced ? "success.main" : "text.secondary" }}>{s.advanced}</Typography>
              <Typography sx={{ display: { xs: "none", sm: "block" }, textAlign: "right", fontSize: "0.875rem", fontVariantNumeric: "tabular-nums", color: s.lost ? "error.main" : "text.secondary" }}>{s.lost}</Typography>
              <Typography sx={{ textAlign: "right", fontSize: "0.875rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{signed(s.delta)}</Typography>
            </ButtonBase>
          ))}
        </Box>
      )}
    </Box>
  );
}

function Tile({ label, value, hint, tone, onClick }: { label: string; value: number; hint?: string | null; tone?: "error" | "warning" | "success" | null; onClick?: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={!onClick}
      sx={(th) => ({ p: 1.5, borderRadius: "10px", bgcolor: subtleBg(th), display: "block", textAlign: "left", width: "100%", "&:hover": onClick ? { bgcolor: "action.hover" } : undefined })}
    >
      <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.25, fontSize: "1.35rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: tone && value > 0 ? `${tone}.main` : "text.primary" }}>{value}</Typography>
      {hint && <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>{hint}</Typography>}
    </ButtonBase>
  );
}

function Tasks({ data, onTasks, onNoTask }: { data: CrmAnalytics; onTasks: () => void; onNoTask: () => void }) {
  const { t } = useT("estateAnalytics");
  const doneChange = data.previous ? changePct(data.tasks.done, data.previous.tasksDone) : null;
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader
        title={t("crm.tasks.title")}
        action={
          <Button size="small" onClick={onTasks} sx={{ whiteSpace: "nowrap" }}>
            {t("crm.tasks.openTasks")}
          </Button>
        }
      />
      <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Tile label={t("crm.tasks.overdue")} value={data.tasks.overdue} tone="error" onClick={onTasks} />
        <Tile label={t("crm.tasks.done")} value={data.tasks.done} tone="success" hint={doneChange != null ? t("common.vsPrevious", { value: signed(doneChange, "%") }) : null} onClick={onTasks} />
        <Tile label={t("crm.tasks.open")} value={data.tasks.open} onClick={onTasks} />
        <Tile label={t("crm.tasks.leadsWithoutTask")} value={data.tasks.leadsWithoutTask} tone="warning" onClick={onNoTask} />
      </Box>
    </Box>
  );
}

function Activity({ data }: { data: CrmAnalytics }) {
  const { t } = useT("estateAnalytics");
  const items = (["calls", "whatsapp", "shows", "bookings", "contracts", "proposals"] as const).map((key) => ({ key, value: data.activity[key] }));
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("crm.activity.title")} />
      <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1 }}>
        {items.map((i) => (
          <Box key={i.key}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.4 }}>
              <Typography sx={{ fontSize: "0.8125rem" }}>{t(`crm.activity.${i.key}`)}</Typography>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{i.value}</Typography>
            </Box>
            <ProgressBar value={shareOf(i.value, max)} color="info.main" height={5} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const tooltipStyle = (theme: Theme) => ({ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 12 });

/** Цвет выполнения плана: от 100% — успех, от 70% — норма, ниже — отставание. */
const planColor = (pct: number) => (pct >= 100 ? "success.main" : pct >= 70 ? "primary.main" : "warning.main");

/** Плашка «План N %» в «Динамике продаж»; подсказка — выполнение за текущий месяц. */
function PlanBadge({ data }: { data: CrmAnalytics }) {
  const { t } = useT("estateAnalytics");
  const plan = data.plan;
  if (!plan || plan.pct == null) return null;
  const month = plan.month ? dayjs(`${plan.month}-01`) : null;
  const hint =
    plan.monthPlan != null
      ? t("crm.plan.monthHint", {
          month: month?.isValid() ? month.format("MMMM") : plan.month,
          plan: compactSum(plan.monthPlan, t),
          fact: compactSum(plan.monthFact, t),
          deals: t("crm.plan.deals", { count: plan.monthDeals }),
          pct: plan.monthPct ?? 0,
        })
      : t("crm.plan.periodHint", { plan: compactSum(plan.amount, t), fact: compactSum(plan.fact, t) });
  return (
    <MuiTooltip title={hint} arrow>
      <Typography component="span" tabIndex={0} sx={(th) => ({ px: 1, py: 0.25, borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap", bgcolor: subtleBg(th, true), color: planColor(plan.pct ?? 0), cursor: "help" })}>
        {t("crm.plan.badge", { value: plan.pct })}
      </Typography>
    </MuiTooltip>
  );
}

/** Процент плана с полосой — для таблиц и списков; нет плана — «—». */
function PlanCell({ pct }: { pct: number | null }) {
  if (pct == null) return <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>—</Typography>;
  return (
    <Box sx={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 0.75, alignItems: "center" }}>
      <ProgressBar value={pct} color={planColor(pct)} height={5} />
      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{pct}%</Typography>
    </Box>
  );
}

function Dynamics({ data }: { data: CrmAnalytics }) {
  const { t } = useT("estateAnalytics");
  const theme = useTheme();
  const empty = data.dynamics.every((d) => d.leads === 0 && d.contracts === 0);
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("crm.dynamics.title")} action={<PlanBadge data={data} />} />
      <Box sx={{ px: 1, pb: 1.5, height: 240 }}>
        {data.dynamics.length === 0 || empty ? (
          <EmptyNote text={t("common.empty")} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.dynamics} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={tooltipStyle(theme)} cursor={{ fill: theme.palette.action.hover }} formatter={(value, name) => [value, name === "leads" ? t("crm.dynamics.leads") : t("crm.dynamics.contracts")]} />
              <Legend formatter={(name) => (name === "leads" ? t("crm.dynamics.leads") : t("crm.dynamics.contracts"))} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="leads" fill={theme.palette.success.light} radius={[4, 4, 0, 0]} />
              <Bar dataKey="contracts" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Box>
  );
}

function StageConversion({ data }: { data: CrmAnalytics }) {
  const { t } = useT("estateAnalytics");
  const max = Math.max(0, ...data.stages.map((s) => s.current));
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("crm.stages.title")} />
      {data.stages.length === 0 ? (
        <EmptyNote text={t("common.empty")} />
      ) : (
        <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1 }}>
          {data.stages.map((s) => (
            <Box key={s.stage}>
              <Box sx={{ display: "flex", gap: 1, mb: 0.4 }}>
                <Typography noWrap sx={{ flex: 1, fontSize: "0.8125rem" }}>
                  {s.name}
                </Typography>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.current}</Typography>
              </Box>
              <ProgressBar value={shareOf(s.current, max)} height={5} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function Managers({ rows, onOpen }: { rows: AnalyticsManager[]; onOpen: (row: AnalyticsManager) => void }) {
  const { t } = useT("estateAnalytics");
  const columns: GridColDef<AnalyticsManager>[] = [
    { field: "name", headerName: t("crm.managers.name"), flex: 1, minWidth: 160 },
    { field: "leads", headerName: t("crm.managers.leads"), width: 80, type: "number" },
    { field: "deals", headerName: t("crm.managers.deals"), width: 80, type: "number" },
    { field: "revenue", headerName: t("crm.managers.revenue"), width: 120, type: "number", valueFormatter: (value: number) => compactSum(value, t) },
    { field: "calls", headerName: t("crm.managers.calls"), width: 80, type: "number" },
    {
      field: "planPct",
      headerName: t("crm.managers.plan"),
      width: 130,
      type: "number",
      sortComparator: (a: number | null, b: number | null) => (a ?? -1) - (b ?? -1),
      renderCell: ({ row }) => <PlanCell pct={row.planPct} />,
    },
  ];
  return (
    <Box sx={{ ...cardSx, minWidth: 0, overflow: "hidden" }}>
      <CardHeader title={t("crm.managers.title")} />
      <DataGrid<AnalyticsManager>
        rows={rows}
        columns={columns}
        getRowId={(row) => row.managerId}
        localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
        onRowClick={({ row }) => onOpen(row)}
        initialState={{ sorting: { sortModel: [{ field: "revenue", sort: "desc" }] } }}
        disableRowSelectionOnClick
        disableColumnMenu
        autoHeight
        hideFooter
        sx={{ border: 0, borderTop: 1, borderColor: "divider", borderRadius: 0, "& .MuiDataGrid-row": { cursor: "pointer" } }}
      />
    </Box>
  );
}

function Projects({ data }: { data: CrmAnalytics }) {
  const { t } = useT("estateAnalytics");
  const max = Math.max(0, ...data.projects.map((p) => p.sold + p.reserved));
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("crm.projects.title")} />
      {data.projects.length === 0 ? (
        <EmptyNote text={t("common.empty")} />
      ) : (
        <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1.5 }}>
          {data.projects.map((p) => (
            <Box key={p.projectId}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.5 }}>
                <Typography noWrap sx={{ flex: 1, fontSize: "0.875rem", fontWeight: 600 }}>
                  {p.name}
                </Typography>
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", whiteSpace: "nowrap" }}>{t("crm.projects.revenue", { amount: compactSum(p.revenue, t) })}</Typography>
              </Box>
              <Box sx={(th) => ({ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", bgcolor: subtleBg(th, true) })}>
                <Box sx={{ width: `${shareOf(p.sold, max)}%`, bgcolor: "success.main" }} />
                <Box sx={{ width: `${shareOf(p.reserved, max)}%`, bgcolor: "warning.main" }} />
              </Box>
              <Typography sx={{ mt: 0.4, fontSize: "0.72rem", color: "text.secondary" }}>
                {t("crm.projects.sold")}: <b>{p.sold}</b> · {t("crm.projects.reserved")}: <b>{p.reserved}</b>
              </Typography>
              {p.planPct != null && p.plan != null && (
                <Box sx={{ mt: 0.75 }}>
                  <Typography sx={{ mb: 0.4, fontSize: "0.72rem", color: "text.secondary" }}>{t("crm.projects.plan", { plan: compactSum(p.plan, t) })}</Typography>
                  <PlanCell pct={p.planPct} />
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function Sources({ rows }: { rows: AnalyticsSource[] }) {
  const { t } = useT("estateAnalytics");
  const columns: GridColDef<AnalyticsSource>[] = [
    { field: "source", headerName: t("crm.sources.source"), flex: 1, minWidth: 140 },
    { field: "leads", headerName: t("crm.sources.leads"), width: 90, type: "number" },
    { field: "deals", headerName: t("crm.sources.deals"), width: 90, type: "number" },
    { field: "conversion", headerName: t("crm.sources.conversion"), width: 110, type: "number", valueFormatter: (value: number) => `${value}%` },
    { field: "revenue", headerName: t("crm.sources.revenue"), width: 110, type: "number", valueFormatter: (value: number) => (value ? compactSum(value, t) : "—") },
    {
      field: "spend",
      headerName: t("crm.sources.spend"),
      width: 110,
      type: "number",
      sortComparator: (a: number | null, b: number | null) => (a ?? -1) - (b ?? -1),
      valueFormatter: (value: number | null) => (value == null ? t("crm.sources.organic") : compactSum(value, t)),
    },
    {
      field: "costPerDeal",
      headerName: t("crm.sources.costPerDeal"),
      width: 170,
      type: "number",
      sortComparator: (a: number | null, b: number | null) => (a ?? -1) - (b ?? -1),
      valueFormatter: (value: number | null) => (value == null ? "—" : compactSum(value, t)),
    },
  ];
  return (
    <Box sx={{ ...cardSx, minWidth: 0, overflow: "hidden" }}>
      <CardHeader title={t("crm.sources.title")} />
      <DataGrid<AnalyticsSource>
        rows={rows}
        columns={columns}
        getRowId={(row) => row.source}
        localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
        initialState={{ sorting: { sortModel: [{ field: "leads", sort: "desc" }] } }}
        disableRowSelectionOnClick
        disableColumnMenu
        autoHeight
        hideFooter
        sx={{ border: 0, borderTop: 1, borderColor: "divider", borderRadius: 0 }}
      />
    </Box>
  );
}

function UnitTrends({ data }: { data: CrmAnalytics }) {
  const { t } = useT("estateAnalytics");
  const theme = useTheme();
  const rows = data.unitTrends.map((u) => ({ ...u, label: u.week ? t("crm.units.week", { week: u.week }) : formatDateRu(u.date) }));
  const empty = rows.every((u) => u.sold === 0 && u.reserved === 0 && u.free === 0);
  const names: Record<string, string> = { sold: t("crm.units.sold"), reserved: t("crm.units.reserved"), free: t("crm.units.free") };
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("crm.units.title")} />
      <Box sx={{ px: 1, pb: 1.5, height: 220 }}>
        {rows.length === 0 || empty ? (
          <EmptyNote text={t("common.empty")} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} width={36} />
              <Tooltip contentStyle={tooltipStyle(theme)} cursor={{ fill: theme.palette.action.hover }} formatter={(value, name) => [value, names[String(name)] ?? name]} />
              <Legend formatter={(name) => names[String(name)] ?? name} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="sold" stackId="u" fill={theme.palette.success.main} />
              <Bar dataKey="reserved" stackId="u" fill={theme.palette.warning.main} />
              <Bar dataKey="free" stackId="u" fill={theme.palette.action.disabled} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Box>
  );
}
