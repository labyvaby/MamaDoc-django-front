import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useCan } from "../../hooks/useCan";
import { SettingsLayout } from "./SettingsLayout";
import {
  getExpenseCategoriesPage,
  createExpenseCategory,
  updateExpenseCategory,
  parseBackendError,
  type ExpenseCategory,
  type ExpenseCategoryKind,
  type ExpenseCategoriesResponse,
} from "../../api/expenses";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";

// ── AddCategoryDialog ──────────────────────────────────────────────────────────

type AddDialogProps = {
  open: boolean;
  onClose: () => void;
  organizationId?: number;
  onCreated: () => void;
};

const KIND_KEYS: ExpenseCategoryKind[] = ["general", "advance", "salary"];

const AddCategoryDialog: React.FC<AddDialogProps> = ({ open, onClose, organizationId, onCreated }) => {
  const { t } = useT("settings");
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<ExpenseCategoryKind>("general");
  // Чек по умолчанию нужен обычным расходам; у аванса/ЗП его обычно не бывает,
  // поэтому смена вида переставляет галку — а дальше решает человек.
  const [photoRequired, setPhotoRequired] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) { setName(""); setKind("general"); setPhotoRequired(true); setError(null); setBusy(false); }
  }, [open]);

  const handleKindChange = (next: ExpenseCategoryKind) => {
    setKind(next);
    setPhotoRequired(next === "general");
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) { setError(t("expenseCategories.dialog.nameTooShort")); return; }
    setBusy(true);
    setError(null);
    try {
      await createExpenseCategory({ name: trimmed, kind, organizationId, isActive: true, photoRequired });
      onCreated();
      onClose();
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !busy) handleSubmit();
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("expenseCategories.dialog.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t("expenseCategories.dialog.nameLabel")}
            size="small"
            fullWidth
            autoFocus
            value={name}
            onChange={(e) => { setError(null); setName(e.target.value); }}
            onKeyDown={handleKeyDown}
            disabled={busy}
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            select
            label={t("expenseCategories.dialog.kindLabel")}
            size="small"
            fullWidth
            value={kind}
            onChange={(e) => handleKindChange(e.target.value as ExpenseCategoryKind)}
            disabled={busy}
          >
            {KIND_KEYS.map((key) => (
              <MenuItem key={key} value={key}>
                <Stack>
                  <Typography variant="body2">{t(`expenseCategories.kindOptions.${key}.label`)}</Typography>
                  <Typography variant="caption" color="text.secondary">{t(`expenseCategories.kindOptions.${key}.description`)}</Typography>
                </Stack>
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Checkbox
                checked={photoRequired}
                onChange={(e) => setPhotoRequired(e.target.checked)}
                disabled={busy}
              />
            }
            label={
              <Stack>
                <Typography variant="body2">{t("expenseCategories.photoRequired.label")}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("expenseCategories.photoRequired.description")}
                </Typography>
              </Stack>
            }
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{t("common:actions.cancel")}</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy || name.trim().length < 2}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? t("common:state.saving") : t("common:actions.add")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Главный компонент ──────────────────────────────────────────────────────────

const ExpenseCategoriesSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("expenseCategories.title"));
  const { isSuperAdmin, activeOrganization, memberships, loading: permLoading } = usePermissions();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);

  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;
  const orgId = orgRequired ? (activeOrganization?.id ?? undefined) : undefined;

  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.expenses.categories(orgId ?? null),
    queryFn: ({ signal }) => getExpenseCategoriesPage({ organizationId: orgId, pageSize: 200 }, signal),
    enabled: !permLoading && !needsOrg,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ([403, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  const categories = categoriesQuery.data?.results ?? [];

  const handleCreated = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.expenses.categories(orgId ?? null) });
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.expenses.all });
  };

  // Переключатель «Фото чека» сохраняется сразу, без кнопки: одна категория —
  // одно действие. Пока запрос идёт, строка заблокирована; список расходов
  // после ответа перечитывается — метка «нет фото» по категории гаснет/появляется.
  const canManage = useCan(["finance.expense.manage", "finance.manage"]);
  const { open: notify } = useNotification();
  const [savingId, setSavingId] = React.useState<number | null>(null);
  const handlePhotoRequiredChange = async (category: ExpenseCategory, photoRequired: boolean) => {
    setSavingId(category.id);
    try {
      const updated = await updateExpenseCategory(category.id, { photoRequired });
      queryClient.setQueryData<ExpenseCategoriesResponse>(
        djangoQueryKeys.expenses.categories(orgId ?? null),
        (prev) =>
          prev && {
            ...prev,
            results: prev.results.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
          },
      );
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.expenses.all });
    } catch (e) {
      notify?.({ type: "error", message: t("expenseCategories.photoRequired.saveError"), description: parseBackendError(e) });
    } finally {
      setSavingId(null);
    }
  };


  return (
    <SettingsLayout>
      <Stack spacing={3}>
        {/* Заголовок + кнопка */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap">
          <Box>
            <Typography variant="h6" fontWeight={600}>
              {t("expenseCategories.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("expenseCategories.description")}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddOutlined />}
            onClick={() => setAddOpen(true)}
            disabled={needsOrg || permLoading}
          >
            {t("expenseCategories.addButton")}
          </Button>
        </Stack>

        {/* Требуется выбор организации */}
        {needsOrg && (
          <Alert severity="info">
            {t("expenseCategories.needsOrg")}
          </Alert>
        )}

        {/* Ошибка загрузки */}
        {categoriesQuery.error && !needsOrg && (
          <Alert severity="error">
            {parseBackendError(categoriesQuery.error)}
          </Alert>
        )}

        {/* Загрузка */}
        {categoriesQuery.isLoading && !needsOrg && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={24} />
          </Stack>
        )}

        {/* Пустое состояние */}
        {!categoriesQuery.isLoading && !needsOrg && categories.length === 0 && !categoriesQuery.error && (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography variant="body2" color="text.disabled">
              {t("expenseCategories.empty")}
            </Typography>
          </Box>
        )}

        {/* Таблица */}
        {categories.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t("expenseCategories.columns.name")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("expenseCategories.columns.kind")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Tooltip title={t("expenseCategories.photoRequired.description")} arrow>
                      <span>{t("expenseCategories.columns.photoRequired")}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("expenseCategories.columns.status")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id} hover>
                    <TableCell>{cat.name}</TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {t(`expenseCategories.kindShort.${cat.kind}`)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        title={
                          cat.photoRequired === false
                            ? t("expenseCategories.photoRequired.off")
                            : t("expenseCategories.photoRequired.on")
                        }
                        arrow
                      >
                        <span>
                          <Switch
                            size="small"
                            checked={cat.photoRequired !== false}
                            disabled={!canManage || savingId === cat.id}
                            onChange={(e) => void handlePhotoRequiredChange(cat, e.target.checked)}
                            inputProps={{ "aria-label": t("expenseCategories.columns.photoRequired") }}
                          />
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={cat.isActive ? t("expenseCategories.status.active") : t("expenseCategories.status.inactive")}
                        size="small"
                        color={cat.isActive ? "success" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>

      <AddCategoryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        organizationId={orgId}
        onCreated={handleCreated}
      />
    </SettingsLayout>
  );
};

export default ExpenseCategoriesSettingsPage;
