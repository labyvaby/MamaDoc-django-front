import React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePermissions } from "../../hooks/usePermissions";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useVertical } from "../../i18n/VerticalProvider";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { PageHeader } from "../../components/ui";
import {
  createClient,
  getClients,
  updateClient,
  type ClientStatus,
  type ClientType,
  type DjangoClient,
} from "../../api/clients";

type ClientFormState = {
  fullName: string;
  phone: string;
  email: string;
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
};

const emptyForm: ClientFormState = {
  fullName: "",
  phone: "",
  email: "",
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
};

const statusLabels: Record<ClientStatus, string> = {
  new: "Новый",
  active: "Активен",
  inactive: "Неактивен",
  no_offering: "Без объекта продажи",
};

const typeLabels: Record<ClientType, string> = {
  individual: "Физическое лицо",
  company: "Юридическое лицо",
};

const statusColor = (status: ClientStatus): "default" | "success" | "warning" | "error" => {
  if (status === "active") return "success";
  if (status === "inactive") return "warning";
  if (status === "no_offering") return "error";
  return "default";
};

const money = (value: string) =>
  `${Number(value || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} сом`;

const toForm = (client?: DjangoClient | null): ClientFormState =>
  client
    ? {
        fullName: client.fullName,
        phone: client.phone,
        email: client.email,
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
      }
    : { ...emptyForm };

export default function ClientsPage() {
  const auth = usePermissions();
  const { vertical } = useVertical();
  const queryClient = useQueryClient();
  const organizationId = auth.activeOrganization?.id ?? null;
  const canView = auth.isSuperAdmin() || auth.hasPermission("clients.view");
  const canManage = auth.isSuperAdmin() || auth.hasPermission("clients.manage");
  const isRetail = vertical === "retail";

  usePageTitle(isRetail ? "Клиенты" : "Клиенты организации");

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [clientType, setClientType] = React.useState("");
  const [selected, setSelected] = React.useState<DjangoClient | null>(null);
  const [editorClient, setEditorClient] = React.useState<DjangoClient | null>(null);
  const [draft, setDraft] = React.useState<ClientFormState>(emptyForm);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const clients = useQuery({
    queryKey: ["clients", organizationId, debouncedSearch, status, clientType],
    queryFn: ({ signal }) =>
      getClients(
        organizationId as number,
        { query: debouncedSearch, status, clientType },
        signal,
      ),
    enabled: Boolean(organizationId && canView && isRetail),
  });

  const openCreate = () => {
    setEditorClient(null);
    setDraft({ ...emptyForm });
    setSaveError("");
    setEditorOpen(true);
  };

  const openEdit = (client: DjangoClient) => {
    setEditorClient(client);
    setDraft(toForm(client));
    setSaveError("");
    setSelected(null);
    setEditorOpen(true);
  };

  const save = async () => {
    if (!organizationId || !draft.fullName.trim()) {
      setSaveError("Укажите название или ФИО клиента.");
      return;
    }
    if (!editorClient && !draft.phone.trim()) {
      setSaveError("Укажите номер телефона клиента.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const common = {
        fullName: draft.fullName.trim(),
        email: draft.email.trim(),
        clientType: draft.clientType,
        status: draft.status,
        note: draft.note.trim(),
        legalName: draft.legalName.trim(),
        inn: draft.inn.trim(),
        okpo: draft.okpo.trim(),
        legalAddress: draft.legalAddress.trim(),
        bankName: draft.bankName.trim(),
        bankAccount: draft.bankAccount.trim(),
        bankBik: draft.bankBik.trim(),
      };
      const saved = editorClient
        ? await updateClient(editorClient.id, organizationId, common)
        : await createClient({
            organizationId,
            phone: draft.phone.trim(),
            ...common,
          });
      await queryClient.invalidateQueries({ queryKey: ["clients", organizationId] });
      setEditorOpen(false);
      setSelected(saved);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Не удалось сохранить клиента.");
    } finally {
      setSaving(false);
    }
  };

  if (!isRetail) {
    return (
      <Stack p={3} gap={2}>
        <Alert severity="info">
          Для медицинской организации используется раздел «Пациенты». Раздел
          «Клиенты» доступен для retail-организаций.
        </Alert>
      </Stack>
    );
  }

  if (!auth.loading && !canView) return <AccessDenied />;

  return (
    <Stack sx={{ minHeight: "100%" }}>
      <PageHeader
        title="Клиенты"
        onAdd={canManage ? openCreate : undefined}
        addButtonText="Добавить клиента"
        addButtonIcon={<PersonAddOutlined />}
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        searchPlaceholder="Поиск по имени или телефону"
        loading={clients.isFetching}
        actions={
          <>
            <FormControl size="small" sx={{ minWidth: 145 }}>
              <InputLabel>Тип</InputLabel>
              <Select
                value={clientType}
                label="Тип"
                onChange={(event) => setClientType(event.target.value)}
              >
                <MenuItem value="">Все</MenuItem>
                <MenuItem value="individual">Физлица</MenuItem>
                <MenuItem value="company">Компании</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 145 }}>
              <InputLabel>Статус</InputLabel>
              <Select
                value={status}
                label="Статус"
                onChange={(event) => setStatus(event.target.value)}
              >
                <MenuItem value="">Все</MenuItem>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton
              aria-label="Обновить список клиентов"
              onClick={() => void clients.refetch()}
              disabled={clients.isFetching}
            >
              <RefreshOutlined />
            </IconButton>
          </>
        }
      />

      {clients.isFetching && <LinearProgress />}
      {clients.isError && (
        <Alert severity="error" sx={{ mx: 2, mb: 2 }}>
          {clients.error instanceof Error
            ? clients.error.message
            : "Не удалось загрузить клиентов."}
        </Alert>
      )}
      <Card sx={{ mx: { xs: 1, md: 2 }, mb: 2, overflow: "hidden" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Клиент</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell>Телефон</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell align="right">Баланс</TableCell>
                <TableCell align="right">Долг</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clients.data?.map((client) => (
                <TableRow
                  key={client.id}
                  hover
                  selected={selected?.id === client.id}
                  onClick={() => setSelected(client)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>
                    <Typography fontWeight={600}>{client.fullName}</Typography>
                    {client.groups.length > 0 && (
                      <Stack direction="row" gap={0.5} mt={0.5} flexWrap="wrap">
                        {client.groups.map((group) => (
                          <Chip
                            key={group.id}
                            label={group.name}
                            size="small"
                            sx={group.color ? { backgroundColor: group.color } : undefined}
                          />
                        ))}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell>{typeLabels[client.clientType]}</TableCell>
                  <TableCell>{client.phone || "—"}</TableCell>
                  <TableCell>
                    <Chip
                      label={statusLabels[client.status] ?? client.status}
                      color={statusColor(client.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">{money(client.balance)}</TableCell>
                  <TableCell align="right">{money(client.debt)}</TableCell>
                </TableRow>
              ))}
              {!clients.isFetching && clients.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography color="text.secondary" textAlign="center" py={5}>
                      Клиенты не найдены.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
        {selected && (
          <>
            <DialogTitle>{selected.fullName}</DialogTitle>
            <DialogContent>
              <Grid container spacing={2} pt={1}>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="caption">Тип</Typography>
                  <Typography>{typeLabels[selected.clientType]}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="caption">Статус</Typography>
                  <Box><Chip label={statusLabels[selected.status] ?? selected.status} color={statusColor(selected.status)} size="small" /></Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="caption">Телефон</Typography>
                  <Typography>{selected.phone || "—"}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography color="text.secondary" variant="caption">Email</Typography>
                  <Typography>{selected.email || "—"}</Typography>
                </Grid>
                {selected.clientType === "company" && (
                  <Grid item xs={12}>
                    <Typography color="text.secondary" variant="caption">Реквизиты</Typography>
                    <Typography>{selected.legalName || "Название не указано"}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      ИНН: {selected.inn || "—"} · ОКПО: {selected.okpo || "—"}
                    </Typography>
                  </Grid>
                )}
                <Grid item xs={12}>
                  <Typography color="text.secondary" variant="caption">Финансы</Typography>
                  <Typography>Баланс: {money(selected.balance)} · Долг: {money(selected.debt)}</Typography>
                </Grid>
                {selected.note && (
                  <Grid item xs={12}>
                    <Typography color="text.secondary" variant="caption">Комментарий</Typography>
                    <Typography>{selected.note}</Typography>
                  </Grid>
                )}
              </Grid>
            </DialogContent>
            <DialogActions>
              {canManage && (
                <Button startIcon={<EditOutlined />} onClick={() => openEdit(selected)}>
                  Изменить
                </Button>
              )}
              <Button onClick={() => setSelected(null)}>Закрыть</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog open={editorOpen} onClose={() => !saving && setEditorOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editorClient ? "Изменить клиента" : "Новый клиент"}</DialogTitle>
        <DialogContent>
          <Stack gap={2} pt={1}>
            {saveError && <Alert severity="error">{saveError}</Alert>}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}>
                <TextField
                  label="Имя / название"
                  value={draft.fullName}
                  onChange={(event) => setDraft((v) => ({ ...v, fullName: event.target.value }))}
                  required
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Тип клиента</InputLabel>
                  <Select
                    value={draft.clientType}
                    label="Тип клиента"
                    onChange={(event) => setDraft((v) => ({ ...v, clientType: event.target.value as ClientType }))}
                  >
                    <MenuItem value="individual">Физическое лицо</MenuItem>
                    <MenuItem value="company">Юридическое лицо</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Телефон"
                  value={draft.phone}
                  onChange={(event) => setDraft((v) => ({ ...v, phone: event.target.value }))}
                  disabled={!!editorClient}
                  required={!editorClient}
                  fullWidth
                  helperText={editorClient ? "Телефон нельзя изменить в этой форме" : undefined}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Email"
                  value={draft.email}
                  onChange={(event) => setDraft((v) => ({ ...v, email: event.target.value }))}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Статус</InputLabel>
                  <Select
                    value={draft.status}
                    label="Статус"
                    onChange={(event) => setDraft((v) => ({ ...v, status: event.target.value as ClientStatus }))}
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <MenuItem key={value} value={value}>{label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Комментарий"
                  value={draft.note}
                  onChange={(event) => setDraft((v) => ({ ...v, note: event.target.value }))}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </Grid>
              {draft.clientType === "company" && (
                <>
                  <Grid item xs={12}>
                    <Stack direction="row" gap={1} alignItems="center">
                      <BusinessOutlined color="action" />
                      <Typography fontWeight={600}>Реквизиты компании</Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="Юридическое название" value={draft.legalName} onChange={(event) => setDraft((v) => ({ ...v, legalName: event.target.value }))} fullWidth />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField label="ИНН" value={draft.inn} onChange={(event) => setDraft((v) => ({ ...v, inn: event.target.value }))} fullWidth />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField label="ОКПО" value={draft.okpo} onChange={(event) => setDraft((v) => ({ ...v, okpo: event.target.value }))} fullWidth />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="Юридический адрес" value={draft.legalAddress} onChange={(event) => setDraft((v) => ({ ...v, legalAddress: event.target.value }))} fullWidth />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="Банк" value={draft.bankName} onChange={(event) => setDraft((v) => ({ ...v, bankName: event.target.value }))} fullWidth />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="Расчётный счёт" value={draft.bankAccount} onChange={(event) => setDraft((v) => ({ ...v, bankAccount: event.target.value }))} fullWidth />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="БИК" value={draft.bankBik} onChange={(event) => setDraft((v) => ({ ...v, bankBik: event.target.value }))} fullWidth />
                  </Grid>
                </>
              )}
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditorOpen(false)} disabled={saving}>Отмена</Button>
          <Button variant="contained" onClick={() => void save()} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : "Сохранить"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
