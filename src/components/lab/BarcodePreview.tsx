import React from "react";
import { Box, Stack, Typography } from "@mui/material";

interface Props {
  /** PNG штрихкода в base64, как его отдаёт ЛИС операцией barCode. */
  barcodeBase64: string;
  /** Номер заказа в ЛИС — подпись под полосами. */
  orderCode: number | null;
}

/**
 * Штрихкод заказа прямо на экране, а не только на печать.
 *
 * Регистратору он нужен глазами чаще, чем на бумаге: сверить номер с
 * пробиркой, продиктовать в лабораторию по телефону, показать пациенту.
 * До этого штрихкод жил только внутри окна печати этикеток — чтобы просто
 * посмотреть на него, приходилось открывать печать и закрывать её.
 *
 * Картинка приходит из ЛИС как PNG в base64 (находка 20), поэтому рисуется
 * как есть, без своей генерации: полосы и номер обязаны совпадать с тем,
 * что наклеят на пробирку в лаборатории.
 */
const BarcodePreview: React.FC<Props> = ({ barcodeBase64, orderCode }) => {
  if (!barcodeBase64) return null;
  return (
    <Stack
      alignItems="center"
      spacing={0.5}
      sx={{
        p: 1.5,
        borderRadius: "12px",
        border: 1,
        borderColor: "divider",
        bgcolor: "#fff",
        width: "fit-content",
      }}
    >
      <Box
        component="img"
        alt={orderCode != null ? `Штрихкод заказа ${orderCode}` : "Штрихкод заказа"}
        src={`data:image/png;base64,${barcodeBase64}`}
        sx={{ display: "block", height: 68, imageRendering: "pixelated" }}
      />
      {orderCode != null && (
        <Typography
          variant="caption"
          sx={{ color: "#000", letterSpacing: 2, fontFamily: "monospace" }}
        >
          {orderCode}
        </Typography>
      )}
    </Stack>
  );
};

export default BarcodePreview;
