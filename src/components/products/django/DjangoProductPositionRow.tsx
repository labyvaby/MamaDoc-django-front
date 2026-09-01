import React from "react";
import { Avatar, Box, ButtonBase, Typography, alpha } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import KeyboardArrowRightOutlined from "@mui/icons-material/KeyboardArrowRightOutlined";

import { productAvailableStock, type DjangoProduct } from "../../../api/warehouse";
import { MONO, swatchOf, useProductTones } from "../../../theme/productTokens";
import type { PositionAxis, ProductPosition } from "./productPositions";

/**
 * Строка каталога — позиция, а не SKU. Раскрывается в свой разрез: сетку по
 * двум осям, список по одной, или просто варианты, если атрибутов у товара нет.
 *
 * Оформление намеренно повторяет «Свойства товара»: те же токены ролей,
 * образцы 19px, чипы значений моноширинным. Экраны должны читаться как один.
 */

const money = (value: number): string => value.toLocaleString("ru-RU");

const Pill: React.FC<{ tone?: string; children: React.ReactNode }> = ({ tone, children }) => (
    <Box
        component="span"
        sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            px: "9px",
            py: "3px",
            borderRadius: "999px",
            fontSize: 11.5,
            lineHeight: 1.5,
            fontWeight: tone ? 500 : 400,
            whiteSpace: "nowrap",
            border: 1,
            borderColor: tone ? alpha(tone, 0.38) : "divider",
            bgcolor: tone ? alpha(tone, 0.12) : "transparent",
            color: tone ?? "text.disabled",
        }}
    >
        {children}
    </Box>
);

const ValueChip: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({ children, muted }) => {
    const tones = useProductTones();
    return (
        <Box
            component="span"
            sx={{
                fontFamily: MONO,
                fontSize: 11,
                lineHeight: 1.5,
                px: "7px",
                py: "2px",
                borderRadius: "6px",
                bgcolor: tones.soft2,
                color: muted ? "text.disabled" : "text.secondary",
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </Box>
    );
};

const Swatch: React.FC<{ value: string; size?: number }> = ({ value, size = 19 }) => {
    const theme = useTheme();
    const ring = theme.palette.mode === "dark" ? alpha("#FFFFFF", 0.22) : alpha("#0B0A10", 0.18);
    return (
        <Box
            component="span"
            title={value}
            sx={{
                width: size,
                height: size,
                borderRadius: "6px",
                flex: "none",
                bgcolor: swatchOf(value),
                boxShadow: `inset 0 0 0 1px ${ring}`,
            }}
        />
    );
};

const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography
        sx={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "text.disabled",
        }}
    >
        {children}
    </Typography>
);

type VariantRowProps = {
    variant: ProductPosition["variants"][number];
    axes: PositionAxis[];
    /** Скрыть первое значение: оно уже в заголовке группы. */
    skipFirst: boolean;
    basePrice: number;
    unit: string;
    selected: boolean;
    highlighted: boolean;
    onSelect: () => void;
};

const VariantRow: React.FC<VariantRowProps> = ({
    variant,
    axes,
    skipFirst,
    basePrice,
    unit,
    selected,
    highlighted,
    onSelect,
}) => {
    const theme = useTheme();
    const tones = useProductTones();
    const stock = productAvailableStock(variant.product);
    const out = stock <= 0;
    const shown = skipFirst ? variant.values.slice(1) : variant.values;
    const shownAxes = skipFirst ? axes.slice(1) : axes;

    return (
        <ButtonBase
            focusRipple
            onClick={onSelect}
            sx={{
                display: "grid",
                gridTemplateColumns: "minmax(96px, auto) minmax(0, 1fr) auto auto",
                gap: "10px",
                alignItems: "center",
                width: "100%",
                textAlign: "left",
                px: "10px",
                py: "7px",
                borderRadius: "8px",
                fontSize: 12.5,
                border: 1,
                borderColor: selected
                    ? "primary.main"
                    : highlighted
                        ? alpha(theme.palette.primary.main, 0.4)
                        : tones.lineSoft,
                bgcolor: highlighted ? alpha(theme.palette.primary.main, 0.06) : "background.paper",
                opacity: out ? 0.62 : 1,
                "&:hover": { borderColor: alpha(theme.palette.primary.main, 0.4) },
            }}
        >
            <Box sx={{ display: "flex", gap: "5px", alignItems: "center", flexWrap: "wrap" }}>
                {shown.length ? (
                    shown.map((value, index) =>
                        shownAxes[index]?.role === "color" ? (
                            <Box key={value} sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Swatch value={value} size={14} />
                                <span>{value}</span>
                            </Box>
                        ) : (
                            <ValueChip key={value}>{value}</ValueChip>
                        ),
                    )
                ) : (
                    <span>{variant.label}</span>
                )}
            </Box>
            <Box
                component="span"
                sx={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: "text.disabled",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {variant.product.barcode || variant.product.sku || "—"}
            </Box>
            <Box
                component="span"
                sx={{
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    color: variant.product.price !== basePrice ? tones.role.size : "text.primary",
                }}
            >
                {money(variant.product.price)}
            </Box>
            <Box sx={{ minWidth: 76, textAlign: "right" }}>
                {out ? (
                    <Pill tone={tones.danger}>нет</Pill>
                ) : (
                    <Box component="span" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {stock} {unit}
                    </Box>
                )}
            </Box>
        </ButtonBase>
    );
};

export type DjangoProductPositionRowProps = {
    position: ProductPosition;
    open: boolean;
    onToggle: () => void;
    selectedProductId: number | null;
    onSelectProduct: (product: DjangoProduct) => void;
    /** Варианты, совпавшие с поиском, — подсвечиваем их внутри позиции. */
    highlighted: Set<number>;
};

export const DjangoProductPositionRow: React.FC<DjangoProductPositionRowProps> = ({
    position,
    open,
    onToggle,
    selectedProductId,
    onSelectProduct,
    highlighted,
}) => {
    const theme = useTheme();
    const tones = useProductTones();
    const spread = position.priceMin !== position.priceMax;
    const colorAxis = position.axes.find((axis) => axis.role === "color");
    const selectedInside = position.variants.some(
        (variant) => variant.product.id === selectedProductId,
    );

    const priceLabel = spread
        ? `${money(position.priceMin)} – ${money(position.priceMax)}`
        : money(position.priceMin);

    const breakdown = () => {
        // Две оси и больше — группируем по первой, чтобы 24 варианта не легли
        // одной простынёй. Одна ось или её отсутствие — просто список.
        if (position.axes.length > 1) {
            const first = position.axes[0];
            return first.values.map((value) => {
                const rows = position.variants.filter((variant) => variant.values[0] === value);
                if (!rows.length) return null;
                return (
                    <Box key={value} sx={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: "8px", mt: "4px" }}>
                            {first.role === "color" && <Swatch value={value} size={14} />}
                            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{value}</Typography>
                        </Box>
                        {rows.map((variant) => (
                            <VariantRow
                                key={variant.product.id}
                                variant={variant}
                                axes={position.axes}
                                skipFirst
                                basePrice={position.priceMin}
                                unit={position.unit}
                                selected={variant.product.id === selectedProductId}
                                highlighted={highlighted.has(variant.product.id)}
                                onSelect={() => onSelectProduct(variant.product)}
                            />
                        ))}
                    </Box>
                );
            });
        }
        return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {position.axes[0] && <GroupLabel>{position.axes[0].name}</GroupLabel>}
                {position.variants.map((variant) => (
                    <VariantRow
                        key={variant.product.id}
                        variant={variant}
                        axes={position.axes}
                        skipFirst={false}
                        basePrice={position.priceMin}
                        unit={position.unit}
                        selected={variant.product.id === selectedProductId}
                        highlighted={highlighted.has(variant.product.id)}
                        onSelect={() => onSelectProduct(variant.product)}
                    />
                ))}
            </Box>
        );
    };

    return (
        <Box
            sx={{
                border: 1,
                borderColor: open || selectedInside ? alpha(theme.palette.primary.main, 0.4) : "divider",
                borderRadius: "12px",
                bgcolor: "background.paper",
                overflow: "hidden",
                transition: "border-color .16s",
            }}
        >
            <ButtonBase
                focusRipple
                onClick={() => (position.single ? onSelectProduct(position.variants[0].product) : onToggle())}
                sx={{
                    display: "grid",
                    gridTemplateColumns: "36px minmax(0, 1fr) auto",
                    gap: "10px",
                    alignItems: "center",
                    width: "100%",
                    textAlign: "left",
                    p: "12px 13px",
                    "&:hover": { bgcolor: tones.soft },
                }}
            >
                <Avatar
                    variant="rounded"
                    src={position.imageUrl || undefined}
                    sx={{
                        width: 36,
                        height: 36,
                        borderRadius: "9px",
                        bgcolor: tones.soft2,
                        color: "text.disabled",
                        fontSize: 14,
                        fontWeight: 600,
                    }}
                >
                    {position.name.charAt(0)}
                </Avatar>

                <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>
                            {position.name}
                        </Typography>
                        {!position.single && (
                            <Pill tone={tones.matrix}>{position.variants.length} SKU</Pill>
                        )}
                        {spread && <Pill tone={tones.role.size}>цены различаются</Pill>}
                        {position.outCount > 0 && (
                            <Pill tone={tones.danger}>
                                нет: {position.outCount} из {position.variants.length}
                            </Pill>
                        )}
                    </Box>
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: "7px",
                            flexWrap: "wrap",
                            mt: "4px",
                            fontSize: 11.5,
                            color: "text.disabled",
                        }}
                    >
                        {colorAxis && (
                            <>
                                <Box sx={{ display: "flex", gap: "4px" }}>
                                    {colorAxis.values.slice(0, 6).map((value) => (
                                        <Swatch key={value} value={value} size={14} />
                                    ))}
                                </Box>
                                <span>·</span>
                            </>
                        )}
                        {position.category && (
                            <>
                                <span>{position.category}</span>
                                <span>·</span>
                            </>
                        )}
                        {position.axes.length ? (
                            <span>
                                разрез:{" "}
                                <Box component="b" sx={{ color: "text.secondary", fontWeight: 500 }}>
                                    {position.axes.map((axis) => axis.name).join(" × ")}
                                </Box>
                            </span>
                        ) : (
                            <span>без разрезов</span>
                        )}
                        <span>·</span>
                        <span>{position.unit}</span>
                    </Box>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: "12px", flex: "none" }}>
                    <Box sx={{ textAlign: "right" }}>
                        <GroupLabel>Цена</GroupLabel>
                        <Box
                            sx={{
                                fontWeight: 600,
                                fontVariantNumeric: "tabular-nums",
                                whiteSpace: "nowrap",
                                color: spread ? tones.role.size : "text.primary",
                            }}
                        >
                            {priceLabel}
                            <Box component="span" sx={{ fontWeight: 400, color: "text.disabled", ml: "3px", fontSize: "0.85em" }}>
                                сом
                            </Box>
                        </Box>
                    </Box>
                    <Box sx={{ textAlign: "right", display: { xs: "none", sm: "block" } }}>
                        <GroupLabel>Остаток</GroupLabel>
                        <Box sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                            {position.stock}
                            <Box component="span" sx={{ fontWeight: 400, color: "text.disabled", ml: "3px", fontSize: "0.85em" }}>
                                {position.unit}
                            </Box>
                        </Box>
                    </Box>
                    {position.single ? (
                        <Box sx={{ width: 18 }} />
                    ) : (
                        <KeyboardArrowRightOutlined
                            sx={{
                                fontSize: 18,
                                color: "text.disabled",
                                transform: open ? "rotate(90deg)" : "none",
                                transition: "transform .18s",
                                "@media (prefers-reduced-motion: reduce)": { transition: "none" },
                            }}
                        />
                    )}
                </Box>
            </ButtonBase>

            {open && !position.single && (
                <Box
                    sx={{
                        borderTop: 1,
                        borderColor: tones.lineSoft,
                        bgcolor: tones.soft,
                        p: "10px 13px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "5px",
                    }}
                >
                    {breakdown()}
                </Box>
            )}
        </Box>
    );
};

export default DjangoProductPositionRow;
