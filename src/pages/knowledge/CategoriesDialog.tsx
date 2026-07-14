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
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import DragIndicatorOutlined from "@mui/icons-material/DragIndicatorOutlined";
import { Reorder } from "framer-motion";
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
  // Стабильная ссылка (а не `data ?? []` в каждом рендере) — от неё зависят
  // useMemo/useEffect ниже.
  const categories = React.useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

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

  // ── Drag&drop порядок ─────────────────────────────────────────────────────
  // Локальный порядок для перетаскивания; после дропа отправляется на сервер.
  // Зависимость — data запроса (стабильная ссылка), НЕ производный `categories`
  // (`?? []` даёт новый массив на каждый рендер → бесконечный setState-цикл);
  // при совпадении порядка возвращаем prev, чтобы не менять state впустую.
  const [order, setOrder] = React.useState<number[]>([]);
  React.useEffect(() => {
    const next = (categoriesQuery.data ?? []).map((c) => c.id);
    setOrder((prev) =>
      prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next,
    );
  }, [categoriesQuery.data]);

  const orderedCategories = React.useMemo(
    () =>
      order
        .map((id) => categories.find((c) => c.id === id))
        .filter((c): c is KnowledgeCategory => Boolean(c)),
    [order, categories],
  );

  const reorderMutation = useMutation({
    // Последовательно, а не параллельно: PATCH позиций не атомарен,
    // параллельные запросы могли бы перемешаться на бэке.
    mutationFn: async (items: { id: number; position: number }[]) => {
      for (const item of items) {
        await updateKnowledgeCategory(item.id, { position: item.position }, orgId);
      }
    },
    onSuccess: () => invalidate(),
    onError: (e) => {
      notify?.({ type: "error", message: "Не удалось сохранить порядок", description: errMsg(e, "") });
      // Часть PATCH могла успеть примениться — обновляем список в любом случае.
      invalidate();
    },
  });

  /** Отправляет новые позиции после завершения перетаскивания. */
  const commitOrder = () => {
    const changed = order
      .map((id, idx) => ({ id, position: idx + 1 }))
      .filter(({ id, position }) => categories.find((c) => c.id === id)?.position !== position);
    if (changed.length > 0) reorderMutation.mutate(changed);
  };

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Разделы базы знаний</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Разделы общие для статей и видеоуроков. Неактивные скрыты из фильтров,
            но материалы в них остаются доступны. Порядок меняется перетаскиванием.
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

          {categoriesQuery.isLoading && (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={22} />
            </Stack>
          )}
          {!categoriesQuery.isLoading && categories.length === 0 && (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
              Разделов пока нет
            </Typography>
          )}
          {orderedCategories.length > 0 && (
            <Reorder.Group
              axis="y"
              values={order}
              onReorder={setOrder}
              style={{ listStyle: "none", padding: 0, margin: 0 }}
            >
              {orderedCategories.map((category) => (
                <Reorder.Item
                  key={category.id}
                  value={category.id}
                  dragListener={!busy}
                  onDragEnd={commitOrder}
                  style={{ listStyle: "none" }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    gap={1}
                    sx={{
                      p: 1,
                      mb: 0.75,
                      borderRadius: "10px",
                      border: 1,
                      borderColor: "divider",
                      bgcolor: "background.paper",
                      cursor: busy ? "default" : "grab",
                      "&:active": { cursor: busy ? "default" : "grabbing" },
                    }}
                  >
                    <DragIndicatorOutlined fontSize="small" sx={{ color: "text.disabled" }} />
                    <Typography variant="body2" fontWeight={500} noWrap sx={{ flex: 1, minWidth: 0 }}>
                      {category.name}
                    </Typography>
                    <Tooltip title={category.isActive ? "Раздел активен" : "Раздел скрыт"}>
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
                  </Stack>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
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
