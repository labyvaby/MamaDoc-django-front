import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import ShoppingCartOutlined from "@mui/icons-material/ShoppingCartOutlined";

import { POS_LAYOUT, POS_RADIUS, posColors } from "./layout";

type Props = {
  canSell?: boolean;
  canHold?: boolean;
  onScan?: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  /** Kept for compatibility with the legacy mock POS page. */
  cashierDesk?: string;
  cashierName?: string;
  onNewReceipt: () => void;
  onOpenHeldReceipts: () => void;
};

/** Кнопка-«таблетка» шапки: «Новый чек», «Отложенные чеки». */
const TopBarButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        height: 42,
        px: "16px",
        borderRadius: `${POS_RADIUS.control}px`,
        bgcolor: c.card,
        border: `1px solid ${c.outline}`,
        color: c.textSoft,
        fontSize: 14,
        fontWeight: 700,
        lineHeight: 1.1,
        whiteSpace: "nowrap",
        "&:hover": { bgcolor: c.tile },
      }}
    >
      {label}
    </ButtonBase>
  );
};

/** Верхняя полоса кассы: корзина, поиск товара и действия с чеком. */
export const PosTopBar: React.FC<Props> = ({ search, onSearchChange, onNewReceipt, onOpenHeldReceipts, canSell = false, canHold = false, onScan }) => {
  const theme = useTheme();
  const c = posColors(theme);

  return (
    <Box
      sx={{
        height: POS_LAYOUT.topBarHeight,
        flexShrink: 0,
        px: "20px",
        py: "10px",
        bgcolor: c.page,
        borderBottom: `1px solid ${c.outline}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "20px",
      }}
    >
      <Stack direction="row" alignItems="center" gap="20px" sx={{ minWidth: 0 }}>
        <Stack direction="row" alignItems="center" gap="8px" sx={{ flexShrink: 0 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              borderRadius: `${POS_RADIUS.tile}px`,
              bgcolor: c.tile,
            }}
          >
            <ShoppingCartOutlined sx={{ fontSize: 16, color: c.accentText }} />
          </Box>
          <Typography sx={{ fontSize: 18, fontWeight: 700, color: c.text }}>Касса магазина</Typography>
        </Stack>

        <Box
          sx={{
            width: 450,
            maxWidth: "100%",
            height: 42,
            px: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            bgcolor: c.tile,
            border: `1px solid ${c.outline}`,
            borderRadius: `${POS_RADIUS.control}px`,
          }}
        >
          <InputBase
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onScan?.(); } }}
            placeholder="Поиск по названию, артикулу или штрихкоду"
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              color: c.text,
              "& input::placeholder": { color: c.textDim, opacity: 1 },
            }}
          />
          <Box
            sx={{
              flexShrink: 0,
              px: "6px",
              py: "4px",
              border: `1px solid ${c.outline}`,
              borderRadius: `${POS_RADIUS.chip}px`,
              fontSize: 10,
              lineHeight: 0.9,
              color: c.textDim,
            }}
          >
            F2
          </Box>
        </Box>
      </Stack>

      <Stack direction="row" alignItems="center" gap="16px" sx={{ flexShrink: 0 }}>
        {canSell && <TopBarButton label="Новый чек" onClick={onNewReceipt} />}
        {canHold && <TopBarButton label="Отложенные чеки" onClick={onOpenHeldReceipts} />}
      </Stack>
    </Box>
  );
};
