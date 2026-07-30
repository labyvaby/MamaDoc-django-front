import React from "react";
import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";

import { useProfileCompleteness } from "../../hooks/useProfileCompleteness";
import { AppButton, AppCard } from "../ui";

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
    <MotionBox
      key="profile-completion-banner"
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      sx={{ width: "100%", maxWidth: 720, pointerEvents: "auto" }}
    >
      <AppCard
        variant="outlined"
        elevation={0}
        disableContentPadding
        sx={(t) => ({
          position: "relative",
          borderColor: alpha(t.palette.primary.main, 0.35),
          bgcolor: "background.paper",
        })}
      >
        <Stack
          direction="row"
          alignItems="flex-start"
          spacing={1.5}
          sx={{
            p: { xs: 1.5, sm: 1.75 },
            pb: { xs: 0, md: 1.75 },
            pr: { xs: 7, md: 1.75 },
          }}
        >
          <Box
            sx={(t) => ({
              width: 40,
              height: 40,
              borderRadius: "10px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "primary.onSurface",
              bgcolor: alpha(
                t.palette.primary.main,
                t.palette.mode === "dark" ? 0.16 : 0.1
              ),
              "& .MuiSvgIcon-root": { fontSize: 20 },
            })}
          >
            <WarningAmberOutlined />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, pt: 0.125 }}>
            <Typography
              variant="body2"
              fontWeight={700}
              sx={{ letterSpacing: -0.1, lineHeight: 1.35 }}
            >
              Настройте профиль до конца
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.25, lineHeight: 1.4 }}
            >
              Необходимо указать: {criticalLabelsFormatted}
            </Typography>
          </Box>

          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ display: { xs: "none", md: "flex" }, flexShrink: 0 }}
          >
            <AppButton
              variant="contained"
              size="small"
              endIcon={<ArrowForwardOutlined fontSize="small" />}
              onClick={handleGoToProfile}
              sx={{ whiteSpace: "nowrap" }}
            >
              До настроить
            </AppButton>
            <Tooltip title="Закрыть напоминание" placement="bottom">
              <IconButton
                aria-label="Закрыть напоминание"
                onClick={dismissForToday}
                sx={(t) => ({
                  width: 40,
                  height: 40,
                  borderRadius: "10px",
                  border: 1,
                  borderColor: "divider",
                  color: "text.secondary",
                  "&:hover": {
                    color: "text.primary",
                    borderColor: alpha(t.palette.primary.main, 0.35),
                  },
                  "& .MuiSvgIcon-root": { fontSize: 19 },
                })}
              >
                <CloseOutlined />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <Box sx={{ display: { xs: "block", md: "none" }, p: 1.5, pt: 1.25 }}>
          <AppButton
            variant="contained"
            size="small"
            fullWidth
            endIcon={<ArrowForwardOutlined fontSize="small" />}
            onClick={handleGoToProfile}
          >
            До настроить
          </AppButton>
        </Box>

        <Tooltip title="Закрыть напоминание" placement="bottom">
          <IconButton
            aria-label="Закрыть напоминание"
            onClick={dismissForToday}
            sx={(t) => ({
              display: { xs: "inline-flex", md: "none" },
              position: "absolute",
              top: 12,
              right: 12,
              width: 40,
              height: 40,
              borderRadius: "10px",
              border: 1,
              borderColor: "divider",
              color: "text.secondary",
              "&:hover": {
                color: "text.primary",
                borderColor: alpha(t.palette.primary.main, 0.35),
              },
              "& .MuiSvgIcon-root": { fontSize: 19 },
            })}
          >
            <CloseOutlined />
          </IconButton>
        </Tooltip>
      </AppCard>
    </MotionBox>
  );
};
