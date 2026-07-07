import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PaidOutlined from "@mui/icons-material/PaidOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import {
  createBonus,
  deleteBonus,
  getBonuses,
} from "../../../api/payroll";
import { getDjangoEmployees, type DjangoEmployeeListItem } from "../../../api/staff";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { formatKGS } from "../../../utility/format";

// ── Props ─────────────────────────────────────────────────────────────────────

interface BonusDrawerProps {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
  organizationId?: number;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Ошибка");

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Страничный дравер «Единоразовая надбавка»: в отличие от BonusDialog
 * (открывается из строки конкретного сотрудника), содержит выбор сотрудника
 * и показывает его уже начисленные надбавки за месяц. Оба пути пишут в один
 * журнал /api/payroll/bonuses/.
 */
const BonusDrawer: React.FC<BonusDrawerProps> = ({
  open,
  onClose,
  year,
  month,
  organizationId,
}) => {
  const queryClient = useQueryClient();

  // Form state
  const [employee, setEmployee] = React.useState<DjangoEmployeeListItem | null>(null);
  const [employeeInput, setEmployeeInput] = React.useState("");
  const [employeeOptions, setEmployeeOptions] = React.useState<DjangoEmployeeListItem[]>([]);
  const [empLoading, setEmpLoading] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setEmployee(null);
      setEmployeeInput("");
      setAmount("");
      setReason("");
      setError(null);
    }
  }, [open]);

  // Employee search with debounce (паттерн из DjangoAddExpenseDrawer)
  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setEmpLoading(true);
      getDjangoEmployees(
        { search: employeeInput || undefined, status: "active", pageSize: 20 },
        controller.signal,
      )
        .then((res) => setEmployeeOptions(res.results))
        .catch(() => {
          // AbortError — ignore
        })
        .finally(() => setEmpLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [employeeInput, open]);

  // Existing bonuses of the selected employee for this month
  const listParams = {
    year,
    month,
    employeeId: employee?.id ?? null,
    orgId: organizationId ?? null,
  };
  const bonusesQuery = useQuery({
    queryKey: djangoQueryKeys.payroll.bonuses(listParams),
    queryFn: ({ signal }) =>
      getBonuses(
        { year, month, employeeId: employee!.id, organizationId },
        signal,
      ),
    enabled: open && employee != null,
  });
  const bonuses = bonusesQuery.data ?? [];
  const monthTotal = bonuses.reduce((s, b) => s + parseFloat(b.amount || "0"), 0);

  // Refetch bonus lists and the month report (earnings change).
  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["django", "payroll", "bonuses"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["django", "payroll", "report"],
    });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createBonus({
        employeeId: employee!.id,
        year,
        month,
        amount: parseFloat(amount.replace(",", ".")).toFixed(2),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      setAmount("");
      setReason("");
      invalidate();
    },
    onError: (e: unknown) => setError(errMsg(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteBonus(id),
    onSuccess: invalidate,
    onError: (e: unknown) => setError(errMsg(e)),
  });

  const amountNum = parseFloat(amount.replace(",", ".")) || 0;
  const canSubmit =
    employee != null && amountNum > 0 && reason.trim().length > 0;
  const busy = createMutation.isPending || deleteMutation.isPending;

  const monthLabel = dayjs(`${year}-${String(month).padStart(2, "0")}-01`)
    .locale("ru")
    .format("MMMM YYYY");

  const handleSubmit = () => {
    setError(null);
    if (!canSubmit) return;
    createMutation.mutate();
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: {
          // sm в теме проекта = 360px, поэтому на телефонах страхуемся maxWidth.
          width: { xs: "100%", sm: 420 },
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          flexShrink: 0,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <PaidOutlined sx={{ color: "success.main" }} />
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Единоразовая надбавка
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {monthLabel} · войдёт в колонку «Надбавка» отчёта
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Box>
      <Divider />

      {/* Body */}
      <Box
        sx={{
          p: 2.5,
          flex: 1,
          overflowY: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <Stack spacing={2.5}>
          {/* Сотрудник */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Сотрудник *
            </Typography>
            <Autocomplete
              options={
                employee && !employeeOptions.some((o) => o.id === employee.id)
                  ? [employee, ...employeeOptions]
                  : employeeOptions
              }
              loading={empLoading}
              value={employee}
              inputValue={employeeInput}
              getOptionLabel={(o) => o.fullName}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, v) => {
                setError(null);
                setEmployee(v);
              }}
              onInputChange={(_, v) => setEmployeeInput(v)}
              disabled={busy}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder="Введите имя сотрудника..."
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {empLoading && <CircularProgress size={14} />}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              noOptionsText="Сотрудники не найдены"
            />
          </Stack>

          {/* Сумма */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Сумма *
            </Typography>
            <TextField
              size="small"
              fullWidth
              value={amount}
              onChange={(e) => {
                setError(null);
                setAmount(e.target.value);
              }}
              placeholder="0"
              inputProps={{ inputMode: "decimal" }}
              InputProps={{
                endAdornment: <InputAdornment position="end">с</InputAdornment>,
              }}
              disabled={busy}
            />
          </Stack>

          {/* Причина */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Причина *
            </Typography>
            <TextField
              size="small"
              fullWidth
              multiline
              rows={2}
              value={reason}
              onChange={(e) => {
                setError(null);
                setReason(e.target.value);
              }}
              placeholder="Например: переработка в праздники"
              disabled={busy}
              inputProps={{ maxLength: 255 }}
            />
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}

          {/* Уже начисленные надбавки выбранного сотрудника за месяц */}
          {employee && (
            <Box>
              <Divider sx={{ mb: 1.5 }} />
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                textTransform="uppercase"
                display="block"
                mb={1}
              >
                Уже начислено · {employee.fullName}
              </Typography>

              {bonusesQuery.isLoading && (
                <Stack alignItems="center" py={1.5}>
                  <CircularProgress size={18} />
                </Stack>
              )}

              {!bonusesQuery.isLoading && bonuses.length === 0 && (
                <Typography variant="caption" color="text.disabled">
                  В этом месяце надбавок ещё нет
                </Typography>
              )}

              {bonuses.map((b) => (
                <Stack
                  key={b.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  py={0.75}
                  sx={{ borderBottom: "1px solid", borderColor: "divider" }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {b.reason || "Без причины"}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {dayjs(b.createdAt).format("DD.MM")}
                      {b.createdByName ? ` · ${b.createdByName}` : ""}
                    </Typography>
                  </Box>
                  <Stack direction="row" alignItems="center" spacing={0.5} flexShrink={0}>
                    <Typography variant="body2" fontWeight={600} color="success.main">
                      + {formatKGS(b.amount)}
                    </Typography>
                    <Tooltip title="Удалить надбавку">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => deleteMutation.mutate(b.id)}
                          disabled={busy}
                        >
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </Stack>
              ))}

              {bonuses.length > 0 && (
                <Stack direction="row" justifyContent="space-between" pt={1}>
                  <Typography variant="caption" color="text.secondary">
                    Итого за месяц
                  </Typography>
                  <Typography variant="caption" fontWeight={600}>
                    {formatKGS(String(monthTotal))}
                  </Typography>
                </Stack>
              )}
            </Box>
          )}
        </Stack>
      </Box>

      {/* Footer */}
      <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={!canSubmit || busy}
          onClick={handleSubmit}
          startIcon={
            createMutation.isPending ? (
              <CircularProgress size={20} color="inherit" />
            ) : undefined
          }
        >
          {createMutation.isPending ? "Начисление…" : "Начислить надбавку"}
        </Button>
      </Box>
    </Drawer>
  );
};

export default BonusDrawer;
