import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { motion } from "framer-motion";

import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import PictureAsPdfOutlined from "@mui/icons-material/PictureAsPdfOutlined";
import TableChartOutlined from "@mui/icons-material/TableChartOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import DriveFileRenameOutlineOutlined from "@mui/icons-material/DriveFileRenameOutlineOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { alpha, useTheme } from "@mui/material/styles";
import { getErrorMessage as extractErrorMessage } from "../../api/client";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useModuleGate } from "../../hooks/useModuleGate";
import { formatDateRu } from "../../utility/format";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  ListEmptyState,
  PageHeader,
  cascadeContainer,
  cascadeItem,
} from "../../components/ui";
import {
  DOCUMENTS_USE_MOCKS,
  DOCUMENT_ALLOWED_EXTENSIONS,
  DOCUMENT_MAX_SIZE_MB,
  deleteDocument,
  getDocumentRoleOptions,
  getDocuments,
  updateDocument,
  uploadDocument,
  type DocumentRoleOption,
  type OrganizationDocument,
} from "../../api/documents";
import DocumentPreviewDialog from "./DocumentPreviewDialog";

const PAGE_SIZE = 20;

const MotionBox = motion(Box);

/**
 * Расширение из имени файла ИЛИ из URL. Отображаемое имя (name) пользователь
 * может задать без расширения («Устав организации») — тогда тип определяем по
 * fileUrl реального файла. Из URL отбрасываем query/hash и берём последний
 * сегмент пути.
 */
function getFileExt(source: string | null | undefined): string {
  if (!source) return "";
  const base = source.split(/[?#]/)[0].split("/").pop() ?? "";
  return base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
}

/** Иконка по типу файла — чтобы список читался «как гугл-драйв». */
function FileIcon({ source }: { source: string }) {
  const ext = getFileExt(source);
  if (ext === "pdf") return <PictureAsPdfOutlined fontSize="small" color="error" />;
  if (ext === "jpg" || ext === "jpeg" || ext === "png")
    return <ImageOutlined fontSize="small" color="success" />;
  if (ext === "xls" || ext === "xlsx")
    return <TableChartOutlined fontSize="small" color="success" />;
  return <DescriptionOutlined fontSize="small" color="info" />;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** Значение фильтра/скоупа: "all" | "shared" | id филиала строкой.
 *  `string & {}` сохраняет литералы в подсказках (иначе TS схлопнет тип в string). */
type BranchScope = "all" | "shared" | (string & {});

const DocumentsPage: React.FC = () => {
  usePageTitle("Документы");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const { activeMembership } = usePermissions();
  const { moduleGate } = useModuleGate();

  // Доступ к странице гейтит RequireModule (App.tsx); здесь — право на действия.
  // В демо-режиме открыто всем, после выключения DOCUMENTS_USE_MOCKS начнёт
  // требовать право автоматически (см. useModuleGate).
  const canManage = moduleGate("documents", ["documents.manage"]);

  const branches = React.useMemo(
    () => (activeMembership?.branches ?? []).filter((b) => b.isActive),
    [activeMembership],
  );

  // ── Список ────────────────────────────────────────────────────────────────
  const [search, setSearch] = React.useState("");
  const [branchScope, setBranchScope] = React.useState<BranchScope>("all");
  const [page, setPage] = React.useState(0); // 0-based для DataGrid

  const debouncedSearch = useDebouncedValue(search.trim());
  // Новый поисковый запрос — всегда с первой страницы.
  React.useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  const branchParam =
    branchScope === "all" ? undefined : branchScope === "shared" ? ("null" as const) : Number(branchScope);

  const query = useQuery({
    queryKey: djangoQueryKeys.documents.list({
      search: debouncedSearch,
      branch: branchParam ?? "all",
      page,
      orgId: orgId ?? null,
    }),
    queryFn: ({ signal }) =>
      getDocuments(
        {
          search: debouncedSearch || undefined,
          branch: branchParam,
          page: page + 1,
          pageSize: PAGE_SIZE,
          organizationId: orgId,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.documents.all });

  // ── Роли для селекта доступа (нужны только менеджеру) ─────────────────────
  const rolesQuery = useQuery({
    queryKey: djangoQueryKeys.documents.roles(orgId ?? null),
    queryFn: ({ signal }) => getDocumentRoleOptions(orgId, signal),
    enabled: canManage,
  });
  const roleOptions = rolesQuery.data ?? [];

  // ── Загрузка ──────────────────────────────────────────────────────────────
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [uploadName, setUploadName] = React.useState("");
  const [uploadScope, setUploadScope] = React.useState<Exclude<BranchScope, "all">>("shared");
  const [uploadRoles, setUploadRoles] = React.useState<DocumentRoleOption[]>([]);
  const [uploadBusy, setUploadBusy] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  /** Валидация и подготовка файла к загрузке (пикер, drag&drop). */
  const stageFile = React.useCallback(
    (file: File) => {
      const ext = getFileExt(file.name);
      if (!DOCUMENT_ALLOWED_EXTENSIONS.has(ext)) {
        notify?.({
          type: "error",
          message: "Недопустимый тип файла",
          description: "Можно загрузить: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX.",
        });
        return;
      }
      if (file.size > DOCUMENT_MAX_SIZE_MB * 1024 * 1024) {
        notify?.({
          type: "error",
          message: "Файл слишком большой",
          description: `Максимальный размер — ${DOCUMENT_MAX_SIZE_MB} МБ.`,
        });
        return;
      }
      setUploadFile(file);
      setUploadName(file.name);
      setUploadScope("shared");
      setUploadRoles([]);
      setUploadError(null);
    },
    [notify],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Сбрасываем value, иначе повторный выбор того же файла не вызовет onChange.
    e.target.value = "";
    if (file) stageFile(file);
  };

  // ── Drag & drop на всю страницу ───────────────────────────────────────────
  const [dragActive, setDragActive] = React.useState(false);
  // Счётчик вложенных dragenter/dragleave — иначе оверлей мигает над дочерними узлами.
  const dragDepth = React.useRef(0);

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const onDragEnter = (e: React.DragEvent) => {
    if (!canManage || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!canManage || !hasFiles(e)) return;
    e.preventDefault();
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!canManage || !hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!canManage || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) stageFile(file);
  };

  // ── Предпросмотр ──────────────────────────────────────────────────────────
  const [previewDoc, setPreviewDoc] = React.useState<OrganizationDocument | null>(null);

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      await uploadDocument({
        file: uploadFile,
        name: uploadName.trim() || undefined,
        branchId: uploadScope === "shared" ? null : Number(uploadScope),
        visibleRoleIds: uploadRoles.map((r) => r.id),
        organizationId: orgId,
      });
      notify?.({ type: "success", message: "Документ загружен" });
      setUploadFile(null);
      invalidate();
    } catch (err) {
      setUploadError(extractErrorMessage(err));
    } finally {
      setUploadBusy(false);
    }
  };

  // ── Изменение (имя + доступ по ролям) ─────────────────────────────────────
  const [editTarget, setEditTarget] = React.useState<OrganizationDocument | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editScope, setEditScope] = React.useState<Exclude<BranchScope, "all">>("shared");
  const [editRoles, setEditRoles] = React.useState<DocumentRoleOption[]>([]);
  const [editBusy, setEditBusy] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  const openEdit = (doc: OrganizationDocument) => {
    setEditTarget(doc);
    setEditName(doc.name);
    setEditScope(doc.branchId == null ? "shared" : String(doc.branchId));
    setEditRoles(
      doc.visibleRoleIds.map((id, i) => ({
        id,
        name: doc.visibleRoleNames[i] ?? `Роль #${id}`,
      })),
    );
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editTarget || !editName.trim()) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await updateDocument(
        editTarget.id,
        {
          name: editName.trim(),
          branchId: editScope === "shared" ? null : Number(editScope),
          visibleRoleIds: editRoles.map((r) => r.id),
        },
        orgId,
      );
      notify?.({ type: "success", message: "Документ обновлён" });
      setEditTarget(null);
      invalidate();
    } catch (err) {
      setEditError(extractErrorMessage(err));
    } finally {
      setEditBusy(false);
    }
  };

  // ── Удаление ──────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = React.useState<OrganizationDocument | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteDocument(deleteTarget.id, orgId);
      notify?.({ type: "success", message: "Документ удалён" });
      setDeleteTarget(null);
      invalidate();
    } catch (err) {
      setDeleteError(extractErrorMessage(err));
    } finally {
      setDeleteBusy(false);
    }
  };

  // ── Колонки ───────────────────────────────────────────────────────────────
  const columns = React.useMemo<GridColDef<OrganizationDocument>[]>(
    () => [
      {
        field: "name",
        headerName: "Название",
        flex: 1,
        minWidth: 260,
        renderCell: (p) => (
          <Stack
            direction="row"
            alignItems="center"
            gap={1}
            onClick={() => setPreviewDoc(p.row)}
            sx={{
              minWidth: 0,
              cursor: "pointer",
              "&:hover .doc-name": { textDecoration: "underline" },
            }}
          >
            <FileIcon source={p.row.fileUrl} />
            <Typography
              variant="body2"
              className="doc-name"
              sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {p.row.name}
            </Typography>
          </Stack>
        ),
      },
      {
        field: "branchName",
        headerName: "Область",
        width: 190,
        sortable: false,
        renderCell: (p) =>
          p.row.branchId === null ? (
            <Chip
              size="small"
              variant="outlined"
              icon={<BusinessOutlined />}
              label="Общий"
              sx={{ borderRadius: "7px" }}
            />
          ) : (
            <Chip
              size="small"
              variant="outlined"
              icon={<StoreOutlined />}
              label={p.row.branchName ?? `Филиал #${p.row.branchId}`}
              sx={{ borderRadius: "7px" }}
            />
          ),
      },
      {
        field: "visibleRoleNames",
        headerName: "Доступ",
        width: 190,
        sortable: false,
        renderCell: (p) =>
          p.row.visibleRoleIds.length === 0 ? (
            <Chip
              size="small"
              variant="outlined"
              icon={<GroupsOutlined />}
              label="Все сотрудники"
              sx={{ borderRadius: "7px" }}
            />
          ) : (
            <Tooltip title={p.row.visibleRoleNames.join(", ")} arrow>
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                icon={<LockOutlined />}
                label={
                  p.row.visibleRoleNames.length === 1
                    ? p.row.visibleRoleNames[0]
                    : `${p.row.visibleRoleNames[0]} +${p.row.visibleRoleNames.length - 1}`
                }
                sx={{ borderRadius: "7px", maxWidth: "100%" }}
              />
            </Tooltip>
          ),
      },
      {
        field: "fileSize",
        headerName: "Размер",
        width: 100,
        sortable: false,
        valueFormatter: (value: number) => formatFileSize(value),
      },
      {
        field: "uploadedByName",
        headerName: "Загрузил",
        width: 200,
        sortable: false,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "createdAt",
        headerName: "Дата",
        width: 110,
        sortable: false,
        valueFormatter: (value: string) => formatDateRu(value),
      },
      {
        field: "actions",
        headerName: "",
        width: canManage ? 140 : 60,
        sortable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (p) => (
          <Stack direction="row" gap={0.25}>
            <Tooltip title="Скачать">
              <IconButton
                size="small"
                component="a"
                href={p.row.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={p.row.name}
                onClick={(e) => e.stopPropagation()}
              >
                <DownloadOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            {canManage && (
              <>
                <Tooltip title="Изменить (название, доступ)">
                  <IconButton size="small" onClick={() => openEdit(p.row)}>
                    <DriveFileRenameOutlineOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Удалить">
                  <IconButton size="small" color="error" onClick={() => setDeleteTarget(p.row)}>
                    <DeleteOutlineOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Stack>
        ),
      },
    ],
    [canManage],
  );

  return (
    <Box
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      sx={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}
    >
      {/* Оверлей дропзоны */}
      {dragActive && (
        <Box
          sx={(t) => ({
            position: "absolute",
            inset: 8,
            zIndex: t.zIndex.modal - 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "14px",
            border: "2px dashed",
            borderColor: "primary.main",
            bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06),
            pointerEvents: "none",
          })}
        >
          <Stack alignItems="center" gap={1} sx={{ color: "primary.onSurface" }}>
            <FileUploadOutlined sx={{ fontSize: 40 }} />
            <Typography variant="subtitle1" fontWeight={600}>
              Отпустите файл, чтобы загрузить
            </Typography>
          </Stack>
        </Box>
      )}

      <PageHeader
        title="Документы"
        showTitle={false}
        onAdd={canManage ? () => fileInputRef.current?.click() : undefined}
        addButtonText="Загрузить"
        addButtonIcon={<FileUploadOutlined />}
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        searchPlaceholder="Поиск по названию"
        loading={query.isFetching}
        actions={
          branches.length > 0 ? (
            <TextField
              select
              size="small"
              value={branchScope}
              onChange={(e) => {
                setBranchScope(e.target.value as BranchScope);
                setPage(0);
              }}
              sx={{ width: { xs: "100%", sm: 200 } }}
            >
              <MenuItem value="all">Все документы</MenuItem>
              <MenuItem value="shared">Только общие</MenuItem>
              {branches.map((b) => (
                <MenuItem key={b.id} value={String(b.id)}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          ) : undefined
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
        onChange={handleFileSelect}
      />

      <MotionBox
        variants={cascadeContainer}
        initial="hidden"
        animate="show"
        sx={(t) => ({
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          px: t.appLayout.page.paddingX,
          pb: 1.5,
        })}
      >
        {DOCUMENTS_USE_MOCKS && (
          <MotionBox variants={cascadeItem}>
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label="Демо-данные"
              sx={{ borderRadius: "7px" }}
            />
          </MotionBox>
        )}

        {query.isError && (
          <Alert
            severity="error"
            action={
              <Button size="small" color="inherit" onClick={() => query.refetch()}>
                Повторить
              </Button>
            }
          >
            {extractErrorMessage(query.error)}
          </Alert>
        )}

        {/* Список */}
        <MotionBox variants={cascadeItem} sx={{ flex: 1, minHeight: 0 }}>
          <DataGrid<OrganizationDocument>
            rows={rows}
            columns={columns}
            loading={query.isLoading}
            rowCount={total}
            paginationMode="server"
            paginationModel={{ page, pageSize: PAGE_SIZE }}
            onPaginationModelChange={(m) => setPage(m.page)}
            pageSizeOptions={[PAGE_SIZE]}
            disableColumnMenu
            disableRowSelectionOnClick
            rowHeight={52}
            columnHeaderHeight={theme.appLayout.table.headerRowHeight}
            columnVisibilityModel={{
              uploadedByName: !isMobile,
              fileSize: !isMobile,
              visibleRoleNames: !isMobile,
            }}
            localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
            slots={{
              noRowsOverlay: () => (
                <ListEmptyState
                  icon={<FolderOutlined />}
                  title={debouncedSearch ? "Ничего не найдено" : "Документов пока нет"}
                  description={
                    debouncedSearch
                      ? "Попробуйте изменить запрос или фильтр по области."
                      : canManage
                      ? "Храните здесь уставные документы, лицензии и договоры — общие или по филиалам."
                      : "Здесь появятся документы организации, когда их загрузит администратор."
                  }
                  action={
                    canManage && !debouncedSearch ? (
                      <Button
                        variant="outlined"
                        startIcon={<FileUploadOutlined />}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Загрузить документ
                      </Button>
                    ) : undefined
                  }
                />
              ),
            }}
            sx={{
              bgcolor: "background.paper",
              borderRadius: "14px",
              "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
              "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
            }}
          />
        </MotionBox>
      </MotionBox>

      {/* Диалог загрузки */}
      <Dialog
        open={uploadFile !== null}
        onClose={uploadBusy ? undefined : () => setUploadFile(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Загрузка документа</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {uploadFile && (
              <Stack direction="row" alignItems="center" gap={1} sx={{ color: "text.secondary" }}>
                <FileIcon source={uploadFile.name} />
                <Typography variant="body2" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {uploadFile.name} · {formatFileSize(uploadFile.size)}
                </Typography>
              </Stack>
            )}
            <TextField
              label="Название"
              size="small"
              fullWidth
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              disabled={uploadBusy}
            />
            <TextField
              select
              label="Область"
              size="small"
              fullWidth
              value={uploadScope}
              onChange={(e) => setUploadScope(e.target.value as Exclude<BranchScope, "all">)}
              disabled={uploadBusy}
              helperText="Общий документ виден во всех филиалах"
            >
              <MenuItem value="shared">Общий (вся организация)</MenuItem>
              {branches.map((b) => (
                <MenuItem key={b.id} value={String(b.id)}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
            <Autocomplete<DocumentRoleOption, true>
              multiple
              size="small"
              options={roleOptions}
              loading={rolesQuery.isLoading}
              value={uploadRoles}
              onChange={(_, v) => setUploadRoles(v)}
              getOptionLabel={(r) => r.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              disabled={uploadBusy}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Доступ по ролям"
                  placeholder={uploadRoles.length === 0 ? "Все сотрудники" : undefined}
                  helperText="Пусто — документ видят все сотрудники. Выберите роли, чтобы ограничить доступ (менеджеры документов видят всё)."
                />
              )}
            />
            {uploadError && <Alert severity="error">{uploadError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadFile(null)} disabled={uploadBusy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={uploadBusy || !uploadName.trim()}
            startIcon={uploadBusy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {uploadBusy ? "Загрузка…" : "Загрузить"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог изменения: название + доступ по ролям */}
      <Dialog
        open={editTarget !== null}
        onClose={editBusy ? undefined : () => setEditTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Изменить документ</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label="Название"
              size="small"
              fullWidth
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={editBusy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleEditSave();
                }
              }}
            />
            {branches.length > 0 && (
              <TextField
                select
                label="Область"
                size="small"
                fullWidth
                value={editScope}
                onChange={(e) => setEditScope(e.target.value as Exclude<BranchScope, "all">)}
                disabled={editBusy}
                helperText="Общий документ виден во всех филиалах"
              >
                <MenuItem value="shared">Общий (вся организация)</MenuItem>
                {branches.map((b) => (
                  <MenuItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Autocomplete<DocumentRoleOption, true>
              multiple
              size="small"
              options={roleOptions}
              loading={rolesQuery.isLoading}
              value={editRoles}
              onChange={(_, v) => setEditRoles(v)}
              getOptionLabel={(r) => r.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              disabled={editBusy}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Доступ по ролям"
                  placeholder={editRoles.length === 0 ? "Все сотрудники" : undefined}
                  helperText="Пусто — документ видят все сотрудники. Выберите роли, чтобы ограничить доступ (менеджеры документов видят всё)."
                />
              )}
            />
            {editError && <Alert severity="error">{editError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)} disabled={editBusy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleEditSave}
            disabled={editBusy || !editName.trim()}
            startIcon={editBusy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог удаления */}
      <Dialog
        open={deleteTarget !== null}
        onClose={deleteBusy ? undefined : () => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Удалить документ?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            «{deleteTarget?.name}» будет удалён без возможности восстановления.
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleteBusy}
            startIcon={deleteBusy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {deleteBusy ? "Удаление…" : "Удалить"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Предпросмотр */}
      <DocumentPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </Box>
  );
};

export default DocumentsPage;
