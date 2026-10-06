import React from "react";
import { Box, Button, ButtonBase, MenuItem, Skeleton, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import dayjs from "dayjs";
import AddOutlined from "@mui/icons-material/AddOutlined";

import { EMPLOYEE_FILTERS, getBirthdays, getEmployees, getOrgStructure, getPersonnelEvents, getPersonnelSummary, personnelKeys, tenure, type Employee, type EmployeeFilter } from "../../api/personnel";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatPhoneDisplay } from "../../utility/phone";
import { StatusPill } from "../construction/shared";
import { cardSx } from "../estate-dashboard/format";
import { EmptyNote, PillTabs, SubPill, TwoLines } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { compactSum, employeeTone, eventTone } from "./format";
import { useCanManageStaff, useDepartments } from "./hooks";
import { EmployeeDrawer, EmployeeFormDrawer } from "./StaffDrawers";

type Tab = "list" | "org" | "events";
const TABS: Tab[] = ["list", "org", "events"];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * «Сотрудники» застройщика (AIVIO, гайд `frontend-hr-ops.md` §1): кадровый
 * учёт на `/api/v2/personnel` (не MamaDoc `/api/staff/employees/` — там нет
 * отдела, оклада и кадровых статусов). Вкладка — `?tab=`, карточка —
 * `?employee=`. Кнопки — `personnel.manage` + `staff.update` (см. hooks).
 */
export default function StaffPage() {
  const { t } = useT("personnel");
  usePageTitle(t("staff.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <StaffScreen />
    </Box>
  );
}

function StaffScreen() {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const canManage = useCanManageStaff();
  const [searchParams, setSearchParams] = useSearchParams();
  const [employeeId, openEmployee] = useIdParam("employee");
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "list";
  const [status, setStatus] = React.useState<EmployeeFilter>("working");
  const [deptId, setDeptId] = React.useState<number | "">("");
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search, 350);
  const [creating, setCreating] = React.useState(false);
  const enabled = scope.orgReady !== false;

  const summary = useQuery({ queryKey: personnelKeys.summary(scope), queryFn: ({ signal }) => getPersonnelSummary(scope, signal), enabled, staleTime: 30_000 });
  const params = { q, deptId: deptId === "" ? null : deptId, status };
  const employees = useQuery({ queryKey: personnelKeys.employees(scope, params), queryFn: ({ signal }) => getEmployees(params, scope, signal), enabled: enabled && tab === "list", staleTime: 30_000, placeholderData: keepPreviousData });
  const org = useQuery({ queryKey: personnelKeys.org(scope), queryFn: ({ signal }) => getOrgStructure(scope, signal), enabled: enabled && tab === "org", staleTime: 60_000 });
  const events = useQuery({ queryKey: personnelKeys.events(scope), queryFn: ({ signal }) => getPersonnelEvents(scope, signal), enabled: enabled && tab === "events", staleTime: 60_000 });
  const birthdays = useQuery({ queryKey: personnelKeys.birthdays(scope), queryFn: ({ signal }) => getBirthdays(30, scope, signal), enabled, staleTime: 10 * 60_000, retry: false });
  const departments = useDepartments().data ?? [];

  const setTab = (next: Tab) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "list") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );

  if (summary.error) return <ScreenError error={summary.error} title={t("staff.loadError")} onRetry={() => void summary.refetch()} />;

  const s = summary.data;
  const listError = employees.error ?? org.error ?? events.error;

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>{t("staff.subtitle")}</Typography>
        {canManage && (
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setCreating(true)} sx={{ whiteSpace: "nowrap" }}>
            {t("staff.newEmployee")}
          </Button>
        )}
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "employees", label: t("staff.kpi.employees"), value: String(s.employees), hint: t("staff.kpi.employeesHint", { departments: s.departments, fund: compactSum(s.payrollFund, t) }) },
                { key: "hired", label: t("staff.kpi.hired"), value: String(s.hiredThisYear), hint: t("staff.kpi.hiredHint", { count: s.fired }) },
                { key: "probation", label: t("staff.kpi.probation"), value: String(s.probation), tone: s.probation > 0 ? "warning" : null },
                { key: "absent", label: t("staff.kpi.absent"), value: String(s.absentToday) },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <PillTabs<Tab> value={tab} onChange={setTab} tabs={TABS.map((key) => ({ key, label: t(`staff.tabs.${key}`) }))} />
        {tab === "list" && (
          <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
            <TextField
              select
              size="small"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value === "" ? "" : Number(e.target.value))}
              SelectProps={{ displayEmpty: true }}
              sx={{ minWidth: 180, "& .MuiInputBase-root": { height: 32, fontSize: "0.875rem" } }}
              inputProps={{ "aria-label": t("common.allDepartments") }}
            >
              <MenuItem value="">{t("common.allDepartments")}</MenuItem>
              {departments.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
            <SearchBox value={search} onChange={setSearch} placeholder={t("staff.search")} />
          </Box>
        )}
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 300px" }, alignItems: "start" }}>
        <Box sx={{ minWidth: 0 }}>
          {tab === "list" && (
            <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {EMPLOYEE_FILTERS.map((key) => (
                <SubPill key={key} active={status === key} onClick={() => setStatus(key)} label={t(`staff.filter.${key}`)} />
              ))}
            </Box>
          )}
          {listError ? (
            <ScreenError error={listError} onRetry={() => void (tab === "list" ? employees : tab === "org" ? org : events).refetch()} />
          ) : tab === "list" ? (
            <Box sx={{ ...cardSx, overflow: "hidden" }}>
              <EmployeesGrid rows={employees.data ?? []} loading={employees.isFetching} filtered={Boolean(q.trim()) || deptId !== "" || status !== "working"} onOpen={(row) => openEmployee(row.id)} />
            </Box>
          ) : tab === "org" ? (
            <OrgView data={org.data} onOpen={openEmployee} />
          ) : (
            <Box sx={{ ...cardSx, overflow: "hidden" }}>
              {!events.data ? (
                <Box sx={{ p: 2 }}>
                  <Skeleton variant="rounded" height={200} />
                </Box>
              ) : events.data.length === 0 ? (
                <EmptyNote text={t("staff.events.empty")} />
              ) : (
                events.data.map((ev) => (
                  <ButtonBase
                    key={ev.id}
                    disabled={ev.employeeId == null}
                    onClick={() => ev.employeeId != null && openEmployee(ev.employeeId)}
                    sx={{ width: "100%", px: 2.25, py: 1.25, display: "flex", alignItems: "baseline", gap: 1.5, textAlign: "left", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}
                  >
                    <Typography sx={{ width: 84, flexShrink: 0, fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{dayjs(ev.at).format("DD.MM.YYYY")}</Typography>
                    <Box sx={{ flexShrink: 0 }}>
                      <StatusPill label={ev.typeLabel || ev.type} tone={eventTone(ev.type)} />
                    </Box>
                    <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }}>{ev.text}</Typography>
                  </ButtonBase>
                ))
              )}
            </Box>
          )}
        </Box>
        <Box sx={{ ...cardSx, minWidth: 0 }}>
          <CardHeader title={t("staff.birthdays")} />
          <Box sx={{ px: 2.25, pb: 1.5 }}>
            {(birthdays.data ?? []).length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("staff.birthdaysEmpty")}</Typography>}
            {birthdays.data?.map((b) => (
              <ButtonBase key={b.id} onClick={() => openEmployee(b.id)} sx={{ width: "100%", py: 0.9, display: "flex", alignItems: "baseline", gap: 1, textAlign: "left", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                    {b.name}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                    {b.position}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: "0.75rem", color: b.daysLeft === 0 ? "success.main" : "text.secondary", whiteSpace: "nowrap" }}>
                  {b.daysLeft === 0 ? t("staff.birthdayToday") : b.daysLeft != null ? t("staff.birthdayIn", { days: t("common.days", { count: b.daysLeft }) }) : dayjs(b.date).format("DD.MM")}
                </Typography>
              </ButtonBase>
            ))}
          </Box>
        </Box>
      </Box>

      <EmployeeDrawer id={employeeId} preview={employees.data?.find((e) => e.id === employeeId) ?? null} canManage={canManage} onClose={() => openEmployee(null)} />
      <EmployeeFormDrawer open={creating} employee={null} onClose={() => setCreating(false)} onCreated={(id) => openEmployee(id)} />
    </>
  );
}

function EmployeesGrid({ rows, loading, filtered, onOpen }: { rows: Employee[]; loading: boolean; filtered: boolean; onOpen: (row: Employee) => void }) {
  const { t } = useT("personnel");
  const tenureText = (hired: string | null) => {
    const v = tenure(hired);
    if (!v) return "—";
    if (v.years === 0 && v.months === 0) return t("staff.table.tenureNew");
    return [v.years ? t("common.years", { count: v.years }) : "", v.months ? t("common.months", { count: v.months }) : ""].filter(Boolean).join(" ");
  };
  const columns: GridColDef<Employee>[] = [
    { field: "name", headerName: t("staff.table.name"), flex: 1.3, minWidth: 200, renderCell: ({ row }) => <TwoLines strong top={row.name} bottom={row.position || null} /> },
    { field: "deptName", headerName: t("staff.table.dept"), flex: 1, minWidth: 160, renderCell: ({ row }) => <TwoLines top={row.deptName || "—"} bottom={row.projectName || null} /> },
    { field: "phone", headerName: t("staff.table.phone"), width: 160, renderCell: ({ row }) => <TwoLines top={row.phone ? formatPhoneDisplay(row.phone) : "—"} /> },
    { field: "hired", headerName: t("staff.table.hired"), width: 140, renderCell: ({ row }) => <TwoLines top={row.hired ? dayjs(row.hired).format("DD.MM.YYYY") : "—"} bottom={tenureText(row.hired)} /> },
    { field: "status", headerName: t("staff.table.status"), width: 150, renderCell: ({ row }) => <StatusPill label={row.statusLabel || row.status} tone={employeeTone(row.status)} /> },
  ];
  return (
    <DataGrid<Employee>
      rows={rows}
      columns={columns}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: filtered ? t("common.emptyFiltered") : t("common.empty") }}
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

/** Оргструктура: отдел, руководитель, люди; карточка гендиректора — руководитель «Руководства». */
function OrgView({ data, onOpen }: { data: Awaited<ReturnType<typeof getOrgStructure>> | undefined; onOpen: (id: number) => void }) {
  const { t } = useT("personnel");
  if (!data) return <Skeleton variant="rounded" height={300} sx={{ borderRadius: "14px" }} />;
  if (data.length === 0)
    return (
      <Box sx={cardSx}>
        <EmptyNote text={t("common.empty")} />
      </Box>
    );
  return (
    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" } }}>
      {data.map((d) => (
        <Box key={d.id} sx={{ ...cardSx, p: 2, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1 }}>
            <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 700 }}>{d.name}</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("staff.org.people", { count: d.count })}</Typography>
          </Box>
          {d.head ? (
            <ButtonBase onClick={() => onOpen(d.head!.id)} sx={(th) => ({ width: "100%", p: 1, mb: 0.75, borderRadius: "10px", display: "block", textAlign: "left", bgcolor: th.palette.action.hover })}>
              <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("staff.org.head")}</Typography>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{d.head.name}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{d.head.position}</Typography>
            </ButtonBase>
          ) : (
            <Typography sx={{ mb: 0.75, fontSize: "0.75rem", color: "text.secondary" }}>{t("staff.org.noHead")}</Typography>
          )}
          {d.people
            .filter((p) => !p.isHead)
            .map((p) => (
              <ButtonBase key={p.id} onClick={() => onOpen(p.id)} sx={{ width: "100%", py: 0.6, display: "flex", alignItems: "baseline", gap: 1, textAlign: "left" }}>
                <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }}>
                  {p.name}
                </Typography>
                <Typography noWrap sx={{ maxWidth: "50%", fontSize: "0.72rem", color: "text.secondary" }}>
                  {[p.position, p.projectName].filter(Boolean).join(" · ")}
                </Typography>
              </ButtonBase>
            ))}
        </Box>
      ))}
    </Box>
  );
}
