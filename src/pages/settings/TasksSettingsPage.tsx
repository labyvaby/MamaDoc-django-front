import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import AutoModeOutlined from "@mui/icons-material/AutoModeOutlined";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../../hooks/usePageTitle";
import { SettingsLayout } from "./SettingsLayout";
import { ConfirmDialog } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import {
  approveAutomationSuggestion,
  createRecurringRule,
  createStockRule,
  createTaskCategory,
  deleteRecurringRule,
  deleteStockRule,
  dismissAutomationSuggestion,
  getAllTaskCategories,
  getAutomationSuggestions,
  getRecurringRules,
  getStockRules,
  updateRecurringRule,
  updateStockRule,
  updateTaskCategory,
  type AutomationSuggestion,
  type RecurringInterval,
  type RecurringTaskRule,
  type StockTaskRule,
  type TaskCategory,
  type TaskPriority,
} from "../../api/tasks";
import { getProducts, getWarehouses, type DjangoProduct } from "../../api/warehouse";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { TASK_PRIORITY_META, TASK_PRIORITY_OPTIONS } from "../tasks/meta";

// ── Справочники ────────────────────────────────────────────────────────────────

/** Роли-исполнители для привязки категорий (без superadmin). */
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "admin", label: "Админ" },
  { value: "manager", label: "Управляющий" },
  { value: "owner", label: "Владелец" },
  { value: "doctor", label: "Врач" },
  { value: "nurse", label: "Медсестра" },
  { value: "receptionist", label: "Ресепшен" },
  { value: "registrator", label: "Регистратор" },
  { value: "accountant", label: "Бухгалтер" },
];

const roleLabel = (v: string) => ROLE_OPTIONS.find((r) => r.value === v)?.label ?? v;

const INTERVAL_OPTIONS: { value: RecurringInterval; label: string }[] = [
  { value: "daily", label: "Каждый день" },
  { value: "weekly", label: "Раз в неделю" },
  { value: "monthly", label: "Раз в месяц" },
];

const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

function intervalLabel(rule: RecurringTaskRule): string {
  if (rule.interval === "daily") return "Каждый день";
  if (rule.interval === "weekly") return `Еженедельно, ${WEEKDAYS[(rule.dayOfWeek ?? 1) - 1].toLowerCase()}`;
  return `Ежемесячно, ${rule.dayOfMonth ?? 1}-го числа`;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// ── Диалог категории (создание/редактирование) ────────────────────────────────

type CategoryDialogProps = {
  open: boolean;
  onClose: () => void;
  category: TaskCategory | null; // null — создание
  onSaved: () => void;
};

const CategoryDialog: React.FC<CategoryDialogProps> = ({ open, onClose, category, onSaved }) => {
  const [name, setName] = React.useState("");
  const [roles, setRoles] = React.useState<string[]>([]);
  const [priority, setPriority] = React.useState<TaskPriority>("normal");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setRoles(category?.assignedRoles ?? []);
      setPriority(category?.defaultPriority ?? "normal");
      setBusy(false);
      setError(null);
    }
  }, [open, category]);

  const valid = name.trim().length >= 2 && roles.length > 0;

  const handleSubmit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (category) {
        await updateTaskCategory(category.id, {
          name: name.trim(),
          assignedRoles: roles,
          defaultPriority: priority,
        });
      } else {
        await createTaskCategory({
          name: name.trim(),
          assignedRoles: roles,
          defaultPriority: priority,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e, "Не удалось сохранить категорию"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{category ? "Изменить категорию" : "Добавить категорию"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Название *"
            size="small"
            fullWidth
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            select
            label="Группы-исполнители *"
            size="small"
            fullWidth
            disabled={busy}
            value={roles}
            onChange={(e) => {
              const v = e.target.value;
              setRoles(typeof v === "string" ? v.split(",") : v);
            }}
            SelectProps={{
              multiple: true,
              renderValue: (selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {(selected as string[]).map((v) => (
                    <Chip key={v} label={roleLabel(v)} size="small" sx={{ height: 20, borderRadius: "6px" }} />
                  ))}
                </Box>
              ),
            }}
            helperText="Заявки категории увидят сотрудники с этими ролями"
          >
            {ROLE_OPTIONS.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Приоритет по умолчанию"
            size="small"
            fullWidth
            disabled={busy}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {TASK_PRIORITY_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy || !valid}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? "Сохранение…" : category ? "Сохранить" : "Добавить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Диалог правила повторения ──────────────────────────────────────────────────

type RuleDialogProps = {
  open: boolean;
  onClose: () => void;
  categories: TaskCategory[];
  onSaved: () => void;
};

const RuleDialog: React.FC<RuleDialogProps> = ({ open, onClose, categories, onSaved }) => {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<number | "">("");
  const [priority, setPriority] = React.useState<TaskPriority | "">("");
  const [interval, setInterval] = React.useState<RecurringInterval>("weekly");
  const [dayOfWeek, setDayOfWeek] = React.useState(1);
  const [dayOfMonth, setDayOfMonth] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setCategoryId("");
      setPriority("");
      setInterval("weekly");
      setDayOfWeek(1);
      setDayOfMonth(1);
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const valid = title.trim().length >= 2 && categoryId !== "";

  const handleSubmit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await createRecurringRule({
        title: title.trim(),
        description: description.trim() || undefined,
        categoryId: categoryId as number,
        priority: priority === "" ? undefined : priority,
        interval,
        dayOfWeek: interval === "weekly" ? dayOfWeek : undefined,
        dayOfMonth: interval === "monthly" ? dayOfMonth : undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e, "Не удалось создать правило"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Новое правило повторения</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Название задачи *"
            size="small"
            fullWidth
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            label="Описание"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
          <TextField
            select
            label="Категория *"
            size="small"
            fullWidth
            disabled={busy}
            value={categoryId === "" ? "" : String(categoryId)}
            onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            {categories
              .filter((c) => c.isActive)
              .map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            select
            label="Приоритет"
            size="small"
            fullWidth
            disabled={busy}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority | "")}
            helperText="Пусто — приоритет категории по умолчанию"
          >
            <MenuItem value="">По умолчанию</MenuItem>
            {TASK_PRIORITY_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Повторение *"
            size="small"
            fullWidth
            disabled={busy}
            value={interval}
            onChange={(e) => setInterval(e.target.value as RecurringInterval)}
          >
            {INTERVAL_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          {interval === "weekly" && (
            <TextField
              select
              label="День недели"
              size="small"
              fullWidth
              disabled={busy}
              value={String(dayOfWeek)}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
            >
              {WEEKDAYS.map((d, i) => (
                <MenuItem key={d} value={String(i + 1)}>
                  {d}
                </MenuItem>
              ))}
            </TextField>
          )}
          {interval === "monthly" && (
            <TextField
              select
              label="День месяца"
              size="small"
              fullWidth
              disabled={busy}
              value={String(dayOfMonth)}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
              helperText="1–28, чтобы не пропускать февраль"
            >
              {Array.from({ length: 28 }, (_, i) => (
                <MenuItem key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </MenuItem>
              ))}
            </TextField>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy || !valid}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? "Сохранение…" : "Создать"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Диалог порога остатков ─────────────────────────────────────────────────────

/** Порог: до 2 знаков после точки, форма бэка — строка-decimal ("5.00"). */
const normalizeThreshold = (raw: string): string | null => {
  const v = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
};

type StockRuleDialogProps = {
  open: boolean;
  onClose: () => void;
  categories: TaskCategory[];
  rule: StockTaskRule | null; // null — создание; иначе правка порога/категории
  onSaved: () => void;
};

const StockRuleDialog: React.FC<StockRuleDialogProps> = ({ open, onClose, categories, rule, onSaved }) => {
  const [product, setProduct] = React.useState<DjangoProduct | null>(null);
  const [warehouseId, setWarehouseId] = React.useState<number | "">("");
  const [categoryId, setCategoryId] = React.useState<number | "">("");
  const [threshold, setThreshold] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Товары/склады — из warehouse-модуля; нужен warehouse.view (у tasks.manage
  // обычно есть). Грузим только при открытом диалоге создания.
  const productsQuery = useQuery({
    queryKey: ["django", "warehouse", "products", "stock-rule-picker"],
    queryFn: ({ signal }) => getProducts(signal),
    enabled: open && rule == null,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const warehousesQuery = useQuery({
    queryKey: ["django", "warehouse", "list", "stock-rule-picker"],
    queryFn: ({ signal }) => getWarehouses(signal),
    enabled: open && rule == null,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  React.useEffect(() => {
    if (open) {
      setProduct(null);
      setWarehouseId(rule?.warehouseId ?? "");
      setCategoryId(rule?.categoryId ?? "");
      setThreshold(rule ? String(parseFloat(rule.minThreshold)) : "");
      setBusy(false);
      setError(null);
    }
  }, [open, rule]);

  const normalized = normalizeThreshold(threshold);
  const valid =
    normalized != null && categoryId !== "" && (rule != null || (product != null && warehouseId !== ""));

  const handleSubmit = async () => {
    if (!valid || normalized == null) return;
    setBusy(true);
    setError(null);
    try {
      if (rule) {
        await updateStockRule(rule.id, {
          minThreshold: normalized,
          categoryId: categoryId as number,
        });
      } else {
        await createStockRule({
          productId: product!.id,
          warehouseId: warehouseId as number,
          categoryId: categoryId as number,
          minThreshold: normalized,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e, "Не удалось сохранить порог"));
    } finally {
      setBusy(false);
    }
  };

  const pickersError = productsQuery.isError || warehousesQuery.isError;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{rule ? "Изменить порог" : "Новый порог остатка"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {rule ? (
            <TextField
              label="Товар · склад"
              size="small"
              fullWidth
              disabled
              value={`${rule.productName} · ${rule.warehouseName}`}
            />
          ) : (
            <>
              <Autocomplete
                options={productsQuery.data ?? []}
                value={product}
                onChange={(_, v) => setProduct(v)}
                getOptionLabel={(p) => p.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                loading={productsQuery.isLoading}
                disabled={busy}
                noOptionsText="Товары не найдены"
                renderInput={(params) => (
                  <TextField {...params} label="Товар *" size="small" autoFocus />
                )}
              />
              <TextField
                select
                label="Склад *"
                size="small"
                fullWidth
                disabled={busy || warehousesQuery.isLoading}
                value={warehouseId === "" ? "" : String(warehouseId)}
                onChange={(e) => setWarehouseId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                {(warehousesQuery.data ?? []).map((w) => (
                  <MenuItem key={w.id} value={String(w.id)}>
                    {w.name}
                  </MenuItem>
                ))}
              </TextField>
            </>
          )}
          <TextField
            label="Минимальный остаток *"
            size="small"
            fullWidth
            disabled={busy}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            inputProps={{ inputMode: "decimal" }}
            error={threshold.trim() !== "" && normalized == null}
            helperText={
              threshold.trim() !== "" && normalized == null
                ? "Число больше нуля, до 2 знаков после точки"
                : product?.unit
                ? `Единица: ${product.unit}. Остаток ниже порога — автозадача на пополнение`
                : "Остаток ниже порога — автозадача на пополнение"
            }
          />
          <TextField
            select
            label="Категория заявки *"
            size="small"
            fullWidth
            disabled={busy}
            value={categoryId === "" ? "" : String(categoryId)}
            onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
            helperText="Группа этой категории получит автозадачу"
          >
            {categories
              .filter((c) => c.isActive)
              .map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
          </TextField>
          {pickersError && rule == null && (
            <Alert severity="error">
              Не удалось загрузить товары или склады — нужен доступ к модулю «Склады»
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy || !valid}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? "Сохранение…" : rule ? "Сохранить" : "Добавить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Главный компонент ──────────────────────────────────────────────────────────

const TasksSettingsPage: React.FC = () => {
  usePageTitle("Настройки задач");
  const queryClient = useQueryClient();

  const [categoryDialog, setCategoryDialog] = React.useState<{ open: boolean; category: TaskCategory | null }>({
    open: false,
    category: null,
  });
  const [ruleDialogOpen, setRuleDialogOpen] = React.useState(false);
  const [ruleToDelete, setRuleToDelete] = React.useState<RecurringTaskRule | null>(null);
  const [stockDialog, setStockDialog] = React.useState<{ open: boolean; rule: StockTaskRule | null }>({
    open: false,
    rule: null,
  });
  const [stockRuleToDelete, setStockRuleToDelete] = React.useState<StockTaskRule | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: [...djangoQueryKeys.tasks.categories, "all"],
    queryFn: ({ signal }) => getAllTaskCategories(signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const rulesQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.recurringRules,
    queryFn: ({ signal }) => getRecurringRules(signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const stockRulesQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.stockRules,
    queryFn: ({ signal }) => getStockRules(signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const suggestionsQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.suggestions,
    queryFn: ({ signal }) => getAutomationSuggestions(signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.tasks.all });
  };

  const toggleCategory = useMutation({
    mutationFn: (c: TaskCategory) => updateTaskCategory(c.id, { isActive: !c.isActive }),
    onSuccess: invalidateAll,
    onError: (e) => setError(errMsg(e, "Не удалось обновить категорию")),
  });

  const toggleRule = useMutation({
    mutationFn: (r: RecurringTaskRule) => updateRecurringRule(r.id, { isActive: !r.isActive }),
    onSuccess: invalidateAll,
    onError: (e) => setError(errMsg(e, "Не удалось обновить правило")),
  });

  const removeRule = useMutation({
    mutationFn: (ruleId: number) => deleteRecurringRule(ruleId),
    onSuccess: () => {
      setRuleToDelete(null);
      invalidateAll();
    },
    onError: (e) => setError(errMsg(e, "Не удалось удалить правило")),
  });

  const toggleStockRule = useMutation({
    mutationFn: (r: StockTaskRule) => updateStockRule(r.id, { isActive: !r.isActive }),
    onSuccess: invalidateAll,
    onError: (e) => setError(errMsg(e, "Не удалось обновить порог")),
  });

  const removeStockRule = useMutation({
    mutationFn: (ruleId: number) => deleteStockRule(ruleId),
    onSuccess: () => {
      setStockRuleToDelete(null);
      invalidateAll();
    },
    onError: (e) => setError(errMsg(e, "Не удалось удалить порог")),
  });

  const approveSuggestion = useMutation({
    mutationFn: (s: AutomationSuggestion) => approveAutomationSuggestion(s.id),
    onSuccess: invalidateAll,
    onError: (e) => setError(errMsg(e, "Не удалось принять предложение")),
  });

  const dismissSuggestion = useMutation({
    mutationFn: (s: AutomationSuggestion) => dismissAutomationSuggestion(s.id),
    onSuccess: invalidateAll,
    onError: (e) => setError(errMsg(e, "Не удалось отклонить предложение")),
  });

  const categories = categoriesQuery.data ?? [];
  const rules = rulesQuery.data ?? [];
  const stockRules = stockRulesQuery.data ?? [];
  const suggestions = suggestionsQuery.data ?? [];

  const categoryName = (id: number) => categories.find((c) => c.id === id)?.name ?? `#${id}`;
  const thresholdLabel = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n.toLocaleString("ru-RU") : v;
  };

  return (
    <SettingsLayout>
      <Stack spacing={4}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* ══ Категории ══ */}
        <Stack spacing={2}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap">
            <Box>
              <Typography variant="h6" fontWeight={600}>
                Категории заявок
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Категория определяет, какие группы персонала видят заявку.
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddOutlined />}
              onClick={() => setCategoryDialog({ open: true, category: null })}
            >
              Добавить категорию
            </Button>
          </Stack>

          {categoriesQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={24} />
            </Stack>
          ) : categories.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
              Категорий пока нет
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Название</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Группы</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Приоритет</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">
                      Активна
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {categories.map((c) => (
                    <TableRow key={c.id} hover>
                      <TableCell sx={{ opacity: c.isActive ? 1 : 0.5 }}>{c.name}</TableCell>
                      <TableCell>
                        <Stack direction="row" gap={0.5} flexWrap="wrap">
                          {c.assignedRoles.map((r) => (
                            <Chip key={r} label={roleLabel(r)} size="small" sx={{ height: 20, borderRadius: "6px" }} />
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{TASK_PRIORITY_META[c.defaultPriority].label}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          size="small"
                          checked={c.isActive}
                          onChange={() => toggleCategory.mutate(c)}
                          disabled={toggleCategory.isPending}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Изменить">
                          <IconButton size="small" onClick={() => setCategoryDialog({ open: true, category: c })}>
                            <EditOutlined sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>

        <Divider />

        {/* ══ Правила повторения ══ */}
        <Stack spacing={2}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap">
            <Box>
              <Typography variant="h6" fontWeight={600}>
                Повторяющиеся задачи
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Система создаёт задачи по расписанию и раздаёт группе категории.
              </Typography>
            </Box>
            <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setRuleDialogOpen(true)}>
              Новое правило
            </Button>
          </Stack>

          {rulesQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={24} />
            </Stack>
          ) : rules.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
              Правил пока нет
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Задача</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Категория</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Расписание</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Следующий запуск</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">
                      Активно
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ opacity: r.isActive ? 1 : 0.5 }}>{r.title}</TableCell>
                      <TableCell>{r.categoryName}</TableCell>
                      <TableCell>{intervalLabel(r)}</TableCell>
                      <TableCell>{dayjs(r.nextRun).format("DD.MM.YYYY")}</TableCell>
                      <TableCell align="center">
                        <Switch
                          size="small"
                          checked={r.isActive}
                          onChange={() => toggleRule.mutate(r)}
                          disabled={toggleRule.isPending}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Удалить">
                          <IconButton size="small" onClick={() => setRuleToDelete(r)}>
                            <DeleteOutlined sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>

        <Divider />

        {/* ══ Пороги товаров ══ */}
        <Stack spacing={2}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap">
            <Box>
              <Typography variant="h6" fontWeight={600}>
                Пороги товаров
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Остаток на складе упал ниже порога — система сама создаёт заявку на пополнение.
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddOutlined />}
              onClick={() => setStockDialog({ open: true, rule: null })}
            >
              Новый порог
            </Button>
          </Stack>

          {stockRulesQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={24} />
            </Stack>
          ) : stockRules.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
              Порогов пока нет
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Товар</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Склад</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">
                      Порог
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Категория заявки</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">
                      Активно
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stockRules.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ opacity: r.isActive ? 1 : 0.5 }}>{r.productName}</TableCell>
                      <TableCell>{r.warehouseName}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {thresholdLabel(r.minThreshold)}
                      </TableCell>
                      <TableCell>{r.categoryName ?? categoryName(r.categoryId)}</TableCell>
                      <TableCell align="center">
                        <Switch
                          size="small"
                          checked={r.isActive}
                          onChange={() => toggleStockRule.mutate(r)}
                          disabled={toggleStockRule.isPending}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Изменить">
                          <IconButton size="small" onClick={() => setStockDialog({ open: true, rule: r })}>
                            <EditOutlined sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Удалить">
                          <IconButton size="small" onClick={() => setStockRuleToDelete(r)}>
                            <DeleteOutlined sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>

        <Divider />

        {/* ══ Предложения автономности ══ */}
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Предложения автономности
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Заявки, которые повторяются, — система предлагает перевести их в автоматические.
            </Typography>
          </Box>

          {suggestionsQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={24} />
            </Stack>
          ) : suggestions.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
              Предложений нет — повторяющихся заявок не обнаружено
            </Typography>
          ) : (
            <Stack spacing={1.25}>
              {suggestions.map((s) => (
                <Box
                  key={s.id}
                  sx={(t) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 1.75,
                    borderRadius: "10px",
                    border: 1,
                    borderColor: "divider",
                    bgcolor: subtleBg(t),
                    flexWrap: "wrap",
                  })}
                >
                  <Box
                    sx={(t) => ({
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "primary.onSurface",
                      bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
                      "& .MuiSvgIcon-root": { fontSize: 20 },
                    })}
                  >
                    <AutoModeOutlined />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {s.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {s.categoryName} ·{" "}
                      {s.kind === "frequency"
                        ? `${s.occurrences} раза за ${s.periodDays} дней`
                        : `${s.monthsInARow} месяца подряд`}{" "}
                      · предлагается: {INTERVAL_OPTIONS.find((o) => o.value === s.suggestedInterval)?.label.toLowerCase()}
                    </Typography>
                  </Box>
                  <Stack direction="row" gap={1}>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={approveSuggestion.isPending}
                      onClick={() => approveSuggestion.mutate(s)}
                    >
                      Перевести в автономность
                    </Button>
                    <Button
                      size="small"
                      disabled={dismissSuggestion.isPending}
                      onClick={() => dismissSuggestion.mutate(s)}
                      sx={{ textTransform: "none", color: "text.secondary" }}
                    >
                      Отклонить
                    </Button>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>

      <CategoryDialog
        open={categoryDialog.open}
        category={categoryDialog.category}
        onClose={() => setCategoryDialog({ open: false, category: null })}
        onSaved={invalidateAll}
      />
      <RuleDialog
        open={ruleDialogOpen}
        categories={categories}
        onClose={() => setRuleDialogOpen(false)}
        onSaved={invalidateAll}
      />
      <StockRuleDialog
        open={stockDialog.open}
        rule={stockDialog.rule}
        categories={categories}
        onClose={() => setStockDialog({ open: false, rule: null })}
        onSaved={invalidateAll}
      />
      <ConfirmDialog
        open={ruleToDelete != null}
        title="Удалить правило?"
        message={ruleToDelete ? `«${ruleToDelete.title}» больше не будет создаваться автоматически.` : ""}
        confirmText="Удалить"
        variant="error"
        loading={removeRule.isPending}
        onConfirm={() => ruleToDelete && removeRule.mutate(ruleToDelete.id)}
        onClose={() => setRuleToDelete(null)}
      />
      <ConfirmDialog
        open={stockRuleToDelete != null}
        title="Удалить порог?"
        message={
          stockRuleToDelete
            ? `Автозадачи на пополнение «${stockRuleToDelete.productName}» больше не будут создаваться.`
            : ""
        }
        confirmText="Удалить"
        variant="error"
        loading={removeStockRule.isPending}
        onConfirm={() => stockRuleToDelete && removeStockRule.mutate(stockRuleToDelete.id)}
        onClose={() => setStockRuleToDelete(null)}
      />
    </SettingsLayout>
  );
};

export default TasksSettingsPage;
