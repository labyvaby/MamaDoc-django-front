import React from "react";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";

import ImageOutlined from "@mui/icons-material/ImageOutlined";

import { formatPosAmount } from "./format";
import { POS_RADIUS, posColors } from "./layout";

/**
 * Мелкие примитивы макета «Кассы»: сумма с подчёркнутым знаком сома, миниатюра
 * товара, кнопка-«таблетка» и кружок цвета. Вынесены отдельно — в макете они
 * повторяются в шапке, чеке, панели оплаты и диалогах.
 */

/**
 * Сумма со знаком сома. В макете «с» подчёркнута — это официальное написание
 * знака кыргызского сома, поэтому подчёркивание рисуем, а не опускаем.
 */
export const PosAmount: React.FC<{
  value: number;
  /** Знак минуса перед суммой — для строк списаний в итогах. */
  negative?: boolean;
  sx?: React.ComponentProps<typeof Box>["sx"];
}> = ({ value, negative, sx }) => (
  <Box component="span" sx={sx}>
    {negative ? "-" : ""}
    {formatPosAmount(value)}{" "}
    <Box component="span" sx={{ textDecoration: "underline" }}>
      с
    </Box>
  </Box>
);

/**
 * Миниатюра товара. Фотографий у моков нет — на их месте плитка с иконкой
 * снимка: так пустое место читается как «фото не загружено», а не как контрол.
 */
export const PosThumb: React.FC<{ size?: number; radius?: number; sx?: React.ComponentProps<typeof Box>["sx"] }> = ({
  size = 35,
  radius = POS_RADIUS.chip,
  sx,
}) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Box
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: `${radius}px`,
        bgcolor: c.tile,
        border: `1px solid ${c.hairline}`,
        display: "grid",
        placeItems: "center",
        ...sx,
      }}
    >
      <ImageOutlined sx={{ fontSize: Math.round(size * 0.5), color: c.textDim, opacity: 0.6 }} />
    </Box>
  );
};

/** Кружок варианта цвета: заливка — цвет товара, обводка — акцент у выбранного. */
export const PosColorDot: React.FC<{ hex: string; size?: number; selected?: boolean }> = ({ hex, size = 24, selected }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        bgcolor: selected ? c.accent : "transparent",
        p: selected ? "2px" : 0,
      }}
    >
      <Box
        sx={{
          width: selected ? size - 4 : size,
          height: selected ? size - 4 : size,
          borderRadius: "50%",
          bgcolor: hex,
          border: `1px solid ${c.hairline}`,
        }}
      />
    </Box>
  );
};
