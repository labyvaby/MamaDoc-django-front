import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  Stack,
  Divider,
  Typography,
} from "@mui/material";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import Brightness4Outlined from "@mui/icons-material/Brightness4Outlined";
import NotificationsOutlined from "@mui/icons-material/NotificationsOutlined";
import SettingsSystemDaydreamOutlined from "@mui/icons-material/SettingsSystemDaydreamOutlined";
import { logout as djangoLogout } from "../../api";
import { useAppVersion } from "../../api/appVersion";
import { ColorModeContext } from "../../contexts/color-mode";
import { Link as RouterLink } from "react-router";
import { useCan } from "../../hooks/useCan";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
}) => {
  const { mode, setScheme } = React.useContext(ColorModeContext);
  const appVersion = useAppVersion();
  const canManageSkud = useCan(PAGE_PERMISSIONS.attendanceSettings);
  const canManageNotifications = useCan(PAGE_PERMISSIONS.notifications);

  const handleLogout = async () => {
    try {
      await djangoLogout();
    } finally {
      onClose();
      window.location.href = '/login';
    }
  };

  const handleToggleTheme = () => {
    setScheme(mode === "dark" ? "light" : "dark");
  };

  const skudSettingsButton = (
    <Button
      variant="outlined"
      fullWidth
      component={RouterLink}
      to="/settings/skud"
      onClick={onClose}
      startIcon={<SettingsSystemDaydreamOutlined />}
    >
      Настройка СКУД
    </Button>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Настройки</DialogTitle>
      <Divider />
      <DialogContent sx={{ pb: 3 }}>
        <Stack spacing={2}>
          {canManageSkud ? skudSettingsButton : null}

          {canManageNotifications ? (
              <Button
                variant="outlined"
                fullWidth
                component={RouterLink}
                to="/settings/notifications"
                onClick={onClose}
                startIcon={<NotificationsOutlined />}
              >
                Настройка уведомлений
              </Button>
            ) : null}

          <Button
            variant="outlined"
            fullWidth
            onClick={handleToggleTheme}
            startIcon={<Brightness4Outlined />}
          >
            {mode === "dark" ? "Светлая тема" : "Темная тема"}
          </Button>

          <Button
            variant="contained"
            color="error"
            fullWidth
            onClick={handleLogout}
            startIcon={<LogoutOutlined />}
          >
            Выход из аккаунта
          </Button>
        </Stack>

        <Typography
          variant="caption"
          color="text.secondary"
          mt={2}
          display="block"
          textAlign="center"
        >
          Версия Aximo CRM {appVersion}
        </Typography>
      </DialogContent>
    </Dialog>
  );
};
