import React from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import { useNavigate } from "react-router";

import { usePermissions } from "../../hooks/usePermissions";
import { subtleBg } from "../../theme";

export const SET_PASSWORD_LABEL = "Установить пароль";
/** Вкладка «Безопасность» профиля — `?tab=` читает src/pages/profile/index.tsx. */
export const SET_PASSWORD_TARGET = "/profile?tab=security";

/** Кнопка в шапке, пока у пользователя нет пароля (`hasPassword === false` в
 *  /auth/me/). До `md` (768px в теме приложения: sm=360, md=768) — круглая
 *  иконка в стиле «Обновить», шире — контурная кнопка с текстом; переключение
 *  по CSS-брейкпоинту (`display`), как у имени рядом с аватаром. Ничего не рендерит, если бэк поля не прислал (null) или
 *  пароль уже есть. */
const SetPasswordButton: React.FC = () => {
  const { hasPassword } = usePermissions();
  const navigate = useNavigate();

  if (hasPassword !== false) return null;

  const go = () => navigate(SET_PASSWORD_TARGET);

  return (
    <>
      <Tooltip title={SET_PASSWORD_LABEL} arrow>
        <IconButton
          color="primary"
          size="small"
          aria-label={SET_PASSWORD_LABEL}
          onClick={go}
          sx={{
            display: { xs: "inline-flex", md: "none" },
            p: 0.5,
            bgcolor: (theme) => subtleBg(theme),
            borderRadius: "50%",
          }}
        >
          <KeyOutlined sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
      <Button
        variant="outlined"
        size="small"
        color="primary"
        startIcon={<KeyOutlined />}
        onClick={go}
        sx={{
          display: { xs: "none", md: "inline-flex" },
          whiteSpace: "nowrap",
          borderRadius: "999px",
          fontWeight: 600,
        }}
      >
        {SET_PASSWORD_LABEL}
      </Button>
    </>
  );
};

export default SetPasswordButton;
