import React from "react";
import { IconButton, Tooltip } from "@mui/material";

import { AppButton } from "../ui";
import { CARD_LABELS_FROM, whenCardWide } from "./illnessUi";

interface HealthHeaderButtonProps {
  label: string;
  icon: React.ReactElement;
  contained?: boolean;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
}

/**
 * Кнопка шапки раздела: в широкой карточке — с подписью, в узкой (телефон,
 * колонка карточки пациента) — значком с подсказкой (ТЗ 2026-10-04 §4.1, п. 6).
 */
export const HealthHeaderButton: React.FC<HealthHeaderButtonProps> = ({ label, icon, contained = false, onClick }) => (
  <>
    <AppButton
      size="small"
      variant={contained ? "contained" : "outlined"}
      startIcon={icon}
      onClick={onClick}
      sx={{ display: "none", [whenCardWide(CARD_LABELS_FROM)]: { display: "inline-flex" } }}
    >
      {label}
    </AppButton>
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        onClick={onClick}
        color={contained ? "primary" : "default"}
        sx={(theme) => ({
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: "10px",
          [whenCardWide(CARD_LABELS_FROM)]: { display: "none" },
        })}
      >
        {icon}
      </IconButton>
    </Tooltip>
  </>
);
