import React from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import { useNavigate } from "react-router";

import { usePermissions } from "../../hooks/usePermissions";
import { subtleBg } from "../../theme";

export const SET_PASSWORD_LABEL = "Установить пароль";
/** Вкладка «Безопасность» профиля — `?tab=` читает src/pages/profile/index.tsx. */
export const SET_PASSWORD_TARGET = "/profile?tab=security";

/** Кнопка в шапке, пока у пользователя нет пароля (`hasPassword === false` в
 *  /auth/me/). На телефоне — круглая иконка в стиле «Обновить», шире — контурная
 *  кнопка с текстом. Ничего не рендерит, если бэк поля не прислал (null) или
 *  пароль уже есть. */
const SetPasswordButton: React.FC = () => {
  const { hasPassword } = usePermissions();
  const navigate = useNavigate();
  const compact = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));

  if (hasPassword !== false) return null;

  const go = () => navigate(SET_PASSWORD_TARGET);

  if (compact) {
    return (
      <Tooltip title={SET_PASSWORD_LABEL} arrow>
        <IconButton
          color="primary"
          size="small"
          aria-label={SET_PASSWORD_LABEL}
          onClick={go}
          sx={{ p: 0.5, bgcolor: (theme) => subtleBg(theme), borderRadius: "50%" }}
        >
          <KeyOutlined sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="outlined"
      size="small"
      color="primary"
      startIcon={<KeyOutlined />}
      onClick={go}
      sx={{ whiteSpace: "nowrap", borderRadius: "999px", fontWeight: 600 }}
    >
      {SET_PASSWORD_LABEL}
    </Button>
  );
};

export default SetPasswordButton;
