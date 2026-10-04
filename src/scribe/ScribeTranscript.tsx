import React from "react";
import { Accordion, AccordionDetails, AccordionSummary, Typography } from "@mui/material";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import { useT } from "../i18n/VerticalProvider";

/** Расшифровка записи целиком — свёрнута, по нажатию раскрывается. */
export const ScribeTranscript: React.FC<{ text: string; durationMs: number }> = ({ text, durationMs }) => {
  const { t } = useT("scribe");
  if (!text) return null;
  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{ bgcolor: "transparent", border: 1, borderColor: "divider", borderRadius: 1, "&:before": { display: "none" } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
        <Typography variant="body2" color="text.secondary">
          {t("transcript.title", { minutes: Math.max(1, Math.round(durationMs / 60_000)) })}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {text}
        </Typography>
      </AccordionDetails>
    </Accordion>
  );
};
