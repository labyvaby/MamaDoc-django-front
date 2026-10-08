import React from "react";
import { Alert, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Skeleton, TextField, Tooltip, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import SlideshowOutlined from "@mui/icons-material/SlideshowOutlined";

import { getErrorFields } from "../../api/client";
import { downloadProtectedFile } from "../../api/protectedFile";
import { realEstateKeys } from "../../api/realestate";
import { realtyCatalogKeys, type UnitLayout } from "../../api/realtyCatalog";
import {
  LAYOUT_FILE_KINDS,
  PROJECT_FILE_KINDS,
  PROJECT_FILE_MAX_BYTES,
  deleteProjectFile,
  formatFileSize,
  getProjectFiles,
  isImageFile,
  realtyFileKeys,
  uploadProjectFile,
  type ProjectFile,
  type ProjectFileKind,
} from "../../api/realtyFiles";
import { ProtectedImage } from "../../components/realty/ProtectedImage";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";

const GALLERY_KINDS: readonly string[] = ["photo", "facade", "render", "plan"];
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/**
 * «Фото и документы» в карточке ЖК (`frontend-new-modules.md` §1): галерея
 * (фото, фасад, рендеры, планы), документы объекта и презентация. Смотреть и
 * скачивать — всем с `realty.view`, загружать и удалять — `realty.catalog.manage`.
 * Файлы защищены — показываем и качаем blob-ом через API-клиент.
 */
export function ProjectFilesSection({ projectId, canUpload, layouts }: { projectId: number; canUpload: boolean; layouts: UnitLayout[] }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [uploading, setUploading] = React.useState(false);
  const [viewing, setViewing] = React.useState<ProjectFile | null>(null);
  const [removing, setRemoving] = React.useState<ProjectFile | null>(null);
  const [downloading, setDownloading] = React.useState<number | null>(null);

  const list = useQuery({
    queryKey: realtyFileKeys.list(scope, projectId),
    queryFn: ({ signal }) => getProjectFiles(projectId, {}, scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: realtyFileKeys.list(scope, projectId) });
    // Обложка ЖК в каталоге и картинки квартир в шахматке берутся из тех же файлов.
    void queryClient.invalidateQueries({ queryKey: realtyCatalogKeys.all });
    void queryClient.invalidateQueries({ queryKey: realEstateKeys.all });
  };
  const remove = useMutation({
    mutationFn: (file: ProjectFile) => deleteProjectFile(projectId, file.id, scope),
    onSuccess: () => {
      setRemoving(null);
      setViewing(null);
      refresh();
      enqueueSnackbar(t("catalog.files.deleted"), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(errorText(error, t("common.failed")), { variant: "error" }),
  });
  const download = async (file: ProjectFile) => {
    setDownloading(file.id);
    try {
      await downloadProtectedFile(file.url, file.fileName || file.title, scope);
    } catch (error) {
      enqueueSnackbar(errorText(error, t("catalog.files.downloadFailed")), { variant: "error" });
    } finally {
      setDownloading(null);
    }
  };

  const files = list.data ?? [];
  // Фото → фасад → рендеры → планы: бэк отдаёт файлы в порядке загрузки.
  const gallery = files.filter((f) => GALLERY_KINDS.includes(f.kind) && isImageFile(f)).sort((a, b) => GALLERY_KINDS.indexOf(a.kind) - GALLERY_KINDS.indexOf(b.kind) || a.sortOrder - b.sortOrder);
  const docs = files.filter((f) => !gallery.includes(f)).sort((a, b) => Number(b.kind === "presentation") - Number(a.kind === "presentation"));

  return (
    <Box>
      <Box sx={{ mb: 0.75, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ flex: 1, fontWeight: 700, fontSize: "0.9rem" }}>{t("catalog.files.title")}</Typography>
        {canUpload && (
          <Button size="small" startIcon={<FileUploadOutlined />} onClick={() => setUploading(true)}>
            {t("catalog.files.upload")}
          </Button>
        )}
      </Box>
      {list.isError ? (
        <Alert severity="warning">{errorText(list.error, t("catalog.files.loadError"))}</Alert>
      ) : !list.data ? (
        <Skeleton variant="rounded" height={96} />
      ) : files.length === 0 ? (
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("catalog.files.empty")}</Typography>
      ) : (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {gallery.length > 0 && (
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))" }}>
              {gallery.map((file) => (
                <ButtonBase
                  key={file.id}
                  onClick={() => setViewing(file)}
                  aria-label={t("catalog.files.open", { title: file.title || file.fileName })}
                  sx={{ display: "block", borderRadius: "10px", overflow: "hidden", border: 1, borderColor: "divider", textAlign: "left" }}
                >
                  <ProtectedImage url={file.url} alt={file.title} fit={file.kind === "plan" ? "contain" : "cover"} sx={(th) => ({ height: 84, bgcolor: subtleBg(th, true) })} />
                  <Box sx={{ px: 0.75, py: 0.5 }}>
                    <Typography noWrap sx={{ fontSize: "0.72rem", fontWeight: 600 }}>
                      {file.title || file.fileName}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                      {[kindLabel(file, t), file.layoutCode].filter(Boolean).join(" · ")}
                    </Typography>
                  </Box>
                </ButtonBase>
              ))}
            </Box>
          )}
          {docs.length > 0 && (
            <Box>
              {docs.map((file) => (
                <Box key={file.id} sx={{ py: 0.75, display: "flex", alignItems: "center", gap: 1, borderTop: 1, borderColor: "divider" }}>
                  {file.kind === "presentation" ? <SlideshowOutlined fontSize="small" sx={{ color: "primary.main" }} /> : <DescriptionOutlined fontSize="small" sx={{ color: "text.secondary" }} />}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, overflowWrap: "anywhere" }}>{file.title || file.fileName}</Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{[kindLabel(file, t), file.note, file.fileSize ? formatFileSize(file.fileSize) : ""].filter(Boolean).join(" · ")}</Typography>
                  </Box>
                  <Tooltip title={t("catalog.files.download")}>
                    <span>
                      <IconButton size="small" aria-label={`${t("catalog.files.download")}: ${file.title || file.fileName}`} disabled={downloading === file.id} onClick={() => void download(file)}>
                        <FileDownloadOutlined fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  {canUpload && (
                    <Tooltip title={t("catalog.files.delete")}>
                      <IconButton size="small" aria-label={`${t("catalog.files.delete")}: ${file.title || file.fileName}`} onClick={() => setRemoving(file)} sx={{ color: "error.main" }}>
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Просмотр картинки крупно. */}
      <Dialog open={viewing != null} onClose={() => setViewing(null)} fullWidth maxWidth={false} PaperProps={{ sx: { width: 880, maxWidth: "calc(100vw - 32px)" } }}>
        {viewing && (
          <>
            <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1.5 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>{viewing.title || viewing.fileName}</Typography>
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{[kindLabel(viewing, t), viewing.layoutCode, viewing.note].filter(Boolean).join(" · ")}</Typography>
              </Box>
              <IconButton aria-label={t("common.close")} onClick={() => setViewing(null)}>
                <CloseOutlined />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <ProtectedImage url={viewing.url} alt={viewing.title} fit="contain" sx={(th) => ({ height: { xs: 280, md: 520 }, borderRadius: "10px", bgcolor: subtleBg(th) })} />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              {canUpload && (
                <Button color="error" startIcon={<DeleteOutlineOutlined />} onClick={() => setRemoving(viewing)} sx={{ mr: "auto" }}>
                  {t("catalog.files.delete")}
                </Button>
              )}
              <Button startIcon={<FileDownloadOutlined />} disabled={downloading === viewing.id} onClick={() => void download(viewing)}>
                {t("catalog.files.download")}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog open={removing != null} onClose={remove.isPending ? undefined : () => setRemoving(null)} maxWidth={false} PaperProps={{ sx: { width: 420, maxWidth: "calc(100vw - 32px)" } }}>
        <DialogTitle>{t("catalog.files.deleteTitle")}</DialogTitle>
        <DialogContent>
          <Typography>{t("catalog.files.deleteText", { title: removing?.title || removing?.fileName || "" })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoving(null)} disabled={remove.isPending}>
            {t("common.cancel")}
          </Button>
          <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => removing && remove.mutate(removing)}>
            {t("catalog.files.delete")}
          </Button>
        </DialogActions>
      </Dialog>

      {canUpload && (
        <UploadDialog
          open={uploading}
          projectId={projectId}
          layouts={layouts}
          onClose={() => setUploading(false)}
          onUploaded={() => {
            setUploading(false);
            refresh();
            enqueueSnackbar(t("catalog.files.uploaded"), { variant: "success" });
          }}
        />
      )}
    </Box>
  );
}

type T = (key: string, options?: Record<string, unknown>) => string;
const kindLabel = (file: Pick<ProjectFile, "kind" | "kindLabel">, t: T) => file.kindLabel || t(`catalog.files.kinds.${file.kind}`, { defaultValue: file.kind });

const ACCEPT: Record<ProjectFileKind, string> = {
  photo: "image/*",
  facade: "image/*",
  render: "image/*",
  plan: "image/*,application/pdf",
  presentation: "application/pdf,.pdf,.ppt,.pptx",
  document: "application/pdf,.pdf,.doc,.docx,.xls,.xlsx,image/*",
};

function UploadDialog({ open, projectId, layouts, onClose, onUploaded }: { open: boolean; projectId: number; layouts: UnitLayout[]; onClose: () => void; onUploaded: () => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [kind, setKind] = React.useState<ProjectFileKind>("photo");
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const [layoutId, setLayoutId] = React.useState<number | "">("");
  const [touched, setTouched] = React.useState(false);

  const upload = useMutation({
    mutationFn: () => uploadProjectFile(projectId, { file: file as File, kind, title, note, layoutId: layoutId === "" ? null : layoutId }, scope),
    onSuccess: onUploaded,
  });

  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setKind("photo");
    setTitle("");
    setNote("");
    setLayoutId("");
    setTouched(false);
    upload.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  const tooBig = file != null && file.size > PROJECT_FILE_MAX_BYTES;
  // Ошибка бэка по полю файла (тип, пусто, размер, подделка) — под полем, остальное — общим текстом.
  const fields = upload.error ? getErrorFields(upload.error) : null;
  const fileError = !file && touched ? t("catalog.files.form.fileRequired") : tooBig ? t("catalog.files.form.tooBig") : (fields?.file ?? null);
  const otherError = upload.error && !fields?.file ? errorText(upload.error, t("common.failed")) : null;
  const withLayout = LAYOUT_FILE_KINDS.includes(kind);

  return (
    <Dialog open={open} onClose={upload.isPending ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 480 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("catalog.files.form.title")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <TextField select size="small" label={t("catalog.files.form.kind")} value={kind} onChange={(e) => setKind(e.target.value as ProjectFileKind)}>
          {PROJECT_FILE_KINDS.map((k) => (
            <MenuItem key={k} value={k}>
              {t(`catalog.files.kinds.${k}`)}
            </MenuItem>
          ))}
        </TextField>
        <Box>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept={ACCEPT[kind]}
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null;
              // Название из имени файла — пока его не правили руками.
              const prevAuto = file ? file.name.replace(/\.[^.]+$/, "") : "";
              setFile(next);
              if (next && (!title.trim() || title === prevAuto)) setTitle(next.name.replace(/\.[^.]+$/, ""));
              upload.reset();
              e.target.value = "";
            }}
          />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Button variant="outlined" startIcon={<FileUploadOutlined />} onClick={() => inputRef.current?.click()}>
              {file ? t("catalog.files.form.replace") : t("catalog.files.form.pick")}
            </Button>
            {file && (
              <Typography sx={{ fontSize: "0.8125rem", minWidth: 0, overflowWrap: "anywhere" }}>
                {file.name} · {formatFileSize(file.size)}
              </Typography>
            )}
          </Box>
          <Typography sx={{ mt: 0.5, fontSize: "0.75rem", color: fileError ? "error.main" : "text.secondary" }}>{fileError ?? t("catalog.files.form.fileHint")}</Typography>
        </Box>
        <TextField size="small" label={t("catalog.files.form.name")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField size="small" label={t("catalog.files.form.note")} value={note} onChange={(e) => setNote(e.target.value)} />
        {withLayout && (
          <TextField select size="small" label={t("catalog.files.form.layout")} value={layoutId} onChange={(e) => setLayoutId(e.target.value === "" ? "" : Number(e.target.value))} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} helperText={t("catalog.files.form.layoutHint")}>
            <MenuItem value="">{t("catalog.files.form.noLayout")}</MenuItem>
            {layouts.map((layout) => (
              <MenuItem key={layout.id} value={layout.id}>
                {[layout.code, layout.description].filter(Boolean).join(" · ")}
              </MenuItem>
            ))}
          </TextField>
        )}
        {otherError && <Alert severity="error">{otherError}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={upload.isPending}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={upload.isPending}
          onClick={() => {
            setTouched(true);
            if (!file || tooBig) return;
            upload.mutate();
          }}
        >
          {upload.isPending ? t("catalog.files.form.uploading") : t("catalog.files.upload")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
