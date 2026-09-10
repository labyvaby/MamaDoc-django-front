import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import LinkRounded from "@mui/icons-material/LinkRounded";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PushPinOutlined from "@mui/icons-material/PushPinOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import SendRounded from "@mui/icons-material/SendRounded";
import { alpha } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import {
  billingApi,
  type BillingClient,
  type BillingContract,
  type ClientContact,
} from "../../api/billing";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";

type Props = {
  client: BillingClient | null;
  organizationId?: number;
  onClose: () => void;
  onEdit: (client: BillingClient) => void;
};

const money = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "KGS", maximumFractionDigits: 2 })
    .format(Number(value ?? 0));

const shortDate = (value: string | null | undefined) => value ? dayjs(value).format("DD.MM.YYYY") : "—";

const CONTRACT_STATUS: Record<string, string> = {
  active: "Активен",
  paused: "На паузе",
  ended: "Завершён",
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("ru")).join("") || "К";
}

function Fact({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="subtitle1" fontWeight={750} color={accent ? "error.main" : "text.primary"}>{value}</Typography>
    </Box>
  );
}

function ContractRow({ contract }: { contract: BillingContract }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
      <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={700} noWrap>{contract.name || contract.offeringName}</Typography>
          <Typography variant="body2" color="text.secondary">
            {contract.number ? `№ ${contract.number} · ` : ""}{contract.offeringName}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={CONTRACT_STATUS[contract.status] ?? contract.status}
          color={contract.status === "active" ? "success" : contract.status === "paused" ? "warning" : "default"}
        />
      </Stack>
      <Stack direction="row" spacing={3} sx={{ mt: 1.25 }}>
        <Fact label="Тариф" value={money(contract.effectivePrice)} />
        <Fact label="Следующее начисление" value={shortDate(contract.nextChargeOn)} />
        {Number(contract.debt) > 0 && <Fact label="Долг" value={money(contract.debt)} accent />}
      </Stack>
    </Paper>
  );
}

export function ClientCardDrawer({ client, organizationId, onClose, onEdit }: Props) {
  const clientId = client?.id;
  const open = client != null;
  const canViewCrm = useCan("clients.crm.view");
  const canManageCrm = useCan("clients.crm.manage");
  const canManageContacts = useCan("clients.manage");
  const { activeOrganization } = usePermissions();
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const [note, setNote] = React.useState("");
  const [important, setImportant] = React.useState(false);
  const [contactDialogOpen, setContactDialogOpen] = React.useState(false);
  const [editingContact, setEditingContact] = React.useState<ClientContact | null>(null);
  const [contactForm, setContactForm] = React.useState({ fullName: "", position: "", phone: "", email: "", isPrimary: false, note: "" });
  const cardKey = djangoQueryKeys.billing.clientCard(organizationId, clientId);
  const scope = React.useMemo(() => ({ ...(organizationId ? { organizationId } : {}) }), [organizationId]);
  const portalUrl = React.useMemo(() => {
    const slug = activeOrganization?.slug;
    return slug ? `${window.location.origin}/lk/${encodeURIComponent(slug)}` : "";
  }, [activeOrganization?.slug]);

  const copyPortalLink = React.useCallback(async () => {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      notify?.({ type: "success", message: "Ссылка на кабинет скопирована" });
    } catch {
      notify?.({ type: "error", message: "Не удалось скопировать ссылку" });
    }
  }, [notify, portalUrl]);

  const sharePortalLink = React.useCallback(async () => {
    if (!portalUrl || !client) return;
    const text = `${client.fullName}, ваш личный кабинет: ${portalUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Личный кабинет", text, url: portalUrl });
      } else {
        await navigator.clipboard.writeText(text);
        notify?.({ type: "success", message: "Сообщение со ссылкой скопировано" });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify?.({ type: "error", message: "Не удалось отправить ссылку" });
    }
  }, [client, notify, portalUrl]);

  const notesQuery = useQuery({
    queryKey: [...cardKey, "notes"],
    queryFn: () => billingApi.clientNotes(clientId!),
    enabled: open && canViewCrm,
  });
  const contractsQuery = useQuery({
    queryKey: [...cardKey, "contracts"],
    queryFn: () => billingApi.allContracts({ organizationId, clientId }),
    enabled: open,
  });
  const chargesQuery = useQuery({
    queryKey: [...cardKey, "charges"],
    queryFn: () => billingApi.allCharges({ organizationId, clientId }),
    enabled: open,
  });
  const paymentsQuery = useQuery({
    queryKey: [...cardKey, "payments"],
    queryFn: () => billingApi.allPayments({ organizationId, clientId }),
    enabled: open,
  });
  const contactsQuery = useQuery({
    queryKey: [...cardKey, "contacts"],
    queryFn: () => billingApi.clientContacts(clientId!, scope),
    enabled: open,
  });

  const invalidateCard = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: cardKey });
  }, [cardKey, queryClient]);

  const noteMutation = useMutation({
    mutationFn: () => billingApi.addClientNote(clientId!, note.trim(), important),
    onSuccess: async () => {
      setNote("");
      setImportant(false);
      await invalidateCard();
    },
    onError: (error) => notify?.({ type: "error", message: "Заметка не добавлена", description: getErrorMessage(error) }),
  });
  const pinMutation = useMutation({
    mutationFn: ({ noteId, isImportant }: { noteId: number; isImportant: boolean }) =>
      billingApi.setClientNoteImportance(clientId!, noteId, isImportant),
    onSuccess: invalidateCard,
    onError: (error) => notify?.({ type: "error", message: "Заметка не обновлена", description: getErrorMessage(error) }),
  });
  const contactMutation = useMutation({
    mutationFn: () => editingContact?.id
      ? billingApi.updateClientContact(clientId!, editingContact.id, contactForm, scope)
      : billingApi.addClientContact(clientId!, contactForm, scope),
    onSuccess: async () => {
      setContactDialogOpen(false);
      await invalidateCard();
      notify?.({ type: "success", message: editingContact ? "Контакт обновлён" : "Контакт добавлен" });
    },
    onError: (error) => notify?.({ type: "error", message: "Контакт не сохранён", description: getErrorMessage(error) }),
  });
  const deleteContactMutation = useMutation({
    mutationFn: (contactId: number) => billingApi.deleteClientContact(clientId!, contactId, scope),
    onSuccess: async () => {
      await invalidateCard();
      notify?.({ type: "success", message: "Контакт удалён" });
    },
    onError: (error) => notify?.({ type: "error", message: "Контакт не удалён", description: getErrorMessage(error) }),
  });

  const openContact = (contact?: ClientContact) => {
    setEditingContact(contact ?? null);
    setContactForm(contact ? {
      fullName: contact.fullName,
      position: contact.position,
      phone: contact.phone,
      email: contact.email,
      isPrimary: contact.isPrimary,
      note: contact.note,
    } : { fullName: "", position: "", phone: "", email: "", isPrimary: false, note: "" });
    setContactDialogOpen(true);
  };

  React.useEffect(() => {
    setNote("");
    setImportant(false);
    setContactDialogOpen(false);
    setEditingContact(null);
  }, [clientId]);

  const contracts = contractsQuery.data?.items ?? [];
  const charges = chargesQuery.data?.items ?? [];
  const payments = paymentsQuery.data?.items ?? [];
  const issuedTotal = charges
    .filter((charge) => charge.status !== "canceled")
    .reduce((sum, charge) => sum + Number(charge.amount), 0);
  const paidTotal = payments
    .filter((payment) => payment.status === "succeeded")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const contacts = contactsQuery.data ?? [];
  const loading = contractsQuery.isLoading || chargesQuery.isLoading || paymentsQuery.isLoading || contactsQuery.isLoading;
  const failed = contractsQuery.isError || chargesQuery.isError || paymentsQuery.isError || contactsQuery.isError;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 720, lg: 820 }, maxWidth: "100%" } }}
    >
      {client && (
        <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
          <Box
            sx={(theme) => ({
              px: { xs: 2, sm: 3 }, py: 2.5,
              bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.06),
              borderBottom: 1, borderColor: "divider",
            })}
          >
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <Avatar sx={{ width: 52, height: 52, bgcolor: "primary.main", fontWeight: 800 }}>{initials(client.fullName)}</Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="h5" fontWeight={800}>{client.fullName}</Typography>
                  <Chip size="small" variant="outlined" label={client.clientType === "company" ? "Компания" : "Физлицо"} />
                </Stack>
                {client.legalName && <Typography color="text.secondary">{client.legalName}{client.inn ? ` · ИНН ${client.inn}` : ""}</Typography>}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {[client.phone, client.email].filter(Boolean).join(" · ") || "Контакты не заполнены"}
                </Typography>
                {client.dob && <Typography variant="caption" color="text.secondary">Дата рождения: {shortDate(client.dob)}</Typography>}
              </Box>
              {canManageContacts && <Tooltip title="Изменить клиента"><IconButton onClick={() => onEdit(client)}><EditOutlined /></IconButton></Tooltip>}
              <IconButton aria-label="Закрыть карточку" onClick={onClose}><CloseOutlined /></IconButton>
            </Stack>
          </Box>

          {loading && <Box sx={{ px: 3 }}><CircularProgress size={20} sx={{ mt: 2 }} /></Box>}
          {failed && <Alert severity="error" sx={{ m: 3 }}>Часть данных карточки не загрузилась. Обновите страницу или откройте карточку снова.</Alert>}

          <Box sx={{ p: { xs: 2, sm: 3 } }}>
            {portalUrl && (
              <Paper
                variant="outlined"
                sx={(theme) => ({
                  mb: 2.5, p: 2, borderRadius: 3,
                  borderColor: alpha(theme.palette.primary.main, 0.3),
                  bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.1 : 0.035),
                })}
              >
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                  <Avatar variant="rounded" sx={{ bgcolor: "primary.main" }}><LinkRounded /></Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={800}>Личный кабинет клиента</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{portalUrl}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" startIcon={<ContentCopyOutlined />} onClick={copyPortalLink}>Копировать</Button>
                    <Button variant="contained" startIcon={<SendRounded />} onClick={sharePortalLink}>Отправить</Button>
                  </Stack>
                </Stack>
              </Paper>
            )}
            <Paper
              variant="outlined"
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
                gap: 0,
                borderRadius: 3,
                overflow: "hidden",
                "& > div": { p: 2, borderRight: { sm: 1 }, borderBottom: { xs: 1, sm: 0 }, borderColor: "divider" },
                "& > div:last-of-type": { borderRight: 0 },
              }}
            >
              <Fact label="Баланс" value={money(client.balance)} />
              <Fact label="Долг" value={money(client.debt)} accent={Number(client.debt) > 0} />
              <Fact label="Начислено" value={money(issuedTotal)} />
              <Fact label="Оплачено" value={money(paidTotal)} />
            </Paper>

            <Divider sx={{ my: 3 }} />
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <PersonOutlineOutlined color="action" />
              <Typography variant="h6" fontWeight={800}>Контактные лица</Typography>
              <Chip size="small" label={contacts.length || (client.clientType === "individual" ? 1 : 0)} />
              <Box sx={{ flex: 1 }} />
              {canManageContacts && client.clientType === "company" && (
                <Button size="small" startIcon={<AddOutlined />} onClick={() => openContact()}>Добавить</Button>
              )}
            </Stack>
            <Stack spacing={1}>
              {contacts.map((contact) => (
                <Paper key={contact.id ?? "self"} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <Avatar sx={{ width: 36, height: 36, fontSize: 13 }}>{initials(contact.fullName)}</Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                        <Typography fontWeight={700}>{contact.fullName}</Typography>
                        {contact.isPrimary && <Chip size="small" color="primary" variant="outlined" label="Основной" />}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {[contact.position, contact.phone, contact.email].filter(Boolean).join(" · ") || "Контактные данные не заполнены"}
                      </Typography>
                    </Box>
                    {canManageContacts && contact.id != null && !contact.isSelf && (
                      <>
                        <IconButton size="small" aria-label={`Изменить контакт ${contact.fullName}`} onClick={() => openContact(contact)}><EditOutlined fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" aria-label={`Удалить контакт ${contact.fullName}`} onClick={() => { if (window.confirm(`Удалить контакт «${contact.fullName}»?`)) deleteContactMutation.mutate(contact.id!); }}><DeleteOutlineOutlined fontSize="small" /></IconButton>
                      </>
                    )}
                  </Stack>
                </Paper>
              ))}
              {!contactsQuery.isLoading && contacts.length === 0 && client.clientType === "individual" && (
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
                  <Typography fontWeight={700}>{client.fullName}</Typography>
                  <Typography variant="body2" color="text.secondary">Сам клиент · {[client.phone, client.email].filter(Boolean).join(" · ") || "контакты не заполнены"}</Typography>
                </Paper>
              )}
              {!contactsQuery.isLoading && contacts.length === 0 && client.clientType === "company" && (
                <Typography color="text.secondary">Добавьте человека, с которым можно связаться по контрактам компании.</Typography>
              )}
            </Stack>

            <Divider sx={{ my: 3 }} />
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <ReceiptLongOutlined color="action" />
              <Typography variant="h6" fontWeight={800}>Контракты</Typography>
              <Chip size="small" label={contracts.length} />
            </Stack>
            <Stack spacing={1.25}>
              {contracts.map((contract) => <ContractRow key={contract.id} contract={contract} />)}
              {!contractsQuery.isLoading && contracts.length === 0 && (
                <Typography color="text.secondary">У клиента пока нет контрактов.</Typography>
              )}
            </Stack>

            {canViewCrm && (
              <>
                <Divider sx={{ my: 3 }} />
                <Typography variant="h6" fontWeight={800}>История заметок</Typography>
                {canManageCrm && (
                  <Paper variant="outlined" sx={{ p: 2, mt: 1.5, borderRadius: 2.5 }}>
                    <TextField
                      fullWidth multiline minRows={2}
                      label="Новая заметка"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Зафиксируйте договорённость или важный контекст"
                    />
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                      <FormControlLabel control={<Checkbox checked={important} onChange={(event) => setImportant(event.target.checked)} />} label="Закрепить" />
                      <Button variant="contained" onClick={() => noteMutation.mutate()} disabled={!note.trim() || noteMutation.isPending}>Добавить</Button>
                    </Stack>
                  </Paper>
                )}
                <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                  {(notesQuery.data ?? []).map((item) => (
                    <Paper
                      key={item.id}
                      variant="outlined"
                      sx={(theme) => ({ p: 1.75, borderRadius: 2.5, borderColor: item.isImportant ? alpha(theme.palette.warning.main, 0.65) : undefined })}
                    >
                      <Stack direction="row" spacing={1} alignItems="flex-start">
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ whiteSpace: "pre-wrap" }}>{item.body}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.authorName || "Сотрудник"} · {dayjs(item.createdAt).format("DD.MM.YYYY HH:mm")}</Typography>
                        </Box>
                        {canManageCrm && (
                          <Tooltip title={item.isImportant ? "Открепить" : "Закрепить"}>
                            <IconButton size="small" color={item.isImportant ? "warning" : "default"} onClick={() => pinMutation.mutate({ noteId: item.id, isImportant: !item.isImportant })}>
                              <PushPinOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </Paper>
                  ))}
                  {!notesQuery.isLoading && (notesQuery.data?.length ?? 0) === 0 && <Typography color="text.secondary">Заметок ещё нет.</Typography>}
                </Stack>
              </>
            )}
          </Box>
        </Box>
      )}
      <Dialog open={contactDialogOpen} onClose={() => !contactMutation.isPending && setContactDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingContact ? "Изменить контакт" : "Новое контактное лицо"}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            <TextField required label="Имя" value={contactForm.fullName} onChange={(event) => setContactForm({ ...contactForm, fullName: event.target.value })} />
            <TextField label="Должность" value={contactForm.position} onChange={(event) => setContactForm({ ...contactForm, position: event.target.value })} />
            <TextField label="Телефон" value={contactForm.phone} onChange={(event) => setContactForm({ ...contactForm, phone: event.target.value })} />
            <TextField type="email" label="Email" value={contactForm.email} onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })} />
            <TextField multiline minRows={2} label="Заметка" value={contactForm.note} onChange={(event) => setContactForm({ ...contactForm, note: event.target.value })} sx={{ gridColumn: "1 / -1" }} />
            <FormControlLabel control={<Checkbox checked={contactForm.isPrimary} onChange={(event) => setContactForm({ ...contactForm, isPrimary: event.target.checked })} />} label="Основное контактное лицо" sx={{ gridColumn: "1 / -1" }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactDialogOpen(false)} disabled={contactMutation.isPending}>Отмена</Button>
          <Button variant="contained" onClick={() => contactMutation.mutate()} disabled={!contactForm.fullName.trim() || contactMutation.isPending}>
            {contactMutation.isPending ? <CircularProgress size={20} /> : "Сохранить"}
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}
