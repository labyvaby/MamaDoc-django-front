import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";

import { POS_RADIUS, posColors } from "./layout";
import type { PosHeldReceipt } from "./types";
import { PosAmount } from "./ui";

type Props = {
  open: boolean;
  receipts: PosHeldReceipt[];
  onClose: () => void;
  onRestore: (receipt: PosHeldReceipt) => void;
  onDelete: (receipt: PosHeldReceipt) => void;
};

/**
 * Колонки таблицы отложенных чеков (макет: 140/190/235/235/235 + корзина).
 * Колонка суммы тянется: в макете строка ровно 1053px, а в окне уже диалога
 * лишнюю ширину должна забирать именно она, чтобы корзина осталась у края.
 */
const GRID = "140px 190px 235px 235px minmax(120px, 1fr) 18px";

/** «Отложенные чеки» — список отложенных покупок с возвратом в работу. */
export const PosHeldReceiptsDialog: React.FC<Props> = ({ open, receipts, onClose, onRestore, onDelete }) => {
  const theme = useTheme();
  const c = posColors(theme);

  const headerSx = {
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.2,
    textTransform: "uppercase",
    color: c.textDim,
  } as const;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            width: 1107,
            maxWidth: "calc(100vw - 48px)",
            height: 620,
            maxHeight: "calc(100vh - 80px)",
            borderRadius: `${POS_RADIUS.dialog}px`,
            bgcolor: c.tile,
            border: `1px solid ${c.hairline}`,
            backgroundImage: "none",
            overflow: "hidden",
          },
        },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: "24px", py: "16px", borderBottom: `1px solid ${c.outline}` }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: c.text }}>Отложенные чеки</Typography>
        <IconButton size="small" onClick={onClose} sx={{ p: 0, color: c.textSoft }} aria-label="Закрыть">
          <CloseOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>

      <Stack gap="10px" sx={{ p: "16px", bgcolor: c.page, flex: 1, minHeight: 0 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: GRID, px: "24px" }}>
          <Typography sx={headerSx}>Дата и время</Typography>
          <Typography sx={headerSx}>Номер чека</Typography>
          <Typography sx={headerSx}>Клиент</Typography>
          <Typography sx={headerSx}>Комментарий</Typography>
          <Typography sx={headerSx}>Сумма</Typography>
          <Box />
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", borderRadius: `${POS_RADIUS.card}px`, bgcolor: c.card, border: `1px solid ${c.hairline}` }}>
          {receipts.map((receipt, index) => (
            <Box
              key={receipt.id}
              sx={{
                display: "grid",
                gridTemplateColumns: GRID,
                alignItems: "center",
                height: 51,
                px: "24px",
                borderTop: index === 0 ? "none" : `1px solid ${c.hairline}`,
              }}
            >
              <ButtonBase
                onClick={() => onRestore(receipt)}
                sx={{ justifyContent: "flex-start", fontSize: 14, lineHeight: 1.2, color: c.textSoft }}
              >
                {receipt.createdAt}
              </ButtonBase>
              <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textSoft }}>{receipt.number}</Typography>
              <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textSoft }}>{receipt.clientName}</Typography>
              <Typography noWrap sx={{ fontSize: 14, lineHeight: 1.2, color: c.textSoft }}>
                {receipt.comment}
              </Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: c.text }}>
                <PosAmount value={receipt.total} />
              </Typography>
              <IconButton size="small" onClick={() => onDelete(receipt)} sx={{ p: 0, color: c.textDim }} aria-label="Удалить отложенный чек">
                <DeleteOutlineOutlined sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          ))}
          {receipts.length === 0 ? (
            <Typography sx={{ p: "24px", fontSize: 14, color: c.textDim, textAlign: "center" }}>Отложенных чеков нет</Typography>
          ) : null}
        </Box>
      </Stack>
    </Dialog>
  );
};
