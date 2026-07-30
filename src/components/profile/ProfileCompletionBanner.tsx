import React from "react";
import { Box, Typography, IconButton, Stack, alpha } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useNavigate } from "react-router";

import { useProfileCompleteness } from "../../hooks/useProfileCompleteness";
import { subtleBg } from "../../theme/uiHelpers";
import { AppButton } from "../ui/AppButton";

const MotionBox = motion(Box);

export const ProfileCompletionBanner: React.FC = () => {
  const navigate = useNavigate();
  const { shouldShowBanner, criticalLabelsFormatted, dismissForToday } =
    useProfileCompleteness();

  if (!shouldShowBanner) {
    return null;
  }

  const handleGoToProfile = () => {
    navigate("/profile");
  };

  return (
    <AnimatePresence>
      <Box
        sx={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          px: { xs: 1.5, sm: 2 },
          pt: 1.5,
          pb: 0.5,
          zIndex: (theme) => theme.zIndex.appBar - 1,
        }}
      >
        <MotionBox
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          sx={(theme) => ({
            width: "100%",
            maxWidth: 720,
            borderRadius: "14px",
            border: 1,
            borderColor: alpha(theme.palette.primary.main, 0.28),
            bgcolor: subtleBg(theme, true),
            p: { xs: 1.5, sm: 2 },
            boxShadow: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          })}
        >
          {/* Иконка плашки + Содержимое */}
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
            <Box
              sx={(theme) => ({
                width: 40,
                height: 40,
                borderRadius: "10px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "primary.onSurface",
                bgcolor: alpha(
                  theme.palette.primary.main,
                  theme.palette.mode === "dark" ? 0.18 : 0.12
                ),
                "& .MuiSvgIcon-root": { fontSize: 22 },
              })}
            >
              <WarningAmberOutlined />
            </Box>

            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={600} color="text.primary" sx={{ letterSpacing: -0.1 }}>
                Настройте профиль до конца
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize: "0.825rem", mt: 0.25 }}>
                Необходимо указать: <Box component="span" fontWeight={600} color="text.primary">{criticalLabelsFormatted}</Box>
              </Typography>
            </Box>
          </Stack>

          {/* Действие и кнопка закрытия */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
            <AppButton
              variant="contained"
              size="small"
              endIcon={<ArrowForwardOutlined fontSize="small" />}
              onClick={handleGoToProfile}
              sx={{ height: 36, px: 2, fontSize: "0.85rem" }}
            >
              До настроить
            </AppButton>

            <IconButton
              size="small"
              onClick={dismissForToday}
              aria-label="Закрыть уведомление на сегодня"
              sx={(theme) => ({
                width: 36,
                height: 36,
                borderRadius: "10px",
                color: "text.secondary",
                border: 1,
                borderColor: "divider",
                transition: "color .15s ease, background-color .15s ease",
                "&:hover": {
                  color: "text.primary",
                  bgcolor: subtleBg(theme, true),
                },
              })}
            >
              <CloseOutlined fontSize="small" />
            </IconButton>
          </Stack>
        </MotionBox>
      </Box>
    </AnimatePresence>
  );
};
