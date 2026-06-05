import React from "react";
import { Stack, TextField, InputAdornment, Checkbox, Typography, MenuItem, IconButton } from "@mui/material";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import Autocomplete from "@mui/material/Autocomplete";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import DrawerBase from "./DrawerBase";
import type { EmployesRow, ServiceRow } from "../types";
import { employeeFormUtils } from "../hooks/useEmployeesPage";
import { uploadFile } from "../../../utility/storage";
import ServicePhotoUploader from "../../../components/services/ServicePhotoUploader";
import PassportPhotoUploader from "./PassportPhotoUploader";
import { EMPLOYEE_PHOTOS_BUCKET, EMPLOYEE_PASSPORTS_BUCKET, EMPLOYEES_WRITE, setEmployeeSpecialization } from "../api";
import { DB_TABLES } from "../../../utility/constants";
import { supabase } from "../../../utility/supabaseClient";
import { useNotification, useList } from "@refinedev/core";
import { IS_DJANGO_BACKEND } from "../../../config/backend";
import { PhoneCountryCodeSelect, CustomDatePicker } from "../../../components/ui";
import dayjs from "dayjs";
import {
  composePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  getPhoneLocalMaxLength,
  type PhoneCountryCode,
} from "../../../utility/phone";

export type AddEmployeeDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (rec: EmployesRow) => void;
};

type RoleRow = {
  id: string;
  name: string;
  display_name: string;
};

const AddEmployeeDrawer: React.FC<AddEmployeeDrawerProps> = ({ open, onClose, onCreated }) => {
  const { open: notify } = useNotification();
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [phoneCountryCode, setPhoneCountryCode] = React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneError, setPhoneError] = React.useState(false);
  const [roleId, setRoleId] = React.useState("");
  const [roles, setRoles] = React.useState<RoleRow[]>([]);
  const [birthDate, setBirthDate] = React.useState("");
  const [status, setStatus] = React.useState("active");
  const [busy, setBusy] = React.useState(false);

  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  const [telegramId, setTelegramId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [emailErrorMsg, setEmailErrorMsg] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [bankAccountNumber, setBankAccountNumber] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [nickname, setNickname] = React.useState("");

  const [passportPhotos, setPassportPhotos] = React.useState<string[]>([]);
  const [passportFiles, setPassportFiles] = React.useState<File[]>([]);

  const [services, setServices] = React.useState<ServiceRow[]>([]);
  const [servicesLoading, setServicesLoading] = React.useState(false);
  const [selectedServices, setSelectedServices] = React.useState<ServiceRow[]>([]);

  /* Specializations Hook */
  const selectedRole = roles.find(r => r.id === roleId);
  const { result: specializationsResult } = useList<{ id: string, name: string }>({
    resource: DB_TABLES.SPECIALIZATIONS,
    queryOptions: {
      enabled: !IS_DJANGO_BACKEND && open && selectedRole?.name === "doctor",
    },
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });
  const specializations = specializationsResult?.data || [];

  React.useEffect(() => {
    if (!open) {
      setFullName("");
      setPhone("");
      setPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
      setRoleId("");
      setSpecializationId(""); // Reset spec
      setPhotoFile(null);
      setPhotoPreview(null);
      setBirthDate("");
      setStatus("active");
      setBankAccountNumber("");
      setTelegramId("");
      setEmail("");
      setEmailErrorMsg("");
      setPassword("");
      setShowPassword(false);
      setSelectedServices([]);
      setNickname("");
      setPassportPhotos([]);
      setPassportFiles([]);
      setBusy(false);
    }
  }, [open]);

  const [specializationId, setSpecializationId] = React.useState("");

  // Load services and roles
  React.useEffect(() => {
    let cancelled = false;
    if (!open) return;
    (async () => {
      try {
        setServicesLoading(true);
        const [srvItems, rolesRes] = await Promise.all([
          employeeFormUtils.fetchServices(),
          supabase.from(DB_TABLES.ROLES).select("id, name, display_name").order("display_name"),
        ]);

        if (!cancelled) {
          const uniq = Array.from(new Map(srvItems.map((s) => [s.id, s])).values());
          setServices(uniq);

          if (rolesRes.data) {
            setRoles(rolesRes.data as RoleRow[]);
          }
        }
      } catch (e) {
        console.error("Failed to load dependency data", e);
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);


  const onPickPhoto = React.useCallback(async (f: File | null) => {
    setPhotoFile(f);
    if (f) {
      try {
        const r = new FileReader();
        r.onload = () => setPhotoPreview(String(r.result || ""));
        r.onerror = () => setPhotoPreview(null);
        r.readAsDataURL(f);
      } catch {
        setPhotoPreview(null);
      }
    } else {
      setPhotoPreview(null);
    }
  }, []);

  const validateEmail = (val: string) => {
    if (!val.trim()) return "";
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(val)) return "Некорректный формат email";
    const lower = val.toLowerCase();
    if (lower.endsWith('@mai.ru')) return "Возможно, опечатка. Вы имели в виду @mail.ru?";
    if (lower.endsWith('@gmai.com') || lower.endsWith('@gamil.com')) return "Возможно, опечатка. Вы имели в виду @gmail.com?";
    return "";
  };

  const handleSubmit = async () => {
    const maxLen = getPhoneLocalMaxLength(phoneCountryCode);
    if (phone.trim().length > 0 && phone.trim().length !== maxLen) {
      setPhoneError(true);
      return;
    }
    if (emailErrorMsg) {
      return;
    }
    if (!roleId) {
      notify?.({ type: "error", message: "Выберите роль сотрудника" });
      return;
    }

    // Validate Specialization for Doctors
    const selectedRole = roles.find(r => r.id === roleId);
    if (selectedRole?.name === 'doctor' && !specializationId) {
      notify?.({ type: "error", message: "Для врача необходимо выбрать специализацию" });
      return;
    }

    try {
      setBusy(true);
      let uploadedPhotoUrl: string | null = null;
      if (photoFile) {
        try {
          uploadedPhotoUrl = await uploadFile(photoFile, EMPLOYEE_PHOTOS_BUCKET);
        } catch (e) {
          console.error("Upload employee photo failed:", e);
          notify?.({ type: "error", message: "Не удалось загрузить фото сотрудника" });
        }
      }

      // Upload passport photos
      const uploadedPassportUrls: string[] = [];
      for (const file of passportFiles) {
        try {
          const url = await uploadFile(file, EMPLOYEE_PASSPORTS_BUCKET);
          if (url) uploadedPassportUrls.push(url);
        } catch (e) {
          console.error("Upload passport photo failed:", e);
        }
      }


      const serviceIds = selectedServices.map((s) => s.id);

      const fullPhone = composePhone(phoneCountryCode, phone);

      let authUserId: string | null = null;

      // 1. Создаем аккаунт через Edge Function, если есть телефон или почта
      if (fullPhone || (email.trim() && password.trim())) {
        const authPayload: any = {
          password: password.trim() || "MamaDoc123!", // Дефолтный пароль, если не указан
        };
        if (email.trim()) authPayload.email = email.trim();
        if (fullPhone) authPayload.phone = fullPhone;

        const { data: authData, error: authError } = await supabase.functions.invoke('admin-create-user', {
          body: authPayload
        });

        if (authError || (authData && authData.error)) {
          console.error("Auth creation failed:", authError || authData.error);
          throw new Error(employeeFormUtils.translateAuthError(authData?.error || authError));
        }

        authUserId = authData.user_id;
      }

      const payload = {
        full_name: fullName.trim(),
        phone: fullPhone,
        role_id: roleId, // UUID
        status: status, // Selected status
        photo_url: uploadedPhotoUrl || null,
        birth_date: birthDate || null,
        telegram_id: telegramId || null,
        bank_account_number: bankAccountNumber.trim() || null,
        inn: inn.trim() || null,
        email: email.trim() || null,
        nickname: nickname.trim() || null,
        auth_user_id: authUserId, // Привязываем созданный ID
        updated_at: new Date().toISOString(),
      };


      const { data, error } = await supabase.from(EMPLOYEES_WRITE).insert(payload).select("*").single();
      if (!error && data) {
        // Link services to new employee
        const newId = data.id;

        // Save Specialization (using helper)
        if (specializationId && String(newId)) {
          try {
            await setEmployeeSpecialization(String(newId), specializationId);
          } catch (e) {
            console.error("Link specialization failed", e);
          }
        }

        if (serviceIds.length > 0) {
          try {
            await employeeFormUtils.replaceEmployeeServices(String(newId), serviceIds);
          } catch (e) { console.error("Linking services failed", e); }
        }
      }
      if (error) throw error;

      // Safe casting using unknown first
      const created = (data || {}) as unknown as EmployesRow;

      notify?.({ type: "success", message: "Сотрудник создан" });
      onCreated(created);
      onClose();
    } catch (e: unknown) {
      console.error("Add employee failed:", e);
      let msg = "Не удалось создать сотрудника";
      if (e instanceof Error) {
        msg = e.message;
      } else if (typeof e === 'object' && e !== null && 'message' in e) {
        msg = String((e as { message: unknown }).message);
      }
      notify?.({ type: "error", message: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerBase
      open={open}
      title="Новый сотрудник"
      onClose={onClose}
      busy={busy}
      onSubmit={handleSubmit}
      submitLabel="Создать"
      submitDisabled={(phone.trim().length > 0 && phoneError) || !!emailErrorMsg}
    >
      <Stack spacing={3}>
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Фото сотрудника
          </Typography>
          <ServicePhotoUploader photoFile={photoFile} photoPreview={photoPreview} inputId="emp-add-photo-input" onPickPhoto={onPickPhoto} />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            ФИО
          </Typography>
          <TextField value={fullName} onChange={(e) => setFullName(e.target.value)} required fullWidth placeholder="Введите ФИО сотрудника" />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Псевдоним
          </Typography>
          <TextField value={nickname} onChange={(e) => setNickname(e.target.value)} fullWidth placeholder="Введите псевдоним" />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Телефон
          </Typography>
          <TextField
            value={phone}
            placeholder="XXX XXX XXX"
            onChange={(e) => {
              const maxLen = getPhoneLocalMaxLength(phoneCountryCode);
              const v = e.target.value.replace(/[^\d]/g, "").slice(0, maxLen);
              setPhone(v);
              setPhoneError(v.length > 0 && v.length !== maxLen);
            }}
            error={phone.trim().length > 0 && phoneError}
            helperText={
              phone.trim().length > 0 && phoneError
                ? `Введите ${getPhoneLocalMaxLength(phoneCountryCode)} цифр. Формат: +код XXX...`
                : "Формат: +код XXX..."
            }
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0, ml: '-14px' }}>
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
          />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Роль
          </Typography>
          <TextField
            select
            value={roleId}
            onChange={(e) => {
              const newRole = e.target.value;
              setRoleId(newRole);
              // Clear spec if not doctor
              const roleObj = roles.find(r => r.id === newRole);
              if (roleObj && roleObj.name !== 'doctor') {
                setSpecializationId("");
              }
            }}
            fullWidth
            required
            placeholder="Выберите роль"
          >
            {roles.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.name === 'admin' ? 'Управляющий' : (r.display_name || r.name)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {/* Specialization Field - Only for Doctors */}
        {(() => {
          const selectedRole = roles.find(r => r.id === roleId);
          if (selectedRole?.name === 'doctor') {
            return (
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Специализация
                </Typography>
                <TextField
                  select
                  value={specializationId}
                  onChange={(e) => setSpecializationId(e.target.value)}
                  fullWidth
                  required
                  placeholder="Выберите специализацию"
                >
                  {specializations.map((s: { id: string, name: string }) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            );
          }
          return null;
        })()}

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Дата рождения
          </Typography>
          <CustomDatePicker
            value={birthDate ? dayjs(birthDate) : null}
            onChange={(val) => setBirthDate(val ? val.format('YYYY-MM-DD') : '')}
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
            Статус
          </Typography>
          <TextField
            select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            fullWidth
          >
            <MenuItem value="active">Работает</MenuItem>
            <MenuItem value="inactive">Не работает</MenuItem>
          </TextField>
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Услуги
          </Typography>
          <Autocomplete
            multiple
            limitTags={2}
            loading={servicesLoading}
            options={services}
            value={selectedServices}
            disableCloseOnSelect
            getOptionLabel={(option) => typeof option.price === 'number' ? `${option.name} (${option.price} с)` : option.name || ''}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onChange={(_, newValue) => {
              setSelectedServices(newValue);
            }}
            renderOption={(props, option, { selected }) => (
              <li {...props}>
                <Checkbox
                  icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                  checkedIcon={<CheckBoxIcon fontSize="small" />}
                  style={{ marginRight: 8 }}
                  checked={selected}
                />
                {option.name} {typeof option.price === 'number' ? `(${option.price} с)` : ""}
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} placeholder="Выберите услуги" />
            )}
          />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Telegram ID
          </Typography>
          <TextField
            value={telegramId}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              setTelegramId(v);
            }}
            fullWidth
            placeholder="Введите Telegram ID (только цифры)"
            inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
          />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Email
          </Typography>
          <TextField
            value={email}
            onChange={(e) => {
              const val = e.target.value;
              setEmail(val);
              setEmailErrorMsg(validateEmail(val));
            }}
            fullWidth
            placeholder="example@mail.com"
            type="email"
            error={!!emailErrorMsg}
            helperText={emailErrorMsg}
          />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Пароль для входа (необязательно)
          </Typography>
          <TextField
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            placeholder="Минимум 6 символов"
            type={showPassword ? "text" : "password"}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                  >
                    {showPassword ? (
                      <VisibilityOffOutlined fontSize="small" />
                    ) : (
                      <VisibilityOutlined fontSize="small" />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          {email.trim() && !password.trim() && (
            <Typography variant="caption" color="warning.main">
              Если указать email без пароля, вход по почте будет недоступен до ручной настройки.
            </Typography>
          )}
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Номер расчетного счета
          </Typography>
          <TextField
            value={bankAccountNumber}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 16);
              setBankAccountNumber(v);
            }}
            fullWidth
            placeholder="0000 0000 0000 0000"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <CreditCardOutlined fontSize="small" />
                </InputAdornment>
              ),
            }}
            helperText={`${bankAccountNumber.length}/16`}
          />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            ИНН
          </Typography>
          <TextField
            value={inn}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 14);
              setInn(v);
            }}
            fullWidth
            placeholder="000000000000"
            inputProps={{ inputMode: 'numeric' }}
            helperText={`${inn.length}/14`}
          />
        </Stack>

        <PassportPhotoUploader
          photos={passportPhotos}
          onAddPhoto={(file) => {
            setPassportFiles((prev) => [...prev, file]);
            const reader = new FileReader();
            reader.onload = () => setPassportPhotos((prev) => [...prev, String(reader.result)]);
            reader.readAsDataURL(file);
          }}
          onRemovePhoto={(url) => {
            const idx = passportPhotos.indexOf(url);
            if (idx !== -1) {
              setPassportPhotos((prev) => prev.filter((_, i) => i !== idx));
              setPassportFiles((prev) => prev.filter((_, i) => i !== idx));
            }
          }}
          inputId="emp-add-passport-input"
        />
      </Stack>
    </DrawerBase>
  );
};

export default AddEmployeeDrawer;
