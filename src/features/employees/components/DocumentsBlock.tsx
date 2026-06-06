import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Card,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Modal,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { AppButton } from "../../../components/ui";
import {
  getEmployeeDocuments,
  uploadEmployeeDocument,
  renameEmployeeDocument,
  deleteEmployeeDocument,
  type EmployeeDocumentItem,
} from "../../../api/staff";

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "jpg", "jpeg", "png", "doc", "docx", "xls", "xlsx",
]);
const MAX_SIZE_MB = 10;

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isImage(doc: EmployeeDocumentItem): boolean {
  const ext = getFileExt(doc.fileUrl);
  return ext === "jpg" || ext === "jpeg" || ext === "png";
}

export type DocumentsBlockProps = {
  employeeId: number;
  canView: boolean;
  canManage: boolean;
  disabled?: boolean;
};

const DocumentsBlock: React.FC<DocumentsBlockProps> = ({
  employeeId,
  canView,
  canManage,
  disabled,
}) => {
  const [docs, setDocs] = React.useState<EmployeeDocumentItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Rename dialog
  const [renameDoc, setRenameDoc] = React.useState<EmployeeDocumentItem | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renaming, setRenaming] = React.useState(false);

  // Image preview
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const inputId = `doc-upload-${employeeId}`;

  React.useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    setLoading(true);
    getEmployeeDocuments(employeeId)
      .then((list) => {
        if (!cancelled) setDocs(list);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить документы");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, canView]);

  if (!canView) return null;

  const handleUpload = async (file: File) => {
    const ext = getFileExt(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      setError(`Недопустимый тип файла. Разрешены: ${[...ALLOWED_EXTENSIONS].join(", ")}`);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Файл слишком большой. Максимум ${MAX_SIZE_MB} МБ`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const title = file.name.replace(/\.[^.]+$/, "");
      const created = await uploadEmployeeDocument(employeeId, file, title);
      setDocs((prev) => [created, ...prev]);
    } catch {
      setError("Не удалось загрузить файл");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      await deleteEmployeeDocument(employeeId, id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch {
      setError("Не удалось удалить документ");
    } finally {
      setDeletingId(null);
    }
  };

  const openRename = (doc: EmployeeDocumentItem) => {
    setRenameDoc(doc);
    setRenameValue(doc.title);
  };

  const handleRename = async () => {
    if (!renameDoc || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const updated = await renameEmployeeDocument(employeeId, renameDoc.id, renameValue.trim());
      setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setRenameDoc(null);
    } catch {
      setError("Не удалось переименовать документ");
    } finally {
      setRenaming(false);
    }
  };

  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
        Документы
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ py: 0 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <CircularProgress size={20} />
      ) : (
        <Grid container spacing={1}>
          {docs.map((doc) => (
            <Grid item key={doc.id}>
              <Card
                variant="outlined"
                sx={{ position: "relative", width: 80, height: 80 }}
              >
                {isImage(doc) ? (
                  <Avatar
                    variant="rounded"
                    src={doc.fileUrl}
                    sx={{ width: "100%", height: "100%", cursor: "pointer" }}
                    onClick={() => setPreviewUrl(doc.fileUrl)}
                  />
                ) : (
                  <Box
                    component="a"
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      height: "100%",
                      textDecoration: "none",
                      color: "text.secondary",
                      px: 0.5,
                    }}
                  >
                    <DescriptionOutlined fontSize="small" />
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 9,
                        textAlign: "center",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        width: "100%",
                        display: "block",
                        px: 0.5,
                      }}
                    >
                      {doc.title}
                    </Typography>
                  </Box>
                )}

                {canManage && (
                  <>
                    <Tooltip title="Переименовать">
                      <IconButton
                        size="small"
                        onClick={() => openRename(doc)}
                        disabled={disabled || deletingId === doc.id}
                        sx={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          bgcolor: "rgba(255,255,255,0.7)",
                          p: 0.25,
                          "&:hover": { bgcolor: "rgba(255,255,255,0.9)" },
                        }}
                      >
                        <EditOutlined sx={{ fontSize: 12 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Удалить">
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(doc.id)}
                        disabled={disabled || deletingId === doc.id}
                        sx={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          bgcolor: "rgba(255,255,255,0.7)",
                          p: 0.25,
                          "&:hover": { bgcolor: "rgba(255,255,255,0.9)" },
                        }}
                      >
                        {deletingId === doc.id ? (
                          <CircularProgress size={12} />
                        ) : (
                          <DeleteOutline sx={{ fontSize: 12 }} color="error" />
                        )}
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Card>
            </Grid>
          ))}

          {canManage && (
            <Grid item>
              <Card
                variant="outlined"
                sx={{
                  width: 80,
                  height: 80,
                  borderStyle: "dashed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: disabled || uploading ? "not-allowed" : "pointer",
                  opacity: disabled || uploading ? 0.5 : 1,
                }}
                onClick={() => {
                  if (disabled || uploading) return;
                  const el = document.getElementById(inputId) as HTMLInputElement | null;
                  el?.click();
                }}
              >
                {uploading ? (
                  <CircularProgress size={20} />
                ) : (
                  <PhotoCameraOutlined color="action" />
                )}
                <input
                  id={inputId}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      <Typography variant="caption" color="text.secondary">
        {canManage
          ? "Фото, PDF, Word, Excel — до 10 МБ"
          : "Просмотр документов"}
      </Typography>

      {/* Image preview modal */}
      <Modal open={!!previewUrl} onClose={() => setPreviewUrl(null)}>
        <Box
          onClick={() => setPreviewUrl(null)}
          sx={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(0,0,0,0.85)",
            zIndex: 1300,
          }}
        >
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              setPreviewUrl(null);
            }}
            sx={{
              position: "absolute",
              top: 20,
              right: 20,
              color: "white",
              bgcolor: "rgba(255,255,255,0.1)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.2)" },
            }}
          >
            <CloseOutlined />
          </IconButton>
          {previewUrl && (
            <Box
              component="img"
              src={previewUrl}
              onClick={(e) => e.stopPropagation()}
              sx={{
                width: "70vw",
                height: "70vh",
                objectFit: "contain",
                borderRadius: 2,
                boxShadow: 24,
              }}
            />
          )}
        </Box>
      </Modal>

      {/* Rename dialog */}
      <Dialog
        open={!!renameDoc}
        onClose={() => !renaming && setRenameDoc(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Переименовать документ</DialogTitle>
        <DialogContent>
          <TextField
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            fullWidth
            autoFocus
            placeholder="Название документа"
            disabled={renaming}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <AppButton onClick={() => setRenameDoc(null)} disabled={renaming}>
            Отмена
          </AppButton>
          <AppButton
            variant="contained"
            onClick={handleRename}
            disabled={renaming || !renameValue.trim()}
          >
            {renaming ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={16} />
                <span>Сохранение…</span>
              </Stack>
            ) : (
              "Сохранить"
            )}
          </AppButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default DocumentsBlock;
