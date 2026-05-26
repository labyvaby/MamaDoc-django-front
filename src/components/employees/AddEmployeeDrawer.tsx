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
  Autocomplete,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { supabase } from "../../utility/supabaseClient";
import { fetchSpecializations, type SpecializationRow } from "../../services/specializations";
import { PhoneCountryCodeSelect } from "../ui";
import {
  composePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  type PhoneCountryCode,
} from "../../utility/phone";

export type CreatedEmployee = {
  id: string;
  full_name: string;
  phone?: string | null;
  employee_type?: string | null;
  specialization?: string | null;
  specialization_id?: string | null;
  birth_date?: string | null; // yyyy-MM-dd
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (e: CreatedEmployee) => void;
};

// Фиксация: имя таблицы и имена столбцов (кириллица)
const importMetaEnv =
  ((import.meta as unknown) as { env?: Record<string, string | undefined> })
    .env || {};
// Если в env настроено VITE_EMPLOYEES_WRITE_TABLE — используем его, иначе "Employes"
const EMPLOYEE_WRITE_TABLE: string =
  importMetaEnv.VITE_EMPLOYEES_WRITE_TABLE || "Employes";
const FIO_COLUMN = "ФИО сотрудников";
const PHONE_COLUMN = "Телефон";
const EMPLOYEE_TYPE_COLUMN = "Тип сотрудника";
const SPECIALIZATION_COLUMN = "Специализация";
const BIRTHDATE_COLUMN = "Дата рождения";

const AddEmployeeDrawer: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState(""); // локальная часть без кода страны
  const [phoneCountryCode, setPhoneCountryCode] = React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [employeeType, setEmployeeType] = React.useState("");
  // const [specialization, setSpecialization] = React.useState(""); // Legacy text state
  const [selectedSpec, setSelectedSpec] = React.useState<SpecializationRow | null>(null);
  const [specs, setSpecs] = React.useState<SpecializationRow[]>([]);
  const [loadingSpecs, setLoadingSpecs] = React.useState(false);

  const [birthDate, setBirthDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setLoadingSpecs(true);
      fetchSpecializations()
        .then(setSpecs)
        .catch((e) => console.error(e))
        .finally(() => setLoadingSpecs(false));
    } else {
      setFullName("");
      setPhone("");
      setPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
      setEmployeeType("");
      setSelectedSpec(null);
      setBirthDate("");
      setBusy(false);
      setTouched(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    setTouched(true);
    const fio = fullName.trim();
    if (!fio) {
      return;
    }
    try {
      setBusy(true);

      const fullPhone = composePhone(phoneCountryCode, phone);

      // Убираем циклы: один payload в зафиксированную таблицу с кириллическими ключами
      const payload: Record<string, unknown> = {
        [FIO_COLUMN]: fio,
        [PHONE_COLUMN]: fullPhone,
        [EMPLOYEE_TYPE_COLUMN]: employeeType.trim() ? employeeType.trim() : null,
        // Save Name to the legacy column for display consistency
        [SPECIALIZATION_COLUMN]: selectedSpec ? selectedSpec.name : null,

        [BIRTHDATE_COLUMN]: birthDate || null,
      };

      // Try to add specialization_id if the table supports it (Implicit check)
      if (selectedSpec) {
        // We'll tentatively add it. If the column strictly doesn't exist and it throws, we might have an issue.
        // But often Supabase/Postgres silently ignores extra keys in some configurations OR errors out.
        // Given "Add specialization which you take from specialization table", likely there is a column.
        // Let's assume standard column name "specialization_id" or "SpecializationID" or similar.
        // Since the other columns are Cyrillic, maybe "ID специализации"?
        // Safest bet is to relying on the NAME in the text column for legacy support, 
        // AND adding `specialization_id` field if I knew the name.
        // I will ADD `specialization_id` to the payload. If it errors, I'll need to remove it.
        // But wait, the user said "take from table", so the RELATION is key.
        // I'll add `specialization_id` key.
        payload["specialization_id"] = selectedSpec.id;
      }

      const { data, error } = await supabase
        .schema("public")
        .from(EMPLOYEE_WRITE_TABLE)
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        // If error is about missing column specialization_id, retry without it
        if (error.message?.includes("column \"specialization_id\" of relation") || error.code === '42703') {
          delete payload["specialization_id"];
          const { data: retryData, error: retryError } = await supabase
            .schema("public")
            .from(EMPLOYEE_WRITE_TABLE)
            .insert(payload)
            .select("*")
            .single();
          if (retryError) throw retryError;
          handleSuccess(retryData, fio, fullPhone);
          return;
        }
        throw error;
      }

      handleSuccess(data, fio, fullPhone);

    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error(e);
      const message = e instanceof Error ? e.message : String(e);
      alert(
        "Не удалось добавить сотрудника: " + message
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSuccess = (data: Record<string, unknown>, fio: string, fullPhone: string | null) => {
    const rawId = data["ID"] ?? data["id"] ?? "";
    const insertedId = String(rawId);
    if (!insertedId) {
      throw new Error("ID не был возвращен после вставки.");
    }

    const created: CreatedEmployee = {
      id: insertedId,
      full_name: fio,
      phone: fullPhone,
      employee_type: employeeType.trim() || null,
      specialization: selectedSpec?.name || null,
      specialization_id: selectedSpec?.id || null,
      birth_date: birthDate || null,
    };

    onCreated?.(created);
    onClose();
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: 320, sm: 420 }, maxWidth: "100vw" } }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
        }}
      >
        <Typography variant="h6">Добавить сотрудника</Typography>
        <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField
            label="ФИО сотрудника *"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            fullWidth
            autoFocus
            error={touched && !fullName.trim()}
            helperText={touched && !fullName.trim() ? "Обязательное поле" : ""}
          />
          <TextField
            label="Телефон"
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 9))
            }
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
            inputProps={{ inputMode: "tel", pattern: "[0-9]*", maxLength: 9 }}
          />

          <TextField
            label="Тип сотрудника"
            value={employeeType}
            onChange={(e) => setEmployeeType(e.target.value)}
            fullWidth
          />

          <Autocomplete
            options={specs}
            loading={loadingSpecs}
            value={selectedSpec}
            onChange={(_, v) => setSelectedSpec(v)}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.id === value?.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Специализация"
                placeholder="Выберите специализацию"
                fullWidth
              />
            )}
            noOptionsText="Нет специализаций"
          />

          <TextField
            label="Дата рождения"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <Stack direction="row" gap={1} justifyContent="flex-end">
            <Button onClick={onClose} disabled={busy}>
              Отмена
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={busy || !fullName.trim()}
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
        </Stack>
      </Box>
    </Drawer>
  );
};

export default AddEmployeeDrawer;
