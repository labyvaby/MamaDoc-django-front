import React from "react";
import {
  Alert,
  Divider,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import { useNotification } from "@refinedev/core";
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
import dayjs from "dayjs";
import SpecializationBlock from "./SpecializationBlock";
import DocumentsBlock from "./DocumentsBlock";
import ServicePhotoUploader from "../../../components/services/ServicePhotoUploader";

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
  const [fullName, setFullName] = React.useState("");
  const [specializations, setSpecializations] = React.useState<DjangoSpecializationShort[]>([]);
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"active" | "inactive">("active");
  const [telegramId, setTelegramId] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [bankAccountNumber, setBankAccountNumber] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [clinicalRole, setClinicalRole] = React.useState<"doctor" | "nurse" | "other">("other");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

  React.useEffect(() => {
    if (!record) return;

    setPhotoFile(null);
    setPhotoPreview(record.photo_url || null);
    setFullName(record.full_name || "");
    setPhone(record.phone || "");
    setEmail(record.email || "");
    setStatus(
      record.status === "active" || record.status === "inactive"
        ? record.status
        : "active",
    );
    setTelegramId(record.telegram_id || "");
    setBirthDate(record.birth_date || "");
    setBankAccountNumber(record.bank_account_number || "");
    setInn(record.inn || "");
    setClinicalRole(
      record.clinicalRole === "doctor" || record.clinicalRole === "nurse"
        ? record.clinicalRole
        : "other",
    );
    setSpecializations(record._djangoSpecializations ?? []);
    setError(null);

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
      })
      .catch((e) => {
        if ((e as Error)?.name !== "AbortError") {
          console.warn("Could not fetch full employee detail:", e);
        }
      });
    return () => ctrl.abort();
  }, [record]);

  const handleSubmit = async () => {
    if (!record) return;
    const empId = Number(record.id);
    if (isNaN(empId) || empId <= 0) return;

    if (!fullName.trim()) {
      setError("Имя сотрудника обязательно");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        status,
        telegramId: telegramId.trim() || null,
        birthDate: birthDate || null,
        clinicalRole,
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
      setError(msg);
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
    >
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}

        {/* ── Фото ── */}
        <ServicePhotoUploader
          photoFile={photoFile}
          photoPreview={photoPreview}
          onPickPhoto={handlePickPhoto}
          inputId="edit-employee-photo"
        />

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            ФИО
          </Typography>
          <TextField
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            fullWidth
            placeholder="Введите ФИО сотрудника"
            disabled={busy}
          />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Телефон
          </Typography>
          <TextField
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            fullWidth
            placeholder="+996 XXX XXX XXX"
            disabled={busy}
            inputProps={{ inputMode: "tel" }}
          />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Email
          </Typography>
          <TextField
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            placeholder="example@mail.com"
            type="email"
            disabled={busy}
          />
        </Stack>

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

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Тип сотрудника
          </Typography>
          <TextField
            select
            value={clinicalRole}
            onChange={(e) => {
              const next = e.target.value as "doctor" | "nurse" | "other";
              setClinicalRole(next);
            }}
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

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Дата рождения
          </Typography>
          <CustomDatePicker
            value={birthDate ? dayjs(birthDate) : null}
            onChange={(val) => setBirthDate(val ? val.format("YYYY-MM-DD") : "")}
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

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Telegram ID
          </Typography>
          <TextField
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            fullWidth
            placeholder="@username или числовой ID"
            disabled={busy}
          />
        </Stack>

        {canManagePrivate && (
          <>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Номер расчётного счёта
              </Typography>
              <TextField
                value={bankAccountNumber}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 16);
                  setBankAccountNumber(v);
                }}
                fullWidth
                placeholder="0000 0000 0000 0000"
                disabled={busy}
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
          </>
        )}

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
