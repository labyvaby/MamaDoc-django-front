import React from "react";
import {
  Box,
  Typography,
  List,
  ListItemButton,
  Stack,
  Divider,
  Paper,
  Grid2,
  Button,
  useMediaQuery,
  Avatar,
  IconButton,
  Tooltip,
  TextField,
  MenuItem,
  Chip,
  Collapse,
  Badge,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import { formatKGS, formatDateRu } from "../../utility/format";
import type { Expense, EmployeesRow } from "./types";
import AddExpenseDrawer from "../../components/expenses/AddExpenseDrawer";
import EditExpenseDrawer from "../../components/expenses/EditExpenseDrawer";
import { DeleteExpenseDialog } from "../../components/expenses/DeleteExpenseDialog";
import { PaymentInfoBlock } from "../../components/ui";
import { supabase } from "../../utility/supabaseClient";
import { ExpensesService } from "../../services/expenses";
import { fetchEmployees } from "../../services/employees";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useSimplePageCache } from "../../hooks/useSimplePageCache";
import { PageHeader, AppBottomSheet } from "../../components/ui";
import { usePermissions } from "../../hooks/usePermissions";
import { EMPLOYEES_SOURCE } from "../../features/employees/api";

const CATEGORIES_TABLE = "ExpenseCategories";

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

type CategoryRow = {
  id: string | number | null;
  name: string | null;
};

const getNameFrom = (o: Record<string, unknown>): string => {
  const directKeys = ["full_name", "fullName", "name", "fio", "ФИО сотрудников", "ФИО"];
  const vals: string[] = [];

  for (const k of directKeys) {
    const v = o[k as keyof typeof o];
    if (typeof v === "string" && v.trim().length > 0) vals.push(v.trim());
  }
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === "string" && /(name|fio|фио)/i.test(k) && v.trim().length > 0) {
      vals.push(v.trim());
    }
  }
  const fa = (o as Record<string, unknown>)["first_name"];
  const fb = (o as Record<string, unknown>)["last_name"];
  const combined = `${typeof fa === "string" ? fa.trim() : ""}${(typeof fa === "string" && fa && typeof fb === "string" && fb) ? " " : ""
    }${typeof fb === "string" ? fb.trim() : ""}`.trim();

  const candidate = vals.concat(combined).find((s) => s.length > 0);
  return candidate ?? "";
};

// --- Employee Story Item (Main Page Style) ---
type EmployeeStoryItemProps = {
  name: string;
  nickname?: string;
  photoUrl?: string;
  isActive: boolean;
  onClick: () => void;
};

const EmployeeStoryItem: React.FC<EmployeeStoryItemProps> = ({ name, nickname, photoUrl, isActive, onClick }) => {
  const displayName = nickname || name.split(' ')[0];
  const theme = useTheme();

  return (
    <Stack
      spacing={0.25}
      alignItems="center"
      onClick={onClick}
      sx={{
        cursor: "pointer",
        minWidth: 56,
        transition: "all 0.2s ease",
        "&:active": { transform: "scale(0.92)" },
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: 48,
          height: 48,
          borderRadius: "50%",
          padding: "3px",
          background: isActive
            ? theme.palette.primary.main
            : "transparent",
          border: isActive ? "none" : `1.5px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Avatar
          src={photoUrl}
          sx={{
            width: "100%",
            height: "100%",
            border: isActive ? `2px solid ${theme.palette.background.paper}` : "none",
            bgcolor: "primary.main",
            fontSize: "1.25rem",
            fontWeight: 700,
          }}
        >
          {name.charAt(0)}
        </Avatar>
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontWeight: isActive ? 700 : 500,
          color: isActive ? "text.primary" : "text.secondary",
          fontSize: "0.7rem",
          textAlign: "center",
          maxWidth: 64,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {displayName}
      </Typography>
    </Stack>
  );
};

const ExpensesListPage: React.FC = () => {
  usePageTitle("Расходы");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { hasPermission, isNurse: isNurseFunc, employeeId, isAdmin: isAdminFunc, canManageExpenses } = usePermissions();
  const isAdmin = isAdminFunc();
  const hasManageExpenses = canManageExpenses();
  // const isNurse = isNurseFunc(); // No longer needed for logic, we use isAdmin vs others
  const canDelete = hasPermission("expenses.delete");

  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedYear, setSelectedYear] = React.useState<string | null>(() => new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = React.useState<string | null>(() => {
    const y = new Date().getFullYear();
    const m = String(new Date().getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = React.useState<Expense | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<string | null>(null);
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = React.useState<string | null>(null);
  const [expandedEmployee, setExpandedEmployee] = React.useState<string | null>(null);
  const [reloadTick, setReloadTick] = React.useState(0);

  // Кеширование состояния страницы
  const { restoreState } = useSimplePageCache('expenses-page', {
    expenses,
    searchQuery,
    selectedYear,
    selectedMonth,
    selectedDate,
    selectedExpense,
    selectedCategoryId,
    selectedEmployeeId
  });

  React.useEffect(() => {
    let cancelled = false;

    // Восстанавливаем состояние из кеша
    const cached = restoreState();
    if (cached) {
      setExpenses(cached.expenses);
      setSearchQuery(cached.searchQuery);
      setSelectedYear(cached.selectedYear);
      setSelectedMonth(cached.selectedMonth);
      setSelectedDate(cached.selectedDate);
      setSelectedExpense(cached.selectedExpense);
      setSelectedCategoryId(cached.selectedCategoryId);
      setSelectedEmployeeId(cached.selectedEmployeeId);
      return; // Пропускаем fetch
    }

    const fetchExpenses = async () => {
      try {
        // If Admin or Registrator -> fetch all (undefined). If not -> fetch associated with employeeId
        const targetEmployeeId = hasManageExpenses ? undefined : employeeId;
        const data = await ExpensesService.getAll(targetEmployeeId);
        if (!cancelled && data) {
          setExpenses(data);
        }
      } catch (e) {
        console.error("Failed to load expenses", e);
      } finally {
        // nothing
      }
    };
    fetchExpenses();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, hasManageExpenses, employeeId, reloadTick]);

  // Загрузка сотрудников
  const [employees, setEmployees] = React.useState<EmployeesRow[]>([]);

  // Загрузка категорий
  const [categoriesMap, setCategoriesMap] = React.useState<Map<string, string>>(new Map());

  React.useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      try {
        const { data } = await supabase.from(CATEGORIES_TABLE).select("id, name");
        if (!cancelled && data) {
          const m = new Map<string, string>();
          (data as CategoryRow[]).forEach((c) => {
            if (c.id && c.name) m.set(String(c.id), c.name);
          });
          setCategoriesMap(m);
        }
      } catch (e) {
        console.error("Failed to load categories", e);
      }
    };
    loadCategories();
    return () => { cancelled = true; };
  }, [reloadTick]);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const emps = await fetchEmployees();
        if (!cancelled) setEmployees(emps);
      } catch {
        // ignore
      }
    };
    load();
    return () => { cancelled = true; };
  }, [reloadTick]);

  // REALTIME: Подписка на изменения расходов и категорий
  React.useEffect(() => {
    const channel = supabase
      .channel("expenses-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Expenses" },
        () => {
          console.log("Realtime: Expenses changed, reloading...");
          setReloadTick(t => t + 1);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: CATEGORIES_TABLE },
        () => {
          console.log("Realtime: Expense categories changed, reloading...");
          setReloadTick(t => t + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const employeeNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) {
      m.set(e.id, e.full_name);
    }
    return m;
  }, [employees]);

  // Фильтрация расходов
  const filteredExpenses = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return expenses.filter((r: Expense) => {
      if (q) {
        const name = (r.name ?? "").toLowerCase();
        const comment = (r.comment ?? "").toLowerCase();
        const catName = (categoriesMap.get(String(r.category_id)) ?? r.category ?? "").toLowerCase();
        const empName = (employeeNameById.get(r.employee_id ?? "") ?? "").toLowerCase();
        return name.includes(q) || comment.includes(q) || catName.includes(q) || empName.includes(q);
      }
      return true;
    }).filter((r: Expense) => {
      if (selectedCategoryId && String(r.category_id) !== selectedCategoryId) return false;
      if (selectedEmployeeId && r.employee_id !== selectedEmployeeId) return false;
      return true;
    });
  }, [expenses, searchQuery, employeeNameById, categoriesMap, selectedCategoryId, selectedEmployeeId]);

  // Получаем список годов из всех расходов (без фильтров), чтобы дропдауны не сбрасывались
  const availableYears = React.useMemo(() => {
    const years = new Set<string>();
    // Добавим текущий год по умолчанию, чтобы он всегда был в списке
    years.add(new Date().getFullYear().toString());

    for (const exp of expenses) {
      if (!exp.created_at) continue;
      const year = new Date(exp.created_at).getFullYear().toString();
      years.add(year);
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [expenses]);

  type MonthOption = {
    value: string;
    monthIndex: number;
  };

  const availableMonths = React.useMemo<MonthOption[]>(() => {
    if (!selectedYear) return [];

    const monthMap = new Map<string, number>();

    // Добавим текущий месяц по умолчанию, если выбран текущий год
    const currentYear = new Date().getFullYear().toString();
    if (selectedYear === currentYear) {
      const currentMonthIndex = new Date().getMonth();
      const currentMonthKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, "0")}`;
      monthMap.set(currentMonthKey, currentMonthIndex);
    }

    for (const exp of expenses) {
      if (!exp.created_at) continue;
      const date = new Date(exp.created_at);
      const year = date.getFullYear().toString();
      if (year !== selectedYear) continue;

      const monthIndex = date.getMonth();
      const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, monthIndex);
      }
    }

    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, monthIndex]) => ({ value, monthIndex }));
  }, [expenses, selectedYear]);



  // Получаем расходы для выбранной даты и сотрудника
  const periodFilteredExpenses = React.useMemo(() => {
    let result = filteredExpenses;

    if (selectedYear || selectedMonth || selectedDate || selectedEmployeeFilter) {
      result = filteredExpenses.filter((exp) => {
        if (selectedEmployeeFilter) {
          const empName = employeeNameById.get(exp.employee_id ?? "") || "Неизвестно";
          if (empName !== selectedEmployeeFilter) return false;
        }

        if (!exp.created_at) return false;

        // Use affects_month for month/year filtering if available (avoids timezone issues)
        const effectiveYearMonth = exp.affects_month
          ? exp.affects_month // "YYYY-MM"
          : (() => {
              const d = new Date(exp.created_at);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            })();

        const [effYear, effMonth] = effectiveYearMonth.split("-");

        if (selectedYear && effYear !== selectedYear) return false;

        if (selectedMonth) {
          if (effectiveYearMonth !== selectedMonth) return false;

          if (selectedDate) {
            const date = new Date(exp.created_at);
            const day = String(date.getDate()).padStart(2, "0");
            const fullDate = `${effYear}-${effMonth}-${day}`;
            if (fullDate !== selectedDate) return false;
          }
        }

        return true;
      });
    }

    // Сортируем по дате (новые сверху)
    return [...result].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [filteredExpenses, selectedYear, selectedMonth, selectedDate, selectedEmployeeFilter, employeeNameById]);

  // Группировка по сотруднику -> дням (для отображения списка подразделов в левой панели)
  const groupedByEmployee = React.useMemo(() => {
    // Группируем по году и месяцу (не учитываем selectedDate для списка дней)
    const expensesForDayList = filteredExpenses.filter((exp) => {
      if (!exp.created_at) return false;

      const effectiveYearMonth = exp.affects_month
        ? exp.affects_month
        : (() => {
            const d = new Date(exp.created_at);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          })();

      const effYear = effectiveYearMonth.split("-")[0];

      if (selectedYear && effYear !== selectedYear) return false;
      if (selectedMonth && effectiveYearMonth !== selectedMonth) return false;

      return true;
    });

    const empMap = new Map<string, { employeeName: string, total: number, count: number, days: Map<string, { count: number, total: number }> }>();

    for (const exp of expensesForDayList) {
      if (!exp.created_at) continue;
      const date = new Date(exp.created_at);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dayKey = `${year}-${month}-${day}`;

      const empName = employeeNameById.get(exp.employee_id ?? "") || "Неизвестно";

      if (!empMap.has(empName)) {
        empMap.set(empName, { employeeName: empName, total: 0, count: 0, days: new Map() });
      }

      const empData = empMap.get(empName)!;
      empData.count++;
      empData.total += exp.total_amount ?? 0;

      if (!empData.days.has(dayKey)) {
        empData.days.set(dayKey, { count: 0, total: 0 });
      }

      const dayInfo = empData.days.get(dayKey)!;
      dayInfo.count++;
      dayInfo.total += exp.total_amount ?? 0;
    }

    return Array.from(empMap.values()).map(emp => ({
      employeeName: emp.employeeName,
      count: emp.count,
      total: emp.total,
      days: Array.from(emp.days.entries())
        .sort((a, b) => b[0].localeCompare(a[0])) // Descending dates
        .map(([date, info]) => ({ date, count: info.count, total: info.total }))
    })).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [filteredExpenses, selectedYear, selectedMonth, employeeNameById]);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const categoriesScrollRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const scrollLeft = React.useRef(0);

  const handleMouseDown = (containerRef: React.RefObject<HTMLDivElement>) => (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeft.current = containerRef.current.scrollLeft;
    containerRef.current.style.cursor = 'grabbing';
    containerRef.current.style.userSelect = 'none';
  };

  const handleMouseLeave = (containerRef: React.RefObject<HTMLDivElement>) => () => {
    if (!containerRef.current) return;
    isDragging.current = false;
    containerRef.current.style.cursor = 'grab';
  };

  const handleMouseUp = (containerRef: React.RefObject<HTMLDivElement>) => () => {
    if (!containerRef.current) return;
    isDragging.current = false;
    containerRef.current.style.cursor = 'grab';
  };

  const handleMouseMove = (containerRef: React.RefObject<HTMLDivElement>) => (e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX.current) * 2;
    containerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const handleWheel = (containerRef: React.RefObject<HTMLDivElement>) => (e: React.WheelEvent) => {
    if (!containerRef.current) return;
    if (e.deltaY !== 0) {
      containerRef.current.scrollLeft += e.deltaY;
    }
  };

  // Модалки
  const [addOpen, setAddOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const handleEdit = (exp: Expense) => {
    setSelectedExpense(exp);
    setEditOpen(true);
  };

  const handleDelete = (exp: Expense) => {
    setSelectedExpense(exp);
    setDeleteOpen(true);
  };

  // Детальная панель
  const [employeeFullName, setEmployeeFullName] = React.useState<string | null>(null);

  const handleExpenseClick = async (exp: Expense) => {
    setSelectedExpense(exp);
    setEmployeeFullName(null);
    if (exp.employee_id) {
      try {
        const { data } = await supabase
          .from(EMPLOYEES_SOURCE)
          .select("*")
          .eq("id", exp.employee_id)
          .maybeSingle();
        const nm = data && typeof data === "object" ? getNameFrom(data as Record<string, unknown>) : null;
        if (nm) setEmployeeFullName(nm);
      } catch {
        // ignore
      }
    }
  };

  // Компонент детальной карточки
  const ExpenseDetailCard = ({ expense }: { expense: Expense | null }) => {
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

    const empName = employeeFullName || employeeNameById.get(expense.employee_id ?? "") || "-";

    return (
      <Paper
        elevation={0}
        variant="outlined"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Кнопки управления - в самом верху как в AppointmentDetailsCard */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            {hasManageExpenses && (
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<EditOutlined />}
                  onClick={() => handleEdit(expense)}
                >
                  Изменить
                </Button>
              </Stack>
            )}

            {isAdmin && (
              <Tooltip title="Удалить">
                <span>
                  <IconButton
                    size="small"
                    disabled={!canDelete}
                    onClick={() => handleDelete(expense)}
                    sx={{
                      border: '1px solid',
                      borderColor: 'error.main',
                      color: 'error.main',
                      '&:hover': {
                        borderColor: 'error.dark',
                        backgroundColor: 'rgba(211, 47, 47, 0.08)',
                      },
                      '&.Mui-disabled': {
                        borderColor: 'action.disabled',
                        color: 'action.disabled',
                      },
                    }}
                  >
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Stack>
        </Box>

        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            p: 2.5,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
          }}
        >
          <Stack spacing={2.5}>
            {/* Название расхода */}
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                {expense.name}
              </Typography>
            </Box>

            {/* Детали (Дата, Категория, Сотрудник) */}
            <Stack spacing={1.5} sx={{ bgcolor: "background.paper", borderRadius: 2 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary">Дата и время</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {expense.created_at
                    ? `${formatDateRu(expense.created_at)}, ${new Date(expense.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                    : "—"}
                </Typography>
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary">Категория</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {categoriesMap.get(String(expense.category_id)) || expense.category || "—"}
                </Typography>
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary">Сотрудник</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>
                  {empName}
                </Typography>
              </Box>
            </Stack>

            {/* Payment Information */}
            <PaymentInfoBlock
              payment={{
                baseTotal: expense.total_amount ?? 0,
                cash: expense.cash_amount ?? 0,
                card: expense.cashless_amount ?? 0,
                finalTotal: expense.total_amount ?? 0,
                debt: 0,
              }}
              variant="detailed"
              showIcons={true}
            />
            {expense.photo && (
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                  bgcolor: (theme) => theme.palette.action.hover,
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <img
                  src={expense.photo}
                  alt={expense.name}
                  style={{
                    maxWidth: "100%",
                    maxHeight: 400,
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              </Box>
            )}

            {/* Комментарий */}
            {expense.comment && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                    Комментарий
                  </Typography>
                  <Typography variant="body2">{expense.comment}</Typography>
                </Box>
              </>
            )}
          </Stack>
        </Box>
      </Paper>
    );
  };

  return (
    <Box
      sx={{
        height: { xs: "calc(100vh - 56px)", md: "auto" },
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* ШАПКА */}
      <PageHeader
        title="Расходы"
        showTitle={false}
        addButtonText={hasManageExpenses ? "Добавить расход" : undefined}
        onAdd={hasManageExpenses ? () => setAddOpen(true) : undefined}
        showSearch
        searchVal={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Поиск..."
      />

      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          overflowX: "hidden",
          pb: theme.appLayout.page.paddingY,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        <Box
          sx={(theme) => ({
            px: theme.appLayout.page.paddingX,
            mb: 2,
          })}
        >
          <Stack spacing={2}>
            {/* Чипы категорий */}
            <Box
              ref={categoriesScrollRef}
              onMouseDown={handleMouseDown(categoriesScrollRef)}
              onMouseLeave={handleMouseLeave(categoriesScrollRef)}
              onMouseUp={handleMouseUp(categoriesScrollRef)}
              onMouseMove={handleMouseMove(categoriesScrollRef)}
              onWheel={handleWheel(categoriesScrollRef)}
              sx={{
                display: "flex",
                overflowX: "auto",
                scrollbarWidth: "none",
                "&::-webkit-scrollbar": { display: "none" },
                gap: 1.5,
                pb: 1,
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              <Chip
                label="Все категории"
                onClick={() => setSelectedCategoryId(null)}
                variant={selectedCategoryId === null ? "filled" : "outlined"}
                color={selectedCategoryId === null ? "primary" : "default"}
                sx={{ fontWeight: 500 }}
              />
              {Array.from(categoriesMap.entries()).map(([id, name]) => (
                <Chip
                  key={id}
                  label={name}
                  onClick={() => setSelectedCategoryId(id === selectedCategoryId ? null : id)}
                  variant={selectedCategoryId === id ? "filled" : "outlined"}
                  color={selectedCategoryId === id ? "primary" : "default"}
                  sx={{ fontWeight: 500 }}
                />
              ))}
            </Box>
          </Stack>
        </Box>

        <Box
          sx={(theme) => ({
            px: theme.appLayout.page.paddingX,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          })}
        >
          {/* ГРИД С КОЛОНКАМИ (3 колонки вместо 2) */}
          <Grid2 container spacing={2} sx={{ flex: 1, minHeight: 0 }}>

            {/* ЛЕВАЯ КОЛОННА (Фильтр периода) */}
            <Grid2
              size={{ xs: 12, md: 3 }}
              sx={(theme: Theme) => ({
                position: { md: "sticky" },
                top: { md: theme.spacing(2) },
                alignSelf: "flex-start",
                height: {
                  xs: "auto",
                  md: `calc(100dvh - 176px)`,
                },
                display: "flex",
                flexDirection: "column",
                overflow: { xs: "visible", md: "hidden" },
              })}
            >
              <Paper
                elevation={0}
                variant="outlined"
                sx={{
                  height: { xs: "auto", md: "100%" },
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Период
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => {
                      setSelectedYear(null);
                      setSelectedMonth(null);
                      setSelectedDate(null);
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    Все расходы
                  </Button>
                </Box>

                <Box sx={{ overflowY: "auto", flex: 1, p: 2 }}>
                  <Stack spacing={2}>
                    {/* Фильтр по сотрудникам (для администраторов) */}
                    {(isAdmin || hasManageExpenses) && employees.length > 0 && (
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                          Сотрудник
                        </Typography>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={selectedEmployeeId ?? ""}
                          onChange={(event) => {
                            const empValue = event.target.value;
                            setSelectedEmployeeId(typeof empValue === "string" && empValue.length > 0 ? empValue : null);
                          }}
                          SelectProps={{ displayEmpty: true }}
                        >
                          <MenuItem value="">
                            <Typography variant="body2" color="text.secondary">
                              Все сотрудники
                            </Typography>
                          </MenuItem>
                          {employees.sort((a, b) => a.full_name.localeCompare(b.full_name)).map((emp) => (
                            <MenuItem key={emp.id} value={emp.id}>
                              {emp.full_name}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Stack>
                    )}

                    <Divider sx={{ my: 1 }} />

                    {/* Dropdown выбора года */}
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Год
                      </Typography>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={selectedYear ?? ""}
                        onChange={(event) => {
                          const yearValue = event.target.value;
                          const nextYear = typeof yearValue === "string" && yearValue.length > 0 ? yearValue : null;
                          setSelectedYear(nextYear);
                          setSelectedMonth(null);
                          setSelectedDate(null);
                        }}
                        SelectProps={{ displayEmpty: true }}
                      >
                        <MenuItem value="">
                          <Typography variant="body2" color="text.secondary">
                            Все годы
                          </Typography>
                        </MenuItem>
                        {availableYears.map((year) => (
                          <MenuItem key={year} value={year}>
                            {year}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Stack>

                    {/* Dropdown выбора месяца (показываем только если выбран год) */}
                    {selectedYear && (
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                          Месяц
                        </Typography>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={selectedMonth ?? ""}
                          onChange={(event) => {
                            const monthValue = event.target.value;
                            const nextMonth = typeof monthValue === "string" && monthValue.length > 0 ? monthValue : null;
                            setSelectedMonth(nextMonth);
                            setSelectedDate(null);
                          }}
                          SelectProps={{ displayEmpty: true }}
                          disabled={availableMonths.length === 0}
                        >
                          <MenuItem value="">
                            <Typography variant="body2" color="text.secondary">
                              Все месяцы
                            </Typography>
                          </MenuItem>
                          {availableMonths.map((month) => (
                            <MenuItem key={month.value} value={month.value}>
                              {MONTH_NAMES[month.monthIndex]}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Stack>
                    )}

                    {selectedMonth && (
                      <Box sx={{ p: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 2, border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}` }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                          Итого за месяц
                        </Typography>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <AccountBalanceWalletOutlined sx={{ color: 'primary.main', fontSize: 20 }} />
                          <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'primary.main' }}>
                            {formatKGS(groupedByEmployee.reduce((sum, emp) => sum + emp.total, 0))}
                          </Typography>
                        </Stack>
                      </Box>
                    )}

                    {/* Список сотрудников и дней */}
                    {selectedMonth && (
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                          Сотрудники
                        </Typography>
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
                                  <Typography variant="body2" sx={{ flex: 1, fontWeight: isSelected ? 600 : 400 }}>
                                    {emp.employeeName}
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>
                                    {formatKGS(emp.total)}
                                  </Typography>
                                  {isExpanded ? <ExpandLess fontSize="small" color="action" /> : <ExpandMore fontSize="small" color="action" />}
                                </ListItemButton>

                                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                  <List dense disablePadding>
                                    {emp.days.map((day) => (
                                      <ListItemButton
                                        key={day.date}
                                        sx={{
                                          borderRadius: 1,
                                          mb: 0.5,
                                          pl: 3,
                                          bgcolor: selectedDate === day.date ? "action.selected" : "transparent",
                                        }}
                                        onClick={() => {
                                          setSelectedEmployeeFilter(emp.employeeName);
                                          setSelectedDate(day.date);
                                        }}
                                      >
                                        <Typography variant="body2" sx={{ flex: 1, color: "text.secondary" }}>
                                          {formatDateRu(day.date)}
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                          {formatKGS(day.total)}
                                        </Typography>
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

            {/* СРЕДНЯЯ КОЛОННА (Список расходов) */}
            <Grid2
              size={{ xs: 12, md: 4 }}
              sx={(theme: Theme) => ({
                position: { md: "sticky" },
                top: { md: theme.spacing(2) },
                alignSelf: "flex-start",
                height: {
                  xs: "auto",
                  md: `calc(100dvh - 176px)`,
                },
                display: "flex",
                flexDirection: "column",
                overflow: { xs: "visible", md: "hidden" },
              })}
            >
              <Paper
                elevation={0}
                variant="outlined"
                sx={{
                  height: { xs: "auto", md: "100%" },
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Список расходов ({periodFilteredExpenses.length})
                  </Typography>
                </Box>
                <Box sx={{ overflowY: "auto", flex: 1 }}>
                  {periodFilteredExpenses.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: "center" }}>
                      <Typography variant="body2" color="text.secondary">
                        Нет расходов
                      </Typography>
                    </Box>
                  ) : (
                    <List sx={{ py: 0 }}>
                      {(() => {
                        let currentDayStr = "";

                        return periodFilteredExpenses.map((exp) => {
                          const hasCash = (exp.cash_amount ?? 0) > 0;
                          const hasCashless = (exp.cashless_amount ?? 0) > 0;
                          const dayStr = exp.created_at ? formatDateRu(exp.created_at) : "Без даты";

                          const isNewDay = dayStr !== currentDayStr;
                          if (isNewDay) currentDayStr = dayStr;

                          return (
                            <React.Fragment key={exp.id}>
                              {isNewDay && (
                                <Box
                                  sx={{
                                    px: 2,
                                    py: 1,
                                    bgcolor: "background.default",
                                    borderBottom: 1,
                                    borderColor: "divider",
                                    position: "sticky",
                                    top: 0,
                                    zIndex: 1,
                                  }}
                                >
                                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "text.primary" }}>
                                    {dayStr}
                                  </Typography>
                                </Box>
                              )}
                              <ListItemButton
                                sx={{
                                  px: 2,
                                  py: 1.5,
                                  bgcolor: selectedExpense?.id === exp.id ? "action.selected" : "transparent",
                                  "&:hover": { bgcolor: "action.hover" },
                                  borderBottom: 1,
                                  borderColor: "divider",
                                }}
                                onClick={() => handleExpenseClick(exp)}
                              >
                                <Avatar
                                  variant="rounded"
                                  src={exp.photo || undefined}
                                  sx={{ mr: 2, width: 40, height: 40, bgcolor: "action.selected", color: "text.secondary" }}
                                >
                                  <ReceiptLongOutlined />
                                </Avatar>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography variant="body1" sx={{ fontWeight: 500 }} noWrap>
                                    {exp.name}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary" noWrap>
                                    {categoriesMap.get(String(exp.category_id)) || exp.category}
                                  </Typography>
                                </Box>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                  {/* Иконки оплаты */}
                                  {hasCash && (
                                    <Tooltip title="Наличные">
                                      <AccountBalanceWalletOutlined sx={{ fontSize: 16, color: 'success.main' }} />
                                    </Tooltip>
                                  )}
                                  {hasCashless && (
                                    <Tooltip title="Безнал">
                                      <CreditCardOutlined sx={{ fontSize: 16, color: 'info.main' }} />
                                    </Tooltip>
                                  )}
                                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                    {formatKGS(exp.total_amount ?? 0)}
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

            {/* ПРАВАЯ КОЛОННА (Карточка деталей) - Скрыта на мобильных */}
            {!isMobile && (
              <Grid2
                size={{ xs: 12, md: 5 }}
                sx={(theme: Theme) => ({
                  position: { md: "sticky" },
                  top: { md: theme.spacing(2) },
                  alignSelf: "flex-start",
                  height: {
                    md: `calc(100dvh - 176px)`,
                  },
                  display: "flex",
                  flexDirection: "column",
                  overflow: { xs: "visible", md: "hidden" },
                })}
              >
                <Box
                  sx={{
                    height: "100%",
                    overflowY: "auto",
                    pr: 0.5,
                    '&::-webkit-scrollbar': { width: 8 },
                    '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
                    '&::-webkit-scrollbar-thumb': {
                      bgcolor: 'divider',
                      borderRadius: 1,
                      '&:hover': { bgcolor: 'action.disabled' }
                    },
                  }}
                >
                  <ExpenseDetailCard expense={selectedExpense} />
                </Box>
              </Grid2>
            )}
          </Grid2>
        </Box>

        {/* BOTTOM SHEET (Мобильная карточка) */}
        {isMobile && (
          <AppBottomSheet
            open={Boolean(selectedExpense)}
            onClose={() => setSelectedExpense(null)}
          >
            <Box sx={{ p: 2 }}>
              <ExpenseDetailCard expense={selectedExpense} />
            </Box>
          </AppBottomSheet>
        )}

        {/* ДИАЛОГИ ДЕЙСТВИЙ */}
        <AddExpenseDrawer
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onCreated={(rec) => {
            setExpenses((prev) => [rec, ...prev].sort((a, b) => b.created_at.localeCompare(a.created_at)));
          }}
        />

        {selectedExpense && (
          <EditExpenseDrawer
            open={editOpen}
            onClose={() => setEditOpen(false)}
            record={selectedExpense}
            onUpdated={(rec) => {
              setSelectedExpense(rec);
              setExpenses((prev) => prev.map((e) => (e.id === rec.id ? rec : e)));
            }}
          />
        )}

        <DeleteExpenseDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          record={selectedExpense}
          onDeleted={(id) => {
            setSelectedExpense(null);
            setExpenses((prev) => prev.filter((e) => e.id !== id));
          }}
        />
      </Box>
    </Box>
  );
};

export default ExpensesListPage;
