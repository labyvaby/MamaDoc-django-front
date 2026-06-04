import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  createExpense,
  getExpenseCategories,
  parseBackendError,
  type ExpenseMethod,
} from "../../../../api/expenses";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../../../api/queryKeys";
import CategoryCreateDialog from "./CategoryCreateDialog";

// ── Types ──────────────────────────────────────────────────────────────────────

type Branch = { id: number; name: string };

type Props = {
  open: boolean;
  organizationId?: number;
  branches: Branch[];
  onClose: () => void;
  onCreated: () => void;
  expenseNeedsOrg?: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

const INITIAL_FORM = {
  branchId: "" as number | "",
  categoryId: "" as number | "",
  method: "cash" as ExpenseMethod,
  amount: "",
  expenseDate: dayjs().format("YYYY-MM-DD"),
  description: "",
};

type FormState = typeof INITIAL_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

const ExpenseCreateDialog: React.FC<Props> = ({
  open,
  organizationId,
  branches,
  onClose,
  onCreated,
  expenseNeedsOrg = false,
}) => {
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [catDialogOpen, setCatDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  // ── Categories ──────────────────────────────────────────────────────────────
  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.expenses.categories(organizationId),
    queryFn: ({ signal }) => getExpenseCategories(organizationId, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const activeCategories = (categoriesQuery.data ?? []).filter((c) => c.isActive);

  // ── Mutation ────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () =>
      createExpense({
        organizationId,
        branchId: form.branchId !== "" ? form.branchId : undefined,
        categoryId: form.categoryId as number,
        method: form.method,
        amount: form.amount,
        expenseDate: form.expenseDate,
        description: form.description.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: ["django", "cashbox", "summary"] });
      queryClient.invalidateQueries({
        queryKey: ["django", "cashbox", "entries", "expense"],
      });
      onCreated();
      handleClose();
    },
    onError: (err) => {
      setServerError(parseBackendError(err));
    },
  });

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: FormErrors = {};
    if (form.categoryId === "") errs.categoryId = "Выберите категорию";
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) errs.amount = "Сумма должна быть больше 0";
    if (!form.expenseDate) errs.expenseDate = "Укажите дату";
    if (form.description.trim().length < 3) errs.description = "Описание минимум 3 символа";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const handleSubmit = () => {
    if (expenseNeedsOrg) {
      setServerError("Выберите организацию в контексте перед созданием расхода");
      return;
    }
    if (!validate()) return;
    setServerError(null);
    mutation.mutate();
  };

  const handleClose = () => {
    if (mutation.isPending) return;
    setForm(INITIAL_FORM);
    setErrors({});
    setServerError(null);
    onClose();
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить расход</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {serverError && <Alert severity="error" sx={{ py: 0.5 }}>{serverError}</Alert>}

            {/* Branch */}
            {branches.length > 0 && (
              <FormControl size="small" fullWidth>
                <InputLabel>Филиал</InputLabel>
                <Select
                  value={form.branchId}
                  label="Филиал"
                  onChange={(e) => set("branchId", e.target.value as number | "")}
                  disabled={mutation.isPending}
                >
                  <MenuItem value="">Не указан</MenuItem>
                  {branches.map((b) => (
                    <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Category */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <FormControl size="small" fullWidth error={!!errors.categoryId}>
                  <InputLabel>Категория *</InputLabel>
                  <Select
                    value={form.categoryId}
                    label="Категория *"
                    onChange={(e) => set("categoryId", e.target.value as number | "")}
                    disabled={mutation.isPending || categoriesQuery.isLoading}
                  >
                    <MenuItem value="" disabled>Выберите категорию</MenuItem>
                    {activeCategories.map((c) => (
                      <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                    ))}
                    {activeCategories.length === 0 && !categoriesQuery.isLoading && (
                      <MenuItem disabled>
                        <Typography variant="caption" color="text.disabled">Нет активных категорий</Typography>
                      </MenuItem>
                    )}
                  </Select>
                  {errors.categoryId && <FormHelperText>{errors.categoryId}</FormHelperText>}
                </FormControl>
                <Tooltip title="Добавить категорию">
                  <IconButton
                    size="small"
                    onClick={() => setCatDialogOpen(true)}
                    disabled={mutation.isPending}
                    sx={{ mt: 0.5 }}
                  >
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>

            {/* Method */}
            <FormControl size="small" fullWidth>
              <InputLabel>Метод *</InputLabel>
              <Select
                value={form.method}
                label="Метод *"
                onChange={(e) => set("method", e.target.value as ExpenseMethod)}
                disabled={mutation.isPending}
              >
                <MenuItem value="cash">Наличные</MenuItem>
                <MenuItem value="card">Карта</MenuItem>
              </Select>
            </FormControl>

            {/* Amount */}
            <TextField
              size="small"
              fullWidth
              label="Сумма *"
              type="number"
              inputProps={{ min: 0.01, step: "0.01" }}
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              error={!!errors.amount}
              helperText={errors.amount}
              disabled={mutation.isPending}
            />

            {/* Date */}
            <TextField
              size="small"
              fullWidth
              type="date"
              label="Дата расхода *"
              value={form.expenseDate}
              onChange={(e) => set("expenseDate", e.target.value)}
              error={!!errors.expenseDate}
              helperText={errors.expenseDate}
              InputLabelProps={{ shrink: true }}
              disabled={mutation.isPending}
            />

            {/* Description */}
            <TextField
              size="small"
              fullWidth
              label="Описание *"
              multiline
              minRows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              error={!!errors.description}
              helperText={errors.description ?? "Минимум 3 символа"}
              disabled={mutation.isPending}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={mutation.isPending} size="small">
            Отмена
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleSubmit}
            disabled={mutation.isPending || expenseNeedsOrg}
            startIcon={mutation.isPending ? <CircularProgress size={14} /> : undefined}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <CategoryCreateDialog
        open={catDialogOpen}
        organizationId={organizationId}
        onClose={() => setCatDialogOpen(false)}
        onCreated={(id, name) => {
          setCatDialogOpen(false);
          set("categoryId", id);
          // categories query is already invalidated inside CategoryCreateDialog
          void name;
        }}
      />
    </>
  );
};

export default ExpenseCreateDialog;
