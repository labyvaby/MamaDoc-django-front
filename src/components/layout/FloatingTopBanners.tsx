import React from "react";
import { Box, Portal } from "@mui/material";
import { AnimatePresence } from "framer-motion";

import { ProfileCompletionBanner } from "../profile/ProfileCompletionBanner";
import { AttendanceReminder } from "../attendance/AttendanceReminder";
import { IS_DJANGO_BACKEND } from "../../config/backend";

/**
 * Плавающий стек уведомлений сверху по центру под шапкой.
 *
 * Уведомления не смещают контент страницы (position: fixed / overlay)
 * и аккуратно выстраиваются по вертикали друг под другом без наложения.
 */
export const FloatingTopBanners: React.FC = () => {
  if (!IS_DJANGO_BACKEND) return null;

  return (
    <Portal>
      <Box
        sx={(theme) => ({
          position: "fixed",
          zIndex: theme.zIndex.snackbar,
          top: {
            xs: `${theme.appLayout.header.height.mobile + 12}px`,
            md: `${theme.appLayout.header.height.desktop + 12}px`,
          },
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.25,
          px: 1.5,
          pointerEvents: "none",
        })}
      >
        <AnimatePresence mode="sync">
          <ProfileCompletionBanner />
          <AttendanceReminder />
        </AnimatePresence>
      </Box>
    </Portal>
  );
};
