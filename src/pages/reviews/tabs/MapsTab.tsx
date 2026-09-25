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
  Link,
  Paper,
  Stack,
  TablePagination,
  TextField,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import {
  confirmPublicReview,
  getMapClicks,
  type MapClickRow,
  type MapPlatform,
} from "../../../api/reviews";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";
import { MAP_META } from "../meta";
import { periodKey, type TabProps } from "./filters";

type Verdict = "confirmed" | "not_found";

const PlatformRow: React.FC<{
  row: MapClickRow;
  platform: MapPlatform;
  onConfirm: (platform: MapPlatform) => void;
  onNotFound: (platform: MapPlatform) => void;
  busy: boolean;
}> = ({ row, platform, onConfirm, onNotFound, busy }) => {
  const confirmation = row.confirmations.find((c) => c.platform === platform);
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
      <Chip label={MAP_META[platform]} size="small" variant="outlined" />
      {confirmation?.status === "confirmed" ? (
        <Chip
          size="small"
          color="success"
          label="Отзыв найден"
          component={confirmation.url ? "a" : "div"}
          href={confirmation.url || undefined}
          target="_blank"
          clickable={!!confirmation.url}
        />
      ) : confirmation?.status === "not_found" ? (
        <Chip size="small" label="Не нашли" />
      ) : (
        <Typography variant="caption" color="text.secondary">
          не проверено
        </Typography>
      )}
      <Button size="small" disabled={busy} onClick={() => onConfirm(platform)}>
        Нашли
      </Button>
      <Button size="small" color="inherit" disabled={busy} onClick={() => onNotFound(platform)}>
        Не нашли
      </Button>
    </Stack>
  );
};

const MapsTab: React.FC<TabProps> = ({ period }) => {
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const [page, setPage] = React.useState(0);
  const [dialog, setDialog] = React.useState<{ reviewId: number; platform: MapPlatform } | null>(null);
  const [url, setUrl] = React.useState("");
  React.useEffect(() => setPage(0), [period.from, period.to, period.branchId]);

  const query = useQuery({
    queryKey: djangoQueryKeys.reviews.mapClicks({ ...periodKey(period), page: page + 1 }),
    queryFn: ({ signal }) => getMapClicks({ ...period, page: page + 1 }, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: (body: { reviewId: number; platform: MapPlatform; status: Verdict; url?: string }) =>
      confirmPublicReview(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.reviews.all });
      setDialog(null);
      setUrl("");
      notify?.({ type: "success", message: "Отмечено" });
    },
    onError: (e) => notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" }),
  });

  const rows = query.data?.results ?? [];

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Отметьте, нашли ли вы отзыв пациента на карте. Пациентам с подтверждённым отзывом карты больше не
        предлагаются.
      </Alert>
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
          За период никто не переходил в карты.
        </Typography>
      ) : (
        rows.map((row) => {
          const platforms = [...new Set(row.clicks.map((c) => c.platform))];
          return (
            <Paper key={row.reviewId} variant="outlined" sx={{ p: 2, borderRadius: "14px" }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
                <Typography fontWeight={700}>{row.patientName ?? "Пациент"}</Typography>
                {row.patientPhone && (
                  <Link href={`tel:${row.patientPhone}`} variant="body2">
                    {row.patientPhone}
                  </Link>
                )}
                <Typography variant="caption" color="text.secondary">
                  {dayjs(row.ratedAt).format("DD.MM.YYYY")}
                  {row.branchName ? ` · ${row.branchName}` : ""}
                </Typography>
              </Stack>
              <Stack spacing={1}>
                {platforms.map((p) => (
                  <PlatformRow
                    key={p}
                    row={row}
                    platform={p}
                    busy={mutation.isPending}
                    onConfirm={(platform) => setDialog({ reviewId: row.reviewId, platform })}
                    onNotFound={(platform) =>
                      mutation.mutate({ reviewId: row.reviewId, platform, status: "not_found" })
                    }
                  />
                ))}
              </Stack>
            </Paper>
          );
        })
      )}
      <TablePagination
        component="div"
        count={query.data?.count ?? 0}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={20}
        rowsPerPageOptions={[20]}
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count}`}
      />
      <Dialog open={dialog != null} onClose={() => setDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>Отзыв найден{dialog ? ` в ${MAP_META[dialog.platform]}` : ""}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            label="Ссылка на отзыв (необязательно)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Отмена</Button>
          <Button
            variant="contained"
            disabled={mutation.isPending}
            onClick={() =>
              dialog &&
              mutation.mutate({ ...dialog, status: "confirmed", url: url.trim() || undefined })
            }
          >
            Подтвердить
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default MapsTab;
