import React from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import type { CashboxEntry, CashboxEntryType } from "../../../api/cashbox";

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  balance: "Баланс",
  insurance: "Страховка",
};

const METHOD_COLORS: Record<string, "default" | "success" | "info"> = {
  cash: "success",
  card: "default",
  balance: "info",
  insurance: "info",
};

function fmtDatetime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(iso: string): string {
  return dayjs(iso).format("DD.MM.YY");
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  entryType: CashboxEntryType;
  entries: CashboxEntry[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
};

const PAGE_SIZE = 20;

// ── Component ─────────────────────────────────────────────────────────────────

const CashboxEntriesTable: React.FC<Props> = ({
  entryType,
  entries,
  total,
  page,
  pageSize,
  isLoading,
  isFetching,
  error,
  onPageChange,
}) => {
  const pageCount = Math.ceil(total / pageSize) || 1;

  return (
    <Stack spacing={1}>
      {/* Loading / error */}
      {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}

      <Box sx={{ position: "relative" }}>
        {isFetching && !isLoading && (
          <Box sx={{ position: "absolute", top: 8, right: 0, zIndex: 1 }}>
            <CircularProgress size={16} />
          </Box>
        )}

        <TableContainer
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            overflowX: "auto",
          }}
        >
          <Table size="small" sx={{ minWidth: entryType === "expense" ? 700 : 720 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: "action.hover" }}>
                <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {entryType === "expense" ? "Дата" : "Время"}
                </TableCell>
                {entryType === "expense" ? (
                  <>
                    <TableCell sx={{ fontWeight: 700 }}>Категория</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Описание</TableCell>
                  </>
                ) : (
                  <TableCell sx={{ fontWeight: 700 }}>Пациент</TableCell>
                )}
                <TableCell sx={{ fontWeight: 700 }}>Филиал</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Метод</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Сумма</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>
                  {entryType === "expense" ? "Создал" : "Кассир"}
                </TableCell>
                {entryType === "refund" && <TableCell sx={{ fontWeight: 700 }}>Причина</TableCell>}
                {entryType === "payment" && <TableCell sx={{ fontWeight: 700 }}>Заметка</TableCell>}
                {(entryType === "payment" || entryType === "refund") && (
                  <TableCell sx={{ fontWeight: 700 }}>Приём #</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.disabled">
                      {entryType === "payment"
                        ? "Платежей нет"
                        : entryType === "refund"
                          ? "Возвратов нет"
                          : "Расходов нет"}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  hover
                  sx={{
                    opacity: entry.method === "balance" || entry.isVoided ? 0.6 : 1,
                    "&:last-child td": { borderBottom: 0 },
                  }}
                >
                  <TableCell sx={{ whiteSpace: "nowrap", color: "text.secondary", fontSize: "0.75rem" }}>
                    {entryType === "expense" && entry.expenseDate
                      ? fmtDate(entry.expenseDate)
                      : fmtDatetime(entry.createdAt)}
                  </TableCell>
                  {entryType === "expense" ? (
                    <>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                          {entry.categoryName ?? "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {entry.description ? (
                          <Tooltip title={entry.description}>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                              {entry.description}
                            </Typography>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>
                        {entry.patientName ?? "—"}
                      </Typography>
                      {entry.patientId && (
                        <Typography variant="caption" color="text.disabled">
                          #{entry.patientId}
                        </Typography>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                      {entry.branchName ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={METHOD_LABELS[entry.method] ?? entry.method}
                      size="small"
                      color={METHOD_COLORS[entry.method] ?? "default"}
                      variant="outlined"
                      sx={{ fontSize: "0.7rem", height: 20 }}
                    />
                    {entry.method === "balance" && (
                      <Typography variant="caption" color="text.disabled" display="block">
                        внутр.
                      </Typography>
                    )}
                    {entry.method === "insurance" && (entry.insurerName || entry.policyNumber) && (
                      <Typography variant="caption" color="text.disabled" display="block" noWrap sx={{ maxWidth: 140 }}>
                        {entry.insurerName ?? ""}
                        {entry.policyNumber ? ` · ${entry.policyNumber}` : ""}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={
                        entryType === "refund" || entryType === "expense"
                          ? "error.main"
                          : "text.primary"
                      }
                      noWrap
                    >
                      {(entryType === "refund" || entryType === "expense") ? "− " : ""}
                      {entry.amount} с
                    </Typography>
                    {entry.isVoided && (
                      <Typography variant="caption" color="text.disabled" display="block">
                        аннул.
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                      {entry.createdByName ?? "—"}
                    </Typography>
                  </TableCell>
                  {entryType === "refund" && (
                    <TableCell>
                      {entry.reason ? (
                        <Tooltip title={entry.reason}>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 140, display: "block" }}>
                            {entry.reason}
                          </Typography>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                  )}
                  {entryType === "payment" && (
                    <TableCell>
                      {entry.note ? (
                        <Tooltip title={entry.note}>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 140, display: "block" }}>
                            {entry.note}
                          </Typography>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                  )}
                  {(entryType === "payment" || entryType === "refund") && (
                    <TableCell>
                      {entry.appointmentId ? (
                        <Typography variant="caption" color="text.secondary">
                          #{entry.appointmentId}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Всего: {total}
          </Typography>
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_, p) => onPageChange(p)}
            size="small"
            siblingCount={1}
          />
        </Stack>
      )}
    </Stack>
  );
};

export { PAGE_SIZE };
export default CashboxEntriesTable;
