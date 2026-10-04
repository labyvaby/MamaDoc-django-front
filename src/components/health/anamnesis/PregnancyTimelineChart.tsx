import React from "react";
import { Box, Typography } from "@mui/material";

import { artSvgStyle, useArtColors, type ArtStatus } from "../../../pages/patient-program/ortho/art/artColors";
import type { Tone } from "./anamnesisTypes";
import type { PregnancyTimelineLayout } from "./pregnancyTimeline";

const status = (tone: Tone): ArtStatus => (tone === "muted" ? "unknown" : tone);

interface PregnancyTimelineProps {
  layout: PregnancyTimelineLayout;
  /** Ширина, меньше которой рисунок не сжимается — на телефоне ось прокручивается вбок. */
  minWidth?: number;
  /** Ширина, больше которой рисунок не растёт (на «Обзоре» — компактнее, на вкладке — во всю ширину). */
  maxWidth?: number;
}

/** Беременность по неделям: триместры, дорожки «Мама» и «Плод», события, роды. */
export const PregnancyTimeline: React.FC<PregnancyTimelineProps> = ({ layout, minWidth = 640, maxWidth }) => {
  const c = useArtColors();
  const { top, bottom } = layout;
  const x0 = layout.trimesters[0].x;
  const x1 = layout.trimesters[2].x + layout.trimesters[2].width;
  const description = [
    "Беременность по неделям",
    ...layout.marks.map((mark) => mark.title),
    layout.birth ? layout.birth.label.replace("·", "в") : "",
  ]
    .filter(Boolean)
    .join("; ");
  return (
    <Box>
      <Box sx={{ overflowX: "auto", border: 1, borderColor: "divider", borderRadius: "12px", px: 0.75, py: 1.25 }}>
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={description} style={{ ...artSvgStyle, minWidth, maxWidth, marginInline: "auto" }}>
          {layout.trimesters.map((band) => (
            <g key={band.label}>
              <rect x={band.x} y={top} width={band.width} height={bottom - top} fill={band.shaded ? c.sunk : c.surface} />
              <text x={band.labelX} y={top - 9} textAnchor="middle" fill={c.muted} fontSize={10.5}>
                {band.label}
              </text>
            </g>
          ))}
          <rect x={x0} y={top} width={x1 - x0} height={bottom - top} fill="none" stroke={c.rule} />
          {layout.lanes.map((lane) => (
            <text key={lane.label} x={x0 - 10} y={lane.y + 4} textAnchor="end" fill={c.ink} fontSize={11.5}>
              {lane.label}
            </text>
          ))}
          {layout.ticks.map((tick) => (
            <g key={tick.week}>
              <line x1={tick.x} y1={bottom} x2={tick.x} y2={bottom + 5} stroke={c.rule} />
              <text x={tick.x} y={bottom + 17} textAnchor="middle" fill={c.muted} fontSize={10.5}>
                {tick.week}
              </text>
            </g>
          ))}
          <text x={x0 - 10} y={bottom + 17} textAnchor="end" fill={c.muted} fontSize={10.5}>
            нед
          </text>
          {layout.marks.map((mark) => {
            const tone = status(mark.tone);
            const color = c.status(tone);
            const textColor = mark.tone === "ok" || mark.tone === "muted" ? c.muted : color;
            return (
              <g key={mark.key}>
                <title>{mark.title}</title>
                {mark.shape === "diamond" ? (
                  <path
                    d={`M${mark.x} ${mark.y - 7} l7 7 l-7 7 l-7 -7 z`}
                    fill={c.statusFill(tone)}
                    stroke={color}
                    strokeWidth={1.3}
                  />
                ) : (
                  <rect
                    x={mark.x}
                    y={mark.y - 7}
                    width={Math.max(mark.x2 - mark.x, 6)}
                    height={14}
                    rx={7}
                    fill={c.statusFill(tone)}
                    stroke={color}
                    strokeWidth={1.3}
                    strokeDasharray={mark.shape === "trimester" ? "4 3" : undefined}
                    opacity={mark.shape === "trimester" ? 0.6 : 1}
                  />
                )}
                <text
                  x={mark.labelX}
                  y={mark.labelY}
                  textAnchor={mark.labelAnchor}
                  fill={mark.shape === "diamond" ? textColor : color}
                  fontSize={mark.shape === "diamond" ? 10.5 : 11.5}
                >
                  {mark.label}
                </text>
              </g>
            );
          })}
          {layout.birth && (
            <g>
              <line x1={layout.birth.x} y1={top - 4} x2={layout.birth.x} y2={bottom} stroke={c.accent} strokeWidth={1.6} />
              <circle cx={layout.birth.x} cy={top - 4} r={4} fill={c.accent} />
              <text x={x1} y={top - 9} textAnchor="end" fill={c.ink} fontSize={12} fontWeight={600}>
                {layout.birth.label}
              </text>
            </g>
          )}
        </svg>
      </Box>
      {layout.undated.length > 0 && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75 }}>
          Без срока: {layout.undated.join(", ")}
        </Typography>
      )}
    </Box>
  );
};
