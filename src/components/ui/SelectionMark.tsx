import React from "react";
import { Box, alpha } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";

/**
 * Отметка выбора поверх миниатюры строки — как в галерее телефона: в режиме
 * выбора отмеченная строка показывает галочку на заливке, неотмеченная —
 * пустой кружок. Кладётся внутрь контейнера миниатюры с position: relative.
 */
export const SelectionMark: React.FC<{ checked: boolean; borderRadius?: string | number }> = ({
  checked,
  borderRadius = "14px",
}) => (
  <Box
    aria-hidden
    sx={(theme) => ({
      position: "absolute",
      inset: 0,
      borderRadius,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      bgcolor: checked ? "primary.main" : alpha(theme.palette.background.paper, 0.55),
      color: "primary.contrastText",
      transition: "background-color .15s ease",
    })}
  >
    {checked ? (
      <CheckIcon />
    ) : (
      <Box
        sx={(theme) => ({
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: 2,
          borderColor: alpha(theme.palette.text.primary, 0.45),
          bgcolor: alpha(theme.palette.background.paper, 0.8),
        })}
      />
    )}
  </Box>
);
