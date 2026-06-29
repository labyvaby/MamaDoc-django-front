import React from "react";
import { useCloseGuard } from "../../hooks/useCloseGuard";
import { CloseGuardDialog } from "../common/CloseGuardDialog";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
  Autocomplete,
  CardContent,
  Avatar,
  Paper,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import { useNotification } from "@refinedev/core";
import { ExpensesService } from "../../services/expenses";
import { uploadExpensePhoto } from "../../services/storage";
import { supabase } from "../../utility/supabaseClient";
import type { Expense, ExpenseFormValues } from "../../pages/expenses/types";
import { AppCard, CustomDateTimePicker } from "../ui";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { useEmployees } from "../../hooks/useEmployees";
// import { fetchEmployees } from "../../services/employees"; // Import fetcher
import type { EmployeesRow } from "../../pages/expenses/types"; // Import type
import { roundDateTimeLocalToStep } from "../../utility/time";

type AddExpenseDrawerProps = {
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

type ExpenseCategory = {
  id: string;
  name: string;
};

export const AddExpenseDrawer: React.FC<AddExpenseDrawerProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const { open: notify } = useNotification();
  const [values, setValuesRaw] = React.useState<ExpenseFormValues>(defaultValues);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const { guardedClose, confirmOpen, confirmClose, cancelClose } = useCloseGuard({ isDirty: touched, isOpen: open, onClose });
  const setValues: typeof setValuesRaw = (v) => { setTouched(true); setValuesRaw(v); };

  const [categories, setCategories] = React.useState<ExpenseCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = React.useState(false);

  // const [employees, setEmployees] = React.useState<EmployeesRow[]>([]);
  // const [loadingEmployees, setLoadingEmployees] = React.useState(false);

  const { employees, loading: loadingEmployees } = useEmployees(true); // Always load or rely on open? Drawer mounts conditionally? 
  // Code structure suggests mounting via prop open, so can use open.
  // Actually, let's look at useEffect below, it was empty dependancy: loadEmps(); }, []);
  // So it loaded on mount. Drawer is likely always mounted and hidden.
  // Better to lazy load when open to save bandwidth if many drawers exist.
  // But original code loaded on mount. Let's stick to open=true to match original behavior or optimize to `open`.
  // Optimization: useEmployees(open);



  const [expenseDate, setExpenseDate] = React.useState<string>("");

  // Custom Expenses Service - ExpensesService is already imported at the top.

  React.useEffect(() => {
    const fetchCategories = async () => {
      setLoadingCategories(true);
      try {
        const { data, error } = await supabase
          .from("ExpenseCategories") // Corrected table name case if needed, assuming CamelCase based on previous code, but listing said ExpenseCategories
          .select("id, name")
          .order("name", { ascending: true });

        if (error) throw error;
        setCategories(
          data?.map((c) => ({
            id: String(c.id),
            name: c.name,
          })) || []
        );
      } catch (error) {
        console.error("Error fetching expense categories:", error);
        notify?.({
          type: "error",
          message: "Не удалось загрузить категории расходов",
        });
      } finally {
        setLoadingCategories(false);
      }
    };
    fetchCategories();
  }, [notify]);

  // Load employees - Handled by useEmployees hook
  // React.useEffect(() => {
  //   const loadEmps = async () => { ... }
  // }, []);

  const isSalaryCategory = (name: string | null | undefined) => {
    if (!name) return false;
    const lower = name.toLowerCase();
    // (аванс, зарабатная плата, зп) - as requested
    return lower.includes("аванс") || lower.includes("заработная плата") || lower.includes("зп");
  };

  // Scehdule reset
  React.useEffect(() => {
    if (!open) {
      setValues(defaultValues);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setBusy(false);
      setTouched(false);
      // Initialize date to now
      const nowStr = dayjs().format("YYYY-MM-DDTHH:mm");
      setExpenseDate(roundDateTimeLocalToStep(nowStr, 15));
    }
  }, [open, previewUrl]);

  const handleFileChange = (file: File | null) => {
    setValues((s) => ({ ...s, photoFile: file }));
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const computeTotal = () => {
    return (values.cash_amount || 0) + (values.cashless_amount || 0);
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (!values.name.trim()) {
      notify?.({ type: "error", message: "Название расхода обязательно" });
      return;
    }

    if (isSalaryCategory(values.category) && !values.employee_id) {
      notify?.({ type: "error", message: "Для категории Заработная плата необходимо выбрать сотрудника" });
      return;
    }

    setBusy(true);
    let publicUrl: string | null = null;

    try {
      if (values.photoFile) {
        const res = await uploadExpensePhoto(values.photoFile);
        publicUrl = res.publicUrl;
      }

      const createdAtDate = expenseDate ? dayjs(expenseDate) : dayjs();
      const lower = (values.category || "").toLowerCase();
      let affectsMonth: string | null = null;
      if (lower.includes("заработная плата") || lower.includes("зп")) {
        // Deduct from previous month relative to the expense date
        affectsMonth = createdAtDate.subtract(1, "month").format("YYYY-MM");
      } else if (lower.includes("аванс")) {
        // Deduct from the same month as the expense date
        affectsMonth = createdAtDate.format("YYYY-MM");
      }

      const payload = {
        employee_id: isSalaryCategory(values.category) ? (values.employee_id || null) : null,
        name: values.name.trim(),
        cash_amount: Number(values.cash_amount) || 0,
        cashless_amount: Number(values.cashless_amount) || 0,
        total_amount: computeTotal(),
        comment: values.comment?.trim() || null,
        category: values.category?.trim() || null,
        category_id: values.category_id || null,
        photo: publicUrl,
        created_at: createdAtDate.toISOString(),
        affects_month: affectsMonth,
      };

      const created = await ExpensesService.create(payload);

      if (created && onCreated) onCreated(created);
      notify?.({ type: "success", message: "Расход добавлен" });
      onClose();
    } catch (e: unknown) {
      console.error("Create expense failed:", e);
      notify?.({ type: "error", message: "Не удалось создать расход" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : guardedClose}
      PaperProps={{ sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ width: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1,
          }}
        >
          <Typography variant="h6">Добавить расход</Typography>
          <IconButton onClick={busy ? undefined : guardedClose} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
        </Box>
        <Divider />
        <Box
          sx={{
            p: 2,
            flex: 1,
            overflowY: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
          }}
        >
          <Stack spacing={3}>
            <Stack spacing={2}>
              {/* Категория */}
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Фото расхода
                </Typography>
                <AppCard variant="outlined" sx={{ borderStyle: "dashed" }} disableContentPadding>
                  <CardContent
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      py: 2,
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      const el = document.getElementById("expense-photo-input") as HTMLInputElement | null;
                      el?.click();
                    }}
                  >
                    <Avatar
                      variant="rounded"
                      src={previewUrl || undefined}
                      sx={{ width: 48, height: 48 }}
                    >
                      <PhotoCameraOutlined />
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">
                        {values.photoFile
                          ? values.photoFile.name
                          : "Нажмите для выбора изображения"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        JPG, PNG. Необязательно.
                      </Typography>
                    </Box>
                    <input
                      id="expense-photo-input"
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        handleFileChange(f);
                      }}
                    />
                  </CardContent>
                </AppCard>
              </Stack>
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Дата расхода
                </Typography>
                <CustomDateTimePicker
                  value={expenseDate ? dayjs(expenseDate) : null}
                  onChange={(val) => setExpenseDate(val ? val.format() : '')}
                  ampm={false}
                  minutesStep={15}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      InputLabelProps: { shrink: true }
                    }
                  }}
                />
              </Stack>

              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Название *
                </Typography>
                <TextField
                  value={values.name}
                  onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
                  fullWidth
                  autoFocus
                  placeholder="Введите название расхода"
                  error={touched && !values.name.trim()}
                  helperText={touched && !values.name.trim() ? "Обязательное поле" : ""}
                />
              </Stack>
            </Stack>


            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Категория
              </Typography>
              <Autocomplete
                options={categories}
                loading={loadingCategories}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                value={
                  categories.find((c) => c.id === values.category_id) || null
                }
                onChange={(_, newValue) => {
                  const newCategory = newValue?.name || "";
                  const isSalary = isSalaryCategory(newCategory);
                  const emp = employees.find((e) => e.id === values.employee_id);
                  const empName = emp?.full_name || "";

                  let newName = values.name;
                  if (newCategory) {
                    newName = isSalary && empName ? `${newCategory} - ${empName}` : newCategory;

                    // date is never auto-changed when selecting a category
                  }

                  setValues((s) => ({
                    ...s,
                    category_id: newValue?.id || null,
                    category: newCategory,
                    name: newCategory ? newName : s.name
                  }));
                }}
                renderInput={(params) => (
                  <TextField {...params} placeholder="Выберите категорию" fullWidth />
                )}
                loadingText="Загрузка категорий..."
                noOptionsText={loadingCategories ? "Загрузка..." : "Нет категорий"}
              />
            </Stack>

            {/* Employee Selection (Conditional) */}
            {isSalaryCategory(values.category) && (
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Сотрудник *
                </Typography>
                <Autocomplete
                  options={employees}
                  loading={loadingEmployees}
                  getOptionLabel={(option) => option.specialization ? `${option.full_name} — ${option.specialization}` : option.full_name || ""}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  value={employees.find((e) => e.id === values.employee_id) || null}
                  onChange={(_, newValue) => {
                    const empName = newValue?.full_name || "";
                    let newName = values.name;
                    if (isSalaryCategory(values.category) && empName) {
                      newName = `${values.category} - ${empName}`;
                    }
                    setValues((s) => ({ ...s, employee_id: newValue?.id || null, name: newName }));
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Выберите сотрудника"
                      fullWidth
                      error={touched && !values.employee_id}
                      helperText={touched && !values.employee_id ? "Обязательное поле для данной категории" : "Кому выдана сумма"}
                    />
                  )}
                  noOptionsText="Нет сотрудников"
                />
              </Stack>
            )}

            {/* Payment Card */}
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
                border: "1px solid",
                borderColor: "divider",
                borderRadius: "14px",
              }}
            >
              <Stack spacing={2}>
                {/* Наличные и Безналичные */}
                <Stack direction="row" spacing={2}>
                  <Stack flex={1} spacing={0.5}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Наличные
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                      <Box px={1}><AccountBalanceWalletOutlined color="action" fontSize="small" /></Box>
                      <TextField
                        variant="standard"
                        fullWidth
                        type="number"
                        value={values.cash_amount || ""}
                        onChange={(e) => {
                          setValues((s) => ({
                            ...s,
                            cash_amount: Number(e.target.value) || 0,
                          }));
                        }}
                        InputProps={{ disableUnderline: true }}
                        sx={{
                          py: 0.5,
                          '& input[type=number]': {
                            MozAppearance: 'textfield',
                          },
                          '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
                            WebkitAppearance: 'none',
                            margin: 0,
                          },
                        }}
                        placeholder="0"
                      />
                    </Stack>
                  </Stack>

                  <Stack flex={1} spacing={0.5}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Безналичные
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                      <Box px={1}><CreditCardOutlined color="action" fontSize="small" /></Box>
                      <TextField
                        variant="standard"
                        fullWidth
                        type="number"
                        value={values.cashless_amount || ""}
                        onChange={(e) => {
                          setValues((s) => ({
                            ...s,
                            cashless_amount: Number(e.target.value) || 0,
                          }));
                        }}
                        InputProps={{ disableUnderline: true }}
                        sx={{
                          py: 0.5,
                          '& input[type=number]': {
                            MozAppearance: 'textfield',
                          },
                          '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
                            WebkitAppearance: 'none',
                            margin: 0,
                          },
                        }}
                        placeholder="0"
                      />
                    </Stack>
                  </Stack>
                </Stack>

                <Divider sx={{ my: 1 }} />

                {/* Итого */}
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>
                    ИТОГО
                  </Typography>
                  <Typography variant="h5" fontWeight={700} color="success.main">
                    {new Intl.NumberFormat("ru-RU", { style: "currency", currency: "KGS" }).format(computeTotal())}
                  </Typography>
                </Stack>
              </Stack>
            </Paper>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Комментарий
              </Typography>
              <TextField
                value={values.comment || ""}
                onChange={(e) => setValues((s) => ({ ...s, comment: e.target.value }))}
                fullWidth
                multiline
                rows={3}
                placeholder="Добавьте комментарий (необязательно)"
              />
            </Stack>

          </Stack>
        </Box>
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Stack direction="row" gap={1} justifyContent="flex-end">
            <Button onClick={guardedClose} disabled={busy}>
              Отмена
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={busy || !values.name.trim()}
            >
              {busy ? (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={18} />
                  <span>Сохранение…</span>
                </Stack>
              ) : (
                "Сохранить"
              )}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Drawer>
    <CloseGuardDialog open={confirmOpen} title="добавление расхода" onConfirm={confirmClose} onCancel={cancelClose} />
    </>
  );
};

export default AddExpenseDrawer;
