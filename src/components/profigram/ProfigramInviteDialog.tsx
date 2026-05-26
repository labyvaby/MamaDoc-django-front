import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    Button,
    TextField,
    CircularProgress,
    Box,
    Paper,
    Stack,
    IconButton,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CheckCircleOutlineOutlined from "@mui/icons-material/CheckCircleOutlineOutlined";
import MonitorHeartOutlined from "@mui/icons-material/MonitorHeartOutlined";
import { supabase } from "../../utility/supabaseClient";

interface Tariff {
    id: string; // adjust if it's number
    name: string;
    price: number;
    description?: string;
}

interface ProfigramInviteDialogProps {
    open: boolean;
    onClose: () => void;
    patientName: string;
    patientPhone: string;
    doctorPhone: string;
    doctorId: string; // Optional if API requires doctor details
}

import logoImg from "../../assets/icon/progigram_logo.jpg";

export const ProfigramInviteDialog: React.FC<ProfigramInviteDialogProps> = ({
    open,
    onClose,
    patientName,
    patientPhone,
    doctorPhone,
    doctorId,
}) => {
    const [tariffs, setTariffs] = useState<Tariff[]>([]);
    const [selectedTariffId, setSelectedTariffId] = useState<string | null>(null);
    const [note, setNote] = useState(`Здравствуйте, ${patientName || "уважаемый пациент"}! Это ваш врач.\n\nПредлагаю подключиться к сервису Profigram. Отправляю приглашение.`);

    const [isLoadingTariffs, setIsLoadingTariffs] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Initial loaded state tracking to avoid refetching every open toggle
    useEffect(() => {
        if (open) {
            fetchTariffs();
        } else {
            // Reset states on close
            setIsSuccess(false);
            setErrorMsg(null);
            setSelectedTariffId(null);
            setNote(`Здравствуйте, ${patientName || "уважаемый пациент"}! Это ваш врач.\n\nПредлагаю подключиться к сервису Profigram. Отправляю приглашение.`);
        }
    }, [open, patientName]);

    const fetchTariffs = async () => {
        if (!doctorPhone) return;
        setIsLoadingTariffs(true);
        setErrorMsg(null);
        try {
            const { data, error } = await supabase.functions.invoke("profigram-tariffs", {
                body: { phone_number: doctorPhone },
            });

            if (error) throw error;

            if (data && Array.isArray(data)) {
                setTariffs(data);
                if (data.length > 0) {
                    setSelectedTariffId(data[0].id); // Select first by default
                }
            } else if (data && data.tariffs) {
                // Adjusted based on potential response wrap
                setTariffs(data.tariffs);
                if (data.tariffs.length > 0) {
                    setSelectedTariffId(data.tariffs[0].id);
                }
            }
        } catch (e: any) {
            console.error("Failed to fetch tariffs", e);
            setErrorMsg("Не удалось загрузить тарифы Profigram. Возможно, вы не зарегистрированы в системе.");
        } finally {
            setIsLoadingTariffs(false);
        }
    };

    const handleSend = async () => {
        if (!selectedTariffId) {
            setErrorMsg("Выберите тариф для отправки");
            return;
        }

        setIsSending(true);
        setErrorMsg(null);

        try {
            const { error } = await supabase.functions.invoke("profigram-invite", {
                body: {
                    doctor_phone: doctorPhone,
                    doctor_id: doctorId,
                    patient_phone: patientPhone,
                    patient_name: patientName,
                    tariff_id: selectedTariffId,
                    note: note.trim()
                },
            });

            if (error) throw error;

            setIsSuccess(true);
            setTimeout(() => {
                onClose();
            }, 2500);

        } catch (e: any) {
            console.error("Failed to send invite", e);
            setErrorMsg("Не удалось отправить приглашение. Попробуйте еще раз.");
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Dialog open={open} onClose={isSending ? undefined : onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                    component="img"
                    src={logoImg}
                    alt="Profigram Logo"
                    sx={{ width: 90, height: 90, borderRadius: 1 }}
                />
                <Typography variant="h6" component="span" fontWeight={600}>
                    Предложите мониторинг здоровья
                </Typography>
                <IconButton
                    aria-label="close"
                    onClick={onClose}
                    disabled={isSending || isSuccess}
                    sx={{
                        position: 'absolute',
                        right: 8,
                        top: 8,
                        color: (theme) => theme.palette.grey[500],
                    }}
                >
                    <CloseOutlined />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 3 }}>
                {isSuccess ? (
                    <Box sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <CheckCircleOutlineOutlined color="success" sx={{ fontSize: 64, mb: 2 }} />
                        <Typography variant="h6" gutterBottom>
                            Приглашение успешно отправлено!
                        </Typography>
                        <Typography color="text.secondary">
                            Пациент получит уведомление.
                        </Typography>
                    </Box>
                ) : (
                    <Stack spacing={3}>
                        <Typography color="text.secondary" variant="body2">
                            Пациент <b>{patientName || patientPhone}</b> завершил прием. Хотите пригласить его в сервис Profigram для дальнейшего онлайн-сопровождения?
                        </Typography>

                        {errorMsg && (
                            <Paper sx={{ p: 2, bgcolor: 'error.light', color: 'error.contrastText' }} elevation={0}>
                                <Typography variant="body2">{errorMsg}</Typography>
                            </Paper>
                        )}

                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                Выберите тариф из вашего профиля Profigram
                            </Typography>
                            {isLoadingTariffs ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
                                    <CircularProgress size={20} />
                                    <Typography variant="body2" color="text.secondary">Загрузка тарифов...</Typography>
                                </Box>
                            ) : tariffs.length > 0 ? (
                                <Stack spacing={1}>
                                    {tariffs.map((t) => (
                                        <Paper
                                            key={t.id}
                                            variant="outlined"
                                            sx={{
                                                p: 1.5,
                                                cursor: 'pointer',
                                                borderColor: selectedTariffId === t.id ? 'primary.main' : 'divider',
                                                bgcolor: selectedTariffId === t.id ? 'primary.50' : 'transparent', // assume 50 exists, fallback to transparent
                                                ...(selectedTariffId === t.id && {
                                                    backgroundColor: 'action.selected'
                                                })
                                            }}
                                            onClick={() => setSelectedTariffId(t.id)}
                                        >
                                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                <Typography variant="body2" fontWeight={selectedTariffId === t.id ? 600 : 400}>
                                                    {t.name}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {t.price} ₽
                                                </Typography>
                                            </Stack>
                                            {t.description && (
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                                    {t.description}
                                                </Typography>
                                            )}
                                        </Paper>
                                    ))}
                                </Stack>
                            ) : (
                                !errorMsg && (
                                    <Typography variant="body2" color="text.secondary">
                                        Тарифы не найдены. Убедитесь, что ваш номер ({doctorPhone}) привязан к Profigram.
                                    </Typography>
                                )
                            )}
                        </Box>

                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                Сообщение для пациента
                            </Typography>
                            <TextField
                                fullWidth
                                multiline
                                rows={4}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                disabled={isSending}
                                placeholder="Добавьте персональное сообщение (необязательно)"
                            />
                        </Box>
                    </Stack>
                )}
            </DialogContent>
            {!isSuccess && (
                <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
                    <Button onClick={onClose} color="inherit" disabled={isSending}>
                        Пропустить / Не сейчас
                    </Button>
                    <Button
                        onClick={handleSend}
                        variant="contained"
                        disabled={isSending || !selectedTariffId || tariffs.length === 0}
                        startIcon={isSending ? <CircularProgress size={20} color="inherit" /> : null}
                    >
                        {isSending ? "Отправка..." : "Отправить приглашение"}
                    </Button>
                </DialogActions>
            )}
        </Dialog>
    );
};
