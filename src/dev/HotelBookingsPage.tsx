/**
 * «Бронирования» отеля (Viva): кнопка «Создать бронь», полоса загрузки на дату
 * и шахматка номеров. Раньше это была ветка vivaActive внутри клиничной
 * страницы расписания (pages/schedule/django), и та, пряча вкладки смен,
 * всё равно монтировала свои запросы — правила и исключения расписания,
 * 200 сотрудников, записи в дни отсутствия (по ~2 с каждый, в одной очереди
 * с отельными). Теперь маршрут /schedule у отеля ведёт сюда
 * (pages/schedule/ScheduleRouter.tsx), и клиничный код расписания отелю даже
 * не скачивается.
 */
import React from "react";
import { Box, Stack } from "@mui/material";

import { usePageTitle } from "../hooks/usePageTitle";
import { useCan } from "../hooks/useCan";
import { CreateBookingButton } from "./CreateBookingButton";
import { HotelOccupancyBanner } from "./HotelOccupancyBanner";
import { RoomBookingGrid } from "./RoomBookingGrid";

export const HotelBookingsPage: React.FC = () => {
  usePageTitle("Бронирования");
  // «Создать бронь» — hotel.reservations.manage (у администратора/ресепшена);
  // schedule.manage оставлен ради прежних ролей, где бронь давали через него.
  const canManageBookings = useCan(["schedule.manage", "hotel.reservations.manage"]);

  return (
    <Box
      sx={(t) => ({
        height: {
          xs: `calc(100dvh - ${t.appLayout.header.height.mobile}px)`,
          md: `calc(100dvh - ${t.appLayout.header.height.desktop}px)`,
        },
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      })}
    >
      <Box sx={(t) => ({ px: t.appLayout.page.paddingX, pt: 0, pb: 1.5 })}>
        <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" useFlexGap>
          {canManageBookings && <CreateBookingButton />}
        </Stack>
      </Box>

      {/* Полоса + шахматка + легенда в фиксированную высоту не влезают —
          скроллим контейнер, шахматка внутри скроллится сама по датам. */}
      <Box
        sx={(t) => ({
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: t.appLayout.page.paddingX,
          pb: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        })}
      >
        <HotelOccupancyBanner />
        <RoomBookingGrid />
      </Box>
    </Box>
  );
};

export default HotelBookingsPage;
