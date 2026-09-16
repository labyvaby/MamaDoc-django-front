import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import PersonOutlineRounded from "@mui/icons-material/PersonOutlineRounded";
import PointOfSaleRounded from "@mui/icons-material/PointOfSaleRounded";
import { useNavigate } from "react-router";
import { getPosHistory, PosSavedReceipt } from "../../api/pos";
import { useActiveScope } from "../../hooks/useActiveScope";
import { formatKGS } from "../../utility/format";

const PAGE_SIZE = 25;
type Period = "today" | "week" | "all";

const money = (value: string | number) => formatKGS(value);
const dateTime = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));

function periodStart(period: Period) {
  if (period === "all") return 0;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (period === "week") date.setDate(date.getDate() - 6);
  return date.getTime();
}

function receiptLabel(receipt: PosSavedReceipt) {
  return receipt.number || `Чек #${receipt.id}`;
}

function paymentLabel(method: string) {
  if (method === "cash") return "Наличные";
  if (method === "card") return "Карта";
  if (method === "cashless") return "Безналичные";
  return method;
}

export default function PosSalesHistoryPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("md"));
  const scope = useActiveScope();
  const [period, setPeriod] = useState<Period>("today");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<PosSavedReceipt | null>(null);

  const query = useQuery({
    queryKey: ["pos-sales-history", scope.organizationId, scope.branchId, status, offset],
    enabled: scope.orgReady && scope.branchId != null,
    queryFn: ({ signal }) => getPosHistory(
      { organizationId: scope.organizationId ?? 0, branchId: scope.branchId ?? 0 },
      { status, offset },
      signal,
    ),
  });

  const receipts = query.data ?? [];
  const visibleReceipts = useMemo(() => {
    const from = periodStart(period);
    const needle = search.trim().toLowerCase();
    return receipts.filter((receipt) => {
      const inPeriod = from === 0 || new Date(receipt.createdAt).getTime() >= from;
      const inSearch = !needle || receiptLabel(receipt).toLowerCase().includes(needle)
        || receipt.lines.some((line) => line.productName.toLowerCase().includes(needle))
        || (receipt.clientId != null && String(receipt.clientId).includes(needle));
      return inPeriod && inSearch;
    });
  }, [period, receipts, search]);

  const stats = useMemo(() => ({
    revenue: visibleReceipts.reduce((sum, receipt) => sum + Number(receipt.totalAmount), 0),
    discounts: visibleReceipts.reduce((sum, receipt) => sum + Number(receipt.discountTotal), 0),
    count: visibleReceipts.length,
  }), [visibleReceipts]);

  const resetPage = (next: () => void) => { setOffset(0); next(); };

  return (
    <Box sx={{ height: "100%", overflow: "auto", bgcolor: "#080b16", p: { xs: 1.5, md: 3 } }}>
      <Box sx={{ maxWidth: 1440, mx: "auto" }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2} mb={3}>
          <Box>
            <Stack direction="row" alignItems="center" gap={1.25}>
              <Box sx={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.16), color: theme.palette.primary.light }}>
                <ReceiptLongRounded />
              </Box>
              <Box>
                <Typography variant="h4" fontWeight={800} letterSpacing="-.03em">История продаж</Typography>
                <Typography color="text.secondary" sx={{ mt: .25 }}>Все чеки магазина в одном месте</Typography>
              </Box>
            </Stack>
          </Box>
          <Stack direction="row" gap={1}>
            <Tooltip title="Обновить">
              <IconButton onClick={() => query.refetch()} sx={{ border: 1, borderColor: "divider" }}><RefreshRounded /></IconButton>
            </Tooltip>
            <Button variant="contained" startIcon={<PointOfSaleRounded />} onClick={() => navigate("/pos")} sx={{ borderRadius: 2.5, px: 2.25 }}>
              Открыть кассу
            </Button>
          </Stack>
        </Stack>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" }, gap: 1.5, mb: 2.5 }}>
          {[{ label: "Выручка", value: money(stats.revenue), color: "#8d7bff" }, { label: "Чеков", value: String(stats.count), color: "#4fd1a5" }, { label: "Средний чек", value: money(stats.count ? stats.revenue / stats.count : 0), color: "#67b7ff" }, { label: "Скидки", value: money(stats.discounts), color: "#ffb86b" }].map((item) => (
            <Card key={item.label} sx={{ borderRadius: 3, border: 1, borderColor: alpha(item.color, .24), background: `linear-gradient(145deg, ${alpha(item.color, .12)}, rgba(16,20,34,.92) 65%)` }}>
              <CardContent sx={{ p: { xs: 1.5, md: 2 } }}><Typography color="text.secondary" variant="body2">{item.label}</Typography><Typography variant="h5" fontWeight={800} sx={{ color: item.color, mt: .5 }}>{item.value}</Typography></CardContent>
            </Card>
          ))}
        </Box>

        <Card sx={{ borderRadius: 3, border: 1, borderColor: "divider", bgcolor: alpha(theme.palette.background.paper, .62), mb: 2 }}>
          <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
            <Stack direction={{ xs: "column", md: "row" }} gap={1.25} alignItems={{ md: "center" }} justifyContent="space-between">
              <Stack direction="row" gap={.75} flexWrap="wrap">
                {(["today", "week", "all"] as Period[]).map((item) => <Button key={item} size="small" variant={period === item ? "contained" : "text"} onClick={() => resetPage(() => setPeriod(item))} sx={{ borderRadius: 2 }}>{item === "today" ? "Сегодня" : item === "week" ? "7 дней" : "За всё время"}</Button>)}
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} gap={1.25} width={{ xs: "100%", md: "auto" }}>
                <TextField size="small" placeholder="Поиск по чеку или товару" value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <SearchRounded sx={{ mr: 1, color: "text.secondary" }} /> }} sx={{ minWidth: { sm: 260 } }} />
                <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Статус</InputLabel><Select label="Статус" value={status} onChange={(event) => resetPage(() => setStatus(event.target.value))}><MenuItem value="">Все чеки</MenuItem><MenuItem value="completed">Завершённые</MenuItem><MenuItem value="held">Отложенные</MenuItem><MenuItem value="cancelled">Отменённые</MenuItem></Select></FormControl>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {query.isError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>Не удалось загрузить историю продаж. Попробуйте обновить страницу.</Alert>}
        {query.isLoading ? <Box sx={{ display: "grid", placeItems: "center", minHeight: 300 }}><CircularProgress /></Box> : visibleReceipts.length === 0 ? (
          <Card sx={{ borderRadius: 3, border: 1, borderColor: "divider", textAlign: "center", py: 9 }}><ReceiptLongRounded sx={{ fontSize: 52, color: "text.disabled", mb: 1 }} /><Typography variant="h6">Продаж пока нет</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>Проведённые чеки появятся здесь автоматически</Typography></Card>
        ) : compact ? (
          <Stack gap={1.25}>{visibleReceipts.map((receipt) => <SaleCard key={receipt.id} receipt={receipt} onClick={() => setSelected(receipt)} />)}</Stack>
        ) : (
          <Card sx={{ borderRadius: 3, border: 1, borderColor: "divider", overflow: "hidden" }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1.05fr 1fr 1.8fr .9fr .9fr", gap: 2, px: 2.5, py: 1.5, bgcolor: alpha(theme.palette.primary.main, .06), color: "text.secondary", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}><span>Чек</span><span>Дата</span><span>Состав</span><span>Оплата</span><span style={{ textAlign: "right" }}>Сумма</span></Box>
            {visibleReceipts.map((receipt) => <Box key={receipt.id} onClick={() => setSelected(receipt)} sx={{ display: "grid", gridTemplateColumns: "1.05fr 1fr 1.8fr .9fr .9fr", gap: 2, alignItems: "center", px: 2.5, py: 2, borderTop: 1, borderColor: "divider", cursor: "pointer", transition: "background .2s", "&:hover": { bgcolor: alpha(theme.palette.primary.main, .07) } }}><Box><Typography fontWeight={700}>{receiptLabel(receipt)}</Typography><Typography variant="caption" color="text.secondary">{receipt.clientId == null ? "Без клиента" : `Клиент #${receipt.clientId}`}</Typography></Box><Typography color="text.secondary">{dateTime(receipt.createdAt)}</Typography><Box><Typography noWrap>{receipt.lines[0]?.productName || "Без товаров"}</Typography><Typography variant="caption" color="text.secondary">{receipt.lines.length > 1 ? `и ещё ${receipt.lines.length - 1}` : `${receipt.lines[0]?.quantity ?? 0} шт.`}</Typography></Box><Stack direction="row" gap={.5} flexWrap="wrap">{receipt.payments.map((payment) => <Chip key={payment.id} size="small" label={paymentLabel(payment.method)} />)}</Stack><Typography textAlign="right" fontWeight={800}>{money(receipt.totalAmount)}</Typography></Box>)}
          </Card>
        )}

        <Stack direction="row" justifyContent="flex-end" gap={1} mt={2}><Button size="small" startIcon={<ArrowBackRounded />} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Назад</Button><Button size="small" endIcon={<ArrowForwardRounded />} disabled={receipts.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>Далее</Button></Stack>
      </Box>

      <Dialog open={selected != null} onClose={() => setSelected(null)} fullWidth maxWidth="sm" fullScreen={compact} PaperProps={{ sx: { borderRadius: compact ? 0 : 3, bgcolor: "#101522" } }}>
        {selected && <><DialogTitle><Stack direction="row" justifyContent="space-between" alignItems="start"><Box><Typography variant="h6" fontWeight={800}>{receiptLabel(selected)}</Typography><Typography variant="body2" color="text.secondary">{dateTime(selected.createdAt)} · {selected.clientId == null ? "Без клиента" : `Клиент #${selected.clientId}`}</Typography></Box><Chip label={selected.status === "completed" ? "Завершён" : selected.status} color="success" size="small" /></Stack></DialogTitle><DialogContent dividers><Stack gap={1.25}>{selected.lines.map((line) => <Stack key={line.id} direction="row" justifyContent="space-between" gap={2}><Box><Typography fontWeight={600}>{line.productName}</Typography><Typography variant="caption" color="text.secondary">{line.quantity} шт. × {money(line.unitPrice)}</Typography></Box><Typography fontWeight={700}>{money(line.total)}</Typography></Stack>)}</Stack><Divider sx={{ my: 2 }} /><Stack gap={.75}><Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Подытог</Typography><Typography>{money(selected.subtotal)}</Typography></Stack><Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Скидка</Typography><Typography color="warning.main">− {money(selected.discountTotal)}</Typography></Stack><Stack direction="row" justifyContent="space-between"><Typography fontWeight={800}>Итого</Typography><Typography variant="h6" fontWeight={800}>{money(selected.totalAmount)}</Typography></Stack></Stack><Divider sx={{ my: 2 }} /><Stack direction="row" gap={.75} flexWrap="wrap">{selected.payments.map((payment) => <Chip key={payment.id} icon={<PersonOutlineRounded />} label={`${paymentLabel(payment.method)} · ${money(payment.amount)}`} />)}</Stack></DialogContent><DialogActions><Button onClick={() => setSelected(null)}>Закрыть</Button></DialogActions></>}
      </Dialog>
    </Box>
  );
}

function SaleCard({ receipt, onClick }: { receipt: PosSavedReceipt; onClick: () => void }) {
  return <Card onClick={onClick} sx={{ borderRadius: 3, border: 1, borderColor: "divider", cursor: "pointer", "&:active": { transform: "scale(.995)" } }}><CardContent sx={{ p: 1.75 }}><Stack direction="row" justifyContent="space-between" gap={1}><Box><Typography fontWeight={800}>{receiptLabel(receipt)}</Typography><Typography variant="caption" color="text.secondary">{dateTime(receipt.createdAt)}</Typography></Box><Typography fontWeight={800}>{money(receipt.totalAmount)}</Typography></Stack><Typography noWrap sx={{ mt: 1 }}>{receipt.lines[0]?.productName || "Без товаров"}</Typography><Stack direction="row" justifyContent="space-between" alignItems="center" mt={1}><Typography variant="caption" color="text.secondary">{receipt.clientId == null ? "Без клиента" : `Клиент #${receipt.clientId}`} · {receipt.lines.length} поз.</Typography><Stack direction="row" gap={.5}>{receipt.payments.map((payment) => <Chip key={payment.id} size="small" label={paymentLabel(payment.method)} />)}</Stack></Stack></CardContent></Card>;
}
