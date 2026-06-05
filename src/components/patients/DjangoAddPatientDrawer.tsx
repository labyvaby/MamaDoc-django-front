/**
 * DjangoAddPatientDrawer
 *
 * Django-API-only version of AddPatientDrawer.
 * Visual UX matches the original AddPatientDrawer.
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
import { useHasRole } from "../../hooks/usePermissions";
import { createPatient, type DjangoPatient } from "../../api/patients";
import { parseBackendError } from "../../api/appointments";

// ── types ─────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (p: DjangoPatient) => void;
  initialPhone?: string;
};

// ── component ─────────────────────────────────────────────────────────────────

const DjangoAddPatientDrawer: React.FC<Props> = ({
  open,
  onClose,
  onCreated,
  initialPhone,
}) => {
  const { open: notify } = useNotification();
  const canManageBlacklist = useHasRole(["superadmin", "admin", "receptionist"]);

  const [fio, setFio] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [phoneCountryCode, setPhoneCountryCode] =
    React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [birth, setBirth] = React.useState("");
  const [gender, setGender] = React.useState<"male" | "female" | "unknown">("unknown");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ── reset ─────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setFio("");
      setPhone("");
      setPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
      setBirth("");
      setGender("unknown");
      setNotes("");
      setBusy(false);
      setError(null);
      return;
    }
    if (initialPhone) {
      const parsed = parsePhone(initialPhone);
      setPhone(parsed.local);
      setPhoneCountryCode(parsed.countryCode);
    }
  }, [open, initialPhone]);

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const fioTrim = fio.trim();
    if (!fioTrim) {
      notify?.({ type: "error", message: "Введите ФИО пациента" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fullPhone = composePhone(phoneCountryCode, phone);
      const patient = await createPatient({
        fullName: fioTrim,
        phone: fullPhone ?? "",
        birthDate: birth || null,
        gender,
        notes: notes.trim() || null,
      });
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

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: "100vw", sm: 480, md: 520 },
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
            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

            {/* ФИО */}
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

            {/* Телефон */}
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

            {/* Дата рождения */}
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

            {/* Пол */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Пол
              </Typography>
              <TextField
                select
                value={gender}
                onChange={(e) => setGender(e.target.value as "male" | "female" | "unknown")}
                fullWidth
                size="small"
              >
                <MenuItem value="unknown">Не указан</MenuItem>
                <MenuItem value="male">Мужской</MenuItem>
                <MenuItem value="female">Женский</MenuItem>
              </TextField>
            </Stack>

            {/* Примечания */}
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

        {/* footer */}
        <Box
          sx={{ borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}
        >
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
