import React from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import {
  getReviewStats,
  getTagStats,
  type ReviewStats,
  type TagCount,
} from "../../../api/reviews";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { useCan } from "../../../hooks/useCan";
import { periodKey, type TabProps } from "./filters";

const Panel: React.FC<
  React.PropsWithChildren<{
    title?: string;
    action?: React.ReactNode;
    grow?: string;
  }>
> = ({ title, action, grow = "1 1 320px", children }) => (
  <Paper
    variant="outlined"
    sx={{ p: 2.25, borderRadius: "14px", flex: grow, minWidth: 0 }}
  >
    {(title || action) && (
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1.5 }}
      >
        {title && (
          <Typography variant="subtitle2" fontWeight={700}>
            {title}
          </Typography>
        )}
        {action}
      </Stack>
    )}
    {children}
  </Paper>
);

/** Пять звёзд с дробным заполнением: 4.3 → четыре целых и треть пятой. */
const FractionalStars: React.FC<{ value: number }> = ({ value }) => {
  const theme = useTheme();
  return (
    <Stack
      direction="row"
      spacing={0.25}
      aria-label={`${value.toFixed(1)} из 5`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <Box key={i} sx={{ position: "relative", width: 22, height: 22 }}>
            <StarRateRoundedIcon
              sx={{
                position: "absolute",
                inset: 0,
                fontSize: 22,
                color: theme.palette.action.disabled,
              }}
            />
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                width: `${fill * 100}%`,
                overflow: "hidden",
              }}
            >
              <StarRateRoundedIcon
                sx={{ fontSize: 22, color: theme.palette.warning.main }}
              />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
};

const ScoreHero: React.FC<{ s?: ReviewStats }> = ({ s }) => {
  const theme = useTheme();
  const answered = s?.answered ?? 0;
  const avg = s ? Number(s.avgRating) || 0 : 0;
  const barColor = (n: number) =>
    n === 5
      ? theme.palette.success.main
      : n === 4
      ? theme.palette.warning.main
      : theme.palette.error.main;
  return (
    <Panel grow="1 1 340px">
      <Stack
        direction="row"
        spacing={3}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        rowGap={2}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">
            Средняя оценка
          </Typography>
          <Typography
            sx={{
              fontSize: 52,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              mt: 0.5,
            }}
          >
            {s ? answered ? avg.toFixed(1) : "—" : <Skeleton width={90} />}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <FractionalStars value={avg} />
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.75 }}
          >
            {answered} {plural(answered, "ответ", "ответа", "ответов")}
          </Typography>
        </Box>
        <Box sx={{ flex: "1 1 200px", minWidth: 180 }}>
          {[5, 4, 3, 2, 1].map((n) => {
            const count = s?.byRating?.[String(n)] ?? 0;
            const share = answered ? count / answered : 0;
            return (
              <Stack
                key={n}
                direction="row"
                spacing={1.25}
                alignItems="center"
                sx={{ py: 0.4 }}
              >
                <Typography
                  variant="body2"
                  sx={{ width: 14, fontWeight: 600, color: "text.secondary" }}
                >
                  {n}
                </Typography>
                <Box
                  sx={{
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    bgcolor: alpha(theme.palette.text.primary, 0.06),
                  }}
                >
                  <Box
                    sx={{
                      width: `${share * 100}%`,
                      height: "100%",
                      borderRadius: 4,
                      bgcolor: barColor(n),
                      transition: "width 400ms ease",
                    }}
                  />
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ width: 28, textAlign: "right" }}
                >
                  {count}
                </Typography>
              </Stack>
            );
          })}
        </Box>
      </Stack>
      <Stack
        direction="row"
        spacing={3}
        sx={{ mt: 2, pt: 1.5, borderTop: 1, borderColor: "divider" }}
      >
        <SubScore label="Врач" value={s?.avgDoctorRating} />
        <SubScore label="Регистратура" value={s?.avgRegistryRating} />
      </Stack>
    </Panel>
  );
};

const SubScore: React.FC<{ label: string; value?: string | null }> = ({
  label,
  value,
}) => (
  <Box>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Typography fontWeight={700}>{value ?? "—"}</Typography>
      {value && (
        <StarRateRoundedIcon sx={{ fontSize: 18, color: "warning.main" }} />
      )}
    </Stack>
  </Box>
);

/** Путь отзыва: от отправки до подтверждённого отзыва на картах. */
const Funnel: React.FC<{ s?: ReviewStats }> = ({ s }) => {
  const theme = useTheme();
  const sent = s?.sent ?? 0;
  const steps = [
    {
      label: "Отправлено",
      value: sent,
      hint: s ? `WhatsApp ${s.deliveredWhatsapp} · SMS ${s.deliveredSms}` : "",
    },
    { label: "Ответили", value: s?.answered ?? 0 },
    { label: "Поставили 5★", value: s?.promoterCount ?? 0 },
    { label: "Перешли в карты", value: s?.redirectedTo2Gis ?? 0 },
    { label: "Отзыв подтверждён", value: s?.confirmedPublicReviews ?? 0 },
  ];
  return (
    <Panel
      title="Путь отзыва"
      action={
        <Typography variant="caption" color="text.secondary">
          % — от прошлого шага
        </Typography>
      }
      grow="1 1 340px"
    >
      <Stack spacing={1.1}>
        {steps.map((step, i) => {
          const share = sent ? step.value / sent : 0;
          const prev = i > 0 ? steps[i - 1].value : 0;
          const conv =
            i > 0 && prev ? Math.round((step.value / prev) * 100) : null;
          const tone = alpha(theme.palette.primary.main, 0.9 - i * 0.14);
          return (
            <Box key={step.label}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="baseline"
                sx={{ mb: 0.4 }}
              >
                <Typography variant="body2" fontWeight={600}>
                  {step.label}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  {conv != null && (
                    <Typography variant="caption" color="text.secondary">
                      {conv}%
                    </Typography>
                  )}
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    sx={{ minWidth: 28, textAlign: "right" }}
                  >
                    {s ? step.value : "—"}
                  </Typography>
                </Stack>
              </Stack>
              <Box
                sx={{
                  height: 10,
                  borderRadius: 5,
                  bgcolor: alpha(theme.palette.text.primary, 0.05),
                }}
              >
                <Box
                  sx={{
                    width: `${Math.max(share * 100, step.value ? 2 : 0)}%`,
                    height: "100%",
                    borderRadius: 5,
                    bgcolor: tone,
                    transition: "width 400ms ease",
                  }}
                />
              </Box>
              {step.hint && (
                <Typography variant="caption" color="text.disabled">
                  {step.hint}
                </Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    </Panel>
  );
};

const TagBars: React.FC<{ title: string; tags: TagCount[]; color: string }> = ({
  title,
  tags,
  color,
}) => {
  const max = Math.max(1, ...tags.map((t) => t.count));
  return (
    <Panel title={title} grow="1 1 300px">
      {tags.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          Пока нет отметок
        </Typography>
      ) : (
        <Stack spacing={0.9}>
          {tags.slice(0, 8).map((t) => (
            <Box
              key={t.tag}
              sx={{
                position: "relative",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  width: `${(t.count / max) * 100}%`,
                  bgcolor: alpha(color, 0.14),
                  transition: "width 400ms ease",
                }}
              />
              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{ position: "relative", px: 1.25, py: 0.6 }}
              >
                <Typography variant="body2">{t.tag}</Typography>
                <Typography variant="body2" fontWeight={700} sx={{ color }}>
                  {t.count}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Panel>
  );
};

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const OverviewTab: React.FC<TabProps> = ({ period }) => {
  const theme = useTheme();
  const key = periodKey(period);
  const canHandle = useCan("reviews.handle");
  const [, setSearchParams] = useSearchParams();

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
        {statsQuery.error instanceof Error
          ? statsQuery.error.message
          : "Ошибка загрузки"}
      </Alert>
    );
  }

  const s = statsQuery.data;
  const openCases = s?.openCases ?? 0;

  return (
    <Stack spacing={2}>
      {openCases > 0 && (
        <Alert
          severity="warning"
          variant="outlined"
          sx={{ borderRadius: "14px", alignItems: "center" }}
          action={
            canHandle ? (
              <Button
                color="inherit"
                size="small"
                endIcon={<ArrowForwardRoundedIcon />}
                onClick={() =>
                  setSearchParams({ tab: "cases" }, { replace: true })
                }
              >
                К разборам
              </Button>
            ) : undefined
          }
        >
          {openCases}{" "}
          {plural(openCases, "отзыв ждёт", "отзыва ждут", "отзывов ждут")}{" "}
          разбора
          {s ? ` · негативных за период: ${s.negativeCount}` : ""}
        </Alert>
      )}

      <Stack direction="row" flexWrap="wrap" gap={2}>
        <ScoreHero s={s} />
        <Funnel s={s} />
      </Stack>

      <Stack direction="row" flexWrap="wrap" gap={2}>
        <TagBars
          title="Что понравилось"
          tags={tagsQuery.data?.positive ?? []}
          color={theme.palette.success.main}
        />
        <TagBars
          title="Что было не так"
          tags={tagsQuery.data?.negative ?? []}
          color={theme.palette.error.main}
        />
      </Stack>
    </Stack>
  );
};

export default OverviewTab;
