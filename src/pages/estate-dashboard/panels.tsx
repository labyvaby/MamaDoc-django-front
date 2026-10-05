import React from "react";
import { Box, ButtonBase, Checkbox, LinearProgress, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useNavigate } from "react-router";

import type {
  ApprovalsPanel,
  AuditPanel,
  BillingPanel,
  CashPanel,
  ConstructionPanel,
  DashboardPanels,
  HandoverPanel,
  HealthPanel,
  HrPanel,
  IntegrationsPanel,
  PanelName,
  ProcurementPanel,
  QualityPanel,
  RealtyTask,
  SalesPanel,
  TasksPanel,
  Tone,
} from "../../api/estateDashboard";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatDateRu, formatKGS } from "../../utility/format";
import { cardSx, compactMoney, estateHref, toneColor } from "./format";

// ─── Каркас ────────────────────────────────────────────────────────────────

function Panel({ title, summary, to, children }: { title: string; summary?: React.ReactNode; to?: string | null; children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <Box component="section" sx={{ ...cardSx, p: { xs: 1.75, md: 2.25 }, minWidth: 0 }}>
      <Box sx={{ mb: 1.5, display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Typography
          component="h2"
          onClick={to ? () => navigate(to) : undefined}
          sx={{ fontWeight: 700, fontSize: "1rem", cursor: to ? "pointer" : "default", "&:hover": to ? { color: "primary.main" } : undefined }}
        >
          {title}
        </Typography>
        {summary != null && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{summary}</Typography>}
      </Box>
      {children}
    </Box>
  );
}

/** Строка списка: точка тона, текст, справа значение; кликабельна, если есть адрес. */
function Row({ tone, primary, secondary, right, to }: { tone?: Tone | null; primary: React.ReactNode; secondary?: React.ReactNode; right?: React.ReactNode; to?: string | null }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const content = (
    <>
      {tone !== undefined && <Box aria-hidden sx={{ mt: "7px", width: 8, height: 8, flexShrink: 0, borderRadius: "50%", bgcolor: toneColor(theme, tone) }} />}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 500 }}>
          {primary}
        </Typography>
        {secondary && (
          <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {secondary}
          </Typography>
        )}
      </Box>
      {right != null && <Box sx={{ flexShrink: 0, fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{right}</Box>}
    </>
  );
  const sx = { width: "100%", display: "flex", alignItems: "flex-start", gap: 1.25, px: 1, py: 0.85, borderRadius: "10px", textAlign: "left" } as const;
  return to ? (
    <ButtonBase onClick={() => navigate(to)} sx={(th) => ({ ...sx, "&:hover": { bgcolor: subtleBg(th) } })}>
      {content}
    </ButtonBase>
  ) : (
    <Box sx={sx}>{content}</Box>
  );
}

function Empty() {
  const { t } = useT("estateDashboard");
  return <Typography sx={{ px: 1, py: 1.5, fontSize: "0.8125rem", color: "text.secondary" }}>{t("common.none")}</Typography>;
}

function Meter({ label, value, tone }: { label: string; value: number; tone?: Tone }) {
  const theme = useTheme();
  const color = tone ? toneColor(theme, tone) : theme.palette.primary.main;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
        {label}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={Math.max(0, Math.min(100, value))}
        sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: alpha(color, 0.15), "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 3 } }}
      />
    </Box>
  );
}

// ─── Панели ────────────────────────────────────────────────────────────────

function Health({ data }: { data: HealthPanel }) {
  const { t } = useT("estateDashboard");
  const navigate = useNavigate();
  return (
    <Panel title={t("panels.health.title")}>
      {data.projects.length === 0 ? (
        <Empty />
      ) : (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: `repeat(${Math.min(data.projects.length, 3)}, minmax(0, 1fr))` } }}>
          {data.projects.map((p) => (
            <ButtonBase
              key={p.projectId}
              component="div"
              // Карточка ЖК — в его шахматку.
              onClick={() => navigate(`/realestate/chessboard?project=${p.projectId}`)}
              sx={(th) => ({ display: "block", p: 1.5, borderRadius: "12px", border: 1, borderColor: "divider", bgcolor: subtleBg(th), textAlign: "left" })}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: "3px", bgcolor: p.color || "primary.main", flexShrink: 0 }} />
                <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.9rem", flex: 1 }}>
                  {p.projectName}
                </Typography>
              </Box>
              <Typography sx={(th) => ({ mt: 0.5, fontSize: "0.75rem", color: toneColor(th, p.tone) })}>{p.statusLabel}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                {t("panels.health.units", { free: p.free, reserved: p.reserved, sold: p.sold })}
              </Typography>
              <Box sx={{ mt: 1.25, display: "grid", gap: 1 }}>
                <Meter label={t("panels.health.sold", { pct: p.salesPct })} value={p.salesPct} />
                {data.constructionAvailable && <Meter label={t("panels.health.readiness", { pct: p.progress })} value={p.progress} tone={p.tone} />}
                {data.budgetAvailable && <Meter label={t("panels.health.budget", { pct: p.budgetPct })} value={p.budgetPct} />}
              </Box>
              {p.deadlineLabel && (
                <Typography sx={{ mt: 1, fontSize: "0.72rem", color: "text.secondary" }}>{t("panels.health.deadline", { label: p.deadlineLabel })}</Typography>
              )}
            </ButtonBase>
          ))}
        </Box>
      )}
    </Panel>
  );
}

function Approvals({ data }: { data: ApprovalsPanel }) {
  const { t } = useT("estateDashboard");
  const summary = data.mode === "mine" ? t("panels.approvals.mine", { count: data.mineCount }) : t("panels.approvals.total", { count: data.total });
  return (
    <Panel title={t("panels.approvals.title")} summary={summary} to="/edo">
      {data.items.length === 0 ? (
        <Empty />
      ) : (
        data.items.map((d) => (
          <Row
            key={d.id}
            tone={d.deadlineTone}
            primary={d.title}
            secondary={[d.number, d.typeName, d.counterparty, d.stepName && t("panels.approvals.step", { name: d.stepName })].filter(Boolean).join(" · ")}
            right={
              <>
                {d.amount > 0 && <Box>{compactMoney(d.amount, t)}</Box>}
                {d.deadlineLabel && <Box sx={(th) => ({ fontSize: "0.72rem", color: toneColor(th, d.deadlineTone) })}>{d.deadlineLabel}</Box>}
              </>
            }
            to={estateHref("edo", d.id)}
          />
        ))
      )}
    </Panel>
  );
}

/** Линия прогноза остатка; ниже нуля — красная зона. */
function ForecastLine({ points }: { points: { balance: number }[] }) {
  const theme = useTheme();
  if (points.length < 2) return null;
  const values = points.map((p) => p.balance);
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 1);
  const w = 300;
  const h = 56;
  const y = (v: number) => h - ((v - min) / (max - min || 1)) * h;
  const path = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <Box component="svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" sx={{ width: "100%", height: 56, display: "block" }} aria-hidden>
      {min < 0 && <rect x={0} y={y(0)} width={w} height={h - y(0)} fill={alpha(theme.palette.error.main, 0.08)} />}
      {min < 0 && <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke={theme.palette.error.main} strokeDasharray="3 3" strokeWidth={1} />}
      <polyline points={path} fill="none" stroke={theme.palette.primary.main} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </Box>
  );
}

function Cash({ data }: { data: CashPanel }) {
  const { t } = useT("estateDashboard");
  return (
    <Panel title={t("panels.cash.title")} summary={compactMoney(data.total, t)}>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("panels.cash.liquid")}</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", fontVariantNumeric: "tabular-nums" }}>{compactMoney(data.liquid, t)}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("panels.cash.escrow")}</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", fontVariantNumeric: "tabular-nums" }}>{compactMoney(data.escrow, t)}</Typography>
        </Box>
      </Box>
      {data.forecast.length > 1 && (
        <>
          <Typography sx={{ mb: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>{t("panels.cash.forecast")}</Typography>
          <ForecastLine points={data.forecast} />
        </>
      )}
      <Typography sx={(th) => ({ mt: 1, fontSize: "0.8125rem", color: data.hasGap ? th.palette.error.main : th.palette.text.secondary })}>
        {data.hasGap && data.gapDate
          ? t("panels.cash.gap", { date: formatDateRu(data.gapDate), sum: formatKGS(data.gapBalance) })
          : t("panels.cash.noGap")}
      </Typography>
      <Box sx={{ mt: 1 }}>
        {data.accounts.map((a) => (
          <Row key={a.id} primary={a.name} right={a.currency === "KGS" ? formatKGS(a.balance) : `${a.balanceNative.toLocaleString("ru-RU")} ${a.currency}`} />
        ))}
      </Box>
    </Panel>
  );
}

function Sales({ data }: { data: SalesPanel }) {
  const { t } = useT("estateDashboard");
  const theme = useTheme();
  const max = Math.max(1, ...data.stages.map((s) => s.value));
  return (
    <Panel title={t("panels.sales.title")} summary={`${t("panels.sales.summary", { count: data.leads, sum: compactMoney(data.amount, t) })} · ${t("panels.sales.hot", { count: data.hot })}`}>
      <Box sx={{ display: "grid", gap: 1 }}>
        {data.stages.map((s) => (
          <Box key={s.stage} sx={{ display: "grid", gridTemplateColumns: "minmax(0, 150px) minmax(0, 1fr) auto", alignItems: "center", gap: 1.25 }}>
            <Typography noWrap sx={{ fontSize: "0.8125rem" }}>
              {s.name}
            </Typography>
            <Box sx={{ height: 8, borderRadius: 4, bgcolor: alpha(theme.palette.primary.main, 0.12), overflow: "hidden" }}>
              <Box sx={{ height: "100%", width: `${(s.value / max) * 100}%`, bgcolor: "primary.main", borderRadius: 4 }} />
            </Box>
            <Typography sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums", color: "text.secondary", whiteSpace: "nowrap" }}>
              {s.value} · {compactMoney(s.amount, t)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Panel>
  );
}

function Tasks({ data, canManage, onToggle }: { data: TasksPanel; canManage: boolean; onToggle: (task: RealtyTask, done: boolean) => void }) {
  const { t } = useT("estateDashboard");
  return (
    <Panel title={t("panels.tasks.title")} summary={t("panels.tasks.summary", { open: data.open, done: data.done })}>
      {data.items.length === 0 ? (
        <Empty />
      ) : (
        data.items.map((task) => (
          <Box key={task.id} sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
            {/* Галочка — только с realty.manage (гайд: у остальных ролей её не рисовать). */}
            {canManage && (
              <Checkbox
                size="small"
                checked={Boolean(task.done)}
                onChange={(e) => onToggle(task, e.target.checked)}
                inputProps={{ "aria-label": t("panels.tasks.done") }}
                sx={{ mt: 0.25 }}
              />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Row
                tone={task.overdue ? "red" : undefined}
                primary={task.text}
                secondary={task.meta}
                right={
                  <>
                    <Box>{task.time}</Box>
                    {task.overdue && <Box sx={{ fontSize: "0.72rem", color: "error.main" }}>{t("panels.tasks.overdue")}</Box>}
                  </>
                }
              />
            </Box>
          </Box>
        ))
      )}
    </Panel>
  );
}

function Billing({ data }: { data: BillingPanel }) {
  const { t } = useT("estateDashboard");
  return (
    <Panel
      title={t("panels.billing.title")}
      summary={t("panels.billing.summary", { count: data.overdueCount, sum: compactMoney(data.overdueSum, t) })}
      to="/finance/billing"
    >
      {data.items.length === 0 ? (
        <Empty />
      ) : (
        data.items.map((b) => (
          <Row
            key={b.id}
            tone="red"
            primary={b.buyer}
            secondary={[b.projectName, t("panels.billing.unit", { number: b.unitNumber }), b.contract].filter(Boolean).join(" · ")}
            right={formatKGS(b.overdue)}
            to={estateHref("billing", b.id)}
          />
        ))
      )}
    </Panel>
  );
}

function Construction({ data }: { data: ConstructionPanel }) {
  const { t } = useT("estateDashboard");
  return (
    <Panel title={t("panels.construction.title")} summary={data.hasPlans ? t("panels.construction.late", { count: data.lateCount }) : undefined}>
      {!data.hasPlans ? (
        <Typography sx={{ px: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("panels.construction.noPlans")}</Typography>
      ) : data.items.length === 0 ? (
        <Empty />
      ) : (
        data.items.map((s) => (
          <Row
            key={s.id}
            tone={s.tone}
            primary={s.name}
            secondary={`${s.projectName} · ${s.contractorName ?? t("panels.construction.ownForces")}`}
            right={<Box sx={(th) => ({ color: toneColor(th, s.tone) })}>{t("panels.construction.delay", { days: s.delayDays })}</Box>}
          />
        ))
      )}
    </Panel>
  );
}

function Procurement({ data }: { data: ProcurementPanel }) {
  const { t } = useT("estateDashboard");
  return (
    <Panel title={t("panels.procurement.title")} summary={t("panels.procurement.summary", { open: data.openCount, low: data.lowStockCount })}>
      {data.items.length === 0 && data.lowStock.length === 0 ? (
        <Empty />
      ) : (
        <>
          {data.items.map((r) => (
            <Row
              key={r.id}
              tone={r.tone}
              primary={r.title}
              secondary={[r.number, r.projectName, r.needBy && t("panels.procurement.needBy", { date: formatDateRu(r.needBy) })].filter(Boolean).join(" · ")}
              right={r.statusLabel}
            />
          ))}
          {data.lowStock.map((s) => (
            <Row key={`low-${s.id}`} tone="amber" primary={s.name} right={t("panels.procurement.lowStock", { qty: s.qty, min: s.min, unit: s.unit })} />
          ))}
        </>
      )}
    </Panel>
  );
}

function Quality({ data }: { data: QualityPanel }) {
  const { t } = useT("estateDashboard");
  return (
    <Panel
      title={t("panels.quality.title")}
      summary={t("panels.quality.summary", { open: data.openCount, critical: data.criticalCount, overdue: data.overdueCount })}
    >
      {data.items.length === 0 ? (
        <Empty />
      ) : (
        data.items.map((d) => (
          <Row
            key={d.id}
            tone={d.tone}
            primary={d.title}
            secondary={[d.projectName, d.section && d.floor != null && t("panels.quality.place", { section: d.section, floor: d.floor }), d.severityLabel]
              .filter(Boolean)
              .join(" · ")}
            right={d.deadline ? formatDateRu(d.deadline) : null}
          />
        ))
      )}
    </Panel>
  );
}

function Hr({ data }: { data: HrPanel }) {
  const { t } = useT("estateDashboard");
  const rows: [string, React.ReactNode][] = [
    [t("panels.hr.employees"), data.employees],
    [t("panels.hr.departments"), data.departments],
    [t("panels.hr.timesheet"), data.timesheetClosed ? t("panels.hr.timesheetClosed") : `${data.timesheetFilledPct}%`],
    [t("panels.hr.payroll"), data.payrollLabel],
    [t("panels.hr.probation"), data.probation],
    [t("panels.hr.absentToday"), data.absentToday],
  ];
  // Вакансий в бэке нет (`null`) — строку не показываем.
  if (data.vacancies != null) rows.push([t("panels.hr.vacancies"), data.vacancies]);
  return (
    <Panel title={t("panels.hr.title")}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
        {rows.map(([label, value]) => (
          <Box key={label} sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {label}
            </Typography>
            <Typography noWrap sx={{ fontWeight: 700, fontSize: "1.05rem", fontVariantNumeric: "tabular-nums" }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Panel>
  );
}

/** «16:15» сегодня, «05.10 16:15» — раньше: в ленте бывают и вчерашние записи. */
function auditTime(ts: string): string {
  const at = new Date(ts);
  const time = at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (at.toDateString() === new Date().toDateString()) return time;
  return `${at.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} ${time}`;
}

function Audit({ data }: { data: AuditPanel }) {
  const { t } = useT("estateDashboard");
  return (
    <Panel title={t("panels.audit.title")} summary={t("panels.audit.today", { count: data.todayCount })}>
      {data.items.length === 0 ? (
        <Empty />
      ) : (
        data.items.map((a) => (
          <Row
            key={a.id}
            primary={[a.action, a.target].filter(Boolean).join(" · ")}
            secondary={[a.user, a.role].filter(Boolean).join(" · ")}
            right={auditTime(a.ts)}
          />
        ))
      )}
    </Panel>
  );
}

function Integrations({ data }: { data: IntegrationsPanel }) {
  const { t } = useT("estateDashboard");
  const toneOf = (status: string): Tone => (status === "ok" ? "green" : status === "warn" ? "amber" : status === "error" ? "red" : "gray");
  return (
    <Panel title={t("panels.integrations.title")} summary={t("panels.integrations.summary", { pending: data.pending, errors: data.errors })}>
      {data.connectors.length === 0 ? (
        <Empty />
      ) : (
        data.connectors.map((c) => (
          <Row
            key={c.id}
            tone={toneOf(c.status)}
            primary={c.name}
            right={c.lastSync ? formatDateRu(c.lastSync) : t("panels.integrations.neverSynced")}
          />
        ))
      )}
    </Panel>
  );
}

function Handover({ data }: { data: HandoverPanel }) {
  const { t } = useT("estateDashboard");
  return (
    <Panel title={t("panels.handover.title")} summary={t("panels.handover.summary", { count: data.activeCount })}>
      {data.items.length === 0 ? (
        <Empty />
      ) : (
        data.items.map((h) => (
          <Row
            key={h.id}
            tone={h.tone}
            primary={h.buyer}
            secondary={[h.number, h.projectName, t("panels.handover.unit", { number: h.unitNumber })].join(" · ")}
            right={
              <>
                <Box>
                  {formatDateRu(h.date)} {h.time}
                </Box>
                <Box sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{h.statusLabel}</Box>
              </>
            }
          />
        ))
      )}
    </Panel>
  );
}

/** Виджет по имени панели; `null` — данных нет (нет права или вне раскладки). */
export function DashboardPanel({
  name,
  panels,
  canManageTasks,
  onToggleTask,
}: {
  name: PanelName;
  panels: DashboardPanels;
  canManageTasks: boolean;
  onToggleTask: (task: RealtyTask, done: boolean) => void;
}) {
  switch (name) {
    case "health":
      return panels.health && <Health data={panels.health} />;
    case "approvals":
      return panels.approvals && <Approvals data={panels.approvals} />;
    case "cash":
      return panels.cash && <Cash data={panels.cash} />;
    case "sales":
      return panels.sales && <Sales data={panels.sales} />;
    case "tasks":
      return panels.tasks && <Tasks data={panels.tasks} canManage={canManageTasks} onToggle={onToggleTask} />;
    case "billing":
      return panels.billing && <Billing data={panels.billing} />;
    case "construction":
      return panels.construction && <Construction data={panels.construction} />;
    case "procurement":
      return panels.procurement && <Procurement data={panels.procurement} />;
    case "quality":
      return panels.quality && <Quality data={panels.quality} />;
    case "hr":
      return panels.hr && <Hr data={panels.hr} />;
    case "audit":
      return panels.audit && <Audit data={panels.audit} />;
    case "integrations":
      return panels.integrations && <Integrations data={panels.integrations} />;
    case "handover":
      return panels.handover && <Handover data={panels.handover} />;
    default:
      return null;
  }
}
