import React from "react";
import { Box, Button, ButtonBase, IconButton, Skeleton, Tooltip, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import dayjs from "dayjs";
import EditOutlined from "@mui/icons-material/EditOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";

import { getBudgets, treasuryKeys, type BudgetLine, type ProjectBudget } from "../../api/treasury";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import { cardSx } from "../estate-dashboard/format";
import { CardHeader, KpiCards, ScreenError } from "../realty-sales/shared";
import { LineDrawer, ReviseDrawer } from "./BudgetForms";
import { compactSum, fullDate, pct, sum } from "./format";
import { EmptyNote, InfoRow } from "./shared";

/** «План / факт» — только крупные статьи (гайд §4). */
const PLAN_FACT_MIN = 30_000_000;

/**
 * «Бюджеты проектов» застройщика (AIVIO, гайд `frontend-finance.md` §4): план,
 * договоры и факт по статьям ЖК, освоение относительно срока стройки,
 * экономика проекта — `GET /budgets/` (все ЖК одним запросом). Выбранный ЖК —
 * `?project=`. Правки — `treasury.manage`, ответ правки — весь бюджет.
 */
export default function BudgetPage() {
  const { t } = useT("realtyFinance");
  usePageTitle(t("budget.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <BudgetScreen />
    </Box>
  );
}

function BudgetScreen() {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const canManage = useCan("treasury.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = React.useState<BudgetLine | null>(null);
  const [revising, setRevising] = React.useState(false);
  const budgets = useQuery({ queryKey: treasuryKeys.budgets(scope), queryFn: ({ signal }) => getBudgets(scope, signal), enabled: scope.orgReady !== false, staleTime: 60_000 });

  if (budgets.error) return <ScreenError error={budgets.error} title={t("budget.loadError")} onRetry={() => void budgets.refetch()} />;

  const list = budgets.data;
  const projectParam = Number(searchParams.get("project")) || null;
  const budget = list?.find((b) => b.projectId === projectParam) ?? list?.[0] ?? null;
  const select = (id: number) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("project", String(id));
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>
          {t("budget.subtitle")}
          {budget?.updated ? ` · ${t("budget.updated", { date: fullDate(budget.updated) })}` : ""}
        </Typography>
        {canManage && budget && (
          <Button size="small" variant="outlined" startIcon={<TuneOutlined />} onClick={() => setRevising(true)} sx={{ whiteSpace: "nowrap" }}>
            {t("budget.revise")}
          </Button>
        )}
      </Box>

      <Box sx={{ mb: 1.5, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
        {!list && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} variant="rounded" width={140} height={32} sx={{ borderRadius: "9px" }} />)}
        {list?.map((b) => (
          <ButtonBase key={b.projectId} aria-pressed={budget?.projectId === b.projectId} onClick={() => select(b.projectId)} sx={(th) => ({ ...pillSx(th, budget?.projectId === b.projectId), whiteSpace: "nowrap", gap: 0.75 })}>
            {b.projectName}
            {b.risksCount > 0 && <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "warning.main" }} aria-label={t("budget.risks.title")} />}
          </ButtonBase>
        ))}
      </Box>

      {list && list.length === 0 && (
        <Box sx={cardSx}>
          <EmptyNote text={t("budget.empty")} />
        </Box>
      )}

      {(budget || !list) && (
        <KpiCards
          items={
            budget
              ? [
                  {
                    key: "plan",
                    label: t("budget.kpi.plan"),
                    value: compactSum(budget.plan, t),
                    hint: budget.economics.costPerSqm != null ? t("budget.kpi.planHint", { cost: Math.round(budget.economics.costPerSqm).toLocaleString("ru-RU"), area: budget.economics.areaTotal.toLocaleString("ru-RU") }) : null,
                  },
                  {
                    key: "progress",
                    label: t("budget.kpi.progress"),
                    value: pct(budget.progress),
                    hint: budget.elapsedPct != null ? t("budget.kpi.progressHint", { fact: compactSum(budget.fact, t), elapsed: budget.elapsedPct.toLocaleString("ru-RU") }) : t("budget.kpi.progressNoTerm", { fact: compactSum(budget.fact, t) }),
                    tone: budget.elapsedPct != null && budget.progress > budget.elapsedPct + 10 ? "warning" : null,
                  },
                  { key: "committed", label: t("budget.kpi.committed"), value: compactSum(budget.committed, t), hint: t("budget.kpi.committedHint", { pct: budget.committedPct.toLocaleString("ru-RU") }) },
                  {
                    key: "margin",
                    label: t("budget.kpi.margin"),
                    value: pct(budget.economics.marginPct),
                    hint: t("budget.kpi.marginHint", { margin: compactSum(budget.economics.margin, t), revenue: compactSum(budget.economics.revenuePlan, t) }),
                    tone: budget.economics.marginPct != null && budget.economics.marginPct < 20 ? "warning" : null,
                  },
                ]
              : null
          }
        />
      )}

      {budget && (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 340px" }, alignItems: "start" }}>
          <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
            <LinesTable budget={budget} canManage={canManage} onEdit={setEditing} />
            <PlanFact budget={budget} />
            <History budget={budget} />
          </Box>
          <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
            <Risks budget={budget} />
            <Economics budget={budget} />
          </Box>
        </Box>
      )}

      <LineDrawer budget={budget} line={editing} onClose={() => setEditing(null)} />
      <ReviseDrawer budget={budget} open={revising} onClose={() => setRevising(false)} />
    </>
  );
}

const lineTone = (line: BudgetLine) => (line.over ? "error.main" : line.risk === "ahead" ? "warning.main" : "text.primary");

function ProgressBar({ value, tone }: { value: number; tone: string }) {
  return (
    <Box sx={(th) => ({ height: 6, borderRadius: 3, bgcolor: subtleBg(th, true), overflow: "hidden" })}>
      <Box sx={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", borderRadius: 3, bgcolor: tone === "text.primary" ? "primary.main" : tone }} />
    </Box>
  );
}

function LinesTable({ budget, canManage, onEdit }: { budget: ProjectBudget; canManage: boolean; onEdit: (line: BudgetLine) => void }) {
  const { t } = useT("realtyFinance");
  const remaining = budget.plan - budget.fact;
  return (
    <Box sx={{ ...cardSx, minWidth: 0, overflow: "hidden" }}>
      <CardHeader title={t("budget.table.title")} />
      {budget.lines.length === 0 ? (
        <EmptyNote text={t("budget.noBudget")} />
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Box
            component="table"
            sx={{
              width: "100%",
              minWidth: 760,
              borderCollapse: "collapse",
              "& td, & th": { px: 1.5, py: 1, fontSize: "0.8125rem", borderTop: 1, borderColor: "divider", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
              "& th": { fontWeight: 600, color: "text.secondary" },
              "& td:first-of-type, & th:first-of-type": { pl: 2.25, textAlign: "left", whiteSpace: "normal" },
              "& tfoot td": { fontWeight: 700 },
            }}
          >
            <thead>
              <tr>
                <th>{t("budget.table.article")}</th>
                <th>{t("budget.table.plan")}</th>
                <th>{t("budget.table.committed")}</th>
                <th>{t("budget.table.fact")}</th>
                <th>{t("budget.table.remaining")}</th>
                <Box component="th" sx={{ width: 150 }}>
                  {t("budget.table.progress")}
                </Box>
                {canManage && <Box component="th" sx={{ width: 44 }} />}
              </tr>
            </thead>
            <tbody>
              {budget.lines.map((line) => {
                const tone = lineTone(line);
                return (
                  <tr key={line.id}>
                    <Box component="td" sx={{ fontWeight: 600, color: tone }}>
                      {line.articleName}
                    </Box>
                    <td>{formatKGS(line.plan)}</td>
                    <td>{formatKGS(line.committed)}</td>
                    <td>{formatKGS(line.fact)}</td>
                    <Box component="td" sx={{ color: line.remaining < 0 ? "error.main" : "text.primary", fontWeight: line.remaining < 0 ? 700 : 400 }}>
                      {sum(line.remaining)}
                    </Box>
                    <td>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box sx={{ flex: 1 }}>
                          <ProgressBar value={line.progress} tone={tone} />
                        </Box>
                        <Box component="span" sx={{ width: 44, color: tone }}>
                          {pct(line.progress)}
                        </Box>
                      </Box>
                    </td>
                    {canManage && (
                      <Box component="td" sx={{ px: "4px !important" }}>
                        <Tooltip title={t("budget.table.edit")}>
                          <IconButton size="small" aria-label={t("budget.table.edit")} onClick={() => onEdit(line)}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{t("budget.table.total")}</td>
                <td>{formatKGS(budget.plan)}</td>
                <td>{formatKGS(budget.committed)}</td>
                <td>{formatKGS(budget.fact)}</td>
                <Box component="td" sx={{ color: remaining < 0 ? "error.main" : "text.primary" }}>
                  {sum(remaining)}
                </Box>
                <td>{pct(budget.progress)}</td>
                {canManage && <td />}
              </tr>
            </tfoot>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function Risks({ budget }: { budget: ProjectBudget }) {
  const { t } = useT("realtyFinance");
  const risky = budget.lines.filter((line) => line.risk === "overrun" || line.risk === "ahead" || line.over);
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("budget.risks.title")} subtitle={risky.length ? String(risky.length) : undefined} />
      <Box sx={{ px: 2.25, pb: 1.5 }}>
        {risky.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("budget.risks.none")}</Typography>}
        {risky.map((line) => {
          const overrun = line.over || line.risk === "overrun";
          return (
            <Box key={line.id} sx={{ py: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem", fontWeight: 600 }}>
                  {line.articleName}
                </Typography>
                <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: overrun ? "error.main" : "warning.main", whiteSpace: "nowrap" }}>{t(overrun ? "budget.risks.overrun" : "budget.risks.ahead")}</Typography>
              </Box>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("budget.risks.line", { progress: line.progress.toLocaleString("ru-RU"), remaining: sum(line.remaining) })}</Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function Economics({ budget }: { budget: ProjectBudget }) {
  const { t } = useT("realtyFinance");
  const e = budget.economics;
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("budget.economics.title")} />
      <Box sx={{ px: 2.25, pb: 1.5 }}>
        <InfoRow label={t("budget.economics.revenuePlan")} value={formatKGS(e.revenuePlan)} />
        <InfoRow label={t("budget.economics.soldRevenue")} value={formatKGS(e.soldRevenue)} />
        <InfoRow label={t("budget.economics.reservedRevenue")} value={formatKGS(e.reservedRevenue)} />
        <InfoRow label={t("budget.economics.cost")} value={formatKGS(e.cost)} />
        <InfoRow label={t("budget.economics.margin")} value={`${formatKGS(e.margin)} · ${pct(e.marginPct)}`} tone={e.marginPct != null && e.marginPct < 20 ? "warning" : null} />
        <InfoRow label={t("budget.economics.area")} value={`${e.areaTotal.toLocaleString("ru-RU")} м²`} />
        {e.areaSource !== "budget" && <Typography sx={{ mt: -0.25, mb: 0.5, fontSize: "0.72rem", color: "warning.main" }}>{t("budget.economics.areaUnits")}</Typography>}
        <InfoRow label={t("budget.economics.costPerSqm")} value={e.costPerSqm != null ? formatKGS(e.costPerSqm) : "—"} />
        <InfoRow label={t("budget.economics.avgSale")} value={e.avgSalePricePerSqm != null ? formatKGS(e.avgSalePricePerSqm) : "—"} />
        <InfoRow label={t("budget.economics.contracted")} value={pct(e.contractedRevenuePct)} />
        <InfoRow label={t("budget.economics.breakeven")} value={pct(e.breakevenPct)} />
      </Box>
    </Box>
  );
}

function PlanFact({ budget }: { budget: ProjectBudget }) {
  const { t } = useT("realtyFinance");
  const lines = budget.lines.filter((line) => line.plan >= PLAN_FACT_MIN);
  if (lines.length === 0) return null;
  const max = Math.max(...lines.map((l) => Math.max(l.plan, l.fact)));
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("budget.planFact.title")} subtitle={t("budget.planFact.subtitle")} />
      <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1.5 }}>
        {lines.map((line) => (
          <Box key={line.id} sx={{ minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.5 }}>
              <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem", fontWeight: 600, color: lineTone(line) }}>
                {line.articleName}
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {compactSum(line.fact, t)} / {compactSum(line.plan, t)}
              </Typography>
            </Box>
            <Box sx={{ display: "grid", gap: 0.4 }}>
              <Bar label={t("budget.planFact.plan")} width={(line.plan / max) * 100} color="text.disabled" />
              <Bar label={t("budget.planFact.fact")} width={(line.fact / max) * 100} color={line.over ? "error.main" : "primary.main"} />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function Bar({ label, width, color }: { label: string; width: number; color: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Typography sx={{ width: 32, fontSize: "0.68rem", color: "text.secondary" }}>{label}</Typography>
      <Box sx={(th) => ({ flex: 1, height: 6, borderRadius: 3, bgcolor: subtleBg(th, true), overflow: "hidden" })}>
        <Box sx={{ width: `${Math.max(1, Math.min(100, width))}%`, height: "100%", borderRadius: 3, bgcolor: color }} />
      </Box>
    </Box>
  );
}

function History({ budget }: { budget: ProjectBudget }) {
  const { t } = useT("realtyFinance");
  const articleName = (code: string) => budget.lines.find((l) => l.article === code)?.articleName ?? code;
  const value = (field: string, v: number | null) => (v == null ? "—" : field === "areaTotal" ? `${v.toLocaleString("ru-RU")} м²` : formatKGS(v));
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("budget.history.title")} />
      <Box sx={{ px: 2.25, pb: 1.5 }}>
        {budget.history.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("budget.history.empty")}</Typography>}
        {budget.history.map((rev) => (
          <Box key={rev.id} sx={{ py: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{rev.kindLabel || rev.kind}</Typography>
              {rev.indexPct != null && <Typography sx={{ fontSize: "0.75rem", color: "warning.main" }}>{t("budget.history.index", { value: rev.indexPct.toLocaleString("ru-RU") })}</Typography>}
              <Typography sx={{ ml: "auto", fontSize: "0.72rem", color: "text.secondary" }}>
                {[rev.at ? dayjs(rev.at).format("DD.MM.YYYY HH:mm") : "", rev.byName].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
            {rev.note && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{rev.note}</Typography>}
            {rev.changes.slice(0, 6).map((c, i) => (
              <Typography key={i} sx={{ fontSize: "0.72rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                {t("budget.history.change", {
                  article: c.article ? articleName(c.article) : budget.projectName,
                  field: t(`budget.history.field_${c.field}`, { defaultValue: c.field }),
                  before: value(c.field, c.before),
                  after: value(c.field, c.after),
                })}
              </Typography>
            ))}
            {rev.changes.length > 6 && <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>…</Typography>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
