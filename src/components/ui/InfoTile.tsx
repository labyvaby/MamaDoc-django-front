import React from "react";
import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { subtleBg } from "../../theme/uiHelpers";

export type InfoTileProps = {
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  /** Заполнено ли поле: пустое гасит иконку и значение. */
  active?: boolean;
  /** Моноширинное значение (счёт, ИНН и т.п.). */
  monospace?: boolean;
};

/**
 * Плитка-«статкарта» нового стиля: иконка в цветной плашке слева, затем
 * приглушённая подпись и значение. Плоская — глубина за счёт тонкой грани
 * и едва заметной подложки. Единый компонент для профиля, карточки сотрудника
 * и прочих экранов. См. docs/ui-style-guide.md §5.2.
 */
export const InfoTile: React.FC<InfoTileProps> = ({
  icon,
  label,
  value,
  active = true,
  monospace = false,
}) => (
  <Box
    sx={(t) => ({
      display: "flex",
      alignItems: "center",
      gap: 1.5,
      p: 1.75,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: subtleBg(t),
      transition: "background-color .15s ease, border-color .15s ease",
      "&:hover": {
        bgcolor: subtleBg(t, true),
        borderColor: alpha(t.palette.primary.main, 0.28),
      },
    })}
  >
    <Box
      sx={(t) => ({
        width: 40,
        height: 40,
        borderRadius: "10px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: active ? "primary.onSurface" : "text.disabled",
        bgcolor: active
          ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1)
          : subtleBg(t, true),
        "& .MuiSvgIcon-root": { fontSize: 20 },
      })}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: "0.75rem" }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={600}
        noWrap
        sx={monospace ? { fontFamily: "monospace", letterSpacing: 0.5 } : undefined}
      >
        {value || "—"}
      </Typography>
    </Box>
  </Box>
);

export default InfoTile;
