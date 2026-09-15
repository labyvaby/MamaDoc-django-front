/**
 * GuestHistoryPanel — правая колонка «История проживаний» на странице
 * «Гости» и в GuestDetailsDialog. Тот же визуальный язык, что
 * PatientHistoryPanel.tsx (AppCard-заголовок с иконкой+счётчиком, карточки
 * строк) — вместо приёма/врача/услуги: номер, даты, кто создал бронь и
 * статус оплаты за проживание.
 */
import React from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";

import { AppCard, ListEmptyState } from "../components/ui";
import { subtleBg } from "../theme/uiHelpers";
import {
  formatHotelDate,
  formatHotelDateRange,
  getHotelPayment,
  HOTEL_BOOKING_STATUS_LABELS,
  HOTEL_PAYMENT_METHOD_LABELS,
  type HotelBookingStatus,
} from "./mockDemoData";
import type { GuestDetailsState } from "./useGuestDetails";

/** Иконка статуса брони — та же раскладка, что в RoomBookingGrid. */
const BOOKING_STATUS_ICON: Record<HotelBookingStatus, React.ElementType> = {
  confirmed: ScheduleOutlined,
  arrived: CheckCircleOutlined,
  completed: TaskAltOutlined,
};

/** "15 сент, 14:32" — дата создания брони в истории. */
function formatDateTimeShort(iso: string): string {
  const d = new Date(iso);
  return `${formatHotelDate(iso)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface GuestHistoryPanelProps {
  state: GuestDetailsState;
}

export const GuestHistoryPanel: React.FC<GuestHistoryPanelProps> = ({ state }) => {
  const { guest, theme, statusColor, openPaymentEdit } = state;
  const bookings = guest?.bookings ?? [];

  return (
    <AppCard
      variant="outlined"
      header={
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 2, pt: 2, pb: 1.5 }}>
          <Stack direction="row" alignItems="center" gap={1.25}>
            <HistoryOutlined color="primary" />
            <Typography variant="h6">История проживаний</Typography>
          </Stack>
          {guest && (
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {bookings.length}
            </Typography>
          )}
        </Stack>
      }
      disableContentPadding
      sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <Box
        sx={{
          borderTop: 1,
          borderColor: "divider",
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          p: 1,
        }}
      >
        {!guest ? (
          <ListEmptyState
            icon={<HistoryOutlined />}
            title="Гость не выбран"
            description="Выберите гостя слева, чтобы увидеть историю проживаний."
          />
        ) : bookings.length === 0 ? (
          <ListEmptyState icon={<HistoryOutlined />} title="Броней нет" description="У этого гостя пока нет проживаний." />
        ) : (
          <Stack gap={1}>
            {bookings.map((b) => {
              const payment = getHotelPayment(b.roomNumber, b.checkIn);
              const StatusIcon = BOOKING_STATUS_ICON[b.status];
              return (
                <Stack
                  key={b.id}
                  gap={0.5}
                  sx={(t) => ({ px: 1.25, py: 1, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: subtleBg(t) })}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        Номер {b.roomNumber}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatHotelDateRange(b.checkIn, b.checkOut)}
                      </Typography>
                    </Box>
                    <Chip
                      icon={<StatusIcon sx={{ fontSize: 14 }} />}
                      label={HOTEL_BOOKING_STATUS_LABELS[b.status]}
                      size="small"
                      sx={{
                        bgcolor: alpha(statusColor(b.status), theme.palette.mode === "dark" ? 0.25 : 0.14),
                        color: statusColor(b.status),
                        fontWeight: 600,
                        flexShrink: 0,
                        "& .MuiChip-icon": { color: statusColor(b.status) },
                      }}
                    />
                  </Stack>

                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    gap={1}
                    flexWrap="wrap"
                    sx={{ pt: 0.5, borderTop: "1px dashed", borderColor: "divider" }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {b.createdBy
                        ? `Создал: ${b.createdBy}${b.createdAt ? ` · ${formatDateTimeShort(b.createdAt)}` : ""}`
                        : "Создатель не зафиксирован (сгенерированная бронь)"}
                    </Typography>

                    {payment ? (
                      <Chip
                        icon={<CheckCircleOutlined fontSize="small" />}
                        label={`${HOTEL_PAYMENT_METHOD_LABELS[payment.method]}, ${payment.amount.toLocaleString("ru-RU")} сом`}
                        size="small"
                        onClick={() => openPaymentEdit(b)}
                        sx={{
                          bgcolor: alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.25 : 0.14),
                          color: theme.palette.success.main,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      />
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PaymentsOutlined fontSize="small" />}
                        onClick={() => openPaymentEdit(b)}
                      >
                        Оплата
                      </Button>
                    )}
                  </Stack>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Box>
    </AppCard>
  );
};

export default GuestHistoryPanel;
