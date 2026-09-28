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
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
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
import { CASHLESS_METHODS_ENABLED } from "../api/cashlessMethods";
import { CashlessMethodSelect } from "../components/ui";
import { useCashlessMethods } from "../hooks/useCashlessMethods";
import { useHotelProperty } from "./useHotelProperty";
import {
  mapStayDisplayStatus,
  HOTEL_STAY_STATUS_LABELS,
  hotelStayStatusColor,
  HOTEL_RESERVATION_STATUS_LABELS,
  HOTEL_BOARD_TYPE_LABELS,
  HOTEL_BOOKING_SOURCE_LABELS,
  HOTEL_GUARANTEE_METHOD_LABELS,
} from "./hotelDisplay";
import { formatHotelDateRange, initialsOf, nightsBetween } from "./mockDemoData";
import { StatusPill } from "./hotelUi";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";

/** "cash" — единственный способ, для которого не уточняем конкретный безналичный канал. */
function isCashlessPaymentMethod(method: string): boolean {
  return method !== "" && method !== "cash";
}

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
  const { property } = useHotelProperty();

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
  const [cashlessMethodId, setCashlessMethodId] = React.useState<number | "">("");
  const [paymentSaving, setPaymentSaving] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const paymentIsCashless = isCashlessPaymentMethod(paymentMethod);
  const cashlessState = useCashlessMethods(paymentFormOpen, { branchId: property?.branchId ?? null });

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
    setCashlessMethodId("");
    setPaymentError(null);
  }, [reservationId]);

  // Способ безнала — только пока выбран небезналовый метод; смена метода
  // обратно на «Наличные» сбрасывает выбор, иначе он молча уедет в payload.
  React.useEffect(() => {
    if (!paymentIsCashless) {
      setCashlessMethodId("");
      return;
    }
    if (cashlessMethodId === "" && cashlessState.defaultMethodId !== "") {
      setCashlessMethodId(cashlessState.defaultMethodId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentIsCashless, cashlessState.defaultMethodId]);

  const invalidateReservation = () => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservationId] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
    // Карточки над шахматкой (HotelOccupancyBanner) считает бэкенд: выезд ставит
    // номеру «Грязно» и заводит задачу уборки, заселение/отмена двигают заезды и
    // загрузку. Без этого они подтягивались бы только при следующем фокусе окна.
    void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "housekeepingTasks"] });
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
        cashlessMethodId:
          CASHLESS_METHODS_ENABLED && paymentIsCashless && cashlessMethodId !== "" ? cashlessMethodId : undefined,
      });
      setPaymentFormOpen(false);
      setPaymentMethod("");
      setPaymentAmount("");
      setPaymentNote("");
      setCashlessMethodId("");
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


  const money = (v: string | number) => `${Number(v).toLocaleString("ru-RU")} ${reservation?.currency === "KGS" || !reservation ? "сом" : reservation.currency}`;
  const total = Number(reservation?.totalAmount ?? 0);
  const paid = Number(reservation?.paidAmount ?? 0);
  const balance = Number(reservation?.balanceDue ?? 0);
  const paidShare = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const stayStatus = item ? mapStayDisplayStatus(item.stayStatus) : null;
  const stayColor = stayStatus ? hotelStayStatusColor(stayStatus, theme) : theme.palette.text.disabled;

  const detailRows: { label: string; value: React.ReactNode }[] =
    reservation && item
      ? [
          { label: "Номер", value: `${item.roomNumber ?? "не назначен"} · ${item.roomTypeName}` },
          { label: "Гости", value: `${item.adults} взр.${item.children > 0 ? ` + ${item.children} дет.` : ""}` },
          { label: "Питание", value: HOTEL_BOARD_TYPE_LABELS[item.boardType] ?? item.boardType },
          { label: "Источник", value: HOTEL_BOOKING_SOURCE_LABELS[reservation.source] ?? reservation.source },
          ...(reservation.guaranteeMethod
            ? [{ label: "Гарантия", value: HOTEL_GUARANTEE_METHOD_LABELS[reservation.guaranteeMethod] ?? reservation.guaranteeMethod }]
            : []),
        ]
      : [];

  // Главное действие по статусу — одной заметной кнопкой, остальное рядом тише.
  const primaryAction = canCheckIn
    ? { label: "Заселить", onClick: () => void handleCheckIn() }
    : canCheckOut
      ? { label: "Выселить", onClick: () => void handleCheckOut() }
      : canConfirm
        ? { label: "Подтвердить", onClick: () => void handleConfirm() }
        : null;

  const sectionLabelSx = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", mb: 1.25 } as const;
  const line = `1px solid ${subtleBorder(theme)}`;

  return (
    <Dialog
      open={reservationId != null}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: "16px", overflow: "hidden", backgroundImage: "none" } }}
    >
      {reservationId != null && !reservation && (
        <Stack alignItems="center" justifyContent="center" gap={1.5} sx={{ py: 8 }}>
          {query.isError ? (
            <>
              <Typography color="text.secondary">Не удалось загрузить бронь</Typography>
              <Button size="small" onClick={onClose}>
                Закрыть
              </Button>
            </>
          ) : (
            <CircularProgress size={28} />
          )}
        </Stack>
      )}

      {reservationId != null && reservation && item && (
        <>
          {/* ── Шапка ── */}
          <Box sx={{ px: { xs: 2.5, md: 3.5 }, pt: 2.5, pb: 3, borderBottom: line }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1.5 }}>
              <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
                  Бронь №{reservation.number}
                </Typography>
                {stayStatus && <StatusPill color={stayColor} label={HOTEL_STAY_STATUS_LABELS[stayStatus]} />}
                {reservation.status !== "confirmed" && (
                  <StatusPill color={theme.palette.text.secondary} label={HOTEL_RESERVATION_STATUS_LABELS[reservation.status] ?? reservation.status} />
                )}
                {item.isOverbooking && <StatusPill color={theme.palette.warning.main} label="Овербукинг" />}
              </Stack>
              <IconButton
                onClick={onClose}
                aria-label="Закрыть"
                sx={{ width: 34, height: 34, border: line, color: "text.secondary", flexShrink: 0, "&:hover": { color: "text.primary" } }}
              >
                <CloseOutlined sx={{ fontSize: 18 }} />
              </IconButton>
            </Stack>

            <Stack direction="row" alignItems="flex-end" justifyContent="space-between" gap={2} flexWrap="wrap">
              <Typography sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", minWidth: 0 }}>
                {reservation.customerName || item.guests[0]?.fullName || "Без заказчика"}
              </Typography>
              <Box sx={{ textAlign: { xs: "left", md: "right" } }}>
                <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {money(reservation.totalAmount)}
                </Typography>
                <Typography variant="caption" color={balance > 0 ? "error.main" : "success.main"} fontWeight={600}>
                  {balance > 0 ? `к оплате ${money(balance)}` : "оплачено полностью"}
                </Typography>
              </Box>
            </Stack>

            <Stack
              direction={{ xs: "column", md: "row" }}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              gap={1.5}
              sx={{ mt: 2 }}
            >
              <Typography variant="body2" color="text.secondary">
                {formatHotelDateRange(item.checkIn, item.checkOut)} · {nightsBetween(item.checkIn, item.checkOut)} ноч. · номер {item.roomNumber ?? "—"}
              </Typography>
              {hasStatusActions && (
                <Stack direction="row" gap={1} flexWrap="wrap" justifyContent={{ xs: "flex-start", md: "flex-end" }}>
                  {canCancel && (
                    <Button color="error" disabled={actionBusy} onClick={() => setCancelPromptOpen((v) => !v)}>
                      Отменить бронь
                    </Button>
                  )}
                  {canConfirm && primaryAction?.label !== "Подтвердить" && (
                    <Button variant="outlined" disabled={actionBusy} onClick={() => void handleConfirm()}>
                      Подтвердить
                    </Button>
                  )}
                  {primaryAction && (
                    <Button
                      variant="contained"
                      disableElevation
                      disabled={actionBusy}
                      onClick={primaryAction.onClick}
                      sx={{ px: 2.5, borderRadius: "10px", fontWeight: 700 }}
                    >
                      {primaryAction.label}
                    </Button>
                  )}
                </Stack>
              )}
            </Stack>

            {(actionError || checkInNeedsForce || checkOutNeedsForce || cancelPromptOpen) && (
              <Stack gap={1.5} sx={{ mt: 2 }}>
                {actionError && (
                  <Alert severity="error" onClose={() => setActionError(null)}>
                    {actionError}
                  </Alert>
                )}
                {checkInNeedsForce && (
                  <Alert
                    severity="warning"
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
                    action={
                      <Button size="small" color="inherit" onClick={() => void handleCheckOut(true)}>
                        Выселить с долгом
                      </Button>
                    }
                  >
                    Остаток к оплате: {money(reservation.balanceDue)}.
                  </Alert>
                )}
                <Collapse in={cancelPromptOpen}>
                  <Stack gap={1.5} sx={{ p: 2, borderRadius: "12px", bgcolor: subtleBg(theme, true) }}>
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
                    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
                      <FormControlLabel
                        control={<Checkbox size="small" checked={cancelAsNoShow} onChange={(e) => setCancelAsNoShow(e.target.checked)} />}
                        label={<Typography variant="body2">Гость не явился (no-show)</Typography>}
                      />
                      <Stack direction="row" gap={1}>
                        <Button size="small" onClick={() => setCancelPromptOpen(false)} disabled={actionBusy}>
                          Не отменять
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          color="error"
                          disableElevation
                          disabled={!cancelReason.trim() || actionBusy}
                          onClick={() => void handleCancelSubmit()}
                        >
                          Отменить бронь
                        </Button>
                      </Stack>
                    </Stack>
                  </Stack>
                </Collapse>
              </Stack>
            )}
          </Box>

          {/* ── Тело ── */}
          <DialogContent sx={{ px: { xs: 2.5, md: 3.5 }, py: 3 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: { xs: 3.5, md: 5 } }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography component="div" sx={sectionLabelSx}>
                  Детали
                </Typography>
                {detailRows.map((r, i) => (
                  <Stack key={r.label} direction="row" gap={2} sx={{ py: 1.1, borderTop: i === 0 ? "none" : line }}>
                    <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {r.label}
                    </Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1, textAlign: "right", minWidth: 0 }}>
                      {r.value}
                    </Typography>
                  </Stack>
                ))}

                {reservation.guestComment && (
                  <Box sx={{ mt: 2, pl: 1.5, borderLeft: `3px solid ${subtleBorder(theme)}` }}>
                    <Typography variant="caption" color="text.secondary">
                      Пожелание гостя
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {reservation.guestComment}
                    </Typography>
                  </Box>
                )}

                <Typography component="div" sx={{ ...sectionLabelSx, mt: 3.5 }}>
                  Проживающие
                </Typography>
                {item.guests.length === 0 ? (
                  <Typography variant="body2" color="text.disabled">
                    Проживающие не указаны.
                  </Typography>
                ) : (
                  <Stack gap={1}>
                    {item.guests.map((g) => (
                      <Stack key={g.id} direction="row" alignItems="center" gap={1.25}>
                        <Avatar sx={{ width: 34, height: 34, fontSize: 12, fontWeight: 700 }}>{initialsOf(g.fullName)}</Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {g.fullName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap component="div">
                            {[g.isPrimary ? "заказчик" : null, g.phone].filter(Boolean).join(" · ") || "—"}
                          </Typography>
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                  <Typography component="div" sx={{ ...sectionLabelSx, mb: 0 }}>
                    Оплата
                  </Typography>
                  {canManagePayments && !paymentFormOpen && (
                    <Button size="small" startIcon={<PaymentsOutlined fontSize="small" />} onClick={() => setPaymentFormOpen(true)}>
                      Принять оплату
                    </Button>
                  )}
                </Stack>

                <Box sx={{ p: 2, borderRadius: "12px", bgcolor: subtleBg(theme, true) }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Оплачено
                    </Typography>
                    <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {money(paid)}{" "}
                      <Typography component="span" variant="body2" color="text.secondary">
                        из {money(total)}
                      </Typography>
                    </Typography>
                  </Stack>
                  <Box sx={{ height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.08), overflow: "hidden" }}>
                    <Box
                      sx={{
                        width: `${paidShare}%`,
                        height: "100%",
                        borderRadius: 3,
                        bgcolor: balance > 0 ? theme.palette.warning.main : theme.palette.success.main,
                      }}
                    />
                  </Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {paidShare}%
                    </Typography>
                    <Typography variant="caption" fontWeight={600} color={balance > 0 ? "error.main" : "success.main"}>
                      {balance > 0 ? `Остаток ${money(balance)}` : "Долга нет"}
                    </Typography>
                  </Stack>
                </Box>

                <Collapse in={paymentFormOpen}>
                  <Stack gap={1.5} sx={{ mt: 1.5, p: 2, borderRadius: "12px", border: line }}>
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
                        helperText={balance > 0 && !paymentAmount ? `Остаток ${money(balance)}` : undefined}
                      />
                    </Stack>
                    {CASHLESS_METHODS_ENABLED && paymentIsCashless && (
                      <CashlessMethodSelect
                        methods={cashlessState.methods}
                        value={cashlessMethodId}
                        onChange={setCashlessMethodId}
                        loading={cashlessState.isLoading}
                        loadFailed={cashlessState.isError}
                        disabled={paymentSaving}
                      />
                    )}
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
                        disableElevation
                        disabled={paymentSaving || !paymentMethod || !paymentAmount}
                        onClick={() => void handleAddPayment()}
                      >
                        {paymentSaving ? "Сохраняем…" : "Провести оплату"}
                      </Button>
                    </Stack>
                  </Stack>
                </Collapse>

                {payments.length > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    {payments.map((p, i) => (
                      <Stack key={p.id} direction="row" alignItems="center" gap={1.5} sx={{ py: 1.1, borderTop: i === 0 ? "none" : line }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {p.methodLabel || p.method}
                            {p.cashlessMethodName ? ` · ${p.cashlessMethodName}` : ""}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap component="div">
                            {[p.acceptedByName, dayjs(p.acceptedAt).format("D MMM, HH:mm"), p.note].filter(Boolean).join(" · ")}
                          </Typography>
                        </Box>
                        <Typography
                          sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0, color: p.kind === "refund" ? "error.main" : "text.primary" }}
                        >
                          {p.kind === "refund" ? "−" : "+"}
                          {Number(p.amount).toLocaleString("ru-RU")}
                        </Typography>
                      </Stack>
                    ))}
                  </Box>
                )}
              </Box>
            </Box>

            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 3.5 }}>
              Создана {dayjs(reservation.createdAt).format("D MMMM YYYY, HH:mm")}
              {reservation.createdByName ? ` · ${reservation.createdByName}` : ""}
            </Typography>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
};

export default ReservationDetailsDialog;
