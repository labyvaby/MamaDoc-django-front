import React from "react";
import { Alert, Box, Chip, Drawer, IconButton, Stack, Typography } from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { categoryTone } from "../../../config/moduleStorefront";
import type { StorefrontItem } from "../../../config/moduleStorefrontModel";
import { InactiveChip, PriceLabel, ProductStatus, SoonChip } from "./ProductCard";
import { StorefrontTile } from "./storefrontVisuals";

interface Props {
  item: StorefrontItem | null;
  onClose: () => void;
  /** Действие клиники: заявка, «Настроить» или статус заявки. */
  action?: React.ReactNode;
  /** Суперпользователю — переключатели модулей товара. */
  operator?: React.ReactNode;
}

/** «Подробнее»: справа, на телефоне — на весь экран. */
export const ProductDrawer: React.FC<Props> = ({ item, onClose, action, operator }) => (
  <Drawer
    anchor="right"
    open={item !== null}
    onClose={onClose}
    PaperProps={{ sx: { width: { xs: "100%", sm: 440 }, maxWidth: "100vw" } }}
  >
    {item && (
      <Stack spacing={2.5} sx={{ p: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <StorefrontTile icon={item.product.icon} tone={categoryTone(item.product.category)} size={52} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h6" fontWeight={700}>
                {item.product.title}
              </Typography>
              {item.product.soon && <SoonChip />}
              {item.inactive && <InactiveChip />}
            </Stack>
            {/* У «Скоро» статус — сама пометка, под ней цена. */}
            {item.status === "soon" ? <PriceLabel item={item} /> : <ProductStatus item={item} />}
          </Box>
          <IconButton aria-label="Закрыть" onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Stack>
        {item.inactive && (
          <Alert severity="warning" variant="outlined">
            Неактивен — клиникам не показывается.{item.inactiveReason ? ` ${item.inactiveReason}` : ""}
          </Alert>
        )}
        <Typography variant="body1">{item.product.tagline}</Typography>
        {item.product.features.length > 0 && (
          <Stack spacing={1}>
            {item.product.features.map((feature) => (
              <Stack key={feature} direction="row" spacing={1} alignItems="flex-start">
                <CheckCircleOutlined color="success" fontSize="small" sx={{ mt: "2px" }} />
                <Typography variant="body2">{feature}</Typography>
              </Stack>
            ))}
          </Stack>
        )}
        {item.product.parts && item.product.parts.length > 0 && (
          <Box>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Что входит
            </Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
              {item.product.parts.map((part) => (
                <Chip key={part} size="small" variant="outlined" label={part} />
              ))}
            </Stack>
          </Box>
        )}
        {item.product.soon && (
          <Alert severity="info" variant="outlined">
            В разработке. Оставьте заявку — менеджер расскажет о запуске.
          </Alert>
        )}
        {item.status !== "connected" && item.extraRequirementNames.length > 0 && (
          <Alert severity="info" variant="outlined">
            Сначала нужно: {item.extraRequirementNames.join(", ")}. Они войдут в заявку.
          </Alert>
        )}
        {item.status === "available" && (
          <Box>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Как подключается
            </Typography>
            <Box component="ol" sx={{ m: 0, pl: 2.5, color: "text.secondary" }}>
              <Typography component="li" variant="body2">
                Вы отправляете заявку
              </Typography>
              <Typography component="li" variant="body2">
                Менеджер ErkinAI связывается с вами
              </Typography>
              <Typography component="li" variant="body2">
                Всё включается в вашей CRM — переустанавливать ничего не нужно
              </Typography>
            </Box>
          </Box>
        )}
        {action}
        {operator}
      </Stack>
    )}
  </Drawer>
);
