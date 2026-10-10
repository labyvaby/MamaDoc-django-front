import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getOdoctorBranches,
  getOdoctorReconciliation,
  odoctorLinkedBranches,
  odoctorSettingsErrorMessage,
  startOdoctorReconciliation,
} from "../../api/odoctor";
import { djangoQueryKeys } from "../../api/queryKeys";
import { usePermissions } from "../../hooks/usePermissions";
import { useT } from "../../i18n/VerticalProvider";

function previousMonth(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bishkek",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return `${month === 1 ? year - 1 : year}-${String(
    month === 1 ? 12 : month - 1
  ).padStart(2, "0")}`;
}

const displayDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("ru-RU", {
        timeZone: "Asia/Bishkek",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Monthly manual operation, independent of slot synchronization. */
export function OdoctorReconciliationSection({
  organizationId,
  disabled,
}: {
  organizationId?: number;
  disabled?: boolean;
}) {
  const { t } = useT("settings");
  const { activeBranch } = usePermissions();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = React.useState<number | null>(null);
  const [period, setPeriod] = React.useState(previousMonth);
  const [year, month] = period.split("-").map(Number);
  const valid =
    /^\d{4}-\d{2}$/.test(period) && period <= previousMonth() && year >= 2000;
  const branchesQuery = useQuery({
    queryKey: djangoQueryKeys.odoctor.branches(organizationId ?? null),
    queryFn: ({ signal }) => getOdoctorBranches(signal, { organizationId }),
  });
  const branches = odoctorLinkedBranches(branchesQuery.data).filter(
    (b) => !activeBranch || b.branchId === activeBranch.id
  );
  const selected = branches.find((b) => b.branchId === branchId) ?? branches[0];
  const key = djangoQueryKeys.odoctor.reconciliation(
    organizationId ?? null,
    selected?.branchId ?? 0,
    year,
    month
  );
  const resultQuery = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      getOdoctorReconciliation(
        selected!.branchId,
        year,
        month,
        organizationId,
        signal
      ),
    enabled: !!selected && valid,
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.run?.status ?? "")
        ? 2000
        : false,
  });
  const start = useMutation({
    mutationFn: startOdoctorReconciliation,
    onSuccess: (result, input) =>
      queryClient.setQueryData(
        djangoQueryKeys.odoctor.reconciliation(
          input.organizationId ?? null,
          input.branchId,
          input.year,
          input.month
        ),
        result
      ),
  });
  React.useEffect(() => {
    start.reset();
  }, [organizationId, activeBranch?.id, branchId, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = resultQuery.data?.run;
  const report = run?.report;
  const running = run?.status === "queued" || run?.status === "running";
  const busy = disabled || start.isPending || running;
  const cabinetUrl = selected?.odoctorBranchId
    ? `https://cabinet.odoctor.kg/clinic_branch/${selected.odoctorBranchId}/payments/${month}/${year}`
    : undefined;
  const launch = (previewOnly: boolean) =>
    selected &&
    start.mutate({
      branchId: selected.branchId,
      organizationId,
      year,
      month,
      previewOnly,
    });

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6">
          {t("odoctor.reconciliation.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("odoctor.reconciliation.description")}
        </Typography>
      </Box>
      {branchesQuery.error && (
        <Alert severity="error">
          {odoctorSettingsErrorMessage(branchesQuery.error)}
        </Alert>
      )}
      {!branchesQuery.isLoading && !branchesQuery.error && !selected && (
        <Alert severity="info">{t("odoctor.reconciliation.needsBranch")}</Alert>
      )}
      <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center">
        {selected && (
          <TextField
            select
            size="small"
            label={t("odoctor.reconciliation.branch")}
            value={selected.branchId}
            onChange={(e) => setBranchId(Number(e.target.value))}
            disabled={!!busy}
            sx={{ minWidth: 220 }}
          >
            {branches.map((b) => (
              <MenuItem key={b.branchId} value={b.branchId}>
                {b.branchName}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          type="month"
          size="small"
          label={t("odoctor.reconciliation.month")}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          disabled={!!busy}
          error={!valid}
          inputProps={{ min: "2000-01", max: previousMonth() }}
          InputLabelProps={{ shrink: true }}
        />
        <Button
          variant="contained"
          disabled={!!busy || !selected || !valid || resultQuery.isLoading}
          onClick={() => launch(false)}
        >
          {t("odoctor.reconciliation.start")}
        </Button>
        <Button
          disabled={!!busy || !selected || !valid || resultQuery.isLoading}
          onClick={() => launch(true)}
        >
          {t("odoctor.reconciliation.preview")}
        </Button>
        {cabinetUrl && (
          <Button href={cabinetUrl} target="_blank" rel="noopener noreferrer">
            {t("odoctor.reconciliation.open")}
          </Button>
        )}
      </Stack>
      {(resultQuery.error || start.error) && (
        <Alert severity="error">
          {odoctorSettingsErrorMessage(resultQuery.error ?? start.error)}
        </Alert>
      )}
      {running && (
        <>
          <LinearProgress />
          <Typography variant="body2">
            {t("odoctor.reconciliation.running")}
          </Typography>
        </>
      )}
      {run?.error && <Alert severity="error">{run.error}</Alert>}
      {run && (
        <Typography variant="caption" color="text.secondary">
          {t("odoctor.reconciliation.lastRun")}: {displayDate(run.createdAt)}
          {run.previewOnly ? ` · ${t("odoctor.reconciliation.preview")}` : ""}
        </Typography>
      )}
      {report?.message && (
        <Alert severity={report.failed ? "warning" : "info"}>
          {report.message}
        </Alert>
      )}
      {report?.rows && (
        <>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip
              color="success"
              label={`${t("odoctor.reconciliation.yes")}: ${report.visited}`}
            />
            <Chip
              label={`${t("odoctor.reconciliation.no")}: ${report.notVisited}`}
            />
            <Chip
              color="warning"
              label={`${t("odoctor.reconciliation.review")}: ${report.review}`}
            />
            <Chip
              label={`${t("odoctor.reconciliation.commission")}: ${
                report.commission
              } сом`}
            />
          </Stack>
          {!!report.review && (
            <Typography variant="body2" color="text.secondary">
              {t("odoctor.reconciliation.commissionHint")}
            </Typography>
          )}
          <Typography variant="body2">
            {t("odoctor.reconciliation.saved")}: {report.saved};{" "}
            {t("odoctor.reconciliation.unchanged")}: {report.unchanged};{" "}
            {t("odoctor.reconciliation.failed")}: {report.failed}
          </Typography>
          {report.payment && (
            <Typography variant="body2">
              Odoctor: {report.payment.status_display}
            </Typography>
          )}
          <Box sx={{ overflowX: "auto", maxHeight: 560 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {["patient", "doctor", "scheduled", "actual", "result"].map(
                    (label) => (
                      <TableCell key={label}>
                        {t(`odoctor.reconciliation.${label}`)}
                      </TableCell>
                    )
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.patient}</TableCell>
                    <TableCell>{row.doctor}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {displayDate(row.scheduledAt)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {displayDate(row.actualAt)}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color={
                          row.decision === "review" ? "warning.main" : undefined
                        }
                      >
                        {t(`odoctor.reconciliation.${row.decision}`)}
                      </Typography>
                      <Typography variant="caption">{row.reason}</Typography>
                      {row.saveError && (
                        <Typography
                          variant="caption"
                          display="block"
                          color="error"
                        >
                          {row.saveError}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </>
      )}
    </Stack>
  );
}
