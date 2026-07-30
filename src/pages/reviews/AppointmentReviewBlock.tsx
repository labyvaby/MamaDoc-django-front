import React from "react";
import { Chip, CircularProgress, Rating, Stack, Tooltip, Typography } from "@mui/material";
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

/**
 * Данные и действие отзыва по приёму — раньше жили внутри AppointmentReviewBlock
 * одним куском вместе с кнопкой. Кнопка «Запросить отзыв» переехала в шапку
 * карточки приёма (общий список действий, как «Изменить»/«Начать приём») —
 * рядом со статус-чипами она читалась как ещё один статус, а не действие.
 * Хук отдаёт оба потребителя: статус — сюда же (AppointmentReviewStatus),
 * кнопку — в AppointmentDetailsPanel.
 */
export function useAppointmentReview(appointmentId: number) {
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

  const latest = query.data?.[0] ?? null;
  const isActive = latest != null && ACTIVE_STATUSES.has(latest.status);
  const showButton = canManage && !isActive && !mutation.isPending;
  const statusMeta = latest ? REQUEST_STATUS_META[latest.status] : null;

  return {
    enabled,
    isLoading: query.isLoading,
    latest,
    statusMeta,
    showButton,
    isPending: mutation.isPending,
    requestReview: () => mutation.mutate(),
  };
}

interface Props {
  appointmentId: number;
}

/**
 * Индикатор статуса отзыва (чип статуса + оценка + попытка + время отправки)
 * внутри карточки приёма. Самогейтится по правам reviews.view/manage — для
 * ролей без доступа не рендерит ничего. Кнопка запроса — в шапке карточки,
 * см. useAppointmentReview.
 */
const AppointmentReviewStatus: React.FC<Props> = ({ appointmentId }) => {
  const { enabled, isLoading, latest } = useAppointmentReview(appointmentId);

  if (!enabled) return null;
  // Отзыва нет и показывать нечего — строку не занимаем (кнопка запроса теперь
  // в шапке, тут остаётся только факт уже существующего запроса).
  if (!isLoading && !latest) return null;

  const statusMeta = latest ? REQUEST_STATUS_META[latest.status] : null;

  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
      {isLoading ? (
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
    </Stack>
  );
};

export default AppointmentReviewStatus;
