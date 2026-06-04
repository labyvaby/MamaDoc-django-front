import React from "react";
import {
  Box,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Pagination,
  Select,
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
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  getCashboxShifts,
  parseBackendError,
  type CashboxShift,
  type CashboxShiftStatus,
} from "../../../../api/cashboxShifts";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../../api/queryKeys";
import { ApiError } from "../../../../api/client";
import ShiftSummaryDialog from "./ShiftSummaryDialog";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(s: string | null | undefined): string {
  if (!s) return "—";
  const n = parseFloat(s);
  return isNaN(n) ? "—" : n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDiff(s: string | null | undefined): React.ReactNode {
  if (!s) return <Typography variant="caption" color="text.disabled">—</Typography>;
  const n = parseFloat(s);
  if (isNaN(n)) return <Typography variant="caption" color="text.disabled">—</Typography>;
  const color = n < 0 ? "error.main" : n > 0 ? "warning.main" : "success.main";
  const prefix = n >= 0 ? "+" : "";
  return (
    <Typography variant="caption" fontWeight={600} color={color}>
      {prefix}{n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} с
    </Typography>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Branch = { id: number; name: string };

type Props = {
  organizationId: number | undefined;
  branches: Branch[];
  queriesEnabled: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

const ShiftHistoryPanel: React.FC<Props> = ({
  organizationId,
  branches,
  queriesEnabled,
}) => {
  const [page, setPage] = React.useState(1);
  const [branchFilter, setBranchFilter] = React.useState<number | "">("");
  const [statusFilter, setStatusFilter] = React.useState<CashboxShiftStatus | "">("");
  const [summaryTarget, setSummaryTarget] = React.useState<CashboxShift | null>(null);

  // Reset page on filter change
  const prevFiltersRef = React.useRef({ branchFilter, statusFilter, organizationId });
  React.useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.branchFilter !== branchFilter ||
      prev.statusFilter !== statusFilter ||
      prev.organizationId !== organizationId
    ) {
      prevFiltersRef.current = { branchFilter, statusFilter, organizationId };
      setPage(1);
    }
  }, [branchFilter, statusFilter, organizationId]);

  const filters = {
    organizationId,
    branchId: branchFilter !== "" ? branchFilter : undefined,
    status: statusFilter !== "" ? statusFilter : undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: djangoQueryKeys.shifts.list(filters as Record<string, unknown>),
    queryFn: ({ signal }) => getCashboxShifts(filters, signal),
    enabled: queriesEnabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    retry: (count, err) => {
      const status = (err as ApiError)?.status;
      if (status === 403 || status === 400) return false;
      return count < 1;
    },
  });

  const shifts = listQuery.data?.results ?? [];
  const total = listQuery.data?.count ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE) || 1;
  const error = listQuery.error ? parseBackendError(listQuery.error) : null;

  return (
    <Stack spacing={1.5}>
      {/* Filters row */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
        <Typography variant="subtitle2" fontWeight={700} sx={{ mr: 0.5 }}>
          История смен
        </Typography>
        {listQuery.isFetching && !listQuery.isLoading && <CircularProgress size={12} />}

        {branches.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Филиал</InputLabel>
            <Select
              value={branchFilter}
              label="Филиал"
              onChange={(e) => setBranchFilter(e.target.value as number | "")}
            >
              <MenuItem value="">Все</MenuItem>
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Статус</InputLabel>
          <Select
            value={statusFilter}
            label="Статус"
            onChange={(e) => setStatusFilter(e.target.value as CashboxShiftStatus | "")}
          >
            <MenuItem value="">Все</MenuItem>
            <MenuItem value="open">Открытые</MenuItem>
            <MenuItem value="closed">Закрытые</MenuItem>
          </Select>
        </FormControl>

        {total > 0 && (
          <Typography variant="caption" color="text.secondary">
            Всего: {total}
          </Typography>
        )}
      </Stack>

      {error && (
        <Typography variant="body2" color="error.main">{error}</Typography>
      )}

      {/* Table */}
      <Box>
        <TableContainer
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            overflowX: "auto",
          }}
        >
          <Table size="small" sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: "action.hover" }}>
                <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Статус</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Филиал</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>Открыта</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Открыл</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>Закрыта</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Закрыл</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Нач. сумма</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Ожидалось</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Факт.</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Разница</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {listQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              )}
              {!listQuery.isLoading && shifts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.disabled">
                      Смен нет
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {!listQuery.isLoading && shifts.map((sh) => (
                <TableRow
                  key={sh.id}
                  hover
                  sx={{ "&:last-child td": { borderBottom: 0 } }}
                >
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">#{sh.id}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={sh.status === "open" ? "Открыта" : "Закрыта"}
                      size="small"
                      color={sh.status === "open" ? "success" : "default"}
                      variant={sh.status === "open" ? "filled" : "outlined"}
                      sx={{ fontSize: "0.68rem", height: 18 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 110 }}>
                      {sh.branchName ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.75rem", color: "text.secondary" }}>
                    {dayjs(sh.openedAt).format("DD.MM.YY HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 100 }}>
                      {sh.openedByName ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.75rem", color: "text.secondary" }}>
                    {sh.closedAt ? dayjs(sh.closedAt).format("DD.MM.YY HH:mm") : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 100 }}>
                      {sh.closedByName ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption">{fmt(sh.openingCash)} с</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption">{fmt(sh.expectedCash)} с</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption">{sh.actualCash != null ? `${fmt(sh.actualCash)} с` : "—"}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    {fmtDiff(sh.difference)}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Итоги смены">
                      <IconButton
                        size="small"
                        onClick={() => setSummaryTarget(sh)}
                      >
                        <InfoOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">Всего: {total}</Typography>
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_, p) => setPage(p)}
            size="small"
            siblingCount={1}
          />
        </Stack>
      )}

      <ShiftSummaryDialog
        open={summaryTarget !== null}
        shift={summaryTarget}
        onClose={() => setSummaryTarget(null)}
      />
    </Stack>
  );
};

export default ShiftHistoryPanel;
