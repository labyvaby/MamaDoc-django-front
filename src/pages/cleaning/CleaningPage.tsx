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
import EditOutlined from "@mui/icons-material/EditOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import FormatListBulletedOutlined from "@mui/icons-material/FormatListBulletedOutlined";
import SummarizeOutlined from "@mui/icons-material/SummarizeOutlined";

import { usePageTitle } from "../../hooks/usePageTitle";
import { useModuleGate } from "../../hooks/useModuleGate";
import { useActiveScope } from "../../hooks/useActiveScope";
import { useTheme } from "@mui/material/styles";
import {
  ListEmptyState,
  ListLoadingSkeleton,
  MonthNavigation,
  PageHeader,
  SegmentedTabs,
  UserAvatar,
  cascadeContainer,
  cascadeItem,
} from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
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
  isCleaningBackdated,
  updateCleaningRecordType,
  type CleaningRecord,
  type CleaningRecordStatus,
} from "../../api/cleaning";
import { cleaningDateTooltip, formatCleaningDate } from "./recordDate";
import ReportDialog from "./ReportDialog";
import PhotoViewerDialog from "./PhotoViewerDialog";
import RejectDialog from "./RejectDialog";
import SummaryTable from "./SummaryTable";
import PhotoStrip, { fitPhotoCount } from "./PhotoStrip";
import RecordCard from "./RecordCard";
import StatusTiles, { type StatusCounts } from "./StatusTiles";
import { StatusChip } from "./meta";

dayjs.locale("ru");

const MotionBox = motion(Box);

const PAGE_SIZE = 20;

const CleaningPage: React.FC = () => {
  usePageTitle("Уборка");
  const theme = useTheme();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  // Скоуп страницы: организация + активный филиал. Уборка — событие филиала, и
  // бэк по сессии его не сужает (без явного `branch` в query отдаются все
  // филиалы организации, см. аудит скоупинга), поэтому филиал передаём сами.
  // branchId undefined (суперадмин без выбранного филиала) = вся организация,
  // как было раньше.
  const { organizationId: orgId, branchId } = useActiveScope();
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

  // Карточный вид — по md: телефон попадает в брейкпоинт sm (360px), поэтому
  // граница "мобильного" в проекте всегда 768 (см. docs/ui-style-guide.md).
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
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
      branchId: branchId ?? null,
    }),
    queryFn: ({ signal }) =>
      getCleaningRecords(
        {
          dateFrom: month.format("YYYY-MM-DD"),
          dateTo: month.endOf("month").format("YYYY-MM-DD"),
          status: statusFilter === "all" ? undefined : statusFilter,
          type: typeFilter === "all" ? undefined : typeFilter,
          branch: branchId,
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

  // Счётчики для плиток-фильтров. Отдельного эндпоинта со сводкой по статусам
  // нет, но DRF отдаёт `count` в пагинации — три запроса по одной строке
  // дешевле, чем выгружать месяц целиком. Фильтр по типу учитываем: иначе
  // числа на плитках не сходились бы с таблицей.
  const statusCountsQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.records({
      month: monthStr,
      type: typeFilter,
      counts: true,
      orgId: orgId ?? null,
      branchId: branchId ?? null,
    }),
    queryFn: async ({ signal }): Promise<StatusCounts> => {
      const statuses: CleaningRecordStatus[] = ["pending", "approved", "rejected"];
      const responses = await Promise.all(
        statuses.map((status) =>
          getCleaningRecords(
            {
              dateFrom: month.format("YYYY-MM-DD"),
              dateTo: month.endOf("month").format("YYYY-MM-DD"),
              status,
              type: typeFilter === "all" ? undefined : typeFilter,
              branch: branchId,
              page: 1,
              pageSize: 1,
              organizationId: orgId,
            },
            signal,
          ),
        ),
      );
      return {
        pending: responses[0].count,
        approved: responses[1].count,
        rejected: responses[2].count,
      };
    },
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.summary({
      month: monthStr,
      orgId: orgId ?? null,
      branchId: branchId ?? null,
    }),
    queryFn: ({ signal }) =>
      getCleaningSummary(
        { month: monthStr, branch: branchId, organizationId: orgId },
        signal,
      ),
    enabled: tab === "summary",
  });

  // Лента месяцев: показываем только месяцы, где были уборки, + текущий
  // (уборщица работает в нём с первого дня). Будущие месяцы в набор не
  // попадают и потому скрыты. Пока список не загружен (null) — без фильтра.
  const monthsQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.activeMonths({
      orgId: orgId ?? null,
      branchId: branchId ?? null,
    }),
    queryFn: ({ signal }) =>
      getCleaningActiveMonths({ organizationId: orgId, branch: branchId }, signal),
  });
  const activeMonths = React.useMemo(() => {
    if (!monthsQuery.data) return null;
    return new Set([...monthsQuery.data, dayjs().format("YYYY-MM")]);
  }, [monthsQuery.data]);

  // ── Диалоги ───────────────────────────────────────────────────────────────
  const [reportOpen, setReportOpen] = React.useState(false);
  const [viewer, setViewer] = React.useState<{ record: CleaningRecord; index: number } | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<CleaningRecord | null>(null);

  // ── Исправление типа уборки ──────────────────────────────────────────────
  const [typeEditTarget, setTypeEditTarget] = React.useState<CleaningRecord | null>(null);
  const [typeEditId, setTypeEditId] = React.useState<number | "">("");
  const [typeEditBusy, setTypeEditBusy] = React.useState(false);
  const [typeEditError, setTypeEditError] = React.useState<string | null>(null);

  const openTypeEdit = React.useCallback((record: CleaningRecord) => {
    setTypeEditTarget(record);
    setTypeEditId(record.typeId);
    setTypeEditError(null);
  }, []);

  const handleTypeEdit = async () => {
    if (!typeEditTarget || typeEditId === "") return;
    setTypeEditBusy(true);
    setTypeEditError(null);
    try {
      await updateCleaningRecordType(typeEditTarget.id, typeEditId, orgId);
      notify?.({ type: "success", message: "Тип уборки изменён" });
      setTypeEditTarget(null);
      invalidate();
    } catch (err) {
      setTypeEditError(
        err instanceof ApiError && err.status === 409
          ? "Месяц закрыт в зарплате — тип подтверждённой уборки нельзя изменить, пока бухгалтер не разморозит период."
          : getErrorMessage(err),
      );
    } finally {
      setTypeEditBusy(false);
    }
  };

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

  // Один пустой экран на оба представления — таблицу и карточки.
  const emptyState = (
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
  );

  // ── Колонки ───────────────────────────────────────────────────────────────
  const columns = React.useMemo<GridColDef<CleaningRecord>[]>(
    () => [
      {
        // Дата уборки (performedAt), а не момент создания записи: по ней бэк
        // считает месяц, сводку и ЗП. Момент создания — в тултипе.
        field: "performedAt",
        headerName: "Дата",
        width: 140,
        sortable: false,
        renderCell: (p) => (
          <Tooltip title={cleaningDateTooltip(p.row)}>
            <Stack sx={{ minWidth: 0, justifyContent: "center", height: "100%" }}>
              <Typography variant="body2" noWrap>
                {formatCleaningDate(p.row)}
              </Typography>
              {isCleaningBackdated(p.row) && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  задним числом
                </Typography>
              )}
            </Stack>
          </Tooltip>
        ),
      },
      {
        // Ширина фиксированная: раньше колонка была flex и забирала весь
        // свободный простор под короткое «Ежедневная уборка», из-за чего
        // фотоотчёту оставалось 150px на 15 снимков. Теперь простор у «Фото».
        field: "typeName",
        headerName: "Тип уборки",
        width: 230,
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
        flex: 0.6,
        minWidth: 200,
        sortable: false,
        renderCell: (p) => (
          <Stack direction="row" alignItems="center" gap={1} sx={{ height: "100%", minWidth: 0 }}>
            <UserAvatar name={p.row.employeeName} size={28} />
            <Typography variant="body2" noWrap>
              {p.row.employeeName}
            </Typography>
          </Stack>
        ),
      },
      {
        // Фотоотчёт — главное содержимое строки, поэтому свободное место отдано
        // ему: сколько миниатюр влезло, столько и показываем, остальные — «+N».
        field: "photos",
        headerName: "Фото",
        flex: 1,
        minWidth: 160,
        // Больше 15 снимков в записи не бывает (CLEANING_MAX_PHOTOS), поэтому
        // шире ленты колонке расти незачем — остаток ширины уходит соседям.
        maxWidth: 660,
        sortable: false,
        renderCell: (p) => (
          <Stack direction="row" alignItems="center" sx={{ height: "100%", minWidth: 0 }}>
            <PhotoStrip
              photos={p.row.photos}
              maxVisible={fitPhotoCount(p.colDef.computedWidth)}
              onOpen={(index) => setViewer({ record: p.row, index })}
            />
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
        width: canManage ? 164 : 20,
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
                  <Tooltip title="Изменить тип уборки">
                    <IconButton size="small" onClick={() => openTypeEdit(p.row)}>
                      <EditOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
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
    [canManage, reviewBusyId, handleApprove, openTypeEdit],
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
            {/* Статус — плитками: видно и распределение за месяц, и сколько
                записей ждёт решения, а клик работает как фильтр. */}
            <MotionBox variants={cascadeItem}>
              <StatusTiles
                counts={statusCountsQuery.data ?? null}
                value={statusFilter}
                loading={statusCountsQuery.isLoading}
                onChange={(v) => {
                  setStatusFilter(v);
                  setPage(0);
                }}
              />
            </MotionBox>

            {/* Фильтры */}
            <MotionBox
              variants={cascadeItem}
              sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1.5 }}
            >
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

          <MotionBox
            variants={cascadeItem}
            sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          >
            {isMobile ? (
              <>
                <Stack gap={1.25} sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: 1 }}>
                  {recordsQuery.isLoading && rows.length === 0 && <ListLoadingSkeleton rows={4} />}
                  {!recordsQuery.isLoading && rows.length === 0 && emptyState}
                  {rows.map((row) => (
                    <RecordCard
                      key={row.id}
                      record={row}
                      canManage={canManage}
                      busy={reviewBusyId === row.id}
                      onOpenPhoto={(index) => setViewer({ record: row, index })}
                      onApprove={(r) => void handleApprove(r)}
                      onReject={setRejectTarget}
                      onEditType={openTypeEdit}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </Stack>
                {total > PAGE_SIZE && (
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ pt: 0.5 }}
                  >
                    <Button
                      size="small"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      Назад
                    </Button>
                    <Typography variant="caption" color="text.secondary">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}
                    </Typography>
                    <Button
                      size="small"
                      disabled={(page + 1) * PAGE_SIZE >= total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Вперёд
                    </Button>
                  </Stack>
                )}
              </>
            ) : (
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
              slots={{ noRowsOverlay: () => emptyState }}
              sx={{
                bgcolor: "background.paper",
                borderRadius: "14px",
                "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
                // Строка целиком ведёт себя как «карточка» отчёта: подсветка
                // помогает не потерять нужную при 20 записях на странице.
                "& .MuiDataGrid-row:hover": { bgcolor: subtleBg(theme, true) },
              }}
            />
            )}
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
        canBackdate={canManage}
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

      {/* Исправление типа доступно для pending/approved/rejected: статус записи
          не меняется. В уже закрытой зарплате бэкенд безопасно вернёт 409. */}
      <Dialog
        open={typeEditTarget !== null}
        onClose={typeEditBusy ? undefined : () => setTypeEditTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Изменить тип уборки</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {typeEditTarget?.employeeName ? `${typeEditTarget.employeeName} · ` : ""}
            {typeEditTarget ? formatCleaningDate(typeEditTarget) : ""}
          </Typography>
          <TextField
            select
            fullWidth
            label="Тип уборки"
            value={typeEditId === "" ? "" : String(typeEditId)}
            onChange={(event) => setTypeEditId(Number(event.target.value))}
            disabled={typeEditBusy}
          >
            {activeTypes.map((type) => (
              <MenuItem key={type.id} value={String(type.id)}>
                {type.name} · {type.rate} сом
              </MenuItem>
            ))}
          </TextField>
          {typeEditTarget?.status === "approved" && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              Уборка уже учтена в зарплате. После сохранения её сумма изменится
              по ставке выбранного типа.
            </Alert>
          )}
          {typeEditError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {typeEditError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTypeEditTarget(null)} disabled={typeEditBusy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleTypeEdit}
            disabled={typeEditBusy || typeEditId === ""}
            startIcon={typeEditBusy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {typeEditBusy ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogActions>
      </Dialog>

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
