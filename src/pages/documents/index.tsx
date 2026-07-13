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
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";

import SearchOutlined from "@mui/icons-material/SearchOutlined";
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

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useTheme } from "@mui/material/styles";
import { ApiError, extractErrorMessage as extractApiError } from "../../api/client";
import { formatDateRu } from "../../utility/format";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  DOCUMENTS_USE_MOCKS,
  DOCUMENT_ALLOWED_EXTENSIONS,
  DOCUMENT_MAX_SIZE_MB,
  deleteDocument,
  getDocuments,
  renameDocument,
  uploadDocument,
  type OrganizationDocument,
} from "../../api/documents";

const PAGE_SIZE = 20;

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return extractApiError(err.payload, err.status);
  if (err instanceof Error) return err.message;
  return "Неизвестная ошибка";
}

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** Иконка по типу файла — чтобы список читался «как гугл-драйв». */
function FileIcon({ name }: { name: string }) {
  const ext = getFileExt(name);
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

/** Значение фильтра/скоупа: "all" | "shared" | id филиала строкой. */
type BranchScope = "all" | "shared" | string;

const DocumentsPage: React.FC = () => {
  usePageTitle("Документы");
  const theme = useTheme();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const { isSuperAdmin, canAccess, activeMembership } = usePermissions();

  // TODO(после интеграции): убрать обход DOCUMENTS_USE_MOCKS — как в tasks.
  const canManage =
    DOCUMENTS_USE_MOCKS || isSuperAdmin() || canAccess("documents.manage");

  const branches = React.useMemo(
    () => (activeMembership?.branches ?? []).filter((b) => b.isActive),
    [activeMembership],
  );

  // ── Список ────────────────────────────────────────────────────────────────
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [branchScope, setBranchScope] = React.useState<BranchScope>("all");
  const [page, setPage] = React.useState(0); // 0-based для DataGrid

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

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

  // ── Загрузка ──────────────────────────────────────────────────────────────
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [uploadName, setUploadName] = React.useState("");
  const [uploadScope, setUploadScope] = React.useState<Exclude<BranchScope, "all">>("shared");
  const [uploadBusy, setUploadBusy] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Сбрасываем value, иначе повторный выбор того же файла не вызовет onChange.
    e.target.value = "";
    if (!file) return;
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
    setUploadError(null);
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      await uploadDocument({
        file: uploadFile,
        name: uploadName.trim() || undefined,
        branchId: uploadScope === "shared" ? null : Number(uploadScope),
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

  // ── Переименование ────────────────────────────────────────────────────────
  const [renameTarget, setRenameTarget] = React.useState<OrganizationDocument | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renameBusy, setRenameBusy] = React.useState(false);
  const [renameError, setRenameError] = React.useState<string | null>(null);

  const openRename = (doc: OrganizationDocument) => {
    setRenameTarget(doc);
    setRenameValue(doc.name);
    setRenameError(null);
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      await renameDocument(renameTarget.id, renameValue.trim(), orgId);
      notify?.({ type: "success", message: "Документ переименован" });
      setRenameTarget(null);
      invalidate();
    } catch (err) {
      setRenameError(extractErrorMessage(err));
    } finally {
      setRenameBusy(false);
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
          <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
            <FileIcon name={p.row.name} />
            <Typography
              variant="body2"
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
            />
          ) : (
            <Chip
              size="small"
              variant="outlined"
              icon={<StoreOutlined />}
              label={p.row.branchName ?? `Филиал #${p.row.branchId}`}
            />
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
                <Tooltip title="Переименовать">
                  <IconButton size="small" onClick={() => openRename(p.row)}>
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
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", gap: 1.5, p: 1 }}>
      {/* Тулбар */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "center" }}
        gap={1.5}
      >
        <Stack direction="row" alignItems="center" gap={1} sx={{ mr: "auto" }}>
          <FolderOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            Документы
          </Typography>
          {DOCUMENTS_USE_MOCKS && (
            <Chip size="small" color="warning" variant="outlined" label="Демо-данные" />
          )}
        </Stack>

        <TextField
          size="small"
          placeholder="Поиск по названию"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: "100%", sm: 260 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        {branches.length > 0 && (
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
        )}

        {canManage && (
          <Button
            variant="contained"
            startIcon={<FileUploadOutlined />}
            onClick={() => fileInputRef.current?.click()}
          >
            Загрузить
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
          onChange={handleFileSelect}
        />
      </Stack>

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
      <Box sx={{ flex: 1, minHeight: 0 }}>
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
          localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
          slots={{
            noRowsOverlay: () => (
              <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", color: "text.secondary" }}>
                <FolderOutlined sx={{ fontSize: 40, mb: 1 }} />
                <Typography variant="body2">
                  {debouncedSearch ? "Ничего не найдено" : "Документов пока нет"}
                </Typography>
              </Stack>
            ),
          }}
          sx={{
            bgcolor: "background.paper",
            borderRadius: "14px",
            "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
            "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
          }}
        />
      </Box>

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
                <FileIcon name={uploadFile.name} />
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

      {/* Диалог переименования */}
      <Dialog
        open={renameTarget !== null}
        onClose={renameBusy ? undefined : () => setRenameTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Переименовать документ</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              size="small"
              fullWidth
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              disabled={renameBusy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRename();
                }
              }}
            />
            {renameError && <Alert severity="error">{renameError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(null)} disabled={renameBusy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleRename}
            disabled={renameBusy || !renameValue.trim()}
            startIcon={renameBusy ? <CircularProgress size={16} color="inherit" /> : undefined}
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
    </Box>
  );
};

export default DocumentsPage;
