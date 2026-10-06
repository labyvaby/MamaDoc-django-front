import React from "react";
import { Box, Button, ButtonBase, Skeleton, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import AddOutlined from "@mui/icons-material/AddOutlined";

import {
  MORTGAGE_STATUSES,
  calculateMortgage,
  getBanks,
  getMortgageApplications,
  getMortgageSummary,
  matchesApplication,
  realtyMortgageKeys,
  type Bank,
  type CalculatorParams,
  type MortgageApplication,
  type MortgageStatus,
  type MortgageSummary,
} from "../../api/realtyMortgage";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import { cardSx, compactMoney } from "../estate-dashboard/format";
import { parseAmount } from "./catalogFormat";
import { initials } from "./format";
import { BankDecisionChip, MortgageStatusPill } from "./MortgageChips";
import { MortgageDrawer } from "./MortgageDrawer";
import { NewMortgageDrawer, type MortgagePreset } from "./NewMortgageDrawer";
import { CardHeader, KpiCards, ScreenError, SearchBox } from "./shared";
import { useIdParam } from "./useLeadParam";

type Tab = "applications" | "calculator" | "banks";

/**
 * «Ипотека и банки» застройщика (AIVIO, гайд `frontend-sales.md` §8): KPI и
 * воронка — `/mortgage-applications/summary/`, заявки — одним списком со
 * срезами на клиенте, карточка — шторка `?application=<id>`, калькулятор —
 * `/mortgage/calculator/`, банки — `/banks/`. Менять — `realty.manage`.
 */
export default function RealtyMortgagePage() {
  const { t } = useT("realtySales");
  usePageTitle(t("mortgage.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <MortgageScreen />
    </Box>
  );
}

function MortgageScreen() {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const canManage = useCan("realty.manage");
  const [applicationId, openApplication] = useIdParam("application");
  const [tab, setTab] = React.useState<Tab>("applications");
  const [status, setStatus] = React.useState<MortgageStatus | "all">("all");
  const [search, setSearch] = React.useState("");
  const [preset, setPreset] = React.useState<MortgagePreset | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const enabled = scope.orgReady !== false;

  const summary = useQuery({ queryKey: realtyMortgageKeys.summary(scope), queryFn: ({ signal }) => getMortgageSummary(scope, signal), enabled, staleTime: 30_000 });
  const list = useQuery({ queryKey: realtyMortgageKeys.list(scope), queryFn: ({ signal }) => getMortgageApplications(scope, signal), enabled, staleTime: 30_000 });
  const banks = useQuery({ queryKey: realtyMortgageKeys.banks(scope), queryFn: ({ signal }) => getBanks(scope, signal), enabled, staleTime: 5 * 60_000 });

  const error = list.error ?? summary.error;
  if (error) {
    return (
      <ScreenError
        error={error}
        title={t("mortgage.loadError")}
        onRetry={() => {
          void list.refetch();
          void summary.refetch();
        }}
      />
    );
  }

  const s = summary.data;
  const all = list.data;
  const rows = (all ?? []).filter((app) => (status === "all" || app.status === status) && matchesApplication(app, search));
  const create = (next: MortgagePreset | null) => {
    setPreset(next);
    setCreateOpen(true);
  };

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("mortgage.subtitle")}</Typography>
      <KpiCards
        items={
          s
            ? [
                { key: "inWork", label: t("mortgage.kpi.inWork"), value: String(s.inWork), hint: t("mortgage.kpi.waiting", { count: s.waitingBanks }) },
                { key: "approved", label: t("mortgage.kpi.approved"), value: String(s.approvedMonth), hint: compactMoney(s.approvedMonthAmount, t), tone: s.approvedMonth > 0 ? "success" : null },
                { key: "rate", label: t("mortgage.kpi.rate"), value: `${formatPct(s.approvalRate)}%`, hint: t("mortgage.kpi.decisions", { count: s.decisions }) },
                { key: "avgRate", label: t("mortgage.kpi.avgRate"), value: s.averageRate != null ? `${formatPct(s.averageRate)}%` : "—", hint: t("mortgage.kpi.avgRateHint") },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.5, pr: 0.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
        {(["applications", "calculator", "banks"] as const).map((key) => (
          <ButtonBase key={key} aria-pressed={tab === key} onClick={() => setTab(key)} sx={(th) => ({ ...pillSx(th, tab === key), whiteSpace: "nowrap" })}>
            {t(`mortgage.tabs.${key}`)}
            {key === "applications" && all ? ` · ${all.length}` : key === "banks" && banks.data ? ` · ${banks.data.length}` : ""}
          </ButtonBase>
        ))}
        {tab === "applications" && (
          <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
            <SearchBox value={search} onChange={setSearch} placeholder={t("mortgage.search")} />
            {canManage && (
              <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => create(null)} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                {t("mortgage.new")}
              </Button>
            )}
          </Box>
        )}
      </Box>

      {tab === "applications" && (
        <>
          <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {(["all", ...MORTGAGE_STATUSES] as const).map((key) => {
              const count = all ? (key === "all" ? all.length : all.filter((app) => app.status === key).length) : null;
              return (
                <ButtonBase
                  key={key}
                  aria-pressed={status === key}
                  onClick={() => setStatus(key)}
                  sx={(th) => ({
                    px: 1.25,
                    py: 0.4,
                    borderRadius: "8px",
                    fontSize: "0.8125rem",
                    whiteSpace: "nowrap",
                    color: status === key ? "text.primary" : "text.secondary",
                    fontWeight: status === key ? 700 : 500,
                    bgcolor: status === key ? subtleBg(th, true) : "transparent",
                  })}
                >
                  {t(`mortgage.status.${key}`)}
                  {count != null ? ` · ${count}` : ""}
                </ButtonBase>
              );
            })}
          </Box>
          <Box sx={{ display: "grid", gap: 1.5, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" } }}>
            <Box sx={{ ...cardSx, overflow: "hidden", minWidth: 0 }}>
              <ApplicationsGrid rows={rows} loading={list.isFetching && !all} filtered={status !== "all" || Boolean(search.trim())} onOpen={openApplication} />
            </Box>
            <Box sx={{ display: "grid", gap: 1.5, minWidth: 0 }}>
              <FunnelCard summary={s} />
              <BanksPanel banks={banks.data} />
            </Box>
          </Box>
        </>
      )}
      {tab === "calculator" && <Calculator canCreate={canManage} onCreate={(next) => create(next)} />}
      {tab === "banks" && <BanksGrid banks={banks.data} />}

      <MortgageDrawer applicationId={applicationId} onClose={() => openApplication(null)} />
      {canManage && (
        <NewMortgageDrawer
          open={createOpen}
          preset={preset}
          onClose={() => setCreateOpen(false)}
          onCreated={(app) => {
            setCreateOpen(false);
            setTab("applications");
            openApplication(app.id);
          }}
        />
      )}
    </>
  );
}

/** 75 → «75», 15.77 → «15,77». */
const formatPct = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function ApplicationsGrid({ rows, loading, filtered, onOpen }: { rows: MortgageApplication[]; loading: boolean; filtered: boolean; onOpen: (id: number) => void }) {
  const { t } = useT("realtySales");
  const columns: GridColDef<MortgageApplication>[] = [
    {
      field: "buyer",
      headerName: t("mortgage.table.buyer"),
      flex: 1.3,
      minWidth: 200,
      renderCell: ({ row }) => (
        <Box sx={{ py: 1, minWidth: 0, display: "flex", gap: 1.25, alignItems: "center" }}>
          <Box
            aria-hidden
            sx={(th) => ({ width: 32, height: 32, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "0.72rem", fontWeight: 700, bgcolor: subtleBg(th, true), color: "text.secondary" })}
          >
            {initials(row.buyer)}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
              {row.buyer}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {[row.number, row.manager].filter(Boolean).join(" · ")}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: "unitNumber",
      headerName: t("mortgage.table.unit"),
      flex: 0.9,
      minWidth: 130,
      renderCell: ({ row }) => (
        <Box sx={{ py: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: "0.875rem" }}>
            {row.unitNumber != null ? `№${row.unitNumber}` : "—"}
          </Typography>
          <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {row.projectName}
          </Typography>
        </Box>
      ),
    },
    {
      field: "amount",
      headerName: t("mortgage.table.amount"),
      width: 150,
      renderCell: ({ row }) => (
        <Box sx={{ py: 1 }}>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatKGS(row.amount)}</Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("mortgage.table.down", { pct: formatPct(row.downPct) })}</Typography>
        </Box>
      ),
    },
    { field: "term", headerName: t("mortgage.table.term"), width: 90, valueFormatter: (value: number) => (value ? t("mortgage.table.years", { count: value }) : "—") },
    { field: "programLabel", headerName: t("mortgage.table.program"), width: 140, valueFormatter: (value: string) => value || "—" },
    {
      field: "banks",
      headerName: t("mortgage.table.banks"),
      flex: 1.1,
      minWidth: 180,
      sortable: false,
      renderCell: ({ row }) =>
        row.banks.length ? (
          <Box sx={{ py: 1, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {row.banks.map((bank) => (
              <BankDecisionChip key={bank.bankId} bank={bank} compact />
            ))}
          </Box>
        ) : (
          <Typography sx={{ color: "text.disabled" }}>—</Typography>
        ),
    },
    { field: "status", headerName: t("mortgage.table.status"), width: 140, renderCell: ({ row }) => <MortgageStatusPill status={row.status} label={row.statusLabel} /> },
  ];
  return (
    <DataGrid<MortgageApplication>
      rows={rows}
      columns={columns}
      loading={loading}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: filtered ? t("mortgage.table.emptyFiltered") : t("mortgage.table.empty") }}
      getRowHeight={() => "auto"}
      onRowClick={({ row }) => onOpen(row.id)}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      hideFooter={rows.length <= 100}
      initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
      pageSizeOptions={[100]}
      sx={{ border: 0, "& .MuiDataGrid-row": { cursor: "pointer" }, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
    />
  );
}

const FUNNEL_TONE: Record<MortgageStatus, string> = {
  draft: "text.disabled",
  sent: "info.main",
  approved: "success.main",
  signed: "text.primary",
  rejected: "error.main",
};

function FunnelCard({ summary }: { summary: MortgageSummary | undefined }) {
  const { t } = useT("realtySales");
  const max = summary ? Math.max(1, ...MORTGAGE_STATUSES.map((key) => summary.funnel[key])) : 1;
  return (
    <Box sx={{ ...cardSx, pb: 2, minWidth: 0 }}>
      <CardHeader title={t("mortgage.funnel.title")} />
      {!summary ? (
        <Box sx={{ px: 2.25 }}>
          <Skeleton variant="rounded" height={120} />
        </Box>
      ) : (
        <Box sx={{ px: 2.25, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 1, alignItems: "end", height: 150 }}>
          {MORTGAGE_STATUSES.map((key) => {
            const value = summary.funnel[key];
            return (
              <Box key={key} sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, height: "100%", justifyContent: "flex-end", minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{value}</Typography>
                <Box sx={{ width: "100%", height: `${Math.max(4, (value / max) * 90)}px`, borderRadius: "6px", bgcolor: FUNNEL_TONE[key] }} />
                <Typography noWrap sx={{ maxWidth: "100%", fontSize: "0.68rem", color: "text.secondary" }}>
                  {t(`mortgage.statusOne.${key}`)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function BanksPanel({ banks }: { banks: Bank[] | undefined }) {
  const { t } = useT("realtySales");
  return (
    <Box sx={{ ...cardSx, pb: 1.5, minWidth: 0 }}>
      <CardHeader title={t("mortgage.banksPanel.title")} subtitle={t("mortgage.banksPanel.hint")} />
      <Box sx={{ px: 2.25, display: "grid", gap: 0.75 }}>
        {!banks && <Skeleton variant="rounded" height={96} />}
        {banks?.map((bank) => (
          <Box key={bank.id} sx={{ px: 1.25, py: 0.9, border: 1, borderColor: "divider", borderRadius: "10px", display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                {bank.name}
              </Typography>
              <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                {bank.approvalDays ? t("mortgage.banksPanel.days", { count: bank.approvalDays }) : ""}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatPct(bank.mortgageRate)}%</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function BanksGrid({ banks }: { banks: Bank[] | undefined }) {
  const { t } = useT("realtySales");
  if (!banks) return <Skeleton variant="rounded" height={200} />;
  return (
    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" } }}>
      {banks.map((bank) => (
        <Box key={bank.id} sx={{ ...cardSx, p: 2, display: "grid", gap: 1.25, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>{bank.name}</Typography>
            {bank.state && <Tag tone="info.main">{t("mortgage.bank.state")}</Tag>}
            {bank.partner && <Tag tone="success.main">{t("mortgage.bank.partner")}</Tag>}
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
            {(
              [
                ["rate", `${formatPct(bank.mortgageRate)}%`],
                ["maxTerm", bank.maxTerm ? t("mortgage.bank.years", { count: bank.maxTerm }) : "—"],
                ["minDown", `${formatPct(bank.minDown)}%`],
                ["approvalDays", bank.approvalDays ? t("mortgage.bank.days", { count: bank.approvalDays }) : "—"],
                ["applications", String(bank.applications)],
                ["approved", `${bank.approved} / ${bank.decided}`],
              ] as const
            ).map(([key, value]) => (
              <Box key={key} sx={{ px: 1.25, py: 0.75, border: 1, borderColor: "divider", borderRadius: "10px", minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                  {t(`mortgage.bank.${key}`)}
                </Typography>
                <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 700 }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function Tag({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <Box component="span" sx={(th) => ({ px: 0.9, py: 0.2, borderRadius: "999px", fontSize: "0.72rem", fontWeight: 600, color: tone, bgcolor: subtleBg(th, true), whiteSpace: "nowrap" })}>
      {children}
    </Box>
  );
}

function Calculator({ canCreate, onCreate }: { canCreate: boolean; onCreate: (preset: MortgagePreset) => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const [form, setForm] = React.useState({ price: "6 850 000", down: "30", years: "15", rate: "", income: "" });
  const debounced = useDebouncedValue(form);
  const params = React.useMemo<CalculatorParams | null>(() => {
    const price = parseAmount(debounced.price);
    const down = parseAmount(debounced.down);
    const years = parseAmount(debounced.years);
    if (!price || down == null || down >= 100 || !years) return null;
    return { price, down, years: Math.round(years), rate: parseAmount(debounced.rate), income: parseAmount(debounced.income) };
  }, [debounced]);
  const result = useQuery({
    queryKey: realtyMortgageKeys.calculator(scope, params as CalculatorParams),
    queryFn: ({ signal }) => calculateMortgage(params as CalculatorParams, scope, signal),
    enabled: params != null && scope.orgReady !== false,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const r = params ? result.data : undefined;
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <Box sx={{ display: "grid", gap: 1.5, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "380px minmax(0, 1fr)" } }}>
      <Box sx={{ ...cardSx, p: 2.25, display: "grid", gap: 1.75 }}>
        <TextField size="small" label={t("mortgage.calc.price")} value={form.price} onChange={set("price")} inputMode="decimal" />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <TextField size="small" label={t("mortgage.calc.down")} value={form.down} onChange={set("down")} inputMode="decimal" />
          <TextField size="small" label={t("mortgage.calc.years")} value={form.years} onChange={set("years")} inputMode="numeric" />
        </Box>
        <TextField size="small" label={t("mortgage.calc.rate")} value={form.rate} onChange={set("rate")} inputMode="decimal" helperText={t("mortgage.calc.rateHint")} />
        <TextField size="small" label={t("mortgage.calc.income")} value={form.income} onChange={set("income")} inputMode="decimal" helperText={t("mortgage.calc.incomeHint")} />
        {!params && <Typography sx={{ fontSize: "0.8125rem", color: "warning.main" }}>{t("mortgage.calc.invalid")}</Typography>}
        {canCreate && params && (
          <Button variant="contained" onClick={() => onCreate({ price: params.price, down: params.down, years: params.years, income: params.income ?? null })}>
            {t("mortgage.calc.create")}
          </Button>
        )}
      </Box>
      <Box sx={{ display: "grid", gap: 1.5, minWidth: 0 }}>
        <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" } }}>
          {(
            [
              ["downSum", r ? formatKGS(r.down) : null],
              ["amount", r ? formatKGS(r.amount) : null],
              ["monthly", r ? formatKGS(r.monthly) : null],
              ["total", r ? formatKGS(r.total) : null],
              ["over", r ? formatKGS(r.over) : null],
              ["load", r ? (r.load > 0 ? `${formatPct(r.load)}%` : "—") : null],
            ] as const
          ).map(([key, value]) => (
            <Box key={key} sx={{ ...cardSx, p: 1.75, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                {t(`mortgage.calc.${key}`)}
              </Typography>
              {value != null ? (
                <Typography noWrap sx={{ mt: 0.5, fontWeight: 700, fontSize: "1.15rem", fontVariantNumeric: "tabular-nums", color: key === "load" && r && r.load > 50 ? "error.main" : "text.primary" }}>
                  {value}
                </Typography>
              ) : (
                <Skeleton width="70%" height={30} />
              )}
            </Box>
          ))}
        </Box>
        <Box sx={{ ...cardSx, pb: 1, minWidth: 0 }}>
          <CardHeader title={t("mortgage.calc.banks")} />
          {r?.banks.length === 0 && <Typography sx={{ px: 2.25, pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("mortgage.calc.noBanks")}</Typography>}
          {r?.banks.map((bank) => (
            <Box key={bank.bankId} sx={{ px: 2.25, py: 1, display: "flex", alignItems: "center", gap: 1.5, borderTop: 1, borderColor: "divider" }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
                  {bank.name}
                </Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                  {formatPct(bank.rate)}% · {t("mortgage.table.years", { count: bank.term })}
                </Typography>
              </Box>
              <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatKGS(bank.monthly)}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
