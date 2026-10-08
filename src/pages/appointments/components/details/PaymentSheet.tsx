import React from "react";
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { AppBottomSheet } from "../../../../components/ui/AppBottomSheet";

/**
 * Окно действий над оплатой: диалог на десктопе, bottom sheet на телефоне
 * («телефон» в проекте — down("md"), брейкпоинты нестандартные).
 */
export interface PaymentSheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions: React.ReactNode;
  children: React.ReactNode;
  /** Блокирует закрытие на время запроса. */
  busy?: boolean;
}

export const PaymentSheet: React.FC<PaymentSheetProps> = ({
  open,
  onClose,
  title,
  icon,
  subtitle,
  actions,
  children,
  busy = false,
}) => {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("md"));
  const close = busy ? () => undefined : onClose;

  const heading = (
    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0 }}>
      {icon && (
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "10px",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            bgcolor: "action.hover",
          }}
        >
          {icon}
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700} lineHeight={1.25}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Stack>
  );

  if (isPhone) {
    return (
      <AppBottomSheet open={open} onClose={close} header={<Box sx={{ px: 2, pb: 1 }}>{heading}</Box>}>
        <Stack spacing={2} sx={{ px: 2, pt: 1, pb: 2 }}>
          {children}
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 0.5 }}>
            {actions}
          </Stack>
        </Stack>
      </AppBottomSheet>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: "16px" } }}
    >
      <DialogTitle sx={{ pb: 1 }}>{heading}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {children}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>{actions}</DialogActions>
    </Dialog>
  );
};

export default PaymentSheet;
