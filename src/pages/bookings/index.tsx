import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  IconButton,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ChevronLeftOutlinedIcon from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";

import { DateRangeField, PageHeader, UserAvatar, type DateRangePreset } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import {
  getBookings,
  type BookingListItem,
  type BookingStatus,
} from "../../api/bookings";
import { getDjangoEmployees } from "../../api/staff";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import BookingDetailDrawer from "./BookingDetailDrawer";
import { BOOKING_STATUS_META, BOOKING_STATUS_OPTIONS } from "./meta";

const PAGE_SIZE = 20;
/** Лимит выборки для сводки/счётчиков: 5 страниц по 100. */
const STATS_PAGE_SIZE = 100;
const STATS_MAX_PAGES = 5;

// ── Помощники стилей ──────────────────────────────────────────────────────────

/** Палитра-тон для статуса брони (null — нейтральный). */
function statusTone(t: Theme, status: BookingStatus) {
  switch (BOOKING_STATUS_META[status]?.color) {
    case "warning":
      return t.palette.warning;
    case "info":
      return t.palette.info;
    case "success":
      return t.palette.success;
    case "error":
      return t.palette.error;
    default:
      return null;
  }
}

/** Тонированный статус-чип в стиле карточек проекта. */
const StatusChip: React.FC<{ status: BookingStatus }> = ({ status }) => {
  const m = BOOKING_STATUS_META[status];
  if (!m) return <>{status}</>;
  return (
    <Chip
      size="small"
      label={m.label}
      icon={
        <Box
          component="span"
          sx={(t) => {
            const tone = statusTone(t, status);
            return {
              width: 7,
              height: 7,
              borderRadius: "50%",
              bgcolor: tone ? tone.main : t.palette.grey[500],
              ml: 0.75,
            };
          }}
        />
      }
      sx={(t) => {
        const tone = statusTone(t, status);
        return {
          fontWeight: 500,
          height: 24,
          borderRadius: "7px",
          "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
          color: tone
            ? t.palette.mode === "dark"
              ? tone.light
              : tone.dark
            : "text.secondary",
          bgcolor: tone
            ? alpha(tone.main, t.palette.mode === "dark" ? 0.2 : 0.14)
            : subtleBg(t, true),
        };
      }}
    />
  );
};

/** Компактная плитка сводки: иконка + подпись + значение. */
const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}> = ({ icon, label, value }) => (
  <Stack
    direction="row"
    alignItems="center"
    gap={1.25}
    sx={(t) => ({
      px: 1.5,
      py: 1,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: subtleBg(t),
      minWidth: 150,
    })}
  >
    <Box
      sx={(t) => ({
        width: 34,
        height: 34,
        borderRadius: "9px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "primary.onSurface",
        bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
        "& .MuiSvgIcon-root": { fontSize: 18 },
      })}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="subtitle2" fontWeight={600} noWrap>
        {value}
      </Typography>
    </Box>
  </Stack>
);

// ── Пресеты дат ───────────────────────────────────────────────────────────────

type DatePreset = { key: string; label: string; from: () => Dayjs; to: () => Dayjs };

const DATE_PRESETS: DatePreset[] = [
  { key: "today", label: "Сегодня", from: () => dayjs(), to: () => dayjs() },
  {
    key: "tomorrow",
    label: "Завтра",
    from: () => dayjs().add(1, "day"),
    to: () => dayjs().add(1, "day"),
  },
  {
    key: "week",
    label: "7 дней",
    from: () => dayjs(),
    to: () => dayjs().add(6, "day"),
  },
  {
    key: "month",
    label: "Месяц",
    from: () => dayjs().startOf("month"),
    to: () => dayjs().endOf("month"),
  },
];

// Пресеты для единого поля-диапазона (та же семантика, что и чипы выше).
const BOOKING_RANGE_PRESETS: DateRangePreset[] = DATE_PRESETS.map((p) => ({
  key: p.key,
  label: p.label,
  range: () => [p.from(), p.to()],
}));

const BookingsPage: React.FC = () => {
  usePageTitle("Брони");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const canView = useCan("bookings.view");
  const canManage = useCan("bookings.manage");
  const {
    isSuperAdmin,
    activeOrganization,
    memberships,
    loading: permLoading,
  } = usePermissions();
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const needsOrg = (isSuper || isMultiOrg) && !activeOrganization;
  const organizationId = activeOrganization?.id ?? undefined;
  const orgKey = activeOrganization?.id ?? null;

  // ── Filters ──
  const [dateFrom, setDateFrom] = React.useState(() => dayjs().startOf("month"));
  const [dateTo, setDateTo] = React.useState(() => dayjs().endOf("month"));
  const [status, setStatus] = React.useState<BookingStatus | "">("");
  const [doctorId, setDoctorId] = React.useState<number | "">("");
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);

  // Debounce поиска.
  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Сброс на первую страницу при смене фильтров.
  React.useEffect(() => {
    setPage(0);
  }, [dateFrom, dateTo, status, doctorId, search, orgKey]);

  const fromStr = dateFrom.format("YYYY-MM-DD");
  const toStr = dateTo.format("YYYY-MM-DD");
  const todayStr = dayjs().format("YYYY-MM-DD");
  const enabled = !permLoading && canView && !needsOrg;

  const activePresetKey = React.useMemo(() => {
    const p = DATE_PRESETS.find(
      (p) => dateFrom.isSame(p.from(), "day") && dateTo.isSame(p.to(), "day"),
    );
    return p?.key ?? null;
  }, [dateFrom, dateTo]);

  const hasActiveFilters =
    status !== "" ||
    doctorId !== "" ||
    search !== "" ||
    activePresetKey !== "month";

  const handleResetFilters = () => {
    setStatus("");
    setDoctorId("");
    setSearchInput("");
    setDateFrom(dayjs().startOf("month"));
    setDateTo(dayjs().endOf("month"));
  };

  const filters = {
    dateFrom: fromStr,
    dateTo: toStr,
    status: status === "" ? undefined : status,
    doctorId: doctorId === "" ? undefined : doctorId,
    search: search || undefined,
    organizationId,
  };

  const query = useQuery({
    queryKey: djangoQueryKeys.bookings.list({ ...filters, orgId: orgKey, page: page + 1 }),
    queryFn: ({ signal }) =>
      getBookings({ ...filters, page: page + 1, pageSize: PAGE_SIZE }, signal),
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  // Сводка: та же выборка без фильтра статуса — даёт счётчики по статусам
  // и суммы. Ограничена STATS_MAX_PAGES страницами (флаг truncated).
  const statsFilters = {
    dateFrom: fromStr,
    dateTo: toStr,
    doctorId: doctorId === "" ? undefined : doctorId,
    search: search || undefined,
    organizationId,
  };
  const statsQuery = useQuery({
    queryKey: djangoQueryKeys.bookings.list({
      ...statsFilters,
      orgId: orgKey,
      stats: true,
    }),
    queryFn: async ({ signal }) => {
      let page = 1;
      let all: BookingListItem[] = [];
      let count = 0;
      let truncated = false;
      for (;;) {
        const r = await getBookings(
          { ...statsFilters, page, pageSize: STATS_PAGE_SIZE },
          signal,
        );
        count = r.count;
        all = all.concat(r.results);
        if (!r.next) break;
        if (page >= STATS_MAX_PAGES) {
          truncated = true;
          break;
        }
        page += 1;
      }
      return { all, count, truncated };
    },
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const statusCounts = React.useMemo(() => {
    const counts: Partial<Record<BookingStatus, number>> = {};
    for (const b of statsQuery.data?.all ?? []) {
      counts[b.status] = (counts[b.status] ?? 0) + 1;
    }
    return counts;
  }, [statsQuery.data]);

  // Итоги для текущего выбора статуса.
  const summary = React.useMemo(() => {
    const data = statsQuery.data;
    if (!data) return null;
    const subset = status === "" ? data.all : data.all.filter((b) => b.status === status);
    const sum = subset.reduce((acc, b) => acc + Number(b.totalPrice || 0), 0);
    const count = status === "" ? data.count : subset.length;
    const avg = subset.length > 0 ? sum / subset.length : 0;
    return { count, sum, avg, truncated: data.truncated };
  }, [statsQuery.data, status]);

  const doctorsQuery = useQuery({
    queryKey: [...djangoQueryKeys.reference.employees, "doctors", orgKey],
    queryFn: ({ signal }) =>
      getDjangoEmployees({ status: "active", pageSize: 200 }, signal),
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const doctors = React.useMemo(
    () => (doctorsQuery.data?.results ?? []).filter((e) => e.clinicalRole === "doctor"),
    [doctorsQuery.data],
  );

  const columns = React.useMemo<GridColDef<BookingListItem>[]>(
    () => [
      {
        field: "confirmationCode",
        headerName: "Код",
        width: 90,
        renderCell: ({ row }) => (
          <Typography
            variant="caption"
            sx={{ fontFamily: "monospace", fontWeight: 600, letterSpacing: 0.4 }}
          >
            {row.confirmationCode}
          </Typography>
        ),
      },
      {
        field: "patientName",
        headerName: "Пациент",
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" alignItems="center" gap={1.25} sx={{ height: "100%", minWidth: 0 }}>
            <UserAvatar name={row.patientName} size={32} sx={{ borderRadius: "9px", flexShrink: 0 }} />
            <Box sx={{ lineHeight: 1.2, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={500} noWrap>
                {row.patientName}
              </Typography>
              {row.patientPhone && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {row.patientPhone}
                </Typography>
              )}
            </Box>
          </Stack>
        ),
      },
      { field: "doctorName", headerName: "Врач", flex: 1, minWidth: 150, sortable: false },
      {
        field: "date",
        headerName: "Дата и время",
        width: 170,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ height: "100%" }}>
            <Typography variant="body2">
              {dayjs(row.date).format("DD.MM.YYYY")} {row.time}
            </Typography>
            {row.date === todayStr && (
              <Chip
                label="сегодня"
                size="small"
                sx={(t) => ({
                  height: 18,
                  fontSize: 11,
                  borderRadius: "6px",
                  color: "primary.onSurface",
                  bgcolor: alpha(
                    t.palette.primary.main,
                    t.palette.mode === "dark" ? 0.18 : 0.1,
                  ),
                })}
              />
            )}
          </Stack>
        ),
      },
      {
        field: "totalPrice",
        headerName: "Сумма",
        width: 110,
        sortable: false,
        renderCell: ({ row }) => (
          <Typography variant="body2" fontWeight={600}>
            {formatKGS(row.totalPrice)}
          </Typography>
        ),
      },
      {
        field: "totalDurationMin",
        headerName: "Длит.",
        width: 90,
        sortable: false,
        renderCell: ({ row }) => `${row.totalDurationMin} мин`,
      },
      {
        field: "status",
        headerName: "Статус",
        width: 150,
        sortable: false,
        renderCell: ({ row }) => <StatusChip status={row.status} />,
      },
    ],
    [todayStr],
  );

  if (!permLoading && !canView) return <AccessDenied />;

  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;

  const NoRowsOverlay = () => (
    <Stack
      alignItems="center"
      justifyContent="center"
      sx={{ height: "100%", opacity: 0.75 }}
    >
      <EventBusyOutlinedIcon sx={{ fontSize: 52, color: "text.disabled", mb: 1.5 }} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Броней за выбранный период не найдено
      </Typography>
      {hasActiveFilters && (
        <Button size="small" onClick={handleResetFilters} sx={{ textTransform: "none" }}>
          Сбросить фильтры
        </Button>
      )}
    </Stack>
  );

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Брони"
        showTitle={false}
        showSearch
        searchVal={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Имя, телефон или код"
        loading={query.isFetching}
      />

      {needsOrg ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="info">Выберите организацию, чтобы увидеть брони.</Alert>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            px: theme.appLayout.page.paddingX,
            pb: 2,
          }}
        >
          {/* ── Фильтры: даты + пресеты + врач + сброс ── */}
          <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center" sx={{ mt: 2, mb: 1.5 }}>
            <DateRangeField
              value={{ from: dateFrom, to: dateTo }}
              onChange={(r) => {
                setDateFrom(r.from);
                setDateTo(r.to);
              }}
              presets={BOOKING_RANGE_PRESETS}
              minWidth={220}
            />

            <TextField
              select
              size="small"
              label="Врач"
              value={doctorId === "" ? "" : String(doctorId)}
              onChange={(e) =>
                setDoctorId(e.target.value === "" ? "" : Number(e.target.value))
              }
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">Все врачи</MenuItem>
              {doctors.map((d) => (
                <MenuItem key={d.id} value={String(d.id)}>
                  {d.fullName}
                </MenuItem>
              ))}
            </TextField>

            {hasActiveFilters && (
              <Button
                size="small"
                onClick={handleResetFilters}
                startIcon={<CloseOutlinedIcon fontSize="small" />}
                sx={{ textTransform: "none", flexShrink: 0 }}
              >
                Сбросить
              </Button>
            )}
          </Stack>

          {/* ── Статусы-вкладки со счётчиками ── */}
          <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center" sx={{ mb: 1.5 }}>
            {[
              { value: "" as const, label: "Все", count: statsQuery.data?.count },
              ...BOOKING_STATUS_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                count: statusCounts[o.value] ?? 0,
              })),
            ].map((o) => {
              const active = status === o.value;
              const tone =
                o.value === "" ? null : statusTone(theme, o.value as BookingStatus);
              const accent = tone ? tone.main : theme.palette.primary.main;
              const accentText = tone
                ? theme.palette.mode === "dark"
                  ? tone.light
                  : tone.dark
                : theme.palette.primary.main;
              return (
                <Chip
                  key={o.value || "all"}
                  clickable
                  onClick={() => setStatus(o.value)}
                  label={
                    <Stack direction="row" alignItems="center" gap={0.75}>
                      <span>{o.label}</span>
                      <Box
                        component="span"
                        sx={(t) => ({
                          px: 0.75,
                          borderRadius: "6px",
                          fontSize: 11,
                          fontWeight: 600,
                          lineHeight: "16px",
                          color: active ? accentText : "text.secondary",
                          bgcolor: active
                            ? alpha(accent, t.palette.mode === "dark" ? 0.3 : 0.16)
                            : subtleBg(t, true),
                        })}
                      >
                        {o.count ?? "…"}
                      </Box>
                    </Stack>
                  }
                  sx={(t) => ({
                    height: 30,
                    borderRadius: "8px",
                    fontWeight: 500,
                    border: 1,
                    borderColor: active ? alpha(accent, 0.4) : "divider",
                    color: active ? accentText : "text.secondary",
                    bgcolor: active
                      ? alpha(accent, t.palette.mode === "dark" ? 0.16 : 0.08)
                      : "transparent",
                    "&:hover": {
                      bgcolor: active
                        ? alpha(accent, t.palette.mode === "dark" ? 0.22 : 0.12)
                        : subtleBg(t, true),
                    },
                  })}
                />
              );
            })}

            <Box sx={{ flex: 1 }} />

            {/* ── Итоги за период ── */}
            {summary && (
              <Stack direction="row" gap={1} flexWrap="wrap">
                <StatTile
                  icon={<EventAvailableOutlinedIcon />}
                  label="Броней"
                  value={summary.count}
                />
                <StatTile
                  icon={<PaymentsOutlinedIcon />}
                  label="Сумма"
                  value={`${summary.truncated ? "≈ " : ""}${formatKGS(summary.sum)}`}
                />
                <StatTile
                  icon={<ReceiptLongOutlinedIcon />}
                  label="Средний чек"
                  value={`${summary.truncated ? "≈ " : ""}${formatKGS(Math.round(summary.avg))}`}
                />
              </Stack>
            )}
          </Stack>

          {query.error ? (
            <Alert severity="error">
              {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
            </Alert>
          ) : isMobile ? (
            /* ── Мобильный карточный список ── */
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: 1 }}>
              {query.isLoading ? (
                <Stack spacing={1}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} variant="rounded" height={72} />
                  ))}
                </Stack>
              ) : rows.length === 0 ? (
                <Stack alignItems="center" sx={{ py: 6, opacity: 0.75 }}>
                  <EventBusyOutlinedIcon
                    sx={{ fontSize: 52, color: "text.disabled", mb: 1.5 }}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Броней за выбранный период не найдено
                  </Typography>
                  {hasActiveFilters && (
                    <Button
                      size="small"
                      onClick={handleResetFilters}
                      sx={{ textTransform: "none" }}
                    >
                      Сбросить фильтры
                    </Button>
                  )}
                </Stack>
              ) : (
                <Stack spacing={1}>
                  {rows.map((b) => (
                    <ButtonBase
                      key={b.id}
                      focusRipple
                      onClick={() => setSelectedId(b.id)}
                      sx={(t) => ({
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                        width: "100%",
                        textAlign: "left",
                        p: 1.25,
                        borderRadius: "14px",
                        border: 1,
                        borderColor: "divider",
                        bgcolor:
                          b.date === todayStr
                            ? alpha(
                                t.palette.primary.main,
                                t.palette.mode === "dark" ? 0.07 : 0.045,
                              )
                            : "background.paper",
                        "&:hover": {
                          borderColor: alpha(t.palette.primary.main, 0.28),
                        },
                      })}
                    >
                      <UserAvatar
                        name={b.patientName}
                        size={40}
                        sx={{ borderRadius: "10px", flexShrink: 0 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {b.patientName}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                          display="block"
                        >
                          {b.doctorName || "—"}
                        </Typography>
                        <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 0.25 }}>
                          <Typography variant="caption" color="text.secondary">
                            {dayjs(b.date).format("DD.MM.YYYY")} {b.time}
                          </Typography>
                          {b.date === todayStr && (
                            <Chip
                              label="сегодня"
                              size="small"
                              sx={(t) => ({
                                height: 16,
                                fontSize: 10,
                                borderRadius: "5px",
                                color: "primary.onSurface",
                                bgcolor: alpha(
                                  t.palette.primary.main,
                                  t.palette.mode === "dark" ? 0.18 : 0.1,
                                ),
                              })}
                            />
                          )}
                        </Stack>
                      </Box>
                      <Stack alignItems="flex-end" gap={0.5} sx={{ flexShrink: 0 }}>
                        <Typography variant="body2" fontWeight={600} whiteSpace="nowrap">
                          {formatKGS(b.totalPrice)}
                        </Typography>
                        <StatusChip status={b.status} />
                      </Stack>
                    </ButtonBase>
                  ))}

                  {/* Пагинация */}
                  {total > PAGE_SIZE && (
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="center"
                      gap={1}
                      sx={{ pt: 0.5 }}
                    >
                      <IconButton
                        size="small"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        <ChevronLeftOutlinedIcon fontSize="small" />
                      </IconButton>
                      <Typography variant="caption" color="text.secondary">
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}
                      </Typography>
                      <IconButton
                        size="small"
                        disabled={(page + 1) * PAGE_SIZE >= total}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRightOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  )}
                </Stack>
              )}
            </Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 360 }}>
              <DataGrid<BookingListItem>
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
                /* Не density="comfortable": тема зажимает .MuiDataGrid-columnHeaders
                   до headerRowHeight (52px), а comfortable раздувает ячейки шапки до
                   72px — они закрашивали верх первой строки. Высоты задаём явно. */
                rowHeight={64}
                columnHeaderHeight={theme.appLayout.table.headerRowHeight}
                onRowClick={(p) => setSelectedId(p.row.id)}
                getRowClassName={(p) => (p.row.date === todayStr ? "row-today" : "")}
                slots={{ noRowsOverlay: NoRowsOverlay }}
                localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
                sx={(t) => ({
                  bgcolor: "background.paper",
                  borderRadius: "14px",
                  "& .MuiDataGrid-row": { cursor: "pointer" },
                  "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
                  // Центрируем контент ячеек флексом: голая Typography из renderCell
                  // иначе прилипает к верху строки (v7 центрирует line-height'ом).
                  "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
                  "& .row-today": {
                    bgcolor: alpha(
                      t.palette.primary.main,
                      t.palette.mode === "dark" ? 0.07 : 0.045,
                    ),
                    "&:hover": {
                      bgcolor: alpha(
                        t.palette.primary.main,
                        t.palette.mode === "dark" ? 0.11 : 0.08,
                      ),
                    },
                  },
                })}
              />
            </Box>
          )}
        </Box>
      )}

      <BookingDetailDrawer
        bookingId={selectedId}
        canManage={canManage}
        onClose={() => setSelectedId(null)}
      />
    </Box>
  );
};

export default BookingsPage;
