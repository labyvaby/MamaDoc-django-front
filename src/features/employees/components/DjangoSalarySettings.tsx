import React from "react";
import {
  alpha,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import Add from "@mui/icons-material/AddOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import AccessTime from "@mui/icons-material/AccessTimeOutlined";
import PaidOutlined from "@mui/icons-material/PaidOutlined";
import Close from "@mui/icons-material/CloseOutlined";

import type { Service } from "../../../api/catalog";

// ── value shape ─────────────────────────────────────────────────────────────
// Mirrors the original SalarySettings JSON, adapted to Django service IDs.

export type SalaryRuleRow = {
  id: string;
  serviceIds: number[];
  percent: string;
  fixedAmount: string;
};

export type SalarySettingsValue = {
  enabled: boolean;
  nightRate: string;
  dayRate: string;
  appointmentRate: string;
  rules: SalaryRuleRow[];
};

export const EMPTY_SALARY: SalarySettingsValue = {
  enabled: false,
  nightRate: "",
  dayRate: "",
  appointmentRate: "",
  rules: [],
};

type Props = {
  value: SalarySettingsValue;
  onChange: (v: SalarySettingsValue) => void;
  services: Service[];
  loadingServices?: boolean;
  disabled?: boolean;
};

const FIXED_FIELDS: { label: string; key: "nightRate" | "dayRate" | "appointmentRate" }[] = [
  { label: "Ночь", key: "nightRate" },
  { label: "День", key: "dayRate" },
  { label: "Прием", key: "appointmentRate" },
];

let _ruleSeq = 0;
const newRuleId = () => `rule_${(_ruleSeq += 1)}`;

const numberInputSx = {
  "& .MuiInputBase-root": {
    borderRadius: 1,
    bgcolor: "action.hover",
    fontSize: "0.75rem",
    height: 32,
  },
  "& .MuiInputBase-input": {
    p: 0,
    textAlign: "center",
    "&::-webkit-outer-spin-button, &::-webkit-inner-spin-button": {
      display: "none",
      margin: 0,
    },
    "&[type=number]": { MozAppearance: "textfield" },
  },
} as const;

const DjangoSalarySettings: React.FC<Props> = ({
  value,
  onChange,
  services,
  loadingServices = false,
  disabled = false,
}) => {
  const theme = useTheme();

  const toggleFixed = () =>
    onChange({ ...value, enabled: !value.enabled });

  const setFixed = (key: "nightRate" | "dayRate" | "appointmentRate", raw: string) =>
    onChange({ ...value, [key]: raw });

  const addRule = () =>
    onChange({
      ...value,
      rules: [
        ...value.rules,
        { id: newRuleId(), serviceIds: [], percent: "", fixedAmount: "" },
      ],
    });

  const removeRule = (id: string) =>
    onChange({ ...value, rules: value.rules.filter((r) => r.id !== id) });

  const patchRule = (id: string, patch: Partial<SalaryRuleRow>) =>
    onChange({
      ...value,
      rules: value.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });

  const serviceName = (id: number) =>
    services.find((s) => s.id === id)?.name ?? `#${id}`;

  return (
    <Box sx={{ width: "100%", mt: 1 }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          mb: 1.5,
          display: "block",
          color: "text.secondary",
          
          letterSpacing: 1,
        }}
      >
        Зарплатные правила
      </Typography>

      {/* ── Фикс (час/прием) ── */}
      <Paper
        variant="outlined"
        sx={{ p: 1.5, mb: 2, borderRadius: "14px", borderColor: "divider", bgcolor: "background.paper" }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                p: 0.75,
                borderRadius: 1,
                height: 32,
                width: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: value.enabled ? alpha(theme.palette.primary.main, 0.1) : "action.hover",
                color: value.enabled ? "primary.onSurface" : "text.disabled",
              }}
            >
              <AccessTime sx={{ fontSize: 18 }} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Фикс (час/прием)
            </Typography>
          </Stack>
          <Switch
            size="small"
            checked={value.enabled}
            onChange={toggleFixed}
            color="primary"
            disabled={disabled}
          />
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 1,
            opacity: value.enabled ? 1 : 0.4,
            pointerEvents: value.enabled && !disabled ? "auto" : "none",
            transition: "opacity 0.2s ease",
          }}
        >
          {FIXED_FIELDS.map((item) => (
            <Stack key={item.key} spacing={0.5}>
              <Typography
                variant="caption"
                sx={{ fontSize: "0.6rem", color: "text.secondary", textAlign: "center", fontWeight: 500 }}
              >
                {item.label}
              </Typography>
              <TextField
                fullWidth
                size="small"
                type="number"
                value={value[item.key] || ""}
                onChange={(e) => setFixed(item.key, e.target.value)}
                InputProps={{
                  endAdornment: (
                    <Typography variant="caption" sx={{ ml: 0.25, color: "text.disabled", fontSize: "0.65rem" }}>
                      с
                    </Typography>
                  ),
                }}
                sx={{
                  "& .MuiInputBase-root": { fontSize: "0.75rem", p: "2px 6px", bgcolor: "action.hover", height: 32 },
                  "& .MuiInputBase-input": {
                    p: 0,
                    textAlign: "center",
                    "&::-webkit-outer-spin-button, &::-webkit-inner-spin-button": { display: "none", margin: 0 },
                    "&[type=number]": { MozAppearance: "textfield" },
                  },
                }}
              />
            </Stack>
          ))}
        </Box>
      </Paper>

      {/* ── Динамические (услуги) ── */}
      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                p: 0.75,
                borderRadius: 1,
                height: 32,
                width: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: alpha(theme.palette.secondary.main, 0.1),
                color: "secondary.main",
              }}
            >
              <PaidOutlined sx={{ fontSize: 18 }} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Динамические (услуги)
            </Typography>
          </Stack>
          <Button
            variant="text"
            size="small"
            color="primary"
            startIcon={<Add sx={{ fontSize: 16 }} />}
            onClick={addRule}
            disabled={disabled}
            sx={{ fontSize: "0.7rem", fontWeight: 700, minWidth: 0, p: "2px 8px" }}
          >
            Добавить
          </Button>
        </Stack>

        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "14px", overflow: "hidden", bgcolor: "background.paper" }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: "action.hover" }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, p: 1, fontSize: "0.6rem", color: "text.disabled", }}>Услуги</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, p: 0.5, fontSize: "0.6rem", color: "text.disabled", width: 45 }}>%</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, p: 0.5, fontSize: "0.6rem", color: "text.disabled", width: 65 }}>Фикс</TableCell>
                <TableCell align="center" sx={{ width: 32, p: 0 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {value.rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 2, color: "text.disabled", fontSize: "0.7rem" }}>
                    Правила не заданы
                  </TableCell>
                </TableRow>
              ) : (
                value.rules.map((rule) => (
                  <TableRow key={rule.id} sx={{ "& td": { borderBottom: "1px solid", borderColor: "divider" } }}>
                    <TableCell sx={{ p: 0.75 }}>
                      <FormControl fullWidth size="small">
                        <Select<number[]>
                          multiple
                          value={rule.serviceIds}
                          disabled={disabled}
                          onChange={(e) =>
                            patchRule(rule.id, {
                              serviceIds: (e.target.value as number[]).map(Number),
                            })
                          }
                          renderValue={(selected) => (
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.25 }}>
                              {selected.map((id) => (
                                <Chip
                                  key={id}
                                  label={serviceName(id)}
                                  size="small"
                                  onDelete={() =>
                                    patchRule(rule.id, {
                                      serviceIds: rule.serviceIds.filter((x) => x !== id),
                                    })
                                  }
                                  deleteIcon={<Close sx={{ fontSize: "10px !important" }} onMouseDown={(e) => e.stopPropagation()} />}
                                  sx={{
                                    height: 18,
                                    fontSize: "0.65rem",
                                    borderRadius: 0.75,
                                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                                    color: "primary.onSurface",
                                    fontWeight: 600,
                                    "& .MuiChip-label": { px: 0.5 },
                                    "& .MuiChip-deleteIcon": { m: 0 },
                                  }}
                                />
                              ))}
                            </Box>
                          )}
                          sx={{
                            borderRadius: 1,
                            bgcolor: "action.hover",
                            height: "auto",
                            minHeight: 32,
                            "& .MuiSelect-select": { py: 0.5, px: 1, fontSize: "0.75rem", whiteSpace: "normal" },
                          }}
                        >
                          {loadingServices ? (
                            <MenuItem disabled sx={{ p: 1, justifyContent: "center" }}>
                              <CircularProgress size={20} />
                            </MenuItem>
                          ) : (
                            services.map((service) => (
                              <MenuItem key={service.id} value={service.id} sx={{ fontSize: "0.75rem", p: 0.5, minHeight: 0 }}>
                                <Checkbox checked={rule.serviceIds.indexOf(service.id) > -1} size="small" sx={{ p: 0.5 }} />
                                <ListItemText primary={service.name} primaryTypographyProps={{ variant: "caption" }} />
                              </MenuItem>
                            ))
                          )}
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell align="center" sx={{ p: 0.5 }}>
                      <TextField
                        size="small"
                        type="number"
                        value={rule.percent || ""}
                        disabled={disabled}
                        onChange={(e) => patchRule(rule.id, { percent: e.target.value })}
                        sx={numberInputSx}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ p: 0.5 }}>
                      <TextField
                        size="small"
                        type="number"
                        value={rule.fixedAmount || ""}
                        disabled={disabled}
                        onChange={(e) => patchRule(rule.id, { fixedAmount: e.target.value })}
                        sx={numberInputSx}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ p: 0 }}>
                      <IconButton onClick={() => removeRule(rule.id)} size="small" color="error" disabled={disabled} sx={{ opacity: 0.5 }}>
                        <DeleteOutline sx={{ fontSize: 16 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
};

// ── mapping helpers (Django EmployeeRule ⇄ form value) ──────────────────────

export function ruleToSalaryValue(rule: {
  appointmentRate: string;
  dayHourlyRate: string;
  nightHourlyRate: string;
  serviceRates: { serviceId: number; percent: string; fixedAmount: string }[];
}): SalarySettingsValue {
  const num = (s: string) => parseFloat(s) || 0;
  const enabled =
    num(rule.appointmentRate) > 0 || num(rule.dayHourlyRate) > 0 || num(rule.nightHourlyRate) > 0;

  // Group flat per-service rates back into rows by identical (percent, fixed).
  const groups = new Map<string, SalaryRuleRow>();
  for (const r of rule.serviceRates) {
    const key = `${r.percent}|${r.fixedAmount}`;
    const existing = groups.get(key);
    if (existing) {
      existing.serviceIds.push(r.serviceId);
    } else {
      groups.set(key, {
        id: newRuleId(),
        serviceIds: [r.serviceId],
        percent: r.percent,
        fixedAmount: r.fixedAmount,
      });
    }
  }

  return {
    enabled,
    nightRate: rule.nightHourlyRate ?? "",
    dayRate: rule.dayHourlyRate ?? "",
    appointmentRate: rule.appointmentRate ?? "",
    rules: [...groups.values()],
  };
}

export function salaryValueToPayload(value: SalarySettingsValue): {
  appointmentRate: string;
  dayHourlyRate: string;
  nightHourlyRate: string;
  isActive: boolean;
  serviceRates: { serviceId: number; percent: string; fixedAmount: string }[];
} {
  const rate = (s: string) => (s.trim() ? s.trim() : "0");
  const serviceRates = value.rules.flatMap((r) =>
    r.serviceIds.map((serviceId) => ({
      serviceId,
      percent: rate(r.percent),
      fixedAmount: rate(r.fixedAmount),
    })),
  );
  return {
    appointmentRate: value.enabled ? rate(value.appointmentRate) : "0",
    dayHourlyRate: value.enabled ? rate(value.dayRate) : "0",
    nightHourlyRate: value.enabled ? rate(value.nightRate) : "0",
    isActive: true,
    serviceRates,
  };
}

export default DjangoSalarySettings;
