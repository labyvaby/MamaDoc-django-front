import React from "react";
import {
  Button,
  Chip,
  CircularProgress,
  Rating,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import StarOutlineRounded from "@mui/icons-material/StarOutlineRounded";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import {
  createReviewRequest,
  getReviewRequestsByAppointment,
} from "../../api/reviews";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import { useCan } from "../../hooks/useCan";
import { REQUEST_STATUS_META } from "./meta";

const ACTIVE_STATUSES = new Set(["created", "sent", "rated", "awaiting_comment"]);

interface Props {
  appointmentId: number;
}

/**
 * Индикатор статуса отзыва + кнопка «Запросить отзыв» / «Переотправить»
 * внутри карточки приёма. Самогейтится по правам reviews.view/manage —
 * для ролей без доступа не рендерит ничего.
 *
 * Рендерится одной строкой (без заголовка и обёртки), чтобы вставать в общий
 * ряд чипов статуса карточки: отдельный блок тратил три строки на «Отзыв /
 * не запрашивался / кнопка».
 */
const AppointmentReviewBlock: React.FC<Props> = ({ appointmentId }) => {
  const canView = useCan("reviews.view");
  const canManage = useCan("reviews.manage");
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();

  const enabled = canView || canManage;

  const query = useQuery({
    queryKey: djangoQueryKeys.reviews.byAppointment(appointmentId),
    queryFn: ({ signal }) => getReviewRequestsByAppointment(appointmentId, signal),
    enabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const mutation = useMutation({
    mutationFn: () => createReviewRequest(appointmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.reviews.byAppointment(appointmentId),
      });
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.reviews.all });
      notify?.({ type: "success", message: "Запрос отзыва отправлен" });
    },
    onError: (e) =>
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" }),
  });

  if (!enabled) return null;

  const latest = query.data?.[0] ?? null;
  const isActive = latest != null && ACTIVE_STATUSES.has(latest.status);
  const showButton = canManage && !isActive && !mutation.isPending;
  const statusMeta = latest ? REQUEST_STATUS_META[latest.status] : null;

  // Отзыва нет и запросить его некому — строку не занимаем (раньше здесь
  // висело бесполезное «Отзыв не запрашивался»).
  if (!query.isLoading && !latest && !showButton) return null;

  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
      {query.isLoading ? (
        <CircularProgress size={16} />
      ) : (
        latest && (
          <>
            {statusMeta && (
              <Tooltip title="Отзыв">
                <Chip label={statusMeta.label} color={statusMeta.color} size="small" />
              </Tooltip>
            )}
            {latest.rating != null && (
              <Rating value={latest.rating} readOnly size="small" />
            )}
            {latest.attempt > 1 && (
              <Typography variant="caption" color="text.disabled">
                попытка {latest.attempt}
              </Typography>
            )}
            {latest.sentAt && (
              <Typography variant="caption" color="text.disabled">
                {dayjs(latest.sentAt).format("DD.MM HH:mm")}
              </Typography>
            )}
          </>
        )
      )}

      {showButton && (
        <Button
          size="small"
          variant="outlined"
          startIcon={
            mutation.isPending ? (
              <CircularProgress size={14} />
            ) : (
              <StarOutlineRounded />
            )
          }
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {latest ? "Переотправить" : "Запросить отзыв"}
        </Button>
      )}
    </Stack>
  );
};

export default AppointmentReviewBlock;
