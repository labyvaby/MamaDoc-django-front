import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  IconButton,
} from "@mui/material";
import { CloseOutlined as Close, WarningAmberOutlined as WarningAmber, ErrorOutline, InfoOutlined, HelpOutline } from "@mui/icons-material";

export type ConfirmDialogVariant = "warning" | "error" | "info" | "question";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmDialogVariant;
  loading?: boolean;
}

const variantConfig = {
  warning: {
    icon: WarningAmber,
    color: "warning.main",
    confirmColor: "warning" as const,
  },
  error: {
    icon: ErrorOutline,
    color: "error.main",
    confirmColor: "error" as const,
  },
  info: {
    icon: InfoOutlined,
    color: "info.main",
    confirmColor: "info" as const,
  },
  question: {
    icon: HelpOutline,
    color: "primary.onSurface",
    confirmColor: "primary" as const,
  },
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Подтвердить",
  cancelText = "Отмена",
  variant = "question",
  loading = false,
}) => {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: "14px",
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Icon sx={{ color: config.color, fontSize: 28 }} />
            {title}
          </Box>
          <IconButton
            size="small"
            onClick={onClose}
            disabled={loading}
            sx={{ color: "text.secondary" }}
          >
            <Close fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading} color="inherit">
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={config.confirmColor}
          disabled={loading}
          autoFocus
        >
          {loading ? "Загрузка..." : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
