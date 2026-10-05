/**
 * CardAttachmentsPanel.tsx — «Файлы» в карточке пациента и клиента:
 * документы, сканы, фото.
 *
 * Панель сама грузит список (useCardAttachments) и встаёт вкладкой рядом с
 * историей, как PatientVaccinationsPanel. Добавить файлы можно кнопкой,
 * перетаскиванием на панель, вставкой из буфера (Ctrl+V) и, на телефоне,
 * снимком с камеры. Фото показываются сеткой превью с полноэкранным
 * просмотром, документы — списком: PDF открывается во вьювере, остальное
 * скачивается.
 *
 * Файлы читаются только через API (src/api/attachments.ts): доступ к ним
 * проверяется так же, как к самой карточке.
 */
import React from "react";
import {
  Box,
  ButtonBase,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloudUploadOutlined from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import DriveFileRenameOutlineOutlined from "@mui/icons-material/DriveFileRenameOutlineOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { useNotification } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";

import {
  AppButton,
  AppCard,
  ConfirmDialog,
  ListEmptyState,
  SegmentedTabs,
} from "../ui";
import {
  attachmentSrc,
  deleteCardAttachment,
  renameCardAttachment,
  uploadCardAttachment,
  type AttachmentOwner,
  type CardAttachment,
} from "../../api/attachments";
import { getErrorMessage } from "../../api/client";
import { subtleBg } from "../../theme/uiHelpers";
import ArticleLightbox from "../../pages/knowledge/ArticleLightbox";
import { ATTACHMENT_ACCEPT, ATTACHMENT_FORMATS_HINT, attachmentRejectReason } from "./attachmentFiles";
import { DocumentRow, PendingRow, PhotoTile } from "./AttachmentItems";
import { PdfPreviewDialog, RenameAttachmentDialog } from "./AttachmentDialogs";
import { cardAttachmentsKey, useCardAttachments } from "./useCardAttachments";

type Filter = "all" | "photos" | "documents";

type PendingUpload = {
  key: string;
  file: File;
  /** null — идёт загрузка; текст — она не удалась. */
  error: string | null;
};

type Props = {
  /** null — карточка не выбрана. */
  owner: AttachmentOwner | null;
  /** Добавлять, переименовывать и удалять (patients.update / clients.update). */
  canManage: boolean;
};

let pendingSeq = 0;
const nextPendingKey = () => {
  pendingSeq += 1;
  return `pending-${pendingSeq}`;
};

const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

const sectionTitleSx = { display: "block", mb: 1, fontWeight: 600 } as const;

const CardAttachmentsPanel: React.FC<Props> = ({ owner, canManage }) => {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("md"));
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const query = useCardAttachments(owner);

  const [filter, setFilter] = React.useState<Filter>("all");
  const [pending, setPending] = React.useState<PendingUpload[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const dragDepth = React.useRef(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const [viewerIndex, setViewerIndex] = React.useState<number | null>(null);
  const [pdfPreview, setPdfPreview] = React.useState<CardAttachment | null>(null);
  const [menu, setMenu] = React.useState<{ anchor: HTMLElement; attachment: CardAttachment } | null>(null);
  const [renaming, setRenaming] = React.useState<CardAttachment | null>(null);
  const [renameBusy, setRenameBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState<CardAttachment | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  // Другая карточка — с чистого листа: очередь и диалоги прежней ей чужие.
  const ownerKey = owner ? `${owner.kind}:${owner.id}` : "";
  React.useEffect(() => {
    setFilter("all");
    setPending([]);
    setViewerIndex(null);
    setPdfPreview(null);
    setMenu(null);
    setRenaming(null);
    setDeleting(null);
    dragDepth.current = 0;
    setDragging(false);
  }, [ownerKey]);

  const attachments = React.useMemo(() => query.data ?? [], [query.data]);
  const photos = React.useMemo(() => attachments.filter((item) => item.kind === "image"), [attachments]);
  const documents = React.useMemo(() => attachments.filter((item) => item.kind !== "image"), [attachments]);
  const showPhotos = filter !== "documents" && photos.length > 0;
  const showDocuments = filter !== "photos" && documents.length > 0;
  const bothKinds = photos.length > 0 && documents.length > 0;
  const canUpload = canManage && owner !== null;

  const updateCache = (target: AttachmentOwner, change: (rows: CardAttachment[]) => CardAttachment[]) => {
    queryClient.setQueryData<CardAttachment[]>(cardAttachmentsKey(target), (rows) => change(rows ?? []));
  };

  // По одному файлу за запрос и по очереди: один большой multipart упёрся бы
  // в лимит прокси, а очередь показывает каждому файлу свой итог.
  const upload = async (target: AttachmentOwner, items: PendingUpload[]) => {
    let added = 0;
    for (const item of items) {
      try {
        const saved = await uploadCardAttachment(target, item.file);
        updateCache(target, (rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
        setPending((rows) => rows.filter((row) => row.key !== item.key));
        added += 1;
      } catch (err) {
        const error = getErrorMessage(err, "Не удалось загрузить файл");
        setPending((rows) => rows.map((row) => (row.key === item.key ? { ...row, error } : row)));
      }
    }
    if (added > 0) {
      notify?.({ type: "success", message: added === 1 ? "Файл добавлен" : `Добавлено файлов: ${added}` });
    }
  };

  const addFiles = (files: File[]) => {
    if (!canUpload || !owner || files.length === 0) return;
    const rejected: string[] = [];
    const accepted: PendingUpload[] = [];
    for (const file of files) {
      const reason = attachmentRejectReason(file);
      if (reason) rejected.push(reason);
      else accepted.push({ key: nextPendingKey(), file, error: null });
    }
    if (rejected.length > 0) {
      notify?.({
        type: "error",
        message: rejected.length === 1 ? "Файл не добавлен" : `Не добавлено файлов: ${rejected.length}`,
        description: rejected.join("\n"),
      });
    }
    if (accepted.length === 0) return;
    setFilter("all");
    setPending((rows) => [...accepted, ...rows]);
    void upload(owner, accepted);
  };

  const retry = (item: PendingUpload) => {
    if (!owner) return;
    const again = { ...item, error: null };
    setPending((rows) => rows.map((row) => (row.key === item.key ? again : row)));
    void upload(owner, [again]);
  };

  const takeFromInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Копия до сброса value: иначе повторный выбор того же файла не сработает,
    // а сброс до копирования опустошил бы список.
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    addFiles(files);
  };

  const pickFiles = () => fileInputRef.current?.click();

  // ── Перетаскивание: счётчик, потому что dragleave приходит и с дочерних.
  const onDragEnter = (event: React.DragEvent) => {
    if (!canUpload || !hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (event: React.DragEvent) => {
    if (!canUpload || !hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (event: React.DragEvent) => {
    if (!canUpload || !hasFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (event: React.DragEvent) => {
    if (!canUpload || !hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };
  const onPaste = (event: React.ClipboardEvent) => {
    if (!canUpload) return;
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    addFiles(files);
  };

  const openAttachment = (attachment: CardAttachment) => {
    if (attachment.kind === "image") {
      const index = photos.findIndex((photo) => photo.id === attachment.id);
      setViewerIndex(index >= 0 ? index : null);
      return;
    }
    if (attachment.kind === "pdf") {
      if (isPhone) window.open(attachmentSrc(attachment.url), "_blank", "noopener,noreferrer");
      else setPdfPreview(attachment);
      return;
    }
    window.location.assign(attachmentSrc(attachment.downloadUrl));
  };

  const saveName = async (name: string) => {
    if (!owner || !renaming) return;
    setRenameBusy(true);
    try {
      const saved = await renameCardAttachment(owner, renaming.id, name);
      updateCache(owner, (rows) => rows.map((row) => (row.id === saved.id ? saved : row)));
      setRenaming(null);
    } catch (err) {
      notify?.({ type: "error", message: "Не удалось переименовать файл", description: getErrorMessage(err) });
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!owner || !deleting) return;
    const target = deleting;
    setDeleteBusy(true);
    try {
      await deleteCardAttachment(owner, target.id);
      updateCache(owner, (rows) => rows.filter((row) => row.id !== target.id));
      setDeleting(null);
      notify?.({ type: "success", message: "Файл удалён" });
    } catch (err) {
      notify?.({ type: "error", message: "Не удалось удалить файл", description: getErrorMessage(err) });
    } finally {
      setDeleteBusy(false);
    }
  };

  const openMenu = (attachment: CardAttachment) => (anchor: HTMLElement) => setMenu({ anchor, attachment });
  // Меню нужно, если есть что в нём делать: управление или (на телефоне) скачивание.
  const menuFor = canManage || isPhone ? openMenu : undefined;

  const count = attachments.length;
  const filterTabs = [
    { key: "all" as const, label: "Все", badge: count },
    { key: "photos" as const, label: "Фото", badge: photos.length },
    { key: "documents" as const, label: "Документы", badge: documents.length },
  ];

  const header = (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      gap={1}
      flexWrap="wrap"
      sx={{ px: 2, pt: 2, pb: 1.5 }}
    >
      <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 0 }}>
        <FolderOutlined sx={{ color: "primary.onSurface" }} />
        <Typography variant="h6">Файлы</Typography>
        {count > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {count}
          </Typography>
        )}
      </Stack>
      {canUpload && (
        <Stack direction="row" alignItems="center" gap={1}>
          {isPhone && (
            <Tooltip title="Сфотографировать">
              <IconButton
                onClick={() => cameraInputRef.current?.click()}
                aria-label="Сфотографировать документ"
                sx={(t) => ({
                  width: 36,
                  height: 36,
                  borderRadius: "10px",
                  border: 1,
                  borderColor: "divider",
                  color: "text.secondary",
                  "&:hover": { color: "text.primary", bgcolor: subtleBg(t, true) },
                })}
              >
                <PhotoCameraOutlined sx={{ fontSize: 19 }} />
              </IconButton>
            </Tooltip>
          )}
          <AppButton size="small" variant="outlined" startIcon={<UploadFileOutlined />} onClick={pickFiles}>
            Загрузить
          </AppButton>
        </Stack>
      )}
    </Stack>
  );

  const dropzone = (
    <ButtonBase
      onClick={pickFiles}
      data-testid="card-attachments-dropzone"
      sx={(t) => ({
        width: "100%",
        minHeight: 240,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        p: 3,
        borderRadius: "14px",
        border: "1.5px dashed",
        borderColor: "divider",
        bgcolor: subtleBg(t),
        textAlign: "center",
        transition: "background-color .15s ease, border-color .15s ease",
        "&:hover": { borderColor: alpha(t.palette.primary.main, 0.45), bgcolor: subtleBg(t, true) },
      })}
    >
      <Box
        sx={(t) => ({
          width: 56,
          height: 56,
          mb: 0.5,
          borderRadius: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "primary.onSurface",
          bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
        })}
      >
        <CloudUploadOutlined sx={{ fontSize: 28 }} />
      </Box>
      <Typography variant="subtitle1" fontWeight={600}>
        {isPhone ? "Добавьте документы и фото" : "Перетащите сюда документы и фото"}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {isPhone ? "Нажмите, чтобы выбрать файл, или сделайте снимок" : "или нажмите, чтобы выбрать файлы"}
      </Typography>
      <Typography variant="caption" color="text.disabled">
        {ATTACHMENT_FORMATS_HINT}
      </Typography>
    </ButtonBase>
  );

  let body: React.ReactNode;
  if (owner === null) {
    body = <ListEmptyState icon={<FolderOutlined />} title="Карточка не выбрана" description="Выберите карточку в списке слева" />;
  } else if (query.isLoading) {
    body = (
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 1 }}>
        {Array.from({ length: 6 }, (_, index) => (
          <Box key={index} sx={(t) => ({ aspectRatio: "1 / 1", borderRadius: "10px", bgcolor: subtleBg(t, true) })} />
        ))}
      </Box>
    );
  } else if (query.isError) {
    body = (
      <ListEmptyState
        icon={<ErrorOutlineOutlined />}
        title="Не удалось загрузить файлы"
        description={getErrorMessage(query.error, "Попробуйте ещё раз")}
        action={
          <AppButton size="small" variant="outlined" onClick={() => void query.refetch()}>
            Повторить
          </AppButton>
        }
      />
    );
  } else if (count === 0 && pending.length === 0) {
    body = canUpload ? (
      dropzone
    ) : (
      <ListEmptyState
        icon={<FolderOutlined />}
        title="Файлов пока нет"
        description="Здесь появятся документы, сканы и фото карточки"
      />
    );
  } else {
    body = (
      <Stack spacing={2}>
        {pending.length > 0 && (
          <Stack spacing={0.75}>
            {pending.map((item) => (
              <PendingRow
                key={item.key}
                name={item.file.name}
                error={item.error}
                onRetry={() => retry(item)}
                onDismiss={() => setPending((rows) => rows.filter((row) => row.key !== item.key))}
              />
            ))}
          </Stack>
        )}

        {bothKinds && (
          <Box sx={{ overflowX: "auto" }}>
            <SegmentedTabs
              layoutId={`card-attachments-filter-${owner.kind}`}
              tabs={filterTabs}
              value={filter}
              onChange={setFilter}
            />
          </Box>
        )}

        {showPhotos && (
          <Box>
            {bothKinds && filter === "all" && (
              <Typography variant="caption" color="text.secondary" sx={sectionTitleSx}>
                Фото · {photos.length}
              </Typography>
            )}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(auto-fill, minmax(96px, 1fr))",
                  md: "repeat(auto-fill, minmax(112px, 1fr))",
                },
                gap: 1,
              }}
            >
              {photos.map((photo) => (
                <PhotoTile
                  key={photo.id}
                  attachment={photo}
                  onOpen={() => openAttachment(photo)}
                  onMenu={menuFor?.(photo)}
                />
              ))}
            </Box>
          </Box>
        )}

        {showDocuments && (
          <Box>
            {bothKinds && filter === "all" && (
              <Typography variant="caption" color="text.secondary" sx={sectionTitleSx}>
                Документы · {documents.length}
              </Typography>
            )}
            <Stack spacing={0.75}>
              {documents.map((document) => (
                <DocumentRow
                  key={document.id}
                  attachment={document}
                  onOpen={() => openAttachment(document)}
                  onMenu={menuFor?.(document)}
                  showDownload={!isPhone}
                />
              ))}
            </Stack>
          </Box>
        )}

        {/* Подсказка о перетаскивании — только там, где есть мышь. */}
        {canUpload && !isPhone && (
          <Typography variant="caption" color="text.disabled" sx={{ textAlign: "center", pb: 0.5 }}>
            Перетащите файлы на панель или вставьте из буфера (Ctrl+V) · {ATTACHMENT_FORMATS_HINT}
          </Typography>
        )}
      </Stack>
    );
  }

  const menuAttachment = menu?.attachment ?? null;

  return (
    <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }} data-testid="card-attachments">
      <AppCard
        variant="outlined"
        header={header}
        disableContentPadding
        sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      >
        <Box
          tabIndex={-1}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onPaste={onPaste}
          sx={{
            position: "relative",
            borderTop: 1,
            borderColor: "divider",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            p: 1.5,
            outline: "none",
          }}
        >
          {body}

          {dragging && (
            <Box
              sx={(t) => ({
                position: "absolute",
                inset: 8,
                zIndex: 2,
                pointerEvents: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                borderRadius: "14px",
                border: "2px dashed",
                borderColor: "primary.main",
                color: "primary.onSurface",
                bgcolor: alpha(t.palette.background.paper, 0.92),
                backgroundImage: `linear-gradient(${alpha(t.palette.primary.main, 0.08)}, ${alpha(t.palette.primary.main, 0.08)})`,
              })}
            >
              <CloudUploadOutlined sx={{ fontSize: 36 }} />
              <Typography variant="subtitle1" fontWeight={600}>
                Отпустите, чтобы прикрепить
              </Typography>
            </Box>
          )}
        </Box>
      </AppCard>

      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept={ATTACHMENT_ACCEPT}
        onChange={takeFromInput}
        data-testid="card-attachments-input"
      />
      <input
        ref={cameraInputRef}
        type="file"
        hidden
        accept="image/*"
        capture="environment"
        onChange={takeFromInput}
      />

      <Menu
        anchorEl={menu?.anchor ?? null}
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {menuAttachment && menuAttachment.kind !== "document" && (
          <MenuItem
            onClick={() => {
              setMenu(null);
              openAttachment(menuAttachment);
            }}
          >
            <ListItemIcon>
              <VisibilityOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>Открыть</ListItemText>
          </MenuItem>
        )}
        {menuAttachment && (
          <MenuItem
            component="a"
            href={attachmentSrc(menuAttachment.downloadUrl)}
            download={menuAttachment.name}
            onClick={() => setMenu(null)}
          >
            <ListItemIcon>
              <DownloadOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>Скачать</ListItemText>
          </MenuItem>
        )}
        {menuAttachment && canManage && (
          <MenuItem
            onClick={() => {
              setMenu(null);
              setRenaming(menuAttachment);
            }}
          >
            <ListItemIcon>
              <DriveFileRenameOutlineOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>Переименовать</ListItemText>
          </MenuItem>
        )}
        {menuAttachment && canManage && (
          <MenuItem
            onClick={() => {
              setMenu(null);
              setDeleting(menuAttachment);
            }}
            sx={{ color: "error.main" }}
          >
            <ListItemIcon sx={{ color: "inherit" }}>
              <DeleteOutlineOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>Удалить</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <ArticleLightbox
        images={photos.map((photo) => attachmentSrc(photo.url))}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
      />
      <PdfPreviewDialog attachment={pdfPreview} onClose={() => setPdfPreview(null)} />
      <RenameAttachmentDialog
        attachment={renaming}
        busy={renameBusy}
        onClose={() => setRenaming(null)}
        onSave={(name) => void saveName(name)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => (deleteBusy ? undefined : setDeleting(null))}
        onConfirm={() => void confirmDelete()}
        title="Удалить файл?"
        message={deleting ? `«${deleting.name}» исчезнет из карточки. Восстановить его будет нельзя.` : ""}
        confirmText="Удалить"
        cancelText="Отмена"
        variant="error"
        loading={deleteBusy}
      />
    </Box>
  );
};

export default CardAttachmentsPanel;
