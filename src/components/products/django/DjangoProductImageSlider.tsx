import React from "react";
import { Box, ButtonBase, IconButton, Typography, alpha } from "@mui/material";
import KeyboardArrowLeftOutlined from "@mui/icons-material/KeyboardArrowLeftOutlined";
import KeyboardArrowRightOutlined from "@mui/icons-material/KeyboardArrowRightOutlined";

import type { DjangoProductImage } from "../../../api/warehouse";

/**
 * Слайдер фотографий товара в карточке просмотра.
 *
 * Раньше здесь была одна большая картинка и ряд миниатюр под ней: чтобы
 * посмотреть все фото, приходилось целиться в квадратик 56×56, а на телефоне
 * миниатюры переносились на вторую строку и уезжали за экран. Слайдер листается
 * стрелками, свайпом и клавиатурой; миниатюры остались как быстрый переход.
 *
 * Порядок слайдов задаёт вызывающая сторона — сортировать здесь нельзя, иначе
 * миниатюры и слайды разъедутся.
 */

const SWIPE_THRESHOLD = 40;

type Props = {
    /** Галерея товара, уже отсортированная по order. */
    images: DjangoProductImage[];
    /** Основное фото товара — подставляется, если галерея пустая. */
    fallbackUrl?: string | null;
    /** Название товара: alt для изображений и буква для заглушки. */
    name: string;
};

export const DjangoProductImageSlider: React.FC<Props> = ({ images, fallbackUrl, name }) => {
    const slides = React.useMemo(() => {
        if (images.length) return images.map((image) => ({ key: String(image.id), url: image.url }));
        return fallbackUrl ? [{ key: "primary", url: fallbackUrl }] : [];
    }, [images, fallbackUrl]);

    const [index, setIndex] = React.useState(0);
    const touchStartX = React.useRef<number | null>(null);

    // Набор слайдов сменился (выбрали другой товар или удалили фото) — иначе
    // остались бы на индексе, которого больше нет, и экран был бы пустым.
    React.useEffect(() => {
        setIndex((current) => (current < slides.length ? current : 0));
    }, [slides.length]);

    const count = slides.length;
    const go = React.useCallback(
        (next: number) => {
            if (count === 0) return;
            setIndex(((next % count) + count) % count);
        },
        [count],
    );

    const frameSx = {
        position: "relative" as const,
        width: "100%",
        aspectRatio: "1/1",
        borderRadius: "14px",
        overflow: "hidden",
        border: 1,
        borderColor: "divider",
        // Именно action.hover, без alpha(): action.hover — уже полупрозрачный
        // rgba, и alpha() не умножает прозрачность, а перебивает её. Прежний
        // alpha(action.hover, .5) давал светло-серую заливку — под Avatar с
        // object-fit: cover её не было видно, а под contain она лезет в глаза
        // полями по бокам вертикальных фото.
        bgcolor: "action.hover",
    };

    if (!count) {
        return (
            <Box sx={{ ...frameSx, display: "grid", placeItems: "center" }}>
                <Typography variant="h3" color="text.secondary">
                    {name.charAt(0)}
                </Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Box
                sx={frameSx}
                tabIndex={0}
                role="group"
                aria-roledescription="карусель"
                aria-label={`Фотографии товара ${name}`}
                onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") { event.preventDefault(); go(index - 1); }
                    if (event.key === "ArrowRight") { event.preventDefault(); go(index + 1); }
                }}
                onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
                onTouchEnd={(event) => {
                    const start = touchStartX.current;
                    touchStartX.current = null;
                    if (start == null) return;
                    const delta = event.changedTouches[0].clientX - start;
                    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
                    go(delta < 0 ? index + 1 : index - 1);
                }}
            >
                <Box
                    sx={{
                        display: "flex",
                        height: "100%",
                        transform: `translateX(-${index * 100}%)`,
                        transition: "transform .3s cubic-bezier(.4,0,.2,1)",
                        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
                    }}
                >
                    {slides.map((slide, slideIndex) => (
                        <Box
                            key={slide.key}
                            component="img"
                            src={slide.url}
                            alt={count > 1 ? `${name} — фото ${slideIndex + 1} из ${count}` : name}
                            loading={slideIndex === 0 ? undefined : "lazy"}
                            sx={{
                                flex: "0 0 100%",
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                            }}
                        />
                    ))}
                </Box>

                {count > 1 && (
                    <>
                        <SliderArrow side="left" onClick={() => go(index - 1)} />
                        <SliderArrow side="right" onClick={() => go(index + 1)} />
                        <Box
                            sx={{
                                position: "absolute",
                                top: 10,
                                right: 10,
                                px: 1,
                                py: 0.25,
                                borderRadius: "999px",
                                fontSize: 12,
                                fontVariantNumeric: "tabular-nums",
                                color: "#fff",
                                bgcolor: alpha("#000", 0.55),
                                backdropFilter: "blur(4px)",
                                pointerEvents: "none",
                            }}
                        >
                            {index + 1} / {count}
                        </Box>
                    </>
                )}
            </Box>

            {count > 1 && (
                <Box
                    sx={{
                        display: "flex",
                        gap: 1,
                        mt: 1.5,
                        overflowX: "auto",
                        pb: 0.5,
                        // Полоса прокрутки под миниатюрами шумит сильнее, чем помогает:
                        // ряд короткий, и его целиком видно.
                        scrollbarWidth: "none",
                        "&::-webkit-scrollbar": { display: "none" },
                    }}
                >
                    {slides.map((slide, slideIndex) => (
                        <ButtonBase
                            key={slide.key}
                            onClick={() => go(slideIndex)}
                            aria-label={`Показать фото ${slideIndex + 1}`}
                            aria-current={slideIndex === index}
                            sx={{
                                flex: "0 0 auto",
                                width: 56,
                                height: 56,
                                borderRadius: "10px",
                                overflow: "hidden",
                                border: 2,
                                borderColor: slideIndex === index ? "primary.main" : "divider",
                                opacity: slideIndex === index ? 1 : 0.65,
                                transition: "opacity .15s, border-color .15s",
                                "&:hover": { opacity: 1 },
                            }}
                        >
                            <Box
                                component="img"
                                src={slide.url}
                                alt=""
                                loading="lazy"
                                sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                        </ButtonBase>
                    ))}
                </Box>
            )}
        </Box>
    );
};

const SliderArrow: React.FC<{ side: "left" | "right"; onClick: () => void }> = ({ side, onClick }) => (
    <IconButton
        onClick={onClick}
        aria-label={side === "left" ? "Предыдущее фото" : "Следующее фото"}
        size="small"
        sx={{
            position: "absolute",
            top: "50%",
            transform: "translateY(-50%)",
            [side]: 8,
            color: "#fff",
            bgcolor: alpha("#000", 0.45),
            backdropFilter: "blur(4px)",
            "&:hover": { bgcolor: alpha("#000", 0.65) },
        }}
    >
        {side === "left" ? <KeyboardArrowLeftOutlined /> : <KeyboardArrowRightOutlined />}
    </IconButton>
);

export default DjangoProductImageSlider;
