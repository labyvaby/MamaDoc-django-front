import React from "react";
import { Box, Button, ButtonBase, MenuItem, Rating, Skeleton, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import AddOutlined from "@mui/icons-material/AddOutlined";

import { constructionKeys, getActs, getActsSummary, getContractors, getContracts, type Act, type ConstructionContract, type Contractor } from "../../api/construction";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { cardSx } from "../estate-dashboard/format";
import { EmptyNote, PillTabs, SubPill, TwoLines } from "../realty-finance/shared";
import { KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { ActFormDrawer, type ActPreset } from "./ConstructionForms";
import { ActDrawer, ContractorDrawer } from "./ContractorDrawers";
import { actTone, compactSum, fullDate, shortDate } from "./format";
import { useConstructionProjects } from "./hooks";
import { StatusPill } from "./shared";

type Tab = "contractors" | "contracts" | "acts";
const TABS: Tab[] = ["contractors", "contracts", "acts"];

const matches = (fields: (string | null | undefined)[], search: string) => {
  const q = search.trim().toLocaleLowerCase("ru");
  return !q || fields.some((f) => (f ?? "").toLocaleLowerCase("ru").includes(q));
};

/**
 * «Подрядчики и акты» застройщика (AIVIO, гайд `frontend-construction.md` §4):
 * KPI и счётчики — `/acts/summary/`, реестр подрядчиков, договоры подряда,
 * акты со срезом по статусу и ЖК на клиенте. Вкладка — `?tab=`, карточки —
 * `?contractor=` и `?act=`. Кнопки — `construction.manage`.
 */
export default function ContractorsPage() {
  const { t } = useT("construction");
  usePageTitle(t("contractors.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <ContractorsScreen />
    </Box>
  );
}

function ContractorsScreen() {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const canManage = useCan("construction.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const [contractorId, openContractor] = useIdParam("contractor");
  const [actId, openAct] = useIdParam("act");
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : actId ? "acts" : "contractors";
  const [search, setSearch] = React.useState("");
  const [actStatus, setActStatus] = React.useState<string>("all");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [actPreset, setActPreset] = React.useState<ActPreset | null>(null);
  const enabled = scope.orgReady !== false;

  const summary = useQuery({ queryKey: constructionKeys.actsSummary(scope), queryFn: ({ signal }) => getActsSummary(scope, signal), enabled, staleTime: 30_000 });
  const contractors = useQuery({
    queryKey: constructionKeys.contractors(scope),
    queryFn: ({ signal }) => getContractors(scope, signal),
    enabled,
    staleTime: 30_000,
  });
  const contracts = useQuery({ queryKey: constructionKeys.contracts(scope), queryFn: ({ signal }) => getContracts(scope, signal), enabled: enabled && tab === "contracts", staleTime: 30_000 });
  const acts = useQuery({ queryKey: constructionKeys.acts(scope), queryFn: ({ signal }) => getActs(scope, signal), enabled, staleTime: 30_000 });
  const projects = useConstructionProjects().data ?? [];

  const setTab = (next: Tab) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "contractors") params.delete("tab");
        else params.set("tab", next);
        return params;
      },
      { replace: true },
    );

  const error = summary.error ?? contractors.error ?? acts.error ?? contracts.error;
  if (error) {
    return (
      <ScreenError
        error={error}
        title={t("contractors.loadError")}
        onRetry={() => {
          void summary.refetch();
          void contractors.refetch();
          void acts.refetch();
          void contracts.refetch();
        }}
      />
    );
  }

  const s = summary.data;
  const allActs = acts.data ?? [];
  const byProject = (row: { projectId: number | null }) => projectId === "" || row.projectId === projectId;
  const actRows = allActs.filter((a) => (actStatus === "all" || a.status === actStatus) && byProject(a) && matches([a.number, a.contractorName, a.subject, a.projectName], search));
  const contractorRows = (contractors.data ?? []).filter((c) => matches([c.name, c.inn, c.spec, c.contact], search));
  const contractRows = (contracts.data ?? []).filter((c) => byProject(c) && matches([c.number, c.contractorName, c.subject, c.projectName], search));

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("contractors.subtitle")}</Typography>
      <KpiCards
        items={
          s
            ? [
                { key: "contractors", label: t("contractors.kpi.contractors"), value: String(s.contractorsCount), hint: t("contractors.kpi.contractorsHint", { count: s.contractorsWithActive }) },
                { key: "portfolio", label: t("contractors.kpi.portfolio"), value: compactSum(s.portfolioAmount, t) },
                { key: "check", label: t("contractors.kpi.check"), value: String(s.checkCount), hint: s.checkCount ? t("contractors.kpi.checkHint", { amount: compactSum(s.checkAmount, t) }) : null, tone: s.checkCount > 0 ? "warning" : null },
                { key: "toPay", label: t("contractors.kpi.toPay"), value: compactSum(s.toPayAmount, t), hint: t("contractors.kpi.toPayHint", { count: s.acceptedCount }) },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <PillTabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "contractors", label: t("contractors.tabs.contractors"), count: s?.contractorsCount ?? null },
            { key: "contracts", label: t("contractors.tabs.contracts"), count: s?.contractsCount ?? null },
            { key: "acts", label: t("contractors.tabs.acts"), count: s?.actsCount ?? null },
          ]}
        />
        <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
          {tab !== "contractors" && (
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
          )}
          <SearchBox value={search} onChange={setSearch} placeholder={tab === "acts" ? t("contractors.searchActs") : t("contractors.search")} />
          {canManage && (
            <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setActPreset({ contractorId: null, projectId: projectId === "" ? null : projectId, subject: "" })} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
              {t("contractors.newAct")}
            </Button>
          )}
        </Box>
      </Box>

      {tab === "contractors" &&
        (contractors.data ? (
          contractorRows.length === 0 ? (
            <Box sx={cardSx}>
              <EmptyNote text={search.trim() ? t("common.emptyFiltered") : t("common.empty")} />
            </Box>
          ) : (
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" } }}>
              {contractorRows.map((c) => (
                <ContractorCard key={c.id} contractor={c} onOpen={() => openContractor(c.id)} />
              ))}
            </Box>
          )
        ) : (
          <Skeleton variant="rounded" height={240} sx={{ borderRadius: "14px" }} />
        ))}

      {tab === "contracts" && (
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          <ContractsGrid
            rows={contractRows}
            loading={contracts.isFetching}
            empty={search.trim() || projectId !== "" ? t("common.emptyFiltered") : t("common.empty")}
            onOpen={(row) => (row.documentId != null ? navigate(`/edo?doc=${row.documentId}`) : row.contractorId != null && openContractor(row.contractorId))}
          />
        </Box>
      )}

      {tab === "acts" && (
        <>
          <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {(["all", "check", "accepted", "paid", "draft", "rejected"] as const).map((key) => {
              const count = key === "all" ? allActs.length : allActs.filter((a) => a.status === key).length;
              if (key === "rejected" && count === 0 && actStatus !== "rejected") return null;
              return <SubPill key={key} active={actStatus === key} onClick={() => setActStatus(key)} label={`${t(`contractors.acts.status_${key}`)} · ${count}`} />;
            })}
          </Box>
          <Box sx={{ ...cardSx, overflow: "hidden" }}>
            <ActsGrid rows={actRows} loading={acts.isFetching} empty={search.trim() || projectId !== "" || actStatus !== "all" ? t("common.emptyFiltered") : t("common.empty")} onOpen={(row) => openAct(row.id)} />
          </Box>
        </>
      )}

      <ContractorDrawer
        id={contractorId}
        preview={contractors.data?.find((c) => c.id === contractorId) ?? null}
        canManage={canManage}
        onClose={() => openContractor(null)}
        onOpenAct={(id) =>
          // Одним обновлением адреса: два setSearchParams подряд не батчатся.
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete("contractor");
              next.set("act", String(id));
              return next;
            },
            { replace: true },
          )
        }
      />
      <ActDrawer id={actId} preview={allActs.find((a) => a.id === actId) ?? null} canManage={canManage} onClose={() => openAct(null)} />
      <ActFormDrawer preset={actPreset} onClose={() => setActPreset(null)} onCreated={(act) => openAct(act.id)} />
    </>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "warning" | "error" | "success" | "default" }) {
  return (
    <Box
      component="span"
      sx={{
        px: 0.9,
        py: 0.25,
        borderRadius: "999px",
        fontSize: "0.72rem",
        fontWeight: 600,
        border: 1,
        borderColor: tone === "default" ? "divider" : `${tone}.main`,
        color: tone === "default" ? "text.secondary" : `${tone}.main`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Box>
  );
}

function ContractorCard({ contractor: c, onOpen }: { contractor: Contractor; onOpen: () => void }) {
  const { t } = useT("construction");
  return (
    <ButtonBase
      onClick={onOpen}
      sx={{ ...cardSx, p: 2, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", justifyContent: "stretch", alignItems: "stretch", gap: 1.25, textAlign: "left", alignContent: "start", minWidth: 0, opacity: c.isActive ? 1 : 0.6 }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700 }}>
            {c.name}
          </Typography>
          <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {[c.spec, c.since && t("contractors.card.since", { year: c.since })].filter(Boolean).join(" · ")}
          </Typography>
        </Box>
        {c.isBlocked && <StatusPill label={t("contractors.card.blocked")} tone="error" />}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Rating value={c.rating} precision={0.1} readOnly size="small" />
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{c.rating.toLocaleString("ru-RU")}</Typography>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
        {[
          [t("contractors.card.contracts"), t("contractors.card.contractsValue", { active: c.stats.activeCount, total: c.stats.contractsCount }), null],
          [t("contractors.card.amount"), compactSum(c.stats.totalAmount, t), null],
          [t("contractors.card.paid"), `${c.stats.paidPct}%`, null],
          [t("contractors.card.debt"), c.stats.debt > 0 ? compactSum(c.stats.debt, t) : "—", c.stats.debt > 0 ? "warning.main" : null],
        ].map(([label, value, color]) => (
          <Box key={label} sx={{ px: 1.25, py: 0.75, border: 1, borderColor: "divider", borderRadius: "10px", minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
              {label}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 700, color: color ?? "text.primary" }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        {c.stats.pendingActsCount > 0 && <Pill tone="warning">{t("contractors.card.pending", { count: c.stats.pendingActsCount })}</Pill>}
        {c.stats.lateStages > 0 && <Pill tone="error">{t("contractors.card.late")}</Pill>}
        {c.stats.openDefects > 0 ? <Pill tone="warning">{t("contractors.card.defects", { count: c.stats.openDefects })}</Pill> : <Pill tone="success">{t("contractors.card.noDefects")}</Pill>}
      </Box>
    </ButtonBase>
  );
}

function ContractsGrid({ rows, loading, empty, onOpen }: { rows: ConstructionContract[]; loading: boolean; empty: string; onOpen: (row: ConstructionContract) => void }) {
  const { t } = useT("construction");
  const columns: GridColDef<ConstructionContract>[] = [
    { field: "number", headerName: t("contractors.contracts.number"), width: 140, renderCell: ({ row }) => <TwoLines strong top={row.number} bottom={row.documentId != null ? t("contractors.contracts.openEdo") : null} /> },
    { field: "contractorName", headerName: t("contractors.contracts.contractor"), flex: 1, minWidth: 180, renderCell: ({ row }) => <TwoLines top={row.contractorName || "—"} bottom={row.projectName || null} /> },
    { field: "subject", headerName: t("contractors.contracts.subject"), flex: 1.2, minWidth: 200, renderCell: ({ row }) => <TwoLines top={row.subject || "—"} bottom={row.start || row.end ? `${shortDate(row.start)} – ${shortDate(row.end)}` : null} /> },
    { field: "amount", headerName: t("contractors.contracts.amount"), width: 150, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines strong top={formatKGS(row.amount)} /> },
    { field: "paidPct", headerName: t("contractors.contracts.paid"), width: 140, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines top={`${row.paidPct}%`} bottom={row.paid > 0 ? formatKGS(row.paid) : null} /> },
    { field: "status", headerName: t("contractors.contracts.status"), width: 160, renderCell: ({ row }) => <StatusPill label={row.statusLabel || row.status} tone={row.status === "active" ? "primary" : row.status === "closed" ? "success" : row.status === "review" ? "warning" : null} /> },
  ];
  return (
    <DataGrid<ConstructionContract>
      rows={rows}
      columns={columns}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: empty }}
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

function ActsGrid({ rows, loading, empty, onOpen }: { rows: Act[]; loading: boolean; empty: string; onOpen: (row: Act) => void }) {
  const { t } = useT("construction");
  const columns: GridColDef<Act>[] = [
    { field: "number", headerName: t("contractors.acts.number"), width: 140, renderCell: ({ row }) => <TwoLines strong top={row.number} bottom={fullDate(row.date)} /> },
    { field: "contractorName", headerName: t("contractors.acts.contractor"), flex: 1, minWidth: 180, renderCell: ({ row }) => <TwoLines top={row.contractorName} bottom={row.projectName || null} /> },
    { field: "subject", headerName: t("contractors.acts.subject"), flex: 1.2, minWidth: 200, renderCell: ({ row }) => <TwoLines top={row.subject || "—"} bottom={row.period || null} /> },
    { field: "amount", headerName: t("contractors.acts.amount"), width: 190, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines strong top={formatKGS(row.amount)} bottom={row.toPay !== row.amount ? `${t("contractors.acts.toPay")}: ${formatKGS(row.toPay)}` : null} /> },
    {
      field: "status",
      headerName: t("contractors.acts.status"),
      width: 160,
      renderCell: ({ row }) => (
        <Box sx={{ display: "grid", gap: 0.4, justifyItems: "start", py: 1 }}>
          <StatusPill label={row.statusLabel || row.status} tone={actTone(row.status)} />
          {row.defects > 0 && <Typography sx={{ fontSize: "0.7rem", color: "warning.main" }}>{t("contractors.acts.defectsWarn", { count: row.defects })}</Typography>}
        </Box>
      ),
    },
  ];
  return (
    <DataGrid<Act>
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

