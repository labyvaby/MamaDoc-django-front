import React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import { useNotification } from "@refinedev/core";
import { CustomDatePicker } from "../ui";
import dayjs from "dayjs";
import {
  composePhone,
  parsePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  getPhoneLocalMaxLength,
  type PhoneCountryCode,
} from "../../utility/phone";
import { PhoneCountryCodeSelect } from "../ui";
import { useCan } from "../../hooks/useCan";
import {
  updatePatient,
  uploadPatientPhoto,
  deletePatientPhoto,
  getPatient,
  type DjangoPatient,
} from "../../api/patients";
import { parseBackendError } from "../../api/appointments";
import PatientPhotoUploader from "./PatientPhotoUploader";

type Props = {
  open: boolean;
  patient: DjangoPatient | null;
  onClose: () => void;
  onUpdated: (p: DjangoPatient) => void;
};

const DjangoEditPatientDrawer: React.FC<Props> = ({
  open,
  patient,
  onClose,
  onUpdated,
}) => {
  const { open: notify } = useNotification();
  const canManageBlacklist = useCan("patients.manage");

  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = React.useState(false);
  const [fio, setFio] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [phoneCountryCode, setPhoneCountryCode] =
    React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [birth, setBirth] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [isBlacklisted, setIsBlacklisted] = React.useState(false);
  const [blacklistReason, setBlacklistReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !patient) return;
    setPhotoFile(null);
    setPhotoPreview(patient.photoUrl || null);
    setRemovePhoto(false);
    setFio(patient.fullName || "");
    const parsed = parsePhone(patient.phone || "");
    setPhoneCountryCode(parsed.countryCode);
    const maxLen = getPhoneLocalMaxLength(parsed.countryCode);
    setPhone(parsed.local.replace(/[^\d]/g, "").slice(0, maxLen));
    setBirth(patient.birthDate || "");
    setInn(patient.inn || "");
    setIsBlacklisted(patient.isBlacklisted || false);
    setBlacklistReason(patient.blacklistReason || "");
    setTouched(false);
    setError(null);
  }, [open, patient]);

  const handlePickPhoto = React.useCallback((f: File | null) => {
    setRemovePhoto(false);
    setPhotoFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(f);
    } else {
      setPhotoPreview(patient?.photoUrl || null);
    }
  }, [patient?.photoUrl]);

  const handleRemovePhoto = () => {
    setRemovePhoto(true);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleSubmit = async () => {
    setTouched(true);
    const fioTrim = fio.trim();
    if (!fioTrim) {
      notify?.({ type: "error", message: "Введите ФИО пациента" });
      return;
    }
    if (isBlacklisted && !blacklistReason.trim()) {
      notify?.({ type: "error", message: "Укажите причину добавления в чёрный список" });
      return;
    }
    if (!patient) return;

    setBusy(true);
    setError(null);
    try {
      const fullPhone = composePhone(phoneCountryCode, phone) ?? "";
      await updatePatient(patient.id, {
        fullName: fioTrim,
        phone: fullPhone || undefined,
        birthDate: birth || null,
        inn: inn.trim() || undefined,
        isBlacklisted: canManageBlacklist ? isBlacklisted : undefined,
        blacklistReason:
          canManageBlacklist && isBlacklisted ? blacklistReason.trim() : undefined,
      });

      // photo operations
      if (removePhoto && !photoFile) {
        try {
          await deletePatientPhoto(patient.id);
        } catch {
          // non-fatal
        }
      } else if (photoFile) {
        try {
          await uploadPatientPhoto(patient.id, photoFile);
        } catch {
          notify?.({ type: "error", message: "Данные сохранены, но фото не удалось загрузить" });
        }
      }

      // fetch fresh to get updated photoUrl
      const fresh = await getPatient(patient.id);
      notify?.({ type: "success", message: "Изменения сохранены" });
      onUpdated(fresh);
      onClose();
    } catch (err: unknown) {
      const msg = parseBackendError(err);
      setError(msg);
      notify?.({ type: "error", message: msg });
    } finally {
      setBusy(false);
    }
  };

  const existingPhoto = patient?.photoUrl || null;
  const showDeletePhotoBtn =
    (existingPhoto || photoPreview) && !photoFile && !removePhoto;

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
      <Box
        sx={{
          width: 1,
          minWidth: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1,
          }}
        >
          <Typography variant="h6">Редактировать пациента</Typography>
          <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
        </Box>
        <Divider />

        {/* body */}
        <Box
          sx={{
            p: 2,
            flex: 1,
            overflowY: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <Stack spacing={3}>
            {error && (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            )}

            {/* ── Фото ── */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Фото пациента
              </Typography>
              <PatientPhotoUploader
                photoFile={photoFile}
                photoPreview={photoPreview}
                onPickPhoto={handlePickPhoto}
                inputId="edit-patient-photo"
              />
              {showDeletePhotoBtn && (
                <Button
                  variant="text"
                  color="error"
                  size="small"
                  startIcon={<DeleteOutline />}
                  onClick={handleRemovePhoto}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Удалить фото
                </Button>
              )}
            </Stack>

            {/* ── ФИО ── */}
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
                disabled={busy}
                error={touched && !fio.trim()}
                helperText={touched && !fio.trim() ? "Обязательное поле" : undefined}
              />
            </Stack>

            {/* ── Телефон ── */}
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
                disabled={busy}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start" sx={{ mr: 1, ml: "-14px" }}>
                      <PhoneCountryCodeSelect
                        value={phoneCountryCode}
                        onChange={(code) => setPhoneCountryCode(code)}
                      />
                    </InputAdornment>
                  ),
                }}
                inputProps={{
                  inputMode: "tel",
                  pattern: "[0-9]*",
                  maxLength: getPhoneLocalMaxLength(phoneCountryCode),
                }}
                placeholder={
                  getPhoneLocalMaxLength(phoneCountryCode) === 10
                    ? "XXX XXX XXXX"
                    : "XXX XXX XXX"
                }
              />
            </Stack>

            {/* ── Дата рождения ── */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Дата рождения
              </Typography>
              <CustomDatePicker
                value={birth ? dayjs(birth) : null}
                onChange={(val) => setBirth(val ? val.format("YYYY-MM-DD") : "")}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    InputLabelProps: { shrink: true },
                    placeholder: "дд.мм.гггг",
                    disabled: busy,
                  },
                }}
              />
            </Stack>

            {/* ── ИНН ── */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                ИНН
              </Typography>
              <TextField
                value={inn}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 14);
                  setInn(v);
                }}
                fullWidth
                placeholder="000000000000"
                disabled={busy}
                inputProps={{ inputMode: "numeric" }}
                helperText={`${inn.length}/14`}
              />
            </Stack>

            {/* ── Чёрный список ── */}
            {canManageBlacklist && (
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
                      disabled={busy}
                      color="error"
                    />
                  }
                  label={
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: isBlacklisted ? "error.main" : "text.primary",
                      }}
                    >
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
                    placeholder="Опишите причину..."
                    disabled={busy}
                    required={isBlacklisted}
                    error={isBlacklisted && !blacklistReason.trim()}
                    helperText={
                      isBlacklisted && !blacklistReason.trim()
                        ? "Обязательное поле"
                        : undefined
                    }
                  />
                </Collapse>
              </Stack>
            )}
          </Stack>
        </Box>

        {/* footer */}
        <Box
          sx={{ borderTop: 1, borderColor: "divider", bgcolor: "background.paper", p: 2 }}
        >
          <Stack direction="row" gap={1} justifyContent="flex-end">
            <Button onClick={onClose} disabled={busy}>
              Отмена
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={busy || !fio.trim()}
            >
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
    </Drawer>
  );
};

export default DjangoEditPatientDrawer;
