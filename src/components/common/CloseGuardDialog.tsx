import React from "react";
import {
    Dialog, DialogTitle, DialogContent,
    DialogActions, Button, Typography,
} from "@mui/material";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

interface CloseGuardDialogProps {
    open: boolean;
    title: string; // например "создание приёма"
    onConfirm: () => void;
    onCancel: () => void;
}

export const CloseGuardDialog: React.FC<CloseGuardDialogProps> = ({
    open, title, onConfirm, onCancel,
}) => (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <WarningAmberOutlined color="warning" />
            Закрыть без сохранения?
        </DialogTitle>
        <DialogContent>
            <Typography variant="body2" color="text.secondary">
                Вы вносили изменения в <strong>{title}</strong>. Если закрыть сейчас — данные не сохранятся.
            </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button onClick={onCancel} variant="contained" color="primary" sx={{ minWidth: 120 }}>
                Остаться
            </Button>
            <Button onClick={onConfirm} variant="outlined" color="error" sx={{ minWidth: 120 }}>
                Закрыть
            </Button>
        </DialogActions>
    </Dialog>
);
