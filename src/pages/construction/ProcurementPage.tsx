import React from "react";
import { Box, Button, ButtonBase, MenuItem, Rating, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import AddOutlined from "@mui/icons-material/AddOutlined";

import { getOrders, getRequests, getSupplySummary, getSuppliers, getTenders, supplyKeys, type Supplier, type SupplyOrder, type SupplyRequest, type Tender } from "../../api/supply";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { cardSx } from "../estate-dashboard/format";
import { PillTabs, SubPill, TwoLines } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { compactSum, fullDate, orderTone, requestTone, tenderTone } from "./format";
import { useConstructionProjects } from "./hooks";
import { OrderDrawer, RequestDrawer, RequestFormDrawer, SupplierDrawer, TenderDrawer, type RequestPreset } from "./ProcurementDrawers";
import { StatusPill } from "./shared";

type Tab = "requests" | "tenders" | "orders" | "suppliers";
const TABS: Tab[] = ["requests", "tenders", "orders", "suppliers"];

const matches = (fields: (string | null | undefined)[], search: string) => {
  const q = search.trim().toLocaleLowerCase("ru");
  return !q || fields.some((f) => (f ?? "").toLocaleLowerCase("ru").includes(q));
};

/**
 * «Снабжение» застройщика (AIVIO, гайд `frontend-construction.md` §7):
 * заявки с объектов → согласование → тендер или заказ → приёмка на склад.
 * KPI, воронка и «ниже минимума» — `/summary/`. Вкладка — `?tab=`, карточки —
 * `?request=` / `?tender=` / `?order=` / `?supplier=`, «заказать» со склада —
 * `?newRequest=<nomId>:<qty>`. Кнопки — `supply.manage`, согласование и
 * выбор победителя — `supply.approve`.
 */
export default function ProcurementPage() {
  const { t } = useT("construction");
  usePageTitle(t("procurement.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <ProcurementScreen />
    </Box>
  );
}

function ProcurementScreen() {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const can = { manage: useCan("supply.manage"), approve: useCan("supply.approve") };
  const [searchParams, setSearchParams] = useSearchParams();
  const [requestId, openRequest] = useIdParam("request");
  const [tenderId, openTender] = useIdParam("tender");
  const [orderId, openOrder] = useIdParam("order");
  const [supplierId, openSupplier] = useIdParam("supplier");
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "requests";
  const [status, setStatus] = React.useState("all");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [search, setSearch] = React.useState("");
  const [preset, setPreset] = React.useState<RequestPreset | null>(null);
  const enabled = scope.orgReady !== false;

  // «заказать» со «Склада»: ?newRequest=14:300 → форма заявки с готовой строкой.
  const newRequest = searchParams.get("newRequest");
  React.useEffect(() => {
    if (!newRequest) return;
    const [nomId, qty] = newRequest.split(":").map(Number);
    if (nomId) setPreset({ projectId: null, items: [{ nomId, qty: qty || 0 }] });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("newRequest");
        return next;
      },
      { replace: true },
    );
  }, [newRequest, setSearchParams]);

  const summary = useQuery({ queryKey: supplyKeys.summary(scope), queryFn: ({ signal }) => getSupplySummary(scope, signal), enabled, staleTime: 30_000 });
  const requests = useQuery({ queryKey: supplyKeys.requests(scope), queryFn: ({ signal }) => getRequests(scope, signal), enabled: enabled && tab === "requests", staleTime: 30_000 });
  const tenders = useQuery({ queryKey: supplyKeys.tenders(scope), queryFn: ({ signal }) => getTenders(scope, signal), enabled: enabled && tab === "tenders", staleTime: 30_000 });
  const orders = useQuery({ queryKey: supplyKeys.orders(scope), queryFn: ({ signal }) => getOrders(scope, signal), enabled: enabled && tab === "orders", staleTime: 30_000 });
  const suppliers = useQuery({ queryKey: supplyKeys.suppliers(scope), queryFn: ({ signal }) => getSuppliers(scope, signal), enabled: enabled && tab === "suppliers", staleTime: 60_000 });
  const projects = useConstructionProjects().data ?? [];

  const setTab = (next: Tab) => {
    setStatus("all");
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "requests") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );
  };
  // Переход между карточками (заявка → тендер → заказ) — одна шторка за раз.
  const go = (kind: "request" | "tender" | "order" | "supplier", id: number) => {
    openRequest(kind === "request" ? id : null);
    openTender(kind === "tender" ? id : null);
    openOrder(kind === "order" ? id : null);
    openSupplier(kind === "supplier" ? id : null);
  };

  if (summary.error) return <ScreenError error={summary.error} title={t("procurement.loadError")} onRetry={() => void summary.refetch()} />;

  const s = summary.data;
  const byProject = (row: { projectId: number | null }) => projectId === "" || row.projectId === projectId;
  const allRequests = requests.data ?? [];
  const requestRows = allRequests.filter((r) => (status === "all" || r.status === status) && byProject(r) && matches([r.number, r.title, r.projectName, r.requester], search));
  const tenderRows = (tenders.data ?? []).filter((x) => byProject(x) && matches([x.number, x.title, x.projectName, x.requestNumber], search));
  const orderRows = (orders.data ?? []).filter((x) => byProject(x) && matches([x.number, x.supplierName, x.projectName, x.requestNumber], search));
  const supplierRows = (suppliers.data ?? []).filter((x) => matches([x.name, x.category, x.inn, x.contact], search));
  const listError = requests.error ?? tenders.error ?? orders.error ?? suppliers.error;
  const statusKeys = ["all", ...Array.from(new Set(allRequests.map((r) => r.status)))];

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>{t("procurement.subtitle")}</Typography>
        {can.manage && (
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setPreset({ projectId: projectId === "" ? null : projectId, items: [] })} sx={{ whiteSpace: "nowrap" }}>
            {t("procurement.newRequest")}
          </Button>
        )}
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "new", label: t("procurement.kpi.new"), value: String(s.newRequests), hint: t("procurement.kpi.newHint", { count: s.inWorkRequests }), tone: s.newRequests > 0 ? "warning" : null },
                { key: "tenders", label: t("procurement.kpi.tenders"), value: String(s.openTenders), hint: t("procurement.kpi.tendersHint", { count: s.offersCount }) },
                { key: "transit", label: t("procurement.kpi.transit"), value: String(s.ordersInTransit), hint: s.ordersInTransitAmount ? compactSum(s.ordersInTransitAmount, t) : null },
                { key: "purchased", label: t("procurement.kpi.purchased"), value: compactSum(s.purchased30d, t), hint: t("procurement.kpi.purchasedHint", { count: s.suppliersCount }) },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <PillTabs<Tab> value={tab} onChange={setTab} tabs={TABS.map((key) => ({ key, label: t(`procurement.tabs.${key}`) }))} />
        <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
          {tab !== "suppliers" && (
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
          <SearchBox value={search} onChange={setSearch} placeholder={t("procurement.search")} />
        </Box>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 300px" }, alignItems: "start" }}>
        <Box sx={{ minWidth: 0 }}>
          {tab === "requests" && (
            <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {statusKeys.map((key) => {
                const count = key === "all" ? allRequests.length : allRequests.filter((r) => r.status === key).length;
                const label = key === "all" ? t("procurement.status_all") : (allRequests.find((r) => r.status === key)?.statusLabel ?? key);
                return <SubPill key={key} active={status === key} onClick={() => setStatus(key)} label={`${label} · ${count}`} />;
              })}
            </Box>
          )}
          <Box sx={{ ...cardSx, overflow: "hidden" }}>
            {listError ? (
              <Box sx={{ p: 2 }}>
                <ScreenError error={listError} onRetry={() => void (tab === "requests" ? requests : tab === "tenders" ? tenders : tab === "orders" ? orders : suppliers).refetch()} />
              </Box>
            ) : tab === "requests" ? (
              <RequestsGrid rows={requestRows} loading={requests.isFetching} onOpen={(r) => go("request", r.id)} />
            ) : tab === "tenders" ? (
              <TendersGrid rows={tenderRows} loading={tenders.isFetching} onOpen={(r) => go("tender", r.id)} />
            ) : tab === "orders" ? (
              <OrdersGrid rows={orderRows} loading={orders.isFetching} onOpen={(r) => go("order", r.id)} />
            ) : (
              <SuppliersGrid rows={supplierRows} loading={suppliers.isFetching} onOpen={(r) => go("supplier", r.id)} />
            )}
          </Box>
        </Box>

        <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
          <Box sx={{ ...cardSx, minWidth: 0 }}>
            <CardHeader title={t("procurement.funnel")} />
            <Box sx={{ px: 2.25, pb: 1.5 }}>
              {(s?.funnel ?? []).map((f) => {
                const max = Math.max(1, ...(s?.funnel ?? []).map((x) => x.count));
                return (
                  <Box key={f.status} sx={{ py: 0.6 }}>
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                      <Typography sx={{ flex: 1, fontSize: "0.8125rem" }}>{f.label}</Typography>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{f.count}</Typography>
                    </Box>
                    <Box sx={{ mt: 0.4, height: 6, borderRadius: 3, bgcolor: "action.hover", overflow: "hidden" }}>
                      <Box sx={{ width: `${(f.count / max) * 100}%`, height: "100%", borderRadius: 3, bgcolor: `${requestTone(f.status) ?? "primary"}.main` }} />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
          <Box sx={{ ...cardSx, minWidth: 0 }}>
            <CardHeader title={t("procurement.lowStock")} />
            <Box sx={{ px: 2.25, pb: 1.5 }}>
              {s && s.lowStock.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("procurement.lowNone")}</Typography>}
              {s?.lowStock.map((l) => (
                <Box key={l.nomId} sx={{ py: 0.9, display: "flex", alignItems: "baseline", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                      {l.nomName}
                    </Typography>
                    <Typography sx={{ fontSize: "0.72rem", color: "warning.main" }}>{t("procurement.lowLine", { total: l.total.toLocaleString("ru-RU"), min: l.min.toLocaleString("ru-RU"), unit: l.unit })}</Typography>
                  </Box>
                  {can.manage && (
                    <ButtonBase onClick={() => setPreset({ projectId: null, items: [{ nomId: l.nomId, qty: l.suggestedQty }] })} sx={{ fontSize: "0.75rem", fontWeight: 600, color: "primary.main", whiteSpace: "nowrap" }}>
                      {t("procurement.order")}
                    </ButtonBase>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>

      <RequestDrawer id={requestId} preview={allRequests.find((r) => r.id === requestId) ?? null} can={can} onClose={() => openRequest(null)} onOpenTender={(id) => go("tender", id)} onOpenOrder={(id) => go("order", id)} />
      <TenderDrawer id={tenderId} preview={(tenders.data ?? []).find((x) => x.id === tenderId) ?? null} can={can} onClose={() => openTender(null)} onOpenOrder={(id) => go("order", id)} />
      <OrderDrawer id={orderId} preview={(orders.data ?? []).find((x) => x.id === orderId) ?? null} canManage={can.manage} onClose={() => openOrder(null)} onOpenRequest={(id) => go("request", id)} />
      <SupplierDrawer id={supplierId} preview={(suppliers.data ?? []).find((x) => x.id === supplierId) ?? null} onClose={() => openSupplier(null)} onOpenOrder={(id) => go("order", id)} />
      <RequestFormDrawer preset={preset} onClose={() => setPreset(null)} onCreated={(r) => go("request", r.id)} />
    </>
  );
}

const gridSx = { border: 0, "& .MuiDataGrid-row": { cursor: "pointer" }, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } } as const;

function useGridLocale() {
  const { t } = useT("construction");
  return { ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") };
}

function RequestsGrid({ rows, loading, onOpen }: { rows: SupplyRequest[]; loading: boolean; onOpen: (row: SupplyRequest) => void }) {
  const { t } = useT("construction");
  const localeText = useGridLocale();
  const columns: GridColDef<SupplyRequest>[] = [
    { field: "title", headerName: t("procurement.requests.title"), flex: 1.5, minWidth: 230, renderCell: ({ row }) => <TwoLines strong top={row.title} bottom={t("procurement.requests.created", { number: row.number, date: fullDate(row.created) })} /> },
    { field: "projectName", headerName: t("procurement.requests.project"), flex: 1, minWidth: 160, renderCell: ({ row }) => <TwoLines top={row.projectName || "—"} bottom={row.requester || null} /> },
    {
      field: "needBy",
      headerName: t("procurement.requests.needBy"),
      width: 130,
      renderCell: ({ row }) => (
        <TwoLines
          top={fullDate(row.needBy)}
          bottom={
            row.overdue ? (
              <Box component="span" sx={{ color: "error.main", fontWeight: 600 }}>
                {t("procurement.requests.overdue")}
              </Box>
            ) : null
          }
        />
      ),
    },
    { field: "total", headerName: t("procurement.requests.total"), width: 150, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines strong top={formatKGS(row.total)} /> },
    { field: "status", headerName: t("procurement.requests.status"), width: 150, renderCell: ({ row }) => <StatusPill label={row.statusLabel || row.status} tone={requestTone(row.status)} /> },
  ];
  return <DataGrid<SupplyRequest> rows={rows} columns={columns} loading={loading && rows.length === 0} localeText={localeText} getRowHeight={() => "auto"} onRowClick={({ row }) => onOpen(row)} disableRowSelectionOnClick disableColumnMenu autoHeight hideFooter sx={gridSx} />;
}

function TendersGrid({ rows, loading, onOpen }: { rows: Tender[]; loading: boolean; onOpen: (row: Tender) => void }) {
  const { t } = useT("construction");
  const localeText = useGridLocale();
  const columns: GridColDef<Tender>[] = [
    { field: "number", headerName: t("procurement.tenders.number"), width: 110, renderCell: ({ row }) => <TwoLines strong top={row.number} bottom={row.requestNumber || null} /> },
    { field: "title", headerName: t("procurement.tenders.title"), flex: 1.4, minWidth: 220, renderCell: ({ row }) => <TwoLines top={row.title} bottom={row.projectName || null} /> },
    { field: "deadline", headerName: t("procurement.tenders.deadline"), width: 120, renderCell: ({ row }) => <TwoLines top={fullDate(row.deadline)} /> },
    { field: "offersCount", headerName: t("procurement.tenders.offers"), width: 120, renderCell: ({ row }) => <TwoLines top={t("procurement.tenders.offersValue", { count: row.offersCount, total: row.invited.length || row.offersCount })} /> },
    { field: "bestPrice", headerName: t("procurement.tenders.best"), width: 150, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines strong top={row.bestPrice ? formatKGS(row.bestPrice) : "—"} bottom={row.winnerName || null} /> },
    { field: "status", headerName: t("procurement.tenders.status"), width: 140, renderCell: ({ row }) => <StatusPill label={row.statusLabel || row.status} tone={tenderTone(row.status)} /> },
  ];
  return <DataGrid<Tender> rows={rows} columns={columns} loading={loading && rows.length === 0} localeText={localeText} getRowHeight={() => "auto"} onRowClick={({ row }) => onOpen(row)} disableRowSelectionOnClick disableColumnMenu autoHeight hideFooter sx={gridSx} />;
}

function OrdersGrid({ rows, loading, onOpen }: { rows: SupplyOrder[]; loading: boolean; onOpen: (row: SupplyOrder) => void }) {
  const { t } = useT("construction");
  const localeText = useGridLocale();
  const columns: GridColDef<SupplyOrder>[] = [
    { field: "number", headerName: t("procurement.orders.number"), width: 120, renderCell: ({ row }) => <TwoLines strong top={row.number} bottom={fullDate(row.orderedAt)} /> },
    { field: "supplierName", headerName: t("procurement.orders.supplier"), flex: 1.2, minWidth: 200, renderCell: ({ row }) => <TwoLines top={row.supplierName || "—"} bottom={row.requestNumber || null} /> },
    { field: "projectName", headerName: t("procurement.orders.project"), width: 170, renderCell: ({ row }) => <TwoLines top={row.projectName || "—"} bottom={row.warehouseName || null} /> },
    { field: "eta", headerName: t("procurement.orders.eta"), width: 130, renderCell: ({ row }) => <TwoLines top={fullDate(row.deliveredAt ?? row.eta)} bottom={row.overdue ? <Box component="span" sx={{ color: "error.main", fontWeight: 600 }}>{t("procurement.orders.overdue")}</Box> : null} /> },
    { field: "total", headerName: t("procurement.orders.total"), width: 150, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines strong top={formatKGS(row.total)} /> },
    { field: "status", headerName: t("procurement.orders.status"), width: 150, renderCell: ({ row }) => <StatusPill label={row.statusLabel || row.status} tone={orderTone(row.status, row.overdue)} /> },
  ];
  return <DataGrid<SupplyOrder> rows={rows} columns={columns} loading={loading && rows.length === 0} localeText={localeText} getRowHeight={() => "auto"} onRowClick={({ row }) => onOpen(row)} disableRowSelectionOnClick disableColumnMenu autoHeight hideFooter sx={gridSx} />;
}

function SuppliersGrid({ rows, loading, onOpen }: { rows: Supplier[]; loading: boolean; onOpen: (row: Supplier) => void }) {
  const { t } = useT("construction");
  const localeText = useGridLocale();
  const columns: GridColDef<Supplier>[] = [
    { field: "name", headerName: t("procurement.suppliers.name"), flex: 1.4, minWidth: 220, renderCell: ({ row }) => <TwoLines strong top={row.name} bottom={row.category || null} /> },
    { field: "rating", headerName: t("procurement.suppliers.rating"), width: 150, renderCell: ({ row }) => <Rating value={row.rating} precision={0.1} readOnly size="small" /> },
    { field: "ordersCount", headerName: t("procurement.suppliers.orders"), width: 110, align: "right", headerAlign: "right" },
    { field: "ordersTotal", headerName: t("procurement.suppliers.total"), width: 160, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines top={formatKGS(row.ordersTotal)} /> },
    { field: "onTimePct", headerName: t("procurement.suppliers.onTime"), width: 140, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines top={row.onTimePct != null ? `${row.onTimePct}%` : "—"} /> },
    { field: "terms", headerName: t("procurement.suppliers.terms"), flex: 1, minWidth: 160, renderCell: ({ row }) => <TwoLines top={row.terms || "—"} /> },
  ];
  return <DataGrid<Supplier> rows={rows} columns={columns} loading={loading && rows.length === 0} localeText={localeText} getRowHeight={() => "auto"} onRowClick={({ row }) => onOpen(row)} disableRowSelectionOnClick disableColumnMenu autoHeight hideFooter sx={gridSx} />;
}
