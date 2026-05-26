import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  Typography,
  Avatar,
  CircularProgress,
} from "@mui/material";
import Autocomplete from "@mui/material/Autocomplete";
import { useCreate, useInvalidate, useNotification } from "@refinedev/core";
import { uploadExpensePhoto } from "../../services/storage";
import { fetchEmployees } from "../../services/employees";
import type { Expense, ExpenseFormValues, EmployeesRow } from "../../pages/expenses/types";

type AddExpenseModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (record: Expense) => void;
};

const defaultValues: ExpenseFormValues = {
  employee_id: null,
  name: "",
  cash_amount: 0,
  cashless_amount: 0,
  total_amount: 0,
  comment: "",
  category: "",
  category_id: null,
  photo: null,
  photoFile: null,
};

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const [values, setValues] = React.useState<ExpenseFormValues>(defaultValues);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [employees, setEmployees] = React.useState<EmployeesRow[]>([]);



  const { mutateAsync: createAsync } = useCreate<Expense>();
  const [creating, setCreating] = React.useState(false);
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();

  React.useEffect(() => {
    if (!open) {
      setValues(defaultValues);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setUploading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const emps = await fetchEmployees();
        if (!cancelled) {
          setEmployees(emps);
        }
      } catch (e) {
        console.error("Failed to load employees in AddExpenseModal", e);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  const handleChange =
    (field: keyof ExpenseFormValues) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (
          field === "cash_amount" ||
          field === "cashless_amount" ||
          field === "total_amount"
        ) {
          const n = Number(raw);
          setValues((s) => ({ ...s, [field]: Number.isFinite(n) ? n : 0 }));
        } else {
          setValues((s) => ({ ...s, [field]: raw }));
        }
      };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setValues((s) => ({ ...s, photoFile: file ?? null }));
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const computeTotal = (cash: number, cashless: number, provided: number) => {
    // Prefer explicit provided value; if 0 or NaN, fall back to sum
    if (Number.isFinite(provided) && provided > 0) return provided;
    return (
      (Number.isFinite(cash) ? cash : 0) +
      (Number.isFinite(cashless) ? cashless : 0)
    );
  };

  const handleSubmit = async () => {
    try {
      setUploading(true);
      setCreating(true);
      let publicUrl: string | null = null;

      if (values.photoFile) {
        const { publicUrl: url } = await uploadExpensePhoto(values.photoFile);
        publicUrl = url;
      }

      const employeeId =
        values.employee_id && String(values.employee_id).trim() !== ""
          ? values.employee_id
          : null;
      const payload = {
        employee_id: employeeId,
        name: values.name,
        cash_amount: values.cash_amount ?? 0,
        cashless_amount: values.cashless_amount ?? 0,
        total_amount: computeTotal(
          values.cash_amount ?? 0,
          values.cashless_amount ?? 0,
          values.total_amount ?? 0
        ),
        comment: values.comment ?? null,
        category: values.category ?? null,
        category_id: values.category_id ?? null,
        photo: publicUrl,
      };

      const created = await createAsync({
        resource: "expenses",
        values: payload,
      });

      notify?.({
        type: "success",
        message: "Расход успешно создан",
        description: values.name,
      });

      // Invalidate list queries for Expenses
      await invalidate({
        resource: "expenses",
        invalidates: ["list"],
      });

      if (created?.data && onCreated) onCreated(created.data as Expense);
      onClose();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Create expense failed:", e);
      notify?.({
        type: "error",
        message: "Ошибка при создании расхода",
        description: message || "Неизвестная ошибка",
      });
    } finally {
      setCreating(false);
      setUploading(false);
    }
  };

  const busy = uploading || creating;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Добавить расход</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>

              <TextField
                label="Категория"
                value={values.category ?? ""}
                onChange={handleChange("category")}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Название"
                value={values.name}
                onChange={handleChange("name")}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Наличные"
                type="number"
                value={values.cash_amount}
                onChange={handleChange("cash_amount")}
                fullWidth
                inputProps={{ min: 0, step: "0.01" }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Безнал"
                type="number"
                value={values.cashless_amount}
                onChange={handleChange("cashless_amount")}
                fullWidth
                inputProps={{ min: 0, step: "0.01" }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Итого"
                type="number"
                value={values.total_amount}
                onChange={handleChange("total_amount")}
                helperText="Если оставить 0 — будет рассчитано как наличные + безнал"
                fullWidth
                inputProps={{ min: 0, step: "0.01" }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                placeholder="Комментарий"
                value={values.comment ?? ""}
                onChange={handleChange("comment")}
                minRows={3}
                multiline
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete<EmployeesRow, false, false, false>
                options={employees}
                noOptionsText=""
                getOptionLabel={(option) => option.specialization ? `${option.full_name} — ${option.specialization}` : (option.full_name || option.id)}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                value={employees.find((e) => e.id === values.employee_id) ?? null}
                onChange={(_e, newValue) => setValues((s) => ({ ...s, employee_id: newValue?.id ?? null }))}
                renderInput={(params) => <TextField {...params} label="Сотрудник" fullWidth />}
              />
            </Grid>
            <Grid item xs={12}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Button variant="outlined" component="label" disabled={busy}>
                  Выбрать фото
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                </Button>
                {previewUrl ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Avatar
                      variant="rounded"
                      src={previewUrl}
                      sx={{ width: 64, height: 64 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      Предпросмотр
                    </Typography>
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Фото не выбрано
                  </Typography>
                )}
              </Stack>
            </Grid>
          </Grid>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={busy}>
          {busy ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              <CircularProgress size={18} />
              <span>Создание…</span>
            </Stack>
          ) : (
            "Создать"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
