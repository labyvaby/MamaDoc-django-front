import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";

import { AppCard } from "../../components/ui";
import { DEALS_MODULE_ENABLED } from "../../api/deals";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { useCanChecker } from "../../hooks/useCan";
import { formatKGS } from "../../utility/format";
import { WidgetError, type WidgetProps } from "./widgetKit";
import { num } from "./widgetUtils";
import { useDashboardData } from "./DashboardData";

type Tone = "neutral" | "error" | "success";

interface OpsMetric {
  value: React.ReactNode;
  label: string;
  hint?: React.ReactNode;
  tone?: Tone;
}

const TONE_COLOR: Record<Tone, string> = {
  neutral: "text.primary",
  error: "error.onSurface",
  success: "success.onSurface",
};

/** Одна секция карточки: заголовок-ссылка и две метрики. */
const OpsSection: React.FC<{
  title: string;
  sub: string;
  href: string;
  loading: boolean;
  error?: unknown;
  metrics: OpsMetric[];
}> = ({ title, sub, href, loading, error, metrics }) => (
  <Stack spacing={1.5} sx={{ px: 2, pt: 1.75, pb: 2, minWidth: 0 }}>
    <Box
      component={RouterLink}
      to={href}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        color: "text.primary",
        textDecoration: "none",
        "&:hover": { color: "primary.onSurface" },
      }}
    >
      <Typography sx={{ fontSize: "0.9375rem", fontWeight: 650, color: "inherit" }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", ml: 0.5 }} noWrap>
        {sub}
      </Typography>
      <ChevronRightOutlined sx={{ fontSize: 16, color: "text.disabled", ml: "auto" }} />
    </Box>
    {error ? (
      <WidgetError error={error} />
    ) : (
      metrics.map((m) => (
        <Box key={m.label}>
          {loading ? (
            <Skeleton variant="text" width="70%" height={32} />
          ) : (
            <Stack direction="row" alignItems="baseline" spacing={1}>
              <Typography
                sx={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                  fontVariantNumeric: "tabular-nums",
                  color: TONE_COLOR[m.tone ?? "neutral"],
                }}
              >
                {m.value}
              </Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                {m.label}
              </Typography>
            </Stack>
          )}
          {m.hint && !loading && (
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", opacity: 0.9 }}>
              {m.hint}
            </Typography>
          )}
        </Box>
      ))
    )}
  </Stack>
);

/**
 * Задачи, воронка и отзывы — одной полосой из трёх секций вместо трёх узких
 * карточек по две цифры: меньше рамок и шапок, та же информация.
 *
 * Секция без прав не рисуется, оставшиеся делят ширину поровну. Задачи и
 * воронка — всегда «сейчас», отзывы — за выбранный период.
 * Красным — только то, что требует реакции (просрочки, негатив), и только
 * когда оно не ноль.
 */
export const OpsWidget: React.FC<WidgetProps> = ({ range }) => {
  const { can } = useCanChecker();
  const canTasks = can(PAGE_PERMISSIONS.tasks);
  // Воронка ждёт бэкенда на проде: секцию убираем тем же флагом, что и
  // страницу с пунктом меню — иначе карточка встречает ошибкой загрузки.
  const canDeals = DEALS_MODULE_ENABLED && can(PAGE_PERMISSIONS.deals);
  const canReviews = can(PAGE_PERMISSIONS.reviews);

  const data = useDashboardData();
  const { prev } = data;
  // Секция рисуется, если есть право и раздел пришёл (или ещё грузится):
  // сервер не отдаёт раздел выключенного модуля — пустую секцию не показываем.
  const shows = (key: "tasks" | "deals" | "reviews") =>
    !!data.sections[key] || data.isLoading(key) || !!data.error(key);

  const sections: React.ReactNode[] = [];

  if (canTasks && shows("tasks")) {
    const t = data.sections.tasks;
    sections.push(
      <OpsSection
        key="tasks"
        title="Задачи"
        sub="сейчас"
        href="/tasks"
        loading={data.isLoading("tasks")}
        error={data.error("tasks")}
        metrics={[
          {
            value: t?.overdue ?? 0,
            label: "просрочено",
            hint: t?.awaitingApproval ? `ждут приёмки — ${t.awaitingApproval}` : undefined,
            tone: t && t.overdue > 0 ? "error" : "neutral",
          },
          {
            value: t?.inProgress ?? 0,
            label: "в работе",
            hint: t?.new ? `новых — ${t.new}` : undefined,
          },
        ]}
      />,
    );
  }

  if (canDeals && shows("deals")) {
    const d = data.sections.deals;
    sections.push(
      <OpsSection
        key="deals"
        title="Воронка"
        sub="сейчас"
        href="/deals"
        loading={data.isLoading("deals")}
        error={data.error("deals")}
        metrics={[
          {
            value: d?.openCount ?? 0,
            label: "обращений в работе",
            hint: d && num(d.openAmount) > 0 ? `на ${formatKGS(d.openAmount)}` : undefined,
          },
          {
            // Просроченное касание — то, из-за чего лиды умирают молча.
            value: d?.overdueActionsCount ?? 0,
            label: "касаний просрочено",
            hint: d?.todayActionsCount ? `на сегодня — ${d.todayActionsCount}` : undefined,
            tone: d && d.overdueActionsCount > 0 ? "error" : "neutral",
          },
        ]}
      />,
    );
  }

  if (canReviews && shows("reviews")) {
    const r = data.sections.reviews;
    const p = r?.baseline;
    // Без единого отправленного запроса бэк отдаёт averageRating "0.0". Показать
    // ноль значило бы соврать: это не плохая оценка, а отсутствие оценок.
    const hasReviews = !!r && r.sent > 0;
    const responsePercent = r && r.sent > 0 ? Math.round((r.answered / r.sent) * 100) : 0;
    sections.push(
      <OpsSection
        key="reviews"
        title="Отзывы"
        sub={range.label}
        href="/reviews"
        loading={data.isLoading("reviews")}
        error={data.error("reviews")}
        metrics={[
          {
            value: hasReviews ? r!.averageRating.replace(".", ",") : "—",
            label: "средняя оценка",
            hint: hasReviews
              ? `${r!.answered} из ${r!.sent} ответили · отклик ${responsePercent}%`
              : "запросов не было",
            tone: hasReviews ? (num(r!.averageRating) >= 4 ? "success" : "error") : "neutral",
          },
          {
            value: r?.negative ?? 0,
            label: "негативных",
            hint: p ? `${prev.label} — ${p.negative}` : undefined,
            tone: r && r.negative > 0 ? "error" : "neutral",
          },
        ]}
      />,
    );
  }

  return (
    <AppCard
      variant="outlined"
      elevation={0}
      disableContentPadding
      sx={{ height: "100%" }}
    >
      <Box
        sx={{
          height: "100%",
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0,1fr)",
            sm: `repeat(${Math.max(1, sections.length)}, minmax(0,1fr))`,
          },
          // Разделители между секциями: вертикальные в строку, горизонтальные
          // в столбик на телефоне.
          "& > * + *": {
            borderLeft: { xs: 0, sm: 1 },
            borderTop: { xs: 1, sm: 0 },
            borderColor: { xs: "divider", sm: "divider" },
          },
        }}
      >
        {sections}
      </Box>
    </AppCard>
  );
};

export default OpsWidget;
