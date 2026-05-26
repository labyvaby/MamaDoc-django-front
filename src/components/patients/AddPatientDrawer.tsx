import React from "react";
import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
  CircularProgress,
  InputAdornment,
  FormControlLabel,
  Switch,
  Alert,
  Collapse,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { supabase } from "../../utility/supabaseClient";
import { useNotification } from "@refinedev/core";
import PatientPhotoUploader from "./PatientPhotoUploader";
import { uploadPatientPhoto } from "../../services/storage";
import { validateUUID } from "../../utility/validation";
import { PhoneCountryCodeSelect, CustomDatePicker } from "../ui";
import dayjs from "dayjs";
import {
  composePhone,
  parsePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  getPhoneLocalMaxLength,
  type PhoneCountryCode,
} from "../../utility/phone";
import { useHasRole } from "../../hooks/usePermissions";

const importMetaEnv =
  ((import.meta as unknown) as { env?: Record<string, string | undefined> })
    .env || {};
// Фиксируем таблицу и названия колонок (кириллица)
const PATIENT_WRITE_TABLE: string =
  importMetaEnv.VITE_PATIENTS_WRITE_TABLE || "Patients";
const PATIENT_FIO_COLUMN = "full_name";
const PHONE_COLUMN = "phone";
const BIRTH_COLUMN = "birth_date";
const BLACKLIST_COLUMN = "is_blacklisted";
const BLACKLIST_REASON_COLUMN = "blacklist_reason";

export type CreatedPatient = {
  id: string;
  fio: string;
  phone?: string | null;
  birth_date?: string | null;
  photo?: string | null;
  inn?: string | null;
  is_blacklisted?: boolean | null;
  blacklist_reason?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (p: CreatedPatient) => void;
  initialPhone?: string;
};

const fileDateToIso = (v: string) => (v ? String(v).slice(0, 10) : "");

const AddPatientDrawer: React.FC<Props> = ({ open, onClose, onCreated, initialPhone }) => {
  const { open: notify } = useNotification();
  const [fio, setFio] = React.useState("");
  const [phone, setPhone] = React.useState(""); // локальная часть без кода страны
  const [phoneCountryCode, setPhoneCountryCode] = React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [birth, setBirth] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [isBlacklisted, setIsBlacklisted] = React.useState(false);
  const [blacklistReason, setBlacklistReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [similarPatients, setSimilarPatients] = React.useState<{ id: string; full_name: string; phone?: string | null }[]>([]);
  const [confirmedDuplicate, setConfirmedDuplicate] = React.useState(false);

  const canManageBlacklist = useHasRole(['superadmin', 'admin', 'receptionist']);

  React.useEffect(() => {
    if (!open) {
      setFio("");
      setPhone("");
      setPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
      setBirth("");
      setInn("");
      setIsBlacklisted(false);
      setBlacklistReason("");
      setBusy(false);
      setPhotoFile(null);
      setPhotoPreview(null);
      setSimilarPatients([]);
      setConfirmedDuplicate(false);
    } else if (initialPhone) {
      const parsed = parsePhone(initialPhone);
      setPhone(parsed.local);
      setPhoneCountryCode(parsed.countryCode);
    }
  }, [open, initialPhone]);

  const handleSubmit = async () => {
    const fioTrim = fio.trim();
    if (!fioTrim) {
      notify?.({ type: "error", message: "Введите ФИО пациента" });
      return;
    }

    if (isBlacklisted && !blacklistReason.trim()) {
      notify?.({ type: "error", message: "Укажите причину добавления в черный список" });
      return;
    }

    try {
      setBusy(true);

      const fullPhone = composePhone(phoneCountryCode, phone);

      // Если выбрано фото — загружаем в storage и получаем public URL
      let photoUrl: string | null = null;
      if (photoFile) {
        try {
          const { publicUrl } = await uploadPatientPhoto(photoFile);
          photoUrl = publicUrl;
        } catch (e) {
          console.error(e);
          notify?.({ type: "error", message: "Не удалось загрузить фото" });
          // не прерываем создание пациента — поле фото останется пустым
        }
      }

      // Проверка на дубликат: поиск по телефону, предупреждение если найдены похожие
      if (fullPhone && !confirmedDuplicate) {
        const last9 = fullPhone.replace(/\D/g, '').slice(-9);
        const { data: existingPatients, error: searchError } = await supabase
          .from(PATIENT_WRITE_TABLE)
          .select("id, full_name, phone")
          .ilike("phone", `%${last9}`);

        if (existingPatients && !searchError && existingPatients.length > 0) {
          setSimilarPatients(existingPatients);
          setBusy(false);
          return;
        }
      }

      // Фиксированная схема: один запрос в фиксированную таблицу
      const payload: Record<string, unknown> = {
        [PATIENT_FIO_COLUMN]: fioTrim,
        [PHONE_COLUMN]: fullPhone,
        [BIRTH_COLUMN]: birth ? fileDateToIso(birth) : null,
        ["inn"]: inn ? inn.trim() : null,
        ["photo_url"]: photoUrl,
        [BLACKLIST_COLUMN]: isBlacklisted,
        [BLACKLIST_REASON_COLUMN]: isBlacklisted ? blacklistReason.trim() : null,
      };

      const { data, error } = await supabase
        .schema("public")
        .from(PATIENT_WRITE_TABLE)
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new Error("Не удалось получить данные после вставки.");

      // Извлекаем ID с учетом разных вариантов именования колонок
      const rawId = data["ID"] ?? data["id"] ?? data["Id"] ?? data["patient_id"] ?? "";
      const insertedId = String(rawId).trim();

      // Проверяем, что ID - это корректный UUID
      try {
        validateUUID(insertedId, "ID пациента");
      } catch (e) {
        console.error("UUID validation failed:", e);
        throw e;
      }

      const created: CreatedPatient = {
        id: insertedId,
        fio: fioTrim,
        phone: fullPhone,
        birth_date: birth ? fileDateToIso(birth) : null,
        photo: photoUrl,
        inn: inn ? inn.trim() : null,
        is_blacklisted: isBlacklisted,
        blacklist_reason: isBlacklisted ? blacklistReason.trim() : null,
      };

      onCreated?.(created);
      notify?.({ type: "success", message: "Пациент добавлен" });
      onClose();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      notify?.({ type: "error", message: "Не удалось добавить пациента" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: 320, sm: 480, md: 520 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Box sx={{ width: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1 }}>
          <Typography variant="h6">Добавить пациента</Typography>
          <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
        </Box>
        <Divider />
        <Box
          sx={{
            p: 2,
            flex: 1,
            overflowY: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
          }}
        >
          <Stack spacing={3}>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Фото пациента
              </Typography>
              <PatientPhotoUploader
                photoFile={photoFile}
                photoPreview={photoPreview}
                onPickPhoto={(f) => {
                  setPhotoFile(f);
                  if (photoPreview) URL.revokeObjectURL(photoPreview);
                  setPhotoPreview(f ? URL.createObjectURL(f) : null);
                }}
              />
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                ФИО
              </Typography>
              <TextField
                value={fio}
                onChange={(e) => setFio(e.target.value)}
                fullWidth
                autoFocus
                placeholder="Введите ФИО пациента"
              />
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Телефон
              </Typography>
              <TextField
                value={phone}
                onChange={(e) => {
                  const maxLen = getPhoneLocalMaxLength(phoneCountryCode);
                  setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, maxLen));
                }}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start" sx={{ mr: 1, ml: '-14px' }}>
                      <PhoneCountryCodeSelect
                        value={phoneCountryCode}
                        onChange={(code) => {
                          setPhoneCountryCode(code);
                        }}
                      />
                    </InputAdornment>
                  ),
                }}
                inputProps={{ inputMode: "tel", pattern: "[0-9]*", maxLength: getPhoneLocalMaxLength(phoneCountryCode) }}
                placeholder={getPhoneLocalMaxLength(phoneCountryCode) === 10 ? "XXX XXX XXXX" : "XXX XXX XXX"}
              />
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Дата рождения
              </Typography>
              <CustomDatePicker
                value={birth ? dayjs(birth) : null}
                onChange={(val) => setBirth(val ? val.format('YYYY-MM-DD') : '')}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    InputLabelProps: { shrink: true },
                    placeholder: "дд.мм.гггг"
                  }
                }}
              />
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                ИНН
              </Typography>
              <TextField
                value={inn}
                onChange={(e) => setInn(e.target.value.replace(/[^\d]/g, "").slice(0, 14))}
                fullWidth
                placeholder="14 цифр"
                inputProps={{ inputMode: "numeric", pattern: "[0-9]*", maxLength: 14 }}
              />
            </Stack>

            {canManageBlacklist && (
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={isBlacklisted}
                      onChange={(e) => setIsBlacklisted(e.target.checked)}
                      color="error"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 600, color: isBlacklisted ? "error.main" : "text.primary" }}>
                      В черном списке
                    </Typography>
                  }
                />
                {isBlacklisted && (
                  <TextField
                    label="Причина"
                    multiline
                    minRows={2}
                    fullWidth
                    value={blacklistReason}
                    onChange={(e) => setBlacklistReason(e.target.value)}
                    placeholder="Опишите причину добавления в ЧС..."
                    error={!blacklistReason.trim()}
                    helperText={!blacklistReason.trim() ? "Обязательное поле" : ""}
                    sx={{ mt: 1 }}
                  />
                )}
              </Box>
            )}
          </Stack>
        </Box>



        <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Collapse in={similarPatients.length > 0 && !confirmedDuplicate}>
            <Box sx={{ px: 2, pt: 2 }}>
              <Alert
                severity="warning"
                onClose={() => setSimilarPatients([])}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Найдены пациенты с таким номером телефона:
                </Typography>
                {similarPatients.map((p) => (
                  <Typography key={p.id} variant="body2">
                    · {p.full_name}{p.phone ? ` (${p.phone})` : ""}
                  </Typography>
                ))}
                <Button
                  size="small"
                  sx={{ mt: 1 }}
                  onClick={() => {
                    setConfirmedDuplicate(true);
                    setSimilarPatients([]);
                  }}
                >
                  Всё равно создать нового
                </Button>
              </Alert>
            </Box>
          </Collapse>
          <Stack direction="row" gap={1} justifyContent="flex-end" sx={{ p: 2 }}>
            <Button onClick={onClose} disabled={busy}>
              Отмена
            </Button>
            <Button variant="contained" onClick={handleSubmit} disabled={busy || !fio.trim()}>
              {busy ? (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={18} />
                  <span>Сохранение…</span>
                </Stack>
              ) : (
                "Сохранить"
              )}
            </Button>
          </Stack>
        </Box>
      </Box >
    </Drawer >
  );
};

export default AddPatientDrawer;
