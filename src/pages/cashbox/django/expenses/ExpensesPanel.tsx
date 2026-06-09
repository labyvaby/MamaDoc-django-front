import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
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
import AddIcon from "@mui/icons-material/Add";
import BlockIcon from "@mui/icons-material/Block";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { getExpenses, parseBackendError, type Expense } from "../../../../api/expenses";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../../api/queryKeys";
import { ApiError } from "../../../../api/client";
import { DjangoAddExpenseDrawer } from "../../../../components/expenses/DjangoAddExpenseDrawer";
import ExpenseVoidDialog from "./ExpenseVoidDialog";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const METHOD_LABELS: Record<string, string> = {
  cash: "Нал.",
  card: "Карта",
  mixed: "Смеш.",
};

// ── Types ──────────────────────────────────────────────────────────────────────

type Branch = { id: number; name: string };

type Props = {
  organizationId?: number;
  branchId?: number;
  dateFrom?: string;
  dateTo?: string;
  branches: Branch[];
  canManage: boolean;
  queriesEnabled: boolean;
  expenseNeedsOrg?: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

const ExpensesPanel: React.FC<Props> = ({
  organizationId,
  branchId,
  dateFrom,
  dateTo,
  canManage,
  queriesEnabled,
  expenseNeedsOrg = false,
}) => {
  const [page, setPage] = React.useState(1);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [voidTarget, setVoidTarget] = React.useState<Expense | null>(null);
  const queryClient = useQueryClient();

  // Reset to page 1 when filters change
  const filtersKey = `${organizationId}-${branchId}-${dateFrom}-${dateTo}`;
  const prevFiltersKeyRef = React.useRef(filtersKey);
  if (prevFiltersKeyRef.current !== filtersKey) {
    prevFiltersKeyRef.current = filtersKey;
    if (page !== 1) setPage(1);
  }

  const filters = {
    organizationId,
    branchId,
    dateFrom,
    dateTo,
    page,
    pageSize: PAGE_SIZE,
  };

  const expensesQuery = useQuery({
    queryKey: djangoQueryKeys.expenses.list(filters as Record<string, unknown>),
    queryFn: ({ signal }) => getExpenses(filters, signal),
    enabled: queriesEnabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: queriesEnabled ? 60_000 : false,
    retry: (count, err) => {
      const status = (err as ApiError)?.status;
      if (status === 400 || status === 403) return false;
      return count < 1;
    },
  });

  const expenses = expensesQuery.data?.results ?? [];
  const total = expensesQuery.data?.count ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE) || 1;
  const error = expensesQuery.error ? parseBackendError(expensesQuery.error) : null;

  return (
    <Stack spacing={1.5}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2" fontWeight={700}>
            Расходы
          </Typography>
          {expensesQuery.isFetching && !expensesQuery.isLoading && (
            <CircularProgress size={12} />
          )}
          {expensesQuery.data && (
            <Chip
              label={`${total} записей`}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: "0.7rem" }}
            />
          )}
        </Stack>
        {canManage && (
          <Tooltip title={expenseNeedsOrg ? "Выберите организацию в контексте" : ""}>
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setCreateOpen(true)}
                disabled={expenseNeedsOrg}
              >
                Добавить расход
              </Button>
            </span>
          </Tooltip>
        )}
      </Stack>

      {/* Block create when org is required but not selected */}
      {canManage && expenseNeedsOrg && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          Выберите организацию в контексте для создания расходов.
        </Alert>
      )}

      {/* Error */}
      {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}

      {/* Table */}
      <Box sx={{ position: "relative" }}>
        <TableContainer
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            overflowX: "auto",
          }}
        >
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: "action.hover" }}>
                <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>Дата</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Название</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Категория</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Получатель</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Метод</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Нал.</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Карта</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Итого</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Создал</TableCell>
                {canManage && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {expensesQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={canManage ? 10 : 9} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              )}
              {!expensesQuery.isLoading && expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 10 : 9} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.disabled">
                      Расходов нет
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {!expensesQuery.isLoading && expenses.map((exp) => (
                <TableRow
                  key={exp.id}
                  hover
                  sx={{
                    opacity: exp.isVoided ? 0.5 : 1,
                    textDecoration: exp.isVoided ? "line-through" : "none",
                    "&:last-child td": { borderBottom: 0 },
                  }}
                >
                  <TableCell sx={{ whiteSpace: "nowrap", color: "text.secondary", fontSize: "0.75rem" }}>
                    {exp.expenseDate ? dayjs(exp.expenseDate).format("DD.MM.YY") : "—"}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={exp.name || ""}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 130 }}>
                        {exp.name || "—"}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 110 }}>
                      {exp.categoryName ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 110 }}>
                      {exp.employeeName ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={METHOD_LABELS[exp.method] ?? exp.method}
                      size="small"
                      color={exp.method === "cash" ? "success" : exp.method === "card" ? "default" : "warning"}
                      variant="outlined"
                      sx={{ fontSize: "0.7rem", height: 20 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color={parseFloat(exp.cashAmount) > 0 ? "success.main" : "text.disabled"} noWrap>
                      {parseFloat(exp.cashAmount) > 0 ? `${exp.cashAmount} с` : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color={parseFloat(exp.cardAmount) > 0 ? "info.main" : "text.disabled"} noWrap>
                      {parseFloat(exp.cardAmount) > 0 ? `${exp.cardAmount} с` : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={600} color="error.main" noWrap>
                      − {exp.amount} с
                    </Typography>
                    {exp.isVoided && (
                      <Typography variant="caption" color="text.disabled" display="block">
                        аннул.
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 110 }}>
                      {exp.createdByName ?? "—"}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" display="block" noWrap>
                      {dayjs(exp.createdAt).format("DD.MM HH:mm")}
                    </Typography>
                  </TableCell>
                  {canManage && (
                    <TableCell align="right">
                      {!exp.isVoided && (
                        <Tooltip title="Аннулировать">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setVoidTarget(exp)}
                          >
                            <BlockIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
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
            onChange={(_, p) => setPage(p)}
            size="small"
            siblingCount={1}
          />
        </Stack>
      )}

      {/* Shared add drawer */}
      <DjangoAddExpenseDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        organizationId={organizationId}
        branchId={branchId}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.expenses.all });
          void queryClient.invalidateQueries({ queryKey: ["django", "cashbox", "summary"] });
          setCreateOpen(false);
        }}
      />

      <ExpenseVoidDialog
        open={voidTarget !== null}
        expense={voidTarget}
        onClose={() => setVoidTarget(null)}
        onVoided={() => setVoidTarget(null)}
      />
    </Stack>
  );
};

export default ExpensesPanel;
