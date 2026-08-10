import React from "react";
import { Box, Portal } from "@mui/material";
import { AnimatePresence } from "framer-motion";

import { ProfileCompletionBanner } from "../profile/ProfileCompletionBanner";
import { AttendanceReminder } from "../attendance/AttendanceReminder";

/**
 * Плавающий стек уведомлений сверху по центру под шапкой.
 *
 * Уведомления не смещают контент страницы (position: fixed / overlay)
 * и аккуратно выстраиваются по вертикали друг под другом без наложения.
 */
export const FloatingTopBanners: React.FC = () => {
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
          <ProfileCompletionBanner key="profile-completion" />
          <AttendanceReminder key="attendance-reminder" />
        </AnimatePresence>
      </Box>
    </Portal>
  );
};
