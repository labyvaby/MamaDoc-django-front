import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import BonusDialog from "./BonusDialog";

import { PageHeader, MonthNavigation } from "../../../components/ui";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { useCan } from "../../../hooks/useCan";
import { usePermissions } from "../../../hooks/usePermissions";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import {
  getPayrollReport,
  lockPeriod,
  recalculatePeriod,
  type PayrollRow,
} from "../../../api/payroll";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";
import { formatKGS } from "../../../utility/format";

// Clinical roles (staff.ClinicalRole): doctor / nurse / other.
const ROLE_ORDER = ["doctor", "nurse", "other"] as const;
const ROLE_LABELS: Record<string, string> = {
  doctor: "Врачи",
  nurse: "Медсёстры",
  other: "Прочие",
};

function groupByRole(rows: PayrollRow[]): Record<string, PayrollRow[]> {
  const groups: Record<string, PayrollRow[]> = {};
  for (const row of rows) {
    const key = ROLE_LABELS[row.clinicalRole] ? row.clinicalRole : "other";
    (groups[key] ??= []).push(row);
  }
  return groups;
}

const COLUMNS: {
  key: keyof PayrollRow;
  label: string;
  money?: boolean;
  render?: (row: PayrollRow) => React.ReactNode;
}[] = [
  { key: "fullName", label: "Сотрудник" },
  { key: "appointmentsCount", label: "Приёмы" },
  { key: "servicePercentPay", label: "Услуги %", money: true },
  { key: "serviceFixedPay", label: "Фикс", money: true },
  { key: "appointmentPay", label: "За приёмы", money: true },
  {
    key: "dayHours",
    label: "Часы (д/н)",
    render: (r) => `${r.dayHours} / ${r.nightHours}`,
  },
  { key: "hourlyPay", label: "Почасовая", money: true },
  {
    key: "bonus",
    label: "Надбавка",
    render: (r) => {
      const v = Number(r.bonus ?? 0);
      return v > 0 ? formatKGS(r.bonus as string) : "—";
    },
  },
  { key: "earnings", label: "Начислено", money: true },
  { key: "advances", label: "Авансы", money: true },
  { key: "netSalary", label: "К выплате", money: true },
];

const RoleTable: React.FC<{
  title: string;
  rows: PayrollRow[];
  onManageBonus: (row: PayrollRow) => void;
}> = ({ title, rows, onManageBonus }) => {
  const groupNet = rows.reduce((sum, r) => sum + parseFloat(r.netSalary || "0"), 0);
  return (
    <Paper variant="outlined" sx={{ mb: 2, overflow: "hidden" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1, bgcolor: "action.hover" }}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          {title}
        </Typography>
        <Chip label={`${rows.length} · ${formatKGS(groupNet)}`} size="small" />
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableCell key={c.key} align={c.key === "fullName" ? "left" : "right"}>
                {c.label}
              </TableCell>
            ))}
            <TableCell align="right" padding="checkbox" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.employeeId} hover>
              {COLUMNS.map((c) => (
                <TableCell
                  key={c.key}
                  align={c.key === "fullName" ? "left" : "right"}
                  sx={c.key === "netSalary" ? { fontWeight: 700 } : undefined}
                >
                  {c.render
                    ? c.render(row)
                    : c.money
                      ? formatKGS(row[c.key] as string)
                      : String(row[c.key])}
                </TableCell>
              ))}
              <TableCell align="right" padding="checkbox">
                <Tooltip title="Надбавки">
                  <IconButton size="small" onClick={() => onManageBonus(row)}>
                    <PaidOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
};

const DjangoSalaryReportsPage: React.FC = () => {
  usePageTitle("Отчёт по зарплате");
  const theme = useTheme();
  const canView = useCan("payroll.view");
  const {
    isSuperAdmin,
    activeOrganization,
    memberships,
    loading: permLoading,
  } = usePermissions();
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const needsOrg = (isSuper || isMultiOrg) && !activeOrganization;

  const [date, setDate] = React.useState(() => dayjs().format("YYYY-MM-DD"));
  const parsed = dayjs(date);
  const year = parsed.year();
  const month = parsed.month() + 1;

  const query = useQuery({
    queryKey: djangoQueryKeys.payroll.report({
      year,
      month,
      orgId: isSuper ? activeOrganization?.id ?? null : null,
    }),
    queryFn: ({ signal }) =>
      getPayrollReport(
        {
          year,
          month,
          organizationId: isSuper ? activeOrganization?.id ?? undefined : undefined,
        },
        signal,
      ),
    enabled: !permLoading && canView && !needsOrg,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const canManage = useCan("payroll.manage");
  const { open: notify } = useNotification();
  const [busy, setBusy] = React.useState(false);
  const [recalcOpen, setRecalcOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [bonusRow, setBonusRow] = React.useState<PayrollRow | null>(null);

  const handleLock = async () => {
    setBusy(true);
    try {
      await lockPeriod(year, month);
      await query.refetch();
      notify?.({ type: "success", message: "Месяц заморожен" });
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  const handleRecalc = async () => {
    setBusy(true);
    try {
      await recalculatePeriod(year, month, reason);
      await query.refetch();
      setRecalcOpen(false);
      setReason("");
      notify?.({ type: "success", message: "Пересчитано" });
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  if (!permLoading && !canView) return <AccessDenied />;

  const report = query.data;
  const groups = groupByRole(report?.rows ?? []);
  const hasRows = (report?.rows.length ?? 0) > 0;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Отчёт по зарплате"
        showTitle={false}
        showSearch={false}
        dateNavigation={<MonthNavigation date={date} setDate={setDate} />}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {report && (
              <Chip
                size="small"
                label={report.status === "locked" ? "Заморожен" : "Черновик"}
                color={report.status === "locked" ? "success" : "default"}
                variant={report.status === "locked" ? "filled" : "outlined"}
              />
            )}
            {canManage && report?.status === "draft" && (
              <Button size="small" variant="outlined" disabled={busy} onClick={handleLock}>
                Заморозить
              </Button>
            )}
            {canManage && report?.status === "locked" && (
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                onClick={() => setRecalcOpen(true)}
              >
                Пересчитать
              </Button>
            )}
          </Stack>
        }
      />

      {needsOrg ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="info">Выберите организацию, чтобы увидеть отчёт.</Alert>
        </Box>
      ) : (
        <Box sx={{ flex: 1, overflow: "auto", px: theme.appLayout.page.paddingX, pb: 2 }}>
          {/* Summary */}
          <Paper
            elevation={0}
            sx={{
              my: 2,
              p: 2,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle1" fontWeight={700}>
                Итого к выплате
              </Typography>
              {query.isFetching && <CircularProgress size={14} />}
            </Stack>
            <Typography variant="h5" fontWeight={800} color="success.main">
              {formatKGS(report?.totalNet ?? 0)}
            </Typography>
          </Paper>

          {query.isLoading && (
            <Stack alignItems="center" sx={{ py: 6 }}>
              <CircularProgress />
            </Stack>
          )}

          {query.error && (
            <Alert severity="error">
              {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
            </Alert>
          )}

          {!query.isLoading && !hasRows && !query.error && (
            <Typography variant="body2" color="text.disabled" sx={{ py: 4, textAlign: "center" }}>
              За выбранный месяц начислений нет.
            </Typography>
          )}

          {ROLE_ORDER.map((role) =>
            groups[role]?.length ? (
              <RoleTable
                key={role}
                title={ROLE_LABELS[role]}
                rows={groups[role]}
                onManageBonus={setBonusRow}
              />
            ) : null,
          )}
        </Box>
      )}

      <Dialog open={recalcOpen} onClose={() => (busy ? undefined : setRecalcOpen(false))}>
        <DialogTitle>Пересчитать месяц</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Снимки будут пересчитаны заново. Укажите причину (для истории).
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label="Причина"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecalcOpen(false)} disabled={busy} color="inherit">
            Отмена
          </Button>
          <Button
            onClick={handleRecalc}
            disabled={busy || !reason.trim()}
            variant="contained"
          >
            Пересчитать
          </Button>
        </DialogActions>
      </Dialog>

      {bonusRow && (
        <BonusDialog
          open
          onClose={() => setBonusRow(null)}
          employeeId={bonusRow.employeeId}
          employeeName={bonusRow.fullName}
          year={year}
          month={month}
          organizationId={report?.organizationId}
          readOnly={!canManage || report?.status === "locked"}
        />
      )}
    </Box>
  );
};

export default DjangoSalaryReportsPage;
