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
import dayjs, { type Dayjs } from "dayjs";
import { DateRangeField } from "../../ui";
import type { DjangoCashlessMethod } from "../../../api/cashlessMethods";
import { useT } from "../../../i18n/VerticalProvider";

/** Пресеты периода для панели фильтров продаж. */
export type SalesPeriodPreset = "today" | "week" | "month" | "all" | "custom";
/** UI-значения фильтров (включая «любой»). */
export type SalesPaymentUI = "all" | "cash" | "cashless";
export type SalesStatusUI = "all" | "paid" | "debt";

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
    /**
     * Способы безнала для фильтра — вместе со скрытыми: терминал могли убрать
     * из справочника уже после того, как через него прошли продажи.
     * Пустой список = бэк способ у продаж не хранит, селект не показываем.
     */
    cashlessMethods?: DjangoCashlessMethod[];
    cashlessMethodId?: number | "all";
    onCashlessMethodChange?: (v: number | "all") => void;
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
    cashlessMethods = [],
    cashlessMethodId = "all",
    onCashlessMethodChange,
    hasActiveFilters,
    onReset,
}) => {
    const { t } = useT("sales");
    const PERIOD_OPTIONS: { value: SalesPeriodPreset; label: string }[] = [
        { value: "today", label: t("filterBar.periodToday") },
        { value: "week", label: t("filterBar.periodWeek") },
        { value: "month", label: t("filterBar.periodMonth") },
        { value: "all", label: t("filterBar.periodAll") },
        { value: "custom", label: t("filterBar.periodCustom") },
    ];
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
                        <DateRangeField
                            value={{
                                from: customFrom ?? dayjs().startOf("month"),
                                to: customTo ?? dayjs().endOf("month"),
                            }}
                            onChange={(r) => {
                                onCustomFromChange(r.from);
                                onCustomToChange(r.to);
                            }}
                            presets={[]}
                            minWidth={220}
                        />
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
                        placeholder={t("filterBar.searchPlaceholder")}
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
                        label={t("filterBar.paymentLabel")}
                        value={paymentMethod}
                        onChange={(e) => onPaymentMethodChange(e.target.value as SalesPaymentUI)}
                        sx={{ minWidth: 150 }}
                    >
                        <MenuItem value="all">{t("filterBar.paymentAny")}</MenuItem>
                        <MenuItem value="cash">{t("filterBar.paymentCash")}</MenuItem>
                        <MenuItem value="cashless">{t("filterBar.paymentCashless")}</MenuItem>
                    </TextField>

                    {cashlessMethods.length > 0 && onCashlessMethodChange && (
                        <TextField
                            select
                            size="small"
                            label={t("filterBar.methodLabel")}
                            value={cashlessMethodId}
                            onChange={(e) =>
                                onCashlessMethodChange(
                                    e.target.value === "all" ? "all" : Number(e.target.value),
                                )
                            }
                            sx={{ minWidth: 170 }}
                        >
                            <MenuItem value="all">{t("filterBar.methodAny")}</MenuItem>
                            {cashlessMethods.map((m) => (
                                <MenuItem key={m.id} value={m.id}>
                                    {m.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    )}

                    <TextField
                        select
                        size="small"
                        label={t("filterBar.statusLabel")}
                        value={status}
                        onChange={(e) => onStatusChange(e.target.value as SalesStatusUI)}
                        sx={{ minWidth: 150 }}
                    >
                        <MenuItem value="all">{t("filterBar.statusAny")}</MenuItem>
                        <MenuItem value="paid">{t("filterBar.statusPaid")}</MenuItem>
                        <MenuItem value="debt">{t("filterBar.statusDebt")}</MenuItem>
                    </TextField>

                    {hasActiveFilters && (
                        <Button
                            size="small"
                            onClick={onReset}
                            startIcon={<CloseOutlined fontSize="small" />}
                            sx={{ textTransform: "none" }}
                        >
                            {t("filterBar.reset")}
                        </Button>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                </Stack>
            </Stack>
        </Paper>
    );
};
