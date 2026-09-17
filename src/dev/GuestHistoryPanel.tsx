/**
 * GuestHistoryPanel — правая колонка «История проживаний» на странице
 * «Гости». Реальные брони гостя (useGuestDetails → GET
 * /hotel/reservations/?customerId=). Тот же визуальный язык, что
 * PatientHistoryPanel.tsx — карточки строк вместо приёма/врача/услуги:
 * номер, даты, кто создал бронь и статус оплаты за проживание.
 */
import React from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";

import { AppCard, ListEmptyState } from "../components/ui";
import { subtleBg } from "../theme/uiHelpers";
import { mapStayDisplayStatus, hotelStayStatusColor, HOTEL_STAY_STATUS_LABELS, HOTEL_STAY_STATUS_ICONS } from "./hotelDisplay";
import { formatHotelDate, formatHotelDateRange } from "./mockDemoData";
import type { GuestDetailsState } from "./useGuestDetails";

/** "15 сент, 14:32" — дата создания брони в истории. */
function formatDateTimeShort(iso: string): string {
  const d = new Date(iso);
  return `${formatHotelDate(iso)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface GuestHistoryPanelProps {
  state: GuestDetailsState;
}

export const GuestHistoryPanel: React.FC<GuestHistoryPanelProps> = ({ state }) => {
  const { guest, theme, reservations, openPaymentEdit } = state;

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
              {reservations.length}
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
        ) : reservations.length === 0 ? (
          <ListEmptyState icon={<HistoryOutlined />} title="Броней нет" description="У этого гостя пока нет проживаний." />
        ) : (
          <Stack gap={1}>
            {reservations.map((r) => {
              const item = r.items[0];
              if (!item) return null;
              const status = mapStayDisplayStatus(item.stayStatus);
              const color = hotelStayStatusColor(status, theme);
              const StatusIcon = HOTEL_STAY_STATUS_ICONS[status];
              const hasPayment = Number(r.paidAmount) > 0;
              return (
                <Stack
                  key={r.id}
                  gap={0.5}
                  sx={(t) => ({ px: 1.25, py: 1, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: subtleBg(t) })}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        Номер {item.roomNumber ?? "—"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatHotelDateRange(item.checkIn, item.checkOut)}
                      </Typography>
                    </Box>
                    <Chip
                      icon={<StatusIcon sx={{ fontSize: 14 }} />}
                      label={HOTEL_STAY_STATUS_LABELS[status]}
                      size="small"
                      sx={{
                        bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.25 : 0.14),
                        color,
                        fontWeight: 600,
                        flexShrink: 0,
                        "& .MuiChip-icon": { color },
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
                      {r.createdByName ? `Создал: ${r.createdByName} · ${formatDateTimeShort(r.createdAt)}` : formatDateTimeShort(r.createdAt)}
                    </Typography>

                    {hasPayment ? (
                      <Chip
                        icon={<CheckCircleOutlined fontSize="small" />}
                        label={`Оплачено ${Number(r.paidAmount).toLocaleString("ru-RU")} сом`}
                        size="small"
                        onClick={() => openPaymentEdit(r)}
                        sx={{
                          bgcolor: alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.25 : 0.14),
                          color: theme.palette.success.main,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      />
                    ) : (
                      <Button size="small" variant="outlined" startIcon={<PaymentsOutlined fontSize="small" />} onClick={() => openPaymentEdit(r)}>
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
