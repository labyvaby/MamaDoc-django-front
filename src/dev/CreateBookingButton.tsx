/**
 * «Создать бронь» — та же форма-дровер, что «Добавить приём»
 * (DjangoAddAppointmentDrawer.tsx) в реальном МамаДоктор: правый Drawer
 * фиксированной ширины, шапка с крестиком, прокручиваемое тело в
 * Stack spacing={2.5}, подвал с «Отмена»/«Создать» на borderTop, защищённое
 * закрытие (грязная форма спрашивает подтверждение вместо тихого сброса).
 *
 * Реальный бэкенд (src/api/hotel.ts, POST /hotel/reservations/) — см.
 * hotel-viva-frontend-api.md §4.3. Гость — customerId (выбран через
 * searchGuests) либо customer:{...} (создаётся на лету, как раньше в моке).
 * Пересечение дат — не превентивная проверка на фронте, а 409
 * NO_AVAILABILITY от бэка с details.conflicts; подтверждение — тот же запрос
 * с allowOverbooking: true. Если details.overbookable нет (номер в ремонте
 * или заблокирован на даты, details.reason) — повтор ничего не изменит, поэтому
 * показываем только message бэка и «Создать всё равно» не предлагаем. Документ
 * гостя уходит в items[0].guests[0].document, фото паспорта — отдельным PUT
 * после создания (нужен настоящий guestId). Фото документа распознаёт бэкенд
 * (useDocumentScan → POST /hotel/guests/scan-document/) и раскладывает
 * прочитанное по полям блока «Документ»; без права или при 503 у провайдера
 * фото просто прикрепляется.
 *
 * Открывается и «быстрой бронью» — выделение на свободных ячейках
 * RoomBookingGrid (клик — одна ночь, зажатие и протяжка — период) кладёт
 * номер+даты в общий стор (requestQuickBooking), эта кнопка на них подписана
 * и открывает форму уже с подставленными Номер/Заезд/Выезд.
 */
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import RoomServiceOutlined from "@mui/icons-material/RoomServiceOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import AlternateEmailOutlined from "@mui/icons-material/AlternateEmailOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import PublicOutlined from "@mui/icons-material/PublicOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import ConfirmationNumberOutlined from "@mui/icons-material/ConfirmationNumberOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import ChatBubbleOutlineOutlined from "@mui/icons-material/ChatBubbleOutlineOutlined";
import { FormField } from "./formField";
import { FieldIcon } from "./FieldIcon";
import { fieldError, focusFirstFieldError, GUEST_RULES, hasFieldErrors, type FieldRules } from "./formRules";
import { useCan } from "../hooks/useCan";
import { capitalizeFullName } from "../utility/name";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import WcOutlined from "@mui/icons-material/WcOutlined";
import LuggageOutlined from "@mui/icons-material/LuggageOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import FingerprintOutlined from "@mui/icons-material/FingerprintOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";


import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../components/ui";
import { useHotelProperty } from "./useHotelProperty";
import { formatGuestMatchedBy } from "./hotelDisplay";
import { CountStepper, DisabledReason, DRAWER_WIDTH, DrawerBody, DrawerFooter, DrawerHeader, DrawerSection } from "./hotelUi";
import { isDocumentFile, prepareDocumentFile, useDocumentScan } from "./useDocumentScan";
import { DocumentDropzone } from "./DocumentDropzone";
import {
  getHotelCatalogs,
  listRooms,
  listRoomTypes,
  searchGuests,
  getGuest,
  createReservation,
  uploadStayDocumentPhoto,
  uploadStayDocumentPhotoBack,
  getReservationConflicts,
  isOverbookingConfirmable,
  getQuote,
  listRatePlans,
  listCorporateAccounts,
  addPayment,
  addCharge,
  listExtraServices,
  type HotelRoom,
  type HotelGuestSearchResult,
  type HotelGuest,
  type HotelGuestDocumentScan,
  type HotelReservationConflict,
} from "../api/hotel";
import { getErrorCode, getErrorMessage } from "../api/client";
import {
  subscribeQuickBookingRequest,
  getQuickBookingRequestSnapshot,
  clearQuickBookingRequest,
  initialsOf,
  formatHotelDateRange,
  type GuestType,
} from "./mockDemoData";

/** Ограничение на фото паспорта из контракта (§4.3): jpg/png/webp/heic/pdf ≤10 МБ. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** "" → undefined — необязательные текстовые поля не должны улетать в бронь пустыми строками. */
const orUndefined = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

export interface CreateBookingButtonProps {
  /**
   * Не рендерить собственную кнопку-триггер — используется, когда открытие
   * формы идёт снаружи (requestQuickBooking без аргументов, например кнопка
   * «Добавить» в PageHeader на странице «Гости»), а не с этой самой кнопки.
   */
  hideTrigger?: boolean;
}

/** Телефон и номер документа обязательны: отель регистрирует гостя по паспорту и связывается по телефону. */
const PHONE_REQUIRED: FieldRules = { ...GUEST_RULES.phone, required: true };
const ID_REQUIRED: FieldRules = { ...GUEST_RULES.idNumber, required: true };
const PASSPORT_REQUIRED: FieldRules = { ...GUEST_RULES.docNumber, required: true };

/** Какие приёмы пищи нужны для вида питания — чтобы погасить недоступные в номере. */
const BOARD_MEALS: Record<string, string[]> = {
  breakfast: ["breakfast"],
  half_board: ["breakfast", "dinner"],
  full_board: ["breakfast", "lunch", "dinner"],
  all_inclusive: ["all_inclusive"],
};
const BOARD_HINTS: Record<string, string> = {
  none: "Только проживание",
  breakfast: "Завтрак каждый день",
  half_board: "Завтрак и ужин",
  full_board: "Завтрак, обед и ужин",
  all_inclusive: "Питание и напитки весь день",
};

interface ExtraRoom {
  key: number;
  roomId: number | "";
  adults: number;
  children: number;
}

let extraKeySeq = 0;
const nextExtraKey = () => ++extraKeySeq;

export const CreateBookingButton: React.FC<CreateBookingButtonProps> = ({ hideTrigger = false }) => {
  const { property } = useHotelProperty();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [toast, setToast] = React.useState<{ text: string; severity: "success" | "warning" } | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  // Номер уже занят на эти даты — предупреждаем, не блокируем (409
  // NO_AVAILABILITY с details.conflicts, см. handleSubmit ниже).
  const [overlapConflict, setOverlapConflict] = React.useState<HotelReservationConflict[] | null>(null);
  // Тот же 409 NO_AVAILABILITY, но без details.overbookable — номер в ремонте
  // или заблокирован на даты (details.reason): «Создать всё равно» не поможет,
  // поэтому только сообщение бэка.
  const [unavailableMessage, setUnavailableMessage] = React.useState<string | null>(null);

  // Гость и проживание
  const [guestName, setGuestName] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [selectedClientId, setSelectedClientId] = React.useState<number | null>(null);
  const [roomId, setRoomId] = React.useState<number | "">("");
  const [checkIn, setCheckIn] = React.useState<Dayjs | null>(dayjs());
  const [checkOut, setCheckOut] = React.useState<Dayjs | null>(dayjs().add(1, "day"));
  const [adults, setAdults] = React.useState("1");
  const [children, setChildren] = React.useState("0");
  const [guaranteeMethod, setGuaranteeMethod] = React.useState("");
  // Предоплата: сколько сомов гость уже внёс и каким способом. Раньше гарантия
  // «Предоплата» выбиралась, а сумма нигде не фиксировалась — не было видно,
  // сколько заплачено и сколько осталось. Сумма уходит платежом сразу после
  // создания брони (POST /reservations/{id}/payments/).
  const [prepaymentAmount, setPrepaymentAmount] = React.useState("");
  // После первой попытки создать бронь — ошибки всех полей, даже не тронутых.
  const [showErrors, setShowErrors] = React.useState(false);
  const [prepaymentMethod, setPrepaymentMethod] = React.useState("");
  const [boardType, setBoardType] = React.useState("");
  // Тарифный план (RatePlan). "" — основной: бэк сам берёт его, если план не передан.
  const [ratePlanId, setRatePlanId] = React.useState<number | "">("");

  // Документ
  const [guestType, setGuestType] = React.useState<GuestType>("resident");
  // Поля документа скрыты, пока не пришёл ответ распознавания (тогда уже
  // заполненные) или пока не нажали «Заполнить вручную».
  const [documentFieldsVisible, setDocumentFieldsVisible] = React.useState(false);
  const [idNumber, setIdNumber] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [citizenship, setCitizenship] = React.useState("");
  const [passportNumber, setPassportNumber] = React.useState("");
  const [passportCountry, setPassportCountry] = React.useState("");
  // Срок действия — общий для обоих типов документа (v2.2: documentExpiry).
  const [documentExpiry, setDocumentExpiry] = React.useState<Dayjs | null>(null);
  const [gender, setGender] = React.useState("");
  const [placeOfBirth, setPlaceOfBirth] = React.useState("");
  const [issueDate, setIssueDate] = React.useState<Dayjs | null>(null);
  const [issuingAuthority, setIssuingAuthority] = React.useState("");
  const [registrationAddress, setRegistrationAddress] = React.useState("");
  // Тип документа по умолчанию выводится из guestType; распознавание может
  // показать иное (резидент с паспортом-книжкой) — тогда берём прочитанное,
  // пока тип гостя не переключат руками.
  const [scannedDocumentType, setScannedDocumentType] = React.useState<string | null>(null);
  const [entryDate, setEntryDate] = React.useState<Dayjs | null>(null);
  const [migrationCardNumber, setMigrationCardNumber] = React.useState("");
  const [visitPurpose, setVisitPurpose] = React.useState("");
  const [passportPhotoFile, setPassportPhotoFile] = React.useState<File | null>(null);
  const [passportPhotoPreview, setPassportPhotoPreview] = React.useState<string | null>(null);
  // Оборотная сторона ID-карты (только guestType === "resident") — грузится отдельным
  // PUT-ом после создания брони/гостя (uploadStayDocumentPhotoBack, contract v2.3), тем
  // же best-effort принципом, что и лицевая. Не распознаётся.
  const [backPhotoFile, setBackPhotoFile] = React.useState<File | null>(null);
  const [backPhotoPreview, setBackPhotoPreview] = React.useState<string | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const {
    available: scanAvailable,
    scanning,
    scanProgress,
    notice: scanNotice,
    clearNotice: clearScanNotice,
    scan: runDocumentScan,
  } = useDocumentScan();
  // Растёт при каждом сбросе формы — по нему отбрасываем результат
  // распознавания, который вернулся уже в сброшенную форму.
  const scanGenerationRef = React.useRef(0);

  // Дополнительно
  const [bookingSource, setBookingSource] = React.useState("");
  const [specialRequests, setSpecialRequests] = React.useState("");
  const [companyInfo, setCompanyInfo] = React.useState("");
  // Юрлицо из справочника: скидка идёт на проживание, бэк сам пересчитает сумму.
  const [corporateId, setCorporateId] = React.useState<number | "">("");
  const [dataConsent, setDataConsent] = React.useState(false);
  // Групповая бронь: дополнительные номера на те же даты и с тем же питанием,
  // заказчик один. Бэк принимает несколько items в одной брони.
  const [extraRooms, setExtraRooms] = React.useState<ExtraRoom[]>([]);
  // Допуслуги к брони: id услуги → количество. Сразу после создания уходят в счёт.
  const [serviceQty, setServiceQty] = React.useState<Record<number, number>>({});
  const canCharge = useCan("hotel.payments.manage");

  const reset = React.useCallback(() => {
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setSelectedClientId(null);
    setRoomId("");
    setCheckIn(dayjs());
    setCheckOut(dayjs().add(1, "day"));
    setAdults("1");
    setChildren("0");
    setGuaranteeMethod("");
    setPrepaymentAmount("");
    setPrepaymentMethod("");
    setShowErrors(false);
    setBoardType("");
    setRatePlanId("");
    setGuestType("resident");
    setDocumentFieldsVisible(false);
    setIdNumber("");
    setInn("");
    setCitizenship("");
    setPassportNumber("");
    setPassportCountry("");
    setDocumentExpiry(null);
    setGender("");
    setPlaceOfBirth("");
    setIssueDate(null);
    setIssuingAuthority("");
    setRegistrationAddress("");
    setScannedDocumentType(null);
    setEntryDate(null);
    setMigrationCardNumber("");
    setVisitPurpose("");
    setPassportPhotoFile(null);
    setPassportPhotoPreview(null);
    setBackPhotoFile(null);
    setBackPhotoPreview(null);
    setPhotoError(null);
    scanGenerationRef.current += 1;
    clearScanNotice();
    setBookingSource("");
    setSpecialRequests("");
    setCompanyInfo("");
    setDataConsent(false);
    setExtraRooms([]);
    setServiceQty({});
    setCorporateId("");
    setSubmitError(null);
  }, [clearScanNotice]);

  // Данные формы нужны только когда она открыта. Раньше три запроса ниже
  // уходили сразу при загрузке страницы (форма закрыта) и конкурировали с
  // календарём шахматки. Теперь — при открытии формы либо через несколько
  // секунд простоя, чтобы форма потом открылась сразу, с готовыми списками.
  const [warm, setWarm] = React.useState(false);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setWarm(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  const formDataEnabled = property != null && (open || warm);

  // Справочники объекта (питание/гарантия/источник/тип гостя/цель визита) —
  // из бэкенда, не из констант мока (hotel-viva-frontend-api.md §3.2).
  const catalogsQuery = useQuery({
    queryKey: ["hotel", "catalogs", property?.id],
    queryFn: ({ signal }) => getHotelCatalogs(property!.id, signal),
    enabled: formDataEnabled,
    staleTime: 5 * 60_000,
  });
  const catalogs = catalogsQuery.data;

  // Номера объекта — для выпадающего списка формы.
  const roomsQuery = useQuery({
    queryKey: ["hotel", "rooms", property?.id],
    queryFn: ({ signal }) => listRooms({ propertyId: property!.id }, signal),
    enabled: formDataEnabled,
  });
  const rooms = React.useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);

  // Категории — ради вместимости выбранного номера (тот же ключ кэша, что у
  // «Номеров» и «Категорий», обычно уже загружено).
  const roomTypesQuery = useQuery({
    queryKey: ["hotel", "roomTypes", property?.id],
    queryFn: ({ signal }) => listRoomTypes(property!.id, {}, signal),
    enabled: formDataEnabled,
  });
  const roomTypes = React.useMemo(() => roomTypesQuery.data ?? [], [roomTypesQuery.data]);

  const corporateQuery = useQuery({
    queryKey: ["hotel", "corporateAccounts", property?.id, "active"],
    queryFn: ({ signal }) => listCorporateAccounts(property!.id, { limit: 200 }, signal),
    enabled: formDataEnabled,
    staleTime: 5 * 60_000,
  });
  const corporateAccounts = React.useMemo(() => corporateQuery.data?.results ?? [], [corporateQuery.data]);
  const corporate = corporateAccounts.find((a) => a.id === corporateId);

  const servicesQuery = useQuery({
    queryKey: ["hotel", "extraServices", property?.id, "active"],
    queryFn: ({ signal }) => listExtraServices(property!.id, { limit: 200 }, signal),
    enabled: formDataEnabled && canCharge,
    staleTime: 5 * 60_000,
  });
  const extraServices = React.useMemo(() => servicesQuery.data?.results ?? [], [servicesQuery.data]);

  // Тарифные планы объекта — выбор показываем, только если кроме основного есть ещё.
  const ratePlansQuery = useQuery({
    queryKey: ["hotel", "ratePlans", property?.id, "active"],
    queryFn: ({ signal }) => listRatePlans(property!.id, signal),
    enabled: formDataEnabled,
    staleTime: 5 * 60_000,
  });
  const ratePlans = React.useMemo(() => ratePlansQuery.data ?? [], [ratePlansQuery.data]);

  // Живой предпросмотр суммы — необязательный, контракт эндпоинта не
  // подтверждён бэком (см. getQuote в src/api/hotel.ts). 404/ошибка формы
  // ответа гасится молча (retry: false, throwOnError: false) — предпросмотра
  // просто нет, бронь создаётся как обычно.
  const checkInStr = checkIn?.format("YYYY-MM-DD");
  const checkOutStr = checkOut?.format("YYYY-MM-DD");
  const quoteQuery = useQuery({
    queryKey: ["hotel", "quote", property?.id, roomId, checkInStr, checkOutStr, boardType, ratePlanId],
    queryFn: ({ signal }) =>
      getQuote(
        {
          propertyId: property!.id,
          roomId: roomId === "" ? undefined : roomId,
          checkIn: checkInStr!,
          checkOut: checkOutStr!,
          boardType: boardType || undefined,
          ratePlanId: ratePlanId === "" ? undefined : ratePlanId,
        },
        signal,
      ),
    enabled: open && property != null && roomId !== "" && !!checkInStr && !!checkOutStr && checkOutStr > checkInStr,
    retry: false,
    throwOnError: false,
    staleTime: 30_000,
  });
  const quote = quoteQuery.isError ? null : quoteQuery.data;

  // Поиск гостя по имени/телефону — ≥2 символа, бэкенд ищет по всем клиентам
  // организации (не только бывшим гостям).
  const guestSearchQuery = useQuery({
    queryKey: ["hotel", "guests", "search", guestName],
    queryFn: ({ signal }) => searchGuests(guestName.trim(), signal),
    enabled: open && guestName.trim().length >= 2,
  });
  const guestOptions = guestSearchQuery.data ?? [];

  // Полная карточка выбранного гостя — подставляет документ/реквизиты (в
  // результатах поиска их нет, только имя/телефон/ЧС/число заездов).
  const guestDetailQuery = useQuery({
    queryKey: ["hotel", "guest", selectedClientId],
    queryFn: ({ signal }) => getGuest(selectedClientId!, signal),
    enabled: selectedClientId != null,
  });
  React.useEffect(() => {
    const g = guestDetailQuery.data;
    if (!g) return;
    applyGuestPrefill(g);
  }, [guestDetailQuery.data]);

  const applyGuestPrefill = (guest: HotelGuest) => {
    setGuestPhone(guest.phone);
    setGuestEmail(guest.email || "");
    if (guest.guestType === "resident" || guest.guestType === "foreign") setGuestType(guest.guestType);
    setIdNumber(guest.guestType === "resident" ? guest.documentNumber ?? "" : "");
    setInn(guest.inn ?? "");
    setCitizenship(guest.citizenship ?? "");
    setPassportNumber(guest.guestType === "foreign" ? guest.documentNumber ?? "" : "");
    setPassportCountry(guest.passportCountry ?? "");
    setDocumentExpiry(guest.documentExpiry ? dayjs(guest.documentExpiry) : null);
    setGender(guest.gender ?? "");
    setPlaceOfBirth(guest.placeOfBirth ?? "");
    setIssueDate(guest.issueDate ? dayjs(guest.issueDate) : null);
    setIssuingAuthority(guest.issuingAuthority ?? "");
    setRegistrationAddress(guest.registrationAddress ?? "");
    setScannedDocumentType(null);
  };

  // Дубли по телефону — предупреждение, не блокировка: тот же принцип, что
  // getSimilarPatients в реальном МамаДоктор. Не считаем дублем уже
  // выбранного гостя (selectedClientId).
  const phoneDigits = guestPhone.replace(/\D/g, "");
  const dupQuery = useQuery({
    queryKey: ["hotel", "guests", "search", "dup", phoneDigits],
    queryFn: ({ signal }) => searchGuests(phoneDigits, signal),
    enabled: open && phoneDigits.length >= 6 && selectedClientId == null,
  });
  const duplicateMatches = (dupQuery.data ?? []).filter(
    (g) => g.phone.replace(/\D/g, "").includes(phoneDigits) && g.fullName !== guestName.trim(),
  );

  // «Быстрая бронь»: клик по свободной ячейке RoomBookingGrid кладёт сюда
  // номер (строкой) + дату — находим номер по строке в уже загруженном
  // списке комнат объекта. Кнопка «Добавить» на «Гостях» зовёт без
  // аргументов — форма просто открывается пустой.
  const quickBookingRequest = React.useSyncExternalStore(subscribeQuickBookingRequest, getQuickBookingRequestSnapshot);
  // Номер из шахматки приходит строкой («301»), а список номеров формы грузится
  // при её открытии — запоминаем и подставляем, как только список пришёл.
  const [pendingRoomNumber, setPendingRoomNumber] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (pendingRoomNumber == null || rooms.length === 0) return;
    const found = rooms.find((r) => r.number === pendingRoomNumber);
    if (found) setRoomId(found.id);
    setPendingRoomNumber(null);
  }, [pendingRoomNumber, rooms]);
  React.useEffect(() => {
    if (!quickBookingRequest) return;
    reset();
    setPendingRoomNumber(quickBookingRequest.room ?? null);
    if (quickBookingRequest.checkIn) {
      setCheckIn(dayjs(quickBookingRequest.checkIn));
      // Период протянут в шахматке зажатием мыши — выезд оттуда; простой клик — одна ночь.
      setCheckOut(
        quickBookingRequest.checkOut
          ? dayjs(quickBookingRequest.checkOut)
          : dayjs(quickBookingRequest.checkIn).add(1, "day"),
      );
    }
    setOpen(true);
    clearQuickBookingRequest();
  }, [quickBookingRequest, reset]);

  // Вместимость — из категории номера (adultsCapacity/childrenCapacity/capacity).
  // Раньше поля «Взрослые/Дети» знали только min и форма спокойно отправляла
  // 100 человек в двухместный номер. Дети могут занимать и взрослые места,
  // поэтому два правила: взрослых ≤ adultsCapacity и всего ≤ capacity.
  const selectedRoomType = React.useMemo(() => {
    const room = rooms.find((r) => r.id === roomId);
    return room ? roomTypes.find((rt) => rt.id === room.roomTypeId) : undefined;
  }, [rooms, roomTypes, roomId]);
  const adultsNum = Number(adults);
  const childrenNum = Number(children);
  const guestCountError = (() => {
    if (!Number.isInteger(adultsNum) || adultsNum < 1) return { field: "adults" as const, text: "Минимум 1 взрослый" };
    if (!Number.isInteger(childrenNum) || childrenNum < 0) return { field: "children" as const, text: "Не меньше 0" };
    if (!selectedRoomType) return null;
    const { adultsCapacity, capacity } = selectedRoomType;
    if (adultsNum > adultsCapacity) {
      return { field: "adults" as const, text: `В номере максимум ${adultsCapacity} взр.` };
    }
    if (adultsNum + childrenNum > capacity) {
      return { field: "children" as const, text: `Всего не больше ${capacity} ${capacity === 1 ? "гостя" : "гостей"}` };
    }
    return null;
  })();

  // Границы счётчиков: взрослых — сколько взрослых мест, детей — сколько
  // осталось до общей вместимости. Без выбранного номера — без верхней границы.
  const maxAdults = selectedRoomType?.adultsCapacity;
  const maxChildren = selectedRoomType ? Math.max(0, selectedRoomType.capacity - (adultsNum || 1)) : undefined;
  // Сменили номер на меньший — гостей прижимаем к его вместимости, а не
  // оставляем форму в невалидном состоянии.
  React.useEffect(() => {
    if (!selectedRoomType) return;
    const a = Math.min(Math.max(1, Number(adults) || 1), selectedRoomType.adultsCapacity);
    const c = Math.min(Math.max(0, Number(children) || 0), Math.max(0, selectedRoomType.capacity - a));
    if (String(a) !== adults) setAdults(String(a));
    if (String(c) !== children) setChildren(String(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomType]);

  const nights = checkIn && checkOut && checkOut.isAfter(checkIn) ? checkOut.startOf("day").diff(checkIn.startOf("day"), "day") : 0;
  const typeOfRoom = (id: number | "") => {
    const room = rooms.find((r) => r.id === id);
    return room ? roomTypes.find((rt) => rt.id === room.roomTypeId) : undefined;
  };
  // Проверка каждого доп. номера: выбран, не повторяется, гости помещаются.
  const extraErrors = extraRooms.map((x, idx) => {
    if (x.roomId === "") return "Выберите номер";
    if (x.roomId === roomId || extraRooms.some((y, j) => j < idx && y.roomId === x.roomId)) return "Этот номер уже в брони";
    const rt = typeOfRoom(x.roomId);
    if (rt && x.adults > rt.adultsCapacity) return `В номере максимум ${rt.adultsCapacity} взр.`;
    if (rt && x.adults + x.children > rt.capacity) return `Всего не больше ${rt.capacity} гостей`;
    return null;
  });
  const extrasInvalid = extraErrors.some((e) => e != null);
  const extrasByCategory = extraRooms.reduce((sum, x) => {
    const rt = typeOfRoom(x.roomId);
    return sum + (rt ? Number(rt.totalPrice) * nights : 0);
  }, 0);
  const mainTotal = quote ? Number(quote.total) : selectedRoomType && nights > 0 ? Number(selectedRoomType.totalPrice) * nights : null;
  // Скидка юрлица — на проживание; точную сумму после неё посчитает бэк.
  const corporateDiscount = corporate ? Number(corporate.discountPercent) : 0;
  const stayTotal = mainTotal != null ? mainTotal + extrasByCategory : null;
  const estimatedTotal = stayTotal != null ? Math.round(stayTotal * (1 - corporateDiscount / 100) * 100) / 100 : null;
  const servicesTotal = extraServices.reduce((s, x) => s + Number(x.price) * (serviceQty[x.id] ?? 0), 0);
  const grandTotal = estimatedTotal != null ? estimatedTotal + servicesTotal : null;
  const isPrepayment = guaranteeMethod === "prepayment";
  const prepaymentMethods = catalogs?.paymentMethods ?? [];
  const effectivePrepaymentMethod = prepaymentMethod || prepaymentMethods[0]?.value || "";
  const prepaymentValue = Number(prepaymentAmount.replace(",", "."));
  const prepaymentRules: FieldRules = {
    kind: "decimal",
    required: true,
    min: 1,
    validate: (v) =>
      grandTotal != null && Number(v) > grandTotal
        ? `Больше стоимости брони (${grandTotal.toLocaleString("ru-RU")} сом)`
        : null,
  };
  const prepaymentError = isPrepayment ? fieldError(prepaymentAmount, prepaymentRules) : null;
  // Поля гостя и документа — та же проверка, что показывают сами поля.
  const bookingFieldsInvalid = hasFieldErrors([
    [guestPhone, PHONE_REQUIRED],
    [guestType === "resident" ? idNumber : passportNumber, guestType === "resident" ? ID_REQUIRED : PASSPORT_REQUIRED],
    [guestEmail, GUEST_RULES.email],
    [placeOfBirth, GUEST_RULES.short],
    [issuingAuthority, GUEST_RULES.short],
    [guestType === "resident" ? idNumber : "", GUEST_RULES.idNumber],
    [guestType === "resident" ? inn : "", GUEST_RULES.inn],
    [guestType === "resident" ? registrationAddress : "", GUEST_RULES.long],
    [guestType === "foreign" ? citizenship : "", GUEST_RULES.short],
    [guestType === "foreign" ? passportNumber : "", GUEST_RULES.docNumber],
    [guestType === "foreign" ? passportCountry : "", GUEST_RULES.short],
    [guestType === "foreign" ? migrationCardNumber : "", GUEST_RULES.docNumber],
    [companyInfo, GUEST_RULES.long],
    [specialRequests, GUEST_RULES.comment],
  ]);
  const footerSummary =
    nights > 0 ? (
      <Box>
        <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
          {grandTotal != null ? `${grandTotal.toLocaleString("ru-RU")} сом` : "—"}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {nights} {nights % 10 === 1 && nights % 100 !== 11 ? "ночь" : [2, 3, 4].includes(nights % 10) && ![12, 13, 14].includes(nights % 100) ? "ночи" : "ночей"}
          {corporateDiscount > 0 ? ` · юрлицо −${corporateDiscount}%` : ""}
          {servicesTotal > 0 ? ` · услуги ${servicesTotal.toLocaleString("ru-RU")}` : ""}
          {extraRooms.length > 0 ? ` · ${extraRooms.length + 1} ${extraRooms.length + 1 < 5 ? "номера" : "номеров"}` : ""}
          {estimatedTotal != null && (!quote || extraRooms.length > 0) ? " · по тарифу категории" : ""}
          {isPrepayment && prepaymentError == null && grandTotal != null
            ? ` · предоплата ${prepaymentValue.toLocaleString("ru-RU")}, остаток ${Math.max(0, grandTotal - prepaymentValue).toLocaleString("ru-RU")}`
            : ""}
        </Typography>
      </Box>
    ) : null;

  const canSubmit =
    guestName.trim() !== "" &&
    roomId !== "" &&
    !!checkIn &&
    !!checkOut &&
    checkOut.isAfter(checkIn) &&
    property != null &&
    guestCountError == null &&
    !extrasInvalid &&
    (!isPrepayment || effectivePrepaymentMethod !== "");

  /**
   * Подставляет то, что прочитано с документа. Любое поле скана может быть
   * null — такое не трогаем (контракт §4.4), форму не сбрасываем. ФИО
   * заполняется из паспорта, если ещё не набрано: так отель и работает —
   * имя берут из документа, а не со слов гостя.
   */
  const applyScan = (scan: HotelGuestDocumentScan) => {
    const scannedType = scan.guestType === "resident" || scan.guestType === "foreign" ? scan.guestType : null;
    if (scannedType) setGuestType(scannedType);
    setScannedDocumentType(scan.documentType);
    if (scan.fullName) {
      const scannedName = capitalizeFullName(scan.fullName);
      setGuestName((prev) => (prev.trim() ? prev : scannedName));
    }
    if (scan.gender === "male" || scan.gender === "female") setGender(scan.gender);
    if (scan.placeOfBirth) setPlaceOfBirth(scan.placeOfBirth);
    if (scan.issueDate) setIssueDate(dayjs(scan.issueDate));
    if (scan.issuingAuthority) setIssuingAuthority(scan.issuingAuthority);
    if (scan.documentExpiry) setDocumentExpiry(dayjs(scan.documentExpiry));
    if (scan.documentNumber) {
      // Номер живёт в разных полях у резидента и иностранца.
      if ((scannedType ?? guestType) === "foreign") setPassportNumber(scan.documentNumber);
      else setIdNumber(scan.documentNumber);
    }
    if (scan.inn) setInn(scan.inn);
    if (scan.registrationAddress) setRegistrationAddress(scan.registrationAddress);
    if (scan.citizenship) setCitizenship(scan.citizenship);
    if (scan.passportCountry) setPassportCountry(scan.passportCountry);
    setDocumentFieldsVisible(true);
  };

  /** Прикрепляет фото документа и, если распознавание доступно, подставляет реквизиты в поля. */
  const handlePhotoChange = async (file: File) => {
    if (!isDocumentFile(file)) {
      setPhotoError("Нужен файл изображения или PDF");
      return;
    }
    setPhotoError(null);
    const generation = scanGenerationRef.current;
    // HEIC с телефона бэкенд не читает — приводим к jpg и заодно ужимаем тяжёлые снимки.
    const prepared = await prepareDocumentFile(file);
    if (generation !== scanGenerationRef.current) return;
    if (!prepared) {
      setPhotoError("Не удалось прочитать изображение");
      return;
    }
    if (prepared.size > MAX_PHOTO_BYTES) {
      setPhotoError("Файл больше 10 МБ");
      return;
    }
    if (passportPhotoPreview) URL.revokeObjectURL(passportPhotoPreview);
    setPassportPhotoFile(prepared);
    setPassportPhotoPreview(prepared.type.startsWith("image/") ? URL.createObjectURL(prepared) : null);

    if (!scanAvailable) {
      // Распознавания нет — фото просто прикреплено, поля открываем сразу для ручного ввода.
      setDocumentFieldsVisible(true);
      return;
    }
    const scan = await runDocumentScan(prepared);
    // Форму закрыли (и сбросили) пока шло распознавание — чужие поля в новую не подставляем.
    if (generation !== scanGenerationRef.current) return;
    if (scan) applyScan(scan);
    // Не распознало (404/503 и т.п.) — notice уже объясняет «заполните вручную», открываем поля.
    else setDocumentFieldsVisible(true);
  };

  const removePhoto = () => {
    if (passportPhotoPreview) URL.revokeObjectURL(passportPhotoPreview);
    setPassportPhotoFile(null);
    setPassportPhotoPreview(null);
    clearScanNotice();
    // Крестик мог убрать фото прямо во время распознавания — отбрасываем его результат,
    // когда он всё же придёт (та же защита, что и при сбросе формы).
    scanGenerationRef.current += 1;
  };

  /** Оборотная сторона ID-карты — просто прикрепляется, без распознавания (см. комментарий у backPhotoFile). */
  const handleBackPhotoChange = async (file: File) => {
    if (!isDocumentFile(file)) {
      setPhotoError("Нужен файл изображения или PDF");
      return;
    }
    const generation = scanGenerationRef.current;
    const prepared = await prepareDocumentFile(file);
    if (generation !== scanGenerationRef.current) return;
    if (!prepared) {
      setPhotoError("Не удалось прочитать изображение");
      return;
    }
    if (prepared.size > MAX_PHOTO_BYTES) {
      setPhotoError("Файл больше 10 МБ");
      return;
    }
    setPhotoError(null);
    if (backPhotoPreview) URL.revokeObjectURL(backPhotoPreview);
    setBackPhotoFile(prepared);
    setBackPhotoPreview(prepared.type.startsWith("image/") ? URL.createObjectURL(prepared) : null);
  };

  const removeBackPhoto = () => {
    if (backPhotoPreview) URL.revokeObjectURL(backPhotoPreview);
    setBackPhotoFile(null);
    setBackPhotoPreview(null);
  };

  /**
   * allowOverbooking=true — подтверждение из диалога конфликта ниже.
   * Пересечение дат бэкенд обнаруживает сам (409 NO_AVAILABILITY), фронт
   * ничего заранее не проверяет — тот же warn-принцип, что ShiftOverlapDialog
   * у пересечения смен в реальном расписании.
   */
  const handleSubmit = async (allowOverbooking = false) => {
    if (!checkIn || !checkOut || roomId === "" || !property || guestCountError) return;
    if (prepaymentError || bookingFieldsInvalid || extrasInvalid) {
      setShowErrors(true);
      setDocumentFieldsVisible(true);
      setSubmitError("Проверьте поля, отмеченные красным");
      focusFirstFieldError();
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const documentType = scannedDocumentType ?? (guestType === "resident" ? "id_card" : "passport");
      const documentNumber = guestType === "resident" ? orUndefined(idNumber) : orUndefined(passportNumber);
      const reservation = await createReservation({
        propertyId: property.id,
        source: bookingSource || "direct",
        guaranteeMethod: guaranteeMethod || undefined,
        ...(selectedClientId != null
          ? { customerId: selectedClientId }
          : { customer: { fullName: guestName.trim(), phone: orUndefined(guestPhone) ?? "", email: orUndefined(guestEmail) ?? "", source: bookingSource || "" } }),
        guestComment: orUndefined(specialRequests) ?? "",
        companyInfo: orUndefined(companyInfo) ?? "",
        corporateAccountId: corporateId === "" ? undefined : corporateId,
        dataConsent,
        allowOverbooking,
        items: [
          {
            roomId,
            ratePlanId: ratePlanId === "" ? undefined : ratePlanId,
            checkIn: checkIn.format("YYYY-MM-DD"),
            checkOut: checkOut.format("YYYY-MM-DD"),
            adults: Number(adults) || 1,
            children: Number(children) || 0,
            boardType: boardType || "none",
            guests: [
              {
                fullName: guestName.trim(),
                phone: orUndefined(guestPhone),
                email: orUndefined(guestEmail),
                clientId: selectedClientId ?? undefined,
                isPrimary: true,
                document: {
                  guestType,
                  citizenship: guestType === "foreign" ? orUndefined(citizenship) : undefined,
                  documentType,
                  documentNumber,
                  inn: guestType === "resident" ? orUndefined(inn) : undefined,
                  passportCountry: guestType === "foreign" ? orUndefined(passportCountry) : undefined,
                  documentExpiry: documentExpiry?.format("YYYY-MM-DD") ?? null,
                  gender: gender || undefined,
                  placeOfBirth: orUndefined(placeOfBirth),
                  issueDate: issueDate?.format("YYYY-MM-DD") ?? null,
                  issuingAuthority: orUndefined(issuingAuthority),
                  registrationAddress: guestType === "resident" ? orUndefined(registrationAddress) : undefined,
                  entryDate: guestType === "foreign" ? entryDate?.format("YYYY-MM-DD") ?? null : null,
                  migrationCardNumber: guestType === "foreign" ? orUndefined(migrationCardNumber) : undefined,
                  visitPurpose: guestType === "foreign" ? visitPurpose || undefined : undefined,
                },
              },
            ],
          },
          ...extraRooms.map((x) => ({
            roomId: x.roomId as number,
            ratePlanId: ratePlanId === "" ? undefined : ratePlanId,
            checkIn: checkIn.format("YYYY-MM-DD"),
            checkOut: checkOut.format("YYYY-MM-DD"),
            adults: x.adults,
            children: x.children,
            boardType: boardType || "none",
            guests: [],
          })),
        ],
      });

      const createdGuestId = reservation.items[0]?.guests[0]?.id;
      if (passportPhotoFile && createdGuestId != null) {
        try {
          await uploadStayDocumentPhoto(reservation.id, createdGuestId, passportPhotoFile);
        } catch {
          // Бронь уже создана — молча пропускаем сбой загрузки фото, не откатываем бронь.
        }
      }
      // Оборотная сторона — только у ID-карты резидента (contract v2.3); для загранпаспорта
      // backPhotoFile всегда null, так как поле скрыто и очищается при смене guestType.
      if (backPhotoFile && createdGuestId != null) {
        try {
          await uploadStayDocumentPhotoBack(reservation.id, createdGuestId, backPhotoFile);
        } catch {
          // no-op
        }
      }

      // Допуслуги — сразу в счёт брони; сбой одной не откатывает бронь, а честно
      // говорит, сколько не записалось.
      let chargesFailed = 0;
      for (const service of extraServices) {
        const qty = serviceQty[service.id] ?? 0;
        if (qty <= 0) continue;
        try {
          await addCharge(reservation.id, { serviceId: service.id, quantity: String(qty), date: checkIn.format("YYYY-MM-DD") });
        } catch {
          chargesFailed += 1;
        }
      }

      // Предоплата — отдельным платежом: бронь уже создана, поэтому сбой здесь
      // бронь не откатывает, а честно говорит, что сумму надо внести в карточке.
      let prepaymentFailed: string | null = null;
      if (isPrepayment && prepaymentValue > 0) {
        try {
          await addPayment(reservation.id, {
            method: effectivePrepaymentMethod,
            amount: String(prepaymentValue),
            note: "Предоплата при бронировании",
          });
        } catch (payErr) {
          prepaymentFailed = getErrorMessage(payErr, "ошибка сервера");
        }
      }

      void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
      // Новая бронь на сегодня/завтра двигает «Загрузку» и «Заезды» в карточках над шахматкой.
      void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
      setOpen(false);
      setToast(
        prepaymentFailed
          ? { text: `Бронь №${reservation.number} создана, но предоплату записать не удалось (${prepaymentFailed}). Внесите её в карточке брони.`, severity: "warning" }
          : chargesFailed > 0
          ? { text: `Бронь №${reservation.number} создана, но ${chargesFailed} из допуслуг не записались. Добавьте их на вкладке «Проживание и услуги».`, severity: "warning" }
          : { text: `Бронь №${reservation.number} для «${guestName.trim()}» добавлена в шахматку`, severity: "success" },
      );
      reset();
    } catch (err) {
      const conflicts = getReservationConflicts(err);
      if (conflicts && isOverbookingConfirmable(err)) {
        setOverlapConflict(conflicts);
        return;
      }
      // NO_AVAILABILITY без overbookable — повтор с allowOverbooking даст тот же 409.
      if (getErrorCode(err) === "NO_AVAILABILITY") {
        setUnavailableMessage(getErrorMessage(err, "Номер недоступен на эти даты"));
        return;
      }
      setSubmitError(getErrorMessage(err, "Не удалось создать бронь"));
    } finally {
      setSubmitting(false);
    }
  };

  // Грязная форма = заполнено хоть что-то значимое — тот же принцип, что
  // isDirty в реальной форме приёма (даты не считаем, они проставляются
  // автоматически при открытии).
  const isDirty =
    guestName.trim() !== "" ||
    guestPhone.trim() !== "" ||
    guestEmail.trim() !== "" ||
    roomId !== "" ||
    idNumber.trim() !== "" ||
    passportNumber.trim() !== "" ||
    specialRequests.trim() !== "" ||
    companyInfo.trim() !== "" ||
    corporateId !== "" ||
    Object.values(serviceQty).some((q) => q > 0) ||
    extraRooms.length > 0 ||
    passportPhotoFile !== null;

  // Перехватывает все способы закрытия: крестик, «Отмена», клик по фону / Esc —
  // тот же приём, что requestClose в реальной форме приёма.
  const requestClose = () => {
    if (isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    setOpen(false);
  };

  const confirmDiscardAndClose = () => {
    setConfirmCloseOpen(false);
    setOpen(false);
    reset();
  };

  const selectedRoom: HotelRoom | undefined = rooms.find((r) => r.id === roomId);

  return (
    <>
      {!hideTrigger && (
        <DisabledReason reason={property ? null : "Сначала выберите филиал с объектом размещения"}>
          <Button size="small" variant="contained" startIcon={<AddOutlined />} disabled={!property} onClick={() => setOpen(true)}>
            Создать бронь
          </Button>
        </DisabledReason>
      )}

      <Drawer
        anchor="right"
        open={open}
        onClose={requestClose}
        PaperProps={{
          sx: { width: DRAWER_WIDTH, maxWidth: "100vw", display: "flex", flexDirection: "column", backgroundImage: "none" },
        }}
      >
        <DrawerHeader title="Новая бронь" subtitle="Обязательны номер, даты, гость, телефон и паспорт" onClose={requestClose} />

        <DrawerBody>
            {submitError && <Alert severity="error">{submitError}</Alert>}

            <DrawerSection label="Проживание" first>
            <TextField
              select
              label="Номер"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value === "" ? "" : Number(e.target.value))}
              slotProps={{ input: { startAdornment: <FieldIcon icon={<HotelOutlined />} /> } }}
              fullWidth
              SelectProps={{
                renderValue: (value) => {
                  const r = rooms.find((x) => x.id === value);
                  return r ? `${r.number} — ${r.roomTypeName}` : "";
                },
              }}
            >
              {rooms.map((r) => {
                const rt = roomTypes.find((t) => t.id === r.roomTypeId);
                // Номер, куда текущее число гостей не помещается, не прячем (вдруг
                // гостей ещё поправят), а подписываем — видно сразу при выборе.
                const tooSmall = rt != null && (adultsNum > rt.adultsCapacity || adultsNum + childrenNum > rt.capacity);
                return (
                  <MenuItem key={r.id} value={r.id} sx={tooSmall ? { color: "text.disabled" } : undefined}>
                    <Box sx={{ flex: 1 }}>
                      {r.number} — {r.roomTypeName}
                    </Box>
                    {rt && (
                      <Typography variant="caption" color={tooSmall ? "error.main" : "text.secondary"} sx={{ ml: 2 }}>
                        {tooSmall ? "не вместит · " : ""}до {rt.capacity} {rt.capacity === 1 ? "гостя" : "гостей"}
                      </Typography>
                    )}
                  </MenuItem>
                );
              })}
            </TextField>
            <Stack direction="row" gap={2}>
              <CustomDatePicker label="Заезд" value={checkIn} onChange={setCheckIn} sx={{ flex: 1 }} />
              <CustomDatePicker
                label="Выезд"
                value={checkOut}
                onChange={setCheckOut}
                minDate={checkIn ?? undefined}
                sx={{ flex: 1 }}
              />
            </Stack>
            {/* Число гостей — счётчиками с границами из категории номера: больше, чем
                вмещает номер, ввести нельзя ни кнопками, ни с клавиатуры. */}
            <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
              <CountStepper
                label="Взрослые"
                hint={selectedRoomType ? `до ${selectedRoomType.adultsCapacity} в номере` : "выберите номер"}
                value={adultsNum || 1}
                min={1}
                max={maxAdults}
                onChange={(n) => setAdults(String(n))}
              />
              <CountStepper
                label="Дети"
                hint={selectedRoomType ? `всего до ${selectedRoomType.capacity}` : undefined}
                value={childrenNum || 0}
                min={0}
                max={maxChildren}
                onChange={(n) => setChildren(String(n))}
              />
            </Stack>
            {extraRooms.map((x, idx) => {
              const rt = typeOfRoom(x.roomId);
              const error = showErrors || x.roomId !== "" ? extraErrors[idx] : null;
              return (
                <Box key={x.key} sx={{ p: 1.5, borderRadius: "12px", border: 1, borderColor: error ? "error.main" : "divider" }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                    <Typography variant="body2" fontWeight={700}>
                      Номер {idx + 2}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label={`Убрать номер ${idx + 2} из брони`}
                      onClick={() => setExtraRooms((cur) => cur.filter((y) => y.key !== x.key))}
                    >
                      <CloseOutlined fontSize="small" />
                    </IconButton>
                  </Stack>
                  <Stack gap={1.5}>
                    <TextField
                      select
                      label="Номер"
                      value={x.roomId}
                      onChange={(e) => {
                        const next = e.target.value === "" ? "" : Number(e.target.value);
                        const nextType = typeOfRoom(next);
                        setExtraRooms((cur) =>
                          cur.map((y) => {
                            if (y.key !== x.key) return y;
                            const a = nextType ? Math.min(y.adults, nextType.adultsCapacity) : y.adults;
                            const c = nextType ? Math.min(y.children, Math.max(0, nextType.capacity - a)) : y.children;
                            return { ...y, roomId: next, adults: a, children: c };
                          }),
                        );
                      }}
                      error={error != null}
                      helperText={error ?? " "}
                      slotProps={{ input: { startAdornment: <FieldIcon icon={<HotelOutlined />} /> } }}
                      fullWidth
                    >
                      {rooms.map((r) => {
                        const taken = r.id === roomId || extraRooms.some((y) => y.key !== x.key && y.roomId === r.id);
                        return (
                          <MenuItem key={r.id} value={r.id} disabled={taken}>
                            <Box sx={{ flex: 1 }}>
                              {r.number} — {r.roomTypeName}
                            </Box>
                            {taken && (
                              <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                                уже в брони
                              </Typography>
                            )}
                          </MenuItem>
                        );
                      })}
                    </TextField>
                    <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
                      <CountStepper
                        label="Взрослые"
                        hint={rt ? `до ${rt.adultsCapacity} в номере` : "выберите номер"}
                        value={x.adults}
                        min={1}
                        max={rt?.adultsCapacity}
                        onChange={(n) =>
                          setExtraRooms((cur) =>
                            cur.map((y) => (y.key === x.key ? { ...y, adults: n, children: rt ? Math.min(y.children, Math.max(0, rt.capacity - n)) : y.children } : y)),
                          )
                        }
                      />
                      <CountStepper
                        label="Дети"
                        hint={rt ? `всего до ${rt.capacity}` : undefined}
                        value={x.children}
                        min={0}
                        max={rt ? Math.max(0, rt.capacity - x.adults) : undefined}
                        onChange={(n) => setExtraRooms((cur) => cur.map((y) => (y.key === x.key ? { ...y, children: n } : y)))}
                      />
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
            <Box>
              <Button
                size="small"
                startIcon={<AddOutlined />}
                onClick={() => setExtraRooms((cur) => [...cur, { key: nextExtraKey(), roomId: "", adults: 1, children: 0 }])}
                disabled={roomId === ""}
              >
                Ещё номер в эту бронь
              </Button>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ ml: 0.5 }}>
                {extraRooms.length > 0
                  ? "Групповая бронь: те же даты и питание, заказчик один. Гостей по номерам можно вписать при заселении."
                  : "Для группы или семьи в нескольких номерах — одна бронь и один счёт."}
              </Typography>
            </Box>
            <Stack direction="row" gap={2}>
              <TextField
                select
                label="Гарантия брони"
                value={guaranteeMethod}
                onChange={(e) => setGuaranteeMethod(e.target.value)}
                slotProps={{ input: { startAdornment: <FieldIcon icon={<ShieldOutlined />} /> } }}
                sx={{ flex: 1 }}
              >
                <MenuItem value="">Не указана</MenuItem>
                {(catalogs?.guaranteeMethods ?? []).map((c) => (
                  <MenuItem key={c.value} value={c.value}>
                    {c.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            {/* Питание — чипами: несколько приёмов пищи (завтрак + ужин и т.д.) читаются сразу.
                Недоступное в номере погашено. */}
            <Box>
              <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 0.75 }}>
                <RestaurantOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Питание
                </Typography>
              </Stack>
              <Stack direction="row" gap={0.75} flexWrap="wrap">
                {[{ value: "none", label: "Без питания" }, ...(catalogs?.boardTypes ?? []).filter((c) => c.value !== "none")].map((c) => {
                  const roomMeals = selectedRoom?.mealOptions ?? [];
                  const unavailable =
                    c.value !== "none" &&
                    roomMeals.length > 0 &&
                    !roomMeals.includes("all_inclusive") &&
                    (BOARD_MEALS[c.value] ?? []).some((m) => !roomMeals.includes(m));
                  const active = (boardType || "none") === c.value;
                  return (
                    <Tooltip key={c.value} title={unavailable ? "В этом номере такого питания нет" : (BOARD_HINTS[c.value] ?? "")}>
                      <span>
                        <Chip
                          label={c.label}
                          color={active ? "primary" : "default"}
                          variant={active ? "filled" : "outlined"}
                          disabled={unavailable}
                          onClick={() => setBoardType(c.value === "none" ? "" : c.value)}
                        />
                      </span>
                    </Tooltip>
                  );
                })}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                {BOARD_HINTS[boardType || "none"] ?? ""}
              </Typography>
            </Box>

            {/* Допуслуги к брони — из справочника, с количеством; уйдут в счёт сразу после создания. */}
            {canCharge && extraServices.length > 0 && (
              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 0.75 }}>
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    <RoomServiceOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      Допуслуги
                    </Typography>
                  </Stack>
                  {servicesTotal > 0 && (
                    <Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {servicesTotal.toLocaleString("ru-RU")} сом
                    </Typography>
                  )}
                </Stack>
                <Stack gap={0.75}>
                  {extraServices.map((service) => {
                    const qty = serviceQty[service.id] ?? 0;
                    const setQty = (n: number) => setServiceQty((cur) => ({ ...cur, [service.id]: Math.max(0, Math.min(99, n)) }));
                    return (
                      <Stack
                        key={service.id}
                        direction="row"
                        alignItems="center"
                        gap={1}
                        sx={{ px: 1.25, py: 0.5, borderRadius: "10px", border: 1, borderColor: qty > 0 ? "primary.main" : "divider" }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {service.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {Number(service.price).toLocaleString("ru-RU")} сом
                            {qty > 1 ? ` × ${qty} = ${(Number(service.price) * qty).toLocaleString("ru-RU")} сом` : ""}
                          </Typography>
                        </Box>
                        <IconButton size="small" onClick={() => setQty(qty - 1)} disabled={qty === 0} aria-label={`Меньше: ${service.name}`}>
                          <RemoveOutlined fontSize="small" />
                        </IconButton>
                        <Typography sx={{ minWidth: 20, textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{qty}</Typography>
                        <IconButton size="small" onClick={() => setQty(qty + 1)} aria-label={`Больше: ${service.name}`}>
                          <AddOutlined fontSize="small" />
                        </IconButton>
                      </Stack>
                    );
                  })}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  Сразу попадут в счёт брони; добавить или отменить можно и потом, в карточке брони.
                </Typography>
              </Box>
            )}
            {(() => {
              // Планы для выбранной категории (пустой roomTypeIds — для всех).
              const typeId = selectedRoomType?.id;
              const options = ratePlans.filter((p) => p.isActive && (p.roomTypeIds.length === 0 || typeId == null || p.roomTypeIds.includes(typeId)));
              if (options.length < 2) return null;
              const chosen = options.find((p) => p.id === ratePlanId);
              return (
                <TextField
                  select
                  label="Тарифный план"
                  value={chosen ? ratePlanId : ""}
                  onChange={(e) => {
                    const next = e.target.value === "" ? "" : Number(e.target.value);
                    setRatePlanId(next);
                    const plan = options.find((p) => p.id === next);
                    // Питание плана — подставляем, если своё не выбрано.
                    if (plan && plan.mealPlan && plan.mealPlan !== "none" && !boardType) setBoardType(plan.mealPlan);
                  }}
                  slotProps={{ input: { startAdornment: <FieldIcon icon={<LocalOfferOutlined />} /> } }}
                  helperText={
                    chosen
                      ? [chosen.minNights > 1 ? `от ${chosen.minNights} ночей` : "", Number(chosen.prepaymentPercent) > 0 ? `предоплата ${Number(chosen.prepaymentPercent)}%` : "", chosen.cancellationPolicy]
                          .filter(Boolean)
                          .join(" · ") || " "
                      : "Основной — по ценам категорий"
                  }
                  fullWidth
                >
                  <MenuItem value="">{options.find((p) => p.isBase)?.name ?? "Основной тариф"}</MenuItem>
                  {options
                    .filter((p) => !p.isBase)
                    .map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name}
                      </MenuItem>
                    ))}
                </TextField>
              );
            })()}
            {isPrepayment && (
              <Stack direction="row" gap={2}>
                <FormField
                  icon={<PaymentsOutlined />}
                  label="Сумма предоплаты"
                  unit="сом"
                  value={prepaymentAmount}
                  onValueChange={setPrepaymentAmount}
                  rules={prepaymentRules}
                  showErrors={showErrors}
                  helperText={
                    estimatedTotal != null
                      ? `Остаток к оплате: ${Math.max(0, estimatedTotal - (prepaymentError ? 0 : prepaymentValue)).toLocaleString("ru-RU")} сом`
                      : " "
                  }
                  sx={{ flex: 1 }}
                />
                <TextField
                  select
                  label="Способ оплаты"
                  value={effectivePrepaymentMethod}
                  onChange={(e) => setPrepaymentMethod(e.target.value)}
                  slotProps={{ input: { startAdornment: <FieldIcon icon={<PaymentsOutlined />} /> } }}
                  sx={{ flex: 1 }}
                  helperText=" "
                >
                  {prepaymentMethods.map((m) => (
                    <MenuItem key={m.value} value={m.value}>
                      {m.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            )}
            </DrawerSection>

            <DrawerSection label="Гость">
              <Autocomplete<HotelGuestSearchResult, false, false, true>
                freeSolo
                options={guestOptions}
                inputValue={guestName}
                loading={guestSearchQuery.isFetching}
                onInputChange={(_, value) => {
                  setGuestName(value);
                  setSelectedClientId(null);
                }}
                onChange={(_, value) => {
                  if (value && typeof value !== "string") {
                    setGuestName(value.fullName);
                    setGuestPhone(value.phone);
                    setSelectedClientId(value.clientId);
                  }
                }}
                getOptionLabel={(option) => (typeof option === "string" ? option : option.fullName)}
                renderOption={(props, option) => (
                  <li {...props} key={option.clientId}>
                    <Stack direction="row" alignItems="center" gap={1.25} sx={{ width: "100%" }}>
                      <Avatar sx={{ width: 28, height: 28, fontSize: "0.75rem", bgcolor: "primary.main" }}>
                        {initialsOf(option.fullName)}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {option.fullName}
                          {option.isBlacklisted && (
                            <Typography component="span" variant="caption" color="error.main">
                              {" "}
                              · чёрный список
                            </Typography>
                          )}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.phone}
                          {!option.matchedBy.includes("name") && option.matchedBy.length > 0 && (
                            <> · совпадение по {formatGuestMatchedBy(option.matchedBy)}</>
                          )}
                        </Typography>
                      </Box>
                    </Stack>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Имя и фамилия"
                    placeholder="Начните вводить — найдём гостя в базе"
                    fullWidth
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <FieldIcon icon={<PersonOutlineOutlined />} />
                          {params.InputProps.startAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />

              <Stack direction="row" gap={2}>
                <FormField
                  icon={<PhoneOutlined />}
                  rules={PHONE_REQUIRED}
                  showErrors={showErrors}
                  label="Телефон"
                  placeholder="+996 700 000 000"
                  value={guestPhone}
                  onValueChange={(v) => setGuestPhone(v)}
                  sx={{ flex: 1 }}
                />
                <FormField
                  icon={<AlternateEmailOutlined />}
                  rules={GUEST_RULES.email}
                  showErrors={showErrors}
                  label="Email"
                  placeholder="guest@mail.com"
                  value={guestEmail}
                  onValueChange={(v) => setGuestEmail(v)}
                  sx={{ flex: 1 }}
                />
              </Stack>

              {duplicateMatches.length > 0 && (
                <Alert severity="warning" variant="outlined" sx={{ mt: 1, py: 0.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    С этим номером телефона уже есть {duplicateMatches.length === 1 ? "гость" : "гости"} в базе
                  </Typography>
                  <Stack gap={0.5} sx={{ mt: 0.5 }}>
                    {duplicateMatches.map((g) => (
                      <Stack key={g.clientId} direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                        <Typography variant="body2">
                          {g.fullName} — {g.phone}
                        </Typography>
                        <Button
                          size="small"
                          onClick={() => {
                            setGuestName(g.fullName);
                            setGuestPhone(g.phone);
                            setSelectedClientId(g.clientId);
                          }}
                        >
                          Использовать
                        </Button>
                      </Stack>
                    ))}
                  </Stack>
                </Alert>
              )}
            </DrawerSection>

            {/* Как в реальной форме секция услуг открывается только с выбранным
                пациентом — документ и допполя появляются только когда есть гость. */}
            {(
              <>
                <DrawerSection label="Документ гостя — паспорт обязателен">

                    {/* Тип документа — выбираем ДО фото: от него зависит, сколько сторон грузить
                        (ID-карта резидента — лицевая и оборотная, загранпаспорт иностранца — один
                        разворот). Подпись «ID карта» — только здесь: список/карточка гостя всё ещё
                        показывают «Гражданин КР» из каталога, тот лейбл не трогаем. */}
                    <ToggleButtonGroup
                      value={guestType}
                      exclusive
                      size="small"
                      onChange={(_, value: GuestType | null) => {
                        if (!value) return;
                        setGuestType(value);
                        // Тип документа, прочитанный со старого скана, к новому типу гостя не относится.
                        setScannedDocumentType(null);
                        if (value === "foreign") {
                          // Оборотной стороны у загранпаспорта нет — убираем, если уже прикрепляли.
                          if (backPhotoPreview) URL.revokeObjectURL(backPhotoPreview);
                          setBackPhotoFile(null);
                          setBackPhotoPreview(null);
                        }
                      }}
                    >
                      {(catalogs?.guestTypes ?? []).map((c) => (
                        <ToggleButton key={c.value} value={c.value}>
                          {c.value === "resident" ? "ID карта" : c.label}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>

                    {/* Фото — drag-and-drop зоны: у резидента две (лицевая/оборотная, по 50%
                        ширины), у иностранца одна на всю ширину. Лицевая (или единственная у
                        иностранца) распознаётся и грузится как раньше — поля ниже появляются
                        только после неё (или ручного «Заполнить вручную»). */}
                    {guestType === "resident" ? (
                      <Stack direction="row" gap={1.5}>
                        <DocumentDropzone
                          file={passportPhotoFile}
                          preview={passportPhotoPreview}
                          scanning={scanning}
                          scanProgress={scanProgress}
                          label="Перетащите лицевую сторону сюда либо нажмите и выберите файл"
                          onFile={(file) => void handlePhotoChange(file)}
                          onRemove={removePhoto}
                          sx={{ flex: 1 }}
                        />
                        <DocumentDropzone
                          file={backPhotoFile}
                          preview={backPhotoPreview}
                          label="Перетащите оборотную сторону сюда либо нажмите и выберите файл"
                          onFile={(file) => void handleBackPhotoChange(file)}
                          onRemove={removeBackPhoto}
                          sx={{ flex: 1 }}
                        />
                      </Stack>
                    ) : (
                      <DocumentDropzone
                        file={passportPhotoFile}
                        preview={passportPhotoPreview}
                        scanning={scanning}
                        scanProgress={scanProgress}
                        label="Перетащите паспорт сюда либо нажмите и выберите нужный файл"
                        onFile={(file) => void handlePhotoChange(file)}
                        onRemove={removePhoto}
                      />
                    )}

                    <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
                      {scanAvailable && !passportPhotoFile && !scanning && (
                        <Typography variant="caption" color="text.secondary">
                          Реквизиты подставятся по фото автоматически
                        </Typography>
                      )}
                      {!documentFieldsVisible && (
                        <Button size="small" color="inherit" onClick={() => setDocumentFieldsVisible(true)}>
                          Заполнить вручную
                        </Button>
                      )}
                    </Stack>

                    {photoError && (
                      <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                        {photoError}
                      </Alert>
                    )}
                    {scanNotice && (
                      <Alert
                        severity={scanNotice.severity}
                        icon={<AutoAwesomeOutlined fontSize="small" />}
                        onClose={clearScanNotice}
                        sx={{ fontSize: "0.8rem" }}
                      >
                        {scanNotice.text}
                        {scanNotice.warnings.length > 0 && (
                          <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2 }}>
                            {scanNotice.warnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </Box>
                        )}
                      </Alert>
                    )}

                    <Collapse in={documentFieldsVisible}>
                      <Stack spacing={2}>

                        {/* Общее для обоих типов документа — то, что реально несёт любой скан
                            паспорта/ID-карты независимо от гражданства. */}
                        <Stack direction="row" gap={2}>
                          <TextField
                            select
                            label="Пол"
                            value={gender}
                            onChange={(e) => setGender(e.target.value)}
                            slotProps={{ input: { startAdornment: <FieldIcon icon={<WcOutlined />} /> } }}
                            sx={{ flex: 1 }}
                          >
                            <MenuItem value="">Не указан</MenuItem>
                            {(catalogs?.genders ?? []).map((c) => (
                              <MenuItem key={c.value} value={c.value}>
                                {c.label}
                              </MenuItem>
                            ))}
                          </TextField>
                          <FormField
                            icon={<PlaceOutlined />}
                            rules={GUEST_RULES.short}
                            showErrors={showErrors}
                            label="Место рождения"
                            value={placeOfBirth}
                            onValueChange={(v) => setPlaceOfBirth(v)}
                            sx={{ flex: 1 }}
                          />
                        </Stack>
                        <Stack direction="row" gap={2}>
                          <CustomDatePicker label="Дата выдачи" value={issueDate} onChange={setIssueDate} sx={{ flex: 1 }} />
                          <CustomDatePicker
                            label="Действителен до"
                            value={documentExpiry}
                            onChange={setDocumentExpiry}
                            sx={{ flex: 1 }}
                          />
                        </Stack>
                        <FormField
                          icon={<AccountBalanceOutlined />}
                          rules={GUEST_RULES.short}
                          showErrors={showErrors}
                          label="Орган, выдавший документ"
                          value={issuingAuthority}
                          onValueChange={(v) => setIssuingAuthority(v)}
                          fullWidth
                        />

                        {guestType === "resident" ? (
                          <Stack gap={2}>
                            <Stack direction="row" gap={2}>
                              <FormField
                                icon={<BadgeOutlined />}
                                rules={ID_REQUIRED}
                                showErrors={showErrors}
                                label="Паспорт (ID-карта)"
                                value={idNumber}
                                onValueChange={(v) => setIdNumber(v)}
                                sx={{ flex: 1 }}
                              />
                              <FormField
                                icon={<FingerprintOutlined />}
                                label="ИНН"
                                value={inn}
                                onValueChange={setInn}
                                rules={GUEST_RULES.inn}
                                showErrors={showErrors}
                                sx={{ flex: 1 }}
                              />
                            </Stack>
                            <FormField
                              icon={<HomeOutlined />}
                              rules={GUEST_RULES.long}
                              showErrors={showErrors}
                              label="Адрес регистрации"
                              value={registrationAddress}
                              onValueChange={(v) => setRegistrationAddress(v)}
                              fullWidth
                            />
                          </Stack>
                        ) : (
                          <Stack gap={2}>
                            <Stack direction="row" gap={2}>
                              <FormField
                                icon={<PublicOutlined />}
                                rules={GUEST_RULES.short}
                                showErrors={showErrors}
                                label="Гражданство"
                                value={citizenship}
                                onValueChange={(v) => setCitizenship(v)}
                                sx={{ flex: 1 }}
                              />
                              <FormField
                                icon={<BadgeOutlined />}
                                rules={PASSPORT_REQUIRED}
                                showErrors={showErrors}
                                label="Номер загранпаспорта"
                                value={passportNumber}
                                onValueChange={(v) => setPassportNumber(v)}
                                sx={{ flex: 1 }}
                              />
                            </Stack>
                            <Stack direction="row" gap={2}>
                              <FormField
                                icon={<FlagOutlined />}
                                rules={GUEST_RULES.short}
                                showErrors={showErrors}
                                label="Страна выдачи"
                                value={passportCountry}
                                onValueChange={(v) => setPassportCountry(v)}
                                sx={{ flex: 1 }}
                              />
                              <CustomDatePicker
                                label="Дата въезда в КР"
                                value={entryDate}
                                onChange={setEntryDate}
                                disableFuture
                                sx={{ flex: 1 }}
                              />
                            </Stack>
                            <Stack direction="row" gap={2}>
                              <FormField
                                icon={<ConfirmationNumberOutlined />}
                                rules={GUEST_RULES.docNumber}
                                showErrors={showErrors}
                                label="Номер миграционной карты"
                                value={migrationCardNumber}
                                onValueChange={(v) => setMigrationCardNumber(v)}
                                sx={{ flex: 1 }}
                              />
                              <TextField
                                select
                                label="Цель визита"
                                value={visitPurpose}
                                onChange={(e) => setVisitPurpose(e.target.value)}
                                slotProps={{ input: { startAdornment: <FieldIcon icon={<LuggageOutlined />} /> } }}
                                sx={{ flex: 1 }}
                              >
                                <MenuItem value="">Не указана</MenuItem>
                                {(catalogs?.visitPurposes ?? []).map((c) => (
                                  <MenuItem key={c.value} value={c.value}>
                                    {c.label}
                                  </MenuItem>
                                ))}
                              </TextField>
                            </Stack>
                          </Stack>
                        )}
                      </Stack>
                    </Collapse>
                </DrawerSection>

                <DrawerSection label="Дополнительно · необязательно">
                    <Stack direction="row" gap={2}>
                      <TextField
                        select
                        label="Источник брони"
                        value={bookingSource}
                        onChange={(e) => setBookingSource(e.target.value)}
                        slotProps={{ input: { startAdornment: <FieldIcon icon={<LanguageOutlined />} /> } }}
                        sx={{ flex: 1 }}
                      >
                        <MenuItem value="">Не указан</MenuItem>
                        {(catalogs?.bookingSources ?? []).map((c) => (
                          <MenuItem key={c.value} value={c.value}>
                            {c.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <FormField
                        icon={<BusinessOutlined />}
                        rules={GUEST_RULES.long}
                        showErrors={showErrors}
                        label="Юрлицо / командировка"
                        value={companyInfo}
                        onValueChange={(v) => setCompanyInfo(v)}
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                    {corporateAccounts.length > 0 && (
                      <TextField
                        select
                        label="Юрлицо из справочника"
                        value={corporateId}
                        onChange={(e) => setCorporateId(e.target.value === "" ? "" : Number(e.target.value))}
                        slotProps={{ input: { startAdornment: <FieldIcon icon={<BusinessOutlined />} /> } }}
                        helperText={corporate ? (corporateDiscount > 0 ? `Скидка ${corporateDiscount}% на проживание, на услуги не действует` : "Без скидки") : "Скидка и договор юрлица"}
                        fullWidth
                      >
                        <MenuItem value="">Не выбрано</MenuItem>
                        {corporateAccounts.map((a) => (
                          <MenuItem key={a.id} value={a.id}>
                            {a.name}
                            {Number(a.discountPercent) > 0 ? ` · −${Number(a.discountPercent)}%` : ""}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                    <FormField
                      icon={<ChatBubbleOutlineOutlined />}
                      rules={GUEST_RULES.comment}
                      showErrors={showErrors}
                      label="Особые пожелания"
                      placeholder="Ранний заезд, вид на горы, детская кроватка…"
                      value={specialRequests}
                      onValueChange={(v) => setSpecialRequests(v)}
                      multiline
                      minRows={2}
                      fullWidth
                    />
                    <FormControlLabel
                      control={<Checkbox checked={dataConsent} onChange={(e) => setDataConsent(e.target.checked)} />}
                      label={
                        <Typography variant="body2" color="text.secondary">
                          Согласие на обработку персональных данных получено
                        </Typography>
                      }
                    />
                </DrawerSection>
              </>
            )}
        </DrawerBody>

        <DrawerFooter summary={footerSummary}>
          <Button onClick={requestClose}>Отмена</Button>
          <Button
            variant="contained"
            disableElevation
            disabled={!canSubmit || submitting}
            onClick={() => void handleSubmit()}
            sx={{ px: 3, borderRadius: "10px", fontWeight: 700 }}
          >
            {submitting ? "Создаём…" : "Создать бронь"}
          </Button>
        </DrawerFooter>
      </Drawer>

      {/* Подтверждение закрытия при незаполненной до конца форме — тот же
          приём, что confirmCloseOpen в реальной форме приёма. */}
      <Dialog open={confirmCloseOpen} onClose={() => setConfirmCloseOpen(false)}>
        <DialogTitle>Закрыть форму?</DialogTitle>
        <DialogContent>
          <DialogContentText>Введённые данные брони не сохранятся.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCloseOpen(false)} autoFocus>
            Вернуться к форме
          </Button>
          <Button color="warning" variant="contained" onClick={confirmDiscardAndClose}>
            Закрыть без сохранения
          </Button>
        </DialogActions>
      </Dialog>

      {/* Номер занят на выбранные даты — 409 NO_AVAILABILITY от бэка, тот же
          warn-принцип, что ShiftOverlapDialog у пересечения смен. */}
      <Dialog open={overlapConflict !== null} onClose={() => setOverlapConflict(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" gap={1}>
            <LayersOutlined color="warning" fontSize="small" />
            Номер уже занят на эти даты
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary">
            В номере {selectedRoom?.number ?? ""} уже есть бронь на пересекающиеся даты. Создать всё равно?
          </Typography>
          <Stack spacing={1} sx={{ mt: 0.75 }}>
            {(overlapConflict ?? []).map((c) => (
              <Box key={c.itemId} sx={{ borderLeft: "3px solid", borderColor: "warning.main", pl: 1.25, py: 0.25 }}>
                <Typography variant="body2" fontWeight={600}>
                  {c.guestName || `Бронь №${c.reservationNumber}`}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatHotelDateRange(c.checkIn, c.checkOut)}
                </Typography>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverlapConflict(null)}>Отмена</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => {
              setOverlapConflict(null);
              void handleSubmit(true);
            }}
          >
            Создать всё равно
          </Button>
        </DialogActions>
      </Dialog>

      {/* Номер в ремонте или заблокирован на даты — 409 NO_AVAILABILITY без
          details.overbookable, повтор с allowOverbooking вернёт то же самое. */}
      <Dialog open={unavailableMessage !== null} onClose={() => setUnavailableMessage(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" gap={1}>
            <BlockOutlined color="error" fontSize="small" />
            Номер недоступен
          </Stack>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{unavailableMessage}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnavailableMessage(null)} autoFocus>
            Понятно
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast != null}
        autoHideDuration={toast?.severity === "warning" ? 9000 : 4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Alert onClose={() => setToast(null)} severity={toast?.severity ?? "success"} variant="filled" sx={{ width: "100%" }}>
          {toast?.text}
        </Alert>
      </Snackbar>
    </>
  );
};

export default CreateBookingButton;
