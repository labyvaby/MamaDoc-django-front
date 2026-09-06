import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import StarRounded from "@mui/icons-material/StarRounded";

import { useT } from "../../../i18n/VerticalProvider";
import { RATING_COLOR } from "../../public-booking/theme";
import { SITE_BORDER, SITE_TILE_RADIUS } from "../theme";
import { SiteSection } from "../shell";
import type { LandingReview } from "../useLandingData";
import { EmptyNote } from "./EmptyNote";

/**
 * Отзывы: то, что клиенты уже оставили в CRM после оплаченного визита.
 *
 * Ничего не редактируется руками — на сайт попадают те же отзывы, что видит
 * регистратура. Имя показываем как отдаёт API (только имя, без контактов).
 */
const Stars: React.FC<{ rating: number }> = ({ rating }) => (
  <Stack direction="row" spacing={0.25} aria-label={`${rating} из 5`}>
    {Array.from({ length: 5 }).map((_, i) => (
      <StarRounded
        key={i}
        sx={{ fontSize: 18, color: i < Math.round(rating) ? RATING_COLOR : "action.disabled" }}
      />
    ))}
  </Stack>
);

/** Дата отзыва: «20 июля 2026». ISO с таймзоной парсится браузером корректно. */
function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export const Reviews: React.FC<{
  id: string;
  reviews: LandingReview[];
  loading: boolean;
  tinted?: boolean;
}> = ({ id, reviews, loading, tinted }) => {
  const { t } = useT("landing");

  return (
    <SiteSection id={id} title={t("reviews.title")} subtitle={t("reviews.subtitle")} tinted={tinted}>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
        }}
      >
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={160} />
            ))
          : reviews.map((review, i) => (
              <Stack
                key={`${review.specialistSlug}-${review.date}-${i}`}
                spacing={1}
                sx={{
                  p: 2.5,
                  height: "100%",
                  borderRadius: SITE_TILE_RADIUS,
                  border: `1px solid ${SITE_BORDER}`,
                  bgcolor: "background.paper",
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Stars rating={review.rating} />
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                    {formatReviewDate(review.date)}
                  </Typography>
                </Stack>
                {review.comment && (
                  <Typography sx={{ fontSize: 14, lineHeight: 1.6 }}>{review.comment}</Typography>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{review.patientName}</Typography>
                {/* Специалиста может не быть: его удалили или отзыв к нему не
                    привязан — строку «о ком» тогда не рисуем вовсе. */}
                {review.specialistName && (
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    {t("reviews.about", { name: review.specialistName })}
                  </Typography>
                )}
              </Stack>
            ))}
      </Box>
      {!loading && reviews.length === 0 && <EmptyNote text={t("reviews.empty")} />}
    </SiteSection>
  );
};
