import React from "react";
import { Box, Card, Chip, Stack, Typography } from "@mui/material";

import { categoryTone } from "../../../config/moduleStorefront";
import { formatPrice, type StorefrontBundleView } from "../../../config/moduleStorefrontModel";
import { StorefrontTile } from "./storefrontVisuals";

interface Props {
  view: StorefrontBundleView;
  featured?: boolean;
  action?: React.ReactNode;
}

/** Подборка «Рекомендуем»: смысл, товары, цена за недостающее и одна кнопка. */
export const BundleCard: React.FC<Props> = ({ view, featured, action }) => (
  <Card
    variant="outlined"
    sx={{
      p: 2,
      display: "flex",
      flexDirection: "column",
      gap: 1.25,
      borderRadius: 3,
      ...(featured && { borderColor: "primary.main", borderWidth: 2 }),
    }}
  >
    <Box>
      <Typography variant="subtitle1" fontWeight={700}>
        {view.bundle.title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {view.bundle.pitch}
      </Typography>
    </Box>
    <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
      {view.items.map((item) => (
        <Chip
          key={item.product.id}
          size="small"
          variant="outlined"
          icon={<StorefrontTile icon={item.product.icon} tone={categoryTone(item.product.category)} size={20} />}
          label={item.status === "connected" ? `${item.product.title} · подключён` : item.product.title}
        />
      ))}
    </Stack>
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: "auto" }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {view.price === null ? "Цена по запросу" : formatPrice(view.price)}
      </Typography>
      {action}
    </Stack>
  </Card>
);
