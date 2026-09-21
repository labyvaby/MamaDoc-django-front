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
  DialogTitle,
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
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getCashboxShiftSummary, type CashboxShift } from "../../../../api/cashboxShifts";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../../api/queryKeys";
import { useApiOrgId } from "../../../../hooks/useApiOrgId";
import { usePermissions } from "../../../../hooks/usePermissions";
import { buildXReport, formatAmount, formatCell, isEmptyRow, type XReportRow } from "./xReport";
import {
  printXReport,
  readXReportPageSize,
  saveXReportPageSize,
  X_REPORT_PAGE_SIZES,
  type XReportPageSize,
} from "./xReportPrint";

type Props = {
  open: boolean;
  shift: CashboxShift | null;
  onClose: () => void;
};

const HEAD = ["Операция", "Наличные", "Безнал", "Баланс", "Всего", "Опер."];

/** Строка операции и её разрез по способам безнала. */
const OperationRow: React.FC<{ row: XReportRow; total?: boolean }> = ({ row, total }) => (
  <>
    <TableRow>
      <TableCell sx={{ fontWeight: total ? 700 : 500, borderTop: total ? "1px solid" : undefined, borderColor: "divider" }}>
        {row.label}
      </TableCell>
      {[row.cash, row.cashless, row.balance, row.total].map((value, index) => (
        <TableCell
          key={index}
          align="right"
          sx={{
            fontWeight: total || index === 3 ? 700 : 400,
            color: value < 0 ? "error.main" : value === 0 ? "text.disabled" : "text.primary",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            borderTop: total ? "1px solid" : undefined,
            borderColor: "divider",
          }}
        >
          {formatCell(value)}
        </TableCell>
      ))}
      <TableCell
        align="right"
        sx={{ color: "text.secondary", borderTop: total ? "1px solid" : undefined, borderColor: "divider" }}
      >
        {row.count ?? ""}
      </TableCell>
    </TableRow>
    {row.methods.map((method) => (
      <TableRow key={`${row.key}_${method.key}`}>
        <TableCell sx={{ pl: 4, py: 0.25, border: 0, color: method.muted ? "text.disabled" : "text.secondary" }}>
          <Typography variant="caption">{method.name}</Typography>
        </TableCell>
        <TableCell sx={{ border: 0 }} />
        <TableCell
          align="right"
          sx={{ py: 0.25, border: 0, color: "text.secondary", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
        >
          <Typography variant="caption">{formatAmount(method.amount)}</Typography>
        </TableCell>
        <TableCell sx={{ border: 0 }} colSpan={3} />
      </TableRow>
    ))}
  </>
);

/**
 * X-отчёт по смене: та же сводка, что у итогов, но матрицей «операция × способ».
 * Смену не трогает — снимается и по открытой, и по закрытой.
 */
const ShiftXReportDialog: React.FC<Props> = ({ open, shift, onClose }) => {
  const orgId = useApiOrgId();
  const { activeOrganization } = usePermissions();
  const [pageSize, setPageSize] = React.useState<XReportPageSize>(readXReportPageSize);

  React.useEffect(() => {
    if (open) setPageSize(readXReportPageSize());
  }, [open]);

  const summaryQuery = useQuery({
    queryKey: shift ? djangoQueryKeys.shifts.summary(shift.id) : ["noop"],
    queryFn: ({ signal }) => getCashboxShiftSummary(shift!.id, orgId, signal),
    enabled: open && shift !== null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const summary = summaryQuery.data;
  const report = React.useMemo(() => (summary ? buildXReport(summary) : null), [summary]);
  const rows = report?.rows.filter((row) => !isEmptyRow(row)) ?? [];
  const isOpenShift = shift?.status === "open";

  const handlePrint = () => {
    if (!summary) return;
    saveXReportPageSize(pageSize);
    printXReport({ summary, organizationName: activeOrganization?.name, pageSize });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { width: { sm: 720 }, maxWidth: "100%" } }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <span>X-отчёт · смена #{shift?.id}</span>
          {isOpenShift && <Chip size="small" label="смена не закрыта" variant="outlined" />}
          {summaryQuery.isFetching && <CircularProgress size={14} />}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Промежуточный срез: деньги в кассе не пересчитывает и смену не закрывает
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {summaryQuery.isLoading ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : summaryQuery.isError ? (
          <Alert severity="error">Не удалось загрузить данные смены</Alert>
        ) : report && summary ? (
          <Stack spacing={1.5}>
            {/* Шапка: по ней отчёт узнают в журнале смены */}
            <Stack direction="row" flexWrap="wrap" useFlexGap sx={{ columnGap: 3, rowGap: 0.5 }}>
              {[
                ["Филиал", shift?.branchName ?? "—"],
                ["Открыл", shift?.openedByName ?? "—"],
                ["Открыта", shift ? dayjs(shift.openedAt).format("DD.MM.YY HH:mm") : "—"],
                ...(shift?.closedAt
                  ? [["Закрыта", dayjs(shift.closedAt).format("DD.MM.YY HH:mm")] as [string, string]]
                  : []),
                ["Отчёт снят", dayjs().format("DD.MM.YY HH:mm")],
              ].map(([label, value]) => (
                <Box key={label}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {label}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  {HEAD.map((title, index) => (
                    <TableCell
                      key={title}
                      align={index === 0 ? "left" : "right"}
                      sx={{ color: "text.secondary", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: 0.3 }}
                    >
                      {title}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={HEAD.length} align="center" sx={{ color: "text.disabled", py: 3 }}>
                      За смену не было ни одной операции
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => <OperationRow key={row.key} row={row} />)
                )}
                <OperationRow row={report.movement} total />
              </TableBody>
            </Table>

            {/* Итог по ящику — то, ради чего отчёт и снимают */}
            <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Остаток на начало
                </Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatAmount(report.opening)} с
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Движение наличных
                </Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatAmount(report.movement.cash)} с
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Должно быть в кассе
                </Typography>
                <Typography variant="subtitle2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatAmount(report.expectedCash)} с
                </Typography>
              </Stack>
              {report.mismatch !== 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  По строкам отчёта выходит {formatAmount(report.computedCash)} с — разница{" "}
                  {formatAmount(report.mismatch)} с. Обычно это внесения и изъятия наличных: своих
                  полей в сводке смены у них нет.
                </Alert>
              )}
            </Box>
          </Stack>
        ) : null}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
        <TextField
          select
          size="small"
          label="Формат"
          value={pageSize}
          onChange={(event) => setPageSize(event.target.value as XReportPageSize)}
          sx={{ minWidth: 170, mr: "auto" }}
        >
          {X_REPORT_PAGE_SIZES.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              <Stack>
                <Typography variant="body2">{option.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {option.hint}
                </Typography>
              </Stack>
            </MenuItem>
          ))}
        </TextField>
        <Button size="small" onClick={onClose}>
          Закрыть
        </Button>
        <Button
          size="small"
          variant="contained"
          startIcon={<PrintOutlined />}
          disabled={!summary}
          onClick={handlePrint}
        >
          Печать
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShiftXReportDialog;
