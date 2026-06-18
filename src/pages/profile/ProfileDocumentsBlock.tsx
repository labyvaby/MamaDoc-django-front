import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Card,
  CircularProgress,
  Grid,
  IconButton,
  Modal,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import {
  getProfileDocuments,
  uploadProfileDocument,
  deleteProfileDocument,
  type ProfileDocument,
} from "../../api/auth";
import { ApiError } from "../../api/client";

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "jpg", "jpeg", "png", "doc", "docx", "xls", "xlsx",
]);
const MAX_SIZE_MB = 10;

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isImage(doc: ProfileDocument): boolean {
  const ext = getFileExt(doc.fileUrl);
  return ext === "jpg" || ext === "jpeg" || ext === "png";
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.payload && typeof err.payload === "object" && "error" in err.payload) {
      const e = (err.payload as Record<string, unknown>).error;
      if (typeof e === "string") return e;
    }
    return err.message;
  }
  return fallback;
}

/**
 * Self-service documents block for the profile page. Any employee may view,
 * upload and delete their own documents (hits /auth/profile/documents/).
 */
const ProfileDocumentsBlock: React.FC = () => {
  const [docs, setDocs] = React.useState<ProfileDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const inputId = "profile-doc-upload";

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProfileDocuments()
      .then((res) => {
        if (!cancelled) setDocs(res.documents);
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
  }, []);

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
      const { document: created } = await uploadProfileDocument(file, title);
      setDocs((prev) => [created, ...prev]);
    } catch (err) {
      setError(extractErrorMessage(err, "Не удалось загрузить файл"));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      await deleteProfileDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(extractErrorMessage(err, "Не удалось удалить документ"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Stack spacing={1}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <CircularProgress size={20} />
      ) : (
        <Grid container spacing={1}>
          {docs.map((doc) => (
            <Grid item key={doc.id}>
              <Card variant="outlined" sx={{ position: "relative", width: 80, height: 80 }}>
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

                <Tooltip title="Удалить">
                  <IconButton
                    size="small"
                    onClick={() => handleDelete(doc.id)}
                    disabled={deletingId === doc.id}
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
              </Card>
            </Grid>
          ))}

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
                cursor: uploading ? "not-allowed" : "pointer",
                opacity: uploading ? 0.5 : 1,
              }}
              onClick={() => {
                if (uploading) return;
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
        </Grid>
      )}

      <Typography variant="caption" color="text.secondary">
        Фото, PDF, Word, Excel — до 10 МБ
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
    </Stack>
  );
};

export default ProfileDocumentsBlock;
