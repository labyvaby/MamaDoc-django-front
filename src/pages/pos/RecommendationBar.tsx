import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { POS_LAYOUT, POS_RADIUS, posColors } from "./layout";
import { PosSizeChip } from "./ProductCards";
import type { PosRecommendation } from "./types";
import { formatPosAmount } from "./format";
import { PosColorDot, PosThumb } from "./ui";

type Props = {
  item: PosRecommendation;
  onAccept: () => void;
  onDismiss: () => void;
};

/** Плашка «Рекомендовать клиенту» между чеком и футером клиента. */
export const PosRecommendationBar: React.FC<Props> = ({ item, onAccept, onDismiss }) => {
  const theme = useTheme();
  const c = posColors(theme);

  return (
    <Box
      sx={{
        height: POS_LAYOUT.recommendationHeight,
        flexShrink: 0,
        px: "11px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        bgcolor: c.tile,
        borderRadius: `${POS_RADIUS.card}px`,
      }}
    >
      <Stack direction="row" alignItems="center" gap="12px" sx={{ minWidth: 0 }}>
        <PosThumb size={40} radius={POS_RADIUS.tile} />

        <Stack gap="4px" sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 11, lineHeight: 1, textTransform: "uppercase", color: c.textDim }}>
            Рекомендовать клиенту
          </Typography>
          <Stack direction="row" alignItems="center" gap="9px">
            <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: c.text }}>
              {item.name}
            </Typography>
            <Box sx={{ width: "1px", height: 10, bgcolor: c.hairline }} />
            <Typography sx={{ fontSize: 11, lineHeight: 1, color: c.textDim }}>{item.brand}</Typography>
            <Box sx={{ width: "1px", height: 10, bgcolor: c.hairline }} />
            <Stack direction="row" alignItems="center" gap="4px">
              {item.colors.map((color) => (
                <PosColorDot key={color.id} hex={color.hex} size={14} />
              ))}
            </Stack>
            <Box sx={{ width: 2, height: 2, borderRadius: "50%", bgcolor: c.textDim }} />
            <Stack direction="row" alignItems="center" gap="4px">
              {item.sizes.map((size) => (
                <PosSizeChip key={size.id} label={size.label} available={size.available} small />
              ))}
            </Stack>
          </Stack>
        </Stack>
      </Stack>

      <Stack direction="row" alignItems="center" gap="16px" sx={{ flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>
          {formatPosAmount(item.price)} сом
        </Typography>
        <ButtonBase
          onClick={onAccept}
          sx={{
            width: 97,
            height: 31,
            borderRadius: `${POS_RADIUS.tile}px`,
            bgcolor: c.card,
            border: `1px solid ${c.hairline}`,
            color: c.textSoft,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Принять
        </ButtonBase>
        <IconButton size="small" onClick={onDismiss} sx={{ p: 0, color: c.textDim }} aria-label="Скрыть рекомендацию">
          <CloseOutlined sx={{ fontSize: 18 }} />
        </IconButton>
      </Stack>
    </Box>
  );
};
