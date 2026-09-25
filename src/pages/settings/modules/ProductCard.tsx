import React from "react";
import { Box, Card, Chip, Stack, Typography } from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";

import { categoryTone } from "../../../config/moduleStorefront";
import { formatPrice, type StorefrontItem } from "../../../config/moduleStorefrontModel";
import { StorefrontTile } from "./storefrontVisuals";

export const PriceLabel: React.FC<{ item: StorefrontItem }> = ({ item }) => {
  const { price } = item.product;
  const main = item.free ? "Бесплатно" : price === null ? "Цена по запросу" : formatPrice(price);
  const note = item.freeWithTitle
    ? item.free
      ? `с «${item.freeWithTitle}»`
      : `Бесплатно с «${item.freeWithTitle}»`
    : null;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
        {main}
      </Typography>
      {note && (
        <Typography variant="caption" color="text.secondary" component="div">
          {note}
        </Typography>
      )}
    </Box>
  );
};

export const ProductStatus: React.FC<{ item: StorefrontItem }> = ({ item }) => {
  if (item.status === "connected") {
    return <Chip size="small" color="success" variant="outlined" icon={<CheckCircleOutlined />} label="Подключён" />;
  }
  if (item.status === "requested") {
    return <Chip size="small" color="warning" variant="outlined" icon={<ScheduleOutlined />} label="Заявка отправлена" />;
  }
  return <PriceLabel item={item} />;
};

interface Props {
  item: StorefrontItem;
  action?: React.ReactNode;
  onOpen: () => void;
}

/** Карточка товара: клик — «Подробнее»; кнопка действия клик не пропускает. */
export const ProductCard: React.FC<Props> = ({ item, action, onOpen }) => {
  const { product } = item;
  return (
    <Card
      variant="outlined"
      role="button"
      tabIndex={0}
      aria-label={`${product.title} — подробнее`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        cursor: "pointer",
        borderRadius: 3,
        transition: "border-color .15s ease",
        "&:hover": { borderColor: "primary.main" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <StorefrontTile icon={product.icon} tone={categoryTone(product.category)} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {product.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {product.tagline}
          </Typography>
        </Box>
      </Stack>
      {item.status === "available" && item.extraRequirementNames.length > 0 && (
        <Typography variant="caption" color="warning.main">
          Сначала: {item.extraRequirementNames.join(", ")}
        </Typography>
      )}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: "auto" }}>
        <ProductStatus item={item} />
        {action && (
          <Box onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {action}
          </Box>
        )}
      </Stack>
    </Card>
  );
};
