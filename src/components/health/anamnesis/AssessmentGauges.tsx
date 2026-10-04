import React from "react";
import { Box, ButtonBase, Stack, Tooltip, Typography, alpha, useTheme } from "@mui/material";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";

import { AppButton } from "../../ui";
import { factorText } from "./anamnesisFactors";
import type { BiologicalAssessment, GenealogicalAssessment, SocialAssessment } from "./anamnesisRules";
import { toneColor, toneText } from "./anamnesisTone";
import { SCALE_LEVELS, levelTitle, levelTone, type AssessmentKind, type AssessmentLevel, type Tone } from "./anamnesisTypes";
import { Caption } from "./anamnesisUi";
import { hundredths, plural } from "./russian";

type CellState = "on" | "off" | "empty";

interface Cell {
  key: string;
  state: CellState;
  label?: string;
  tip: React.ReactNode;
}

interface GaugeProps {
  caption: string;
  title: string;
  tone: Tone;
  description: React.ReactNode;
  cells: Cell[];
  /** Подписи под ячейками (периоды биологического анамнеза). */
  labelled?: boolean;
  manualReason?: string | null;
  onClick?: () => void;
}

const Gauge: React.FC<GaugeProps> = ({ caption, title, tone, description, cells, labelled, manualReason, onClick }) => {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  const muted = tone === "muted";
  const cellBg = (state: CellState) => (state === "on" ? color : state === "off" ? theme.palette.divider : "transparent");
  const body = (
    <Box
      sx={{
        border: 1,
        borderColor: muted ? "divider" : alpha(color, 0.5),
        borderRadius: "12px",
        px: 1.75,
        py: 1.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.4,
        minWidth: 0,
        height: "100%",
        width: "100%",
        textAlign: "left",
        bgcolor: "background.paper",
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Caption>{caption}</Caption>
        {manualReason != null && (
          <Tooltip title={manualReason ? `Оценка врача: ${manualReason}` : "Оценка врача"} arrow>
            <Box
              component="span"
              sx={{ fontSize: 10.5, fontWeight: 600, px: 0.75, borderRadius: "6px", bgcolor: alpha(theme.palette.primary.main, 0.12), color: "primary.main" }}
            >
              оценка врача
            </Box>
          </Tooltip>
        )}
      </Stack>
      <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2, color: muted ? "text.secondary" : toneText(theme, tone) }}>{title}</Typography>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary", lineHeight: 1.45 }}>{description}</Typography>
      <Box
        sx={{
          mt: "auto",
          pt: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
          gap: "3px",
        }}
      >
        {cells.map((cell) => (
          <Tooltip key={cell.key} title={cell.tip} arrow>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
              <Box
                sx={{
                  height: 6,
                  borderRadius: "3px",
                  bgcolor: cellBg(cell.state),
                  border: cell.state === "empty" ? `1px dashed ${theme.palette.divider}` : "none",
                }}
              />
              {labelled && (
                <Typography
                  component="span"
                  sx={{
                    fontSize: 9.5,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    color: cell.state === "on" ? toneText(theme, tone) : cell.state === "empty" ? "text.disabled" : "text.secondary",
                  }}
                >
                  {cell.label}
                </Typography>
              )}
            </Box>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
  return onClick ? (
    <ButtonBase onClick={onClick} sx={{ borderRadius: "12px", display: "flex", alignItems: "stretch", width: "100%" }} aria-label={`${caption}: ${title}`}>
      {body}
    </ButtonBase>
  ) : (
    body
  );
};

/** Ступени шкалы без нижней («не отягощён» / «благополучный»): Кильдиярова — четыре. */
function steps(kind: AssessmentKind, scale: string, level: AssessmentLevel | null): Cell[] {
  const levels = SCALE_LEVELS[kind][scale] ?? SCALE_LEVELS[kind].kildiyarova;
  const upper = levels.slice(1);
  const reached = level ? levels.indexOf(level) : 0;
  return upper.map((item, index) => ({
    key: item,
    state: level && index < reached ? "on" : "off",
    tip: levelTitle(kind, item).toLowerCase(),
  }));
}

const relativesText = (n: number) => `${n} ${plural(n, "родственника", "родственников", "родственников")}`;
const diseasesText = (n: number) => `${n} ${plural(n, "болезнь", "болезни", "болезней")}`;

interface AssessmentGaugesProps {
  genealogy: GenealogicalAssessment;
  bio: BiologicalAssessment;
  social: SocialAssessment;
  canManage: boolean;
  onOpen: (kind: AssessmentKind) => void;
  onConfirmHigh: () => void;
}

/** Три оценки анамнеза в ряд (ТЗ §4.2, п. 1). */
export const AssessmentGauges: React.FC<AssessmentGaugesProps> = ({ genealogy, bio, social, canManage, onOpen, onConfirmHigh }) => {
  const theme = useTheme();
  const open = (kind: AssessmentKind) => (canManage ? () => onOpen(kind) : undefined);

  // Генеалогический
  const g = genealogy;
  const gTone: Tone = g.level ? levelTone(g.level) : "muted";
  const gTitle = g.level ? levelTitle("genealogical", g.level) : g.denominator ? "Мало сведений" : "Нет сведений";
  const gIndex = g.index != null ? hundredths(g.index) : "";
  const gDescription = g.denominator
    ? `Индекс отягощённости ${gIndex}: ${diseasesText(g.numerator)} у ${relativesText(g.denominator)}${g.insufficient ? " — мало сведений" : ""}`
    : "Укажите здоровье кровных родственников в «Паспорте семьи»";

  // Биологический
  const bTone: Tone = bio.level ? levelTone(bio.level) : "muted";
  const bTitle = bio.level ? levelTitle("biological", bio.level) : "Не оценивался";
  const bDescription =
    bio.count === 0
      ? bio.level
        ? "Факторов риска нет ни в одном периоде"
        : "Заполните беременность, роды и новорождённость"
      : `Факторы риска в ${bio.count} ${plural(bio.count, "периоде", "периодах", "периодах")} из 6`;
  const stateTip: Record<string, string> = { clear: "факторов нет", nodata: "нет сведений", notyet: "ещё не наступил" };
  const bCells: Cell[] = bio.periods.map((period) => ({
    key: String(period.index),
    label: period.short,
    state: period.state === "factors" ? "on" : period.state === "clear" ? "off" : "empty",
    tip: (
      <Box>
        <b>{period.title}</b>
        {period.factors.length ? (
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {period.factors.map((factor) => (
              <li key={factor}>{factor}</li>
            ))}
          </Box>
        ) : (
          <div>{stateTip[period.state]}</div>
        )}
      </Box>
    ),
  }));

  // Социальный
  const sTone: Tone = social.level ? levelTone(social.level) : "muted";
  const sTitle = social.level ? levelTitle("social", social.level) : "Не оценивался";
  const risk = social.riskCount;
  const sParts = [
    social.notAssessed
      ? "Заполните «Семья и быт»"
      : risk === 0
        ? "Риска нет ни по одному из 8 параметров"
        : `Риск по ${risk} ${plural(risk, "параметру", "параметрам", "параметрам")} из 8`,
    !social.notAssessed && social.unknownCount ? `оценка неполная: не заполнено ${social.unknownCount} из 8` : "",
    social.restricted ? "часть сведений закрыта" : "",
  ].filter(Boolean);
  const sCells: Cell[] = social.params.map((param) => ({
    key: String(param.index),
    state: param.state === "risk" ? "on" : param.state === "ok" ? "off" : "empty",
    tip: `${param.index}. ${param.title}: ${param.reason}`,
  }));

  return (
    <Stack gap={1}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
        <Gauge
          caption="Генеалогический"
          title={gTitle}
          tone={gTone}
          description={gDescription}
          cells={steps("genealogical", g.scale, g.level)}
          manualReason={g.manual ? g.manual.reason : null}
          onClick={open("genealogical")}
        />
        <Gauge
          caption="Биологический"
          title={bTitle}
          tone={bTone}
          description={bDescription}
          cells={bCells}
          labelled
          manualReason={bio.manual ? bio.manual.reason : null}
          onClick={open("biological")}
        />
        <Gauge
          caption="Социальный"
          title={sTitle}
          tone={sTone}
          description={sParts.join(" · ")}
          cells={sCells}
          manualReason={social.manual ? social.manual.reason : null}
          onClick={open("social")}
        />
      </Box>
      {bio.suggestHigh && (
        <Stack
          direction={{ xs: "column", md: "row" }}
          alignItems={{ md: "center" }}
          gap={1}
          sx={{ border: 1, borderColor: alpha(theme.palette.error.main, 0.4), borderRadius: "10px", px: 1.5, py: 1 }}
        >
          <AutoAwesomeOutlined fontSize="small" sx={{ color: "error.main" }} />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
            Система предлагает «высокую» биологическую отягощённость: {bio.strongest.map(factorText).join(", ")}
          </Typography>
          {canManage && (
            <AppButton size="small" variant="outlined" color="error" onClick={onConfirmHigh}>
              Подтвердить
            </AppButton>
          )}
        </Stack>
      )}
    </Stack>
  );
};
