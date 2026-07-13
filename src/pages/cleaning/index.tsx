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
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/ru";

import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import AddAPhotoOutlined from "@mui/icons-material/AddAPhotoOutlined";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useTheme } from "@mui/material/styles";
import { ApiError, extractErrorMessage as extractApiError } from "../../api/client";
import { formatKGS } from "../../utility/format";
import { compressImage } from "../../utility/imageCompression";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  CLEANING_MAX_PHOTOS,
  CLEANING_PHOTO_MAX_SIZE_MB,
  CLEANING_USE_MOCKS,
  approveCleaningRecord,
  createCleaningRecord,
  getCleaningRecords,
  getCleaningSettings,
  getCleaningSummary,
  getCleaningZones,
  rejectCleaningRecord,
  type CleaningRecord,
  type CleaningRecordStatus,
} from "../../api/cleaning";

dayjs.locale("ru");

const PAGE_SIZE = 20;

const STATUS_META: Record<
  CleaningRecordStatus,
  { label: string; color: "warning" | "success" | "error" }
> = {
  pending: { label: "Ждёт подтверждения", color: "warning" },
  approved: { label: "Подтверждена", color: "success" },
  rejected: { label: "Отклонена", color: "error" },
};

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return extractApiError(err.payload, err.status);
  if (err instanceof Error) return err.message;
  return "Неизвестная ошибка";
}

const CleaningPage: React.FC = () => {
  usePageTitle("Уборка");
  const theme = useTheme();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const { isSuperAdmin, canAccess } = usePermissions();

  // TODO(после интеграции): убрать обход CLEANING_USE_MOCKS — как в tasks.
  const canReport = CLEANING_USE_MOCKS || isSuperAdmin() || canAccess("cleaning.report");
  const canManage = CLEANING_USE_MOCKS || isSuperAdmin() || canAccess("cleaning.manage");

  const [tab, setTab] = React.useState<"records" | "summary">("records");
  const [month, setMonth] = React.useState<Dayjs>(dayjs().startOf("month"));
  const [statusFilter, setStatusFilter] = React.useState<CleaningRecordStatus | "all">("all");
  const [zoneFilter, setZoneFilter] = React.useState<number | "all">("all");
  const [page, setPage] = React.useState(0); // 0-based для DataGrid

  const monthStr = month.format("YYYY-MM");
  const isCurrentMonth = month.isSame(dayjs(), "month");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.cleaning.all });

  // ── Данные ────────────────────────────────────────────────────────────────
  const zonesQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.zones({ orgId: orgId ?? null }),
    queryFn: ({ signal }) => getCleaningZones({ organizationId: orgId }, signal),
  });
  const zones = zonesQuery.data ?? [];
  const activeZones = zones.filter((z) => z.isActive);

  const recordsQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.records({
      month: monthStr,
      status: statusFilter,
      zone: zoneFilter,
      page,
      orgId: orgId ?? null,
    }),
    queryFn: ({ signal }) =>
      getCleaningRecords(
        {
          dateFrom: month.format("YYYY-MM-DD"),
          dateTo: month.endOf("month").format("YYYY-MM-DD"),
          status: statusFilter === "all" ? undefined : statusFilter,
          zone: zoneFilter === "all" ? undefined : zoneFilter,
          page: page + 1,
          pageSize: PAGE_SIZE,
          organizationId: orgId,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  const rows = recordsQuery.data?.results ?? [];
  const total = recordsQuery.data?.count ?? 0;

  const summaryQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.summary({ month: monthStr, orgId: orgId ?? null }),
    queryFn: ({ signal }) =>
      getCleaningSummary({ month: monthStr, organizationId: orgId }, signal),
    enabled: tab === "summary",
  });

  const settingsQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.settings,
    queryFn: ({ signal }) => getCleaningSettings(orgId, signal),
    enabled: tab === "summary",
  });

  // ── Отметка уборки ────────────────────────────────────────────────────────
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [reportZoneId, setReportZoneId] = React.useState<number | "">("");
  const [reportPhotos, setReportPhotos] = React.useState<{ file: File; url: string }[]>([]);
  const [reportBusy, setReportBusy] = React.useState(false);
  const [reportError, setReportError] = React.useState<string | null>(null);

  const openReport = () => {
    setReportZoneId(activeZones.length === 1 ? activeZones[0].id : "");
    setReportPhotos([]);
    setReportError(null);
    setReportOpen(true);
  };

  const closeReport = () => {
    if (reportBusy) return;
    reportPhotos.forEach((p) => URL.revokeObjectURL(p.url));
    setReportOpen(false);
  };

  const handlePhotosSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Сбрасываем value, иначе повторный выбор тех же файлов не вызовет onChange.
    e.target.value = "";
    if (files.length === 0) return;
    setReportError(null);
    const room = CLEANING_MAX_PHOTOS - reportPhotos.length;
    if (files.length > room) {
      setReportError(`Не больше ${CLEANING_MAX_PHOTOS} фото на одну уборку.`);
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setReportError("Можно прикладывать только изображения.");
        return;
      }
    }
    const compressed: { file: File; url: string }[] = [];
    for (const file of files) {
      const result = await compressImage(file);
      const outFile =
        result instanceof File ? result : new File([result], file.name, { type: "image/jpeg" });
      if (outFile.size > CLEANING_PHOTO_MAX_SIZE_MB * 1024 * 1024) {
        setReportError(`Фото «${file.name}» больше ${CLEANING_PHOTO_MAX_SIZE_MB} МБ.`);
        return;
      }
      compressed.push({ file: outFile, url: URL.createObjectURL(outFile) });
    }
    setReportPhotos((prev) => [...prev, ...compressed]);
  };

  const removePhoto = (index: number) => {
    setReportPhotos((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleReportSubmit = async () => {
    if (reportZoneId === "" || reportPhotos.length === 0) return;
    setReportBusy(true);
    setReportError(null);
    try {
      await createCleaningRecord({
        zoneId: reportZoneId,
        photos: reportPhotos.map((p) => p.file),
        organizationId: orgId,
      });
      notify?.({ type: "success", message: "Уборка отмечена", description: "Ожидает подтверждения администратором." });
      setReportOpen(false);
      invalidate();
    } catch (err) {
      setReportError(extractErrorMessage(err));
    } finally {
      setReportBusy(false);
    }
  };

  // ── Просмотр фото ─────────────────────────────────────────────────────────
  const [viewer, setViewer] = React.useState<{ record: CleaningRecord; index: number } | null>(null);

  // ── Подтверждение / отклонение ────────────────────────────────────────────
  const [reviewBusyId, setReviewBusyId] = React.useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<CleaningRecord | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [rejectError, setRejectError] = React.useState<string | null>(null);

  const handleApprove = async (record: CleaningRecord) => {
    setReviewBusyId(record.id);
    try {
      await approveCleaningRecord(record.id, orgId);
      notify?.({ type: "success", message: "Уборка подтверждена" });
      invalidate();
    } catch (err) {
      notify?.({ type: "error", message: "Не удалось подтвердить", description: extractErrorMessage(err) });
    } finally {
      setReviewBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setReviewBusyId(rejectTarget.id);
    setRejectError(null);
    try {
      await rejectCleaningRecord(rejectTarget.id, rejectReason.trim(), orgId);
      notify?.({ type: "success", message: "Уборка отклонена" });
      setRejectTarget(null);
      setRejectReason("");
      invalidate();
    } catch (err) {
      setRejectError(extractErrorMessage(err));
    } finally {
      setReviewBusyId(null);
    }
  };

  // ── Колонки ───────────────────────────────────────────────────────────────
  const columns = React.useMemo<GridColDef<CleaningRecord>[]>(
    () => [
      {
        field: "createdAt",
        headerName: "Дата",
        width: 130,
        sortable: false,
        valueFormatter: (value: string) => dayjs(value).format("DD.MM.YYYY HH:mm"),
      },
      {
        field: "zoneName",
        headerName: "Зона",
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: (p) => (
          <Stack sx={{ minWidth: 0, justifyContent: "center", height: "100%" }}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {p.row.zoneName}
            </Typography>
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: "text.secondary" }}>
              <StoreOutlined sx={{ fontSize: 14 }} />
              <Typography variant="caption" noWrap>
                {p.row.branchName}
              </Typography>
            </Stack>
          </Stack>
        ),
      },
      {
        field: "employeeName",
        headerName: "Сотрудник",
        width: 200,
        sortable: false,
      },
      {
        field: "photos",
        headerName: "Фото",
        width: 150,
        sortable: false,
        renderCell: (p) => (
          <Stack direction="row" gap={0.5} alignItems="center" sx={{ height: "100%" }}>
            {p.row.photos.map((photo, i) => (
              <Box
                key={photo.id}
                component="img"
                src={photo.url}
                alt={`Фото ${i + 1}`}
                onClick={() => setViewer({ record: p.row, index: i })}
                sx={{
                  width: 36,
                  height: 36,
                  objectFit: "cover",
                  borderRadius: 1,
                  cursor: "pointer",
                  border: `1px solid ${theme.palette.divider}`,
                }}
              />
            ))}
          </Stack>
        ),
      },
      {
        field: "status",
        headerName: "Статус",
        width: 190,
        sortable: false,
        renderCell: (p) => {
          const meta = STATUS_META[p.row.status];
          const chip = (
            <Chip size="small" variant="outlined" color={meta.color} label={meta.label} />
          );
          if (p.row.status === "rejected" && p.row.rejectReason) {
            return (
              <Tooltip title={`Причина: ${p.row.rejectReason}`} arrow>
                <Stack direction="row" alignItems="center" gap={0.5} sx={{ height: "100%" }}>
                  {chip}
                  <InfoOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
                </Stack>
              </Tooltip>
            );
          }
          if (p.row.status === "approved" && p.row.reviewedByName) {
            return (
              <Tooltip title={`Подтвердил: ${p.row.reviewedByName}`} arrow>
                <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>{chip}</Box>
              </Tooltip>
            );
          }
          return chip;
        },
      },
      {
        field: "actions",
        headerName: "",
        width: canManage ? 100 : 20,
        sortable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (p) =>
          canManage && p.row.status === "pending" ? (
            <Stack direction="row" gap={0.25} alignItems="center" sx={{ height: "100%" }}>
              {reviewBusyId === p.row.id ? (
                <CircularProgress size={18} />
              ) : (
                <>
                  <Tooltip title="Подтвердить">
                    <IconButton size="small" color="success" onClick={() => handleApprove(p.row)}>
                      <CheckOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Отклонить">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        setRejectTarget(p.row);
                        setRejectReason("");
                        setRejectError(null);
                      }}
                    >
                      <CloseOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, reviewBusyId, theme.palette.divider],
  );

  const summaryRows = summaryQuery.data ?? [];
  const rate = settingsQuery.data?.rate;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", gap: 1.5, p: 1 }}>
      {/* Тулбар */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "center" }}
        gap={1.5}
      >
        <Stack direction="row" alignItems="center" gap={1} sx={{ mr: "auto" }}>
          <CleaningServicesOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            Уборка
          </Typography>
          {CLEANING_USE_MOCKS && (
            <Chip size="small" color="warning" variant="outlined" label="Демо-данные" />
          )}
        </Stack>

        {/* Месяц */}
        <Stack direction="row" alignItems="center" gap={0.5}>
          <IconButton size="small" onClick={() => { setMonth((m) => m.subtract(1, "month")); setPage(0); }}>
            <ChevronLeft />
          </IconButton>
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{ minWidth: 110, textAlign: "center", textTransform: "capitalize" }}
          >
            {month.format("MMMM YYYY")}
          </Typography>
          <IconButton
            size="small"
            disabled={isCurrentMonth}
            onClick={() => { setMonth((m) => m.add(1, "month")); setPage(0); }}
          >
            <ChevronRight />
          </IconButton>
        </Stack>

        {canReport && (
          <Button variant="contained" startIcon={<AddAPhotoOutlined />} onClick={openReport}>
            Отметить уборку
          </Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none" } }}>
        <Tab value="records" label="Записи" />
        <Tab value="summary" label="Сводка за месяц" />
      </Tabs>

      {tab === "records" && (
        <>
          {/* Фильтры */}
          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
            <TextField
              select
              size="small"
              label="Статус"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as CleaningRecordStatus | "all"); setPage(0); }}
              sx={{ width: { xs: "100%", sm: 220 } }}
            >
              <MenuItem value="all">Все статусы</MenuItem>
              {(Object.keys(STATUS_META) as CleaningRecordStatus[]).map((s) => (
                <MenuItem key={s} value={s}>
                  {STATUS_META[s].label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Зона"
              value={String(zoneFilter)}
              onChange={(e) => {
                setZoneFilter(e.target.value === "all" ? "all" : Number(e.target.value));
                setPage(0);
              }}
              sx={{ width: { xs: "100%", sm: 240 } }}
            >
              <MenuItem value="all">Все зоны</MenuItem>
              {zones.map((z) => (
                <MenuItem key={z.id} value={String(z.id)}>
                  {z.name} · {z.branchName}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {recordsQuery.isError && (
            <Alert
              severity="error"
              action={
                <Button size="small" color="inherit" onClick={() => recordsQuery.refetch()}>
                  Повторить
                </Button>
              }
            >
              {extractErrorMessage(recordsQuery.error)}
            </Alert>
          )}

          <Box sx={{ flex: 1, minHeight: 0 }}>
            <DataGrid<CleaningRecord>
              rows={rows}
              columns={columns}
              loading={recordsQuery.isLoading}
              rowCount={total}
              paginationMode="server"
              paginationModel={{ page, pageSize: PAGE_SIZE }}
              onPaginationModelChange={(m) => setPage(m.page)}
              pageSizeOptions={[PAGE_SIZE]}
              disableColumnMenu
              disableRowSelectionOnClick
              rowHeight={56}
              columnHeaderHeight={theme.appLayout.table.headerRowHeight}
              localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
              slots={{
                noRowsOverlay: () => (
                  <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", color: "text.secondary" }}>
                    <CleaningServicesOutlined sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="body2">За этот месяц уборок нет</Typography>
                  </Stack>
                ),
              }}
              sx={{
                bgcolor: "background.paper",
                borderRadius: "14px",
                "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
              }}
            />
          </Box>
        </>
      )}

      {tab === "summary" && (
        <Stack gap={1.5} sx={{ flex: 1, minHeight: 0 }}>
          {rate != null && (
            <Typography variant="body2" color="text.secondary">
              Ставка: {formatKGS(rate)} за подтверждённую уборку. В ЗП попадают только
              подтверждённые уборки.
            </Typography>
          )}
          {summaryQuery.isError && (
            <Alert severity="error">{extractErrorMessage(summaryQuery.error)}</Alert>
          )}
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: "14px" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Сотрудник</TableCell>
                  <TableCell align="right">Подтверждено</TableCell>
                  <TableCell align="right">Ждёт</TableCell>
                  <TableCell align="right">Отклонено</TableCell>
                  <TableCell align="right">К выплате</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summaryQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={22} />
                    </TableCell>
                  </TableRow>
                )}
                {!summaryQuery.isLoading && summaryRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3, color: "text.secondary" }}>
                      За этот месяц уборок нет
                    </TableCell>
                  </TableRow>
                )}
                {summaryRows.map((row) => (
                  <TableRow key={row.employeeId} hover>
                    <TableCell>{row.employeeName}</TableCell>
                    <TableCell align="right">{row.approvedCount}</TableCell>
                    <TableCell align="right">{row.pendingCount}</TableCell>
                    <TableCell align="right">{row.rejectedCount}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatKGS(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}

      {/* Диалог отметки уборки */}
      <Dialog open={reportOpen} onClose={closeReport} maxWidth="xs" fullWidth>
        <DialogTitle>Отметить уборку</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              select
              label="Зона"
              size="small"
              fullWidth
              value={reportZoneId === "" ? "" : String(reportZoneId)}
              onChange={(e) => setReportZoneId(Number(e.target.value))}
              disabled={reportBusy}
            >
              {activeZones.map((z) => (
                <MenuItem key={z.id} value={String(z.id)}>
                  {z.name} · {z.branchName}
                </MenuItem>
              ))}
            </TextField>

            {/* Фото */}
            <Stack direction="row" gap={1} flexWrap="wrap">
              {reportPhotos.map((photo, i) => (
                <Box key={photo.url} sx={{ position: "relative" }}>
                  <Box
                    component="img"
                    src={photo.url}
                    alt={`Фото ${i + 1}`}
                    sx={{
                      width: 76,
                      height: 76,
                      objectFit: "cover",
                      borderRadius: 1.5,
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => removePhoto(i)}
                    disabled={reportBusy}
                    sx={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      bgcolor: "background.paper",
                      border: `1px solid ${theme.palette.divider}`,
                      "&:hover": { bgcolor: "background.paper" },
                    }}
                  >
                    <DeleteOutlineOutlined sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              ))}
              {reportPhotos.length < CLEANING_MAX_PHOTOS && (
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={reportBusy}
                  sx={{
                    width: 76,
                    height: 76,
                    minWidth: 76,
                    borderRadius: 1.5,
                    border: `1px dashed ${theme.palette.divider}`,
                    color: "text.secondary",
                    flexDirection: "column",
                    gap: 0.5,
                    fontSize: "0.65rem",
                  }}
                >
                  <AddAPhotoOutlined fontSize="small" />
                  Фото
                </Button>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              От 1 до {CLEANING_MAX_PHOTOS} фото — фотоотчёт обязателен, по нему администратор
              подтверждает уборку.
            </Typography>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              multiple
              accept="image/*"
              onChange={handlePhotosSelect}
            />
            {reportError && <Alert severity="error">{reportError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReport} disabled={reportBusy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleReportSubmit}
            disabled={reportBusy || reportZoneId === "" || reportPhotos.length === 0}
            startIcon={reportBusy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {reportBusy ? "Отправка…" : "Отправить"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Просмотр фото */}
      <Dialog open={viewer !== null} onClose={() => setViewer(null)} maxWidth="md">
        {viewer && (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              {viewer.record.zoneName} · {dayjs(viewer.record.createdAt).format("DD.MM.YYYY HH:mm")}
              <Typography variant="body2" color="text.secondary">
                {viewer.record.employeeName} · фото {viewer.index + 1} из {viewer.record.photos.length}
              </Typography>
            </DialogTitle>
            <DialogContent>
              <Stack direction="row" alignItems="center" gap={1}>
                <IconButton
                  disabled={viewer.index === 0}
                  onClick={() => setViewer({ ...viewer, index: viewer.index - 1 })}
                >
                  <ChevronLeft />
                </IconButton>
                <Box
                  component="img"
                  src={viewer.record.photos[viewer.index].url}
                  alt={`Фото ${viewer.index + 1}`}
                  sx={{ maxWidth: "70vw", maxHeight: "65vh", borderRadius: 1.5, objectFit: "contain" }}
                />
                <IconButton
                  disabled={viewer.index >= viewer.record.photos.length - 1}
                  onClick={() => setViewer({ ...viewer, index: viewer.index + 1 })}
                >
                  <ChevronRight />
                </IconButton>
              </Stack>
            </DialogContent>
            {canManage && viewer.record.status === "pending" && (
              <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button
                  color="error"
                  onClick={() => {
                    setRejectTarget(viewer.record);
                    setRejectReason("");
                    setRejectError(null);
                    setViewer(null);
                  }}
                >
                  Отклонить
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => {
                    void handleApprove(viewer.record);
                    setViewer(null);
                  }}
                >
                  Подтвердить
                </Button>
              </DialogActions>
            )}
          </>
        )}
      </Dialog>

      {/* Диалог отклонения */}
      <Dialog
        open={rejectTarget !== null}
        onClose={reviewBusyId != null ? undefined : () => setRejectTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Отклонить уборку?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {rejectTarget?.zoneName} ·{" "}
              {rejectTarget ? dayjs(rejectTarget.createdAt).format("DD.MM.YYYY HH:mm") : ""} ·{" "}
              {rejectTarget?.employeeName}
            </Typography>
            <TextField
              label="Причина"
              size="small"
              fullWidth
              autoFocus
              multiline
              minRows={2}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              disabled={reviewBusyId != null}
              helperText="Причина обязательна — сотрудник увидит её у записи"
            />
            {rejectError && <Alert severity="error">{rejectError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)} disabled={reviewBusyId != null}>
            Отмена
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleReject}
            disabled={reviewBusyId != null || !rejectReason.trim()}
            startIcon={reviewBusyId != null ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {reviewBusyId != null ? "Отклонение…" : "Отклонить"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CleaningPage;
