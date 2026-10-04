import React from "react";
import { Box, Typography } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";

import type { SensitiveHistory } from "../../../api/health";
import { AppButton } from "../../ui";
import { Fact, Panel } from "./anamnesisUi";
import type { ChipTone } from "./anamnesisView";

export interface SensitiveRow {
  label: string;
  value: string;
  tone?: ChipTone;
}

interface SensitiveCardProps {
  title: string;
  /** null — записи нет. Без права карточка не рисуется вовсе (её не передают). */
  sensitive: SensitiveHistory | null;
  rows: (sensitive: SensitiveHistory) => SensitiveRow[];
  canEdit: boolean;
  onEdit: () => void;
}

/**
 * Карточка закрытых сведений (ТЗ §4.3). Показывается только сотруднику с правом
 * `medical.health.sensitive.view` — вызывающий её без права не рендерит.
 */
export const SensitiveCard: React.FC<SensitiveCardProps> = ({ title, sensitive, rows, canEdit, onEdit }) => {
  const list = sensitive ? rows(sensitive).filter((row) => row.value) : [];
  return (
    <Panel
      title={
        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
          <LockOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
          {title}
        </Box>
      }
      caption="видят только сотрудники с правом «Закрытые сведения медкарты»"
      action={
        canEdit ? (
          <AppButton size="small" startIcon={<EditOutlined />} onClick={onEdit}>
            Изменить
          </AppButton>
        ) : undefined
      }
    >
      {list.length ? (
        <Box>
          {list.map((row) => (
            <Fact key={row.label} label={row.label} value={row.value} tone={row.tone} />
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Не заполнено
        </Typography>
      )}
    </Panel>
  );
};
