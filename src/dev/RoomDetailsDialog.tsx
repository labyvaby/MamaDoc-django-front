/**
 * Детали номера — открывается кликом по номеру в RoomBookingGrid. Тариф,
 * вместимость, удобства (из HOTEL_ROOM_CATEGORIES) и доступность на
 * ближайшие 45 дней (getRoomAvailability из mockDemoData.ts — сгенерированные
 * брони + созданные вручную через CreateBookingButton, вместе).
 */
import React from "react";
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

import {
  getRoomCategory,
  getRoomAvailability,
  getHotelBookingStatusColor,
  formatHotelDateRange,
  nightsBetween,
  HOTEL_BOOKING_STATUS_LABELS,
  type HotelBooking,
} from "./mockDemoData";

const AVAILABILITY_WINDOW_DAYS = 45;

export interface RoomDetailsDialogProps {
  /** Номер комнаты или null — диалог закрыт. */
  room: string | null;
  onClose: () => void;
  /** Клик по имени гостя в «Ближайших бронях» — не задан, если гостя показывать некуда. */
  onGuestClick?: (guestName: string) => void;
}

export const RoomDetailsDialog: React.FC<RoomDetailsDialogProps> = ({ room, onClose, onGuestClick }) => {
  const theme = useTheme();
  const category = room ? getRoomCategory(room) : undefined;

  const { bookings, freeRanges } = React.useMemo(() => {
    if (!room) return { bookings: [] as HotelBooking[], freeRanges: [] };
    const today = dayjs().startOf("day");
    return getRoomAvailability(
      room,
      today.format("YYYY-MM-DD"),
      today.add(AVAILABILITY_WINDOW_DAYS, "day").format("YYYY-MM-DD"),
    );
  }, [room]);

  const upcomingBookings = bookings.filter((b) => b.status !== "completed").slice(0, 6);

  const statusColor = (status: HotelBooking["status"]) => getHotelBookingStatusColor(status, theme);

  return (
    <Dialog open={room != null} onClose={onClose} maxWidth="sm" fullWidth>
      {room && (
        <>
          <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pr: 6 }}>
            <Typography variant="h6" component="span" fontWeight={700}>
              Номер {room}
            </Typography>
            {category?.luxury && (
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
                      {category.pricePerNight.toLocaleString("ru-RU")} сом
                      <Typography component="span" variant="body2" color="text.secondary">
                        {" "}
                        / ночь
                      </Typography>
                    </Typography>
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

                <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mb: 2.5 }}>
                  {category.amenities.map((a) => (
                    <Chip key={a} label={a} size="small" variant="outlined" />
                  ))}
                </Stack>
              </>
            )}

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Свободен ближайшие {AVAILABILITY_WINDOW_DAYS} дней
            </Typography>
            {freeRanges.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ mb: 2.5 }}>
                Свободных окон нет — номер занят на весь период.
              </Typography>
            ) : (
              <Stack gap={0.75} sx={{ mb: 2.5 }}>
                {freeRanges.map((r) => (
                  <Stack key={`${r.from}-${r.to}`} direction="row" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: theme.palette.success.main,
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2">{formatHotelDateRange(r.from, r.to)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      ({nightsBetween(r.from, r.to)} ноч.)
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Ближайшие брони
            </Typography>
            {upcomingBookings.length === 0 ? (
              <Typography variant="body2" color="text.disabled">
                Броней на ближайшее время нет.
              </Typography>
            ) : (
              <Stack gap={1}>
                {upcomingBookings.map((b) => (
                  <Stack
                    key={b.id}
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
                        component={onGuestClick ? "button" : "p"}
                        onClick={onGuestClick ? () => onGuestClick(b.guestName) : undefined}
                        sx={
                          onGuestClick
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
                        {b.guestName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatHotelDateRange(b.checkIn, b.checkOut)}
                      </Typography>
                    </Box>
                    <Chip
                      label={HOTEL_BOOKING_STATUS_LABELS[b.status]}
                      size="small"
                      sx={{
                        bgcolor: alpha(statusColor(b.status), theme.palette.mode === "dark" ? 0.25 : 0.14),
                        color: statusColor(b.status),
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    />
                  </Stack>
                ))}
              </Stack>
            )}
          </DialogContent>
        </>
      )}
    </Dialog>
  );
};

export default RoomDetailsDialog;
