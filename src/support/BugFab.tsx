import React from "react";
import { Box, ButtonBase, CircularProgress, IconButton, Typography, useMediaQuery, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import BugReportOutlined from "@mui/icons-material/BugReportOutlined";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { SUPPORT_IGNORE_ATTR } from "./screenshot";

const MotionBox = motion(Box);

export interface BugFabProps {
  visible: boolean;
  busy: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * Миниатюрная кнопка-жук: появляется, когда в работе случился сбой, и
 * предлагает «собрать всё само». Нажатие делает снимок экрана и открывает
 * заполненную форму (см. SupportReportProvider).
 *
 * Эффекты: пружинное появление, два расходящихся кольца-пульса, «покачивание»
 * жука раз в несколько секунд и всплывающая подсказка. Всё это выключается при
 * системной настройке «уменьшить движение».
 */
export const BugFab: React.FC<BugFabProps> = ({ visible, busy, onOpen, onDismiss }) => {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const [hintOpen, setHintOpen] = React.useState(true);
  const size = phone ? 48 : 54;

  // Подсказка живёт несколько секунд, потом остаётся одна кнопка.
  React.useEffect(() => {
    if (!visible) return;
    setHintOpen(true);
    const timer = window.setTimeout(() => setHintOpen(false), phone ? 7000 : 12000);
    return () => window.clearTimeout(timer);
  }, [visible, phone]);

  const danger = theme.palette.error.main;
  const warm = theme.palette.warning.main;

  return (
    <AnimatePresence>
      {visible && (
        <MotionBox
          {...{ [SUPPORT_IGNORE_ATTR]: "" }}
          initial={{ opacity: 0, scale: 0.4, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: 24 }}
          transition={{ type: "spring", stiffness: 340, damping: 22 }}
          sx={{
            position: "fixed",
            right: { xs: 14, md: 24 },
            bottom: { xs: "calc(16px + env(safe-area-inset-bottom))", md: 24 },
            zIndex: theme.zIndex.snackbar + 5,
            display: "flex",
            alignItems: "center",
            gap: 1,
            pointerEvents: "none", // кликабельны только кнопка и подсказка
          }}
        >
          <AnimatePresence>
            {hintOpen && !busy && (
              <MotionBox
                initial={{ opacity: 0, x: 18, scale: 0.92 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 12, scale: 0.95 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                sx={{
                  pointerEvents: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  maxWidth: { xs: 210, md: 280 },
                  pl: 1.5,
                  pr: 0.5,
                  py: 0.75,
                  borderRadius: "14px",
                  bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.92 : 0.96),
                  backdropFilter: "blur(10px)",
                  border: 1,
                  borderColor: alpha(danger, 0.35),
                  boxShadow: `0 10px 30px ${alpha(danger, 0.22)}`,
                }}
              >
                <Typography variant="caption" sx={{ lineHeight: 1.3, fontWeight: 500 }}>
                  Что-то пошло не так? Нажмите — мы соберём всё сами.
                </Typography>
                <IconButton size="small" aria-label="Скрыть подсказку" onClick={() => setHintOpen(false)}>
                  <CloseRounded sx={{ fontSize: 15 }} />
                </IconButton>
              </MotionBox>
            )}
          </AnimatePresence>

          <Box sx={{ position: "relative", width: size, height: size, pointerEvents: "auto" }}>
            {!reduceMotion &&
              [0, 1].map((i) => (
                <MotionBox
                  key={i}
                  aria-hidden
                  initial={{ opacity: 0.55, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.9 }}
                  transition={{ duration: 2.4, repeat: Infinity, delay: i * 1.2, ease: "easeOut" }}
                  sx={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    border: `2px solid ${alpha(danger, 0.7)}`,
                    pointerEvents: "none",
                  }}
                />
              ))}

            <ButtonBase
              onClick={onOpen}
              disabled={busy}
              aria-label="Сообщить о проблеме разработчикам"
              sx={{
                position: "relative",
                width: size,
                height: size,
                borderRadius: "50%",
                color: "#fff",
                background: `linear-gradient(135deg, ${warm} 0%, ${danger} 100%)`,
                boxShadow: `0 8px 24px ${alpha(danger, 0.45)}, inset 0 1px 0 ${alpha("#fff", 0.35)}`,
                transition: "transform .2s ease, box-shadow .2s ease",
                "&:hover": { transform: "translateY(-2px) scale(1.06)" },
                "&:active": { transform: "scale(0.94)" },
                "&:focus-visible": { outline: `3px solid ${alpha(danger, 0.5)}`, outlineOffset: 3 },
              }}
            >
              {busy ? (
                <CircularProgress size={size * 0.5} thickness={5} sx={{ color: "#fff" }} />
              ) : (
                <MotionBox
                  animate={reduceMotion ? undefined : { rotate: [0, -14, 12, -8, 6, 0] }}
                  transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" }}
                  sx={{ display: "flex" }}
                >
                  <BugReportOutlined sx={{ fontSize: size * 0.52 }} />
                </MotionBox>
              )}
            </ButtonBase>

            {!busy && (
              <IconButton
                size="small"
                aria-label="Закрыть кнопку"
                onClick={onDismiss}
                sx={{
                  position: "absolute",
                  top: -8,
                  right: -8,
                  width: 20,
                  height: 20,
                  bgcolor: "background.paper",
                  border: 1,
                  borderColor: "divider",
                  boxShadow: 1,
                  "&:hover": { bgcolor: "background.paper" },
                }}
              >
                <CloseRounded sx={{ fontSize: 12 }} />
              </IconButton>
            )}
          </Box>
        </MotionBox>
      )}
    </AnimatePresence>
  );
};

export default BugFab;
