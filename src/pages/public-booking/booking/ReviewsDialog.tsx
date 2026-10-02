import React from "react";
import {
  Box,
  Dialog,
  DialogContent,
  IconButton,
  Rating,
  Stack,
  Typography,
  alpha,
} from "@mui/material";
import ChatBubbleOutlineOutlined from "@mui/icons-material/ChatBubbleOutlineOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import StarRounded from "@mui/icons-material/StarRounded";

import type { ProfessionalReview } from "../../../api/publicBooking";
import { BOOKING_RADIUS, DIVIDER, MUTED, RATING_COLOR, neutralTone } from "../theme";
import { formatReviewsCount, monogram } from "../format";
import { useT } from "../../../i18n/VerticalProvider";

/** Когда оставлен отзыв: «Вчера 12:36», «3 августа 12:36». */
function formatReviewDate(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  const time = value.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfDay.getTime() - value.getTime()) / 86_400_000);
  if (diffDays <= 0) return `Сегодня ${time}`;
  if (diffDays === 1) return `Вчера ${time}`;
  return `${value.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} ${time}`;
}

function sourceLabel(review: ProfessionalReview): string | null {
  if (review.source === "2gis") return "2GIS";
  return null;
}

/**
 * Отзывы о враче. В эталоне они не занимают место в карточке, а открываются
 * модалкой по чипу «Отзывы» — так карточка остаётся компактной.
 */
export const ReviewsDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  reviews: ProfessionalReview[];
  rating: number | null;
  total: number;
}> = ({ open, onClose, reviews, rating, total }) => {
  const { t } = useT("publicBooking");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          width: { xs: "calc(100% - 32px)", sm: 680 },
          maxWidth: "calc(100% - 32px)",
          borderRadius: BOOKING_RADIUS,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2.25,
            borderBottom: `1px solid ${DIVIDER}`,
            background: "linear-gradient(180deg, rgba(245, 250, 255, 0.94), #fff)",
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                color: "primary.main",
                flexShrink: 0,
              }}
            >
              <ChatBubbleOutlineOutlined sx={{ fontSize: 21 }} />
            </Box>
            <Stack spacing={0.25} sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15 }}>
                {t("reviewsTitle")}
              </Typography>
              <Typography sx={{ fontSize: 13, color: MUTED }}>
                {formatReviewsCount(total)}
              </Typography>
            </Stack>
            {rating != null && (
              <Stack
                direction="row"
                alignItems="center"
                spacing={0.5}
                sx={{
                  ml: { xs: 0, sm: 1 },
                  px: 1,
                  py: 0.5,
                  borderRadius: 999,
                  bgcolor: "rgba(255, 184, 0, 0.12)",
                  color: RATING_COLOR,
                  flexShrink: 0,
                }}
              >
                <StarRounded sx={{ fontSize: 16, color: RATING_COLOR }} />
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: RATING_COLOR }}>
                  {rating}
                </Typography>
              </Stack>
            )}
          </Stack>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Закрыть"
            sx={{
              width: 36,
              height: 36,
              bgcolor: "rgba(15, 23, 42, 0.04)",
              "&:hover": { bgcolor: "rgba(15, 23, 42, 0.08)" },
            }}
          >
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>

        {reviews.length === 0 ? (
          <Stack alignItems="center" spacing={2} sx={{ py: 5 }}>
            <ChatBubbleOutlineOutlined sx={{ fontSize: 64, color: "text.disabled" }} />
            <Typography sx={{ fontSize: 16, fontWeight: 500 }}>{t("noReviews")}</Typography>
          </Stack>
        ) : (
          <Stack spacing={1.4} sx={{ maxHeight: 470, overflowY: "auto", p: { xs: 2, sm: 2.5 } }}>
            {reviews.map((review, index) => (
              <Box
                key={index}
                sx={{
                  position: "relative",
                  ml: { xs: 1.25, sm: 2 },
                  p: { xs: 1.5, sm: 1.75 },
                  border: "1px solid rgba(18, 176, 75, 0.16)",
                  borderRadius: "26px 26px 26px 8px",
                  bgcolor: review.source === "2gis" ? "#FBFFFC" : "background.paper",
                  boxShadow: "0 12px 34px rgba(15, 23, 42, 0.07)",
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    left: -9,
                    bottom: 22,
                    width: 18,
                    height: 18,
                    bgcolor: review.source === "2gis" ? "#FBFFFC" : "background.paper",
                    borderLeft: "1px solid rgba(18, 176, 75, 0.16)",
                    borderBottom: "1px solid rgba(18, 176, 75, 0.16)",
                    borderBottomLeftRadius: 18,
                    transform: "rotate(45deg)",
                  },
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      flexShrink: 0,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: (tt) => neutralTone(tt).bg,
                      color: (tt) => neutralTone(tt).fg,
                      fontSize: 15,
                      fontWeight: 600,
                    }}
                  >
                    {/* Фото автора публичный API не отдаёт — показываем инициалы. */}
                    {monogram(review.patientName)}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 14.5, fontWeight: 700 }}>
                        {review.patientName}
                      </Typography>
                      {sourceLabel(review) && (
                        <Box
                          component="span"
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            height: 22,
                            px: 0.75,
                            borderRadius: 999,
                            bgcolor: "rgba(18, 176, 75, 0.1)",
                            color: "#168A3D",
                            border: "1px solid rgba(18, 176, 75, 0.2)",
                            fontSize: 10.5,
                            fontWeight: 800,
                            lineHeight: 1,
                            flexShrink: 0,
                          }}
                        >
                          {sourceLabel(review)}
                        </Box>
                      )}
                    </Stack>
                    <Typography sx={{ fontSize: 12, color: MUTED }}>
                      {formatReviewDate(review.date)}
                    </Typography>
                  </Box>
                </Stack>
                <Rating
                  value={review.rating}
                  readOnly
                  size="small"
                  sx={{
                    mt: 1.25,
                    color: RATING_COLOR,
                    fontSize: 17,
                    "& .MuiRating-icon": { mr: 0.15 },
                  }}
                />
                {review.comment && (
                  <Typography
                    sx={{
                      mt: 0.8,
                      fontSize: 13.5,
                      lineHeight: 1.55,
                      color: "text.secondary",
                    }}
                  >
                    {review.comment}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
};
