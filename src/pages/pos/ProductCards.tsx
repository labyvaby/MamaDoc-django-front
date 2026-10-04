import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import AddOutlined from "@mui/icons-material/AddOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { POS_RADIUS, posColors } from "./layout";
import type { PosCatalogItem } from "./types";
import { PosAmount, PosColorDot } from "./ui";
import type { PosProduct } from "../../api/pos";

type Props = {
  disabled?: boolean;
  items: PosCatalogItem[];
  onAdd: (item: PosCatalogItem, variant?: PosProduct) => void;
  /** Подсвеченная строка — её выбирает Enter из поля поиска. */
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
};

/** Ручка списка: Enter в поиске выбирает подсвеченный товар. */
export type PosProductResultsHandle = { pick: (index: number) => void };

const attribute = (product: PosProduct, role: string) =>
  product.attributes.find((item) => item.role === role);

const plural = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
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
        bgcolor: selected ? c.accentBg : c.card,
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

/** Строка подписи под названием: артикул одиночного товара либо набор вариантов модели. */
const describe = (item: PosCatalogItem) => {
  const variants = item.variants ?? [];
  const parts: string[] = [];
  if (variants.length <= 1) {
    const sku = variants[0]?.sku;
    if (sku) parts.push(sku);
    const color = item.colors[0]?.label;
    const size = item.sizes[0]?.label;
    if (color) parts.push(color);
    if (size) parts.push(`размер ${size}`);
    return parts.join(" · ");
  }
  if (item.colors.length) parts.push(`${item.colors.length} ${plural(item.colors.length, "цвет", "цвета", "цветов")}`);
  if (item.sizes.length) {
    const labels = item.sizes.slice(0, 5).map((size) => size.label).join(", ");
    parts.push(item.sizes.length > 5 ? `${labels} +${item.sizes.length - 5}` : labels);
  }
  if (!parts.length) parts.push(`${variants.length} ${plural(variants.length, "вариант", "варианта", "вариантов")}`);
  return parts.join(" · ");
};

/**
 * Результаты поиска товара — компактный список названий. Модель с вариантами
 * открывает выбор цвета/размера, одиночный товар сразу ложится в чек.
 */
export const PosProductResults = React.forwardRef<PosProductResultsHandle, Props>(function PosProductResults(
  { items, onAdd, disabled = false, activeIndex = -1, onActiveIndexChange },
  ref
) {
  const theme = useTheme();
  const c = posColors(theme);
  const [selectedItem, setSelectedItem] = React.useState<PosCatalogItem | null>(null);
  const [selectedColorId, setSelectedColorId] = React.useState<string>("");
  const [selectedSizeId, setSelectedSizeId] = React.useState<string>("");
  const [selectedVariantId, setSelectedVariantId] = React.useState<number | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const variants = React.useMemo(() => selectedItem?.variants ?? [], [selectedItem]);
  const hasColors = Boolean(selectedItem?.colors.length);
  const hasSizes = Boolean(selectedItem?.sizes.length);
  /** У вариантов нет ни цвета, ни размера — выбираем их по названию. */
  const plainVariants = Boolean(selectedItem) && !hasColors && !hasSizes;

  const selectedVariant = React.useMemo(() => {
    if (!variants.length) return undefined;
    if (plainVariants) return variants.find((variant) => variant.id === selectedVariantId);
    return variants.find((variant) => {
      const color = attribute(variant, "color");
      const size = attribute(variant, "size");
      return (
        (!hasColors || String(color?.id ?? "") === selectedColorId) &&
        (!hasSizes || String(size?.id ?? "") === selectedSizeId)
      );
    });
  }, [hasColors, hasSizes, plainVariants, selectedColorId, selectedSizeId, selectedVariantId, variants]);

  const openItem = React.useCallback(
    (item: PosCatalogItem) => {
      if (disabled || item.stock === 0) return;
      const family = item.variants ?? [];
      if (family.length <= 1) {
        onAdd(item, family[0]);
        return;
      }
      const first = family.find((variant) => Number(variant.stock) > 0) ?? family[0];
      setSelectedItem(item);
      setSelectedColorId(String(attribute(first, "color")?.id ?? ""));
      setSelectedSizeId(String(attribute(first, "size")?.id ?? ""));
      setSelectedVariantId(first.id);
    },
    [disabled, onAdd]
  );

  React.useImperativeHandle(
    ref,
    () => ({
      pick: (index: number) => {
        const item = items[index];
        if (item) openItem(item);
      },
    }),
    [items, openItem]
  );

  React.useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const closeItem = () => setSelectedItem(null);
  const selectedColor = selectedItem?.colors.find((color) => color.id === selectedColorId);

  const optionSx = (selected: boolean, hasStock: boolean) =>
    ({
      px: 1.25,
      py: 0.9,
      gap: 1,
      borderRadius: `${POS_RADIUS.tile}px`,
      border: `1px solid ${selected ? c.accent : c.hairline}`,
      bgcolor: selected ? c.accentBg : c.tile,
      color: hasStock ? c.text : c.textDim,
      opacity: hasStock ? 1 : 0.45,
    }) as const;

  return (
    <>
      <Box ref={listRef} role="listbox" aria-label="Найденные товары" sx={{ py: "4px" }}>
        {items.map((item, index) => {
          const outOfStock = item.stock === 0;
          const multi = (item.variants?.length ?? 0) > 1;
          const active = index === activeIndex;
          return (
            <ButtonBase
              key={item.id}
              data-index={index}
              role="option"
              aria-selected={active}
              disabled={disabled || outOfStock}
              onMouseEnter={() => onActiveIndexChange?.(index)}
              onClick={() => openItem(item)}
              sx={{
                width: "100%",
                px: "12px",
                py: "8px",
                gap: "12px",
                justifyContent: "flex-start",
                textAlign: "left",
                borderRadius: `${POS_RADIUS.tile}px`,
                bgcolor: active ? c.tile : "transparent",
                "&.Mui-disabled": { opacity: 0.45 },
              }}
            >
              <Stack gap="3px" sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" gap="6px" sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, color: c.text }}>
                    {item.name}
                  </Typography>
                  {item.brand ? <PosBrandBadge brand={item.brand} /> : null}
                </Stack>
                <Typography noWrap sx={{ fontSize: 12, lineHeight: 1.2, color: c.textDim }}>
                  {describe(item) || " "}
                </Typography>
              </Stack>
              <Stack alignItems="flex-end" gap="3px" sx={{ flexShrink: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.25, color: c.text, whiteSpace: "nowrap" }}>
                  <PosAmount value={item.price} />
                </Typography>
                {item.stock !== undefined && (
                  <Typography sx={{ fontSize: 11, lineHeight: 1.2, color: outOfStock ? c.danger : c.textDim, whiteSpace: "nowrap" }}>
                    {outOfStock ? "нет в наличии" : `${item.stock} шт.`}
                  </Typography>
                )}
              </Stack>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: active ? c.accent : c.tile,
                  color: active ? c.onAccent : c.textSoft,
                }}
              >
                {multi ? <ChevronRightOutlined sx={{ fontSize: 18 }} /> : <AddOutlined sx={{ fontSize: 18 }} />}
              </Box>
            </ButtonBase>
          );
        })}
      </Box>

      <Dialog
        open={selectedItem !== null}
        onClose={closeItem}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            m: { xs: 1.5, md: 4 },
            width: { xs: "calc(100% - 24px)", md: undefined },
            borderRadius: `${POS_RADIUS.dialog}px`,
            bgcolor: c.card,
            backgroundImage: "none",
            overflow: "hidden",
          },
        }}
      >
        {selectedItem && (
          <>
            <DialogTitle sx={{ pb: 1.5, pr: 6 }}>
              <Typography fontWeight={800} noWrap>{selectedItem.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {plainVariants ? "Выберите вариант" : hasColors && hasSizes ? "Выберите цвет и размер" : hasColors ? "Выберите цвет" : "Выберите размер"}
              </Typography>
              <IconButton onClick={closeItem} size="small" sx={{ position: "absolute", right: 12, top: 12, color: c.textDim }} aria-label="Закрыть">
                <CloseOutlined fontSize="small" />
              </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ borderColor: c.hairline, py: 2 }}>
              <Stack gap={2}>
                {plainVariants && (
                  <Stack gap={0.75}>
                    {variants.map((variant) => {
                      const hasStock = Number(variant.stock) > 0;
                      const selected = variant.id === selectedVariantId;
                      return (
                        <ButtonBase
                          key={variant.id}
                          disabled={!hasStock}
                          onClick={() => setSelectedVariantId(variant.id)}
                          sx={{ ...optionSx(selected, hasStock), justifyContent: "space-between" }}
                        >
                          <Typography variant="body2" fontWeight={700} noWrap>{variant.name}</Typography>
                          <Typography variant="caption" color="text.secondary" whiteSpace="nowrap">
                            <PosAmount value={Number(variant.price)} /> · {hasStock ? `${Number(variant.stock)} шт.` : "нет"}
                          </Typography>
                        </ButtonBase>
                      );
                    })}
                  </Stack>
                )}

                {hasColors && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                      Цвет{selectedColor ? ` · ${selectedColor.label}` : ""}
                    </Typography>
                    <Stack direction="row" gap={0.75} flexWrap="wrap">
                      {selectedItem.colors.map((color) => {
                        const hasStock = variants.some(
                          (variant) => String(attribute(variant, "color")?.id ?? "") === color.id && Number(variant.stock) > 0
                        );
                        const selected = selectedColorId === color.id;
                        return (
                          <ButtonBase
                            key={color.id}
                            disabled={!hasStock}
                            onClick={() => {
                              setSelectedColorId(color.id);
                              const matchingSize = variants.find(
                                (variant) =>
                                  String(attribute(variant, "color")?.id ?? "") === color.id &&
                                  String(attribute(variant, "size")?.id ?? "") === selectedSizeId &&
                                  Number(variant.stock) > 0
                              );
                              if (!matchingSize) {
                                const firstSize = variants.find(
                                  (variant) => String(attribute(variant, "color")?.id ?? "") === color.id && Number(variant.stock) > 0
                                );
                                setSelectedSizeId(String(attribute(firstSize ?? variants[0], "size")?.id ?? ""));
                              }
                            }}
                            sx={optionSx(selected, hasStock)}
                          >
                            <PosColorDot hex={color.hex} size={16} />
                            <Typography variant="body2" fontWeight={700}>{color.label}</Typography>
                            {selected && <CheckOutlined sx={{ fontSize: 16, color: c.accentText }} />}
                          </ButtonBase>
                        );
                      })}
                    </Stack>
                  </Box>
                )}

                {hasSizes && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                      Размер
                    </Typography>
                    <Stack direction="row" gap={0.75} flexWrap="wrap">
                      {selectedItem.sizes.map((size) => {
                        const matching = variants.find(
                          (variant) =>
                            (!hasColors || String(attribute(variant, "color")?.id ?? "") === selectedColorId) &&
                            String(attribute(variant, "size")?.id ?? "") === size.id
                        );
                        const hasStock = Boolean(matching && Number(matching.stock) > 0);
                        const selected = selectedSizeId === size.id;
                        return (
                          <ButtonBase
                            key={size.id}
                            disabled={!hasStock}
                            onClick={() => setSelectedSizeId(size.id)}
                            sx={{
                              ...optionSx(selected, hasStock),
                              minWidth: 52,
                              textDecoration: hasStock ? "none" : "line-through",
                            }}
                          >
                            <Typography variant="body2" fontWeight={800}>{size.label}</Typography>
                          </ButtonBase>
                        );
                      })}
                    </Stack>
                  </Box>
                )}

                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ p: 1.25, borderRadius: `${POS_RADIUS.tile}px`, bgcolor: c.tile }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {selectedVariant && Number(selectedVariant.stock) > 0 ? `В наличии: ${Number(selectedVariant.stock)} шт.` : "Выберите доступный вариант"}
                  </Typography>
                  <Typography fontWeight={800}><PosAmount value={Number(selectedVariant?.price ?? selectedItem.price)} /></Typography>
                </Stack>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 2.5, py: 1.5 }}>
              <Button onClick={closeItem} color="inherit">Отмена</Button>
              <Button
                variant="contained"
                disabled={disabled || !selectedVariant || Number(selectedVariant.stock) <= 0}
                onClick={() => {
                  onAdd(selectedItem, selectedVariant);
                  closeItem();
                }}
                sx={{ minWidth: 160, borderRadius: `${POS_RADIUS.control}px` }}
              >
                Добавить в чек
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
});

/** Старое имя — им пользуется макетная страница `PosPage`. */
export const PosProductCards = PosProductResults;
