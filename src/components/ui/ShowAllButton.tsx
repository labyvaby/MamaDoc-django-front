import React from "react";
import type { SxProps, Theme } from "@mui/material";
import { AppButton } from "./AppButton";

export type ShowAllButtonProps = {
  total: number;
  /** Сколько строк видно в свёрнутом виде. */
  limit: number;
  expanded: boolean;
  onToggle: () => void;
  sx?: SxProps<Theme>;
};

/**
 * Одна кнопка для длинных списков: свёрнутый список показывает последние
 * `limit` строк, остальное — по «Показать все (N)». Состояние держит вызывающий:
 * `all ? list : list.slice(0, limit)`. Короткий список кнопку не получает.
 */
export const ShowAllButton: React.FC<ShowAllButtonProps> = ({ total, limit, expanded, onToggle, sx }) => {
  if (total <= limit) return null;
  return (
    <AppButton
      size="small"
      variant="text"
      onClick={onToggle}
      sx={[{ mt: 0.5, alignSelf: "flex-start" }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {expanded ? "Свернуть" : `Показать все (${total})`}
    </AppButton>
  );
};
