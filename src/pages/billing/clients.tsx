import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
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
import EditOutlined from "@mui/icons-material/EditOutlined";
import { useNotification } from "@refinedev/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { billingApi, type BillingClient } from "../../api/billing";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";
import { PageHeader } from "../../components/ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";

type FormState = {
  clientType: "individual" | "company";
  fullName: string;
  phone: string;
  email: string;
  legalName: string;
  inn: string;
  note: string;
  status: string;
};

const emptyForm = (): FormState => ({
  clientType: "individual",
  fullName: "",
  phone: "",
  email: "",
  legalName: "",
  inn: "",
  note: "",
  status: "active",
});

const money = (value: string) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "KGS", maximumFractionDigits: 2 })
    .format(Number(value || 0));

export default function BillingClientsPage() {
  usePageTitle("Клиенты");
  const organizationId = useApiOrgId();
  const canManage = useCan("clients.manage");
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<BillingClient | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(emptyForm);

  const clientsQuery = useQuery({
    queryKey: djangoQueryKeys.billing.clients(organizationId),
    queryFn: () => billingApi.clients({ organizationId }),
    enabled: organizationId != null,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        clientType: form.clientType,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        status: form.status,
        legalName: form.clientType === "company" ? form.legalName.trim() : "",
        inn: form.clientType === "company" ? form.inn.trim() : "",
        note: form.note.trim(),
        ...(editing ? {} : { phone: form.phone.trim(), organizationId }),
      };
      return editing
        ? billingApi.updateClient(editing.id, body, { organizationId })
        : billingApi.createClient(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.billing.clients(organizationId) });
      setDialogOpen(false);
      notify?.({ type: "success", message: editing ? "Клиент обновлён" : "Клиент создан" });
    },
    onError: (error) => notify?.({ type: "error", message: getErrorMessage(error, "Не удалось сохранить клиента") }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (client: BillingClient) => {
    setEditing(client);
    setForm({
      clientType: client.clientType,
      fullName: client.fullName,
      phone: client.phone,
      email: client.email,
      legalName: client.legalName,
      inn: client.inn,
      note: client.note,
      status: client.status,
    });
    setDialogOpen(true);
  };

  const normalizedSearch = search.trim().toLocaleLowerCase("ru");
  const rows = (clientsQuery.data ?? []).filter((client) =>
    !normalizedSearch || [client.fullName, client.phone, client.email, client.legalName, client.inn]
      .some((value) => value?.toLocaleLowerCase("ru").includes(normalizedSearch)),
  );

  return (
    <Box sx={{ py: 1 }}>
      <PageHeader
        title="Клиенты"
        onAdd={canManage ? openCreate : undefined}
        addButtonText="Новый клиент"
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        searchPlaceholder="Имя, телефон, компания или ИНН"
        loading={clientsQuery.isFetching}
      />

      <Box sx={(theme) => ({ px: theme.appLayout.page.paddingX })}>
        {clientsQuery.isError && <Alert severity="error">{getErrorMessage(clientsQuery.error, "Не удалось загрузить клиентов")}</Alert>}
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Клиент</TableCell>
                <TableCell>Контакты</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell align="right">Баланс</TableCell>
                <TableCell align="right">Долг</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {clientsQuery.isLoading && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 7 }}><CircularProgress size={28} /></TableCell></TableRow>
              )}
              {!clientsQuery.isLoading && rows.map((client) => (
                <TableRow key={client.id} hover>
                  <TableCell>
                    <Typography fontWeight={650}>{client.fullName}</Typography>
                    {client.legalName && <Typography variant="caption" color="text.secondary">{client.legalName}{client.inn ? ` · ИНН ${client.inn}` : ""}</Typography>}
                  </TableCell>
                  <TableCell>{client.phone || "—"}<Typography variant="caption" color="text.secondary" display="block">{client.email || "Нет email"}</Typography></TableCell>
                  <TableCell>{client.clientType === "company" ? "Компания" : "Физлицо"}</TableCell>
                  <TableCell align="right">{money(client.balance)}</TableCell>
                  <TableCell align="right" sx={{ color: Number(client.debt) > 0 ? "error.main" : undefined, fontWeight: 650 }}>{money(client.debt)}</TableCell>
                  <TableCell><Chip size="small" color={client.status === "active" ? "success" : "default"} label={client.status === "active" ? "Активен" : client.status} /></TableCell>
                  <TableCell align="right">{canManage && <Button size="small" startIcon={<EditOutlined />} onClick={() => openEdit(client)}>Изменить</Button>}</TableCell>
                </TableRow>
              ))}
              {!clientsQuery.isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 7, color: "text.secondary" }}>Клиенты не найдены. Создайте первого клиента.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Dialog open={dialogOpen} onClose={() => !saveMutation.isPending && setDialogOpen(false)} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle>{editing ? "Изменить клиента" : "Новый клиент"}</DialogTitle>
        <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" }, gap: 2.25 }}>
            <TextField select label="Тип клиента" value={form.clientType} onChange={(event) => setForm({ ...form, clientType: event.target.value as FormState["clientType"] })}>
              <MenuItem value="individual">Физическое лицо</MenuItem>
              <MenuItem value="company">Компания</MenuItem>
            </TextField>
            <TextField required label={form.clientType === "company" ? "Контактное лицо" : "ФИО"} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
            <TextField required={!editing} disabled={Boolean(editing)} fullWidth label="Телефон" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} helperText={editing ? "Телефон меняется через контактные данные" : undefined} />
            <TextField fullWidth label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            {form.clientType === "company" && <><TextField fullWidth label="Юридическое название" value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} /><TextField label="ИНН" value={form.inn} onChange={(event) => setForm({ ...form, inn: event.target.value })} /></>}
            <TextField select label="Статус" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><MenuItem value="new">Новый</MenuItem><MenuItem value="active">Активный</MenuItem><MenuItem value="inactive">Неактивный</MenuItem></TextField>
            <TextField label="Заметка" multiline minRows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} sx={{ gridColumn: "1 / -1" }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>Отмена</Button>
          <Button variant="contained" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.fullName.trim() || (!editing && !form.phone.trim())}>
            {saveMutation.isPending ? <CircularProgress size={20} /> : "Сохранить"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
