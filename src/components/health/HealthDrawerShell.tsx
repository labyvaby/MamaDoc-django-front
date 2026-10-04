import React from "react";
import { Alert, Box, Divider, Drawer, IconButton, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { useSheetBackClose } from "../../hooks/useSheetBackClose";
import { AppButton } from "../ui";
import { healthErrorText } from "./healthForms";

interface HealthDrawerShellProps {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Идёт сохранение: окно не закрывается, кнопка крутится. */
  pending: boolean;
  error: unknown;
  canSave: boolean;
  saveLabel: string;
  onSave: () => void;
  onClose: () => void;
  /** Слева в подвале (например, «Удалить»). */
  footerStart?: React.ReactNode;
  /** Вторая кнопка сохранения («Сохранить и далее»). */
  saveNextLabel?: string;
  onSaveNext?: () => void;
  /** Ширина окна на широком экране; по умолчанию 520. */
  width?: number;
  children: React.ReactNode;
}

/** Каркас окна медпрофиля: заголовок, прокручиваемая форма, подвал с кнопками. */
export const HealthDrawerShell: React.FC<HealthDrawerShellProps> = ({
  open,
  title,
  subtitle,
  pending,
  error,
  canSave,
  saveLabel,
  onSave,
  onClose,
  footerStart,
  saveNextLabel,
  onSaveNext,
  width = 520,
  children,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const close = pending ? () => undefined : onClose;
  useSheetBackClose(open, close, isMobile);
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={close}
      PaperProps={{ sx: { width: { xs: "100vw", md: width }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600} noWrap>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" display="block" noWrap>
              {subtitle}
            </Typography>
          )}
        </Box>
        <IconButton onClick={close} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />
      <Stack gap={2.25} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, py: 2 }}>
        {error ? <Alert severity="error">{healthErrorText(error)}</Alert> : null}
        {children}
      </Stack>
      <Divider />
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ px: 2.5, py: 1.5 }}>
        <Box sx={{ flex: 1 }}>{footerStart}</Box>
        <AppButton onClick={close} disabled={pending}>
          Отмена
        </AppButton>
        {saveNextLabel && onSaveNext && (
          <AppButton variant="outlined" disabled={!canSave || pending} onClick={onSaveNext}>
            {saveNextLabel}
          </AppButton>
        )}
        <AppButton variant="contained" loading={pending} disabled={!canSave} onClick={onSave}>
          {saveLabel}
        </AppButton>
      </Stack>
    </Drawer>
  );
};
