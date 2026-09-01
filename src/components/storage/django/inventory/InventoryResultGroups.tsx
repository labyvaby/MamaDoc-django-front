import React from "react";
import {
    Box,
    ButtonBase,
    Collapse,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";

import { AppButton } from "../../../ui";
import { subtleBg } from "../../../../theme/uiHelpers";
import { InventoryStatusRow } from "./InventoryStatusRow";
import {
    money,
    picksLabel,
    plural,
    qty,
    resolveStatus,
    rowDiff,
    rowDiffSum,
    statusTone,
    STATUS_HINT,
    STATUS_ICON,
    STATUS_ORDER,
    STATUS_TITLE,
    type CountRow,
    type InventoryStatus,
    type UnknownScan,
} from "./inventoryModel";

export type InventoryResultGroupsProps = {
    rows: CountRow[];
    unknownScans: UnknownScan[];
    onCreateUnknown: (barcode: string) => void;
    /** Отметить непосчитанные позиции фактом «ноль» — полку проверили, товара нет. */
    onMarkMissing: (productIds: number[]) => void;
    disabled?: boolean;
};

type Kpi = {
    status: InventoryStatus | "total";
    label: string;
    value: string;
    hint: string;
};

const toneColor = (status: InventoryStatus | "total") => (status === "total" ? null : status);

const KpiTile: React.FC<{ kpi: Kpi }> = ({ kpi }) => {
    const status = toneColor(kpi.status);
    const Icon = status ? STATUS_ICON[status] : Inventory2Outlined;
    return (
        <Box
            sx={(t) => {
                const tone = status ? statusTone(t, status) : null;
                return {
                    p: 1.75,
                    borderRadius: "12px",
                    border: 1,
                    borderColor: tone ? tone.border : "divider",
                    bgcolor: tone ? tone.tint : subtleBg(t),
                };
            }}
        >
            <Stack direction="row" alignItems="center" spacing={0.75}>
                <Icon
                    sx={(t) => ({
                        fontSize: 16,
                        color: status ? statusTone(t, status).text : t.palette.text.secondary,
                    })}
                />
                <Typography
                    variant="caption"
                    fontWeight={500}
                    sx={(t) => ({ color: status ? statusTone(t, status).text : t.palette.text.secondary })}
                >
                    {kpi.label}
                </Typography>
            </Stack>
            <Typography
                variant="h5"
                fontWeight={600}
                sx={(t) => ({
                    mt: 0.75,
                    fontVariantNumeric: "tabular-nums",
                    color: status ? statusTone(t, status).text : t.palette.text.primary,
                })}
            >
                {kpi.value}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
                {kpi.hint}
            </Typography>
        </Box>
    );
};

/**
 * Шаг 3 — итоги. Блоки идут строго от того, что требует решения, к тому, где
 * всё сошлось: неизвестные → нет в наличии → недостача → излишек → не посчитаны
 * → совпало. Цвет разряда красит весь пункт: шапку блока, подложку и числа.
 */
export const InventoryResultGroups: React.FC<InventoryResultGroupsProps> = ({
    rows,
    unknownScans,
    onCreateUnknown,
    onMarkMissing,
    disabled = false,
}) => {
    const [collapsed, setCollapsed] = React.useState<Partial<Record<InventoryStatus, boolean>>>({ ok: true, wait: true });

    const grouped = React.useMemo(() => {
        const map: Record<InventoryStatus, CountRow[]> = {
            unknown: [], none: [], short: [], over: [], ok: [], wait: [],
        };
        rows.forEach((row) => map[resolveStatus(row.expected, row.counted)].push(row));
        return map;
    }, [rows]);

    const sumOf = (status: InventoryStatus) => grouped[status].reduce((total, row) => total + rowDiffSum(row), 0);
    const totalDiff = rows.reduce((total, row) => total + rowDiffSum(row), 0);
    const unknownPicks = unknownScans.reduce((total, scan) => total + scan.picks, 0);
    const okShare = rows.length ? Math.round((grouped.ok.length / rows.length) * 100) : 0;

    const kpis: Kpi[] = [
        {
            status: "total",
            label: "Позиций в документе",
            value: String(rows.length),
            hint: `расхождение ${money(totalDiff)}`,
        },
        {
            status: "unknown",
            label: STATUS_TITLE.unknown,
            value: String(unknownScans.length),
            hint: picksLabel(unknownPicks),
        },
        { status: "none", label: STATUS_TITLE.none, value: String(grouped.none.length), hint: money(sumOf("none")) },
        { status: "short", label: STATUS_TITLE.short, value: String(grouped.short.length), hint: money(sumOf("short")) },
        { status: "over", label: STATUS_TITLE.over, value: String(grouped.over.length), hint: money(sumOf("over")) },
        {
            status: "wait",
            label: STATUS_TITLE.wait,
            value: String(grouped.wait.length),
            hint: grouped.wait.length ? "останутся без изменений" : "все полки пройдены",
        },
        { status: "ok", label: STATUS_TITLE.ok, value: String(grouped.ok.length), hint: `${okShare}% позиций` },
    ];

    const toggle = (status: InventoryStatus) =>
        setCollapsed((current) => ({ ...current, [status]: !current[status] }));

    const renderGroup = (status: InventoryStatus) => {
        const isUnknown = status === "unknown";
        const isWait = status === "wait";
        const items = grouped[status];
        const count = isUnknown ? unknownScans.length : items.length;
        if (count === 0) return null;

        const open = !collapsed[status];
        const Icon = STATUS_ICON[status];

        return (
            <Paper
                key={status}
                variant="outlined"
                sx={(t) => ({ borderColor: statusTone(t, status).border, overflow: "hidden" })}
            >
                <ButtonBase
                    onClick={() => toggle(status)}
                    aria-expanded={open}
                    sx={(t) => {
                        const tone = statusTone(t, status);
                        return {
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                            px: 1.75,
                            py: 1.5,
                            bgcolor: tone.tint,
                            borderBottom: open ? `1px solid ${tone.border}` : 0,
                            textAlign: "left",
                        };
                    }}
                >
                    <Box
                        sx={(t) => {
                            const tone = statusTone(t, status);
                            return {
                                width: 34,
                                height: 34,
                                flexShrink: 0,
                                borderRadius: "10px",
                                display: "grid",
                                placeItems: "center",
                                bgcolor: tone.main,
                                color: tone.contrast,
                                "& .MuiSvgIcon-root": { fontSize: 19 },
                            };
                        }}
                    >
                        <Icon />
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                            variant="subtitle2"
                            fontWeight={600}
                            sx={(t) => ({ color: statusTone(t, status).text })}
                        >
                            {STATUS_TITLE[status]}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                            {STATUS_HINT[status]}
                        </Typography>
                    </Box>

                    <Box
                        sx={(t) => {
                            const tone = statusTone(t, status);
                            return {
                                minWidth: 28,
                                height: 24,
                                px: 1,
                                borderRadius: "8px",
                                display: "grid",
                                placeItems: "center",
                                bgcolor: tone.main,
                                color: tone.contrast,
                                fontSize: ".75rem",
                                fontWeight: 600,
                                fontVariantNumeric: "tabular-nums",
                            };
                        }}
                    >
                        {count}
                    </Box>
                    <ExpandMoreOutlined
                        sx={(t) => ({
                            color: statusTone(t, status).text,
                            transform: open ? "none" : "rotate(-90deg)",
                            transition: "transform .2s ease",
                        })}
                    />
                </ButtonBase>

                <Collapse in={open} unmountOnExit>
                    <Box sx={{ display: "flex", flexDirection: "column" }}>
                        {isUnknown
                            ? unknownScans.map((scan) => (
                                <InventoryStatusRow
                                    key={scan.barcode}
                                    status="unknown"
                                    title={
                                        <Typography variant="body2" fontWeight={600} sx={{ fontFamily: "monospace" }}>
                                            {scan.barcode}
                                        </Typography>
                                    }
                                    meta={
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            {picksLabel(scan.picks)} · нет в базе
                                        </Typography>
                                    }
                                    actions={
                                        <AppButton
                                            variant="outlined"
                                            size="small"
                                            startIcon={<AddOutlined />}
                                            onClick={() => onCreateUnknown(scan.barcode)}
                                            disabled={disabled}
                                            sx={{ flexShrink: 0 }}
                                        >
                                            Создать товар
                                        </AppButton>
                                    }
                                />
                            ))
                            : items.map((row) => {
                                const diff = rowDiff(row);
                                return (
                                    <InventoryStatusRow
                                        key={row.productId}
                                        status={status}
                                        plain={isWait}
                                        title={
                                            <Typography variant="body2" fontWeight={500} sx={{ lineHeight: 1.3 }}>
                                                {row.name}
                                            </Typography>
                                        }
                                        meta={
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                <Box component="span" sx={{ fontFamily: "monospace" }}>
                                                    {row.barcode || "без штрихкода"}
                                                </Box>
                                                {row.category ? ` · ${row.category}` : ""}
                                                {` · ${money(row.price)} / ${row.unit}`}
                                            </Typography>
                                        }
                                        right={
                                            <Stack direction="row" spacing={2} sx={{ flexShrink: 0 }}>
                                                <Box sx={{ textAlign: "right", minWidth: 64 }}>
                                                    <Typography
                                                        variant="subtitle2"
                                                        fontWeight={600}
                                                        sx={(t) => ({
                                                            color: statusTone(t, status).text,
                                                            fontVariantNumeric: "tabular-nums",
                                                            lineHeight: 1.2,
                                                        })}
                                                    >
                                                        {row.counted == null ? "—" : qty(row.counted)}
                                                    </Typography>
                                                    <Typography
                                                        variant="caption"
                                                        color="text.secondary"
                                                        sx={{ fontVariantNumeric: "tabular-nums", display: "block" }}
                                                    >
                                                        из {qty(row.expected)} {row.unit}
                                                    </Typography>
                                                </Box>
                                                <Box sx={{ textAlign: "right", minWidth: 76 }}>
                                                    <Typography
                                                        variant="subtitle2"
                                                        fontWeight={600}
                                                        sx={(t) => ({
                                                            color: statusTone(t, status).text,
                                                            fontVariantNumeric: "tabular-nums",
                                                            lineHeight: 1.2,
                                                        })}
                                                    >
                                                        {row.counted == null || diff === 0
                                                            ? ""
                                                            : `${diff > 0 ? "+" : "−"}${qty(Math.abs(diff))}`}
                                                    </Typography>
                                                    <Typography
                                                        variant="caption"
                                                        color="text.secondary"
                                                        sx={{ fontVariantNumeric: "tabular-nums", display: "block" }}
                                                    >
                                                        {row.counted == null
                                                            ? "не пикнут"
                                                            : diff === 0
                                                                ? "сошлось"
                                                                : money(rowDiffSum(row))}
                                                    </Typography>
                                                </Box>
                                            </Stack>
                                        }
                                    />
                                );
                            })}

                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            flexWrap="wrap"
                            useFlexGap
                            spacing={1}
                            sx={(t) => ({
                                px: 1.75,
                                py: 1.25,
                                borderTop: 1,
                                borderColor: "divider",
                                bgcolor: subtleBg(t),
                            })}
                        >
                            <Typography variant="caption" color="text.secondary">
                                {isUnknown
                                    ? "Решение по каждому штрихкоду нужно принять до проведения"
                                    : isWait
                                        ? "Если полки проверены и товара нет — отметьте факт нулём"
                                        : status === "over"
                                            ? "Приход по излишкам"
                                            : status === "ok"
                                                ? "Расхождений нет"
                                                : "Списание по расхождению"}
                            </Typography>

                            {isWait ? (
                                <AppButton
                                    variant="outlined"
                                    size="small"
                                    onClick={() => onMarkMissing(items.map((row) => row.productId))}
                                    disabled={disabled}
                                >
                                    Отметить отсутствующими
                                </AppButton>
                            ) : (
                                <Typography
                                    variant="body2"
                                    fontWeight={600}
                                    sx={(t) => ({
                                        color: statusTone(t, status).text,
                                        fontVariantNumeric: "tabular-nums",
                                    })}
                                >
                                    {isUnknown
                                        ? `${count} ${plural(count, "штрихкод", "штрихкода", "штрихкодов")}`
                                        : status === "ok"
                                            ? `${count} ${plural(count, "позиция", "позиции", "позиций")}`
                                            : money(sumOf(status))}
                                </Typography>
                            )}
                        </Stack>
                    </Box>
                </Collapse>
            </Paper>
        );
    };

    return (
        <Stack spacing={2}>
            <Box
                sx={{
                    display: "grid",
                    gap: 1.25,
                    gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(auto-fit, minmax(160px, 1fr))" },
                }}
            >
                {kpis.map((kpi) => (
                    <KpiTile key={`${kpi.status}-${kpi.label}`} kpi={kpi} />
                ))}
            </Box>

            {STATUS_ORDER.map(renderGroup)}
        </Stack>
    );
};

export default InventoryResultGroups;
