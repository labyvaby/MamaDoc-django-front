import React from "react";
import { Alert, Box, Button, Drawer, IconButton, MenuItem, Skeleton, Switch, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import {
  createGuestPass,
  getAppAccessLog,
  getAppDevices,
  getAppStats,
  getAppUsers,
  getGuestPasses,
  getInstallment,
  getPushes,
  getUtilityBills,
  openGate,
  payUtilityBill,
  paymentState,
  residentAppKeys,
  revokeGuestPass,
  sendMeterReadings,
  sendPush,
  setUserPush,
  toggleAppDevice,
  type AppDevice,
  type AppUser,
} from "../../api/residentApp";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { useConstructionProjects } from "../construction/hooks";
import { ProgressBar, SectionTitle, StatusPill } from "../construction/shared";
import { cardSx } from "../estate-dashboard/format";
import { ConfirmDialog, EmptyNote, FormDrawer, InfoRow, PillTabs, SubPill, TwoLines } from "../realty-finance/shared";
import { KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { parseNumber } from "./format";
import { useRefreshOps } from "./hooks";

type Tab = "users" | "devices" | "pushes" | "access";
const TABS: Tab[] = ["users", "devices", "pushes", "access"];
/** «2026-10» → «октябрь 2026»; иное — как пришло. */
const billMonth = (month: string) => (/^\d{4}-\d{2}$/.test(month) ? dayjs(`${month}-01`).locale("ru").format("MMMM YYYY") : month);
const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/**
 * «Мобильное приложение» застройщика (AIVIO, гайд `frontend-hr-ops.md` §6):
 * консоль приложения покупателя и жильца — пользователи, «Умный ЖК», push,
 * журнал доступа; «Смотреть как» (`?user=`) — платежи, пропуска, шлагбаум.
 * Действия — `resident_app.manage` (по умолчанию ни у одной роли).
 * Телефонный «макет» прототипа заменён карточкой пользователя.
 */
export default function MobileAppPage() {
  const { t } = useT("estateOps");
  usePageTitle(t("mobileapp.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <MobileAppScreen />
    </Box>
  );
}

function MobileAppScreen() {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const refresh = useRefreshOps();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("resident_app.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const [userId, openUser] = useIdParam("user");
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "users";
  const [role, setRole] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [pushOpen, setPushOpen] = React.useState(false);
  const enabled = scope.orgReady !== false;

  const stats = useQuery({ queryKey: residentAppKeys.stats(scope), queryFn: ({ signal }) => getAppStats(scope, signal), enabled, staleTime: 30_000 });
  const users = useQuery({ queryKey: residentAppKeys.users(scope), queryFn: ({ signal }) => getAppUsers(scope, signal), enabled, staleTime: 30_000 });
  const devices = useQuery({ queryKey: residentAppKeys.devices(scope), queryFn: ({ signal }) => getAppDevices(scope, signal), enabled: enabled && tab === "devices", staleTime: 30_000 });
  const pushes = useQuery({ queryKey: residentAppKeys.pushes(scope), queryFn: ({ signal }) => getPushes(scope, signal), enabled: enabled && tab === "pushes", staleTime: 30_000 });
  const access = useQuery({ queryKey: residentAppKeys.access(scope), queryFn: ({ signal }) => getAppAccessLog(scope, signal), enabled: enabled && tab === "access", staleTime: 15_000 });
  const toggle = useMutation({
    mutationFn: (d: AppDevice) => toggleAppDevice(d.id, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("mobileapp.devices.toggled"), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" }),
  });

  const setTab = (next: Tab) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "users") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );

  if (stats.error) return <ScreenError error={stats.error} title={t("mobileapp.loadError")} onRetry={() => void stats.refetch()} />;
  const s = stats.data;
  const qn = search.trim().toLocaleLowerCase("ru");
  const userRows = (users.data ?? []).filter((u) => (role === "all" || u.role === role) && (!qn || [u.name, u.phone, String(u.unitNumber ?? ""), u.projectName].some((f) => f.toLocaleLowerCase("ru").includes(qn))));
  const listError = users.error ?? devices.error ?? pushes.error ?? access.error;
  const counts = { users: users.data?.length ?? null, devices: s?.devicesTotal ?? null, pushes: s?.pushes ?? null, access: s?.accessEvents ?? null };

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>{t("mobileapp.subtitle")}</Typography>
        {canManage && (
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setPushOpen(true)} sx={{ whiteSpace: "nowrap" }}>
            {t("mobileapp.pushes.new")}
          </Button>
        )}
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "installs", label: t("mobileapp.kpi.installs"), value: String(s.installs), hint: t("mobileapp.kpi.installsHint", { count: s.installsMonth }) },
                { key: "active", label: t("mobileapp.kpi.active"), value: String(s.activeMonth) },
                { key: "pay", label: t("mobileapp.kpi.pay"), value: String(s.payViaApp) },
                { key: "devices", label: t("mobileapp.kpi.devices"), value: `${s.devicesOnline} / ${s.devicesTotal}`, tone: s.devicesOnline < s.devicesTotal ? "warning" : null },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <PillTabs<Tab> value={tab} onChange={setTab} tabs={TABS.map((key) => ({ key, label: t(`mobileapp.tabs.${key}`), count: counts[key] }))} />
        {tab === "users" && (
          <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
            <SearchBox value={search} onChange={setSearch} placeholder={t("mobileapp.search")} />
          </Box>
        )}
      </Box>

      {listError ? (
        <ScreenError error={listError} onRetry={() => void (tab === "users" ? users : tab === "devices" ? devices : tab === "pushes" ? pushes : access).refetch()} />
      ) : tab === "users" ? (
        <>
          <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {["all", "buyer", "resident"].map((key) => (
              <SubPill key={key} active={role === key} onClick={() => setRole(key)} label={t(`mobileapp.role.${key}`)} />
            ))}
          </Box>
          <Box sx={{ ...cardSx, overflow: "hidden" }}>
            <UsersGrid rows={userRows} loading={users.isFetching} onOpen={(u) => openUser(u.id)} />
          </Box>
        </>
      ) : tab === "devices" ? (
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          <DevicesGrid rows={devices.data ?? []} loading={devices.isFetching} canManage={canManage} busy={toggle.isPending} onToggle={(d) => toggle.mutate(d)} />
        </Box>
      ) : tab === "pushes" ? (
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          {!pushes.data ? (
            <Box sx={{ p: 2 }}>
              <Skeleton variant="rounded" height={160} />
            </Box>
          ) : pushes.data.length === 0 ? (
            <EmptyNote text={t("common.empty")} />
          ) : (
            pushes.data.map((p) => (
              <Box key={p.id} sx={{ px: 2.25, py: 1.25, display: "flex", alignItems: "baseline", gap: 1.5, flexWrap: "wrap", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                <Box sx={{ flex: "1 1 260px", minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{p.title}</Typography>
                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{p.text}</Typography>
                </Box>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", whiteSpace: "nowrap" }}>
                  {[p.toLabel, p.sent && dayjs(p.sent).format("DD.MM.YYYY HH:mm")].filter(Boolean).join(" · ")}
                </Typography>
                <Typography sx={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                  {t("mobileapp.pushes.delivered")}: <b>{p.delivered}</b> · {t("mobileapp.pushes.opened")}: <b>{p.opened}</b>
                </Typography>
              </Box>
            ))
          )}
        </Box>
      ) : (
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          {!access.data ? (
            <Box sx={{ p: 2 }}>
              <Skeleton variant="rounded" height={160} />
            </Box>
          ) : access.data.length === 0 ? (
            <EmptyNote text={t("mobileapp.access.empty")} />
          ) : (
            access.data.map((e) => (
              <Box key={e.id} sx={{ px: 2.25, py: 1, display: "flex", alignItems: "baseline", gap: 1.5, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                <Typography sx={{ width: 110, flexShrink: 0, fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{e.at ? dayjs(e.at).format("DD.MM HH:mm") : "—"}</Typography>
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }}>{[e.who, e.text].filter(Boolean).join(" · ") || "—"}</Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{[e.projectName, e.deviceName, e.via].filter(Boolean).join(" · ")}</Typography>
              </Box>
            ))
          )}
        </Box>
      )}

      <UserDrawer user={(users.data ?? []).find((u) => u.id === userId) ?? null} open={userId != null} canManage={canManage} onClose={() => openUser(null)} />
      <PushDrawer open={pushOpen} onClose={() => setPushOpen(false)} />
    </>
  );
}

function UsersGrid({ rows, loading, onOpen }: { rows: AppUser[]; loading: boolean; onOpen: (row: AppUser) => void }) {
  const { t } = useT("estateOps");
  const columns: GridColDef<AppUser>[] = [
    { field: "name", headerName: t("mobileapp.users.name"), flex: 1.2, minWidth: 200, renderCell: ({ row }) => <TwoLines strong top={row.name} bottom={[row.roleLabel, row.phone && formatPhoneDisplay(row.phone)].filter(Boolean).join(" · ") || null} /> },
    { field: "projectName", headerName: t("mobileapp.users.unit"), flex: 1, minWidth: 180, renderCell: ({ row }) => <TwoLines top={row.unitNumber != null ? t("mobileapp.users.unitValue", { project: row.projectName, number: row.unitNumber }) : row.projectName || "—"} bottom={row.contract || null} /> },
    { field: "platform", headerName: t("mobileapp.users.platform"), width: 110 },
    {
      field: "payment",
      headerName: t("mobileapp.users.payment"),
      width: 160,
      sortable: false,
      renderCell: ({ row }) => {
        const p = paymentState(row);
        return <StatusPill label={t(`mobileapp.payment.${p.key}`, { amount: p.amount != null ? formatKGS(p.amount) : "", defaultValue: "—" })} tone={p.tone} />;
      },
    },
    { field: "lastActive", headerName: t("mobileapp.users.lastActive"), width: 140, renderCell: ({ row }) => <TwoLines top={row.lastActive ? dayjs(row.lastActive).format("DD.MM HH:mm") : "—"} /> },
    { field: "push", headerName: t("mobileapp.users.push"), width: 80, renderCell: ({ row }) => (row.push ? "✓" : "—") },
  ];
  return (
    <DataGrid<AppUser>
      rows={rows}
      columns={columns}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
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

function DevicesGrid({ rows, loading, canManage, busy, onToggle }: { rows: AppDevice[]; loading: boolean; canManage: boolean; busy: boolean; onToggle: (d: AppDevice) => void }) {
  const { t } = useT("estateOps");
  const columns: GridColDef<AppDevice>[] = [
    { field: "name", headerName: t("mobileapp.devices.name"), flex: 1.2, minWidth: 200, renderCell: ({ row }) => <TwoLines strong top={row.name} bottom={row.typeLabel || null} /> },
    { field: "projectName", headerName: t("mobileapp.devices.project"), flex: 1, minWidth: 160 },
    { field: "status", headerName: t("mobileapp.devices.status"), width: 140, renderCell: ({ row }) => <StatusPill label={row.status === "online" ? t("mobileapp.devices.online") : t("mobileapp.devices.offline")} tone={row.status === "online" ? "success" : "error"} /> },
    { field: "lastSeen", headerName: t("mobileapp.devices.lastSeen"), width: 140, renderCell: ({ row }) => <TwoLines top={row.lastSeen ? dayjs(row.lastSeen).format("DD.MM HH:mm") : "—"} /> },
    ...(canManage
      ? [
          {
            field: "toggle",
            headerName: t("mobileapp.devices.toggle"),
            width: 110,
            sortable: false,
            renderCell: ({ row }: { row: AppDevice }) => <Switch size="small" checked={row.status === "online"} disabled={busy} onChange={() => onToggle(row)} inputProps={{ "aria-label": t("mobileapp.devices.toggle") }} />,
          } as GridColDef<AppDevice>,
        ]
      : []),
  ];
  return (
    <DataGrid<AppDevice>
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

/** «Смотреть как»: профиль, платежи (рассрочка / коммуналка), пропуска, шлагбаум, показания. */
function UserDrawer({ user, open, canManage, onClose }: { user: AppUser | null; open: boolean; canManage: boolean; onClose: () => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const refresh = useRefreshOps();
  const { enqueueSnackbar } = useSnackbar();
  const [plate, setPlate] = React.useState("");
  const [meters, setMeters] = React.useState(false);
  const id = user?.id ?? 0;
  const isResident = user?.role === "resident";
  const installment = useQuery({ queryKey: residentAppKeys.installment(scope, id), queryFn: ({ signal }) => getInstallment(id, scope, signal), enabled: open && user != null && user.role === "buyer", staleTime: 30_000 });
  const bills = useQuery({ queryKey: residentAppKeys.bills(scope, id), queryFn: ({ signal }) => getUtilityBills(id, scope, signal), enabled: open && isResident, staleTime: 30_000 });
  const passes = useQuery({ queryKey: residentAppKeys.passes(scope, id), queryFn: ({ signal }) => getGuestPasses(id, scope, signal), enabled: open && isResident, staleTime: 30_000 });
  const onError = (error: unknown) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" });
  const ok = (text: string) => {
    refresh();
    enqueueSnackbar(text, { variant: "success" });
  };
  const gate = useMutation({ mutationFn: (type: "barrier" | "intercom") => openGate(id, type, scope), onSuccess: () => ok(t("mobileapp.user.opened")), onError });
  const pass = useMutation({
    mutationFn: () => createGuestPass(id, plate, scope),
    onSuccess: () => {
      setPlate("");
      ok(t("mobileapp.user.passCreated"));
    },
    onError,
  });
  const revoke = useMutation({ mutationFn: (passId: number) => revokeGuestPass(passId, scope), onSuccess: () => ok(t("mobileapp.user.revoked")), onError });
  const pay = useMutation({ mutationFn: (billId: number) => payUtilityBill(billId, scope), onSuccess: () => ok(t("mobileapp.user.billPaid")), onError });
  const push = useMutation({ mutationFn: (value: boolean) => setUserPush(id, value, scope), onSuccess: (_, value) => ok(value ? t("mobileapp.user.pushOn") : t("mobileapp.user.pushOff")), onError });
  React.useEffect(() => {
    setPlate("");
    setMeters(false);
  }, [id]);
  const bill = bills.data?.[0] ?? null;
  const inst = installment.data;

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("mobileapp.user.title")}</Typography>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {user?.name ?? ""}
          </Typography>
        </Box>
        {user && <StatusPill label={user.roleLabel || user.role} tone={user.role === "resident" ? "success" : "primary"} />}
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2.25, alignContent: "start" }}>
        {!user && <Alert severity="info">{t("mobileapp.user.notFound")}</Alert>}
        {user && (
          <>
            <Box>
              {user.phone && <InfoRow label={t("mobileapp.user.phone")} value={formatPhoneDisplay(user.phone)} />}
              <InfoRow label={t("mobileapp.users.unit")} value={user.unitNumber != null ? t("mobileapp.users.unitValue", { project: user.projectName, number: user.unitNumber }) : user.projectName || "—"} />
              {user.contract && <InfoRow label={t("mobileapp.user.contract")} value={user.contract} />}
              {user.parking && <InfoRow label={t("mobileapp.user.parking")} value={user.parking} />}
              <InfoRow label={t("mobileapp.users.platform")} value={user.platform || "—"} />
              {user.installed && <InfoRow label={t("mobileapp.user.installed")} value={dayjs(user.installed).format("DD.MM.YYYY")} />}
              <InfoRow
                label={t("mobileapp.user.push")}
                value={<Switch size="small" checked={user.push} disabled={!canManage || push.isPending} onChange={(e) => push.mutate(e.target.checked)} inputProps={{ "aria-label": t("mobileapp.user.push") }} />}
              />
            </Box>

            <Box>
              <SectionTitle>{t("mobileapp.user.payments")}</SectionTitle>
              {user.role === "buyer" ? (
                installment.isLoading ? (
                  <Skeleton variant="rounded" height={100} />
                ) : inst ? (
                  <Box sx={{ display: "grid", gap: 0.75 }}>
                    <Box>
                      <Typography sx={{ fontSize: "0.8125rem", mb: 0.5 }}>{t("mobileapp.user.paid", { count: inst.paidCount, term: inst.term })}</Typography>
                      <ProgressBar value={inst.progress} color={inst.overdue > 0 ? "error.main" : "primary.main"} />
                    </Box>
                    <InfoRow label={t("mobileapp.user.outstanding")} value={formatKGS(inst.outstanding)} />
                    {inst.overdue > 0 && <InfoRow label={t("mobileapp.user.overdue")} value={formatKGS(inst.overdue)} tone="error" />}
                    {inst.next && <InfoRow label={t("mobileapp.user.next")} value={t("mobileapp.user.nextValue", { number: inst.next.number, date: dayjs(inst.next.dueDate).format("DD.MM.YYYY"), amount: formatKGS(inst.next.balance || inst.next.amount) })} />}
                    {inst.managerName && <InfoRow label={t("mobileapp.user.manager")} value={inst.managerName} />}
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("mobileapp.user.installmentNone")}</Typography>
                )
              ) : bills.isLoading ? (
                <Skeleton variant="rounded" height={100} />
              ) : bill ? (
                <Box sx={{ display: "grid", gap: 0.5 }}>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{t("mobileapp.user.bill", { month: billMonth(bill.month) })}</Typography>
                  {bill.lines.map(([name, amount]) => (
                    <InfoRow key={name} label={name} value={formatKGS(amount)} />
                  ))}
                  <InfoRow label={bill.statusLabel || bill.status} value={formatKGS(bill.total)} tone={bill.status === "paid" ? "success" : bill.status === "overdue" ? "error" : null} />
                  {canManage && bill.status !== "paid" && (
                    <Button variant="contained" size="small" onClick={() => pay.mutate(bill.id)} disabled={pay.isPending} sx={{ justifySelf: "start", mt: 0.5 }}>
                      {t("mobileapp.user.payBill", { amount: formatKGS(bill.total) })}
                    </Button>
                  )}
                </Box>
              ) : (
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("mobileapp.user.billNone")}</Typography>
              )}
            </Box>

            {isResident ? (
              <>
                {canManage && (
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <Button variant="outlined" onClick={() => gate.mutate("barrier")} disabled={gate.isPending}>
                      {t("mobileapp.user.barrier")}
                    </Button>
                    <Button variant="outlined" onClick={() => gate.mutate("intercom")} disabled={gate.isPending}>
                      {t("mobileapp.user.intercom")}
                    </Button>
                    <Button onClick={() => setMeters(true)}>{t("mobileapp.user.meters")}</Button>
                  </Box>
                )}
                <Box>
                  <SectionTitle>{t("mobileapp.user.passes")}</SectionTitle>
                  {passes.data?.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("mobileapp.user.passesEmpty")}</Typography>}
                  {passes.data?.slice(0, 5).map((p) => (
                    <Box key={p.id} sx={{ py: 0.6, display: "flex", alignItems: "center", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                      <Typography sx={{ flex: 1, fontSize: "0.8125rem", fontWeight: 600 }}>{p.plate}</Typography>
                      <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{[p.statusLabel, p.validUntil && dayjs(p.validUntil).format("DD.MM HH:mm")].filter(Boolean).join(" · ")}</Typography>
                      {canManage && p.status === "active" && (
                        <Button size="small" color="error" onClick={() => revoke.mutate(p.id)} disabled={revoke.isPending}>
                          {t("mobileapp.user.revoke")}
                        </Button>
                      )}
                    </Box>
                  ))}
                  {canManage && (
                    <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
                      <TextField size="small" label={t("mobileapp.user.plate")} value={plate} onChange={(e) => setPlate(e.target.value)} sx={{ flex: 1 }} />
                      <Button variant="contained" onClick={() => pass.mutate()} disabled={!plate.trim() || pass.isPending}>
                        {t("mobileapp.user.newPass")}
                      </Button>
                    </Box>
                  )}
                </Box>
              </>
            ) : (
              <Alert severity="info">{t("mobileapp.user.buyerLocked")}</Alert>
            )}
          </>
        )}
      </Box>
      <MetersDialog userId={meters ? id : null} onClose={() => setMeters(false)} />
    </Drawer>
  );
}

function MetersDialog({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const refresh = useRefreshOps();
  const { enqueueSnackbar } = useSnackbar();
  const [values, setValues] = React.useState({ cold: "", hot: "", el: "" });
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => sendMeterReadings(userId as number, { cold: String(parseNumber(values.cold)), hot: String(parseNumber(values.hot)), el: String(parseNumber(values.el)) }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("mobileapp.user.metersSent"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (userId == null) return;
    setValues({ cold: "", hot: "", el: "" });
    setTouched(false);
    save.reset();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const bad = (v: string) => parseNumber(v) == null || (parseNumber(v) as number) < 0;
  const invalid = bad(values.cold) || bad(values.hot) || bad(values.el);
  return (
    <ConfirmDialog
      open={userId != null}
      title={t("mobileapp.user.metersTitle")}
      confirmLabel={t("mobileapp.user.meters")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => {
        setTouched(true);
        if (!invalid) save.mutate();
      }}
      onClose={onClose}
    >
      {(["cold", "hot", "el"] as const).map((k) => (
        <TextField
          key={k}
          size="small"
          label={t(`mobileapp.user.${k}`)}
          value={values[k]}
          inputMode="decimal"
          onChange={(e) => setValues((prev) => ({ ...prev, [k]: e.target.value }))}
          error={touched && bad(values[k])}
          helperText={touched && bad(values[k]) ? t("common.number") : undefined}
        />
      ))}
    </ConfirmDialog>
  );
}

function PushDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const refresh = useRefreshOps();
  const { enqueueSnackbar } = useSnackbar();
  const projects = useConstructionProjects(open).data ?? [];
  const [title, setTitle] = React.useState("");
  const [text, setText] = React.useState("");
  const [to, setTo] = React.useState("all");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => sendPush({ title, text, to }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("mobileapp.pushes.created"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setText("");
    setTo("all");
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  return (
    <FormDrawer
      open={open}
      title={t("mobileapp.pushes.newTitle")}
      submitLabel={t("mobileapp.pushes.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (title.trim() && text.trim()) save.mutate();
      }}
    >
      <TextField select size="small" label={t("mobileapp.pushes.toField")} value={to} onChange={(e) => setTo(e.target.value)}>
        <MenuItem value="all">{t("mobileapp.pushes.to_all")}</MenuItem>
        <MenuItem value="buyers">{t("mobileapp.pushes.to_buyers")}</MenuItem>
        <MenuItem value="residents">{t("mobileapp.pushes.to_residents")}</MenuItem>
        {projects.map((p) => (
          <MenuItem key={p.projectId} value={String(p.projectId)}>
            {t("mobileapp.pushes.to_project", { name: p.projectName })}
          </MenuItem>
        ))}
      </TextField>
      <TextField size="small" label={t("mobileapp.pushes.titleField")} value={title} onChange={(e) => setTitle(e.target.value)} error={touched && !title.trim()} helperText={touched && !title.trim() ? t("common.required") : undefined} />
      <TextField size="small" label={t("mobileapp.pushes.text")} value={text} onChange={(e) => setText(e.target.value)} multiline minRows={3} error={touched && !text.trim()} helperText={touched && !text.trim() ? t("common.required") : undefined} />
    </FormDrawer>
  );
}
