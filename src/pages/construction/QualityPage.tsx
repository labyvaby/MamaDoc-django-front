import React from "react";
import { Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Skeleton, TextField, Typography, alpha, useTheme } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import AddOutlined from "@mui/icons-material/AddOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";

import {
  DEFECT_FILTERS,
  DEFECT_SEVERITIES,
  constructionKeys,
  defectMap,
  getDefects,
  getDefectsSummary,
  getInspections,
  worstSeverity,
  type Defect,
  type DefectFilter,
  type Inspection,
} from "../../api/construction";
import { getCatalogProject, realtyCatalogKeys } from "../../api/realtyCatalog";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { cardSx } from "../estate-dashboard/format";
import { EmptyNote, PillTabs, SubPill, TwoLines } from "../realty-finance/shared";
import { subtleBg } from "../../theme/uiHelpers";
import { CardHeader, KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { DefectFormDrawer, type DefectPreset } from "./ConstructionForms";
import { defectTone, fullDate, inspectionTone, severityTone } from "./format";
import { useConstructionProjects } from "./hooks";
import { DefectDrawer, InspectionDrawer } from "./QualityForms";
import { StatusPill } from "./shared";

type Tab = "defects" | "inspections" | "map";
const TABS: Tab[] = ["defects", "inspections", "map"];

/**
 * «Стройконтроль» застройщика (AIVIO, гайд `frontend-construction.md` §5):
 * KPI и разрезы — `/defects/summary/`, дефекты по чипам «Открытые / На
 * проверке / Закрытые / Все», журнал проверок, карта дефектов по этажам ЖК.
 * Карточка — `?defect=`. Кнопки — `construction.manage`.
 */
export default function QualityPage() {
  const { t } = useT("construction");
  usePageTitle(t("quality.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <QualityScreen />
    </Box>
  );
}

const matches = (d: Defect, search: string) => {
  const q = search.trim().toLocaleLowerCase("ru");
  return !q || [d.number, d.title, d.category, d.contractorName, d.prescription].some((f) => f.toLocaleLowerCase("ru").includes(q));
};

function QualityScreen() {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const canManage = useCan("construction.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const [defectId, openDefect] = useIdParam("defect");
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "defects";
  const [filter, setFilter] = React.useState<DefectFilter>("open");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [severity, setSeverity] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [defectPreset, setDefectPreset] = React.useState<DefectPreset | null>(null);
  const [inspectionOpen, setInspectionOpen] = React.useState(false);
  const enabled = scope.orgReady !== false;
  const project = projectId === "" ? null : projectId;

  const summary = useQuery({
    queryKey: constructionKeys.defectsSummary(scope, project),
    queryFn: ({ signal }) => getDefectsSummary(project, scope, signal),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const params = { filter, projectId: project, severity: severity || null };
  const defects = useQuery({
    queryKey: constructionKeys.defects(scope, params),
    queryFn: ({ signal }) => getDefects(params, scope, signal),
    enabled: enabled && tab === "defects",
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const inspections = useQuery({ queryKey: constructionKeys.inspections(scope), queryFn: ({ signal }) => getInspections(scope, signal), enabled: enabled && tab === "inspections", staleTime: 30_000 });
  const projects = useConstructionProjects().data ?? [];

  const setTab = (next: Tab) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "defects") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );

  if (summary.error) return <ScreenError error={summary.error} title={t("quality.loadError")} onRetry={() => void summary.refetch()} />;

  const s = summary.data;
  const rows = (defects.data ?? []).filter((d) => matches(d, search));
  const filterCount: Record<DefectFilter, number | null> = s
    ? { open: s.openCount, verify: s.verifyCount, closed: s.closedCount, all: s.totalCount }
    : { open: null, verify: null, closed: null, all: null };
  const inspectionRows = (inspections.data ?? []).filter((i) => project == null || i.projectId === project);

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>{t("quality.subtitle")}</Typography>
        {canManage && (
          <>
            <Button size="small" variant="outlined" startIcon={<FactCheckOutlined />} onClick={() => setInspectionOpen(true)} sx={{ whiteSpace: "nowrap" }}>
              {t("quality.newInspection")}
            </Button>
            <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setDefectPreset({ projectId: project, contractorId: null, stageId: null, inspectionId: null })} sx={{ whiteSpace: "nowrap" }}>
              {t("quality.newDefect")}
            </Button>
          </>
        )}
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "open", label: t("quality.kpi.open"), value: String(s.openCount), hint: s.verifyCount ? t("quality.kpi.openHint", { count: s.verifyCount }) : null },
                { key: "critical", label: t("quality.kpi.critical"), value: String(s.criticalCount), tone: s.criticalCount > 0 ? "error" : null },
                { key: "overdue", label: t("quality.kpi.overdue"), value: String(s.overdueCount), tone: s.overdueCount > 0 ? "warning" : null },
                { key: "closed", label: t("quality.kpi.closed"), value: String(s.closed30DCount), hint: t("quality.kpi.closedHint", { count: s.inspections30DCount }), tone: s.closed30DCount > 0 ? "success" : null },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <PillTabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "defects", label: t("quality.tabs.defects"), count: s?.totalCount ?? null },
            { key: "inspections", label: t("quality.tabs.inspections"), count: s?.inspectionsCount ?? null },
            { key: "map", label: t("quality.tabs.map") },
          ]}
        />
        <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
          <TextField
            select
            size="small"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value === "" ? "" : Number(e.target.value))}
            SelectProps={{ displayEmpty: true }}
            sx={{ minWidth: 180, "& .MuiInputBase-root": { height: 32, fontSize: "0.875rem" } }}
            inputProps={{ "aria-label": t("common.project") }}
          >
            <MenuItem value="">{t("common.allProjects")}</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.projectId} value={p.projectId}>
                {p.projectName}
              </MenuItem>
            ))}
          </TextField>
          {tab === "defects" && (
            <>
              <TextField
                select
                size="small"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                SelectProps={{ displayEmpty: true }}
                sx={{ minWidth: 170, "& .MuiInputBase-root": { height: 32, fontSize: "0.875rem" } }}
                inputProps={{ "aria-label": t("defect.severity") }}
              >
                <MenuItem value="">{t("quality.anySeverity")}</MenuItem>
                {DEFECT_SEVERITIES.map((sv) => (
                  <MenuItem key={sv} value={sv}>
                    {t(`defect.severity_${sv}`)}
                  </MenuItem>
                ))}
              </TextField>
              <SearchBox value={search} onChange={setSearch} placeholder={t("quality.search")} />
            </>
          )}
        </Box>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 300px" }, alignItems: "start" }}>
        <Box sx={{ minWidth: 0 }}>
          {tab === "defects" && (
            <>
              <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {DEFECT_FILTERS.map((key) => (
                  <SubPill key={key} active={filter === key} onClick={() => setFilter(key)} label={`${t(`quality.filter.${key}`)}${filterCount[key] != null && project == null && !severity ? ` · ${filterCount[key]}` : ""}`} />
                ))}
              </Box>
              <Box sx={{ ...cardSx, overflow: "hidden" }}>
                {defects.error ? (
                  <Box sx={{ p: 2 }}>
                    <ScreenError error={defects.error} onRetry={() => void defects.refetch()} />
                  </Box>
                ) : (
                  <DefectsGrid rows={rows} loading={defects.isFetching} empty={search.trim() || severity || project != null ? t("common.emptyFiltered") : t("common.empty")} onOpen={(row) => openDefect(row.id)} />
                )}
              </Box>
            </>
          )}
          {tab === "inspections" && (
            <Box sx={{ ...cardSx, overflow: "hidden" }}>
              {inspections.error ? (
                <Box sx={{ p: 2 }}>
                  <ScreenError error={inspections.error} onRetry={() => void inspections.refetch()} />
                </Box>
              ) : (
                <InspectionsGrid rows={inspectionRows} loading={inspections.isFetching} />
              )}
            </Box>
          )}
          {tab === "map" && <DefectMap projectId={project} onOpen={openDefect} />}
        </Box>

        <Box sx={{ display: "grid", gap: 2, minWidth: 0, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "minmax(0, 1fr)" } }}>
          {tab === "inspections" ? (
            <Box sx={{ ...cardSx, minWidth: 0 }}>
              <CardHeader title={t("quality.results")} subtitle={t("quality.resultsHint")} />
              <Box sx={{ px: 2.25, pb: 1.5 }}>
                {s &&
                  (
                    [
                      ["ok", s.inspectionsOk],
                      ["warn", s.inspectionsWarn],
                      ["fail", s.inspectionsFail],
                    ] as const
                  ).map(([key, value]) => (
                    <Box key={key} sx={{ py: 0.9, display: "flex", alignItems: "baseline", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                      <Box sx={{ flex: 1 }}>
                        <StatusPill label={t(`quality.result_${key}`)} tone={inspectionTone(key)} />
                      </Box>
                      <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
                    </Box>
                  ))}
              </Box>
            </Box>
          ) : (
            <>
              <Box sx={{ ...cardSx, minWidth: 0 }}>
                <CardHeader title={t("quality.byContractor")} />
                <CountBars items={s?.byContractor ?? []} tone="warning" />
              </Box>
              <Box sx={{ ...cardSx, minWidth: 0 }}>
                <CardHeader title={t("quality.byCategory")} />
                <CountBars items={s?.byCategory ?? []} tone="info" />
              </Box>
            </>
          )}
        </Box>
      </Box>

      <DefectDrawer id={defectId} preview={rows.find((d) => d.id === defectId) ?? null} canManage={canManage} onClose={() => openDefect(null)} />
      <DefectFormDrawer preset={defectPreset} onClose={() => setDefectPreset(null)} onCreated={(d) => openDefect(d.id)} />
      <InspectionDrawer
        open={inspectionOpen}
        projectId={project}
        onClose={() => setInspectionOpen(false)}
        onCreated={(inspection) => {
          if (inspection.result !== "ok") setDefectPreset({ projectId: inspection.projectId, contractorId: null, stageId: null, inspectionId: inspection.id });
        }}
      />
    </>
  );
}

/** Полосы-счётчики «По подрядчикам / По категориям» (в штуках, не в деньгах). */
function CountBars({ items, tone }: { items: { name: string; count: number }[]; tone: "warning" | "info" }) {
  const { t } = useT("construction");
  const max = Math.max(0, ...items.map((i) => i.count));
  if (items.length === 0 || max === 0) return <Typography sx={{ px: 2.25, pb: 2, fontSize: "0.8125rem", color: "text.secondary" }}>{t("quality.map.empty")}</Typography>;
  return (
    <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1 }}>
      {items.map((item) => (
        <Box key={item.name} sx={{ minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }}>
              {item.name || "—"}
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{item.count}</Typography>
          </Box>
          <Box sx={(th) => ({ mt: 0.4, height: 5, borderRadius: 3, bgcolor: subtleBg(th, true), overflow: "hidden" })}>
            <Box sx={{ width: `${(item.count / max) * 100}%`, height: "100%", borderRadius: 3, bgcolor: `${tone}.main` }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function DefectsGrid({ rows, loading, empty, onOpen }: { rows: Defect[]; loading: boolean; empty: string; onOpen: (row: Defect) => void }) {
  const { t } = useT("construction");
  const columns: GridColDef<Defect>[] = [
    { field: "title", headerName: t("quality.table.defect"), flex: 1.5, minWidth: 230, renderCell: ({ row }) => <TwoLines strong top={row.title} bottom={[row.number, row.category].filter(Boolean).join(" · ")} /> },
    {
      field: "section",
      headerName: t("quality.table.place"),
      flex: 1,
      minWidth: 170,
      renderCell: ({ row }) => <TwoLines top={row.projectName || "—"} bottom={row.section || row.floor != null ? t("quality.table.placeValue", { section: row.section || "—", floor: row.floor ?? "—" }) : null} />,
    },
    { field: "contractorName", headerName: t("quality.table.contractor"), flex: 1, minWidth: 160, renderCell: ({ row }) => <TwoLines top={row.contractorName || t("common.ownForces")} /> },
    {
      field: "deadline",
      headerName: t("quality.table.deadline"),
      width: 130,
      renderCell: ({ row }) => (
        <TwoLines
          top={fullDate(row.deadline)}
          bottom={
            row.isOverdue && row.status !== "closed" ? (
              <Box component="span" sx={{ color: "error.main", fontWeight: 600 }}>
                {t("quality.table.overdue")}
              </Box>
            ) : null
          }
        />
      ),
    },
    { field: "severity", headerName: t("quality.table.severity"), width: 150, renderCell: ({ row }) => <StatusPill label={row.severityLabel || row.severity} tone={severityTone(row.severity)} /> },
    { field: "status", headerName: t("quality.table.status"), width: 140, renderCell: ({ row }) => <StatusPill label={row.statusLabel || row.status} tone={defectTone(row.status)} /> },
  ];
  return (
    <DataGrid<Defect>
      rows={rows}
      columns={columns}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: empty }}
      getRowHeight={() => "auto"}
      onRowClick={({ row }) => onOpen(row)}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
      pageSizeOptions={[25, 50, 100]}
      sx={{ border: 0, "& .MuiDataGrid-row": { cursor: "pointer" }, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
    />
  );
}

function InspectionsGrid({ rows, loading }: { rows: Inspection[]; loading: boolean }) {
  const { t } = useT("construction");
  const columns: GridColDef<Inspection>[] = [
    { field: "date", headerName: t("quality.inspections.date"), width: 120, renderCell: ({ row }) => <TwoLines top={fullDate(row.date)} bottom={row.number} /> },
    { field: "type", headerName: t("quality.inspections.type"), flex: 1.4, minWidth: 220, renderCell: ({ row }) => <TwoLines strong top={row.type} bottom={row.note || null} /> },
    { field: "projectName", headerName: t("quality.inspections.project"), width: 170, renderCell: ({ row }) => <TwoLines top={row.projectName || "—"} /> },
    { field: "inspector", headerName: t("quality.inspections.inspector"), width: 170, renderCell: ({ row }) => <TwoLines top={row.inspector || "—"} /> },
    { field: "result", headerName: t("quality.inspections.result"), width: 160, renderCell: ({ row }) => <StatusPill label={row.resultLabel || t(`quality.result_${row.result}`, { defaultValue: row.result })} tone={inspectionTone(row.result)} /> },
    { field: "defectsFound", headerName: t("quality.inspections.defects"), width: 100, align: "right", headerAlign: "right" },
  ];
  return (
    <DataGrid<Inspection>
      rows={rows}
      columns={columns}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
      getRowHeight={() => "auto"}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      hideFooter
      sx={{ border: 0, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
    />
  );
}

/** Карта открытых дефектов ЖК: этажи × секции, цвет — худшая критичность в ячейке. */
function DefectMap({ projectId, onOpen }: { projectId: number | null; onOpen: (id: number) => void }) {
  const { t } = useT("construction");
  const theme = useTheme();
  const scope = useRealtyScope();
  const [cell, setCell] = React.useState<{ floor: number; section: string; defects: Defect[] } | null>(null);
  const enabled = projectId != null && scope.orgReady !== false;
  const project = useQuery({ queryKey: realtyCatalogKeys.project(scope, projectId ?? 0), queryFn: ({ signal }) => getCatalogProject(projectId as number, scope, signal), enabled, staleTime: 5 * 60_000 });
  const params = { filter: "open" as const, projectId };
  const defects = useQuery({ queryKey: constructionKeys.defects(scope, params), queryFn: ({ signal }) => getDefects(params, scope, signal), enabled, staleTime: 30_000 });

  if (projectId == null) {
    return (
      <Box sx={cardSx}>
        <EmptyNote text={t("quality.map.pick")} />
      </Box>
    );
  }
  if (project.error || defects.error) return <ScreenError error={project.error ?? defects.error} onRetry={() => {
    void project.refetch();
    void defects.refetch();
  }} />;
  if (!project.data || !defects.data) return <Skeleton variant="rounded" height={320} sx={{ borderRadius: "14px" }} />;
  if (project.data.sections.length === 0) {
    return (
      <Box sx={cardSx}>
        <EmptyNote text={t("quality.map.noSections")} />
      </Box>
    );
  }
  const map = defectMap(defects.data, project.data.sections);
  const color = (severity: string | null) => (severity === "critical" ? theme.palette.error.main : severity === "major" ? theme.palette.warning.main : theme.palette.info.main);
  return (
    <Box sx={{ ...cardSx, overflow: "hidden" }}>
      <Box sx={{ overflowX: "auto", p: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: `56px repeat(${map.sections.length}, minmax(72px, 1fr))`, gap: 0.5, minWidth: 56 + map.sections.length * 76 }}>
          <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", fontWeight: 700 }}>{t("quality.map.floor")}</Typography>
          {map.sections.map((name) => (
            <Typography key={name} sx={{ fontSize: "0.72rem", color: "text.secondary", fontWeight: 700, textAlign: "center" }}>
              {t("quality.map.section", { name })}
            </Typography>
          ))}
          {map.floors.map((floor) => (
            <React.Fragment key={floor}>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", display: "flex", alignItems: "center" }}>{floor}</Typography>
              {map.sections.map((section) => {
                const list = map.cells.get(`${floor}|${section}`) ?? [];
                const worst = worstSeverity(list);
                return (
                  <ButtonBase
                    key={section}
                    disabled={list.length === 0}
                    onClick={() => (list.length === 1 ? onOpen(list[0].id) : setCell({ floor, section, defects: list }))}
                    title={list.map((d) => `${d.number} · ${d.title}`).join("\n")}
                    sx={{
                      height: 26,
                      borderRadius: "6px",
                      border: 1,
                      borderColor: list.length ? color(worst) : "divider",
                      bgcolor: list.length ? alpha(color(worst), 0.16) : "transparent",
                      color: list.length ? color(worst) : "text.disabled",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    {list.length || ""}
                  </ButtonBase>
                );
              })}
            </React.Fragment>
          ))}
        </Box>
      </Box>
      {(map.outside.length > 0 || defects.data.length === 0) && (
        <Box sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: "divider", display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
          {defects.data.length === 0 ? (
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("quality.map.empty")}</Typography>
          ) : (
            <>
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("quality.map.outside", { count: map.outside.length })}:</Typography>
              {map.outside.map((d) => (
                <Button key={d.id} size="small" onClick={() => onOpen(d.id)}>
                  {d.number}
                </Button>
              ))}
            </>
          )}
        </Box>
      )}
      <Dialog open={cell != null} onClose={() => setCell(null)} fullWidth PaperProps={{ sx: { maxWidth: 460 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{cell ? t("quality.map.cellTitle", { floor: cell.floor, section: cell.section }) : ""}</DialogTitle>
        <DialogContent>
          {cell?.defects.map((d) => (
            <ButtonBase
              key={d.id}
              onClick={() => {
                setCell(null);
                onOpen(d.id);
              }}
              sx={{ width: "100%", py: 1, display: "flex", alignItems: "baseline", gap: 1, textAlign: "left", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}
            >
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.875rem" }}>
                {d.number} · {d.title}
              </Typography>
              <StatusPill label={d.severityLabel} tone={severityTone(d.severity)} />
            </ButtonBase>
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCell(null)}>{t("common.close")}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

