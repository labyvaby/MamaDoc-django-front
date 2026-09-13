import React from "react";
import { Box, Typography } from "@mui/material";

import { splitTemplateBody } from "../../api/whatsapp";

/**
 * Текст шаблона WhatsApp с подсвеченными позиционными `{{n}}`.
 *
 * Плейсхолдеры выделены, чтобы было видно, сколько параметров придётся
 * привязать и где именно они встанут; сам текст не редактируется —
 * он живёт в WhatsApp Manager.
 */
export const WhatsAppTemplateBody: React.FC<{ bodyText: string }> = ({ bodyText }) => (
  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
    {splitTemplateBody(bodyText).map((part, index) =>
      part.kind === "text" ? (
        <React.Fragment key={index}>{part.text}</React.Fragment>
      ) : (
        <Box
          key={index}
          component="span"
          sx={{
            px: 0.5,
            borderRadius: 0.5,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            fontFamily: "monospace",
            fontSize: "0.85em",
          }}
        >
          {`{{${part.index}}}`}
        </Box>
      ),
    )}
  </Typography>
);

export default WhatsAppTemplateBody;
