import React from "react";
import {
  Alert,
  Box,
  Divider,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import DrawerBase from "./DrawerBase";
import {
  updateEmployee,
  getDjangoEmployee,
  uploadEmployeePhoto,
} from "../../../api/staff";
import type { DjangoSpecializationShort } from "../../../api/staff";
import type { EmployesRow } from "../types";
import { useCan } from "../../../hooks/useCan";
import { CustomDatePicker } from "../../../components/ui";
import { PhoneCountryCodeSelect } from "../../../components/ui/PhoneCountryCodeSelect";
import SpecializationBlock from "./SpecializationBlock";
import DocumentsBlock from "./DocumentsBlock";
import ServicePhotoUploader from "../../../components/services/ServicePhotoUploader";
import {
  parsePhone,
  composePhone,
  type PhoneCountryCode,
} from "../../../utility/phone";
import {
  validateFullName,
  validatePhoneLocal,
  validateEmail,
  validateBirthDate,
  validateTelegramId,
  validateBankAccountNumber,
  validateInn,
} from "../employeeValidation";

export type DjangoEditEmployeeDrawerProps = {
  record: EmployesRow | null;
  onClose: () => void;
  onUpdated: (updated: EmployesRow) => void;
};

const STATUS_OPTIONS = [
  { value: "active", label: "Работает" },
  { value: "inactive", label: "Не работает" },
];

const DjangoEditEmployeeDrawer: React.FC<DjangoEditEmployeeDrawerProps> = ({
  record,
  onClose,
  onUpdated,
}) => {
  const { open: notify } = useNotification();
  const canManagePrivate = useCan("staff.private.manage");
  const canViewSpecs = useCan("staff.specializations.view");
  const canManageSpecs = useCan("staff.specializations.manage");
  const canViewDocs = useCan("staff.documents.view");
  const canManageDocs = useCan("staff.documents.manage");

  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  // Form values
  const [fullName, setFullName] = React.useState("");
  const [phoneCountry, setPhoneCountry] = React.useState<PhoneCountryCode>("+996");
  const [phoneLocal, setPhoneLocal] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"active" | "inactive">("active");
  const [clinicalRole, setClinicalRole] = React.useState<"doctor" | "nurse" | "other">("other");
  const [telegramId, setTelegramId] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [bankAccountNumber, setBankAccountNumber] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [specializations, setSpecializations] = React.useState<DjangoSpecializationShort[]>([]);

  // Validation errors (shown after blur or submit attempt)
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  const [busy, setBusy] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // ── Derived errors ───────────────────────────────────────────────────────────
  const errors = React.useMemo(() => ({
    fullName: validateFullName(fullName),
    phone: validatePhoneLocal(phoneLocal, phoneCountry),
    email: validateEmail(email),
    birthDate: validateBirthDate(birthDate),
    telegramId: validateTelegramId(telegramId),
    bankAccountNumber: canManagePrivate ? validateBankAccountNumber(bankAccountNumber) : "",
    inn: canManagePrivate ? validateInn(inn) : "",
  }), [fullName, phoneLocal, phoneCountry, email, birthDate, telegramId, bankAccountNumber, inn, canManagePrivate]);

  const hasErrors = Object.values(errors).some(Boolean);

  const showError = (field: string) =>
    (touched[field] || submitAttempted) ? errors[field as keyof typeof errors] : "";

  const touch = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  // ── Photo ────────────────────────────────────────────────────────────────────
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

  // ── Populate on record change ────────────────────────────────────────────────
  React.useEffect(() => {
    if (!record) return;

    setPhotoFile(null);
    setPhotoPreview(record.photo_url || null);
    setFullName(record.full_name || "");

    const parsed = parsePhone(record.phone || "");
    setPhoneCountry(parsed.countryCode);
    setPhoneLocal(parsed.local);

    setEmail(record.email || "");
    setStatus(
      record.status === "active" || record.status === "inactive"
        ? record.status
        : "active",
    );
    setClinicalRole(
      record.clinicalRole === "doctor" || record.clinicalRole === "nurse"
        ? record.clinicalRole
        : "other",
    );
    setTelegramId(record.telegram_id || "");
    setBirthDate(record.birth_date || "");
    setBankAccountNumber(record.bank_account_number || "");
    setInn(record.inn || "");
    setSpecializations(record._djangoSpecializations ?? []);
    setServerError(null);
    setTouched({});
    setSubmitAttempted(false);

    const empId = Number(record.id);
    if (isNaN(empId) || empId <= 0) return;
    const ctrl = new AbortController();
    getDjangoEmployee(empId, ctrl.signal)
      .then((full) => {
        if (ctrl.signal.aborted) return;
        setPhotoPreview(full.photoUrl || null);
        setTelegramId(full.telegramId || "");
        setBirthDate(full.birthDate || "");
        setBankAccountNumber(full.bankAccountNumber || "");
        setInn(full.inn || "");
        setClinicalRole(full.clinicalRole ?? "other");
        setSpecializations(full.specializations ?? []);

        const parsedFull = parsePhone(full.phone || "");
        setPhoneCountry(parsedFull.countryCode);
        setPhoneLocal(parsedFull.local);
      })
      .catch((e) => {
        if ((e as Error)?.name !== "AbortError") {
          console.warn("Could not fetch full employee detail:", e);
        }
      });
    return () => ctrl.abort();
  }, [record]);

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (hasErrors) return;

    if (!record) return;
    const empId = Number(record.id);
    if (isNaN(empId) || empId <= 0) return;

    setBusy(true);
    setServerError(null);
    try {
      const composedPhone = composePhone(phoneCountry, phoneLocal);

      const payload: Record<string, unknown> = {
        fullName: fullName.trim(),
        phone: composedPhone,           // null → clears field
        email: email.trim() || null,    // null → clears field
        status,
        clinicalRole,
        telegramId: telegramId.trim() || null,
        birthDate: birthDate || null,
      };
      if (canManagePrivate) {
        payload.bankAccountNumber = bankAccountNumber.trim() || null;
        payload.inn = inn.trim() || null;
      }

      await updateEmployee(empId, payload);

      if (photoFile) {
        try {
          await uploadEmployeePhoto(empId, photoFile);
        } catch {
          notify?.({ type: "error", message: "Данные сохранены, но фото не удалось загрузить" });
        }
      }

      const updated = await getDjangoEmployee(empId);

      const updatedRow: EmployesRow = {
        ...record,
        full_name: updated.fullName,
        phone: updated.phone || null,
        email: updated.email || null,
        status: updated.status,
        telegram_id: updated.telegramId || null,
        birth_date: updated.birthDate || null,
        bank_account_number: updated.bankAccountNumber || null,
        inn: updated.inn || null,
        photo_url: updated.photoUrl || null,
        nickname: record.nickname || null,
        role_id: updated.role ? String(updated.role.id) : null,
        clinicalRole: updated.clinicalRole ?? "other",
        _djangoRole: updated.role ?? null,
        _djangoSpecializations: updated.specializations ?? [],
        _djangoOperationalBranches: updated.operationalBranches ?? [],
      };

      notify?.({ type: "success", message: "Данные сотрудника обновлены" });
      onUpdated(updatedRow);
      onClose();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Не удалось сохранить изменения";
      setServerError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerBase
      open={Boolean(record)}
      title="Редактирование"
      onClose={onClose}
      busy={busy}
      onSubmit={handleSubmit}
      submitLabel="Сохранить"
      submitDisabled={submitAttempted && hasErrors}
    >
      <Stack spacing={3}>
        {serverError && <Alert severity="error">{serverError}</Alert>}

        {/* ── Фото ── */}
        <ServicePhotoUploader
          photoFile={photoFile}
          photoPreview={photoPreview}
          onPickPhoto={handlePickPhoto}
          inputId="edit-employee-photo"
        />

        {/* ── ФИО ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            ФИО *
          </Typography>
          <TextField
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setServerError(null); }}
            onBlur={() => touch("fullName")}
            required
            fullWidth
            placeholder="Иванов Иван Иванович"
            disabled={busy}
            error={Boolean(showError("fullName"))}
            helperText={showError("fullName")}
            inputProps={{ maxLength: 255 }}
          />
        </Stack>

        {/* ── Телефон ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Телефон
          </Typography>
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
            <PhoneCountryCodeSelect
              value={phoneCountry}
              onChange={(code) => { setPhoneCountry(code); setPhoneLocal(""); }}
              disabled={busy}
            />
            <TextField
              value={phoneLocal}
              onChange={(e) => {
                // Only digits allowed
                const digits = e.target.value.replace(/\D/g, "");
                setPhoneLocal(digits);
                setServerError(null);
              }}
              onBlur={() => touch("phone")}
              fullWidth
              placeholder="Номер"
              disabled={busy}
              inputProps={{ inputMode: "numeric" }}
              error={Boolean(showError("phone"))}
              helperText={showError("phone")}
            />
          </Box>
        </Stack>

        {/* ── Email ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Email
          </Typography>
          <TextField
            value={email}
            onChange={(e) => { setEmail(e.target.value); setServerError(null); }}
            onBlur={() => touch("email")}
            fullWidth
            placeholder="example@mail.com"
            type="email"
            disabled={busy}
            error={Boolean(showError("email") && !showError("email")?.startsWith("Опечатка"))}
            helperText={showError("email")}
            FormHelperTextProps={{
              sx: showError("email")?.startsWith("Опечатка")
                ? { color: "warning.main" }
                : undefined,
            }}
          />
        </Stack>

        {/* ── Статус ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Статус
          </Typography>
          <TextField
            select
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
            fullWidth
            disabled={busy}
          >
            {STATUS_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {/* ── Тип сотрудника ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Тип сотрудника
          </Typography>
          <TextField
            select
            value={clinicalRole}
            onChange={(e) => setClinicalRole(e.target.value as "doctor" | "nurse" | "other")}
            fullWidth
            disabled={busy}
          >
            <MenuItem value="doctor">Врач</MenuItem>
            <MenuItem value="nurse">Медсестра</MenuItem>
            <MenuItem value="other">Другой сотрудник</MenuItem>
          </TextField>
        </Stack>

        {/* ── Специализации (только для врача) ── */}
        {clinicalRole === "doctor" && (canViewSpecs || canManageSpecs) && record && (
          <>
            <Divider />
            <SpecializationBlock
              employeeId={Number(record.id)}
              currentSpecializations={specializations}
              onSpecializationsChange={setSpecializations}
              canView={canViewSpecs}
              canManage={canManageSpecs}
              disabled={busy}
            />
          </>
        )}

        {/* ── Дата рождения ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Дата рождения
          </Typography>
          <CustomDatePicker
            value={birthDate ? dayjs(birthDate) : null}
            onChange={(val) => {
              const str = val ? val.format("YYYY-MM-DD") : "";
              setBirthDate(str);
              touch("birthDate");
            }}
            slotProps={{
              textField: {
                fullWidth: true,
                InputLabelProps: { shrink: true },
                placeholder: "дд.мм.гггг",
                disabled: busy,
                onBlur: () => touch("birthDate"),
                error: Boolean(showError("birthDate")),
                helperText: showError("birthDate"),
              },
            }}
          />
        </Stack>

        {/* ── Telegram ID ── */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Telegram ID
          </Typography>
          <TextField
            value={telegramId}
            onChange={(e) => {
              // Only digits allowed
              const digits = e.target.value.replace(/\D/g, "").slice(0, 20);
              setTelegramId(digits);
              setServerError(null);
            }}
            onBlur={() => touch("telegramId")}
            fullWidth
            placeholder="Числовой ID"
            disabled={busy}
            inputProps={{ inputMode: "numeric" }}
            error={Boolean(showError("telegramId"))}
            helperText={showError("telegramId")}
          />
        </Stack>

        {/* ── Приватные поля ── */}
        {canManagePrivate && (
          <>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Номер расчётного счёта
              </Typography>
              <TextField
                value={bankAccountNumber}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 16);
                  setBankAccountNumber(v);
                  setServerError(null);
                }}
                onBlur={() => touch("bankAccountNumber")}
                fullWidth
                placeholder="0000000000000000"
                disabled={busy}
                inputProps={{ inputMode: "numeric" }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <CreditCardOutlined fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                error={Boolean(showError("bankAccountNumber"))}
                helperText={showError("bankAccountNumber") || `${bankAccountNumber.length}/16`}
              />
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                ИНН
              </Typography>
              <TextField
                value={inn}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 14);
                  setInn(v);
                  setServerError(null);
                }}
                onBlur={() => touch("inn")}
                fullWidth
                placeholder="00000000000000"
                disabled={busy}
                inputProps={{ inputMode: "numeric" }}
                error={Boolean(showError("inn"))}
                helperText={showError("inn") || `${inn.length}/14`}
              />
            </Stack>
          </>
        )}

        {/* ── Документы ── */}
        {(canViewDocs || canManageDocs) && record && (
          <>
            <Divider />
            <DocumentsBlock
              employeeId={Number(record.id)}
              canView={canViewDocs}
              canManage={canManageDocs}
              disabled={busy}
            />
          </>
        )}
      </Stack>
    </DrawerBase>
  );
};

export default DjangoEditEmployeeDrawer;
