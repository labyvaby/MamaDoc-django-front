import React from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    Typography,
    Box,
    Divider,
    Stack,
    useMediaQuery,
    useTheme
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useAppointmentDetails } from "../../hooks/useAppointmentDetails";
import { formatDateRu, formatKGS } from "../../utility/format";

interface AllAppointmentsDetailsModalProps {
    open: boolean;
    onClose: () => void;
    appointmentId: string | null;
}

export const AllAppointmentsDetailsModal: React.FC<AllAppointmentsDetailsModalProps> = ({ open, onClose, appointmentId }) => {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
    const { item, loading } = useAppointmentDetails(open ? appointmentId : null);

    if (!open) return null;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullScreen={fullScreen}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle sx={{ m: 0, p: 2 }}>
                <Typography variant="h6">Детали приема</Typography>
                <IconButton
                    aria-label="close"
                    onClick={onClose}
                    sx={{
                        position: 'absolute',
                        right: 8,
                        top: 8,
                        color: (theme) => theme.palette.grey[500],
                    }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                {loading ? (
                    <Typography>Загрузка...</Typography>
                ) : !item ? (
                    <Typography>Данные не найдены</Typography>
                ) : (
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary">Пациент</Typography>
                            <Typography variant="body1">{item.patient_name}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary">Дата</Typography>
                            <Typography variant="body1">{formatDateRu(item.appointment_at)} {new Date(item.appointment_at).toLocaleTimeString()}</Typography>
                        </Box>
                        <Divider />
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary">Услуги</Typography>
                            {(Array.isArray(item.services_json) ? item.services_json : []).map((srv: any, idx: number) => (
                                <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                    <Typography variant="body2">{srv.name || srv.service_name}</Typography>
                                    <Typography variant="body2" fontWeight="bold">{formatKGS(srv.price || srv.cost)}</Typography>
                                </Box>
                            ))}
                        </Box>
                        <Divider />
                        <Box>
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
                )}
            </DialogContent>
        </Dialog>
    );
};
