import React from "react";
import { Box, alpha } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";

import { SELECTION_HINT_CLASS } from "./selectionHint";

/**
 * Отметка выбора поверх миниатюры строки — как в галерее телефона: в режиме
 * выбора отмеченная строка показывает галочку на заливке, неотмеченная —
 * пустой кружок. Кладётся внутрь контейнера миниатюры с position: relative.
 *
 * `onStart` — режим подсказки вне выбора (как в Google Фото на компьютере):
 * кружок виден только при наведении мыши, клик по нему включает выбор. На
 * сенсорных экранах подсказки нет — там выбор включает долгое нажатие.
 */
export const SelectionMark: React.FC<{
  checked: boolean;
  borderRadius?: string | number;
  onStart?: () => void;
}> = ({ checked, borderRadius = "14px", onStart }) => {
  const hint = Boolean(onStart);
  return (
    <Box
      aria-hidden={hint ? undefined : true}
      className={hint ? SELECTION_HINT_CLASS : undefined}
      role={hint ? "button" : undefined}
      aria-label={hint ? "Выбрать" : undefined}
      onPointerDown={hint ? (e: React.PointerEvent) => e.stopPropagation() : undefined}
      onMouseDown={hint ? (e: React.MouseEvent) => e.stopPropagation() : undefined}
      onClick={
        hint
          ? (e: React.MouseEvent) => {
              e.stopPropagation();
              onStart?.();
            }
          : undefined
      }
      sx={(theme) => ({
        position: "absolute",
        inset: 0,
        borderRadius,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: checked ? "primary.main" : alpha(theme.palette.background.paper, 0.55),
        color: "primary.contrastText",
        transition: "background-color .15s ease, opacity .15s ease",
        ...(hint && {
          opacity: 0,
          cursor: "pointer",
          "@media (hover: none)": { display: "none" },
        }),
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
};

