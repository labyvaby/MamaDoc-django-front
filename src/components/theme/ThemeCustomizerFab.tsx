import React from "react";
import { Fab, Tooltip } from "@mui/material";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";

import ThemeCustomizer from "./ThemeCustomizer";

/**
 * Плавающая кнопка настройки темы — фиксирована у правого края экрана,
 * доступна на всех страницах. Открывает правую панель кастомайзера.
 */
export const ThemeCustomizerFab: React.FC = () => {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Tooltip title="Настройка темы" placement="left">
        <Fab
          color="primary"
          aria-label="Настройка темы"
          onClick={() => setOpen(true)}
          sx={(theme) => ({
            position: "fixed",
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            zIndex: theme.zIndex.speedDial,
            boxShadow: theme.shadows[6],
          })}
        >
          <SettingsOutlined
            sx={{
              animation: "tc-spin 6s linear infinite",
              "@keyframes tc-spin": {
                from: { transform: "rotate(0deg)" },
                to: { transform: "rotate(360deg)" },
              },
            }}
          />
        </Fab>
      </Tooltip>

      <ThemeCustomizer open={open} onClose={() => setOpen(false)} />
    </>
  );
};

export default ThemeCustomizerFab;
