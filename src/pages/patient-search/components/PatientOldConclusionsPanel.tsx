/**
 * PatientOldConclusionsPanel.tsx
 * Компонент отображает колонку с историей старых заключений.
 */
import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import { AppCard, ListEmptyState, ListLoadingSkeleton } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import type { OldConclusion } from "../useOldConclusions";

type Props = {
    selected: boolean;
    loading: boolean;
    errorMsg: string | null;
    data: OldConclusion[];
    onClick: (item: OldConclusion) => void;
};

const PatientOldConclusionsPanel: React.FC<Props> = ({
    selected,
    loading,
    errorMsg,
    data,
    onClick,
}) => {
    return (
        <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <AppCard
                variant="outlined"
                header={
                    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 2, pt: 2, pb: 1.5 }}>
                        <Stack direction="row" alignItems="center" gap={1.25}>
                            <FolderOpenOutlined color="primary" />
                            <Typography variant="h6">Старые заключения</Typography>
                        </Stack>
                        {selected && !loading && !errorMsg && data.length > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                {data.length}
                            </Typography>
                        )}
                    </Stack>
                }
                disableContentPadding
                sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
            >
                <Box sx={{ borderTop: 1, borderColor: "divider", flex: 1, overflowY: "auto", minHeight: 0, p: 1 }}>
                    {!selected ? (
                        <ListEmptyState
                            icon={<FolderOpenOutlined />}
                            title="Пациент не выбран"
                            description="Выберите пациента слева, чтобы увидеть старые заключения"
                        />
                    ) : loading ? (
                        <ListLoadingSkeleton rows={4} />
                    ) : errorMsg ? (
                        <ListEmptyState icon={<ErrorOutlineOutlined />} title="Не удалось загрузить" description={errorMsg} />
                    ) : data.length === 0 ? (
                        <ListEmptyState
                            icon={<FolderOpenOutlined />}
                            title="Нет старых заключений"
                            description="Архивных записей по этому пациенту не найдено"
                        />
                    ) : (
                        <Stack spacing={0.75}>
                            {data.map((item) => {
                                const dateStr = item.changed_at
                                    ? new Date(item.changed_at).toLocaleDateString("ru-RU", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                    })
                                    : "Дата неизвестна";

                                return (
                                    <Box
                                        key={item.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => onClick(item)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                onClick(item);
                                            }
                                        }}
                                        sx={(t) => ({
                                            p: 1.5,
                                            borderRadius: "10px",
                                            border: 1,
                                            borderColor: "divider",
                                            bgcolor: subtleBg(t),
                                            cursor: "pointer",
                                            transition: "background-color .15s ease, border-color .15s ease",
                                            "&:hover": {
                                                bgcolor: subtleBg(t, true),
                                                borderColor: alpha(t.palette.primary.main, 0.28),
                                            },
                                        })}
                                    >
                                        <Stack direction="column" gap={0.5}>
                                            <Typography variant="subtitle2" fontWeight={600}>
                                                {dateStr}
                                            </Typography>
                                            {(!!item.weight_kg || !!item.height_cm || !!item.temperature) && (
                                                <Typography variant="body2" color="text.secondary">
                                                    {[
                                                        item.weight_kg ? `Вес: ${item.weight_kg} кг` : null,
                                                        item.height_cm ? `Рост: ${item.height_cm} см` : null,
                                                        item.temperature ? `Темп: ${item.temperature} °C` : null,
                                                    ].filter(Boolean).join(" • ")}
                                                </Typography>
                                            )}
                                            {item.diagnosis && (
                                                <Typography variant="body2" color="text.secondary" sx={{
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}>
                                                    <Typography component="span" fontWeight="medium" fontSize="inherit">Диагноз:</Typography> {item.diagnosis}
                                                </Typography>
                                            )}
                                            {item.complaints && (
                                                <Typography variant="body2" color="text.secondary" sx={{
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}>
                                                    <Typography component="span" fontWeight="medium" fontSize="inherit">Жалобы:</Typography> {item.complaints}
                                                </Typography>
                                            )}
                                        </Stack>
                                    </Box>
                                );
                            })}
                        </Stack>
                    )}
                </Box>
            </AppCard>
        </Box>
    );
};

export default PatientOldConclusionsPanel;
