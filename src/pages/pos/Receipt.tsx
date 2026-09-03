import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import { POS_RADIUS, RECEIPT_COLUMN_SPECS, posColors } from "./layout";
import { PosColumn } from "./columns";
import { PosReceiptRow } from "./ReceiptRow";
import type { PosReceiptLine } from "./types";

type Props = {
  number: string;
  lines: PosReceiptLine[];
  onChangeColor: (lineId: string, colorId: string) => void;
  onChangeSize: (lineId: string, sizeId: string) => void;
  onChangeQuantity: (lineId: string, quantity: number) => void;
  onRemoveLine: (lineId: string) => void;
  onRestoreLine: (lineId: string) => void;
  onHold: () => void;
  onCancel: () => void;
};

const COLUMN_LABELS: Record<string, string> = {
  color: "цвет",
  size: "размер",
  quantity: "кол-во",
  price: "цена",
  sum: "сумма",
  remove: "",
};

/** Чек: номер, счётчики позиций, действия и таблица товаров. */
export const PosReceipt: React.FC<Props> = ({
  number,
  lines,
  onChangeColor,
  onChangeSize,
  onChangeQuantity,
  onRemoveLine,
  onRestoreLine,
  onHold,
  onCancel,
}) => {
  const theme = useTheme();
  const c = posColors(theme);

  const activeCount = lines.filter((line) => !line.removed).length;
  const removedCount = lines.length - activeCount;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", bgcolor: c.checkArea, borderRadius: `${POS_RADIUS.card}px` }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: "16px", px: "16px", flexShrink: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: c.text }}>Чек №{number}</Typography>

        <Stack direction="row" alignItems="center" gap="16px">
          <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textDim }}>{activeCount} товаров</Typography>
          {removedCount > 0 ? (
            <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.danger }}>удалено: {removedCount}</Typography>
          ) : null}
          <ButtonBase
            onClick={onHold}
            sx={{
              px: "12px",
              py: "8px",
              borderRadius: `${POS_RADIUS.pill}px`,
              bgcolor: c.tile,
              border: `1px solid ${c.outline}`,
              color: c.textSoft,
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            Отложить
          </ButtonBase>
          <ButtonBase
            onClick={onCancel}
            sx={{
              px: "12px",
              py: "8px",
              borderRadius: `${POS_RADIUS.pill}px`,
              bgcolor: c.page,
              border: `1px solid ${c.outline}`,
              color: c.danger,
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            Отменить чек
          </ButtonBase>
        </Stack>
      </Stack>

      <Box sx={{ px: "16px", flexShrink: 0, display: "flex", alignItems: "center" }}>
        <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 500, lineHeight: 1.2, textTransform: "uppercase", color: c.textDim }}>
          товар
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {RECEIPT_COLUMN_SPECS.map((spec) => (
            <PosColumn key={spec.key} spec={spec}>
              <Typography sx={{ fontSize: 12, fontWeight: 500, lineHeight: 1.2, textTransform: "uppercase", color: c.textDim, whiteSpace: "nowrap" }}>
                {COLUMN_LABELS[spec.key]}
              </Typography>
            </PosColumn>
          ))}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: "16px", mt: "6px" }}>
        {lines.map((line) => (
          <PosReceiptRow
            key={line.id}
            line={line}
            onChangeColor={(colorId) => onChangeColor(line.id, colorId)}
            onChangeSize={(sizeId) => onChangeSize(line.id, sizeId)}
            onChangeQuantity={(quantity) => onChangeQuantity(line.id, quantity)}
            onRemove={() => onRemoveLine(line.id)}
            onRestore={() => onRestoreLine(line.id)}
          />
        ))}
        {lines.length === 0 ? (
          <Typography sx={{ py: "24px", fontSize: 14, color: c.textDim, textAlign: "center" }}>
            Чек пуст — отсканируйте товар или выберите категорию
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
};
