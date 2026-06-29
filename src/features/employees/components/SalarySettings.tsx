import React, { useState } from "react";
import {
    Box,
    Typography,
    Paper,
    Stack,
    Switch,
    TextField,
    Button,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    IconButton,
    Chip,
    Select,
    MenuItem,
    Checkbox,
    ListItemText,
    FormControl,
    alpha,
    useTheme,
    CircularProgress,
} from "@mui/material";
import { fetchServices } from "../../../services/services";
import {
    AddOutlined as Add,
    DeleteOutline,
    AccessTimeOutlined as AccessTime,
    PaidOutlined,
    CloseOutlined as Close,
} from "@mui/icons-material";

/**
 * --- JSON Data Structure Example ---
 * {
 *   "fixed_salary": {
 *     "enabled": true,
 *     "night_hourly_rate": 500,
 *     "day_hourly_rate": 300,
 *     "appointment_rate": 200
 *   },
 *   "dynamic_rules": [
 *     {
 *       "services": ["УЗИ", "Консультация"],
 *       "percent": 20,
 *       "fixed_amount": 0
 *     }
 *   ]
 * }
 */

interface SalaryRule {
    id: string;
    services: string[];
    percent: number;
    fixed_amount: number;
}

interface SalaryState {
    fixed_salary: {
        enabled: boolean;
        night_hourly_rate: number;
        day_hourly_rate: number;
        appointment_rate: number;
    };
    dynamic_rules: SalaryRule[];
}



interface SalarySettingsProps {
    employeeId?: string;
    initialValue?: SalaryState;
    onChange?: (value: SalaryState) => void;
}

const SalarySettings: React.FC<SalarySettingsProps> = ({ employeeId, initialValue, onChange }) => {
    const theme = useTheme();
    const [state, setState] = useState<SalaryState>(initialValue || {
        fixed_salary: {
            enabled: false,
            night_hourly_rate: 0,
            day_hourly_rate: 0,
            appointment_rate: 0,
        },
        dynamic_rules: [],
    });

    const [availableServices, setAvailableServices] = useState<string[]>([]);
    const [loadingServices, setLoadingServices] = useState(false);

    React.useEffect(() => {
        if (initialValue) {
            setState(initialValue);
        } else {
            setState({
                fixed_salary: {
                    enabled: false,
                    night_hourly_rate: 0,
                    day_hourly_rate: 0,
                    appointment_rate: 0,
                },
                dynamic_rules: [],
            });
        }
    }, [initialValue]);

    React.useEffect(() => {
        const load = async () => {
            try {
                setLoadingServices(true);
                const data = await fetchServices();

                let filtered = data;
                if (employeeId) {
                    filtered = data.filter(s => s.employee_ids?.includes(employeeId));
                }

                setAvailableServices(filtered.map(s => s.name));
            } catch (e) {
                console.error("Failed to fetch services", e);
            } finally {
                setLoadingServices(false);
            }
        };
        load();
    }, []);

    const updateState = (updater: (prev: SalaryState) => SalaryState) => {
        setState((prev) => {
            const next = updater(prev);
            onChange?.(next);
            return next;
        });
    };

    const toggleFixedSalary = () => {
        updateState((prev) => ({
            ...prev,
            fixed_salary: {
                ...prev.fixed_salary,
                enabled: !prev.fixed_salary.enabled,
            },
        }));
    };

    const handleFixedInput = (field: keyof SalaryState["fixed_salary"], value: string) => {
        const numValue = parseFloat(value) || 0;
        updateState((prev) => ({
            ...prev,
            fixed_salary: {
                ...prev.fixed_salary,
                [field]: numValue,
            },
        }));
    };

    const addDynamicRule = () => {
        const newRule: SalaryRule = {
            id: Math.random().toString(36).substr(2, 9),
            services: [],
            percent: 0,
            fixed_amount: 0,
        };
        updateState((prev) => ({
            ...prev,
            dynamic_rules: [...prev.dynamic_rules, newRule],
        }));
    };

    const removeDynamicRule = (id: string) => {
        updateState((prev) => ({
            ...prev,
            dynamic_rules: prev.dynamic_rules.filter((r) => r.id !== id),
        }));
    };

    const updateRule = (id: string, field: keyof Omit<SalaryRule, "id" | "services">, value: string) => {
        const numValue = parseFloat(value) || 0;
        updateState((prev) => ({
            ...prev,
            dynamic_rules: prev.dynamic_rules.map((r) => (r.id === id ? { ...r, [field]: numValue } : r)),
        }));
    };

    const handleServicesChange = (id: string, services: string[]) => {
        updateState((prev) => ({
            ...prev,
            dynamic_rules: prev.dynamic_rules.map((r) => (r.id === id ? { ...r, services } : r)),
        }));
    };

    return (
        <Box sx={{ width: "100%", mt: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, mb: 1.5, display: 'block', color: "text.secondary", letterSpacing: 1 }}>
                Зарплатные правила
            </Typography>

            {/* --- Фиксированная зарплата --- */}
            <Paper
                variant="outlined"
                sx={{
                    p: 1.5,
                    mb: 2,
                    borderRadius: "14px",
                    borderColor: "divider",
                    bgcolor: "background.paper",
                }}
            >
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                            sx={{
                                p: 0.75,
                                borderRadius: 1,
                                height: 32,
                                width: 32,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: state.fixed_salary.enabled ? alpha(theme.palette.primary.main, 0.1) : "action.hover",
                                color: state.fixed_salary.enabled ? "primary.onSurface" : "text.disabled",
                            }}
                        >
                            <AccessTime sx={{ fontSize: 18 }} />
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Фикс (час/прием)
                        </Typography>
                    </Stack>
                    <Switch size="small" checked={state.fixed_salary.enabled} onChange={toggleFixedSalary} color="primary" />
                </Stack>

                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 1,
                        opacity: state.fixed_salary.enabled ? 1 : 0.4,
                        pointerEvents: state.fixed_salary.enabled ? "auto" : "none",
                        transition: "opacity 0.2s ease",
                    }}
                >
                    {[
                        { label: "Ночь", key: "night_hourly_rate" },
                        { label: "День", key: "day_hourly_rate" },
                        { label: "Прием", key: "appointment_rate" },
                    ].map((item) => (
                        <Stack key={item.key} spacing={0.5}>
                            <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "text.secondary", textAlign: "center", fontWeight: 500 }}>
                                {item.label}
                            </Typography>
                            <TextField
                                fullWidth
                                size="small"
                                type="number"
                                value={state.fixed_salary[item.key as keyof SalaryState["fixed_salary"]] || ""}
                                onChange={(e) => handleFixedInput(item.key as keyof SalaryState["fixed_salary"], e.target.value)}
                                InputProps={{
                                    endAdornment: <Typography variant="caption" sx={{ ml: 0.25, color: "text.disabled", fontSize: '0.65rem' }}>с</Typography>,
                                }}
                                sx={{
                                    "& .MuiInputBase-root": { fontSize: "0.75rem", p: "2px 6px", bgcolor: "action.hover", height: 32 },
                                    "& .MuiInputBase-input": {
                                        p: 0,
                                        textAlign: 'center',
                                        '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
                                            display: 'none',
                                            margin: 0,
                                        },
                                        '&[type=number]': {
                                            MozAppearance: 'textfield',
                                        },
                                    }
                                }}
                            />
                        </Stack>
                    ))}
                </Box>
            </Paper>

            {/* --- Динамическая зарплата --- */}
            <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                            sx={{
                                p: 0.75,
                                borderRadius: 1,
                                height: 32,
                                width: 32,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
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
                        onClick={addDynamicRule}
                        sx={{ fontSize: "0.7rem", fontWeight: 700, minWidth: 0, p: '2px 8px' }}
                    >
                        Добавить
                    </Button>
                </Stack>

                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "14px", overflow: "hidden", bgcolor: 'background.paper' }}>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: "action.hover" }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700, p: 1, fontSize: "0.6rem", color: "text.disabled", }}>Услуги</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 700, p: 0.5, fontSize: "0.6rem", color: "text.disabled", width: 45 }}>%</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 700, p: 0.5, fontSize: "0.6rem", color: "text.disabled", width: 65 }}>Фикс</TableCell>
                                <TableCell align="center" sx={{ width: 32, p: 0 }}></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {state.dynamic_rules.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} align="center" sx={{ py: 2, color: "text.disabled", fontSize: "0.7rem" }}>
                                        Правила не заданы
                                    </TableCell>
                                </TableRow>
                            ) : (
                                state.dynamic_rules.map((rule) => (
                                    <TableRow key={rule.id} sx={{ '& td': { borderBottom: '1px solid', borderColor: 'divider' } }}>
                                        <TableCell sx={{ p: 0.75 }}>
                                            <FormControl fullWidth size="small">
                                                <Select
                                                    multiple
                                                    value={rule.services}
                                                    onChange={(e) => handleServicesChange(rule.id, e.target.value as string[])}
                                                    renderValue={(selected) => (
                                                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.25 }}>
                                                            {selected.map((value) => (
                                                                <Chip
                                                                    key={value}
                                                                    label={value}
                                                                    size="small"
                                                                    onDelete={() => {
                                                                        handleServicesChange(
                                                                            rule.id,
                                                                            rule.services.filter((s) => s !== value)
                                                                        );
                                                                    }}
                                                                    deleteIcon={<Close sx={{ fontSize: "10px !important" }} onMouseDown={(e) => e.stopPropagation()} />}
                                                                    sx={{
                                                                        height: 18,
                                                                        fontSize: "0.65rem",
                                                                        borderRadius: 0.75,
                                                                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                                                                        color: "primary.onSurface",
                                                                        fontWeight: 600,
                                                                        "& .MuiChip-label": { px: 0.5 },
                                                                        "& .MuiChip-deleteIcon": { m: 0 }
                                                                    }}
                                                                />
                                                            ))}
                                                        </Box>
                                                    )}
                                                    sx={{
                                                        borderRadius: 1,
                                                        bgcolor: "action.hover",
                                                        height: 'auto',
                                                        minHeight: 32,
                                                        "& .MuiSelect-select": { py: 0.5, px: 1, fontSize: "0.75rem", whiteSpace: 'normal' }
                                                    }}
                                                >
                                                    {loadingServices ? (
                                                        <MenuItem disabled sx={{ p: 1, justifyContent: "center" }}>
                                                            <CircularProgress size={20} />
                                                        </MenuItem>
                                                    ) : (
                                                        availableServices.map((service) => (
                                                            <MenuItem key={service} value={service} sx={{ fontSize: "0.75rem", p: 0.5, minHeight: 0 }}>
                                                                <Checkbox checked={rule.services.indexOf(service) > -1} size="small" sx={{ p: 0.5 }} />
                                                                <ListItemText primary={service} primaryTypographyProps={{ variant: "caption" }} />
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
                                                onChange={(e) => updateRule(rule.id, "percent", e.target.value)}
                                                sx={{
                                                    "& .MuiInputBase-root": { borderRadius: 1, bgcolor: "action.hover", fontSize: "0.75rem", height: 32 },
                                                    "& .MuiInputBase-input": {
                                                        p: 0,
                                                        textAlign: "center",
                                                        '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
                                                            display: 'none',
                                                            margin: 0,
                                                        },
                                                        '&[type=number]': {
                                                            MozAppearance: 'textfield',
                                                        },
                                                    }
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell align="center" sx={{ p: 0.5 }}>
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={rule.fixed_amount || ""}
                                                onChange={(e) => updateRule(rule.id, "fixed_amount", e.target.value)}
                                                sx={{
                                                    "& .MuiInputBase-root": { borderRadius: 1, bgcolor: "action.hover", fontSize: "0.75rem", height: 32 },
                                                    "& .MuiInputBase-input": {
                                                        p: 0,
                                                        textAlign: "center",
                                                        '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
                                                            display: 'none',
                                                            margin: 0,
                                                        },
                                                        '&[type=number]': {
                                                            MozAppearance: 'textfield',
                                                        },
                                                    }
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell align="center" sx={{ p: 0 }}>
                                            <IconButton onClick={() => removeDynamicRule(rule.id)} size="small" color="error" sx={{ opacity: 0.5 }}>
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

export default SalarySettings;
