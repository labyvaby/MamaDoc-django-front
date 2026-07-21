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
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/ru";

import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import AddAPhotoOutlined from "@mui/icons-material/AddAPhotoOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import FormatListBulletedOutlined from "@mui/icons-material/FormatListBulletedOutlined";
import SummarizeOutlined from "@mui/icons-material/SummarizeOutlined";

import { usePageTitle } from "../../hooks/usePageTitle";
import { useModuleGate } from "../../hooks/useModuleGate";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { alpha, useTheme } from "@mui/material/styles";
import {
  ListEmptyState,
  MonthNavigation,
  PageHeader,
  SegmentedTabs,
  cascadeContainer,
  cascadeItem,
} from "../../components/ui";
import { ApiError, getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  CLEANING_USE_MOCKS,
  approveCleaningRecord,
  deleteCleaningRecord,
  getCleaningActiveMonths,
  getCleaningRecords,
  getCleaningSummary,
  getCleaningTypes,
  type CleaningRecord,
  type CleaningRecordStatus,
} from "../../api/cleaning";
import ReportDialog from "./ReportDialog";
import PhotoViewerDialog from "./PhotoViewerDialog";
import RejectDialog from "./RejectDialog";
import SummaryTable from "./SummaryTable";

dayjs.locale("ru");

const MotionBox = motion(Box);

const PAGE_SIZE = 20;

const STATUS_META: Record<
  CleaningRecordStatus,
  { label: string; color: "warning" | "success" | "error" }
> = {
  pending: { label: "Ждёт подтверждения", color: "warning" },
  approved: { label: "Подтверждена", color: "success" },
  rejected: { label: "Отклонена", color: "error" },
};

/** Статус-чип по гайду §5.5: точка + текст на статус-тинте, радиус 7px. */
const StatusChip: React.FC<{ status: CleaningRecordStatus }> = ({ status }) => {
  const meta = STATUS_META[status];
  return (
    <Box
      sx={(t) => {
        const c = t.palette[meta.color];
        return {
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          height: 24,
          px: 1,
          borderRadius: "7px",
          fontSize: "0.75rem",
          fontWeight: 500,
          whiteSpace: "nowrap",
          bgcolor: alpha(c.main, t.palette.mode === "dark" ? 0.2 : 0.14),
          color: t.palette.mode === "dark" ? c.light : c.dark,
        };
      }}
    >
      <Box
        sx={(t) => ({
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: t.palette[meta.color].main,
          flexShrink: 0,
        })}
      />
      {meta.label}
    </Box>
  );
};

const CleaningPage: React.FC = () => {
  usePageTitle("Уборка");
  const theme = useTheme();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const { moduleGate } = useModuleGate();

  // Доступ к странице гейтит RequireModule (App.tsx); здесь — права на действия.
  // В демо-режиме открыты всем, после выключения CLEANING_USE_MOCKS начнут
  // требовать право автоматически (см. useModuleGate).
  const canReport = moduleGate("cleaning", ["cleaning.report"]);
  const canManage = moduleGate("cleaning", ["cleaning.manage"]);
  // Форму «Отметить уборку» открывает и уборщица (на себя), и менеджер
  // (с ручным назначением исполнителя). У менеджера может не быть cleaning.report.
  const canCreate = canReport || canManage;

  const [tab, setTab] = React.useState<"records" | "summary">("records");
  const [month, setMonth] = React.useState<Dayjs>(dayjs().startOf("month"));
  const [statusFilter, setStatusFilter] = React.useState<CleaningRecordStatus | "all">("all");
  const [typeFilter, setTypeFilter] = React.useState<number | "all">("all");
  const [page, setPage] = React.useState(0); // 0-based для DataGrid

  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const monthStr = month.format("YYYY-MM");

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: djangoQueryKeys.cleaning.all }),
    [queryClient],
  );

  // ── Данные ────────────────────────────────────────────────────────────────
  const typesQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.types({ orgId: orgId ?? null }),
    queryFn: ({ signal }) => getCleaningTypes({ organizationId: orgId }, signal),
  });
  const types = typesQuery.data ?? [];
  const activeTypes = types.filter((t) => t.isActive);

  const recordsQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.records({
      month: monthStr,
      status: statusFilter,
      type: typeFilter,
      page,
      orgId: orgId ?? null,
    }),
    queryFn: ({ signal }) =>
      getCleaningRecords(
        {
          dateFrom: month.format("YYYY-MM-DD"),
          dateTo: month.endOf("month").format("YYYY-MM-DD"),
          status: statusFilter === "all" ? undefined : statusFilter,
          type: typeFilter === "all" ? undefined : typeFilter,
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

  // Лента месяцев: показываем только месяцы, где были уборки, + текущий
  // (уборщица работает в нём с первого дня). Будущие месяцы в набор не
  // попадают и потому скрыты. Пока список не загружен (null) — без фильтра.
  const monthsQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.activeMonths(orgId ?? null),
    queryFn: ({ signal }) => getCleaningActiveMonths(orgId, signal),
  });
  const activeMonths = React.useMemo(() => {
    if (!monthsQuery.data) return null;
    return new Set([...monthsQuery.data, dayjs().format("YYYY-MM")]);
  }, [monthsQuery.data]);

  // ── Диалоги ───────────────────────────────────────────────────────────────
  const [reportOpen, setReportOpen] = React.useState(false);
  const [viewer, setViewer] = React.useState<{ record: CleaningRecord; index: number } | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<CleaningRecord | null>(null);

  // ── Подтверждение ─────────────────────────────────────────────────────────
  const [reviewBusyId, setReviewBusyId] = React.useState<number | null>(null);

  // ── Удаление записи ───────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = React.useState<CleaningRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteCleaningRecord(deleteTarget.id, orgId);
      notify?.({ type: "success", message: "Запись удалена" });
      setDeleteTarget(null);
      invalidate();
    } catch (err) {
      // 409 — approved-запись в замороженном месяце ЗП (зеркалит approve):
      // удаление изменило бы закрытый период, бэк не даёт до разморозки.
      setDeleteError(
        err instanceof ApiError && err.status === 409
          ? "Месяц закрыт в зарплате — удалить подтверждённую уборку нельзя, пока бухгалтер не разморозит период."
          : getErrorMessage(err),
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  // useCallback с orgId в зависимостях: колонки мемоизированы и без этого
  // захватывали бы orgId на момент первого рендера (stale closure).
  const handleApprove = React.useCallback(
    async (record: CleaningRecord) => {
      setReviewBusyId(record.id);
      try {
        await approveCleaningRecord(record.id, orgId);
        notify?.({ type: "success", message: "Уборка подтверждена" });
        invalidate();
      } catch (err) {
        // 409 — месяц уже заморожен в ЗП (бухгалтер закрыл период): повтор без
        // разморозки бессмыслен, показываем понятную причину (guide §3.4).
        const description =
          err instanceof ApiError && err.status === 409
            ? "Месяц закрыт в зарплате — подтверждение недоступно, пока бухгалтер не разморозит период."
            : getErrorMessage(err);
        notify?.({ type: "error", message: "Не удалось подтвердить", description });
      } finally {
        setReviewBusyId(null);
      }
    },
    [orgId, notify, invalidate],
  );

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
        field: "typeName",
        headerName: "Тип уборки",
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: (p) => (
          <Stack sx={{ minWidth: 0, justifyContent: "center", height: "100%" }}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {p.row.typeName}
            </Typography>
            {p.row.branchName && (
              <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: "text.secondary" }}>
                <StoreOutlined sx={{ fontSize: 14 }} />
                <Typography variant="caption" noWrap>
                  {p.row.branchName}
                </Typography>
              </Stack>
            )}
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
          const chip = <StatusChip status={p.row.status} />;
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
          return (
            <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>{chip}</Box>
          );
        },
      },
      {
        field: "actions",
        headerName: "",
        width: canManage ? 132 : 20,
        sortable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (p) => {
          if (!canManage) return null;
          return (
            <Stack direction="row" gap={0.25} alignItems="center" sx={{ height: "100%" }}>
              {reviewBusyId === p.row.id ? (
                <CircularProgress size={18} />
              ) : (
                <>
                  {p.row.status === "pending" && (
                    <>
                      <Tooltip title="Подтвердить">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleApprove(p.row)}
                        >
                          <CheckOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Отклонить">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setRejectTarget(p.row)}
                        >
                          <CloseOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  {/* Удаление — для любого статуса: исправление ошибочных
                      подтверждений/дублей (тикет cleaning-record-cancel). */}
                  <Tooltip title="Удалить запись">
                    <IconButton size="small" onClick={() => setDeleteTarget(p.row)}>
                      <DeleteOutlineOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
          );
        },
      },
    ],
    [canManage, reviewBusyId, theme.palette.divider, handleApprove],
  );

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Уборка"
        showTitle={false}
        onAdd={canCreate ? () => setReportOpen(true) : undefined}
        addButtonText="Отметить уборку"
        addButtonIcon={<AddAPhotoOutlined />}
        dateNavigation={
          <MonthNavigation
            date={month.format("YYYY-MM-DD")}
            setDate={(d) => {
              setMonth(dayjs(d).startOf("month"));
              setPage(0);
            }}
            activeMonths={activeMonths}
          />
        }
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
        <MotionBox
          variants={cascadeItem}
          sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}
        >
          <SegmentedTabs<"records" | "summary">
            layoutId="cleaning-tabs"
            value={tab}
            onChange={setTab}
            tabs={[
              {
                key: "records",
                label: "Записи",
                icon: <FormatListBulletedOutlined />,
                badge: recordsQuery.data ? total : undefined,
              },
              { key: "summary", label: "Сводка за месяц", icon: <SummarizeOutlined /> },
            ]}
          />
          {CLEANING_USE_MOCKS && (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label="Демо-данные"
              sx={{ borderRadius: "7px" }}
            />
          )}
        </MotionBox>

        {tab === "records" && (
          <>
            {/* Фильтры */}
            <MotionBox
              variants={cascadeItem}
              sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1.5 }}
            >
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
              label="Тип уборки"
              value={String(typeFilter)}
              onChange={(e) => {
                setTypeFilter(e.target.value === "all" ? "all" : Number(e.target.value));
                setPage(0);
              }}
              sx={{ width: { xs: "100%", sm: 240 } }}
            >
              <MenuItem value="all">Все типы</MenuItem>
              {types.map((t) => (
                <MenuItem key={t.id} value={String(t.id)}>
                  {t.name}
                </MenuItem>
              ))}
            </TextField>
            </MotionBox>

          {typesQuery.isError && (
            <Alert
              severity="error"
              action={
                <Button size="small" color="inherit" onClick={() => typesQuery.refetch()}>
                  Повторить
                </Button>
              }
            >
              Не удалось загрузить типы уборки: {getErrorMessage(typesQuery.error)}
            </Alert>
          )}
          {recordsQuery.isError && (
            <Alert
              severity="error"
              action={
                <Button size="small" color="inherit" onClick={() => recordsQuery.refetch()}>
                  Повторить
                </Button>
              }
            >
              {getErrorMessage(recordsQuery.error)}
            </Alert>
          )}

          <MotionBox variants={cascadeItem} sx={{ flex: 1, minHeight: 0 }}>
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
              columnVisibilityModel={{ employeeName: !isMobile }}
              localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
              slots={{
                noRowsOverlay: () => (
                  <ListEmptyState
                    icon={<CleaningServicesOutlined />}
                    title="За этот месяц уборок нет"
                    description={
                      canCreate
                        ? "Отметьте уборку с фотоотчётом — администратор подтвердит её, и она попадёт в зарплату."
                        : "Здесь появятся записи с фотоотчётами, когда сотрудники начнут отмечать уборки."
                    }
                    action={
                      canCreate ? (
                        <Button
                          variant="outlined"
                          startIcon={<AddAPhotoOutlined />}
                          onClick={() => setReportOpen(true)}
                        >
                          Отметить уборку
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
              }}
            />
          </MotionBox>
        </>
      )}

      {tab === "summary" && (
        <MotionBox
          variants={cascadeItem}
          sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          <SummaryTable
            rows={summaryQuery.data ?? []}
            loading={summaryQuery.isLoading}
            error={summaryQuery.isError ? getErrorMessage(summaryQuery.error) : null}
          />
        </MotionBox>
      )}
      </MotionBox>

      <ReportDialog
        open={reportOpen}
        activeTypes={activeTypes}
        canAssign={canManage}
        onClose={() => setReportOpen(false)}
        onSuccess={invalidate}
      />
      <PhotoViewerDialog
        record={viewer?.record ?? null}
        initialIndex={viewer?.index ?? 0}
        canManage={canManage}
        onClose={() => setViewer(null)}
        onApprove={(record) => void handleApprove(record)}
        onReject={setRejectTarget}
      />
      <RejectDialog
        record={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSuccess={invalidate}
      />

      {/* Удаление записи об уборке */}
      <Dialog
        open={deleteTarget !== null}
        onClose={deleteBusy ? undefined : () => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Удалить запись об уборке?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {deleteTarget?.typeName}
            {deleteTarget?.employeeName ? ` · ${deleteTarget.employeeName}` : ""} будет
            удалена вместе с фотоотчётом, без возможности восстановления.
          </Typography>
          {deleteTarget?.status === "approved" && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              Уборка подтверждена и учтена в зарплате — после удаления сумма за
              этот месяц у сотрудника уменьшится.
            </Alert>
          )}
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

export default CleaningPage;
