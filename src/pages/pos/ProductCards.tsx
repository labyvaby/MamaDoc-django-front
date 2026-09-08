import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";

import { POS_LAYOUT, POS_RADIUS, posColors } from "./layout";
import type { PosCatalogItem } from "./types";
import { PosAmount, PosColorDot } from "./ui";

type Props = {
  disabled?: boolean;
  items: PosCatalogItem[];
  onAdd: (item: PosCatalogItem) => void;
};

/** Бейдж бренда — акцентная плашка рядом с названием товара. */
export const PosBrandBadge: React.FC<{ brand: string }> = ({ brand }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Box
      sx={{
        px: "4px",
        py: "2px",
        borderRadius: `${POS_RADIUS.chip}px`,
        bgcolor: c.accentBg,
        border: `0.5px solid ${c.accent}`,
        color: c.accentText,
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1.1,
        whiteSpace: "nowrap",
      }}
    >
      {brand}
    </Box>
  );
};

/** «+2 ›» — счётчик скрытых вариантов цвета или размера. */
export const PosMoreVariants: React.FC<{ count: number }> = ({ count }) => {
  const theme = useTheme();
  const c = posColors(theme);
  if (count <= 0) return null;
  return (
    <Stack direction="row" alignItems="center" gap="2px" sx={{ flexShrink: 0 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 0.9, color: c.accentText }}>+{count}</Typography>
      <ChevronRightOutlined sx={{ fontSize: 10, color: c.accentText }} />
    </Stack>
  );
};

/** Чип размера. Недоступный размер зачёркнут и приглушён. */
export const PosSizeChip: React.FC<{ label: string; selected?: boolean; available?: boolean; small?: boolean }> = ({
  label,
  selected,
  available = true,
  small,
}) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Box
      sx={{
        px: "6px",
        py: "4px",
        borderRadius: `${POS_RADIUS.chip}px`,
        bgcolor: c.card,
        border: `1px solid ${selected ? c.accent : c.hairline}`,
        color: available ? c.textSoft : c.textDim,
        opacity: available ? 1 : 0.5,
        textDecoration: available ? "none" : "line-through",
        fontSize: small ? 10 : 12,
        fontWeight: 700,
        lineHeight: 0.9,
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Box>
  );
};

/** Горизонтально прокручиваемая лента карточек товаров — над чеком. */
export const PosProductCards: React.FC<Props> = ({ items, onAdd, disabled = false }) => {
  const theme = useTheme();
  const c = posColors(theme);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = React.useState({ left: false, right: false });
  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef({ active: false, moved: false, startX: 0, startScrollLeft: 0 });

  const updateScrollState = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    setScrollState({
      left: viewport.scrollLeft > 1,
      right: viewport.scrollLeft < maxScrollLeft - 1,
    });
  }, []);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    updateScrollState();
    viewport.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [items.length, updateScrollState]);

  const scrollProducts = (direction: -1 | 1) => {
    viewportRef.current?.scrollBy({
      left: direction * Math.max(240, (viewportRef.current.clientWidth || 0) * 0.75),
      behavior: "smooth",
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
    };
    setDragging(true);
    viewport.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag.active || !viewport) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 4) drag.moved = true;
    viewport.scrollLeft = drag.startScrollLeft - distance;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    dragRef.current.active = false;
    setDragging(false);
  };

  return (
    <Box
      sx={{
        height: POS_LAYOUT.productCardsHeight,
        flexShrink: 0,
        position: "relative",
        bgcolor: c.page,
        borderBottom: `1px solid ${c.outline}`,
      }}
    >
      <Box
        ref={viewportRef}
        className={dragging ? "is-dragging" : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDragStart={(event) => event.preventDefault()}
        sx={{
          height: "100%",
          p: "10px",
          display: "flex",
          gap: "10px",
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          cursor: "grab",
          userSelect: "none",
          touchAction: "pan-y",
          "&.is-dragging": { cursor: "grabbing" },
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {items.map((item) => (
          <ButtonBase
            key={item.id}
            onClick={(event) => {
              if (dragRef.current.moved) {
                event.preventDefault();
                event.stopPropagation();
                dragRef.current.moved = false;
                return;
              }
              onAdd(item);
            }}
            disabled={disabled || item.stock === 0}
            sx={{
              width: POS_LAYOUT.productCardWidth,
              flexShrink: 0,
              px: "10px",
              py: "8px",
              gap: "8px",
              alignItems: "stretch",
              justifyContent: "flex-start",
              textAlign: "left",
              bgcolor: c.card,
              border: `1px solid ${c.hairline}`,
              borderRadius: `${POS_RADIUS.card}px`,
              "&:hover": { borderColor: c.accent },
            }}
          >
            <Box
              sx={{
                width: 78,
                flexShrink: 0,
                borderRadius: `${POS_RADIUS.tile}px`,
                bgcolor: c.tile,
                border: `1px solid ${c.hairline}`,
                display: "grid",
                placeItems: "center",
              }}
            >
              {item.imageUrl ? <Box component="img" src={item.imageUrl} alt="" sx={{ width: 78, height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : <ImageOutlined sx={{ fontSize: 28, color: c.textDim, opacity: 0.6 }} />}
            </Box>

            <Stack gap="8px" sx={{ flex: 1, minWidth: 0 }}>
              <Stack gap="6px" alignItems="flex-start">
                <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: c.text, maxWidth: "100%" }}>
                  {item.name}
                </Typography>
                {item.brand ? <PosBrandBadge brand={item.brand} /> : null}
                <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: c.text }}>
                  <PosAmount value={item.price} />
                  {item.stock !== undefined && <Typography component="span" fontSize={11} color="text.secondary"> · {item.stock} шт.</Typography>}
                </Typography>
              </Stack>

              <Box sx={{ height: "1px", bgcolor: c.hairline }} />

              <Stack direction="row" alignItems="center" gap="6px">
                <Stack direction="row" alignItems="center" gap="2px">
                  {item.colors.slice(0, 2).map((color) => (
                    <PosColorDot key={color.id} hex={color.hex} size={16} />
                  ))}
                  <PosMoreVariants count={Math.max(item.colors.length - 2, 0)} />
                </Stack>
                <Box sx={{ width: "1px", height: 15, bgcolor: c.hairline }} />
                <Stack direction="row" alignItems="center" gap="2px">
                  {item.sizes.slice(0, 2).map((size) => (
                    <PosSizeChip key={size.id} label={size.label} available={size.available} small />
                  ))}
                  <PosMoreVariants count={Math.max(item.sizes.length - 2, 0)} />
                </Stack>
              </Stack>
            </Stack>
          </ButtonBase>
        ))}
      </Box>

      {scrollState.left && (
        <IconButton
          aria-label="Прокрутить товары влево"
          onClick={() => scrollProducts(-1)}
          sx={{
            position: "absolute",
            zIndex: 1,
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 34,
            height: 34,
            color: c.text,
            bgcolor: c.card,
            border: `1px solid ${c.hairline}`,
            boxShadow: theme.shadows[4],
            "&:hover": { bgcolor: c.accent, color: c.onAccent },
            "& svg": { fontSize: 22 },
          }}
        >
          <ChevronLeftOutlined />
        </IconButton>
      )}
      {scrollState.right && (
        <IconButton
          aria-label="Прокрутить товары вправо"
          onClick={() => scrollProducts(1)}
          sx={{
            position: "absolute",
            zIndex: 1,
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 34,
            height: 34,
            color: c.text,
            bgcolor: c.card,
            border: `1px solid ${c.hairline}`,
            boxShadow: theme.shadows[4],
            "&:hover": { bgcolor: c.accent, color: c.onAccent },
            "& svg": { fontSize: 22 },
          }}
        >
          <ChevronRightOutlined />
        </IconButton>
      )}
    </Box>
  );
};
