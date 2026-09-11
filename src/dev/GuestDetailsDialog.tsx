/**
 * Детали гостя — открывается кликом по имени: на баре в RoomBookingGrid, в
 * списке HotelGuestsPage или в «Ближайших бронях» RoomDetailsDialog. Телефон
 * и вся история проживаний — getHotelGuests()/mockDemoData.ts (гость
 * существует только как имя внутри брони, отдельной картотеки нет).
 */
import React from "react";
import {
  Avatar,
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
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";

import {
  getHotelGuests,
  getHotelBookingStatusColor,
  formatHotelDate,
  formatHotelDateRange,
  initialsOf,
  HOTEL_BOOKING_STATUS_LABELS,
  GUEST_TYPE_LABELS,
  GUARANTEE_METHOD_LABELS,
  BOOKING_SOURCE_LABELS,
  VISIT_PURPOSE_LABELS,
  type HotelBooking,
} from "./mockDemoData";

/** Поле «подпись — значение» в две колонки; ничего не рисует, если value пусто. */
const DetailField: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => {
  if (value == null || value === "") return null;
  return (
    <Box sx={{ minWidth: 140 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
};

/**
 * Данные документа/контактов вводятся один раз в форме брони (CreateBookingButton),
 * не хранятся отдельно на гостя. Берём их с самой свежей брони, где они реально
 * заполнены — так последняя введённая версия побеждает более раннюю.
 */
function findDetailedBooking(bookings: HotelBooking[]): HotelBooking | undefined {
  return [...bookings].reverse().find((b) => b.guestType != null);
}

export interface GuestDetailsDialogProps {
  /** Имя гостя или null — диалог закрыт. Гость ищется в getHotelGuests() заново на каждое открытие. */
  guestName: string | null;
  onClose: () => void;
}

export const GuestDetailsDialog: React.FC<GuestDetailsDialogProps> = ({ guestName, onClose }) => {
  const theme = useTheme();

  const guest = React.useMemo(() => {
    if (!guestName) return undefined;
    return getHotelGuests().find((g) => g.name === guestName);
  }, [guestName]);

  const detailed = guest ? findDetailedBooking(guest.bookings) : undefined;

  const statusColor = (status: HotelBooking["status"]) => getHotelBookingStatusColor(status, theme);

  return (
    <Dialog open={guestName != null} onClose={onClose} maxWidth="sm" fullWidth>
      {guestName && (
        <>
          <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pr: 6 }}>
            <Avatar sx={{ bgcolor: "primary.main", fontWeight: 700 }}>{initialsOf(guestName)}</Avatar>
            <Typography variant="h6" component="span" fontWeight={700}>
              {guestName}
            </Typography>
            <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ pt: 0 }}>
            {guest ? (
              <>
                <Stack direction="row" alignItems="center" gap={3} sx={{ mb: 2.5 }}>
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    <PhoneOutlined fontSize="small" sx={{ color: "text.secondary" }} />
                    <Typography variant="body2" fontWeight={600}>
                      {guest.phone}
                    </Typography>
                  </Stack>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Проживаний
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {guest.bookings.length}
                    </Typography>
                  </Box>
                </Stack>

                {detailed && (
                  <>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                      Данные гостя
                    </Typography>
                    <Stack direction="row" gap={3} flexWrap="wrap" sx={{ mb: 2 }}>
                      <DetailField label="Email" value={detailed.guestEmail} />
                      <DetailField
                        label="Гости"
                        value={
                          detailed.adults != null
                            ? `${detailed.adults} взр.${detailed.children ? ` + ${detailed.children} дет.` : ""}`
                            : null
                        }
                      />
                      <DetailField
                        label="Гарантия брони"
                        value={detailed.guaranteeMethod ? GUARANTEE_METHOD_LABELS[detailed.guaranteeMethod] : null}
                      />
                      <DetailField
                        label="Тип гостя"
                        value={detailed.guestType ? GUEST_TYPE_LABELS[detailed.guestType] : null}
                      />
                      {detailed.guestType === "resident" ? (
                        <>
                          <DetailField label="Паспорт (ID-карта)" value={detailed.idNumber} />
                          <DetailField label="ИНН" value={detailed.inn} />
                        </>
                      ) : (
                        <>
                          <DetailField label="Гражданство" value={detailed.citizenship} />
                          <DetailField label="Загранпаспорт" value={detailed.passportNumber} />
                          <DetailField label="Страна выдачи" value={detailed.passportCountry} />
                          <DetailField
                            label="Действителен до"
                            value={detailed.passportExpiry ? formatHotelDate(detailed.passportExpiry) : null}
                          />
                          <DetailField
                            label="Дата въезда в КР"
                            value={detailed.entryDate ? formatHotelDate(detailed.entryDate) : null}
                          />
                          <DetailField label="Миграционная карта" value={detailed.migrationCardNumber} />
                          <DetailField
                            label="Цель визита"
                            value={detailed.visitPurpose ? VISIT_PURPOSE_LABELS[detailed.visitPurpose] : null}
                          />
                        </>
                      )}
                      <DetailField
                        label="Источник брони"
                        value={detailed.bookingSource ? BOOKING_SOURCE_LABELS[detailed.bookingSource] : null}
                      />
                      <DetailField label="Юрлицо / командировка" value={detailed.companyInfo} />
                      {detailed.dataConsent && (
                        <DetailField label="Согласие на обработку данных" value="Получено" />
                      )}
                      {detailed.passportPhotoDataUrl && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                            Фото документа
                          </Typography>
                          <Box
                            component="img"
                            src={detailed.passportPhotoDataUrl}
                            alt="Фото паспорта"
                            sx={{ width: 64, height: 64, borderRadius: "8px", objectFit: "cover" }}
                          />
                        </Box>
                      )}
                    </Stack>
                    {detailed.specialRequests && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Особые пожелания
                        </Typography>
                        <Typography variant="body2">{detailed.specialRequests}</Typography>
                      </Box>
                    )}
                  </>
                )}

                <Divider sx={{ mb: 2 }} />

                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  История броней
                </Typography>
                <Stack gap={1}>
                  {guest.bookings.map((b) => (
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
                        <Typography variant="body2" fontWeight={600} noWrap>
                          Номер {b.roomNumber}
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
              </>
            ) : (
              <Typography variant="body2" color="text.disabled">
                Броней этого гостя не найдено в текущем окне данных.
              </Typography>
            )}
          </DialogContent>
        </>
      )}
    </Dialog>
  );
};

export default GuestDetailsDialog;
