import React from "react";
import {
    Typography,
    Box,
    Divider,
    Stack,
    Paper,
    Skeleton
} from "@mui/material";
import { useAppointmentDetails } from "../../hooks/useAppointmentDetails";
import { formatDateRu, formatKGS } from "../../utility/format";

interface HistoryDetailCardProps {
    appointmentId: string | null;
}

export const HistoryDetailCard: React.FC<HistoryDetailCardProps> = ({ appointmentId }) => {
    const { item, loading } = useAppointmentDetails(appointmentId);

    if (!appointmentId) {
        return (
            <Box
                sx={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: 1,
                    color: "text.secondary",
                }}
            >
                <Typography>Выберите прием для просмотра</Typography>
            </Box>
        );
    }

    if (loading) {
        return (
            <Paper elevation={0} variant="outlined" sx={{ p: 2, height: "100%" }}>
                <Stack spacing={2}>
                    <Skeleton variant="text" width="60%" height={32} />
                    <Skeleton variant="rectangular" height={100} />
                    <Skeleton variant="text" width="40%" />
                    <Skeleton variant="text" width="80%" />
                </Stack>
            </Paper>
        );
    }

    if (!item) {
        return (
            <Paper elevation={0} variant="outlined" sx={{ p: 2, height: "100%", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="error">Данные не найдены</Typography>
            </Paper>
        );
    }

    return (
        <Paper
            elevation={0}
            variant="outlined"
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}
        >
            <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
                <Typography variant="h6">Детали приема</Typography>
            </Box>

            <Box
                sx={{
                    flex: 1,
                    overflowY: "auto",
                    p: 3,
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    '&::-webkit-scrollbar': {
                        display: 'none',
                    },
                }}
            >
                <Stack spacing={3}>
                    <Box>
                        <Typography variant="subtitle2" color="text.secondary">Пациент</Typography>
                        <Typography variant="body1" fontWeight={500}>{item.patient_name}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="subtitle2" color="text.secondary">Дата</Typography>
                        <Typography variant="body1">
                            {formatDateRu(item.appointment_at)} {new Date(item.appointment_at).toLocaleTimeString("ru-RU", { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                    </Box>

                    <Divider />

                    <Box>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>Услуги</Typography>
                        {(Array.isArray(item.services_json) ? item.services_json : []).map((srv: any, idx: number) => (
                            <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                <Typography variant="body2" sx={{ flex: 1, mr: 2 }}>{srv.name || srv.service_name}</Typography>
                                <Typography variant="body2" fontWeight="bold">{formatKGS(srv.price || srv.cost)}</Typography>
                            </Box>
                        ))}
                    </Box>

                    <Divider />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle2" color="text.secondary">Итого</Typography>
                        <Typography variant="h6" color="primary">{formatKGS(item.total_cost)}</Typography>
                    </Box>

                    {item.conclusion && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                            <Typography variant="subtitle2" gutterBottom>Заключение</Typography>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{item.conclusion}</Typography>
                        </Box>
                    )}
                </Stack>
            </Box>
        </Paper>
    );
};
