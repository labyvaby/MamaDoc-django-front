import React from "react";
import {
  Box,
  Dialog,
  DialogContent,
  IconButton,
  Rating,
  Stack,
  Typography,
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
      maxWidth="sm"
      PaperProps={{ sx: { borderRadius: BOOKING_RADIUS } }}
    >
      <DialogContent sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{t("reviewsTitle")}</Typography>
            {rating != null && (
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <StarRounded sx={{ fontSize: 16, color: RATING_COLOR }} />
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: RATING_COLOR }}>
                  {rating}
                </Typography>
                <Typography sx={{ fontSize: 12, color: MUTED }}>
                  · {formatReviewsCount(total)}
                </Typography>
              </Stack>
            )}
          </Stack>
          <IconButton size="small" onClick={onClose} aria-label="Закрыть">
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>

        {reviews.length === 0 ? (
          <Stack alignItems="center" spacing={2} sx={{ py: 5 }}>
            <ChatBubbleOutlineOutlined sx={{ fontSize: 64, color: "text.disabled" }} />
            <Typography sx={{ fontSize: 16, fontWeight: 500 }}>{t("noReviews")}</Typography>
          </Stack>
        ) : (
          <Stack sx={{ maxHeight: 420, overflowY: "auto" }}>
            {reviews.map((review, index) => (
              <Box
                key={index}
                sx={{ py: 2, ...(index > 0 ? { borderTop: `1px solid ${DIVIDER}` } : null) }}
              >
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
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
                  <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>
                      {review.patientName}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: MUTED }}>
                      {formatReviewDate(review.date)}
                    </Typography>
                  </Box>
                </Stack>
                <Rating
                  value={review.rating}
                  readOnly
                  size="small"
                  sx={{ mt: 1, color: RATING_COLOR, fontSize: 16 }}
                />
                {review.comment && (
                  <Typography sx={{ mt: 0.75, fontSize: 13, color: "text.secondary" }}>
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
