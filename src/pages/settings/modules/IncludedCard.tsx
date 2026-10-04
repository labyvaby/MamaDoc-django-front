import React from "react";
import { Box, Card, Chip, Stack, Typography } from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";

import type { IncludedItem } from "../../../config/moduleStorefrontModel";
import { PartsLine, StorefrontTile } from "./storefrontVisuals";

const IncludedStatusChip: React.FC<{ item: IncludedItem }> = ({ item }) => {
  if (item.status === "included") {
    return <Chip size="small" color="success" variant="outlined" icon={<CheckCircleOutlined />} label="В пакете" />;
  }
  if (item.status === "requested") {
    return <Chip size="small" color="warning" variant="outlined" icon={<ScheduleOutlined />} label="Заявка отправлена" />;
  }
  return <Chip size="small" variant="outlined" label="Не включено" />;
};

interface Props {
  item: IncludedItem;
  /** «Включить» клиники или переключатель оператора. */
  action?: React.ReactNode;
  /** Части, в которых нашёлся запрос поиска. */
  highlight?: string[];
}

/** Карточка «Входит в ваш пакет»: что уже есть без доплаты и из чего состоит. */
export const IncludedCard: React.FC<Props> = ({ item, action, highlight }) => {
  const { card } = item;
  return (
    <Card
      variant="outlined"
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        borderRadius: 3,
        bgcolor: item.status === "included" ? "transparent" : "action.hover",
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <StorefrontTile icon={card.icon} tone={card.tone} size={36} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {card.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {card.tagline}
          </Typography>
        </Box>
      </Stack>
      <PartsLine parts={card.parts} highlight={highlight} />
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: "auto" }}>
        <IncludedStatusChip item={item} />
        {action}
      </Stack>
    </Card>
  );
};
