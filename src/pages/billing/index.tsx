import React from "react";
import { Alert, Box, Button, ButtonBase, InputBase, LinearProgress, Skeleton, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import {
  BILLING_FILTERS,
  billingKeys,
  downloadBillingRegistry,
  getBillingAccounts,
  getBillingSummary,
  remindAllBilling,
  runBillingAutopay,
  type BillingAccount,
  type BillingFilter,
  type BillingSummary,
} from "../../api/billing";
import { ApiError, isModuleDisabled } from "../../api/client";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { pillSx } from "../../components/ui";
import { useCanChecker } from "../../hooks/useCan";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatDateRu, formatKGS } from "../../utility/format";
import { AccountDrawer } from "./AccountDrawer";
import { StateChip } from "./StateChip";
import { NewInstallmentDrawer } from "./NewInstallmentDrawer";

/**
 * «Финансы → Биллинг» застройщика: счета рассрочки, кто сколько заплатил,
 * кто просрочил; принять платёж, напомнить, отправить ссылку на оплату.
 * Смотреть — treasury.view или realty.view, действовать — *.manage
 * (бэк пускает по любому из двух). API — `src/api/billing.ts`.
 */
export default function BillingPage() {
  const { t } = useT("billing");
  usePageTitle(t("page.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <BillingScreen />
    </Box>
  );
}

const cardSx = { border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" } as const;

function BillingScreen() {
  const { t } = useT("billing");
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const scope = useRealtyScope();
  const { can } = useCanChecker();
  const canManage = can("treasury.manage") || can("realty.manage");

  const [searchParams, setSearchParams] = useSearchParams();
  const accountId = Number(searchParams.get("account")) || null;
  const openAccount = (id: number | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("account", String(id));
        else next.delete("account");
        return next;
      },
      { replace: true },
    );

  const [filter, setFilter] = React.useState<BillingFilter>("all");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = React.useState(false);
  const listParams = React.useMemo(() => ({ filter, search: debouncedSearch }), [filter, debouncedSearch]);

  const enabled = scope.orgReady !== false;
  const summaryQuery = useQuery({
    queryKey: billingKeys.summary(scope),
    queryFn: ({ signal }) => getBillingSummary(scope, signal),
    enabled,
    staleTime: 30_000,
  });
  const listQuery = useQuery({
    queryKey: billingKeys.list(scope, listParams),
    queryFn: ({ signal }) => getBillingAccounts(listParams, scope, signal),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: billingKeys.all });
  const failed = (error: unknown) => enqueueSnackbar(error instanceof Error ? error.message : t("actions.failed"), { variant: "error" });

  const remindAll = useMutation({
    mutationFn: () => remindAllBilling(scope),
    onSuccess: ({ count }) => {
      enqueueSnackbar(count ? t("attention.remindAllDone", { count }) : t("attention.remindAllNone"), { variant: count ? "success" : "info" });
      refresh();
    },
    onError: failed,
  });
  const autopay = useMutation({
    mutationFn: () => runBillingAutopay(scope),
    onSuccess: ({ count }) => {
      enqueueSnackbar(count ? t("autopay.done", { count }) : t("autopay.doneNone"), { variant: count ? "success" : "info" });
      refresh();
    },
    onError: failed,
  });
  const registry = useMutation({
    mutationFn: () => downloadBillingRegistry(listParams, scope),
    onError: () => enqueueSnackbar(t("toolbar.registryFailed"), { variant: "error" }),
  });

  const error = summaryQuery.error ?? listQuery.error;
  if (error) {
    if (isModuleDisabled(error)) return <AccessDenied title={t("page.moduleOff")} description={t("page.moduleOffHint")} showBack={false} />;
    if (error instanceof ApiError && error.status === 403) return <AccessDenied />;
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={refresh}>
            {t("common.retry")}
          </Button>
        }
      >
        {t("page.loadError")}: {error instanceof Error ? error.message : ""}
      </Alert>
    );
  }

  const summary = summaryQuery.data;
  const rows = listQuery.data ?? [];

  return (
    <>
      <Typography sx={{ mb: 2, fontSize: "0.875rem", color: "text.secondary" }}>{t("page.subtitle")}</Typography>
      <Kpis summary={summary} />

      <Box sx={{ mb: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Box role="group" aria-label={t("filter.label")} sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {BILLING_FILTERS.map((key) => (
            <ButtonBase key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} sx={(th) => ({ ...pillSx(th, filter === key), whiteSpace: "nowrap" })}>
              {t(`filter.${key}`)}
              {summary ? ` · ${summary.counts[key]}` : ""}
            </ButtonBase>
          ))}
        </Box>
        <Box
          sx={(th) => ({
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.25,
            height: 32,
            minWidth: 220,
            flex: { xs: "1 1 100%", md: "0 1 280px" },
            ml: { md: "auto" },
            border: 1,
            borderColor: "divider",
            borderRadius: "9px",
            bgcolor: subtleBg(th),
            "& .MuiSvgIcon-root": { fontSize: 18, color: "text.secondary" },
          })}
        >
          <SearchOutlined />
          <InputBase
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("toolbar.search")}
            inputProps={{ "aria-label": t("toolbar.search") }}
            sx={{ flex: 1, fontSize: "0.875rem" }}
          />
        </Box>
        <Button variant="outlined" size="small" startIcon={<FileDownloadOutlined />} disabled={registry.isPending} onClick={() => registry.mutate()}>
          {t("toolbar.registry")}
        </Button>
        {canManage && (
          <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setCreateOpen(true)}>
            {t("toolbar.newInstallment")}
          </Button>
        )}
      </Box>

      {summary && summary.overdueCount > 0 && (
        <Box
          role="status"
          sx={(th) => ({
            mb: 2,
            p: 2,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
            borderRadius: "14px",
            border: 1,
            borderColor: alpha(th.palette.error.main, 0.3),
            bgcolor: alpha(th.palette.error.main, th.palette.mode === "dark" ? 0.12 : 0.06),
          })}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontWeight: 700, color: "error.onSurface", fontSize: "0.9rem" }}>{t("attention.title")}</Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: "error.onSurface" }}>
              {t("attention.text", { count: summary.overdueCount, sum: formatKGS(summary.overdue) })}
            </Typography>
          </Box>
          {canManage && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<NotificationsActiveOutlined />}
              disabled={remindAll.isPending}
              onClick={() => remindAll.mutate()}
            >
              {t("attention.remindAll")}
            </Button>
          )}
        </Box>
      )}

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 300px" }, alignItems: "start" }}>
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          <Box sx={{ px: 2.25, pt: 2, pb: 1.5 }}>
            <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
              {t("table.title")}
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("table.subtitle")}</Typography>
          </Box>
          <AccountsGrid
            rows={rows}
            loading={listQuery.isFetching}
            emptyText={filter !== "all" || debouncedSearch ? t("table.emptyFiltered") : t("table.empty")}
            onOpen={(row) => openAccount(row.id)}
            headerHeight={theme.appLayout?.table?.headerRowHeight ?? 44}
          />
        </Box>
        <Box sx={{ display: "grid", gap: 2 }}>
          <PaymentCalendar summary={summary} onOpen={openAccount} />
          <AutopayPanel summary={summary} canManage={canManage} running={autopay.isPending} onRun={() => autopay.mutate()} />
        </Box>
      </Box>

      <AccountDrawer accountId={accountId} canManage={canManage} onClose={() => openAccount(null)} />
      {canManage && (
        <NewInstallmentDrawer
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(account) => {
            setCreateOpen(false);
            openAccount(account.id);
          }}
        />
      )}
    </>
  );
}

// ─── KPI ───────────────────────────────────────────────────────────────────

function Kpis({ summary }: { summary: BillingSummary | undefined }) {
  const { t } = useT("billing");
  const items = summary
    ? [
        { key: "expected", value: formatKGS(summary.expected), hint: t("kpi.collected", { pct: summary.collectedPct }), tone: null },
        { key: "received", value: formatKGS(summary.received), hint: null, tone: "success" as const },
        { key: "overdue", value: formatKGS(summary.overdue), hint: t("kpi.overdueCount", { count: summary.overdueCount }), tone: "error" as const },
        { key: "active", value: String(summary.active), hint: t("kpi.activeAutopay", { count: summary.activeAutopay }), tone: null },
      ]
    : null;
  return (
    <Box sx={{ mb: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } }}>
      {items
        ? items.map((item) => (
            <Box key={item.key} sx={{ ...cardSx, p: { xs: 1.75, md: 2.25 }, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                {t(`kpi.${item.key}`)}
              </Typography>
              <Typography
                noWrap
                sx={{
                  mt: 0.75,
                  fontSize: { xs: "1.2rem", md: "1.6rem" },
                  fontWeight: 700,
                  lineHeight: 1.15,
                  fontVariantNumeric: "tabular-nums",
                  color: item.tone ? `${item.tone}.onSurface` : "text.primary",
                }}
              >
                {item.value}
              </Typography>
              {item.hint && (
                <Typography
                  component="span"
                  sx={(th) => ({ mt: 0.75, display: "inline-block", px: 0.75, py: 0.2, borderRadius: "6px", fontSize: "0.72rem", bgcolor: subtleBg(th, true), color: "text.secondary" })}
                >
                  {item.hint}
                </Typography>
              )}
            </Box>
          ))
        : [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={104} sx={{ borderRadius: "14px" }} />)}
    </Box>
  );
}

// ─── Таблица ───────────────────────────────────────────────────────────────

function AccountsGrid({
  rows,
  loading,
  emptyText,
  onOpen,
  headerHeight,
}: {
  rows: BillingAccount[];
  loading: boolean;
  emptyText: string;
  onOpen: (row: BillingAccount) => void;
  headerHeight: number;
}) {
  const { t } = useT("billing");
  const columns = React.useMemo<GridColDef<BillingAccount>[]>(
    () => [
      {
        field: "buyer",
        headerName: t("table.buyer"),
        flex: 1.4,
        minWidth: 200,
        renderCell: ({ row }) => (
          <Box sx={{ minWidth: 0, lineHeight: 1.3 }}>
            <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.875rem" }}>
              {row.buyer}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {t("table.unit", { project: row.project, number: row.unitNumber })}
            </Typography>
          </Box>
        ),
      },
      {
        field: "contract",
        headerName: t("table.contract"),
        flex: 1,
        minWidth: 140,
        renderCell: ({ row }) => (
          <Box sx={{ minWidth: 0, lineHeight: 1.3 }}>
            <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
              {row.contract || row.number}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {t("table.termMonths", { count: row.term })}
            </Typography>
          </Box>
        ),
      },
      {
        field: "progress",
        headerName: t("table.paid"),
        flex: 1,
        minWidth: 150,
        renderCell: ({ row }) => (
          <Box sx={{ width: "100%" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "text.secondary" }}>
              <span>{t("table.paidOf", { paid: row.paidCount, term: row.term })}</span>
              <Box component="span" sx={{ fontWeight: 600, color: "text.primary" }}>
                {row.progress}%
              </Box>
            </Box>
            <LinearProgress
              variant="determinate"
              value={row.progress}
              color={row.state === "overdue" ? "error" : row.state === "completed" ? "success" : "primary"}
              sx={{ mt: 0.5, height: 5, borderRadius: 99 }}
            />
          </Box>
        ),
      },
      {
        field: "next",
        headerName: t("table.next"),
        flex: 1,
        minWidth: 140,
        sortable: false,
        renderCell: ({ row }) =>
          row.next ? (
            <Box sx={{ lineHeight: 1.3 }}>
              <Typography sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>{formatDateRu(row.next.dueDate)}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: row.next.state === "overdue" ? "error.onSurface" : "text.secondary" }}>
                {row.next.state === "overdue" ? t("table.debt", { sum: formatKGS(row.next.balance) }) : t("table.onSchedule")}
              </Typography>
            </Box>
          ) : (
            t("table.noNext")
          ),
      },
      {
        field: "monthly",
        headerName: t("table.monthly"),
        minWidth: 120,
        renderCell: ({ row }) => <Box sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatKGS(row.monthly)}</Box>,
      },
      {
        field: "outstanding",
        headerName: t("table.outstanding"),
        minWidth: 130,
        renderCell: ({ row }) => <Box sx={{ fontVariantNumeric: "tabular-nums" }}>{formatKGS(row.outstanding)}</Box>,
      },
      {
        field: "lastReminder",
        headerName: t("table.reminder"),
        minWidth: 130,
        renderCell: ({ row }) => (
          <Typography sx={{ fontSize: "0.8125rem", color: row.lastReminder ? "text.primary" : "text.secondary" }}>
            {row.lastReminder ? formatDateRu(row.lastReminder) : t("table.reminderNever")}
          </Typography>
        ),
      },
      {
        field: "state",
        headerName: t("table.status"),
        minWidth: 120,
        renderCell: ({ row }) => <StateChip state={row.state} label={row.stateLabel || t(`state.${row.state}`)} />,
      },
    ],
    [t],
  );
  return (
    <DataGrid<BillingAccount>
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      loading={loading}
      rowHeight={60}
      columnHeaderHeight={headerHeight}
      disableColumnMenu
      disableRowSelectionOnClick
      hideFooter={rows.length <= 100}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: emptyText }}
      onRowClick={({ row }) => onOpen(row)}
      autoHeight
      sx={(th) => ({
        border: 0,
        borderTop: 1,
        borderColor: "divider",
        borderRadius: 0,
        "& .MuiDataGrid-row": { cursor: "pointer" },
        "& .MuiDataGrid-columnHeaders": { bgcolor: subtleBg(th) },
        // DataGrid ставит ячейке line-height во всю строку — двухстрочные ячейки и чипы от этого раздувает.
        "& .MuiDataGrid-cell": { display: "flex", alignItems: "center", lineHeight: 1.4 },
        "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outline: "none" },
      })}
    />
  );
}

// ─── Правая колонка ────────────────────────────────────────────────────────

function PaymentCalendar({ summary, onOpen }: { summary: BillingSummary | undefined; onOpen: (id: number) => void }) {
  const { t } = useT("billing");
  return (
    <Box sx={{ ...cardSx, p: 2 }}>
      <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1rem" }}>
        {t("calendar.title")}
      </Typography>
      <Typography sx={{ mb: 1.25, fontSize: "0.8125rem", color: "text.secondary" }}>{t("calendar.subtitle")}</Typography>
      {!summary ? (
        <Skeleton variant="rounded" height={160} />
      ) : summary.calendar.length === 0 ? (
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("calendar.empty")}</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
          {summary.calendar.map((item) => {
            const date = dayjs(item.dueDate).locale("ru");
            const overdue = date.isBefore(dayjs(), "day");
            return (
              <Box component="li" key={`${item.accountId}-${item.dueDate}`} sx={{ borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}>
                <ButtonBase
                  onClick={() => onOpen(item.accountId)}
                  sx={{ width: "100%", py: 1, display: "flex", alignItems: "center", gap: 1.25, textAlign: "left", borderRadius: "8px" }}
                >
                  <Box
                    sx={(th) => ({
                      width: 40,
                      flexShrink: 0,
                      py: 0.5,
                      borderRadius: "8px",
                      textAlign: "center",
                      bgcolor: overdue ? alpha(th.palette.error.main, 0.1) : subtleBg(th, true),
                      color: overdue ? "error.onSurface" : "text.primary",
                    })}
                  >
                    <Typography sx={{ fontWeight: 700, lineHeight: 1.1 }}>{date.format("D")}</Typography>
                    <Typography sx={{ fontSize: "0.65rem", textTransform: "uppercase" }}>{date.format("MMM")}</Typography>
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                      {item.buyer}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                      {t("calendar.item", { unit: item.unitNumber, sum: formatKGS(item.balance) })}
                    </Typography>
                  </Box>
                  <ChevronRightOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function AutopayPanel({
  summary,
  canManage,
  running,
  onRun,
}: {
  summary: BillingSummary | undefined;
  canManage: boolean;
  running: boolean;
  onRun: () => void;
}) {
  const { t } = useT("billing");
  if (!summary) return null;
  return (
    <Box sx={{ ...cardSx, p: 2 }}>
      <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1rem" }}>
        {t("autopay.title")}
      </Typography>
      <Typography sx={{ mt: 0.5, fontSize: "0.8125rem", color: "text.secondary" }}>
        {t("autopay.text", { active: summary.activeAutopay, total: summary.active })}
      </Typography>
      {summary.remindersToday > 0 && (
        <Typography sx={{ mt: 0.75, fontSize: "0.75rem", color: "text.secondary" }}>{t("autopay.remindersToday", { count: summary.remindersToday })}</Typography>
      )}
      {canManage && (
        <Button fullWidth variant="outlined" size="small" startIcon={<PlayArrowOutlined />} disabled={running} onClick={onRun} sx={{ mt: 1.5 }}>
          {t("autopay.run")}
        </Button>
      )}
    </Box>
  );
}
