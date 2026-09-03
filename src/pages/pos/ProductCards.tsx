import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";

import { POS_LAYOUT, POS_RADIUS, posColors } from "./layout";
import type { PosCatalogItem } from "./types";
import { PosAmount, PosColorDot } from "./ui";

type Props = {
  items: PosCatalogItem[];
  onAdd: (item: PosCatalogItem) => void;
};

/** Бейдж бренда — акцентная плашка рядом с названием товара. */
export const PosBrandBadge: React.FC<{ brand: string }> = ({ brand }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Box
      sx={{
        px: "4px",
        py: "2px",
        borderRadius: `${POS_RADIUS.chip}px`,
        bgcolor: c.accentBg,
        border: `0.5px solid ${c.accent}`,
        color: c.accentText,
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1.1,
        whiteSpace: "nowrap",
      }}
    >
      {brand}
    </Box>
  );
};

/** «+2 ›» — счётчик скрытых вариантов цвета или размера. */
export const PosMoreVariants: React.FC<{ count: number }> = ({ count }) => {
  const theme = useTheme();
  const c = posColors(theme);
  if (count <= 0) return null;
  return (
    <Stack direction="row" alignItems="center" gap="2px" sx={{ flexShrink: 0 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 0.9, color: c.accentText }}>+{count}</Typography>
      <ChevronRightOutlined sx={{ fontSize: 10, color: c.accentText }} />
    </Stack>
  );
};

/** Чип размера. Недоступный размер зачёркнут и приглушён. */
export const PosSizeChip: React.FC<{ label: string; selected?: boolean; available?: boolean; small?: boolean }> = ({
  label,
  selected,
  available = true,
  small,
}) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Box
      sx={{
        px: "6px",
        py: "4px",
        borderRadius: `${POS_RADIUS.chip}px`,
        bgcolor: c.card,
        border: `1px solid ${selected ? c.accent : c.hairline}`,
        color: available ? c.textSoft : c.textDim,
        opacity: available ? 1 : 0.5,
        textDecoration: available ? "none" : "line-through",
        fontSize: small ? 10 : 12,
        fontWeight: 700,
        lineHeight: 0.9,
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Box>
  );
};

/** Полоса карточек товаров выбранной категории — над чеком. */
export const PosProductCards: React.FC<Props> = ({ items, onAdd }) => {
  const theme = useTheme();
  const c = posColors(theme);

  return (
    <Box
      sx={{
        height: POS_LAYOUT.productCardsHeight,
        flexShrink: 0,
        p: "10px",
        display: "flex",
        gap: "10px",
        overflowX: "auto",
        bgcolor: c.page,
        borderBottom: `1px solid ${c.outline}`,
      }}
    >
      {items.map((item) => (
        <ButtonBase
          key={item.id}
          onClick={() => onAdd(item)}
          sx={{
            width: POS_LAYOUT.productCardWidth,
            flexShrink: 0,
            px: "10px",
            py: "8px",
            gap: "8px",
            alignItems: "stretch",
            justifyContent: "flex-start",
            textAlign: "left",
            bgcolor: c.card,
            border: `1px solid ${c.hairline}`,
            borderRadius: `${POS_RADIUS.card}px`,
            "&:hover": { borderColor: c.accent },
          }}
        >
          <Box
            sx={{
              width: 78,
              flexShrink: 0,
              borderRadius: `${POS_RADIUS.tile}px`,
              bgcolor: c.tile,
              border: `1px solid ${c.hairline}`,
              display: "grid",
              placeItems: "center",
            }}
          >
            <ImageOutlined sx={{ fontSize: 28, color: c.textDim, opacity: 0.6 }} />
          </Box>

          <Stack gap="8px" sx={{ flex: 1, minWidth: 0 }}>
            <Stack gap="6px" alignItems="flex-start">
              <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: c.text, maxWidth: "100%" }}>
                {item.name}
              </Typography>
              {item.brand ? <PosBrandBadge brand={item.brand} /> : null}
              <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: c.text }}>
                <PosAmount value={item.price} />
              </Typography>
            </Stack>

            <Box sx={{ height: "1px", bgcolor: c.hairline }} />

            <Stack direction="row" alignItems="center" gap="6px">
              <Stack direction="row" alignItems="center" gap="2px">
                {item.colors.slice(0, 2).map((color) => (
                  <PosColorDot key={color.id} hex={color.hex} size={16} />
                ))}
                <PosMoreVariants count={Math.max(item.colors.length - 2, 0)} />
              </Stack>
              <Box sx={{ width: "1px", height: 15, bgcolor: c.hairline }} />
              <Stack direction="row" alignItems="center" gap="2px">
                {item.sizes.slice(0, 2).map((size) => (
                  <PosSizeChip key={size.id} label={size.label} available={size.available} small />
                ))}
                <PosMoreVariants count={Math.max(item.sizes.length - 2, 0)} />
              </Stack>
            </Stack>
          </Stack>
        </ButtonBase>
      ))}
    </Box>
  );
};
