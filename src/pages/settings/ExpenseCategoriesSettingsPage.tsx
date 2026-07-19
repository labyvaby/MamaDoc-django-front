import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";
import {
  getExpenseCategoriesPage,
  createExpenseCategory,
  parseBackendError,
  type ExpenseCategoryKind,
} from "../../api/expenses";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";

// ── AddCategoryDialog ──────────────────────────────────────────────────────────

type AddDialogProps = {
  open: boolean;
  onClose: () => void;
  organizationId?: number;
  onCreated: () => void;
};

const KIND_OPTIONS: { value: ExpenseCategoryKind; label: string; description: string }[] = [
  { value: "general", label: "Обычная", description: "Общий расход организации" },
  { value: "advance", label: "Аванс сотруднику", description: "Привязывается к месяцу расхода" },
  { value: "salary", label: "Заработная плата", description: "Привязывается к предыдущему месяцу" },
];

const AddCategoryDialog: React.FC<AddDialogProps> = ({ open, onClose, organizationId, onCreated }) => {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<ExpenseCategoryKind>("general");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) { setName(""); setKind("general"); setError(null); setBusy(false); }
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) { setError("Название должно содержать минимум 2 символа"); return; }
    setBusy(true);
    setError(null);
    try {
      await createExpenseCategory({ name: trimmed, kind, organizationId, isActive: true });
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
      <DialogTitle>Добавить категорию</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Название категории *"
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
            label="Тип категории"
            size="small"
            fullWidth
            value={kind}
            onChange={(e) => setKind(e.target.value as ExpenseCategoryKind)}
            disabled={busy}
          >
            {KIND_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                <Stack>
                  <Typography variant="body2">{opt.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{opt.description}</Typography>
                </Stack>
              </MenuItem>
            ))}
          </TextField>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Отмена</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy || name.trim().length < 2}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? "Сохранение…" : "Добавить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Главный компонент ──────────────────────────────────────────────────────────

const ExpenseCategoriesSettingsPage: React.FC = () => {
  usePageTitle("Категории расходов");
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

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        {/* Заголовок + кнопка */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap">
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Категории расходов
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Категории используются при создании расходов.
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddOutlined />}
            onClick={() => setAddOpen(true)}
            disabled={needsOrg || permLoading}
          >
            Добавить категорию
          </Button>
        </Stack>

        {/* Требуется выбор организации */}
        {needsOrg && (
          <Alert severity="info">
            Выберите организацию в контексте, чтобы управлять категориями расходов.
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
              Категорий пока нет
            </Typography>
          </Box>
        )}

        {/* Таблица */}
        {categories.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Название</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Тип</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Статус</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id} hover>
                    <TableCell>{cat.name}</TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {cat.kind === "general" ? "Обычная" : cat.kind === "advance" ? "Аванс" : "Зарплата"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={cat.isActive ? "Активна" : "Неактивна"}
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
