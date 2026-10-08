/**
 * «Выезды сегодня» на странице «Уборка» — заказчик: у каждой горничной список
 * номеров, которые сегодня выезжают в 12:00 или с поздним выездом (во
 * сколько). GET housekeeping-departures/ (право hotel.housekeeping.view —
 * брони горничная не видит): номер, время (поздний выезд брони или правило
 * объекта, после выезда — фактическое), выехал ли гость, горничная этажа по
 * графику. «Только мои» — этажи вошедшей горничной (mine=true).
 *
 * Ошибка запроса — блока просто нет, страница уборки работает как раньше. 404
 * здесь — не «нет эндпоинта», а недоступный объект (чужой филиал), поэтому
 * запоминать его на всю страницу нельзя: у другого объекта блок должен быть.
 */
import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";

import { getHousekeepingDepartures, type HotelHousekeepingDeparture } from "../api/hotel";
import { plural, SectionLabel, Surface } from "./hotelUi";

export const HousekeepingDepartures: React.FC<{ propertyId: number; mine: boolean }> = ({ propertyId, mine }) => {
  const query = useQuery({
    queryKey: ["hotel", "housekeepingDepartures", propertyId, mine],
    queryFn: ({ signal }) => getHousekeepingDepartures({ propertyId, mine }, signal),
    retry: false,
    staleTime: 30_000,
    // Гости выезжают в течение дня — список сам освежается.
    refetchInterval: 120_000,
  });
  const data = query.data;
  if (!data) return null;
  const rooms = data.rooms;
  const left = rooms.filter((r) => r.stayStatus === "checked_out").length;

  return (
    <Box>
      <SectionLabel>
        Выезды сегодня{rooms.length > 0 ? ` · ${rooms.length} ${plural(rooms.length, "номер", "номера", "номеров")}` : ""}
        {left > 0 ? ` · ${left} уже ${plural(left, "выехал", "выехали", "выехали")}` : ""}
      </SectionLabel>
      {rooms.length === 0 ? (
        <Surface sx={{ py: 1.5, bgcolor: "transparent", borderStyle: "dashed" }}>
          <Typography variant="body2" color="text.secondary">
            {/* «Только мои» — по графику дня: этаж из двух постов закреплён за первым постом,
                поэтому не «на ваших этажах выездов нет», а «за вами». */}
            {mine ? "По графику за вами сегодня выездов нет." : "Сегодня выездов нет."} Выезд по правилам — в {data.checkOutTime}.
          </Typography>
        </Surface>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(auto-fill, minmax(170px, 1fr))" }, gap: 1 }}>
          {rooms.map((r) => (
            <DepartureCard key={r.reservationItemId} room={r} showHousekeeper={!mine} />
          ))}
        </Box>
      )}
    </Box>
  );
};

const DepartureCard: React.FC<{ room: HotelHousekeepingDeparture; showHousekeeper: boolean }> = ({ room, showHousekeeper }) => {
  const theme = useTheme();
  const gone = room.stayStatus === "checked_out";
  const tone = gone ? theme.palette.success.main : room.isLate ? theme.palette.warning.main : theme.palette.text.secondary;
  return (
    <Surface
      sx={{
        p: 1.5,
        borderLeft: `3px solid ${tone}`,
        bgcolor: gone ? alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.1 : 0.05) : undefined,
      }}
    >
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1}>
        <Typography sx={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{room.roomNumber}</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: gone ? "success.main" : room.isLate ? "warning.main" : "text.primary" }}>
          {room.departureTime}
        </Typography>
      </Stack>
      <Typography variant="caption" sx={{ display: "block", fontWeight: 600, color: tone }}>
        {gone ? "выехал — можно убирать" : room.isLate ? "поздний выезд" : room.stayStatus === "expected" ? "выезд по брони" : "выезд"}
      </Typography>
      {(room.floor || (showHousekeeper && room.housekeeperName)) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
          {[room.floor && `${room.floor} этаж`, showHousekeeper && room.housekeeperName].filter(Boolean).join(" · ")}
        </Typography>
      )}
    </Surface>
  );
};

export default HousekeepingDepartures;
