/**
 * AddGuestDrawer — «Добавить» на «Гостях» (HotelGuestsPage.tsx). Та же форма
 * и логика, что у реального DjangoAddPatientDrawer.tsx: фото первым полем
 * (PatientPhotoUploader — общий компонент, не копия), ФИО+телефон, черновик
 * в localStorage переживает случайное закрытие (крестик/фон/Esc) — не
 * confirm-диалог, как у CreateBookingButton/DjangoAddAppointmentDrawer, это
 * сознательно другой паттерн именно у формы добавления пациента/гостя,
 * восстановленный черновик можно стереть иконкой RestoreOutlined в шапке.
 * Предупреждение о дубле по телефону — в подвале, Collapse над кнопками,
 * как у пациента; список найденных дублей и подписи — в стиле, уже принятом
 * в CreateBookingButton (Alert + «Использовать»), а не аватарки пациента.
 *
 * Гость заводится независимо от брони (addCustomGuest в mockDemoData.ts) —
 * тот же принцип, что пациент независимо от приёма. Документ — только
 * реквизиты личности (гражданство/паспорт), не то, что относится к
 * конкретному заезду (цель визита, источник брони — эти остаются полями
 * брони в CreateBookingButton).
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
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
import { motion } from "framer-motion";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker, cascadeContainer, cascadeItem } from "../components/ui";
import PatientPhotoUploader from "../components/patients/PatientPhotoUploader";
import { usePermissions } from "../hooks/usePermissions";
import { useFormValidation } from "../hooks/useFormValidation";
import { capitalizeFullName } from "../utility/name";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../utility/formDraft";
import {
  addCustomGuest,
  findGuestsByPhone,
  setGuestBlacklisted,
  GUEST_TYPE_LABELS,
  type GuestType,
  type HotelGuestProfile,
  type HotelGuestSummary,
} from "./mockDemoData";

const MotionStack = motion(Stack);
const MotionBox = motion(Box);

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

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
    !d.isBlacklisted &&
    !d.blacklistReason.trim()
  );
}

export interface AddGuestDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (name: string) => void;
}

export const AddGuestDrawer: React.FC<AddGuestDrawerProps> = ({ open, onClose, onCreated }) => {
  const { employee } = usePermissions();

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
  const [isBlacklisted, setIsBlacklisted] = React.useState(false);
  const [blacklistReason, setBlacklistReason] = React.useState("");
  const [draftRestored, setDraftRestored] = React.useState(false);

  const handlePickPhoto = (file: File | null) => {
    setPhotoFile(file);
    setPhotoError(null);
    if (!file) {
      setPhotoPreview(null);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("Файл больше 3 МБ — многовато для демо-хранилища (localStorage)");
      setPhotoFile(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  // ── reset / восстановление черновика при открытии ──────────────────────
  React.useEffect(() => {
    if (!open) {
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoError(null);
      setName("");
      setPhone("");
      setGuestType("resident");
      setIdNumber("");
      setInn("");
      setCitizenship("");
      setPassportNumber("");
      setPassportCountry("");
      setPassportExpiry(null);
      setIsBlacklisted(false);
      setBlacklistReason("");
      setDraftRestored(false);
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
      setIsBlacklisted(draft.isBlacklisted);
      setBlacklistReason(draft.blacklistReason);
      setDraftRestored(true);
    }
  }, [open]);

  // ── сохранение черновика (защита от случайного закрытия) — фото не
  // сохраняем: File не сериализуется, а base64-превью может быть тяжёлым.
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
  }, [open, name, phone, guestType, idNumber, inn, citizenship, passportNumber, passportCountry, passportExpiry, isBlacklisted, blacklistReason]);

  const handleClose = () => {
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
    setIsBlacklisted(false);
    setBlacklistReason("");
    setDraftRestored(false);
  };

  // ── дубли по телефону — тот же локальный приём, что в CreateBookingButton ──
  const duplicates = React.useMemo<HotelGuestSummary[]>(
    () => (open ? findGuestsByPhone(phone, name.trim() || undefined) : []),
    [open, phone, name],
  );

  const handleUseDuplicate = (guest: HotelGuestSummary) => {
    clearGuestDraft();
    onCreated?.(guest.name);
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

  const handleSubmit = () => {
    if (!v.validate()) return;
    const nameTrim = capitalizeFullName(name);
    const profile: HotelGuestProfile = {
      name: nameTrim,
      phone: phone.trim(),
      photoDataUrl: photoPreview ?? undefined,
      guestType,
      idNumber: idNumber.trim() || undefined,
      inn: inn.trim() || undefined,
      citizenship: citizenship.trim() || undefined,
      passportNumber: passportNumber.trim() || undefined,
      passportCountry: passportCountry.trim() || undefined,
      passportExpiry: passportExpiry ? passportExpiry.format("YYYY-MM-DD") : undefined,
      createdBy: employee?.fullName || undefined,
      createdAt: dayjs().toISOString(),
    };
    addCustomGuest(profile);
    if (isBlacklisted) setGuestBlacklisted(nameTrim, true, blacklistReason);
    clearGuestDraft();
    onCreated?.(nameTrim);
    onClose();
  };

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
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
            {/* ── Фото ── */}
            <MotionBox variants={cascadeItem}>
              <PatientPhotoUploader
                photoFile={photoFile}
                photoPreview={photoPreview}
                onPickPhoto={handlePickPhoto}
                inputId="add-guest-photo"
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
                <TextField
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setName(capitalizeFullName(name))}
                  onKeyDown={submitOnEnter}
                  fullWidth
                  size="small"
                  autoFocus
                  placeholder="Имя и фамилия"
                  {...v.field("name")}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonOutlineOutlined fontSize="small" color="disabled" />
                      </InputAdornment>
                    ),
                    endAdornment: name.trim() ? (
                      <InputAdornment position="end">
                        <CheckCircleOutlined fontSize="small" color="success" />
                      </InputAdornment>
                    ) : undefined,
                  }}
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
                      size="small"
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="ИНН"
                      value={inn}
                      onChange={(e) => setInn(e.target.value)}
                      size="small"
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
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        label="Номер загранпаспорта"
                        value={passportNumber}
                        onChange={(e) => setPassportNumber(e.target.value)}
                        size="small"
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                    <Stack direction="row" gap={2}>
                      <TextField
                        label="Страна выдачи"
                        value={passportCountry}
                        onChange={(e) => setPassportCountry(e.target.value)}
                        size="small"
                        sx={{ flex: 1 }}
                      />
                      <CustomDatePicker
                        label="Действителен до"
                        value={passportExpiry}
                        onChange={setPassportExpiry}
                        slotProps={{ textField: { size: "small" } }}
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                  </Stack>
                )}
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
                    <Stack key={g.name} direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                      <Typography variant="body2" noWrap>
                        {g.name} — {g.phone}
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
            <Button onClick={handleClose}>Отмена</Button>
            <Button variant="contained" onClick={handleSubmit}>
              Сохранить
            </Button>
          </Stack>
        </Box>
      </Box>
    </Drawer>
  );
};

export default AddGuestDrawer;
