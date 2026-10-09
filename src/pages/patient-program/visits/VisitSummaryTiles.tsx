import React from "react";
import { Box, Stack, Typography, alpha, useTheme } from "@mui/material";
import dayjs, { type Dayjs } from "dayjs";

import { UserAvatar } from "../../../components/ui";
import { relativeDay, type Visit, type VisitSummary } from "./visitsData";

const Tile: React.FC<{ label: string; accent?: boolean; children: React.ReactNode }> = ({ label, accent = false, children }) => {
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

interface VisitSummaryTilesProps {
  summary: VisitSummary;
  now: Dayjs;
}

/**
 * Две плитки над лентой: ближайший приём и последний.
 * Брейкпоинты темы свои (sm = 360px), поэтому колонки — с md.
 */
export const VisitSummaryTiles: React.FC<VisitSummaryTilesProps> = ({ summary, now }) => {
  return (
    <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" } }}>
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
    </Box>
  );
};
