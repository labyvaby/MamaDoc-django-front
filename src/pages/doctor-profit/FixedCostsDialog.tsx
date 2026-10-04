import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PriceChangeOutlined from "@mui/icons-material/PriceChangeOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  changeFixedCostAmount,
  createFixedCost,
  deleteFixedCost,
  getFixedCosts,
  updateFixedCost,
  type FixedCost,
  type FixedCostInput,
} from "../../api/fixedCosts";
import { getBranches } from "../../api/organization";
import { parseBackendError } from "../../api/appointments";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import { formatMonth } from "./profitRows";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Месяц отчёта, YYYY-MM: список — действующие в нём, «с этого месяца» — он. */
  month: string;
  branchId?: number;
  /** Только суперадмину — как у самого отчёта. */
  organizationId?: number;
  /** Организация для справочника филиалов. */
  branchesOrgId?: number;
  canManage: boolean;
}

type Mode = { kind: "list" } | { kind: "form"; cost: FixedCost | null } | { kind: "amount"; cost: FixedCost };

const ORG_WIDE = "org";

const emptyForm = (month: string, branchId?: number): FixedCostInput => ({
  name: "",
  amount: "",
  branchId: branchId ?? null,
  monthFrom: month,
  monthTo: null,
});

const period = (cost: FixedCost): string =>
  `${formatMonth(cost.monthFrom)} — ${cost.monthTo ? formatMonth(cost.monthTo) : "бессрочно"}`;

export const FixedCostsDialog: React.FC<Props> = ({
  open,
  onClose,
  month,
  branchId,
  organizationId,
  branchesOrgId,
  canManage,
}) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = React.useState<Mode>({ kind: "list" });
  const [form, setForm] = React.useState<FixedCostInput>(() => emptyForm(month, branchId));
  const [newAmount, setNewAmount] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const costsQuery = useQuery({
    queryKey: djangoQueryKeys.reports.fixedCosts({ month, branchId, organizationId }),
    queryFn: ({ signal }) => getFixedCosts({ month, branchId, organizationId }, signal),
    enabled: open,
  });
  const branchesQuery = useQuery({
    queryKey: [...djangoQueryKeys.organization.branches, branchesOrgId ?? null],
    queryFn: () => getBranches(branchesOrgId),
    enabled: open && canManage,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  React.useEffect(() => {
    if (!open) {
      setMode({ kind: "list" });
      setError(null);
      setConfirmDelete(null);
    }
  }, [open]);

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      // Отчёт и список пересчитываются: сумма постоянных расходов входит в общие.
      await queryClient.invalidateQueries({ queryKey: ["django", "reports"] });
      setMode({ kind: "list" });
      setConfirmDelete(null);
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setSaving(false);
    }
  };

  const openForm = (cost: FixedCost | null) => {
    setError(null);
    setForm(
      cost
        ? {
            name: cost.name,
            amount: cost.amount,
            branchId: cost.branchId,
            monthFrom: cost.monthFrom,
            monthTo: cost.monthTo,
          }
        : emptyForm(month, branchId),
    );
    setMode({ kind: "form", cost });
  };

  const saveForm = (cost: FixedCost | null) =>
    run(() =>
      cost
        ? updateFixedCost(cost.id, form, organizationId)
        : createFixedCost(form, organizationId),
    );

  const costs = costsQuery.data ?? [];
  const total = costs.reduce((acc, c) => acc + Number(c.amount), 0);

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 0.5 }}>Постоянные расходы</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Аренда, коммунальные платежи, налоги — то, чего нет в кассе. Вносятся один раз и входят в отчёт каждый
          месяц своего срока; в кассу и «Расходы» не попадают.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {mode.kind === "list" && (
          <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">
                Итого за {formatMonth(month)}: {formatKGS(total)}
              </Typography>
              {canManage && (
                <Button size="small" startIcon={<AddOutlined />} onClick={() => openForm(null)}>
                  Добавить
                </Button>
              )}
            </Stack>
            {costsQuery.isLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : costs.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>
                В этом месяце постоянных расходов нет.
              </Typography>
            ) : (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
                {costs.map((cost) => (
                  <Stack key={cost.id} direction="row" alignItems="center" spacing={1} sx={{ py: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {cost.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {cost.branchName ?? "Вся организация"} · {period(cost)}
                      </Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: "nowrap" }}>
                      {formatKGS(cost.amount)}
                    </Typography>
                    {canManage &&
                      (confirmDelete === cost.id ? (
                        <Stack direction="row" spacing={0.5}>
                          <Button
                            size="small"
                            color="error"
                            disabled={saving}
                            onClick={() => void run(() => deleteFixedCost(cost.id, organizationId))}
                          >
                            Удалить
                          </Button>
                          <Button size="small" disabled={saving} onClick={() => setConfirmDelete(null)}>
                            Нет
                          </Button>
                        </Stack>
                      ) : (
                        <Stack direction="row">
                          <Tooltip title="Изменить сумму с этого месяца" arrow>
                            <IconButton
                              size="small"
                              onClick={() => {
                                setNewAmount(cost.amount);
                                setError(null);
                                setMode({ kind: "amount", cost });
                              }}
                            >
                              <PriceChangeOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Изменить запись" arrow>
                            <IconButton size="small" onClick={() => openForm(cost)}>
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Удалить" arrow>
                            <IconButton size="small" onClick={() => setConfirmDelete(cost.id)}>
                              <DeleteOutlineOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      ))}
                  </Stack>
                ))}
              </Stack>
            )}
          </>
        )}

        {mode.kind === "form" && (
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              label="Название"
              placeholder="Аренда"
              size="small"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
            <TextField
              label="Сумма в месяц, сом"
              size="small"
              type="number"
              inputProps={{ min: 0, step: "0.01" }}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <TextField
              select
              label="Филиал"
              size="small"
              value={form.branchId == null ? ORG_WIDE : String(form.branchId)}
              onChange={(e) =>
                setForm((f) => ({ ...f, branchId: e.target.value === ORG_WIDE ? null : Number(e.target.value) }))
              }
              helperText="Расход всей организации делится между всеми врачами клиники"
            >
              <MenuItem value={ORG_WIDE}>Вся организация</MenuItem>
              {(branchesQuery.data ?? []).map((b) => (
                <MenuItem key={b.id} value={String(b.id)}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="С месяца"
                size="small"
                type="month"
                value={form.monthFrom}
                onChange={(e) => setForm((f) => ({ ...f, monthFrom: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="По месяц"
                size="small"
                type="month"
                value={form.monthTo ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, monthTo: e.target.value || null }))}
                InputLabelProps={{ shrink: true }}
                helperText="Пусто — бессрочно"
                fullWidth
              />
            </Stack>
          </Stack>
        )}

        {mode.kind === "amount" && (
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2">
              «{mode.cost.name}»: новая сумма действует начиная с месяца «{formatMonth(month)}». Прошлые месяцы
              останутся с прежней суммой {formatKGS(mode.cost.amount)}.
            </Typography>
            <TextField
              label="Новая сумма в месяц, сом"
              size="small"
              type="number"
              inputProps={{ min: 0, step: "0.01" }}
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              autoFocus
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {mode.kind === "list" ? (
          <Button onClick={onClose}>Закрыть</Button>
        ) : (
          <>
            <Button onClick={() => setMode({ kind: "list" })} disabled={saving}>
              Назад
            </Button>
            <Button
              variant="contained"
              disabled={saving}
              onClick={() =>
                void (mode.kind === "form"
                  ? saveForm(mode.cost)
                  : run(() => changeFixedCostAmount(mode.cost.id, month, newAmount, organizationId)))
              }
            >
              Сохранить
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default FixedCostsDialog;
