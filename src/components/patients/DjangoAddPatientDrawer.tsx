/**
 * DjangoAddPatientDrawer
 *
 * Django-API version of AddPatientDrawer.
 * Fields: photo, ФИО, phone, birth date, ИНН, blacklist (role-gated).
 * Duplicate warning Collapse in footer.
 * No Supabase calls.
 */

import React from "react";
import {
  Alert,
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
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
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
  createPatient,
  uploadPatientPhoto,
  type DjangoPatient,
} from "../../api/patients";
import { parseBackendError } from "../../api/appointments";
import PatientPhotoUploader from "./PatientPhotoUploader";

// ── types ─────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (p: DjangoPatient) => void;
  initialPhone?: string;
  branchId?: number | null;
};

// ── component ─────────────────────────────────────────────────────────────────

const DjangoAddPatientDrawer: React.FC<Props> = ({
  open,
  onClose,
  onCreated,
  initialPhone,
  branchId,
}) => {
  const { open: notify } = useNotification();
  const canManageBlacklist = useCan("patients.manage");

  // ── fields ─────────────────────────────────────────────────────────────────
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [fio, setFio] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [phoneCountryCode, setPhoneCountryCode] =
    React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [birth, setBirth] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [isBlacklisted, setIsBlacklisted] = React.useState(false);
  const [blacklistReason, setBlacklistReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [duplicates, setDuplicates] = React.useState<DjangoPatient[]>([]);

  // ── pick photo ─────────────────────────────────────────────────────────────
  const handlePickPhoto = React.useCallback((f: File | null) => {
    setPhotoFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(f);
    } else {
      setPhotoPreview(null);
    }
  }, []);

  // ── reset ─────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setPhotoFile(null);
      setPhotoPreview(null);
      setFio("");
      setPhone("");
      setPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
      setBirth("");
      setInn("");
      setIsBlacklisted(false);
      setBlacklistReason("");
      setBusy(false);
      setError(null);
      setDuplicates([]);
      return;
    }
    if (initialPhone) {
      const parsed = parsePhone(initialPhone);
      setPhone(parsed.local);
      setPhoneCountryCode(parsed.countryCode);
    }
  }, [open, initialPhone]);

  // ── duplicate check on phone ───────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) return;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) {
      setDuplicates([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const { getSimilarPatients } = await import("../../api/patients");
        const fullPhone = composePhone(phoneCountryCode, phone) ?? "";
        const list = await getSimilarPatients(fullPhone, ctrl.signal);
        if (!ctrl.signal.aborted) setDuplicates(list);
      } catch {
        // ignore
      }
    }, 500);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [phone, phoneCountryCode, open]);

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const fioTrim = fio.trim();
    if (!fioTrim) {
      notify?.({ type: "error", message: "Введите ФИО пациента" });
      return;
    }
    if (isBlacklisted && !blacklistReason.trim()) {
      notify?.({ type: "error", message: "Укажите причину добавления в чёрный список" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fullPhone = composePhone(phoneCountryCode, phone) ?? "";
      const patient = await createPatient({
        fullName: fioTrim,
        phone: fullPhone,
        birthDate: birth || null,
        branchId: branchId ?? null,
        inn: inn.trim() || undefined,
        isBlacklisted: canManageBlacklist ? isBlacklisted : undefined,
        blacklistReason: canManageBlacklist && isBlacklisted ? blacklistReason.trim() : undefined,
      });

      if (photoFile) {
        try {
          await uploadPatientPhoto(patient.id, photoFile);
        } catch {
          notify?.({
            type: "error",
            message: "Пациент добавлен, но фото не удалось загрузить",
          });
        }
      }

      notify?.({ type: "success", message: "Пациент добавлен" });
      onCreated?.(patient);
      onClose();
    } catch (err: unknown) {
      const msg = parseBackendError(err);
      setError(msg);
      notify?.({ type: "error", message: msg });
    } finally {
      setBusy(false);
    }
  };

  const hasDuplicates = duplicates.length > 0;

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
          <Typography variant="h6">Добавить пациента</Typography>
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
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* ── Фото ── */}
            <PatientPhotoUploader
              photoFile={photoFile}
              photoPreview={photoPreview}
              onPickPhoto={handlePickPhoto}
              inputId="add-patient-photo"
            />

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

            {/* ── Чёрный список (role-gated) ── */}
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
                    placeholder="Укажите причину"
                    disabled={busy}
                    required={isBlacklisted}
                    error={isBlacklisted && !blacklistReason.trim()}
                    helperText={
                      isBlacklisted && !blacklistReason.trim()
                        ? "Обязательно для чёрного списка"
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
          sx={{ borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}
        >
          {/* duplicate warning */}
          <Collapse in={hasDuplicates}>
            <Box sx={{ px: 2, pt: 1.5 }}>
              <Alert
                severity="warning"
                icon={<WarningAmberOutlined fontSize="small" />}
                sx={{ py: 0.5 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Возможный дубль
                </Typography>
                {duplicates.slice(0, 3).map((d) => (
                  <Typography key={d.id} variant="body2">
                    {d.fullName}
                    {d.birthDate ? ` · ${dayjs(d.birthDate).format("DD.MM.YYYY")}` : ""}
                  </Typography>
                ))}
              </Alert>
            </Box>
          </Collapse>

          <Stack direction="row" gap={1} justifyContent="flex-end" sx={{ p: 2 }}>
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

export default DjangoAddPatientDrawer;
