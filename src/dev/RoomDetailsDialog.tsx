/**
 * Детали номера — открывается кликом по номеру в RoomBookingGrid. Категория
 * (переданная сверху — грид уже загрузил её вместе с шахматкой, второй раз
 * не запрашиваем), доступность на ближайшие 45 дней — GET
 * /hotel/rooms/{id}/availability/ (items + свободные окна уже посчитаны
 * бэкендом, см. hotel-viva-frontend-api.md §4.2).
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import dayjs from "dayjs";

import { getRoomAvailability, type HotelRoomType } from "../api/hotel";
import {
  mapStayDisplayStatus,
  HOTEL_STAY_STATUS_LABELS,
  hotelStayStatusColor,
  HOTEL_ROOM_STATE_LABELS,
  hotelRoomStateColor,
  HOTEL_BOARD_TYPE_LABELS,
} from "./hotelDisplay";
import { formatHotelDateRange, nightsBetween } from "./mockDemoData";

const AVAILABILITY_WINDOW_DAYS = 45;

export interface RoomDetailsDialogProps {
  /** Id номера или null — диалог закрыт. */
  roomId: number | null;
  /** Категории объекта — уже загружены родителем вместе с шахматкой. */
  roomTypes: HotelRoomType[];
  onClose: () => void;
  /** Клик по брони в «Ближайших бронях» — не задан, если детали брони показывать некуда. */
  onReservationClick?: (reservationId: number) => void;
}

export const RoomDetailsDialog: React.FC<RoomDetailsDialogProps> = ({ roomId, roomTypes, onClose, onReservationClick }) => {
  const theme = useTheme();
  const today = dayjs().startOf("day");
  const from = today.format("YYYY-MM-DD");
  const to = today.add(AVAILABILITY_WINDOW_DAYS, "day").format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["hotel", "room-availability", roomId, from, to],
    queryFn: ({ signal }) => getRoomAvailability(roomId!, from, to, signal),
    enabled: roomId != null,
  });
  const availability = query.data;
  const category = availability ? roomTypes.find((c) => c.id === availability.room.roomTypeId) : undefined;

  const upcomingItems = React.useMemo(
    () => (availability ? availability.items.filter((i) => i.stayStatus !== "checked_out").slice(0, 6) : []),
    [availability],
  );

  return (
    <Dialog open={roomId != null} onClose={onClose} maxWidth="sm" fullWidth>
      {roomId != null && availability && (
        <>
          <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pr: 6 }}>
            <Typography variant="h6" component="span" fontWeight={700}>
              Номер {availability.room.number}
            </Typography>
            {category?.isLuxury && (
              <Chip
                icon={<WorkspacePremiumOutlined sx={{ fontSize: 16 }} />}
                label="Люкс"
                size="small"
                sx={{
                  bgcolor: alpha("#d4af37", 0.18),
                  color: theme.palette.mode === "dark" ? "#e9c766" : "#8a6d1a",
                  fontWeight: 600,
                }}
              />
            )}
            <Chip
              label={HOTEL_ROOM_STATE_LABELS[availability.room.state as keyof typeof HOTEL_ROOM_STATE_LABELS] ?? availability.room.state}
              size="small"
              sx={{
                bgcolor: alpha(hotelRoomStateColor(availability.room.state, theme), theme.palette.mode === "dark" ? 0.25 : 0.14),
                color: hotelRoomStateColor(availability.room.state, theme),
                fontWeight: 600,
              }}
            />
            <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ pt: 0 }}>
            {category && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {category.name}
                </Typography>

                <Stack direction="row" gap={3} sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Цена
                    </Typography>
                    <Typography variant="h6" fontWeight={700}>
                      {Number(category.totalPrice).toLocaleString("ru-RU")} сом
                      <Typography component="span" variant="body2" color="text.secondary">
                        {" "}
                        / ночь
                      </Typography>
                    </Typography>
                    {category.amenities.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        база {Number(category.basePrice).toLocaleString("ru-RU")} + характеристики
                      </Typography>
                    )}
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Вместимость
                    </Typography>
                    <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
                      <PersonOutlined fontSize="small" sx={{ color: "text.secondary" }} />
                      <Typography variant="body2" fontWeight={600}>
                        до {category.capacity} гостей
                      </Typography>
                    </Stack>
                  </Box>
                </Stack>

                <Stack direction="row" gap={3} flexWrap="wrap" sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Вид из окна
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {category.view}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Тип кровати
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {category.bedType}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Комната
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {category.roomLayout}
                    </Typography>
                  </Box>
                </Stack>

                {availability.room.mealOptions.length > 0 && (
                  <Box sx={{ mb: 2.5 }}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                      Доп. тарифы
                    </Typography>
                    <Stack direction="row" gap={0.75} flexWrap="wrap">
                      {availability.room.mealOptions.map((t) => (
                        <Chip key={t} label={HOTEL_BOARD_TYPE_LABELS[t] ?? t} size="small" color="primary" variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                )}
              </>
            )}

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Свободен ближайшие {AVAILABILITY_WINDOW_DAYS} дней
            </Typography>
            {availability.freeWindows.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ mb: 2.5 }}>
                Свободных окон нет — номер занят на весь период.
              </Typography>
            ) : (
              <Stack gap={0.75} sx={{ mb: 2.5 }}>
                {availability.freeWindows.map((r) => (
                  <Stack key={`${r.dateFrom}-${r.dateTo}`} direction="row" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: theme.palette.success.main,
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2">{formatHotelDateRange(r.dateFrom, r.dateTo)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      ({nightsBetween(r.dateFrom, r.dateTo)} ноч.)
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Ближайшие брони
            </Typography>
            {upcomingItems.length === 0 ? (
              <Typography variant="body2" color="text.disabled">
                Броней на ближайшее время нет.
              </Typography>
            ) : (
              <Stack gap={1}>
                {upcomingItems.map((it) => {
                  const status = mapStayDisplayStatus(it.stayStatus);
                  const color = hotelStayStatusColor(status, theme);
                  return (
                    <Stack
                      key={it.itemId}
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      gap={1}
                      sx={{
                        px: 1.25,
                        py: 0.75,
                        borderRadius: "8px",
                        bgcolor: theme.palette.mode === "dark" ? alpha("#fff", 0.04) : alpha("#000", 0.03),
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          noWrap
                          component={onReservationClick ? "button" : "p"}
                          onClick={onReservationClick ? () => onReservationClick(it.reservationId) : undefined}
                          sx={
                            onReservationClick
                              ? {
                                  display: "block",
                                  font: "inherit",
                                  fontWeight: 600,
                                  color: "primary.main",
                                  border: 0,
                                  bgcolor: "transparent",
                                  p: 0,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  "&:hover": { textDecoration: "underline" },
                                }
                              : undefined
                          }
                        >
                          {it.customerName || `Бронь №${it.reservationNumber}`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatHotelDateRange(it.checkIn, it.checkOut)}
                        </Typography>
                      </Box>
                      <Chip
                        label={HOTEL_STAY_STATUS_LABELS[status]}
                        size="small"
                        sx={{
                          bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.25 : 0.14),
                          color,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      />
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </DialogContent>
        </>
      )}
    </Dialog>
  );
};

export default RoomDetailsDialog;
