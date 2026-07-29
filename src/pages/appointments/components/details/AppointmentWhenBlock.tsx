import React from "react";
import { Box, Chip, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import dayjs from "dayjs";

import AppointmentStatusChips, {
  type AppointmentStatusSource,
} from "../../../../components/appointments/AppointmentStatusChips";
import AppointmentReviewBlock from "../../../reviews/AppointmentReviewBlock";
import { useT } from "../../../../i18n/VerticalProvider";

export interface AppointmentWhenBlockProps {
  appointmentId: number;
  scheduledAt: string;
  /** Конец приёма (начало + длительности услуг) — рисуем интервалом. */
  endsAt?: string | null;
  isNight?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByName?: string;
  updatedByName?: string;
  hasBankConfirmation?: boolean;
  /** Источник для чипов: поля оплаты берём из журнала платежей, он свежее. */
  statusSource: AppointmentStatusSource;
  paymentsLoading?: boolean;
}

/**
 * Когда приём и в каком он состоянии — дата с интервалом, относительный день,
 * чипы статуса/оплаты и отзыв одной группой.
 *
 * Раньше это были три блока с шагом 24px, а «Создан/Изм» занимали две строки на
 * каждом приёме — теперь они в тултипе иконки истории.
 */
const AppointmentWhenBlock: React.FC<AppointmentWhenBlockProps> = ({
  appointmentId,
  scheduledAt,
  endsAt,
  isNight,
  createdAt,
  updatedAt,
  createdByName,
  updatedByName,
  hasBankConfirmation,
  statusSource,
  paymentsLoading,
}) => {
  const { t } = useT("appointments");

  const dateTimeLabel = React.useMemo(() => {
    const start = dayjs(scheduledAt);
    const end = endsAt ? dayjs(endsAt) : null;
    const base = start.format("D MMMM YYYY, HH:mm");
    return end && end.isValid() && end.isAfter(start)
      ? `${base} – ${end.format("HH:mm")}`
      : base;
  }, [scheduledAt, endsAt]);

  // «сегодня / завтра / через N дн.» — регистратуре важно, смотрит она на
  // текущий день или на запись будущей/прошлой даты.
  const relativeDayLabel = React.useMemo(() => {
    const diff = dayjs(scheduledAt).startOf("day").diff(dayjs().startOf("day"), "day");
    if (diff === 0) return t("details.relToday");
    if (diff === 1) return t("details.relTomorrow");
    if (diff === -1) return t("details.relYesterday");
    return diff > 0
      ? t("details.relInDays", { count: diff })
      : t("details.relDaysAgo", { count: -diff });
  }, [scheduledAt, t]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <CalendarMonthOutlined fontSize="small" sx={{ color: "primary.onSurface" }} />
        <Typography
          variant="h6"
          fontWeight={700}
          color="text.primary"
          sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.3 }}
        >
          {dateTimeLabel}
        </Typography>
        {relativeDayLabel && (
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            {relativeDayLabel}
          </Typography>
        )}
        {isNight && (
          <Tooltip title={t("details.nightVisit")}>
            <NightlightOutlined sx={{ fontSize: 20, color: "primary.onSurface" }} />
          </Tooltip>
        )}
        {createdAt && (
          <Tooltip
            title={
              <Box>
                <Typography variant="caption" display="block">
                  {t("details.createdAt", {
                    when: dayjs(createdAt).format("DD.MM.YYYY HH:mm"),
                    author: createdByName ? ` · ${createdByName}` : "",
                  })}
                </Typography>
                {updatedAt && updatedAt !== createdAt && (
                  <Typography variant="caption" display="block">
                    {t("details.updatedAt", {
                      when: dayjs(updatedAt).format("DD.MM.YYYY HH:mm"),
                      author: updatedByName ? ` · ${updatedByName}` : "",
                    })}
                  </Typography>
                )}
              </Box>
            }
          >
            <HistoryOutlined sx={{ fontSize: 18, color: "text.disabled", ml: "auto" }} />
          </Tooltip>
        )}
      </Stack>

      {/* Статус приёма + факт оплаты одним компонентом (как в списке приёмов):
          бэк при оплате статус приёма не меняет, и раньше открытый приём
          показывал врачу «Ожидаем» на оплаченном визите — финансовый блок ниже
          врачу недоступен. Факт оплаты виден всем ролям, суммы и действия
          остаются под правами. */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        flexWrap="wrap"
        useFlexGap
        sx={{ mt: 1 }}
      >
        <AppointmentStatusChips appointment={statusSource} />
        {hasBankConfirmation && (
          <Tooltip title={t("details.paymentConfirmedByBank")}>
            <Chip
              size="small"
              label="✓✓"
              sx={{
                bgcolor: "primary.main",
                color: "primary.contrastText",
                fontWeight: 700,
                fontSize: "0.75rem",
                letterSpacing: 1,
              }}
            />
          </Tooltip>
        )}
        {paymentsLoading && <CircularProgress size={14} />}
        {/* Отзыв — той же строкой: отдельный блок тратил три строки
            («Отзыв» / «не запрашивался» / кнопка). */}
        <AppointmentReviewBlock appointmentId={appointmentId} />
      </Stack>
    </Box>
  );
};

export default AppointmentWhenBlock;
