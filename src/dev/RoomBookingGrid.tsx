/**
 * «Бронирования» (шахматка) — номера по строкам, даты по столбцам, бар = бронь;
 * его длина — число ночей. Это другая ось, чем у обычной шахматки смен
 * (ScheduleDayTimeline/ScheduleWeekResourceGrid остаются нетронутыми и
 * работают как прежде для всех остальных организаций — часы одного дня, не
 * ночи на несколько дат).
 *
 * Визуальный стиль (карточка-«доска» с шапкой, тулбар пилюлями, легенда над
 * сеткой, круглая метка «сегодня», левый акцент на баре, строки по этажам) —
 * по образцу макета «Терра» (hotel-32-room-planner, сентябрь 2026, принесён
 * боссом). Демо было проще нашей реальной шахматки (без масштаба, без
 * бесконечной подгрузки дат, без выбора периода мышью, без клавиатуры,
 * без состояния номера) — эти возможности не убирались, только сменилась
 * оболочка.
 *
 * Реальные данные (src/api/hotel.ts, GET /hotel/calendar/) — категории и
 * номера (со state уборки) и плоские позиции броней; см.
 * hotel-viva-frontend-api.md §4.3. Черновики (reservationStatus: "draft")
 * приходят, но номер не занимают — рисуются пунктиром. Подпись бара зависит
 * от его ширины: имя гостя, в узком баре — инициалы, в совсем узком — одна
 * буква (roomBookingBars.ts); иконки статуса на барах нет — статус виден по
 * цвету (плотность заливки, barFillAlpha) и в подсказке. Даты листаются
 * горизонтально в обе стороны и подгружаются кусками по 60 дней (лимит бэка
 * на запрос — 62): первый грузится сразу, соседние — когда прокрутка
 * подходит к левому или правому краю (useInfiniteQuery, см. CHUNK_DAYS и
 * MAX_CHUNKS ниже). Стрелки «‹ ›» прокручивают на неделю, «Сегодня»
 * возвращает к текущей дате. Масштаб +/- в тулбаре — сколько дней помещается
 * в ширину окна (7…60), без похода на бэк за каждый клик — см. ZOOM_LEVELS
 * ниже. Красная линия на колонке сегодняшнего дня — «сейчас», как в
 * расписании клиники.
 *
 * Строки группируются по этажу (HotelCalendarRoom.floor — свободная строка
 * объекта, см. roomBookingFloors.ts), а не по категории: так в макете.
 * Категория при этом не потерялась — она иконкой рядом с номером
 * (roomCategoryIcons.ts, подсказка — точное название категории); люкс
 * по-прежнему выделен короной и золотистым фоном строки.
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
import { Alert, Box, Button, CircularProgress, ClickAwayListener, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import SingleBedOutlined from "@mui/icons-material/SingleBedOutlined";
import ChairOutlined from "@mui/icons-material/ChairOutlined";
import KingBedOutlined from "@mui/icons-material/KingBedOutlined";
import BedOutlined from "@mui/icons-material/BedOutlined";
import RoomPreferencesOutlined from "@mui/icons-material/RoomPreferencesOutlined";
import BedroomParentOutlined from "@mui/icons-material/BedroomParentOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import DoorFrontOutlined from "@mui/icons-material/DoorFrontOutlined";
import CribOutlined from "@mui/icons-material/CribOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import CottageOutlined from "@mui/icons-material/CottageOutlined";
import HolidayVillageOutlined from "@mui/icons-material/HolidayVillageOutlined";
import CastleOutlined from "@mui/icons-material/CastleOutlined";
import HouseOutlined from "@mui/icons-material/HouseOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { Link as RouterLink } from "react-router";

import { getCalendar, type HotelCalendarItem, type HotelCalendarRoom } from "../api/hotel";
import { PAGE_PERMISSIONS } from "../config/accessPermissions";
import { useCan } from "../hooks/useCan";
import { useNowMinute } from "../pages/schedule/django/useNowMinute";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import {
  mapStayDisplayStatus,
  hotelStayStatusColor,
  hotelRoomStateColor,
  formatHotelTime,
  HOTEL_ROOM_STATES,
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
  MONTH_GEN_RU,
  MONTH_NOM_RU,
  WEEKDAY_SHORT_RU,
} from "./mockDemoData";
import { barFillAlpha, barLabelMode, barLabelText } from "./roomBookingBars";
import { clampSelectionEnd, selectionBounds } from "./roomBookingSelection";
import { floorGroupLabel, groupRoomsByFloor, pluralRooms } from "./roomBookingFloors";
import { buildRoomCategoryIconKeys, type RoomCategoryIconKey } from "./roomCategoryIcons";
import { RoomDetailsDialog } from "./RoomDetailsDialog";
import { ReservationDetailsDialog } from "./ReservationDetailsDialog";

/**
 * Даты подгружаются кусками по CHUNK_DAYS дней (лимит бэка на один запрос
 * календаря — 62): первый кусок (номер 0, от «сегодня − 2») грузится сразу,
 * соседние — когда прокрутка подходит к левому или правому краю
 * (LOAD_MORE_THRESHOLD_PX). В памяти держим не больше MAX_CHUNKS кусков:
 * дальше окно скользит — с одной стороны кусок добавляется, с противоположной
 * самый дальний отбрасывается (maxPages). Раньше держали 6 (год данных) —
 * живой аудит (60 номеров) показал реальную проблему не в данных, а в DOM:
 * см. VISIBLE_DAYS_BUFFER ниже, который решает её виртуализацией колонок;
 * MAX_CHUNKS всё равно снижен до 3 (≈полгода) — держать данные на год вперёд
 * незачем даже с виртуализацией, это просто лишняя память и лишние перезапросы
 * при быстрой перемотке.
 */
const CHUNK_DAYS = 60;
const MAX_CHUNKS = 3;
const LOAD_MORE_THRESHOLD_PX = 600;
/**
 * Виртуализация колонок дат — главный фикс из живого аудита («2849
 * кнопок-ячеек на 12 номеров, на 60 номеров в год это было бы 20+ тысяч»,
 * автоматизация браузера дважды подвисала на странице). Рисуем DOM (шапку
 * дат, фоновые ячейки, бары) только для дат в видимой области прокрутки ±
 * этот запас с каждой стороны — остальные загруженные даты числятся в
 * данных (freeMask, подгрузка чанков), но узлов в DOM не создают. Запас в
 * днях, а не в пикселях: при мелком масштабе (много дней в ширину окна)
 * лишние колонки не расползаются на тысячи. Кисти клавиатуры/мыши не знают
 * о виртуализации вовсе: ячейка, до которой можно дотянуться мышью или
 * стрелками, по построению уже видна на экране — то есть уже отрисована.
 */
const VISIBLE_DAYS_BUFFER = 21;
/**
 * Шаги масштаба — сколько дней помещается в ширину окна: от «1 неделя»
 * (детальнее) до 60. Остальные загруженные дни — правее, за горизонтальной
 * прокруткой; масштаб меняет только ширину колонки и не ходит на бэк.
 */
const ZOOM_LEVELS = [7, 14, 21, 30, 35, 40, 45, 50, 55, 60];
/**
 * Ширина левой колонки с номерами: иконка категории, номер (3–4 знака) и точка
 * состояния. Вычитается из ширины окна при расчёте ширины колонки дня.
 */
const ROOM_COL_WIDTH = 92;
/**
 * Минимальная ширина колонки дня: при мелком масштабе на узком окне колонки не
 * сжимаются до нечитаемых полосок вместо номеров/статусов, а уходят в прокрутку.
 */
const MIN_DAY_COL_WIDTH = 20;
/** Ниже этой ширины колонки дня «+» на свободной ячейке уже не помещается читаемо. */
const CELL_PLUS_MIN_WIDTH = 28;

/** Однотонный полупрозрачный слой поверх непрозрачного фона (градиент из одного цвета). */
const tintOver = (color: string) => `linear-gradient(${color}, ${color})`;

/**
 * Плавная прокрутка (стрелки «‹ ›», «Сегодня») — только если пользователь не просил
 * уменьшить анимацию (prefers-reduced-motion): иначе мгновенный переход.
 */
const scrollBehavior = (): ScrollBehavior =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/** Компоненты иконок по ключу из roomCategoryIcons.ts — сам модуль без JSX, для тестов. */
const ROOM_CATEGORY_ICON_COMPONENTS: Record<RoomCategoryIconKey, React.ElementType> = {
  luxury: WorkspacePremiumOutlined,
  singleBed: SingleBedOutlined,
  chair: ChairOutlined,
  kingBed: KingBedOutlined,
  bed: BedOutlined,
  roomPreferences: RoomPreferencesOutlined,
  bedroomParent: BedroomParentOutlined,
  meetingRoom: MeetingRoomOutlined,
  doorFront: DoorFrontOutlined,
  crib: CribOutlined,
  groups: GroupsOutlined,
  cottage: CottageOutlined,
  holidayVillage: HolidayVillageOutlined,
  castle: CastleOutlined,
  house: HouseOutlined,
};

type RowPlan = { kind: "floor"; floor: string; count: number } | { kind: "room"; room: HotelCalendarRoom };

/**
 * Карточка-рамка шахматки («доска» — заголовок «Шахматка номеров», справа —
 * необязательный тулбар) вокруг содержимого. Используется и в рабочем
 * состоянии, и в состояниях загрузки/ошибки/пусто — так рамка не «мигает»
 * между разными обёртками при смене состояния запроса (в этих состояниях
 * actions не передаём, и место справа от заголовка просто пустует).
 *
 * Раньше рядом с заголовком был подзаголовок с месяцем/годом — брался из
 * monthSpans[0], то есть из самого ЛЕВОГО загруженного куска дат, а не из
 * того, что видно после прокрутки: после скролла показывал не тот месяц.
 * Корректная подпись месяца уже есть внутри самой сетки (строка над датами,
 * едет вместе с прокруткой) — здесь её просто убрали как лишнюю и неверную.
 * Освободившееся место справа теперь занимает тулбар (период/масштаб) — он
 * раньше был отдельной строкой над сеткой и просто добавлял высоту.
 */
const BoardShell: React.FC<{ actions?: React.ReactNode; children: React.ReactNode }> = ({ actions, children }) => (
  <Paper elevation={0} variant="outlined" sx={{ borderRadius: "14px", overflow: "hidden" }}>
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      flexWrap="wrap"
      gap={1}
      sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}
    >
      <Typography variant="subtitle1" fontWeight={700}>
        Шахматка номеров
      </Typography>
      {actions}
    </Stack>
    <Box sx={{ p: 2 }}>{children}</Box>
  </Paper>
);

/**
 * Красная метка и линия «сейчас». Свой минутный тик: раньше useNowMinute жил в
 * самой шахматке, и каждую минуту перерисовывались все её ячейки.
 */
const NowBadge: React.FC = () => {
  const theme = useTheme();
  const now = useNowMinute();
  const fraction = (now.hour() * 60 + now.minute()) / 1440;
  return (
    <Box
      sx={{
        position: "absolute",
        left: `${fraction * 100}%`,
        top: "100%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      <Typography
        sx={{
          px: 0.5,
          borderRadius: "4px",
          bgcolor: "error.main",
          color: "error.contrastText",
          fontSize: "0.62rem",
          fontWeight: 700,
          lineHeight: 1.35,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {now.format("HH:mm")}
      </Typography>
      <Box
        sx={{
          width: 0,
          height: 0,
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: `6px solid ${theme.palette.error.main}`,
        }}
      />
    </Box>
  );
};

const NowLine: React.FC = () => {
  const now = useNowMinute();
  const fraction = (now.hour() * 60 + now.minute()) / 1440;
  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: `${fraction * 100}%`,
        ml: "-1px",
        width: "2px",
        bgcolor: "error.main",
        opacity: 0.85,
      }}
    />
  );
};

interface GridDialogsHandle {
  openRoom: (roomId: number) => void;
  openReservation: (reservationId: number) => void;
}

/**
 * Модалки номера и брони. Состояние «что открыто» живёт здесь, а не в
 * шахматке: клик по номеру раньше перерисовывал всю сетку (тысячи ячеек), и
 * на слабом компьютере модалка появлялась через несколько секунд.
 */
const GridDialogs = React.forwardRef<GridDialogsHandle, { roomTypes: React.ComponentProps<typeof RoomDetailsDialog>["roomTypes"] }>(({ roomTypes }, ref) => {
  const [roomId, setRoomId] = React.useState<number | null>(null);
  const [reservationId, setReservationId] = React.useState<number | null>(null);
  React.useImperativeHandle(ref, () => ({ openRoom: setRoomId, openReservation: setReservationId }), []);
  return (
    <>
      <RoomDetailsDialog
        roomId={roomId}
        roomTypes={roomTypes}
        onClose={() => setRoomId(null)}
        onReservationClick={(id) => {
          setRoomId(null);
          setReservationId(id);
        }}
      />
      <ReservationDetailsDialog reservationId={reservationId} onClose={() => setReservationId(null)} />
    </>
  );
});
GridDialogs.displayName = "GridDialogs";

export const RoomBookingGrid: React.FC = () => {
  const theme = useTheme();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const [windowStart, setWindowStart] = React.useState<Dayjs>(() =>
    dayjs().subtract(2, "day").startOf("day"),
  );
  const dialogsRef = React.useRef<GridDialogsHandle>(null);
  // Подсказка по управлению (клик/протяжка/клавиатура) — по умолчанию свёрнута
  // под иконку info: раньше текст всегда висел строкой в легенде, занимая место.
  const [helpOpen, setHelpOpen] = React.useState(false);
  // Общий с HotelOccupancyBanner стор — клик по числу ниже сразу двигает
  // карточки «Загрузка»/«Гости» сверху страницы.
  const selectedDate = React.useSyncExternalStore(subscribeSelectedHotelDate, getSelectedHotelDate);
  // Индекс в ZOOM_LEVELS — по умолчанию 21 день: при 60 колонка дня была 20px,
  // даты и бары не читались, а слабые ноутбуки тормозили на тысячах ячеек.
  // Обзорнее — кнопкой «−» в тулбаре.
  const [zoomIndex, setZoomIndex] = React.useState(ZOOM_LEVELS.indexOf(21));
  const numVisibleDays = ZOOM_LEVELS[zoomIndex];
  // «Приблизить» (+) = меньше дней в ширину окна, крупнее каждый; «отдалить» (−) —
  // больше дней, мельче. Тот же смысл, что у зума карты/картинки: «+» — ближе и
  // подробнее, «−» — дальше и обзорнее.
  const canZoomIn = zoomIndex > 0;
  const canZoomOut = zoomIndex < ZOOM_LEVELS.length - 1;

  const windowStartStr = windowStart.format("YYYY-MM-DD");
  // Один запрос = один кусок в CHUNK_DAYS дней; pageParam — номер куска
  // относительно windowStart: 0 — первый, отрицательные — прошлое, положительные —
  // будущее. Ключ с префиксом ["hotel","calendar"], поэтому любые
  // invalidateQueries по нему перечитывают все уже загруженные куски (с их
  // номерами — окно при этом не «уезжает»).
  const queryClient = useQueryClient();
  // Ссылка «Номера» в пустом состоянии — только тем, у кого есть право на эту страницу.
  const canManageRooms = useCan(PAGE_PERMISSIONS.hotelRooms);
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

  // useMemo, а не «?? []» напрямую: иначе при каждом ре-рендере до загрузки календаря
  // получался бы новый пустой массив, и categoryIconKeys ниже пересчитывался бы зря
  // (react-hooks/exhaustive-deps верно на это указывает).
  const roomTypes = React.useMemo(() => calendar?.roomTypes ?? [], [calendar]);
  // Иконка категории у номера (см. roomCategoryIcons.ts) — от вместимости категории
  // (capacity/childrenCapacity), а не порядкового номера, поэтому у похожих по смыслу
  // категорий похожие иконки; категории с одинаковой вместимостью всё равно получают
  // разные иконки — по кругу в порядке sortOrder внутри своей группы.
  const categoryIconKeys = React.useMemo(() => buildRoomCategoryIconKeys(roomTypes), [roomTypes]);
  const ROWS: RowPlan[] = React.useMemo(() => {
    if (!calendar) return [];
    return groupRoomsByFloor(calendar.rooms).flatMap((g) => [
      { kind: "floor" as const, floor: g.floor, count: g.rooms.length },
      ...g.rooms.map((room) => ({ kind: "room" as const, room })),
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

  // ── Виртуализация колонок — см. комментарий у VISIBLE_DAYS_BUFFER выше.
  // Шаг квантования (не пересчитывать на каждый пиксель прокрутки; запас
  // VISIBLE_DAYS_BUFFER = 21 с каждой стороны втрое больше шага, так что
  // область рендера никогда не «прыгает» мимо видимой части).
  const RANGE_STEP_DAYS = 7;
  const computeVisibleRange = React.useCallback((): { start: number; end: number } => {
    if (!scrollEl || dayColWidth <= 0 || dates.length === 0) return { start: 0, end: dates.length };
    const firstVisibleIdx = Math.floor(scrollEl.scrollLeft / dayColWidth);
    const lastVisibleIdx = Math.ceil((scrollEl.scrollLeft + scrollEl.clientWidth) / dayColWidth);
    const start = Math.max(0, Math.floor((firstVisibleIdx - VISIBLE_DAYS_BUFFER) / RANGE_STEP_DAYS) * RANGE_STEP_DAYS);
    const end = Math.min(dates.length, Math.ceil((lastVisibleIdx + VISIBLE_DAYS_BUFFER) / RANGE_STEP_DAYS) * RANGE_STEP_DAYS);
    return { start, end };
  }, [scrollEl, dayColWidth, dates.length]);
  const [visibleRange, setVisibleRange] = React.useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const updateVisibleRange = React.useCallback(() => {
    const next = computeVisibleRange();
    setVisibleRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [computeVisibleRange]);
  // Пересчёт при монтировании, ресайзе, смене масштаба, догрузке кусков — не
  // только по скроллу (см. handleScroll ниже, тот же updateVisibleRange).
  // useLayoutEffect, не useEffect: иначе первый кадр красился бы с {0,0}
  // (пустая сетка), и только следующим тиком — с настоящими ячейками.
  React.useLayoutEffect(() => {
    updateVisibleRange();
  }, [updateVisibleRange]);

  // Выделение периода зажатием мыши (подробнее — ниже, у startSelection). Объявлено
  // здесь: пока идёт протяжка, подгрузку кусков откладываем — индексы выделения
  // это позиции в dates, а слева или справа они сдвинулись бы.
  const [dragSel, setDragSel] = React.useState<{
    roomId: number;
    roomNumber: string;
    startIdx: number;
    endIdx: number;
  } | null>(null);

  // Индексы выделения — позиции в dates. Новые куски во время протяжки не
  // запрашиваем, но запрос, уже ушедший до её начала, может вернуться посреди
  // неё: слева добавится кусок, и все индексы сдвинутся на CHUNK_DAYS. Без
  // поправки протяжка на 4 ночи превращалась в бронь на полтора месяца.
  const prevFirstChunkRef = React.useRef(firstChunkIdx);
  React.useEffect(() => {
    const prev = prevFirstChunkRef.current;
    prevFirstChunkRef.current = firstChunkIdx;
    if (prev == null || firstChunkIdx == null || prev === firstChunkIdx) return;
    const shift = (prev - firstChunkIdx) * CHUNK_DAYS;
    setDragSel((cur) => (cur ? { ...cur, startIdx: cur.startIdx + shift, endIdx: cur.endIdx + shift } : cur));
  }, [firstChunkIdx]);

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
    updateVisibleRange();
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

  const today = dayjs().startOf("day");
  const todayIdx = dates.findIndex((d) => d.isSame(today, "day"));

  // Строки дат и свободные ночи по номерам считаем один раз на изменение данных.
  // Раньше это делалось при каждой перерисовке: dayjs.format на каждую ячейку и
  // перебор броней на каждую дату каждого номера — тысячи операций на кадр.
  const dateInfo = React.useMemo(
    () => dates.map((d) => ({ str: d.format("YYYY-MM-DD"), label: `${d.date()} ${MONTH_GEN_RU[d.month()]}`, weekend: d.day() === 0 || d.day() === 6 })),
    [dates],
  );
  const freeMaskByRoom = React.useMemo(() => {
    const map = new Map<number, boolean[]>();
    for (const row of ROWS) {
      if (row.kind !== "room") continue;
      const mask = new Array<boolean>(dates.length).fill(true);
      // Черновики (reservationStatus: "draft") номер не занимают.
      for (const it of itemsByRoomId.get(row.room.id) ?? []) {
        if (it.reservationStatus === "draft") continue;
        const from = Math.max(0, dayjs(it.checkIn).diff(gridStart, "day"));
        const to = Math.min(dates.length, dayjs(it.checkOut).diff(gridStart, "day"));
        for (let i = from; i < to; i++) mask[i] = false;
      }
      map.set(row.room.id, mask);
    }
    return map;
  }, [ROWS, dates.length, itemsByRoomId, gridStart]);

  // Клавиатура: свободные ячейки — кнопки, и Tab по каждой (номера × дни — тысячи остановок)
  // не пройти. Поэтому у всех tabIndex=-1, кроме одной входной — первой свободной ночи
  // первого номера начиная с сегодня; дальше по ячейкам — стрелки (handleGridKeyDown).
  // Ключ ячейки — "индекс строки:индекс дня" (тот же, что в data-cell).
  const entryCell = React.useMemo(() => {
    const start = Math.max(0, todayIdx);
    for (let r = 0; r < ROWS.length; r++) {
      const row = ROWS[r];
      if (row.kind !== "room") continue;
      const mask = freeMaskByRoom.get(row.room.id);
      if (!mask) continue;
      for (let i = start; i < mask.length; i++) if (mask[i]) return `${r}:${i}`;
    }
    return null;
  }, [ROWS, freeMaskByRoom, todayIdx]);

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
      <BoardShell>
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={28} />
        </Stack>
      </BoardShell>
    );
  }
  if (!property) {
    return (
      <BoardShell>
        <HotelPropertyMissing />
      </BoardShell>
    );
  }
  // Только когда данных нет совсем: провал подгрузки следующего куска (или фонового
  // перечитывания) status ставит в error, но уже показанную сетку прятать незачем.
  if (calendarQuery.isError && !calendarQuery.data) {
    return (
      <BoardShell>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void calendarQuery.refetch()}>
              Повторить
            </Button>
          }
        >
          Не удалось загрузить бронирования.
        </Alert>
      </BoardShell>
    );
  }
  // Номеров в объекте нет вовсе — вместо шапки без строк объясняем, что делать.
  if (calendar && calendar.rooms.length === 0) {
    return (
      <BoardShell>
        <Alert
          severity="info"
          action={
            canManageRooms ? (
              <Button color="inherit" size="small" component={RouterLink} to="/rooms">
                К номерам
              </Button>
            ) : undefined
          }
        >
          В этом объекте пока нет номеров. Добавьте их в разделе «Номера» — они сразу появятся в шахматке.
        </Alert>
      </BoardShell>
    );
  }

  // Стрелки на свободной ячейке (data-cell="строка:день") двигают фокус к соседней свободной
  // ячейке в этом направлении — занятые брони перепрыгиваются; Home/End — края строки.
  // Enter/пробел уже дают быстрый заказ на одну ночь (click с detail === 0, см. ячейки).
  // Ячейки ключуются по дате, поэтому при подгрузке слева фокус остаётся на том же узле.
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !scrollEl) return;
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell) return;
    const [r, c] = (cell.dataset.cell ?? "").split(":").map(Number);
    const find = (row: number, col: number) => scrollEl.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`);
    const scan = (from: number, step: 1 | -1, limit: number, at: (i: number) => HTMLElement | null) => {
      for (let i = from; step > 0 ? i < limit : i >= limit; i += step) {
        const el = at(i);
        if (el) return el;
      }
      return null;
    };
    let next: HTMLElement | null;
    switch (e.key) {
      case "ArrowRight":
        next = scan(c + 1, 1, dates.length, (i) => find(r, i));
        break;
      case "ArrowLeft":
        next = scan(c - 1, -1, 0, (i) => find(r, i));
        break;
      case "ArrowDown":
        next = scan(r + 1, 1, ROWS.length, (i) => find(i, c));
        break;
      case "ArrowUp":
        next = scan(r - 1, -1, 0, (i) => find(i, c));
        break;
      case "Home":
        next = scan(0, 1, dates.length, (i) => find(r, i));
        break;
      case "End":
        next = scan(dates.length - 1, -1, 0, (i) => find(r, i));
        break;
      default:
        return;
    }
    e.preventDefault();
    next?.focus();
  };

  // Стрелки «‹ ›»: плавно на неделю; если край рядом, соседний кусок подгрузится сам.
  const scrollByDays = (days: number) => scrollEl?.scrollBy({ left: days * dayColWidth, behavior: scrollBehavior() });

  /**
   * Протяжка зажатой мышью по шапке дат (подписи месяцев и сами числа) — та же
   * область, где стрелки ниже. Только шапка, не тело сетки: там зажатие уже
   * занято быстрой бронью (startSelection) — тянуть шахматку за номер/бар/
   * свободную ячейку означало бы отобрать у них клик.
   *
   * Порог в 4px отличает клик (перейти на эту дату) от протяжки: пока сдвиг
   * меньше — это ещё потенциальный клик, событие не трогаем. Как только
   * перешли порог — считаем это протяжкой и глотаем ОДИН следующий click
   * (одноразовый capture-слушатель на window): иначе тот же mouseup родил бы
   * ещё и клик по дате, под которой отпустили мышь.
   */
  const startHeaderPan = (e: React.MouseEvent) => {
    if (e.button !== 0 || !scrollEl) return;
    e.preventDefault();
    const startX = e.clientX;
    const startScrollLeft = scrollEl.scrollLeft;
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) > 4) {
        moved = true;
        document.body.style.cursor = "grabbing";
      }
      if (moved) scrollEl.scrollLeft = startScrollLeft - dx;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      if (moved) {
        const swallowClick = (ce: MouseEvent) => {
          ce.stopPropagation();
          ce.preventDefault();
        };
        window.addEventListener("click", swallowClick, { capture: true, once: true });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const goToToday = () => {
    setSelectedHotelDate(dayjs().format("YYYY-MM-DD"));
    const anchor = dayjs().subtract(2, "day").startOf("day");
    const idx = anchor.diff(gridStart, "day");
    if (scrollEl && idx >= 0 && idx < dates.length) {
      scrollEl.scrollTo({ left: idx * dayColWidth, behavior: scrollBehavior() });
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

  const totalRooms = calendar?.rooms.length ?? 0;

  // Тулбар (период + масштаб + статус подгрузки) — раньше отдельной строкой
  // НАД сеткой, съедал высоту. Теперь уходит в шапку BoardShell, в пустое
  // место справа от «Шахматка номеров» (см. actions).
  const toolbar = (
    <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" useFlexGap>
      {(isFetchingNextPage || isFetchingPreviousPage) && (
        <Stack direction="row" alignItems="center" gap={0.75}>
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">
            Подгружаем даты…
          </Typography>
        </Stack>
      )}

      {/* Период: пилюля с прокруткой на неделю и возвратом к сегодня — стиль тулбара макета. */}
      <Stack direction="row" alignItems="center" sx={{ border: 1, borderColor: "divider", borderRadius: "8px" }}>
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
            px: 1.25,
          }}
        >
          Сегодня
        </Box>
      </Stack>

      {/* Масштаб: та же пилюля, что была в углу над шапкой — перенесена в тулбар. */}
      <Stack direction="row" alignItems="center" gap={0.25} sx={{ border: 1, borderColor: "divider", borderRadius: "8px", px: 0.5 }}>
        <Tooltip title="Показывать больше дней в ширину окна (до 60)">
          <span>
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              aria-label="Показывать больше дней в ширину окна"
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
              disabled={!canZoomOut}
            >
              <RemoveOutlined fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 34, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
          {numVisibleDays} дн.
        </Typography>
        <Tooltip title="Показывать меньше дней в ширину окна (до 1 недели)">
          <span>
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              aria-label="Показывать меньше дней в ширину окна"
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={!canZoomIn}
            >
              <AddOutlined fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {dragHint && (
        <Typography variant="caption" color="primary.main" fontWeight={600}>
          {dragHint}
        </Typography>
      )}
      {(isFetchNextPageError || isFetchPreviousPageError) && (
        <Stack direction="row" alignItems="center" gap={0.75}>
          <Typography variant="caption" color="warning.main">
            Не удалось подгрузить {isFetchNextPageError ? "следующие" : "предыдущие"} даты
          </Typography>
          <Button size="small" onClick={() => void (isFetchNextPageError ? fetchNextPage() : fetchPreviousPage())}>
            Повторить
          </Button>
        </Stack>
      )}
    </Stack>
  );

  return (
    <Box sx={{ flexShrink: 0 }}>
      <BoardShell actions={toolbar}>
        <Stack gap={1.5}>
          <Box sx={{ position: "relative" }}>
            <Box
              ref={setScrollEl}
              onScroll={handleScroll}
              onKeyDown={handleGridKeyDown}
              sx={{
                overflow: "auto",
                // Высота по экрану: фиксированные 440px показывали половину номеров.
                maxHeight: { xs: 520, md: "max(440px, calc(100vh - 330px))" },
                // Фокус с клавиатуры не должен уезжать под липкую колонку номеров и шапку.
                scrollPaddingLeft: `${ROOM_COL_WIDTH}px`,
                scrollPaddingTop: "80px",
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
                  // Фоновые ячейки сетки — классами, а не sx на каждой ячейке.
                  "& .rbg-c": {
                    height: 48,
                    margin: 0,
                    padding: 0,
                    border: 0,
                    borderRadius: 0,
                    font: "inherit",
                    textAlign: "left",
                    backgroundColor: "transparent",
                    cursor: "default",
                  },
                  "& .rbg-w": { backgroundColor: theme.palette.action.hover },
                  "& .rbg-t": { backgroundColor: alpha(theme.palette.primary.main, 0.06) },
                  "& .rbg-s": { backgroundColor: alpha(theme.palette.primary.main, 0.34) },
                  "& .rbg-f": { cursor: "pointer" },
                  "& .rbg-f:not(.rbg-s):hover": { backgroundColor: alpha(theme.palette.primary.main, 0.12) },
                  // Фокус с клавиатуры: 2 px цвета темы внутрь ячейки.
                  "& .rbg-f:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: "-2px" },
                  // «+» на свободной ячейке — при наведении/фокусе, псевдоэлементом (без узла в DOM).
                  ...(dayColWidth >= CELL_PLUS_MIN_WIDTH
                    ? {
                        "& .rbg-f::after": {
                          content: '"+"',
                          display: "block",
                          textAlign: "center",
                          color: theme.palette.primary.main,
                          fontSize: 18,
                          lineHeight: "48px",
                          opacity: 0,
                          pointerEvents: "none",
                        },
                        "& .rbg-f:hover::after, & .rbg-f:focus-visible::after": { opacity: 0.6 },
                      }
                    : {}),
                }}
              >
                {/* Угол над шапкой — sticky по обеим осям, перекрывает содержимое под собой при
                    скролле; подпись колонки, как в макете («Номер»); масштаб теперь в тулбаре выше. */}
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
                    borderTop: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "center",
                    px: 1.5,
                  }}
                >
                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Номер
                  </Typography>
                </Box>

                {monthSpans.map((m) => (
                  <Box
                    key={`${m.label}-${m.startCol}`}
                    onMouseDown={startHeaderPan}
                    sx={{
                      gridRow: 1,
                      gridColumn: `${m.startCol + 2} / ${m.startCol + 2 + m.span}`,
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      bgcolor: "background.paper",
                      borderTop: 1,
                      borderBottom: 1,
                      borderColor: "divider",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      height: 26,
                      cursor: "grab",
                      // Граница между месяцами — чтобы начало нового месяца читалось и в шапке.
                      borderLeft: m.startCol > 0 ? 1 : 0,
                    }}
                  >
                    {/* Ячейка месяца тянется на все подгруженные дни (до двух
                        месяцев), и подпись по центру уходила за край экрана:
                        над 27–30 сентября пусто, «Октябрь» — у 17-го числа.
                        Липкая подпись держится у левого края видимой части
                        своего месяца (сразу за колонкой «Номер»). */}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      fontWeight={600}
                      noWrap
                      sx={{ position: "sticky", left: ROOM_COL_WIDTH, px: 1, maxWidth: "100%", minWidth: 0 }}
                    >
                      {m.label}
                    </Typography>
                  </Box>
                ))}

                {dates.map((d, i) => {
                  // Виртуализация — см. VISIBLE_DAYS_BUFFER: даты вне текущего окна
                  // просто не рисуем (данные и позиция в сетке не зависят от этого).
                  if (i < visibleRange.start || i >= visibleRange.end) return null;
                  const dateStr = dateInfo[i].str;
                  const isToday = i === todayIdx;
                  const isSelected = dateStr === selectedDate;
                  const isWeekend = dateInfo[i].weekend;
                  return (
                    <Box
                      key={dateStr}
                      component="button"
                      type="button"
                      onMouseDown={startHeaderPan}
                      onClick={() => setSelectedHotelDate(dateStr)}
                      title={
                        isToday
                          ? "Сегодня — показать загрузку и гостей на эту дату"
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
                        cursor: "grab",
                        "&:hover": { bgcolor: isSelected ? undefined : alpha(theme.palette.primary.main, 0.06) },
                      }}
                    >
                      {/* Сегодня — залитый кружок, как в макете; выбранная (для карточек «Загрузка»/«Гости»
                          выше) дата — просто цветной жирный номер, если это не сегодня. */}
                      <Box
                        sx={{
                          width: 26,
                          height: 26,
                          borderRadius: "8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          bgcolor: isToday ? "primary.main" : "transparent",
                          color: isToday ? "primary.contrastText" : isSelected ? "primary.main" : isWeekend ? "text.secondary" : "text.primary",
                          fontWeight: isToday || isSelected ? 700 : 500,
                          fontSize: "0.875rem",
                        }}
                      >
                        {d.date()}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
                        {WEEKDAY_SHORT_RU[(d.day() + 6) % 7]}
                      </Typography>
                      {/* Метка «сейчас»: красное время + стрелка на нижней кромке шапки — та же подпись,
                          что в расписании клиники (ScheduleDayTimeline.tsx), а не только в title по
                          наведению: текущий момент должен быть виден сразу, без поиска глазами.
                          Дальше вниз её продолжает красная линия поверх строк (ниже). */}
                      {isToday && <NowBadge />}
                    </Box>
                  );
                })}

                {/* Этажи/номера + фоновые ячейки сетки под барами */}
                {ROWS.map((row, rowIdx) => {
                  const gridRow = rowIdx + 3;
                  if (row.kind === "floor") {
                    const floorTint = theme.palette.mode === "dark" ? alpha("#fff", 0.04) : alpha("#000", 0.03);
                    return (
                      <React.Fragment key={`floor-${row.floor}`}>
                        {/* Заливка строки на всю ширину — обычный, не sticky блок: он и так растянут
                            на весь grid (gridColumn:1/-1), поэтому в любой позиции прокрутки закрывает
                            собой всю видимую полосу. position:sticky тут не нужен и, что важнее,
                            НЕ РАБОТАЕТ на элементе такой ширины (проверено: left:0 не держит позицию,
                            подпись съезжает вместе с прокруткой) — сама подпись поэтому вынесена в
                            отдельный узкий (gridColumn:1) sticky-блок ниже, тем же приёмом, что и
                            прилипающая колонка номеров. */}
                        <Box
                          sx={{
                            gridRow,
                            gridColumn: "1 / -1",
                            bgcolor: floorTint,
                            borderBottom: 1,
                            borderColor: "divider",
                            height: 34,
                          }}
                        />
                        <Box
                          sx={{
                            gridRow,
                            gridColumn: 1,
                            // «1 этаж» и «3 номера» — в два ряда (номер под этажом), а не в одну строку:
                            // так подпись строки этажа не спорит по ширине с узкой колонкой номеров (92px).
                            width: "max-content",
                            position: "sticky",
                            left: 0,
                            zIndex: 1,
                            bgcolor: floorTint,
                            px: 1.5,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            height: 34,
                          }}
                        >
                          <Typography
                            variant="caption"
                            fontWeight={700}
                            color="text.secondary"
                            noWrap
                            sx={{ textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.25 }}
                          >
                            {floorGroupLabel(row.floor)}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" noWrap sx={{ lineHeight: 1.25, fontSize: "0.68rem" }}>
                            {row.count} {pluralRooms(row.count)}
                          </Typography>
                        </Box>
                      </React.Fragment>
                    );
                  }
                  const room = row.room;
                  const roomType = roomTypes.find((rt) => rt.id === room.roomTypeId);
                  const luxury = roomType?.isLuxury;
                  const categoryIconKey = categoryIconKeys.get(room.roomTypeId);
                  const CategoryIcon = categoryIconKey ? ROOM_CATEGORY_ICON_COMPONENTS[categoryIconKey] : null;
                  const stateColor = hotelRoomStateColor(room.state, theme);
                  return (
                    <React.Fragment key={room.id}>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => dialogsRef.current?.openRoom(room.id)}
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
                          height: 48,
                          font: "inherit",
                          color: "inherit",
                          border: 0,
                          textAlign: "left",
                          cursor: "pointer",
                          "&:hover": { backgroundImage: tintOver(alpha(theme.palette.primary.main, 0.08)) },
                        }}
                      >
                        {CategoryIcon && (
                          <Tooltip title={roomType?.name ?? "Категория"}>
                            <CategoryIcon
                              sx={{
                                fontSize: 16,
                                flexShrink: 0,
                                color:
                                  categoryIconKey === "luxury"
                                    ? theme.palette.mode === "dark"
                                      ? "#e9c766"
                                      : "#8a6d1a"
                                    : "text.secondary",
                              }}
                            />
                          </Tooltip>
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
                        const freeMask = freeMaskByRoom.get(room.id) ?? [];
                        const selection =
                          dragSel && dragSel.roomId === room.id ? selectionBounds(dragSel.startIdx, dragSel.endIdx) : null;
                        const cells: React.ReactNode[] = [];
                        // Виртуализация — см. VISIBLE_DAYS_BUFFER: в DOM только даты окна ± запас.
                        // Ячейка — простой элемент со стилями из классов сетки (см. sx контейнера):
                        // отдельный MUI-компонент и иконка «+» на каждую из тысячи ячеек и были
                        // главной причиной медленной шахматки.
                        for (let i = visibleRange.start; i < visibleRange.end && i < dateInfo.length; i++) {
                          const info = dateInfo[i];
                          const inSelection = selection != null && i >= selection[0] && i <= selection[1];
                          const tone = inSelection ? " rbg-s" : i === todayIdx ? " rbg-t" : info.weekend ? " rbg-w" : "";
                          const style = { gridRow, gridColumn: i + 2 };
                          if (!freeMask[i]) {
                            cells.push(<div key={info.str} className={`rbg-c${tone}`} style={style} />);
                            continue;
                          }
                          const cellKey = `${rowIdx}:${i}`;
                          cells.push(
                            <button
                              key={info.str}
                              type="button"
                              className={`rbg-c rbg-f${tone}`}
                              style={style}
                              data-cell={cellKey}
                              tabIndex={cellKey === entryCell ? 0 : -1}
                              aria-label={`Быстрая бронь: номер ${room.number}, ${info.label}`}
                              title={`Быстрая бронь — №${room.number}, ${info.label}. Клик — одна ночь, зажмите и протяните — период`}
                              // Мышь: нажатие — «от», отпускание (обработчик на window) — «до».
                              onMouseDown={(e) => startSelection(e, room, i)}
                              onMouseEnter={dragSel ? () => extendSelection(room.id, i, freeMask) : undefined}
                              // Клавиатура (Enter/Space на ячейке) даёт click с detail === 0 — одна ночь;
                              // click от мыши (detail ≥ 1) уже обработан нажатием/отпусканием выше.
                              onClick={(e) => {
                                if (e.detail === 0) requestQuickBooking(room.number, info.str);
                              }}
                            />,
                          );
                        }
                        return cells;
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
                    // Виртуализация — см. VISIBLE_DAYS_BUFFER: пропускаем только бары, целиком
                    // лежащие вне окна ± запас (пересечение, не просто индекс начала — бар может
                    // начинаться раньше окна и всё ещё быть частично виден).
                    if (endCol <= visibleRange.start || startCol >= visibleRange.end) return null;
                    const status = mapStayDisplayStatus(it.stayStatus);
                    const color = it.isOverbooking ? theme.palette.warning.main : hotelStayStatusColor(status, theme);
                    const nights = nightsBetween(it.checkIn, it.checkOut);
                    const isDraft = it.reservationStatus === "draft";
                    // Цвет статуса — в заливке и левом акценте (как в макете), а подпись text.primary
                    // (у «Завершена» — text.secondary): цвет статуса как цвет текста давал 2.6–4.1:1
                    // в светлой теме, а так на любой заливке ≥ 4.6:1 (проверено расчётом WCAG в обеих темах).
                    const textColor = status === "completed" ? theme.palette.text.secondary : theme.palette.text.primary;
                    const label = it.customerName || `Бронь №${it.reservationNumber}`;
                    // Ширина бара — колонки × ширина дня минус отступы по 3 px. Чем уже бар, тем
                    // короче подпись: имя → инициалы → одна буква (полное имя — в подсказке бара).
                    const labelMode = barLabelMode((endCol - startCol) * dayColWidth - 6);
                    // Полное описание — и для скринридера (в баре может быть только «АД»), и для
                    // подсказки: статус не должен зависеть от одного цвета.
                    const barDescription = `${label} · №${row.room.number} · ${nights} ноч. · ${HOTEL_STAY_STATUS_LABELS[status]}${it.isOverbooking ? " · Овербукинг" : ""}${isDraft ? " · Черновик" : ""}`;
                    // Черновик — весь контур пунктиром (виден отдельно от статуса); подтверждённая
                    // бронь — только левый цветной акцент 3 px, как в макете «Терра».
                    const barBorderSx = isDraft
                      ? { border: "1px dashed", borderColor: alpha(color, 0.6) }
                      : { border: 0, borderLeft: "3px solid", borderLeftColor: color };
                    return (
                      <Box
                        key={it.itemId}
                        component="button"
                        type="button"
                        onClick={() => dialogsRef.current?.openReservation(it.reservationId)}
                        aria-label={barDescription}
                        title={`${barDescription} — показать бронь`}
                        sx={{
                          gridRow,
                          gridColumn: `${startCol + 2} / ${endCol + 2}`,
                          alignSelf: "center",
                          height: 30,
                          mx: "3px",
                          px: labelMode === "name" ? 1 : 0,
                          borderRadius: "8px",
                          bgcolor: alpha(color, barFillAlpha(status, theme.palette.mode === "dark")),
                          ...barBorderSx,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: labelMode === "name" ? "flex-start" : "center",
                          overflow: "hidden",
                          font: "inherit",
                          cursor: "pointer",
                          "&:hover": { borderLeftColor: isDraft ? undefined : color, borderColor: isDraft ? color : undefined },
                        }}
                      >
                        <Typography variant="caption" noWrap sx={{ color: textColor, fontWeight: 600 }}>
                          {barLabelText(labelMode, it.customerName, it.reservationNumber)}
                        </Typography>
                      </Box>
                    );
                  });
                })}

                {/* Граница между месяцами — серая вертикальная линия по левому краю первого дня
                    месяца, во всю высоту строк (без шапки: там смену месяца и так видно по подписи).
                    Раньше её не было вовсе, и на глаз было не понять, где кончается один месяц и
                    начинается следующий. Тем же приёмом, что и красная линия «сейчас» ниже — отдельный
                    элемент на всю колонку, pointerEvents: none, чтобы не мешать клику/протяжке. */}
                {ROWS.length > 0 &&
                  monthSpans.slice(1).map((m) => (
                    <Box
                      key={`month-divider-${m.startCol}`}
                      aria-hidden
                      sx={{
                        gridColumn: m.startCol + 2,
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
                          left: 0,
                          width: "1px",
                          bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.18 : 0.14),
                        }}
                      />
                    </Box>
                  ))}

                {/* Красная линия «сейчас»: один элемент на все строки колонки сегодняшнего дня, после
                    баров в DOM — значит поверх них и поверх полос этажей (не рвётся). Ниже sticky-
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
                    <NowLine />
                  </Box>
                )}
              </Box>
            </Box>

          </Box>

          {/* Подвал — легенда состояний и статусов + сколько номеров показано и часы
              заезда/выезда объекта. Легенда раньше висела отдельной строкой над сеткой и
              занимала место в шапке — перенесена сюда, чтобы верх шахматки был компактнее. */}
          <Stack gap={1}>
            <Stack direction="row" gap={2} rowGap={0.5} flexWrap="wrap" alignItems="center">
              {HOTEL_STAY_STATUSES.map((status) => {
                const color = hotelStayStatusColor(status, theme);
                return (
                  <Stack key={status} direction="row" alignItems="center" gap={0.5}>
                    {/* Образец бара — та же заливка и левый акцент, что у брони этого статуса (иконок на барах нет). */}
                    <Box
                      sx={{
                        width: 16,
                        height: 10,
                        borderRadius: "3px",
                        bgcolor: alpha(color, barFillAlpha(status, theme.palette.mode === "dark")),
                        borderLeft: "3px solid",
                        borderLeftColor: color,
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {HOTEL_STAY_STATUS_LABELS[status]}
                    </Typography>
                  </Stack>
                );
              })}
              <Stack direction="row" alignItems="center" gap={0.5}>
                {/* Овербукинг — тоже образец бара, только оранжевый. */}
                <Box
                  sx={{
                    width: 16,
                    height: 10,
                    borderRadius: "3px",
                    bgcolor: alpha(theme.palette.warning.main, barFillAlpha("confirmed", theme.palette.mode === "dark")),
                    borderLeft: "3px solid",
                    borderLeftColor: "warning.main",
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  Овербукинг
                </Typography>
              </Stack>
              {/* Точка у номера — состояние уборки; четыре цвета, «Ремонт» серый (оранжевый — овербукинг). */}
              <Stack direction="row" alignItems="center" gap={1.25} flexWrap="wrap">
                <Typography variant="caption" color="text.secondary">
                  Точка у номера:
                </Typography>
                {HOTEL_ROOM_STATES.map((state) => (
                  <Stack key={state} direction="row" alignItems="center" gap={0.5}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: hotelRoomStateColor(state, theme) }} />
                    <Typography variant="caption" color="text.secondary">
                      {HOTEL_ROOM_STATE_LABELS[state]}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
              {/* Подсказка по управлению — свёрнута под иконку, раскрывается по клику (не по наведению). */}
              <ClickAwayListener onClickAway={() => setHelpOpen(false)}>
                <Tooltip
                  title="Клик по свободной ячейке — одна ночь, зажмите и протяните — несколько. С клавиатуры: Tab к ячейке, стрелки — между ячейками, Enter — одна ночь."
                  open={helpOpen}
                  onClose={() => setHelpOpen(false)}
                  disableFocusListener
                  disableHoverListener
                  disableTouchListener
                  placement="bottom-end"
                >
                  <IconButton
                    size="small"
                    onClick={() => setHelpOpen((o) => !o)}
                    aria-label="Подсказка по управлению шахматкой"
                    sx={{ ml: "auto" }}
                  >
                    <InfoOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ClickAwayListener>
            </Stack>

            <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1}>
              <Typography variant="caption" color="text.secondary">
                Показано {totalRooms} {pluralRooms(totalRooms)}
              </Typography>
              {property.checkInTime && property.checkOutTime && (
                <Typography variant="caption" color="text.secondary">
                  Заезд с {formatHotelTime(property.checkInTime)} · Выезд до {formatHotelTime(property.checkOutTime)}
                </Typography>
              )}
            </Stack>
          </Stack>
        </Stack>
      </BoardShell>

      <GridDialogs ref={dialogsRef} roomTypes={roomTypes} />
    </Box>
  );
};

export default RoomBookingGrid;
