import React from "react";
import {
    Drawer, Button, Stack, Typography, Box, CircularProgress,
    Chip, Divider, Alert, IconButton,
} from "@mui/material";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import dayjs from "dayjs";
import { BankCandidate, findBankCandidates, confirmBankPayment } from "../../services/bankConfirmation";
import { useNotification } from "@refinedev/core";

interface BankConfirmationModalProps {
    open: boolean;
    appointmentId: string;
    onClose: () => void;
    onConfirmed: () => void;
}

export const BankConfirmationModal: React.FC<BankConfirmationModalProps> = ({
    open,
    appointmentId,
    onClose,
    onConfirmed,
}) => {
    const { open: notify } = useNotification();
    const [candidates, setCandidates] = React.useState<BankCandidate[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [confirming, setConfirming] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setLoading(true);
        findBankCandidates(appointmentId)
            .then(setCandidates)
            .catch(() => notify?.({ type: "error", message: "Ошибка загрузки платежей" }))
            .finally(() => setLoading(false));
    }, [open, appointmentId]);

    const handleConfirm = async (movementId: string) => {
        setConfirming(movementId);
        try {
            const result = await confirmBankPayment(appointmentId, movementId);
            if (!result.ok) {
                notify?.({ type: "error", message: result.error ?? "Ошибка подтверждения" });
                return;
            }
            notify?.({ type: "success", message: "Оплата подтверждена банком" });
            onConfirmed();
            onClose();
        } catch {
            notify?.({ type: "error", message: "Ошибка подтверждения" });
        } finally {
            setConfirming(null);
        }
    };

    const availableCandidates = candidates.filter(c => !c.already_used);
    const usedCandidates = candidates.filter(c => c.already_used);

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{ sx: { width: { xs: "100%", sm: 420 } } }}
        >
            <Box sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 2,
                py: 1.5,
                borderBottom: 1,
                borderColor: "divider",
            }}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <AccountBalanceOutlined color="primary" fontSize="small" />
                    <Typography variant="h6" fontSize="1rem">
                        Подтвердить банковский платёж
                    </Typography>
                </Stack>
                <IconButton size="small" onClick={onClose}>
                    <CloseOutlined fontSize="small" />
                </IconButton>
            </Box>

            <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                        <CircularProgress />
                    </Box>
                ) : candidates.length === 0 ? (
                    <Alert severity="warning">
                        Подходящие платежи в банке не найдены. Проверьте сумму и время приёма.
                    </Alert>
                ) : (
                    <Stack spacing={1.5}>
                        {availableCandidates.length > 0 && (
                            <>
                                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ }}>
                                    Доступные платежи
                                </Typography>
                                {availableCandidates.map(c => (
                                    <CandidateRow
                                        key={c.movement_id}
                                        candidate={c}
                                        onConfirm={handleConfirm}
                                        confirming={confirming === c.movement_id}
                                        disabled={!!confirming}
                                    />
                                ))}
                            </>
                        )}

                        {usedCandidates.length > 0 && (
                            <>
                                <Divider />
                                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ }}>
                                    Уже привязаны к другому приёму
                                </Typography>
                                {usedCandidates.map(c => (
                                    <CandidateRow
                                        key={c.movement_id}
                                        candidate={c}
                                        onConfirm={handleConfirm}
                                        confirming={false}
                                        disabled={true}
                                    />
                                ))}
                            </>
                        )}
                    </Stack>
                )}
            </Box>

            <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>
                <Button fullWidth variant="outlined" color="inherit" onClick={onClose}>
                    Отмена
                </Button>
            </Box>
        </Drawer>
    );
};

const CandidateRow: React.FC<{
    candidate: BankCandidate;
    onConfirm: (id: string) => void;
    confirming: boolean;
    disabled: boolean;
}> = ({ candidate, onConfirm, confirming, disabled }) => (
    <Box sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        p: 1.5,
        border: "1px solid",
        borderColor: candidate.already_used ? "divider" : "primary.light",
        borderRadius: "10px",
        bgcolor: candidate.already_used ? "action.hover" : "background.paper",
        opacity: candidate.already_used ? 0.6 : 1,
    }}>
        <Stack spacing={0.25} flex={1} minWidth={0}>
            <Stack direction="row" alignItems="center" gap={1}>
                <Typography variant="subtitle2" fontWeight={700}>
                    {Number(candidate.credit_amount).toLocaleString()} сом
                </Typography>
                <Chip
                    label={`±${candidate.time_diff_min} мин`}
                    size="small"
                    color={candidate.time_diff_min <= 60 ? "success" : "default"}
                    sx={{ height: 20, fontSize: "0.7rem" }}
                />
            </Stack>
            <Typography variant="caption" color="text.secondary">
                {dayjs(candidate.transaction_date).format("DD.MM.YYYY HH:mm")}
            </Typography>
            {candidate.comment && (
                <Typography variant="caption" color="text.secondary" noWrap>
                    {candidate.comment}
                </Typography>
            )}
        </Stack>

        <Button
            size="small"
            variant={candidate.already_used ? "text" : "contained"}
            color="success"
            disabled={disabled || candidate.already_used}
            onClick={() => onConfirm(candidate.movement_id)}
            startIcon={confirming ? <CircularProgress size={14} color="inherit" /> : <CheckCircleOutlined />}
            sx={{ flexShrink: 0 }}
        >
            {confirming ? "..." : "Выбрать"}
        </Button>
    </Box>
);
