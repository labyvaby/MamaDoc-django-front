import React from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { PageHeader, MonthNavigation } from "../../../components/ui";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { useCan } from "../../../hooks/useCan";
import { usePermissions } from "../../../hooks/usePermissions";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { getPayrollReport, type PayrollRow } from "../../../api/payroll";
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

const COLUMNS: { key: keyof PayrollRow; label: string; money?: boolean }[] = [
  { key: "fullName", label: "Сотрудник" },
  { key: "appointmentsCount", label: "Приёмы" },
  { key: "servicePercentPay", label: "Услуги %", money: true },
  { key: "serviceFixedPay", label: "Фикс", money: true },
  { key: "appointmentPay", label: "За приёмы", money: true },
  { key: "earnings", label: "Начислено", money: true },
  { key: "advances", label: "Авансы", money: true },
  { key: "netSalary", label: "К выплате", money: true },
];

const RoleTable: React.FC<{ title: string; rows: PayrollRow[] }> = ({ title, rows }) => {
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
                  {c.money
                    ? formatKGS(row[c.key] as string)
                    : String(row[c.key])}
                </TableCell>
              ))}
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
              <RoleTable key={role} title={ROLE_LABELS[role]} rows={groups[role]} />
            ) : null,
          )}
        </Box>
      )}
    </Box>
  );
};

export default DjangoSalaryReportsPage;
