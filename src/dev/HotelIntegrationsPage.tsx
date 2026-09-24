/**
 * «Настройки» → «Интеграции» — каналы продаж отеля (Viva). Вкладка рельса
 * SettingsLayout.tsx, видна только vertical==="hotel" (useVisibleSettingsTabs),
 * маршрут /settings/integrations гейтит hotel.channels.manage (см. App.tsx,
 * accessPermissions.ts); старый /integrations редиректит сюда.
 *
 * Два экрана в одном месте (hotel-channex-integration.md, 24.09.2026):
 * — пока Channex объекту не подключён (GET .../channex/ → 409 CHANNEX_DISABLED),
 *   показываем старый экран первого этапа — фиксированные 4 канала,
 *   переключатель без настоящей синхронизации (src/api/hotel.ts listChannels/
 *   connectChannel/disconnectChannel, см. hotel-viva-frontend-api.md §4.9);
 * — как только Channex включён бэкендом, вместо переключателей показываем
 *   настоящий экран управления: статус, пуш изменений, полная синхронизация,
 *   маппинг номеров/тарифов (iframe channels-session), список последних
 *   отправок и брони, требующих внимания.
 */
import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import HubOutlined from "@mui/icons-material/HubOutlined";
import LinkOffOutlined from "@mui/icons-material/LinkOffOutlined";
import PauseCircleOutlined from "@mui/icons-material/PauseCircleOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import SyncOutlined from "@mui/icons-material/SyncOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import { Navigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../hooks/usePageTitle";
import { SettingsLayout } from "../pages/settings/SettingsLayout";
import { formatHotelDateTime, initialsOf, useIsVivaActive } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
import { HotelStatCard } from "./HotelStatCard";
import {
  listChannels,
  connectChannel,
  disconnectChannel,
  getChannexStatus,
  connectChannex,
  pauseChannex,
  fullSyncChannex,
  createChannexChannelsSession,
  retryChannexRevision,
  type HotelChannel,
  type HotelChannexStatus,
} from "../api/hotel";
import { getErrorCode, getErrorMessage } from "../api/client";

export const HotelIntegrationsPage: React.FC = () => {
  usePageTitle("Интеграции");
  const vivaActive = useIsVivaActive();
  const { property } = useHotelProperty();

  const channexQuery = useQuery({
    queryKey: ["hotel", "channex", property?.id],
    queryFn: ({ signal }) => getChannexStatus(property!.id, signal),
    enabled: property != null,
    retry: false,
  });
  const channexDisabled = getErrorCode(channexQuery.error) === "CHANNEX_DISABLED";

  // После хуков (Rules of Hooks) — страница доступна только Viva, у
  // остальных организаций такого канал-менеджера нет.
  if (!vivaActive) return <Navigate to="/" replace />;

  if (property != null && channexQuery.isLoading) {
    return (
      <SettingsLayout>
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      </SettingsLayout>
    );
  }

  if (property == null || channexDisabled) {
    return <LegacyChannelsPanel />;
  }

  if (channexQuery.isError) {
    return (
      <SettingsLayout>
        <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2.5 }}>
          <HubOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            Интеграции
          </Typography>
        </Stack>
        <Alert
          severity="error"
          variant="outlined"
          sx={{ maxWidth: 640 }}
          action={
            <Button size="small" onClick={() => void channexQuery.refetch()}>
              Повторить
            </Button>
          }
        >
          {getErrorMessage(channexQuery.error, "Не удалось получить статус подключения Channex")}
        </Alert>
      </SettingsLayout>
    );
  }

  return <ChannexPanel status={channexQuery.data!} propertyId={property!.id} />;
};

// ── Первый этап: фиксированные 4 канала, тумблер без настоящей синхронизации ──

const LegacyChannelsPanel: React.FC = () => {
  const theme = useTheme();
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

// ── Channex подключён: настоящий экран управления ──────────────────────────

const CHANNEX_STATE_META: Record<
  NonNullable<HotelChannexStatus["state"]> | "disconnected",
  { label: string; color: "default" | "success" | "warning" | "error" | "info" }
> = {
  connecting: { label: "Подключение…", color: "info" },
  active: { label: "Активен", color: "success" },
  paused: { label: "На паузе", color: "warning" },
  error: { label: "Ошибка", color: "error" },
  disconnected: { label: "Не подключён", color: "default" },
};

const ChannexPanel: React.FC<{ status: HotelChannexStatus; propertyId: number }> = ({ status, propertyId }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [mappingSession, setMappingSession] = React.useState<{ url: string } | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "channex", propertyId] });

  const meta = CHANNEX_STATE_META[status.connected ? status.state ?? "connecting" : "disconnected"];

  const runAction = async (key: string, action: () => Promise<unknown>, successMessage: string) => {
    setBusy(key);
    setActionError(null);
    try {
      await action();
      invalidate();
      setToast(successMessage);
    } catch (err) {
      if (getErrorCode(err) === "FULL_SYNC_TOO_OFTEN") {
        const availableAt = (err as { details?: { availableAt?: string } }).details?.availableAt;
        setActionError(
          availableAt
            ? `Полная синхронизация уже запускалась недавно — доступна снова после ${formatHotelDateTime(availableAt)}`
            : "Полная синхронизация уже запускалась недавно, попробуйте позже",
        );
      } else {
        setActionError(getErrorMessage(err, "Не удалось выполнить действие"));
      }
    } finally {
      setBusy(null);
    }
  };

  const openMapping = async () => {
    setBusy("mapping");
    setActionError(null);
    try {
      const session = await createChannexChannelsSession(propertyId);
      setMappingSession({ url: session.url });
    } catch (err) {
      setActionError(
        getErrorCode(err) === "CHANNEX_UNAVAILABLE"
          ? "Channex временно недоступен, попробуйте позже"
          : getErrorMessage(err, "Не удалось открыть маппинг каналов"),
      );
    } finally {
      setBusy(null);
    }
  };

  const retryAttention = async (id: number) => {
    setBusy(`attention-${id}`);
    setActionError(null);
    try {
      await retryChannexRevision(propertyId, id);
      invalidate();
      setToast("Повтор отправки запущен");
    } catch (err) {
      setActionError(getErrorMessage(err, "Не удалось повторить отправку"));
    } finally {
      setBusy(null);
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
          <Chip
            size="small"
            label={meta.label}
            color={meta.color === "default" ? undefined : meta.color}
            sx={
              meta.color === "default"
                ? { bgcolor: alpha(theme.palette.text.disabled, 0.14), color: "text.secondary", fontWeight: 600 }
                : { fontWeight: 600 }
            }
          />
        </Stack>

        <Stack direction="row" gap={1} flexWrap="wrap">
          {!status.connected && (
            <Button
              size="small"
              variant="contained"
              startIcon={<PlayCircleOutlined fontSize="small" />}
              disabled={busy != null}
              onClick={() => void runAction("connect", () => connectChannex(propertyId), "Channex подключается")}
            >
              {busy === "connect" ? "…" : "Подключить"}
            </Button>
          )}
          {status.connected && status.state === "paused" && (
            <Button
              size="small"
              variant="contained"
              startIcon={<PlayCircleOutlined fontSize="small" />}
              disabled={busy != null}
              onClick={() => void runAction("connect", () => connectChannex(propertyId), "Channex возобновлён")}
            >
              {busy === "connect" ? "…" : "Возобновить"}
            </Button>
          )}
          {status.connected && status.state === "active" && (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<PauseCircleOutlined fontSize="small" />}
              disabled={busy != null}
              onClick={() => void runAction("pause", () => pauseChannex(propertyId), "Channex приостановлен")}
            >
              {busy === "pause" ? "…" : "Приостановить"}
            </Button>
          )}
          {status.connected && status.state === "error" && (
            <Button
              size="small"
              variant="contained"
              color="warning"
              startIcon={<RefreshOutlined fontSize="small" />}
              disabled={busy != null}
              onClick={() => void runAction("connect", () => connectChannex(propertyId), "Переподключение запущено")}
            >
              {busy === "connect" ? "…" : "Переподключить"}
            </Button>
          )}
          {status.connected && (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<SyncOutlined fontSize="small" />}
              disabled={busy != null}
              onClick={() =>
                void runAction("full-sync", () => fullSyncChannex(propertyId), "Полная синхронизация запущена")
              }
            >
              {busy === "full-sync" ? "…" : "Полная синхронизация"}
            </Button>
          )}
          {status.connected && (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<TuneOutlined fontSize="small" />}
              disabled={busy != null}
              onClick={() => void openMapping()}
            >
              {busy === "mapping" ? "…" : "Маппинг номеров"}
            </Button>
          )}
        </Stack>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ mb: 2.5, fontSize: "0.8rem" }}>
        Channex синхронизирует брони, цены и доступность номеров с Booking.com, Airbnb и Expedia в реальном времени.
      </Alert>

      {actionError && (
        <Alert
          severity="error"
          variant="outlined"
          sx={{ mb: 2, fontSize: "0.8rem" }}
          onClose={() => setActionError(null)}
        >
          {actionError}
        </Alert>
      )}

      {status.lastError && (
        <Alert severity="error" variant="outlined" sx={{ mb: 2.5, fontSize: "0.8rem" }} icon={<ErrorOutlineOutlined />}>
          {status.lastError}
          {status.lastErrorAt && (
            <Typography variant="caption" color="text.disabled" display="block">
              {formatHotelDateTime(status.lastErrorAt)}
            </Typography>
          )}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 1.5,
          mb: 3,
          maxWidth: 900,
        }}
      >
        <HotelStatCard label="Ожидают отправки" value={status.pendingChanges} tint={status.pendingChanges > 0 ? "warning" : "success"} />
        <HotelStatCard label="Категорий сопоставлено" value={status.mappedRoomTypes} tint="info" />
        <HotelStatCard label="Тарифов сопоставлено" value={status.mappedRatePlans} tint="info" />
        <HotelStatCard
          label="Последняя отправка"
          value={status.lastPushAt ? formatHotelDateTime(status.lastPushAt) : "—"}
          tint="primary"
        />
        <HotelStatCard
          label="Последняя полная синхронизация"
          value={status.fullSyncAt ? formatHotelDateTime(status.fullSyncAt) : "—"}
          tint="primary"
        />
      </Box>

      <Stack direction={{ xs: "column", md: "row" }} gap={3} sx={{ maxWidth: 1100 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Недавние отправки
          </Typography>
          {status.recentPushes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Отправок ещё не было.
            </Typography>
          ) : (
            <Stack gap={1}>
              {status.recentPushes.map((push, i) => (
                <Box
                  key={i}
                  sx={{ px: 1.75, py: 1.25, border: "1px solid", borderColor: "divider", borderRadius: "10px" }}
                >
                  <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                    <Typography variant="body2" fontWeight={600}>
                      {push.isFullSync ? "Полная синхронизация" : push.kind}
                    </Typography>
                    <Chip
                      size="small"
                      label={push.status}
                      color={push.error ? "error" : push.status === "success" ? "success" : "default"}
                    />
                    {push.warningsCount > 0 && (
                      <Chip size="small" color="warning" label={`Предупреждений: ${push.warningsCount}`} />
                    )}
                  </Stack>
                  {(push.dateFrom || push.dateTo) && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {push.dateFrom ?? "…"} — {push.dateTo ?? "…"}, значений: {push.valuesCount}
                    </Typography>
                  )}
                  {push.error && (
                    <Typography variant="caption" color="error.main" display="block">
                      {push.error}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.disabled" display="block">
                    {formatHotelDateTime(push.createdAt)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Требует внимания
          </Typography>
          {status.attention.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Всё в порядке, вмешательство не требуется.
            </Typography>
          ) : (
            <Stack gap={1}>
              {status.attention.map((item) => (
                <Box
                  key={item.id}
                  sx={{ px: 1.75, py: 1.25, border: "1px solid", borderColor: "divider", borderRadius: "10px" }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                    <Typography variant="body2" fontWeight={600}>
                      {item.otaName}
                      {item.otaReservationCode ? ` · ${item.otaReservationCode}` : ""}
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<RefreshOutlined fontSize="small" />}
                      disabled={busy != null}
                      onClick={() => void retryAttention(item.id)}
                    >
                      {busy === `attention-${item.id}` ? "…" : "Повторить"}
                    </Button>
                  </Stack>
                  {(item.arrivalDate || item.departureDate) && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {item.arrivalDate ?? "…"} — {item.departureDate ?? "…"}
                    </Typography>
                  )}
                  <Typography variant="caption" color="error.main" display="block">
                    {item.message}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>

      <Dialog open={mappingSession != null} onClose={() => setMappingSession(null)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Маппинг номеров и тарифов Channex
          <IconButton size="small" onClick={() => setMappingSession(null)}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ p: 0, height: "75vh" }}>
          {mappingSession && (
            <iframe
              src={mappingSession.url}
              title="Channex channels mapping"
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          )}
        </DialogContent>
      </Dialog>

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
