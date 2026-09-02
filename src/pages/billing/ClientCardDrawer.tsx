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
import EditOutlined from "@mui/icons-material/EditOutlined";
import PushPinOutlined from "@mui/icons-material/PushPinOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import { alpha } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import {
  billingApi,
  type BillingClient,
  type BillingContract,
} from "../../api/billing";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useCan } from "../../hooks/useCan";

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
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const [note, setNote] = React.useState("");
  const [important, setImportant] = React.useState(false);
  const cardKey = djangoQueryKeys.billing.clientCard(organizationId, clientId);

  const notesQuery = useQuery({
    queryKey: [...cardKey, "notes"],
    queryFn: () => billingApi.clientNotes(clientId!),
    enabled: open && canViewCrm,
  });
  const contractsQuery = useQuery({
    queryKey: [...cardKey, "contracts"],
    queryFn: () => billingApi.contracts({ organizationId, clientId, pageSize: 200 }),
    enabled: open,
  });
  const chargesQuery = useQuery({
    queryKey: [...cardKey, "charges"],
    queryFn: () => billingApi.charges({ organizationId, clientId, pageSize: 200 }),
    enabled: open,
  });
  const paymentsQuery = useQuery({
    queryKey: [...cardKey, "payments"],
    queryFn: () => billingApi.payments({ organizationId, clientId, pageSize: 200 }),
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

  React.useEffect(() => {
    setNote("");
    setImportant(false);
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
  const loading = contractsQuery.isLoading || chargesQuery.isLoading || paymentsQuery.isLoading;
  const failed = contractsQuery.isError || chargesQuery.isError || paymentsQuery.isError;

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
              </Box>
              <Tooltip title="Изменить клиента"><IconButton onClick={() => onEdit(client)}><EditOutlined /></IconButton></Tooltip>
              <IconButton aria-label="Закрыть карточку" onClick={onClose}><CloseOutlined /></IconButton>
            </Stack>
          </Box>

          {loading && <Box sx={{ px: 3 }}><CircularProgress size={20} sx={{ mt: 2 }} /></Box>}
          {failed && <Alert severity="error" sx={{ m: 3 }}>Часть данных карточки не загрузилась. Обновите страницу или откройте карточку снова.</Alert>}

          <Box sx={{ p: { xs: 2, sm: 3 } }}>
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
    </Drawer>
  );
}
