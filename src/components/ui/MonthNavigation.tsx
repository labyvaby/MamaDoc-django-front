import React, { useRef, useEffect } from "react";
import { Box, Stack, Typography, IconButton, useTheme } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import dayjs from "dayjs";

export type MonthNavigationProps = {
    date: string; // ISO format or YYYY-MM-DD
    setDate: (date: string) => void;
    /** Optional set of 'YYYY-MM' month keys that have data. If provided, months not in this set are hidden. */
    activeMonths?: Set<string> | null;
};

export const MonthNavigation: React.FC<MonthNavigationProps> = ({
    date,
    setDate,
    activeMonths,
}) => {
    const theme = useTheme();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const monthRefs = useRef<Map<string, HTMLElement>>(new Map());

    const selectedMonth = dayjs(date).startOf('month').format('YYYY-MM');

    // Автоцентрирование выбранного месяца
    useEffect(() => {
        const container = scrollContainerRef.current;
        const activeElement = monthRefs.current.get(selectedMonth);

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
    }, [selectedMonth]);

    const months = [
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];

    return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
            <Box
                ref={scrollContainerRef}
                onMouseDown={(e) => {
                    const container = scrollContainerRef.current;
                    if (!container) return;
                    e.preventDefault();
                    const startX = e.pageX;
                    const scrollLeft = container.scrollLeft;
                    let hasMoved = false;

                    const handleMouseMove = (moveEvent: MouseEvent) => {
                        hasMoved = true;
                        const x = moveEvent.pageX;
                        const walk = (startX - x) * 1.5;
                        container.scrollLeft = scrollLeft + walk;
                    };

                    const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                        container.style.cursor = 'grab';
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
                    {/* Генерируем 12 месяцев вокруг текущего (6 до, 6 после) */}
                    {Array.from({ length: 13 }, (_, i) => i - 6).map((offset) => {
                        const d = dayjs(date).startOf('month').add(offset, 'month');
                        const monthKey = d.format('YYYY-MM');
                        const isActive = monthKey === selectedMonth;

                        // Hide months with no data (but ALWAYS show currently selected month)
                        if (activeMonths && !isActive && !activeMonths.has(monthKey)) {
                            return null;
                        }

                        return (
                            <Box
                                key={offset}
                                ref={(el: HTMLElement | null) => {
                                    if (el) {
                                        monthRefs.current.set(monthKey, el);
                                    } else {
                                        monthRefs.current.delete(monthKey);
                                    }
                                }}
                                onClick={(e) => {
                                    if (scrollContainerRef.current?.style.cursor === 'grabbing') {
                                        e.stopPropagation();
                                        return;
                                    }
                                    setDate(d.format('YYYY-MM-DD'));
                                }}
                                sx={(theme) => ({
                                    minWidth: 120,
                                    [theme.breakpoints.down(505)]: {
                                        minWidth: 100,
                                    },
                                    flexShrink: 0,
                                    bgcolor: isActive ? 'primary.main' : 'action.hover',
                                    color: isActive ? 'primary.contrastText' : 'text.secondary',
                                    borderRadius: `${theme.shape.borderRadius}px`,
                                    py: 1,
                                    px: 1,
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
                                <Typography
                                    variant="body2"
                                    fontWeight={isActive ? 700 : 400}
                                    sx={{ fontSize: '0.85rem' }}
                                >
                                    {months[d.month()]} {d.year()}
                                </Typography>
                            </Box>
                        );
                    })}
                </Stack>
            </Box>

            {/* Кнопка сброса к текущему месяцу */}
            {(() => {
                const today = dayjs().startOf('month').format('YYYY-MM');
                const isCurrentMonth = selectedMonth === today;
                if (isCurrentMonth) return null;

                return (
                    <IconButton
                        onClick={() => {
                            setDate(dayjs().format('YYYY-MM-DD'));
                        }}
                        size="small"
                        sx={{
                            flexShrink: 0,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                            width: 32,
                            height: 32
                        }}
                        title="Текущий месяц"
                    >
                        <CloseOutlined fontSize="small" sx={{ color: 'text.secondary' }} />
                    </IconButton>
                );
            })()}
        </Stack>
    );
};
