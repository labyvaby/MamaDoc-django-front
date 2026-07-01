import React from "react";
import {
  Alert,
  Box,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { CustomDatePicker, PageHeader } from "../../components/ui";
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
import BookingDetailDrawer from "./BookingDetailDrawer";
import { BOOKING_STATUS_META, BOOKING_STATUS_OPTIONS } from "./meta";

const PAGE_SIZE = 20;

const BookingsPage: React.FC = () => {
  usePageTitle("Брони");
  const theme = useTheme();
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
  const enabled = !permLoading && canView && !needsOrg;

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
      { field: "confirmationCode", headerName: "Код", width: 90 },
      {
        field: "patientName",
        headerName: "Пациент",
        flex: 1,
        minWidth: 180,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={{ lineHeight: 1.2 }}>
            <Typography variant="body2">{row.patientName}</Typography>
            {row.patientPhone && (
              <Typography variant="caption" color="text.secondary">
                {row.patientPhone}
              </Typography>
            )}
          </Box>
        ),
      },
      { field: "doctorName", headerName: "Врач", flex: 1, minWidth: 150, sortable: false },
      {
        field: "date",
        headerName: "Дата и время",
        width: 160,
        sortable: false,
        renderCell: ({ row }) =>
          `${dayjs(row.date).format("DD.MM.YYYY")} ${row.time}`,
      },
      {
        field: "totalPrice",
        headerName: "Сумма",
        width: 110,
        sortable: false,
        renderCell: ({ row }) => formatKGS(row.totalPrice),
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
        renderCell: ({ row }) => {
          const m = BOOKING_STATUS_META[row.status];
          return m ? <Chip label={m.label} color={m.color} size="small" /> : row.status;
        },
      },
    ],
    [],
  );

  if (!permLoading && !canView) return <AccessDenied />;

  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;

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
          {/* ── Filters ── */}
          <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center" sx={{ my: 2 }}>
            <CustomDatePicker
              label="С"
              value={dateFrom}
              onChange={(v) => v && setDateFrom(v)}
              format="DD.MM.YYYY"
              slotProps={{ textField: { size: "small", sx: { width: 180 } } }}
            />
            <CustomDatePicker
              label="По"
              value={dateTo}
              onChange={(v) => v && setDateTo(v)}
              format="DD.MM.YYYY"
              slotProps={{ textField: { size: "small", sx: { width: 180 } } }}
            />
            <TextField
              select
              size="small"
              label="Статус"
              value={status}
              onChange={(e) => setStatus(e.target.value as BookingStatus | "")}
              sx={{ width: 170 }}
            >
              <MenuItem value="">Все</MenuItem>
              {BOOKING_STATUS_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
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
          </Stack>

          {query.error ? (
            <Alert severity="error">
              {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
            </Alert>
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
                density="comfortable"
                onRowClick={(p) => setSelectedId(p.row.id)}
                localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
                sx={{
                  bgcolor: "background.paper",
                  borderRadius: "14px",
                  "& .MuiDataGrid-row": { cursor: "pointer" },
                  "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
                }}
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
