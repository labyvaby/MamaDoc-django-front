import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import AddOutlined from "@mui/icons-material/AddOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";

import { POS_RADIUS, RECEIPT_COLUMN_SPECS, posColors } from "./layout";
import { PosColumn } from "./columns";
import { PosBrandBadge, PosMoreVariants, PosSizeChip } from "./ProductCards";
import type { PosReceiptLine } from "./types";
import { PosAmount, PosColorDot, PosThumb } from "./ui";

type Props = {
  line: PosReceiptLine;
  onChangeColor: (colorId: string) => void;
  onChangeSize: (sizeId: string) => void;
  onChangeQuantity: (quantity: number) => void;
  onRemove: () => void;
  onRestore: () => void;
};

const [colorSpec, sizeSpec, quantitySpec, priceSpec, sumSpec, removeSpec] = RECEIPT_COLUMN_SPECS;

/** Метка удалённой позиции — строка остаётся в чеке, пока её не вернули. */
const RemovedBadge: React.FC = () => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Box
      sx={{
        px: "4px",
        py: "2px",
        borderRadius: `${POS_RADIUS.chip}px`,
        bgcolor: c.dangerBg,
        color: c.danger,
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1.1,
        whiteSpace: "nowrap",
      }}
    >
      УДАЛЕН
    </Box>
  );
};

/** Строка чека: товар, варианты, количество, цена и сумма. */
export const PosReceiptRow: React.FC<Props> = ({ line, onChangeColor, onChangeSize, onChangeQuantity, onRemove, onRestore }) => {
  const theme = useTheme();
  const c = posColors(theme);
  const [colorAnchor, setColorAnchor] = React.useState<HTMLElement | null>(null);
  const [sizeAnchor, setSizeAnchor] = React.useState<HTMLElement | null>(null);

  const color = line.colors.find((item) => item.id === line.selectedColorId) ?? line.colors[0];
  const size = line.sizes.find((item) => item.id === line.selectedSizeId) ?? line.sizes[0];
  const dimmed = Boolean(line.removed);

  return (
    <Box
      sx={{
        height: 52,
        py: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `1px solid ${c.hairline}`,
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <Stack direction="row" alignItems="center" gap="12px" sx={{ minWidth: 0, flex: 1 }}>
        <PosThumb />
        <Stack gap="4px" sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap="6px">
            <Typography
              noWrap
              sx={{
                fontSize: 14,
                fontWeight: 700,
                lineHeight: 1.2,
                color: c.text,
                textDecoration: dimmed ? "line-through" : "none",
              }}
            >
              {line.name}
            </Typography>
            {dimmed ? <RemovedBadge /> : line.brand ? <PosBrandBadge brand={line.brand} /> : null}
          </Stack>
          <Stack direction="row" alignItems="center" gap="10px">
            <Typography sx={{ fontSize: 12, lineHeight: 1.2, color: c.textDim }}>{line.sku}</Typography>
            <Box sx={{ width: 2, height: 2, borderRadius: "50%", bgcolor: c.textDim }} />
            <Typography sx={{ fontSize: 12, lineHeight: 1.2, color: c.textDim }}>{line.barcode}</Typography>
          </Stack>
        </Stack>
      </Stack>

      <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        <PosColumn spec={colorSpec}>
          <ButtonBase
            disabled={dimmed}
            onClick={(event) => setColorAnchor(event.currentTarget)}
            sx={{ gap: "4px", borderRadius: `${POS_RADIUS.pill}px` }}
          >
            <PosColorDot hex={color?.hex ?? c.textDim} selected={!dimmed} />
            <PosMoreVariants count={Math.max(line.colors.length - 3, 0)} />
          </ButtonBase>
        </PosColumn>

        <PosColumn spec={sizeSpec}>
          <ButtonBase
            disabled={dimmed}
            onClick={(event) => setSizeAnchor(event.currentTarget)}
            sx={{ gap: "4px", borderRadius: `${POS_RADIUS.chip}px` }}
          >
            <PosSizeChip label={size?.label ?? "—"} selected={!dimmed} />
            <PosMoreVariants count={Math.max(line.sizes.length - 4, 0)} />
          </ButtonBase>
        </PosColumn>

        <PosColumn spec={quantitySpec}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="center"
            gap="6px"
            sx={{
              width: "100%",
              p: "6px",
              bgcolor: c.card,
              border: `1px solid ${c.hairline}`,
              borderRadius: `${POS_RADIUS.chip}px`,
            }}
          >
            <IconButton
              size="small"
              disabled={dimmed}
              onClick={() => onChangeQuantity(Math.max(line.quantity - 1, 1))}
              sx={{ p: 0, color: c.textSoft }}
            >
              <RemoveOutlined sx={{ fontSize: 16 }} />
            </IconButton>
            <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 0.9, color: c.text, minWidth: 8, textAlign: "center" }}>
              {line.quantity}
            </Typography>
            <IconButton size="small" disabled={dimmed} onClick={() => onChangeQuantity(line.quantity + 1)} sx={{ p: 0, color: c.textSoft }}>
              <AddOutlined sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        </PosColumn>

        <PosColumn spec={priceSpec}>
          <Typography sx={{ fontSize: 14, fontWeight: 900, lineHeight: 0.9, color: c.text, whiteSpace: "nowrap" }}>
            <PosAmount value={line.price} />
          </Typography>
        </PosColumn>

        <PosColumn spec={sumSpec}>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 0.9,
              color: c.text,
              whiteSpace: "nowrap",
              textDecoration: dimmed ? "line-through" : "none",
            }}
          >
            <PosAmount value={line.price * line.quantity} />
          </Typography>
        </PosColumn>

        <PosColumn spec={removeSpec}>
          {dimmed ? (
            <IconButton size="small" onClick={onRestore} sx={{ p: 0, color: c.positive }} aria-label="Вернуть позицию">
              <ReplayOutlined sx={{ fontSize: 18 }} />
            </IconButton>
          ) : (
            <IconButton size="small" onClick={onRemove} sx={{ p: 0, color: c.textDim }} aria-label="Удалить позицию">
              <CloseOutlined sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </PosColumn>
      </Box>

      <Popover
        open={Boolean(colorAnchor)}
        anchorEl={colorAnchor}
        onClose={() => setColorAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: { mt: "6px", p: "8px", bgcolor: c.card, border: `1px solid ${c.hairline}`, borderRadius: `${POS_RADIUS.card}px`, backgroundImage: "none" },
          },
        }}
      >
        <Stack sx={{ minWidth: 133 }}>
          {line.colors.map((option) => (
            <ButtonBase
              key={option.id}
              onClick={() => {
                onChangeColor(option.id);
                setColorAnchor(null);
              }}
              sx={{ justifyContent: "flex-start", gap: "10px", px: "6px", py: "5px", borderRadius: `${POS_RADIUS.chip}px`, "&:hover": { bgcolor: c.tile } }}
            >
              <PosColorDot hex={option.hex} size={16} />
              <Typography sx={{ flex: 1, textAlign: "left", fontSize: 14, color: c.text }}>{option.label}</Typography>
              {option.id === line.selectedColorId ? <CheckOutlined sx={{ fontSize: 14, color: c.text }} /> : null}
            </ButtonBase>
          ))}
        </Stack>
      </Popover>

      <Popover
        open={Boolean(sizeAnchor)}
        anchorEl={sizeAnchor}
        onClose={() => setSizeAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: { mt: "6px", p: "8px", bgcolor: c.card, border: `1px solid ${c.hairline}`, borderRadius: `${POS_RADIUS.card}px`, backgroundImage: "none" },
          },
        }}
      >
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(30px, auto))", gap: "6px" }}>
          {line.sizes.map((option) => (
            <ButtonBase
              key={option.id}
              disabled={!option.available}
              onClick={() => {
                onChangeSize(option.id);
                setSizeAnchor(null);
              }}
              sx={{ borderRadius: `${POS_RADIUS.chip}px` }}
            >
              <Stack direction="row" alignItems="center" gap="4px">
                <PosSizeChip label={option.label} selected={option.id === line.selectedSizeId} available={option.available} />
                {option.id === line.selectedSizeId ? <CheckOutlined sx={{ fontSize: 12, color: c.text }} /> : null}
              </Stack>
            </ButtonBase>
          ))}
        </Box>
      </Popover>
    </Box>
  );
};
