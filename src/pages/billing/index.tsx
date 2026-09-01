import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import MoreHorizOutlined from "@mui/icons-material/MoreHorizOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import { useNotification } from "@refinedev/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useLocation } from "react-router";

import {
  billingApi,
  type BillingCharge,
  type BillingContract,
  type BillingOffering,
  type BillingPayment,
} from "../../api/billing";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";
import { AppCard, PageHeader } from "../../components/ui";
import { useActiveScope } from "../../hooks/useActiveScope";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { subtleBg } from "../../theme/uiHelpers";

type BillingTab = "overview" | "contracts" | "charges" | "payments" | "debtors" | "offerings";
type DialogKind = "contract" | "charge" | "payment" | "offering" | null;

const TAB_LABELS: Record<BillingTab, string> = {
  overview: "Обзор",
  contracts: "Контракты",
  charges: "Начисления",
  payments: "Оплаты",
  debtors: "Должники",
  offerings: "Услуги",
};

const PATH_TABS: Record<string, BillingTab> = {
  "/billing": "overview",
  "/contracts": "contracts",
  "/charges": "charges",
  "/payments": "payments",
  "/debtors": "debtors",
  "/offerings": "offerings",
};

const STATUS_META: Record<string, { label: string; color: "default" | "success" | "warning" | "error" | "info" }> = {
  active: { label: "Активен", color: "success" },
  paused: { label: "На паузе", color: "warning" },
  ended: { label: "Завершён", color: "default" },
  draft: { label: "Черновик", color: "default" },
  issued: { label: "Выставлено", color: "info" },
  partially_paid: { label: "Частично", color: "warning" },
  paid: { label: "Оплачено", color: "success" },
  succeeded: { label: "Успешно", color: "success" },
  refunded: { label: "Возвращено", color: "default" },
  overdue: { label: "Просрочено", color: "error" },
  cancelled: { label: "Отменено", color: "default" },
};

const KIND_LABELS: Record<string, string> = { service: "Услуга", course: "Курс", rental: "Аренда" };
const CYCLE_LABELS: Record<string, string> = {
  one_time: "Разово",
  package: "Пакет",
  monthly: "Ежемесячно",
  quarterly: "Ежеквартально",
  yearly: "Ежегодно",
  per_course: "За курс",
  per_session: "За занятие",
};

const formatMoney = (value: string | number | null | undefined) =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value ?? 0))} сом`;
const formatDate = (value: string | null | undefined) => (value ? dayjs(value).format("DD.MM.YYYY") : "—");

function StatusChip({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: "default" as const };
  return <Chip size="small" label={meta.label} color={meta.color} variant={meta.color === "default" ? "outlined" : "filled"} />;
}

function EmptyRow({ colSpan, text = "Пока нет данных" }: { colSpan: number; text?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} align="center" sx={{ py: 7, color: "text.secondary" }}>{text}</TableCell>
    </TableRow>
  );
}

function KpiCard({ label, value, hint, tone = "primary" }: { label: string; value: React.ReactNode; hint: string; tone?: "primary" | "warning" | "error" | "success" }) {
  return (
    <AppCard sx={{ minWidth: 180, flex: "1 1 210px", overflow: "hidden", position: "relative" }}>
      <Box sx={{ position: "absolute", inset: "0 auto 0 0", width: 4, bgcolor: `${tone}.main` }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" fontWeight={750} sx={{ mt: 0.5, letterSpacing: -0.6 }}>{value}</Typography>
      <Typography variant="caption" color="text.disabled">{hint}</Typography>
    </AppCard>
  );
}

function MoneyTimeline({ rows }: { rows: Array<{ date: string; total: string }> }) {
  const max = Math.max(...rows.map((row) => Number(row.total)), 1);
  return (
    <Stack direction="row" spacing={0.75} alignItems="flex-end" sx={{ height: 190, pt: 2, overflowX: "auto" }}>
      {rows.length === 0 && <Typography color="text.secondary">За выбранный период оплат ещё нет.</Typography>}
      {rows.map((row) => {
        const height = Math.max(8, (Number(row.total) / max) * 150);
        return (
          <Tooltip key={row.date} title={`${formatDate(row.date)} · ${formatMoney(row.total)}`} arrow>
            <Box sx={{ minWidth: 12, flex: 1, maxWidth: 30, height, borderRadius: "5px 5px 2px 2px", bgcolor: "success.main", opacity: 0.78, transition: "height .2s ease", "@media (prefers-reduced-motion: reduce)": { transition: "none" }, "&:hover": { opacity: 1 } }} />
          </Tooltip>
        );
      })}
    </Stack>
  );
}

const initialForm = () => ({
  clientId: "", offeringId: "", startsOn: dayjs().format("YYYY-MM-DD"), endsOn: "", name: "",
  billingDay: String(dayjs().date()), priceOverride: "", subscriptionId: "", purpose: "",
  amount: "", dueDate: dayjs().format("YYYY-MM-DD"), periodKey: dayjs().format("YYYY-MM"),
  method: "cash", chargeId: "", kind: "service", billingCycle: "monthly", category: "", capacity: "",
  priceAmount: "",
  sessionsTotal: "", schedule: "", objectType: "office", areaUnit: "sqm", ratePeriod: "month",
  address: "", areaValue: "", depositAmount: "",
});

export default function BillingPage() {
  const location = useLocation();
  const tab = PATH_TABS[location.pathname] ?? "overview";
  usePageTitle(TAB_LABELS[tab]);
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<DialogKind>(null);
  const [form, setForm] = React.useState(initialForm);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [menuItem, setMenuItem] = React.useState<BillingContract | BillingCharge | BillingPayment | BillingOffering | null>(null);
  const [editingOffering, setEditingOffering] = React.useState<BillingOffering | null>(null);
  const [selectedDebtors, setSelectedDebtors] = React.useState<number[]>([]);
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const scope = useActiveScope();
  const canManage = useCan("billing.manage");
  const canManagePayments = useCan("billing.payments.manage");
  const canRemind = useCan("billing.debtors.remind");
  const canManageOfferings = useCan("offerings.manage");
  const organizationId = scope.organizationId;
  const scopeParams = React.useMemo(() => ({ ...(organizationId ? { organizationId } : {}) }), [organizationId]);
  const dateFrom = dayjs().startOf("month").format("YYYY-MM-DD");
  const dateTo = dayjs().format("YYYY-MM-DD");
  const enabled = scope.isReady && scope.orgReady;

  const dashboardQuery = useQuery({
    queryKey: djangoQueryKeys.billing.dashboard({ organizationId, dateFrom, dateTo }),
    queryFn: () => billingApi.dashboard({ ...scopeParams, dateFrom, dateTo }),
    enabled: enabled && tab === "overview",
  });
  const contractsQuery = useQuery({
    queryKey: djangoQueryKeys.billing.contracts({ organizationId, q: search }),
    queryFn: () => billingApi.contracts({ ...scopeParams, q: search, pageSize: 200 }),
    enabled: enabled && (tab === "contracts" || dialog === "charge"),
  });
  const chargesQuery = useQuery({
    queryKey: djangoQueryKeys.billing.charges({ organizationId, q: search }),
    queryFn: () => billingApi.charges({ ...scopeParams, q: search, pageSize: 200 }),
    enabled: enabled && (tab === "charges" || dialog === "payment"),
  });
  const paymentsQuery = useQuery({
    queryKey: djangoQueryKeys.billing.payments({ organizationId, q: search }),
    queryFn: () => billingApi.payments({ ...scopeParams, q: search, pageSize: 200 }),
    enabled: enabled && tab === "payments",
  });
  const debtorsQuery = useQuery({
    queryKey: djangoQueryKeys.billing.debtors(organizationId),
    queryFn: () => billingApi.debtors(scopeParams),
    enabled: enabled && tab === "debtors",
  });
  const offeringsQuery = useQuery({
    queryKey: djangoQueryKeys.billing.offerings({ organizationId, q: search }),
    queryFn: () => billingApi.offerings({ ...scopeParams, q: search }),
    enabled: enabled && (tab === "offerings" || dialog === "contract"),
  });
  const clientsQuery = useQuery({
    queryKey: djangoQueryKeys.billing.clients(organizationId),
    queryFn: () => billingApi.clients(scopeParams),
    enabled: enabled && (dialog === "contract" || dialog === "payment"),
  });
  const chargeRows = React.useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru");
    const rows = chargesQuery.data?.items ?? [];
    return needle ? rows.filter((row) => `${row.number} ${row.clientName} ${row.purpose} ${row.offeringName}`.toLocaleLowerCase("ru").includes(needle)) : rows;
  }, [chargesQuery.data?.items, search]);
  const paymentRows = React.useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru");
    const rows = paymentsQuery.data?.items ?? [];
    return needle ? rows.filter((row) => `${row.id} ${row.clientName} ${row.chargeId ?? ""} ${row.method}`.toLocaleLowerCase("ru").includes(needle)) : rows;
  }, [paymentsQuery.data?.items, search]);

  const invalidate = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.billing.all });
  }, [queryClient]);

  const actionMutation = useMutation({
    mutationFn: async (job: () => Promise<unknown>) => job(),
    onSuccess: async () => { setMenuAnchor(null); setMenuItem(null); await invalidate(); notify?.({ type: "success", message: "Готово" }); },
    onError: (error) => notify?.({ type: "error", message: "Операция не выполнена", description: getErrorMessage(error) }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (dialog === "contract") return billingApi.createContract({ clientId: Number(form.clientId), offeringId: Number(form.offeringId), startsOn: form.startsOn, ...(form.endsOn ? { endsOn: form.endsOn } : {}), ...(form.name ? { name: form.name } : {}), ...(form.priceOverride ? { priceOverride: form.priceOverride } : {}), ...(form.billingDay ? { billingDay: Number(form.billingDay) } : {}), ...scopeParams });
      if (dialog === "charge") return billingApi.createCharge({ clientId: Number(form.clientId), subscriptionId: Number(form.subscriptionId), purpose: form.purpose, amount: form.amount, dueDate: form.dueDate, periodKey: form.periodKey, periodLabel: form.periodKey, ...scopeParams });
      if (dialog === "payment") return billingApi.createPayment({ clientId: Number(form.clientId), ...(form.chargeId ? { chargeId: Number(form.chargeId) } : {}), amount: form.amount, method: form.method, ...scopeParams });
      if (dialog === "offering") {
        const body = { ...(!editingOffering ? { kind: form.kind } : {}), name: form.name, billingCycle: form.billingCycle, priceAmount: form.priceAmount, category: form.category, capacity: form.capacity ? Number(form.capacity) : null, profile: form.kind === "course" ? { sessions_total: Number(form.sessionsTotal), schedule: form.schedule, starts_on: form.startsOn } : form.kind === "rental" ? { object_type: form.objectType, area_unit: form.areaUnit, rate_period: form.ratePeriod, ...(form.address ? { address: form.address } : {}), ...(form.areaValue ? { area_value: Number(form.areaValue) } : {}), ...(form.depositAmount ? { deposit_amount: form.depositAmount } : {}) } : {} };
        return editingOffering
          ? billingApi.updateOffering(editingOffering.id, body, scopeParams)
          : billingApi.createOffering({ ...body, ...scopeParams });
      }
      throw new Error("Не выбрано действие");
    },
    onSuccess: async () => { setDialog(null); setEditingOffering(null); setForm(initialForm()); await invalidate(); notify?.({ type: "success", message: "Сохранено" }); },
    onError: (error) => notify?.({ type: "error", message: "Не удалось сохранить", description: getErrorMessage(error) }),
  });

  const openDialog = (kind: Exclude<DialogKind, null>) => { setEditingOffering(null); setForm(initialForm()); setDialog(kind); };
  const openOfferingEdit = (offering: BillingOffering) => {
    const profile = offering.profile ?? {};
    const value = (key: string) => String(profile[key] ?? "");
    setMenuAnchor(null);
    setMenuItem(null);
    setEditingOffering(offering);
    setForm({
      ...initialForm(),
      kind: offering.kind,
      name: offering.name,
      category: offering.category,
      priceAmount: offering.priceAmount,
      billingCycle: offering.billingCycle,
      capacity: offering.capacity == null ? "" : String(offering.capacity),
      sessionsTotal: value("sessions_total"),
      schedule: value("schedule"),
      startsOn: value("starts_on") || dayjs().format("YYYY-MM-DD"),
      objectType: value("object_type") || "office",
      areaUnit: value("area_unit") || "sqm",
      ratePeriod: value("rate_period") || "month",
      address: value("address"),
      areaValue: value("area_value"),
      depositAmount: value("deposit_amount"),
    });
    setDialog("offering");
  };
  const openMenu = (event: React.MouseEvent<HTMLElement>, item: typeof menuItem) => { setMenuAnchor(event.currentTarget); setMenuItem(item); };
  const isLoading = dashboardQuery.isLoading || contractsQuery.isLoading || chargesQuery.isLoading || paymentsQuery.isLoading || debtorsQuery.isLoading || offeringsQuery.isLoading;
  const error = dashboardQuery.error || contractsQuery.error || chargesQuery.error || paymentsQuery.error || debtorsQuery.error || offeringsQuery.error;

  const primaryAction = tab === "contracts" ? () => openDialog("contract") : tab === "charges" ? () => openDialog("charge") : tab === "payments" ? () => openDialog("payment") : tab === "offerings" ? () => openDialog("offering") : undefined;
  const primaryAllowed = tab === "payments" ? canManagePayments : tab === "offerings" ? canManageOfferings : canManage;

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title={TAB_LABELS[tab]}
        showTitle={false}
        onAdd={primaryAction && primaryAllowed ? primaryAction : undefined}
        addButtonText={tab === "contracts" ? "Новый контракт" : tab === "charges" ? "Выставить начисление" : tab === "payments" ? "Принять оплату" : "Новая услуга"}
        showSearch={tab !== "overview" && tab !== "debtors"}
        searchVal={search}
        onSearchChange={setSearch}
        searchPlaceholder="Клиент, номер или объект"
        loading={isLoading}
        actions={
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Обновить"><IconButton onClick={() => void invalidate()}><RefreshOutlined /></IconButton></Tooltip>
          </Stack>
        }
      />

      <Box sx={(theme) => ({ px: theme.appLayout.page.paddingX })}>
        {isLoading && <LinearProgress sx={{ mb: 1, borderRadius: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(error, "Не удалось загрузить биллинг")}</Alert>}

        {tab === "overview" && dashboardQuery.data && (
          <Stack spacing={2}>
            <Stack direction="row" gap={1.5} flexWrap="wrap">
              <KpiCard label="Поступило" value={formatMoney(dashboardQuery.data.revenueTotal)} hint="с начала месяца" tone="success" />
              <KpiCard label="К оплате" value={formatMoney(dashboardQuery.data.outstandingTotal)} hint="по открытым начислениям" tone="warning" />
              <KpiCard label="Активные контракты" value={dashboardQuery.data.activeSubscriptionsCount} hint="создают выручку" />
              <KpiCard label="Должники" value={dashboardQuery.data.debtorsCount} hint={`${dashboardQuery.data.debtorsCriticalCount} критических`} tone={dashboardQuery.data.debtorsCriticalCount ? "error" : "primary"} />
            </Stack>
            <AppCard title="Денежная лента" subheader={`${formatDate(dateFrom)} — ${formatDate(dateTo)}`}>
              <MoneyTimeline rows={dashboardQuery.data.dailyRevenue} />
            </AppCard>
          </Stack>
        )}

        {tab === "contracts" && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small"><TableHead><TableRow><TableCell>Контракт</TableCell><TableCell>Клиент</TableCell><TableCell>Объект</TableCell><TableCell>Период</TableCell><TableCell align="right">Стоимость</TableCell><TableCell align="right">Долг</TableCell><TableCell>Статус</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>{(contractsQuery.data?.items ?? []).map((row) => <TableRow key={row.id} hover><TableCell><Typography fontWeight={650}>№ {row.number ?? row.id}</Typography><Typography variant="caption" color="text.secondary">{row.name || "Без названия"}</Typography></TableCell><TableCell>{row.clientName}</TableCell><TableCell>{row.offeringName}<Typography variant="caption" color="text.secondary" display="block">{KIND_LABELS[row.offeringKind] ?? row.offeringKind}</Typography></TableCell><TableCell>{formatDate(row.startsOn)} — {formatDate(row.endsOn)}</TableCell><TableCell align="right">{formatMoney(row.effectivePrice)}<Typography variant="caption" color="text.secondary" display="block">{CYCLE_LABELS[row.effectiveBillingCycle] ?? row.effectiveBillingCycle}</Typography></TableCell><TableCell align="right" sx={{ color: Number(row.debt) > 0 ? "error.main" : undefined, fontWeight: 650 }}>{formatMoney(row.debt)}</TableCell><TableCell><StatusChip status={row.status} /></TableCell><TableCell align="right"><IconButton size="small" onClick={(e) => openMenu(e, row)}><MoreHorizOutlined /></IconButton></TableCell></TableRow>)}{!contractsQuery.isLoading && !(contractsQuery.data?.items.length) && <EmptyRow colSpan={8} text="Создайте первый контракт — начисления появятся автоматически." />}</TableBody>
            </Table>
          </TableContainer>
        )}

        {tab === "charges" && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small"><TableHead><TableRow><TableCell>Начисление</TableCell><TableCell>Клиент</TableCell><TableCell>Назначение</TableCell><TableCell>Срок</TableCell><TableCell align="right">Сумма</TableCell><TableCell align="right">Оплачено</TableCell><TableCell>Статус</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>{chargeRows.map((row) => { const progress = Math.min(100, Number(row.amount) ? Number(row.paidAmount) / Number(row.amount) * 100 : 0); return <TableRow key={row.id} hover><TableCell><Typography fontWeight={650}>№ {row.number}</Typography><Typography variant="caption" color="text.secondary">{row.periodLabel || row.periodKey}</Typography></TableCell><TableCell>{row.clientName}</TableCell><TableCell sx={{ maxWidth: 300 }}>{row.purpose}<Typography variant="caption" color="text.secondary" display="block">{row.offeringName}</Typography></TableCell><TableCell sx={{ color: row.status === "overdue" ? "error.main" : undefined }}>{formatDate(row.dueDate)}</TableCell><TableCell align="right">{formatMoney(row.amount)}</TableCell><TableCell align="right"><Typography variant="body2">{formatMoney(row.paidAmount)}</Typography><LinearProgress variant="determinate" value={progress} color={progress === 100 ? "success" : "primary"} sx={{ mt: 0.5, minWidth: 80, borderRadius: 3 }} /></TableCell><TableCell><StatusChip status={row.status} /></TableCell><TableCell align="right"><IconButton size="small" onClick={(e) => openMenu(e, row)}><MoreHorizOutlined /></IconButton></TableCell></TableRow>; })}{!chargesQuery.isLoading && !chargeRows.length && <EmptyRow colSpan={8} text="Начислений пока нет." />}</TableBody>
            </Table>
          </TableContainer>
        )}

        {tab === "payments" && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small"><TableHead><TableRow><TableCell>Платёж</TableCell><TableCell>Клиент</TableCell><TableCell>Начисление</TableCell><TableCell>Метод</TableCell><TableCell>Дата</TableCell><TableCell align="right">Сумма</TableCell><TableCell>Статус</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>{paymentRows.map((row) => <TableRow key={row.id} hover><TableCell>#{row.id}{row.refundOfId && <Typography variant="caption" color="text.secondary" display="block">Возврат #{row.refundOfId}</Typography>}</TableCell><TableCell>{row.clientName}</TableCell><TableCell>{row.chargeId ? `№ ${row.chargeId}` : "На баланс"}</TableCell><TableCell>{row.method}</TableCell><TableCell>{formatDate(row.paidAt ?? row.createdAt)}</TableCell><TableCell align="right" sx={{ fontWeight: 700, color: row.refundOfId ? "error.main" : "success.main" }}>{row.refundOfId ? "−" : "+"}{formatMoney(row.amount)}</TableCell><TableCell><StatusChip status={row.status} /></TableCell><TableCell align="right">{canManagePayments && !row.refundOfId && row.status === "succeeded" && <IconButton size="small" onClick={(e) => openMenu(e, row)}><MoreHorizOutlined /></IconButton>}</TableCell></TableRow>)}{!paymentsQuery.isLoading && !paymentRows.length && <EmptyRow colSpan={8} text="Оплат ещё нет." />}</TableBody>
            </Table>
          </TableContainer>
        )}

        {tab === "debtors" && (
          <Stack spacing={1.5}>
            {canRemind && <Box><Button variant="contained" startIcon={<NotificationsActiveOutlined />} disabled={!selectedDebtors.length || actionMutation.isPending} onClick={() => actionMutation.mutate(() => billingApi.remindDebtors(selectedDebtors, organizationId))}>Напомнить выбранным ({selectedDebtors.length})</Button></Box>}
            <TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow><TableCell padding="checkbox"><Checkbox checked={!!debtorsQuery.data?.length && selectedDebtors.length === debtorsQuery.data.length} indeterminate={selectedDebtors.length > 0 && selectedDebtors.length !== debtorsQuery.data?.length} onChange={(_, checked) => setSelectedDebtors(checked ? (debtorsQuery.data ?? []).map((d) => d.clientId) : [])} /></TableCell><TableCell>Клиент</TableCell><TableCell>Телефон</TableCell><TableCell>Просрочка</TableCell><TableCell>Начислений</TableCell><TableCell align="right">К оплате</TableCell><TableCell>Риск</TableCell></TableRow></TableHead><TableBody>{(debtorsQuery.data ?? []).map((row) => <TableRow key={row.clientId} hover><TableCell padding="checkbox"><Checkbox checked={selectedDebtors.includes(row.clientId)} onChange={(_, checked) => setSelectedDebtors((ids) => checked ? [...ids, row.clientId] : ids.filter((id) => id !== row.clientId))} /></TableCell><TableCell sx={{ fontWeight: 650 }}>{row.clientName}</TableCell><TableCell>{row.clientPhone || "—"}</TableCell><TableCell>{row.daysOverdue} дн.</TableCell><TableCell>{row.unpaidCount}</TableCell><TableCell align="right" sx={{ fontWeight: 750, color: "error.main" }}>{formatMoney(row.amountOverdue)}</TableCell><TableCell><Chip size="small" color={row.severity === "critical" ? "error" : row.severity === "medium" ? "warning" : "default"} label={row.severity === "critical" ? "Критический" : row.severity === "medium" ? "Средний" : "Низкий"} /></TableCell></TableRow>)}{!debtorsQuery.isLoading && !(debtorsQuery.data?.length) && <EmptyRow colSpan={7} text="Просроченной задолженности нет." />}</TableBody></Table></TableContainer>
          </Stack>
        )}

        {tab === "offerings" && (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 1.5 }}>
            {(offeringsQuery.data ?? []).map((row) => <AppCard key={row.id} sx={{ position: "relative" }} headerActions={<IconButton size="small" onClick={(e) => openMenu(e, row)}><MoreHorizOutlined /></IconButton>} title={row.name} subheader={`${KIND_LABELS[row.kind] ?? row.kind} · ${CYCLE_LABELS[row.billingCycle] ?? row.billingCycle}`}><Stack spacing={1.5}><Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Стоимость</Typography><Typography fontWeight={700}>{formatMoney(row.priceAmount)}</Typography></Stack><Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Клиентов</Typography><Typography fontWeight={700}>{row.clientsCount}</Typography></Stack><Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Выручка</Typography><Typography fontWeight={700}>{formatMoney(row.revenueTotal)}</Typography></Stack>{row.occupancy && <Chip size="small" label={`Занятость: ${row.occupancy}`} />}</Stack></AppCard>)}
            {!offeringsQuery.isLoading && !(offeringsQuery.data?.length) && <Alert severity="info">Создайте услугу, курс или объект аренды, чтобы заключать контракты.</Alert>}
          </Box>
        )}
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {menuItem && "effectivePrice" in menuItem && menuItem.status === "active" && <MenuItem onClick={() => actionMutation.mutate(() => billingApi.contractAction(menuItem.id, "pause", scopeParams))}>Поставить на паузу</MenuItem>}
        {menuItem && "effectivePrice" in menuItem && menuItem.status === "paused" && <MenuItem onClick={() => actionMutation.mutate(() => billingApi.contractAction(menuItem.id, "resume", scopeParams))}>Возобновить</MenuItem>}
        {menuItem && "effectivePrice" in menuItem && menuItem.status !== "ended" && <MenuItem onClick={() => actionMutation.mutate(() => billingApi.endContract(menuItem.id, dayjs().format("YYYY-MM-DD"), scopeParams))}>Завершить сегодня</MenuItem>}
        {menuItem && "paidAmount" in menuItem && menuItem.status === "draft" && <MenuItem onClick={() => actionMutation.mutate(() => billingApi.chargeAction(menuItem.id, "issue", scopeParams))}>Выставить</MenuItem>}
        {menuItem && "paidAmount" in menuItem && ["draft", "issued"].includes(menuItem.status) && <MenuItem onClick={() => actionMutation.mutate(() => billingApi.chargeAction(menuItem.id, "cancel", scopeParams))}>Отменить</MenuItem>}
        {menuItem && "paidAmount" in menuItem && !["paid", "cancelled"].includes(menuItem.status) && <MenuItem onClick={() => actionMutation.mutate(async () => { const result = await billingApi.createPayLink(menuItem.id, organizationId); await navigator.clipboard.writeText(result.providerPayUrl || result.url); notify?.({ type: "success", message: "Ссылка скопирована" }); return result; })}><LinkOutlined fontSize="small" sx={{ mr: 1 }} />Создать ссылку на оплату</MenuItem>}
        {menuItem && "refundOfId" in menuItem && !menuItem.refundOfId && <MenuItem onClick={() => actionMutation.mutate(() => billingApi.refundPayment(menuItem.id, undefined, scopeParams))}>Полный возврат</MenuItem>}
        {menuItem && "clientsCount" in menuItem && canManageOfferings && <MenuItem onClick={() => openOfferingEdit(menuItem)}>Изменить</MenuItem>}
        {menuItem && "clientsCount" in menuItem && canManageOfferings && <MenuItem onClick={() => actionMutation.mutate(() => billingApi.archiveOffering(menuItem.id, scopeParams))}>Архивировать</MenuItem>}
      </Menu>

      <Dialog open={dialog !== null} onClose={() => !submitMutation.isPending && setDialog(null)} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle>{dialog === "contract" ? "Новый контракт" : dialog === "charge" ? "Новое начисление" : dialog === "payment" ? "Принять оплату" : editingOffering ? "Изменить услугу" : "Новая услуга"}</DialogTitle>
        <DialogContent dividers sx={{ bgcolor: (theme) => subtleBg(theme), display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" }, gap: 2.25, px: { xs: 2, sm: 3 }, py: 3 }}>
          {dialog === "contract" && <><TextField select required label="Клиент" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} fullWidth>{(clientsQuery.data ?? []).map((client) => <MenuItem key={client.id} value={client.id}>{client.fullName}</MenuItem>)}</TextField><TextField select required label="Объект продажи" value={form.offeringId} onChange={(e) => setForm({ ...form, offeringId: e.target.value })} fullWidth>{(offeringsQuery.data ?? []).filter((o) => o.status === "active").map((offering) => <MenuItem key={offering.id} value={offering.id}>{offering.name}</MenuItem>)}</TextField><TextField label="Название контракта" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth /><TextField label="Особая цена" type="number" value={form.priceOverride} onChange={(e) => setForm({ ...form, priceOverride: e.target.value })} fullWidth /><TextField required label="Начало" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} InputLabelProps={{ shrink: true }} /><TextField label="Окончание" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} InputLabelProps={{ shrink: true }} /><TextField label="День начисления" type="number" inputProps={{ min: 1, max: 31 }} value={form.billingDay} onChange={(e) => setForm({ ...form, billingDay: e.target.value })} /></>}
          {dialog === "charge" && <><TextField select required label="Контракт" value={form.subscriptionId} onChange={(e) => { const c = contractsQuery.data?.items.find((row) => row.id === Number(e.target.value)); setForm({ ...form, subscriptionId: e.target.value, clientId: c ? String(c.clientId) : "" }); }} fullWidth sx={{ gridColumn: "1 / -1" }}>{(contractsQuery.data?.items ?? []).filter((c) => c.status === "active").map((contract) => <MenuItem key={contract.id} value={contract.id}>№ {contract.number ?? contract.id} · {contract.clientName} · {contract.offeringName}</MenuItem>)}</TextField><TextField required label="Назначение" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} fullWidth sx={{ gridColumn: "1 / -1" }} /><TextField required label="Сумма" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /><TextField required label="Срок оплаты" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} InputLabelProps={{ shrink: true }} /><TextField required label="Период" value={form.periodKey} onChange={(e) => setForm({ ...form, periodKey: e.target.value })} helperText="Например, 2026-09" /></>}
          {dialog === "payment" && <><TextField select required label="Клиент" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value, chargeId: "" })} fullWidth>{(clientsQuery.data ?? []).map((client) => <MenuItem key={client.id} value={client.id}>{client.fullName}</MenuItem>)}</TextField><TextField select label="Начисление" value={form.chargeId} onChange={(e) => { const charge = chargesQuery.data?.items.find((row) => row.id === Number(e.target.value)); setForm({ ...form, chargeId: e.target.value, clientId: charge ? String(charge.clientId) : form.clientId, amount: charge ? String(Math.max(0, Number(charge.amount) - Number(charge.paidAmount))) : form.amount }); }} fullWidth><MenuItem value="">Без начисления — на баланс</MenuItem>{(chargesQuery.data?.items ?? []).filter((c) => !["paid", "cancelled"].includes(c.status)).map((charge) => <MenuItem key={charge.id} value={charge.id}>№ {charge.number} · {charge.clientName} · {formatMoney(Number(charge.amount) - Number(charge.paidAmount))}</MenuItem>)}</TextField><TextField required label="Сумма" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /><TextField select required label="Способ" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><MenuItem value="cash">Наличные</MenuItem><MenuItem value="transfer">Банковский перевод</MenuItem><MenuItem value="bakai">Bakai Pay</MenuItem></TextField></>}
          {dialog === "offering" && <><TextField select required disabled={Boolean(editingOffering)} label="Тип" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} helperText={editingOffering ? "Тип нельзя изменить после создания" : "Определяет дополнительные поля"}><MenuItem value="service">Услуга</MenuItem><MenuItem value="course">Курс</MenuItem><MenuItem value="rental">Аренда</MenuItem></TextField><TextField required label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><TextField label="Категория" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /><TextField required label="Стоимость" type="number" value={form.priceAmount} onChange={(e) => setForm({ ...form, priceAmount: e.target.value })} /><TextField select required label="Периодичность" value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>{Object.entries(CYCLE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>{form.kind === "course" && <><TextField required label="Количество мест" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /><TextField required label="Количество занятий" type="number" value={form.sessionsTotal} onChange={(e) => setForm({ ...form, sessionsTotal: e.target.value })} /><TextField required label="Расписание" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} helperText="Например: пн/ср/пт 18:00" /><TextField required label="Начало курса" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} InputLabelProps={{ shrink: true }} /></>}{form.kind === "rental" && <><TextField select required label="Тип объекта" value={form.objectType} onChange={(e) => setForm({ ...form, objectType: e.target.value })}><MenuItem value="apartment">Квартира</MenuItem><MenuItem value="house">Дом</MenuItem><MenuItem value="floor">Этаж</MenuItem><MenuItem value="office">Офис</MenuItem><MenuItem value="land">Участок</MenuItem><MenuItem value="warehouse">Склад</MenuItem><MenuItem value="retail">Торговая площадь</MenuItem><MenuItem value="parking">Парковка</MenuItem><MenuItem value="other">Другое</MenuItem></TextField><TextField select required label="Единица площади" value={form.areaUnit} onChange={(e) => setForm({ ...form, areaUnit: e.target.value })}><MenuItem value="sqm">м²</MenuItem><MenuItem value="sotka">сотка</MenuItem></TextField><TextField select required label="Ставка за" value={form.ratePeriod} onChange={(e) => setForm({ ...form, ratePeriod: e.target.value })}><MenuItem value="day">Сутки</MenuItem><MenuItem value="month">Месяц</MenuItem><MenuItem value="year">Год</MenuItem></TextField><TextField label="Площадь" type="number" value={form.areaValue} onChange={(e) => setForm({ ...form, areaValue: e.target.value })} /><TextField label="Адрес" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} sx={{ gridColumn: "1 / -1" }} /><TextField label="Депозит" type="number" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} /></>}</>}
        </DialogContent>
        <DialogActions><Button onClick={() => setDialog(null)} disabled={submitMutation.isPending}>Отмена</Button><Button variant="contained" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || (dialog === "contract" && (!form.clientId || !form.offeringId)) || (dialog === "charge" && (!form.subscriptionId || !form.purpose || !form.amount)) || (dialog === "payment" && (!form.clientId || !form.amount)) || (dialog === "offering" && (!form.name || !form.priceAmount || (form.kind === "course" && (!form.capacity || !form.sessionsTotal || !form.schedule))))}>{submitMutation.isPending ? <CircularProgress size={20} /> : "Сохранить"}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
