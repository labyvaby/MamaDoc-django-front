/**
 * Детали номера — открывается кликом по номеру в RoomBookingGrid. Категория
 * (переданная сверху — грид уже загрузил её вместе с шахматкой, второй раз
 * не запрашиваем), доступность на ближайшие 45 дней — GET
 * /hotel/rooms/{id}/availability/ (items + свободные окна уже посчитаны
 * бэкендом, см. hotel-viva-frontend-api.md §4.2).
 *
 * Состояние номера в шапке — не просто чип: по клику его можно сменить
 * (RoomStateControl), в том числе вернуть номер из «Ремонта». Кнопка
 * «Редактировать» ведёт на страницу номера /rooms/:id (HotelRoomFormPage) — только
 * тем, у кого есть право на неё (hotel.manage, как у самого роута).
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
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
import dayjs from "dayjs";

import { getRoomAvailability, type HotelRoom, type HotelRoomType } from "../api/hotel";
import { PAGE_PERMISSIONS } from "../config/accessPermissions";
import { useCan } from "../hooks/useCan";
import {
  mapStayDisplayStatus,
  HOTEL_STAY_STATUS_LABELS,
  hotelStayStatusColor,
  HOTEL_BOARD_TYPE_LABELS,
} from "./hotelDisplay";
import { formatHotelDateRange, nightsBetween, requestQuickBooking } from "./mockDemoData";
import { RoomStateControl } from "./RoomStateControl";

const AVAILABILITY_WINDOW_DAYS = 45;

interface RoomCharacteristicsProps {
  room: HotelRoom;
}

/** Одна карточка-чип характеристики — по образцу блока «Характеристики» crm-building.adamtech.dev. */
const CharacteristicChip: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => {
  const theme = useTheme();
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1}
      sx={{
        px: 1.25,
        py: 1,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "10px",
        bgcolor: theme.palette.mode === "dark" ? alpha("#fff", 0.03) : alpha("#000", 0.02),
        minWidth: 0,
      }}
    >
      <Box sx={{ color: "text.secondary", display: "flex", flexShrink: 0 }}>{icon}</Box>
      <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: "nowrap" }}>
        {text}
      </Typography>
    </Stack>
  );
};

/**
 * Сводка «что за номер» на уровне категории (вид, кровать, планировка, этаж) —
 * отдельно от RoomCharacteristics ниже, где физические параметры ЭТОГО
 * конкретного номера (площадь, санузлы и т.п.). По образцу «Ключевые параметры»
 * в карточке квартиры (crm-building.adamtech.dev).
 */
const KeyParamsPanel: React.FC<{ room: HotelRoom; category: HotelRoomType | undefined }> = ({ room, category }) => {
  const theme = useTheme();
  const rows: { label: string; value: string; fullWidth?: boolean }[] = [];
  if (category) rows.push({ label: "Категория", value: category.name });
  if (room.floor) rows.push({ label: "Этаж", value: room.floor });
  const view = room.view || category?.view;
  if (view) rows.push({ label: "Вид из окна", value: view });
  if (category?.bedType) rows.push({ label: "Тип кровати", value: category.bedType });
  if (category?.roomLayout) rows.push({ label: "Планировка", value: category.roomLayout, fullWidth: true });

  if (rows.length === 0) return null;

  return (
    <Box
      sx={{
        mb: 2.5,
        p: 1.75,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "12px",
        bgcolor: theme.palette.mode === "dark" ? alpha("#fff", 0.02) : alpha("#000", 0.015),
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: "block", mb: 1 }}>
        Ключевые параметры
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", rowGap: 1, columnGap: 2 }}>
        {rows.map((r) => (
          <Box key={r.label} sx={{ minWidth: 0, gridColumn: r.fullWidth ? "1 / -1" : undefined }}>
            <Typography variant="caption" color="text.secondary" display="block">
              {r.label}
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {r.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

/**
 * Физические характеристики ЭТОГО номера (площадь, санузлы, терраса, зоны и т.п.)
 * — поверх общих характеристик категории выше. Все поля необязательные (см.
 * api/hotel.ts, HotelRoomFormPage.tsx) — секция скрыта целиком, если ни одно не
 * заполнено (у старых номеров, заведённых до 23.09.2026, так и есть).
 * hasTerrace/terraceArea/roomZones/photos — ПРЕДЛОЖЕНИЕ фронта, бэком ещё не
 * подтверждено (см. комментарий над HotelRoom в api/hotel.ts), поэтому везде `?? `.
 */
const RoomCharacteristics: React.FC<RoomCharacteristicsProps> = ({ room }) => {
  const chips: { key: string; icon: React.ReactNode; text: string }[] = [];
  if (room.area) chips.push({ key: "area", icon: <SquareFootOutlined fontSize="small" />, text: `${room.area} м²` });
  if (room.ceilingHeight) chips.push({ key: "ceiling", icon: <HeightOutlined fontSize="small" />, text: `Потолки ${room.ceilingHeight} м` });
  if (room.bathrooms != null) chips.push({ key: "bathrooms", icon: <BathtubOutlined fontSize="small" />, text: `${room.bathrooms} санузл.` });
  if (room.roomsCount != null) chips.push({ key: "rooms", icon: <MeetingRoomOutlined fontSize="small" />, text: `${room.roomsCount} комн.` });
  if (room.windowSide) chips.push({ key: "windowSide", icon: <ExploreOutlined fontSize="small" />, text: `${room.windowSide} сторона` });
  if (room.view) chips.push({ key: "view", icon: <VisibilityOutlined fontSize="small" />, text: room.view });
  if (room.isCorner) chips.push({ key: "corner", icon: <CropFreeOutlined fontSize="small" />, text: "Угловой номер" });
  if (room.hasTerrace) {
    chips.push({
      key: "terrace",
      icon: <DeckOutlined fontSize="small" />,
      text: room.terraceArea ? `Терраса ${room.terraceArea} м²` : "Терраса",
    });
  }

  const zones = room.roomZones ?? [];
  const photos = room.photos ?? [];

  if (chips.length === 0 && zones.length === 0 && photos.length === 0 && !room.layoutDescription) return null;

  return (
    <>
      {photos.length > 0 && (
        <Stack direction="row" gap={1} sx={{ mb: 2.5, overflowX: "auto" }}>
          {photos.map((p) => (
            <Box
              key={p.id}
              component="img"
              src={p.url}
              alt=""
              sx={{ width: 120, height: 90, objectFit: "cover", borderRadius: "8px", flexShrink: 0 }}
            />
          ))}
        </Stack>
      )}

      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
        Характеристики номера
      </Typography>
      {chips.length > 0 && (
        <Stack
          direction="row"
          flexWrap="wrap"
          sx={{
            gap: 1,
            mb: room.layoutDescription || zones.length > 0 ? 1.5 : 2.5,
          }}
        >
          {chips.map((c) => (
            <CharacteristicChip key={c.key} icon={c.icon} text={c.text} />
          ))}
        </Stack>
      )}
      {room.layoutDescription && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: zones.length > 0 ? 1.5 : 2.5, whiteSpace: "pre-wrap" }}>
          {room.layoutDescription}
        </Typography>
      )}

      {zones.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
            Экспликация помещений
          </Typography>
          <Stack gap={0.5}>
            {zones.map((z, i) => {
              const dimensions = [
                z.area ? `${z.area} м²` : "",
                z.width ? `ширина ${z.width} м` : "",
                z.length ? `длина ${z.length} м` : "",
              ].filter(Boolean).join(" · ");
              return (
                <Stack key={i} direction="row" justifyContent="space-between" gap={1}>
                  <Typography variant="body2">{z.name}</Typography>
                  {dimensions && (
                    <Typography variant="body2" fontWeight={600} sx={{ flexShrink: 0 }}>
                      {dimensions}
                    </Typography>
                  )}
                </Stack>
              );
            })}
          </Stack>
        </Box>
      )}
    </>
  );
};

export interface RoomDetailsDialogProps {
  /** Id номера или null — диалог закрыт. */
  roomId: number | null;
  /** Категории объекта — уже загружены родителем вместе с шахматкой. */
  roomTypes: HotelRoomType[];
  onClose: () => void;
  /** Клик по брони в «Ближайших бронях» — не задан, если детали брони показывать некуда. */
  onReservationClick?: (reservationId: number) => void;
}

export const RoomDetailsDialog: React.FC<RoomDetailsDialogProps> = ({ roomId, roomTypes, onClose, onReservationClick }) => {
  const theme = useTheme();
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
  });
  const availability = query.data;
  const category = availability ? roomTypes.find((c) => c.id === availability.room.roomTypeId) : undefined;

  const upcomingItems = React.useMemo(
    () => (availability ? availability.items.filter((i) => i.stayStatus !== "checked_out").slice(0, 6) : []),
    [availability],
  );

  /**
   * Быстрая бронь из карточки — тот же хендофф, что у протяжки по шахматке
   * (requestQuickBooking/CreateBookingButton в schedule/django/index.tsx):
   * кладём номер и, если есть, заезд первого свободного окна — форма сама
   * откроется с этим предзаполнением, выезд по умолчанию заезд+1 (см.
   * requestQuickBooking в mockDemoData.ts). Без свободных окон номер всё
   * равно подставляем — даты дозаполнят в форме вручную.
   */
  const handleQuickBook = () => {
    if (!availability) return;
    requestQuickBooking(availability.room.number, availability.freeWindows[0]?.dateFrom);
    onClose();
  };

  return (
    <Dialog open={roomId != null} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: "14px", overflow: "hidden" } }}>
      {roomId != null && availability && (
        <>
          <Stack direction="row" gap={0.5} sx={{ position: "absolute", right: 10, top: 10, zIndex: 2 }}>
            {canEditRoom && (
              <IconButton
                onClick={() => {
                  onClose();
                  // from — куда вернуться после сохранения (страница номера читает его из state).
                  navigate(`/rooms/${roomId}`, { state: { from: `${location.pathname}${location.search}` } });
                }}
                aria-label="Редактировать"
                sx={{ bgcolor: "background.paper" }}
              >
                <EditOutlined fontSize="small" />
              </IconButton>
            )}
            <IconButton onClick={onClose} aria-label="Закрыть" sx={{ bgcolor: "background.paper" }}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          </Stack>

          {/* Шапка — во всю ширину диалога, своим фоном и разделителем снизу, по
              образцу шапки карточки квартиры (crm-building.adamtech.dev): бровь
              (категория) → заголовок/цена → подзаголовок/статус. */}
          <Box
            sx={{
              px: 3,
              py: 2.5,
              pr: 9,
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: theme.palette.mode === "dark" ? alpha("#fff", 0.02) : alpha("#000", 0.015),
            }}
          >
            {category && (
              <Typography variant="caption" fontWeight={700} color="primary.main" sx={{ display: "block", mb: 0.5 }}>
                {category.name}
              </Typography>
            )}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
              <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                <Typography variant="h4" fontWeight={700}>
                  Номер {availability.room.number}
                </Typography>
                {category?.isLuxury && (
                  <Chip
                    icon={<WorkspacePremiumOutlined sx={{ fontSize: 16 }} />}
                    label="Люкс"
                    size="small"
                    sx={{
                      bgcolor: alpha("#d4af37", 0.18),
                      color: theme.palette.mode === "dark" ? "#e9c766" : "#8a6d1a",
                      fontWeight: 600,
                    }}
                  />
                )}
              </Stack>
              {category && (
                <Typography variant="h4" fontWeight={700} sx={{ flexShrink: 0 }}>
                  {Number(category.totalPrice).toLocaleString("ru-RU")} сом
                </Typography>
              )}
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-end" flexWrap="wrap" gap={2} sx={{ mt: 0.5 }}>
              {category && (
                <Typography variant="body2" color="text.secondary">
                  {[category.roomLayout, availability.room.floor && `${availability.room.floor} этаж`, availability.room.area && `${availability.room.area} м²`]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              )}
              <Stack alignItems="flex-end" gap={0.75} sx={{ flexShrink: 0 }}>
                {category && (
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <PersonOutlined fontSize="small" sx={{ color: "text.secondary" }} />
                    <Typography variant="caption" color="text.secondary">
                      до {category.capacity} гостей
                    </Typography>
                  </Stack>
                )}
                <RoomStateControl roomId={roomId} state={availability.room.state} />
                {canCreateBooking && (
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<EventAvailableOutlined fontSize="small" />}
                    onClick={handleQuickBook}
                  >
                    Забронировать
                  </Button>
                )}
              </Stack>
            </Stack>
          </Box>

          <DialogContent sx={{ p: 3 }}>
            {/* md, не sm: тема сужает sm до 360px (APP_BREAKPOINTS в theme.ts) — на
                реальных телефонах (360–430px) это включило бы две колонки. */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
              <Box sx={{ minWidth: 0 }}>
                <KeyParamsPanel room={availability.room} category={category} />

                {availability.room.mealOptions.length > 0 && (
                  <Box sx={{ mb: 2.5 }}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                      Доп. тарифы
                    </Typography>
                    <Stack direction="row" gap={0.75} flexWrap="wrap">
                      {availability.room.mealOptions.map((t) => (
                        <Chip key={t} label={HOTEL_BOARD_TYPE_LABELS[t] ?? t} size="small" color="primary" variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                )}

                <RoomCharacteristics room={availability.room} />
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  Свободен ближайшие {AVAILABILITY_WINDOW_DAYS} дней
                </Typography>
                {availability.freeWindows.length === 0 ? (
                  <Typography variant="body2" color="text.disabled" sx={{ mb: 2.5 }}>
                    Свободных окон нет — номер занят на весь период.
                  </Typography>
                ) : (
                  <Stack gap={0.75} sx={{ mb: 2.5 }}>
                    {availability.freeWindows.map((r) => (
                      <Stack key={`${r.dateFrom}-${r.dateTo}`} direction="row" alignItems="center" gap={1}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: theme.palette.success.main,
                            flexShrink: 0,
                          }}
                        />
                        <Typography variant="body2">{formatHotelDateRange(r.dateFrom, r.dateTo)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          ({nightsBetween(r.dateFrom, r.dateTo)} ноч.)
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}

                <Divider sx={{ mb: 2 }} />

                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  Ближайшие брони
                </Typography>
                {upcomingItems.length === 0 ? (
                  <Typography variant="body2" color="text.disabled">
                    Броней на ближайшее время нет.
                  </Typography>
                ) : (
                  <Stack gap={1}>
                    {upcomingItems.map((it) => {
                      const status = mapStayDisplayStatus(it.stayStatus);
                      const color = hotelStayStatusColor(status, theme);
                      return (
                        <Stack
                          key={it.itemId}
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          gap={1}
                          sx={{
                            px: 1.25,
                            py: 0.75,
                            borderRadius: "8px",
                            bgcolor: theme.palette.mode === "dark" ? alpha("#fff", 0.04) : alpha("#000", 0.03),
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              noWrap
                              component={onReservationClick ? "button" : "p"}
                              onClick={onReservationClick ? () => onReservationClick(it.reservationId) : undefined}
                              sx={
                                onReservationClick
                                  ? {
                                      display: "block",
                                      font: "inherit",
                                      fontWeight: 600,
                                      color: "primary.main",
                                      border: 0,
                                      bgcolor: "transparent",
                                      p: 0,
                                      cursor: "pointer",
                                      textAlign: "left",
                                      "&:hover": { textDecoration: "underline" },
                                    }
                                  : undefined
                              }
                            >
                              {it.customerName || `Бронь №${it.reservationNumber}`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatHotelDateRange(it.checkIn, it.checkOut)}
                            </Typography>
                          </Box>
                          <Chip
                            label={HOTEL_STAY_STATUS_LABELS[status]}
                            size="small"
                            sx={{
                              bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.25 : 0.14),
                              color,
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          />
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            </Box>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
};

export default RoomDetailsDialog;
