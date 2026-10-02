import React from "react";
import {
    Box,
    ButtonBase,
    IconButton,
    InputAdornment,
    InputBase,
    LinearProgress,
    Stack,
    TextField,
    Typography,
    useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import DoneAllOutlined from "@mui/icons-material/DoneAllOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import ClearOutlined from "@mui/icons-material/ClearOutlined";

import { AppButton, AppCard } from "../../../ui";
import {
    positionsLabel,
    qty,
    resolveStatus,
    statusTone,
    type CountRow,
    type InventoryStatus,
} from "./inventoryModel";

type Filter = "all" | "wait" | "diff" | "ok";

export type InventoryShowcasePanelProps = {
    rows: CountRow[];
    elapsed: string;
    /** «На месте»: факт = учёт в эту секунду (одна позиция или список). */
    onConfirm: (productIds: number[]) => void;
    /** Все ещё не проверенные — «на месте». */
    onConfirmRest: () => void;
    /** Сотрудник поправил факт по позиции. */
    onSetCounted: (productId: number, value: number) => void;
    disabled?: boolean;
};

const STATE_LABEL: Record<InventoryStatus, string> = {
    ok: "На месте",
    none: "Нет на витрине",
    short: "Меньше",
    over: "Больше",
    wait: "Не проверено",
    unknown: "",
};

const matches = (row: CountRow, term: string) => {
    if (!term) return true;
    const needle = term.toLocaleLowerCase();
    return (
        row.name.toLocaleLowerCase().includes(needle)
        || row.category.toLocaleLowerCase().includes(needle)
        || row.barcode === term
        || row.barcodes.includes(term)
    );
};

/** Поле количества: − [число] +, ввод руками тоже работает. */
const QuantityStepper: React.FC<{
    value: number | null;
    placeholder: number;
    unit: string;
    disabled?: boolean;
    onChange: (value: number) => void;
}> = ({ value, placeholder, unit, disabled, onChange }) => {
    const [draft, setDraft] = React.useState(value == null ? "" : qty(value));
    React.useEffect(() => setDraft(value == null ? "" : qty(value)), [value]);
    const commit = (raw: string) => {
        if (raw.trim() === "") return;
        const parsed = Number(raw.replace(",", "."));
        if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed);
        else setDraft(value == null ? "" : qty(value));
    };
    const base = value ?? placeholder;
    return (
        <Stack
            direction="row"
            alignItems="center"
            sx={(t) => ({
                height: 36,
                flexShrink: 0,
                width: "fit-content",
                border: `1px solid ${t.palette.divider}`,
                borderRadius: 1.5,
                bgcolor: "background.paper",
                "& .MuiIconButton-root": { width: { xs: 28, md: 32 }, height: 32 },
            })}
        >
            <IconButton size="small" disabled={disabled || base <= 0} onClick={() => onChange(Math.max(0, base - 1))} aria-label="Меньше">
                <RemoveOutlined fontSize="small" />
            </IconButton>
            <InputBase
                value={draft}
                placeholder={qty(placeholder)}
                disabled={disabled}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={(event) => commit(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
                inputProps={{ inputMode: "decimal", "aria-label": `Факт, ${unit}`, style: { textAlign: "center", padding: 0 } }}
                sx={{ width: { xs: 40, md: 52 }, flexShrink: 0, fontSize: 15, fontWeight: 700 }}
            />
            <IconButton size="small" disabled={disabled} onClick={() => onChange(base + 1)} aria-label="Больше">
                <AddOutlined fontSize="small" />
            </IconButton>
        </Stack>
    );
};

const ShowcaseRow: React.FC<{
    row: CountRow;
    disabled?: boolean;
    onConfirm: () => void;
    onSetCounted: (value: number) => void;
}> = ({ row, disabled, onConfirm, onSetCounted }) => {
    const theme = useTheme();
    const status = resolveStatus(row.expected, row.counted);
    const tone = statusTone(theme, status);
    const diff = row.counted == null ? 0 : row.counted - row.expected;
    const checked = row.counted != null;

    return (
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: { xs: "auto minmax(0, 1fr)", md: "minmax(0, 1fr) 96px 132px 220px" },
                gridTemplateAreas: {
                    xs: `"info info" "stepper actions"`,
                    md: `"info ledger stepper actions"`,
                },
                alignItems: "center",
                columnGap: 1.5,
                rowGap: 1,
                px: 1.5,
                py: 1.25,
                borderBottom: `1px solid ${theme.palette.divider}`,
                borderLeft: `3px solid ${checked ? tone.main : "transparent"}`,
                bgcolor: checked && status !== "ok" ? tone.tint : "transparent",
            }}
        >
            <Box sx={{ gridArea: "info", minWidth: 0 }}>
                <Typography variant="body2" fontWeight={700} noWrap title={row.name}>{row.name}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                    {[row.category, row.barcode].filter(Boolean).join(" · ") || " "}
                </Typography>
                <Typography variant="caption" component="div" sx={{ display: { md: "none" }, color: "text.secondary" }}>
                    По учёту: <b>{qty(row.expected)} {row.unit}</b>
                </Typography>
            </Box>

            <Box sx={{ gridArea: "ledger", display: { xs: "none", md: "block" }, textAlign: "right" }}>
                <Typography variant="body2" fontWeight={800}>{qty(row.expected)}</Typography>
                <Typography variant="caption" color="text.secondary">{row.unit} по учёту</Typography>
            </Box>

            <Box sx={{ gridArea: "stepper", justifySelf: { md: "center" } }}>
                <QuantityStepper
                    value={row.counted}
                    placeholder={row.expected}
                    unit={row.unit}
                    disabled={disabled}
                    onChange={onSetCounted}
                />
            </Box>

            <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                justifyContent="flex-end"
                sx={{ gridArea: "actions", minWidth: 0, "& .MuiButton-root": { minWidth: 0, px: { xs: 1, md: 1.25 } } }}
            >
                {checked ? (
                    <Box
                        sx={{
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            bgcolor: status === "ok" ? tone.tint : "transparent",
                            color: tone.text,
                            border: `1px solid ${tone.border}`,
                            fontSize: 12,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {STATE_LABEL[status]}
                        {diff !== 0 && status !== "none" ? ` ${diff > 0 ? "+" : "−"}${qty(Math.abs(diff))}` : ""}
                    </Box>
                ) : null}
                {(!checked || status !== "ok") && (
                    <AppButton
                        size="small"
                        variant={checked ? "text" : "outlined"}
                        startIcon={<CheckOutlined />}
                        onClick={onConfirm}
                        disabled={disabled}
                        sx={{ whiteSpace: "nowrap" }}
                    >
                        На месте
                    </AppButton>
                )}
                {!checked && (
                    <AppButton size="small" variant="text" color="error" onClick={() => onSetCounted(0)} disabled={disabled}>
                        Нет
                    </AppButton>
                )}
            </Stack>
        </Box>
    );
};

/**
 * Витринная («обратная») инвентаризация: список того, что по учёту должно
 * быть на витрине. Сотрудник отмечает «на месте» или правит количество;
 * «Все остальные на месте» закрывает хвост одним нажатием.
 */
export const InventoryShowcasePanel: React.FC<InventoryShowcasePanelProps> = ({
    rows,
    elapsed,
    onConfirm,
    onConfirmRest,
    onSetCounted,
    disabled = false,
}) => {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down("md"));
    const [filter, setFilter] = React.useState<Filter>("all");
    const [search, setSearch] = React.useState("");
    const term = search.trim();

    const stats = React.useMemo(() => {
        let ok = 0;
        let diff = 0;
        for (const row of rows) {
            if (row.counted == null) continue;
            if (resolveStatus(row.expected, row.counted) === "ok") ok += 1;
            else diff += 1;
        }
        return { ok, diff, wait: rows.length - ok - diff };
    }, [rows]);

    const visible = rows.filter((row) => {
        if (!matches(row, term)) return false;
        const status = resolveStatus(row.expected, row.counted);
        if (filter === "wait") return row.counted == null;
        if (filter === "ok") return row.counted != null && status === "ok";
        if (filter === "diff") return row.counted != null && status !== "ok";
        return true;
    });
    const checkedShare = rows.length ? ((stats.ok + stats.diff) / rows.length) * 100 : 0;

    const filters: Array<{ key: Filter; label: string; count: number }> = [
        { key: "all", label: "Все", count: rows.length },
        { key: "wait", label: "Не проверены", count: stats.wait },
        { key: "diff", label: "Расхождения", count: stats.diff },
        { key: "ok", label: "На месте", count: stats.ok },
    ];

    return (
        <AppCard
            title="Проверка витрины"
            subheader="Идите по списку: отметьте «на месте» или поправьте количество. Продажи не блокируются."
        >
            <Stack spacing={1.5}>
                <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
                        <Typography variant="body2" fontWeight={700}>
                            Проверено {stats.ok + stats.diff} из {rows.length}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">{elapsed}</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={checkedShare} sx={{ height: 6, borderRadius: 3 }} />
                </Box>

                <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems={{ md: "center" }}>
                    <TextField
                        size="small"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Найти товар: название или штрихкод"
                        sx={{ flex: 1 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment>
                            ),
                            endAdornment: search ? (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setSearch("")} aria-label="Очистить поиск">
                                        <ClearOutlined fontSize="small" />
                                    </IconButton>
                                </InputAdornment>
                            ) : undefined,
                        }}
                    />
                    <AppButton
                        variant="contained"
                        startIcon={<DoneAllOutlined />}
                        onClick={onConfirmRest}
                        disabled={disabled || stats.wait === 0}
                        sx={{ whiteSpace: "nowrap" }}
                    >
                        {phone ? "Остальные на месте" : `Все остальные на месте (${stats.wait})`}
                    </AppButton>
                </Stack>

                <Stack direction="row" spacing={0.75} sx={{ overflowX: "auto", pb: 0.25 }}>
                    {filters.map((item) => {
                        const active = item.key === filter;
                        return (
                            <ButtonBase
                                key={item.key}
                                onClick={() => setFilter(item.key)}
                                sx={(t) => ({
                                    px: 1.25,
                                    py: 0.6,
                                    borderRadius: 999,
                                    flexShrink: 0,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    border: `1px solid ${active ? t.palette.primary.main : t.palette.divider}`,
                                    color: active ? t.palette.primary.main : t.palette.text.secondary,
                                    bgcolor: active ? t.palette.action.selected : "transparent",
                                })}
                            >
                                {item.label}
                                <Box component="span" sx={{ ml: 0.75, opacity: 0.75 }}>{item.count}</Box>
                            </ButtonBase>
                        );
                    })}
                </Stack>

                <Box sx={(t) => ({ border: `1px solid ${t.palette.divider}`, borderRadius: 2, overflow: "hidden" })}>
                    {visible.map((row) => (
                        <ShowcaseRow
                            key={row.productId}
                            row={row}
                            disabled={disabled}
                            onConfirm={() => onConfirm([row.productId])}
                            onSetCounted={(value) => onSetCounted(row.productId, value)}
                        />
                    ))}
                    {visible.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
                            {term
                                ? "Ничего не найдено — проверьте название или штрихкод."
                                : filter === "wait"
                                    ? "Все позиции проверены."
                                    : "Здесь пока пусто."}
                        </Typography>
                    )}
                </Box>

                {stats.diff > 0 && (
                    <Typography variant="caption" color="text.secondary">
                        {positionsLabel(stats.diff)} с расхождением: при проведении недостача спишется расходом, излишек —
                        приходом.
                    </Typography>
                )}
            </Stack>
        </AppCard>
    );
};
