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
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/ru";
import { useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { CustomDatePicker, AppBottomSheet } from "../ui";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../../utility/formDraft";
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
import { useFormValidation } from "../../hooks/useFormValidation";

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

// ── Черновик формы (localStorage) ───────────────────────────────────────────
// Защита от случайной потери введённых данных при закрытии дровера (крестик,
// клик по фону, Esc). Форма только создания — ключ общий (не зависит от id).
// Фото не сохраняем (File не сериализуется).

const ADD_DRAFT_KEY = "mamadoc:expenses:add-draft";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type ExpenseDraftValues = {
  expenseDate: string | null;
  categoryId: number | "";
  name: string;
  cashAmount: string;
  cardAmount: string;
  description: string;
  employeeId: number | null;
  employeeFullName: string | null;
};

type ExpenseDraft = ExpenseDraftValues & { savedAt: number };

function isDraftEmpty(d: ExpenseDraftValues): boolean {
  return (
    !d.name.trim() &&
    !d.cashAmount.trim() &&
    !d.cardAmount.trim() &&
    !d.description.trim() &&
    !d.categoryId &&
    !d.employeeId
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export type DjangoAddExpenseDrawerProps = {
  open: boolean;
  onClose: () => void;
  organizationId?: number;
  branchId?: number;
  onCreated: (exp: Expense) => void;
  /**
   * Optional initial values applied when the drawer opens (e.g. paying out a
   * salary from the payroll report). The user can still edit everything before
   * saving. `categoryKind` selects the first active category of that kind.
   */
  prefill?: {
    employee?: { id: number; fullName: string };
    categoryKind?: ExpenseCategoryKind;
    cashAmount?: string;
    cardAmount?: string;
    name?: string;
  };
};

// ── Component ─────────────────────────────────────────────────────────────────

export const DjangoAddExpenseDrawer: React.FC<DjangoAddExpenseDrawerProps> = ({
  open,
  onClose,
  organizationId,
  branchId,
  onCreated,
  prefill,
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

  // ── Черновик формы ────────────────────────────────────────────────────────────
  const [draftRestored, setDraftRestored] = React.useState(false);

  // ── Reset / восстановление черновика на открытии ─────────────────────────────
  const prefillCategoryAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (open) {
      const draft = readFormDraft<ExpenseDraft>(ADD_DRAFT_KEY, DRAFT_TTL_MS);
      if (draft) {
        setExpenseDate(draft.expenseDate ? dayjs(draft.expenseDate) : dayjs());
        setCategoryId(draft.categoryId);
        setName(draft.name);
        setCashAmount(draft.cashAmount);
        setCardAmount(draft.cardAmount);
        setDescription(draft.description);
        setEmployeeInput(draft.employeeFullName ?? "");
        const emp =
          draft.employeeId != null
            ? ({ id: draft.employeeId, fullName: draft.employeeFullName ?? "" } as DjangoEmployeeListItem)
            : null;
        setEmployeeValue(emp);
        setEmployeeOptions(emp ? [emp] : []);
        setDraftRestored(true);
        // Категория уже восстановлена из черновика — не даём эффекту префилла
        // категории (ниже) перетереть её после загрузки списка категорий.
        prefillCategoryAppliedRef.current = true;
      } else {
        setExpenseDate(dayjs());
        setCategoryId("");
        setName(prefill?.name ?? "");
        setCashAmount(prefill?.cashAmount ?? "");
        setCardAmount(prefill?.cardAmount ?? "");
        setDescription("");
        setEmployeeInput("");
        const emp = prefill?.employee
          ? ({ id: prefill.employee.id, fullName: prefill.employee.fullName } as DjangoEmployeeListItem)
          : null;
        setEmployeeValue(emp);
        setEmployeeOptions(emp ? [emp] : []);
        setDraftRestored(false);
        prefillCategoryAppliedRef.current = false;
      }
      setPhotoFile(null);
      setPhotoPreview(null);
      setError(null);
      setBusy(false);
    }
    // Read `prefill` from closure at open time — don't reset the form mid-edit
    // if the parent re-creates the prefill object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // flushDraftRef всегда указывает на актуальный снэпшот полей — нужен, чтобы
  // при закрытии до истечения debounce (быстрый ввод + сразу закрыть) успеть
  // синхронно записать черновик, а не потерять его вместе с отменённым таймером.
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    const snapshot: ExpenseDraftValues = {
      expenseDate: expenseDate && expenseDate.isValid() ? expenseDate.toISOString() : null,
      categoryId,
      name,
      cashAmount,
      cardAmount,
      description,
      employeeId: employeeValue?.id ?? null,
      employeeFullName: employeeValue?.fullName ?? null,
    };
    if (isDraftEmpty(snapshot)) {
      clearFormDraft(ADD_DRAFT_KEY);
    } else {
      writeFormDraft(ADD_DRAFT_KEY, snapshot);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => flushDraftRef.current(), 400);
    return () => clearTimeout(id);
  }, [open, expenseDate, categoryId, name, cashAmount, cardAmount, description, employeeValue]);

  const handleClose = () => {
    flushDraftRef.current();
    onClose();
  };

  const handleDiscardDraft = () => {
    clearFormDraft(ADD_DRAFT_KEY);
    setExpenseDate(dayjs());
    setCategoryId("");
    setName(prefill?.name ?? "");
    setCashAmount(prefill?.cashAmount ?? "");
    setCardAmount(prefill?.cardAmount ?? "");
    setDescription("");
    setEmployeeInput("");
    const emp = prefill?.employee
      ? ({ id: prefill.employee.id, fullName: prefill.employee.fullName } as DjangoEmployeeListItem)
      : null;
    setEmployeeValue(emp);
    setEmployeeOptions(emp ? [emp] : []);
    setDraftRestored(false);
  };

  // Prefill the category once the categories list has loaded (async).
  React.useEffect(() => {
    if (!open || prefillCategoryAppliedRef.current) return;
    if (!prefill?.categoryKind || categoriesQuery.isLoading) return;
    const match = activeCategories.find((c) => c.kind === prefill.categoryKind);
    if (match) {
      setCategoryId(match.id);
      prefillCategoryAppliedRef.current = true;
    }
  }, [open, prefill?.categoryKind, categoriesQuery.isLoading, activeCategories]);

  // ── Employee search with debounce ─────────────────────────────────────────────
  React.useEffect(() => {
    if (!needsEmployee) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setEmpLoading(true);
      getDjangoEmployees(
        {
          search: employeeInput || undefined,
          status: "active",
          pageSize: 20,
          organizationId: organizationId ?? undefined,
        },
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
  }, [employeeInput, needsEmployee, organizationId]);

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
    if (!form.validate()) return;
    const trimmedName = name.trim();
    const cash = parseFloat(cashAmount.replace(",", ".")) || 0;
    const card = parseFloat(cardAmount.replace(",", ".")) || 0;

    setBusy(true);
    try {
      const created = await createExpense({
        organizationId,
        branchId,
        categoryId: categoryId as number,
        name: trimmedName,
        cashAmount: cash > 0 ? cash.toFixed(2) : undefined,
        cardAmount: card > 0 ? card.toFixed(2) : undefined,
        // Непустая корректная дата гарантирована form.validate() выше.
        expenseDate: expenseDate!.format("YYYY-MM-DD"),
        description: description.trim() || undefined,
        employeeId: employeeValue?.id ?? null,
      });

      clearFormDraft(ADD_DRAFT_KEY);

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
  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const form = useFormValidation({
    expenseDate:
      expenseDate && expenseDate.isValid() ? null : "Укажите корректную дату",
    name: name.trim() ? null : "Введите название расхода",
    categoryId: categoryId ? null : "Выберите категорию",
    employee: !needsEmployee || employeeValue ? null : "Выберите сотрудника для этой категории",
    cashAmount:
      cashVal > 0 || cardVal > 0
        ? null
        : "Укажите сумму — наличными или картой",
  });

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
        <Stack direction="row" alignItems="center" gap={0.5}>
          {draftRestored && (
            <Tooltip title="Восстановлен черновик — очистить?">
              <IconButton onClick={handleDiscardDraft} aria-label="Очистить черновик">
                <RestoreOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={busy ? undefined : handleClose} aria-label="Закрыть" edge="end">
            <CloseOutlined />
          </IconButton>
        </Stack>
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
              <Box sx={{ position: "relative", width: "100%", height: 160, borderRadius: "10px", overflow: "hidden", border: "1px solid", borderColor: "divider" }}>
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
              slotProps={{
                textField: {
                  size: "small",
                  fullWidth: true,
                  error: Boolean(form.errorOf("expenseDate")),
                  helperText: form.errorOf("expenseDate") ?? undefined,
                  ref: form.anchor("expenseDate"),
                },
              }}
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
              {...form.field("name")}
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
              {...form.field("categoryId")}
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

          {/* Подсказка зачёта месяца: аванс идёт в зарплату месяца расхода,
              ЗП — в предыдущий месяц (зарплату за июнь платят в июле).
              Формула зашита на бэке (Expense.affects_month). */}
          {selectedCategory &&
            (selectedCategory.kind === "advance" || selectedCategory.kind === "salary") &&
            expenseDate?.isValid() && (
              <Alert
                severity="info"
                icon={<EventAvailableOutlined fontSize="small" />}
                sx={{ py: 0.5 }}
              >
                {selectedCategory.kind === "advance" ? (
                  <>
                    Аванс зачтётся в зарплату за{" "}
                    <b>{expenseDate.locale("ru").format("MMMM YYYY")}</b>{" "}
                    (месяц даты расхода).
                  </>
                ) : (
                  <>
                    Зарплата зачтётся за{" "}
                    <b>
                      {expenseDate.subtract(1, "month").locale("ru").format("MMMM YYYY")}
                    </b>{" "}
                    (месяц, предшествующий дате расхода).
                  </>
                )}
              </Alert>
            )}

          {/* Сотрудник — только для advance/salary */}
          {needsEmployee && (
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Сотрудник *
              </Typography>
              <Autocomplete
                options={
                  employeeValue && !employeeOptions.some((o) => o.id === employeeValue.id)
                    ? [employeeValue, ...employeeOptions]
                    : employeeOptions
                }
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
                    {...form.field("employee")}
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
              borderRadius: "14px",
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
                  {...form.field("cashAmount")}
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
                  <Typography variant="subtitle1" fontWeight={700} color="primary.onSurface">
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
          <Button variant="outlined" onClick={handleClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </Button>
        </Stack>
      </Box>
    </>
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : handleClose}
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
  );
};

export default DjangoAddExpenseDrawer;
