import React from "react";
import { Alert, Box, Button, MenuItem, Skeleton, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";

import {
  cancelInventory,
  completeInventory,
  getInventories,
  getMovements,
  getStock,
  getStockByNomenclature,
  getStockSummary,
  inventoryDiff,
  startInventory,
  supplyKeys,
  type Inventory,
  type Movement,
  type MovementType,
  type StockByNomenclature,
  type StockRow,
  type Warehouse,
} from "../../api/supply";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { cardSx } from "../estate-dashboard/format";
import { ConfirmDialog, EmptyNote, PillTabs, TwoLines } from "../realty-finance/shared";
import { KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { compactSum, fullDate, parseNumber } from "./format";
import { useRefreshSupply, useWarehouses } from "./hooks";
import { StatusPill } from "./shared";
import { MovementDrawer, type MovementPreset } from "./WarehouseForms";

type Tab = "stock" | "movements" | "inventory";
const TABS: Tab[] = ["stock", "movements", "inventory"];
const qty = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
const stockTone = (status: string) => (status === "low" ? "warning" : status === "none" ? "error" : status === "ok" ? "success" : null);

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * «Склад» застройщика (AIVIO, гайд `frontend-construction.md` §8): остатки по
 * складам объектов и центральному (матрица «все склады» или один склад),
 * движения, инвентаризация. Склад — `?warehouse=`, вкладка — `?tab=`.
 * Кнопки — `supply.manage`. «Заявка» у позиции ниже минимума ведёт в снабжение.
 */
export default function WarehousePage() {
  const { t } = useT("construction");
  usePageTitle(t("warehouse.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <WarehouseScreen />
    </Box>
  );
}

function WarehouseScreen() {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const canManage = useCan("supply.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "stock";
  const warehouseId = Number(searchParams.get("warehouse")) || null;
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search, 350);
  const [movement, setMovement] = React.useState<MovementPreset | null>(null);
  const enabled = scope.orgReady !== false;

  const summary = useQuery({ queryKey: supplyKeys.stockSummary(scope), queryFn: ({ signal }) => getStockSummary(scope, signal), enabled, staleTime: 30_000 });
  const warehouses = useWarehouses();
  const all = useQuery({
    queryKey: supplyKeys.stockByNom(scope, q),
    queryFn: ({ signal }) => getStockByNomenclature(q, scope, signal),
    enabled: enabled && tab === "stock" && warehouseId == null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const one = useQuery({
    queryKey: supplyKeys.stock(scope, warehouseId ?? 0, q),
    queryFn: ({ signal }) => getStock(warehouseId as number, q, scope, signal),
    enabled: enabled && tab === "stock" && warehouseId != null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const movements = useQuery({ queryKey: supplyKeys.movements(scope, warehouseId), queryFn: ({ signal }) => getMovements(warehouseId, scope, signal), enabled: enabled && tab === "movements", staleTime: 30_000 });

  const set = (key: "tab" | "warehouse", value: string | null) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  const error = summary.error ?? warehouses.error;
  if (error) {
    return (
      <ScreenError
        error={error}
        title={t("warehouse.loadError")}
        onRetry={() => {
          void summary.refetch();
          void warehouses.refetch();
        }}
      />
    );
  }

  const s = summary.data;
  const whs = warehouses.data ?? [];
  const order = (type: MovementType) => setMovement({ type, warehouseId });
  const requestFor = (nomId: number, need: number) => navigate(`/supply/procurement?newRequest=${nomId}:${Math.max(1, Math.ceil(need))}`);

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>{t("warehouse.subtitle")}</Typography>
        {canManage && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button size="small" variant="outlined" startIcon={<SwapHorizOutlined />} onClick={() => order("move")} sx={{ whiteSpace: "nowrap" }}>
              {t("warehouse.move")}
            </Button>
            <Button size="small" variant="outlined" startIcon={<RemoveOutlined />} onClick={() => order("out")} sx={{ whiteSpace: "nowrap" }}>
              {t("warehouse.out")}
            </Button>
            <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => order("in")} sx={{ whiteSpace: "nowrap" }}>
              {t("warehouse.in")}
            </Button>
          </Box>
        )}
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "value", label: t("warehouse.kpi.value"), value: compactSum(s.stockValue, t), hint: t("warehouse.kpi.valueHint", { count: s.warehousesCount }) },
                { key: "positions", label: t("warehouse.kpi.positions"), value: String(s.nomenclatureCount), hint: t("warehouse.kpi.positionsHint", { count: s.stockRowsCount }) },
                { key: "low", label: t("warehouse.kpi.low"), value: String(s.lowCount), hint: s.lowNames.length ? s.lowNames.join(", ") : null, tone: s.lowCount > 0 ? "warning" : null },
                { key: "moves", label: t("warehouse.kpi.moves"), value: String(s.moves7d), hint: t("warehouse.kpi.movesHint", { count: s.receipts7d }) },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <PillTabs<Tab> value={tab} onChange={(next) => set("tab", next === "stock" ? null : next)} tabs={TABS.map((key) => ({ key, label: t(`warehouse.tabs.${key}`) }))} />
        <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
          <TextField
            select
            size="small"
            value={warehouseId ?? ""}
            onChange={(e) => set("warehouse", e.target.value ? String(e.target.value) : null)}
            SelectProps={{ displayEmpty: true }}
            sx={{ minWidth: 220, "& .MuiInputBase-root": { height: 32, fontSize: "0.875rem" } }}
            inputProps={{ "aria-label": t("warehouse.allWarehouses") }}
          >
            <MenuItem value="">{t("warehouse.allWarehouses")}</MenuItem>
            {whs.map((w) => (
              <MenuItem key={w.id} value={w.id}>
                {w.name}
                {w.isCentral ? ` · ${t("warehouse.central")}` : ""}
              </MenuItem>
            ))}
          </TextField>
          {tab === "stock" && <SearchBox value={search} onChange={setSearch} placeholder={t("warehouse.search")} />}
        </Box>
      </Box>

      {tab === "stock" && (
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          {(warehouseId == null ? all.error : one.error) ? (
            <Box sx={{ p: 2 }}>
              <ScreenError error={warehouseId == null ? all.error : one.error} onRetry={() => void (warehouseId == null ? all.refetch() : one.refetch())} />
            </Box>
          ) : warehouseId == null ? (
            <MatrixGrid rows={all.data ?? []} warehouses={whs} loading={all.isFetching} canManage={canManage} onRequest={(r) => requestFor(r.nomId, r.min * 2 - r.total)} />
          ) : (
            <StockGrid rows={one.data ?? []} loading={one.isFetching} canManage={canManage} onRequest={(r) => requestFor(r.nomId, r.min * 2 - r.qty)} />
          )}
        </Box>
      )}
      {tab === "movements" && (
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          {movements.error ? (
            <Box sx={{ p: 2 }}>
              <ScreenError error={movements.error} onRetry={() => void movements.refetch()} />
            </Box>
          ) : (
            <MovementsGrid rows={movements.data ?? []} loading={movements.isFetching} />
          )}
        </Box>
      )}
      {tab === "inventory" && <InventoryPanel warehouse={whs.find((w) => w.id === warehouseId) ?? null} canManage={canManage} />}

      <MovementDrawer preset={movement} onClose={() => setMovement(null)} />
    </>
  );
}

const gridSx = { border: 0, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } } as const;

function MatrixGrid({ rows, warehouses, loading, canManage, onRequest }: { rows: StockByNomenclature[]; warehouses: Warehouse[]; loading: boolean; canManage: boolean; onRequest: (row: StockByNomenclature) => void }) {
  const { t } = useT("construction");
  const columns: GridColDef<StockByNomenclature>[] = [
    { field: "nomName", headerName: t("warehouse.stock.nom"), flex: 1.3, minWidth: 220, renderCell: ({ row }) => <TwoLines strong top={row.nomName} bottom={[row.category, `${formatKGS(row.price)} / ${row.unit}`].filter(Boolean).join(" · ")} /> },
    ...warehouses.map(
      (w): GridColDef<StockByNomenclature> => ({
        field: `wh${w.id}`,
        // Колонка узкая: в заголовке код склада, полное название (и «центральный») — в подсказке.
        headerName: w.code || w.name,
        description: w.isCentral ? `${w.name} · ${t("warehouse.central")}` : w.name,
        width: 110,
        align: "right",
        headerAlign: "right",
        sortable: false,
        valueGetter: (_, row) => row.byWarehouse.find((b) => b.warehouseId === w.id)?.qty ?? 0,
        renderCell: ({ row }) => {
          const cell = row.byWarehouse.find((b) => b.warehouseId === w.id);
          return <TwoLines top={cell && cell.qty ? qty(cell.qty) : "—"} bottom={cell && cell.reserved ? `${t("warehouse.stock.reserved")} ${qty(cell.reserved)}` : null} />;
        },
      }),
    ),
    { field: "total", headerName: t("warehouse.stock.total"), width: 120, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines strong top={`${qty(row.total)} ${row.unit}`} bottom={row.min ? `${t("warehouse.stock.min")} ${qty(row.min)}` : null} /> },
    {
      field: "status",
      headerName: t("warehouse.stock.status"),
      width: 170,
      renderCell: ({ row }) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <StatusPill label={t(`warehouse.stock.status_${row.status}`, { defaultValue: row.status })} tone={stockTone(row.status)} />
          {canManage && row.status !== "ok" && (
            <Button size="small" onClick={() => onRequest(row)} sx={{ minWidth: 0, px: 0.75 }}>
              {t("warehouse.stock.request")}
            </Button>
          )}
        </Box>
      ),
    },
  ];
  return (
    <DataGrid<StockByNomenclature>
      rows={rows}
      columns={columns}
      getRowId={(row) => row.nomId}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
      getRowHeight={() => "auto"}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      hideFooter
      sx={gridSx}
    />
  );
}

function StockGrid({ rows, loading, canManage, onRequest }: { rows: StockRow[]; loading: boolean; canManage: boolean; onRequest: (row: StockRow) => void }) {
  const { t } = useT("construction");
  const columns: GridColDef<StockRow>[] = [
    { field: "nomName", headerName: t("warehouse.stock.nom"), flex: 1.3, minWidth: 220, renderCell: ({ row }) => <TwoLines strong top={row.nomName} bottom={row.category || null} /> },
    { field: "qty", headerName: t("warehouse.stock.qty"), width: 120, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines top={`${qty(row.qty)} ${row.unit}`} /> },
    { field: "reserved", headerName: t("warehouse.stock.reserved"), width: 110, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines top={row.reserved ? qty(row.reserved) : "—"} /> },
    { field: "available", headerName: t("warehouse.stock.available"), width: 120, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines strong top={qty(row.available)} bottom={row.min ? `${t("warehouse.stock.min")} ${qty(row.min)}` : null} /> },
    { field: "price", headerName: t("warehouse.stock.price"), width: 130, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines top={formatKGS(row.price)} /> },
    { field: "value", headerName: t("warehouse.stock.value"), width: 150, align: "right", headerAlign: "right", renderCell: ({ row }) => <TwoLines strong top={formatKGS(row.value)} /> },
    {
      field: "status",
      headerName: t("warehouse.stock.status"),
      width: 170,
      renderCell: ({ row }) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <StatusPill label={t(`warehouse.stock.status_${row.status}`, { defaultValue: row.status })} tone={stockTone(row.status)} />
          {canManage && row.status !== "ok" && (
            <Button size="small" onClick={() => onRequest(row)} sx={{ minWidth: 0, px: 0.75 }}>
              {t("warehouse.stock.request")}
            </Button>
          )}
        </Box>
      ),
    },
  ];
  return (
    <DataGrid<StockRow>
      rows={rows}
      columns={columns}
      getRowId={(row) => row.nomId}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
      getRowHeight={() => "auto"}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      hideFooter
      sx={gridSx}
    />
  );
}

function MovementsGrid({ rows, loading }: { rows: Movement[]; loading: boolean }) {
  const { t } = useT("construction");
  const columns: GridColDef<Movement>[] = [
    { field: "date", headerName: t("warehouse.movements.date"), width: 120, renderCell: ({ row }) => <TwoLines top={fullDate(row.date)} bottom={row.number} /> },
    {
      field: "typeLabel",
      headerName: t("warehouse.movements.type"),
      width: 150,
      renderCell: ({ row }) => <StatusPill label={row.typeLabel || row.type} tone={row.type === "in" ? "success" : row.type === "out" ? "warning" : "info"} />,
    },
    { field: "nomName", headerName: t("warehouse.movements.nom"), flex: 1.2, minWidth: 200, renderCell: ({ row }) => <TwoLines strong top={row.nomName} /> },
    {
      field: "qty",
      headerName: t("warehouse.movements.qty"),
      width: 130,
      align: "right",
      headerAlign: "right",
      renderCell: ({ row }) => (
        <Typography sx={{ width: "100%", textAlign: "right", fontSize: "0.875rem", fontWeight: 700, color: row.type === "in" ? "success.main" : row.type === "out" ? "text.primary" : "info.main" }}>
          {row.type === "in" ? "+" : row.type === "out" ? "−" : ""}
          {qty(row.qty)} {row.unit}
        </Typography>
      ),
    },
    { field: "warehouseName", headerName: t("warehouse.movements.warehouse"), flex: 1, minWidth: 180, renderCell: ({ row }) => <TwoLines top={row.warehouseName} bottom={row.toWarehouseName ? `→ ${row.toWarehouseName}` : row.projectName || null} /> },
    { field: "ref", headerName: t("warehouse.movements.ref"), flex: 1, minWidth: 180, renderCell: ({ row }) => <TwoLines top={row.ref || "—"} bottom={row.by || null} /> },
  ];
  return (
    <DataGrid<Movement>
      rows={rows}
      columns={columns}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
      getRowHeight={() => "auto"}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
      pageSizeOptions={[25, 50, 100]}
      sx={gridSx}
    />
  );
}

/**
 * Инвентаризация одного склада: «Начать» — опись с учётными остатками,
 * факт вводится по строкам, «Завершить» проводит расхождения движениями.
 */
function InventoryPanel({ warehouse, canManage }: { warehouse: Warehouse | null; canManage: boolean }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const { enqueueSnackbar } = useSnackbar();
  const [facts, setFacts] = React.useState<Record<number, string>>({});
  const [touched, setTouched] = React.useState(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const id = warehouse?.id ?? null;
  const list = useQuery({ queryKey: supplyKeys.inventories(scope, id), queryFn: ({ signal }) => getInventories(id, scope, signal), enabled: id != null && scope.orgReady !== false, staleTime: 15_000 });
  const active = list.data?.find((inv) => inv.status === "counting") ?? null;
  const past = (list.data ?? []).filter((inv) => inv.status !== "counting");
  React.useEffect(() => {
    setFacts({});
    setTouched(false);
  }, [active?.id]);
  const onError = (error: unknown) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" });
  const start = useMutation({
    mutationFn: () => startInventory(id as number, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("warehouse.inventory.started"), { variant: "success" });
    },
    onError,
  });
  const complete = useMutation({
    mutationFn: (inv: Inventory) => completeInventory(inv.id, inv.rows.map((r) => ({ nomId: r.nomId, fact: parseNumber(facts[r.nomId] ?? "") as number })), scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("warehouse.inventory.completed"), { variant: "success" });
    },
    onError,
  });
  const cancel = useMutation({
    mutationFn: (inv: Inventory) => cancelInventory(inv.id, scope),
    onSuccess: () => {
      setConfirmCancel(false);
      refresh();
      enqueueSnackbar(t("warehouse.inventory.cancelled"), { variant: "success" });
    },
  });

  if (!warehouse) {
    return (
      <Box sx={cardSx}>
        <EmptyNote text={t("warehouse.inventory.pick")} />
      </Box>
    );
  }
  if (list.error) return <ScreenError error={list.error} onRetry={() => void list.refetch()} />;
  if (!list.data) return <Skeleton variant="rounded" height={240} sx={{ borderRadius: "14px" }} />;

  const missing = active ? active.rows.some((r) => parseNumber(facts[r.nomId] ?? "") == null) : false;
  const table = (inv: Inventory, editable: boolean) => (
    <Box sx={{ overflowX: "auto" }}>
      <Box
        component="table"
        sx={{
          width: "100%",
          minWidth: 640,
          borderCollapse: "collapse",
          "& td, & th": { px: 1.5, py: 0.8, fontSize: "0.8125rem", borderTop: 1, borderColor: "divider", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
          "& th": { fontWeight: 600, color: "text.secondary", borderTop: 0 },
          "& td:first-of-type, & th:first-of-type": { pl: 2.25, textAlign: "left", whiteSpace: "normal" },
        }}
      >
        <thead>
          <tr>
            <th>{t("warehouse.inventory.nom")}</th>
            <th>{t("warehouse.inventory.book")}</th>
            <th>{t("warehouse.inventory.fact")}</th>
            <th>{t("warehouse.inventory.diff")}</th>
            <th>{t("warehouse.inventory.amount")}</th>
            <th>{t("warehouse.inventory.result")}</th>
          </tr>
        </thead>
        <tbody>
          {inv.rows.map((r) => {
            const fact = editable ? parseNumber(facts[r.nomId] ?? "") : r.fact;
            const local = inventoryDiff(r.book, fact);
            const diff = editable ? local.diff : r.diff;
            const result = editable ? local.result : r.result;
            const amount = editable ? (diff != null ? diff * r.price : null) : r.amount;
            return (
              <tr key={r.nomId}>
                <td>{r.nomName}</td>
                <td>
                  {qty(r.book)} {r.unit}
                </td>
                <td>
                  {editable ? (
                    <TextField
                      size="small"
                      value={facts[r.nomId] ?? ""}
                      inputMode="decimal"
                      onChange={(e) => setFacts((prev) => ({ ...prev, [r.nomId]: e.target.value }))}
                      error={touched && parseNumber(facts[r.nomId] ?? "") == null}
                      inputProps={{ "aria-label": `${t("warehouse.inventory.fact")} · ${r.nomName}`, style: { textAlign: "right", padding: "4px 8px", width: 80 } }}
                    />
                  ) : fact != null ? (
                    qty(fact)
                  ) : (
                    "—"
                  )}
                </td>
                <Box component="td" sx={{ color: diff && diff < 0 ? "error.main" : diff && diff > 0 ? "info.main" : "text.secondary" }}>
                  {diff == null ? "—" : `${diff > 0 ? "+" : ""}${qty(diff)}`}
                </Box>
                <td>{amount == null ? "—" : formatKGS(amount)}</td>
                <td>{result ? <StatusPill label={t(`warehouse.inventory.result_${result}`, { defaultValue: result })} tone={result === "ok" ? "success" : result === "shortage" ? "error" : "info"} /> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {active ? (
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          <Box sx={{ px: 2.25, py: 1.75, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>
                {active.number || warehouse.name} · {t("warehouse.inventory.counting")}
              </Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{[warehouse.name, fullDate(active.startedAt)].filter(Boolean).join(" · ")}</Typography>
            </Box>
            {canManage && (
              <>
                <Button color="error" onClick={() => setConfirmCancel(true)} disabled={complete.isPending}>
                  {t("warehouse.inventory.cancel")}
                </Button>
                <Button
                  variant="contained"
                  disabled={complete.isPending}
                  onClick={() => {
                    setTouched(true);
                    if (!missing) complete.mutate(active);
                  }}
                >
                  {t("warehouse.inventory.complete")}
                </Button>
              </>
            )}
          </Box>
          {touched && missing && (
            <Alert severity="warning" sx={{ mx: 2.25, mb: 1.5 }}>
              {t("warehouse.inventory.factMissing")}
            </Alert>
          )}
          {table(active, canManage)}
        </Box>
      ) : (
        canManage && (
          <Box sx={{ ...cardSx, p: 2.25, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{warehouse.name}</Typography>
            <Button variant="contained" onClick={() => start.mutate()} disabled={start.isPending}>
              {t("warehouse.inventory.start")}
            </Button>
          </Box>
        )
      )}
      <Box sx={{ ...cardSx, overflow: "hidden" }}>
        <Typography sx={{ px: 2.25, pt: 2, pb: 1, fontWeight: 700 }}>{t("warehouse.inventory.history")}</Typography>
        {past.length === 0 ? (
          <EmptyNote text={t("warehouse.inventory.none")} />
        ) : (
          past.map((inv) => (
            <Box key={inv.id} sx={{ borderTop: 1, borderColor: "divider" }}>
              <Box sx={{ px: 2.25, py: 1.25, display: "flex", alignItems: "baseline", gap: 1 }}>
                <Typography sx={{ flex: 1, fontSize: "0.875rem", fontWeight: 600 }}>{inv.number || t("warehouse.inventory.numberFallback", { id: inv.id })}</Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{fullDate(inv.completedAt ?? inv.startedAt)}</Typography>
                <StatusPill label={inv.statusLabel || t(`warehouse.inventory.status_${inv.status}`, { defaultValue: inv.status })} tone={inv.status === "completed" || inv.status === "done" ? "success" : inv.status === "cancelled" ? null : "info"} />
              </Box>
              {inv.rows.some((r) => r.result && r.result !== "ok") && table({ ...inv, rows: inv.rows.filter((r) => r.result && r.result !== "ok") }, false)}
            </Box>
          ))
        )}
      </Box>
      <ConfirmDialog
        open={confirmCancel}
        title={t("warehouse.inventory.cancel")}
        text={warehouse.name}
        confirmLabel={t("warehouse.inventory.cancel")}
        busy={cancel.isPending}
        error={cancel.error}
        danger
        onConfirm={() => active && cancel.mutate(active)}
        onClose={() => setConfirmCancel(false)}
      />
    </Box>
  );
}
