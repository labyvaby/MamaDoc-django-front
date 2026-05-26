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
  Paper
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import { useNotification } from "@refinedev/core";
import { uploadExpensePhoto } from "../../services/storage";
import { supabase } from "../../utility/supabaseClient";
import { ExpensesService } from "../../services/expenses";
import type { Expense, ExpenseFormValues } from "../../pages/expenses/types";
import { AppCard, CustomDateTimePicker } from "../ui";
import { useEmployees } from "../../hooks/useEmployees";
import dayjs from "dayjs";

type EditExpenseDrawerProps = {
  open: boolean;
  onClose: () => void;
  record: Expense;
  onUpdated?: (record: Expense) => void;
};

type ExpenseCategory = {
  id: string;
  name: string;
};

export const EditExpenseDrawer: React.FC<EditExpenseDrawerProps> = ({
  open,
  onClose,
  record,
  onUpdated,
}) => {
  const { open: notify } = useNotification();

  const initialValues: ExpenseFormValues = React.useMemo(
    () => ({
      employee_id: record.employee_id || null, // Keep existing ID if any, but won't edit
      name: record.name || "",
      cash_amount: record.cash_amount || 0,
      cashless_amount: record.cashless_amount || 0,
      total_amount: record.total_amount || 0,
      comment: record.comment || "",
      category: record.category || "",
      category_id: record.category_id || null,
      photo: record.photo || null,
      photoFile: null,
      created_at: record.created_at ? dayjs(record.created_at).format("YYYY-MM-DDTHH:mm") : dayjs().format("YYYY-MM-DDTHH:mm"),
    }),
    [record]
  );

  const [values, setValuesRaw] = React.useState<ExpenseFormValues>(initialValues);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const { guardedClose, confirmOpen, confirmClose, cancelClose } = useCloseGuard({ isDirty: touched, isOpen: open, onClose });
  const setValues: typeof setValuesRaw = (v) => { setValuesRaw(v); };

  const [categories, setCategories] = React.useState<ExpenseCategory[]>([]);
  const { employees, loading: loadingEmployees } = useEmployees(open);

  const isSalaryCategory = React.useCallback((name: string | null | undefined) => {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower.includes("аванс") || lower.includes("заработная плата") || lower.includes("зп");
  }, []);

  // Refine hooks removed
  // const { mutateAsync: updateAsync } = useUpdate<Expense>();
  // 


  // Custom Expenses Service - Imported at top


  // Загрузка категорий при монтировании компонента
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase.from("ExpenseCategories").select("id, name");

        if (error) {
          console.error("Error loading categories:", error);
          return;
        }

        const cats: ExpenseCategory[] = [];
        if (data) {
          data.forEach((c) => {
            if (c.id && c.name) {
              cats.push({ id: String(c.id), name: c.name });
            }
          });
        }

        if (!cancelled) {
          setCategories(cats);
        }
      } catch (e) {
        console.error("Failed to load categories in EditExpenseDrawer", e);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []); // Загружаем один раз при монтировании

  // Обновление значений при изменении record
  React.useEffect(() => {
    if (open) {
      setValues(initialValues);
      setTouched(false);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    }
  }, [open, initialValues, previewUrl]);

  const handleFileChange = (file: File | null) => {
    setValues((s) => ({ ...s, photoFile: file }));
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const computeTotal = () => {
    const cash = Number(values.cash_amount) || 0;
    const cashless = Number(values.cashless_amount) || 0;
    return cash + cashless;
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (!values.name.trim()) {
      notify?.({ type: "error", message: "Введите название расхода" });
      return;
    }

    if (isSalaryCategory(values.category) && !values.employee_id) {
      notify?.({ type: "error", message: "Для категории Заработная плата необходимо выбрать сотрудника" });
      return;
    }

    try {
      setBusy(true);

      let publicUrl: string | null = values.photo || null;
      if (values.photoFile) {
        try {
          const res = await uploadExpensePhoto(values.photoFile);
          publicUrl = res.publicUrl;
        } catch (e) {
          console.error("Upload expense photo failed:", e);
          notify?.({ type: "error", message: "Не удалось загрузить фото расхода" });
        }
      }

      const createdAtDate = values.created_at ? dayjs(values.created_at) : dayjs();
      const lowerCat = (values.category || "").toLowerCase();
      let affectsMonth: string | null = null;
      if (lowerCat.includes("заработная плата") || lowerCat.includes("зп")) {
        affectsMonth = createdAtDate.subtract(1, "month").format("YYYY-MM");
      } else if (lowerCat.includes("аванс")) {
        affectsMonth = createdAtDate.format("YYYY-MM");
      }

      const payload = {
        employee_id: values.employee_id || null,
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

      const updated = await ExpensesService.update(record.id, payload);

      if (updated && onUpdated) onUpdated(updated);
      notify?.({ type: "success", message: "Расход обновлен" });
      onClose();
    } catch (e: unknown) {
      console.error("Update expense failed:", e);
      notify?.({ type: "error", message: "Не удалось обновить расход" });
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
          <Typography variant="h6">Редактировать расход</Typography>
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

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Дата и время
              </Typography>
              <CustomDateTimePicker
                value={values.created_at ? dayjs(values.created_at) : null}
                onChange={(val) => setValues((s) => ({ ...s, created_at: val ? val.format() : '' }))}
                ampm={false}
                format="DD.MM.YYYY HH:mm"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    placeholder: "Укажите дату и время",
                  },
                }}
              />
            </Stack>

            {/* Photo Uploader */}
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
                    const el = document.getElementById("edit-expense-photo-input") as HTMLInputElement | null;
                    el?.click();
                  }}
                >
                  <Avatar
                    variant="rounded"
                    src={previewUrl || values.photo || undefined}
                    sx={{ width: 48, height: 48 }}
                  >
                    <PhotoCameraOutlined />
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2">
                      {values.photoFile
                        ? values.photoFile.name
                        : values.photo
                          ? "Изображение загружено"
                          : "Нажмите для выбора изображения"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      JPG, PNG. Необязательно.
                    </Typography>
                  </Box>
                  <input
                    id="edit-expense-photo-input"
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
                Категория
              </Typography>
              <Autocomplete
                options={categories}
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
                noOptionsText="Нет категорий"
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
                borderRadius: 2,
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
    <CloseGuardDialog open={confirmOpen} title="редактирование расхода" onConfirm={confirmClose} onCancel={cancelClose} />
    </>
  );
};

export default EditExpenseDrawer;
