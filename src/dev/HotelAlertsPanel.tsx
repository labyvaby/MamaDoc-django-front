/**
 * Ресепшен: что требует действия прямо сейчас (r4 §11) — гость заезжает в
 * течение часа и не заселён, уборка просрочена, гость выезжает с долгом.
 * Сервер проверяет раз в 5 минут и шлёт hotel.alert по сокету — тогда
 * список обновляется сразу. Старый сервер без ручки — панели нет.
 */
import React from "react";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { ApiError } from "../api/client";
import { getHotelAlerts } from "../api/hotel";
import { fmtMoney } from "./hotelReportFormat";
import { plural, Surface } from "./hotelUi";
import { useHotelSocketConnected } from "./hotelRealtime";

const KIND_LABELS: Record<string, string> = { checkout: "после выезда", stayover: "текущая", inspection: "проверка", maintenance: "ремонт" };

/** «40 мин», «3 ч 10 мин», «16 дн.» — сколько осталось или просрочено. */
function minutesText(min: number): string {
  if (min < 60) return `${min} мин`;
  if (min < 24 * 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} ч ${m} мин` : `${h} ч`;
  }
  return `${Math.floor(min / (24 * 60))} дн.`;
}

export const HotelAlertsPanel: React.FC<{ propertyId: number; onOpen: (reservationId: number) => void }> = ({ propertyId, onOpen }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const socket = useHotelSocketConnected();
  const query = useQuery({
    queryKey: ["hotel", "alerts", propertyId],
    queryFn: ({ signal }) => getHotelAlerts(propertyId, signal),
    // Сокет жив — сервер сам скажет; без него — опрос раз в минуту.
    refetchInterval: socket ? 5 * 60_000 : 60_000,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 404 || err.status === 403)) && count < 1,
  });
  const a = query.data;
  if (!a) return null;
  const groups = [
    {
      key: "arriving",
      color: theme.palette.info.main,
      icon: <ScheduleOutlined fontSize="small" />,
      title: "Заезд в течение часа",
      rows: a.arrivingSoon.map((r) => ({
        id: `a${r.reservationId}`,
        main: `${r.guestName}${r.rooms.length ? ` · ${r.rooms.join(", ")}` : ""}`,
        side: `${r.arrivalTime} · через ${minutesText(r.minutesLeft)}`,
        onClick: () => onOpen(r.reservationId),
      })),
    },
    {
      key: "debt",
      color: theme.palette.error.main,
      icon: <PaymentsOutlined fontSize="small" />,
      title: "Выезд с долгом",
      rows: a.departingWithDebt.map((r) => ({
        id: `d${r.reservationId}`,
        main: `${r.guestName}${r.rooms.length ? ` · ${r.rooms.join(", ")}` : ""}`,
        side: `${fmtMoney(r.balanceDue, r.currency)} · до ${r.departureTime}`,
        onClick: () => onOpen(r.reservationId),
      })),
    },
    {
      key: "housekeeping",
      color: theme.palette.warning.main,
      icon: <CleaningServicesOutlined fontSize="small" />,
      title: "Уборка просрочена",
      rows: a.overdueHousekeeping.map((t) => ({
        id: `h${t.taskId}`,
        main: `Номер ${t.roomNumber} · ${KIND_LABELS[t.kind] ?? t.kind} · ${t.assignedToName || "не назначена"}`,
        side: `на ${minutesText(t.minutesOverdue)}`,
        onClick: () => navigate("/housekeeping"),
      })),
    },
  ].filter((g) => g.rows.length > 0);
  if (groups.length === 0) return null;

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: `repeat(${groups.length}, minmax(0, 1fr))` }, gap: 1.5 }}>
      {groups.map((g) => (
        <Surface key={g.key} padded={false} sx={{ overflow: "hidden", borderColor: alpha(g.color, 0.35) }}>
          <Stack direction="row" alignItems="center" gap={1} sx={{ px: 2, py: 1.25, bgcolor: alpha(g.color, theme.palette.mode === "dark" ? 0.14 : 0.07), color: g.color }}>
            {g.icon}
            <Typography variant="body2" fontWeight={700} sx={{ flex: 1, color: "text.primary" }}>
              {g.title}
            </Typography>
            <Typography variant="body2" fontWeight={800} sx={{ fontVariantNumeric: "tabular-nums" }}>
              {g.rows.length}
            </Typography>
          </Stack>
          {g.rows.slice(0, 4).map((r) => (
            <ButtonBase
              key={r.id}
              component="div"
              onClick={r.onClick}
              sx={{ display: "flex", width: "100%", textAlign: "left", gap: 1.5, px: 2, py: 1, borderTop: 1, borderColor: "divider", "&:hover": { bgcolor: "action.hover" } }}
            >
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                {r.main}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {r.side}
              </Typography>
            </ButtonBase>
          ))}
          {g.rows.length > 4 && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2, py: 0.75, borderTop: 1, borderColor: "divider" }}>
              и ещё {g.rows.length - 4} {plural(g.rows.length - 4, "позиция", "позиции", "позиций")}
            </Typography>
          )}
        </Surface>
      ))}
    </Box>
  );
};

export default HotelAlertsPanel;
