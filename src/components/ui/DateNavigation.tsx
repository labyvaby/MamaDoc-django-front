import React, { useRef, useEffect } from "react";
import {
    Box,
    Button,
    Stack,
    Typography,
    IconButton,
    useMediaQuery,
    useTheme,
    alpha,
} from "@mui/material";
import TodayOutlined from "@mui/icons-material/TodayOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
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
    // Телефон попадает в sm (в теме проекта sm = 360), поэтому граница — md.
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const dateRefs = useRef<Map<string, HTMLElement>>(new Map());

    // Лента показывает лишь ±7 дней вокруг выбранной даты, поэтому запись,
    // созданную на месяц вперёд, скроллом не достать — прыжок на произвольную
    // дату даёт календарь (иконка справа от ленты).
    const [pickerOpen, setPickerOpen] = React.useState(false);
    const calendarButtonRef = useRef<HTMLButtonElement>(null);

    // Автоцентрирование выбранной даты
    const didCenterRef = useRef(false);
    const centerActiveDate = React.useCallback((smooth: boolean) => {
        const container = scrollContainerRef.current;
        const activeElement = dateRefs.current.get(date);
        if (!container || !activeElement) return;

        const containerWidth = container.clientWidth;
        // На телефоне лента успевает смонтироваться раньше, чем контейнер
        // получает ширину: центрирование считало от нуля и выбранный день
        // оставался за левым краем — там видны прошедшие дни, а «сегодня»
        // приходилось искать скроллом.
        if (containerWidth === 0) return;

        const scrollPosition =
            activeElement.offsetLeft - containerWidth / 2 + activeElement.clientWidth / 2;

        container.scrollTo({ left: scrollPosition, behavior: smooth ? 'smooth' : 'auto' });
        didCenterRef.current = true;
    }, [date]);

    useEffect(() => {
        // Первый показ — без анимации (иначе лента заметно «доезжает» при
        // открытии страницы), смена даты кликом — плавно.
        centerActiveDate(didCenterRef.current);
        const raf = requestAnimationFrame(() => centerActiveDate(false));
        return () => cancelAnimationFrame(raf);
    }, [centerActiveDate]);

    // Поворот телефона и раскрытие сайдбара меняют ширину ленты — выбранный
    // день должен остаться на виду.
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => centerActiveDate(false));
        observer.observe(container);
        return () => observer.disconnect();
    }, [centerActiveDate]);

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
                                    // Широкая пилюля «17 сен., чт» на телефоне
                                    // помещалась втроём — регистратор скроллил
                                    // ленту, чтобы увидеть послезавтра. Ячейка
                                    // календаря (день недели + число) даёт
                                    // неделю целиком.
                                    minWidth: isMobile ? 44 : 100,
                                    ...(isMobile ? { width: 44, height: 54 } : {}),
                                    [theme.breakpoints.down(505)]: isMobile ? {} : { minWidth: 80 },
                                    flexShrink: 0,
                                    bgcolor: isActive ? 'primary.main' : 'action.hover',
                                    color: isActive ? 'primary.contrastText' : 'text.secondary',
                                    borderRadius: isMobile ? '12px' : '10px',
                                    py: isMobile ? 0.5 : 1,
                                    px: isMobile ? 0.25 : 1,
                                    [theme.breakpoints.down(505)]: isMobile ? {} : { py: 0.75, px: 0.5 },
                                    cursor: 'pointer',
                                    border: '1px solid',
                                    // Сегодня заметно и когда открыт другой день:
                                    // на квадратах без этого терялась точка отсчёта.
                                    borderColor: isActive
                                        ? 'primary.main'
                                        : dateStr === dayjs().format('YYYY-MM-DD')
                                            ? alpha(theme.palette.primary.main, 0.55)
                                            : 'divider',
                                    transition: 'background-color .15s ease, border-color .15s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    '&:hover': {
                                        bgcolor: isActive ? 'primary.main' : 'action.selected',
                                        borderColor: isActive ? 'primary.main' : alpha(theme.palette.primary.main, 0.28),
                                    }
                                })}
                            >
                                {isMobile ? (
                                    <Stack spacing={0} alignItems="center" sx={{ width: '100%' }}>
                                        <Typography
                                            sx={{
                                                fontSize: '0.62rem',
                                                lineHeight: 1.1,
                                                opacity: isActive ? 0.85 : 0.7,
                                                textTransform: 'uppercase',
                                                letterSpacing: 0.2,
                                            }}
                                        >
                                            {weekdays[d.day()]}
                                        </Typography>
                                        <Typography
                                            sx={{
                                                fontSize: '0.95rem',
                                                fontWeight: 700,
                                                lineHeight: 1.2,
                                                color: isActive ? 'inherit' : 'text.primary',
                                            }}
                                        >
                                            {d.date()}
                                        </Typography>
                                        {/* Счётчик записей — третьей строкой внутри
                                            квадрата. Угловым бейджем он выходил за
                                            границу ячейки, а лента режет всё, что
                                            вылезает по вертикали (overflowY: hidden),
                                            — цифра оказывалась срезана сверху. Место
                                            под строку держим всегда, даже когда
                                            записей нет: иначе дни прыгали бы по
                                            высоте. */}
                                        <Box
                                            sx={(theme) => ({
                                                height: 13,
                                                mt: '1px',
                                                minWidth: dayCounts[dateStr] > 0 ? 17 : 0,
                                                px: dayCounts[dateStr] > 0 ? 0.375 : 0,
                                                borderRadius: '7px',
                                                bgcolor: dayCounts[dateStr] > 0
                                                    ? (isActive
                                                        ? alpha(theme.palette.common.black, 0.22)
                                                        : theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300')
                                                    : 'transparent',
                                                color: isActive ? 'primary.contrastText' : 'text.primary',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.58rem',
                                                lineHeight: 1,
                                                fontWeight: 700,
                                            })}
                                        >
                                            {dayCounts[dateStr] > 0 ? dayCounts[dateStr] : ''}
                                        </Box>
                                    </Stack>
                                ) : (
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
                                )}
                            </Box>
                        );
                    })}
                </Stack>
            </Box>

            {/* Календарь: переход на любую дату (в т.ч. на месяц вперёд) */}
            <IconButton
                ref={calendarButtonRef}
                onClick={() => setPickerOpen(true)}
                size="small"
                sx={{
                    flexShrink: 0,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'action.selected' },
                    width: 32,
                    height: 32,
                }}
                title="Выбрать дату"
            >
                <CalendarMonthOutlined fontSize="small" sx={{ color: 'text.secondary' }} />
            </IconButton>
            <DatePicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                value={dayjs(date)}
                onChange={(value) => {
                    if (value && value.isValid()) setDate(value.format('YYYY-MM-DD'));
                    setPickerOpen(false);
                }}
                slotProps={{
                    // Поле не нужно — календарь открывается кнопкой и якорится на неё.
                    textField: { sx: { display: 'none' } },
                    popper: { anchorEl: () => calendarButtonRef.current as HTMLElement, placement: 'bottom-end' },
                }}
            />

            {/* Кнопка сброса к сегодняшнему дню */}
            {(() => {
                const t = new Date();
                const yyyy = t.getFullYear();
                const mm = String(t.getMonth() + 1).padStart(2, "0");
                const dd = String(t.getDate()).padStart(2, "0");
                const today = `${yyyy}-${mm}-${dd}`;
                const isToday = date === today;

                if (isToday) return null;

                // Раньше возврат к сегодняшнему дню прятался за крестиком, а ✕
                // читается как «закрыть», а не «вернуться». Подпись словом.
                return (
                    <Button
                        onClick={() => {
                            setDate(today);
                        }}
                        size="small"
                        startIcon={<TodayOutlined sx={{ fontSize: 16 }} />}
                        sx={{
                            flexShrink: 0,
                            minWidth: 'auto',
                            height: 32,
                            px: 1,
                            bgcolor: 'action.hover',
                            color: 'text.secondary',
                            borderRadius: 1,
                            textTransform: 'none',
                            whiteSpace: 'nowrap',
                            '& .MuiButton-startIcon': { mr: 0.5 },
                            '&:hover': { bgcolor: 'action.selected' },
                        }}
                        title="Вернуться к сегодняшнему дню"
                    >
                        Сегодня
                    </Button>
                );
            })()}
        </Stack>
    );
};
