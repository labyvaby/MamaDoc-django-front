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
  cashAmount: "",
  cardAmount: "",
  expenseDate: dayjs().format("YYYY-MM-DD"),
  description: "",
  name: "",
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
    mutationFn: () => {
      const cash = parseFloat(form.cashAmount) || 0;
      const card = parseFloat(form.cardAmount) || 0;
      return createExpense({
        organizationId,
        branchId: form.branchId !== "" ? form.branchId : undefined,
        categoryId: form.categoryId as number,
        name: form.name.trim() || form.description.trim() || "Расход",
        cashAmount: cash > 0 ? cash.toFixed(2) : undefined,
        cardAmount: card > 0 ? card.toFixed(2) : undefined,
        expenseDate: form.expenseDate,
        description: form.description.trim() || undefined,
      });
    },
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
    const cash = parseFloat(form.cashAmount) || 0;
    const card = parseFloat(form.cardAmount) || 0;
    if (cash <= 0 && card <= 0) errs.cashAmount = "Укажите хотя бы одну ненулевую сумму";
    if (!form.expenseDate) errs.expenseDate = "Укажите дату";
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

            {/* Name */}
            <TextField
              size="small"
              fullWidth
              label="Название"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={mutation.isPending}
            />

            {/* Cash amount */}
            <TextField
              size="small"
              fullWidth
              label="Наличные"
              type="number"
              inputProps={{ min: 0, step: "0.01" }}
              value={form.cashAmount}
              onChange={(e) => set("cashAmount", e.target.value)}
              error={!!errors.cashAmount}
              helperText={errors.cashAmount}
              disabled={mutation.isPending}
            />

            {/* Card amount */}
            <TextField
              size="small"
              fullWidth
              label="Карта"
              type="number"
              inputProps={{ min: 0, step: "0.01" }}
              value={form.cardAmount}
              onChange={(e) => set("cardAmount", e.target.value)}
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
              label="Комментарий"
              multiline
              minRows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
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
