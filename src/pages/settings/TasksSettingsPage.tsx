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
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useOrgRoles } from "../../hooks/useOrgRoles";
import type { RbacRole } from "../../api/rbac";
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
import { useFormValidation } from "../../hooks/useFormValidation";
import { TASK_PRIORITY_META, TASK_PRIORITY_OPTIONS } from "../tasks/meta";
import { useT } from "../../i18n/VerticalProvider";

// ── Справочники ────────────────────────────────────────────────────────────────
// Группы-исполнители для привязки категорий — это роли организации
// («Настройки → Роли»), а не фиксированный перечень: набор групп у организаций
// разный, и захардкоженный список предлагает выбрать то, чего у неё нет.
// Запасной перечень ниже используется, только когда роли недоступны: ручка
// `/rbac/roles/` закрыта правом `rbac.roles.view`, а настройки задач открыты
// по `tasks.manage` — у части администраторов первого права нет.

const ROLE_VALUES = ["admin", "manager", "owner", "doctor", "nurse", "receptionist", "registrator", "accountant"] as const;

/** Есть ли для кода роли подпись в глоссарии (doctor → «врач» / «мастер»). */
const hasGlossaryLabel = (code: string) => (ROLE_VALUES as readonly string[]).includes(code);

function roleOptionsOf(
  t: (key: string) => string,
  orgRoles: RbacRole[],
): { value: string; label: string }[] {
  if (orgRoles.length === 0) {
    return ROLE_VALUES.map((value) => ({ value, label: t(`tasks.roles.${value}`) }));
  }
  return orgRoles.map((r) => ({ value: r.code, label: roleLabelOf(r.code, t, orgRoles) }));
}

/**
 * Подпись группы: своё название — у ролей, созданных организацией; системные
 * роли переводим глоссарием, иначе в салоне красоты «Врач» вместо «Мастер».
 * Неизвестный код (роль удалили, а в категории она осталась) показываем как есть.
 */
function roleLabelOf(code: string, t: (key: string) => string, orgRoles: RbacRole[]): string {
  const role = orgRoles.find((r) => r.code === code);
  if (role && !role.isSystem) return role.name;
  if (hasGlossaryLabel(code)) return t(`tasks.roles.${code}`);
  return role?.name ?? code;
}

// Названия дней недели — данные локали, одинаковые в обеих вертикалях,
// сознательно не выносятся в JSON (см. CLAUDE.md, «Терминология и вертикали»).
const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

const INTERVAL_VALUES: RecurringInterval[] = ["daily", "weekly", "monthly"];

function intervalOptionsOf(t: (key: string) => string): { value: RecurringInterval; label: string }[] {
  return INTERVAL_VALUES.map((value) => ({ value, label: t(`tasks.interval.${value}`) }));
}

function intervalLabel(rule: RecurringTaskRule, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (rule.interval === "daily") return t("tasks.interval.daily");
  if (rule.interval === "weekly") return t("tasks.interval.weeklyOn", { day: WEEKDAYS[(rule.dayOfWeek ?? 1) - 1].toLowerCase() });
  return t("tasks.interval.monthlyOn", { day: rule.dayOfMonth ?? 1 });
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
  const { t } = useT("settings");
  const orgId = useApiOrgId();
  // Группы грузим только при открытом диалоге: список нужен для выбора.
  const { roles: orgRoles } = useOrgRoles(open);
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

  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const form = useFormValidation({
    name: name.trim().length >= 2 ? null : t("tasks.categoryDialog.nameTooShort"),
    roles: roles.length > 0 ? null : t("tasks.categoryDialog.rolesRequired"),
  });

  const handleSubmit = async () => {
    if (!form.validate()) return;
    setBusy(true);
    setError(null);
    try {
      if (category) {
        await updateTaskCategory(
          category.id,
          {
            name: name.trim(),
            assignedRoles: roles,
            defaultPriority: priority,
          },
          orgId,
        );
      } else {
        await createTaskCategory(
          {
            name: name.trim(),
            assignedRoles: roles,
            defaultPriority: priority,
          },
          orgId,
        );
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e, t("tasks.categoryDialog.saveError")));
    } finally {
      setBusy(false);
    }
  };

  const roleOptions = roleOptionsOf(t, orgRoles);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{category ? t("tasks.categoryDialog.editTitle") : t("tasks.categoryDialog.createTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t("tasks.categoryDialog.nameLabel")}
            size="small"
            fullWidth
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            inputProps={{ maxLength: 200 }}
            {...form.field("name")}
          />
          <TextField
            select
            label={t("tasks.categoryDialog.rolesLabel")}
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
                    <Chip key={v} label={roleLabelOf(v, t, orgRoles)} size="small" sx={{ height: 20, borderRadius: "6px" }} />
                  ))}
                </Box>
              ),
            }}
            {...form.field("roles", t("tasks.categoryDialog.rolesHint"))}
          >
            {roleOptions.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t("tasks.categoryDialog.priorityLabel")}
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
          {t("common:actions.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? t("common:state.saving") : category ? t("common:actions.save") : t("common:actions.add")}
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
  const { t } = useT("settings");
  const orgId = useApiOrgId();
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

  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const form = useFormValidation({
    title: title.trim().length >= 2 ? null : t("tasks.ruleDialog.nameTooShort"),
    categoryId: categoryId !== "" ? null : t("tasks.ruleDialog.categoryRequired"),
  });

  const handleSubmit = async () => {
    if (!form.validate()) return;
    setBusy(true);
    setError(null);
    try {
      await createRecurringRule(
        {
          title: title.trim(),
          description: description.trim() || undefined,
          categoryId: categoryId as number,
          priority: priority === "" ? undefined : priority,
          interval,
          dayOfWeek: interval === "weekly" ? dayOfWeek : undefined,
          dayOfMonth: interval === "monthly" ? dayOfMonth : undefined,
        },
        orgId,
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e, t("tasks.ruleDialog.createError")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("tasks.ruleDialog.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t("tasks.ruleDialog.taskNameLabel")}
            size="small"
            fullWidth
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            inputProps={{ maxLength: 200 }}
            {...form.field("title")}
          />
          <TextField
            label={t("tasks.ruleDialog.descriptionLabel")}
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
            label={t("tasks.ruleDialog.categoryLabel")}
            size="small"
            fullWidth
            disabled={busy}
            value={categoryId === "" ? "" : String(categoryId)}
            onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
            {...form.field("categoryId")}
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
            label={t("tasks.ruleDialog.priorityLabel")}
            size="small"
            fullWidth
            disabled={busy}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority | "")}
            helperText={t("tasks.ruleDialog.priorityHelper")}
          >
            <MenuItem value="">{t("tasks.ruleDialog.priorityDefault")}</MenuItem>
            {TASK_PRIORITY_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t("tasks.ruleDialog.intervalLabel")}
            size="small"
            fullWidth
            disabled={busy}
            value={interval}
            onChange={(e) => setInterval(e.target.value as RecurringInterval)}
          >
            {intervalOptionsOf(t).map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          {interval === "weekly" && (
            <TextField
              select
              label={t("tasks.ruleDialog.dayOfWeekLabel")}
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
              label={t("tasks.ruleDialog.dayOfMonthLabel")}
              size="small"
              fullWidth
              disabled={busy}
              value={String(dayOfMonth)}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
              helperText={t("tasks.ruleDialog.dayOfMonthHelper")}
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
          {t("common:actions.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? t("common:state.saving") : t("common:actions.create")}
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
  const { t } = useT("settings");
  const orgId = useApiOrgId();
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
    queryFn: ({ signal }) => getProducts(signal, { organizationId: orgId }),
    enabled: open && rule == null,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const warehousesQuery = useQuery({
    queryKey: ["django", "warehouse", "list", "stock-rule-picker"],
    queryFn: ({ signal }) => getWarehouses(signal, orgId),
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
  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const form = useFormValidation({
    product: rule != null || product != null ? null : t("tasks.stockRuleDialog.productRequired"),
    warehouseId: rule != null || warehouseId !== "" ? null : t("tasks.stockRuleDialog.warehouseRequired"),
    threshold:
      normalized != null ? null : t("tasks.stockRuleDialog.thresholdInvalid"),
    categoryId: categoryId !== "" ? null : t("tasks.stockRuleDialog.categoryRequired"),
  });

  const handleSubmit = async () => {
    if (!form.validate() || normalized == null) return;
    setBusy(true);
    setError(null);
    try {
      if (rule) {
        await updateStockRule(
          rule.id,
          {
            minThreshold: normalized,
            categoryId: categoryId as number,
          },
          orgId,
        );
      } else {
        await createStockRule(
          {
            productId: product!.id,
            warehouseId: warehouseId as number,
            categoryId: categoryId as number,
            minThreshold: normalized,
          },
          orgId,
        );
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e, t("tasks.stockRuleDialog.saveError")));
    } finally {
      setBusy(false);
    }
  };

  const pickersError = productsQuery.isError || warehousesQuery.isError;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{rule ? t("tasks.stockRuleDialog.editTitle") : t("tasks.stockRuleDialog.createTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {rule ? (
            <TextField
              label={t("tasks.stockRuleDialog.productWarehouseLabel")}
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
                noOptionsText={t("tasks.stockRuleDialog.noProductsFound")}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t("tasks.stockRuleDialog.productLabel")}
                    size="small"
                    autoFocus
                    {...form.field("product")}
                  />
                )}
              />
              <TextField
                select
                label={t("tasks.stockRuleDialog.warehouseLabel")}
                size="small"
                fullWidth
                disabled={busy || warehousesQuery.isLoading}
                value={warehouseId === "" ? "" : String(warehouseId)}
                onChange={(e) => setWarehouseId(e.target.value === "" ? "" : Number(e.target.value))}
                {...form.field("warehouseId")}
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
            label={t("tasks.stockRuleDialog.thresholdLabel")}
            size="small"
            fullWidth
            disabled={busy}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            inputProps={{ inputMode: "decimal" }}
            ref={form.anchor("threshold")}
            error={(threshold.trim() !== "" || form.attempted) && normalized == null}
            helperText={
              (threshold.trim() !== "" || form.attempted) && normalized == null
                ? t("tasks.stockRuleDialog.thresholdInvalid")
                : product?.unit
                ? t("tasks.stockRuleDialog.thresholdHelperUnit", { unit: product.unit })
                : t("tasks.stockRuleDialog.thresholdHelperDefault")
            }
          />
          <TextField
            select
            label={t("tasks.stockRuleDialog.categoryLabel")}
            size="small"
            fullWidth
            disabled={busy}
            value={categoryId === "" ? "" : String(categoryId)}
            onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
            {...form.field("categoryId", t("tasks.stockRuleDialog.categoryHint"))}
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
              {t("tasks.stockRuleDialog.pickersError")}
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("common:actions.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? t("common:state.saving") : rule ? t("common:actions.save") : t("common:actions.add")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Главный компонент ──────────────────────────────────────────────────────────

const TasksSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("tasks.pageTitle"));
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  // Роли организации нужны и таблице: по ним подписываются чипы групп и видно,
  // что группа из категории в организации больше не существует.
  const { roles: orgRoles, available: orgRolesAvailable } = useOrgRoles();

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
    queryFn: ({ signal }) => getAllTaskCategories(orgId, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const rulesQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.recurringRules,
    queryFn: ({ signal }) => getRecurringRules(orgId, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const stockRulesQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.stockRules,
    queryFn: ({ signal }) => getStockRules(orgId, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const suggestionsQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.suggestions,
    queryFn: ({ signal }) => getAutomationSuggestions(orgId, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.tasks.all });
  };

  const toggleCategory = useMutation({
    mutationFn: (c: TaskCategory) => updateTaskCategory(c.id, { isActive: !c.isActive }, orgId),
    onSuccess: invalidateAll,
    onError: (e) => setError(errMsg(e, t("tasks.categories.toggleError"))),
  });

  const toggleRule = useMutation({
    mutationFn: (r: RecurringTaskRule) =>
      updateRecurringRule(r.id, { isActive: !r.isActive }, orgId),
    onSuccess: invalidateAll,
    onError: (e) => setError(errMsg(e, t("tasks.rules.toggleError"))),
  });

  const removeRule = useMutation({
    mutationFn: (ruleId: number) => deleteRecurringRule(ruleId, orgId),
    onSuccess: () => {
      setRuleToDelete(null);
      invalidateAll();
    },
    onError: (e) => setError(errMsg(e, t("tasks.rules.deleteError"))),
  });

  const toggleStockRule = useMutation({
    mutationFn: (r: StockTaskRule) => updateStockRule(r.id, { isActive: !r.isActive }, orgId),
    onSuccess: invalidateAll,
    onError: (e) => setError(errMsg(e, t("tasks.stockRules.toggleError"))),
  });

  const removeStockRule = useMutation({
    mutationFn: (ruleId: number) => deleteStockRule(ruleId, orgId),
    onSuccess: () => {
      setStockRuleToDelete(null);
      invalidateAll();
    },
    onError: (e) => setError(errMsg(e, t("tasks.stockRules.deleteError"))),
  });

  const approveSuggestion = useMutation({
    mutationFn: (s: AutomationSuggestion) => approveAutomationSuggestion(s.id, orgId),
    onSuccess: invalidateAll,
    onError: (e) => setError(errMsg(e, t("tasks.suggestions.approveError"))),
  });

  const dismissSuggestion = useMutation({
    mutationFn: (s: AutomationSuggestion) => dismissAutomationSuggestion(s.id, orgId),
    onSuccess: invalidateAll,
    onError: (e) => setError(errMsg(e, t("tasks.suggestions.dismissError"))),
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
                {t("tasks.categories.sectionTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("tasks.categories.sectionDescription")}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddOutlined />}
              onClick={() => setCategoryDialog({ open: true, category: null })}
            >
              {t("tasks.categories.addButton")}
            </Button>
          </Stack>

          {categoriesQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={24} />
            </Stack>
          ) : categories.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
              {t("tasks.categories.empty")}
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>{t("tasks.categories.columns.name")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t("tasks.categories.columns.roles")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t("tasks.categories.columns.priority")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">
                      {t("tasks.categories.columns.active")}
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
                          {c.assignedRoles.map((r) => {
                            // Группа могла исчезнуть (роль удалили или её никогда
                            // не было у организации) — такую помечаем, иначе
                            // категория выглядит настроенной, а адресовать её некому.
                            const missing = orgRolesAvailable && !orgRoles.some((role) => role.code === r);
                            const chip = (
                              <Chip
                                key={r}
                                label={roleLabelOf(r, t, orgRoles)}
                                size="small"
                                color={missing ? "warning" : undefined}
                                variant={missing ? "outlined" : "filled"}
                                sx={{ height: 20, borderRadius: "6px" }}
                              />
                            );
                            return missing ? (
                              <Tooltip key={r} title={t("tasks.categories.roleMissing")}>
                                <span>{chip}</span>
                              </Tooltip>
                            ) : (
                              chip
                            );
                          })}
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
                        <Tooltip title={t("tasks.categories.editTooltip")}>
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
                {t("tasks.rules.sectionTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("tasks.rules.sectionDescription")}
              </Typography>
            </Box>
            <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setRuleDialogOpen(true)}>
              {t("tasks.rules.addButton")}
            </Button>
          </Stack>

          {rulesQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={24} />
            </Stack>
          ) : rules.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
              {t("tasks.rules.empty")}
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>{t("tasks.rules.columns.task")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t("tasks.rules.columns.category")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t("tasks.rules.columns.schedule")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t("tasks.rules.columns.nextRun")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">
                      {t("tasks.rules.columns.active")}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ opacity: r.isActive ? 1 : 0.5 }}>{r.title}</TableCell>
                      <TableCell>{r.categoryName}</TableCell>
                      <TableCell>{intervalLabel(r, t)}</TableCell>
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
                        <Tooltip title={t("tasks.rules.deleteTooltip")}>
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
                {t("tasks.stockRules.sectionTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("tasks.stockRules.sectionDescription")}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddOutlined />}
              onClick={() => setStockDialog({ open: true, rule: null })}
            >
              {t("tasks.stockRules.addButton")}
            </Button>
          </Stack>

          {stockRulesQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={24} />
            </Stack>
          ) : stockRules.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
              {t("tasks.stockRules.empty")}
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>{t("tasks.stockRules.columns.product")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t("tasks.stockRules.columns.warehouse")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">
                      {t("tasks.stockRules.columns.threshold")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t("tasks.stockRules.columns.category")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">
                      {t("tasks.stockRules.columns.active")}
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
                        <Tooltip title={t("tasks.stockRules.editTooltip")}>
                          <IconButton size="small" onClick={() => setStockDialog({ open: true, rule: r })}>
                            <EditOutlined sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t("tasks.stockRules.deleteTooltip")}>
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
              {t("tasks.suggestions.sectionTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("tasks.suggestions.sectionDescription")}
            </Typography>
          </Box>

          {suggestionsQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={24} />
            </Stack>
          ) : suggestions.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
              {t("tasks.suggestions.empty")}
            </Typography>
          ) : (
            <Stack spacing={1.25}>
              {suggestions.map((s) => (
                <Box
                  key={s.id}
                  sx={(theme) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 1.75,
                    borderRadius: "10px",
                    border: 1,
                    borderColor: "divider",
                    bgcolor: subtleBg(theme),
                    flexWrap: "wrap",
                  })}
                >
                  <Box
                    sx={(theme) => ({
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "primary.onSurface",
                      bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.16 : 0.1),
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
                        ? t("tasks.suggestions.frequencyDetail", { occurrences: s.occurrences, days: s.periodDays })
                        : t("tasks.suggestions.monthlyDetail", { months: s.monthsInARow })}{" "}
                      · {t("tasks.suggestions.suggestedPrefix", { interval: intervalOptionsOf(t).find((o) => o.value === s.suggestedInterval)?.label.toLowerCase() })}
                    </Typography>
                  </Box>
                  <Stack direction="row" gap={1}>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={approveSuggestion.isPending}
                      onClick={() => approveSuggestion.mutate(s)}
                    >
                      {t("tasks.suggestions.approveButton")}
                    </Button>
                    <Button
                      size="small"
                      disabled={dismissSuggestion.isPending}
                      onClick={() => dismissSuggestion.mutate(s)}
                      sx={{ textTransform: "none", color: "text.secondary" }}
                    >
                      {t("tasks.suggestions.dismissButton")}
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
        title={t("tasks.rules.deleteConfirmTitle")}
        message={ruleToDelete ? t("tasks.rules.deleteConfirmBody", { title: ruleToDelete.title }) : ""}
        confirmText={t("common:actions.delete")}
        variant="error"
        loading={removeRule.isPending}
        onConfirm={() => ruleToDelete && removeRule.mutate(ruleToDelete.id)}
        onClose={() => setRuleToDelete(null)}
      />
      <ConfirmDialog
        open={stockRuleToDelete != null}
        title={t("tasks.stockRules.deleteConfirmTitle")}
        message={
          stockRuleToDelete
            ? t("tasks.stockRules.deleteConfirmBody", { name: stockRuleToDelete.productName })
            : ""
        }
        confirmText={t("common:actions.delete")}
        variant="error"
        loading={removeStockRule.isPending}
        onConfirm={() => stockRuleToDelete && removeStockRule.mutate(stockRuleToDelete.id)}
        onClose={() => setStockRuleToDelete(null)}
      />
    </SettingsLayout>
  );
};

export default TasksSettingsPage;
