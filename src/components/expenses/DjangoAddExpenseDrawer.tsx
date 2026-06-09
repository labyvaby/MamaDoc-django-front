import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { CustomDatePicker, AppBottomSheet } from "../ui";
import { useCloseGuard } from "../../hooks/useCloseGuard";
import { CloseGuardDialog } from "../common/CloseGuardDialog";
import {
  createExpense,
  uploadExpensePhoto,
  getExpenseCategories,
  parseBackendError,
  type Expense,
  type ExpenseCategoryKind,
} from "../../api/expenses";
import { getDjangoEmployees, type DjangoEmployeeListItem } from "../../api/staff";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return dayjs().format("YYYY-MM-DD");
}

function formatKGS(value: number): string {
  return (
    value.toLocaleString("ru-KG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " с"
  );
}

const KIND_NEEDS_EMPLOYEE: ExpenseCategoryKind[] = ["advance", "salary"];

// ── Props ─────────────────────────────────────────────────────────────────────

export type DjangoAddExpenseDrawerProps = {
  open: boolean;
  onClose: () => void;
  organizationId?: number;
  branchId?: number;
  onCreated: (exp: Expense) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export const DjangoAddExpenseDrawer: React.FC<DjangoAddExpenseDrawerProps> = ({
  open,
  onClose,
  organizationId,
  branchId,
  onCreated,
}) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  // Form state
  const [expenseDate, setExpenseDate] = React.useState<Dayjs | null>(dayjs());
  const [categoryId, setCategoryId] = React.useState<number | "">("");
  const [name, setName] = React.useState("");
  const [cashAmount, setCashAmount] = React.useState("");
  const [cardAmount, setCardAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  // Employee autocomplete
  const [employeeInput, setEmployeeInput] = React.useState("");
  const [employeeValue, setEmployeeValue] = React.useState<DjangoEmployeeListItem | null>(null);
  const [employeeOptions, setEmployeeOptions] = React.useState<DjangoEmployeeListItem[]>([]);
  const [empLoading, setEmpLoading] = React.useState(false);

  // Submission state
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const photoInputRef = React.useRef<HTMLInputElement>(null);

  // ── Categories ────────────────────────────────────────────────────────────────
  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.expenses.categories(organizationId ?? null),
    queryFn: ({ signal }) => getExpenseCategories(organizationId, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const activeCategories = (categoriesQuery.data ?? []).filter((c) => c.isActive);

  const selectedCategory = activeCategories.find((c) => c.id === categoryId) ?? null;
  const needsEmployee =
    selectedCategory != null && KIND_NEEDS_EMPLOYEE.includes(selectedCategory.kind);

  // ── Dirty check ───────────────────────────────────────────────────────────────
  const isDirty = Boolean(
    name || cashAmount || cardAmount || description || photoFile || categoryId || employeeValue,
  );

  const { guardedClose, confirmOpen, confirmClose, cancelClose } = useCloseGuard({
    isDirty,
    isOpen: open,
    onClose,
  });

  // ── Reset on open ─────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (open) {
      setExpenseDate(dayjs());
      setCategoryId("");
      setName("");
      setCashAmount("");
      setCardAmount("");
      setDescription("");
      setPhotoFile(null);
      setPhotoPreview(null);
      setEmployeeInput("");
      setEmployeeValue(null);
      setEmployeeOptions([]);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  // ── Employee search with debounce ─────────────────────────────────────────────
  React.useEffect(() => {
    if (!needsEmployee) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setEmpLoading(true);
      getDjangoEmployees(
        { search: employeeInput || undefined, status: "active", pageSize: 20 },
        controller.signal,
      )
        .then((res) => setEmployeeOptions(res.results))
        .catch(() => {
          // AbortError — ignore
        })
        .finally(() => setEmpLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [employeeInput, needsEmployee]);

  // ── Photo pick ────────────────────────────────────────────────────────────────
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Фото не должно превышать 5 МБ");
      return;
    }
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) { setError("Название обязательно"); return; }
    if (!categoryId) { setError("Выберите категорию"); return; }
    const cash = parseFloat(cashAmount.replace(",", ".")) || 0;
    const card = parseFloat(cardAmount.replace(",", ".")) || 0;
    if (cash <= 0 && card <= 0) {
      setError("Укажите хотя бы одну ненулевую сумму (наличные или карта)");
      return;
    }
    if (needsEmployee && !employeeValue) {
      setError("Выберите сотрудника для данной категории");
      return;
    }
    if (!expenseDate || !expenseDate.isValid()) {
      setError("Укажите корректную дату");
      return;
    }

    setBusy(true);
    try {
      const created = await createExpense({
        organizationId,
        branchId,
        categoryId: categoryId as number,
        name: trimmedName,
        cashAmount: cash > 0 ? cash.toFixed(2) : undefined,
        cardAmount: card > 0 ? card.toFixed(2) : undefined,
        expenseDate: expenseDate.format("YYYY-MM-DD"),
        description: description.trim() || undefined,
        employeeId: employeeValue?.id ?? null,
      });

      if (photoFile) {
        try {
          const withPhoto = await uploadExpensePhoto(created.id, photoFile);
          onCreated(withPhoto);
        } catch {
          onCreated(created);
          onClose();
          enqueueSnackbar(
            "Расход создан, но фото не загрузилось. Его можно прикрепить из карточки расхода",
            { variant: "warning", persist: true },
          );
          return;
        }
      } else {
        onCreated(created);
      }
      onClose();
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

  const cashVal = parseFloat(cashAmount.replace(",", ".")) || 0;
  const cardVal = parseFloat(cardAmount.replace(",", ".")) || 0;
  const total = cashVal + cardVal;
  const canSubmit = Boolean(
    name.trim() && categoryId && (cashVal > 0 || cardVal > 0) && (!needsEmployee || employeeValue),
  );

  const drawerContent = (
    <>
      {/* Шапка */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          Добавить расход
        </Typography>
        <IconButton onClick={busy ? undefined : guardedClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Box>
      <Divider />

      {/* Форма */}
      <Box
        sx={{
          p: 2.5,
          flex: 1,
          overflowY: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <Stack spacing={2.5}>
          {/* Фото */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Фото
            </Typography>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={handlePhotoChange}
            />
            {photoPreview ? (
              <Box sx={{ position: "relative", width: "100%", height: 160, borderRadius: 1.5, overflow: "hidden", border: "1px solid", borderColor: "divider" }}>
                <Box
                  component="img"
                  src={photoPreview}
                  alt="preview"
                  sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <IconButton
                  size="small"
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  sx={{ position: "absolute", top: 6, right: 6, bgcolor: "background.paper", "&:hover": { bgcolor: "action.hover" } }}
                >
                  <CloseOutlined fontSize="small" />
                </IconButton>
              </Box>
            ) : (
              <Button
                variant="outlined"
                startIcon={<ImageOutlined />}
                onClick={() => photoInputRef.current?.click()}
                disabled={busy}
                fullWidth
                sx={{ height: 64, borderStyle: "dashed" }}
              >
                Прикрепить фото
              </Button>
            )}
          </Stack>

          {/* Дата */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Дата расхода
            </Typography>
            <CustomDatePicker
              value={expenseDate}
              onChange={(v) => setExpenseDate(v)}
              disabled={busy}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
          </Stack>

          {/* Название */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Название *
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Название расхода"
              value={name}
              onChange={(e) => { setError(null); setName(e.target.value); }}
              disabled={busy}
              inputProps={{ maxLength: 500 }}
            />
          </Stack>

          {/* Категория */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Категория *
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value === "" ? "" : Number(e.target.value));
                setEmployeeValue(null);
                setEmployeeInput("");
              }}
              SelectProps={{ displayEmpty: true }}
              disabled={busy || categoriesQuery.isLoading}
            >
              <MenuItem value="">
                <Typography variant="body2" color="text.secondary">
                  {categoriesQuery.isLoading ? "Загрузка..." : "Выберите категорию"}
                </Typography>
              </MenuItem>
              {activeCategories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* Сотрудник — только для advance/salary */}
          {needsEmployee && (
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Сотрудник *
              </Typography>
              <Autocomplete
                options={employeeOptions}
                loading={empLoading}
                value={employeeValue}
                inputValue={employeeInput}
                getOptionLabel={(o) => o.fullName}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                onChange={(_, v) => setEmployeeValue(v)}
                onInputChange={(_, v) => setEmployeeInput(v)}
                disabled={busy}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    placeholder="Введите имя сотрудника..."
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {empLoading && <CircularProgress size={14} />}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                noOptionsText="Сотрудники не найдены"
                loadingText="Поиск..."
              />
            </Stack>
          )}

          {/* Суммы наличные + карта */}
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Stack spacing={2}>
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  <AccountBalanceWalletOutlined sx={{ fontSize: 16, verticalAlign: "middle", mr: 0.5 }} />
                  Наличные
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  type="number"
                  value={cashAmount}
                  onChange={(e) => { setError(null); setCashAmount(e.target.value); }}
                  inputProps={{ min: 0, step: "any" }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">сом</InputAdornment>,
                  }}
                  disabled={busy}
                  placeholder="0.00"
                />
              </Stack>

              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  <CreditCardOutlined sx={{ fontSize: 16, verticalAlign: "middle", mr: 0.5 }} />
                  Карта
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  type="number"
                  value={cardAmount}
                  onChange={(e) => { setError(null); setCardAmount(e.target.value); }}
                  inputProps={{ min: 0, step: "any" }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">сом</InputAdornment>,
                  }}
                  disabled={busy}
                  placeholder="0.00"
                />
              </Stack>

              {total > 0 && (
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">
                    ИТОГО
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={700} color="primary.main">
                    {formatKGS(total)}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </Paper>

          {/* Комментарий */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Комментарий
            </Typography>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={3}
              placeholder="Необязательный комментарий"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              inputProps={{ maxLength: 1000 }}
            />
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </Box>

      {/* Фиксированный футер */}
      <Divider />
      <Box sx={{ px: 2.5, py: 1.5, flexShrink: 0 }}>
        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={guardedClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={busy || !canSubmit}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </Button>
        </Stack>
      </Box>
    </>
  );

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={busy ? undefined : guardedClose}
        PaperProps={{
          sx: {
            width: { xs: 320, sm: 480, md: 520 },
            maxWidth: "100vw",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <CloseGuardDialog
        open={confirmOpen}
        title="добавление расхода"
        onConfirm={confirmClose}
        onCancel={cancelClose}
      />
    </>
  );
};

export default DjangoAddExpenseDrawer;
