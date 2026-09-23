import React from "react";
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getReviewStats, getTagStats, type TagCount } from "../../../api/reviews";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";
import { periodKey, type TabProps } from "./filters";

const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  color?: string;
}> = ({ label, value, hint, color }) => (
  <Paper variant="outlined" sx={{ p: 2, borderRadius: "14px", flex: "1 1 170px", minWidth: 160 }}>
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

const TagList: React.FC<{ title: string; tags: TagCount[]; color: "success" | "error" }> = ({
  title,
  tags,
  color,
}) => (
  <Paper variant="outlined" sx={{ p: 2, borderRadius: "14px", flex: "1 1 280px" }}>
    <Typography variant="subtitle2" fontWeight={700} gutterBottom>
      {title}
    </Typography>
    {tags.length === 0 ? (
      <Typography variant="body2" color="text.disabled">
        Пока нет отметок
      </Typography>
    ) : (
      <Stack direction="row" flexWrap="wrap" gap={1}>
        {tags.map((t) => (
          <Chip key={t.tag} label={`${t.tag} · ${t.count}`} color={color} variant="outlined" size="small" />
        ))}
      </Stack>
    )}
  </Paper>
);

const OverviewTab: React.FC<TabProps> = ({ period }) => {
  const theme = useTheme();
  const key = periodKey(period);

  const statsQuery = useQuery({
    queryKey: djangoQueryKeys.reviews.stats(key),
    queryFn: ({ signal }) => getReviewStats(period, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
  const tagsQuery = useQuery({
    queryKey: djangoQueryKeys.reviews.tags(key),
    queryFn: ({ signal }) => getTagStats(period, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  if (statsQuery.error) {
    return (
      <Alert severity="error">
        {statsQuery.error instanceof Error ? statsQuery.error.message : "Ошибка загрузки"}
      </Alert>
    );
  }

  const s = statsQuery.data;
  const answered = s?.answered ?? 0;
  const pct = (n: number) => (answered ? Math.round((n / answered) * 100) : 0);

  return (
    <Stack spacing={2}>
      <Stack direction="row" flexWrap="wrap" gap={1.5}>
        <StatCard
          label="Отправлено"
          value={s?.sent ?? "—"}
          hint={s ? `WhatsApp ${s.deliveredWhatsapp} · SMS ${s.deliveredSms}` : undefined}
        />
        <StatCard
          label="Ответили"
          value={s?.answered ?? "—"}
          hint={s ? `${Math.round(Number(s.responseRate) * 100)}% от отправленных` : undefined}
        />
        <StatCard
          label="Средняя оценка"
          value={
            <Stack direction="row" spacing={0.5} alignItems="center">
              {s?.avgRating ?? "—"}
              <StarRateRoundedIcon sx={{ color: "warning.main", fontSize: 22 }} />
            </Stack>
          }
          hint={
            s
              ? `Врач ${s.avgDoctorRating ?? "—"} · Регистратура ${s.avgRegistryRating ?? "—"}`
              : undefined
          }
        />
        <StatCard
          label="Негатив"
          value={s?.negativeCount ?? "—"}
          color={theme.palette.error.main}
          hint={s ? `Открытых разборов: ${s.openCases}` : undefined}
        />
        <StatCard
          label="Перешли в карты"
          value={s?.redirectedTo2gis ?? "—"}
          color={theme.palette.success.main}
          hint={s ? `Подтверждено отзывов: ${s.confirmedPublicReviews}` : undefined}
        />
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: "14px" }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Распределение оценок
        </Typography>
        {[5, 4, 3, 2, 1].map((n) => {
          const count = s?.byRating?.[String(n)] ?? 0;
          return (
            <Stack key={n} direction="row" spacing={1.5} alignItems="center" sx={{ py: 0.5 }}>
              <Typography variant="body2" sx={{ width: 32 }}>
                {n} ★
              </Typography>
              <Box sx={{ flex: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={pct(count)}
                  color={n === 5 ? "success" : n >= 4 ? "warning" : "error"}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ width: 64, textAlign: "right" }}>
                {count} · {pct(count)}%
              </Typography>
            </Stack>
          );
        })}
      </Paper>

      <Stack direction="row" flexWrap="wrap" gap={1.5}>
        <TagList title="Что понравилось (5★)" tags={tagsQuery.data?.positive ?? []} color="success" />
        <TagList title="Что было не так (<5★)" tags={tagsQuery.data?.negative ?? []} color="error" />
      </Stack>
    </Stack>
  );
};

export default OverviewTab;
