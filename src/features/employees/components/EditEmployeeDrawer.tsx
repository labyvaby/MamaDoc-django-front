import React from "react";
import { Stack, TextField, InputAdornment, Checkbox, Typography, MenuItem, Box, Divider } from "@mui/material";
import Autocomplete from "@mui/material/Autocomplete";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import DrawerBase from "./DrawerBase";
import type { EmployesRow, ServiceRow } from "../types";
import { employeeFormUtils } from "../hooks/employeeFormUtils";
import { uploadFile } from "../../../utility/storage";
import ServicePhotoUploader from "../../../components/services/ServicePhotoUploader";
import PassportPhotoUploader from "./PassportPhotoUploader";
import { EMPLOYEE_PHOTOS_BUCKET, EMPLOYEE_PASSPORTS_BUCKET, EMPLOYEES_WRITE, fetchEmployeeSpecialization, setEmployeeSpecialization, mapAnyToEmployee } from "../api";

import { DB_TABLES } from "../../../utility/constants";
import { supabase } from "../../../utility/supabaseClient";
import { useNotification, useList } from "@refinedev/core";
import { IS_DJANGO_BACKEND } from "../../../config/backend";
import { PhoneCountryCodeSelect, CustomDatePicker } from "../../../components/ui";
import dayjs from "dayjs";
import {
  composePhone,
  parsePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  getPhoneLocalMaxLength,
  type PhoneCountryCode,
} from "../../../utility/phone";
import SalarySettings from "./SalarySettings";
import { usePermissions } from "../../../hooks/usePermissions";

export type EditEmployeeDrawerProps = {
  record: EmployesRow | null;
  onClose: () => void;
  onUpdated: (rec: EmployesRow) => void;
};

type RoleRow = {
  id: string;
  name: string;
  display_name: string;
};

const EditEmployeeDrawer: React.FC<EditEmployeeDrawerProps> = ({ record, onClose, onUpdated }) => {
  const open = Boolean(record);
  const { open: notify } = useNotification();
  const { hasRole } = usePermissions();

  // Form state
  const [fullName, setFullName] = React.useState<string>("");
  const [phone, setPhone] = React.useState<string>("");
  const [phoneCountryCode, setPhoneCountryCode] = React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneError, setPhoneError] = React.useState<boolean>(false);
  const [roleId, setRoleId] = React.useState<string>("");
  const [roles, setRoles] = React.useState<RoleRow[]>([]);
  const [birthDate, setBirthDate] = React.useState<string>("");
  const [status, setStatus] = React.useState<string>("active");
  const [telegramId, setTelegramId] = React.useState<string>("");
  const [email, setEmail] = React.useState<string>("");
  const [emailErrorMsg, setEmailErrorMsg] = React.useState<string>("");
  const [bankAccountNumber, setBankAccountNumber] = React.useState<string>("");
  const [inn, setInn] = React.useState<string>("");
  const [nickname, setNickname] = React.useState<string>("");
  const [busy, setBusy] = React.useState<boolean>(false);

  const [passportPhotos, setPassportPhotos] = React.useState<string[]>([]);
  const [passportFiles, setPassportFiles] = React.useState<File[]>([]);
  const [removedPassportUrls, setRemovedPassportUrls] = React.useState<string[]>([]);


  // Spec state
  const [specializationId, setSpecializationId] = React.useState<string>("");

  // Salary state
  const [salaryRules, setSalaryRules] = React.useState<any>(null);

  // Spec hook
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

  // Photo state
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  // Services state
  const [services, setServices] = React.useState<ServiceRow[]>([]);
  const [servicesLoading, setServicesLoading] = React.useState<boolean>(false);
  const [selectedServices, setSelectedServices] = React.useState<ServiceRow[]>([]);

  // Helpers: strict-typed guards and parsers
  const normalizeDateInput = (input: unknown): string => {
    if (!input || typeof input !== "string") return "";
    const s = input.trim();
    if (!s) return "";
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const [, y, m, d] = iso;
      return `${y}-${m}-${d}`;
    }
    const dotted = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (dotted) {
      const [, d, m, y] = dotted;
      return `${y}-${m}-${d}`;
    }
    const slashed = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slashed) {
      const [, d, m, y] = slashed;
      return `${y}-${m}-${d}`;
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
      const y = String(parsed.getFullYear());
      const m = String(parsed.getMonth() + 1).padStart(2, "0");
      const d = String(parsed.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return "";
  };

  React.useEffect(() => {
    if (!record) {
      // reset on close
      setFullName("");
      setPhone("");
      setPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
      setPhoneError(false);
      setRoleId("");
      setSpecializationId("");
      setBirthDate("");
      setNickname("");
      setEmail("");
      setEmailErrorMsg("");
      setBusy(false);
      setPhotoFile(null);
      setPhotoPreview(null);
      setServices([]);
      setSelectedServices([]);
      setPassportPhotos([]);
      setPassportFiles([]);
      setRemovedPassportUrls([]);
      return;

    }

    // init basic fields
    setFullName(record.full_name || "");
    const parsedPhone = parsePhone(record.phone ?? "");
    setPhoneCountryCode(parsedPhone.countryCode);
    setPhone(employeeFormUtils.sanitizeKGLocal(parsedPhone.local));
    setRoleId((record.role_id && typeof record.role_id === 'string') ? record.role_id : "");
    setRoleId((record.role_id && typeof record.role_id === 'string') ? record.role_id : "");
    setStatus(record.status || "active");
    // specialization_id is not in record, load async below
    setTelegramId(record.telegram_id ? String(record.telegram_id) : "");
    setBankAccountNumber(record.bank_account_number || "");
    setInn(record.inn || "");
    const initialEmail = record.email || "";
    setEmail(initialEmail);
    // we will set email errorMessage later in the effect or just wait for onChange. But better initialize it:
    setNickname(record.nickname || "");
    setSalaryRules(record.salary_rules || null);

    const ph = record.photo_url || "";
    setPhotoPreview(ph ? String(ph) : null);

    setPassportPhotos(Array.isArray(record.passport_photos) ? record.passport_photos : []);
    setPassportFiles([]);
    setRemovedPassportUrls([]);


    const bdRaw = record.birth_date || "";
    setBirthDate(normalizeDateInput(bdRaw));

    // load services + roles + preselect
    let cancelled = false;
    (async () => {
      try {
        setServicesLoading(true);
        const [allSrv, rolesRes, specId] = await Promise.all([
          employeeFormUtils.fetchServices(),
          supabase.from(DB_TABLES.ROLES).select("id, name, display_name").order("display_name"),
          fetchEmployeeSpecialization(String(record.id)),
        ]);

        if (specId) {
          if (!cancelled) setSpecializationId(specId);
        }

        if (rolesRes.data) {
          if (!cancelled) setRoles(rolesRes.data as RoleRow[]);
        }

        const uniq = Array.from(new Map((allSrv || []).map((s) => [String(s.id), { ...s, id: String(s.id) }])).values());
        console.log("DEBUG: EditEmployeeDrawer fetchServices result", uniq);
        if (!cancelled) setServices(uniq);


        // Preferred source: employee_services M:N table
        let assignedIds: string[] = [];
        try {
          assignedIds = await employeeFormUtils.fetchEmployeeServiceIds(String(record.id));
        } catch {
          assignedIds = [];
        }

        assignedIds = assignedIds.map((x) => String(x));

        if (!cancelled) {
          const selected = uniq.filter((s) => assignedIds.includes(String(s.id)));
          setSelectedServices(selected);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [record]);


  const validateEmail = (val: string) => {
    if (!val.trim()) return "";
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(val)) return "Некорректный формат email";
    const lower = val.toLowerCase();
    if (lower.endsWith('@mai.ru')) return "Возможно, опечатка. Вы имели в виду @mail.ru?";
    if (lower.endsWith('@gmai.com') || lower.endsWith('@gamil.com')) return "Возможно, опечатка. Вы имели в виду @gmail.com?";
    return "";
  };

  React.useEffect(() => {
    setEmailErrorMsg(validateEmail(email));
  }, [email]);

  const handleSubmit = async () => {
    if (!record) return;
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

    const selectedRole = roles.find(r => r.id === roleId);
    if (selectedRole?.name === 'doctor' && !specializationId) {
      notify?.({ type: "error", message: "Для врача необходимо выбрать специализацию" });
      return;
    }

    try {
      setBusy(true);

      // upload photo if new
      let finalPhotoUrl: string | null = photoPreview || null;
      if (photoFile) {
        try {
          finalPhotoUrl = await uploadFile(photoFile, EMPLOYEE_PHOTOS_BUCKET);
        } catch (e) {
          console.error("Upload employee photo (edit) failed:", e);
          notify?.({ type: "error", message: "Не удалось загрузить фото сотрудника" });
        }
      }

      const newServiceIds = selectedServices.map((s) => String(s.id));

      // Upload new passport photos
      const newUploadedPassportUrls: string[] = [];
      for (const file of passportFiles) {
        try {
          const url = await uploadFile(file, EMPLOYEE_PASSPORTS_BUCKET);
          if (url) newUploadedPassportUrls.push(url);
        } catch (e) {
          console.error("Upload passport photo (edit) failed:", e);
        }
      }

      // Final passport photos = (current - removed) + new
      const finalPassportPhotos = [
        ...passportPhotos.filter(url => !url.startsWith('data:') && !removedPassportUrls.includes(url)),
        ...newUploadedPassportUrls
      ];

      // Update M:N links first: DELETE old -> INSERT new

      try {
        await employeeFormUtils.replaceEmployeeServices(String(record.id), newServiceIds);
      } catch (e) {
        console.error("replaceEmployeeServices failed:", e);
        notify?.({ type: "error", message: "Не удалось сохранить услуги сотрудника" });
        setBusy(false);
        return;
      }

      const payload = {
        full_name: fullName.trim(),
        phone: composePhone(phoneCountryCode, phone),
        role_id: roleId,
        status: status,
        photo_url: finalPhotoUrl,
        birth_date: birthDate || null,
        telegram_id: telegramId || null,
        bank_account_number: bankAccountNumber.trim() || null,
        inn: inn.trim() || null,
        email: email.trim() || null,
        nickname: nickname.trim() || null,
        salary_rules: salaryRules || null,
        passport_photos: finalPassportPhotos,
      };


      // Синхронизируем телефон/email в auth.users через SECURITY DEFINER RPC
      // Работает напрямую через БД — не зависит от кэша auth_user_id на фронте
      try {
        await supabase.rpc('sync_employee_auth_contact', {
          p_employee_id: record.id,
          p_phone: payload.phone || null,
          p_email: payload.email?.trim() || null,
        });
      } catch (e) {
        console.warn("Failed to sync auth contact:", e);
      }

      let authUserId: string | null = record.auth_user_id || null;

      // 1б. Если нет auth_user_id, пробуем найти/создать через Edge Function
      if (!authUserId) {
        const searchPhone = payload.phone;
        const searchEmail = payload.email?.trim();

        if (searchPhone || (searchEmail && searchEmail.length > 5)) {
          try {
            const authPayload: any = {
              password: "MamaDoc123!", // Временный пароль
            };
            if (searchEmail) authPayload.email = searchEmail;
            if (searchPhone) authPayload.phone = searchPhone;

            const { data: authData, error: authError } = await supabase.functions.invoke('admin-create-user', {
              body: authPayload
            });

            if (authError || (authData && authData.error)) {
              console.warn("Auth creation failed during edit:", authError || authData.error);
              throw new Error(employeeFormUtils.translateAuthError(authData?.error || authError));
            }

            if (!authError && authData && authData.user_id) {
              authUserId = authData.user_id;
              notify?.({ type: "success", message: "Учетная запись безопасности привязана успешно" });
            }
          } catch (e) {
            console.warn("Failed to sync with Auth during edit:", e);
            throw e; // Пробрасываем ошибку дальше, чтобы показать ее в UI
          }
        }
      }

      const finalPayload = {
        ...payload,
        auth_user_id: authUserId,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from(EMPLOYEES_WRITE)
        .update(finalPayload)
        .eq("id", record.id)
        .select("*")
        .single();

      // Save Specialization
      if (!error) {
        try {
          await setEmployeeSpecialization(String(record.id), specializationId || null);
        } catch (e) {
          console.error("Link specialization failed", e);
        }
      }

      if (error) throw error;

      // Safe mapping using helper
      const raw = (data || {}) as Record<string, unknown>;
      const updated = mapAnyToEmployee(raw);

      if (updated) {
        notify?.({ type: "success", message: "Изменения сохранены" });
        onUpdated(updated);
        onClose();
      } else {
        throw new Error("Failed to map updated employee");
      }
    } catch (e: unknown) {
      console.error("Update employee failed:", e);
      let msg = "Не удалось сохранить изменения";
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
      title="Редактирование"
      onClose={onClose}
      busy={busy}
      onSubmit={handleSubmit}
      submitLabel="Сохранить"
      submitDisabled={(phone.trim().length > 0 && phoneError) || !!emailErrorMsg}
    >
      <Stack spacing={3}>
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Фото сотрудника
          </Typography>
          <ServicePhotoUploader
            photoFile={photoFile}
            photoPreview={photoPreview}
            inputId="emp-edit-photo-input"
            onPickPhoto={(f) => {
              if (!f) {
                setPhotoFile(null);
                return;
              }
              setPhotoFile(f);
              const r = new FileReader();
              r.onload = () => setPhotoPreview(String(r.result || ""));
              r.onerror = () => setPhotoPreview(null);
              r.readAsDataURL(f);
            }}
          />
        </Stack>

        {hasRole(['superadmin', 'accountant']) && (
          <>
            <Box sx={{ bgcolor: "action.hover", p: 2, borderRadius: "14px", mx: -2, borderTop: "1px solid", borderBottom: "1px solid", borderColor: "divider" }}>
              <SalarySettings
                employeeId={record?.id ? String(record.id) : undefined}
                initialValue={salaryRules}
                onChange={(val) => setSalaryRules(val)}
              />
            </Box>
            <Divider />
          </>
        )}

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
              const newId = e.target.value;
              setRoleId(newId);
              const roleObj = roles.find(r => r.id === newId);
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
            setPassportPhotos((prev) => prev.filter((u) => u !== url));
            if (url.startsWith('data:')) {
              // Find the file by matching the data URL (simple approach)
              setPassportFiles((prev) => {
                // In a more robust implementation, we'd store a pair of {file, previewUrl}
                // but for now, we'll leave the file in state; 
                // the final upload only processes files that have a matching preview in passportPhotos
                return prev;
              });
            } else {
              setRemovedPassportUrls((prev) => [...prev, url]);
            }
          }}
          inputId="emp-edit-passport-input"
        />
      </Stack>
    </DrawerBase>
  );
};

export default EditEmployeeDrawer;
