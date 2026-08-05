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
import { useFormValidation } from "../../hooks/useFormValidation";
import { ConfirmDialog } from "../../components/ui";
import {
  KNOWLEDGE_FOLDERS_FROM_BACKEND,
  createKnowledgeFolder,
  deleteKnowledgeFolder,
  getKnowledgeFolders,
  updateKnowledgeFolder,
  type KnowledgeFolder,
} from "../../api/knowledge";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

interface FoldersDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Управление папками базы знаний (knowledge.manage): создание, переименование,
 * порядок перетаскиванием, удаление. Раскладывают статьи по папкам не здесь, а
 * в самой ленте — перетаскиванием карточки на плитку.
 *
 * Удаление папки статьи не теряет: они возвращаются в корень (так же ведёт себя
 * удаление раздела).
 */
const FoldersDialog: React.FC<FoldersDialogProps> = ({ open, onClose }) => {
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.knowledge.all });

  const foldersQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.folders({ orgId: orgId ?? null }),
    queryFn: ({ signal }) => getKnowledgeFolders({ organizationId: orgId }, signal),
    enabled: open,
  });
  const folders = React.useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);

  const [newName, setNewName] = React.useState("");
  const [deleting, setDeleting] = React.useState<KnowledgeFolder | null>(null);
  /** Названия в правке: id → черновик, чтобы поле не дёргалось на каждый рефетч. */
  const [drafts, setDrafts] = React.useState<Record<number, string>>({});

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      createKnowledgeFolder(
        { name, position: (folders.at(-1)?.position ?? 0) + 1, isActive: true },
        orgId,
      ),
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
    onError: (e) =>
      notify?.({ type: "error", message: "Не удалось создать папку", description: errMsg(e, "") }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      updateKnowledgeFolder(id, { name }, orgId),
    onSuccess: () => invalidate(),
    onError: (e) =>
      notify?.({ type: "error", message: "Не удалось переименовать папку", description: errMsg(e, "") }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteKnowledgeFolder(id, orgId),
    onSuccess: () => {
      setDeleting(null);
      invalidate();
    },
    onError: (e) =>
      notify?.({ type: "error", message: "Не удалось удалить папку", description: errMsg(e, "") }),
  });

  // ── Порядок перетаскиванием (как в CategoriesDialog) ──────────────────────
  const [order, setOrder] = React.useState<number[]>([]);
  React.useEffect(() => {
    const next = (foldersQuery.data ?? []).map((f) => f.id);
    setOrder((prev) =>
      prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next,
    );
  }, [foldersQuery.data]);

  const orderedFolders = React.useMemo(
    () =>
      order
        .map((id) => folders.find((f) => f.id === id))
        .filter((f): f is KnowledgeFolder => Boolean(f)),
    [order, folders],
  );

  const reorderMutation = useMutation({
    // Последовательно: PATCH позиций не атомарен, параллельные запросы могли бы
    // перемешаться на бэке.
    mutationFn: async (items: { id: number; position: number }[]) => {
      for (const item of items) {
        await updateKnowledgeFolder(item.id, { position: item.position }, orgId);
      }
    },
    onSuccess: () => invalidate(),
    onError: (e) => {
      notify?.({ type: "error", message: "Не удалось сохранить порядок", description: errMsg(e, "") });
      invalidate();
    },
  });

  const commitOrder = () => {
    const changed = order
      .map((id, idx) => ({ id, position: idx + 1 }))
      .filter(({ id, position }) => folders.find((f) => f.id === id)?.position !== position);
    if (changed.length > 0) reorderMutation.mutate(changed);
  };

  const form = useFormValidation({
    newName: newName.trim() ? null : "Введите название папки",
  });

  const handleCreate = () => {
    if (!form.validate()) return;
    createMutation.mutate(newName.trim());
  };

  const commitRename = (folder: KnowledgeFolder) => {
    const draft = drafts[folder.id];
    if (draft === undefined) return;
    const name = draft.trim();
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[folder.id];
      return next;
    });
    if (!name || name === folder.name) return;
    renameMutation.mutate({ id: folder.id, name });
  };

  const busy =
    createMutation.isPending ||
    renameMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Папки базы знаний</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Папки — способ сложить статьи рядом; разделы и части статей остаются как
            были. Статьи раскладываются перетаскиванием карточки на папку в самой
            ленте. Порядок папок меняется перетаскиванием. При удалении папки статьи
            не теряются — вернутся в общий список.
          </Typography>

          {!KNOWLEDGE_FOLDERS_FROM_BACKEND && (
            <Alert severity="info">
              Папки пока сохраняются только в этом браузере: на сервере поля для них
              ещё нет (тикет бэкенду отправлен). Коллеги их не увидят.
            </Alert>
          )}

          <Stack direction="row" gap={1}>
            <TextField
              size="small"
              fullWidth
              placeholder="Название новой папки"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              {...form.field("newName")}
            />
            <Button
              variant="outlined"
              startIcon={createMutation.isPending ? <CircularProgress size={14} /> : <AddOutlined />}
              disabled={busy}
              onClick={handleCreate}
              sx={{ flexShrink: 0 }}
            >
              Добавить
            </Button>
          </Stack>

          {foldersQuery.isError && (
            <Alert severity="error">{errMsg(foldersQuery.error, "Не удалось загрузить папки")}</Alert>
          )}

          {foldersQuery.isLoading && (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={22} />
            </Stack>
          )}
          {!foldersQuery.isLoading && folders.length === 0 && (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
              Папок пока нет
            </Typography>
          )}
          {orderedFolders.length > 0 && (
            <Reorder.Group
              axis="y"
              values={order}
              onReorder={setOrder}
              style={{ listStyle: "none", padding: 0, margin: 0 }}
            >
              {orderedFolders.map((folder) => (
                <Reorder.Item
                  key={folder.id}
                  value={folder.id}
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
                    }}
                  >
                    <DragIndicatorOutlined
                      fontSize="small"
                      sx={{ color: "text.disabled", cursor: busy ? "default" : "grab" }}
                    />
                    <TextField
                      variant="standard"
                      size="small"
                      fullWidth
                      disabled={busy}
                      value={drafts[folder.id] ?? folder.name}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [folder.id]: e.target.value }))
                      }
                      onBlur={() => commitRename(folder)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      InputProps={{ disableUnderline: true }}
                      sx={{ "& .MuiInputBase-input": { fontSize: "0.875rem", fontWeight: 500 } }}
                    />
                    <Tooltip title="Удалить">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={busy}
                          onClick={() => setDeleting(folder)}
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
        title="Удалить папку?"
        message={`Папка «${deleting?.name ?? ""}» будет удалена; статьи из неё останутся в общем списке.`}
        confirmText="Удалить"
        variant="error"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </Dialog>
  );
};

export default FoldersDialog;
