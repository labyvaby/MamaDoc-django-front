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
import { updateEmployee, getDjangoEmployee } from "../../../api/staff";
import type { DjangoSpecializationShort } from "../../../api/staff";
import type { EmployesRow } from "../types";
import { useCan } from "../../../hooks/useCan";
import { CustomDatePicker } from "../../../components/ui";
import dayjs from "dayjs";
import SpecializationBlock from "./SpecializationBlock";
import DocumentsBlock from "./DocumentsBlock";

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

  const [fullName, setFullName] = React.useState("");
  const [specializations, setSpecializations] = React.useState<DjangoSpecializationShort[]>([]);
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"active" | "inactive">("active");
  const [telegramId, setTelegramId] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [bankAccountNumber, setBankAccountNumber] = React.useState("");
  const [inn, setInn] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!record) return;

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
    setNotes(record.nickname || "");
    setBankAccountNumber(record.bank_account_number || "");
    setInn(record.inn || "");
    setSpecializations(record._djangoSpecializations ?? []);
    setError(null);

    const empId = Number(record.id);
    if (isNaN(empId) || empId <= 0) return;
    const ctrl = new AbortController();
    getDjangoEmployee(empId, ctrl.signal)
      .then((full) => {
        if (ctrl.signal.aborted) return;
        setTelegramId(full.telegramId || "");
        setBirthDate(full.birthDate || "");
        setNotes(full.notes || "");
        setBankAccountNumber(full.bankAccountNumber || "");
        setInn(full.inn || "");
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
        notes: notes.trim() || null,
      };
      if (canManagePrivate) {
        payload.bankAccountNumber = bankAccountNumber.trim() || null;
        payload.inn = inn.trim() || null;
      }

      await updateEmployee(empId, payload);

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
        nickname: updated.notes || null,
        role_id: updated.role ? String(updated.role.id) : null,
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

        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Заметки
          </Typography>
          <TextField
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 100))}
            fullWidth
            multiline
            minRows={2}
            placeholder="Дополнительная информация (до 100 символов)"
            helperText={`${notes.length}/100`}
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

        {(canViewSpecs || canManageSpecs) && record && (
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
