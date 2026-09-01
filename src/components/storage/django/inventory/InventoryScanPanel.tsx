import React from "react";
import {
    Box,
    Chip,
    InputAdornment,
    LinearProgress,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion, useReducedMotion } from "framer-motion";
import QrCodeScannerOutlined from "@mui/icons-material/QrCodeScannerOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import TimerOutlined from "@mui/icons-material/TimerOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";

import { AppButton, AppCard, SegmentedTabs, type SegmentedTab } from "../../../ui";
import { subtleBg } from "../../../../theme/uiHelpers";
import { InventoryStatusRow } from "./InventoryStatusRow";
import {
    picksLabel,
    plural,
    qty,
    resolveStatus,
    statusTone,
    STATUS_ICON,
    type CountRow,
    type InventoryStatus,
    type UnknownScan,
} from "./inventoryModel";

/** Последний пик — то, что показывает крупная карточка обратной связи. */
export type LastScan =
    | { kind: "item"; productId: number; first: boolean; nonce: number }
    | { kind: "unknown"; barcode: string; nonce: number }
    | null;

type FeedFilter = "feed" | "left" | "unknown";

export type InventoryScanPanelProps = {
    rows: CountRow[];
    /** productId в порядке последнего пика — свежие сверху. */
    order: number[];
    unknownScans: UnknownScan[];
    lastScan: LastScan;
    picks: number;
    /** Время с начала пересчёта, «мм:сс». */
    elapsed: string;
    onScan: (barcode: string) => void;
    onAdjust: (productId: number, delta: number) => void;
    onZero: (productId: number) => void;
    onCreateUnknown: (barcode: string) => void;
    disabled?: boolean;
};

/** Сколько строк «Осталось» рисуем без виртуализации. */
const LEFT_LIMIT = 200;

const QuantityCell: React.FC<{ status: InventoryStatus; counted: number | null; expected: number; unit: string }> = ({
    status,
    counted,
    expected,
    unit,
}) => (
    <Box sx={{ textAlign: "right", minWidth: 64 }}>
        <Typography
            variant="subtitle2"
            fontWeight={600}
            sx={(t) => ({ color: statusTone(t, status).text, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 })}
        >
            {counted == null ? "—" : qty(counted)}
        </Typography>
        <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontVariantNumeric: "tabular-nums", display: "block" }}
        >
            из {qty(expected)} {unit}
        </Typography>
    </Box>
);

const Stepper: React.FC<{ onMinus: () => void; onPlus: () => void; disabled?: boolean }> = ({
    onMinus,
    onPlus,
    disabled,
}) => (
    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
        <AppButton
            variant="outlined"
            onClick={onMinus}
            disabled={disabled}
            aria-label="Убрать одну единицу"
            sx={{ minWidth: 36, width: 36, minHeight: 36, height: 36, p: 0, borderRadius: "8px" }}
        >
            <RemoveOutlined sx={{ fontSize: 16 }} />
        </AppButton>
        <AppButton
            variant="outlined"
            onClick={onPlus}
            disabled={disabled}
            aria-label="Добавить одну единицу"
            sx={{ minWidth: 36, width: 36, minHeight: 36, height: 36, p: 0, borderRadius: "8px" }}
        >
            <AddOutlined sx={{ fontSize: 16 }} />
        </AppButton>
    </Stack>
);

/**
 * Шаг 2 — пересчёт сканером. Крупная карточка последнего пика читается с
 * расстояния: кладовщик смотрит на экран, а не в список. Ввод сканера ловится
 * с любого места страницы — пистолет печатает «в никуда» и жмёт Enter.
 */
export const InventoryScanPanel: React.FC<InventoryScanPanelProps> = ({
    rows,
    order,
    unknownScans,
    lastScan,
    picks,
    elapsed,
    onScan,
    onAdjust,
    onZero,
    onCreateUnknown,
    disabled = false,
}) => {
    const reduceMotion = useReducedMotion();
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [code, setCode] = React.useState("");
    const [filter, setFilter] = React.useState<FeedFilter>("feed");
    const [search, setSearch] = React.useState("");

    const byId = React.useMemo(() => new Map(rows.map((row) => [row.productId, row])), [rows]);
    const countedRows = React.useMemo(() => rows.filter((row) => row.counted != null), [rows]);
    const leftRows = React.useMemo(() => rows.filter((row) => row.counted == null), [rows]);
    const unknownPicks = React.useMemo(
        () => unknownScans.reduce((sum, scan) => sum + scan.picks, 0),
        [unknownScans],
    );

    // Фокус держим на поле ввода: пистолет печатает туда, куда смотрит курсор.
    React.useEffect(() => {
        if (!disabled) inputRef.current?.focus({ preventScroll: true });
    }, [disabled, lastScan]);

    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (disabled || event.ctrlKey || event.altKey || event.metaKey) return;
            const target = event.target as HTMLElement | null;
            const tag = target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
            if (!/^[0-9]$/.test(event.key)) return;
            const field = inputRef.current;
            if (!field) return;
            field.focus({ preventScroll: true });
            setCode((current) => current + event.key);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [disabled]);

    const submit = () => {
        const value = code.trim();
        if (!value) return;
        onScan(value);
        setCode("");
    };

    const filtered = React.useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        const match = (row: CountRow) =>
            !query
            || row.name.toLocaleLowerCase().includes(query)
            || row.barcode.toLocaleLowerCase().includes(query);
        if (filter === "left") return leftRows.filter(match).slice(0, LEFT_LIMIT);
        return order
            .map((id) => byId.get(id))
            .filter((row): row is CountRow => row != null && match(row));
    }, [byId, filter, leftRows, order, search]);

    const tabs: SegmentedTab<FeedFilter>[] = [
        { key: "feed", label: "Пикнутые", badge: countedRows.length },
        { key: "left", label: "Осталось", badge: leftRows.length },
        { key: "unknown", label: "Неизвестные", badge: unknownScans.length },
    ];

    const progress = rows.length ? (countedRows.length / rows.length) * 100 : 0;

    const renderHero = () => {
        if (!lastScan) {
            return (
                <Box
                    sx={(t) => ({
                        display: "flex",
                        gap: 1.75,
                        p: 1.75,
                        borderRadius: "12px",
                        border: `1px dashed ${t.palette.divider}`,
                        bgcolor: subtleBg(t),
                    })}
                >
                    <Box
                        sx={(t) => ({
                            width: 44,
                            height: 44,
                            flexShrink: 0,
                            borderRadius: "12px",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: subtleBg(t, true),
                            color: "text.disabled",
                        })}
                    >
                        <QrCodeScannerOutlined />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={500} color="text.secondary">
                            Ждём первый пик
                        </Typography>
                        <Typography variant="caption" color="text.disabled" display="block">
                            Наведите сканер на штрихкод товара
                        </Typography>
                    </Box>
                </Box>
            );
        }

        const status: InventoryStatus = lastScan.kind === "unknown"
            ? "unknown"
            : (() => {
                const row = byId.get(lastScan.productId);
                return row ? resolveStatus(row.expected, row.counted) : "ok";
            })();
        const Icon = STATUS_ICON[status];
        const row = lastScan.kind === "item" ? byId.get(lastScan.productId) : undefined;
        const scan = lastScan.kind === "unknown"
            ? unknownScans.find((item) => item.barcode === lastScan.barcode)
            : undefined;

        return (
            <motion.div
                key={lastScan.nonce}
                initial={reduceMotion ? undefined : { scale: 0.985, opacity: 0.9 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
                <Box
                    sx={(t) => {
                        const tone = statusTone(t, status);
                        return {
                            display: "flex",
                            gap: 1.75,
                            p: 1.75,
                            borderRadius: "12px",
                            border: `1px solid ${tone.border}`,
                            bgcolor: tone.tint,
                        };
                    }}
                >
                    <Box
                        sx={(t) => {
                            const tone = statusTone(t, status);
                            return {
                                width: 44,
                                height: 44,
                                flexShrink: 0,
                                borderRadius: "12px",
                                display: "grid",
                                placeItems: "center",
                                bgcolor: tone.main,
                                color: tone.contrast,
                                "& .MuiSvgIcon-root": { fontSize: 24 },
                            };
                        }}
                    >
                        <Icon />
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                            variant="caption"
                            fontWeight={600}
                            sx={(t) => ({
                                color: statusTone(t, status).text,
                                textTransform: "uppercase",
                                letterSpacing: ".05em",
                                display: "block",
                            })}
                        >
                            {lastScan.kind === "unknown"
                                ? "Товар не найден"
                                : lastScan.first ? "Позиция засчитана" : "Повторный пик · +1"}
                        </Typography>

                        {lastScan.kind === "unknown" ? (
                            <>
                                <Typography
                                    variant="h6"
                                    sx={{ fontFamily: "monospace", letterSpacing: ".02em", mt: 0.25 }}
                                >
                                    {lastScan.barcode}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                                    Такого штрихкода нет в базе — решим на итогах
                                </Typography>
                                <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 1 }}>
                                    <Typography
                                        variant="h4"
                                        fontWeight={600}
                                        sx={(t) => ({ color: statusTone(t, status).text, lineHeight: 1 })}
                                    >
                                        {scan?.picks ?? 1}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {plural(scan?.picks ?? 1, "пик", "пика", "пиков")}
                                    </Typography>
                                </Stack>
                                <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} flexWrap="wrap" useFlexGap>
                                    <AppButton
                                        variant="contained"
                                        size="small"
                                        startIcon={<AddOutlined />}
                                        onClick={() => onCreateUnknown(lastScan.barcode)}
                                    >
                                        Создать товар
                                    </AppButton>
                                </Stack>
                            </>
                        ) : row ? (
                            <>
                                <Typography variant="h6" sx={{ mt: 0.25, lineHeight: 1.25 }}>
                                    {row.name}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    display="block"
                                    sx={{ fontFamily: "monospace", mt: 0.25 }}
                                >
                                    {row.barcode}
                                </Typography>
                                <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 1 }}>
                                    <Typography
                                        variant="h4"
                                        fontWeight={600}
                                        sx={(t) => ({ color: statusTone(t, status).text, lineHeight: 1 })}
                                    >
                                        {qty(row.counted ?? 0)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {row.unit} ·{" "}
                                        {status === "over"
                                            ? `больше ожидаемого на ${qty((row.counted ?? 0) - row.expected)}`
                                            : status === "ok"
                                                ? "сошлось"
                                                : `ожидалось ${qty(row.expected)} ${row.unit}`}
                                    </Typography>
                                </Stack>
                                <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} flexWrap="wrap" useFlexGap>
                                    <AppButton
                                        variant="outlined"
                                        size="small"
                                        startIcon={<RemoveOutlined />}
                                        onClick={() => onAdjust(row.productId, -1)}
                                    >
                                        Убрать 1
                                    </AppButton>
                                    <AppButton variant="text" size="small" onClick={() => onZero(row.productId)}>
                                        Обнулить
                                    </AppButton>
                                </Stack>
                            </>
                        ) : null}
                    </Box>
                </Box>
            </motion.div>
        );
    };

    return (
        <Box
            sx={{
                display: "grid",
                gap: 2,
                alignItems: "start",
                gridTemplateColumns: { xs: "1fr", lg: "400px minmax(0, 1fr)" },
            }}
        >
            <Box
                sx={(t) => ({
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    [t.breakpoints.up("lg")]: {
                        position: "sticky",
                        top: t.appLayout.header.height.desktop + 16,
                    },
                })}
            >
                <AppCard>
                    <Stack spacing={1.5}>
                        <Box>
                            <Stack direction="row" alignItems="baseline" spacing={1}>
                                <Typography variant="h5" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
                                    {countedRows.length}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    из {rows.length} {plural(rows.length, "позиции", "позиций", "позиций")}
                                </Typography>
                            </Stack>
                            <LinearProgress
                                variant="determinate"
                                value={progress}
                                sx={{ mt: 1, height: 6, borderRadius: 4 }}
                            />
                        </Box>

                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            <Chip size="small" icon={<QrCodeScannerOutlined />} label={picksLabel(picks)} />
                            <Chip size="small" icon={<TimerOutlined />} label={elapsed} />
                            {unknownScans.length > 0 && (
                                <Chip
                                    size="small"
                                    label={`неизвестных: ${unknownPicks}`}
                                    sx={(t) => {
                                        const tone = statusTone(t, "unknown");
                                        return { bgcolor: tone.tint, color: tone.text, border: `1px solid ${tone.border}` };
                                    }}
                                />
                            )}
                        </Stack>

                        <Box
                            sx={(t) => ({
                                p: 1.5,
                                borderRadius: "12px",
                                border: `1px solid ${alpha(t.palette.primary.main, 0.3)}`,
                                bgcolor: t.palette.primary.lighter,
                            })}
                        >
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                                <motion.span
                                    animate={reduceMotion ? undefined : { opacity: [1, 0.35, 1] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                    style={{ display: "inline-flex" }}
                                >
                                    <Box
                                        sx={(t) => ({
                                            width: 7,
                                            height: 7,
                                            borderRadius: "50%",
                                            bgcolor: t.palette.success.main,
                                        })}
                                    />
                                </motion.span>
                                <Typography variant="caption" fontWeight={500} color="primary.onSurface">
                                    Сканер активен — просто пикайте товар
                                </Typography>
                            </Stack>

                            <TextField
                                inputRef={inputRef}
                                value={code}
                                onChange={(event) => setCode(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key !== "Enter") return;
                                    event.preventDefault();
                                    submit();
                                }}
                                placeholder="Штрихкод"
                                autoComplete="off"
                                inputMode="numeric"
                                disabled={disabled}
                                fullWidth
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <QrCodeScannerOutlined fontSize="small" />
                                        </InputAdornment>
                                    ),
                                    sx: {
                                        minHeight: 52,
                                        bgcolor: "background.paper",
                                        fontFamily: "monospace",
                                        fontSize: "1.05rem",
                                        fontWeight: 600,
                                        letterSpacing: ".02em",
                                    },
                                }}
                            />
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                display="block"
                                sx={{ mt: 1, lineHeight: 1.5 }}
                            >
                                Ввод с клавиатуры ловится с любого места страницы. Один пик — позиция засчитана,
                                повторный — плюс единица.
                            </Typography>
                        </Box>

                        {renderHero()}
                    </Stack>
                </AppCard>
            </Box>

            <AppCard disableContentPadding>
                <Box sx={{ p: 2, pb: 1.5 }}>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <SegmentedTabs<FeedFilter>
                                tabs={tabs}
                                value={filter}
                                onChange={setFilter}
                                layoutId="inventory-scan-feed"
                            />
                        </Box>
                        {filter !== "unknown" && (
                            <TextField
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Поиск по названию"
                                sx={{ width: { xs: "100%", md: 220 } }}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchOutlined fontSize="small" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        )}
                    </Stack>
                </Box>

                <Box sx={{ display: "flex", flexDirection: "column" }}>
                    {filter === "unknown" ? (
                        unknownScans.length === 0 ? (
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ px: 2, py: 4, textAlign: "center" }}
                            >
                                Неизвестных штрихкодов пока нет
                            </Typography>
                        ) : (
                            unknownScans.map((scan) => (
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
                                        <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
                                            <AppButton
                                                variant="outlined"
                                                size="small"
                                                startIcon={<AddOutlined />}
                                                onClick={() => onCreateUnknown(scan.barcode)}
                                            >
                                                Создать
                                            </AppButton>
                                        </Stack>
                                    }
                                />
                            ))
                        )
                    ) : filtered.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 4, textAlign: "center" }}>
                            {filter === "left" ? "Все позиции пикнуты" : "Пикните первый товар — он появится здесь"}
                        </Typography>
                    ) : (
                        filtered.map((row) => {
                            const status = filter === "left" ? "wait" : resolveStatus(row.expected, row.counted);
                            return (
                                <InventoryStatusRow
                                    key={row.productId}
                                    status={status}
                                    plain={filter === "left"}
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
                                        </Typography>
                                    }
                                    right={
                                        <QuantityCell
                                            status={status}
                                            counted={row.counted}
                                            expected={row.expected}
                                            unit={row.unit}
                                        />
                                    }
                                    actions={
                                        <Stepper
                                            disabled={disabled}
                                            onMinus={() => onAdjust(row.productId, -1)}
                                            onPlus={() => onAdjust(row.productId, 1)}
                                        />
                                    }
                                />
                            );
                        })
                    )}

                    {filter === "left" && leftRows.length > LEFT_LIMIT && (
                        <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
                            Показаны первые {LEFT_LIMIT} из {leftRows.length} — уточните поиск.
                        </Typography>
                    )}
                </Box>
            </AppCard>
        </Box>
    );
};

export default InventoryScanPanel;
