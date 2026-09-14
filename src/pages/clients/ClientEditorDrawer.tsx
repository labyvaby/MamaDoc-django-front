import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import dayjs from "dayjs";
import { CustomDatePicker, PhoneCountryCodeSelect } from "../../components/ui";
import {
  composePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  formatPhoneLocalDisplay,
  getPhoneLocalMaxLength,
  handlePhonePaste,
  parsePhone,
  type PhoneCountryCode,
} from "../../utility/phone";
import { usePhoneLocalInput } from "../../hooks/usePhoneLocalInput";
import { formatPatientAge } from "../../utility/age";
import {
  createClient,
  deleteClientPhoto,
  updateClient,
  uploadClientPhoto,
  type ClientStatus,
  type DjangoClientStatus,
  type ClientType,
  type DjangoClient,
} from "../../api/clients";
import PatientPhotoUploader from "../../components/patients/PatientPhotoUploader";
import AddressAutocomplete from "../../components/patients/AddressAutocomplete";

type Props = {
  open: boolean;
  organizationId: number | null;
  client: DjangoClient | null;
  onClose: () => void;
  onSaved: (client: DjangoClient) => void;
  statuses: DjangoClientStatus[];
};

type Draft = {
  fullName: string;
  phone: string;
  phoneCountryCode: PhoneCountryCode;
  email: string;
  dob: string;
  address: string;
  clientType: ClientType;
  status: ClientStatus;
  note: string;
  legalName: string;
  inn: string;
  okpo: string;
  legalAddress: string;
  bankName: string;
  bankAccount: string;
  bankBik: string;
  customerStatusId: number | null;
  isBlacklisted: boolean;
  blacklistReason: string;
};

const emptyDraft: Draft = {
  fullName: "",
  phone: "",
  phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
  email: "",
  dob: "",
  address: "",
  clientType: "individual",
  status: "new",
  note: "",
  legalName: "",
  inn: "",
  okpo: "",
  legalAddress: "",
  bankName: "",
  bankAccount: "",
  bankBik: "",
  customerStatusId: null,
  isBlacklisted: false,
  blacklistReason: "",
};

function toDraft(client: DjangoClient | null): Draft {
  if (!client) return { ...emptyDraft };
  const parsedPhone = parsePhone(client.phone || "");
  return {
    fullName: client.fullName,
    phone: parsedPhone.local,
    phoneCountryCode: parsedPhone.countryCode,
    email: client.email,
    dob: client.dob || "",
    address: client.address || "",
    clientType: client.clientType,
    status: client.status,
    note: client.note,
    legalName: client.legalName,
    inn: client.inn,
    okpo: client.okpo,
    legalAddress: client.legalAddress,
    bankName: client.bankName,
    bankAccount: client.bankAccount,
    bankBik: client.bankBik,
    customerStatusId: client.customerStatus?.id ?? null,
    isBlacklisted: client.isBlacklisted,
    blacklistReason: client.blacklistReason,
  };
}

export default function ClientEditorDrawer({ open, organizationId, client, onClose, onSaved, statuses }: Props) {
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(client));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = React.useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const phoneInput = usePhoneLocalInput(
    draft.phoneCountryCode,
    draft.phone,
    (value) => set("phone", value),
    (value) => set("phoneCountryCode", value),
  );

  React.useEffect(() => {
    if (!open) return;
    setDraft(toDraft(client));
    setError("");
    setPhotoFile(null);
    setPhotoPreview(client?.photoUrl ?? null);
    setPhotoRemoved(false);
    if (!client && statuses.length > 0) {
      setDraft((current) => ({ ...current, customerStatusId: statuses.find((item) => item.code === "regular")?.id ?? statuses[0].id }));
    }
  }, [open, client, statuses]);

  const handlePickPhoto = React.useCallback((file: File | null) => {
    setPhotoRemoved(false);
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : client?.photoUrl ?? null);
  }, [client?.photoUrl]);

  const handleRemovePhoto = () => {
    setPhotoRemoved(Boolean(client?.photoUrl));
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const submit = async () => {
    if (!organizationId || !draft.fullName.trim()) {
      setError("Укажите имя или название клиента.");
      return;
    }

    const fullPhone = composePhone(draft.phoneCountryCode, draft.phone) ?? "";
    if (!client && !fullPhone) {
      setError("Укажите номер телефона клиента.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = {
        fullName: draft.fullName.trim(),
        email: draft.email.trim(),
        dob: draft.dob || null,
        address: draft.address.trim(),
        clientType: draft.clientType,
        status: draft.status,
        customerStatusId: draft.customerStatusId,
        isBlacklisted: draft.isBlacklisted,
        blacklistReason: draft.blacklistReason.trim(),
        note: draft.note.trim(),
        legalName: draft.legalName.trim(),
        inn: draft.inn.trim(),
        okpo: draft.okpo.trim(),
        legalAddress: draft.legalAddress.trim(),
        bankName: draft.bankName.trim(),
        bankAccount: draft.bankAccount.trim(),
        bankBik: draft.bankBik.trim(),
      };
      const saved = client
        ? await updateClient(client.id, organizationId, payload)
        : await createClient({ organizationId, phone: fullPhone, ...payload });

      let finalClient = saved;
      if (photoFile) {
        finalClient = await uploadClientPhoto(saved.id, photoFile);
      } else if (photoRemoved && client) {
        await deleteClientPhoto(saved.id, organizationId);
        finalClient = { ...saved, photoUrl: null };
      }

      onSaved(finalClient);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить клиента.");
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
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1 }}>
          <Typography variant="h6">{client ? "Редактировать клиента" : "Добавить клиента"}</Typography>
          <Button onClick={onClose} disabled={busy} aria-label="Закрыть" sx={{ minWidth: 40, width: 40, height: 40, p: 0, color: "text.primary" }}>
            <CloseOutlined />
          </Button>
        </Stack>
        <Divider />

        <Box sx={{ p: 2, flex: 1, overflowY: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
          <Stack spacing={3}>
            {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}

            <PatientPhotoUploader photoFile={photoFile} photoPreview={photoPreview} onPickPhoto={handlePickPhoto} inputId="client-photo" disabled={busy} />
            {photoPreview && !photoFile && !photoRemoved && (
              <Button variant="text" color="error" size="small" startIcon={<DeleteOutline />} onClick={handleRemovePhoto}>
                Удалить фото
              </Button>
            )}

            <SectionLabel>Основное</SectionLabel>
            <TextField label="Имя или название *" placeholder="Введите имя клиента" value={draft.fullName} onChange={(event) => set("fullName", event.target.value)} required fullWidth autoFocus />
            <FormControl fullWidth>
              <InputLabel>Тип клиента</InputLabel>
              <Select value={draft.clientType} label="Тип клиента" onChange={(event) => set("clientType", event.target.value as ClientType)}>
                <MenuItem value="individual">Физическое лицо</MenuItem>
                <MenuItem value="company">Компания</MenuItem>
              </Select>
            </FormControl>

            <Divider />
            <SectionLabel>Контакты</SectionLabel>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Телефон *</Typography>
              <TextField
                value={formatPhoneLocalDisplay(draft.phoneCountryCode, draft.phone)}
                inputRef={phoneInput.inputRef}
                onChange={phoneInput.onChange}
                onKeyDown={phoneInput.onKeyDown}
                onPaste={(event) => handlePhonePaste(event, draft.phoneCountryCode, (code, local) => { set("phoneCountryCode", code); set("phone", local); })}
                fullWidth
                size="small"
                disabled={busy || Boolean(client)}
                helperText={client ? "Телефон нельзя изменить в этой форме" : undefined}
                InputProps={{ startAdornment: <PhoneCountryCodeSelect value={draft.phoneCountryCode} onChange={(code) => set("phoneCountryCode", code)} /> }}
                inputProps={{ inputMode: "tel", pattern: "[0-9]*" }}
                placeholder={getPhoneLocalMaxLength(draft.phoneCountryCode) === 10 ? "XXX XXX XXXX" : "XXX XXX XXX"}
              />
            </Stack>
            <TextField label="Email" placeholder="client@example.com" value={draft.email} onChange={(event) => set("email", event.target.value)} fullWidth />

            {draft.clientType === "individual" && (
              <>
                <Stack spacing={0.5}>
                  <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Дата рождения</Typography>
                    {formatPatientAge(draft.dob) && <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>{formatPatientAge(draft.dob)}</Typography>}
                  </Stack>
                  <CustomDatePicker value={draft.dob ? dayjs(draft.dob) : null} onChange={(value) => set("dob", value ? value.format("YYYY-MM-DD") : "")} slotProps={{ textField: { fullWidth: true, size: "small", InputLabelProps: { shrink: true }, placeholder: "ДД.ММ.ГГГГ", disabled: busy } }} />
                </Stack>
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Адрес</Typography>
                  <AddressAutocomplete value={draft.address} onChange={(value) => set("address", value)} disabled={busy} />
                </Stack>
              </>
            )}

            {draft.clientType === "company" && (
              <>
                <Divider />
                <Stack direction="row" alignItems="center" gap={0.75}><BusinessOutlined color="primary" fontSize="small" /><SectionLabel>Реквизиты компании</SectionLabel></Stack>
                <TextField label="Юридическое название" value={draft.legalName} onChange={(event) => set("legalName", event.target.value)} fullWidth />
                <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}><TextField label="ИНН" value={draft.inn} onChange={(event) => set("inn", event.target.value)} fullWidth /><TextField label="ОКПО" value={draft.okpo} onChange={(event) => set("okpo", event.target.value)} fullWidth /></Stack>
                <TextField label="Юридический адрес" value={draft.legalAddress} onChange={(event) => set("legalAddress", event.target.value)} fullWidth />
                <TextField label="Банк" value={draft.bankName} onChange={(event) => set("bankName", event.target.value)} fullWidth />
                <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}><TextField label="Расчётный счёт" value={draft.bankAccount} onChange={(event) => set("bankAccount", event.target.value)} fullWidth /><TextField label="БИК" value={draft.bankBik} onChange={(event) => set("bankBik", event.target.value)} fullWidth /></Stack>
              </>
            )}

            <Divider />
            <SectionLabel>Дополнительно</SectionLabel>
            <FormControl fullWidth>
              <InputLabel>Статус</InputLabel>
              <Select value={draft.status} label="Статус" onChange={(event) => set("status", event.target.value as ClientStatus)}>
                <MenuItem value="new">Новый</MenuItem>
                <MenuItem value="active">Активен</MenuItem>
                <MenuItem value="inactive">Неактивен</MenuItem>
                <MenuItem value="no_offering">Без покупок</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Статус клиента</InputLabel>
              <Select value={draft.customerStatusId ?? ""} label="Статус клиента" onChange={(event) => set("customerStatusId", event.target.value ? Number(event.target.value) : null)}>
                {statuses.map((status) => <MenuItem key={status.id} value={status.id}>{status.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Switch checked={draft.isBlacklisted} onChange={(_, checked) => set("isBlacklisted", checked)} />}
              label="Чёрный список клиентов"
            />
            {draft.isBlacklisted && <TextField label="Причина добавления в ЧС *" value={draft.blacklistReason} onChange={(event) => set("blacklistReason", event.target.value)} multiline minRows={2} fullWidth required />}
            <TextField label="Примечание" placeholder="Дополнительная информация" value={draft.note} onChange={(event) => set("note", event.target.value)} multiline minRows={3} fullWidth />
          </Stack>
        </Box>

        <Divider />
        <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2, py: 1.5 }}>
          <Button onClick={onClose} disabled={busy}>Отмена</Button>
          <Button variant="contained" onClick={() => void submit()} disabled={busy} sx={{ minWidth: 120 }}>
            {busy ? <CircularProgress size={20} /> : "Сохранить"}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Typography variant="subtitle2" color="text.secondary" fontWeight={700}>{children}</Typography>;
}
