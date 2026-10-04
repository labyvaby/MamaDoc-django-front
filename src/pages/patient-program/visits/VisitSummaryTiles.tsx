import React from "react";
import { Box, Stack, Tooltip, Typography, alpha, useTheme } from "@mui/material";
import dayjs, { type Dayjs } from "dayjs";

import { UserAvatar } from "../../../components/ui";
import { pluralRu } from "../../../utility/amountInWords";
import { monthYearGenitive, relativeDay, type Visit, type VisitSummary } from "./visitsData";

const Tile: React.FC<{ label: string; accent?: boolean; wide?: boolean; children: React.ReactNode }> = ({
  label,
  accent = false,
  wide = false,
  children,
}) => {
  const theme = useTheme();
  const color = accent ? theme.palette.primary.main : theme.palette.text.secondary;
  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: "14px",
        border: `1px solid ${alpha(color, accent ? 0.4 : 0.2)}`,
        bgcolor: alpha(color, accent ? 0.06 : 0.025),
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        // На планшете третья плитка — во всю ширину под первыми двумя.
        gridColumn: wide ? { md: "1 / -1", lg: "auto" } : undefined,
      }}
    >
      <Typography variant="caption" sx={{ color: accent ? "primary.main" : "text.secondary", fontWeight: 600 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
};

const BigDate: React.FC<{ at: string; now: Dayjs }> = ({ at, now }) => {
  const date = dayjs(at);
  return (
    <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>
      {date.format("D MMMM")}
      {date.year() !== now.year() && (
        <Typography component="span" sx={{ fontSize: 16, fontWeight: 600, color: "text.secondary", ml: 0.75 }}>
          {date.year()}
        </Typography>
      )}
    </Typography>
  );
};

const VisitTileBody: React.FC<{ visit: Visit; now: Dayjs }> = ({ visit, now }) => {
  const doctor = visit.doctors[0];
  return (
    <>
      <BigDate at={visit.at} now={now} />
      <Typography variant="body2" color="text.secondary">
        {dayjs(visit.at).format("dddd, HH:mm")} · {relativeDay(visit.at, now)}
      </Typography>
      {doctor && (
        <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 0.5, minWidth: 0 }}>
          <UserAvatar src={doctor.photoUrl} name={doctor.name} size={22} />
          <Typography variant="body2" fontWeight={600} noWrap>
            {doctor.name}
          </Typography>
        </Stack>
      )}
    </>
  );
};

/** Приёмы по месяцам за год: высота столбика — сколько было приёмов. */
const MonthBars: React.FC<{ summary: VisitSummary }> = ({ summary }) => {
  const theme = useTheme();
  const max = Math.max(1, ...summary.months.map((month) => month.count));
  return (
    <Box
      aria-label="Приёмы по месяцам за последний год"
      sx={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 0.5, mt: { xs: 1, md: 0, lg: 1 }, alignItems: "end", maxWidth: 320 }}
    >
      {summary.months.map((month, index) => {
        const share = month.count / max;
        const current = index === summary.months.length - 1;
        return (
          <Tooltip key={month.key} title={month.title} arrow>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25 }}>
              <Box
                sx={{
                  width: "100%",
                  maxWidth: 14,
                  height: 4 + Math.round(share * 26),
                  borderRadius: "4px",
                  bgcolor: month.count
                    ? alpha(theme.palette.primary.main, 0.35 + share * 0.65)
                    : alpha(theme.palette.text.primary, 0.08),
                }}
              />
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

interface VisitSummaryTilesProps {
  summary: VisitSummary;
  now: Dayjs;
}

/**
 * Три плитки над лентой: ближайший приём, последний, итог за всё время.
 * Брейкпоинты темы свои (sm = 360px), поэтому колонки — с md.
 */
export const VisitSummaryTiles: React.FC<VisitSummaryTilesProps> = ({ summary, now }) => {
  const facts = [
    summary.firstAt ? `с ${monthYearGenitive(summary.firstAt)}` : "",
    summary.doctorsCount ? `${summary.doctorsCount} ${pluralRu(summary.doctorsCount, ["врач", "врача", "врачей"])}` : "",
    summary.withConclusion ? `${summary.withConclusion} с заключением` : "",
  ].filter(Boolean);
  const missed = [
    summary.cancelledCount ? `отменено ${summary.cancelledCount}` : "",
    summary.noShowCount ? `не пришли ${summary.noShowCount}` : "",
  ].filter(Boolean);
  return (
    <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
      <Tile label="Ближайший приём" accent={!!summary.next}>
        {summary.next ? (
          <VisitTileBody visit={summary.next} now={now} />
        ) : (
          <>
            <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, color: "text.disabled" }}>—</Typography>
            <Typography variant="body2" color="text.secondary">
              Не запланирован
            </Typography>
          </>
        )}
      </Tile>
      <Tile label="Последний приём">
        {summary.last ? (
          <VisitTileBody visit={summary.last} now={now} />
        ) : (
          <>
            <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, color: "text.disabled" }}>—</Typography>
            <Typography variant="body2" color="text.secondary">
              Ещё не было
            </Typography>
          </>
        )}
      </Tile>
      <Tile label="За всё время" wide>
        {/* Во всю ширину (планшет) столбики встают справа от цифр, в узкой плитке — под ними. */}
        <Box sx={{ display: "grid", gap: 1, alignItems: "end", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 280px", lg: "1fr" } }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>
              {summary.pastCount}
              <Typography component="span" sx={{ fontSize: 16, fontWeight: 600, color: "text.secondary", ml: 0.75 }}>
                {pluralRu(summary.pastCount, ["приём", "приёма", "приёмов"])}
              </Typography>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {facts.join(" · ") || "Приёмов ещё не было"}
              {missed.length > 0 && (
                <Box component="span" sx={{ color: "text.disabled" }}>
                  {facts.length ? " · " : ""}
                  {missed.join(", ")}
                </Box>
              )}
            </Typography>
          </Box>
          <MonthBars summary={summary} />
        </Box>
      </Tile>
    </Box>
  );
};
