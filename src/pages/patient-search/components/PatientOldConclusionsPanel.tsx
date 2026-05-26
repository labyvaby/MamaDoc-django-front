/**
 * PatientOldConclusionsPanel.tsx
 * Компонент отображает колонку с историей старых заключений.
 */
import React from "react";
import {
    Box,
    Card,
    CardHeader,
    CardContent,
    Chip,
    Divider,
    Stack,
    Typography,
    List,
    ListItemButton
} from "@mui/material";
import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
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
            <Card variant="outlined" sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <CardHeader
                    title={
                        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
                            <Stack direction="row" alignItems="center" gap={1.25}>
                                <FolderOpenOutlined color="primary" />
                                <Typography variant="h6">Старые заключения</Typography>
                            </Stack>
                            <Chip size="small" label={data.length} />
                        </Stack>
                    }
                    sx={{ pb: 1 }}
                />
                <Divider />
                <CardContent sx={{ p: 0, flex: 1, overflowY: "auto", minHeight: 0 }}>
                    {!selected ? (
                        <Typography sx={{ p: 2 }} variant="body2" color="text.secondary" align="center">
                            Выберите пациента слева
                        </Typography>
                    ) : loading ? (
                        <Typography sx={{ p: 2 }} variant="body2" color="text.secondary" align="center">
                            Загрузка…
                        </Typography>
                    ) : errorMsg ? (
                        <Typography sx={{ p: 2 }} variant="body2" color="error" align="center">
                            Ошибка: {errorMsg}
                        </Typography>
                    ) : data.length === 0 ? (
                        <Typography sx={{ p: 2 }} variant="body2" color="text.secondary" align="center">
                            Нет старых заключений
                        </Typography>
                    ) : (
                        <List disablePadding sx={{ px: 1, py: 0.5 }}>
                            {data.map((item) => {
                                const dateStr = item.changed_at
                                    ? new Date(item.changed_at).toLocaleDateString("ru-RU", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                    })
                                    : "Дата неизвестна";

                                return (
                                    <ListItemButton
                                        key={item.id}
                                        onClick={() => onClick(item)}
                                        sx={{
                                            px: 2,
                                            py: 1.25,
                                            my: "5px",
                                            border: "1px solid",
                                            borderColor: "divider",
                                            borderRadius: 1,
                                            alignItems: "flex-start",
                                            "&:hover": {
                                                bgcolor: (theme) => theme.palette.action.hover,
                                            },
                                        }}
                                    >
                                        <Stack direction="column" gap={0.5} sx={{ width: "100%" }}>
                                            <Typography variant="subtitle2">
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
                                    </ListItemButton>
                                );
                            })}
                        </List>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
};

export default PatientOldConclusionsPanel;
