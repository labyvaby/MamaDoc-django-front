import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
  MenuItem,
  Paper,
  Rating,
  Stack,
  TablePagination,
  TextField,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import {
  getExternalReviews,
  syncExternalReviews,
  updateExternalReview,
  type ExternalReview,
  type ExternalReviewStatus,
} from "../../../api/reviews";
import { getDjangoEmployees, type DjangoEmployeeListItem } from "../../../api/staff";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { MAP_META } from "../meta";
import { periodKey, type TabProps } from "./filters";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: ExternalReviewStatus; label: string }[] = [
  { value: "new", label: "Новые" },
  { value: "assigned", label: "Назначены" },
  { value: "published", label: "На сайте" },
  { value: "hidden", label: "Скрытые" },
];

const STATUS_META: Record<ExternalReviewStatus, { label: string; color: "default" | "success" | "warning" }> = {
  new: { label: "Новый", color: "warning" },
  assigned: { label: "Назначен", color: "default" },
  published: { label: "На сайте", color: "success" },
  hidden: { label: "Скрыт", color: "default" },
};

function doctorName(doctors: DjangoEmployeeListItem[], id: number | null): string {
  if (id == null) return "";
  return doctors.find((d) => d.id === id)?.fullName ?? `#${id}`;
}

const ExternalReviewRow: React.FC<{
  row: ExternalReview;
  doctors: DjangoEmployeeListItem[];
  onAssign: (row: ExternalReview, employeeId: number) => void;
  onStatus: (row: ExternalReview, status: ExternalReviewStatus) => void;
  busy: boolean;
}> = ({ row, doctors, onAssign, onStatus, busy }) => {
  const selected = row.employeeId ?? "";
  const status = STATUS_META[row.status];
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
          <Chip label={MAP_META[row.platform]} size="small" variant="outlined" />
          <Chip label={status.label} color={status.color} size="small" />
          <Rating value={row.rating} readOnly size="small" />
          <Typography variant="caption" color="text.secondary">
            {dayjs(row.reviewCreatedAt).format("DD.MM.YYYY")}
            {row.branchName ? ` · ${row.branchName}` : ""}
          </Typography>
          {row.url && (
            <Link href={row.url} target="_blank" rel="noreferrer" variant="caption">
              открыть
            </Link>
          )}
        </Stack>

        <Box>
          <Typography fontWeight={700}>{row.authorName || "Автор 2ГИС"}</Typography>
          <Typography variant="body2" color={row.text ? "text.primary" : "text.disabled"}>
            {row.text || "Без текста"}
          </Typography>
        </Box>

        <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
          <TextField
            select
            size="small"
            label="Врач"
            value={selected === "" ? "" : String(selected)}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value) onAssign(row, value);
            }}
            sx={{ minWidth: 240 }}
          >
            <MenuItem value="">Не выбран</MenuItem>
            {doctors.map((doctor) => (
              <MenuItem key={doctor.id} value={String(doctor.id)}>
                {doctor.fullName}
              </MenuItem>
            ))}
          </TextField>
          {row.suggestedEmployeeId && row.suggestedEmployeeId !== row.employeeId && (
            <Button
              size="small"
              disabled={busy}
              onClick={() => onAssign(row, row.suggestedEmployeeId!)}
            >
              Принять: {doctorName(doctors, row.suggestedEmployeeId)}
            </Button>
          )}
          {row.employeeId && row.status !== "published" && (
            <Button size="small" variant="contained" disabled={busy} onClick={() => onStatus(row, "published")}>
              Опубликовать
            </Button>
          )}
          {row.status !== "hidden" && (
            <Button size="small" color="inherit" disabled={busy} onClick={() => onStatus(row, "hidden")}>
              Скрыть
            </Button>
          )}
          {row.status === "hidden" && (
            <Button size="small" color="inherit" disabled={busy} onClick={() => onStatus(row, row.employeeId ? "assigned" : "new")}>
              Вернуть
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
};

const ExternalReviewsTab: React.FC<TabProps> = ({ period }) => {
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const [page, setPage] = React.useState(0);
  const [status, setStatus] = React.useState<ExternalReviewStatus | "">("new");

  React.useEffect(() => setPage(0), [period.branchId, period.organizationId, status]);

  const filters = { ...period, status: status || undefined, page: page + 1, pageSize: PAGE_SIZE };
  const query = useQuery({
    queryKey: djangoQueryKeys.reviews.external({ ...periodKey(period), status, page: page + 1 }),
    queryFn: ({ signal }) => getExternalReviews(filters, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const doctorsQuery = useQuery({
    queryKey: [...djangoQueryKeys.reference.employees, "external-review-doctors", period.organizationId ?? null],
    queryFn: ({ signal }) =>
      getDjangoEmployees({ status: "active", pageSize: 200, organizationId: period.organizationId }, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const doctors = React.useMemo(
    () => (doctorsQuery.data?.results ?? []).filter((employee) => employee.clinicalRole === "doctor"),
    [doctorsQuery.data],
  );

  const updateMutation = useMutation({
    mutationFn: (body: { id: number; employeeId?: number; status?: ExternalReviewStatus }) =>
      updateExternalReview(body.id, { employeeId: body.employeeId, status: body.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.reviews.all });
      notify?.({ type: "success", message: "Сохранено" });
    },
    onError: (e) => notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" }),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncExternalReviews({ branchId: period.branchId, organizationId: period.organizationId }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.reviews.all });
      notify?.({
        type: "success",
        message: `Синхронизация: новых ${result.imported}, обновлено ${result.updated}`,
      });
    },
    onError: (e) => notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка синхронизации" }),
  });

  const rows = query.data?.results ?? [];
  const busy = updateMutation.isPending || syncMutation.isPending;

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Здесь 2ГИС-отзывы сначала разбираются вручную. В карточку врача попадает только опубликованный отзыв с выбранным врачом.
      </Alert>
      <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center">
        <TextField
          select
          size="small"
          label="Статус"
          value={status}
          onChange={(e) => setStatus(e.target.value as ExternalReviewStatus | "")}
          sx={{ width: 180 }}
        >
          <MenuItem value="">Все</MenuItem>
          {STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" disabled={busy} onClick={() => syncMutation.mutate()}>
          Синхронизировать 2ГИС
        </Button>
        {(query.isFetching || doctorsQuery.isFetching || busy) && <CircularProgress size={18} />}
      </Stack>

      {query.error ? (
        <Alert severity="error">{query.error instanceof Error ? query.error.message : "Ошибка загрузки"}</Alert>
      ) : query.isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
          <CircularProgress size={24} />
        </Box>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ py: 4, textAlign: "center" }}>
          В этой очереди пока нет отзывов.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {rows.map((row) => (
            <ExternalReviewRow
              key={row.id}
              row={row}
              doctors={doctors}
              busy={busy}
              onAssign={(item, employeeId) => updateMutation.mutate({ id: item.id, employeeId })}
              onStatus={(item, nextStatus) => updateMutation.mutate({ id: item.id, status: nextStatus })}
            />
          ))}
        </Stack>
      )}

      <TablePagination
        component="div"
        count={query.data?.count ?? 0}
        page={page}
        onPageChange={(_, next) => setPage(next)}
        rowsPerPage={PAGE_SIZE}
        rowsPerPageOptions={[PAGE_SIZE]}
        labelRowsPerPage="Строк:"
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} из ${count}`}
      />
    </Stack>
  );
};

export default ExternalReviewsTab;
