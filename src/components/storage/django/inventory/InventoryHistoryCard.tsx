import React from "react";
import {
    Box,
    IconButton,
    LinearProgress,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import CheckCircleOutlineOutlined from "@mui/icons-material/CheckCircleOutlineOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";

import { AppButton, AppCard, ListEmptyState, ListLoadingSkeleton } from "../../../ui";
import { subtleBg } from "../../../../theme/uiHelpers";
import { formatDateRu } from "../../../../utility/format";
import type { WarehouseInventoryCount } from "../../../../api/warehouse";
import { plural } from "./inventoryModel";

export type InventoryHistoryCardProps = {
    items: WarehouseInventoryCount[];
    loading?: boolean;
    /** Продолжить незакрытый пересчёт: документ уже открыт, строки в нём. */
    onContinue: (id: number) => void;
    /** Открыть итоги документа. */
    onOpen: (id: number) => void;
    /** Отменить незакрытый пересчёт: закрывается без проведения разниц. */
    onCancel: (id: number) => void;
    onRefresh?: () => void;
    disabled?: boolean;
};

type StatusKey = "counting" | "done" | "canceled";

const STATUS_META: Record<StatusKey, { label: string; icon: React.ComponentType<SvgIconProps> }> = {
    counting: { label: "Идёт подсчёт", icon: FactCheckOutlined },
    done: { label: "Проведена", icon: CheckCircleOutlineOutlined },
    canceled: { label: "Отменена", icon: BlockOutlined },
};

const statusKey = (status: string): StatusKey =>
    status === "counting" || status === "done" || status === "canceled" ? status : "canceled";

/** Тон строки истории берём из палитры темы, как и у разрядов расхождения. */
const toneOf = (theme: Theme, status: StatusKey) => {
    if (status === "counting") {
        return {
            main: theme.palette.primary.main,
            text: theme.palette.primary.onSurface,
            tint: theme.palette.primary.lighter,
            border: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.42 : 0.3),
            contrast: theme.palette.primary.contrastText,
        };
    }
    if (status === "done") {
        return {
            main: theme.palette.success.main,
            text: theme.palette.success.onSurface,
            tint: theme.palette.success.lighter,
            border: alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.42 : 0.3),
            contrast: theme.palette.success.contrastText,
        };
    }
    return {
        main: theme.palette.text.disabled,
        text: theme.palette.text.secondary,
        tint: subtleBg(theme),
        border: theme.palette.divider,
        contrast: theme.palette.background.paper,
    };
};

const timeOf = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

/**
 * История пересчётов по складу. Главное здесь — незакрытый документ: ушли со
 * страницы и вернулись, а пересчёт продолжается ровно с того же места. Такая
 * строка подсвечена и вынесена наверх списка (бэк отдаёт документы новыми
 * первыми, а открытый по складу может быть только один).
 */
export const InventoryHistoryCard: React.FC<InventoryHistoryCardProps> = ({
    items,
    loading = false,
    onContinue,
    onOpen,
    onCancel,
    onRefresh,
    disabled = false,
}) => {
    const sorted = React.useMemo(() => {
        const weight = (item: WarehouseInventoryCount) => (item.status === "counting" ? 0 : 1);
        return [...items].sort((a, b) => weight(a) - weight(b));
    }, [items]);

    return (
        <AppCard
            title="Последние инвентаризации"
            subheader="Незакрытый пересчёт можно продолжить с того места, где остановились"
            headerActions={onRefresh && (
                <Tooltip title="Обновить список">
                    <IconButton onClick={onRefresh} disabled={disabled || loading}>
                        <RefreshOutlined />
                    </IconButton>
                </Tooltip>
            )}
            disableContentPadding
        >
            {loading && items.length === 0 && <ListLoadingSkeleton rows={2} />}

            {!loading && items.length === 0 && (
                <ListEmptyState
                    icon={<HistoryOutlined />}
                    title="Инвентаризаций по этому складу ещё не было"
                    description="Выберите категории выше и нажмите «Начать инвентаризацию» — документ появится здесь."
                />
            )}

            <Box sx={{ display: "flex", flexDirection: "column" }}>
                {sorted.map((item) => {
                    const key = statusKey(item.status);
                    const open = key === "counting";
                    const Icon = STATUS_META[key].icon;
                    const share = item.lineTotal > 0
                        ? Math.round((item.countedTotal / item.lineTotal) * 100)
                        : 0;

                    return (
                        <Stack
                            key={item.id}
                            direction="row"
                            alignItems={{ xs: "flex-start", sm: "center" }}
                            spacing={1.5}
                            flexWrap="wrap"
                            useFlexGap
                            sx={(t) => ({
                                px: { xs: 2, md: 3 },
                                py: 1.75,
                                borderTop: 1,
                                borderColor: "divider",
                                "&:first-of-type": { borderTop: 0 },
                                bgcolor: open ? toneOf(t, key).tint : "transparent",
                                borderLeft: open ? `3px solid ${toneOf(t, key).main}` : "3px solid transparent",
                            })}
                        >
                            <Box
                                sx={(t) => {
                                    const tone = toneOf(t, key);
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

                            <Box sx={{ flex: 1, minWidth: 200 }}>
                                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Typography variant="body2" fontWeight={600}>
                                        №{item.id}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" noWrap>
                                        {item.warehouseName}
                                    </Typography>
                                    <Box
                                        component="span"
                                        sx={(t) => {
                                            const tone = toneOf(t, key);
                                            return {
                                                display: "inline-flex",
                                                alignItems: "center",
                                                height: 22,
                                                px: 1,
                                                borderRadius: "8px",
                                                fontSize: ".72rem",
                                                fontWeight: 500,
                                                bgcolor: tone.tint,
                                                color: tone.text,
                                                border: `1px solid ${tone.border}`,
                                            };
                                        }}
                                    >
                                        {STATUS_META[key].label}
                                    </Box>
                                </Stack>

                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                                    {formatDateRu(item.createdAt)}, {timeOf(item.createdAt)}
                                    {item.startedByName ? ` · ${item.startedByName}` : ""}
                                    {item.comment ? ` · ${item.comment}` : ""}
                                </Typography>

                                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75 }}>
                                    <LinearProgress
                                        variant="determinate"
                                        value={share}
                                        color={open ? "primary" : key === "done" ? "success" : "inherit"}
                                        sx={{
                                            flex: 1,
                                            maxWidth: 220,
                                            height: 5,
                                            borderRadius: 3,
                                            opacity: key === "canceled" ? 0.4 : 1,
                                        }}
                                    />
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
                                    >
                                        {item.countedTotal} из {item.lineTotal}{" "}
                                        {plural(item.lineTotal, "позиции", "позиций", "позиций")}
                                    </Typography>
                                </Stack>
                            </Box>

                            <Stack
                                direction="row"
                                spacing={1}
                                sx={{ width: { xs: "100%", sm: "auto" }, flexShrink: 0 }}
                            >
                                {open ? (
                                    <>
                                        <AppButton
                                            variant="contained"
                                            size="small"
                                            startIcon={<PlayArrowOutlined />}
                                            onClick={() => onContinue(item.id)}
                                            disabled={disabled}
                                            sx={{ flex: { xs: 1, sm: "0 0 auto" } }}
                                        >
                                            Продолжить
                                        </AppButton>
                                        <AppButton
                                            variant="text"
                                            size="small"
                                            color="error"
                                            onClick={() => onCancel(item.id)}
                                            disabled={disabled}
                                            sx={{ flex: { xs: 1, sm: "0 0 auto" } }}
                                        >
                                            Отменить
                                        </AppButton>
                                    </>
                                ) : (
                                    <AppButton
                                        variant="outlined"
                                        size="small"
                                        onClick={() => onOpen(item.id)}
                                        disabled={disabled}
                                        sx={{ width: { xs: "100%", sm: "auto" } }}
                                    >
                                        Итоги
                                    </AppButton>
                                )}
                            </Stack>
                        </Stack>
                    );
                })}
            </Box>
        </AppCard>
    );
};

export default InventoryHistoryCard;
