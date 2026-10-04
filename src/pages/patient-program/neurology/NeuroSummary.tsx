import React from "react";
import { Stack } from "@mui/material";

import type { SummaryChip } from "./neuroSignals";
import { LevelChip } from "./NeuroControls";

/** Метки по последним данным (ТЗ §4): цвет — по правилам раздела, у метки не из последнего осмотра — дата. */
export const NeuroSummary: React.FC<{ chips: ReadonlyArray<SummaryChip> }> = ({ chips }) =>
  chips.length ? (
    <Stack direction="row" gap={0.75} flexWrap="wrap">
      {chips.map((chip) => (
        <LevelChip key={chip.key} level={chip.level} label={chip.text} date={chip.date} />
      ))}
    </Stack>
  ) : null;
