import React from "react";
import { Alert, Box, Button, ButtonBase, Skeleton, Tooltip, Typography, alpha, useTheme } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import dayjs from "dayjs";
import AddOutlined from "@mui/icons-material/AddOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import {
  constructionKeys,
  ganttBar,
  ganttMonths,
  ganttRange,
  getScheduleSummary,
  getStages,
  upcomingMilestones,
  type ScheduleSummary,
  type Stage,
} from "../../api/construction";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { cardSx } from "../estate-dashboard/format";
import { PillTabs, TwoLines, EmptyNote } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { NewStageDrawer } from "./ConstructionForms";
import { fullDate, groupColor, monthShort, shortDate, stageTone } from "./format";
import { useConstructionProjects, useStageGroups } from "./hooks";
import { ProgressBar, StatusPill } from "./shared";
import { StageDrawer } from "./StageDrawer";

type Tab = "gantt" | "stages" | "overview";

/**
 * «Проекты и графики» застройщика (AIVIO, гайд `frontend-construction.md` §3):
 * чипы ЖК (`?project=`), KPI и «критический путь» — `schedule-summary`,
 * Гант и этапы — `/stages/?projectId=`, «Сводка по объектам» — `/projects/overview/`.
 * Карточка этапа — `?stage=`. Кнопки — `construction.manage`.
 */
export default function SchedulePage() {
  const { t } = useT("construction");
  usePageTitle(t("schedule.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <ScheduleScreen />
    </Box>
  );
}

function ScheduleScreen() {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const canManage = useCan("construction.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const [stageId, openStage] = useIdParam("stage");
  const [tab, setTab] = React.useState<Tab>("gantt");
  const [newStage, setNewStage] = React.useState(false);
  const enabled = scope.orgReady !== false;

  const overview = useConstructionProjects();
  const projects = overview.data;
  const projectParam = Number(searchParams.get("project")) || null;
  const projectId = projects?.find((p) => p.projectId === projectParam)?.projectId ?? projects?.[0]?.projectId ?? null;
  const selectProject = (id: number) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("project", String(id));
        next.delete("stage");
        return next;
      },
      { replace: true },
    );

  const summary = useQuery({
    queryKey: constructionKeys.summary(scope, projectId ?? 0),
    queryFn: ({ signal }) => getScheduleSummary(projectId as number, scope, signal),
    enabled: enabled && projectId != null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const stages = useQuery({
    queryKey: constructionKeys.stages(scope, projectId),
    queryFn: ({ signal }) => getStages({ projectId }, scope, signal),
    enabled: enabled && projectId != null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const error = overview.error ?? summary.error ?? stages.error;
  if (error) {
    return (
      <ScreenError
        error={error}
        title={t("schedule.loadError")}
        onRetry={() => {
          void overview.refetch();
          void summary.refetch();
          void stages.refetch();
        }}
      />
    );
  }

  const s = summary.data && summary.data.projectId === projectId ? summary.data : null;
  const list = stages.data ?? [];
  const firstDelayed = s && s.delayedStages > 0 ? (list.find((st) => st.id === s.delayedStageIds[0]) ?? null) : null;
  const projectName = projects?.find((p) => p.projectId === projectId)?.projectName ?? "";

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>
          {t("schedule.subtitle")}
          {s?.updated ? ` · ${t("schedule.updated", { date: fullDate(s.updated) })}` : ""}
        </Typography>
        {canManage && projectId != null && (
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setNewStage(true)} sx={{ whiteSpace: "nowrap" }}>
            {t("schedule.newStage")}
          </Button>
        )}
      </Box>

      <Box sx={{ mb: 1.5, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
        {!projects && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} variant="rounded" width={150} height={32} sx={{ borderRadius: "9px" }} />)}
        {projects?.map((p) => (
          <ButtonBase key={p.projectId} aria-pressed={p.projectId === projectId} onClick={() => selectProject(p.projectId)} sx={(th) => ({ ...pillSx(th, p.projectId === projectId), whiteSpace: "nowrap", gap: 0.75 })}>
            {p.projectName}
            {p.delayedStages > 0 && <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "error.main" }} />}
          </ButtonBase>
        ))}
      </Box>
      {projects && projects.length === 0 && (
        <Box sx={cardSx}>
          <EmptyNote text={t("common.empty")} />
        </Box>
      )}

      {projectId != null && (
        <>
          <KpiCards
            items={
              s
                ? [
                    {
                      key: "readiness",
                      label: t("schedule.kpi.readiness"),
                      value: `${s.readinessPct}%`,
                      hint: t("schedule.kpi.elapsed", { pct: s.timeElapsedPct }),
                      tone: s.readinessPct < s.timeElapsedPct - 8 ? "warning" : null,
                    },
                    { key: "active", label: t("schedule.kpi.active"), value: String(s.stagesActive), hint: t("schedule.kpi.activeHint", { done: s.stagesDone, total: s.stagesTotal }) },
                    {
                      key: "delay",
                      label: t("schedule.kpi.delay"),
                      value: s.maxDelayDays > 0 ? t("common.daysShort", { count: s.maxDelayDays }) : t("schedule.kpi.delayNone"),
                      hint: s.delayedStages > 0 ? t("schedule.kpi.delayHint", { count: s.delayedStages }) : null,
                      tone: s.maxDelayDays > 10 ? "error" : s.maxDelayDays > 0 ? "warning" : "success",
                    },
                    {
                      key: "handover",
                      label: t("schedule.kpi.handover"),
                      value: s.daysToHandover != null ? t("common.daysShort", { count: s.daysToHandover }) : "—",
                      hint: s.projectEnd ? t("schedule.kpi.handoverHint", { date: fullDate(s.projectEnd) }) : null,
                    },
                  ]
                : null
            }
          />

          {s && s.delayedStages > 0 && (
            <Alert
              severity="error"
              icon={<WarningAmberOutlined />}
              sx={{ mb: 2, "& .MuiAlert-message": { flex: 1, minWidth: 0 }, "& .MuiAlert-action": { alignItems: "center", pt: 0 } }}
              action={
                firstDelayed ? (
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Button color="inherit" size="small" onClick={() => openStage(firstDelayed.id)} sx={{ whiteSpace: "nowrap" }}>
                      {t("schedule.critical.open")}
                    </Button>
                  </Box>
                ) : undefined
              }
            >
              <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
                {t("schedule.critical.title", { stage: firstDelayed?.name ?? s.activeStageName, days: t("common.days", { count: firstDelayed?.delayDays ?? s.maxDelayDays }) })}
              </Typography>
              <Typography sx={{ fontSize: "0.8125rem" }}>
                {[firstDelayed && t("schedule.critical.contractor", { name: firstDelayed.contractorName ?? t("common.ownForces") }), s.delayedStages > 1 && t("schedule.critical.more", { count: s.delayedStages - 1 })]
                  .filter(Boolean)
                  .join(" · ")}
              </Typography>
            </Alert>
          )}

          <Box sx={{ mb: 1.25 }}>
            <PillTabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "gantt", label: t("schedule.tabs.gantt") },
                { key: "stages", label: t("schedule.tabs.stages"), count: stages.data?.length ?? null },
                { key: "overview", label: t("schedule.tabs.overview"), count: projects?.length ?? null },
              ]}
            />
          </Box>

          {tab === "overview" ? (
            <Overview projects={projects ?? []} onOpen={(id) => {
              selectProject(id);
              setTab("gantt");
            }} />
          ) : (
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 300px" }, alignItems: "start" }}>
              <Box sx={{ ...cardSx, minWidth: 0, overflow: "hidden" }}>
                {stages.isLoading ? (
                  <Box sx={{ p: 2 }}>
                    <Skeleton variant="rounded" height={320} />
                  </Box>
                ) : tab === "gantt" ? (
                  <Gantt stages={list} onOpen={openStage} />
                ) : (
                  <StagesGrid rows={list} onOpen={(row) => openStage(row.id)} />
                )}
              </Box>
              <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
                <Risks stages={list} onOpen={openStage} />
                <Milestones stages={list} onOpen={openStage} />
              </Box>
            </Box>
          )}
        </>
      )}

      <StageDrawer id={stageId} preview={list.find((st) => st.id === stageId) ?? null} canManage={canManage} onClose={() => openStage(null)} />
      <NewStageDrawer open={newStage} projectId={projectId} projectName={projectName} onClose={() => setNewStage(false)} />
    </>
  );
}

const ROW = 40;
const LABEL_W = 260;

function Gantt({ stages, onOpen }: { stages: Stage[]; onOpen: (id: number) => void }) {
  const { t } = useT("construction");
  const theme = useTheme();
  const groups = useStageGroups().data ?? [];
  const range = ganttRange(stages);
  const scroller = React.useRef<HTMLDivElement>(null);
  const today = dayjs().format("YYYY-MM-DD");
  const todayPos = range && today >= range.from && today <= range.to ? ganttBar(range, today, today).left : null;
  // График длиннее экрана (стройка — годы): при открытии показываем «сегодня», а не начало котлована.
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || todayPos == null) return;
    const timeline = el.scrollWidth - LABEL_W;
    const visible = el.clientWidth - LABEL_W;
    el.scrollLeft = Math.max(0, todayPos * timeline - visible * 0.65);
  }, [todayPos, range?.from, range?.to]);
  if (!range) return <EmptyNote text={t("common.empty")} />;
  const months = ganttMonths(range);
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  // Колонка месяца узкая: у января вместо названия — год, остальные месяцы — без года.
  const monthLabel = (month: string) => (month.endsWith("-01") ? month.slice(0, 4) : monthShort(month).split(" ")[0]);
  const usedGroups = groups.filter((g) => stages.some((s) => s.group === g.code));

  return (
    <Box>
      <Box ref={scroller} sx={{ overflowX: "auto" }}>
        <Box sx={{ minWidth: LABEL_W + Math.max(560, months.length * 40) }}>
          <Box sx={{ display: "flex", height: 32, borderBottom: 1, borderColor: "divider" }}>
            <Box sx={{ width: LABEL_W, flexShrink: 0, px: 2, display: "flex", alignItems: "center", fontSize: "0.72rem", fontWeight: 700, color: "text.secondary", position: "sticky", left: 0, bgcolor: "background.paper", zIndex: 2, borderRight: 1, borderColor: "divider" }}>
              {t("schedule.gantt.stage")}
            </Box>
            <Box sx={{ position: "relative", flex: 1 }}>
              {months.map((m, i) => (
                <Box key={m.month} sx={{ position: "absolute", top: 0, bottom: 0, left: pct(m.left), width: pct(m.width), borderLeft: i ? 1 : 0, borderColor: "divider", px: 0.5, display: "flex", alignItems: "center", overflow: "hidden" }}>
                  <Typography noWrap sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                    {monthLabel(m.month)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
          {stages.map((s) => {
            const color = groupColor(theme, s.group);
            const plan = ganttBar(range, s.start, s.end);
            const forecast = s.status !== "done" && s.forecastEnd && s.forecastEnd > s.end ? ganttBar(range, s.end, s.forecastEnd) : null;
            return (
              <ButtonBase
                key={s.id}
                onClick={() => onOpen(s.id)}
                sx={{ display: "flex", width: "100%", height: ROW, textAlign: "left", borderBottom: 1, borderColor: "divider", "&:hover": { bgcolor: "action.hover" } }}
              >
                <Box sx={{ width: LABEL_W, flexShrink: 0, px: 2, minWidth: 0, position: "sticky", left: 0, bgcolor: "background.paper", zIndex: 1, borderRight: 1, borderColor: "divider", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                    {s.name}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
                    {s.contractorName ?? t("common.ownForces")}
                  </Typography>
                </Box>
                <Box sx={{ position: "relative", flex: 1, height: "100%" }}>
                  {months.map((m, i) => i > 0 && <Box key={m.month} sx={{ position: "absolute", top: 0, bottom: 0, left: pct(m.left), borderLeft: 1, borderColor: "divider", opacity: 0.6 }} />)}
                  <Tooltip
                    title={`${fullDate(s.start)} – ${fullDate(s.end)} · ${s.progress}%${forecast ? ` · ${t("schedule.gantt.forecast", { date: fullDate(s.forecastEnd) })}` : ""}`}
                  >
                    <Box
                      sx={{
                        position: "absolute",
                        top: 12,
                        height: 16,
                        left: pct(plan.left),
                        width: pct(plan.width),
                        borderRadius: "5px",
                        bgcolor: alpha(color, 0.22),
                        overflow: "hidden",
                        outline: s.status === "late" ? `1.5px solid ${theme.palette.error.main}` : "none",
                      }}
                    >
                      <Box sx={{ width: `${s.progress}%`, height: "100%", bgcolor: color }} />
                    </Box>
                  </Tooltip>
                  {forecast && (
                    <Box
                      sx={{
                        position: "absolute",
                        top: 18,
                        height: 4,
                        left: pct(forecast.left),
                        width: pct(forecast.width),
                        borderTop: `2px dashed ${theme.palette.error.main}`,
                      }}
                    />
                  )}
                </Box>
              </ButtonBase>
            );
          })}
          {todayPos != null && (
            <Box sx={{ position: "relative", height: 0 }}>
              <Box sx={{ position: "absolute", left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${todayPos})`, bottom: 0, height: stages.length * ROW + 32, borderLeft: `2px solid ${theme.palette.error.main}`, pointerEvents: "none", zIndex: 3 }}>
                <Typography sx={{ position: "absolute", top: 0, left: 4, fontSize: "0.65rem", fontWeight: 700, color: "error.main", whiteSpace: "nowrap" }}>{t("schedule.gantt.today")}</Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      {usedGroups.length > 0 && (
        <Box sx={{ px: 2, py: 1.25, display: "flex", flexWrap: "wrap", gap: 1.5, borderTop: 1, borderColor: "divider" }}>
          {usedGroups.map((g) => (
            <Box key={g.code} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "3px", bgcolor: groupColor(theme, g.code) }} />
              <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{g.label}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function StagesGrid({ rows, onOpen }: { rows: Stage[]; onOpen: (row: Stage) => void }) {
  const { t } = useT("construction");
  const theme = useTheme();
  const columns: GridColDef<Stage>[] = [
    { field: "order", headerName: t("schedule.table.order"), width: 56 },
    { field: "name", headerName: t("schedule.table.stage"), flex: 1.4, minWidth: 220, renderCell: ({ row }) => <TwoLines strong top={row.name} bottom={row.groupLabel} /> },
    { field: "contractorName", headerName: t("schedule.table.contractor"), flex: 1, minWidth: 170, renderCell: ({ row }) => <TwoLines top={row.contractorName ?? t("common.ownForces")} bottom={row.responsible || null} /> },
    { field: "start", headerName: t("schedule.table.dates"), width: 160, renderCell: ({ row }) => <TwoLines top={`${shortDate(row.start)} – ${shortDate(row.end)}`} bottom={row.forecastEnd && row.forecastEnd > row.end && row.status !== "done" ? t("schedule.gantt.forecast", { date: shortDate(row.forecastEnd) }) : null} /> },
    {
      field: "progress",
      headerName: t("schedule.table.progress"),
      width: 150,
      renderCell: ({ row }) => (
        <Box sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <ProgressBar value={row.progress} color={groupColor(theme, row.group)} />
          </Box>
          <Typography sx={{ width: 36, fontSize: "0.8125rem", textAlign: "right" }}>{row.progress}%</Typography>
        </Box>
      ),
    },
    { field: "status", headerName: t("schedule.table.status"), width: 140, renderCell: ({ row }) => <StatusPill label={row.statusLabel || t(`schedule.status.${row.status}`, { defaultValue: row.status })} tone={stageTone(row.status)} /> },
    {
      field: "delayDays",
      headerName: t("schedule.table.delay"),
      width: 110,
      renderCell: ({ row }) => (
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: row.delayDays > 0 ? 700 : 400, color: row.delayDays > 10 ? "error.main" : row.delayDays > 0 ? "warning.main" : "text.secondary" }}>
          {row.delayDays > 0 ? t("common.daysShort", { count: row.delayDays }) : "—"}
        </Typography>
      ),
    },
  ];
  return (
    <DataGrid<Stage>
      rows={rows}
      columns={columns}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
      getRowHeight={() => "auto"}
      onRowClick={({ row }) => onOpen(row)}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      hideFooter
      sx={{ border: 0, "& .MuiDataGrid-row": { cursor: "pointer" }, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
    />
  );
}

function Risks({ stages, onOpen }: { stages: Stage[]; onOpen: (id: number) => void }) {
  const { t } = useT("construction");
  const late = stages.filter((s) => s.delayDays > 0 && s.status !== "done").sort((a, b) => b.delayDays - a.delayDays).slice(0, 6);
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("schedule.risks.title")} />
      <Box sx={{ px: 2.25, pb: 1.5 }}>
        {late.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("schedule.risks.none")}</Typography>}
        {late.map((s) => (
          <ButtonBase key={s.id} onClick={() => onOpen(s.id)} sx={{ width: "100%", py: 0.9, display: "block", textAlign: "left", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
            <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
              {s.name}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.72rem", color: s.delayDays > 10 ? "error.main" : "warning.main" }}>
              {t("schedule.risks.line", { days: t("common.daysShort", { count: s.delayDays }), progress: s.progress })} · {s.contractorName ?? t("common.ownForces")}
            </Typography>
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}

function Milestones({ stages, onOpen }: { stages: Stage[]; onOpen: (id: number) => void }) {
  const { t } = useT("construction");
  const next = upcomingMilestones(stages);
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("schedule.milestones.title")} />
      <Box sx={{ px: 2.25, pb: 1.5 }}>
        {next.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("schedule.milestones.none")}</Typography>}
        {next.map((s) => (
          <ButtonBase key={s.id} onClick={() => onOpen(s.id)} sx={{ width: "100%", py: 0.9, display: "flex", alignItems: "baseline", gap: 1, textAlign: "left", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }}>
              {s.name}
            </Typography>
            <Typography sx={{ fontSize: "0.72rem", color: s.end < dayjs().format("YYYY-MM-DD") ? "error.main" : "text.secondary", whiteSpace: "nowrap" }}>{t("schedule.milestones.until", { date: shortDate(s.end) })}</Typography>
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}

function Overview({ projects, onOpen }: { projects: ScheduleSummary[]; onOpen: (projectId: number) => void }) {
  const { t } = useT("construction");
  const theme = useTheme();
  const statusColor = (status: string) => {
    const tone = stageTone(status);
    return tone ? theme.palette[tone].main : theme.palette.divider;
  };
  return (
    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" } }}>
      {projects.map((p) => (
        <Box key={p.projectId} sx={{ ...cardSx, p: 2.25, minWidth: 0, display: "grid", gap: 1.25 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 700 }}>
              {p.projectName}
            </Typography>
            <Typography sx={{ fontSize: "1.4rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{p.readinessPct}%</Typography>
          </Box>
          <Box>
            <ProgressBar value={p.readinessPct} height={8} />
            <Typography sx={{ mt: 0.5, fontSize: "0.72rem", color: "text.secondary" }}>{t("schedule.overview.elapsed", { pct: p.timeElapsedPct })}</Typography>
          </Box>
          <Box sx={{ display: "flex", gap: "2px", height: 8 }} aria-hidden>
            {p.statuses.map((status, i) => (
              <Box key={i} sx={{ flex: 1, borderRadius: "2px", bgcolor: statusColor(status) }} />
            ))}
          </Box>
          <Box sx={{ display: "grid", gap: 0.5 }}>
            {[
              [t("schedule.overview.foreman"), p.foreman || "—"],
              [t("schedule.overview.active"), p.activeStageName || "—"],
              [t("schedule.overview.next"), p.nextStageName || "—"],
              [t("schedule.overview.handover"), fullDate(p.projectEnd)],
            ].map(([label, value]) => (
              <Box key={label} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                <Typography sx={{ width: 120, flexShrink: 0, fontSize: "0.75rem", color: "text.secondary" }}>{label}</Typography>
                <Typography noWrap sx={{ fontSize: "0.8125rem", minWidth: 0 }}>
                  {value}
                </Typography>
              </Box>
            ))}
            {p.maxDelayDays > 0 && (
              <Box sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                <Typography sx={{ width: 120, flexShrink: 0, fontSize: "0.75rem", color: "text.secondary" }}>{t("schedule.overview.delay")}</Typography>
                <Typography sx={{ fontSize: "0.8125rem", color: "error.main", fontWeight: 600 }}>
                  {t("common.daysShort", { count: p.maxDelayDays })} · {t("schedule.kpi.delayHint", { count: p.delayedStages })}
                </Typography>
              </Box>
            )}
          </Box>
          <Box>
            <Button size="small" onClick={() => onOpen(p.projectId)}>
              {t("schedule.overview.open")} →
            </Button>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
