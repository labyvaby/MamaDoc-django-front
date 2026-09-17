/**
 * AddGuestDrawer — «Добавить» на «Гостях» (HotelGuestsPage.tsx). Та же форма
 * и логика, что у реального DjangoAddPatientDrawer.tsx: фото первым полем
 * (PatientPhotoUploader — общий компонент, не копия), ФИО+телефон, черновик
 * в localStorage переживает случайное закрытие (крестик/фон/Esc) — не
 * confirm-диалог, как у CreateBookingButton/DjangoAddAppointmentDrawer, это
 * сознательно другой паттерн именно у формы добавления пациента/гостя,
 * восстановленный черновик можно стереть иконкой RestoreOutlined в шапке.
 * Фото (аватар и паспорт) в черновик не входят — File не сериализуется.
 *
 * Поле «Гость» — Autocomplete freeSolo с реальным поиском по имени
 * (searchGuests, см. src/api/hotel.ts, ≥2 символа), тот же приём, что в
 * CreateBookingButton — чтобы персонал не завёл дубль, набирая ФИО. Выбор
 * существующего варианта из списка не создаёт нового гостя, а сразу
 * использует найденного (handleUseDuplicate) — то же действие, что
 * «Использовать» в предупреждении о дубле по телефону ниже.
 *
 * «Фото паспорта» в «Документ» — имитация распознавания (simulatePassportScan
 * в mockDemoData.ts): реального OCR нет, при выборе файла просто
 * подставляются правдоподобные фейковые реквизиты — витрина будущей фичи.
 * Само фото сохраняется как обычный File (как в CreateBookingButton), а не
 * base64 — грузится на бэкенд после создания гостя.
 *
 * Гость заводится независимо от брони (POST /hotel/guests/) — тот же
 * принцип, что пациент независимо от приёма. Источник (платформа, откуда
 * пришёл гость) — свойство самого человека, не только брони, поэтому есть и
 * здесь (source гостя), и в CreateBookingButton (source на конкретной брони
 * уточняет его позже).
 */
import React from "react";
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Collapse,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import UploadOutlined from "@mui/icons-material/UploadOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker, cascadeContainer, cascadeItem } from "../components/ui";
import PatientPhotoUploader from "../components/patients/PatientPhotoUploader";
import { useFormValidation } from "../hooks/useFormValidation";
import { capitalizeFullName } from "../utility/name";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../utility/formDraft";
import { simulatePassportScan, initialsOf, type GuestType } from "./mockDemoData";
import { HOTEL_GUEST_TYPE_LABELS, HOTEL_BOOKING_SOURCE_LABELS } from "./hotelDisplay";
import {
  searchGuests,
  createGuest,
  uploadGuestPhoto,
  uploadGuestDocumentPhoto,
  setGuestBlacklist,
  type HotelGuestSearchResult,
  type HotelGuestCreateData,
} from "../api/hotel";
import { getErrorMessage } from "../api/client";

const MotionStack = motion(Stack);
const MotionBox = motion(Box);

/** Ограничение на фото — как в CreateBookingButton (§4.3 контракта): ≤10 МБ. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** "" → undefined — необязательные текстовые поля не должны улетать пустыми строками. */
const orUndefined = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

// ── черновик формы (localStorage) — пережить случайное закрытие ────────────

const DRAFT_STORAGE_KEY = "mamadoc:guests:add-draft";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type GuestDraft = {
  savedAt: number;
  name: string;
  phone: string;
  guestType: GuestType;
  idNumber: string;
  inn: string;
  citizenship: string;
  passportNumber: string;
  passportCountry: string;
  /** YYYY-MM-DD или "". */
  passportExpiry: string;
  source: string;
  isBlacklisted: boolean;
  blacklistReason: string;
};

function readGuestDraft(): GuestDraft | null {
  return readFormDraft<GuestDraft>(DRAFT_STORAGE_KEY, DRAFT_TTL_MS);
}

function writeGuestDraft(draft: Omit<GuestDraft, "savedAt">): void {
  writeFormDraft(DRAFT_STORAGE_KEY, draft);
}

function clearGuestDraft(): void {
  clearFormDraft(DRAFT_STORAGE_KEY);
}

function isDraftEmpty(d: Omit<GuestDraft, "savedAt">): boolean {
  return (
    !d.name.trim() &&
    !d.phone.trim() &&
    !d.idNumber.trim() &&
    !d.inn.trim() &&
    !d.citizenship.trim() &&
    !d.passportNumber.trim() &&
    !d.passportCountry.trim() &&
    !d.passportExpiry &&
    !d.source &&
    !d.isBlacklisted &&
    !d.blacklistReason.trim()
  );
}

export interface AddGuestDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (clientId: number) => void;
}

export const AddGuestDrawer: React.FC<AddGuestDrawerProps> = ({ open, onClose, onCreated }) => {
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [guestType, setGuestType] = React.useState<GuestType>("resident");
  const [idNumber, setIdNumber] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [citizenship, setCitizenship] = React.useState("");
  const [passportNumber, setPassportNumber] = React.useState("");
  const [passportCountry, setPassportCountry] = React.useState("");
  const [passportExpiry, setPassportExpiry] = React.useState<Dayjs | null>(null);
  const [source, setSource] = React.useState("");
  const [passportPhotoFile, setPassportPhotoFile] = React.useState<File | null>(null);
  const [passportPhotoPreview, setPassportPhotoPreview] = React.useState<string | null>(null);
  const [scanNotice, setScanNotice] = React.useState(false);
  const [isBlacklisted, setIsBlacklisted] = React.useState(false);
  const [blacklistReason, setBlacklistReason] = React.useState("");
  const [draftRestored, setDraftRestored] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const handlePickPhoto = (file: File | null) => {
    setPhotoError(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("Файл больше 10 МБ");
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  /** Имитация распознавания фото паспорта — реального OCR нет, см. simulatePassportScan в mockDemoData.ts. */
  const handlePickPassportPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
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

  // ── reset / восстановление черновика при открытии ──────────────────────
  React.useEffect(() => {
    if (!open) {
      setPhotoFile(null);
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPhotoError(null);
      setPassportPhotoFile(null);
      setPassportPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setScanNotice(false);
      setName("");
      setPhone("");
      setGuestType("resident");
      setSource("");
      setIdNumber("");
      setInn("");
      setCitizenship("");
      setPassportNumber("");
      setPassportCountry("");
      setPassportExpiry(null);
      setIsBlacklisted(false);
      setBlacklistReason("");
      setDraftRestored(false);
      setSubmitError(null);
      return;
    }
    const draft = readGuestDraft();
    if (draft) {
      setName(draft.name);
      setPhone(draft.phone);
      setGuestType(draft.guestType);
      setIdNumber(draft.idNumber);
      setInn(draft.inn);
      setCitizenship(draft.citizenship);
      setPassportNumber(draft.passportNumber);
      setPassportCountry(draft.passportCountry);
      setPassportExpiry(draft.passportExpiry ? dayjs(draft.passportExpiry) : null);
      setSource(draft.source);
      setIsBlacklisted(draft.isBlacklisted);
      setBlacklistReason(draft.blacklistReason);
      setDraftRestored(true);
    }
  }, [open]);

  // ── сохранение черновика (защита от случайного закрытия) — фото не
  // сохраняем: File не сериализуется.
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    const draft = {
      name,
      phone,
      guestType,
      idNumber,
      inn,
      citizenship,
      passportNumber,
      passportCountry,
      passportExpiry: passportExpiry ? passportExpiry.format("YYYY-MM-DD") : "",
      source,
      isBlacklisted,
      blacklistReason,
    };
    if (isDraftEmpty(draft)) clearGuestDraft();
    else writeGuestDraft(draft);
  };

  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => flushDraftRef.current(), 400);
    return () => clearTimeout(id);
  }, [open, name, phone, guestType, idNumber, inn, citizenship, passportNumber, passportCountry, passportExpiry, source, isBlacklisted, blacklistReason]);

  const handleClose = () => {
    if (submitting) return;
    flushDraftRef.current();
    onClose();
  };

  const handleDiscardDraft = () => {
    clearGuestDraft();
    setName("");
    setPhone("");
    setGuestType("resident");
    setIdNumber("");
    setInn("");
    setCitizenship("");
    setPassportNumber("");
    setPassportCountry("");
    setPassportExpiry(null);
    setSource("");
    setIsBlacklisted(false);
    setBlacklistReason("");
    setDraftRestored(false);
  };

  // ── дубли по телефону — тот же приём, что в CreateBookingButton: поиск на
  // бэкенде (searchGuests), предупреждение, не блокировка.
  const phoneDigits = phone.replace(/\D/g, "");
  const dupQuery = useQuery({
    queryKey: ["hotel", "guests", "search", "dup", phoneDigits],
    queryFn: ({ signal }) => searchGuests(phoneDigits, signal),
    enabled: open && phoneDigits.length >= 6,
  });
  const duplicates = (dupQuery.data ?? []).filter(
    (g) => g.phone.replace(/\D/g, "").includes(phoneDigits) && g.fullName !== name.trim(),
  );

  // ── автопоиск по ФИО (Autocomplete ниже) — чтобы персонал не завёл дубль,
  // набирая имя уже существующего гостя.
  const guestSearchQuery = useQuery({
    queryKey: ["hotel", "guests", "search", name.trim()],
    queryFn: ({ signal }) => searchGuests(name.trim(), signal),
    enabled: open && name.trim().length >= 2,
  });
  const guestOptions = guestSearchQuery.data ?? [];

  const handleUseDuplicate = (guest: HotelGuestSearchResult) => {
    clearGuestDraft();
    onCreated?.(guest.clientId);
    onClose();
  };

  const v = useFormValidation({
    name: name.trim() ? null : "Укажите ФИО гостя",
    blacklistReason: isBlacklisted && !blacklistReason.trim() ? "Укажите причину чёрного списка" : null,
  });

  React.useEffect(() => {
    if (open) v.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    if (!v.validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const documentType = guestType === "resident" ? "id_card" : "passport";
      const documentNumber = guestType === "resident" ? orUndefined(idNumber) : orUndefined(passportNumber);
      const data: HotelGuestCreateData = {
        fullName: capitalizeFullName(name),
        phone: orUndefined(phone),
        guestType,
        documentType,
        documentNumber,
        inn: guestType === "resident" ? orUndefined(inn) : undefined,
        citizenship: guestType === "foreign" ? orUndefined(citizenship) : undefined,
        passportCountry: guestType === "foreign" ? orUndefined(passportCountry) : undefined,
        passportExpiry: guestType === "foreign" ? passportExpiry?.format("YYYY-MM-DD") ?? undefined : undefined,
        source: source || undefined,
      };
      const guest = await createGuest(data);

      // Гость уже создан — сбои загрузки фото/паспорта/ЧС дальше не откатываем
      // создание, только молча пропускаем (тот же принцип, что в CreateBookingButton).
      if (photoFile) {
        try {
          await uploadGuestPhoto(guest.clientId, photoFile);
        } catch {
          // no-op
        }
      }
      if (passportPhotoFile) {
        try {
          await uploadGuestDocumentPhoto(guest.clientId, passportPhotoFile);
        } catch {
          // no-op
        }
      }
      if (isBlacklisted && blacklistReason.trim()) {
        try {
          await setGuestBlacklist(guest.clientId, blacklistReason.trim());
        } catch {
          // no-op
        }
      }

      clearGuestDraft();
      onCreated?.(guest.clientId);
      onClose();
    } catch (err) {
      setSubmitError(getErrorMessage(err, "Не удалось создать гостя"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const hasDuplicates = duplicates.length > 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      PaperProps={{
        sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" },
      }}
    >
      <Box sx={{ width: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        {/* header */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1 }}>
          <Typography variant="h6">Новый гость</Typography>
          <Stack direction="row" alignItems="center" gap={0.5}>
            {draftRestored && (
              <Tooltip title="Восстановлен черновик — стереть?">
                <IconButton onClick={handleDiscardDraft} aria-label="Стереть черновик">
                  <RestoreOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton onClick={handleClose} aria-label="Закрыть">
              <CloseOutlined />
            </IconButton>
          </Stack>
        </Box>
        <Divider />

        {/* body */}
        <Box sx={{ p: 2, flex: 1, overflowY: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
          <MotionStack spacing={3} variants={cascadeContainer} initial="hidden" animate="show">
            {submitError && (
              <MotionBox variants={cascadeItem}>
                <Alert severity="error">{submitError}</Alert>
              </MotionBox>
            )}

            {/* ── Фото ── */}
            <MotionBox variants={cascadeItem}>
              <PatientPhotoUploader
                photoFile={photoFile}
                photoPreview={photoPreview}
                onPickPhoto={handlePickPhoto}
                inputId="add-guest-photo"
                disabled={submitting}
              />
              {photoError && (
                <Alert severity="warning" variant="outlined" sx={{ mt: 1, fontSize: "0.8rem" }}>
                  {photoError}
                </Alert>
              )}
            </MotionBox>

            {/* ── ФИО ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Гость
                </Typography>
                <Autocomplete<HotelGuestSearchResult, false, false, true>
                  freeSolo
                  options={guestOptions}
                  inputValue={name}
                  loading={guestSearchQuery.isFetching}
                  onInputChange={(_, value) => setName(value)}
                  onChange={(_, value) => {
                    if (value && typeof value !== "string") handleUseDuplicate(value);
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
                    <TextField
                      {...params}
                      onBlur={() => setName(capitalizeFullName(name))}
                      onKeyDown={submitOnEnter}
                      fullWidth
                      size="small"
                      autoFocus
                      disabled={submitting}
                      placeholder="Имя и фамилия — начните вводить, чтобы найти гостя"
                      {...v.field("name")}
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <InputAdornment position="start">
                            <PersonOutlineOutlined fontSize="small" color="disabled" />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <>
                            {name.trim() && (
                              <InputAdornment position="end">
                                <CheckCircleOutlined fontSize="small" color="success" />
                              </InputAdornment>
                            )}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />
              </Stack>
            </MotionBox>

            {/* ── Телефон ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Телефон
                </Typography>
                <TextField
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={submitOnEnter}
                  fullWidth
                  size="small"
                  disabled={submitting}
                  placeholder="+996 700 000 000"
                />
              </Stack>
            </MotionBox>

            {/* ── Документ ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={1.5}>
                <Divider />
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                  Документ
                </Typography>

                <ToggleButtonGroup
                  value={guestType}
                  exclusive
                  size="small"
                  disabled={submitting}
                  onChange={(_, value: GuestType | null) => value && setGuestType(value)}
                >
                  {(Object.keys(HOTEL_GUEST_TYPE_LABELS) as GuestType[]).map((key) => (
                    <ToggleButton key={key} value={key}>
                      {HOTEL_GUEST_TYPE_LABELS[key]}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>

                {guestType === "resident" ? (
                  <Stack direction="row" gap={2}>
                    <TextField
                      label="Паспорт (ID-карта)"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      size="small"
                      disabled={submitting}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="ИНН"
                      value={inn}
                      onChange={(e) => setInn(e.target.value)}
                      size="small"
                      disabled={submitting}
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                ) : (
                  <Stack gap={2}>
                    <Stack direction="row" gap={2}>
                      <TextField
                        label="Гражданство"
                        value={citizenship}
                        onChange={(e) => setCitizenship(e.target.value)}
                        size="small"
                        disabled={submitting}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        label="Номер загранпаспорта"
                        value={passportNumber}
                        onChange={(e) => setPassportNumber(e.target.value)}
                        size="small"
                        disabled={submitting}
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                    <Stack direction="row" gap={2}>
                      <TextField
                        label="Страна выдачи"
                        value={passportCountry}
                        onChange={(e) => setPassportCountry(e.target.value)}
                        size="small"
                        disabled={submitting}
                        sx={{ flex: 1 }}
                      />
                      <CustomDatePicker
                        label="Действителен до"
                        value={passportExpiry}
                        onChange={setPassportExpiry}
                        slotProps={{ textField: { size: "small", disabled: submitting } }}
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                  </Stack>
                )}

                {/* Имитация распознавания — реального OCR нет, см. simulatePassportScan. */}
                <Stack direction="row" alignItems="center" gap={1.5}>
                  <Button component="label" size="small" variant="outlined" startIcon={<UploadOutlined />} disabled={submitting}>
                    Фото паспорта
                    <input type="file" accept="image/*,application/pdf" hidden onChange={handlePickPassportPhoto} />
                  </Button>
                  {passportPhotoPreview && (
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Box
                        component="img"
                        src={passportPhotoPreview}
                        alt="Фото паспорта"
                        sx={{ width: 40, height: 40, borderRadius: "6px", objectFit: "cover" }}
                      />
                      <Button
                        size="small"
                        color="inherit"
                        disabled={submitting}
                        startIcon={<CloseOutlined fontSize="small" />}
                        onClick={() => {
                          if (passportPhotoPreview) URL.revokeObjectURL(passportPhotoPreview);
                          setPassportPhotoFile(null);
                          setPassportPhotoPreview(null);
                        }}
                      >
                        Убрать
                      </Button>
                    </Stack>
                  )}
                  {!passportPhotoPreview && passportPhotoFile && (
                    <Typography variant="caption" color="text.secondary">
                      {passportPhotoFile.name}
                    </Typography>
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
              </Stack>
            </MotionBox>

            {/* ── Источник ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Источник
                </Typography>
                <TextField
                  select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  fullWidth
                  size="small"
                  disabled={submitting}
                  helperText="Откуда пришёл гость — сайт, звонок, Booking.com и т.п."
                >
                  <MenuItem value="">Не указан</MenuItem>
                  {Object.entries(HOTEL_BOOKING_SOURCE_LABELS).map(([key, label]) => (
                    <MenuItem key={key} value={key}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            </MotionBox>

            {/* ── Чёрный список ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={1}>
                <Divider />
                <FormControlLabel
                  control={
                    <Switch
                      checked={isBlacklisted}
                      disabled={submitting}
                      onChange={(e) => {
                        setIsBlacklisted(e.target.checked);
                        if (!e.target.checked) setBlacklistReason("");
                      }}
                      color="error"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      В чёрном списке
                    </Typography>
                  }
                />
                <Collapse in={isBlacklisted}>
                  <TextField
                    value={blacklistReason}
                    onChange={(e) => setBlacklistReason(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                    disabled={submitting}
                    placeholder="Причина"
                    required={isBlacklisted}
                    {...v.field("blacklistReason")}
                  />
                </Collapse>
              </Stack>
            </MotionBox>
          </MotionStack>
        </Box>

        {/* footer */}
        <Box sx={{ borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
          <Collapse in={hasDuplicates}>
            <Box sx={{ px: 2, pt: 1.5 }}>
              <Alert severity="warning" icon={<WarningAmberOutlined fontSize="small" />} sx={{ py: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  С этим номером телефона уже есть {duplicates.length === 1 ? "гость" : "гости"} в базе
                </Typography>
                <Stack gap={0.5} sx={{ mt: 0.75 }}>
                  {duplicates.slice(0, 3).map((g) => (
                    <Stack key={g.clientId} direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                      <Typography variant="body2" noWrap>
                        {g.fullName} — {g.phone}
                      </Typography>
                      <Button size="small" onClick={() => handleUseDuplicate(g)} sx={{ flexShrink: 0 }}>
                        Использовать
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              </Alert>
            </Box>
          </Collapse>

          <Stack direction="row" gap={1} justifyContent="flex-end" sx={{ p: 2 }}>
            <Button onClick={handleClose} disabled={submitting}>
              Отмена
            </Button>
            <Button variant="contained" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? "Сохраняем…" : "Сохранить"}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Drawer>
  );
};

export default AddGuestDrawer;
