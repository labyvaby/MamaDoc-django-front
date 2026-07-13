import React from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import ArrowUpwardOutlined from "@mui/icons-material/ArrowUpwardOutlined";
import ArrowDownwardOutlined from "@mui/icons-material/ArrowDownwardOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";

import { useApiOrgId } from "../../hooks/useApiOrgId";
import { djangoQueryKeys } from "../../api/queryKeys";
import { ConfirmDialog } from "../../components/ui";
import {
  createKnowledgeCategory,
  deleteKnowledgeCategory,
  getKnowledgeCategories,
  updateKnowledgeCategory,
  type KnowledgeCategory,
} from "../../api/knowledge";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

interface CategoriesDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Управление разделами базы знаний (knowledge.manage): создание, переключение
 * активности, порядок стрелками, удаление. Разделы общие для статей и видео.
 */
const CategoriesDialog: React.FC<CategoriesDialogProps> = ({ open, onClose }) => {
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.knowledge.all });

  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.categories({ includeInactive: true, orgId: orgId ?? null }),
    queryFn: ({ signal }) =>
      getKnowledgeCategories({ includeInactive: true, organizationId: orgId }, signal),
    enabled: open,
  });
  const categories = categoriesQuery.data ?? [];

  const [newName, setNewName] = React.useState("");
  const [deleting, setDeleting] = React.useState<KnowledgeCategory | null>(null);

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      createKnowledgeCategory(
        { name, position: (categories.at(-1)?.position ?? 0) + 1, isActive: true },
        orgId,
      ),
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
    onError: (e) =>
      notify?.({ type: "error", message: "Не удалось создать раздел", description: errMsg(e, "") }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<KnowledgeCategory> }) =>
      updateKnowledgeCategory(id, payload, orgId),
    onSuccess: () => invalidate(),
    onError: (e) =>
      notify?.({ type: "error", message: "Не удалось обновить раздел", description: errMsg(e, "") }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteKnowledgeCategory(id, orgId),
    onSuccess: () => {
      setDeleting(null);
      invalidate();
    },
    onError: (e) =>
      notify?.({ type: "error", message: "Не удалось удалить раздел", description: errMsg(e, "") }),
  });

  /** Меняет местами position с соседом (стрелки вверх/вниз). */
  const move = (index: number, delta: -1 | 1) => {
    const a = categories[index];
    const b = categories[index + delta];
    if (!a || !b) return;
    updateMutation.mutate({ id: a.id, payload: { position: b.position } });
    updateMutation.mutate({ id: b.id, payload: { position: a.position } });
  };

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Разделы базы знаний</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Разделы общие для статей и видеоуроков. Неактивные скрыты из фильтров,
            но материалы в них остаются доступны.
          </Typography>

          <Stack direction="row" gap={1}>
            <TextField
              size="small"
              fullWidth
              placeholder="Название нового раздела"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  e.preventDefault();
                  createMutation.mutate(newName.trim());
                }
              }}
            />
            <Button
              variant="outlined"
              startIcon={createMutation.isPending ? <CircularProgress size={14} /> : <AddOutlined />}
              disabled={busy || !newName.trim()}
              onClick={() => createMutation.mutate(newName.trim())}
              sx={{ flexShrink: 0 }}
            >
              Добавить
            </Button>
          </Stack>

          {categoriesQuery.isError && (
            <Alert severity="error">{errMsg(categoriesQuery.error, "Не удалось загрузить разделы")}</Alert>
          )}

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Название</TableCell>
                  <TableCell align="center">Активен</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {categoriesQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={22} />
                    </TableCell>
                  </TableRow>
                )}
                {!categoriesQuery.isLoading && categories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 3, color: "text.secondary" }}>
                      Разделов пока нет
                    </TableCell>
                  </TableRow>
                )}
                {categories.map((category, i) => (
                  <TableRow key={category.id} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{category.name}</TableCell>
                    <TableCell align="center">
                      <Switch
                        size="small"
                        checked={category.isActive}
                        disabled={busy}
                        onChange={() =>
                          updateMutation.mutate({
                            id: category.id,
                            payload: { isActive: !category.isActive },
                          })
                        }
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip title="Выше">
                        <span>
                          <IconButton size="small" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                            <ArrowUpwardOutlined fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Ниже">
                        <span>
                          <IconButton
                            size="small"
                            disabled={busy || i === categories.length - 1}
                            onClick={() => move(i, 1)}
                          >
                            <ArrowDownwardOutlined fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Удалить">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={busy}
                            onClick={() => setDeleting(category)}
                          >
                            <DeleteOutlined fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>

      <ConfirmDialog
        open={deleting !== null}
        title="Удалить раздел?"
        message={`Раздел «${deleting?.name ?? ""}» будет удалён; статьи и видео из него останутся без раздела.`}
        confirmText="Удалить"
        variant="error"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </Dialog>
  );
};

export default CategoriesDialog;
