import React from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";

import type { PosUserError } from "./errors";

/**
 * Ошибка кассы для кассира: что случилось, что делать и — для сбоев сервера —
 * код обращения, который можно продиктовать или скопировать в поддержку.
 */
export const PosErrorNotice: React.FC<{
  error: PosUserError;
  onClose?: () => void;
  /** Внутри диалога — без скругления края страницы. */
  inline?: boolean;
}> = ({ error, onClose, inline = false }) => {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (!error.traceId) return;
    try {
      await navigator.clipboard.writeText(error.traceId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Буфер обмена недоступен (http, запрет браузера) — код виден и так.
    }
  };

  return (
    <Alert
      severity={error.severity}
      onClose={onClose}
      role="alert"
      sx={{ borderRadius: inline ? 2 : 0, alignItems: "flex-start", "& .MuiAlert-message": { minWidth: 0 } }}
    >
      <AlertTitle sx={{ mb: error.hint ? 0.25 : 0, fontWeight: 800 }}>{error.title}</AlertTitle>
      {error.hint && <Typography variant="body2">{error.hint}</Typography>}
      {error.traceId && (
        <Box sx={{ mt: 0.75, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            Код для поддержки: <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 700 }}>{error.traceId}</Box>
          </Typography>
          <ButtonBase onClick={() => void copy()} sx={{ fontSize: 12, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>
            {copied ? "Скопировано" : "Скопировать"}
          </ButtonBase>
        </Box>
      )}
    </Alert>
  );
};
