import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useNotification } from "@refinedev/core";

import { useCan } from "../../../hooks/useCan";
import { getServices, type Service } from "../../../api/catalog";
import {
  getEmployeeRule,
  putEmployeeRule,
  type EmployeeRule,
} from "../../../api/payroll";

type RateRow = {
  serviceId: number | null;
  percent: string;
  fixedAmount: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: number;
  employeeName: string;
  onSaved?: () => void;
};

const DjangoSalaryRulesDrawer: React.FC<Props> = ({
  open,
  onClose,
  employeeId,
  employeeName,
  onSaved,
}) => {
  const { open: notify } = useNotification();
  const canView = useCan("payroll.view");
  const canEdit = useCan("payroll.manage");

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [services, setServices] = React.useState<Service[]>([]);
  const [appointmentRate, setAppointmentRate] = React.useState("");
  const [rows, setRows] = React.useState<RateRow[]>([]);
  // Preserve hourly rates we don't edit here (used by a later phase).
  const preservedRef = React.useRef<{ day: string; night: string }>({
    day: "0",
    night: "0",
  });

  React.useEffect(() => {
    if (!open || !canView) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      getEmployeeRule(employeeId, controller.signal),
      getServices(null, controller.signal),
    ])
      .then(([rule, svcList]: [EmployeeRule, Service[]]) => {
        if (controller.signal.aborted) return;
        setServices(svcList.filter((s) => s.isActive));
        setAppointmentRate(rule.appointmentRate ?? "0");
        preservedRef.current = {
          day: rule.dayHourlyRate ?? "0",
          night: rule.nightHourlyRate ?? "0",
        };
        setRows(
          rule.serviceRates.map((r) => ({
            serviceId: r.serviceId,
            percent: r.percent,
            fixedAmount: r.fixedAmount,
          })),
        );
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, canView, employeeId]);

  const usedServiceIds = React.useMemo(
    () => new Set(rows.map((r) => r.serviceId).filter((id): id is number => id != null)),
    [rows],
  );

  const addRow = () =>
    setRows((prev) => [...prev, { serviceId: null, percent: "", fixedAmount: "" }]);
  const removeRow = (index: number) =>
    setRows((prev) => prev.filter((_, i) => i !== index));
  const patchRow = (index: number, patch: Partial<RateRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const serviceRates = rows
        .filter((r) => r.serviceId != null)
        .map((r) => ({
          serviceId: r.serviceId as number,
          percent: r.percent.trim() ? r.percent : 0,
          fixedAmount: r.fixedAmount.trim() ? r.fixedAmount : 0,
        }));
      await putEmployeeRule(employeeId, {
        appointmentRate: appointmentRate.trim() ? appointmentRate : 0,
        dayHourlyRate: preservedRef.current.day,
        nightHourlyRate: preservedRef.current.night,
        isActive: true,
        serviceRates,
      });
      notify?.({ type: "success", message: "Правила ЗП сохранены" });
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
      notify?.({ type: "error", message: "Не удалось сохранить" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: (t) => t.zIndex.drawer + 2,
        display: open ? "flex" : "none",
        justifyContent: "flex-end",
      }}
    >
      <Box
        onClick={saving ? undefined : onClose}
        sx={{ position: "absolute", inset: 0, bgcolor: "rgba(0,0,0,0.4)" }}
      />
      <Box
        sx={{
          position: "relative",
          width: { xs: "100vw", sm: 540 },
          maxWidth: "100vw",
          height: "100%",
          bgcolor: "background.paper",
          display: "flex",
          flexDirection: "column",
          boxShadow: 6,
        }}
      >
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.5}>
          <Box>
            <Typography variant="h6" lineHeight={1.2}>
              Правила зарплаты
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {employeeName}
            </Typography>
          </Box>
          <IconButton onClick={saving ? undefined : onClose}>
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Divider />

        {/* Body */}
        <Box sx={{ flex: 1, overflowY: "auto", p: 2, minHeight: 0 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Stack alignItems="center" py={8}>
              <CircularProgress />
            </Stack>
          ) : (
            <Stack spacing={2}>
              <TextField
                label="Ставка за приём (с)"
                value={appointmentRate}
                onChange={(e) => setAppointmentRate(e.target.value)}
                disabled={!canEdit}
                fullWidth
                size="small"
                helperText="Фикс за каждый оплаченный приём сотрудника."
              />

              <Divider textAlign="left">
                <Typography variant="caption" color="text.secondary">
                  Ставки по услугам (% выручки + фикс)
                </Typography>
              </Divider>

              {rows.length === 0 && (
                <Typography variant="body2" color="text.disabled">
                  Ставок по услугам нет.
                </Typography>
              )}

              {rows.map((row, index) => {
                const selected = services.find((s) => s.id === row.serviceId) ?? null;
                const options = services.filter(
                  (s) => s.id === row.serviceId || !usedServiceIds.has(s.id),
                );
                return (
                  <Stack
                    key={index}
                    spacing={1}
                    sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Autocomplete<Service>
                        sx={{ flex: 1 }}
                        options={options}
                        value={selected}
                        onChange={(_, v) => patchRow(index, { serviceId: v?.id ?? null })}
                        getOptionLabel={(s) => s.name}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        disabled={!canEdit}
                        renderInput={(params) => (
                          <TextField {...params} size="small" placeholder="Услуга" />
                        )}
                      />
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeRow(index)}
                        disabled={!canEdit}
                      >
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <TextField
                        label="% выручки"
                        value={row.percent}
                        onChange={(e) => patchRow(index, { percent: e.target.value })}
                        disabled={!canEdit}
                        size="small"
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        label="Фикс (с)"
                        value={row.fixedAmount}
                        onChange={(e) => patchRow(index, { fixedAmount: e.target.value })}
                        disabled={!canEdit}
                        size="small"
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                  </Stack>
                );
              })}

              {canEdit && (
                <Button startIcon={<AddOutlined />} onClick={addRow} variant="outlined" size="small">
                  Добавить услугу
                </Button>
              )}
            </Stack>
          )}
        </Box>

        {/* Footer */}
        <Box
          sx={{
            p: 2,
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            justifyContent: "flex-end",
            gap: 1.5,
            flexShrink: 0,
          }}
        >
          <Button onClick={onClose} disabled={saving} color="inherit">
            Отмена
          </Button>
          {canEdit && (
            <Button variant="contained" onClick={handleSave} disabled={saving || loading}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default DjangoSalaryRulesDrawer;
