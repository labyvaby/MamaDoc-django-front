import React from "react";
import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";

import {
  aiProgressPercentAt,
  aiPulse,
  aiScanLine,
  aiShimmer,
  aiStageAt,
  reducedMotion,
} from "../ai/aiMotion";
import { useT } from "../../i18n/VerticalProvider";

/**
 * Этапы разбора и секунда, с которой каждый начинается. Это не отчёт о шагах
 * бэка (поток отдаёт только готовые подсказки; на проде 06.10.2026 — 6–8 с,
 * раньше пакетом 48–60 с, отсюда шкала), а честная
 * по порядку подсказка, как у распознавания накладной: этапы идут только
 * вперёд, последний держится, пока ответа нет.
 */
const STAGES = [
  { key: "read", from: 0 },
  { key: "align", from: 7 },
  { key: "phrase", from: 18 },
  { key: "check", from: 32 },
  { key: "assemble", from: 46 },
] as const;

/** Потолок процента до ответа: 100% — только когда ответ уже есть. */
const PERCENT_CAP = 95;

/**
 * Полоса «AI разбирает форму» под шапкой дровера — на время запроса, вместо
 * полосы подсказок. Язык движения — как у распознавания накладной (aiMotion):
 * пульсирующий значок, блик, этапы и процент по времени.
 */
export const AiThinkingStrip: React.FC<{
  /** Сколько полей ушло в AI. */
  fieldCount: number;
  onCancel: () => void;
}> = ({ fieldCount, onCancel }) => {
  const { t } = useT("appointments");
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds((Date.now() - started) / 1000), 500);
    return () => window.clearInterval(timer);
  }, []);
  const stage = STAGES[aiStageAt(STAGES, seconds)];
  const percent = aiProgressPercentAt(seconds, PERCENT_CAP);

  return (
    <Box
      sx={(th) => ({
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
        px: 2,
        pt: 1.25,
        pb: 1.5,
        bgcolor: alpha(th.palette.primary.main, 0.06),
      })}
    >
      <Box
        aria-hidden
        sx={(th) => ({
          position: "absolute",
          inset: 0,
          width: "30%",
          background: `linear-gradient(90deg, transparent, ${alpha(th.palette.common.white, 0.35)}, transparent)`,
          animation: `${aiShimmer} 2.6s ease-in-out infinite`,
          pointerEvents: "none",
          ...reducedMotion,
        })}
      />
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: "relative" }}>
        <Box
          sx={(th) => ({
            width: 36,
            height: 36,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            color: "primary.main",
            bgcolor: alpha(th.palette.primary.main, 0.16),
            animation: `${aiPulse} 1.8s ease-in-out infinite`,
            ...reducedMotion,
          })}
        >
          <AutoAwesomeRounded fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }} aria-live="polite">
          <Typography variant="body2" fontWeight={600} noWrap>
            {t("conclusion.aiAssist.thinking.title", { count: fieldCount })}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {seconds >= 60
              ? t("conclusion.aiAssist.thinking.slow")
              : t(`conclusion.aiAssist.thinking.stages.${stage.key}`)}
          </Typography>
        </Box>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: "1.1rem",
            fontVariantNumeric: "tabular-nums",
            color: "primary.main",
            flexShrink: 0,
          }}
        >
          {percent}%
        </Typography>
        <Button size="small" color="inherit" onClick={onCancel} sx={{ flexShrink: 0 }}>
          {t("conclusion.aiAssist.thinking.cancel")}
        </Button>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={percent}
        sx={{
          position: "relative",
          mt: 1,
          height: 4,
          borderRadius: 1,
          "& .MuiLinearProgress-bar": { transition: "transform .5s linear" },
        }}
      />
      <Typography
        variant="caption"
        color="text.secondary"
        component="div"
        sx={{ position: "relative", mt: 0.75 }}
      >
        {t("conclusion.aiAssist.thinking.hint")}
      </Typography>
    </Box>
  );
};

/**
 * Скан поверх формы, пока AI думает: линия проходит сверху вниз по видимой
 * части формы, как по накладной. Клики проходят насквозь — врач может писать
 * дальше. Родитель — `position: relative` по высоте формы.
 */
export const AiThinkingOverlay: React.FC = () => (
  <Box
    aria-hidden
    sx={{
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: 2,
    }}
  >
    <Box
      sx={(th) => ({
        position: "absolute",
        left: 0,
        right: 0,
        height: 2,
        bgcolor: "primary.main",
        boxShadow: `0 0 16px 5px ${alpha(th.palette.primary.main, 0.35)}`,
        animation: `${aiScanLine} 2.4s ease-in-out infinite`,
        "@media (prefers-reduced-motion: reduce)": { display: "none" },
      })}
    />
  </Box>
);
