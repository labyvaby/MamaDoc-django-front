import React, { useRef, useEffect } from "react";
import { Box, Stack, Typography, IconButton, useTheme } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import dayjs from "dayjs";

export type DateNavigationProps = {
    date: string;
    setDate: (date: string) => void;
    dayCounts?: Record<string, number>;
};

export const DateNavigation: React.FC<DateNavigationProps> = ({
    date,
    setDate,
    dayCounts = {},
}) => {
    const theme = useTheme();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const dateRefs = useRef<Map<string, HTMLElement>>(new Map());

    // Автоцентрирование выбранной даты
    useEffect(() => {
        const container = scrollContainerRef.current;
        const activeElement = dateRefs.current.get(date);

        if (container && activeElement) {
            const containerWidth = container.clientWidth;
            const elementLeft = activeElement.offsetLeft;
            const elementWidth = activeElement.clientWidth;

            const scrollPosition = elementLeft - (containerWidth / 2) + (elementWidth / 2);

            container.scrollTo({
                left: scrollPosition,
                behavior: 'smooth'
            });
        }
    }, [date]);

    return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
            {/* Скроллируемый список дней (freemode) */}
            <Box
                ref={scrollContainerRef}
                onMouseDown={(e) => {
                    const container = scrollContainerRef.current;
                    if (!container) return;

                    // Prevent text selection during drag
                    e.preventDefault();

                    const startX = e.pageX;
                    const scrollLeft = container.scrollLeft;
                    let hasMoved = false;

                    const handleMouseMove = (moveEvent: MouseEvent) => {
                        hasMoved = true;
                        const x = moveEvent.pageX;
                        const walk = (startX - x) * 1.5; // Smooth drag coefficient
                        container.scrollLeft = scrollLeft + walk;
                    };

                    const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                        container.style.cursor = 'grab';

                        // Allow click if not dragged
                        if (!hasMoved) {
                            setTimeout(() => { hasMoved = false; }, 0);
                        }
                    };

                    container.style.cursor = 'grabbing';
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                }}
                sx={{
                    flex: 1,
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    '&::-webkit-scrollbar': { display: 'none' },
                    scrollbarWidth: 'none',
                    WebkitOverflowScrolling: 'touch',
                    cursor: 'grab',
                    userSelect: 'none',
                    '&:active': {
                        cursor: 'grabbing'
                    }
                }}
            >
                <Stack direction="row" spacing={1}>
                    {/* Генерируем дни: от -7 до +7 от текущей даты */}
                    {Array.from({ length: 15 }, (_, i) => i - 7).map((offset) => {
                        const d = dayjs(date).add(offset, 'day');
                        const weekdays = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
                        const months = ['янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'ноя.', 'дек.'];
                        const dateStr = d.format('YYYY-MM-DD');
                        const isActive = dateStr === date;

                        return (
                            <Box
                                key={offset}
                                ref={(el: HTMLElement | null) => {
                                    if (el) {
                                        dateRefs.current.set(dateStr, el);
                                    } else {
                                        dateRefs.current.delete(dateStr);
                                    }
                                }}
                                onClick={(e) => {
                                    // Prevent click if dragging
                                    if (scrollContainerRef.current?.style.cursor === 'grabbing') {
                                        e.stopPropagation();
                                        return;
                                    }
                                    setDate(dateStr);
                                }}
                                sx={(theme) => ({
                                    minWidth: 100, // Уменьшил немного ширину для компактности в шапке
                                    [theme.breakpoints.down(505)]: {
                                        minWidth: 80,
                                    },
                                    flexShrink: 0,
                                    bgcolor: isActive ? 'primary.main' : 'action.hover',
                                    color: isActive ? 'primary.contrastText' : 'text.secondary',
                                    borderRadius: `${theme.shape.borderRadius}px`,
                                    py: 1, // Уменьшил высоту для шапки
                                    px: 1,
                                    [theme.breakpoints.down(505)]: {
                                        py: 0.75,
                                        px: 0.5,
                                    },
                                    cursor: 'pointer',
                                    border: isActive ? '2px solid' : '1px solid',
                                    borderColor: isActive ? 'primary.dark' : 'divider',
                                    boxShadow: isActive ? 1 : 0,
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    '&:hover': {
                                        bgcolor: isActive ? 'primary.main' : 'action.selected',
                                        transform: isActive ? 'none' : 'translateY(-1px)',
                                        boxShadow: isActive ? 1 : 1
                                    }
                                })}
                            >
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Typography
                                        variant="body2"
                                        fontWeight={isActive ? 700 : 400}
                                        sx={(theme) => ({
                                            fontSize: '0.8rem', // Уменьшил шрифт
                                            [theme.breakpoints.down(505)]: {
                                                fontSize: '0.75rem',
                                            },
                                            lineHeight: 1.1,
                                            textAlign: 'left'
                                        })}
                                    >
                                        {d.date()} {months[d.month()]}, {weekdays[d.day()]}
                                    </Typography>
                                    {dayCounts[dateStr] > 0 && (
                                        <Box
                                            sx={(theme) => ({
                                                width: 18, // Уменьшил счетчик
                                                height: 18,
                                                borderRadius: '50%',
                                                bgcolor: isActive ? 'primary.dark' : (theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300'),
                                                color: isActive ? 'primary.contrastText' : 'text.primary',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.65rem',
                                                fontWeight: 'bold',
                                                flexShrink: 0
                                            })}
                                        >
                                            {dayCounts[dateStr]}
                                        </Box>
                                    )}
                                </Stack>
                            </Box>
                        );
                    })}
                </Stack>
            </Box>

            {/* Кнопка сброса к сегодняшнему дню */}
            {(() => {
                const t = new Date();
                const yyyy = t.getFullYear();
                const mm = String(t.getMonth() + 1).padStart(2, "0");
                const dd = String(t.getDate()).padStart(2, "0");
                const today = `${yyyy}-${mm}-${dd}`;
                const isToday = date === today;

                if (isToday) return null;

                return (
                    <IconButton
                        onClick={() => {
                            setDate(today);
                        }}
                        size="small"
                        sx={{
                            flexShrink: 0,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                            '&:hover': {
                                bgcolor: 'action.selected',
                                transform: 'rotate(90deg)'
                            },
                            transition: 'all 0.2s ease-in-out',
                            width: 32,
                            height: 32
                        }}
                        title="Сегодня"
                    >
                        <CloseOutlined fontSize="small" sx={{ color: 'text.secondary' }} />
                    </IconButton>
                );
            })()}
        </Stack>
    );
};
