/**
 * Детали брони — реальные данные (src/api/hotel.ts, GET
 * /hotel/reservations/{id}/). Открывается кликом по бару в RoomBookingGrid
 * или по имени гостя в «Ближайших бронях» RoomDetailsDialog — замена
 * мокового GuestDetailsDialog.tsx: та бронь была найдена по имени гостя в
 * localStorage, эта — по настоящему reservationId с бэкенда, и показывает
 * то, чего в моке не было (заказчик отдельно от проживающих, оплата,
 * источник, гарантия, цены по ночам).
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
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
import dayjs from "dayjs";

import { getReservation } from "../api/hotel";
import {
  mapStayDisplayStatus,
  HOTEL_STAY_STATUS_LABELS,
  hotelStayStatusColor,
  HOTEL_RESERVATION_STATUS_LABELS,
  HOTEL_BOARD_TYPE_LABELS,
  HOTEL_BOOKING_SOURCE_LABELS,
  HOTEL_GUARANTEE_METHOD_LABELS,
} from "./hotelDisplay";
import { formatHotelDateRange, nightsBetween } from "./mockDemoData";

export interface ReservationDetailsDialogProps {
  /** Id брони или null — диалог закрыт. */
  reservationId: number | null;
  onClose: () => void;
}

export const ReservationDetailsDialog: React.FC<ReservationDetailsDialogProps> = ({ reservationId, onClose }) => {
  const theme = useTheme();
  const query = useQuery({
    queryKey: ["hotel", "reservation", reservationId],
    queryFn: ({ signal }) => getReservation(reservationId!, signal),
    enabled: reservationId != null,
  });
  const reservation = query.data;
  const item = reservation?.items[0];

  return (
    <Dialog open={reservationId != null} onClose={onClose} maxWidth="sm" fullWidth>
      {reservationId != null && (
        <>
          <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pr: 6 }}>
            <Typography variant="h6" component="span" fontWeight={700}>
              Бронь {reservation ? `№${reservation.number}` : ""}
            </Typography>
            {item && (
              <Chip
                label={HOTEL_STAY_STATUS_LABELS[mapStayDisplayStatus(item.stayStatus)]}
                size="small"
                sx={{
                  bgcolor: alpha(hotelStayStatusColor(mapStayDisplayStatus(item.stayStatus), theme), theme.palette.mode === "dark" ? 0.25 : 0.14),
                  color: hotelStayStatusColor(mapStayDisplayStatus(item.stayStatus), theme),
                  fontWeight: 600,
                }}
              />
            )}
            {reservation && reservation.status !== "confirmed" && (
              <Chip label={HOTEL_RESERVATION_STATUS_LABELS[reservation.status] ?? reservation.status} size="small" variant="outlined" />
            )}
            {item?.isOverbooking && <Chip label="Овербукинг" size="small" color="warning" />}
            <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ pt: 0 }}>
            {query.isLoading && (
              <Stack alignItems="center" sx={{ py: 4 }}>
                <CircularProgress size={28} />
              </Stack>
            )}
            {query.isError && <Alert severity="error">Не удалось загрузить бронь.</Alert>}
            {reservation && item && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {reservation.customerName || "Без заказчика"} · номер {item.roomNumber ?? "—"} ({item.roomTypeName})
                </Typography>

                <Stack direction="row" gap={3} flexWrap="wrap" sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Проживание
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatHotelDateRange(item.checkIn, item.checkOut)} · {nightsBetween(item.checkIn, item.checkOut)} ноч.
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Гости
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {item.adults} взр. {item.children > 0 ? `+ ${item.children} дет.` : ""}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Тариф
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {HOTEL_BOARD_TYPE_LABELS[item.boardType] ?? item.boardType}
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction="row" gap={3} flexWrap="wrap" sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Источник
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {HOTEL_BOOKING_SOURCE_LABELS[reservation.source] ?? reservation.source}
                    </Typography>
                  </Box>
                  {reservation.guaranteeMethod && (
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Гарантия
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {HOTEL_GUARANTEE_METHOD_LABELS[reservation.guaranteeMethod] ?? reservation.guaranteeMethod}
                      </Typography>
                    </Box>
                  )}
                </Stack>

                {reservation.guestComment && (
                  <Alert severity="info" variant="outlined" sx={{ mb: 2, fontSize: "0.8rem" }}>
                    {reservation.guestComment}
                  </Alert>
                )}

                <Divider sx={{ mb: 2 }} />

                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  Проживающие
                </Typography>
                <Stack gap={1} sx={{ mb: 2.5 }}>
                  {item.guests.map((g) => (
                    <Stack key={g.id} direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                      <Typography variant="body2">
                        {g.fullName}
                        {g.isPrimary && (
                          <Typography component="span" variant="caption" color="text.secondary">
                            {" "}
                            (заказчик)
                          </Typography>
                        )}
                      </Typography>
                      {g.phone && (
                        <Typography variant="caption" color="text.secondary">
                          {g.phone}
                        </Typography>
                      )}
                    </Stack>
                  ))}
                  {item.guests.length === 0 && (
                    <Typography variant="body2" color="text.disabled">
                      Проживающие не указаны.
                    </Typography>
                  )}
                </Stack>

                <Divider sx={{ mb: 2 }} />

                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  Оплата
                </Typography>
                <Stack direction="row" gap={3} flexWrap="wrap">
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Сумма
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {Number(reservation.totalAmount).toLocaleString("ru-RU")} {reservation.currency}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Оплачено
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {Number(reservation.paidAmount).toLocaleString("ru-RU")} {reservation.currency}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Остаток
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={Number(reservation.balanceDue) > 0 ? "error.main" : "text.primary"}
                    >
                      {Number(reservation.balanceDue).toLocaleString("ru-RU")} {reservation.currency}
                    </Typography>
                  </Box>
                </Stack>

                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                  Создана: {dayjs(reservation.createdAt).format("D MMMM YYYY, HH:mm")}
                  {reservation.createdByName ? ` · ${reservation.createdByName}` : ""}
                </Typography>
              </>
            )}
          </DialogContent>
        </>
      )}
    </Dialog>
  );
};

export default ReservationDetailsDialog;
