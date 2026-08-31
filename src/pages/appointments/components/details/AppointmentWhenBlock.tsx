import React from "react";
import { Box, Chip, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import dayjs from "dayjs";

import AppointmentStatusChips, {
  type AppointmentStatusSource,
} from "../../../../components/appointments/AppointmentStatusChips";
import AppointmentReviewStatus from "../../../reviews/AppointmentReviewBlock";
import { useT } from "../../../../i18n/VerticalProvider";
import { subtleBg } from "../../../../theme";

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

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
  /**
   * Ниже на странице виден полный платёжный блок (свой статус оплаты крупно) —
   * не повторяем его же чипом «Оплачено» здесь. Для ролей без доступа к
   * финансам блока нет, чип остаётся единственным источником этого факта.
   */
  hidePaymentChip?: boolean;
  /** Отменить ошибочную отметку «Пациент здесь». */
  onUndoArrived?: () => void;
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
  hidePaymentChip,
  onUndoArrived,
}) => {
  const { t } = useT("appointments");

  const start = React.useMemo(() => dayjs(scheduledAt), [scheduledAt]);
  const end = React.useMemo(
    () => (endsAt ? dayjs(endsAt) : null),
    [endsAt],
  );
  const hasRange = Boolean(end && end.isValid() && end.isAfter(start));

  const timeLabel = hasRange ? `${start.format("HH:mm")} – ${end!.format("HH:mm")}` : start.format("HH:mm");
  // День и месяц уже видны на плашке-календаре слева — тут только день недели
  // (плюс год, если приём не в текущем году — на плашке года нет).
  const weekdayLabel = capitalize(
    start.year() === dayjs().year() ? start.format("dddd") : start.format("dddd, YYYY"),
  );

  // Длительность визита — «45 мин» / «1 ч 30 мин»; видно только когда знаем конец.
  const durationLabel = React.useMemo(() => {
    if (!hasRange) return null;
    const minutes = end!.diff(start, "minute");
    if (minutes <= 0) return null;
    if (minutes < 60) return `${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
  }, [start, end, hasRange]);

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
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        {/* Плашка-«отрывной календарь»: месяц сверху, число крупно — быстрее
            считывается взглядом, чем текст в одну строку. */}
        <Box
          sx={(th) => ({
            width: 46,
            height: 46,
            flexShrink: 0,
            borderRadius: "10px",
            border: 1,
            borderColor: "divider",
            bgcolor: subtleBg(th),
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          })}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: "0.62rem", lineHeight: 1, fontWeight: 600 }}
          >
            {start.format("MMM")}
          </Typography>
          <Typography
            variant="h6"
            color="primary.onSurface"
            sx={{ fontSize: "1.2rem", fontWeight: 700, lineHeight: 1.25 }}
          >
            {start.format("D")}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Эйбрау-строка над временем: день недели + «Сегодня/Завтра» — читается
              первым и задаёт контекст, само время ниже крупнее и заметнее. */}
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {weekdayLabel}
            </Typography>
            {relativeDayLabel && (
              <Chip
                size="small"
                label={relativeDayLabel}
                sx={(th) => ({
                  height: 20,
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  borderRadius: "7px",
                  bgcolor: alpha(th.palette.primary.main, th.palette.mode === "dark" ? 0.18 : 0.1),
                  color: "primary.onSurface",
                  "& .MuiChip-label": { px: 1 },
                })}
              />
            )}
          </Stack>

          <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
            <Typography
              variant="h6"
              fontWeight={700}
              color="text.primary"
              sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}
            >
              {timeLabel}
            </Typography>
            {durationLabel && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={(th) => ({
                  px: 0.75,
                  py: 0.125,
                  borderRadius: "7px",
                  fontWeight: 600,
                  bgcolor: subtleBg(th, true),
                })}
              >
                {durationLabel}
              </Typography>
            )}
            {isNight && (
              <Tooltip title={t("details.nightVisit")}>
                <NightlightOutlined sx={{ fontSize: 19, color: "primary.onSurface" }} />
              </Tooltip>
            )}
          </Stack>
        </Box>
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
        <AppointmentStatusChips
          appointment={statusSource}
          hidePayChip={hidePaymentChip}
          onUndoArrived={onUndoArrived}
        />
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
        {/* Только статус уже существующего запроса отзыва — кнопка «Запросить
            отзыв» теперь в шапке карточки, вместе с остальными действиями. */}
        <AppointmentReviewStatus appointmentId={appointmentId} />
      </Stack>

      {/* Кто создал/изменил — раньше пряталось в тултип по ховеру иконки
          часов: на мобильном тултип по тапу почти не открывается (нужен
          долгий тап), и факт был фактически невидим. Теперь строка видна
          всегда, но самая тихая по цвету — это справочная, а не ключевая
          информация. */}
      {createdAt && (
        <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 1 }}>
          {t("details.createdAt", {
            when: dayjs(createdAt).format("DD.MM.YYYY HH:mm"),
            author: createdByName ? ` · ${createdByName}` : "",
          })}
          {updatedAt && updatedAt !== createdAt && (
            <>
              {" · "}
              {t("details.updatedAt", {
                when: dayjs(updatedAt).format("DD.MM.YYYY HH:mm"),
                author: updatedByName ? ` · ${updatedByName}` : "",
              })}
            </>
          )}
        </Typography>
      )}
    </Box>
  );
};

export default AppointmentWhenBlock;
