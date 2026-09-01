import React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";

import { AppButton, AppCard } from "../../../ui";
import { formatDateRu } from "../../../../utility/format";
import type { WarehouseInventoryCount } from "../../../../api/warehouse";

export type InventoryHistoryCardProps = {
    items: WarehouseInventoryCount[];
    loading?: boolean;
    /** Продолжить незакрытый пересчёт: документ уже открыт, строки в нём. */
    onContinue: (id: number) => void;
    /** Открыть итоги завершённого документа. */
    onOpen: (id: number) => void;
    disabled?: boolean;
};

const STATUS_LABEL: Record<string, string> = {
    counting: "Идёт подсчёт",
    done: "Проведена",
    canceled: "Отменена",
};

const time = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

/**
 * История пересчётов по складу. Главное здесь — незакрытый документ: ушли со
 * страницы и вернулись, а пересчёт продолжается ровно с того же места.
 */
export const InventoryHistoryCard: React.FC<InventoryHistoryCardProps> = ({
    items,
    loading = false,
    onContinue,
    onOpen,
    disabled = false,
}) => (
    <AppCard
        title="Последние инвентаризации"
        subheader="Незакрытый пересчёт можно продолжить с того места, где остановились"
        disableContentPadding
    >
        <Box sx={{ display: "flex", flexDirection: "column" }}>
            {loading && items.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 2.5 }}>
                    Загружаем историю…
                </Typography>
            )}

            {!loading && items.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 2.5 }}>
                    По этому складу инвентаризаций ещё не было.
                </Typography>
            )}

            {items.map((item) => {
                const open = item.status === "counting";
                return (
                    <Stack
                        key={item.id}
                        direction="row"
                        alignItems="center"
                        spacing={1.5}
                        flexWrap="wrap"
                        useFlexGap
                        sx={{ px: 3, py: 1.5, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}
                    >
                        <Box sx={{ flex: 1, minWidth: 180 }}>
                            <Typography variant="body2" fontWeight={500}>
                                №{item.id} · {item.warehouseName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                                {formatDateRu(item.createdAt)}, {time(item.createdAt)}
                                {item.startedByName ? ` · ${item.startedByName}` : ""}
                                {` · посчитано ${item.countedTotal} из ${item.lineTotal}`}
                            </Typography>
                        </Box>

                        <Chip
                            size="small"
                            label={STATUS_LABEL[item.status] ?? item.status}
                            color={open ? "primary" : item.status === "done" ? "success" : "default"}
                            variant={item.status === "canceled" ? "outlined" : "filled"}
                        />

                        {open ? (
                            <AppButton
                                variant="contained"
                                size="small"
                                startIcon={<PlayArrowOutlined />}
                                onClick={() => onContinue(item.id)}
                                disabled={disabled}
                            >
                                Продолжить
                            </AppButton>
                        ) : (
                            <AppButton
                                variant="text"
                                size="small"
                                onClick={() => onOpen(item.id)}
                                disabled={disabled}
                            >
                                Итоги
                            </AppButton>
                        )}
                    </Stack>
                );
            })}
        </Box>
    </AppCard>
);

export default InventoryHistoryCard;
