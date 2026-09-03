import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import { POS_LAYOUT, POS_RADIUS, posColors } from "./layout";

type Props = {
  categories: string[];
  active: string | null;
  onSelect: (category: string | null) => void;
};

/** Полоса категорий под шапкой. Повторный клик по активной — снимает выбор. */
export const PosCategoryBar: React.FC<Props> = ({ categories, active, onSelect }) => {
  const theme = useTheme();
  const c = posColors(theme);

  return (
    <Box
      sx={{
        height: POS_LAYOUT.categoryBarHeight,
        flexShrink: 0,
        px: "20px",
        py: "6px",
        bgcolor: c.page,
        borderBottom: `1px solid ${c.outline}`,
        display: "flex",
        alignItems: "center",
        gap: "16px",
        overflowX: "auto",
      }}
    >
      <Typography
        sx={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, textTransform: "uppercase", color: c.textDim, flexShrink: 0 }}
      >
        Категории
      </Typography>
      <Stack direction="row" alignItems="center" gap="8px">
        {categories.map((category) => {
          const selected = category === active;
          return (
            <ButtonBase
              key={category}
              onClick={() => onSelect(selected ? null : category)}
              sx={{
                px: "12px",
                py: "6px",
                borderRadius: `${POS_RADIUS.pill}px`,
                bgcolor: selected ? c.accent : c.tile,
                border: `1px solid ${selected ? c.accent : c.hairline}`,
                color: selected ? c.onAccent : c.textSoft,
                fontSize: 12,
                fontWeight: 500,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              {category}
            </ButtonBase>
          );
        })}
      </Stack>
    </Box>
  );
};
