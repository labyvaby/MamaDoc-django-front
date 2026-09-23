import React from "react";
import {
  Alert,
  Chip,
  CircularProgress,
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
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getReviews, type Review, type ReviewSentiment } from "../../../api/reviews";
import { getDjangoEmployees } from "../../../api/staff";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { useT } from "../../../i18n/VerticalProvider";
import { CASE_META, MAP_META, SENTIMENT_META, SENTIMENT_OPTIONS } from "../meta";
import { periodKey, type TabProps } from "./filters";

const PAGE_SIZE = 20;

const Score: React.FC<{ value: number | null }> = ({ value }) =>
  value == null ? (
    <Typography variant="body2" color="text.disabled">
      —
    </Typography>
  ) : (
    <Rating value={value} readOnly size="small" />
  );

const ReviewsTab: React.FC<TabProps> = ({ period, multiBranch }) => {
  const { t } = useT("reviews");
  const [rating, setRating] = React.useState<number | "">("");
  const [sentiment, setSentiment] = React.useState<ReviewSentiment | "">("");
  const [doctorId, setDoctorId] = React.useState<number | "">("");
  const [page, setPage] = React.useState(0);

  const key = periodKey(period);
  React.useEffect(() => setPage(0), [rating, sentiment, doctorId, period.from, period.to, period.branchId]);

  const filters = {
    ...period,
    rating: rating === "" ? undefined : rating,
    sentiment: sentiment === "" ? undefined : sentiment,
    doctorId: doctorId === "" ? undefined : doctorId,
  };

  const listQuery = useQuery({
    queryKey: djangoQueryKeys.reviews.list({ ...key, ...filters, page: page + 1 }),
    queryFn: ({ signal }) => getReviews({ ...filters, page: page + 1, pageSize: PAGE_SIZE }, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const doctorsQuery = useQuery({
    queryKey: [...djangoQueryKeys.reference.employees, "doctors", period.organizationId ?? null],
    queryFn: ({ signal }) =>
      getDjangoEmployees({ status: "active", pageSize: 200, organizationId: period.organizationId }, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const doctors = React.useMemo(
    () => (doctorsQuery.data?.results ?? []).filter((e) => e.clinicalRole === "doctor"),
    [doctorsQuery.data],
  );

  const rows = listQuery.data?.results ?? [];
  const columns = multiBranch ? 9 : 8;

  return (
    <Stack spacing={2}>
      <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center">
        <TextField
          select
          size="small"
          label="Оценка"
          value={rating === "" ? "" : String(rating)}
          onChange={(e) => setRating(e.target.value === "" ? "" : Number(e.target.value))}
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
          label={t("list.specialistLabel")}
          value={doctorId === "" ? "" : String(doctorId)}
          onChange={(e) => setDoctorId(e.target.value === "" ? "" : Number(e.target.value))}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">{t("list.allSpecialists")}</MenuItem>
          {doctors.map((d) => (
            <MenuItem key={d.id} value={String(d.id)}>
              {d.fullName}
            </MenuItem>
          ))}
        </TextField>
        {listQuery.isFetching && <CircularProgress size={18} />}
      </Stack>

      {listQuery.error ? (
        <Alert severity="error">
          {listQuery.error instanceof Error ? listQuery.error.message : "Ошибка загрузки"}
        </Alert>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Дата</TableCell>
                <TableCell>{t("list.patientColumn")}</TableCell>
                <TableCell>{t("list.specialistColumn")}</TableCell>
                {multiBranch && <TableCell>Филиал</TableCell>}
                <TableCell align="center">Общая</TableCell>
                <TableCell align="center">Врач</TableCell>
                <TableCell align="center">Регистратура</TableCell>
                <TableCell>Отзыв</TableCell>
                <TableCell>Статус</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {listQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" color="text.disabled">
                      За выбранный период отзывов нет.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r: Review) => {
                  const sm = SENTIMENT_META[r.sentiment];
                  const cm = r.caseStatus ? CASE_META[r.caseStatus] : null;
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {dayjs(r.ratedAt).format("DD.MM.YYYY HH:mm")}
                      </TableCell>
                      <TableCell>{r.patientName ?? "—"}</TableCell>
                      <TableCell>{r.doctorName ?? "—"}</TableCell>
                      {multiBranch && <TableCell>{r.branchName ?? "—"}</TableCell>}
                      <TableCell align="center">
                        <Score value={r.rating} />
                      </TableCell>
                      <TableCell align="center">
                        <Score value={r.doctorRating} />
                      </TableCell>
                      <TableCell align="center">
                        <Score value={r.registryRating} />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 360, whiteSpace: "normal" }}>
                        {r.tags.length > 0 && (
                          <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: r.comment ? 0.5 : 0 }}>
                            {r.tags.map((tag) => (
                              <Chip key={tag} label={tag} size="small" variant="outlined" />
                            ))}
                          </Stack>
                        )}
                        <Typography variant="body2" color={r.comment ? "text.primary" : "text.disabled"}>
                          {r.comment || (r.tags.length ? "" : "—")}
                          {r.commentEdited && (
                            <Typography component="span" variant="caption" color="text.disabled">
                              {" "}
                              (изменён)
                            </Typography>
                          )}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" flexWrap="wrap" gap={0.5}>
                          {sm && <Chip label={sm.label} color={sm.color} size="small" />}
                          {cm && <Chip label={`Разбор: ${cm.label}`} color={cm.color} size="small" variant="outlined" />}
                          {r.mapClicks.map((p) => (
                            <Tooltip key={p} title="Пациент перешёл оставить отзыв на карте">
                              <Chip label={`→ ${MAP_META[p]}`} size="small" color="success" variant="outlined" />
                            </Tooltip>
                          ))}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={listQuery.data?.count ?? 0}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
            labelRowsPerPage="Строк:"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count}`}
          />
        </Paper>
      )}
    </Stack>
  );
};

export default ReviewsTab;
