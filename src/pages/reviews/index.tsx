import React from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Rating,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";
import dayjs from "dayjs";

import { DateRangeField, PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import {
  getReviews,
  getReviewStats,
  type Review,
  type ReviewSentiment,
} from "../../api/reviews";
import { getDjangoEmployees } from "../../api/staff";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { SENTIMENT_META, SENTIMENT_OPTIONS } from "./meta";

const PAGE_SIZE = 20;

// ── Stat card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  color?: string;
}> = ({ label, value, hint, color }) => (
  <Paper
    variant="outlined"
    sx={{ p: 2, borderRadius: "14px", flex: "1 1 160px", minWidth: 150 }}
  >
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="h5" fontWeight={700} sx={{ color, mt: 0.5 }}>
      {value}
    </Typography>
    {hint && (
      <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>
        {hint}
      </Typography>
    )}
  </Paper>
);

// ── Page ──────────────────────────────────────────────────────────────────────

const ReviewsPage: React.FC = () => {
  usePageTitle("Отзывы");
  const theme = useTheme();
  const canView = useCan("reviews.view");
  const canManage = useCan("reviews.manage");
  const {
    isSuperAdmin,
    activeOrganization,
    memberships,
    loading: permLoading,
  } = usePermissions();
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const needsOrg = (isSuper || isMultiOrg) && !activeOrganization;
  const organizationId = isSuper ? activeOrganization?.id ?? undefined : undefined;
  const orgKey = isSuper ? activeOrganization?.id ?? null : null;

  // ── Filters ──
  const [from, setFrom] = React.useState(() => dayjs().startOf("month"));
  const [to, setTo] = React.useState(() => dayjs().endOf("month"));
  const [rating, setRating] = React.useState<number | "">("");
  const [sentiment, setSentiment] = React.useState<ReviewSentiment | "">("");
  const [doctorId, setDoctorId] = React.useState<number | "">("");
  const [page, setPage] = React.useState(0); // 0-based for TablePagination

  // Reset to first page whenever a filter changes.
  React.useEffect(() => {
    setPage(0);
  }, [from, to, rating, sentiment, doctorId, orgKey]);

  const fromStr = from.format("YYYY-MM-DD");
  const toStr = to.format("YYYY-MM-DD");

  const filters = {
    from: fromStr,
    to: toStr,
    rating: rating === "" ? undefined : rating,
    sentiment: sentiment === "" ? undefined : sentiment,
    doctorId: doctorId === "" ? undefined : doctorId,
    organizationId,
  };

  const enabled = !permLoading && canView && !needsOrg;

  const statsQuery = useQuery({
    queryKey: djangoQueryKeys.reviews.stats({ from: fromStr, to: toStr, orgId: orgKey }),
    queryFn: ({ signal }) =>
      getReviewStats({ from: fromStr, to: toStr, organizationId }, signal),
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const listQuery = useQuery({
    queryKey: djangoQueryKeys.reviews.list({
      ...filters,
      orgId: orgKey,
      page: page + 1,
    }),
    queryFn: ({ signal }) =>
      getReviews({ ...filters, page: page + 1, pageSize: PAGE_SIZE }, signal),
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  // Doctors for the filter dropdown.
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

  const refreshAll = () => {
    void statsQuery.refetch();
    void listQuery.refetch();
  };

  if (!permLoading && !canView) return <AccessDenied />;

  const stats = statsQuery.data;
  const reviews = listQuery.data?.results ?? [];
  const total = listQuery.data?.count ?? 0;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Отзывы"
        showTitle={false}
        showSearch={false}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Обновить">
              <span>
                <IconButton size="small" onClick={refreshAll}>
                  <RefreshOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            {canManage && (
              <Tooltip title="Настройки модуля">
                <IconButton
                  size="small"
                  component={RouterLink}
                  to="/reviews/settings"
                >
                  <SettingsOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        }
      />

      {needsOrg ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="info">Выберите организацию, чтобы увидеть отзывы.</Alert>
        </Box>
      ) : (
        <Box sx={{ flex: 1, overflow: "auto", px: theme.appLayout.page.paddingX, pb: 2 }}>
          {/* ── Stats ── */}
          <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ my: 2 }}>
            <StatCard
              label="Отправлено"
              value={stats?.sent ?? "—"}
              hint={
                stats
                  ? `Ответили: ${stats.answered} · ${Math.round(
                      Number(stats.responseRate) * 100,
                    )}%`
                  : undefined
              }
            />
            <StatCard
              label="Средняя оценка"
              value={
                <Stack direction="row" spacing={0.5} alignItems="center">
                  {stats?.avgRating ?? "—"}
                  <StarRateRoundedIcon sx={{ color: "warning.main", fontSize: 22 }} />
                </Stack>
              }
            />
            <StatCard
              label="Негатив (1–4)"
              value={stats?.negativeCount ?? "—"}
              color={theme.palette.error.main}
            />
            <StatCard
              label="Промоутеры (5)"
              value={stats?.promoterCount ?? "—"}
              color={theme.palette.success.main}
              hint={stats ? `На 2ГИС: ${stats.redirectedTo2Gis}` : undefined}
            />
          </Stack>

          {/* ── Filters ── */}
          <Stack
            direction="row"
            flexWrap="wrap"
            gap={1.5}
            alignItems="center"
            sx={{ mb: 2 }}
          >
            <DateRangeField
              value={{ from, to }}
              onChange={(r) => {
                setFrom(r.from);
                setTo(r.to);
              }}
              minWidth={220}
            />
            <TextField
              select
              size="small"
              label="Оценка"
              value={rating === "" ? "" : String(rating)}
              onChange={(e) =>
                setRating(e.target.value === "" ? "" : Number(e.target.value))
              }
              sx={{ width: 120 }}
            >
              <MenuItem value="">Все</MenuItem>
              {[5, 4, 3, 2, 1].map((r) => (
                <MenuItem key={r} value={String(r)}>
                  {r} ★
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Тип"
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value as ReviewSentiment | "")}
              sx={{ width: 150 }}
            >
              <MenuItem value="">Все</MenuItem>
              {SENTIMENT_OPTIONS.map((o) => (
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
            {(statsQuery.isFetching || listQuery.isFetching) && (
              <CircularProgress size={18} />
            )}
          </Stack>

          {/* ── Table ── */}
          {listQuery.error ? (
            <Alert severity="error">
              {listQuery.error instanceof Error
                ? listQuery.error.message
                : "Ошибка загрузки"}
            </Alert>
          ) : (
            <Paper variant="outlined" sx={{ overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Дата</TableCell>
                    <TableCell>Пациент</TableCell>
                    <TableCell>Врач</TableCell>
                    <TableCell align="center">Оценка</TableCell>
                    <TableCell>Комментарий</TableCell>
                    <TableCell align="center">Тип</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {listQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : reviews.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                        <Typography variant="body2" color="text.disabled">
                          За выбранный период отзывов нет.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    reviews.map((r: Review) => {
                      const sm = SENTIMENT_META[r.sentiment];
                      return (
                        <TableRow key={r.id} hover>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>
                            {r.ratedAt ? dayjs(r.ratedAt).format("DD.MM.YYYY HH:mm") : "—"}
                          </TableCell>
                          <TableCell>{r.patientName}</TableCell>
                          <TableCell>{r.doctorName}</TableCell>
                          <TableCell align="center">
                            <Rating value={r.rating} readOnly size="small" />
                          </TableCell>
                          <TableCell
                            sx={{
                              maxWidth: 320,
                              whiteSpace: "normal",
                              color: r.comment ? "text.primary" : "text.disabled",
                            }}
                          >
                            {r.comment || "—"}
                          </TableCell>
                          <TableCell align="center">
                            {sm && (
                              <Chip label={sm.label} color={sm.color} size="small" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={total}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={PAGE_SIZE}
                rowsPerPageOptions={[PAGE_SIZE]}
                labelRowsPerPage="Строк:"
                labelDisplayedRows={({ from: f, to: t, count: c }) =>
                  `${f}–${t} из ${c}`
                }
              />
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
};

export default ReviewsPage;
