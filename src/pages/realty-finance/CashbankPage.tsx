import React from "react";
import { Box, Button, ButtonBase, MenuItem, Skeleton, TextField, Typography, useTheme } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useSnackbar } from "notistack";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AddOutlined from "@mui/icons-material/AddOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";

import {
  CASH_PERIODS,
  downloadStatement,
  getCashByArticle,
  getCashOperations,
  getCashSummary,
  getPaymentCalendar,
  getTreasuryAccounts,
  treasuryKeys,
  type CashOperation,
  type CashPeriod,
  type OperationsParams,
  type TreasuryAccount,
} from "../../api/treasury";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { cardSx } from "../estate-dashboard/format";
import { CardHeader, KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { EscrowDialog, NewOperationDrawer, OperationDrawer, TransferDrawer } from "./CashForms";
import { compactSum, shortDate, signedSum } from "./format";
import { useAccountCurrency } from "./hooks";
import { AmountBars, EmptyNote, PillTabs, SubPill, TwoLines } from "./shared";

type Tab = "operations" | "accounts" | "articles";
/** «Показаны 80 из N» (гайд §2). */
const PAGE = 80;

/**
 * «Касса и банк» застройщика (AIVIO, гайд `frontend-finance.md` §2): остатки
 * по счетам и эскроу, журнал операций, переводы, структура прихода/расхода —
 * `/api/v2/treasury/*`. Расходы MamaDoc (`/finance/expenses`) сюда не относятся.
 * Смотреть — `treasury.view`, операции и переводы — `treasury.manage`.
 */
export default function CashbankPage() {
  const { t } = useT("realtyFinance");
  usePageTitle(t("cashbank.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <CashbankScreen />
    </Box>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function CashbankScreen() {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("treasury.manage");
  const [operationId, openOperation] = useIdParam("operation");
  const [period, setPeriod] = React.useState<CashPeriod>(30);
  const [tab, setTab] = React.useState<Tab>("operations");
  const [accountId, setAccountId] = React.useState<number | "">("");
  const [type, setType] = React.useState<"all" | "in" | "out">("all");
  const [status, setStatus] = React.useState<"done" | "cancelled" | "all">("done");
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search, 350);
  const [showAll, setShowAll] = React.useState(false);
  const [newOperation, setNewOperation] = React.useState(false);
  const [transferFrom, setTransferFrom] = React.useState<{ id: number | null } | null>(null);
  const [escrowId, setEscrowId] = React.useState<number | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const enabled = scope.orgReady !== false;

  const params: OperationsParams = { period, accountId: accountId === "" ? null : accountId, type: type === "all" ? null : type, q, status };
  React.useEffect(() => setShowAll(false), [period, accountId, type, status, q]);

  const summary = useQuery({ queryKey: treasuryKeys.cashSummary(scope, period), queryFn: ({ signal }) => getCashSummary(period, scope, signal), enabled, staleTime: 30_000, placeholderData: keepPreviousData });
  const accounts = useQuery({ queryKey: treasuryKeys.accounts(scope, period), queryFn: ({ signal }) => getTreasuryAccounts(period, scope, signal), enabled, staleTime: 30_000, placeholderData: keepPreviousData });
  const operations = useQuery({ queryKey: treasuryKeys.operations(scope, params), queryFn: ({ signal }) => getCashOperations(params, scope, signal), enabled, staleTime: 30_000, placeholderData: keepPreviousData });
  const byArticle = useQuery({ queryKey: treasuryKeys.byArticle(scope, period), queryFn: ({ signal }) => getCashByArticle(period, scope, signal), enabled: enabled && tab === "articles", staleTime: 60_000, placeholderData: keepPreviousData });
  const upcoming = useQuery({ queryKey: treasuryKeys.calendar(scope, 10), queryFn: ({ signal }) => getPaymentCalendar(10, scope, signal), enabled, staleTime: 60_000, retry: false });

  if (summary.error) return <ScreenError error={summary.error} title={t("cashbank.loadError")} onRetry={() => void summary.refetch()} />;

  const s = summary.data;
  const rows = operations.data ?? [];
  const shown = showAll ? rows : rows.slice(0, PAGE);
  const filtered = accountId !== "" || type !== "all" || status !== "done" || Boolean(q.trim());

  const exportStatement = async () => {
    setExporting(true);
    try {
      await downloadStatement(params, scope);
    } catch (error) {
      enqueueSnackbar(error instanceof Error && error.message ? error.message : t("cashbank.statementFailed"), { variant: "error" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>{t("cashbank.subtitle")}</Typography>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
          {CASH_PERIODS.map((value) => (
            <ButtonBase key={value} aria-pressed={period === value} onClick={() => setPeriod(value)} sx={(th) => ({ ...pillSx(th, period === value), whiteSpace: "nowrap" })}>
              {t(`cashbank.period_${value}`)}
            </ButtonBase>
          ))}
          <Button size="small" startIcon={<FileDownloadOutlined />} onClick={() => void exportStatement()} disabled={exporting} sx={{ whiteSpace: "nowrap" }}>
            {t("cashbank.statement")}
          </Button>
          {canManage && (
            <>
              <Button size="small" variant="outlined" startIcon={<SwapHorizOutlined />} onClick={() => setTransferFrom({ id: null })} sx={{ whiteSpace: "nowrap" }}>
                {t("cashbank.transfer")}
              </Button>
              <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setNewOperation(true)} sx={{ whiteSpace: "nowrap" }}>
                {t("cashbank.newOperation")}
              </Button>
            </>
          )}
        </Box>
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "liquid", label: t("cashbank.kpi.liquid"), value: compactSum(s.liquidBalance, t), hint: t("cashbank.kpi.liquidHint", { count: s.accountsCount }), tone: s.liquidBalance < 0 ? "error" : null },
                { key: "escrow", label: t("cashbank.kpi.escrow"), value: compactSum(s.escrowBalance, t), hint: t("cashbank.kpi.escrowHint") },
                { key: "inflow", label: t("cashbank.kpi.inflow", { days: s.period || period }), value: compactSum(s.inflow, t), hint: t("cashbank.kpi.ops", { count: s.inflowCount }), tone: s.inflow > 0 ? "success" : null },
                { key: "outflow", label: t("cashbank.kpi.outflow", { days: s.period || period }), value: compactSum(s.outflow, t), hint: t("cashbank.kpi.net", { value: `${s.net > 0 ? "+" : ""}${s.net < 0 ? "−" : ""}${compactSum(Math.abs(s.net), t)}` }) },
              ]
            : null
        }
      />

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" }, alignItems: "start" }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ mb: 1.25 }}>
            <PillTabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "operations", label: t("cashbank.tabs.operations"), count: s?.opsCount ?? null },
                { key: "accounts", label: t("cashbank.tabs.accounts"), count: accounts.data?.length ?? null },
                { key: "articles", label: t("cashbank.tabs.articles") },
              ]}
            />
          </Box>

          {tab === "operations" && (
            <>
              <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
                <TextField
                  select
                  size="small"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value === "" ? "" : Number(e.target.value))}
                  SelectProps={{ displayEmpty: true }}
                  sx={{ minWidth: 200, flex: { xs: "1 1 100%", sm: "0 1 260px" }, "& .MuiInputBase-root": { height: 32, fontSize: "0.875rem" } }}
                  inputProps={{ "aria-label": t("common.account") }}
                >
                  <MenuItem value="">{t("cashbank.filters.allAccounts")}</MenuItem>
                  {(accounts.data ?? []).map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.name}
                    </MenuItem>
                  ))}
                </TextField>
                <Box sx={{ display: "flex", gap: 0.25 }}>
                  {(["all", "in", "out"] as const).map((key) => (
                    <SubPill key={key} active={type === key} onClick={() => setType(key)} label={t(`cashbank.filters.type_${key}`)} />
                  ))}
                </Box>
                <Box sx={{ display: "flex", gap: 0.25 }}>
                  {(["done", "cancelled", "all"] as const).map((key) => (
                    <SubPill key={key} active={status === key} onClick={() => setStatus(key)} label={t(`cashbank.filters.status_${key}`)} />
                  ))}
                </Box>
                <Box sx={{ ml: { md: "auto" }, flex: { xs: "1 1 100%", md: "0 1 300px" }, display: "flex" }}>
                  <SearchBox value={search} onChange={setSearch} placeholder={t("cashbank.filters.search")} />
                </Box>
              </Box>
              <Box sx={{ ...cardSx, overflow: "hidden" }}>
                <OperationsGrid rows={shown} loading={operations.isFetching} empty={filtered ? t("common.emptyFiltered") : t("common.empty")} onOpen={(row) => openOperation(row.id)} />
                {rows.length > PAGE && (
                  <Box sx={{ px: 2, py: 1.25, display: "flex", alignItems: "center", gap: 1, borderTop: 1, borderColor: "divider" }}>
                    <Typography sx={{ flex: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("cashbank.shown", { shown: shown.length, total: rows.length })}</Typography>
                    {!showAll && (
                      <Button size="small" onClick={() => setShowAll(true)}>
                        {t("cashbank.showAll")}
                      </Button>
                    )}
                  </Box>
                )}
              </Box>
            </>
          )}

          {tab === "accounts" && (
            <AccountCards
              accounts={accounts.data}
              days={period}
              canManage={canManage}
              onEscrow={setEscrowId}
              onTransfer={(id) => setTransferFrom({ id })}
              onOperations={(id) => {
                setAccountId(id);
                setTab("operations");
              }}
            />
          )}

          {tab === "articles" && <ArticlesView data={byArticle.data} loading={byArticle.isLoading} error={byArticle.error} onRetry={() => void byArticle.refetch()} />}
        </Box>

        <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
          <Box sx={{ ...cardSx, minWidth: 0 }}>
            <CardHeader title={t("cashbank.accounts.title")} />
            <Box sx={{ px: 2.25, pb: 1.5 }}>
              {!accounts.data && <Skeleton variant="rounded" height={160} />}
              {accounts.data?.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("cashbank.accounts.empty")}</Typography>}
              {accounts.data?.map((a) => (
                <Box key={a.id} sx={{ py: 0.9, display: "flex", alignItems: "baseline", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600, color: a.isActive ? "text.primary" : "text.disabled" }}>
                      {a.name}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {[a.typeLabel, a.bank].filter(Boolean).join(" · ")}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{accountAmount(a)}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ ...cardSx, minWidth: 0 }}>
            <CardHeader
              title={t("cashbank.upcoming.title")}
              subtitle={t("cashbank.upcoming.subtitle")}
              action={
                <Button size="small" onClick={() => navigate("/finance/paycal")} sx={{ whiteSpace: "nowrap" }}>
                  {t("cashbank.upcoming.all")}
                </Button>
              }
            />
            <Box sx={{ px: 2.25, pb: 1.5 }}>
              {upcoming.isLoading && <Skeleton variant="rounded" height={120} />}
              {upcoming.data && upcoming.data.items.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("cashbank.upcoming.empty")}</Typography>}
              {upcoming.data?.items.slice(0, 5).map((item) => (
                <ButtonBase
                  key={item.key}
                  onClick={() => (item.kind === "billing" && item.billingAccountId ? navigate(`/finance/billing?account=${item.billingAccountId}`) : navigate(item.id ? `/finance/paycal?payment=${item.id}` : "/finance/paycal"))}
                  sx={{ width: "100%", py: 0.9, display: "flex", alignItems: "baseline", gap: 1, textAlign: "left", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}
                >
                  <Typography sx={{ width: 44, flexShrink: 0, fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{shortDate(item.date)}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                      {item.counterparty || item.title}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {item.title}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: item.type === "in" ? "success.main" : "text.primary" }}>
                    {signedSum(item.type, item.amount)}
                  </Typography>
                </ButtonBase>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>

      <OperationDrawer id={operationId} preview={rows.find((row) => row.id === operationId) ?? null} canManage={canManage} onClose={() => openOperation(null)} />
      <NewOperationDrawer open={newOperation} onClose={() => setNewOperation(false)} />
      <TransferDrawer open={transferFrom != null} fromId={transferFrom?.id ?? null} onClose={() => setTransferFrom(null)} />
      <EscrowDialog accountId={escrowId} onClose={() => setEscrowId(null)} />
    </>
  );
}

const accountAmount = (a: TreasuryAccount) => (a.currency === "KGS" ? formatKGS(a.balance) : `${a.fx.toLocaleString("ru-RU")} ${a.currency === "USD" ? "$" : a.currency}`);

function OperationsGrid({ rows, loading, empty, onOpen }: { rows: CashOperation[]; loading: boolean; empty: string; onOpen: (row: CashOperation) => void }) {
  const currencyOf = useAccountCurrency();
  const { t } = useT("realtyFinance");
  const columns: GridColDef<CashOperation>[] = [
    { field: "date", headerName: t("cashbank.table.date"), width: 104, renderCell: ({ row }) => <TwoLines top={shortDate(row.date)} bottom={row.number} /> },
    {
      field: "doc",
      headerName: t("cashbank.table.operation"),
      flex: 1.4,
      minWidth: 200,
      renderCell: ({ row }) => (
        <TwoLines
          strong
          top={row.doc || row.articleName || "—"}
          bottom={[row.note, row.isTransfer && t("cashbank.table.transfer"), row.status === "cancelled" && t("cashbank.table.cancelled")].filter(Boolean).join(" · ") || null}
        />
      ),
    },
    { field: "counterparty", headerName: t("cashbank.table.counterparty"), flex: 1, minWidth: 160, renderCell: ({ row }) => <TwoLines top={row.counterparty || "—"} /> },
    { field: "articleName", headerName: t("cashbank.table.article"), flex: 1, minWidth: 150, renderCell: ({ row }) => <TwoLines top={row.articleName || "—"} /> },
    { field: "projectName", headerName: t("cashbank.table.project"), width: 150, renderCell: ({ row }) => <TwoLines top={row.projectName ?? t("common.company")} /> },
    { field: "accountName", headerName: t("cashbank.table.account"), width: 170, renderCell: ({ row }) => <TwoLines top={row.accountName || "—"} /> },
    {
      field: "amount",
      headerName: t("cashbank.table.amount"),
      width: 150,
      align: "right",
      headerAlign: "right",
      renderCell: ({ row }) => (
        <Typography
          sx={{
            width: "100%",
            textAlign: "right",
            fontSize: "0.875rem",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: row.status === "cancelled" ? "text.disabled" : row.type === "in" ? "success.main" : "text.primary",
            textDecoration: row.status === "cancelled" ? "line-through" : "none",
          }}
        >
          {signedSum(row.type, row.amount, currencyOf(row.accountId))}
        </Typography>
      ),
    },
  ];
  return (
    <DataGrid<CashOperation>
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

function Sparkline({ values, negative }: { values: number[]; negative: boolean }) {
  const theme = useTheme();
  if (values.length < 2) return <Box sx={{ height: 40 }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 200;
  const h = 40;
  const y = (v: number) => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
  const points = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <Box component="svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" sx={{ width: "100%", height: 40, display: "block" }} aria-hidden>
      <polyline points={points} fill="none" stroke={negative ? theme.palette.error.main : theme.palette.primary.main} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </Box>
  );
}

function AccountCards({
  accounts,
  days,
  canManage,
  onEscrow,
  onTransfer,
  onOperations,
}: {
  accounts: TreasuryAccount[] | undefined;
  days: number;
  canManage: boolean;
  onEscrow: (id: number) => void;
  onTransfer: (id: number) => void;
  onOperations: (id: number) => void;
}) {
  const { t } = useT("realtyFinance");
  if (!accounts) return <Skeleton variant="rounded" height={220} />;
  if (accounts.length === 0) return <EmptyNote text={t("cashbank.accounts.empty")} />;
  return (
    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" } }}>
      {accounts.map((a) => (
        <Box key={a.id} sx={{ ...cardSx, p: 2, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.75, opacity: a.isActive ? 1 : 0.6 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: "0.875rem", fontWeight: 700 }}>
              {a.name}
            </Typography>
            <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", whiteSpace: "nowrap" }}>{a.isActive ? a.typeLabel : t("cashbank.accounts.inactive")}</Typography>
          </Box>
          <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {[a.bank, a.number].filter(Boolean).join(" · ") || "—"}
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: "1.35rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: a.balance < 0 ? "error.main" : "text.primary" }}>{accountAmount(a)}</Typography>
          {a.currency !== "KGS" && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("cashbank.accounts.rate", { value: formatKGS(a.balance), rate: a.rate.toLocaleString("ru-RU") })}</Typography>}
          {a.projectName && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{a.projectName}</Typography>}
          <Sparkline values={a.series} negative={a.balance < 0} />
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
            <ButtonBase onClick={() => onOperations(a.id)} sx={{ flex: 1, minWidth: 0, justifyContent: "flex-start", fontSize: "0.75rem", color: "text.secondary", "&:hover": { color: "text.primary" } }}>
              {t("cashbank.accounts.ops", { days, ops: t("cashbank.kpi.ops", { count: a.periodOpsCount }) })}
            </ButtonBase>
            {a.type === "escrow" ? (
              <Button size="small" onClick={() => onEscrow(a.id)}>
                {t("cashbank.accounts.escrowTerms")}
              </Button>
            ) : (
              canManage &&
              a.isActive && (
                <Button size="small" startIcon={<SwapHorizOutlined />} onClick={() => onTransfer(a.id)}>
                  {t("cashbank.accounts.transfer")}
                </Button>
              )
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function ArticlesView({ data, loading, error, onRetry }: { data: Awaited<ReturnType<typeof getCashByArticle>> | undefined; loading: boolean; error: unknown; onRetry: () => void }) {
  const { t } = useT("realtyFinance");
  const theme = useTheme();
  if (error) return <ScreenError error={error} onRetry={onRetry} />;
  if (loading || !data) return <Skeleton variant="rounded" height={320} />;
  const weeks = data.weeks.map((w) => ({ label: `${shortDate(w.start)}–${shortDate(w.end)}`, in: w.in, out: w.out }));
  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" } }}>
      <Box sx={{ ...cardSx, minWidth: 0 }}>
        <CardHeader title={t("cashbank.articles.inflow")} subtitle={formatKGS(data.inflowTotal)} />
        <AmountBars tone="success" empty={t("cashbank.articles.empty")} items={data.inflow.map((a) => ({ key: a.article, label: a.articleName, amount: a.amount }))} />
      </Box>
      <Box sx={{ ...cardSx, minWidth: 0 }}>
        <CardHeader title={t("cashbank.articles.outflow")} subtitle={formatKGS(data.outflowTotal)} />
        <AmountBars tone="error" empty={t("cashbank.articles.empty")} items={data.outflow.map((a) => ({ key: a.article, label: a.articleName, amount: a.amount }))} />
      </Box>
      <Box sx={{ ...cardSx, minWidth: 0 }}>
        <CardHeader title={t("cashbank.articles.weeks")} />
        <Box sx={{ px: 1, pb: 2, height: 240 }}>
          {weeks.length === 0 ? (
            <EmptyNote text={t("cashbank.articles.empty")} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v: number) => compactSum(v, t)} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} width={64} />
                <Tooltip
                  formatter={(value, name) => [formatKGS(Number(value)), name === "in" ? t("common.income") : t("common.expense")]}
                  contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: theme.palette.action.hover }}
                />
                <Bar dataKey="in" fill={theme.palette.success.main} radius={[4, 4, 0, 0]} />
                <Bar dataKey="out" fill={theme.palette.error.main} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Box>
      </Box>
      <Box sx={{ ...cardSx, minWidth: 0 }}>
        <CardHeader title={t("cashbank.articles.byProject")} />
        <AmountBars
          empty={t("cashbank.articles.empty")}
          items={[
            ...data.byProject.map((p) => ({ key: String(p.projectId ?? p.projectName), label: p.projectName, amount: p.amount })),
            ...(data.companyOutflow > 0 ? [{ key: "company", label: t("cashbank.articles.companyOutflow"), amount: data.companyOutflow }] : []),
          ]}
        />
      </Box>
    </Box>
  );
}
