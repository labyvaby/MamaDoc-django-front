/**
 * Детали гостя — открывается кликом по имени: на баре в RoomBookingGrid, в
 * списке HotelGuestsPage или в «Ближайших бронях» RoomDetailsDialog. Телефон
 * и вся история проживаний — getHotelGuests()/mockDemoData.ts (гость
 * существует только как имя внутри брони, отдельной картотеки нет).
 *
 * Каждая бронь в истории показывает, кто её создал и когда (createdBy/At —
 * реальный залогиненный сотрудник на момент создания, см. CreateBookingButton),
 * а также статус оплаты за проживание с кнопкой «Оплата» — тот же смысл, что
 * «Оплата приёма» в реальном МамаДоктор: отдельное действие персонала при
 * заезде, не поле формы бронирования.
 */
import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";

import { usePermissions } from "../hooks/usePermissions";
import {
  getHotelGuests,
  getHotelBookingStatusColor,
  formatHotelDate,
  formatHotelDateRange,
  initialsOf,
  findDetailedGuestBooking,
  getRoomCategory,
  nightsBetween,
  getHotelPayment,
  setHotelPayment,
  subscribeHotelPayments,
  getHotelPaymentsSnapshot,
  HOTEL_BOOKING_STATUS_LABELS,
  HOTEL_PAYMENT_METHOD_LABELS,
  GUEST_TYPE_LABELS,
  GUARANTEE_METHOD_LABELS,
  BOOKING_SOURCE_LABELS,
  VISIT_PURPOSE_LABELS,
  type HotelBooking,
  type HotelPaymentMethod,
} from "./mockDemoData";

/** "15 сент, 14:32" — дата создания брони/оплаты в истории. */
function formatDateTimeShort(iso: string): string {
  const d = new Date(iso);
  return `${formatHotelDate(iso)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

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

export interface GuestDetailsDialogProps {
  /** Имя гостя или null — диалог закрыт. Гость ищется в getHotelGuests() заново на каждое открытие. */
  guestName: string | null;
  onClose: () => void;
}

interface PaymentEditState {
  booking: HotelBooking;
  method: HotelPaymentMethod;
  amount: string;
  note: string;
}

export const GuestDetailsDialog: React.FC<GuestDetailsDialogProps> = ({ guestName, onClose }) => {
  const theme = useTheme();
  const { employee } = usePermissions();
  // Подписка форсирует перерисовку при изменении оплаты — сами данные читаются
  // напрямую через getHotelPayment() в каждой строке истории при рендере.
  React.useSyncExternalStore(subscribeHotelPayments, getHotelPaymentsSnapshot);
  const [paymentEdit, setPaymentEdit] = React.useState<PaymentEditState | null>(null);

  const guest = React.useMemo(() => {
    if (!guestName) return undefined;
    return getHotelGuests().find((g) => g.name === guestName);
  }, [guestName]);

  const detailed = guest ? findDetailedGuestBooking(guest.bookings) : undefined;

  const statusColor = (status: HotelBooking["status"]) => getHotelBookingStatusColor(status, theme);

  const openPaymentEdit = (booking: HotelBooking) => {
    const existing = getHotelPayment(booking.roomNumber, booking.checkIn);
    const category = getRoomCategory(booking.roomNumber);
    const defaultAmount = category ? category.pricePerNight * nightsBetween(booking.checkIn, booking.checkOut) : 0;
    setPaymentEdit({
      booking,
      method: existing?.method ?? "cash",
      amount: String(existing?.amount ?? defaultAmount),
      note: existing?.note ?? "",
    });
  };

  const savePayment = () => {
    if (!paymentEdit) return;
    const amount = Number(paymentEdit.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setHotelPayment(paymentEdit.booking.roomNumber, paymentEdit.booking.checkIn, {
      method: paymentEdit.method,
      amount,
      note: paymentEdit.note.trim() || undefined,
      acceptedBy: employee?.fullName || "Неизвестный сотрудник",
    });
    setPaymentEdit(null);
  };

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
                  {guest.bookings.map((b) => {
                    const payment = getHotelPayment(b.roomNumber, b.checkIn);
                    return (
                      <Stack
                        key={b.id}
                        gap={0.5}
                        sx={{
                          px: 1.25,
                          py: 0.75,
                          borderRadius: "8px",
                          bgcolor: theme.palette.mode === "dark" ? alpha("#fff", 0.04) : alpha("#000", 0.03),
                        }}
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
              </>
            ) : (
              <Typography variant="body2" color="text.disabled">
                Броней этого гостя не найдено в текущем окне данных.
              </Typography>
            )}
          </DialogContent>
        </>
      )}

      <Dialog open={paymentEdit != null} onClose={() => setPaymentEdit(null)} maxWidth="xs" fullWidth>
        {paymentEdit && (
          <>
            <DialogTitle>Оплата — номер {paymentEdit.booking.roomNumber}</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ mt: 0.5 }}>
                <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                  {formatHotelDateRange(paymentEdit.booking.checkIn, paymentEdit.booking.checkOut)} ·{" "}
                  {nightsBetween(paymentEdit.booking.checkIn, paymentEdit.booking.checkOut)} ноч. Запись всегда можно
                  открыть и поправить.
                </Alert>
                <TextField
                  select
                  label="Способ оплаты"
                  value={paymentEdit.method}
                  onChange={(e) =>
                    setPaymentEdit({ ...paymentEdit, method: e.target.value as HotelPaymentMethod })
                  }
                  fullWidth
                >
                  {(Object.keys(HOTEL_PAYMENT_METHOD_LABELS) as HotelPaymentMethod[]).map((key) => (
                    <MenuItem key={key} value={key}>
                      {HOTEL_PAYMENT_METHOD_LABELS[key]}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Сумма, сом"
                  type="number"
                  value={paymentEdit.amount}
                  onChange={(e) => setPaymentEdit({ ...paymentEdit, amount: e.target.value })}
                  slotProps={{ htmlInput: { min: 0 } }}
                  autoFocus
                  fullWidth
                />
                <TextField
                  label="Комментарий"
                  placeholder="Необязательно"
                  value={paymentEdit.note}
                  onChange={(e) => setPaymentEdit({ ...paymentEdit, note: e.target.value })}
                  fullWidth
                />
                <Typography variant="caption" color="text.secondary">
                  Примет оплату: {employee?.fullName || "текущий сотрудник"} · сейчас
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setPaymentEdit(null)}>Отмена</Button>
              <Button variant="contained" onClick={savePayment}>
                Провести оплату
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Dialog>
  );
};

export default GuestDetailsDialog;
