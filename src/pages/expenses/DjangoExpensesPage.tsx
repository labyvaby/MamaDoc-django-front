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
  Grid2,
  IconButton,
  List,
  ListItemButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader, AppBottomSheet, PaymentInfoBlock } from "../../components/ui";
import { DjangoAddExpenseDrawer } from "../../components/expenses/DjangoAddExpenseDrawer";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useCan } from "../../hooks/useCan";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import {
  getExpenses,
  getExpenseCategories,
  voidExpense,
  uploadExpensePhoto,
  parseBackendError,
  type Expense,
} from "../../api/expenses";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── DetailRow ──────────────────────────────────────────────────────────────────

const DetailRow: React.FC<{ label: string; value?: string | null; children?: React.ReactNode }> = ({
  label, value, children,
}) => (
  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
    <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, minWidth: 80 }}>
      {label}
    </Typography>
    {children ?? (
      <Typography variant="body2" sx={{ fontWeight: 500, textAlign: "right" }}>
        {value ?? "—"}
      </Typography>
    )}
  </Stack>
);

// ── ExpenseDetailCard ──────────────────────────────────────────────────────────

const PHOTO_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const ExpenseDetailCard: React.FC<{
  expense: Expense | null;
  canManage: boolean;
  onVoid: (exp: Expense) => void;
  onPhotoUploaded: (exp: Expense) => void;
}> = ({ expense, canManage, onVoid, onPhotoUploaded }) => {
  const theme = useTheme();
  const [photoUploading, setPhotoUploading] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setPhotoError(null);
  }, [expense?.id]);

  const handlePhotoFile = async (file: File) => {
    if (!expense) return;
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoError("Фото не должно превышать 5 МБ");
      return;
    }
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const updated = await uploadExpensePhoto(expense.id, file);
      onPhotoUploaded(updated);
    } catch (e) {
      setPhotoError(parseBackendError(e));
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  if (!expense) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 1,
          color: "text.secondary",
        }}
      >
        <Typography>Выберите расход для просмотра</Typography>
      </Box>
    );
  }

  const cashAmt = parseFloat(expense.cashAmount);
  const cardAmt = parseFloat(expense.cardAmount);
  const total = parseFloat(expense.amount);
  const title = expense.name || expense.categoryName || "Расход";

  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "14px" }}
    >
      {/* Фото */}
      {expense.photoUrl && (
        <Box
          sx={{
            width: "100%",
            height: 180,
            overflow: "hidden",
            flexShrink: 0,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Box
            component="img"
            src={expense.photoUrl}
            alt="Фото расхода"
            sx={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Box>
      )}

      {/* Шапка */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <Avatar
          variant="rounded"
          sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.onSurface", width: 44, height: 44 }}
        >
          <ReceiptLongOutlined />
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap title={title}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {expense.categoryName ?? "Без категории"}
          </Typography>
        </Box>
        {expense.isVoided && (
          <Chip label="Аннулирован" size="small" color="error" variant="outlined" sx={{ flexShrink: 0 }} />
        )}
      </Box>

      {/* Кнопки управления */}
      {canManage && !expense.isVoided && (
        <Box
          sx={{
            px: 2.5,
            py: 1,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 1,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {/* Прикрепить фото — только если фото ещё нет */}
          {!expense.photoUrl && (
            <>
              <input
                ref={photoInputRef}
                type="file"
                accept={PHOTO_ACCEPT}
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handlePhotoFile(f);
                }}
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={photoUploading ? <CircularProgress size={14} color="inherit" /> : <ImageOutlined sx={{ fontSize: 16 }} />}
                onClick={() => { setPhotoError(null); photoInputRef.current?.click(); }}
                disabled={photoUploading}
                sx={{ textTransform: "none" }}
              >
                {photoUploading ? "Загрузка..." : "Прикрепить фото"}
              </Button>
            </>
          )}
          {/* Заполнитель, чтобы кнопка аннулирования была справа когда нет фото-кнопки */}
          {expense.photoUrl && <Box sx={{ flex: 1 }} />}

          <Tooltip title="Аннулировать расход">
            <IconButton
              size="small"
              onClick={() => onVoid(expense)}
              sx={{
                border: `1px solid ${theme.palette.error.main}`,
                color: "error.main",
                borderRadius: 1,
                px: 1.5,
                py: 0.5,
                gap: 0.5,
                "&:hover": { bgcolor: alpha(theme.palette.error.main, 0.06) },
              }}
            >
              <BlockOutlined sx={{ fontSize: 16 }} />
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Аннулировать</Typography>
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Ошибка загрузки фото */}
      {photoError && (
        <Box sx={{ px: 2.5, pt: 1, flexShrink: 0 }}>
          <Alert severity="error" onClose={() => setPhotoError(null)}>{photoError}</Alert>
        </Box>
      )}

      {/* Тело — скроллируемое */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
        <Stack spacing={2}>
          {/* Платёжная информация */}
          <PaymentInfoBlock
            payment={{
              baseTotal: total,
              cash: cashAmt,
              card: cardAmt,
              finalTotal: total,
              debt: 0,
              status: expense.isVoided ? "Отменено" : "Оплачено",
            }}
            variant="detailed"
            showIcons
          />

          <Divider />

          <Stack spacing={1.5}>
            <DetailRow label="Дата" value={formatDateRu(expense.expenseDate)} />
            <DetailRow label="Категория" value={expense.categoryName ?? "—"} />
            {expense.employeeName && (
              <DetailRow label="Получатель" value={expense.employeeName} />
            )}
            {expense.branchName && (
              <DetailRow label="Филиал" value={expense.branchName} />
            )}
            {expense.createdByName && (
              <DetailRow label="Создал" value={expense.createdByName} />
            )}
            {expense.affectsMonth && (
              <DetailRow label="Месяц" value={expense.affectsMonth} />
            )}
            {expense.description && (
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary">Комментарий</Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", fontWeight: 500 }}>
                  {expense.description}
                </Typography>
              </Stack>
            )}
          </Stack>

          {expense.isVoided && expense.voidReason && (
            <>
              <Divider />
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: alpha(theme.palette.error.main, 0.05),
                  borderRadius: "10px",
                  border: `1px solid ${alpha(theme.palette.error.main, 0.15)}`,
                }}
              >
                <Typography variant="caption" color="error.main" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                  Причина аннулирования
                </Typography>
                <Typography variant="body2">{expense.voidReason}</Typography>
              </Box>
            </>
          )}
        </Stack>
      </Box>
    </Paper>
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
    if (reason.trim().length < 3) { setError("Причина аннулирования должна содержать минимум 3 символа"); return; }
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
        <Button color="error" variant="contained" onClick={handleVoid} disabled={busy || reason.trim().length < 3}>
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
  const canView = useCan(["finance.view", "finance.expense.view"]);
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
      // selectedMonth хранится как "YYYY-MM"; берём номер месяца из него.
      const y = Number(selectedMonth.slice(0, 4));
      const m = Number(selectedMonth.slice(5, 7)) - 1;
      // Последний день месяца: day=0 следующего месяца. Собираем строку
      // вручную, без toISOString(), чтобы не ловить сдвиг по UTC.
      const lastDay = new Date(y, m + 1, 0).getDate();
      f.dateFrom = `${selectedMonth}-01`;
      f.dateTo = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;
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
          e.name?.toLowerCase().includes(q) ||
          e.categoryName?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.employeeName?.toLowerCase().includes(q) ||
          e.createdByName?.toLowerCase().includes(q),
      );
    }
    if (selectedDate) {
      list = list.filter((e) => e.expenseDate === selectedDate);
    }
    if (selectedEmployeeFilter !== null) {
      if (selectedEmployeeFilter === "") {
        list = list.filter((e) => !e.employeeName);
      } else {
        list = list.filter((e) => e.employeeName === selectedEmployeeFilter);
      }
    }
    return list;
  }, [allExpenses, searchQuery, selectedDate, selectedEmployeeFilter]);

  // Вычисляем года и месяцы для левой панели
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

  // Группировка по employeeName (получателю) для выбранного месяца
  const monthExpenses = React.useMemo(() => {
    if (!selectedMonth) return allExpenses;
    return allExpenses.filter((e) => e.expenseDate.startsWith(selectedMonth));
  }, [allExpenses, selectedMonth]);

  const groupedByEmployee = React.useMemo(() => {
    const map = new Map<string, { total: number; days: Map<string, number> }>();
    monthExpenses.forEach((e) => {
      // null employeeName → "Без сотрудника" (key = "")
      const key = e.employeeName ?? "";
      const label = e.employeeName ?? "Без сотрудника";
      const entry = map.get(label) ?? { total: 0, days: new Map() };
      entry.total += parseFloat(e.amount);
      entry.days.set(e.expenseDate, (entry.days.get(e.expenseDate) ?? 0) + parseFloat(e.amount));
      map.set(label, entry);
      void key;
    });
    return Array.from(map.entries()).map(([label, { total, days }]) => ({
      employeeLabel: label,
      employeeFilterKey: label === "Без сотрудника" ? "" : label,
      total,
      days: Array.from(days.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, amt]) => ({ date, total: amt })),
    }));
  }, [monthExpenses]);

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
                        <Box sx={{ p: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: "14px", border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}` }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                            Итого за месяц
                          </Typography>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <AccountBalanceWalletOutlined sx={{ color: "primary.onSurface", fontSize: 20 }} />
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "primary.onSurface" }}>
                              {formatKGS(monthTotal)}
                            </Typography>
                          </Stack>
                        </Box>
                      )}

                      {/* Сотрудники / получатели */}
                      {selectedMonth && groupedByEmployee.length > 0 && (
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Получатели</Typography>
                          <List dense sx={{ py: 0 }}>
                            {groupedByEmployee.map((emp) => {
                              const isExpanded = expandedEmployee === emp.employeeLabel;
                              const isSelected = selectedEmployeeFilter === emp.employeeFilterKey && selectedEmployeeFilter !== null;
                              return (
                                <React.Fragment key={emp.employeeLabel}>
                                  <ListItemButton
                                    selected={isSelected}
                                    onClick={() => {
                                      if (isExpanded) {
                                        setExpandedEmployee(null);
                                        setSelectedEmployeeFilter(null);
                                        setSelectedDate(null);
                                      } else {
                                        setExpandedEmployee(emp.employeeLabel);
                                        setSelectedEmployeeFilter(emp.employeeFilterKey);
                                        setSelectedDate(null);
                                      }
                                    }}
                                    sx={{ borderRadius: 1, mb: 0.5, pr: 1 }}
                                  >
                                    <PersonOutlineOutlined sx={{ fontSize: 16, mr: 1, color: "text.secondary" }} />
                                    <Typography variant="body2" sx={{ flex: 1, fontWeight: isSelected ? 600 : 400 }}>{emp.employeeLabel}</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>{formatKGS(emp.total)}</Typography>
                                    {isExpanded ? <ExpandLess fontSize="small" color="action" /> : <ExpandMore fontSize="small" color="action" />}
                                  </ListItemButton>
                                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                    <List dense disablePadding>
                                      {emp.days.map((day) => (
                                        <ListItemButton
                                          key={day.date}
                                          sx={{ borderRadius: 1, mb: 0.5, pl: 3, bgcolor: selectedDate === day.date ? "action.selected" : "transparent" }}
                                          onClick={() => { setSelectedEmployeeFilter(emp.employeeFilterKey); setSelectedDate(day.date); }}
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
                            const cashAmt = parseFloat(exp.cashAmount);
                            const cardAmt = parseFloat(exp.cardAmount);
                            const isMixed = cashAmt > 0 && cardAmt > 0;
                            const isCash = !isMixed && cashAmt > 0;
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
                                  {exp.photoUrl ? (
                                    <Box
                                      component="img"
                                      src={exp.photoUrl}
                                      alt=""
                                      sx={{ mr: 2, width: 40, height: 40, borderRadius: 1, objectFit: "cover", flexShrink: 0 }}
                                    />
                                  ) : (
                                    <Avatar variant="rounded" sx={{ mr: 2, width: 40, height: 40, bgcolor: "action.selected", color: "text.secondary" }}>
                                      <ReceiptLongOutlined />
                                    </Avatar>
                                  )}
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body1" sx={{ fontWeight: 500 }} noWrap>
                                      {exp.name || exp.categoryName || "Расход"}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" noWrap>
                                      {exp.employeeName ?? exp.categoryName ?? ""}
                                    </Typography>
                                  </Box>
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    {isMixed ? (
                                      <>
                                        <AccountBalanceWalletOutlined sx={{ fontSize: 14, color: "success.main" }} />
                                        <CreditCardOutlined sx={{ fontSize: 14, color: "info.main" }} />
                                      </>
                                    ) : isCash ? (
                                      <Tooltip title="Наличные">
                                        <AccountBalanceWalletOutlined sx={{ fontSize: 16, color: "success.main" }} />
                                      </Tooltip>
                                    ) : (
                                      <Tooltip title="Карта">
                                        <CreditCardOutlined sx={{ fontSize: 16, color: "info.main" }} />
                                      </Tooltip>
                                    )}
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
                      onPhotoUploaded={(updated) => {
                        setSelectedExpense(updated);
                        void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.expenses.all });
                      }}
                    />
                  </Box>
                </Grid2>
              )}
            </Grid2>
          </Box>

          {/* Mobile: AppBottomSheet для деталей */}
          {isMobile && (
            <AppBottomSheet
              open={Boolean(selectedExpense)}
              onClose={() => setSelectedExpense(null)}
            >
              <Box sx={{ p: 2 }}>
                <IconButton
                  onClick={() => setSelectedExpense(null)}
                  size="small"
                  sx={{ position: "absolute", top: 8, right: 8 }}
                >
                  <CloseOutlined fontSize="small" />
                </IconButton>
                <ExpenseDetailCard
                  expense={selectedExpense}
                  canManage={canManage}
                  onVoid={setVoidTarget}
                  onPhotoUploaded={(updated) => {
                    setSelectedExpense(updated);
                    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.expenses.all });
                  }}
                />
              </Box>
            </AppBottomSheet>
          )}
        </Box>
      )}

      {/* Drawer создания расхода */}
      <DjangoAddExpenseDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        organizationId={orgId}
        branchId={branchId}
        onCreated={(exp) => {
          void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.expenses.all });
          setSelectedExpense(exp);
          setAddOpen(false);
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
