import React from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, Skeleton, Typography } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";

import { getPayroll, getPayslip, payrollActions, payrollKeys, previousMonth, runPayrollAction, type PayrollAction, type PayrollRow, type PayrollRun } from "../../api/salaryPayroll";
import { useCan } from "../../hooks/useCan";
import { useEstateLevel } from "../../hooks/useEstateNav";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { StatusPill } from "../construction/shared";
import { cardSx } from "../estate-dashboard/format";
import { AmountBars, ConfirmDialog, InfoRow } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError } from "../realty-sales/shared";
import { compactSum, monthLabel, shiftMonth } from "./format";
import { useRefreshPersonnel } from "./hooks";

const runTone = (status: string) => (status === "paid" ? "success" : status === "approved" ? "info" : status === "calculated" ? "warning" : null);

/**
 * «Зарплата» застройщика (AIVIO, гайд `frontend-hr-ops.md` §3): ведомость
 * месяца или прогноз, если её ещё нет; «Рассчитать → Утвердить (приказ в
 * ЭДО) → В банк» по статусу. Месяц — `?month=`, по умолчанию прошлый.
 * Кнопки — `salary.manage` **и** уровень `payroll` ∈ {edit, approve} в
 * матрице ролей: `salary.manage` есть и у продажника (вопрос бэка №2).
 */
export default function PayrollPage() {
  const { t } = useT("personnel");
  usePageTitle(t("payroll.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <PayrollScreen />
    </Box>
  );
}

function PayrollScreen() {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const refresh = useRefreshPersonnel();
  const { enqueueSnackbar } = useSnackbar();
  const level = useEstateLevel("payroll");
  // Матрица не пришла или роль без ограничений (`nav = null`) — решает право.
  const canManage = useCan("salary.manage") && (level == null || level === "edit" || level === "approve");
  const [searchParams, setSearchParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(searchParams.get("month") ?? "") ? (searchParams.get("month") as string) : previousMonth();
  const [confirm, setConfirm] = React.useState<"approve" | "pay" | null>(null);
  const [payslipFor, setPayslipFor] = React.useState<PayrollRow | null>(null);
  const key = payrollKeys.run(scope, month);

  const run = useQuery({ queryKey: key, queryFn: ({ signal }) => getPayroll(month, scope, signal), enabled: scope.orgReady !== false, staleTime: 30_000, placeholderData: keepPreviousData });
  const done: Record<PayrollAction, (r: PayrollRun) => string> = {
    calculate: () => t("payroll.calculated"),
    recalculate: () => t("payroll.recalculated"),
    approve: (r) => t("payroll.approved", { number: r.orderNumber }),
    pay: () => t("payroll.paid"),
  };
  const act = useMutation({
    mutationFn: (action: PayrollAction) => runPayrollAction(month, action, scope),
    onSuccess: (fresh, action) => {
      setConfirm(null);
      queryClient.setQueryData(key, fresh);
      refresh();
      enqueueSnackbar(done[action](fresh), { variant: "success" });
    },
    onError: (error) => {
      if (confirm == null) enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" });
    },
  });

  const setMonth = (next: string) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("month", next);
        return p;
      },
      { replace: true },
    );

  if (run.error) return <ScreenError error={run.error} title={t("payroll.loadError")} onRetry={() => void run.refetch()} />;

  const r = run.data && run.data.month === month ? run.data : null;
  const preview = r?.status === "preview";
  const actions = r && canManage ? payrollActions(r.status) : [];
  const tt = r?.totals;

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton size="small" aria-label={t("common.prev")} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeftOutlined />
          </IconButton>
          <Typography sx={{ minWidth: 150, textAlign: "center", fontWeight: 700 }}>{monthLabel(month)}</Typography>
          <IconButton size="small" aria-label={t("common.next")} onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRightOutlined />
          </IconButton>
        </Box>
        {r && !preview && <StatusPill label={r.statusLabel || r.status} tone={runTone(r.status)} />}
        <Box sx={{ ml: "auto", display: "flex", gap: 1, flexWrap: "wrap" }}>
          {actions.includes("calculate") && (
            <Button size="small" variant="contained" onClick={() => act.mutate("calculate")} disabled={act.isPending}>
              {t("payroll.calculate")}
            </Button>
          )}
          {actions.includes("recalculate") && (
            <Button size="small" variant="outlined" onClick={() => act.mutate("recalculate")} disabled={act.isPending}>
              {t("payroll.recalculate")}
            </Button>
          )}
          {actions.includes("approve") && (
            <Button size="small" variant="contained" onClick={() => setConfirm("approve")} disabled={act.isPending}>
              {t("payroll.approve")}
            </Button>
          )}
          {actions.includes("pay") && tt && (
            <Button size="small" variant="contained" onClick={() => setConfirm("pay")} disabled={act.isPending}>
              {t("payroll.pay", { amount: formatKGS(tt.net) })}
            </Button>
          )}
        </Box>
      </Box>

      {preview && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("payroll.preview")}
        </Alert>
      )}

      <KpiCards
        items={
          r && tt
            ? preview
              ? [
                  { key: "employees", label: t("payroll.kpi.employees"), value: String(tt.employeesCount) },
                  { key: "timesheet", label: t("payroll.kpi.timesheet"), value: r.timesheetClosed ? t("payroll.kpi.timesheetClosed") : t("payroll.kpi.timesheetOpen"), tone: r.timesheetClosed ? "success" : "warning" },
                  { key: "gross", label: t("payroll.kpi.forecastGross"), value: compactSum(tt.gross, t) },
                  { key: "net", label: t("payroll.kpi.forecastNet"), value: compactSum(tt.net, t) },
                ]
              : [
                  { key: "gross", label: t("payroll.kpi.gross"), value: compactSum(tt.gross, t), hint: t("payroll.kpi.grossHint", { count: tt.employeesCount }) },
                  { key: "net", label: t("payroll.kpi.net"), value: compactSum(tt.net, t), tone: "success" },
                  { key: "taxes", label: t("payroll.kpi.taxes"), value: compactSum(tt.taxes, t), hint: t("payroll.kpi.taxesHint", { tax: compactSum(tt.tax, t), social: compactSum(tt.social + tt.employer, t) }) },
                  { key: "bonus", label: t("payroll.kpi.bonus"), value: compactSum(tt.bonus, t), hint: t("payroll.kpi.bonusHint", { count: tt.bonusCount }) },
                ]
            : null
        }
      />

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 320px" }, alignItems: "start" }}>
        <Box sx={{ ...cardSx, minWidth: 0, overflow: "hidden" }}>{!r ? <Box sx={{ p: 2 }}><Skeleton variant="rounded" height={360} /></Box> : <PayrollTable run={r} onOpen={setPayslipFor} />}</Box>
        {r && tt && (
          <Box sx={{ display: "grid", gap: 2, minWidth: 0, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(3, minmax(0, 1fr))", xl: "minmax(0, 1fr)" } }}>
            {!preview && (
              <Box sx={{ ...cardSx, minWidth: 0 }}>
                <CardHeader title={t("payroll.status")} />
                <Box sx={{ px: 2.25, pb: 1.5 }}>
                  <InfoRow label={t("payroll.createdAt", { date: "" }).trim()} value={r.createdAt ? dayjs(r.createdAt).format("DD.MM.YYYY") : "—"} />
                  <InfoRow label={t("payroll.approvedAt", { date: "" }).trim()} value={r.approvedAt ? dayjs(r.approvedAt).format("DD.MM.YYYY") : "—"} />
                  <InfoRow label={t("payroll.paidAt", { date: "" }).trim()} value={r.paidAt ? dayjs(r.paidAt).format("DD.MM.YYYY") : "—"} tone={r.paidAt ? "success" : null} />
                  {r.orderNumber && (
                    <InfoRow
                      label={t("payroll.statusOrder", { number: "" }).trim()}
                      value={
                        r.orderDocumentId != null ? (
                          <Link component={RouterLink} to={`/edo?doc=${r.orderDocumentId}`} underline="hover">
                            {r.orderNumber}
                          </Link>
                        ) : (
                          r.orderNumber
                        )
                      }
                    />
                  )}
                </Box>
              </Box>
            )}
            <Box sx={{ ...cardSx, minWidth: 0 }}>
              <CardHeader title={t("payroll.byDepartment")} />
              <AmountBars empty={t("common.empty")} items={r.byDepartment.map((d) => ({ key: d.name, label: d.name, amount: d.amount }))} />
            </Box>
            <Box sx={{ ...cardSx, minWidth: 0 }}>
              <CardHeader title={t("payroll.taxCalendar")} />
              <Box sx={{ px: 2.25, pb: 1.5 }}>
                <InfoRow label={t("payroll.taxPn")} value={formatKGS(tt.tax)} />
                <InfoRow label={t("payroll.taxSf")} value={formatKGS(tt.social + tt.employer)} />
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      <ConfirmDialog
        open={confirm === "approve"}
        title={t("payroll.approveTitle", { month: monthLabel(month) })}
        text={t("payroll.approveText")}
        confirmLabel={t("payroll.approve")}
        busy={act.isPending}
        error={confirm === "approve" ? act.error : null}
        onConfirm={() => act.mutate("approve")}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "pay"}
        title={t("payroll.payTitle", { amount: tt ? formatKGS(tt.net) : "" })}
        text={t("payroll.payText")}
        confirmLabel={t("payroll.pay", { amount: tt ? formatKGS(tt.net) : "" })}
        busy={act.isPending}
        error={confirm === "pay" ? act.error : null}
        onConfirm={() => act.mutate("pay")}
        onClose={() => setConfirm(null)}
      />
      <PayslipDialog row={payslipFor} month={month} onClose={() => setPayslipFor(null)} />
    </>
  );
}

/**
 * Таблица ведомости. ⚠ В «Итого» СФ и ПН — в том же порядке, что в строках:
 * в макете (`hr.js:168`) колонки итога перепутаны, гайд просит не повторять.
 */
function PayrollTable({ run, onOpen }: { run: PayrollRun; onOpen: (row: PayrollRow) => void }) {
  const { t } = useT("personnel");
  const tt = run.totals;
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box
        component="table"
        sx={{
          width: "100%",
          minWidth: 860,
          borderCollapse: "collapse",
          "& td, & th": { px: 1.25, py: 0.9, fontSize: "0.8125rem", borderTop: 1, borderColor: "divider", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
          "& th": { fontWeight: 600, color: "text.secondary", borderTop: 0 },
          "& td:first-of-type, & th:first-of-type": { pl: 2.25, textAlign: "left", whiteSpace: "normal" },
          "& tfoot td": { fontWeight: 700 },
        }}
      >
        <thead>
          <tr>
            <th>{t("payroll.table.employee")}</th>
            <th>{t("payroll.table.days")}</th>
            <th>{t("payroll.table.salary")}</th>
            <th>{t("payroll.table.base")}</th>
            <th>{t("payroll.table.bonus")}</th>
            <th>{t("payroll.table.social")}</th>
            <th>{t("payroll.table.tax")}</th>
            <th>{t("payroll.table.net")}</th>
          </tr>
        </thead>
        <tbody>
          {run.rows.map((row) => (
            <Box component="tr" key={row.employeeId} onClick={() => onOpen(row)} sx={{ cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
              <td>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{row.employeeName}</Typography>
                <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{[row.position, row.deptName].filter(Boolean).join(" · ")}</Typography>
              </td>
              <td>
                {row.worked}/{row.days}
              </td>
              <td>{formatKGS(row.salary)}</td>
              <td>{formatKGS(row.base)}</td>
              <Box component="td" sx={{ color: row.bonus > 0 ? "success.main" : "text.secondary" }}>
                {row.bonus > 0 ? formatKGS(row.bonus) : "—"}
              </Box>
              <td>{formatKGS(row.social)}</td>
              <td>{formatKGS(row.tax)}</td>
              <Box component="td" sx={{ fontWeight: 700 }}>
                {formatKGS(row.net)}
              </Box>
            </Box>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>{t("payroll.table.total")}</td>
            <td />
            <td>{formatKGS(tt.salary)}</td>
            <td>{formatKGS(tt.base)}</td>
            <td>{formatKGS(tt.bonus)}</td>
            <td>{formatKGS(tt.social)}</td>
            <td>{formatKGS(tt.tax)}</td>
            <td>{formatKGS(tt.net)}</td>
          </tr>
        </tfoot>
      </Box>
    </Box>
  );
}

function PayslipDialog({ row, month, onClose }: { row: PayrollRow | null; month: string; onClose: () => void }) {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const slip = useQuery({
    queryKey: payrollKeys.payslip(scope, row?.employeeId ?? 0, month),
    queryFn: ({ signal }) => getPayslip(row?.employeeId as number, month, scope, signal),
    enabled: row != null && scope.orgReady !== false,
    staleTime: 60_000,
  });
  const p = slip.data && slip.data.employeeId === row?.employeeId ? slip.data : null;
  return (
    <Dialog open={row != null} onClose={onClose} fullWidth PaperProps={{ sx: { maxWidth: 480 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {row?.employeeName}
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("payroll.payslip.title", { month: p?.monthLabel || monthLabel(month) })}</Typography>
      </DialogTitle>
      <DialogContent>
        {slip.isLoading && <Skeleton variant="rounded" height={260} />}
        {slip.error && <Alert severity="error">{slip.error instanceof Error ? slip.error.message : t("common.loadError")}</Alert>}
        {p && (
          <>
            {p.source === "preview" && (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                {t("payroll.payslip.preview")}
              </Alert>
            )}
            <InfoRow label={t("payroll.payslip.position")} value={[p.position, p.deptName].filter(Boolean).join(" · ") || "—"} />
            <InfoRow label={t("payroll.payslip.salary")} value={formatKGS(p.salary)} />
            <InfoRow label={t("payroll.payslip.days")} value={t("payroll.payslip.daysValue", { worked: p.worked, days: p.days })} />
            {p.vac > 0 && <InfoRow label={t("payroll.payslip.vac")} value={String(p.vac)} />}
            {p.sick > 0 && <InfoRow label={t("payroll.payslip.sick")} value={String(p.sick)} />}
            <InfoRow label={t("payroll.payslip.base")} value={formatKGS(p.base)} />
            <InfoRow label={t("payroll.payslip.bonus")} value={p.bonus > 0 ? formatKGS(p.bonus) : "—"} />
            <InfoRow label={t("payroll.payslip.gross")} value={formatKGS(p.gross)} />
            <InfoRow label={t("payroll.payslip.tax")} value={`−${formatKGS(p.tax)}`} />
            <InfoRow label={t("payroll.payslip.social")} value={`−${formatKGS(p.social)}`} />
            <InfoRow label={t("payroll.payslip.withheld")} value={formatKGS(p.withheld)} />
            <InfoRow label={t("payroll.payslip.net")} value={formatKGS(p.net)} tone="success" />
            <InfoRow label={t("payroll.payslip.employer")} value={formatKGS(p.employer)} />
            {p.orderNumber && <InfoRow label={t("payroll.payslip.order")} value={p.orderNumber} />}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
