/**
 * «Интеграции» — каналы продаж отеля (Viva). Новый раздел, аналога в
 * медицинской вертикали нет, поэтому у него своя страница и свой маршрут
 * (см. App.tsx), а не переиспользование существующей (как /patients у
 * HotelGuestsPage). Список каналов и состояние подключения — mockDemoData.ts,
 * переключение «Подключить»/«Отключить» реально сохраняется в localStorage
 * этой вкладки, а не просто меняет цвет кнопки.
 */
import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import LinkOffOutlined from "@mui/icons-material/LinkOffOutlined";
import { Navigate } from "react-router";

import { usePageTitle } from "../hooks/usePageTitle";
import {
  HOTEL_INTEGRATIONS_CATALOG,
  formatHotelDateTime,
  getIntegrationsSnapshot,
  initialsOf,
  isVivaActive,
  setIntegrationConnected,
  subscribeIntegrations,
} from "./mockDemoData";

export const HotelIntegrationsPage: React.FC = () => {
  usePageTitle("Интеграции");
  const theme = useTheme();
  const states = React.useSyncExternalStore(subscribeIntegrations, getIntegrationsSnapshot);
  const [toast, setToast] = React.useState<string | null>(null);

  // После хука useSyncExternalStore (Rules of Hooks) — страница доступна
  // только Viva, у остальных организаций такого канал-менеджера нет.
  if (!isVivaActive()) return <Navigate to="/" replace />;

  const handleToggle = (id: string, name: string, connected: boolean) => {
    setIntegrationConnected(id, !connected);
    setToast(!connected ? `${name} подключён к Viva` : `${name} отключён`);
  };

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Интеграции
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Подключено: {Object.values(states).filter((s) => s.connected).length} из {HOTEL_INTEGRATIONS_CATALOG.length}
        </Typography>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ mb: 2.5, fontSize: "0.8rem" }}>
        Каналы продаж для синхронизации броней, цен и доступности номеров. Демо-переключатель — статус
        сохраняется в этом браузере, реальной синхронизации с площадками нет.
      </Alert>

      <Stack gap={1.5} sx={{ maxWidth: 640 }}>
        {HOTEL_INTEGRATIONS_CATALOG.map((integration) => {
          const state = states[integration.id];
          const connected = state?.connected ?? false;
          return (
            <Stack
              key={integration.id}
              direction="row"
              alignItems="center"
              gap={1.75}
              sx={{
                px: 2,
                py: 1.5,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: "12px",
                bgcolor: "background.paper",
              }}
            >
              <Avatar sx={{ bgcolor: "primary.main", fontWeight: 700, flexShrink: 0 }}>
                {initialsOf(integration.name)}
              </Avatar>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {integration.name}
                  </Typography>
                  <Chip
                    size="small"
                    icon={connected ? <CheckCircleOutlined fontSize="small" /> : undefined}
                    label={connected ? "Подключено" : "Не подключено"}
                    sx={{
                      bgcolor: connected
                        ? alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.25 : 0.14)
                        : alpha(theme.palette.text.disabled, 0.14),
                      color: connected ? theme.palette.success.main : "text.secondary",
                      fontWeight: 600,
                    }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary" display="block">
                  {integration.description}
                </Typography>
                {connected && state?.lastSyncAt && (
                  <Typography variant="caption" color="text.disabled" display="block">
                    Последняя синхронизация: {formatHotelDateTime(state.lastSyncAt)}
                  </Typography>
                )}
              </Box>

              <Button
                size="small"
                variant={connected ? "outlined" : "contained"}
                color={connected ? "inherit" : "primary"}
                startIcon={connected ? <LinkOffOutlined fontSize="small" /> : undefined}
                onClick={() => handleToggle(integration.id, integration.name, connected)}
                sx={{ flexShrink: 0 }}
              >
                {connected ? "Отключить" : "Подключить"}
              </Button>
            </Stack>
          );
        })}
      </Stack>

      <Snackbar
        open={toast != null}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ width: "100%" }}>
          {toast}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default HotelIntegrationsPage;
