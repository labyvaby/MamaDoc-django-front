/**
 * AddPatientDrawer (Django-mode)
 *
 * Creates a patient via Django REST API.
 * Visual UX matches the original Supabase version.
 * No Supabase calls.
 */

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
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
  Alert,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import { useNotification } from "@refinedev/core";
import { CustomDatePicker } from "../ui";
import dayjs from "dayjs";
import {
  composePhone,
  isPhoneLocalComplete,
  parsePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  getPhoneLocalMaxLength,
  handlePhonePaste,
  type PhoneCountryCode,
} from "../../utility/phone";
import { PhoneCountryCodeSelect } from "../ui";
import { useHasRole } from "../../hooks/usePermissions";
import { createPatient, type DjangoPatient } from "../../api/patients";
import { parseBackendError } from "../../api/appointments";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { orgWide } from "../../api/scope";

export type CreatedPatient = {
  id: string;
  fio: string;
  phone?: string | null;
  birth_date?: string | null;
  photo?: string | null;
  is_blacklisted?: boolean | null;
  blacklist_reason?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (p: CreatedPatient) => void;
  initialPhone?: string;
};

const AddPatientDrawer: React.FC<Props> = ({ open, onClose, onCreated, initialPhone }) => {
  const { open: notify } = useNotification();
  const orgId = useApiOrgId();

  const [fio, setFio] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [phoneCountryCode, setPhoneCountryCode] =
    React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [birth, setBirth] = React.useState("");
  const [gender, setGender] = React.useState<"male" | "female" | "unknown">("unknown");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [duplicates, setDuplicates] = React.useState<DjangoPatient[]>([]);
  const [duplicateCheckError, setDuplicateCheckError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setFio("");
      setPhone("");
      setPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
      setBirth("");
      setGender("unknown");
      setNotes("");
      setBusy(false);
      setSaveError(null);
      setDuplicates([]);
      setDuplicateCheckError(null);
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
    // Ждём полностью набранный номер: по префиксу бэк находит всех, у кого
    // совпало начало, и форма показывала их как дубли, хотя это разные люди.
    if (!isPhoneLocalComplete(phoneCountryCode, phone)) {
      setDuplicates([]);
      setDuplicateCheckError(null);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const { getSimilarPatients } = await import("../../api/patients");
        const fullPhone = composePhone(phoneCountryCode, phone) ?? "";
        const list = await getSimilarPatients(fullPhone, ctrl.signal, orgWide(orgId));
        if (!ctrl.signal.aborted) {
          setDuplicates(list);
          setDuplicateCheckError(null);
        }
      } catch {
        if (!ctrl.signal.aborted) {
          setDuplicates([]);
          setDuplicateCheckError("Не удалось проверить дубли");
        }
      }
    }, 500);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [phone, phoneCountryCode, open, orgId]);

  const handleUseDuplicate = (patient: DjangoPatient) => {
    onCreated?.({
      id: String(patient.id),
      fio: patient.fullName,
      phone: patient.phone,
      birth_date: patient.birthDate,
      photo: null,
      is_blacklisted: null,
      blacklist_reason: null,
    });
    onClose();
  };

  const hasDuplicates = duplicates.length > 0;

  const handleSubmit = async () => {
    const fioTrim = fio.trim();
    if (!fioTrim) {
      notify?.({ type: "error", message: "Введите ФИО пациента" });
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      const fullPhone = composePhone(phoneCountryCode, phone) ?? "";
      const patient: DjangoPatient = await createPatient({
        fullName: fioTrim,
        phone: fullPhone,
        birthDate: birth || null,
        gender,
        notes: notes.trim() || null,
      });
      notify?.({ type: "success", message: "Пациент добавлен" });
      onCreated?.({
        id: String(patient.id),
        fio: patient.fullName,
        phone: patient.phone,
        birth_date: patient.birthDate,
        photo: null,
        is_blacklisted: null,
        blacklist_reason: null,
      });
      onClose();
    } catch (err: unknown) {
      const msg = parseBackendError(err);
      setSaveError(msg);
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
            overflowY: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <Stack spacing={3}>
            {saveError && (
              <Alert severity="error" onClose={() => setSaveError(null)}>
                {saveError}
              </Alert>
            )}

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
                onPaste={(e) =>
                  handlePhonePaste(e, phoneCountryCode, (code, local) => {
                    setPhoneCountryCode(code);
                    setPhone(local);
                  })
                }
                fullWidth
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
                  getPhoneLocalMaxLength(phoneCountryCode) === 10 ? "XXX XXX XXXX" : "XXX XXX XXX"
                }
              />
            </Stack>

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
                  },
                }}
              />
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Пол
              </Typography>
              <TextField
                select
                value={gender}
                onChange={(e) =>
                  setGender(e.target.value as "male" | "female" | "unknown")
                }
                fullWidth
                size="small"
              >
                <MenuItem value="unknown">Не указан</MenuItem>
                <MenuItem value="male">Мужской</MenuItem>
                <MenuItem value="female">Женский</MenuItem>
              </TextField>
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Примечания
              </Typography>
              <TextField
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                multiline
                minRows={2}
                fullWidth
                size="small"
                placeholder="Необязательно"
              />
            </Stack>
          </Stack>
        </Box>

        <Box sx={{ borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
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
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {duplicates.slice(0, 3).map((d) => (
                    <Stack
                      key={d.id}
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      gap={1}
                    >
                      <Typography variant="body2">
                        {d.fullName}
                        {d.phone ? ` · ${d.phone}` : ""}
                        {d.birthDate ? ` · ${dayjs(d.birthDate).format("DD.MM.YYYY")}` : ""}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => handleUseDuplicate(d)}
                        disabled={busy}
                        sx={{ flexShrink: 0 }}
                      >
                        Использовать этого пациента
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              </Alert>
            </Box>
          </Collapse>

          {duplicateCheckError && (
            <Box sx={{ px: 2, pt: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                {duplicateCheckError}
              </Typography>
            </Box>
          )}

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

export default AddPatientDrawer;
