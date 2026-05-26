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
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import { supabase } from "../../utility/supabaseClient";
import { useNotification } from "@refinedev/core";
import PatientPhotoUploader from "./PatientPhotoUploader";
import { uploadPatientPhoto, deletePatientPhotoByUrl } from "../../services/storage";
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
const PHOTO_COLUMN = "photo_url";
const BLACKLIST_COLUMN = "is_blacklisted";
const BLACKLIST_REASON_COLUMN = "blacklist_reason";

export type UpdatedPatient = {
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
  patientId: string | null;
  initialPhoto?: string | null;
  onClose: () => void;
  onUpdated?: (p: UpdatedPatient) => void;
};

const fileDateToIso = (v: string) => (v ? String(v).slice(0, 10) : "");

const EditPatientDrawer: React.FC<Props> = ({
  open,
  onClose,
  patientId,
  initialPhoto,
  onUpdated,
}) => {
  const { open: notify } = useNotification();
  const [fio, setFio] = React.useState("");
  const [phone, setPhone] = React.useState(""); // локальная часть без кода страны
  const [phoneCountryCode, setPhoneCountryCode] = React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [birth, setBirth] = React.useState(""); // YYYY-MM-DD
  const [inn, setInn] = React.useState("");
  const [isBlacklisted, setIsBlacklisted] = React.useState(false);
  const [blacklistReason, setBlacklistReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  const canManageBlacklist = useHasRole(['superadmin', 'admin', 'receptionist', 'registrator']);

  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = React.useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = React.useState(false);

  // Загружаем текущие данные пациента при открытии
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !patientId) return;
      setBusy(true);
      try {
        const { data, error } = await supabase
          .from(PATIENT_WRITE_TABLE)
          .select("*")
          .eq("id", patientId)
          .single();
        if (error) throw error;
        if (cancelled) return;

        const fioVal =
          (data?.["full_name"] as string) ?? (data?.[PATIENT_FIO_COLUMN] as string) ?? "";
        const phoneRaw = (data?.[PHONE_COLUMN] as string) ?? "";
        const birthRaw = (data?.[BIRTH_COLUMN] as string) ?? "";
        const photoRaw = (data?.[PHOTO_COLUMN] as string) ?? initialPhoto ?? null;
        const innRaw = (data?.["inn"] as string) ?? (data?.["ИНН"] as string) ?? "";
        const blacklistRaw = (data?.[BLACKLIST_COLUMN] as boolean) ?? false;
        const reasonRaw = (data?.[BLACKLIST_REASON_COLUMN] as string) ?? "";

        setFio(fioVal || "");
        const parsed = parsePhone(phoneRaw);
        setPhoneCountryCode(parsed.countryCode);
        const maxLen = getPhoneLocalMaxLength(parsed.countryCode);
        setPhone(parsed.local.replace(/[^\d]/g, "").slice(0, maxLen));
        setBirth(birthRaw ? fileDateToIso(String(birthRaw)) : "");
        setInn(innRaw || "");
        setIsBlacklisted(blacklistRaw);
        setBlacklistReason(reasonRaw);
        setExistingPhoto(photoRaw);
        setPhotoPreview(photoRaw || null);
        setPhotoFile(null);
        setRemovePhoto(false);
        setTouched(false);
      } catch (e) {
        console.error(e);
        notify?.({ type: "error", message: "Не удалось загрузить данные пациента" });
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, patientId, initialPhoto, notify]);

  const handleSubmit = async () => {
    setTouched(true);
    const fioTrim = fio.trim();
    if (!fioTrim) {
      notify?.({ type: "error", message: "Введите ФИО пациента" });
      return;
    }

    if (isBlacklisted && !blacklistReason.trim()) {
      notify?.({ type: "error", message: "Укажите причину добавления в черный список" });
      return;
    }

    if (!patientId) return;
    try {
      setBusy(true);

      const fullPhone = composePhone(phoneCountryCode, phone);

      let newPhotoUrl: string | null = existingPhoto || null;

      // Управление фото: удаление или замена
      if (removePhoto && !photoFile) {
        // удалить текущее фото
        if (existingPhoto) {
          try {
            await deletePatientPhotoByUrl(existingPhoto);
          } catch (e) {
            // ignore non-fatal delete errors
            console.warn("Failed to delete previous patient photo", e);
          }
        }
        newPhotoUrl = null;
      } else if (photoFile) {
        // заменить фотку
        try {
          const { publicUrl } = await uploadPatientPhoto(photoFile);
          if (existingPhoto) {
            try {
              await deletePatientPhotoByUrl(existingPhoto);
            } catch (e) {
              // ignore non-fatal delete errors
              console.warn("Failed to delete previous patient photo", e);
            }
          }
          newPhotoUrl = publicUrl;
        } catch (e) {
          console.error(e);
          notify?.({ type: "error", message: "Не удалось загрузить фото" });
        }
      }

      const payload: Record<string, unknown> = {
        [PATIENT_FIO_COLUMN]: fioTrim,
        [PHONE_COLUMN]: fullPhone,
        [BIRTH_COLUMN]: birth ? fileDateToIso(birth) : null,
        [PHOTO_COLUMN]: newPhotoUrl,
        ["inn"]: inn ? inn.trim() : null,
        [BLACKLIST_COLUMN]: isBlacklisted,
        [BLACKLIST_REASON_COLUMN]: isBlacklisted ? blacklistReason.trim() : null,
      };

      const { data, error } = await supabase
        .schema("public")
        .from(PATIENT_WRITE_TABLE)
        .update(payload)
        .eq("id", patientId)
        .select("*")
        .single();

      if (error) throw error;

      const updated: UpdatedPatient = {
        id: String(data["ID"] ?? data["id"] ?? patientId),
        fio: fioTrim,
        phone: fullPhone,
        birth_date: birth ? fileDateToIso(birth) : null,
        photo: newPhotoUrl,
        inn: inn ? inn.trim() : null,
        is_blacklisted: isBlacklisted,
        blacklist_reason: isBlacklisted ? blacklistReason.trim() : null,
      };

      onUpdated?.(updated);
      notify?.({ type: "success", message: "Изменения сохранены" });
      onClose();
    } catch (e) {
      console.error(e);
      notify?.({ type: "error", message: "Не удалось сохранить изменения" });
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
          <Typography variant="h6">Редактировать пациента</Typography>
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
                  setRemovePhoto(false);
                  setPhotoFile(f);
                  if (photoPreview) URL.revokeObjectURL(photoPreview);
                  setPhotoPreview(f ? URL.createObjectURL(f) : existingPhoto);
                }}
              />
              {(existingPhoto || photoPreview) && !photoFile && (
                <Button
                  variant="text"
                  color="error"
                  size="small"
                  startIcon={<DeleteOutline />}
                  onClick={() => {
                    setRemovePhoto(true);
                    setPhotoFile(null);
                    if (photoPreview) URL.revokeObjectURL(photoPreview);
                    setPhotoPreview(null);
                  }}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Удалить фото
                </Button>
              )}
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                ФИО *
              </Typography>
              <TextField
                value={fio}
                onChange={(e) => setFio(e.target.value)}
                fullWidth
                autoFocus
                placeholder="Введите ФИО пациента"
                error={touched && !fio.trim()}
                helperText={touched && !fio.trim() ? "Обязательное поле" : ""}
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
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Stack direction="row" gap={1} justifyContent="flex-end">
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
      </Box>

    </Drawer >
  );
};

export default EditPatientDrawer;
