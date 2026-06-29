import React from "react";
import {
    Box,
    Paper,
    Stack,
    TextField,
    MenuItem,
    Button,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
    InputAdornment,
} from "@mui/material";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import type { Dayjs } from "dayjs";
import { CustomDatePicker } from "../../ui";

/** Пресеты периода для панели фильтров продаж. */
export type SalesPeriodPreset = "today" | "week" | "month" | "all" | "custom";
/** UI-значения фильтров (включая «любой»). */
export type SalesPaymentUI = "all" | "cash" | "cashless";
export type SalesStatusUI = "all" | "paid" | "debt";

const PERIOD_OPTIONS: { value: SalesPeriodPreset; label: string }[] = [
    { value: "today", label: "Сегодня" },
    { value: "week", label: "7 дней" },
    { value: "month", label: "Этот месяц" },
    { value: "all", label: "Всё время" },
    { value: "custom", label: "Период" },
];

export interface SalesFilterBarProps {
    period: SalesPeriodPreset;
    onPeriodChange: (p: SalesPeriodPreset) => void;
    customFrom: Dayjs | null;
    customTo: Dayjs | null;
    onCustomFromChange: (d: Dayjs | null) => void;
    onCustomToChange: (d: Dayjs | null) => void;
    /** Подпись выбранного диапазона («с 01.06 по 29.06»). */
    rangeLabel: string;
    search: string;
    onSearchChange: (v: string) => void;
    paymentMethod: SalesPaymentUI;
    onPaymentMethodChange: (v: SalesPaymentUI) => void;
    status: SalesStatusUI;
    onStatusChange: (v: SalesStatusUI) => void;
    hasActiveFilters: boolean;
    onReset: () => void;
}

export const SalesFilterBar: React.FC<SalesFilterBarProps> = ({
    period,
    onPeriodChange,
    customFrom,
    customTo,
    onCustomFromChange,
    onCustomToChange,
    rangeLabel,
    search,
    onSearchChange,
    paymentMethod,
    onPaymentMethodChange,
    status,
    onStatusChange,
    hasActiveFilters,
    onReset,
}) => {
    return (
        <Paper variant="outlined" elevation={0} sx={{ p: 1.5 }}>
            <Stack spacing={1.5}>
                {/* Период: пресеты + произвольный диапазон */}
                <Stack
                    direction="row"
                    spacing={1.5}
                    useFlexGap
                    flexWrap="wrap"
                    alignItems="center"
                >
                    <ToggleButtonGroup
                        value={period}
                        exclusive
                        size="small"
                        onChange={(_, v) => v && onPeriodChange(v)}
                    >
                        {PERIOD_OPTIONS.map((o) => (
                            <ToggleButton
                                key={o.value}
                                value={o.value}
                                sx={{ textTransform: "none", px: 1.5 }}
                            >
                                {o.label}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>

                    {period === "custom" ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <CustomDatePicker
                                value={customFrom}
                                onChange={(d) => onCustomFromChange(d as Dayjs | null)}
                                slotProps={{ textField: { size: "small", sx: { width: 150 } } }}
                            />
                            <Typography variant="body2" color="text.secondary">—</Typography>
                            <CustomDatePicker
                                value={customTo}
                                onChange={(d) => onCustomToChange(d as Dayjs | null)}
                                slotProps={{ textField: { size: "small", sx: { width: 150 } } }}
                            />
                        </Stack>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            {rangeLabel}
                        </Typography>
                    )}
                </Stack>

                {/* Поиск + селекты + сброс */}
                <Stack
                    direction="row"
                    spacing={1.5}
                    useFlexGap
                    flexWrap="wrap"
                    alignItems="center"
                >
                    <TextField
                        size="small"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Пациент, товар или № чека"
                        sx={{ flex: 1, minWidth: 220 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchOutlined fontSize="small" />
                                </InputAdornment>
                            ),
                        }}
                    />

                    <TextField
                        select
                        size="small"
                        label="Оплата"
                        value={paymentMethod}
                        onChange={(e) => onPaymentMethodChange(e.target.value as SalesPaymentUI)}
                        sx={{ minWidth: 150 }}
                    >
                        <MenuItem value="all">Любая</MenuItem>
                        <MenuItem value="cash">Наличные</MenuItem>
                        <MenuItem value="cashless">Безналичные</MenuItem>
                    </TextField>

                    <TextField
                        select
                        size="small"
                        label="Статус"
                        value={status}
                        onChange={(e) => onStatusChange(e.target.value as SalesStatusUI)}
                        sx={{ minWidth: 150 }}
                    >
                        <MenuItem value="all">Любой</MenuItem>
                        <MenuItem value="paid">Оплачено</MenuItem>
                        <MenuItem value="debt">Долг</MenuItem>
                    </TextField>

                    {hasActiveFilters && (
                        <Button
                            size="small"
                            onClick={onReset}
                            startIcon={<CloseOutlined fontSize="small" />}
                            sx={{ textTransform: "none" }}
                        >
                            Сбросить
                        </Button>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                </Stack>
            </Stack>
        </Paper>
    );
};
