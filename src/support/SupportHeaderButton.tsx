import React from "react";
import { CircularProgress, IconButton, Tooltip } from "@mui/material";
import BugReportOutlined from "@mui/icons-material/BugReportOutlined";

import { subtleBg } from "../theme/uiHelpers";
import { useSupportReport } from "./SupportReportProvider";
import { useSupportAccess } from "./useSupport";

/**
 * Кнопка-жук в шапке: «Сообщить о проблеме» с любой страницы.
 *
 * Снимок экрана делается в момент нажатия, поэтому приложится именно та
 * страница, на которой человек заметил проблему. Рядом с «Обновить» она стоит
 * неслучайно: к ней тянутся, когда «что-то не работает».
 */
export const SupportHeaderButton: React.FC = () => {
  const { openReport, preparing } = useSupportReport();
  const { canCreate } = useSupportAccess();
  // Нет support.create или модуль выключен — кнопки нет.
  if (!canCreate) return null;
  return (
    <Tooltip title="Сообщить о проблеме">
      <span>
        <IconButton
          color="inherit"
          size="small"
          aria-label="Сообщить о проблеме"
          data-support-trigger=""
          disabled={preparing}
          onClick={() => void openReport({ category: "bug" })}
          sx={{
            p: { xs: 0.5, sm: 1 },
            bgcolor: (theme) => subtleBg(theme),
            borderRadius: "50%",
            transition: "background-color .15s ease, color .15s ease, transform .2s ease",
            "&:hover": {
              bgcolor: (theme) => theme.palette.error.main,
              color: (theme) => theme.palette.error.contrastText,
              transform: "rotate(-12deg) scale(1.06)",
            },
            "&:active": { transform: "scale(0.92)" },
          }}
        >
          {preparing ? (
            <CircularProgress size={18} thickness={5} color="inherit" />
          ) : (
            <BugReportOutlined sx={{ fontSize: { xs: 18, sm: 20 } }} />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
};

export default SupportHeaderButton;
