import React from "react";
import { Avatar, Box, Paper, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";

import type { AppointmentProductLine } from "../../../../api/appointments";
import { subtleBg } from "../../../../theme";
import { useT } from "../../../../i18n/VerticalProvider";

export interface AppointmentProductLinesProps {
  lines: AppointmentProductLine[];
  /** Форматирование суммы строки (валюта настроена в вызывающем). */
  formatAmount: (value: string | number | null | undefined) => string;
  /** Есть право на справочник товаров — тогда строка открывает карточку. */
  clickable?: boolean;
  onProductClick?: (productId: number, productName: string) => void;
}

/** Товары, проданные в рамках визита (списываются со склада). */
const AppointmentProductLines: React.FC<AppointmentProductLinesProps> = ({
  lines,
  formatAmount,
  clickable,
  onProductClick,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();

  const visible = lines.filter((pl) => pl.status !== "canceled");
  if (visible.length === 0) return null;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
        {t("details.products")}
      </Typography>
      <Stack spacing={1}>
        {visible.map((pl) => {
          const canOpen = Boolean(clickable && pl.product?.id != null && onProductClick);
          return (
            <Paper
              key={pl.id}
              variant="outlined"
              onClick={canOpen ? () => onProductClick!(pl.product.id, pl.product.name) : undefined}
              sx={{
                p: 1.5,
                pl: 2,
                display: "flex",
                alignItems: "center",
                gap: 2,
                bgcolor: "background.paper",
                borderRadius: 1.5,
                // Клик открывает карточку товара — как у услуг; без права на
                // справочник строка остаётся некликабельной.
                cursor: canOpen ? "pointer" : "default",
                transition: "background-color 0.2s",
                ...(canOpen && { "&:hover": { bgcolor: subtleBg(theme) } }),
              }}
            >
              <Avatar
                variant="rounded"
                sx={{
                  width: 40,
                  height: 40,
                  bgcolor: "action.selected",
                  color: "text.secondary",
                  flexShrink: 0,
                }}
              >
                <Inventory2Outlined fontSize="small" />
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {pl.product?.name ?? "—"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  × {pl.quantity}
                  {pl.product?.unit ? ` ${pl.product.unit}` : ""}
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0 }}>
                {formatAmount(pl.lineTotal)}
              </Typography>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
};

export default AppointmentProductLines;
