import React from "react";
import {
  Alert, Box, Chip, CircularProgress, Divider, Drawer, IconButton,
  Paper, Stack, Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { billingApi, type BillingOffering } from "../../api/billing";

type Props = {
  offering: BillingOffering | null;
  organizationId?: number;
  canManage: boolean;
  onClose: () => void;
  onEdit: (offering: BillingOffering) => void;
};

const money = (value: unknown) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "KGS", maximumFractionDigits: 2 }).format(Number(value ?? 0));
const date = (value: unknown) => value ? dayjs(String(value)).format("DD.MM.YYYY") : "—";
const KIND: Record<string, string> = { service: "Услуга", course: "Курс", rental: "Аренда" };
const CYCLE: Record<string, string> = { one_time: "Разово", package: "Пакет", monthly: "Ежемесячно", quarterly: "Ежеквартально", yearly: "Ежегодно", per_course: "За курс", per_session: "За занятие" };
const STATUS: Record<string, string> = { active: "Активен", paused: "На паузе", ended: "Завершён", draft: "Черновик", issued: "Выставлено", partial: "Частично", paid: "Оплачено", overdue: "Просрочено", canceled: "Отменено" };

function profileRows(offering: BillingOffering): Array<[string, string]> {
  const p = offering.profile ?? {};
  if (offering.kind === "course") return [
    ["Занятий", String(p.sessions_total ?? "—")], ["Расписание", String(p.schedule ?? "—")],
    ["Начало", date(p.starts_on)], ["Окончание", date(p.ends_on)], ["Вместимость", String(offering.capacity ?? "—")],
  ];
  if (offering.kind === "rental") return [
    ["Тип объекта", String(p.object_type ?? "—")], ["Адрес", String(p.address ?? "—")],
    ["Площадь", p.area_value ? `${p.area_value} ${p.area_unit === "sotka" ? "сот." : "м²"}` : "—"],
    ["Ставка", String(p.rate_period ?? "—")], ["Депозит", p.deposit_amount ? money(p.deposit_amount) : "Нет"],
  ];
  return [
    ["Занятий в пакете", String(p.sessionsIncluded ?? "—")],
    ["Срок действия", p.validityDays ? `${p.validityDays} дн.` : "—"],
  ];
}

export function OfferingCardDrawer({ offering, organizationId, canManage, onClose, onEdit }: Props) {
  const offeringId = offering?.id;
  const scope = React.useMemo(() => ({ ...(organizationId ? { organizationId } : {}) }), [organizationId]);
  const key = ["django", "billing", "offering-card", organizationId ?? null, offeringId ?? null] as const;
  const clientsQuery = useQuery({ queryKey: [...key, "clients"], queryFn: () => billingApi.offeringClients(offeringId!, scope), enabled: offering != null });
  const chargesQuery = useQuery({ queryKey: [...key, "charges"], queryFn: () => billingApi.offeringCharges(offeringId!, scope), enabled: offering != null });
  const historyQuery = useQuery({ queryKey: [...key, "history"], queryFn: () => billingApi.offeringHistory(offeringId!, scope), enabled: offering != null });
  const clients = clientsQuery.data ?? [];
  const charges = chargesQuery.data ?? [];
  const history = historyQuery.data ?? [];
  const outstanding = charges.filter((item) => !["paid", "canceled"].includes(item.status)).reduce((sum, item) => sum + Math.max(0, Number(item.amount) - Number(item.paidAmount)), 0);
  const loading = clientsQuery.isLoading || chargesQuery.isLoading || historyQuery.isLoading;
  const failed = clientsQuery.isError || chargesQuery.isError || historyQuery.isError;

  return (
    <Drawer anchor="right" open={offering != null} onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 720, lg: 820 }, maxWidth: "100%" } }}>
      {offering && <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
        <Box sx={(theme) => ({ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.06), borderBottom: 1, borderColor: "divider" })}>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><Typography variant="overline" color="text.secondary" fontWeight={800}>{KIND[offering.kind] ?? offering.kind}</Typography><Chip size="small" color={offering.status === "active" ? "success" : "default"} label={STATUS[offering.status] ?? offering.status} /></Stack>
              <Typography variant="h5" fontWeight={820}>{offering.name}</Typography>
              <Typography color="text.secondary">{offering.category || "Без категории"} · {CYCLE[offering.billingCycle] ?? offering.billingCycle}</Typography>
            </Box>
            {canManage && <IconButton aria-label="Изменить" onClick={() => onEdit(offering)}><EditOutlined /></IconButton>}
            <IconButton aria-label="Закрыть карточку" onClick={onClose}><CloseOutlined /></IconButton>
          </Stack>
        </Box>
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          {loading && <CircularProgress size={20} sx={{ mb: 2 }} />}
          {failed && <Alert severity="error" sx={{ mb: 2 }}>Часть данных объекта не загрузилась.</Alert>}
          <Paper variant="outlined" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, borderRadius: 3, overflow: "hidden", "& > div": { p: 2, borderRight: { sm: 1 }, borderColor: "divider" } }}>
            <Box><Typography variant="caption" color="text.secondary">Стоимость</Typography><Typography fontWeight={760}>{money(offering.priceAmount)}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">Клиентов</Typography><Typography fontWeight={760}>{clients.length}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">Выручка</Typography><Typography fontWeight={760}>{money(offering.revenueTotal)}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">К оплате</Typography><Typography fontWeight={760} color={outstanding > 0 ? "error.main" : "text.primary"}>{money(outstanding)}</Typography></Box>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 3 }}>
            <Typography fontWeight={780}>Параметры</Typography><Divider sx={{ my: 1 }} />
            {profileRows(offering).map(([label, value]) => <Stack key={label} direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.75 }}><Typography color="text.secondary">{label}</Typography><Typography fontWeight={650} textAlign="right">{value}</Typography></Stack>)}
          </Paper>
          <Divider sx={{ my: 3 }} />
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}><GroupsOutlined color="action" /><Typography variant="h6" fontWeight={780}>Клиенты</Typography><Chip size="small" label={clients.length} /></Stack>
          <Stack spacing={1}>{clients.slice(0, 12).map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}><Stack direction="row" justifyContent="space-between" spacing={2}><Box><Typography fontWeight={700}>{item.clientName}</Typography><Typography variant="caption" color="text.secondary">{item.clientPhone || "Нет телефона"} · с {date(item.joinedAt)}</Typography></Box><Box textAlign="right"><Typography fontWeight={700} color={Number(item.debt) > 0 ? "error.main" : "text.primary"}>{money(item.debt)}</Typography><Typography variant="caption" color="text.secondary">{STATUS[item.status] ?? item.status}</Typography></Box></Stack></Paper>)}{!clientsQuery.isLoading && !clients.length && <Typography color="text.secondary">Активных и завершённых контрактов по объекту нет.</Typography>}</Stack>
          <Divider sx={{ my: 3 }} />
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}><ReceiptLongOutlined color="action" /><Typography variant="h6" fontWeight={780}>Последние начисления</Typography><Chip size="small" label={charges.length} /></Stack>
          <Stack spacing={1}>{charges.slice(0, 8).map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}><Stack direction="row" justifyContent="space-between"><Box><Typography fontWeight={700}>№ {item.number} · {item.clientName}</Typography><Typography variant="caption" color="text.secondary">{item.purpose} · срок {date(item.dueDate)}</Typography></Box><Box textAlign="right"><Typography fontWeight={700}>{money(item.amount)}</Typography><Typography variant="caption" color={item.status === "overdue" ? "error.main" : "text.secondary"}>{STATUS[item.status] ?? item.status}</Typography></Box></Stack></Paper>)}{!chargesQuery.isLoading && !charges.length && <Typography color="text.secondary">Начислений пока нет.</Typography>}</Stack>
          <Divider sx={{ my: 3 }} />
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}><HistoryOutlined color="action" /><Typography variant="h6" fontWeight={780}>История</Typography></Stack>
          <Stack spacing={1}>{history.slice(0, 12).map((item) => <Box key={item.id}><Typography>{item.message}</Typography><Typography variant="caption" color="text.secondary">{date(item.createdAt)}</Typography></Box>)}{!historyQuery.isLoading && !history.length && <Typography color="text.secondary">История пока пуста.</Typography>}</Stack>
        </Box>
      </Box>}
    </Drawer>
  );
}
