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
import EditOutlined from "@mui/icons-material/EditOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import { useSnackbar } from "notistack";
import { ReservationEditPanel } from "./ReservationEditPanel";
import { ReservationHistory } from "./ReservationHistory";
import { RoomInspectionStrip } from "./RoomInspectionStrip";
import { ReservationNotesPanel } from "./ReservationNotesPanel";
import { CurrencyEquivalent, DisplayCurrencySwitch } from "./CurrencyBits";
import { currencySign } from "./hotelReportFormat";
import { rateOf, useExchangeRates } from "./useExchangeRates";
import { foreignPaymentNote, parseForeignPayment } from "./hotelDemoStore";
import { useRoomInspection } from "./useRoomInspection";
import { ReservationChargesSection } from "./ReservationChargesSection";
import { ReservationCorporateSection } from "./ReservationCorporateSection";
import { ReservationStaySection } from "./ReservationStaySection";
import { ReservationDocumentsPanel } from "./ReservationDocumentsPanel";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import ChatBubbleOutlineOutlined from "@mui/icons-material/ChatBubbleOutlineOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import { FormField } from "./formField";
import { FieldIcon } from "./FieldIcon";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import { buildGuestMessage, GUEST_MESSAGE_LABELS, whatsappLink, type GuestMessageKind } from "./hotelGuestMessages";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import dayjs from "dayjs";

import { useCan } from "../hooks/useCan";
import {
  getReservation,
  listPayments,
  getHotelCatalogs,
  confirmReservation,
  cancelReservation,
  listCharges,
  checkInReservationItem,
  checkOutReservationItem,
  addPayment,
} from "../api/hotel";
import { ApiError, getErrorMessage } from "../api/client";
import { CASHLESS_METHODS_ENABLED } from "../api/cashlessMethods";
import { CashlessMethodSelect } from "../components/ui";
import { useCashlessMethods } from "../hooks/useCashlessMethods";
import { useHotelProperty } from "./useHotelProperty";
import { ReservationStayTime } from "./ReservationStayTime";
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
import { plural, StatusPill } from "./hotelUi";
import { CheckInDocumentPanel, missingDocumentGuest } from "./CheckInDocumentPanel";
import { ReservationExternalId } from "./ReservationExternalId";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";

/** "cash" — единственный способ, для которого не уточняем конкретный безналичный канал. */
function isCashlessPaymentMethod(method: string): boolean {
  return method !== "" && method !== "cash";
}

const CANCELLABLE_STATUSES = new Set(["draft", "hold", "confirmed"]);

type CardTab = "overview" | "stay" | "billing" | "docs" | "notes" | "history";

export interface ReservationDetailsDialogProps {
  /** Id брони или null — диалог закрыт. */
  reservationId: number | null;
  /** Групповая бронь: какой номер показать первым (клик по его бару в шахматке). */
  initialItemId?: number | null;
  onClose: () => void;
}

export const ReservationDetailsDialog: React.FC<ReservationDetailsDialogProps> = ({ reservationId, initialItemId, onClose }) => {
  const theme = useTheme();
  // На телефоне окно с полями по 32 px теряло шестую часть ширины — во весь экран, как ящики брони и гостя.
  const phone = useMediaQuery(theme.breakpoints.down("md"));
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
    // Refine по умолчанию держит прошлые данные при смене ключа
    // (placeholderData: keepPreviousData) — при медленной сети модалка другого
    // номера показывала данные предыдущего. Здесь данные одной записи: пока
    // новые не пришли, честный спиннер, а не чужая запись.
    placeholderData: undefined,
  });
  // И на всякий случай — только данные именно открытой брони.
  const reservation = query.data && query.data.id === reservationId ? query.data : undefined;
  // Групповая бронь — несколько номеров в одной брони: действия (заселить,
  // изменить, сменить номер) — над выбранным, по умолчанию первым.
  const [activeItemId, setActiveItemId] = React.useState<number | null>(null);
  const item = reservation?.items.find((i) => i.id === activeItemId) ?? reservation?.items[0];
  // Проверка номера перед выездом (#4130) — только у проживающего гостя.
  const inspection = useRoomInspection(reservation, item?.roomId, item?.stayStatus === "checked_in");
  const [checkOutNeedsInspection, setCheckOutNeedsInspection] = React.useState(false);

  // Кто принял оплату и когда — по каждой записи, не только агрегат
  // totalAmount/paidAmount у брони (см. HotelPayment.acceptedByName/acceptedAt).
  const paymentsQuery = useQuery({
    queryKey: ["hotel", "reservation", reservationId, "payments"],
    queryFn: ({ signal }) => listPayments(reservationId!, signal),
    enabled: reservationId != null,
    placeholderData: undefined,
  });
  const payments = paymentsQuery.data?.reservationId === reservationId ? paymentsQuery.data.results : [];

  const catalogsQuery = useQuery({
    queryKey: ["hotel", "catalogs", reservation?.propertyId],
    queryFn: ({ signal }) => getHotelCatalogs(reservation!.propertyId, signal),
    enabled: reservation != null,
  });
  const paymentMethodChoices = React.useMemo(() => catalogsQuery.data?.paymentMethods ?? [], [catalogsQuery.data]);

  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [checkInNeedsForce, setCheckInNeedsForce] = React.useState(false);
  // Сервер отказал: заезд по брони позже сегодняшней даты объекта (409 CHECK_IN_TOO_EARLY) —
  // его текст и выход «Изменить даты». Кнопка «Заселить» до даты заезда и так неактивна,
  // но ответ возможен: карточка открыта со вчера, второй администратор, старая вкладка.
  const [checkInRefused, setCheckInRefused] = React.useState<string | null>(null);
  // Паспорт при брони необязателен, а заселить без него нельзя — сначала панель документа.
  const [checkInNeedsDocument, setCheckInNeedsDocument] = React.useState(false);
  const [documentSaved, setDocumentSaved] = React.useState(false);
  const [checkOutNeedsForce, setCheckOutNeedsForce] = React.useState(false);
  // Выезд в день заезда: сервер оставляет в счёте первую ночь, остальные освобождает (r3 §8) — спросим один раз.
  const [checkOutSameDay, setCheckOutSameDay] = React.useState(false);
  const [cancelPromptOpen, setCancelPromptOpen] = React.useState(false);
  // Панель правки: "edit" — даты/гости/питание, "room" — другой номер.
  const [editMode, setEditMode] = React.useState<"edit" | "room" | null>(null);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [cancelReason, setCancelReason] = React.useState("");
  const [messageAnchor, setMessageAnchor] = React.useState<HTMLElement | null>(null);
  const [cancelAsNoShow, setCancelAsNoShow] = React.useState(false);
  // Штраф при отмене (r5): галочка и сумма — уходят в penaltyAmount запроса отмены.
  const [chargePenalty, setChargePenalty] = React.useState(false);
  const [penaltyInput, setPenaltyInput] = React.useState("");

  const [paymentFormOpen, setPaymentFormOpen] = React.useState(false);
  // «Оплата» или «Возврат» — тот же POST /payments/ с kind; возврат не больше принятого.
  const [paymentKind, setPaymentKind] = React.useState<"payment" | "refund">("payment");
  // Вкладки карточки — как в Exely: обзор, проживание и услуги, счета, документы, история.
  const [tab, setTab] = React.useState<CardTab>("overview");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  // Валюта, которой платит гость ("" — валюта объекта); список — из курсов объекта (контракт §5).
  const [paymentCurrency, setPaymentCurrency] = React.useState("");
  const ratesQuery = useExchangeRates(reservation?.propertyId, reservation?.currency || "KGS");
  const foreignRates = ratesQuery.data?.available ? ratesQuery.data.rates : [];
  const paymentRate = paymentCurrency ? rateOf(ratesQuery.data, paymentCurrency) : 1;
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
    setActiveItemId(initialItemId ?? null);
    setActionError(null);
    setCheckInNeedsForce(false);
    setCheckInRefused(null);
    setCheckInNeedsDocument(false);
    setDocumentSaved(false);
    setCheckOutNeedsForce(false);
    setCheckOutSameDay(false);
    setCheckOutNeedsInspection(false);
    setCancelPromptOpen(false);
    setEditMode(null);
    setCancelReason("");
    setCancelAsNoShow(false);
    setChargePenalty(false);
    setPenaltyInput("");
    setPaymentFormOpen(false);
    setPaymentKind("payment");
    setTab("overview");
    setPaymentMethod("");
    setPaymentCurrency("");
    setPaymentAmount("");
    setPaymentNote("");
    setCashlessMethodId("");
    setPaymentError(null);
    // initialItemId приходит вместе с reservationId — отдельно не следим.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  React.useEffect(() => {
    if (paymentFormOpen && !paymentMethod && paymentMethodChoices.length > 0) setPaymentMethod(paymentMethodChoices[0].value);
  }, [paymentFormOpen, paymentMethod, paymentMethodChoices]);

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
    // Списки броней («Ресепшен», история гостя) — статус и оплата там тоже меняются.
    void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
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
      const confirmed = await confirmReservation(reservation.id, { version: reservation.version });
      invalidateReservation();
      // Подтверждение гостю — сразу, одним нажатием: само по себе сообщение не
      // уходит (рассылки с сервера пока нет), а гость с сайта ждёт ответа.
      const phone = confirmed.items[0]?.guests.find((g) => g.isPrimary)?.phone || confirmed.items[0]?.guests[0]?.phone || "";
      const link = whatsappLink(phone, buildGuestMessage("confirmation", confirmed, property ?? null));
      enqueueSnackbar(link ? "Бронь подтверждена — отправьте гостю подтверждение" : "Бронь подтверждена", {
        variant: "success",
        autoHideDuration: link ? 12_000 : 4_000,
        action: link
          ? (k) => (
              <Button
                color="inherit"
                size="small"
                sx={{ fontWeight: 700 }}
                onClick={() => {
                  closeSnackbar(k);
                  window.open(link, "_blank", "noopener");
                }}
              >
                В WhatsApp
              </Button>
            )
          : undefined,
      });
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
        ...(chargePenalty && penaltyNum > 0 ? { penaltyAmount: penaltyNum.toFixed(2) } : {}),
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

  // skipDocument — «Заселить без паспорта» в панели документа. Повтор с force идёт
  // после ответа сервера на заселение, то есть документ уже решён — не спрашиваем снова.
  const handleCheckIn = async (force = false, skipDocument = false) => {
    if (!reservation || !item) return;
    if (!force && !skipDocument && missingDocumentGuest(item)) {
      setCheckInNeedsDocument(true);
      return;
    }
    setDocumentSaved(false);
    setActionBusy(true);
    setActionError(null);
    try {
      await checkInReservationItem(reservation.id, item.id, {
        version: reservation.version,
        ...(force ? { forceDirty: true, forceReason: "Подтверждено сотрудником при заселении" } : {}),
      });
      setCheckInNeedsForce(false);
      setCheckInRefused(null);
      invalidateReservation();
    } catch (err) {
      if (!force && err instanceof ApiError && err.code === "ROOM_NOT_READY") {
        setCheckInNeedsForce(true);
        return;
      }
      if (err instanceof ApiError && err.code === "CHECK_IN_TOO_EARLY") {
        setCheckInNeedsForce(false);
        setCheckInRefused(getErrorMessage(err, "Заселить можно с даты заезда по брони. Чтобы заселить раньше, измените даты брони."));
        // Бронь на сервере не изменилась, но карточка могла устареть (дата сменилась, пока была открыта).
        invalidateReservation();
        return;
      }
      setActionError(getErrorMessage(err, "Не удалось заселить"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCheckOut = async (force = false, skipInspection = false, sameDayConfirmed = false) => {
    if (!reservation || !item) return;
    if (!sameDayConfirmed && !force && sameDayCheckOut) {
      setCheckOutSameDay(true);
      return;
    }
    setCheckOutSameDay(false);
    // Номер не проверен (или проверка ещё идёт) — спросим один раз, не блокируя.
    if (!skipInspection && inspection.visible && inspection.state !== "ok" && inspection.state !== "issues") {
      setCheckOutNeedsInspection(true);
      return;
    }
    setCheckOutNeedsInspection(false);
    setActionBusy(true);
    setActionError(null);
    try {
      await checkOutReservationItem(reservation.id, item.id, {
        version: reservation.version,
        ...(force ? { allowDebt: true } : {}),
      });
      setCheckOutNeedsForce(false);
      void inspection.closeAfterCheckOut();
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
    if (paymentKind === "refund" && !paymentNote.trim()) {
      setPaymentError("Укажите причину возврата");
      return;
    }
    setPaymentSaving(true);
    setPaymentError(null);
    try {
      // Демо-режим валют (бэкенд ещё не принимает currency): сумма уходит в сомах по курсу,
      // исходная — меткой в комментарии, по ней карточка и отчёт смены покажут «$50».
      const demoForeign = Boolean(paymentCurrency && paymentRate && ratesQuery.data?.demo);
      await addPayment(reservation.id, {
        method: paymentMethod,
        amount: demoForeign ? (amountNum * (paymentRate ?? 1)).toFixed(2) : String(amountNum),
        kind: paymentKind,
        note: demoForeign ? foreignPaymentNote(paymentCurrency, amountNum, paymentRate ?? 1, paymentNote.trim()) : paymentNote.trim() || undefined,
        cashlessMethodId:
          CASHLESS_METHODS_ENABLED && paymentIsCashless && cashlessMethodId !== "" ? cashlessMethodId : undefined,
        ...(!demoForeign && paymentCurrency && paymentRate ? { currency: paymentCurrency, exchangeRate: String(paymentRate) } : {}),
      });
      setPaymentCurrency("");
      setPaymentFormOpen(false);
      setPaymentMethod("");
      setPaymentAmount("");
      setPaymentNote("");
      setCashlessMethodId("");
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservationId, "payments"] });
      invalidateReservation();
    } catch (err) {
      setPaymentError(getErrorMessage(err, paymentKind === "refund" ? "Не удалось оформить возврат" : "Не удалось провести оплату"));
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
  const todayIso = dayjs().format("YYYY-MM-DD");
  // Заселить раньше даты заезда нельзя: бронь №18 заселили 02.10 при заезде 03.10, и
  // отчёты посчитали её «выехавшей раньше срока» — ни одной прожитой ночи. Гость приехал
  // раньше — сначала меняют даты брони (это лишняя ночь и цена), потом заселяют.
  const checkInTooEarly = canCheckIn && item != null && item.checkIn > todayIso;
  const sameDayCheckOut = canCheckOut && item != null && item.checkIn === todayIso && item.nights.length > 1;
  const firstNightPrice = item?.nights[0] ? Number(item.nights[0].price) - Number(item.nights[0].discount ?? 0) : 0;
  // Штраф отмены на сегодня по условиям брони (r3 §4.3). Начисляется галочкой в отмене (r5) и становится
  // долгом закрытой брони; сумму можно поправить — например, уступить гостю.
  const cancelPenalty = reservation?.cancellationPenalty ?? null;
  const penaltyAmount = cancelPenalty?.applies ? Number(cancelPenalty.amount) : 0;
  const penaltyNum = Number(penaltyInput.replace(",", ".")) || 0;
  // Открыли отмену — штраф по условиям подставлен, если он есть.
  React.useEffect(() => {
    if (!cancelPromptOpen) return;
    setChargePenalty(penaltyAmount > 0);
    setPenaltyInput(penaltyAmount > 0 ? String(penaltyAmount) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только при открытии
  }, [cancelPromptOpen]);
  // Допуслуги в счёте после отмены остаются долгом (r5) — предупредим до отмены.
  const openChargesQuery = useQuery({
    queryKey: ["hotel", "reservation", reservationId, "charges", false],
    queryFn: ({ signal }) => listCharges(reservationId!, { includeVoided: false }, signal),
    enabled: cancelPromptOpen && reservationId != null,
  });
  const servicesInBill = (openChargesQuery.data?.results ?? []).filter((c) => !c.voidedAt && c.kind !== "penalty").reduce((s, c) => s + Number(c.totalAmount), 0);
  // Править можно живую бронь, пока гость не выехал. Номер: до заезда —
  // назначение (право на брони), у заселённого — переселение (право на заселение).
  const isLiveReservation = reservation != null && CANCELLABLE_STATUSES.has(reservation.status) && item?.stayStatus !== "checked_out";
  const canEditStay = canManageReservation && isLiveReservation;
  const canChangeRoom =
    isLiveReservation && (item?.stayStatus === "checked_in" ? canManageStays : item?.stayStatus === "expected" && canManageReservation);
  const hasStatusActions = canConfirm || canCancel || canCheckIn || canCheckOut || canEditStay || canChangeRoom;


  const money = (v: string | number) => `${Number(v).toLocaleString("ru-RU")} ${reservation?.currency === "KGS" || !reservation ? "сом" : reservation.currency}`;
  const total = Number(reservation?.totalAmount ?? 0);
  const paid = Number(reservation?.paidAmount ?? 0);
  const balance = Number(reservation?.balanceDue ?? 0);
  // Сколько бронь должна на самом деле (r5): у закрытой — штраф и неснятые допуслуги, у живой — весь счёт.
  const closedNow = reservation != null && ["cancelled", "no_show", "expired"].includes(reservation.status);
  const billTotal = closedNow ? Math.max(0, paid + balance) : total;

  // «Принять оплату» — сразу с полной суммой остатка и первым способом
  // оплаты: чаще всего гость платит всё, что осталось, и администратору
  // остаётся нажать «Провести оплату». Частичную сумму можно поправить.
  const openPaymentForm = (kind: "payment" | "refund" = "payment") => {
    setPaymentError(null);
    // У закрытой брони без долга принять нечего — только вернуть внесённое.
    if (kind === "payment" && closedNow && balance <= 0) kind = "refund";
    setPaymentKind(kind);
    // Возврат: сумму вводят руками (обычно часть), причина обязательна.
    setPaymentAmount(kind === "payment" && balance > 0 ? String(balance) : "");
    setPaymentNote("");
    setPaymentMethod((current) => current || paymentMethodChoices[0]?.value || "");
    setPaymentFormOpen(true);
    setTab("billing");
  };
  const paidShare = billTotal > 0 ? Math.min(100, Math.round((paid / billTotal) * 100)) : paid > 0 ? 100 : 0;
  // Отменённая, незаезд, истёкшая: статус проживания («Подтверждена») рядом со статусом брони противоречил ему.
  const reservationClosed = reservation != null && ["cancelled", "no_show", "expired"].includes(reservation.status);
  const stayStatus = item && !reservationClosed ? mapStayDisplayStatus(item.stayStatus) : null;
  const stayColor = stayStatus ? hotelStayStatusColor(stayStatus, theme) : theme.palette.text.disabled;

  const detailRows: { label: string; value: React.ReactNode }[] =
    reservation && item
      ? [
          { label: "Номер", value: `${item.roomNumber ?? "не назначен"} · ${item.roomTypeName}` },
          { label: "Гости", value: `${item.adults} взр.${item.children > 0 ? ` + ${item.children} дет.` : ""}` },
          { label: "Питание", value: HOTEL_BOARD_TYPE_LABELS[item.boardType] ?? item.boardType },
          { label: "Источник", value: HOTEL_BOOKING_SOURCE_LABELS[reservation.source] ?? reservation.source },
          // Номер брони на Booking/Островке: гость называет его — по нему бронь ищется в шахматке.
          ...(reservation.externalId?.trim() || canManageReservation
            ? [{ label: "№ брони в канале", value: <ReservationExternalId reservation={reservation} canEdit={Boolean(canManageReservation) && !reservationClosed} /> }]
            : []),
          // Время брони (ранний заезд, поздний выезд) или правило объекта; после заселения / выезда — факт.
          {
            label: `Заезд ${dayjs(item.checkIn).format("D MMM")}`,
            value: (
              <ReservationStayTime
                kind="arrival"
                reservation={reservation}
                ruleTime={property?.checkInTime}
                actualAt={item.checkedInAt}
                canEdit={Boolean(canManageReservation) && item.stayStatus === "expected" && CANCELLABLE_STATUSES.has(reservation.status)}
              />
            ),
          },
          {
            label: `Выезд ${dayjs(item.checkOut).format("D MMM")}`,
            value: (
              <ReservationStayTime
                kind="departure"
                reservation={reservation}
                ruleTime={property?.checkOutTime}
                actualAt={item.checkedOutAt}
                canEdit={Boolean(canManageReservation) && item.stayStatus !== "checked_out" && CANCELLABLE_STATUSES.has(reservation.status)}
              />
            ),
          },
          ...(reservation.guaranteeMethod
            ? [{ label: "Гарантия", value: HOTEL_GUARANTEE_METHOD_LABELS[reservation.guaranteeMethod] ?? reservation.guaranteeMethod }]
            : []),
        ]
      : [];

  // Главное действие по статусу — одной заметной кнопкой, остальное рядом тише.
  const primaryAction: { label: string; onClick: () => void; disabledHint?: string } | null = canCheckIn
    ? {
        label: "Заселить",
        onClick: () => void handleCheckIn(),
        disabledHint: checkInTooEarly && item
          ? `Заезд по брони — ${dayjs(item.checkIn).format("D MMMM")}. Гость приехал раньше — сначала «Изменить» даты брони, потом заселение.`
          : undefined,
      }
    : canCheckOut
      ? { label: "Выселить", onClick: () => void handleCheckOut() }
      : canConfirm
        ? { label: "Подтвердить", onClick: () => void handleConfirm() }
        : null;

  const sectionLabelSx = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", mb: 1.25 } as const;
  const line = `1px solid ${subtleBorder(theme)}`;

  // Сумма формы в валюте объекта — для проверки возврата и подсказки пересчёта.
  const paymentAmountBase = Number(paymentAmount) * (paymentRate ?? 1);
  const refundExceeds = paymentKind === "refund" && paymentAmountBase > paid;
  // Закрытая бронь принимает оплату только в счёт долга и не больше него (r5 §4).
  const closedPayExceeds = closedNow && paymentKind === "payment" && paymentAmountBase > Math.max(0, balance);
  const paymentSummary = (
    <Box sx={{ p: 2, borderRadius: "12px", bgcolor: subtleBg(theme, true) }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Оплачено
        </Typography>
        <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {money(paid)}{" "}
          <Typography component="span" variant="body2" color="text.secondary">
            из {money(billTotal)}
            {closedNow ? " · штраф и услуги в счёте" : ""}
          </Typography>
        </Typography>
      </Stack>
      <Box sx={{ height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.08), overflow: "hidden" }}>
        <Box sx={{ width: `${paidShare}%`, height: "100%", borderRadius: 3, bgcolor: balance > 0 ? theme.palette.warning.main : theme.palette.success.main }} />
      </Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {paidShare}%
        </Typography>
        <Typography variant="caption" fontWeight={600} color={balance > 0 ? "error.main" : balance < 0 ? "warning.main" : "success.main"}>
          {balance > 0 ? `Остаток ${money(balance)}` : balance < 0 ? `К возврату ${money(-balance)}` : "Долга нет"}
        </Typography>
      </Stack>
    </Box>
  );
  const paymentForm = (
    <Collapse in={paymentFormOpen} unmountOnExit>
      <Stack gap={1.5} sx={{ mt: 1.5, p: 2, borderRadius: "12px", border: line }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={paymentKind}
          onChange={(_, v: "payment" | "refund" | null) => v && setPaymentKind(v)}
          disabled={paymentSaving}
          sx={{ alignSelf: "flex-start", "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 600, px: 1.5 } }}
        >
          <ToggleButton value="payment" disabled={closedNow && balance <= 0}>
            Оплата
          </ToggleButton>
          <ToggleButton value="refund" disabled={paid <= 0}>
            Возврат
          </ToggleButton>
        </ToggleButtonGroup>
        {paymentError && <Alert severity="error">{paymentError}</Alert>}
        {/* На телефоне три поля в ряд не помещались (способ — «Н…», сумма за единицей): способ своей строкой. */}
        <Stack direction="row" gap={1.5} sx={{ flexWrap: { xs: "wrap", md: "nowrap" } }}>
          <TextField
            select
            label={paymentKind === "refund" ? "Способ возврата" : "Способ оплаты"}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            slotProps={{ input: { startAdornment: <FieldIcon icon={<AccountBalanceWalletOutlined />} /> } }}
            size="small"
            sx={{ flex: 1, minWidth: { xs: "100%", md: "auto" } }}
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
          <FormField
            icon={paymentKind === "refund" ? <UndoOutlined /> : <PaymentsOutlined />}
            label={paymentKind === "refund" ? "Сумма возврата" : "Сумма"}
            unit={paymentCurrency ? currencySign(paymentCurrency) : "сом"}
            value={paymentAmount}
            onValueChange={setPaymentAmount}
            rules={{ kind: "decimal", min: paymentCurrency ? 0.01 : 1, max: paymentKind === "refund" && !paymentCurrency ? Math.max(1, paid) : 100_000_000 }}
            size="small"
            sx={{ flex: 1 }}
            disabled={paymentSaving}
            error={refundExceeds || closedPayExceeds}
            helperText={
              refundExceeds
                ? `Не больше принятого: ${money(paid)}`
                : closedPayExceeds
                  ? `Бронь закрыта: принять можно не больше долга — ${money(Math.max(0, balance))}`
                : paymentCurrency && paymentRate && paymentAmount
                  ? `= ${money(Math.round(paymentAmountBase * 100) / 100)} по курсу ${paymentRate.toLocaleString("ru-RU")}`
                  : paymentKind === "refund"
                    ? `Принято ${money(paid)}`
                    : balance > 0 && !paymentAmount
                      ? paymentCurrency && paymentRate
                        ? `Остаток ${money(balance)} ≈ ${(balance / paymentRate).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${currencySign(paymentCurrency)}`
                        : `Остаток ${money(balance)}`
                      : undefined
            }
          />
          {foreignRates.length > 0 && (
            <TextField
              select
              size="small"
              label="Валюта"
              value={paymentCurrency}
              onChange={(e) => setPaymentCurrency(e.target.value)}
              disabled={paymentSaving}
              sx={{ width: 110, flexShrink: 0 }}
            >
              <MenuItem value="">сом</MenuItem>
              {foreignRates.map((r) => (
                <MenuItem key={r.currency} value={r.currency}>
                  {r.currency} {currencySign(r.currency)}
                </MenuItem>
              ))}
            </TextField>
          )}
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
        <FormField
          icon={<ChatBubbleOutlineOutlined />}
          label={paymentKind === "refund" ? "Причина возврата" : "Комментарий"}
          placeholder={paymentKind === "refund" ? "Ранний выезд, ошибка в сумме…" : "Необязательно"}
          value={paymentNote}
          onValueChange={setPaymentNote}
          rules={{ maxLength: 300, required: paymentKind === "refund" }}
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
            color={paymentKind === "refund" ? "warning" : "primary"}
            disableElevation
            disabled={paymentSaving || !paymentMethod || !paymentAmount || refundExceeds || (paymentKind === "refund" && !paymentNote.trim())}
            onClick={() => void handleAddPayment()}
          >
            {paymentSaving ? "Сохраняем…" : paymentKind === "refund" ? "Оформить возврат" : "Провести оплату"}
          </Button>
        </Stack>
      </Stack>
    </Collapse>
  );
  const paymentRows = (rows: typeof payments) =>
    rows.map((p, i) => (
      <Stack key={p.id} direction="row" alignItems="center" gap={1.5} sx={{ py: 1.1, borderTop: i === 0 ? "none" : line }}>
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: "9px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            bgcolor: alpha(p.kind === "refund" ? theme.palette.warning.main : theme.palette.success.main, 0.12),
            color: p.kind === "refund" ? "warning.main" : "success.main",
          }}
        >
          {p.kind === "refund" ? <UndoOutlined sx={{ fontSize: 16 }} /> : <PaymentsOutlined sx={{ fontSize: 16 }} />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600}>
            {p.kind === "refund" ? "Возврат · " : ""}
            {p.methodLabel || p.method}
            {p.cashlessMethodName ? ` · ${p.cashlessMethodName}` : ""}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {[p.acceptedByName, dayjs(p.acceptedAt).format("D MMM, HH:mm"), parseForeignPayment(p.note)?.rest ?? p.note].filter(Boolean).join(" · ")}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: p.kind === "refund" ? "warning.main" : "text.primary" }}>
            {p.kind === "refund" ? "−" : "+"}
            {Number(p.amount).toLocaleString("ru-RU")}
            {reservation && p.currency && p.currency !== reservation.currency ? ` ${currencySign(p.currency)}` : ""}
          </Typography>
          {reservation && p.currency && p.currency !== reservation.currency && p.amountBase && (
            <Typography variant="caption" color="text.secondary" component="div">
              = {money(p.amountBase)}
              {p.exchangeRate ? ` по ${Number(p.exchangeRate).toLocaleString("ru-RU")}` : ""}
            </Typography>
          )}
          {(() => {
            const foreign = parseForeignPayment(p.note);
            return foreign ? (
              <Typography variant="caption" color="text.secondary" component="div" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {foreign.amount.toLocaleString("ru-RU")} {currencySign(foreign.currency)} по {foreign.rate.toLocaleString("ru-RU")}
              </Typography>
            ) : null;
          })()}
        </Box>
      </Stack>
    ));
  const primaryPhone = item ? item.guests.find((g) => g.isPrimary)?.phone || item.guests[0]?.phone || "" : "";

  return (
    <Dialog
      open={reservationId != null}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={phone}
      // Окно прижато к верху: при смене вкладок высота меняется, и по центру оно бы «прыгало».
      sx={{ "& .MuiDialog-container": { alignItems: { md: "flex-start" } } }}
      PaperProps={{ sx: { borderRadius: phone ? 0 : "16px", overflow: "hidden", backgroundImage: "none", mt: { md: 5 } } }}
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
            <>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">
                Загружаем бронь…
              </Typography>
            </>
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
              <Stack direction="row" gap={0.75} sx={{ flexShrink: 0 }}>
                {(() => {
                  const phone = item.guests.find((g) => g.isPrimary)?.phone || item.guests[0]?.phone || "";
                  const can = whatsappLink(phone) != null;
                  return (
                    <Tooltip title={can ? "Написать гостю в WhatsApp" : "У гостя не указан телефон"}>
                      <span>
                        <IconButton
                          onClick={(e) => setMessageAnchor(e.currentTarget)}
                          disabled={!can}
                          aria-label="Написать гостю в WhatsApp"
                          sx={{ width: 34, height: 34, border: line, color: "#25D366", "&.Mui-disabled": { color: "text.disabled" } }}
                        >
                          <WhatsApp sx={{ fontSize: 18 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  );
                })()}
                <Tooltip title="Документы: подтверждение, счёт, регистрационная карта, справка">
                  <IconButton
                    onClick={() => setTab("docs")}
                    aria-label="Печать документов"
                    sx={{ width: 34, height: 34, border: line, color: "text.secondary", "&:hover": { color: "text.primary" } }}
                  >
                    <PrintOutlined sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
                <IconButton
                  onClick={onClose}
                  aria-label="Закрыть"
                  sx={{ width: 34, height: 34, border: line, color: "text.secondary", "&:hover": { color: "text.primary" } }}
                >
                  <CloseOutlined sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>
              <Menu anchorEl={messageAnchor} open={messageAnchor != null} onClose={() => setMessageAnchor(null)}>
                {(Object.keys(GUEST_MESSAGE_LABELS) as GuestMessageKind[])
                  .filter((kind) => kind !== "balance" || balance > 0)
                  .map((kind) => (
                    <MenuItem
                      key={kind}
                      onClick={() => {
                        setMessageAnchor(null);
                        const phone = item.guests.find((g) => g.isPrimary)?.phone || item.guests[0]?.phone || "";
                        const link = whatsappLink(phone, buildGuestMessage(kind, reservation, property ?? null));
                        if (link) window.open(link, "_blank", "noopener");
                      }}
                    >
                      {GUEST_MESSAGE_LABELS[kind]}
                    </MenuItem>
                  ))}
              </Menu>
            </Stack>

            <Stack direction="row" alignItems="flex-end" justifyContent="space-between" gap={2} flexWrap="wrap">
              <Typography sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", minWidth: 0 }}>
                {reservation.customerName || item.guests[0]?.fullName || "Без заказчика"}
              </Typography>
              <Box sx={{ textAlign: { xs: "left", md: "right" } }}>
                <Stack direction="row" alignItems="center" gap={1} justifyContent={{ xs: "flex-start", md: "flex-end" }}>
                  <DisplayCurrencySwitch propertyId={reservation.propertyId} baseCurrency={reservation.currency} />
                  {/* У закрытой брони крупно — сколько она должна на самом деле (штраф и услуги), а не стоимость ночей. */}
                  <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                    {money(reservationClosed ? billTotal : reservation.totalAmount)}
                  </Typography>
                </Stack>
                <Stack direction="row" gap={0.75} justifyContent={{ xs: "flex-start", md: "flex-end" }} alignItems="baseline">
                  <CurrencyEquivalent propertyId={reservation.propertyId} baseCurrency={reservation.currency} amount={reservationClosed ? billTotal : Number(reservation.totalAmount)} />
                  <Typography variant="caption" color={reservationClosed ? (balance > 0 ? "error.main" : "text.secondary") : balance > 0 ? "error.main" : "success.main"} fontWeight={600}>
                    {reservationClosed
                      ? balance > 0
                        ? `долг ${money(balance)}`
                        : balance < 0
                          ? `к возврату ${money(-balance)}`
                          : paid > 0
                            ? `внесено ${money(paid)}`
                            : "без оплаты"
                      : balance > 0
                        ? `к оплате ${money(balance)}`
                        : "оплачено полностью"}
                  </Typography>
                </Stack>
              </Box>
            </Stack>

            {reservation.items.length > 1 && (
              <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mr: 0.5 }}>
                  Групповая бронь · {reservation.items.length} {reservation.items.length < 5 ? "номера" : "номеров"}:
                </Typography>
                {reservation.items.map((it) => {
                  const st = mapStayDisplayStatus(it.stayStatus);
                  const active = it.id === item.id;
                  return (
                    <Chip
                      key={it.id}
                      size="small"
                      label={`№${it.roomNumber ?? "—"} · ${it.adults + it.children} гост.`}
                      onClick={() => {
                        setActiveItemId(it.id);
                        setEditMode(null);
                        setCheckInNeedsForce(false);
                        setCheckInRefused(null);
                        setCheckOutNeedsForce(false);
                        setActionError(null);
                      }}
                      variant={active ? "filled" : "outlined"}
                      color={active ? "primary" : "default"}
                      icon={<Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: hotelStayStatusColor(st, theme), ml: "8px !important" }} />}
                      title={`${it.roomTypeName} · ${HOTEL_STAY_STATUS_LABELS[st]}`}
                    />
                  );
                })}
              </Stack>
            )}

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
                    <Button
                      color="error"
                      disabled={actionBusy}
                      onClick={() => {
                        setEditMode(null);
                        setCancelPromptOpen((v) => !v);
                      }}
                    >
                      Отменить бронь
                    </Button>
                  )}
                  {canChangeRoom && (
                    <Button
                      disabled={actionBusy}
                      startIcon={<SwapHorizOutlined fontSize="small" />}
                      onClick={() => {
                        setCancelPromptOpen(false);
                        setEditMode((m) => (m === "room" ? null : "room"));
                      }}
                    >
                      {item.stayStatus === "checked_in" ? "Переселить" : "Сменить номер"}
                    </Button>
                  )}
                  {canEditStay && (
                    <Button
                      disabled={actionBusy}
                      startIcon={<EditOutlined fontSize="small" />}
                      onClick={() => {
                        setCancelPromptOpen(false);
                        setEditMode((m) => (m === "edit" ? null : "edit"));
                      }}
                    >
                      Изменить
                    </Button>
                  )}
                  {canConfirm && primaryAction?.label !== "Подтвердить" && (
                    <Button variant="outlined" disabled={actionBusy} onClick={() => void handleConfirm()}>
                      Подтвердить
                    </Button>
                  )}
                  {primaryAction && (
                    <Tooltip title={primaryAction.disabledHint ?? ""}>
                      {/* span — у неактивной кнопки подсказка иначе не появляется */}
                      <span>
                        <Button
                          variant="contained"
                          disableElevation
                          disabled={actionBusy || primaryAction.disabledHint != null}
                          onClick={primaryAction.onClick}
                          sx={{ px: 2.5, borderRadius: "10px", fontWeight: 700 }}
                        >
                          {primaryAction.label}
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                </Stack>
              )}
            </Stack>

            {item.stayStatus === "checked_in" && (
              <RoomInspectionStrip
                inspection={inspection}
                roomNumber={item.roomNumber}
                onAddCharge={canManagePayments ? () => setTab("stay") : undefined}
              />
            )}

            {(actionError ||
              checkInNeedsForce ||
              checkInRefused ||
              checkInNeedsDocument ||
              documentSaved ||
              checkOutNeedsForce ||
              checkOutSameDay ||
              checkOutNeedsInspection ||
              cancelPromptOpen ||
              editMode != null) && (
              <Stack gap={1.5} sx={{ mt: 2 }}>
                {checkInNeedsDocument && missingDocumentGuest(item) && (
                  <CheckInDocumentPanel
                    reservation={reservation}
                    item={item}
                    onCancel={() => setCheckInNeedsDocument(false)}
                    onSkip={() => {
                      setCheckInNeedsDocument(false);
                      void handleCheckIn(false, true);
                    }}
                    onSaved={() => {
                      setCheckInNeedsDocument(false);
                      setDocumentSaved(true);
                      invalidateReservation();
                    }}
                  />
                )}
                {documentSaved && !missingDocumentGuest(item) && (
                  <Alert severity="success" onClose={() => setDocumentSaved(false)}>
                    Паспорт внесён — теперь можно заселить.
                  </Alert>
                )}
                {checkOutNeedsInspection && (
                  <Alert
                    severity="info"
                    onClose={() => setCheckOutNeedsInspection(false)}
                    action={
                      <Stack direction="row" gap={0.5}>
                        <Button size="small" color="inherit" onClick={() => void handleCheckOut(false, true, true)}>
                          Выселить без проверки
                        </Button>
                      </Stack>
                    }
                  >
                    {inspection.state === "none"
                      ? "Номер не проверяли перед выездом. Отправьте его горничной выше или выселите без проверки."
                      : "Горничная ещё не ответила по проверке номера."}
                  </Alert>
                )}
                {actionError && (
                  <Alert severity="error" onClose={() => setActionError(null)}>
                    {actionError}
                  </Alert>
                )}
                {checkInRefused && (
                  <Alert
                    severity="warning"
                    onClose={() => setCheckInRefused(null)}
                    action={
                      canManageReservation ? (
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() => {
                            setCheckInRefused(null);
                            setEditMode("edit");
                          }}
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          Изменить даты
                        </Button>
                      ) : undefined
                    }
                  >
                    {checkInRefused}
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
                {checkOutSameDay && item && (
                  <Alert
                    severity="info"
                    onClose={() => setCheckOutSameDay(false)}
                    action={
                      <Button size="small" color="inherit" onClick={() => void handleCheckOut(false, false, true)} disabled={actionBusy}>
                        Выселить
                      </Button>
                    }
                  >
                    Выезд в день заезда: в счёте останется первая ночь ({money(firstNightPrice)}), остальные {item.nights.length - 1}{" "}
                    {plural(item.nights.length - 1, "ночь", "ночи", "ночей")} освободятся и вернутся в продажу.
                  </Alert>
                )}
                {checkOutNeedsForce && (
                  <Alert
                    severity="warning"
                    action={
                      <Button size="small" color="inherit" onClick={() => void handleCheckOut(true, true)}>
                        Выселить с долгом
                      </Button>
                    }
                  >
                    Остаток к оплате: {money(reservation.balanceDue)}.
                  </Alert>
                )}
                {editMode != null && (
                  <ReservationEditPanel
                    key={`${editMode}-${item.id}`}
                    mode={editMode}
                    reservation={reservation}
                    item={item}
                    catalogs={catalogsQuery.data}
                    onCancel={() => setEditMode(null)}
                    onSaved={(message) => {
                      setEditMode(null);
                      invalidateReservation();
                      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
                      void queryClient.invalidateQueries({ queryKey: ["hotel", "room-availability"] });
                      enqueueSnackbar(message, { variant: "success" });
                    }}
                  />
                )}
                <Collapse in={cancelPromptOpen}>
                  <Stack gap={1.5} sx={{ p: 2, borderRadius: "12px", bgcolor: subtleBg(theme, true) }}>
                    {cancelPenalty && (
                      <Alert severity={cancelPenalty.applies ? "warning" : "success"} variant="outlined" sx={{ py: 0.25 }}>
                        {cancelPenalty.applies ? (
                          <>По условиям брони отмена сегодня — со штрафом <b>{money(penaltyAmount)}</b>.</>
                        ) : (
                          <>Отмена бесплатна{cancelPenalty.freeUntil ? ` до ${dayjs(cancelPenalty.freeUntil).format("D MMMM")} включительно` : ""}.</>
                        )}
                      </Alert>
                    )}
                    <Stack direction={{ xs: "column", md: "row" }} gap={1} alignItems={{ md: "center" }}>
                      <FormControlLabel
                        control={<Checkbox size="small" checked={chargePenalty} onChange={(e) => setChargePenalty(e.target.checked)} />}
                        label={<Typography variant="body2">Начислить штраф</Typography>}
                        sx={{ mr: 0 }}
                      />
                      {chargePenalty && (
                        <TextField
                          size="small"
                          label="Сумма штрафа"
                          value={penaltyInput}
                          onChange={(e) => setPenaltyInput(e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
                          error={penaltyNum <= 0}
                          slotProps={{ input: { endAdornment: <InputAdornment position="end">{reservation.currency === "KGS" ? "сом" : reservation.currency}</InputAdornment> }, htmlInput: { inputMode: "decimal" } }}
                          sx={{ width: { xs: "100%", md: 200 } }}
                        />
                      )}
                    </Stack>
                    {(() => {
                      // Что останется после отмены: штраф и неснятые допуслуги минус внесённое.
                      const owedAfter = (chargePenalty ? penaltyNum : 0) + servicesInBill - paid;
                      const lines: string[] = [];
                      if (servicesInBill > 0) lines.push(`В счёте допуслуги на ${money(servicesInBill)} — после отмены они останутся долгом; неоказанные снимите во вкладке «Проживание».`);
                      if (owedAfter > 0) lines.push(`После отмены долг гостя — ${money(owedAfter)}.`);
                      else if (owedAfter < 0) lines.push(`После отмены к возврату ${money(-owedAfter)}.`);
                      return lines.length ? (
                        <Typography variant="caption" color={owedAfter > 0 || servicesInBill > 0 ? "warning.main" : "text.secondary"} component="div">
                          {lines.join(" ")}
                        </Typography>
                      ) : null;
                    })()}
                    <FormField
                      icon={<EventBusyOutlined />}
                      label="Причина отмены"
                      value={cancelReason}
                      onValueChange={setCancelReason}
                      rules={{ maxLength: 500 }}
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
                          disabled={!cancelReason.trim() || actionBusy || (chargePenalty && penaltyNum <= 0)}
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

          {/* ── Вкладки ── */}
          <Box sx={{ px: { xs: 1, md: 2 }, borderBottom: line }}>
            <Tabs
              value={tab}
              onChange={(_, v: CardTab) => setTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              // Короткие подписи: шесть вкладок с длинными не влезали даже на 1440 px — «История» уезжала под стрелку.
              sx={{ minHeight: 46, "& .MuiTab-root": { minHeight: 46, minWidth: 0, textTransform: "none", fontWeight: 600, fontSize: 14, px: 1.5 } }}
            >
              <Tab value="overview" label="Обзор" />
              <Tab value="stay" label="Проживание" />
              <Tab
                value="billing"
                label={
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    Оплата
                    {balance > 0 && <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "error.main" }} />}
                  </Stack>
                }
              />
              <Tab value="docs" label="Документы" />
              <Tab
                value="notes"
                label={
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    Заметки
                    {reservation.internalNote?.trim() && <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "warning.main" }} />}
                  </Stack>
                }
              />
              <Tab value="history" label={`История${reservation.logs?.length ? ` · ${reservation.logs.length}` : ""}`} />
            </Tabs>
          </Box>

          {/* ── Тело ── */}
          <DialogContent sx={{ px: { xs: 2.5, md: 3.5 }, py: 3, minHeight: 380 }}>
            {tab === "overview" && (
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
                      {/* div, а не p: в значении бывает блок (правка «Приедет около»). */}
                      <Typography component="div" variant="body2" fontWeight={600} sx={{ flex: 1, textAlign: "right", minWidth: 0 }}>
                        {r.value}
                      </Typography>
                    </Stack>
                  ))}

                  {reservation.internalNote?.trim() && (
                    <Box
                      onClick={() => setTab("notes")}
                      sx={{ mt: 2, pl: 1.5, borderLeft: `3px solid ${theme.palette.warning.main}`, cursor: "pointer" }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        Заметка для сотрудников
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {reservation.internalNote}
                      </Typography>
                    </Box>
                  )}

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
                          <Avatar sx={{ width: 34, height: 34, fontSize: 12, fontWeight: 700, bgcolor: "action.selected", color: "text.primary" }}>{initialsOf(g.fullName)}</Avatar>
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

                  <ReservationCorporateSection reservation={reservation} live={isLiveReservation} onChanged={invalidateReservation} />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                    <Typography component="div" sx={{ ...sectionLabelSx, mb: 0 }}>
                      Оплата
                    </Typography>
                    {canManagePayments && (
                      <Button size="small" startIcon={<PaymentsOutlined fontSize="small" />} onClick={() => openPaymentForm("payment")}>
                        Принять оплату
                      </Button>
                    )}
                  </Stack>
                  {paymentSummary}
                  {payments.length > 0 && (
                    <Box sx={{ mt: 1.5 }}>
                      {paymentRows(payments.slice(0, 3))}
                      {payments.length > 3 && (
                        <Button size="small" onClick={() => setTab("billing")} sx={{ mt: 0.5 }}>
                          Все платежи ({payments.length})
                        </Button>
                      )}
                    </Box>
                  )}
                  <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2.5 }}>
                    <Button size="small" variant="outlined" onClick={() => setTab("stay")} sx={{ borderRadius: "10px" }}>
                      Цены по ночам и услуги
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => setTab("docs")} sx={{ borderRadius: "10px" }}>
                      Документы
                    </Button>
                  </Stack>
                </Box>
              </Box>
            )}

            {tab === "stay" && (
              <Stack gap={1}>
                <ReservationStaySection reservation={reservation} activeItemId={item.id} />
                <ReservationChargesSection reservation={reservation} onChanged={invalidateReservation} />
              </Stack>
            )}

            {tab === "billing" && (
              <Box sx={{ maxWidth: 680 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap" sx={{ mb: 1.25 }}>
                  <Typography component="div" sx={{ ...sectionLabelSx, mb: 0 }}>
                    Счёт брони
                  </Typography>
                  {canManagePayments && !paymentFormOpen && (
                    <Stack direction="row" gap={1}>
                      <Button size="small" startIcon={<PaymentsOutlined fontSize="small" />} onClick={() => openPaymentForm("payment")}>
                        Принять оплату
                      </Button>
                      <Tooltip title={paid > 0 ? "Вернуть гостю часть или всю оплату" : "Возвращать нечего — оплат ещё нет"}>
                        <span>
                          <Button size="small" color="warning" startIcon={<UndoOutlined fontSize="small" />} onClick={() => openPaymentForm("refund")} disabled={paid <= 0}>
                            Возврат
                          </Button>
                        </span>
                      </Tooltip>
                    </Stack>
                  )}
                </Stack>
                {paymentSummary}
                {paymentForm}
                <Typography component="div" sx={{ ...sectionLabelSx, mt: 3 }}>
                  Платежи
                </Typography>
                {payments.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Оплат по брони ещё не было.
                  </Typography>
                ) : (
                  <Box>{paymentRows(payments)}</Box>
                )}
              </Box>
            )}

            {tab === "docs" && (
              <ReservationDocumentsPanel reservation={reservation} payments={payments} property={property ?? null} phone={primaryPhone} />
            )}

            {tab === "notes" && <ReservationNotesPanel reservation={reservation} />}

            {tab === "history" &&
              ((reservation.logs ?? []).length > 0 ? (
                <ReservationHistory logs={reservation.logs ?? []} defaultOpen />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Изменений по брони ещё не было.
                </Typography>
              ))}

            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 3 }}>
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
