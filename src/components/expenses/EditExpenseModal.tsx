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
import { useInvalidate, useNotification, useUpdate } from "@refinedev/core";
import { deleteExpensePhotoByUrl, uploadExpensePhoto } from "../../services/storage";
import { supabase } from "../../utility/supabaseClient";
import { fetchEmployees } from "../../services/employees";
import type { Expense, ExpenseFormValues, EmployeesRow } from "../../pages/expenses/types";

type EditExpenseModalProps = {
  open: boolean;
  onClose: () => void;
  record: Expense;
  onUpdated?: (record: Expense) => void;
};

export const EditExpenseModal: React.FC<EditExpenseModalProps> = ({
  open,
  onClose,
  record,
  onUpdated,
}) => {
  const initialValues: ExpenseFormValues = React.useMemo(
    () => ({
      employee_id: record.employee_id,
      name: record.name,
      cash_amount: record.cash_amount,
      cashless_amount: record.cashless_amount,
      total_amount: record.total_amount,
      comment: record.comment ?? "",
      category: record.category ?? "",
      photo: record.photo ?? null,
      photoFile: null,
    }),
    [record]
  );

  const [values, setValues] = React.useState<ExpenseFormValues>(initialValues);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [updatingBusy, setUpdatingBusy] = React.useState(false);

  type ExpenseCategory = {
    id: string;
    name: string;
  };



  const [employees, setEmployees] = React.useState<EmployeesRow[]>([]);
  const [categories, setCategories] = React.useState<ExpenseCategory[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [emps, catRes] = await Promise.all([
          fetchEmployees(),
          supabase.from("expense_category").select("id, name"),
        ]);

        const cats: ExpenseCategory[] = [];
        if (Array.isArray(catRes?.data)) {
          for (const c of catRes.data as unknown[]) {
            if (typeof c === "object" && c !== null) {
              const r = c as { id: string | number; name?: unknown };
              const idRaw = r.id;
              const nameRaw = r.name;
              if (idRaw != null && typeof nameRaw === "string") {
                const id = typeof idRaw === "string" ? idRaw : String(idRaw);
                cats.push({ id, name: nameRaw });
              }
            }
          }
        }

        if (!cancelled) {
          setEmployees(emps);
          setCategories(cats);
        }
      } catch (e) {
        console.error("Failed to load in EditExpenseModal", e);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);



  const { mutateAsync: updateAsync } = useUpdate<Expense>();
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();

  React.useEffect(() => {
    if (open) {
      setValues(initialValues);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setUploading(false);
      setUpdatingBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record]);

  const handleChange =
    (field: keyof ExpenseFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (field === "cash_amount" || field === "cashless_amount" || field === "total_amount") {
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
    if (Number.isFinite(provided) && provided > 0) return provided;
    return (Number.isFinite(cash) ? cash : 0) + (Number.isFinite(cashless) ? cashless : 0);
  };

  const handleSubmit = async () => {
    try {
      setUploading(true);
      setUpdatingBusy(true);
      let newPublicUrl: string | null = null;
      const hadOldPhoto = Boolean(record.photo);

      if (values.photoFile) {
        const { publicUrl } = await uploadExpensePhoto(values.photoFile);
        newPublicUrl = publicUrl;
      }

      const payload = {
        employee_id: values.employee_id,
        name: values.name,
        cash_amount: values.cash_amount ?? 0,
        cashless_amount: values.cashless_amount ?? 0,
        total_amount: computeTotal(values.cash_amount ?? 0, values.cashless_amount ?? 0, values.total_amount ?? 0),
        comment: values.comment ?? null,
        category: values.category ?? null,
        photo: newPublicUrl ?? record.photo ?? null,
      };

      const updated = await updateAsync({
        resource: "expenses",
        id: record.id,
        values: payload,
      });

      // After successful DB update, delete old photo if replaced
      if (values.photoFile && hadOldPhoto) {
        await deleteExpensePhotoByUrl(record.photo);
      }

      notify?.({
        type: "success",
        message: "Расход обновлён",
        description: values.name,
      });

      await invalidate({
        resource: "expenses",
        invalidates: ["list", "detail"],
      });

      if (updated?.data && onUpdated) onUpdated(updated.data as Expense);
      onClose();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("Update expense failed:", e);
      notify?.({
        type: "error",
        message: "Ошибка при обновлении",
        description: message || "Неизвестная ошибка",
      });
    } finally {
      setUpdatingBusy(false);
      setUploading(false);
    }
  };

  const busy = uploading || updatingBusy;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Редактировать расход</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <Grid container spacing={2}>
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
                value={computeTotal(values.cash_amount ?? 0, values.cashless_amount ?? 0, values.total_amount ?? 0)}
                disabled
                helperText="Итого рассчитывается: наличные + безнал"
                fullWidth
                inputProps={{ min: 0, step: "0.01" }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete<string, false, false, false>
                options={categories.map((c) => c.name)}
                noOptionsText=""
                value={values.category && values.category.length > 0 ? values.category : null}
                onChange={(_e, newValue) => setValues((s) => ({ ...s, category: newValue ?? null }))}
                renderInput={(params) => <TextField {...params} label="Категория" fullWidth />}
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
                getOptionLabel={(option) => option.full_name || option.id}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                value={employees.find((e) => e.id === values.employee_id) ?? null}
                onChange={(_e, newValue) => setValues((s) => ({ ...s, employee_id: newValue?.id ?? null }))}
                renderInput={(params) => <TextField {...params} label="Сотрудник" fullWidth />}
              />
            </Grid>
            <Grid item xs={12}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Button variant="outlined" component="label" disabled={busy}>
                  Выбрать новое фото
                  <input type="file" hidden accept="image/*" onChange={handleFileChange} />
                </Button>
                {previewUrl ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Avatar variant="rounded" src={previewUrl} sx={{ width: 64, height: 64 }} />
                    <Typography variant="body2" color="text.secondary">Новое фото</Typography>
                  </Stack>
                ) : record.photo ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Avatar variant="rounded" src={record.photo} sx={{ width: 64, height: 64 }} />
                    <Typography variant="body2" color="text.secondary">Текущее фото</Typography>
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">Фото отсутствует</Typography>
                )}
              </Stack>
            </Grid>
          </Grid>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Отмена</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={busy}>
          {busy ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              <CircularProgress size={18} />
              <span>Сохранение…</span>
            </Stack>
          ) : (
            "Сохранить"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};