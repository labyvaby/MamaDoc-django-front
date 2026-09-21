/**
 * «Настройки» → «Интеграции» — каналы продаж отеля (Viva). Вкладка рельса
 * SettingsLayout.tsx, видна только vertical==="hotel" (useVisibleSettingsTabs),
 * маршрут /settings/integrations гейтит hotel.channels.manage (см. App.tsx,
 * accessPermissions.ts); старый /integrations редиректит сюда. Аналога в
 * медицинской вертикали нет, поэтому своя страница, а не переиспользование
 * существующей. Реальный бэкенд — GET/POST /hotel/channels/... (см.
 * src/api/hotel.ts): список из четырёх площадок фиксирован бэкендом,
 * «Подключить»/«Отключить» — настоящий тумблер состояния объекта, реальной
 * синхронизации брони/цен с площадками нет (см. hotel-viva-frontend-api.md §4.9).
 */
import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import HubOutlined from "@mui/icons-material/HubOutlined";
import LinkOffOutlined from "@mui/icons-material/LinkOffOutlined";
import { Navigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../hooks/usePageTitle";
import { SettingsLayout } from "../pages/settings/SettingsLayout";
import { formatHotelDateTime, initialsOf, useIsVivaActive } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
import { listChannels, connectChannel, disconnectChannel, type HotelChannel } from "../api/hotel";
import { getErrorMessage } from "../api/client";

export const HotelIntegrationsPage: React.FC = () => {
  usePageTitle("Интеграции");
  const theme = useTheme();
  const vivaActive = useIsVivaActive();
  const { property } = useHotelProperty();
  const queryClient = useQueryClient();

  const channelsQuery = useQuery({
    queryKey: ["hotel", "channels", property?.id],
    queryFn: ({ signal }) => listChannels(property!.id, signal),
    enabled: property != null,
  });
  const channels = channelsQuery.data ?? [];

  const [toast, setToast] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);

  // После хуков (Rules of Hooks) — страница доступна только Viva, у
  // остальных организаций такого канал-менеджера нет.
  if (!vivaActive) return <Navigate to="/" replace />;

  const handleToggle = async (channel: HotelChannel) => {
    if (!property) return;
    setPending(channel.channel);
    setError(null);
    try {
      if (channel.isConnected) await disconnectChannel(channel.channel, property.id);
      else await connectChannel(channel.channel, property.id);
      void queryClient.invalidateQueries({ queryKey: ["hotel", "channels", property.id] });
      setToast(!channel.isConnected ? `${channel.name} подключён к Viva` : `${channel.name} отключён`);
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось изменить статус подключения"));
    } finally {
      setPending(null);
    }
  };

  return (
    <SettingsLayout>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <HubOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            Интеграции
          </Typography>
        </Stack>
        {channels.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            Подключено: {channels.filter((c) => c.isConnected).length} из {channels.length}
          </Typography>
        )}
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ mb: 2.5, fontSize: "0.8rem" }}>
        Каналы продаж для синхронизации броней, цен и доступности номеров. Переключатель сохраняется
        на бэкенде, но настоящей синхронизации с площадками пока нет.
      </Alert>

      {error && (
        <Alert severity="error" variant="outlined" sx={{ mb: 2, fontSize: "0.8rem" }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {channelsQuery.isLoading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <Stack gap={1.5} sx={{ maxWidth: 640 }}>
          {channels.map((channel) => {
            const connected = channel.isConnected;
            const busy = pending === channel.channel;
            return (
              <Stack
                key={channel.channel}
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
                  {initialsOf(channel.name)}
                </Avatar>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {channel.name}
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
                    {channel.description}
                  </Typography>
                  {connected && channel.lastSyncAt && (
                    <Typography variant="caption" color="text.disabled" display="block">
                      Последняя синхронизация: {formatHotelDateTime(channel.lastSyncAt)}
                    </Typography>
                  )}
                </Box>

                <Button
                  size="small"
                  variant={connected ? "outlined" : "contained"}
                  color={connected ? "inherit" : "primary"}
                  startIcon={connected ? <LinkOffOutlined fontSize="small" /> : undefined}
                  onClick={() => void handleToggle(channel)}
                  disabled={busy}
                  sx={{ flexShrink: 0 }}
                >
                  {busy ? "…" : connected ? "Отключить" : "Подключить"}
                </Button>
              </Stack>
            );
          })}
        </Stack>
      )}

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
    </SettingsLayout>
  );
};

export default HotelIntegrationsPage;
