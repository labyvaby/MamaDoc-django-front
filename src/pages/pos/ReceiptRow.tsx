import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import AddOutlined from "@mui/icons-material/AddOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import PercentOutlined from "@mui/icons-material/PercentOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";

import { formatPosAmount } from "./format";
import { POS_RADIUS, posColors } from "./layout";
import { PosBrandBadge, PosSizeChip } from "./ProductCards";
import type { PosReceiptLine } from "./types";
import { PosAmount, PosColorDot } from "./ui";

type Props = {
  readOnly?: boolean;
  /** Право `pos.discount`: без него кнопки скидки на позицию нет. */
  canDiscount?: boolean;
  line: PosReceiptLine;
  onChangeColor: (colorId: string) => void;
  onChangeSize: (sizeId: string) => void;
  onChangeQuantity: (quantity: number) => void;
  /** `discountPercent` задан, когда кассир ввёл скидку процентом. */
  onChangeLineDiscount: (discountAmount: number, discountPercent?: number) => void;
  onRemove: () => void;
  onRestore: () => void;
};

/**
 * Сетка чека на планшете и десктопе: товар, кол-во, цена, сумма, удаление.
 * Шапка таблицы (`Receipt.tsx`) рисуется по этой же сетке.
 */
export const RECEIPT_GRID = "minmax(0, 1fr) 104px 96px 112px 28px";

const QUICK_PERCENTS = [5, 10, 15, 20];

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Метка удалённой позиции — строка остаётся в чеке, пока её не вернули. */
const RemovedBadge: React.FC = () => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Box
      sx={{
        px: "5px",
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
      УДАЛЕНА
    </Box>
  );
};

/** Чип под названием: цвет, размер, скидка. Со стрелкой — если есть из чего выбрать. */
const LineChip: React.FC<{
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  expandable?: boolean;
  active?: boolean;
  dashed?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}> = ({ children, onClick, expandable, active, dashed, disabled, ariaLabel }) => {
  const theme = useTheme();
  const c = posColors(theme);
  const interactive = Boolean(onClick) && !disabled;
  return (
    <ButtonBase
      component={interactive ? "button" : "span"}
      disabled={!interactive}
      onClick={onClick}
      aria-label={ariaLabel}
      sx={{
        height: { xs: 32, lg: 24 },
        px: { xs: "10px", lg: "8px" },
        gap: "5px",
        flexShrink: 0,
        borderRadius: `${POS_RADIUS.pill}px`,
        bgcolor: active ? c.accentBg : c.card,
        border: `1px ${dashed ? "dashed" : "solid"} ${active ? c.accent : c.hairline}`,
        color: active ? c.accentText : c.textSoft,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
        cursor: interactive ? "pointer" : "default",
        "&:hover": interactive ? { borderColor: c.accent } : undefined,
        "&.Mui-disabled": { color: active ? c.accentText : c.textSoft },
        // Phone: the pill stays 32px tall, the finger gets 44px.
        "&::after": interactive ? { content: '""', position: "absolute", inset: { xs: "-6px 0", md: 0 } } : undefined,
      }}
    >
      {children}
      {expandable && interactive ? <ExpandMoreOutlined sx={{ fontSize: 14, mr: "-3px", color: c.textDim }} /> : null}
    </ButtonBase>
  );
};

/** Ввод скидки на позицию: суммой или процентом, с быстрыми процентами. */
const DiscountEditor: React.FC<{
  line: PosReceiptLine;
  onChange: (discountAmount: number, discountPercent?: number) => void;
  onDone: () => void;
}> = ({ line, onChange, onDone }) => {
  const theme = useTheme();
  const c = posColors(theme);
  const subtotal = round2(line.price * line.quantity);
  const [mode, setMode] = React.useState<"percent" | "amount">(line.discountPercent ? "percent" : "amount");
  const current = mode === "percent" ? line.discountPercent : line.discountAmount;
  const [draft, setDraft] = React.useState(current ? String(current) : "");

  const apply = (raw: string, nextMode = mode) => {
    const normalized = raw.replace(",", ".").replace(/[^\d.]/g, "");
    setDraft(normalized);
    const value = Number(normalized) || 0;
    if (nextMode === "percent") {
      const percent = Math.min(100, Math.max(0, value));
      onChange(round2((subtotal * percent) / 100), percent || undefined);
    } else {
      onChange(Math.min(subtotal, Math.max(0, round2(value))));
    }
  };

  const discount = line.discountAmount ?? 0;
  const modeButton = (value: "percent" | "amount", label: string) => (
    <ButtonBase
      onClick={() => {
        setMode(value);
        apply(draft, value);
      }}
      sx={{
        flex: 1,
        height: 28,
        borderRadius: `${POS_RADIUS.chip}px`,
        bgcolor: mode === value ? c.card : "transparent",
        color: mode === value ? c.text : c.textDim,
        boxShadow: mode === value ? theme.shadows[1] : "none",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {label}
    </ButtonBase>
  );

  return (
    <Stack gap="10px" sx={{ width: 248 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography sx={{ fontSize: 13, fontWeight: 800, color: c.text }}>Скидка на товар</Typography>
        <IconButton size="small" onClick={onDone} sx={{ p: "2px", color: c.textDim }} aria-label="Закрыть">
          <CloseOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>
      <Stack direction="row" sx={{ p: "3px", borderRadius: `${POS_RADIUS.tile}px`, bgcolor: c.tile }}>
        {modeButton("percent", "Процент, %")}
        {modeButton("amount", "Сумма, сом")}
      </Stack>
      <InputBase
        autoFocus
        value={draft}
        placeholder="0"
        onChange={(event) => apply(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onDone();
        }}
        inputProps={{ inputMode: "decimal", "aria-label": "Размер скидки" }}
        endAdornment={<Box component="span" sx={{ pl: "6px", color: c.textDim, fontSize: 13 }}>{mode === "percent" ? "%" : "сом"}</Box>}
        sx={{
          height: 38,
          px: "12px",
          bgcolor: c.page,
          border: `1px solid ${c.accent}`,
          borderRadius: `${POS_RADIUS.tile}px`,
          fontSize: 15,
          fontWeight: 700,
          color: c.text,
          "& input::placeholder": { color: c.textDim, opacity: 1 },
        }}
      />
      <Stack direction="row" gap="6px">
        {QUICK_PERCENTS.map((percent) => {
          const selected = mode === "percent" && Number(draft) === percent;
          return (
            <ButtonBase
              key={percent}
              onClick={() => {
                setMode("percent");
                apply(String(percent), "percent");
              }}
              sx={{
                flex: 1,
                height: 28,
                borderRadius: `${POS_RADIUS.chip}px`,
                bgcolor: selected ? c.accent : c.tile,
                color: selected ? c.onAccent : c.textSoft,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {percent}%
            </ButtonBase>
          );
        })}
      </Stack>
      <Stack gap="3px" sx={{ p: "8px 10px", borderRadius: `${POS_RADIUS.tile}px`, bgcolor: c.tile }}>
        <Stack direction="row" justifyContent="space-between">
          <Typography sx={{ fontSize: 12, color: c.textDim }}>Позиция</Typography>
          <Typography sx={{ fontSize: 12, color: c.textSoft }}><PosAmount value={subtotal} /></Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between">
          <Typography sx={{ fontSize: 12, color: c.textDim }}>Скидка</Typography>
          <Typography sx={{ fontSize: 12, color: c.discount }}><PosAmount value={discount} negative /></Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between">
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: c.text }}>К оплате</Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 800, color: c.text }}><PosAmount value={subtotal - discount} /></Typography>
        </Stack>
      </Stack>
      <Stack direction="row" gap="6px">
        <ButtonBase
          disabled={!discount}
          onClick={() => {
            setDraft("");
            onChange(0);
          }}
          sx={{ flex: 1, height: 32, borderRadius: `${POS_RADIUS.tile}px`, border: `1px solid ${c.hairline}`, color: c.danger, fontSize: 12, fontWeight: 700, "&.Mui-disabled": { opacity: 0.4 } }}
        >
          Убрать
        </ButtonBase>
        <ButtonBase
          onClick={onDone}
          sx={{ flex: 1.4, height: 32, borderRadius: `${POS_RADIUS.tile}px`, bgcolor: c.accent, color: c.onAccent, fontSize: 12, fontWeight: 800 }}
        >
          Готово
        </ButtonBase>
      </Stack>
    </Stack>
  );
};

/** Строка чека: товар, варианты, скидка, количество, цена и сумма. */
export const PosReceiptRow: React.FC<Props> = ({
  line,
  onChangeColor,
  onChangeSize,
  onChangeQuantity,
  onChangeLineDiscount,
  onRemove,
  onRestore,
  readOnly = false,
  canDiscount = false,
}) => {
  const theme = useTheme();
  const c = posColors(theme);
  const [colorAnchor, setColorAnchor] = React.useState<HTMLElement | null>(null);
  const [sizeAnchor, setSizeAnchor] = React.useState<HTMLElement | null>(null);
  const [discountAnchor, setDiscountAnchor] = React.useState<HTMLElement | null>(null);

  const color = line.colors.find((item) => item.id === line.selectedColorId);
  const size = line.sizes.find((item) => item.id === line.selectedSizeId);
  const dimmed = Boolean(line.removed);
  const locked = readOnly || dimmed;
  const subtotal = round2(line.price * line.quantity);
  const total = line.total ?? subtotal - (line.discountAmount ?? 0);
  const saved = round2(subtotal - total);
  const discountLabel = line.discountPercent
    ? `−${formatPosAmount(line.discountPercent)}%`
    : line.discountAmount
      ? `−${formatPosAmount(line.discountAmount)} с`
      : null;
  const showDiscountChip = !dimmed && (canDiscount || Boolean(discountLabel));

  const paperSx = {
    mt: "6px",
    p: "8px",
    bgcolor: c.card,
    border: `1px solid ${c.hairline}`,
    borderRadius: `${POS_RADIUS.card}px`,
    backgroundImage: "none",
  } as const;

  return (
    <Box
      sx={{
        display: "grid",
        // Таблица — только на широком экране: в двух колонках планшета и на
        // телефоне строка складывается в две строки с крупными кнопками.
        gridTemplateColumns: { xs: "auto minmax(0, 1fr) auto 44px", lg: RECEIPT_GRID },
        gridTemplateAreas: {
          xs: `"info info info remove" "qty price sum sum"`,
          lg: `"info qty price sum remove"`,
        },
        columnGap: { xs: "10px", lg: "12px" },
        rowGap: "8px",
        alignItems: "center",
        py: "10px",
        borderBottom: `1px solid ${c.hairline}`,
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <Stack gap="5px" sx={{ gridArea: "info", minWidth: 0 }}>
        <Stack direction="row" alignItems="center" gap="6px" sx={{ minWidth: 0 }}>
          <Typography
            noWrap
            title={line.name}
            sx={{
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.25,
              color: c.text,
              textDecoration: dimmed ? "line-through" : "none",
            }}
          >
            {line.name}
          </Typography>
          {dimmed ? <RemovedBadge /> : line.brand ? <PosBrandBadge brand={line.brand} /> : null}
        </Stack>

        {(line.sku || line.barcode) && (
          <Typography noWrap sx={{ fontSize: 11, lineHeight: 1.2, color: c.textDim }}>
            {[line.sku, line.barcode].filter(Boolean).join(" · ")}
          </Typography>
        )}

        {(line.colors.length > 0 || line.sizes.length > 0 || showDiscountChip) && (
          <Stack direction="row" alignItems="center" gap="6px" flexWrap="wrap">
            {line.colors.length > 0 && (
              <LineChip
                expandable={line.colors.length > 1}
                disabled={locked}
                onClick={line.colors.length > 1 ? (event) => setColorAnchor(event.currentTarget) : undefined}
                ariaLabel="Сменить цвет"
              >
                <PosColorDot hex={color?.hex ?? c.textDim} size={12} />
                {color?.label ?? "Цвет"}
              </LineChip>
            )}
            {line.sizes.length > 0 && (
              <LineChip
                expandable={line.sizes.length > 1}
                disabled={locked}
                onClick={line.sizes.length > 1 ? (event) => setSizeAnchor(event.currentTarget) : undefined}
                ariaLabel="Сменить размер"
              >
                <Box component="span" sx={{ color: c.textDim, fontWeight: 500 }}>Размер</Box>
                {size?.label ?? "—"}
              </LineChip>
            )}
            {showDiscountChip && (
              <LineChip
                active={Boolean(discountLabel)}
                dashed={!discountLabel}
                disabled={locked || !canDiscount}
                onClick={canDiscount ? (event) => setDiscountAnchor(event.currentTarget) : undefined}
                ariaLabel="Скидка на товар"
              >
                <PercentOutlined sx={{ fontSize: 13 }} />
                {discountLabel ?? "Скидка"}
              </LineChip>
            )}
          </Stack>
        )}
      </Stack>

      <Box sx={{ gridArea: "qty", display: "flex", justifyContent: { xs: "flex-start", lg: "center" } }}>
        <Stack
          direction="row"
          alignItems="center"
          sx={{
            height: { xs: 44, lg: 32 },
            bgcolor: c.card,
            border: `1px solid ${c.hairline}`,
            borderRadius: `${POS_RADIUS.tile}px`,
            "& .MuiIconButton-root": { width: { xs: 44, lg: 30 }, height: { xs: 42, lg: 30 }, color: c.textSoft },
          }}
        >
          <IconButton
            size="small"
            disabled={locked || line.quantity <= 1}
            onClick={() => onChangeQuantity(Math.max(line.quantity - 1, 1))}
            aria-label="Уменьшить количество"
          >
            <RemoveOutlined sx={{ fontSize: 16 }} />
          </IconButton>
          <Typography sx={{ minWidth: 26, fontSize: 14, fontWeight: 800, color: c.text, textAlign: "center" }}>
            {line.quantity}
          </Typography>
          <IconButton size="small" disabled={locked} onClick={() => onChangeQuantity(line.quantity + 1)} aria-label="Увеличить количество">
            <AddOutlined sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>
      </Box>

      <Box sx={{ gridArea: "price", minWidth: 0, textAlign: { xs: "left", lg: "right" } }}>
        <Typography noWrap sx={{ fontSize: { xs: 12, lg: 14 }, fontWeight: { xs: 500, lg: 700 }, color: { xs: c.textDim, lg: c.textSoft } }}>
          <Box component="span" sx={{ display: { lg: "none" } }}>× </Box>
          <PosAmount value={line.price} />
        </Typography>
      </Box>

      <Stack sx={{ gridArea: "sum", alignItems: "flex-end", minWidth: 0 }}>
        {saved > 0 && !dimmed && (
          <Typography noWrap sx={{ fontSize: 11, lineHeight: 1.1, color: c.textDim, textDecoration: "line-through" }}>
            <PosAmount value={subtotal} />
          </Typography>
        )}
        <Typography
          noWrap
          sx={{
            fontSize: 15,
            fontWeight: 900,
            lineHeight: 1.2,
            color: saved > 0 && !dimmed ? c.discount : c.text,
            textDecoration: dimmed ? "line-through" : "none",
          }}
        >
          <PosAmount value={total} />
        </Typography>
      </Stack>

      <Box sx={{ gridArea: "remove", display: "flex", justifyContent: "flex-end", alignSelf: { xs: "flex-start", lg: "center" } }}>
        {dimmed ? (
          <IconButton size="small" disabled={readOnly} onClick={onRestore} sx={{ p: "4px", width: { xs: 44, lg: 28 }, height: { xs: 44, lg: 28 }, color: c.positive }} aria-label="Вернуть позицию">
            <ReplayOutlined sx={{ fontSize: 18 }} />
          </IconButton>
        ) : (
          <IconButton size="small" disabled={readOnly} onClick={onRemove} sx={{ p: "4px", width: { xs: 44, lg: 28 }, height: { xs: 44, lg: 28 }, color: c.textDim, "&:hover": { color: c.danger } }} aria-label="Удалить позицию">
            <CloseOutlined sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Box>

      <Popover
        open={Boolean(discountAnchor)}
        anchorEl={discountAnchor}
        onClose={() => setDiscountAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { ...paperSx, p: "12px" } } }}
      >
        <DiscountEditor line={line} onChange={onChangeLineDiscount} onDone={() => setDiscountAnchor(null)} />
      </Popover>

      <Popover
        open={Boolean(colorAnchor)}
        anchorEl={colorAnchor}
        onClose={() => setColorAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: paperSx } }}
      >
        <Stack sx={{ minWidth: 150 }}>
          {line.colors.map((option) => (
            <ButtonBase
              key={option.id}
              onClick={() => {
                onChangeColor(option.id);
                setColorAnchor(null);
              }}
              sx={{ justifyContent: "flex-start", gap: "10px", px: "8px", py: "6px", borderRadius: `${POS_RADIUS.chip}px`, "&:hover": { bgcolor: c.tile } }}
            >
              <PosColorDot hex={option.hex} size={16} />
              <Typography sx={{ flex: 1, textAlign: "left", fontSize: 14, color: c.text }}>{option.label}</Typography>
              {option.id === line.selectedColorId ? <CheckOutlined sx={{ fontSize: 14, color: c.accentText }} /> : null}
            </ButtonBase>
          ))}
        </Stack>
      </Popover>

      <Popover
        open={Boolean(sizeAnchor)}
        anchorEl={sizeAnchor}
        onClose={() => setSizeAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: paperSx } }}
      >
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(40px, auto))", gap: "6px" }}>
          {line.sizes.map((option) => (
            <ButtonBase
              key={option.id}
              disabled={!option.available}
              onClick={() => {
                onChangeSize(option.id);
                setSizeAnchor(null);
              }}
              sx={{ borderRadius: `${POS_RADIUS.chip}px`, "& > div": { width: "100%", py: "7px" } }}
            >
              <PosSizeChip label={option.label} selected={option.id === line.selectedSizeId} available={option.available} />
            </ButtonBase>
          ))}
        </Box>
      </Popover>
    </Box>
  );
};
