import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Grid2,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useCan } from "../../hooks/useCan";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import {
  getExpenses,
  getExpenseCategories,
  createExpense,
  voidExpense,
  parseBackendError,
  type Expense,
  type ExpenseMethod,
} from "../../api/expenses";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";

// ── Вспомогательные функции ────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function formatKGS(value: number): string {
  return value.toLocaleString("ru-KG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " с";
}

function formatDateRu(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── ExpenseDetailCard ──────────────────────────────────────────────────────────

const ExpenseDetailCard: React.FC<{
  expense: Expense | null;
  canManage: boolean;
  onVoid: (exp: Expense) => void;
}> = ({ expense, canManage, onVoid }) => {
  const theme = useTheme();

  if (!expense) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <ReceiptLongOutlined sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
        <Typography variant="body2" color="text.disabled">
          Выберите расход из списка
        </Typography>
      </Box>
    );
  }

  const amount = parseFloat(expense.amount);
  const isCash = expense.method === "cash";

  return (
    <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Avatar variant="rounded" sx={{ bgcolor: "action.selected", color: "text.secondary", width: 48, height: 48 }}>
            <ReceiptLongOutlined />
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={600} noWrap>
              {expense.categoryName ?? "Без категории"}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {formatDateRu(expense.expenseDate)}
            </Typography>
          </Box>
          {expense.isVoided && (
            <Chip label="Аннулирован" size="small" color="error" variant="outlined" />
          )}
        </Stack>

        <Divider />

        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Сумма</Typography>
            <Typography variant="body1" fontWeight={700} color={isCash ? "success.main" : "info.main"}>
              {formatKGS(amount)}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">Метод</Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              {isCash
                ? <AccountBalanceWalletOutlined sx={{ fontSize: 16, color: "success.main" }} />
                : <CreditCardOutlined sx={{ fontSize: 16, color: "info.main" }} />}
              <Typography variant="body2">{isCash ? "Наличные" : "Карта"}</Typography>
            </Stack>
          </Stack>
          {expense.branchName && (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Филиал</Typography>
              <Typography variant="body2">{expense.branchName}</Typography>
            </Stack>
          )}
          {expense.createdByName && (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Создал</Typography>
              <Typography variant="body2">{expense.createdByName}</Typography>
            </Stack>
          )}
          {expense.description && (
            <Stack spacing={0.25}>
              <Typography variant="body2" color="text.secondary">Описание</Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{expense.description}</Typography>
            </Stack>
          )}
          {expense.isVoided && expense.voidReason && (
            <Stack spacing={0.25}>
              <Typography variant="body2" color="text.secondary">Причина аннулирования</Typography>
              <Typography variant="body2" color="error.main">{expense.voidReason}</Typography>
            </Stack>
          )}
        </Stack>

        {canManage && !expense.isVoided && (
          <>
            <Divider />
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<BlockOutlined />}
              onClick={() => onVoid(expense)}
            >
              Аннулировать
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
};

// ── AddExpenseDrawer ───────────────────────────────────────────────────────────

type AddDrawerProps = {
  open: boolean;
  onClose: () => void;
  organizationId?: number;
  branchId?: number;
  categories: { id: number; name: string }[];
  onCreated: (exp: Expense) => void;
};

const AddExpenseDrawer: React.FC<AddDrawerProps> = ({
  open,
  onClose,
  organizationId,
  branchId,
  categories,
  onCreated,
}) => {
  const [categoryId, setCategoryId] = React.useState<number | "">("");
  const [method, setMethod] = React.useState<ExpenseMethod>("cash");
  const [amount, setAmount] = React.useState("");
  const [expenseDate, setExpenseDate] = React.useState(today());
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCategoryId("");
      setMethod("cash");
      setAmount("");
      setExpenseDate(today());
      setDescription("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    setError(null);
    const parsed = parseFloat(amount.replace(",", "."));
    if (!categoryId) { setError("Выберите категорию"); return; }
    if (!amount || isNaN(parsed) || parsed <= 0) { setError("Введите корректную сумму"); return; }
    setBusy(true);
    try {
      const created = await createExpense({
        organizationId,
        branchId,
        categoryId: categoryId as number,
        method,
        amount: parsed.toFixed(2),
        expenseDate,
        description: description.trim(),
      });
      onCreated(created);
      onClose();
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1 }}>
        <Typography variant="h6">Добавить расход</Typography>
        <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </Box>
      <Divider />
      <Box sx={{ p: 2, flex: 1, overflowY: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
        <Stack spacing={3}>
          {/* Категория */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Категория *
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
              SelectProps={{ displayEmpty: true }}
              disabled={busy}
            >
              <MenuItem value="">
                <Typography variant="body2" color="text.secondary">Выберите категорию</Typography>
              </MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* Метод оплаты */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Метод оплаты
            </Typography>
            <ToggleButtonGroup
              value={method}
              exclusive
              onChange={(_, v) => v && setMethod(v)}
              fullWidth
              size="small"
              disabled={busy}
            >
              <ToggleButton value="cash">
                <AccountBalanceWalletOutlined sx={{ mr: 0.5, fontSize: 18 }} />
                Наличные
              </ToggleButton>
              <ToggleButton value="card">
                <CreditCardOutlined sx={{ mr: 0.5, fontSize: 18 }} />
                Карта
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {/* Сумма */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Сумма *
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="number"
              value={amount}
              onChange={(e) => { setError(null); setAmount(e.target.value); }}
              inputProps={{ min: 0, step: "any" }}
              InputProps={{ endAdornment: <InputAdornment position="end">сом</InputAdornment> }}
              disabled={busy}
            />
          </Stack>

          {/* Дата */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Дата расхода
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              disabled={busy}
            />
          </Stack>

          {/* Описание */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Описание
            </Typography>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              placeholder="Необязательно"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </Box>
      <Divider />
      <Box sx={{ px: 2, py: 1.5, flexShrink: 0 }}>
        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={busy || !amount || !categoryId}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {busy ? "Сохранение…" : "Добавить"}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
};

// ── VoidDialog ─────────────────────────────────────────────────────────────────

const VoidDialog: React.FC<{
  expense: Expense | null;
  onClose: () => void;
  onVoided: (exp: Expense) => void;
}> = ({ expense, onClose, onVoided }) => {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!expense) { setReason(""); setError(null); }
  }, [expense]);

  const handleVoid = async () => {
    if (!expense) return;
    setError(null);
    if (!reason.trim()) { setError("Укажите причину аннулирования"); return; }
    setBusy(true);
    try {
      const voided = await voidExpense(expense.id, { reason: reason.trim() });
      onVoided(voided);
      onClose();
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(expense)} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Аннулировать расход</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Это действие нельзя отменить. Расход будет помечен как аннулированный.
          </Typography>
          <TextField
            label="Причина *"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => { setError(null); setReason(e.target.value); }}
            disabled={busy}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Отмена</Button>
        <Button color="error" variant="contained" onClick={handleVoid} disabled={busy || !reason.trim()}>
          {busy ? <CircularProgress size={16} color="inherit" /> : "Аннулировать"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Главный компонент ──────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const DjangoExpensesPage: React.FC = () => {
  usePageTitle("Расходы");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const canView = useCan("finance.view");
  const canManage = useCan("finance.expense.manage");

  const {
    isSuperAdmin,
    activeOrganization,
    activeBranch,
    memberships,
    loading: permLoading,
  } = usePermissions();

  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;

  const orgId = orgRequired ? (activeOrganization?.id ?? undefined) : undefined;
  const branchId = activeBranch?.id ?? undefined;

  // Фильтры периода
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<number | null>(null);
  const [selectedYear, setSelectedYear] = React.useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = React.useState<string | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [expandedEmployee, setExpandedEmployee] = React.useState<string | null>(null);
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = React.useState<string | null>(null);

  // UI-state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [selectedExpense, setSelectedExpense] = React.useState<Expense | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<Expense | null>(null);

  const queryClient = useQueryClient();

  // Сбрасываем при смене орг/филиала
  const prevOrgId = React.useRef<number | undefined>(orgId);
  const prevBranchId = React.useRef<number | undefined>(branchId);
  React.useEffect(() => {
    if (prevOrgId.current !== orgId || prevBranchId.current !== branchId) {
      prevOrgId.current = orgId;
      prevBranchId.current = branchId;
      setSelectedExpense(null);
      setSelectedCategoryId(null);
      setSelectedYear(null);
      setSelectedMonth(null);
      setSelectedDate(null);
    }
  }, [orgId, branchId]);

  // ── Категории ────────────────────────────────────────────────────────────────
  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.expenses.categories(orgId ?? null),
    queryFn: ({ signal }) => getExpenseCategories(orgId, signal),
    enabled: !permLoading && canView && !needsOrg,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const categories = (categoriesQuery.data ?? []).filter((c) => c.isActive);

  // ── Расходы ──────────────────────────────────────────────────────────────────
  const expFilters = React.useMemo(() => {
    const f: Record<string, unknown> = { organizationId: orgId, branchId };
    if (selectedCategoryId) f.categoryId = selectedCategoryId;
    if (selectedYear && selectedMonth) {
      const y = Number(selectedYear);
      const m = Number(selectedMonth) - 1;
      const from = new Date(y, m, 1);
      const to = new Date(y, m + 1, 0);
      f.dateFrom = from.toISOString().slice(0, 10);
      f.dateTo = to.toISOString().slice(0, 10);
    } else if (selectedYear) {
      f.dateFrom = `${selectedYear}-01-01`;
      f.dateTo = `${selectedYear}-12-31`;
    }
    f.isVoided = false;
    f.pageSize = PAGE_SIZE;
    return f;
  }, [orgId, branchId, selectedCategoryId, selectedYear, selectedMonth]);

  const expensesQuery = useQuery({
    queryKey: djangoQueryKeys.expenses.list(expFilters),
    queryFn: ({ signal }) => getExpenses(
      {
        organizationId: orgId,
        branchId,
        categoryId: selectedCategoryId ?? undefined,
        dateFrom: expFilters.dateFrom as string | undefined,
        dateTo: expFilters.dateTo as string | undefined,
        isVoided: false,
        pageSize: PAGE_SIZE,
      },
      signal,
    ),
    enabled: !permLoading && canView && !needsOrg,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    retry: (count, err) => {
      if ((err as ApiError)?.status === 403) return false;
      return count < 1;
    },
  });

  const allExpenses = expensesQuery.data?.results ?? [];

  // Локальная фильтрация по поиску и дате
  const filteredExpenses = React.useMemo(() => {
    let list = allExpenses;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.categoryName?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.createdByName?.toLowerCase().includes(q),
      );
    }
    if (selectedDate) {
      list = list.filter((e) => e.expenseDate === selectedDate);
    }
    if (selectedEmployeeFilter) {
      list = list.filter((e) => e.createdByName === selectedEmployeeFilter);
    }
    return list;
  }, [allExpenses, searchQuery, selectedDate, selectedEmployeeFilter]);

  // Вычисляем года, месяца и группировки для левой панели
  const availableYears = React.useMemo(() => {
    const ys = new Set(allExpenses.map((e) => e.expenseDate.slice(0, 4)));
    return Array.from(ys).sort((a, b) => b.localeCompare(a));
  }, [allExpenses]);

  const availableMonths = React.useMemo(() => {
    if (!selectedYear) return [];
    const ms = new Set(
      allExpenses
        .filter((e) => e.expenseDate.startsWith(selectedYear))
        .map((e) => e.expenseDate.slice(0, 7)),
    );
    return Array.from(ms)
      .sort((a, b) => a.localeCompare(b))
      .map((ym) => ({ value: ym, monthIndex: Number(ym.slice(5, 7)) - 1 }));
  }, [allExpenses, selectedYear]);

  // Группировка по сотрудникам для выбранного месяца
  const monthExpenses = React.useMemo(() => {
    if (!selectedMonth) return allExpenses;
    return allExpenses.filter((e) => e.expenseDate.startsWith(selectedMonth));
  }, [allExpenses, selectedMonth]);

  const groupedByEmployee = React.useMemo(() => {
    const map = new Map<string, { total: number; days: Map<string, number> }>();
    monthExpenses.forEach((e) => {
      const name = e.createdByName ?? "Система";
      const entry = map.get(name) ?? { total: 0, days: new Map() };
      entry.total += parseFloat(e.amount);
      entry.days.set(e.expenseDate, (entry.days.get(e.expenseDate) ?? 0) + parseFloat(e.amount));
      map.set(name, entry);
    });
    return Array.from(map.entries()).map(([employeeName, { total, days }]) => ({
      employeeName,
      total,
      days: Array.from(days.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, total]) => ({ date, total })),
    }));
  }, [monthExpenses]);

  // Месячный итог
  const monthTotal = React.useMemo(
    () => groupedByEmployee.reduce((s, e) => s + e.total, 0),
    [groupedByEmployee],
  );

  if (!permLoading && !canView) return <AccessDenied />;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Расходы"
        showTitle={false}
        addButtonText={canManage ? "Добавить расход" : undefined}
        onAdd={canManage ? () => setAddOpen(true) : undefined}
        showSearch
        searchVal={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Поиск..."
        actions={
          <TextField
            select
            size="small"
            value={selectedCategoryId ?? ""}
            onChange={(e) => setSelectedCategoryId(e.target.value === "" ? null : Number(e.target.value))}
            disabled={categoriesQuery.isLoading || categories.length === 0}
            SelectProps={{ displayEmpty: true }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">
              {categoriesQuery.isLoading ? "Загрузка..." : categories.length === 0 ? "Категорий нет" : "Все категории"}
            </MenuItem>
            {categories.map((cat) => (
              <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
            ))}
          </TextField>
        }
      />

      {needsOrg && (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="info">Выберите организацию, чтобы просмотреть расходы.</Alert>
        </Box>
      )}

      {!needsOrg && (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            overflowX: "hidden",
            pb: theme.appLayout.page.paddingY,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {/* 3-колоночный грид */}
          <Box sx={(t) => ({ px: t.appLayout.page.paddingX, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 })}>
            <Grid2 container spacing={2} sx={{ flex: 1, minHeight: 0 }}>

              {/* Левая колонка — Период */}
              <Grid2
                size={{ xs: 12, md: 3 }}
                sx={{
                  position: { md: "sticky" },
                  top: { md: theme.spacing(2) },
                  alignSelf: "flex-start",
                  height: { xs: "auto", md: "calc(100dvh - 176px)" },
                  display: "flex",
                  flexDirection: "column",
                  overflow: { xs: "visible", md: "hidden" },
                }}
              >
                <Paper elevation={0} variant="outlined" sx={{ height: { xs: "auto", md: "100%" }, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Период</Typography>
                    <Button size="small" onClick={() => { setSelectedYear(null); setSelectedMonth(null); setSelectedDate(null); setSelectedEmployeeFilter(null); setExpandedEmployee(null); }} sx={{ textTransform: "none" }}>
                      Все расходы
                    </Button>
                  </Box>
                  <Box sx={{ overflowY: "auto", flex: 1, p: 2 }}>
                    <Stack spacing={2}>
                      {/* Год */}
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Год</Typography>
                        <TextField
                          select size="small" fullWidth
                          value={selectedYear ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSelectedYear(v || null);
                            setSelectedMonth(null);
                            setSelectedDate(null);
                            setSelectedEmployeeFilter(null);
                            setExpandedEmployee(null);
                          }}
                          SelectProps={{ displayEmpty: true }}
                        >
                          <MenuItem value=""><Typography variant="body2" color="text.secondary">Все годы</Typography></MenuItem>
                          {availableYears.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                        </TextField>
                      </Stack>

                      {/* Месяц */}
                      {selectedYear && (
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Месяц</Typography>
                          <TextField
                            select size="small" fullWidth
                            value={selectedMonth ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSelectedMonth(v || null);
                              setSelectedDate(null);
                              setSelectedEmployeeFilter(null);
                              setExpandedEmployee(null);
                            }}
                            SelectProps={{ displayEmpty: true }}
                            disabled={availableMonths.length === 0}
                          >
                            <MenuItem value=""><Typography variant="body2" color="text.secondary">Все месяцы</Typography></MenuItem>
                            {availableMonths.map((m) => <MenuItem key={m.value} value={m.value}>{MONTH_NAMES[m.monthIndex]}</MenuItem>)}
                          </TextField>
                        </Stack>
                      )}

                      {/* Итого за месяц */}
                      {selectedMonth && (
                        <Box sx={{ p: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 2, border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}` }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                            Итого за месяц
                          </Typography>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <AccountBalanceWalletOutlined sx={{ color: "primary.main", fontSize: 20 }} />
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: "primary.main" }}>
                              {formatKGS(monthTotal)}
                            </Typography>
                          </Stack>
                        </Box>
                      )}

                      {/* Сотрудники */}
                      {selectedMonth && groupedByEmployee.length > 0 && (
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Сотрудники</Typography>
                          <List dense sx={{ py: 0 }}>
                            {groupedByEmployee.map((emp) => {
                              const isExpanded = expandedEmployee === emp.employeeName;
                              const isSelected = selectedEmployeeFilter === emp.employeeName;
                              return (
                                <React.Fragment key={emp.employeeName}>
                                  <ListItemButton
                                    selected={isSelected}
                                    onClick={() => {
                                      if (isExpanded) {
                                        setExpandedEmployee(null);
                                        setSelectedEmployeeFilter(null);
                                        setSelectedDate(null);
                                      } else {
                                        setExpandedEmployee(emp.employeeName);
                                        setSelectedEmployeeFilter(emp.employeeName);
                                        setSelectedDate(null);
                                      }
                                    }}
                                    sx={{ borderRadius: 1, mb: 0.5, pr: 1 }}
                                  >
                                    <Typography variant="body2" sx={{ flex: 1, fontWeight: isSelected ? 600 : 400 }}>{emp.employeeName}</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>{formatKGS(emp.total)}</Typography>
                                    {isExpanded ? <ExpandLess fontSize="small" color="action" /> : <ExpandMore fontSize="small" color="action" />}
                                  </ListItemButton>
                                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                    <List dense disablePadding>
                                      {emp.days.map((day) => (
                                        <ListItemButton
                                          key={day.date}
                                          sx={{ borderRadius: 1, mb: 0.5, pl: 3, bgcolor: selectedDate === day.date ? "action.selected" : "transparent" }}
                                          onClick={() => { setSelectedEmployeeFilter(emp.employeeName); setSelectedDate(day.date); }}
                                        >
                                          <Typography variant="body2" sx={{ flex: 1, color: "text.secondary" }}>{formatDateRu(day.date)}</Typography>
                                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatKGS(day.total)}</Typography>
                                        </ListItemButton>
                                      ))}
                                    </List>
                                  </Collapse>
                                </React.Fragment>
                              );
                            })}
                          </List>
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                </Paper>
              </Grid2>

              {/* Средняя колонка — Список расходов */}
              <Grid2
                size={{ xs: 12, md: 4 }}
                sx={{
                  position: { md: "sticky" },
                  top: { md: theme.spacing(2) },
                  alignSelf: "flex-start",
                  height: { xs: "auto", md: "calc(100dvh - 176px)" },
                  display: "flex",
                  flexDirection: "column",
                  overflow: { xs: "visible", md: "hidden" },
                }}
              >
                <Paper elevation={0} variant="outlined" sx={{ height: { xs: "auto", md: "100%" }, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Список расходов ({filteredExpenses.length})
                    </Typography>
                  </Box>
                  <Box sx={{ overflowY: "auto", flex: 1 }}>
                    {expensesQuery.isLoading ? (
                      <Box sx={{ p: 4, textAlign: "center" }}>
                        <CircularProgress size={24} />
                      </Box>
                    ) : filteredExpenses.length === 0 ? (
                      <Box sx={{ p: 4, textAlign: "center" }}>
                        <Typography variant="body2" color="text.secondary">Нет расходов</Typography>
                      </Box>
                    ) : (
                      <List sx={{ py: 0 }}>
                        {(() => {
                          let currentDay = "";
                          return filteredExpenses.map((exp) => {
                            const dayStr = exp.expenseDate ? formatDateRu(exp.expenseDate) : "Без даты";
                            const isNewDay = dayStr !== currentDay;
                            if (isNewDay) currentDay = dayStr;
                            const isCash = exp.method === "cash";
                            return (
                              <React.Fragment key={exp.id}>
                                {isNewDay && (
                                  <Box sx={{ px: 2, py: 1, bgcolor: "background.default", borderBottom: 1, borderColor: "divider", position: "sticky", top: 0, zIndex: 1 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{dayStr}</Typography>
                                  </Box>
                                )}
                                <ListItemButton
                                  sx={{
                                    px: 2, py: 1.5,
                                    bgcolor: selectedExpense?.id === exp.id ? "action.selected" : "transparent",
                                    "&:hover": { bgcolor: "action.hover" },
                                    borderBottom: 1,
                                    borderColor: "divider",
                                    opacity: exp.isVoided ? 0.5 : 1,
                                  }}
                                  onClick={() => setSelectedExpense(exp)}
                                >
                                  <Avatar variant="rounded" sx={{ mr: 2, width: 40, height: 40, bgcolor: "action.selected", color: "text.secondary" }}>
                                    <ReceiptLongOutlined />
                                  </Avatar>
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body1" sx={{ fontWeight: 500 }} noWrap>
                                      {exp.categoryName ?? "Без категории"}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" noWrap>
                                      {exp.description || exp.createdByName || ""}
                                    </Typography>
                                  </Box>
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Tooltip title={isCash ? "Наличные" : "Карта"}>
                                      {isCash
                                        ? <AccountBalanceWalletOutlined sx={{ fontSize: 16, color: "success.main" }} />
                                        : <CreditCardOutlined sx={{ fontSize: 16, color: "info.main" }} />}
                                    </Tooltip>
                                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                      {formatKGS(parseFloat(exp.amount))}
                                    </Typography>
                                  </Stack>
                                </ListItemButton>
                              </React.Fragment>
                            );
                          });
                        })()}
                      </List>
                    )}
                  </Box>
                </Paper>
              </Grid2>

              {/* Правая колонка — Детали (только desktop) */}
              {!isMobile && (
                <Grid2
                  size={{ xs: 12, md: 5 }}
                  sx={{
                    position: { md: "sticky" },
                    top: { md: theme.spacing(2) },
                    alignSelf: "flex-start",
                    height: { md: "calc(100dvh - 176px)" },
                    display: "flex",
                    flexDirection: "column",
                    overflow: { xs: "visible", md: "hidden" },
                  }}
                >
                  <Box sx={{ height: "100%", overflowY: "auto", pr: 0.5, "&::-webkit-scrollbar": { width: 8 }, "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 1 } }}>
                    <ExpenseDetailCard
                      expense={selectedExpense}
                      canManage={canManage}
                      onVoid={setVoidTarget}
                    />
                  </Box>
                </Grid2>
              )}
            </Grid2>
          </Box>

          {/* Mobile bottom sheet для деталей */}
          {isMobile && selectedExpense && (
            <Box
              sx={{
                position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1300,
                bgcolor: "background.paper",
                borderTop: "1px solid",
                borderColor: "divider",
                p: 2,
                maxHeight: "60vh",
                overflowY: "auto",
              }}
            >
              <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
                <IconButton size="small" onClick={() => setSelectedExpense(null)}>
                  <CloseOutlined fontSize="small" />
                </IconButton>
              </Stack>
              <ExpenseDetailCard expense={selectedExpense} canManage={canManage} onVoid={setVoidTarget} />
            </Box>
          )}
        </Box>
      )}

      {/* Drawer создания расхода */}
      <AddExpenseDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        organizationId={orgId}
        branchId={branchId}
        categories={categories}
        onCreated={(exp) => {
          void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.expenses.all });
          setSelectedExpense(exp);
        }}
      />

      {/* Диалог аннулирования */}
      <VoidDialog
        expense={voidTarget}
        onClose={() => setVoidTarget(null)}
        onVoided={(voided) => {
          void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.expenses.all });
          setSelectedExpense(voided);
          setVoidTarget(null);
        }}
      />
    </Box>
  );
};

export default DjangoExpensesPage;
