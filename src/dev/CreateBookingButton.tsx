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
 * с allowOverbooking: true. Документ гостя уходит в items[0].guests[0].document,
 * фото паспорта — отдельным PUT после создания (нужен настоящий guestId).
 *
 * Открывается и «быстрой бронью» — клик по свободной ячейке в
 * RoomBookingGrid кладёт номер+дату в общий стор (requestQuickBooking), эта
 * кнопка на них подписана и открывает форму уже с подставленными Номер/Заезд.
 */
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import UploadOutlined from "@mui/icons-material/UploadOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../components/ui";
import { useHotelProperty } from "./useHotelProperty";
import {
  getHotelCatalogs,
  listRooms,
  searchGuests,
  getGuest,
  createReservation,
  uploadStayDocumentPhoto,
  getReservationConflicts,
  isOverbookingConfirmable,
  type HotelRoom,
  type HotelGuestSearchResult,
  type HotelGuest,
  type HotelReservationConflict,
} from "../api/hotel";
import { getErrorMessage } from "../api/client";
import {
  subscribeQuickBookingRequest,
  getQuickBookingRequestSnapshot,
  clearQuickBookingRequest,
  simulatePassportScan,
  initialsOf,
  formatHotelDateRange,
  type GuestType,
} from "./mockDemoData";

/** Ограничение на фото паспорта из контракта (§4.3): jpg/png/webp/heic/pdf ≤10 МБ. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** "" → undefined — необязательные текстовые поля не должны улетать в бронь пустыми строками. */
const orUndefined = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="h6" sx={{ fontWeight: 600 }}>
    {children}
  </Typography>
);

export interface CreateBookingButtonProps {
  /**
   * Не рендерить собственную кнопку-триггер — используется, когда открытие
   * формы идёт снаружи (requestQuickBooking без аргументов, например кнопка
   * «Добавить» в PageHeader на странице «Гости»), а не с этой самой кнопки.
   */
  hideTrigger?: boolean;
}

export const CreateBookingButton: React.FC<CreateBookingButtonProps> = ({ hideTrigger = false }) => {
  const { property } = useHotelProperty();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  // Номер уже занят на эти даты — предупреждаем, не блокируем (409
  // NO_AVAILABILITY с details.conflicts, см. handleSubmit ниже).
  const [overlapConflict, setOverlapConflict] = React.useState<HotelReservationConflict[] | null>(null);

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
  const [boardType, setBoardType] = React.useState("");

  // Документ
  const [guestType, setGuestType] = React.useState<GuestType>("resident");
  const [idNumber, setIdNumber] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [citizenship, setCitizenship] = React.useState("");
  const [passportNumber, setPassportNumber] = React.useState("");
  const [passportCountry, setPassportCountry] = React.useState("");
  const [passportExpiry, setPassportExpiry] = React.useState<Dayjs | null>(null);
  const [entryDate, setEntryDate] = React.useState<Dayjs | null>(null);
  const [migrationCardNumber, setMigrationCardNumber] = React.useState("");
  const [visitPurpose, setVisitPurpose] = React.useState("");
  const [passportPhotoFile, setPassportPhotoFile] = React.useState<File | null>(null);
  const [passportPhotoPreview, setPassportPhotoPreview] = React.useState<string | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [scanNotice, setScanNotice] = React.useState(false);

  // Дополнительно
  const [bookingSource, setBookingSource] = React.useState("");
  const [specialRequests, setSpecialRequests] = React.useState("");
  const [companyInfo, setCompanyInfo] = React.useState("");
  const [dataConsent, setDataConsent] = React.useState(false);

  const reset = () => {
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
    setBoardType("");
    setGuestType("resident");
    setIdNumber("");
    setInn("");
    setCitizenship("");
    setPassportNumber("");
    setPassportCountry("");
    setPassportExpiry(null);
    setEntryDate(null);
    setMigrationCardNumber("");
    setVisitPurpose("");
    setPassportPhotoFile(null);
    setPassportPhotoPreview(null);
    setPhotoError(null);
    setScanNotice(false);
    setBookingSource("");
    setSpecialRequests("");
    setCompanyInfo("");
    setDataConsent(false);
    setSubmitError(null);
  };

  // Справочники объекта (питание/гарантия/источник/тип гостя/цель визита) —
  // из бэкенда, не из констант мока (hotel-viva-frontend-api.md §3.2).
  const catalogsQuery = useQuery({
    queryKey: ["hotel", "catalogs", property?.id],
    queryFn: ({ signal }) => getHotelCatalogs(property!.id, signal),
    enabled: property != null,
    staleTime: 5 * 60_000,
  });
  const catalogs = catalogsQuery.data;

  // Номера объекта — для выпадающего списка формы.
  const roomsQuery = useQuery({
    queryKey: ["hotel", "rooms", property?.id],
    queryFn: ({ signal }) => listRooms({ propertyId: property!.id }, signal),
    enabled: property != null,
  });
  const rooms = React.useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);

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
    setPassportExpiry(guest.passportExpiry ? dayjs(guest.passportExpiry) : null);
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
  React.useEffect(() => {
    if (!quickBookingRequest) return;
    reset();
    if (quickBookingRequest.room) {
      const found = rooms.find((r) => r.number === quickBookingRequest.room);
      if (found) setRoomId(found.id);
    }
    if (quickBookingRequest.checkIn) {
      setCheckIn(dayjs(quickBookingRequest.checkIn));
      setCheckOut(dayjs(quickBookingRequest.checkIn).add(1, "day"));
    }
    setOpen(true);
    clearQuickBookingRequest();
  }, [quickBookingRequest, rooms]);

  const canSubmit =
    guestName.trim() !== "" && roomId !== "" && !!checkIn && !!checkOut && checkOut.isAfter(checkIn) && property != null;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // позволяет выбрать тот же файл ещё раз
    if (!file) return;
    if (!/^image\/|^application\/pdf$/.test(file.type)) {
      setPhotoError("Нужен файл изображения или PDF");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("Файл больше 10 МБ");
      return;
    }
    setPhotoError(null);
    if (passportPhotoPreview) URL.revokeObjectURL(passportPhotoPreview);
    setPassportPhotoFile(file);
    setPassportPhotoPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);

    // Имитация распознавания — реального OCR нет (вне ТЗ), см. simulatePassportScan.
    const scan = simulatePassportScan(`${file.name}:${file.size}`);
    setGuestType(scan.guestType);
    setIdNumber(scan.idNumber ?? "");
    setInn(scan.inn ?? "");
    setCitizenship(scan.citizenship ?? "");
    setPassportNumber(scan.passportNumber ?? "");
    setPassportCountry(scan.passportCountry ?? "");
    setPassportExpiry(scan.passportExpiry ? dayjs(scan.passportExpiry) : null);
    setScanNotice(true);
  };

  const removePhoto = () => {
    if (passportPhotoPreview) URL.revokeObjectURL(passportPhotoPreview);
    setPassportPhotoFile(null);
    setPassportPhotoPreview(null);
  };

  /**
   * allowOverbooking=true — подтверждение из диалога конфликта ниже.
   * Пересечение дат бэкенд обнаруживает сам (409 NO_AVAILABILITY), фронт
   * ничего заранее не проверяет — тот же warn-принцип, что ShiftOverlapDialog
   * у пересечения смен в реальном расписании.
   */
  const handleSubmit = async (allowOverbooking = false) => {
    if (!checkIn || !checkOut || roomId === "" || !property) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const documentType = guestType === "resident" ? "id_card" : "passport";
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
        dataConsent,
        allowOverbooking,
        items: [
          {
            roomId,
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
                  passportExpiry: guestType === "foreign" ? passportExpiry?.format("YYYY-MM-DD") ?? null : null,
                  entryDate: guestType === "foreign" ? entryDate?.format("YYYY-MM-DD") ?? null : null,
                  migrationCardNumber: guestType === "foreign" ? orUndefined(migrationCardNumber) : undefined,
                  visitPurpose: guestType === "foreign" ? visitPurpose || undefined : undefined,
                },
              },
            ],
          },
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

      void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
      setOpen(false);
      setToast(`Бронь №${reservation.number} для «${guestName.trim()}» добавлена в шахматку`);
      reset();
    } catch (err) {
      const conflicts = getReservationConflicts(err);
      if (conflicts && isOverbookingConfirmable(err)) {
        setOverlapConflict(conflicts);
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
        <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setOpen(true)}>
          Создать бронь
        </Button>
      )}

      <Drawer
        anchor="right"
        open={open}
        onClose={requestClose}
        PaperProps={{
          sx: { width: { xs: 390, sm: 480, md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" },
        }}
      >
        {/* ── header ── */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1, flexShrink: 0 }}>
          <Typography variant="h6">Новая бронь</Typography>
          <IconButton onClick={requestClose}>
            <CloseOutlined />
          </IconButton>
        </Box>
        <Divider />

        {/* ── scrollable body ── */}
        <Box sx={{ p: 2, flex: 1, overflowY: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
          <Stack spacing={2.5}>
            <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
              Обязательны только гость, номер и даты — остальное можно оставить пустым.
            </Alert>
            {submitError && <Alert severity="error">{submitError}</Alert>}

            {/* ── 1. Проживание ── */}
            <SectionTitle>Проживание</SectionTitle>
            <TextField
              select
              label="Номер"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value === "" ? "" : Number(e.target.value))}
              fullWidth
            >
              {rooms.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.number} — {r.roomTypeName}
                </MenuItem>
              ))}
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
            <Stack direction="row" gap={2}>
              <TextField
                label="Взрослые"
                type="number"
                value={adults}
                onChange={(e) => setAdults(e.target.value)}
                slotProps={{ htmlInput: { min: 1 } }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Дети"
                type="number"
                value={children}
                onChange={(e) => setChildren(e.target.value)}
                slotProps={{ htmlInput: { min: 0 } }}
                sx={{ flex: 1 }}
              />
            </Stack>
            <Stack direction="row" gap={2}>
              <TextField
                select
                label="Гарантия брони"
                value={guaranteeMethod}
                onChange={(e) => setGuaranteeMethod(e.target.value)}
                sx={{ flex: 1 }}
              >
                <MenuItem value="">Не указана</MenuItem>
                {(catalogs?.guaranteeMethods ?? []).map((c) => (
                  <MenuItem key={c.value} value={c.value}>
                    {c.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="Тариф" value={boardType} onChange={(e) => setBoardType(e.target.value)} sx={{ flex: 1 }}>
                <MenuItem value="">Не указан</MenuItem>
                {(catalogs?.boardTypes ?? []).map((c) => (
                  <MenuItem key={c.value} value={c.value}>
                    {c.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            {selectedRoom && selectedRoom.mealOptions.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                В номере доступно: {selectedRoom.mealOptions.join(", ")}
              </Typography>
            )}

            {/* ── 2. Гость ── */}
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                Гость
              </Typography>
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
                        </Typography>
                      </Box>
                    </Stack>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField {...params} placeholder="Имя и фамилия — или начните вводить, чтобы найти гостя" fullWidth />
                )}
              />

              <Stack direction="row" gap={2}>
                <TextField
                  label="Телефон"
                  placeholder="+996 700 000 000"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Email"
                  placeholder="guest@mail.com"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
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
            </Stack>

            {/* Как в реальной форме секция услуг открывается только с выбранным
                пациентом — документ и допполя появляются только когда есть гость. */}
            {guestName.trim() !== "" && (
              <Card variant="outlined" sx={{ bgcolor: "background.paper" }}>
                <CardContent sx={{ p: 2 }}>
                  <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                      Документ (необязательно)
                    </Typography>
                    <Divider />

                    <ToggleButtonGroup
                      value={guestType}
                      exclusive
                      size="small"
                      onChange={(_, value: GuestType | null) => value && setGuestType(value)}
                    >
                      {(catalogs?.guestTypes ?? []).map((c) => (
                        <ToggleButton key={c.value} value={c.value}>
                          {c.label}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>

                    {guestType === "resident" ? (
                      <Stack direction="row" gap={2}>
                        <TextField
                          label="Паспорт (ID-карта)"
                          value={idNumber}
                          onChange={(e) => setIdNumber(e.target.value)}
                          sx={{ flex: 1 }}
                        />
                        <TextField label="ИНН" value={inn} onChange={(e) => setInn(e.target.value)} sx={{ flex: 1 }} />
                      </Stack>
                    ) : (
                      <Stack gap={2}>
                        <Stack direction="row" gap={2}>
                          <TextField
                            label="Гражданство"
                            value={citizenship}
                            onChange={(e) => setCitizenship(e.target.value)}
                            sx={{ flex: 1 }}
                          />
                          <TextField
                            label="Номер загранпаспорта"
                            value={passportNumber}
                            onChange={(e) => setPassportNumber(e.target.value)}
                            sx={{ flex: 1 }}
                          />
                        </Stack>
                        <Stack direction="row" gap={2}>
                          <TextField
                            label="Страна выдачи"
                            value={passportCountry}
                            onChange={(e) => setPassportCountry(e.target.value)}
                            sx={{ flex: 1 }}
                          />
                          <CustomDatePicker
                            label="Действителен до"
                            value={passportExpiry}
                            onChange={setPassportExpiry}
                            sx={{ flex: 1 }}
                          />
                        </Stack>
                        <Stack direction="row" gap={2}>
                          <CustomDatePicker
                            label="Дата въезда в КР"
                            value={entryDate}
                            onChange={setEntryDate}
                            disableFuture
                            sx={{ flex: 1 }}
                          />
                          <TextField
                            label="Номер миграционной карты"
                            value={migrationCardNumber}
                            onChange={(e) => setMigrationCardNumber(e.target.value)}
                            sx={{ flex: 1 }}
                          />
                        </Stack>
                        <TextField
                          select
                          label="Цель визита"
                          value={visitPurpose}
                          onChange={(e) => setVisitPurpose(e.target.value)}
                          fullWidth
                        >
                          <MenuItem value="">Не указана</MenuItem>
                          {(catalogs?.visitPurposes ?? []).map((c) => (
                            <MenuItem key={c.value} value={c.value}>
                              {c.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Stack>
                    )}

                    <Stack direction="row" alignItems="center" gap={1.5}>
                      <Button component="label" size="small" variant="outlined" startIcon={<UploadOutlined />}>
                        Фото паспорта
                        <input type="file" accept="image/*,application/pdf" hidden onChange={handlePhotoChange} />
                      </Button>
                      {passportPhotoFile && (
                        <Stack direction="row" alignItems="center" gap={1}>
                          {passportPhotoPreview && (
                            <Box
                              component="img"
                              src={passportPhotoPreview}
                              alt="Фото паспорта"
                              sx={{ width: 40, height: 40, borderRadius: "6px", objectFit: "cover" }}
                            />
                          )}
                          <Button size="small" color="inherit" startIcon={<CloseOutlined fontSize="small" />} onClick={removePhoto}>
                            Убрать
                          </Button>
                        </Stack>
                      )}
                    </Stack>
                    {photoError && (
                      <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                        {photoError}
                      </Alert>
                    )}
                    <Collapse in={scanNotice}>
                      <Alert
                        severity="info"
                        icon={<AutoAwesomeOutlined fontSize="small" />}
                        onClose={() => setScanNotice(false)}
                        sx={{ fontSize: "0.8rem" }}
                      >
                        Реквизиты подставлены по фото — демо-распознавание, не настоящий OCR.
                      </Alert>
                    </Collapse>

                    <Divider />
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                      Дополнительно (необязательно)
                    </Typography>
                    <Stack direction="row" gap={2}>
                      <TextField
                        select
                        label="Источник брони"
                        value={bookingSource}
                        onChange={(e) => setBookingSource(e.target.value)}
                        sx={{ flex: 1 }}
                      >
                        <MenuItem value="">Не указан</MenuItem>
                        {(catalogs?.bookingSources ?? []).map((c) => (
                          <MenuItem key={c.value} value={c.value}>
                            {c.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        label="Юрлицо / командировка"
                        value={companyInfo}
                        onChange={(e) => setCompanyInfo(e.target.value)}
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                    <TextField
                      label="Особые пожелания"
                      placeholder="Ранний заезд, вид на горы, детская кроватка…"
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
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
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Stack>
        </Box>

        {/* ── footer ── */}
        <Divider />
        <Box sx={{ p: 2, flexShrink: 0, bgcolor: "background.paper", borderTop: "1px solid", borderColor: "divider" }}>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={requestClose}>Отмена</Button>
            <Button variant="contained" disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
              {submitting ? "Создаём…" : "Создать"}
            </Button>
          </Stack>
        </Box>
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

      <Snackbar
        open={toast != null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ width: "100%" }}>
          {toast}
        </Alert>
      </Snackbar>
    </>
  );
};

export default CreateBookingButton;
