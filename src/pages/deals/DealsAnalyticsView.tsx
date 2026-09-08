import React from "react";
import { Alert, Box, Divider, Stack, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { DateRangeField, type DateRange } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import { useT } from "../../i18n/VerticalProvider";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import {
  getDealsFunnel,
  type DealsFunnelBreakdown,
  type DealsFunnelStage,
} from "../../api/deals";
import { dealsErrorMessage } from "./meta";

type DealsAnalyticsViewProps = {
  pipelineId?: number;
  orgId?: number;
  enabled: boolean;
};

/**
 * Аналитика воронки: конверсия по этапам, итоги, разбивки.
 *
 * Считается на бэке по логу переходов — по входам в этап внутри периода, а не
 * по текущему положению карточек. Поэтому цифры прошлого месяца не меняются от
 * сегодняшних переносов, и решение владельца воспроизводимо.
 */
const DealsAnalyticsView: React.FC<DealsAnalyticsViewProps> = ({ pipelineId, orgId, enabled }) => {
  const { t } = useT("deals");
  const theme = useTheme();

  /** По умолчанию — текущий месяц: с ним владелец сверяет план. */
  const [range, setRange] = React.useState<DateRange>(() => ({
    from: dayjs().startOf("month"),
    to: dayjs().endOf("month"),
  }));

  const filters = React.useMemo(
    () => ({
      pipelineId,
      organizationId: orgId,
      dateFrom: range.from.format("YYYY-MM-DD"),
      dateTo: range.to.format("YYYY-MM-DD"),
    }),
    [pipelineId, orgId, range],
  );

  const funnelQuery = useQuery({
    queryKey: djangoQueryKeys.deals.funnel(filters as Record<string, unknown>),
    queryFn: ({ signal }) => getDealsFunnel(filters, signal),
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const funnel = funnelQuery.data;

  /** Ширина полосы этапа — доля от самого массового входа, а не от общего числа. */
  const maxEntered = Math.max(1, ...(funnel?.stages ?? []).map((s) => s.entered));

  return (
    <Stack gap={2} sx={{ overflowY: "auto", pb: 2 }}>
      <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
        <DateRangeField
          value={range}
          onChange={(next) => setRange(next)}
          minWidth={260}
        />
        <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 520 }}>
          {t("analytics.basisHint")}
        </Typography>
      </Stack>

      {funnelQuery.isError ? (
        <Alert severity="error" variant="outlined">
          {dealsErrorMessage(funnelQuery.error, t("analytics.loadError"))}
        </Alert>
      ) : null}

      {funnel ? (
        <>
          {/* Итоги: то, ради чего владелец открывает вкладку. */}
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Metric label={t("analytics.created")} value={String(funnel.totals.created)} />
            <Metric label={t("analytics.won")} value={String(funnel.totals.won)} tone="success" />
            <Metric label={t("analytics.lost")} value={String(funnel.totals.lost)} tone="error" />
            <Metric label={t("analytics.inProgress")} value={String(funnel.totals.inProgress)} />
            <Metric label={t("analytics.wonAmount")} value={formatKGS(funnel.totals.wonAmount)} />
            <Metric label={t("analytics.avgCheck")} value={formatKGS(funnel.totals.avgCheck)} />
            {/* avgCycleDays == null — это «не из чего считать», а не ноль дней. */}
            <Metric
              label={t("analytics.avgCycle")}
              value={
                funnel.totals.avgCycleDays == null
                  ? t("analytics.avgCycleEmpty")
                  : t("analytics.avgCycleDays", { count: Math.round(funnel.totals.avgCycleDays) })
              }
              hint={t("analytics.avgCycleHint")}
            />
            <Metric
              label={t("analytics.pipelineAmount")}
              value={formatKGS(funnel.totals.pipelineAmount)}
              hint={t("analytics.pipelineAmountHint")}
            />
          </Stack>

          <Divider />

          <Stack gap={1}>
            <Typography variant="subtitle2">{t("analytics.conversion")}</Typography>
            {funnel.stages.map((stage) => (
              <StageRow key={stage.stageId} stage={stage} maxEntered={maxEntered} />
            ))}
          </Stack>

          <Divider />

          <Stack
            direction={{ xs: "column", md: "row" }}
            gap={2}
            alignItems="flex-start"
            sx={{ width: "100%" }}
          >
            <BreakdownTable
              title={t("analytics.bySource")}
              rows={funnel.bySource}
              emptyText={t("analytics.empty")}
            />
            <BreakdownTable
              title={t("analytics.byAssignee")}
              rows={funnel.byAssignee}
              emptyText={t("analytics.empty")}
            />
            <Stack gap={0.5} sx={{ flex: 1, minWidth: 0, width: "100%" }}>
              <Typography variant="subtitle2">{t("analytics.lostReasons")}</Typography>
              {funnel.lostReasons.length === 0 ? (
                <Typography variant="body2" color="text.disabled">
                  {t("analytics.empty")}
                </Typography>
              ) : (
                funnel.lostReasons.map((r) => (
                  <Stack
                    key={r.lostReasonId ?? "none"}
                    direction="row"
                    alignItems="center"
                    gap={1}
                    sx={{ px: 1.25, py: 0.75, borderRadius: 2, bgcolor: subtleBg(theme) }}
                  >
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                      {r.name}
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {r.count}
                    </Typography>
                  </Stack>
                ))
              )}
            </Stack>
          </Stack>
        </>
      ) : null}
    </Stack>
  );
};

/** Плитка итога — крупная цифра и подпись, без графиков. */
const Metric: React.FC<{ label: string; value: string; hint?: string; tone?: "success" | "error" }> = ({
  label,
  value,
  hint,
  tone,
}) => {
  const theme = useTheme();
  const body = (
    <Stack
      sx={{
        px: 1.5,
        py: 1,
        borderRadius: 2,
        bgcolor: subtleBg(theme),
        minWidth: 132,
      }}
    >
      <Typography variant="caption" color="text.secondary" noWrap>
        {label}
      </Typography>
      <Typography
        variant="h6"
        sx={{ color: tone ? `${tone}.main` : "text.primary", lineHeight: 1.3 }}
        noWrap
      >
        {value}
      </Typography>
    </Stack>
  );
  return hint ? <Tooltip title={hint}>{body}</Tooltip> : body;
};

/**
 * Строка этапа: полоса длиной по числу вошедших плюс три цифры.
 *
 * «Дошли дальше» считаем от вошедших в этот этап, а не от общего числа
 * обращений: владельца интересует, где именно теряются деньги, а сквозной
 * процент этого не показывает.
 */
const StageRow: React.FC<{ stage: DealsFunnelStage; maxEntered: number }> = ({
  stage,
  maxEntered,
}) => {
  const { t } = useT("deals");
  const theme = useTheme();
  const width = Math.max(2, Math.round((stage.entered / maxEntered) * 100));
  const rate = stage.entered > 0 ? Math.round((stage.movedForward / stage.entered) * 100) : null;

  return (
    <Stack gap={0.5} sx={{ px: 1.25, py: 1, borderRadius: 2, bgcolor: subtleBg(theme) }}>
      <Stack direction="row" alignItems="baseline" gap={1}>
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }} noWrap>
          {stage.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {t("analytics.entered")}: <b>{stage.entered}</b>
        </Typography>
        {stage.kind === "open" ? (
          <Typography variant="caption" color="text.secondary" noWrap>
            {t("analytics.movedForward")}: <b>{stage.movedForward}</b>
            {rate != null ? ` (${rate}%)` : ""}
          </Typography>
        ) : null}
        <Typography variant="caption" color="text.secondary" noWrap>
          {t("analytics.lostAt")}: <b>{stage.lost}</b>
        </Typography>
        <Typography variant="caption" noWrap sx={{ minWidth: 90, textAlign: "right" }}>
          {formatKGS(stage.amountTotal)}
        </Typography>
      </Stack>

      <Box
        sx={{
          height: 6,
          borderRadius: 3,
          width: `${width}%`,
          bgcolor:
            stage.kind === "won"
              ? "success.main"
              : stage.kind === "lost"
                ? "error.main"
                : "primary.main",
          opacity: stage.entered > 0 ? 1 : 0.25,
        }}
      />
    </Stack>
  );
};

/** Разбивка по источнику или ответственному. Ключ строки — `id` (не sourceId). */
const BreakdownTable: React.FC<{
  title: string;
  rows: DealsFunnelBreakdown[];
  emptyText: string;
}> = ({ title, rows, emptyText }) => {
  const { t } = useT("deals");
  const theme = useTheme();

  return (
    <Stack gap={0.5} sx={{ flex: 1, minWidth: 0, width: "100%" }}>
      <Typography variant="subtitle2">{title}</Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          {emptyText}
        </Typography>
      ) : (
        rows.map((row) => (
          <Stack
            key={row.id ?? "none"}
            direction="row"
            alignItems="center"
            gap={1}
            sx={{ px: 1.25, py: 0.75, borderRadius: 2, bgcolor: subtleBg(theme) }}
          >
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
              {row.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {t("analytics.created")}: <b>{row.created}</b>
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {t("analytics.won")}: <b>{row.won}</b>
            </Typography>
            <Typography variant="caption" noWrap sx={{ minWidth: 88, textAlign: "right" }}>
              {formatKGS(row.wonAmount)}
            </Typography>
          </Stack>
        ))
      )}
    </Stack>
  );
};

export default DealsAnalyticsView;
