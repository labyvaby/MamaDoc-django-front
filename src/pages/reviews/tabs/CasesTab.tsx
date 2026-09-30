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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import { getReviews, updateCase, type CaseStatus, type Review } from "../../../api/reviews";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";
import { CASE_META } from "../meta";
import { periodKey, type TabProps } from "./filters";

const PAGE_SIZE = 20;
type CaseFilter = "open" | "resolved" | "all";

const CaseCard: React.FC<{ review: Review }> = ({ review }) => {
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const [note, setNote] = React.useState(review.caseNote);
  React.useEffect(() => setNote(review.caseNote), [review.caseNote]);

  const mutation = useMutation({
    mutationFn: (body: { status?: CaseStatus; note?: string }) => updateCase(review.id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.reviews.all });
      notify?.({ type: "success", message: "Сохранено" });
    },
    onError: (e) => notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" }),
  });

  const status = review.caseStatus || "new";
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: "14px" }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography fontWeight={700}>{review.patientName ?? "Пациент"}</Typography>
            {review.patientPhone && (
              <Link href={`tel:${review.patientPhone}`} variant="body2">
                {review.patientPhone}
              </Link>
            )}
            <Typography variant="caption" color="text.secondary">
              {dayjs(review.ratedAt).format("DD.MM.YYYY HH:mm")}
              {review.branchName ? ` · ${review.branchName}` : ""}
              {review.doctorName ? ` · ${review.doctorName}` : ""}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={2} sx={{ mt: 1 }} flexWrap="wrap">
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption">Общая</Typography>
              <Rating value={review.rating} readOnly size="small" />
            </Stack>
            {review.doctorRating != null && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Typography variant="caption">Врач</Typography>
                <Rating value={review.doctorRating} readOnly size="small" />
              </Stack>
            )}
            {review.registryRating != null && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Typography variant="caption">Регистратура</Typography>
                <Rating value={review.registryRating} readOnly size="small" />
              </Stack>
            )}
          </Stack>
          {review.tags.length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 1 }}>
              {review.tags.map((tag) => (
                <Chip key={tag} label={tag} size="small" color="error" variant="outlined" />
              ))}
            </Stack>
          )}
          <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap" }} color={review.comment ? "text.primary" : "text.disabled"}>
            {review.comment || "Без комментария"}
          </Typography>
        </Box>
        <Stack spacing={1} sx={{ width: { xs: "100%", md: 300 }, flexShrink: 0 }}>
          <TextField
            select
            size="small"
            label="Статус разбора"
            value={status}
            disabled={mutation.isPending}
            onChange={(e) => mutation.mutate({ status: e.target.value as CaseStatus })}
          >
            {(Object.keys(CASE_META) as (keyof typeof CASE_META)[]).map((key) => (
              <MenuItem key={key} value={key}>
                {CASE_META[key].label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            multiline
            minRows={2}
            label="Заметка: что сделали"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="small"
            variant="outlined"
            disabled={mutation.isPending || note === review.caseNote}
            onClick={() => mutation.mutate({ note })}
          >
            Сохранить заметку
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};

const CasesTab: React.FC<TabProps> = ({ period }) => {
  const [filter, setFilter] = React.useState<CaseFilter>("open");
  const [page, setPage] = React.useState(0);
  React.useEffect(() => setPage(0), [filter, period.from, period.to, period.branchId]);

  const caseStatus = filter === "open" ? "open" : filter === "resolved" ? "resolved" : undefined;
  const query = useQuery({
    queryKey: djangoQueryKeys.reviews.list({ ...periodKey(period), cases: filter, page: page + 1 }),
    queryFn: ({ signal }) =>
      getReviews({ ...period, caseStatus, page: page + 1, pageSize: PAGE_SIZE }, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const rows = (query.data?.results ?? []).filter((r) => filter !== "all" || r.caseStatus !== "");

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filter}
          onChange={(_, v: CaseFilter | null) => v && setFilter(v)}
        >
          <ToggleButton value="open">Открытые</ToggleButton>
          <ToggleButton value="resolved">Решённые</ToggleButton>
          <ToggleButton value="all">Все отзывы</ToggleButton>
        </ToggleButtonGroup>
        {query.isFetching && <CircularProgress size={18} />}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Разбор открывается, если общая оценка ниже 5 или врача/регистратуру оценили на 3 и ниже.
      </Typography>
      {query.error ? (
        <Alert severity="error">
          {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
        </Alert>
      ) : query.isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
          <CircularProgress size={24} />
        </Box>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ py: 4, textAlign: "center" }}>
          {filter === "open" ? "Открытых разборов нет — отлично!" : "Ничего не найдено."}
        </Typography>
      ) : (
        rows.map((r) => <CaseCard key={r.id} review={r} />)
      )}
      <TablePagination
        component="div"
        count={query.data?.count ?? 0}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={PAGE_SIZE}
        rowsPerPageOptions={[PAGE_SIZE]}
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count}`}
      />
    </Stack>
  );
};

export default CasesTab;
