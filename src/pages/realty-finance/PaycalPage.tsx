import React from "react";
import { Alert, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Skeleton, Tooltip as MuiTooltip, Typography, alpha, useTheme } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import CheckCircleOutlineOutlined from "@mui/icons-material/CheckCircleOutlineOutlined";

import {
  FORECAST_DAYS,
  calendarAction,
  fixCashGap,
  forecastWeeks,
  getCalendarMonth,
  getCashForecast,
  getPaymentCalendar,
  monthGrid,
  payoutStructure,
  shiftMonth,
  treasuryKeys,
  type CalendarItem,
  type CashForecast,
  type ForecastDay,
} from "../../api/treasury";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import { cardSx } from "../estate-dashboard/format";
import { CardHeader, KpiCards, ScreenError } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { compactSum, fullDate, monthTitle, shortDate, signedSum, sum } from "./format";
import { useRefreshTreasury } from "./hooks";
import { NewPlannedDrawer, PlannedDrawer, SettleDialog, TrancheDrawer } from "./PaycalForms";
import { AmountBars, EmptyNote, PillTabs, TwoLines } from "./shared";

type Tab = "calendar" | "list" | "forecast";
/** Сдвиг крупнейшей выплаты при «Перенести крупнейшую выплату» (гайд §3, по умолчанию бэка). */
const GAP_SHIFT_DAYS = 10;

/**
 * «Платёжный календарь» застройщика (AIVIO, гайд `frontend-finance.md` §3):
 * прогноз остатка и кассовые разрывы (`/cash-forecast/`), сетка месяца,
 * список на 45 дней с «Остатком после», плановые платежи и рассрочка.
 * Действия — `treasury.manage`.
 */
export default function PaycalPage() {
  const { t } = useT("realtyFinance");
  usePageTitle(t("paycal.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <PaycalScreen />
    </Box>
  );
}

function PaycalScreen() {
  const { t } = useT("realtyFinance");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const refresh = useRefreshTreasury();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("treasury.manage");
  const [paymentId, openPayment] = useIdParam("payment");
  const [tab, setTab] = React.useState<Tab>("calendar");
  const [month, setMonth] = React.useState(() => dayjs().format("YYYY-MM"));
  const [settling, setSettling] = React.useState<CalendarItem | null>(null);
  const [newPayment, setNewPayment] = React.useState(false);
  const [tranche, setTranche] = React.useState(false);
  const [dayOpen, setDayOpen] = React.useState<ForecastDay | null>(null);
  const enabled = scope.orgReady !== false;

  const forecast = useQuery({ queryKey: treasuryKeys.forecast(scope, FORECAST_DAYS, true), queryFn: ({ signal }) => getCashForecast(FORECAST_DAYS, scope, signal), enabled, staleTime: 30_000 });
  // Список нужен и для счётчика вкладки — грузим сразу.
  const calendar = useQuery({ queryKey: treasuryKeys.calendar(scope, FORECAST_DAYS), queryFn: ({ signal }) => getPaymentCalendar(FORECAST_DAYS, scope, signal), enabled, staleTime: 30_000 });
  const monthQuery = useQuery({
    queryKey: treasuryKeys.month(scope, month),
    queryFn: ({ signal }) => getCalendarMonth(month, scope, signal),
    enabled: enabled && tab === "calendar",
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const fixGap = useMutation({
    mutationFn: () => fixCashGap(forecast.data?.gapDate as string, GAP_SHIFT_DAYS, scope),
    onSuccess: (moved) => {
      refresh();
      enqueueSnackbar(moved ? t("paycal.gap.moved", { title: moved.title, date: fullDate(moved.date) }) : t("paycal.gap.nothing"), { variant: moved ? "success" : "info" });
    },
    onError: (error) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" }),
  });

  if (forecast.error) return <ScreenError error={forecast.error} title={t("paycal.loadError")} onRetry={() => void forecast.refetch()} />;

  const f = forecast.data;
  const openItem = (item: CalendarItem) => {
    if (item.kind === "billing" && item.billingAccountId) navigate(`/finance/billing?account=${item.billingAccountId}`);
    else if (item.kind === "operation" && item.id) navigate(`/finance/cashbank?operation=${item.id}`);
    else if (item.kind === "planned" && item.id) openPayment(item.id);
  };
  const allItems = [...(calendar.data?.items ?? []), ...(f?.days.flatMap((d) => d.items) ?? [])];

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>{t("paycal.subtitle")}</Typography>
        {canManage && (
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setNewPayment(true)} sx={{ whiteSpace: "nowrap" }}>
            {t("paycal.newPayment")}
          </Button>
        )}
      </Box>

      <KpiCards
        items={
          f
            ? [
                { key: "start", label: t("paycal.kpi.start"), value: compactSum(f.startBalance, t), tone: f.startBalance < 0 ? "error" : null },
                { key: "inflow", label: t("paycal.kpi.inflow"), value: compactSum(f.next30.inflow, t), hint: t("paycal.kpi.payments", { count: f.next30.inflowCount }), tone: f.next30.inflow > 0 ? "success" : null },
                { key: "outflow", label: t("paycal.kpi.outflow"), value: compactSum(f.next30.outflow, t), hint: t("paycal.kpi.payments", { count: f.next30.outflowCount }) },
                {
                  key: "min",
                  label: t("paycal.kpi.min"),
                  value: f.minBalance < 0 ? `−${compactSum(-f.minBalance, t)}` : compactSum(f.minBalance, t),
                  hint: f.minBalanceDate ? t("paycal.kpi.minHint", { date: fullDate(f.minBalanceDate) }) : null,
                  tone: f.minBalance < 0 ? "error" : null,
                },
              ]
            : null
        }
      />

      {f && <GapBanner forecast={f} canManage={canManage} fixing={fixGap.isPending} onFix={() => fixGap.mutate()} onTranche={() => setTranche(true)} />}

      <Box sx={{ mb: 1.25 }}>
        <PillTabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "calendar", label: t("paycal.tabs.calendar") },
            { key: "list", label: t("paycal.tabs.list"), count: calendar.data?.items.length ?? null },
            { key: "forecast", label: t("paycal.tabs.forecast") },
          ]}
        />
      </Box>

      {tab === "calendar" && (
        <MonthView
          month={month}
          days={monthQuery.data?.days}
          loading={monthQuery.isLoading}
          error={monthQuery.error}
          onRetry={() => void monthQuery.refetch()}
          onMonth={(delta) => setMonth((m) => shiftMonth(m, delta))}
          onItem={openItem}
          onDay={setDayOpen}
        />
      )}
      {tab === "list" &&
        (calendar.error ? (
          <ScreenError error={calendar.error} onRetry={() => void calendar.refetch()} />
        ) : (
          <Box sx={{ ...cardSx, overflow: "hidden" }}>
            <CalendarGrid rows={calendar.data?.items ?? []} loading={calendar.isFetching} canManage={canManage} onOpen={openItem} onSettle={setSettling} />
          </Box>
        ))}
      {tab === "forecast" && (f ? <ForecastView forecast={f} /> : <Skeleton variant="rounded" height={320} />)}

      <PlannedDrawer id={paymentId} preview={allItems.find((item) => item.kind === "planned" && item.id === paymentId) ?? null} canManage={canManage} onClose={() => openPayment(null)} />
      <SettleDialog item={settling} onClose={() => setSettling(null)} />
      <NewPlannedDrawer open={newPayment} onClose={() => setNewPayment(false)} />
      <TrancheDrawer open={tranche} suggestedAmount={f && f.minBalance < 0 ? -f.minBalance : 0} onClose={() => setTranche(false)} />
      <DayDialog
        day={dayOpen}
        onClose={() => setDayOpen(null)}
        onItem={(item) => {
          setDayOpen(null);
          openItem(item);
        }}
      />
    </>
  );
}

function GapBanner({ forecast, canManage, fixing, onFix, onTranche }: { forecast: CashForecast; canManage: boolean; fixing: boolean; onFix: () => void; onTranche: () => void }) {
  const { t } = useT("realtyFinance");
  if (!forecast.hasGap || !forecast.gapDate) {
    return (
      <Alert severity="success" icon={<CheckCircleOutlineOutlined />} sx={{ mb: 2 }}>
        {t("paycal.gap.none", { days: FORECAST_DAYS })}
      </Alert>
    );
  }
  return (
    <Alert
      severity="error"
      icon={<WarningAmberOutlined />}
      sx={{ mb: 2, "& .MuiAlert-message": { flex: 1, minWidth: 0 }, "& .MuiAlert-action": { alignItems: "center", pt: 0 } }}
      action={
        canManage ? (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button color="inherit" size="small" onClick={onFix} disabled={fixing} sx={{ whiteSpace: "nowrap" }}>
              {t("paycal.gap.fix")}
            </Button>
            <Button color="inherit" size="small" variant="outlined" onClick={onTranche} sx={{ whiteSpace: "nowrap" }}>
              {t("paycal.gap.tranche")}
            </Button>
          </Box>
        ) : undefined
      }
    >
      <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>{t("paycal.gap.title", { date: fullDate(forecast.gapDate), value: sum(forecast.gapBalance) })}</Typography>
      {forecast.minBalanceDate && <Typography sx={{ fontSize: "0.8125rem" }}>{t("paycal.gap.hint", { min: sum(forecast.minBalance), minDate: fullDate(forecast.minBalanceDate) })}</Typography>}
    </Alert>
  );
}

/** Строка платежа в ячейке месяца. */
function CellItem({ item, onClick }: { item: CalendarItem; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${item.title} · ${signedSum(item.type, item.amount)}`}
      sx={(th) => ({
        width: "100%",
        justifyContent: "flex-start",
        gap: 0.5,
        px: 0.5,
        py: 0.2,
        borderRadius: "5px",
        fontSize: "0.7rem",
        textAlign: "left",
        color: item.done ? "text.secondary" : item.type === "in" ? "success.main" : "text.primary",
        bgcolor: subtleBg(th),
        "&:hover": { bgcolor: subtleBg(th, true) },
      })}
    >
      <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.counterparty || item.title}
      </Box>
      <Box component="span" sx={{ fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {item.type === "in" ? "+" : "−"}
        {compactAmount(item.amount)}
      </Box>
    </ButtonBase>
  );
}

/** Короткая сумма для ячейки: 3,9 млн → «3,9м», 232 500 → «233к». */
const compactAmount = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}м` : value >= 1000 ? `${Math.round(value / 1000)}к` : String(Math.round(value));

function MonthView({
  month,
  days,
  loading,
  error,
  onRetry,
  onMonth,
  onItem,
  onDay,
}: {
  month: string;
  days: ForecastDay[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onMonth: (delta: number) => void;
  onItem: (item: CalendarItem) => void;
  onDay: (day: ForecastDay) => void;
}) {
  const { t } = useT("realtyFinance");
  const byDate = new Map((days ?? []).map((d) => [d.date, d]));
  const today = dayjs().format("YYYY-MM-DD");
  const weekdays = t("paycal.month.weekdays").split(",");
  return (
    <Box sx={{ ...cardSx, overflow: "hidden" }}>
      <Box sx={{ px: 2, py: 1.25, display: "flex", alignItems: "center", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <IconButton size="small" aria-label={t("paycal.month.prev")} onClick={() => onMonth(-1)}>
          <ChevronLeftOutlined />
        </IconButton>
        <Typography sx={{ minWidth: 150, textAlign: "center", fontWeight: 700 }}>{monthTitle(month)}</Typography>
        <IconButton size="small" aria-label={t("paycal.month.next")} onClick={() => onMonth(1)}>
          <ChevronRightOutlined />
        </IconButton>
      </Box>
      {error ? (
        <Box sx={{ p: 2 }}>
          <ScreenError error={error} onRetry={onRetry} />
        </Box>
      ) : (
        // Сетка 7 колонок не сжимается до телефона — прокручиваем внутри карточки.
        <Box sx={{ overflowX: "auto" }}>
          <Box sx={{ minWidth: 760 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: 1, borderColor: "divider" }}>
              {weekdays.map((d) => (
                <Typography key={d} sx={{ px: 1, py: 0.75, fontSize: "0.72rem", fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>
                  {d}
                </Typography>
              ))}
            </Box>
            {monthGrid(month).map((week, wi) => (
              <Box key={wi} sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}>
                {week.map((date, di) => {
                  const day = date ? byDate.get(date) : undefined;
                  const items = day?.items ?? [];
                  return (
                    <Box
                      key={date ?? `pad-${di}`}
                      onClick={day && items.length > 0 ? () => onDay(day) : undefined}
                      sx={(th) => ({
                        minHeight: 112,
                        p: 0.75,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.4,
                        borderRight: di < 6 ? 1 : 0,
                        borderColor: "divider",
                        cursor: day && items.length > 0 ? "pointer" : "default",
                        bgcolor: !date ? subtleBg(th) : day?.gap ? alpha(th.palette.error.main, 0.08) : "transparent",
                      })}
                    >
                      {date && (
                        <>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <Typography
                              sx={{
                                fontSize: "0.75rem",
                                fontWeight: date === today ? 800 : 600,
                                color: date === today ? "primary.main" : date < today ? "text.disabled" : "text.primary",
                              }}
                            >
                              {Number(date.slice(8))}
                            </Typography>
                            {day?.gap && (
                              <Typography component="span" sx={{ ml: "auto", fontSize: "0.65rem", fontWeight: 700, color: "error.main", textTransform: "uppercase" }}>
                                {t("paycal.month.gap")}
                              </Typography>
                            )}
                          </Box>
                          {loading && !day ? (
                            <Skeleton variant="rounded" height={18} />
                          ) : (
                            <>
                              {items.slice(0, 3).map((item) => (
                                <CellItem key={item.key} item={item} onClick={() => onItem(item)} />
                              ))}
                              {items.length > 3 && <Typography sx={{ px: 0.5, fontSize: "0.7rem", color: "text.secondary" }}>{t("paycal.month.more", { count: items.length - 3 })}</Typography>}
                            </>
                          )}
                          {day && (day.in > 0 || day.out > 0) && (
                            <Box sx={{ mt: "auto", display: "flex", gap: 0.75, fontSize: "0.68rem", fontVariantNumeric: "tabular-nums" }}>
                              {day.in > 0 && <Box sx={{ color: "success.main" }}>+{compactAmount(day.in)}</Box>}
                              {day.out > 0 && <Box sx={{ color: "text.secondary" }}>−{compactAmount(day.out)}</Box>}
                              {day.balance != null && (
                                <MuiTooltip title={formatKGS(day.balance)}>
                                  <Box sx={{ ml: "auto", color: day.balance < 0 ? "error.main" : "text.secondary", fontWeight: 600 }}>{day.balance < 0 ? `−${compactAmount(-day.balance)}` : compactAmount(day.balance)}</Box>
                                </MuiTooltip>
                              )}
                            </Box>
                          )}
                        </>
                      )}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function DayDialog({ day, onClose, onItem }: { day: ForecastDay | null; onClose: () => void; onItem: (item: CalendarItem) => void }) {
  const { t } = useT("realtyFinance");
  return (
    <Dialog open={day != null} onClose={onClose} fullWidth PaperProps={{ sx: { maxWidth: 520 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("paycal.month.dayTitle", { date: day ? fullDate(day.date) : "" })}</DialogTitle>
      <DialogContent>
        {day?.items.length === 0 && <EmptyNote text={t("paycal.month.dayEmpty")} />}
        {day?.items.map((item) => (
          <ButtonBase key={item.key} onClick={() => onItem(item)} sx={{ width: "100%", py: 1, display: "flex", alignItems: "baseline", gap: 1, textAlign: "left", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
                {item.title}
              </Typography>
              <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                {[item.counterparty, item.sourceLabel, item.projectName].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, whiteSpace: "nowrap", color: item.done ? "text.secondary" : item.type === "in" ? "success.main" : "text.primary" }}>{signedSum(item.type, item.amount)}</Typography>
          </ButtonBase>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

function CalendarGrid({ rows, loading, canManage, onOpen, onSettle }: { rows: CalendarItem[]; loading: boolean; canManage: boolean; onOpen: (row: CalendarItem) => void; onSettle: (row: CalendarItem) => void }) {
  const { t } = useT("realtyFinance");
  const columns: GridColDef<CalendarItem>[] = [
    {
      field: "date",
      headerName: t("paycal.table.date"),
      width: 110,
      renderCell: ({ row }) => <TwoLines top={fullDate(row.date)} bottom={row.moved && row.originalDate ? t("paycal.table.moved", { date: shortDate(row.originalDate) }) : null} />,
    },
    {
      field: "title",
      headerName: t("paycal.table.payment"),
      flex: 1.5,
      minWidth: 220,
      renderCell: ({ row }) => <TwoLines strong top={row.title || "—"} bottom={[row.counterparty, row.installmentNumber != null && t("paycal.table.installment", { number: row.installmentNumber })].filter(Boolean).join(" · ") || null} />,
    },
    { field: "sourceLabel", headerName: t("paycal.table.source"), flex: 1, minWidth: 150, renderCell: ({ row }) => <TwoLines top={row.sourceLabel || "—"} bottom={row.categoryName || null} /> },
    { field: "projectName", headerName: t("paycal.table.project"), width: 150, renderCell: ({ row }) => <TwoLines top={row.projectName ?? t("common.company")} /> },
    {
      field: "amount",
      headerName: t("paycal.table.amount"),
      width: 150,
      align: "right",
      headerAlign: "right",
      renderCell: ({ row }) => (
        <Typography sx={{ width: "100%", textAlign: "right", fontSize: "0.875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: row.type === "in" ? "success.main" : "text.primary" }}>{signedSum(row.type, row.amount)}</Typography>
      ),
    },
    {
      field: "runningBalance",
      headerName: t("paycal.table.after"),
      width: 150,
      align: "right",
      headerAlign: "right",
      renderCell: ({ row }) => (
        <Typography sx={{ width: "100%", textAlign: "right", fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums", color: row.runningBalance != null && row.runningBalance < 0 ? "error.main" : "text.secondary", fontWeight: row.runningBalance != null && row.runningBalance < 0 ? 700 : 400 }}>
          {row.runningBalance != null ? sum(row.runningBalance) : "—"}
        </Typography>
      ),
    },
    {
      field: "actions",
      headerName: "",
      width: 120,
      sortable: false,
      renderCell: ({ row }) => {
        const action = calendarAction(row);
        if (action === "billing")
          return (
            <Button size="small" onClick={(e) => (e.stopPropagation(), onOpen(row))}>
              {t("paycal.table.billing")}
            </Button>
          );
        if (!canManage || (action !== "pay" && action !== "receive")) return null;
        return (
          <Button size="small" variant="outlined" onClick={(e) => (e.stopPropagation(), onSettle(row))} sx={{ whiteSpace: "nowrap" }}>
            {t(action === "receive" ? "paycal.table.receive" : "paycal.table.pay")}
          </Button>
        );
      },
    },
  ];
  return (
    <DataGrid<CalendarItem>
      rows={rows}
      columns={columns}
      getRowId={(row) => row.key}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
      getRowHeight={() => "auto"}
      getRowClassName={({ row }) => (row.runningBalance != null && row.runningBalance < 0 ? "row-gap" : "")}
      onRowClick={({ row }) => onOpen(row)}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
      pageSizeOptions={[25, 50, 100]}
      sx={(th) => ({
        border: 0,
        "& .MuiDataGrid-row": { cursor: "pointer" },
        "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
        "& .row-gap": { bgcolor: alpha(th.palette.error.main, 0.05) },
      })}
    />
  );
}

function ForecastView({ forecast }: { forecast: CashForecast }) {
  const { t } = useT("realtyFinance");
  const theme = useTheme();
  const points = forecast.days.filter((d) => d.balance != null).map((d) => ({ date: d.date, label: shortDate(d.date), balance: d.balance as number }));
  const weeks = forecastWeeks(forecast.days);
  const structure = payoutStructure(forecast.days);
  const min = Math.min(0, ...points.map((p) => p.balance));
  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 340px" }, alignItems: "start" }}>
      <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
        <Box sx={{ ...cardSx, minWidth: 0 }}>
          <CardHeader title={t("paycal.forecast.chart", { days: FORECAST_DAYS })} />
          <Box sx={{ px: 1, pb: 2, height: 260 }}>
            {points.length < 2 ? (
              <EmptyNote text={t("common.empty")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tickFormatter={(v: number) => (v < 0 ? `−${compactSum(-v, t)}` : compactSum(v, t))} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} tickLine={false} axisLine={false} width={72} domain={[min, "auto"]} />
                  <Tooltip
                    formatter={(value) => [sum(Number(value)), t("paycal.forecast.balance")]}
                    labelFormatter={(_, payload) => (payload?.[0]?.payload?.date ? fullDate(payload[0].payload.date as string) : "")}
                    contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 12 }}
                  />
                  {min < 0 && <ReferenceLine y={0} stroke={theme.palette.error.main} strokeDasharray="4 4" />}
                  <Area type="monotone" dataKey="balance" stroke={theme.palette.primary.main} strokeWidth={2} fill={theme.palette.primary.main} fillOpacity={0.08} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Box>
        </Box>

        <Box sx={{ ...cardSx, minWidth: 0, overflow: "hidden" }}>
          <CardHeader title={t("paycal.forecast.weeks")} />
          <Box sx={{ overflowX: "auto" }}>
            <Box component="table" sx={{ width: "100%", minWidth: 520, borderCollapse: "collapse", "& td, & th": { px: 2.25, py: 1, fontSize: "0.8125rem", borderTop: 1, borderColor: "divider", textAlign: "right", whiteSpace: "nowrap" }, "& th": { fontWeight: 600, color: "text.secondary" }, "& td:first-of-type, & th:first-of-type": { textAlign: "left" } }}>
              <thead>
                <tr>
                  <th>{t("paycal.forecast.week")}</th>
                  <th>{t("paycal.forecast.in")}</th>
                  <th>{t("paycal.forecast.out")}</th>
                  <th>{t("paycal.forecast.end")}</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.start}>
                    <td>
                      {shortDate(w.start)} – {shortDate(w.end)}
                    </td>
                    <Box component="td" sx={{ color: "success.main", fontVariantNumeric: "tabular-nums" }}>
                      {w.in > 0 ? `+${formatKGS(w.in)}` : "—"}
                    </Box>
                    <Box component="td" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {w.out > 0 ? `−${formatKGS(w.out)}` : "—"}
                    </Box>
                    <Box component="td" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: w.min != null && w.min < 0 ? "error.main" : "text.primary" }}>
                      {w.balance != null ? sum(w.balance) : "—"}
                    </Box>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ ...cardSx, minWidth: 0 }}>
        <CardHeader title={t("paycal.forecast.structure")} subtitle={formatKGS(structure.reduce((s, i) => s + i.amount, 0))} />
        <AmountBars tone="warning" empty={t("paycal.forecast.structureEmpty")} items={structure.map((s) => ({ key: s.label, label: s.label, amount: s.amount }))} />
      </Box>
    </Box>
  );
}
