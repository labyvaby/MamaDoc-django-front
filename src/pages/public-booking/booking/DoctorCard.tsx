import React from "react";
import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import StarRounded from "@mui/icons-material/StarRounded";
import WorkOutlineOutlined from "@mui/icons-material/WorkOutlineOutlined";

import type { ProfessionalDetail } from "../../../api/publicBooking";
import {
  BOOKING_PRIMARY,
  BOOKING_RADIUS,
  BOOKING_SHADOW,
  DIVIDER,
  MUTED,
  RATING_COLOR,
  TILE_RADIUS,
  accentChip,
} from "../theme";
import { formatReviewsCount, formatYears } from "../format";
import { useT } from "../../../i18n/VerticalProvider";

/** После какой длины биография сворачивается под «Читать далее». */
const BIO_CLAMP_LENGTH = 140;

/**
 * Карточка врача в левой колонке страницы записи: фото, имя, чипы
 * специализации и отзывов, рейтинг, стаж и биография.
 */
export const DoctorCard: React.FC<{
  doctor: ProfessionalDetail;
  reviewsCount: number;
  onOpenReviews: () => void;
}> = ({ doctor, reviewsCount, onOpenReviews }) => {
  const { t } = useT("publicBooking");
  const [photoBroken, setPhotoBroken] = React.useState(false);
  const [bioExpanded, setBioExpanded] = React.useState(false);
  const showPhoto = Boolean(doctor.photoUrl) && !photoBroken;
  const isBioLong = (doctor.bio?.length ?? 0) > BIO_CLAMP_LENGTH;

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: BOOKING_RADIUS,
        border: "none",
        boxShadow: BOOKING_SHADOW,
        width: "100%",
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={2}>
        <Box
          sx={{
            width: { xs: 104, md: 120 },
            height: { xs: 124, md: 144 },
            flexShrink: 0,
            borderRadius: TILE_RADIUS,
            overflow: "hidden",
          }}
        >
          {showPhoto ? (
            <Box
              component="img"
              src={doctor.photoUrl ?? undefined}
              alt={doctor.fullName}
              onError={() => setPhotoBroken(true)}
              sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            // Фолбэк эталона — заливка фирменным синим с первой буквой имени.
            <Stack
              alignItems="center"
              justifyContent="center"
              sx={{ width: "100%", height: "100%", bgcolor: BOOKING_PRIMARY }}
            >
              <Typography sx={{ color: "#FFFFFF", fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
                {doctor.fullName.charAt(0).toUpperCase()}
              </Typography>
            </Stack>
          )}
        </Box>

        <Box sx={{ flexGrow: 1, minWidth: 0, py: 0.25 }}>
          <Typography sx={{ fontSize: { xs: 16, md: 18 }, fontWeight: 700, lineHeight: 1.35 }}>
            {doctor.fullName}
          </Typography>

          <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
            {doctor.specialties.length > 0 && (
              <Box
                sx={{
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  bgcolor: accentChip.bg,
                  color: accentChip.text,
                }}
              >
                {doctor.specialties[0]}
              </Box>
            )}
            <Box
              component="button"
              type="button"
              onClick={onOpenReviews}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.25,
                pl: 1.25,
                pr: 1,
                py: 0.5,
                border: 1,
                borderColor: accentChip.border,
                borderRadius: 999,
                bgcolor: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 600,
                color: accentChip.text,
                transition: "background-color .2s",
                "&:hover": { bgcolor: accentChip.bg },
              }}
            >
              {t("reviewsTitle")}
              <ChevronRightOutlined sx={{ fontSize: 13 }} />
            </Box>
          </Stack>

          {doctor.rating != null && (
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1.25 }}>
              <StarRounded sx={{ fontSize: 14, color: RATING_COLOR }} />
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: RATING_COLOR,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {doctor.rating}
              </Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: MUTED }}>
                · {formatReviewsCount(reviewsCount)}
              </Typography>
            </Stack>
          )}

          {doctor.experienceYears > 0 && (
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.75 }}>
              <WorkOutlineOutlined sx={{ fontSize: 13, color: MUTED }} />
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary" }}>
                {t("experiencePrefix")} {formatYears(doctor.experienceYears)}
              </Typography>
            </Stack>
          )}
        </Box>
      </Stack>

      {doctor.bio && (
        <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${DIVIDER}` }}>
          <Typography
            sx={{
              fontSize: 12,
              color: "text.secondary",
              lineHeight: 1.6,
              whiteSpace: "pre-line",
              ...(isBioLong && !bioExpanded
                ? {
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }
                : null),
            }}
          >
            {doctor.bio}
          </Typography>
          {isBioLong && (
            <Typography
              component="button"
              type="button"
              onClick={() => setBioExpanded((prev) => !prev)}
              sx={{
                mt: 0.75,
                p: 0,
                border: 0,
                bgcolor: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 600,
                color: BOOKING_PRIMARY,
              }}
            >
              {bioExpanded ? t("collapse") : t("readMoreBio")}
            </Typography>
          )}
        </Box>
      )}

      {!doctor.isAcceptingNew && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          {t("notAcceptingNew")}
        </Alert>
      )}
    </Paper>
  );
};
