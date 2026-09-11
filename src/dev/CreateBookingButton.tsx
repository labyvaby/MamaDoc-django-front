/**
 * «Создать бронь» — замена кнопки «Добавить смену» на верхней панели
 * «Шахматки броней» (Viva). Добавление смены — действие над графиком
 * персонала, для гостиничной брони оно не имеет смысла; здесь у отеля должно
 * быть создание брони номера, как в референсном PMS.
 *
 * Обязательны только Гость/Номер/даты — как и раньше. Остальные поля
 * (контакты, документ, фото паспорта, пожелания) добавлены по тому же
 * принципу, что у настоящих отелей: гражданин КР и иностранец сдают разные
 * документы (паспорт vs загранпаспорт + миграционный учёт), но ни то, ни
 * другое не должно быть обязательным на этапе брони — гостя рано пугать
 * длинной анкетой, когда документа может даже не быть под рукой.
 *
 * ⚠ Витрина: нет сущности «номер»/«бронь» в реальном API (см. mockDemoData.ts)
 * — бронь уходит в общий браузерный стор (addCustomBooking, localStorage), а
 * не на бэкенд. Она реально появляется в RoomBookingGrid/GuestDetailsDialog и
 * переживает перезагрузку страницы, но это состояние только этой вкладки: у
 * другого человека или после очистки localStorage её не будет. Фото паспорта
 * хранится как data URL прямо в той же записи — реальный файловый сервер
 * потребовал бы отдельной инфраструктуры, которой у демо-мока нет.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import UploadOutlined from "@mui/icons-material/UploadOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../components/ui";
import {
  HOTEL_ROOMS,
  addCustomBooking,
  GUEST_TYPE_LABELS,
  GUARANTEE_METHOD_LABELS,
  BOOKING_SOURCE_LABELS,
  VISIT_PURPOSE_LABELS,
  type GuestType,
  type BookingGuaranteeMethod,
  type BookingSource,
  type VisitPurpose,
} from "./mockDemoData";

/** Демо-хранилище — localStorage, не файловый сервер: фото ограничено по размеру. */
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

/** "" → undefined — необязательные текстовые поля не должны улетать в бронь пустыми строками. */
const orUndefined = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
    {children}
  </Typography>
);

export const CreateBookingButton: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  // Гость и проживание
  const [guestName, setGuestName] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [room, setRoom] = React.useState("");
  const [checkIn, setCheckIn] = React.useState<Dayjs | null>(dayjs());
  const [checkOut, setCheckOut] = React.useState<Dayjs | null>(dayjs().add(1, "day"));
  const [adults, setAdults] = React.useState("1");
  const [children, setChildren] = React.useState("0");
  const [guaranteeMethod, setGuaranteeMethod] = React.useState<BookingGuaranteeMethod | "">("");

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
  const [visitPurpose, setVisitPurpose] = React.useState<VisitPurpose | "">("");
  const [passportPhoto, setPassportPhoto] = React.useState<string | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);

  // Дополнительно
  const [bookingSource, setBookingSource] = React.useState<BookingSource | "">("");
  const [specialRequests, setSpecialRequests] = React.useState("");
  const [companyInfo, setCompanyInfo] = React.useState("");
  const [dataConsent, setDataConsent] = React.useState(false);

  const reset = () => {
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setRoom("");
    setCheckIn(dayjs());
    setCheckOut(dayjs().add(1, "day"));
    setAdults("1");
    setChildren("0");
    setGuaranteeMethod("");
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
    setPassportPhoto(null);
    setPhotoError(null);
    setBookingSource("");
    setSpecialRequests("");
    setCompanyInfo("");
    setDataConsent(false);
  };

  const canSubmit = guestName.trim() !== "" && room !== "" && !!checkIn && !!checkOut && checkOut.isAfter(checkIn);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // позволяет выбрать тот же файл ещё раз
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Нужен файл изображения");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("Файл больше 3 МБ — многовато для демо-хранилища (localStorage)");
      return;
    }
    setPhotoError(null);
    const reader = new FileReader();
    reader.onload = () => setPassportPhoto(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!checkIn || !checkOut) return;
    addCustomBooking({
      roomNumber: room,
      guestName: guestName.trim(),
      checkIn: checkIn.format("YYYY-MM-DD"),
      checkOut: checkOut.format("YYYY-MM-DD"),
      guestPhone: orUndefined(guestPhone),
      guestEmail: orUndefined(guestEmail),
      adults: Number(adults) || undefined,
      children: Number(children) || undefined,
      guaranteeMethod: guaranteeMethod || undefined,
      guestType,
      idNumber: guestType === "resident" ? orUndefined(idNumber) : undefined,
      inn: guestType === "resident" ? orUndefined(inn) : undefined,
      citizenship: guestType === "foreign" ? orUndefined(citizenship) : undefined,
      passportNumber: guestType === "foreign" ? orUndefined(passportNumber) : undefined,
      passportCountry: guestType === "foreign" ? orUndefined(passportCountry) : undefined,
      passportExpiry: guestType === "foreign" ? passportExpiry?.format("YYYY-MM-DD") : undefined,
      entryDate: guestType === "foreign" ? entryDate?.format("YYYY-MM-DD") : undefined,
      migrationCardNumber: guestType === "foreign" ? orUndefined(migrationCardNumber) : undefined,
      visitPurpose: guestType === "foreign" ? visitPurpose || undefined : undefined,
      passportPhotoDataUrl: passportPhoto ?? undefined,
      bookingSource: bookingSource || undefined,
      specialRequests: orUndefined(specialRequests),
      companyInfo: orUndefined(companyInfo),
      dataConsent: dataConsent || undefined,
    });
    setOpen(false);
    setToast(`Бронь для «${guestName.trim()}» в номере ${room} добавлена в шахматку`);
    reset();
  };

  return (
    <>
      <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setOpen(true)}>
        Создать бронь
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новая бронь</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 0.5 }}>
            <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
              Демо-форма: бронь появится в шахматке ниже, но живёт только в этом браузере. Обязательны
              только гость, номер и даты — остальное можно оставить пустым.
            </Alert>

            <SectionTitle>Гость</SectionTitle>
            <TextField
              label="Гость"
              placeholder="Имя и фамилия"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              autoFocus
              fullWidth
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

            <Divider />
            <SectionTitle>Проживание</SectionTitle>
            <TextField select label="Номер" value={room} onChange={(e) => setRoom(e.target.value)} fullWidth>
              {HOTEL_ROOMS.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
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
              <TextField
                select
                label="Гарантия брони"
                value={guaranteeMethod}
                onChange={(e) => setGuaranteeMethod(e.target.value as BookingGuaranteeMethod | "")}
                sx={{ flex: 2 }}
              >
                <MenuItem value="">Не указана</MenuItem>
                {(Object.keys(GUARANTEE_METHOD_LABELS) as BookingGuaranteeMethod[]).map((key) => (
                  <MenuItem key={key} value={key}>
                    {GUARANTEE_METHOD_LABELS[key]}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <Divider />
            <SectionTitle>Документ (необязательно)</SectionTitle>
            <ToggleButtonGroup
              value={guestType}
              exclusive
              size="small"
              onChange={(_, value: GuestType | null) => value && setGuestType(value)}
            >
              {(Object.keys(GUEST_TYPE_LABELS) as GuestType[]).map((key) => (
                <ToggleButton key={key} value={key}>
                  {GUEST_TYPE_LABELS[key]}
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
                  onChange={(e) => setVisitPurpose(e.target.value as VisitPurpose | "")}
                  fullWidth
                >
                  <MenuItem value="">Не указана</MenuItem>
                  {(Object.keys(VISIT_PURPOSE_LABELS) as VisitPurpose[]).map((key) => (
                    <MenuItem key={key} value={key}>
                      {VISIT_PURPOSE_LABELS[key]}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            )}

            <Stack direction="row" alignItems="center" gap={1.5}>
              <Button component="label" size="small" variant="outlined" startIcon={<UploadOutlined />}>
                Фото паспорта
                <input type="file" accept="image/*" hidden onChange={handlePhotoChange} />
              </Button>
              {passportPhoto && (
                <Stack direction="row" alignItems="center" gap={1}>
                  <Box
                    component="img"
                    src={passportPhoto}
                    alt="Фото паспорта"
                    sx={{ width: 40, height: 40, borderRadius: "6px", objectFit: "cover" }}
                  />
                  <Button
                    size="small"
                    color="inherit"
                    startIcon={<CloseOutlined fontSize="small" />}
                    onClick={() => setPassportPhoto(null)}
                  >
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

            <Divider />
            <SectionTitle>Дополнительно (необязательно)</SectionTitle>
            <Stack direction="row" gap={2}>
              <TextField
                select
                label="Источник брони"
                value={bookingSource}
                onChange={(e) => setBookingSource(e.target.value as BookingSource | "")}
                sx={{ flex: 1 }}
              >
                <MenuItem value="">Не указан</MenuItem>
                {(Object.keys(BOOKING_SOURCE_LABELS) as BookingSource[]).map((key) => (
                  <MenuItem key={key} value={key}>
                    {BOOKING_SOURCE_LABELS[key]}
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
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button variant="contained" disabled={!canSubmit} onClick={handleSubmit}>
            Создать
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
