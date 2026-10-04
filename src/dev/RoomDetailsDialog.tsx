/**
 * Детали номера — открывается кликом по номеру в RoomBookingGrid. Категория
 * (переданная сверху — грид уже загрузил её вместе с шахматкой, второй раз
 * не запрашиваем), доступность на ближайшие 45 дней — GET
 * /hotel/rooms/{id}/availability/ (items + свободные окна уже посчитаны
 * бэкендом, см. hotel-viva-frontend-api.md §4.2).
 *
 * Шапка — три строки без пустот: категория и действия → номер и цена за ночь
 * → параметры, состояние номера и «Забронировать». Состояние — не просто чип:
 * по клику его можно сменить (RoomStateControl). Слева — фото и спецификация
 * номера строками, справа — шкала занятости на 45 ночей и ближайшие брони.
 * Карандаш ведёт на /rooms/:id (HotelRoomFormPage) — только с правом на неё.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import SquareFootOutlined from "@mui/icons-material/SquareFootOutlined";
import HeightOutlined from "@mui/icons-material/HeightOutlined";
import BathtubOutlined from "@mui/icons-material/BathtubOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import ExploreOutlined from "@mui/icons-material/ExploreOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import CropFreeOutlined from "@mui/icons-material/CropFreeOutlined";
import DeckOutlined from "@mui/icons-material/DeckOutlined";
import BedOutlined from "@mui/icons-material/BedOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import dayjs from "dayjs";

import { getRoomAvailability, type HotelRoom, type HotelRoomBlock, type HotelRoomType } from "../api/hotel";
import { PAGE_PERMISSIONS } from "../config/accessPermissions";
import { useCan } from "../hooks/useCan";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import {
  mapStayDisplayStatus,
  HOTEL_STAY_STATUS_LABELS,
  hotelStayStatusColor,
  HOTEL_BOARD_TYPE_LABELS,
} from "./hotelDisplay";
import { formatHotelDate, formatHotelDateRange, initialsOf, nightsBetween, requestQuickBooking } from "./mockDemoData";
import { RoomStateControl } from "./RoomStateControl";
import { RoomBlocksSection } from "./RoomBlocksSection";

const AVAILABILITY_WINDOW_DAYS = 45;

/** Подпись секции — мелкий капс с разрядкой, один стиль на всю карточку. */
const SectionLabel: React.FC<{ children: React.ReactNode; sx?: object }> = ({ children, sx }) => (
  <Typography
    component="div"
    sx={{
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "text.secondary",
      mb: 1.25,
      ...sx,
    }}
  >
    {children}
  </Typography>
);

interface SpecRow {
  key: string;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

interface StatTile {
  key: string;
  icon: React.ReactNode;
  value: string;
  label: string;
}

/** Числовые параметры номера — крупными плитками, а не строками спецификации. */
function buildStatTiles(room: HotelRoom): StatTile[] {
  const icon = (Icon: typeof BedOutlined) => <Icon sx={{ fontSize: 16 }} />;
  const tiles: StatTile[] = [];
  if (room.area) tiles.push({ key: "area", icon: icon(SquareFootOutlined), value: `${room.area} м²`, label: "Площадь" });
  if (room.roomsCount != null) tiles.push({ key: "rooms", icon: icon(MeetingRoomOutlined), value: String(room.roomsCount), label: "Комнат" });
  if (room.bathrooms != null) tiles.push({ key: "baths", icon: icon(BathtubOutlined), value: String(room.bathrooms), label: "Санузлов" });
  if (room.ceilingHeight) tiles.push({ key: "ceiling", icon: icon(HeightOutlined), value: `${room.ceilingHeight} м`, label: "Потолки" });
  return tiles;
}

const StatTiles: React.FC<{ tiles: StatTile[] }> = ({ tiles }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 1, mb: 2 }}>
      {tiles.map((t) => (
        <Box key={t.key} sx={{ px: 1.5, py: 1.25, borderRadius: "10px", bgcolor: subtleBg(theme, true), minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: "text.secondary", mb: 0.5 }}>
            {t.icon}
            <Typography variant="caption" noWrap>
              {t.label}
            </Typography>
          </Stack>
          <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }} noWrap>
            {t.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

/**
 * Спецификация номера строками «иконка · подпись … значение» с волосяными
 * разделителями — вместо рамки с сеткой: читается как паспорт номера. Поля
 * категории (кровать, планировка, вид) и ЭТОГО номера (сторона, терраса…) в
 * одном списке — сотруднику не важно, где поле хранится. Числа — в StatTiles.
 */
function buildSpecRows(room: HotelRoom, category: HotelRoomType | undefined): SpecRow[] {
  const icon = (Icon: typeof BedOutlined) => <Icon sx={{ fontSize: 18 }} />;
  const rows: SpecRow[] = [];
  if (category?.roomLayout) rows.push({ key: "layout", icon: icon(DashboardOutlined), label: "Планировка", value: category.roomLayout });
  if (category?.bedType) rows.push({ key: "bed", icon: icon(BedOutlined), label: "Кровать", value: category.bedType });
  const view = room.view || category?.view;
  if (view) rows.push({ key: "view", icon: icon(VisibilityOutlined), label: "Вид из окна", value: view });
  if (room.windowSide) rows.push({ key: "side", icon: icon(ExploreOutlined), label: "Окна выходят", value: room.windowSide });
  if (room.hasTerrace) {
    rows.push({ key: "terrace", icon: icon(DeckOutlined), label: "Терраса", value: room.terraceArea ? `${room.terraceArea} м²` : "Есть" });
  }
  if (room.isCorner) rows.push({ key: "corner", icon: icon(CropFreeOutlined), label: "Расположение", value: "Угловой" });
  if (room.mealOptions.length > 0) {
    rows.push({
      key: "meals",
      icon: icon(RestaurantOutlined),
      label: "Питание",
      value: room.mealOptions.map((t) => HOTEL_BOARD_TYPE_LABELS[t] ?? t).join(", "),
    });
  }
  return rows;
}

const SpecList: React.FC<{ rows: SpecRow[] }> = ({ rows }) => {
  const theme = useTheme();
  return (
    <Box>
      {rows.map((r, i) => (
        <Stack
          key={r.key}
          direction="row"
          alignItems="flex-start"
          gap={1.25}
          sx={{ py: 1.1, borderTop: i === 0 ? "none" : `1px solid ${subtleBorder(theme)}` }}
        >
          <Box sx={{ color: "text.secondary", display: "flex", flexShrink: 0, mt: "1px" }}>{r.icon}</Box>
          <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            {r.label}
          </Typography>
          <Typography variant="body2" fontWeight={600} sx={{ flex: 1, textAlign: "right", minWidth: 0, pl: 2 }}>
            {r.value}
          </Typography>
        </Stack>
      ))}
    </Box>
  );
};

/** Фото: крупный кадр и лента миниатюр — клик по миниатюре меняет кадр. */
const PhotoGallery: React.FC<{ photos: HotelRoom["photos"] }> = ({ photos }) => {
  const theme = useTheme();
  const [active, setActive] = React.useState(0);
  const current = photos[Math.min(active, photos.length - 1)];
  if (!current) return null;
  return (
    <Box sx={{ mb: 3 }}>
      <Box
        component="img"
        src={current.url}
        alt=""
        sx={{ display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: "12px", bgcolor: subtleBg(theme, true) }}
      />
      {photos.length > 1 && (
        <Stack direction="row" gap={1} sx={{ mt: 1, overflowX: "auto" }}>
          {photos.map((p, i) => (
            <Box
              key={p.id}
              component="button"
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Фото ${i + 1}`}
              sx={{
                p: 0,
                border: 0,
                borderRadius: "8px",
                overflow: "hidden",
                cursor: "pointer",
                flexShrink: 0,
                outline: i === active ? `2px solid ${theme.palette.primary.main}` : "none",
                outlineOffset: 2,
                opacity: i === active ? 1 : 0.65,
                transition: "opacity .15s",
                "&:hover": { opacity: 1 },
              }}
            >
              <Box component="img" src={p.url} alt="" sx={{ display: "block", width: 64, height: 44, objectFit: "cover" }} />
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
};

/**
 * Шкала занятости — одна ячейка на ночь окна [from, from+45). Ночь свободна,
 * если попадает в одно из freeWindows (dateTo не включается — это день
 * выезда, см. formatHotelDateRange). Вместо списка дат одним взглядом видно,
 * где дыры и насколько номер загружен.
 */
const OccupancyStrip: React.FC<{ from: string; freeWindows: { dateFrom: string; dateTo: string }[] }> = ({ from, freeWindows }) => {
  const theme = useTheme();
  const start = dayjs(from);
  const nights = Array.from({ length: AVAILABILITY_WINDOW_DAYS }, (_, i) => {
    const iso = start.add(i, "day").format("YYYY-MM-DD");
    return { iso, free: freeWindows.some((w) => iso >= w.dateFrom && iso < w.dateTo) };
  });
  const freeCount = nights.filter((n) => n.free).length;
  const occupancy = Math.round(((AVAILABILITY_WINDOW_DAYS - freeCount) / AVAILABILITY_WINDOW_DAYS) * 100);
  const busyColor = theme.palette.mode === "dark" ? alpha(theme.palette.info.main, 0.8) : theme.palette.info.main;
  const freeColor = alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.5 : 0.4);

  // Подряд идущие ночи одного вида — один сплошной сегмент, а не 45 палочек.
  const segments: { free: boolean; from: string; nights: number }[] = [];
  for (const n of nights) {
    const last = segments[segments.length - 1];
    if (last && last.free === n.free) last.nights += 1;
    else segments.push({ free: n.free, from: n.iso, nights: 1 });
  }

  return (
    <Box>
      <Stack direction="row" alignItems="baseline" gap={1} sx={{ mb: 1.5 }}>
        <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {freeCount}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          из {AVAILABILITY_WINDOW_DAYS} ночей свободно · загрузка {occupancy}%
        </Typography>
      </Stack>
      <Box sx={{ display: "flex", gap: "3px", height: 12 }}>
        {segments.map((s) => {
          const toIso = dayjs(s.from).add(s.nights, "day").format("YYYY-MM-DD");
          return (
            <Tooltip
              key={s.from}
              title={`${formatHotelDateRange(s.from, toIso)} · ${s.nights} ноч. — ${s.free ? "свободно" : "занято"}`}
              disableInteractive
            >
              <Box sx={{ flex: s.nights, minWidth: 4, borderRadius: "999px", bgcolor: s.free ? freeColor : busyColor }} />
            </Tooltip>
          );
        })}
      </Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75 }}>
        <Typography variant="caption" color="text.secondary">
          Сегодня
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatHotelDate(start.add(AVAILABILITY_WINDOW_DAYS - 1, "day").format("YYYY-MM-DD"))}
        </Typography>
      </Stack>
      <Stack direction="row" gap={2} sx={{ mt: 1.25 }}>
        {[
          { color: freeColor, label: "Свободно" },
          { color: busyColor, label: "Занято" },
        ].map((l) => (
          <Stack key={l.label} direction="row" alignItems="center" gap={0.75}>
            <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: l.color }} />
            <Typography variant="caption" color="text.secondary">
              {l.label}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
};

const headerIconButtonSx = (theme: Theme) => ({
  width: 34,
  height: 34,
  border: `1px solid ${subtleBorder(theme)}`,
  color: "text.secondary",
  "&:hover": { color: "text.primary", bgcolor: subtleBg(theme, true) },
});

export interface RoomDetailsDialogProps {
  /** Id номера или null — диалог закрыт. */
  roomId: number | null;
  /** Категории объекта — уже загружены родителем вместе с шахматкой. */
  roomTypes: HotelRoomType[];
  onClose: () => void;
  /** Клик по брони в «Ближайших бронях» — не задан, если детали брони показывать некуда. */
  onReservationClick?: (reservationId: number) => void;
  /** Карточку открыли кликом по снятым с продажи ночам в шахматке. */
  focusBlock?: HotelRoomBlock | null;
}

export const RoomDetailsDialog: React.FC<RoomDetailsDialogProps> = ({ roomId, roomTypes, onClose, onReservationClick, focusBlock }) => {
  const theme = useTheme();
  // На телефоне окно с полями по 32 px теряло шестую часть ширины — во весь экран, как карточка брони.
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const location = useLocation();
  const canEditRoom = useCan(PAGE_PERMISSIONS.hotelRooms);
  // То же право, что гейтит CreateBookingButton на странице «Бронирования» —
  // иначе кнопка ниже звала бы форму, которая не смонтирована и не слушает.
  const canCreateBooking = useCan(["schedule.manage", "hotel.reservations.manage"]);
  const today = dayjs().startOf("day");
  const from = today.format("YYYY-MM-DD");
  const to = today.add(AVAILABILITY_WINDOW_DAYS, "day").format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["hotel", "room-availability", roomId, from, to],
    queryFn: ({ signal }) => getRoomAvailability(roomId!, from, to, signal),
    enabled: roomId != null,
    // Refine по умолчанию держит прошлые данные при смене ключа
    // (placeholderData: keepPreviousData) — при медленной сети модалка другого
    // номера показывала данные предыдущего. Здесь данные одной записи: пока
    // новые не пришли, честный спиннер, а не чужая запись.
    placeholderData: undefined,
  });
  // И на всякий случай — только данные именно открытого номера.
  const availability = query.data && query.data.room.id === roomId ? query.data : undefined;
  const room = availability?.room;
  const category = room ? roomTypes.find((c) => c.id === room.roomTypeId) : undefined;

  const upcomingItems = React.useMemo(
    () => (availability ? availability.items.filter((i) => i.stayStatus !== "checked_out").slice(0, 6) : []),
    [availability],
  );

  /**
   * Быстрая бронь из карточки — тот же хендофф, что у протяжки по шахматке
   * (requestQuickBooking/CreateBookingButton в schedule/django/index.tsx):
   * номер и заезд первого свободного окна, выезд по умолчанию заезд+1.
   * Без свободных окон номер всё равно подставляем — даты дозаполнят вручную.
   */
  const handleQuickBook = () => {
    if (!availability) return;
    requestQuickBooking(availability.room.number, availability.freeWindows[0]?.dateFrom);
    onClose();
  };

  const handleEdit = () => {
    onClose();
    // from — куда вернуться после сохранения (страница номера читает его из state).
    navigate(`/rooms/${roomId}`, { state: { from: `${location.pathname}${location.search}` } });
  };

  const nextFree = availability?.freeWindows[0];
  const specRows = room ? buildSpecRows(room, category) : [];
  const statTiles = room ? buildStatTiles(room) : [];
  const zones = room?.roomZones ?? [];
  const photos = room?.photos ?? [];

  // Планировка — в спецификации ниже: длинная («Апартаменты (спальня +
  // гостиная)») выталкивала состояние номера на вторую строку шапки.
  const meta = room ? [room.floor && `${room.floor} этаж`, room.area && `${room.area} м²`].filter(Boolean) : [];

  return (
    <Dialog
      open={roomId != null}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={phone}
      PaperProps={{ sx: { borderRadius: phone ? 0 : "16px", overflow: "hidden", backgroundImage: "none" } }}
    >
      {roomId != null && !availability && (
        <Stack alignItems="center" justifyContent="center" gap={1.5} sx={{ py: 8 }}>
          {query.isError ? (
            <>
              <Typography color="text.secondary">Не удалось загрузить номер</Typography>
              <Button size="small" onClick={onClose}>
                Закрыть
              </Button>
            </>
          ) : (
            <>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">
                Загружаем данные номера…
              </Typography>
            </>
          )}
        </Stack>
      )}

      {roomId != null && availability && room && (
        <>
          {/* ── Шапка ── */}
          <Box sx={{ px: { xs: 2.5, md: 3.5 }, pt: 2.5, pb: 3, borderBottom: `1px solid ${subtleBorder(theme)}` }}>
            {/* 1. категория · действия */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1.5 }}>
              <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
                <Typography
                  noWrap
                  sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}
                >
                  {category?.name ?? "Номер"}
                </Typography>
                {category?.isLuxury && (
                  <Chip
                    icon={<WorkspacePremiumOutlined sx={{ fontSize: 14 }} />}
                    label="Люкс"
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: 11,
                      fontWeight: 700,
                      bgcolor: alpha("#d4af37", 0.16),
                      color: theme.palette.mode === "dark" ? "#e9c766" : "#8a6d1a",
                      "& .MuiChip-icon": { color: "inherit" },
                    }}
                  />
                )}
              </Stack>
              <Stack direction="row" gap={0.75} sx={{ flexShrink: 0 }}>
                {canEditRoom && (
                  <Tooltip title="Редактировать номер">
                    <IconButton onClick={handleEdit} aria-label="Редактировать" sx={headerIconButtonSx(theme)}>
                      <EditOutlined sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Tooltip>
                )}
                <IconButton onClick={onClose} aria-label="Закрыть" sx={headerIconButtonSx(theme)}>
                  <CloseOutlined sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>
            </Stack>

            {/* 2. номер · цена */}
            <Stack direction="row" alignItems="flex-end" justifyContent="space-between" gap={2} flexWrap="wrap">
              <Typography sx={{ fontSize: { xs: 30, md: 36 }, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
                Номер {room.number}
              </Typography>
              {category && (
                <Box sx={{ textAlign: "right" }}>
                  <Stack direction="row" alignItems="baseline" gap={0.75} justifyContent="flex-end">
                    <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                      {Number(category.totalPrice).toLocaleString("ru-RU")}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      сом / ночь
                    </Typography>
                  </Stack>
                </Box>
              )}
            </Stack>

            {/* 3. параметры · состояние · действие */}
            <Stack
              direction={{ xs: "column", md: "row" }}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              gap={1.5}
              sx={{ mt: 2 }}
            >
              <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" sx={{ rowGap: 1 }}>
                {meta.length > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {meta.join(" · ")}
                  </Typography>
                )}
                {category && (
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <PersonOutlined sx={{ fontSize: 17, color: "text.secondary" }} />
                    <Typography variant="body2" color="text.secondary">
                      до {category.capacity}
                    </Typography>
                  </Stack>
                )}
                <RoomStateControl roomId={roomId} state={room.state} />
              </Stack>
              {canCreateBooking && (
                <Button
                  variant="contained"
                  disableElevation
                  startIcon={<EventAvailableOutlined />}
                  onClick={handleQuickBook}
                  sx={{ px: 2.5, py: 1, borderRadius: "10px", fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}
                >
                  {nextFree ? `Забронировать с ${formatHotelDate(nextFree.dateFrom)}` : "Забронировать"}
                </Button>
              )}
            </Stack>
          </Box>

          {/* ── Тело ── */}
          <DialogContent sx={{ px: { xs: 2.5, md: 3.5 }, py: 3 }}>
            {/* md, не sm: тема сужает sm до 360px (APP_BREAKPOINTS в theme.ts) — на
                реальных телефонах (360–430px) это включило бы две колонки. */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.1fr 1fr" }, gap: { xs: 3.5, md: 5 } }}>
              {/* Слева — сам номер */}
              <Box sx={{ minWidth: 0 }}>
                {photos.length > 0 && <PhotoGallery photos={photos} />}

                <SectionLabel>О номере</SectionLabel>
                {statTiles.length > 0 && <StatTiles tiles={statTiles} />}
                {specRows.length > 0 ? (
                  <SpecList rows={specRows} />
                ) : statTiles.length > 0 ? null : (
                  <Typography variant="body2" color="text.disabled">
                    Характеристики не заполнены.
                    {canEditRoom && " Добавьте их в карточке номера."}
                  </Typography>
                )}

                {room.layoutDescription && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    {room.layoutDescription}
                  </Typography>
                )}

                {zones.length > 0 && (
                  <Box sx={{ mt: 3 }}>
                    <SectionLabel>
                      <Stack direction="row" alignItems="center" gap={0.75} component="span">
                        <LayersOutlined sx={{ fontSize: 14 }} />
                        Помещения
                      </Stack>
                    </SectionLabel>
                    <Box sx={{ borderRadius: "10px", bgcolor: subtleBg(theme), px: 1.75, py: 0.5 }}>
                      {zones.map((z, i) => {
                        const size = [z.width && z.length ? `${z.width}×${z.length} м` : ""].filter(Boolean).join("");
                        return (
                          <Stack
                            key={i}
                            direction="row"
                            alignItems="center"
                            gap={1}
                            sx={{ py: 1, borderTop: i === 0 ? "none" : `1px solid ${subtleBorder(theme)}` }}
                          >
                            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                              {z.name}
                            </Typography>
                            {size && (
                              <Typography variant="caption" color="text.secondary">
                                {size}
                              </Typography>
                            )}
                            {z.area && (
                              <Typography variant="body2" fontWeight={600} sx={{ minWidth: 56, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                {z.area} м²
                              </Typography>
                            )}
                          </Stack>
                        );
                      })}
                    </Box>
                  </Box>
                )}
              </Box>

              {/* Справа — занятость */}
              <Box sx={{ minWidth: 0 }}>
                <SectionLabel>Ближайшие {AVAILABILITY_WINDOW_DAYS} ночей</SectionLabel>
                <OccupancyStrip from={from} freeWindows={availability.freeWindows} />

                {availability.freeWindows.length > 0 && (
                  <Stack gap={0.5} sx={{ mt: 2.5 }}>
                    {availability.freeWindows.slice(0, 4).map((w) => (
                      <Stack key={`${w.dateFrom}-${w.dateTo}`} direction="row" justifyContent="space-between" gap={1}>
                        <Typography variant="body2">{formatHotelDateRange(w.dateFrom, w.dateTo)}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {nightsBetween(w.dateFrom, w.dateTo)} ноч.
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}

                <SectionLabel sx={{ mt: 3.5 }}>Ближайшие брони</SectionLabel>
                {upcomingItems.length === 0 ? (
                  <Stack
                    direction="row"
                    alignItems="center"
                    gap={1.25}
                    sx={{ px: 1.75, py: 1.5, borderRadius: "10px", bgcolor: subtleBg(theme) }}
                  >
                    <EventBusyOutlined sx={{ fontSize: 20, color: "text.disabled" }} />
                    <Typography variant="body2" color="text.secondary">
                      Броней нет
                    </Typography>
                  </Stack>
                ) : (
                  <Stack gap={0.25} sx={{ mx: -1 }}>
                    {upcomingItems.map((it) => {
                      const status = mapStayDisplayStatus(it.stayStatus);
                      const color = hotelStayStatusColor(status, theme);
                      const clickable = onReservationClick != null;
                      return (
                        <Stack
                          key={it.itemId}
                          direction="row"
                          alignItems="center"
                          gap={1.25}
                          component={clickable ? "button" : "div"}
                          onClick={clickable ? () => onReservationClick(it.reservationId) : undefined}
                          sx={{
                            width: "100%",
                            px: 1,
                            py: 0.9,
                            border: 0,
                            borderRadius: "10px",
                            bgcolor: "transparent",
                            color: "inherit",
                            font: "inherit",
                            textAlign: "left",
                            cursor: clickable ? "pointer" : "default",
                            transition: "background-color .15s",
                            "&:hover": clickable ? { bgcolor: subtleBg(theme, true) } : undefined,
                          }}
                        >
                          <Avatar sx={{ width: 34, height: 34, fontSize: 12, fontWeight: 700, bgcolor: alpha(color, 0.16), color }}>
                            {it.customerName ? initialsOf(it.customerName) : <PersonOutlined sx={{ fontSize: 18 }} />}
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" alignItems="center" gap={1}>
                              <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>
                                {it.customerName || `Бронь №${it.reservationNumber}`}
                              </Typography>
                              <Stack direction="row" alignItems="center" gap={0.6} sx={{ flexShrink: 0 }}>
                                <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color }} />
                                <Typography variant="caption" fontWeight={600} color="text.secondary" noWrap>
                                  {HOTEL_STAY_STATUS_LABELS[status]}
                                </Typography>
                              </Stack>
                            </Stack>
                            <Typography variant="caption" color="text.secondary" noWrap component="div">
                              {formatHotelDateRange(it.checkIn, it.checkOut)} · {nightsBetween(it.checkIn, it.checkOut)} ноч.
                            </Typography>
                          </Box>
                        </Stack>
                      );
                    })}
                  </Stack>
                )}

                <Box sx={{ mt: 3.5 }}>
                  <RoomBlocksSection roomId={room.id} roomNumber={room.number} blocks={availability.blocks} focusBlock={focusBlock} />
                </Box>
              </Box>
            </Box>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
};

export default RoomDetailsDialog;
