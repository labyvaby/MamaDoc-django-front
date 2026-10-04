import React from "react";
import { Alert, Box, Stack, Tooltip, Typography, alpha, useTheme } from "@mui/material";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import type { Dayjs } from "dayjs";

import type { IllnessEpisode, IllnessSummary } from "../../api/health";
import { subtleBorder } from "../../theme/uiHelpers";
import { formatDate } from "./healthMeta";
import { episodesByMonth, frequentIllText, summaryTitle, type CounterGroup } from "./illnessData";
import { MARK_LABELS, markColor, markTextColor, type IllnessMark } from "./illnessUi";

const Tile: React.FC<{ mark: IllnessMark; label: string; value: number; of?: number }> = ({ mark, label, value, of }) => {
  const theme = useTheme();
  const color = markColor(theme, mark);
  const reached = of != null && value >= of;
  const barColor = reached ? theme.palette.warning.main : color;
  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: "12px",
        border: `1px solid ${value ? alpha(color, 0.35) : subtleBorder(theme)}`,
        bgcolor: value ? alpha(color, theme.palette.mode === "dark" ? 0.1 : 0.05) : "transparent",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Подпись переносится («Кишечные инфекции» на телефоне), число — внизу плитки, вровень с соседней. */}
      <Stack direction="row" alignItems="flex-start" gap={0.75} sx={{ minWidth: 0 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0, mt: "5px" }} />
        <Typography variant="caption" fontWeight={600} sx={{ color: value ? markTextColor(theme, mark) : "text.secondary", lineHeight: 1.35 }}>
          {label}
        </Typography>
      </Stack>
      <Typography sx={{ mt: "auto", pt: 0.5, fontSize: 24, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
        {value}
        {of != null && (
          <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, color: "text.secondary", ml: 0.5 }}>
            из {of}
          </Typography>
        )}
      </Typography>
      {of != null && (
        <Box
          role="meter"
          aria-label={`ОРЗ ${value} из ${of}`}
          aria-valuemin={0}
          aria-valuemax={of}
          aria-valuenow={value}
          sx={{ mt: 0.75, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.08), overflow: "hidden" }}
        >
          <Box sx={{ width: `${Math.min(100, (value / Math.max(1, of)) * 100)}%`, height: "100%", bgcolor: barColor, borderRadius: 2 }} />
        </Box>
      )}
    </Box>
  );
};

const STACK_ORDER: CounterGroup[] = ["ari", "otitis", "intestinal", "other"];
const SUMMARY_CONTAINER = "illness-summary";

/** Случаи по месяцам за год: столбик — сколько началось, цвет — группа (как у плиток). */
const MonthBars: React.FC<{ episodes: ReadonlyArray<IllnessEpisode>; today: Dayjs }> = ({ episodes, today }) => {
  const theme = useTheme();
  const months = React.useMemo(() => episodesByMonth(episodes, today), [episodes, today]);
  const max = Math.max(2, ...months.map((month) => month.total));
  return (
    <Box
      aria-label="Случаи болезни по месяцам за последний год"
      sx={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 0.5, alignItems: "end", maxWidth: 360 }}
    >
      {months.map((month, index) => {
        const current = index === months.length - 1;
        return (
          <Tooltip key={month.key} title={month.title} arrow>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25 }}>
              <Box
                sx={{
                  width: "100%",
                  maxWidth: 14,
                  height: 34,
                  display: "flex",
                  flexDirection: "column-reverse",
                  gap: "1px",
                }}
              >
                {month.total === 0 ? (
                  <Box sx={{ height: 3, borderRadius: "3px", bgcolor: alpha(theme.palette.text.primary, 0.08) }} />
                ) : (
                  STACK_ORDER.filter((group) => month.counts[group] > 0).map((group) => (
                    <Box
                      key={group}
                      sx={{
                        height: `${(month.counts[group] / max) * 100}%`,
                        minHeight: 4,
                        borderRadius: "3px",
                        bgcolor: markColor(theme, group),
                      }}
                    />
                  ))
                )}
              </Box>
              <Typography
                sx={{ fontSize: 10, lineHeight: 1, color: current ? "primary.main" : "text.disabled", fontWeight: current ? 700 : 500 }}
              >
                {month.label}
              </Typography>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
};

interface IllnessSummaryPanelProps {
  summary: IllnessSummary;
  episodes: ReadonlyArray<IllnessEpisode>;
  today: Dayjs;
}

/**
 * «За 12 месяцев» (§3.3–§3.4): ОРЗ к порогу «часто болеющего», отиты,
 * кишечные, стационар; столбики по месяцам и жёлтая подсказка, если порог
 * достигнут. Подсказка ничего не ставит сама.
 */
export const IllnessSummaryPanel: React.FC<IllnessSummaryPanelProps> = ({ summary, episodes, today }) => {
  const hint = frequentIllText(summary);
  return (
    <Box
      sx={(theme) => ({
        p: 1.5,
        borderRadius: "14px",
        border: `1px solid ${hint ? alpha(theme.palette.warning.main, 0.45) : theme.palette.divider}`,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        containerType: "inline-size",
        containerName: SUMMARY_CONTAINER,
      })}
    >
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1} flexWrap="wrap">
        <Typography variant="subtitle2" fontWeight={700}>
          {summaryTitle(summary)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {formatDate(summary.windowFrom)} — {formatDate(summary.windowTo)}
        </Typography>
      </Stack>
      {/* Две плитки в ряд в узкой панели, четыре — в широкой: без «3 + 1». */}
      <Box
        sx={{
          display: "grid",
          gap: 1,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          [`@container ${SUMMARY_CONTAINER} (min-width: 520px)`]: { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" },
        }}
      >
        <Tile mark="ari" label={MARK_LABELS.ari} value={summary.counts.ari} of={summary.frequentIll?.threshold} />
        <Tile mark="otitis" label={MARK_LABELS.otitis} value={summary.counts.otitis} />
        <Tile mark="intestinal" label={MARK_LABELS.intestinal} value={summary.counts.intestinal} />
        <Tile mark="stay" label={MARK_LABELS.stay} value={summary.counts.hospitalizations} />
      </Box>
      <MonthBars episodes={episodes} today={today} />
      {hint && (
        <Alert severity="warning" icon={<WarningAmberRounded fontSize="small" />} sx={{ py: 0.25 }}>
          {hint}
        </Alert>
      )}
    </Box>
  );
};
