/**
 * Детали брони — реальные данные (src/api/hotel.ts, GET
 * /hotel/reservations/{id}/). Открывается кликом по бару в RoomBookingGrid
 * или по имени гостя в «Ближайших бронях» RoomDetailsDialog — замена
 * мокового GuestDetailsDialog.tsx: та бронь была найдена по имени гостя в
 * localStorage, эта — по настоящему reservationId с бэкенда, и показывает
 * то, чего в моке не было (заказчик отдельно от проживающих, оплата,
 * источник, гарантия, цены по ночам).
 *
 * «Кто создал бронь / кто принял оплату» — учёт по ролям (задача NEWCRM):
 * reservation.createdByName/createdAt уже в самой брони; по оплате — список
 * отдельных платежей (GET /hotel/reservations/{id}/payments/), у каждого
 * acceptedByName/acceptedAt, а не только агрегат paidAmount у брони.
 *
 * Управление статусом и оплатой прямо отсюда — тоже часть той задачи:
 * подтвердить/отменить/заселить/выселить — уже существующие действия бэкенда
 * (confirm/cancel/check-in/check-out), раньше нигде не были доступны из
 * шахматки. 409 ROOM_NOT_READY (заселение в грязный/ремонтный номер) и 409
 * HAS_DEBT (выселение с долгом) — не блокировка, а предупреждение с
 * повтором (allowOverbooking у брони — тот же принцип, см.
 * CreateBookingButton). Кнопки видны только тем, у кого есть право
 * (useCan) — hotel.reservations.manage для статуса брони, hotel.stays.manage
 * для заезда/выезда, hotel.payments.manage для оплаты.
 */
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import dayjs from "dayjs";

import { useCan } from "../hooks/useCan";
import {
  getReservation,
  listPayments,
  getHotelCatalogs,
  confirmReservation,
  cancelReservation,
  checkInReservationItem,
  checkOutReservationItem,
  addPayment,
} from "../api/hotel";
import { ApiError, getErrorMessage } from "../api/client";
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

const CANCELLABLE_STATUSES = new Set(["draft", "hold", "confirmed"]);

export interface ReservationDetailsDialogProps {
  /** Id брони или null — диалог закрыт. */
  reservationId: number | null;
  onClose: () => void;
}

export const ReservationDetailsDialog: React.FC<ReservationDetailsDialogProps> = ({ reservationId, onClose }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const canManageReservation = useCan("hotel.reservations.manage");
  const canManageStays = useCan("hotel.stays.manage");
  const canForceCheckIn = useCan("hotel.stays.force_checkin");
  const canManagePayments = useCan("hotel.payments.manage");

  const query = useQuery({
    queryKey: ["hotel", "reservation", reservationId],
    queryFn: ({ signal }) => getReservation(reservationId!, signal),
    enabled: reservationId != null,
  });
  const reservation = query.data;
  const item = reservation?.items[0];

  // Кто принял оплату и когда — по каждой записи, не только агрегат
  // totalAmount/paidAmount у брони (см. HotelPayment.acceptedByName/acceptedAt).
  const paymentsQuery = useQuery({
    queryKey: ["hotel", "reservation", reservationId, "payments"],
    queryFn: ({ signal }) => listPayments(reservationId!, signal),
    enabled: reservationId != null,
  });
  const payments = paymentsQuery.data?.results ?? [];

  const catalogsQuery = useQuery({
    queryKey: ["hotel", "catalogs", reservation?.propertyId],
    queryFn: ({ signal }) => getHotelCatalogs(reservation!.propertyId, signal),
    enabled: reservation != null,
  });
  const paymentMethodChoices = catalogsQuery.data?.paymentMethods ?? [];

  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [checkInNeedsForce, setCheckInNeedsForce] = React.useState(false);
  const [checkOutNeedsForce, setCheckOutNeedsForce] = React.useState(false);
  const [cancelPromptOpen, setCancelPromptOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelAsNoShow, setCancelAsNoShow] = React.useState(false);

  const [paymentFormOpen, setPaymentFormOpen] = React.useState(false);
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentNote, setPaymentNote] = React.useState("");
  const [paymentSaving, setPaymentSaving] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);

  // Сброс формочек при смене/закрытии брони — иначе при открытии другой
  // причина отмены/недосохранённая оплата от предыдущей брони осталась бы видна.
  React.useEffect(() => {
    setActionError(null);
    setCheckInNeedsForce(false);
    setCheckOutNeedsForce(false);
    setCancelPromptOpen(false);
    setCancelReason("");
    setCancelAsNoShow(false);
    setPaymentFormOpen(false);
    setPaymentMethod("");
    setPaymentAmount("");
    setPaymentNote("");
    setPaymentError(null);
  }, [reservationId]);

  const invalidateReservation = () => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservationId] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
  };

  const handleConfirm = async () => {
    if (!reservation) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await confirmReservation(reservation.id, { version: reservation.version });
      invalidateReservation();
    } catch (err) {
      setActionError(getErrorMessage(err, "Не удалось подтвердить бронь"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (!reservation || !cancelReason.trim()) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await cancelReservation(reservation.id, {
        reason: cancelReason.trim(),
        noShow: cancelAsNoShow,
        version: reservation.version,
      });
      setCancelPromptOpen(false);
      setCancelReason("");
      setCancelAsNoShow(false);
      invalidateReservation();
    } catch (err) {
      setActionError(getErrorMessage(err, "Не удалось отменить бронь"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCheckIn = async (force = false) => {
    if (!reservation || !item) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await checkInReservationItem(reservation.id, item.id, {
        version: reservation.version,
        ...(force ? { forceDirty: true, forceReason: "Подтверждено сотрудником при заселении" } : {}),
      });
      setCheckInNeedsForce(false);
      invalidateReservation();
    } catch (err) {
      if (!force && err instanceof ApiError && err.code === "ROOM_NOT_READY") {
        setCheckInNeedsForce(true);
        return;
      }
      setActionError(getErrorMessage(err, "Не удалось заселить"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCheckOut = async (force = false) => {
    if (!reservation || !item) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await checkOutReservationItem(reservation.id, item.id, {
        version: reservation.version,
        ...(force ? { allowDebt: true } : {}),
      });
      setCheckOutNeedsForce(false);
      invalidateReservation();
    } catch (err) {
      if (!force && err instanceof ApiError && err.code === "HAS_DEBT") {
        setCheckOutNeedsForce(true);
        return;
      }
      setActionError(getErrorMessage(err, "Не удалось выселить"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleAddPayment = async () => {
    if (!reservation) return;
    const amountNum = Number(paymentAmount);
    if (!paymentMethod || !Number.isFinite(amountNum) || amountNum <= 0) return;
    setPaymentSaving(true);
    setPaymentError(null);
    try {
      await addPayment(reservation.id, {
        method: paymentMethod,
        amount: String(amountNum),
        note: paymentNote.trim() || undefined,
      });
      setPaymentFormOpen(false);
      setPaymentMethod("");
      setPaymentAmount("");
      setPaymentNote("");
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservationId, "payments"] });
      invalidateReservation();
    } catch (err) {
      setPaymentError(getErrorMessage(err, "Не удалось провести оплату"));
    } finally {
      setPaymentSaving(false);
    }
  };

  const canConfirm = canManageReservation && reservation && (reservation.status === "draft" || reservation.status === "hold");
  // Завершённое проживание (уже выехал) отменять нечего — это не «отмена
  // брони», а факт истории, поэтому смотрим и на stayStatus, не только на
  // reservation.status (тот сам по себе так и остаётся "confirmed").
  const canCancel =
    canManageReservation && reservation && CANCELLABLE_STATUSES.has(reservation.status) && item?.stayStatus !== "checked_out";
  const canCheckIn = canManageStays && reservation?.status === "confirmed" && item?.stayStatus === "expected";
  const canCheckOut = canManageStays && item?.stayStatus === "checked_in";
  const hasStatusActions = canConfirm || canCancel || canCheckIn || canCheckOut;

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

                {hasStatusActions && (
                  <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
                    {canConfirm && (
                      <Button size="small" variant="outlined" disabled={actionBusy} onClick={() => void handleConfirm()}>
                        Подтвердить
                      </Button>
                    )}
                    {canCheckIn && (
                      <Button size="small" variant="outlined" disabled={actionBusy} onClick={() => void handleCheckIn()}>
                        Заселить
                      </Button>
                    )}
                    {canCheckOut && (
                      <Button size="small" variant="outlined" disabled={actionBusy} onClick={() => void handleCheckOut()}>
                        Выселить
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={actionBusy}
                        onClick={() => setCancelPromptOpen((v) => !v)}
                      >
                        Отменить
                      </Button>
                    )}
                  </Stack>
                )}

                {actionError && (
                  <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
                    {actionError}
                  </Alert>
                )}

                {checkInNeedsForce && (
                  <Alert
                    severity="warning"
                    sx={{ mb: 2 }}
                    action={
                      canForceCheckIn ? (
                        <Button size="small" color="inherit" onClick={() => void handleCheckIn(true)}>
                          Всё равно заселить
                        </Button>
                      ) : undefined
                    }
                  >
                    Номер не готов (грязный или в ремонте){!canForceCheckIn && " — нет прав заселить принудительно"}.
                  </Alert>
                )}

                {checkOutNeedsForce && (
                  <Alert
                    severity="warning"
                    sx={{ mb: 2 }}
                    action={
                      <Button size="small" color="inherit" onClick={() => void handleCheckOut(true)}>
                        Выселить с долгом
                      </Button>
                    }
                  >
                    Остаток к оплате: {Number(reservation.balanceDue).toLocaleString("ru-RU")} {reservation.currency}.
                  </Alert>
                )}

                <Collapse in={cancelPromptOpen}>
                  <Stack gap={1.5} sx={{ mb: 2, p: 1.5, border: 1, borderColor: "divider", borderRadius: "10px" }}>
                    <TextField
                      label="Причина отмены"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      size="small"
                      fullWidth
                      multiline
                      minRows={2}
                      autoFocus
                    />
                    <FormControlLabel
                      control={<Checkbox size="small" checked={cancelAsNoShow} onChange={(e) => setCancelAsNoShow(e.target.checked)} />}
                      label={<Typography variant="body2">Гость не явился (no-show)</Typography>}
                    />
                    <Stack direction="row" gap={1} justifyContent="flex-end">
                      <Button size="small" onClick={() => setCancelPromptOpen(false)} disabled={actionBusy}>
                        Закрыть
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        color="error"
                        disabled={!cancelReason.trim() || actionBusy}
                        onClick={() => void handleCancelSubmit()}
                      >
                        Подтвердить отмену
                      </Button>
                    </Stack>
                  </Stack>
                </Collapse>

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

                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    Оплата
                  </Typography>
                  {canManagePayments && !paymentFormOpen && (
                    <Button size="small" startIcon={<PaymentsOutlined fontSize="small" />} onClick={() => setPaymentFormOpen(true)}>
                      Добавить оплату
                    </Button>
                  )}
                </Stack>
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

                <Collapse in={paymentFormOpen}>
                  <Stack gap={1.5} sx={{ mt: 1.5, p: 1.5, border: 1, borderColor: "divider", borderRadius: "10px" }}>
                    {paymentError && <Alert severity="error">{paymentError}</Alert>}
                    <Stack direction="row" gap={1.5}>
                      <TextField
                        select
                        label="Способ оплаты"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        size="small"
                        sx={{ flex: 1 }}
                        disabled={paymentSaving}
                      >
                        {paymentMethodChoices.length === 0 && (
                          <MenuItem value="" disabled>
                            {catalogsQuery.isLoading ? "Загрузка…" : "Нет доступных способов"}
                          </MenuItem>
                        )}
                        {paymentMethodChoices.map((c) => (
                          <MenuItem key={c.value} value={c.value}>
                            {c.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        label="Сумма, сом"
                        type="number"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        slotProps={{ htmlInput: { min: 0 } }}
                        size="small"
                        sx={{ flex: 1 }}
                        disabled={paymentSaving}
                      />
                    </Stack>
                    <TextField
                      label="Комментарий"
                      placeholder="Необязательно"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      size="small"
                      fullWidth
                      disabled={paymentSaving}
                    />
                    <Stack direction="row" gap={1} justifyContent="flex-end">
                      <Button size="small" onClick={() => setPaymentFormOpen(false)} disabled={paymentSaving}>
                        Отмена
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={paymentSaving || !paymentMethod || !paymentAmount}
                        onClick={() => void handleAddPayment()}
                      >
                        {paymentSaving ? "Сохраняем…" : "Провести оплату"}
                      </Button>
                    </Stack>
                  </Stack>
                </Collapse>

                {payments.length > 0 && (
                  <Stack gap={0.75} sx={{ mt: 1.5 }}>
                    {payments.map((p) => (
                      <Stack
                        key={p.id}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        gap={1}
                        sx={{ px: 1.25, py: 0.75, borderRadius: "8px", border: 1, borderColor: "divider" }}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={600} color={p.kind === "refund" ? "error.main" : undefined}>
                            {p.kind === "refund" ? "− " : ""}
                            {Number(p.amount).toLocaleString("ru-RU")} {p.currency} · {p.methodLabel || p.method}
                          </Typography>
                          {p.note && (
                            <Typography variant="caption" color="text.secondary">
                              {p.note}
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {p.acceptedByName || "—"}
                          </Typography>
                          <Typography variant="caption" color="text.disabled">
                            {dayjs(p.acceptedAt).format("D MMM, HH:mm")}
                          </Typography>
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                )}

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
