import React from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";

import { THRESHOLDS, generationsLabel, type GenealogicalAssessment } from "./anamnesisRules";
import { toneColor, toneText } from "./anamnesisTone";
import { levelTone } from "./anamnesisTypes";
import { directionLabel } from "./familyDiseases";
import { Panel, ToneChip } from "./anamnesisUi";
import { PedigreeChart } from "./PedigreeChart";
import type { PedigreeLayout, PedigreeNode } from "./pedigreeLayout";
import { hundredths, plural } from "./russian";

const h = (value: number) => hundredths(value / 100);

/** Ступени Кильдияровой с границами из `THRESHOLDS` (ТЗ §3.1, [П] — середины между ступенями учебника). */
const KILDIYAROVA_STEPS = (() => {
  const [low, moderate, high] = THRESHOLDS.kildiyarovaGenealogical;
  return [
    { level: "low", title: "низкая", range: `до ${h(low)}` },
    { level: "moderate", title: "умеренная", range: `${h(low)}–${h(moderate - 1)}` },
    { level: "pronounced", title: "выраженная", range: `${h(moderate)}–${h(high - 1)}` },
    { level: "high", title: "высокая", range: `от ${h(high)}` },
  ] as const;
})();

/** «3 болезни ÷ 7 родственников = 0,43» и ступени шкалы. */
export const GenealogyCalc: React.FC<{ genealogy: GenealogicalAssessment }> = ({ genealogy }) => {
  const theme = useTheme();
  const g = genealogy;
  const tone = g.level ? levelTone(g.level) : "muted";
  const color = toneColor(theme, tone);
  const formula = g.denominator
    ? `${g.numerator} ${plural(g.numerator, "болезнь", "болезни", "болезней")} ÷ ${g.denominator} ${plural(
        g.denominator,
        "родственник",
        "родственника",
        "родственников",
      )} = ${hundredths(g.index ?? 0)}`
    : "Нет родственников со сведениями о здоровье";
  return (
    <Stack gap={1} sx={{ fontSize: 13, minWidth: 0 }}>
      <Box
        sx={{
          fontWeight: 500,
          fontSize: 13,
          border: 1,
          borderColor: "divider",
          borderRadius: "8px",
          px: 1.25,
          py: 1,
          bgcolor: "action.hover",
          color: g.insufficient ? "text.secondary" : "text.primary",
        }}
      >
        {formula}
        {g.insufficient && g.denominator > 0 && " · мало сведений"}
      </Box>
      {g.scale === "kildiyarova" && (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "3px" }}>
          {KILDIYAROVA_STEPS.map((step) => {
            const on = !g.insufficient && g.computedLevel === step.level;
            return (
              <Box
                key={step.level}
                sx={{
                  borderTop: `4px solid ${on ? color : theme.palette.divider}`,
                  pt: 0.5,
                  fontSize: 10.5,
                  fontWeight: 500,
                  lineHeight: 1.35,
                  color: on ? toneText(theme, tone) : "text.secondary",
                }}
              >
                {step.title}
                <br />
                {step.range}
              </Box>
            );
          })}
        </Box>
      )}
      {g.directions.length > 0 && (
        <Stack direction="row" gap={0.75} flexWrap="wrap">
          {g.directions.map((item) => (
            <ToneChip key={item.group} label={`направленность: ${directionLabel(item.group)}`} tone="warn" dot dense />
          ))}
        </Stack>
      )}
    </Stack>
  );
};

interface HeredityPanelProps {
  genealogy: GenealogicalAssessment;
  layout: PedigreeLayout;
  onNode?: (node: PedigreeNode) => void;
}

/**
 * «Наследственность»: родословная (ТЗ §4.2, п. 6). Индекс — на карточке
 * «Генеалогический» вверху обзора, полный расчёт — на вкладке «Наследственность».
 */
export const HeredityPanel: React.FC<HeredityPanelProps> = ({ genealogy, layout, onNode }) => (
  <Panel title="Наследственность" caption={`родословная · ${generationsLabel(layout.rows.length)}`}>
    <PedigreeChart layout={layout} onNode={onNode} />
    {layout.nonBlood.length > 0 && (
      <Typography variant="caption" color="text.secondary">
        Не кровные: {layout.nonBlood.join(", ")}
      </Typography>
    )}
    {genealogy.directions.length > 0 && (
      <Stack direction="row" gap={0.75} flexWrap="wrap">
        {genealogy.directions.map((item) => (
          <ToneChip key={item.group} label={`направленность: ${directionLabel(item.group)}`} tone="warn" dot dense />
        ))}
      </Stack>
    )}
  </Panel>
);
