import React from "react";
import { Box, Button, IconButton, ListItemText, Menu, MenuItem, Skeleton, Tooltip, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CampaignOutlined from "@mui/icons-material/CampaignOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";

import { createReconciliationAct } from "../../api/edo";
import { collectionCounters, getDebtSummary, getDebts, matchesDebtSearch, remindAllReceivables, remindReceivable, treasuryKeys, type Debt, type DebtDirection, type DebtSummary } from "../../api/treasury";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { cardSx } from "../estate-dashboard/format";
import { CardHeader, KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { compactSum, fullDate, reconPeriod } from "./format";
import { useRefreshTreasury } from "./hooks";
import { NewDebtDrawer, PayDebtDialog } from "./ReceivablesForms";
import { AmountBars, PillTabs, TwoLines } from "./shared";

const CHANNELS = ["whatsapp", "sms", "call"] as const;

/**
 * «Дебиторка / кредиторка» застройщика (AIVIO, гайд `frontend-finance.md` §5):
 * «Нам должны» (взносы рассрочки + прочие долги) и «Мы должны» (акты, счета,
 * налоги, удержания), aging, напоминания. Вкладка — `?tab=payable`.
 * Действия — `treasury.manage`, «Сверка» — `edo.manage`.
 */
export default function ReceivablesPage() {
  const { t } = useT("realtyFinance");
  usePageTitle(t("receivables.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <ReceivablesScreen />
    </Box>
  );
}

function ReceivablesScreen() {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("treasury.manage");
  const canRecon = useCan("edo.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: DebtDirection = searchParams.get("tab") === "payable" ? "payable" : "receivable";
  const [search, setSearch] = React.useState("");
  const [paying, setPaying] = React.useState<Debt | null>(null);
  const [newDebt, setNewDebt] = React.useState(false);
  const enabled = scope.orgReady !== false;

  const receivable = useQuery({ queryKey: treasuryKeys.debtSummary(scope, "receivable"), queryFn: ({ signal }) => getDebtSummary("receivable", scope, signal), enabled, staleTime: 30_000 });
  const payable = useQuery({ queryKey: treasuryKeys.debtSummary(scope, "payable"), queryFn: ({ signal }) => getDebtSummary("payable", scope, signal), enabled, staleTime: 30_000 });
  const debts = useQuery({ queryKey: treasuryKeys.debts(scope, tab), queryFn: ({ signal }) => getDebts(tab, scope, signal), enabled, staleTime: 30_000 });

  const onError = (error: unknown) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" });
  const remindAll = useMutation({
    mutationFn: () => remindAllReceivables(scope),
    onSuccess: ({ count }) => {
      refresh();
      enqueueSnackbar(count > 0 ? t("receivables.remindAllDone", { count }) : t("receivables.remindAllNone"), { variant: count > 0 ? "success" : "info" });
    },
    onError,
  });
  const remind = useMutation({
    mutationFn: ({ debt, channel }: { debt: Debt; channel: (typeof CHANNELS)[number] }) => remindReceivable(debt.billingAccountId as number, channel, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("receivables.actions.reminded"), { variant: "success" });
    },
    onError,
  });
  const recon = useMutation({
    mutationFn: (debt: Debt) => createReconciliationAct(debt.counterparty, reconPeriod(), scope),
    onSuccess: (doc) => {
      enqueueSnackbar(t("receivables.actions.reconCreated"), { variant: "success" });
      navigate(`/edo?doc=${doc.id}`);
    },
    onError,
  });

  const error = receivable.error ?? payable.error ?? debts.error;
  if (error) {
    return (
      <ScreenError
        error={error}
        title={t("receivables.loadError")}
        onRetry={() => {
          void receivable.refetch();
          void payable.refetch();
          void debts.refetch();
        }}
      />
    );
  }

  const r = receivable.data;
  const p = payable.data;
  const current = tab === "receivable" ? r : p;
  const rows = (debts.data ?? []).filter((d) => matchesDebtSearch(d, search));
  const setTab = (next: DebtDirection) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "payable") params.set("tab", "payable");
        else params.delete("tab");
        return params;
      },
      { replace: true },
    );

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("receivables.subtitle")}</Typography>
      <KpiCards
        items={
          r && p
            ? [
                { key: "receivable", label: t("receivables.kpi.receivable"), value: compactSum(r.total, t), hint: t("receivables.kpi.counterparties", { count: r.counterpartyCount }) },
                { key: "overdue", label: t("receivables.kpi.overdue"), value: compactSum(r.overdueTotal, t), hint: t("receivables.kpi.positions", { count: r.overdueCount }), tone: r.overdueTotal > 0 ? "error" : null },
                { key: "payable", label: t("receivables.kpi.payable"), value: compactSum(p.total, t), hint: t("receivables.kpi.obligations", { count: p.count }) },
                { key: "payableOverdue", label: t("receivables.kpi.payableOverdue"), value: compactSum(p.overdueTotal, t), hint: t("receivables.kpi.positions", { count: p.overdueCount }), tone: p.overdueTotal > 0 ? "error" : null },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <PillTabs<DebtDirection>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "receivable", label: t("receivables.tabs.receivable"), count: r?.count ?? null },
            { key: "payable", label: t("receivables.tabs.payable"), count: p?.count ?? null },
          ]}
        />
        <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
          <SearchBox value={search} onChange={setSearch} placeholder={t("receivables.search")} />
          {canManage && tab === "receivable" && (
            <Button size="small" variant="outlined" startIcon={<CampaignOutlined />} onClick={() => remindAll.mutate()} disabled={remindAll.isPending} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
              {t("receivables.remindAll")}
            </Button>
          )}
          {canManage && (
            <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setNewDebt(true)} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
              {t("receivables.newDebt")}
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" }, alignItems: "start" }}>
        <Box sx={{ ...cardSx, overflow: "hidden", minWidth: 0 }}>
          <DebtsGrid
            rows={rows}
            loading={debts.isFetching}
            filtered={Boolean(search.trim())}
            canManage={canManage}
            canRecon={canRecon}
            busy={remind.isPending || recon.isPending}
            onBilling={(d) => navigate(`/finance/billing?account=${d.billingAccountId}`)}
            onRemind={(debt, channel) => remind.mutate({ debt, channel })}
            onPay={setPaying}
            onRecon={(d) => recon.mutate(d)}
          />
        </Box>
        <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
          <Aging summary={current} />
          {tab === "payable" ? <ByType summary={p} /> : <Collection debts={debts.data} />}
        </Box>
      </Box>

      <PayDebtDialog debt={paying} onClose={() => setPaying(null)} />
      <NewDebtDrawer open={newDebt} direction={tab} onClose={() => setNewDebt(false)} />
    </>
  );
}

function overdueText(days: number, t: (key: string, opts?: Record<string, unknown>) => string) {
  if (days > 0) return t("receivables.table.late", { days: t("common.days", { count: days }) });
  if (days === 0) return t("receivables.table.todayDue");
  return t("receivables.table.in", { days: t("common.days", { count: -days }) });
}

function DebtsGrid({
  rows,
  loading,
  filtered,
  canManage,
  canRecon,
  busy,
  onBilling,
  onRemind,
  onPay,
  onRecon,
}: {
  rows: Debt[];
  loading: boolean;
  filtered: boolean;
  canManage: boolean;
  canRecon: boolean;
  busy: boolean;
  onBilling: (debt: Debt) => void;
  onRemind: (debt: Debt, channel: (typeof CHANNELS)[number]) => void;
  onPay: (debt: Debt) => void;
  onRecon: (debt: Debt) => void;
}) {
  const { t } = useT("realtyFinance");
  const [menu, setMenu] = React.useState<{ anchor: HTMLElement; debt: Debt } | null>(null);
  const columns: GridColDef<Debt>[] = [
    {
      field: "counterparty",
      headerName: t("receivables.table.counterparty"),
      flex: 1.3,
      minWidth: 200,
      renderCell: ({ row }) => (
        <TwoLines
          strong
          top={row.counterparty || "—"}
          bottom={
            <>
              {row.phone ? formatPhoneDisplay(row.phone) : null}
              {row.retention && (
                <Box component="span" sx={{ ml: row.phone ? 0.75 : 0, color: "info.main" }}>
                  {t("receivables.table.retention")}
                </Box>
              )}
              {row.disputed && (
                <Box component="span" sx={{ ml: row.phone || row.retention ? 0.75 : 0, color: "error.main", fontWeight: 700 }}>
                  {t("receivables.table.disputed")}
                </Box>
              )}
              {!row.phone && !row.retention && !row.disputed && row.lastReminder ? t("receivables.table.reminded", { date: fullDate(row.lastReminder) }) : null}
            </>
          }
        />
      ),
    },
    { field: "doc", headerName: t("receivables.table.basis"), flex: 1, minWidth: 160, renderCell: ({ row }) => <TwoLines top={row.typeLabel || "—"} bottom={row.doc || row.number || null} /> },
    { field: "projectName", headerName: t("receivables.table.project"), width: 150, renderCell: ({ row }) => <TwoLines top={row.projectName ?? t("common.company")} /> },
    { field: "due", headerName: t("receivables.table.due"), width: 110, renderCell: ({ row }) => <TwoLines top={fullDate(row.due)} /> },
    {
      field: "days",
      headerName: t("receivables.table.overdue"),
      width: 130,
      renderCell: ({ row }) => (
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: row.days > 0 ? 700 : 400, color: row.days > 60 ? "error.main" : row.days > 0 ? "warning.main" : "text.secondary", whiteSpace: "nowrap" }}>
          {overdueText(row.days, t)}
        </Typography>
      ),
    },
    {
      field: "amount",
      headerName: t("receivables.table.amount"),
      width: 140,
      align: "right",
      headerAlign: "right",
      renderCell: ({ row }) => <Typography sx={{ width: "100%", textAlign: "right", fontSize: "0.875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatKGS(row.amount)}</Typography>,
    },
    {
      field: "actions",
      headerName: "",
      width: 160,
      sortable: false,
      renderCell: ({ row }) => {
        const billing = row.source === "billing" && row.billingAccountId != null;
        const payable = row.source === "debt" && row.direction === "payable" && canManage;
        const hasMenu = (billing && canManage) || (!billing && canRecon);
        return (
          <Box sx={{ width: "100%", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 0.5 }}>
            {billing && (
              <Button size="small" onClick={() => onBilling(row)}>
                {t("receivables.actions.billing")}
              </Button>
            )}
            {payable && (
              <Button size="small" variant="outlined" onClick={() => onPay(row)}>
                {t("receivables.actions.pay")}
              </Button>
            )}
            {hasMenu && (
              <Tooltip title={t("receivables.actions.more")}>
                <IconButton size="small" aria-label={t("receivables.actions.more")} disabled={busy} onClick={(e) => setMenu({ anchor: e.currentTarget, debt: row })}>
                  <MoreVertOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        );
      },
    },
  ];
  const menuDebt = menu?.debt;
  const menuBilling = menuDebt?.source === "billing" && menuDebt.billingAccountId != null;
  return (
    <>
      <DataGrid<Debt>
        rows={rows}
        columns={columns}
        getRowId={(row) => row.key}
        loading={loading && rows.length === 0}
        localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: filtered ? t("common.emptyFiltered") : t("common.empty") }}
        getRowHeight={() => "auto"}
        disableRowSelectionOnClick
        disableColumnMenu
        autoHeight
        initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
        pageSizeOptions={[25, 50, 100]}
        sx={{ border: 0, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
      />
      <Menu anchorEl={menu?.anchor} open={menu != null} onClose={() => setMenu(null)}>
        {menuBilling &&
          canManage &&
          CHANNELS.map((channel) => (
            <MenuItem
              key={channel}
              onClick={() => {
                if (menuDebt) onRemind(menuDebt, channel);
                setMenu(null);
              }}
            >
              <ListItemText primary={`${t("receivables.actions.remind")} · ${t(`receivables.actions.channel_${channel}`)}`} />
            </MenuItem>
          ))}
        {!menuBilling && canRecon && (
          <MenuItem
            onClick={() => {
              if (menuDebt) onRecon(menuDebt);
              setMenu(null);
            }}
          >
            <ListItemText primary={t("receivables.actions.recon")} />
          </MenuItem>
        )}
      </Menu>
    </>
  );
}

function Aging({ summary }: { summary: DebtSummary | undefined }) {
  const { t } = useT("realtyFinance");
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("receivables.aging.title")} subtitle={summary ? formatKGS(summary.total) : undefined} />
      {summary ? (
        <AmountBars
          tone={summary.direction === "payable" ? "warning" : "error"}
          empty={t("receivables.aging.empty")}
          items={summary.aging.map((a) => ({ key: a.bucket, label: a.label, amount: a.amount }))}
        />
      ) : (
        <Box sx={{ px: 2.25, pb: 2 }}>
          <Skeleton variant="rounded" height={140} />
        </Box>
      )}
    </Box>
  );
}

function ByType({ summary }: { summary: DebtSummary | undefined }) {
  const { t } = useT("realtyFinance");
  if (!summary) return null;
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("receivables.byType.title")} />
      <AmountBars empty={t("receivables.aging.empty")} items={summary.byType.map((b) => ({ key: b.type, label: b.typeLabel, amount: b.amount }))} />
    </Box>
  );
}

function Collection({ debts }: { debts: Debt[] | undefined }) {
  const { t } = useT("realtyFinance");
  if (!debts) return null;
  const c = collectionCounters(debts);
  const rows = [
    { key: "soon", label: t("receivables.collection.soon"), value: c.soon, tone: "info.main" },
    { key: "early", label: t("receivables.collection.early"), value: c.early, tone: "warning.main" },
    { key: "late", label: t("receivables.collection.late"), value: c.late, tone: "error.main" },
  ];
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("receivables.collection.title")} subtitle={t("receivables.collection.hint")} />
      <Box sx={{ px: 2.25, pb: 1.5 }}>
        {rows.map((row) => (
          <Box key={row.key} sx={{ py: 0.9, display: "flex", alignItems: "baseline", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
            <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }}>{row.label}</Typography>
            <Typography sx={{ fontSize: "1rem", fontWeight: 700, color: row.value > 0 ? row.tone : "text.secondary", fontVariantNumeric: "tabular-nums" }}>{row.value}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
