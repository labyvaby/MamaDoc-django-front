/**
 * «Бронирования» (шахматка) — номера по строкам, даты по столбцам, бар = бронь;
 * его длина — число ночей. Это другая ось, чем у обычной шахматки смен
 * (ScheduleDayTimeline/ScheduleWeekResourceGrid остаются нетронутыми и
 * работают как прежде для всех остальных организаций — часы одного дня, не
 * ночи на несколько дат).
 *
 * Реальные данные (src/api/hotel.ts, GET /hotel/calendar/) — категории
 * (группировка строк + бейдж «люкс»), номера (со state уборки) и плоские
 * позиции броней; см. hotel-viva-frontend-api.md §4.3. Черновики
 * (reservationStatus: "draft") приходят, но номер не занимают — рисуются
 * пунктиром. Подпись бара зависит от его ширины: имя гостя, в узком баре —
 * инициалы, в совсем узком — одна буква (roomBookingBars.ts); иконки статуса на
 * барах нет — статус виден по цвету и в подсказке. Даты листаются горизонтально в
 * обе стороны и подгружаются кусками
 * по 60 дней (лимит бэка на запрос — 62): первый грузится сразу, соседние —
 * когда прокрутка подходит к левому или правому краю (useInfiniteQuery, см.
 * CHUNK_DAYS и MAX_CHUNKS ниже). Стрелки «‹ ›» прокручивают на неделю,
 * «Сегодня» возвращает к текущей дате. Масштаб +/- в углу над шапкой — сколько
 * дней помещается в ширину окна (7…60), без похода на бэк за каждый клик —
 * см. ZOOM_LEVELS ниже. Красная линия на колонке сегодняшнего дня — «сейчас»,
 * как в расписании клиники.
 *
 * Клик по номеру открывает RoomDetailsDialog (тариф, вместимость,
 * доступность), клик по бару — ReservationDetailsDialog (реальные детали
 * брони). Свободные ячейки — «быстрая бронь»: нажатие мыши — дата «от»,
 * протяжка по строке номера подсвечивает ночи, отпускание — дата «до»
 * (простой клик — одна ночь; выделение не тянется через чужие брони, Esc —
 * отмена, см. roomBookingSelection.ts). requestQuickBooking (мок-стор, чисто
 * UI-хендофф между независимыми компонентами тулбара — данные в нём не
 * хранятся) кладёт номер+даты, CreateBookingButton подписан и открывает форму
 * с уже подставленными Номер/Заезд/Выезд.
 */
import React from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { getCalendar, type HotelCalendarItem, type HotelCalendarRoom } from "../api/hotel";
import { useNowMinute } from "../pages/schedule/django/useNowMinute";
import { useHotelProperty } from "./useHotelProperty";
import {
  mapStayDisplayStatus,
  hotelStayStatusColor,
  hotelRoomStateColor,
  HOTEL_ROOM_STATE_LABELS,
  HOTEL_STAY_STATUS_LABELS,
  HOTEL_STAY_STATUSES,
} from "./hotelDisplay";
import {
  getSelectedHotelDate,
  setSelectedHotelDate,
  subscribeSelectedHotelDate,
  requestQuickBooking,
  nightsBetween,
  formatHotelDateRange,
  MONTH_NOM_RU,
  WEEKDAY_SHORT_RU,
} from "./mockDemoData";
import { barLabelMode, barLabelText } from "./roomBookingBars";
import { clampSelectionEnd, selectionBounds } from "./roomBookingSelection";
import { RoomDetailsDialog } from "./RoomDetailsDialog";
import { ReservationDetailsDialog } from "./ReservationDetailsDialog";

/**
 * Даты подгружаются кусками по CHUNK_DAYS дней (лимит бэка на один запрос
 * календаря — 62): первый кусок (номер 0, от «сегодня − 2») грузится сразу,
 * соседние — когда прокрутка подходит к левому или правому краю
 * (LOAD_MORE_THRESHOLD_PX). В памяти держим не больше MAX_CHUNKS кусков
 * (≈ год): дальше окно скользит — с одной стороны кусок добавляется, с
 * противоположной самый дальний отбрасывается (maxPages), и число колонок в DOM
 * не растёт, сколько ни листай. Колонки рисуем только для загруженных кусков —
 * иначе незагруженные дни выглядели бы «свободными».
 */
const CHUNK_DAYS = 60;
const MAX_CHUNKS = 6;
const LOAD_MORE_THRESHOLD_PX = 600;
/**
 * Шаги масштаба — сколько дней помещается в ширину окна: от «1 неделя»
 * (детальнее) до 60. Остальные загруженные дни — правее, за горизонтальной
 * прокруткой; масштаб меняет только ширину колонки и не ходит на бэк.
 */
const ZOOM_LEVELS = [7, 14, 21, 30, 35, 40, 45, 60];
/**
 * Ширина левой колонки с номерами: номер (3–4 знака), значок «люкс» и точка состояния.
 * Она же — ширина угла над шапкой с масштабом «− 40 дн. +», поэтому меньше ~90 px не
 * делаем. Вычитается из ширины окна при расчёте ширины колонки дня.
 */
const ROOM_COL_WIDTH = 92;
/**
 * Минимальная ширина колонки дня: при мелком масштабе на узком окне колонки не
 * сжимаются до нечитаемых полосок вместо номеров/статусов, а уходят в прокрутку.
 */
const MIN_DAY_COL_WIDTH = 20;

/** Однотонный полупрозрачный слой поверх непрозрачного фона (градиент из одного цвета). */
const tintOver = (color: string) => `linear-gradient(${color}, ${color})`;

type RowPlan = { kind: "category"; label: string } | { kind: "room"; room: HotelCalendarRoom };

export const RoomBookingGrid: React.FC = () => {
  const theme = useTheme();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const [windowStart, setWindowStart] = React.useState<Dayjs>(() =>
    dayjs().subtract(2, "day").startOf("day"),
  );
  const [selectedRoomId, setSelectedRoomId] = React.useState<number | null>(null);
  const [selectedReservationId, setSelectedReservationId] = React.useState<number | null>(null);
  // Общий с HotelOccupancyBanner стор — клик по числу ниже сразу двигает
  // карточки «Загрузка»/«Гости» сверху страницы.
  const selectedDate = React.useSyncExternalStore(subscribeSelectedHotelDate, getSelectedHotelDate);
  // Индекс в ZOOM_LEVELS — по умолчанию последний (60 дней), то же поведение,
  // что было раньше с фиксированным NUM_DAYS: оба месяца видны сразу.
  const [zoomIndex, setZoomIndex] = React.useState(ZOOM_LEVELS.length - 1);
  const numVisibleDays = ZOOM_LEVELS[zoomIndex];
  const canZoomIn = zoomIndex > 0;
  const canZoomOut = zoomIndex < ZOOM_LEVELS.length - 1;

  const windowStartStr = windowStart.format("YYYY-MM-DD");
  // Один запрос = один кусок в CHUNK_DAYS дней; pageParam — номер куска
  // относительно windowStart: 0 — первый, отрицательные — прошлое, положительные —
  // будущее. Ключ с префиксом ["hotel","calendar"], поэтому любые
  // invalidateQueries по нему перечитывают все уже загруженные куски (с их
  // номерами — окно при этом не «уезжает»).
  const queryClient = useQueryClient();
  const calendarQuery = useInfiniteQuery({
    queryKey: ["hotel", "calendar", property?.id, windowStartStr],
    queryFn: ({ pageParam, signal }) => {
      const start = windowStart.add(pageParam * CHUNK_DAYS, "day");
      return getCalendar(
        {
          propertyId: property!.id,
          from: start.format("YYYY-MM-DD"),
          to: start.add(CHUNK_DAYS - 1, "day").format("YYYY-MM-DD"),
        },
        signal,
      );
    },
    initialPageParam: 0,
    getNextPageParam: (_last, _pages, lastParam) => lastParam + 1,
    getPreviousPageParam: (_first, _pages, firstParam) => firstParam - 1,
    maxPages: MAX_CHUNKS,
    enabled: property != null,
  });
  const pages = calendarQuery.data?.pages;
  // Номера и категории одинаковы во всех кусках — берём из первого.
  const calendar = pages?.[0];
  const loadedChunks = pages?.length ?? 0;
  // Куски идут подряд, поэтому начало сетки — по номеру самого левого из них. В типах
  // TanStack pageParams — unknown[]; номера куска задаём только мы (числа).
  const firstChunkIdx = calendarQuery.data?.pageParams[0] as number | undefined;
  const gridStart = React.useMemo(
    () => windowStart.add((firstChunkIdx ?? 0) * CHUNK_DAYS, "day"),
    [windowStart, firstChunkIdx],
  );

  // Колонки — только для уже загруженных кусков; ширина колонки зависит от масштаба (ниже).
  const dates = React.useMemo(
    () => Array.from({ length: loadedChunks * CHUNK_DAYS }, (_, i) => gridStart.add(i, "day")),
    [gridStart, loadedChunks],
  );

  const roomTypes = calendar?.roomTypes ?? [];
  const ROWS: RowPlan[] = React.useMemo(() => {
    if (!calendar) return [];
    return calendar.roomTypes.flatMap((rt) => [
      { kind: "category" as const, label: rt.name },
      ...calendar.rooms.filter((r) => r.roomTypeId === rt.id).map((room) => ({ kind: "room" as const, room })),
    ]);
  }, [calendar]);

  // Бронь, которая пересекает границу кусков, приходит в обоих — склеиваем по itemId.
  const allItems = React.useMemo(() => {
    const seen = new Set<number>();
    const out: HotelCalendarItem[] = [];
    for (const page of pages ?? []) {
      for (const it of page.items) {
        if (seen.has(it.itemId)) continue;
        seen.add(it.itemId);
        out.push(it);
      }
    }
    return out;
  }, [pages]);

  const itemsByRoomId = React.useMemo(() => {
    const map = new Map<number, HotelCalendarItem[]>();
    for (const it of allItems) {
      if (it.roomId == null) continue;
      const arr = map.get(it.roomId) ?? [];
      arr.push(it);
      map.set(it.roomId, arr);
    }
    return map;
  }, [allItems]);

  // ── Ширина колонки и подгрузка при прокрутке ────────────────────────────────
  // Масштаб = сколько дней помещается в ширину окна, поэтому ширину колонки
  // считаем из измеренной ширины прокручиваемой обёртки (ResizeObserver), а не
  // отдаём на откуп 1fr: лишние загруженные дни должны уходить за край, в прокрутку.
  // Элемент обёртки — в state (callback-ref), потому что рисуется только после
  // ранних return ниже (спиннер/ошибки).
  const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    if (!scrollEl) return;
    const update = () => setViewportWidth(scrollEl.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);
  const dayColWidth =
    viewportWidth > 0 ? Math.max(MIN_DAY_COL_WIDTH, (viewportWidth - ROOM_COL_WIDTH) / numVisibleDays) : MIN_DAY_COL_WIDTH;

  // Выделение периода зажатием мыши (подробнее — ниже, у startSelection). Объявлено
  // здесь: пока идёт протяжка, подгрузку кусков откладываем — индексы выделения
  // это позиции в dates, а слева или справа они сдвинулись бы.
  const [dragSel, setDragSel] = React.useState<{
    roomId: number;
    roomNumber: string;
    startIdx: number;
    endIdx: number;
  } | null>(null);

  // День у левого края области дат — в днях от windowStart (0 = windowStart, «сегодня − 2»).
  // Запоминаем именно дату, а не пиксели: пиксельная позиция «уплывает», когда слева
  // добавляется/справа отбрасывается кусок, меняется масштаб или ширина окна, а дата
  // остаётся той же — по ней scrollLeft и восстанавливается (эффект ниже).
  const leftDayRef = React.useRef(0);
  const firstIdx = firstChunkIdx ?? 0;
  React.useLayoutEffect(() => {
    if (!scrollEl || firstChunkIdx == null || viewportWidth === 0) return;
    const target = (leftDayRef.current - firstChunkIdx * CHUNK_DAYS) * dayColWidth;
    if (Math.abs(scrollEl.scrollLeft - target) > 1) scrollEl.scrollLeft = target;
  }, [scrollEl, firstChunkIdx, dayColWidth, viewportWidth]);

  const {
    hasNextPage,
    hasPreviousPage,
    isFetching,
    isFetchingNextPage,
    isFetchingPreviousPage,
    isFetchNextPageError,
    isFetchPreviousPageError,
    fetchNextPage,
    fetchPreviousPage,
  } = calendarQuery;
  const loadMoreIfNeeded = React.useCallback(() => {
    // Пока идёт другой запрос (в том числе фоновое перечитывание после действий с
    // бронью) новый не начинаем: fetchNextPage/fetchPreviousPage по умолчанию
    // отменяют запрос в полёте. После его завершения этот колбэк меняется, и эффект
    // ниже проверяет края заново.
    if (!scrollEl || isFetching || dragSel) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollEl;
    if (hasNextPage && !isFetchNextPageError && scrollWidth - scrollLeft - clientWidth < LOAD_MORE_THRESHOLD_PX) {
      void fetchNextPage();
    } else if (hasPreviousPage && !isFetchPreviousPageError && scrollLeft < LOAD_MORE_THRESHOLD_PX) {
      void fetchPreviousPage();
    }
  }, [
    scrollEl,
    isFetching,
    dragSel,
    hasNextPage,
    hasPreviousPage,
    isFetchNextPageError,
    isFetchPreviousPageError,
    fetchNextPage,
    fetchPreviousPage,
  ]);
  const handleScroll = () => {
    if (scrollEl && dayColWidth > 0) leftDayRef.current = firstIdx * CHUNK_DAYS + scrollEl.scrollLeft / dayColWidth;
    loadMoreIfNeeded();
  };
  // Не только по скроллу: при крупном окне и мелком масштабе все загруженные дни
  // могут уместиться без прокрутки — тогда соседний кусок нужен сразу; при первом
  // показе слева вообще нечего прокручивать (scrollLeft = 0), поэтому кусок в
  // прошлом подгружается сам, а позиция удерживается на «сегодня − 2». После
  // каждой загрузки проверяем края снова.
  React.useEffect(() => {
    loadMoreIfNeeded();
  }, [loadMoreIfNeeded, loadedChunks, dayColWidth, firstChunkIdx]);

  // Красная линия «сейчас» — как в расписании клиники (ScheduleDayTimeline): на
  // колонке сегодняшнего дня, по времени суток; обновляется раз в минуту.
  const now = useNowMinute();
  const nowFraction = (now.hour() * 60 + now.minute()) / 1440;

  const today = dayjs().startOf("day");
  const todayIdx = dates.findIndex((d) => d.isSame(today, "day"));

  // Подписи месяцев над днями (row 1) — соседние даты одного месяца схлопываются в одну ячейку.
  const monthSpans: Array<{ label: string; startCol: number; span: number }> = [];
  dates.forEach((d, i) => {
    const label = `${MONTH_NOM_RU[d.month()]} ${d.year()}`;
    const last = monthSpans[monthSpans.length - 1];
    if (last && last.label === label) last.span += 1;
    else monthSpans.push({ label, startCol: i, span: 1 });
  });

  // ── Выделение периода зажатием мыши (быстрая бронь) ─────────────────────────
  // «От» — нажатие на свободной ячейке, «до» — отпускание; простой клик — одна
  // ночь, как раньше. Ячейка = ночь: выделенные ячейки и есть ночи брони,
  // выезд — день после последней. Диапазон живёт в одной строке-номере и не
  // тянется через чужие брони (roomBookingSelection.ts). Хуки — выше ранних
  // return (Rules of Hooks). Само состояние dragSel объявлено выше, рядом с
  // подгрузкой кусков.

  // Слушатели на window и только пока идёт выделение: кнопку можно отпустить
  // где угодно, не только над сеткой. useLayoutEffect и перерегистрация на каждое
  // изменение диапазона — чтобы mouseup всегда видел актуальный endIdx, а не
  // значение из прошлого рендера.
  React.useLayoutEffect(() => {
    if (!dragSel) return;
    const finish = () => {
      setDragSel(null);
      const [lo, hi] = selectionBounds(dragSel.startIdx, dragSel.endIdx);
      requestQuickBooking(
        dragSel.roomNumber,
        dates[lo].format("YYYY-MM-DD"),
        dates[hi].add(1, "day").format("YYYY-MM-DD"),
      );
    };
    const cancel = () => setDragSel(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("mouseup", finish);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("mouseup", finish);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", cancel);
    };
  }, [dragSel, dates]);

  const startSelection = (e: React.MouseEvent, room: HotelCalendarRoom, idx: number) => {
    if (e.button !== 0) return;
    // Без этого протяжка выделяла бы текст и уводила фокус с ячейки.
    e.preventDefault();
    setDragSel({ roomId: room.id, roomNumber: room.number, startIdx: idx, endIdx: idx });
  };

  const extendSelection = (roomId: number, hoverIdx: number, free: readonly boolean[]) =>
    setDragSel((cur) => {
      if (!cur || cur.roomId !== roomId) return cur;
      const endIdx = clampSelectionEnd(free, cur.startIdx, hoverIdx);
      return endIdx === cur.endIdx ? cur : { ...cur, endIdx };
    });

  // Подсказка в тулбаре, пока идёт выделение: номер, период и число ночей.
  const dragHint = (() => {
    if (!dragSel) return null;
    const [lo, hi] = selectionBounds(dragSel.startIdx, dragSel.endIdx);
    const checkIn = dates[lo].format("YYYY-MM-DD");
    const checkOut = dates[hi].add(1, "day").format("YYYY-MM-DD");
    return `№${dragSel.roomNumber}: ${formatHotelDateRange(checkIn, checkOut)} · ${nightsBetween(checkIn, checkOut)} ноч.`;
  })();

  if (propertyLoading || calendarQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 4 }}>
        <CircularProgress size={28} />
      </Stack>
    );
  }
  if (!property) {
    return <Alert severity="warning">Для этого филиала не найден объект размещения (property).</Alert>;
  }
  // Только когда данных нет совсем: провал подгрузки следующего куска (или фонового
  // перечитывания) status ставит в error, но уже показанную сетку прятать незачем.
  if (calendarQuery.isError && !calendarQuery.data) {
    return <Alert severity="error">Не удалось загрузить бронирования.</Alert>;
  }

  // Стрелки «‹ ›»: плавно на неделю; если край рядом, соседний кусок подгрузится сам.
  const scrollByDays = (days: number) => scrollEl?.scrollBy({ left: days * dayColWidth, behavior: "smooth" });
  const goToToday = () => {
    setSelectedHotelDate(dayjs().format("YYYY-MM-DD"));
    const anchor = dayjs().subtract(2, "day").startOf("day");
    const idx = anchor.diff(gridStart, "day");
    if (scrollEl && idx >= 0 && idx < dates.length) {
      scrollEl.scrollTo({ left: idx * dayColWidth, behavior: "smooth" });
      return;
    }
    // Окно уехало далеко от сегодняшнего дня — начинаем с чистого листа: первый
    // кусок снова от «сегодня − 2» (сбрасываем и запрос, если ключ не изменился).
    leftDayRef.current = 0;
    setWindowStart(anchor);
    void queryClient.resetQueries({
      queryKey: ["hotel", "calendar", property?.id, anchor.format("YYYY-MM-DD")],
      exact: true,
    });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
      <Stack direction="row" alignItems="center" gap={0.5}>
        <IconButton size="small" onClick={() => scrollByDays(-7)} aria-label="Неделя назад">
          <ChevronLeftOutlined fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => scrollByDays(7)} aria-label="Неделя вперёд">
          <ChevronRightOutlined fontSize="small" />
        </IconButton>
        <Box
          component="button"
          onClick={goToToday}
          sx={{
            font: "inherit",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "primary.main",
            border: 0,
            bgcolor: "transparent",
            cursor: "pointer",
            px: 1,
          }}
        >
          Сегодня
        </Box>
        {dragHint && (
          <Typography variant="caption" color="primary.main" fontWeight={600} sx={{ ml: 1 }}>
            {dragHint}
          </Typography>
        )}
        {(isFetchingNextPage || isFetchingPreviousPage) && (
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ ml: "auto", pr: 1 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">
              Подгружаем даты…
            </Typography>
          </Stack>
        )}
        {(isFetchNextPageError || isFetchPreviousPageError) && (
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ ml: "auto", pr: 1 }}>
            <Typography variant="caption" color="warning.main">
              Не удалось подгрузить {isFetchNextPageError ? "следующие" : "предыдущие"} даты
            </Typography>
            <Button size="small" onClick={() => void (isFetchNextPageError ? fetchNextPage() : fetchPreviousPage())}>
              Повторить
            </Button>
          </Stack>
        )}
      </Stack>

      <Box
        ref={setScrollEl}
        onScroll={handleScroll}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "14px",
          overflow: "auto",
          maxHeight: 440,
          // Позицию при добавлении кусков слева выставляем сами (leftDayRef); встроенная
          // «якорная» прокрутка браузера сдвигала бы её второй раз.
          overflowAnchor: "none",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `${ROOM_COL_WIDTH}px repeat(${dates.length}, ${dayColWidth}px)`,
            width: ROOM_COL_WIDTH + dates.length * dayColWidth,
            // Пока тянем период, браузер не должен выделять текст под курсором.
            userSelect: dragSel ? "none" : undefined,
          }}
        >
          {/* Угол над шапкой — sticky по обеим осям, перекрывает содержимое под собой при
              скролле; раньше пустовал, теперь несёт масштаб +/- (7 дней … 2 месяца). */}
          <Box
            sx={{
              gridRow: "1 / 3",
              gridColumn: 1,
              position: "sticky",
              left: 0,
              top: 0,
              zIndex: 3,
              bgcolor: "background.paper",
              borderRight: 1,
              borderBottom: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 0.25,
            }}
          >
            <Tooltip title="Показывать больше дней в ширину окна (до 60)">
              <span>
                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))} disabled={!canZoomOut}>
                  <RemoveOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 30, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
              {numVisibleDays} дн.
            </Typography>
            <Tooltip title="Показывать меньше дней в ширину окна (до 1 недели)">
              <span>
                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setZoomIndex((i) => Math.max(0, i - 1))} disabled={!canZoomIn}>
                  <AddOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          {monthSpans.map((m) => (
            <Box
              key={`${m.label}-${m.startCol}`}
              sx={{
                gridRow: 1,
                gridColumn: `${m.startCol + 2} / ${m.startCol + 2 + m.span}`,
                position: "sticky",
                top: 0,
                zIndex: 2,
                bgcolor: "background.paper",
                borderBottom: 1,
                borderColor: "divider",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 26,
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {m.label}
              </Typography>
            </Box>
          ))}

          {dates.map((d, i) => {
            const dateStr = d.format("YYYY-MM-DD");
            const isToday = i === todayIdx;
            const isSelected = dateStr === selectedDate;
            const isWeekend = d.day() === 0 || d.day() === 6;
            return (
              <Box
                key={dateStr}
                component="button"
                type="button"
                onClick={() => setSelectedHotelDate(dateStr)}
                title={
                  isToday
                    ? `Сегодня, сейчас ${now.format("HH:mm")} — показать загрузку и гостей на эту дату`
                    : "Показать загрузку и гостей на эту дату"
                }
                sx={{
                  gridRow: 2,
                  gridColumn: i + 2,
                  position: "sticky",
                  top: 26,
                  zIndex: 2,
                  bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.14) : "background.paper",
                  borderRight: 1,
                  borderBottom: 1,
                  borderColor: "divider",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  py: 0.5,
                  font: "inherit",
                  border: 0,
                  cursor: "pointer",
                  "&:hover": { bgcolor: isSelected ? undefined : alpha(theme.palette.primary.main, 0.06) },
                }}
              >
                <Typography
                  variant="body2"
                  fontWeight={isSelected ? 700 : 500}
                  color={isSelected ? "primary.main" : isWeekend ? "text.secondary" : "text.primary"}
                >
                  {d.date()}
                </Typography>
                <Stack direction="row" alignItems="center" gap={0.375}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                    {WEEKDAY_SHORT_RU[(d.day() + 6) % 7]}
                  </Typography>
                  {/* Отдельная от выбора отметка «сегодня» — не гасится кликом по другой дате. */}
                  {isToday && (
                    <Box
                      sx={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        bgcolor: isSelected ? "primary.main" : "text.disabled",
                      }}
                    />
                  )}
                </Stack>
                {/* Стрелка-указатель «сейчас» на нижней кромке шапки — та же, что в расписании клиники;
                    дальше вниз её продолжает красная линия поверх строк (ниже). */}
                {isToday && (
                  <Box
                    sx={{
                      position: "absolute",
                      left: `${nowFraction * 100}%`,
                      top: "100%",
                      transform: "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: "5px solid transparent",
                      borderRight: "5px solid transparent",
                      borderTop: `6px solid ${theme.palette.error.main}`,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </Box>
            );
          })}

          {/* Категории/номера + фоновые ячейки сетки под барами */}
          {ROWS.map((row, rowIdx) => {
            const gridRow = rowIdx + 3;
            if (row.kind === "category") {
              return (
                <Box
                  key={row.label}
                  sx={{
                    gridRow,
                    gridColumn: "1 / -1",
                    bgcolor: theme.palette.mode === "dark" ? alpha("#fff", 0.04) : alpha("#000", 0.03),
                    borderBottom: 1,
                    borderColor: "divider",
                    px: 1.5,
                    display: "flex",
                    alignItems: "center",
                    height: 28,
                    position: "sticky",
                    left: 0,
                  }}
                >
                  <Typography variant="caption" fontWeight={600} color="text.secondary">
                    {row.label}
                  </Typography>
                </Box>
              );
            }
            const room = row.room;
            const luxury = roomTypes.find((rt) => rt.id === room.roomTypeId)?.isLuxury;
            const stateColor = hotelRoomStateColor(room.state, theme);
            const roomItems = itemsByRoomId.get(room.id) ?? [];
            return (
              <React.Fragment key={room.id}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setSelectedRoomId(room.id)}
                  title="Показать детали номера"
                  sx={{
                    gridRow,
                    gridColumn: 1,
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                    // Фон колонки номеров — непрозрачный: под ней при прокрутке проезжают бары
                    // (в том числе из прошлого слева), и полупрозрачный оттенок «люкса» их просвечивал
                    // бы. Оттенок и подсветка наведения — градиентом поверх бумажного фона.
                    bgcolor: "background.paper",
                    backgroundImage: luxury ? tintOver(alpha("#d4af37", theme.palette.mode === "dark" ? 0.14 : 0.1)) : undefined,
                    borderRight: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    px: 1,
                    height: 44,
                    font: "inherit",
                    color: "inherit",
                    border: 0,
                    textAlign: "left",
                    cursor: "pointer",
                    "&:hover": { backgroundImage: tintOver(alpha(theme.palette.primary.main, 0.08)) },
                  }}
                >
                  {luxury && (
                    <WorkspacePremiumOutlined
                      sx={{ fontSize: 16, color: theme.palette.mode === "dark" ? "#e9c766" : "#8a6d1a" }}
                    />
                  )}
                  <Typography variant="body2" fontWeight={600} noWrap sx={{ minWidth: 0 }}>
                    {room.number}
                  </Typography>
                  <Tooltip title={`Статус номера: ${HOTEL_ROOM_STATE_LABELS[room.state as keyof typeof HOTEL_ROOM_STATE_LABELS] ?? room.state}`}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: stateColor,
                        ml: "auto",
                        flexShrink: 0,
                      }}
                    />
                  </Tooltip>
                </Box>
                {(() => {
                  // Черновики (reservationStatus: "draft") номер не занимают — только подтверждённые/hold считаются на занятость.
                  const occupying = roomItems.filter((it) => it.reservationStatus !== "draft");
                  // Свободна ли каждая видимая ночь — и для рисования ячеек, и чтобы выделение не тянулось через чужую бронь.
                  const freeMask = dates.map((d) => {
                    const dateStr = d.format("YYYY-MM-DD");
                    return !occupying.some((it) => dateStr >= it.checkIn && dateStr < it.checkOut);
                  });
                  const selection =
                    dragSel && dragSel.roomId === room.id ? selectionBounds(dragSel.startIdx, dragSel.endIdx) : null;
                  return dates.map((d, i) => {
                    const dateStr = d.format("YYYY-MM-DD");
                    const isFree = freeMask[i];
                    const inSelection = selection != null && i >= selection[0] && i <= selection[1];
                    return (
                      <Box
                        key={`${room.id}-${dateStr}`}
                        component={isFree ? "button" : "div"}
                        type={isFree ? "button" : undefined}
                        // Мышь: нажатие — «от», отпускание (обработчик на window) — «до».
                        onMouseDown={isFree ? (e: React.MouseEvent) => startSelection(e, room, i) : undefined}
                        onMouseEnter={dragSel ? () => extendSelection(room.id, i, freeMask) : undefined}
                        // Клавиатура (Enter/Space на ячейке) даёт click с detail === 0 — одна ночь;
                        // click от мыши (detail ≥ 1) уже обработан нажатием/отпусканием выше.
                        onClick={
                          isFree
                            ? (e: React.MouseEvent) => {
                                if (e.detail === 0) requestQuickBooking(room.number, dateStr);
                              }
                            : undefined
                        }
                        title={
                          isFree
                            ? `Быстрая бронь — №${room.number}, ${d.format("D MMMM")}. Клик — одна ночь, зажмите и протяните — период`
                            : undefined
                        }
                        sx={{
                          gridRow,
                          gridColumn: i + 2,
                          height: 44,
                          borderRight: 1,
                          borderBottom: 1,
                          borderColor: "divider",
                          border: 0,
                          font: "inherit",
                          p: 0,
                          textAlign: "left",
                          cursor: isFree ? "pointer" : "default",
                          bgcolor: inSelection
                            ? alpha(theme.palette.primary.main, 0.34)
                            : i === todayIdx
                            ? alpha(theme.palette.primary.main, 0.06)
                            : d.day() === 0 || d.day() === 6
                            ? theme.palette.action.hover
                            : "transparent",
                          "&:hover": isFree && !inSelection ? { bgcolor: alpha(theme.palette.primary.main, 0.12) } : undefined,
                        }}
                      />
                    );
                  });
                })()}
              </React.Fragment>
            );
          })}

          {/* Бары броней — та же сетка, поверх фоновых ячеек по порядку в DOM */}
          {ROWS.map((row, rowIdx) => {
            if (row.kind !== "room") return null;
            const gridRow = rowIdx + 3;
            const roomItems = itemsByRoomId.get(row.room.id) ?? [];
            return roomItems.map((it) => {
              const rawStart = dayjs(it.checkIn).diff(gridStart, "day");
              const rawEnd = dayjs(it.checkOut).diff(gridStart, "day");
              const startCol = Math.max(0, rawStart);
              const endCol = Math.min(dates.length, rawEnd);
              if (endCol <= startCol) return null;
              const status = mapStayDisplayStatus(it.stayStatus);
              const color = it.isOverbooking ? theme.palette.warning.main : hotelStayStatusColor(status, theme);
              const nights = nightsBetween(it.checkIn, it.checkOut);
              const isDraft = it.reservationStatus === "draft";
              const textColor = theme.palette.mode === "dark" ? "#fff" : color;
              const label = it.customerName || `Бронь №${it.reservationNumber}`;
              // Ширина бара — колонки × ширина дня минус отступы по 3 px. Чем уже бар, тем
              // короче подпись: имя → инициалы → одна буква (полное имя — в подсказке бара).
              const labelMode = barLabelMode((endCol - startCol) * dayColWidth - 6);
              return (
                <Box
                  key={it.itemId}
                  component="button"
                  type="button"
                  onClick={() => setSelectedReservationId(it.reservationId)}
                  title={`${label} · №${row.room.number} · ${nights} ноч. · ${HOTEL_STAY_STATUS_LABELS[status]}${it.isOverbooking ? " · Овербукинг" : ""} — показать бронь`}
                  sx={{
                    gridRow,
                    gridColumn: `${startCol + 2} / ${endCol + 2}`,
                    alignSelf: "center",
                    height: 28,
                    mx: "3px",
                    px: labelMode === "name" ? 1 : 0,
                    borderRadius: "8px",
                    bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.3 : 0.16),
                    border: isDraft ? "1px dashed" : "1px solid",
                    borderColor: alpha(color, 0.6),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: labelMode === "name" ? "flex-start" : "center",
                    overflow: "hidden",
                    font: "inherit",
                    cursor: "pointer",
                    "&:hover": { borderColor: color },
                  }}
                >
                  <Typography variant="caption" noWrap sx={{ color: textColor, fontWeight: 600 }}>
                    {barLabelText(labelMode, it.customerName, it.reservationNumber)}
                  </Typography>
                </Box>
              );
            });
          })}

          {/* Красная линия «сейчас»: один элемент на все строки колонки сегодняшнего дня, после
              баров в DOM — значит поверх них и поверх полос категорий (не рвётся). Ниже sticky-
              шапки и колонки номеров по z-index, а pointerEvents: none пропускает клики и
              протяжку периода сквозь неё к ячейкам. */}
          {todayIdx >= 0 && ROWS.length > 0 && (
            <Box
              sx={{
                gridColumn: todayIdx + 2,
                gridRow: `3 / ${ROWS.length + 3}`,
                position: "relative",
                pointerEvents: "none",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${nowFraction * 100}%`,
                  ml: "-1px",
                  width: "2px",
                  bgcolor: "error.main",
                  opacity: 0.85,
                }}
              />
            </Box>
          )}
        </Box>
      </Box>

      <Stack direction="row" gap={2} flexWrap="wrap">
        {HOTEL_STAY_STATUSES.map((status) => {
          const color = hotelStayStatusColor(status, theme);
          return (
            <Stack key={status} direction="row" alignItems="center" gap={0.5}>
              {/* Образец бара — та же заливка и рамка, что у брони этого статуса (иконок на барах нет). */}
              <Box
                sx={{
                  width: 16,
                  height: 10,
                  borderRadius: "3px",
                  bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.3 : 0.16),
                  border: "1px solid",
                  borderColor: alpha(color, 0.6),
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {HOTEL_STAY_STATUS_LABELS[status]}
              </Typography>
            </Stack>
          );
        })}
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: theme.palette.warning.main }} />
          <Typography variant="caption" color="text.secondary">
            Овербукинг
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: theme.palette.success.main }} />
          <Typography variant="caption" color="text.secondary">
            Точка у номера — статус уборки
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Быстрая бронь: клик по свободной ячейке — одна ночь, зажмите и протяните — несколько ночей
        </Typography>
      </Stack>

      <RoomDetailsDialog
        roomId={selectedRoomId}
        roomTypes={roomTypes}
        onClose={() => setSelectedRoomId(null)}
        onReservationClick={(id) => {
          setSelectedRoomId(null);
          setSelectedReservationId(id);
        }}
      />
      <ReservationDetailsDialog reservationId={selectedReservationId} onClose={() => setSelectedReservationId(null)} />
    </Box>
  );
};

export default RoomBookingGrid;
