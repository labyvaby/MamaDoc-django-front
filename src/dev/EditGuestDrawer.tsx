/**
 * Правка карточки гостя — кнопка «Изменить» в GuestCardPanel (страница
 * «Гости» и карточка гостя с шахматки). PATCH /hotel/guests/{id}/ уходит
 * только с изменёнными полями: реквизиты документа без права
 * hotel.guests.documents бэк не принимает (400), а нетронутые поля не должны
 * перезаписываться тем, что форма показала.
 *
 * Там же — удаление гостя (DELETE). Бэк удаляет только гостя без броней;
 * если брони есть, кнопка сразу неактивна с причиной, а не падает 409.
 *
 * Дату рождения бэк стереть не умеет (в PATCH нет флага очистки) — её можно
 * только заменить. Срок действия и дату выдачи документа — можно
 * (clearDocumentExpiry / clearIssueDate).
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import FingerprintOutlined from "@mui/icons-material/FingerprintOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import PublicOutlined from "@mui/icons-material/PublicOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import WcOutlined from "@mui/icons-material/WcOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../components/ui";
import { useCan } from "../hooks/useCan";
import { capitalizeFullName } from "../utility/name";
import { deleteGuest, updateGuest, type HotelGuest, type HotelGuestUpdateData } from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { FormField } from "./formField";
import { FieldIcon } from "./FieldIcon";
import { fieldError, focusFirstFieldError, GUEST_RULES, hasFieldErrors, type FieldRules } from "./formRules";
import { HOTEL_BOOKING_SOURCE_LABELS, HOTEL_GUEST_TYPE_LABELS } from "./hotelDisplay";
import { DRAWER_WIDTH, DisabledReason, DrawerFooter, DrawerHeader, DrawerSection } from "./hotelUi";

type GuestType = "resident" | "foreign";

interface GuestForm {
  fullName: string;
  phone: string;
  email: string;
  dob: string;
  gender: string;
  guestType: GuestType;
  source: string;
  preferences: string;
  isVip: boolean;
  marketingConsent: boolean;
  // Документ
  documentNumber: string;
  inn: string;
  citizenship: string;
  passportCountry: string;
  placeOfBirth: string;
  issueDate: string;
  issuingAuthority: string;
  documentExpiry: string;
  registrationAddress: string;
}

const NAME_RULES = { required: true, maxLength: 200 };

function formFromGuest(g: HotelGuest): GuestForm {
  return {
    fullName: g.fullName,
    phone: g.phone ?? "",
    email: g.email ?? "",
    dob: g.dob ?? "",
    gender: g.gender ?? "",
    guestType: g.guestType === "foreign" ? "foreign" : "resident",
    source: g.source ?? "",
    preferences: g.preferences ?? "",
    isVip: g.isVip,
    marketingConsent: g.marketingConsent,
    documentNumber: g.documentNumber ?? "",
    inn: g.inn ?? "",
    citizenship: g.citizenship ?? "",
    passportCountry: g.passportCountry ?? "",
    placeOfBirth: g.placeOfBirth ?? "",
    issueDate: g.issueDate ?? "",
    issuingAuthority: g.issuingAuthority ?? "",
    documentExpiry: g.documentExpiry ?? "",
    registrationAddress: g.registrationAddress ?? "",
  };
}

const TEXT_KEYS = [
  "phone",
  "email",
  "gender",
  "source",
  "preferences",
  "citizenship",
] as const;
const DOCUMENT_TEXT_KEYS = [
  "documentNumber",
  "inn",
  "passportCountry",
  "placeOfBirth",
  "issuingAuthority",
  "registrationAddress",
] as const;

/** Только изменённые поля. Документ — только с правом на документы. */
function buildPatch(initial: GuestForm, next: GuestForm, withDocuments: boolean): HotelGuestUpdateData {
  const patch: HotelGuestUpdateData = {};
  const name = capitalizeFullName(next.fullName.trim());
  if (name !== initial.fullName) patch.fullName = name;
  for (const key of TEXT_KEYS) {
    const value = next[key].trim();
    if (value !== initial[key].trim()) patch[key] = value;
  }
  if (next.dob && next.dob !== initial.dob) patch.dob = next.dob;
  if (next.guestType !== initial.guestType) patch.guestType = next.guestType;
  if (next.isVip !== initial.isVip) patch.isVip = next.isVip;
  if (next.marketingConsent !== initial.marketingConsent) patch.marketingConsent = next.marketingConsent;
  if (withDocuments) {
    for (const key of DOCUMENT_TEXT_KEYS) {
      const value = next[key].trim();
      if (value !== initial[key].trim()) patch[key] = value;
    }
    if (next.guestType !== initial.guestType) patch.documentType = next.guestType === "resident" ? "id_card" : "passport";
    if (next.issueDate !== initial.issueDate) {
      if (next.issueDate) patch.issueDate = next.issueDate;
      else patch.clearIssueDate = true;
    }
    if (next.documentExpiry !== initial.documentExpiry) {
      if (next.documentExpiry) patch.documentExpiry = next.documentExpiry;
      else patch.clearDocumentExpiry = true;
    }
  }
  return patch;
}

const toDayjs = (iso: string): Dayjs | null => (iso ? dayjs(iso) : null);
const fromDayjs = (d: Dayjs | null): string => (d && d.isValid() ? d.format("YYYY-MM-DD") : "");

export interface EditGuestDrawerProps {
  guest: HotelGuest | null;
  open: boolean;
  /** У гостя есть брони — удалить нельзя (бэк ответит 409). */
  hasReservations: boolean;
  onClose: () => void;
  onDeleted?: (clientId: number) => void;
}

export const EditGuestDrawer: React.FC<EditGuestDrawerProps> = ({ guest, open, hasReservations, onClose, onDeleted }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("hotel.guests.manage");
  const canDocuments = useCan("hotel.guests.documents");
  // Без права на документы бэк отдаёт реквизиты null — править там нечего.
  const withDocuments = canDocuments && guest != null && guest.documentType !== null;

  const initial = React.useMemo(() => (guest ? formFromGuest(guest) : null), [guest]);
  const [form, setForm] = React.useState<GuestForm | null>(initial);
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Каждое открытие — с актуальной карточки, без прошлых ошибок.
  React.useEffect(() => {
    if (!open) return;
    setForm(initial);
    setShowErrors(false);
    setError(null);
    setConfirmDelete(false);
    setDeleteError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guest?.clientId]);

  if (!guest || !form || !initial) return null;

  const set = <K extends keyof GuestForm>(key: K, value: GuestForm[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const isResident = form.guestType === "resident";
  const patch = buildPatch(initial, form, withDocuments);
  const dirty = Object.keys(patch).length > 0;
  const dobCleared = initial.dob !== "" && form.dob === "";
  // Проверяем только то, что правят: старые данные в непривычном формате
  // (номер документа, заведённый до проверок) не должны мешать сохранить,
  // например, новый телефон.
  const rule = (key: keyof GuestForm, rules: FieldRules): FieldRules => (form[key] === initial[key] ? {} : rules);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "guest", guest.clientId] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "guests"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
  };

  const handleSave = async () => {
    const invalid =
      hasFieldErrors([
        [form.fullName, NAME_RULES],
        [form.phone, rule("phone", GUEST_RULES.phone)],
        [form.email, rule("email", GUEST_RULES.email)],
        [form.preferences, rule("preferences", GUEST_RULES.comment)],
        [!isResident ? form.citizenship : "", rule("citizenship", GUEST_RULES.short)],
        ...(withDocuments
          ? ([
              [form.placeOfBirth, rule("placeOfBirth", GUEST_RULES.short)],
              [form.issuingAuthority, rule("issuingAuthority", GUEST_RULES.short)],
              [isResident ? form.documentNumber : "", rule("documentNumber", GUEST_RULES.idNumber)],
              [isResident ? form.inn : "", rule("inn", GUEST_RULES.inn)],
              [isResident ? form.registrationAddress : "", rule("registrationAddress", GUEST_RULES.long)],
              [!isResident ? form.documentNumber : "", rule("documentNumber", GUEST_RULES.docNumber)],
              [!isResident ? form.passportCountry : "", rule("passportCountry", GUEST_RULES.short)],
            ] as Array<[string, FieldRules]>)
          : []),
      ]) || dobCleared;
    if (invalid) {
      setShowErrors(true);
      focusFirstFieldError();
      return;
    }
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateGuest(guest.clientId, patch);
      invalidate();
      enqueueSnackbar("Карточка гостя сохранена", { variant: "success" });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось сохранить карточку гостя"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteGuest(guest.clientId);
      invalidate();
      enqueueSnackbar(`Гость «${guest.fullName}» удалён`, { variant: "success" });
      setConfirmDelete(false);
      onDeleted?.(guest.clientId);
      onClose();
    } catch (err) {
      setDeleteError(getErrorMessage(err, "Не удалось удалить гостя"));
    } finally {
      setDeleting(false);
    }
  };

  const busy = saving || deleting;
  const deleteReason = !canManage
    ? "Нет права на изменение гостей"
    : hasReservations
      ? "У гостя есть брони — такую карточку удалить нельзя"
      : null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={() => !busy && onClose()}
      PaperProps={{ sx: { width: DRAWER_WIDTH, maxWidth: "100vw", display: "flex", flexDirection: "column", backgroundImage: "none" } }}
    >
      <DrawerHeader title="Карточка гостя" subtitle={guest.fullName} onClose={() => !busy && onClose()} />

      <Box sx={{ px: 3, py: 3, flex: 1, overflowY: "auto" }}>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}
          {!canManage && (
            <Alert severity="info" variant="outlined">
              Изменять карточки гостей может сотрудник с правом «Гости: управление».
            </Alert>
          )}

          <DrawerSection label="Гость" first>
            <FormField
              icon={<PersonOutlineOutlined />}
              label="Имя и фамилия"
              value={form.fullName}
              onValueChange={(v) => set("fullName", v)}
              onBlur={() => set("fullName", capitalizeFullName(form.fullName))}
              rules={NAME_RULES}
              showErrors={showErrors}
              disabled={busy || !canManage}
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
              <FormField
                icon={<PhoneOutlined />}
                label="Телефон"
                value={form.phone}
                onValueChange={(v) => set("phone", v)}
                rules={rule("phone", GUEST_RULES.phone)}
                showErrors={showErrors}
                disabled={busy || !canManage}
                placeholder="+996 700 000 000"
                sx={{ flex: 1 }}
              />
              <FormField
                icon={<EmailOutlined />}
                label="Эл. почта"
                value={form.email}
                onValueChange={(v) => set("email", v)}
                rules={rule("email", GUEST_RULES.email)}
                showErrors={showErrors}
                disabled={busy || !canManage}
                sx={{ flex: 1 }}
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
              <CustomDatePicker
                label="Дата рождения"
                value={toDayjs(form.dob)}
                onChange={(d) => set("dob", fromDayjs(d as Dayjs | null))}
                disableFuture
                disabled={busy || !canManage}
                slotProps={{
                  textField: {
                    error: showErrors && dobCleared,
                    helperText: dobCleared ? "Дату рождения можно изменить, но не стереть" : undefined,
                  },
                }}
                sx={{ flex: 1 }}
              />
              <TextField
                select
                label="Пол"
                value={form.gender}
                onChange={(e) => set("gender", e.target.value)}
                disabled={busy || !canManage}
                slotProps={{ input: { startAdornment: <FieldIcon icon={<WcOutlined />} /> } }}
                sx={{ flex: 1 }}
              >
                <MenuItem value="">Не указан</MenuItem>
                <MenuItem value="male">Мужской</MenuItem>
                <MenuItem value="female">Женский</MenuItem>
              </TextField>
            </Stack>
          </DrawerSection>

          <DrawerSection label="Документ">
            <ToggleButtonGroup
              value={form.guestType}
              exclusive
              size="small"
              disabled={busy || !canManage}
              onChange={(_, value: GuestType | null) => value && set("guestType", value)}
            >
              <ToggleButton value="resident">{HOTEL_GUEST_TYPE_LABELS.resident ?? "Гражданин КР"}</ToggleButton>
              <ToggleButton value="foreign">{HOTEL_GUEST_TYPE_LABELS.foreign ?? "Иностранец"}</ToggleButton>
            </ToggleButtonGroup>
            {!isResident && (
              <FormField
                icon={<PublicOutlined />}
                label="Гражданство"
                value={form.citizenship}
                onValueChange={(v) => set("citizenship", v)}
                rules={rule("citizenship", GUEST_RULES.short)}
                showErrors={showErrors}
                disabled={busy || !canManage}
                fullWidth
              />
            )}
            {withDocuments ? (
              <Stack spacing={2}>
                <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                  <FormField
                    icon={<BadgeOutlined />}
                    label={isResident ? "Паспорт (ID-карта)" : "Номер загранпаспорта"}
                    value={form.documentNumber}
                    onValueChange={(v) => set("documentNumber", v)}
                    rules={rule("documentNumber", isResident ? GUEST_RULES.idNumber : GUEST_RULES.docNumber)}
                    showErrors={showErrors}
                    disabled={busy || !canManage}
                    sx={{ flex: 1 }}
                  />
                  {isResident ? (
                    <FormField
                      icon={<FingerprintOutlined />}
                      label="ИНН"
                      value={form.inn}
                      onValueChange={(v) => set("inn", v)}
                      rules={rule("inn", GUEST_RULES.inn)}
                      showErrors={showErrors}
                      disabled={busy || !canManage}
                      sx={{ flex: 1 }}
                    />
                  ) : (
                    <FormField
                      icon={<FlagOutlined />}
                      label="Страна выдачи"
                      value={form.passportCountry}
                      onValueChange={(v) => set("passportCountry", v)}
                      rules={rule("passportCountry", GUEST_RULES.short)}
                      showErrors={showErrors}
                      disabled={busy || !canManage}
                      sx={{ flex: 1 }}
                    />
                  )}
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                  <CustomDatePicker
                    label="Дата выдачи"
                    value={toDayjs(form.issueDate)}
                    onChange={(d) => set("issueDate", fromDayjs(d as Dayjs | null))}
                    disableFuture
                    disabled={busy || !canManage}
                    sx={{ flex: 1 }}
                  />
                  <CustomDatePicker
                    label="Действителен до"
                    value={toDayjs(form.documentExpiry)}
                    onChange={(d) => set("documentExpiry", fromDayjs(d as Dayjs | null))}
                    disabled={busy || !canManage}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                  <FormField
                    icon={<PlaceOutlined />}
                    label="Место рождения"
                    value={form.placeOfBirth}
                    onValueChange={(v) => set("placeOfBirth", v)}
                    rules={rule("placeOfBirth", GUEST_RULES.short)}
                    showErrors={showErrors}
                    disabled={busy || !canManage}
                    sx={{ flex: 1 }}
                  />
                  <FormField
                    icon={<AccountBalanceOutlined />}
                    label="Орган, выдавший документ"
                    value={form.issuingAuthority}
                    onValueChange={(v) => set("issuingAuthority", v)}
                    rules={rule("issuingAuthority", GUEST_RULES.short)}
                    showErrors={showErrors}
                    disabled={busy || !canManage}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                {isResident && (
                  <FormField
                    icon={<HomeOutlined />}
                    label="Адрес регистрации"
                    value={form.registrationAddress}
                    onValueChange={(v) => set("registrationAddress", v)}
                    rules={rule("registrationAddress", GUEST_RULES.long)}
                    showErrors={showErrors}
                    disabled={busy || !canManage}
                    fullWidth
                  />
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Реквизиты документа видит и меняет сотрудник с правом «Паспортные данные».
              </Typography>
            )}
          </DrawerSection>

          <DrawerSection label="Дополнительно">
            <TextField
              select
              label="Откуда пришёл гость"
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
              disabled={busy || !canManage}
              slotProps={{ input: { startAdornment: <FieldIcon icon={<LanguageOutlined />} /> } }}
              fullWidth
            >
              <MenuItem value="">Не указан</MenuItem>
              {Object.entries(HOTEL_BOOKING_SOURCE_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <FormField
              icon={<NotesOutlined />}
              label="Предпочтения"
              placeholder="Высокий этаж, без перьевых подушек, поздний завтрак…"
              value={form.preferences}
              onValueChange={(v) => set("preferences", v)}
              rules={rule("preferences", GUEST_RULES.comment)}
              showErrors={showErrors}
              disabled={busy || !canManage}
              multiline
              minRows={2}
              fullWidth
            />
            <Stack direction="row" gap={3} flexWrap="wrap">
              <FormControlLabel
                control={<Switch checked={form.isVip} onChange={(e) => set("isVip", e.target.checked)} disabled={busy || !canManage} />}
                label={<Typography variant="body2" fontWeight={600}>VIP-гость</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.marketingConsent}
                    onChange={(e) => set("marketingConsent", e.target.checked)}
                    disabled={busy || !canManage}
                  />
                }
                label={<Typography variant="body2" fontWeight={600}>Согласен на рассылку</Typography>}
              />
            </Stack>
          </DrawerSection>

          <Collapse in={showErrors && fieldError(form.fullName, NAME_RULES) != null}>
            <Alert severity="warning" variant="outlined">
              Укажите имя гостя.
            </Alert>
          </Collapse>
        </Stack>
      </Box>

      <DrawerFooter
        summary={
          <DisabledReason reason={deleteReason}>
            <Button
              color="error"
              startIcon={<DeleteOutlineOutlined />}
              onClick={() => setConfirmDelete(true)}
              disabled={busy || deleteReason != null}
            >
              Удалить
            </Button>
          </DisabledReason>
        }
      >
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          disableElevation
          onClick={() => void handleSave()}
          disabled={busy || !canManage || !dirty}
          sx={{ px: 3, borderRadius: "10px", fontWeight: 700 }}
        >
          {saving ? "Сохраняем…" : "Сохранить"}
        </Button>
      </DrawerFooter>

      <Dialog open={confirmDelete} onClose={() => !deleting && setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить гостя?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Карточка «{guest.fullName}» будет удалена вместе с фото и документами. Отменить это нельзя.
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)} disabled={deleting}>
            Отмена
          </Button>
          <Button color="error" variant="contained" disableElevation onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? "Удаляем…" : "Удалить"}
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
};

export default EditGuestDrawer;
