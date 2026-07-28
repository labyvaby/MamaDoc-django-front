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
import { useFormValidation } from "../../../hooks/useFormValidation";
import { useT } from "../../../i18n/VerticalProvider";

// ── Props ─────────────────────────────────────────────────────────────────────

interface BonusDrawerProps {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
  organizationId?: number;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

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
  const { t } = useT("salaryReports");
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
        { search: employeeInput || undefined, status: "active", pageSize: 20, organizationId },
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
  }, [employeeInput, open, organizationId]);

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
    void queryClient.invalidateQueries({
      queryKey: ["django", "payroll", "active-months"],
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
    onError: (e: unknown) => setError(errMsg(e, t("notify.genericError"))),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteBonus(id),
    onSuccess: invalidate,
    onError: (e: unknown) => setError(errMsg(e, t("notify.genericError"))),
  });

  const amountNum = parseFloat(amount.replace(",", ".")) || 0;
  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const form = useFormValidation({
    employee: employee ? null : t("bonusDrawer.employeeRequired"),
    amount: amountNum > 0 ? null : t("bonusDrawer.amountRequired"),
    reason: reason.trim() ? null : t("bonusDrawer.reasonRequired"),
  });
  const busy = createMutation.isPending || deleteMutation.isPending;

  const monthLabel = dayjs(`${year}-${String(month).padStart(2, "0")}-01`)
    .locale("ru")
    .format("MMMM YYYY");

  const handleSubmit = () => {
    setError(null);
    if (!form.validate()) return;
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
              {t("bonusDrawer.title")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("bonusDrawer.subtitle", { month: monthLabel })}
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={busy ? undefined : onClose} aria-label={t("common:actions.close")} edge="end">
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
              {t("bonusDrawer.employeeLabel")}
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
                  placeholder={t("bonusDrawer.employeePlaceholder")}
                  {...form.field("employee")}
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
              noOptionsText={t("bonusDrawer.noEmployeesFound")}
            />
          </Stack>

          {/* Сумма */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              {t("bonusDrawer.amountLabel")}
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
                endAdornment: <InputAdornment position="end">{t("common:currency.short")}</InputAdornment>,
              }}
              disabled={busy}
              {...form.field("amount")}
            />
          </Stack>

          {/* Причина */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              {t("bonusDrawer.reasonLabel")}
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
              placeholder={t("bonusDrawer.reasonPlaceholder")}
              disabled={busy}
              inputProps={{ maxLength: 255 }}
              {...form.field("reason")}
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
                {t("bonusDrawer.alreadyAccrued", { name: employee.fullName })}
              </Typography>

              {bonusesQuery.isLoading && (
                <Stack alignItems="center" py={1.5}>
                  <CircularProgress size={18} />
                </Stack>
              )}

              {!bonusesQuery.isLoading && bonuses.length === 0 && (
                <Typography variant="caption" color="text.disabled">
                  {t("bonusDrawer.noBonusesYetMonth")}
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
                      {b.reason || t("bonusDrawer.noReason")}
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
                    <Tooltip title={t("bonusDrawer.deleteTooltip")}>
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
                    {t("bonusDrawer.totalMonth")}
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
          disabled={busy}
          onClick={handleSubmit}
          startIcon={
            createMutation.isPending ? (
              <CircularProgress size={20} color="inherit" />
            ) : undefined
          }
        >
          {createMutation.isPending ? t("bonusDrawer.submitting") : t("bonusDrawer.submit")}
        </Button>
      </Box>
    </Drawer>
  );
};

export default BonusDrawer;
