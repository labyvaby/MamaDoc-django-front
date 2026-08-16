import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Drawer,
  IconButton,
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
  alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import FileDownloadIcon from "@mui/icons-material/FileDownloadOutlined";

import type { PayrollRow } from "../../../api/payroll";
import { useCan } from "../../../hooks/useCan";
import { useT } from "../../../i18n/VerticalProvider";
import { formatKGS } from "../../../utility/format";
import {
  buildPayrollStatementXlsx,
  downloadBlob,
  type PayrollStatementRow,
} from "../statement/buildPayrollStatementXlsx";
import { loadStatementRows, type StatementSourceRow } from "../statement/loadStatementRows";

/** Значения колонки «Статус операции» из бумажного образца. */
type EmploymentType = "full" | "partTime";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Строки месячного отчёта — источник ФИО и суммы к выплате. */
  rows: PayrollRow[];
  year: number;
  month: number;
  /** Подпись «Исполнитель:» — по умолчанию текущий пользователь. */
  defaultExecutorName: string;
  monthLabel: string;
  fileName: string;
  organizationId?: number;
  branchId?: number;
}

export const PayrollStatementDrawer: React.FC<Props> = ({
  open,
  onClose,
  rows,
  year,
  month,
  defaultExecutorName,
  monthLabel,
  fileName,
  organizationId,
  branchId,
}) => {
  const { t } = useT("salaryReports");
  // `t` меняет ссылку на каждом рендере: попав в deps эффекта, он перезапускал
  // загрузку реквизитов по кругу. Держим его в ref и не пишем в зависимости.
  const tRef = React.useRef(t);
  tRef.current = t;

  // Без `staff.private.view` бэк отдаёт номера счетов пустой строкой. Тогда
  // пустая колонка — это не «не заполнили в карточке», а «не показываем», и
  // сказать об этом надо прямо, иначе бухгалтер идёт искать несуществующую
  // проблему в карточках сотрудников.
  const canViewPrivate = useCan("staff.private.view");
  const canViewPrivateRef = React.useRef(canViewPrivate);
  canViewPrivateRef.current = canViewPrivate;

  // В банк уходят только положительные выплаты — нулевые строки отчёта в
  // ведомости бессмысленны и удваивали бы количество запросов за реквизитами.
  const payableRows = useMemo(
    () => rows.filter((row) => (Number.parseFloat(row.netSalary || "0") || 0) > 0),
    [rows],
  );
  const payableRowsRef = React.useRef(payableRows);
  payableRowsRef.current = payableRows;
  // Ведомость — снимок на момент открытия: фоновый рефетч отчёта не должен
  // перезапускать полсотни запросов за реквизитами. Перезагружаемся только
  // если реально изменился состав сотрудников.
  const payableKey = payableRows.map((row) => row.employeeId).join(",");

  const [sourceRows, setSourceRows] = useState<StatementSourceRow[] | null>(null);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [employment, setEmployment] = useState<Record<number, EmploymentType>>({});
  const [executor, setExecutor] = useState(defaultExecutorName);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setExecutor(defaultExecutorName);
  }, [open, defaultExecutorName]);

  useEffect(() => {
    if (!open) {
      setSourceRows(null);
      setError(null);
      setProgress({ loaded: 0, total: 0 });
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    loadStatementRows({
      rows: payableRowsRef.current,
      year,
      month,
      organizationId,
      branchId,
      withAccounts: canViewPrivateRef.current,
      signal: controller.signal,
      onProgress: (loaded, total) => setProgress({ loaded, total }),
    })
      .then((loadedRows) => {
        if (controller.signal.aborted) return;
        setSourceRows(loadedRows);
        setSelected(new Set(loadedRows.map((row) => row.employeeId)));
        setEmployment(
          Object.fromEntries(loadedRows.map((row) => [row.employeeId, "full" as EmploymentType])),
        );
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : tRef.current("statement.loadError"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, payableKey, year, month, organizationId, branchId]);

  const toggleRow = useCallback((employeeId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === (sourceRows?.length ?? 0)
        ? new Set()
        : new Set((sourceRows ?? []).map((row) => row.employeeId)),
    );
  }, [sourceRows]);

  const selectedRows = useMemo(
    () => (sourceRows ?? []).filter((row) => selected.has(row.employeeId)),
    [sourceRows, selected],
  );
  const selectedTotal = selectedRows.reduce((sum, row) => sum + row.amount, 0);
  const missingAccounts = selectedRows.filter((row) => !row.accountNumber.trim()).length;
  const failedRows = (sourceRows ?? []).filter((row) => row.hasError).length;

  const handleDownload = async () => {
    setBuilding(true);
    setError(null);
    try {
      const statementRows: PayrollStatementRow[] = selectedRows.map((row) => ({
        fullName: row.fullName,
        accountNumber: row.accountNumber,
        amount: row.amount,
        workDays: row.workDays,
        employmentType:
          employment[row.employeeId] === "partTime"
            ? t("statement.employmentPartTime")
            : t("statement.employmentFull"),
      }));

      const blob = await buildPayrollStatementXlsx({
        rows: statementRows,
        executorName: executor,
        sheetName: monthLabel,
      });
      downloadBlob(blob, fileName);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("statement.buildError"));
    } finally {
      setBuilding(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={building ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", md: 780 },
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default",
        },
      }}
    >
      <Box
        sx={{
          px: 3,
          pt: 3,
          pb: 2.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
          bgcolor: "background.paper",
        }}
      >
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: "14px",
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "primary.onSurface",
              }}
            >
              <DescriptionIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                {t("statement.title")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("statement.subtitle", { month: monthLabel })}
              </Typography>
            </Box>
          </Stack>

          <IconButton
            size="small"
            onClick={onClose}
            disabled={building}
            sx={{ mt: -0.5, color: "text.secondary" }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2.5 }}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label={t("statement.executorLabel")}
            value={executor}
            onChange={(event) => setExecutor(event.target.value)}
            helperText={t("statement.executorHelper")}
            size="small"
            fullWidth
            disabled={building}
          />

          {loading && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t("statement.loading", { loaded: progress.loaded, total: progress.total })}
              </Typography>
              <LinearProgress
                variant={progress.total ? "determinate" : "indeterminate"}
                value={progress.total ? (progress.loaded / progress.total) * 100 : undefined}
                sx={{ mt: 0.75, borderRadius: 1 }}
              />
            </Box>
          )}

          {!loading && sourceRows?.length === 0 && (
            <Alert severity="info">{t("statement.emptyMonth")}</Alert>
          )}

          {!loading && !canViewPrivate && !!sourceRows?.length && (
            <Alert severity="warning">{t("statement.noPrivateAccess")}</Alert>
          )}

          {!loading && canViewPrivate && missingAccounts > 0 && (
            <Alert severity="warning">
              {t("statement.missingAccounts", { count: missingAccounts })}
            </Alert>
          )}

          {!loading && failedRows > 0 && (
            <Alert severity="warning">{t("statement.partialLoad", { count: failedRows })}</Alert>
          )}

          {!!sourceRows?.length && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selected.size === sourceRows.length}
                      indeterminate={selected.size > 0 && selected.size < sourceRows.length}
                      onChange={toggleAll}
                      disabled={building}
                    />
                  </TableCell>
                  <TableCell>{t("columns.employee")}</TableCell>
                  <TableCell>{t("statement.columnAccount")}</TableCell>
                  <TableCell align="right">{t("statement.columnAmount")}</TableCell>
                  <TableCell align="center">{t("statement.columnWorkDays")}</TableCell>
                  <TableCell>{t("statement.columnEmployment")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sourceRows.map((row) => (
                  <TableRow key={row.employeeId} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selected.has(row.employeeId)}
                        onChange={() => toggleRow(row.employeeId)}
                        disabled={building}
                      />
                    </TableCell>
                    <TableCell>{row.fullName}</TableCell>
                    <TableCell>
                      {row.accountNumber ? (
                        <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {row.accountNumber}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="error.onSurface">
                          {canViewPrivate ? t("statement.noAccount") : t("statement.accountHidden")}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">{formatKGS(row.amount)}</TableCell>
                    <TableCell align="center">{row.workDays ?? "—"}</TableCell>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        variant="standard"
                        value={employment[row.employeeId] ?? "full"}
                        onChange={(event) =>
                          setEmployment((prev) => ({
                            ...prev,
                            [row.employeeId]: event.target.value as EmploymentType,
                          }))
                        }
                        disabled={building}
                        sx={{ minWidth: 160 }}
                      >
                        <MenuItem value="full">{t("statement.employmentFull")}</MenuItem>
                        <MenuItem value="partTime">{t("statement.employmentPartTime")}</MenuItem>
                      </TextField>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Box>

      <Box
        sx={{
          px: 2.5,
          py: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          flexShrink: 0,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Chip
            size="small"
            variant="outlined"
            label={t("statement.selectedSummary", {
              count: selectedRows.length,
              sum: formatKGS(selectedTotal),
            })}
          />
          <Stack direction="row" spacing={1}>
            <Button color="inherit" onClick={onClose} disabled={building}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="contained"
              startIcon={<FileDownloadIcon />}
              onClick={handleDownload}
              disabled={building || loading || selectedRows.length === 0}
            >
              {t("statement.download")}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Drawer>
  );
};

export default PayrollStatementDrawer;
