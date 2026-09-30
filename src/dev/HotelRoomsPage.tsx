/**
 * «Номера» Viva — самостоятельная страница отеля: пункт сайдбара во вкладке
 * «Организация», а не раздел «Настроек» (рельса SettingsLayout здесь нет).
 * Маршрут /rooms гейтит hotel.manage (PAGE_PERMISSIONS.hotelRooms, см.
 * App.tsx, accessPermissions.ts).
 * Реальный бэкенд (src/api/hotel.ts): номера — GET/POST/PATCH/DELETE
 * /hotel/rooms/, категории — только чтение GET /hotel/room-types/ (см.
 * hotel-viva-frontend-api.md §4.2, §6).
 *
 * Здесь только сами номера. Категории (тарифы) — тип номера с ценой за ночь и
 * характеристиками — заводятся и правятся на своей странице «Категории и
 * тарифы» (HotelRoomCategoriesPage.tsx, /room-categories);
 * тут они показаны справочно, как группы, в которые входят номера.
 *
 * Номера сгруппированы по категориям, как в RoomBookingGrid и
 * RoomDetailsDialog. «Добавить номер» ведёт на страницу создания номера
 * (HotelRoomFormPage.tsx, /rooms/new — там же питание, площадь и другие
 * необязательные характеристики); шахматка и форма создания брони подхватывают
 * новый номер сразу же (react-query invalidate), без reload. Клик по номеру
 * ведёт на страницу его редактирования (/rooms/:roomId) — той же, куда ведёт
 * «Редактировать» в карточке номера в шахматке.
 *
 * «Питание» номера — HotelRoom.mealOptions, ключи из catalogs.mealOptions
 * (какое питание доступно физически в этом номере) — отдельно от boardType
 * брони (что выбрано на конкретный заезд, см. CreateBookingButton).
 *
 * Способов оплаты здесь нет: их справочник ведётся в «Настройки → Способы
 * безнала» (/settings/cashless-methods), а не отдельным списком объекта.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "react-router";

import { usePageTitle } from "../hooks/usePageTitle";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { getHotelCatalogs, listRoomTypes, listRooms, type HotelRoom } from "../api/hotel";
import { HOTEL_ROOM_STATE_LABELS, HOTEL_ROOM_STATES, hotelRoomStateColor, type HotelRoomState } from "./hotelDisplay";
import { CountChip, DisabledReason, EmptyState, HotelPage, HotelPageHeader, plural, Surface } from "./hotelUi";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { floorGroupLabel, groupRoomsByFloor, pluralRooms } from "./roomBookingFloors";

/** Как показывать номера — запоминаем у сотрудника (localStorage может быть недоступен). */
const GROUPING_KEY = "mamadoc:hotel-rooms:grouping";
type Grouping = "floor" | "category";
const readGrouping = (): Grouping => {
  try {
    return window.localStorage.getItem(GROUPING_KEY) === "category" ? "category" : "floor";
  } catch {
    return "floor";
  }
};

export const HotelRoomsPage: React.FC = () => {
  usePageTitle("Номера");
  const theme = useTheme();
  const navigate = useNavigate();
  const { property, isLoading: propertyLoading, missingReason } = useHotelProperty();

  const catalogsQuery = useQuery({
    queryKey: ["hotel", "catalogs", property?.id],
    queryFn: ({ signal }) => getHotelCatalogs(property!.id, signal),
    enabled: property != null,
  });
  const mealOptionChoices = catalogsQuery.data?.mealOptions ?? [];

  const roomTypesQuery = useQuery({
    queryKey: ["hotel", "roomTypes", property?.id],
    queryFn: ({ signal }) => listRoomTypes(property!.id, {}, signal),
    enabled: property != null,
  });
  const roomTypes = React.useMemo(() => roomTypesQuery.data ?? [], [roomTypesQuery.data]);

  const roomsQuery = useQuery({
    queryKey: ["hotel", "rooms", property?.id],
    queryFn: ({ signal }) => listRooms({ propertyId: property!.id }, signal),
    enabled: property != null,
  });
  const roomsByType = React.useMemo(() => {
    const map = new Map<number, HotelRoom[]>();
    for (const r of roomsQuery.data ?? []) {
      const arr = map.get(r.roomTypeId) ?? [];
      arr.push(r);
      map.set(r.roomTypeId, arr);
    }
    return map;
  }, [roomsQuery.data]);

  const loading = propertyLoading || catalogsQuery.isLoading || roomTypesQuery.isLoading || roomsQuery.isLoading;
  // Ошибку загрузки не выдаём за «пусто»: иначе при сбое сети список выглядит как «Номеров пока нет».
  const loadError = catalogsQuery.isError || roomTypesQuery.isError || roomsQuery.isError;
  const retryLoad = () => {
    void catalogsQuery.refetch();
    void roomTypesQuery.refetch();
    void roomsQuery.refetch();
  };

  const allRooms = roomsQuery.data ?? [];
  const onSale = allRooms.filter((r) => r.status !== "out_of_service");
  const stateCounts = HOTEL_ROOM_STATES.map((s) => ({ state: s, count: onSale.filter((r) => r.state === s).length })).filter(
    (s) => s.count > 0,
  );
  // Фильтр: состояние номера в продаже либо «сняты с продажи». Счётчики
  // состояний считают только номера в продаже — ровно то число, что в отчёте и
  // над шахматкой («11 в продаже»); снятые — отдельной таблеткой.
  const [stateFilter, setStateFilter] = React.useState<HotelRoomState | "offSale" | null>(null);
  // По этажам — как их обходит горничная и видит ресепшен; по категориям — как их продают.
  const [grouping, setGroupingState] = React.useState<Grouping>(readGrouping);
  const setGrouping = (next: Grouping) => {
    setGroupingState(next);
    try {
      window.localStorage.setItem(GROUPING_KEY, next);
    } catch {
      // без памяти — просто не запомним
    }
  };
  const typeName = React.useMemo(() => new Map(roomTypes.map((t) => [t.id, t.name])), [roomTypes]);
  const offSaleCount = allRooms.length - onSale.length;
  const matchesFilter = (r: HotelRoom) =>
    stateFilter === null ||
    (stateFilter === "offSale" ? r.status === "out_of_service" : r.status !== "out_of_service" && r.state === stateFilter);

  return (
    <HotelPage>
      <HotelPageHeader
        title="Номера"
        subtitle={
          allRooms.length > 0
            ? `${allRooms.length} ${plural(allRooms.length, "номер", "номера", "номеров")} · ${onSale.length} в продаже` +
              (offSaleCount > 0 ? ` · ${offSaleCount} ${plural(offSaleCount, "снят", "сняты", "сняты")} с продажи` : "")
            : undefined
        }
        info={
          <>
            Номера можно смотреть по этажам или по категориям — переключатель над списком. Новый номер сразу появляется в шахматке и в форме брони. Клик по
            номеру — страница редактирования (категория, питание, площадь, состояние, продажа). Корзина на плитке
            удаляет номер; если он уже был в бронях — предложит снять его с продажи. Цены и характеристики
            категорий — в «Категориях и тарифах».
          </>
        }
        actions={
          <>
            <Button variant="outlined" startIcon={<CategoryOutlined />} component={RouterLink} to="/room-categories">
              Категории и тарифы
            </Button>
            <DisabledReason
              reason={
                loading
                  ? "Загружаем номера…"
                  : !property
                    ? missingReason
                    : roomTypes.length === 0
                      ? "Сначала заведите категорию — номер добавляется в неё"
                      : null
              }
            >
              <Button
                variant="contained"
                disableElevation
                startIcon={<AddOutlined />}
                component={RouterLink}
                to="/rooms/new"
                disabled={loading || !property || roomTypes.length === 0}
              >
                Добавить номер
              </Button>
            </DisabledReason>
          </>
        }
      />

      {stateCounts.length > 0 && (
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={grouping}
            onChange={(_, v: Grouping | null) => v && setGrouping(v)}
            sx={{ mr: 1, "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 600, px: 1.5, py: 0.4 } }}
          >
            <ToggleButton value="floor">По этажам</ToggleButton>
            <ToggleButton value="category">По категориям</ToggleButton>
          </ToggleButtonGroup>
          <CountChip label="Все" count={allRooms.length} active={stateFilter === null} onClick={() => setStateFilter(null)} />
          {stateCounts.map((s) => (
            <CountChip
              key={s.state}
              color={hotelRoomStateColor(s.state, theme)}
              label={HOTEL_ROOM_STATE_LABELS[s.state]}
              count={s.count}
              active={stateFilter === s.state}
              onClick={() => setStateFilter(stateFilter === s.state ? null : s.state)}
            />
          ))}
          {offSaleCount > 0 && (
            <CountChip
              color={theme.palette.text.disabled}
              label="Сняты с продажи"
              count={offSaleCount}
              active={stateFilter === "offSale"}
              onClick={() => setStateFilter(stateFilter === "offSale" ? null : "offSale")}
            />
          )}
        </Stack>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : !property ? (
        <HotelPropertyMissing />
      ) : loadError ? (
        <Alert
          severity="error"
          variant="outlined"
          action={
            <Button color="inherit" size="small" onClick={retryLoad}>
              Повторить
            </Button>
          }
        >
          Не удалось загрузить номера.
        </Alert>
      ) : (
        roomTypes.length === 0 ? (
          <Surface>
            <EmptyState
              icon={<HotelOutlined />}
              title="Категорий пока нет"
              description="Сначала заведите категории с ценами в «Категориях и тарифах», затем добавляйте в них номера."
              action={
                <Button variant="contained" disableElevation component={RouterLink} to="/room-categories">
                  Перейти к категориям
                </Button>
              }
            />
          </Surface>
        ) : grouping === "floor" ? (
          <Stack gap={2}>
            {groupRoomsByFloor(allRooms.filter(matchesFilter)).map((g) => {
              const onSaleCount = g.rooms.filter((r) => r.status !== "out_of_service").length;
              return (
                <Surface key={g.floor || "none"}>
                  <Stack direction="row" alignItems="baseline" gap={1.5} sx={{ mb: 1.5 }}>
                    <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{floorGroupLabel(g.floor)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {g.rooms.length} {pluralRooms(g.rooms.length)}
                      {onSaleCount < g.rooms.length ? ` · ${g.rooms.length - onSaleCount} снят` : ""}
                    </Typography>
                  </Stack>
                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 1 }}>
                    {g.rooms.map((room) => (
                      <RoomTile
                        key={room.id}
                        room={room}
                        categoryName={typeName.get(room.roomTypeId)}
                        mealLabels={room.mealOptions.map((mo) => mealOptionChoices.find((c) => c.value === mo)?.label ?? mo)}
                        onOpen={() => navigate(`/rooms/${room.id}`)}
                      />
                    ))}
                  </Box>
                </Surface>
              );
            })}
            {allRooms.filter(matchesFilter).length === 0 && (
              <Surface>
                <EmptyState icon={<HotelOutlined />} title="Номеров пока нет" description="Добавьте номер — он появится на своём этаже." />
              </Surface>
            )}
          </Stack>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 2, alignItems: "start" }}>
            {roomTypes.map((cat) => {
              const rooms = (roomsByType.get(cat.id) ?? []).filter(matchesFilter);
              if (stateFilter !== null && rooms.length === 0) return null;
              const catRooms = roomsByType.get(cat.id) ?? [];
              const catOnSale = catRooms.filter((r) => r.status !== "out_of_service").length;
              const catOff = catRooms.length - catOnSale;
              return (
                <Surface key={cat.id} sx={{ display: "flex", flexDirection: "column" }}>
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 17, fontWeight: 700 }} noWrap>
                        {cat.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {catOnSale} {plural(catOnSale, "номер", "номера", "номеров")} в продаже{catOff > 0 ? ` · ${catOff} снят` : ""} · до {cat.capacity} гостей
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                      <Typography sx={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {Number(cat.totalPrice).toLocaleString("ru-RU")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        сом / ночь
                      </Typography>
                    </Box>
                  </Stack>

                  {rooms.length === 0 ? (
                    <Typography variant="body2" color="text.disabled">
                      Номеров пока нет
                    </Typography>
                  ) : (
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 1 }}>
                      {rooms.map((room) => (
                        <RoomTile
                          key={room.id}
                          room={room}
                          mealLabels={room.mealOptions.map((mo) => mealOptionChoices.find((c) => c.value === mo)?.label ?? mo)}
                          onOpen={() => navigate(`/rooms/${room.id}`)}
                        />
                      ))}
                    </Box>
                  )}
                </Surface>
              );
            })}
          </Box>
        )
      )}

    </HotelPage>
  );
};

/**
 * Плитка номера: крупный номер, под ним состояние точкой и словом. Клик —
 * карточка номера. Удаления на плитке нет: корзина при наведении и клавиша
 * Delete легко удаляли номер случайно — удаляют теперь из карточки номера
 * (RoomDeleteDialog). Снятый с продажи — пунктирная рамка и «снят».
 */
const RoomTile: React.FC<{ room: HotelRoom; mealLabels: string[]; onOpen: () => void; categoryName?: string }> = ({
  room,
  mealLabels,
  onOpen,
  categoryName,
}) => {
  const theme = useTheme();
  const offSale = room.status === "out_of_service";
  const stateLabel = HOTEL_ROOM_STATE_LABELS[room.state as HotelRoomState] ?? room.state;
  const color = hotelRoomStateColor(room.state, theme);
  const tooltip = [categoryName ?? "", stateLabel, offSale ? "Снят с продажи" : "", mealLabels.length ? `Питание: ${mealLabels.join(", ")}` : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <Tooltip title={tooltip}>
      <Box
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        aria-label={`Номер ${room.number}, ${stateLabel}${offSale ? ", снят с продажи" : ""}. Enter — открыть`}
        sx={{
          position: "relative",
          px: 1.25,
          py: 1,
          borderRadius: "10px",
          border: `1px ${offSale ? "dashed" : "solid"} ${subtleBorder(theme)}`,
          bgcolor: offSale ? "transparent" : subtleBg(theme),
          cursor: "pointer",
          transition: "border-color .12s, background-color .12s",
          "&:hover, &:focus-visible": { borderColor: "text.secondary", bgcolor: subtleBg(theme, true), outline: "none" },
        }}
      >
        <Typography
          sx={{
            fontSize: 17,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.2,
            textDecoration: offSale ? "line-through" : "none",
            color: offSale ? "text.secondary" : "text.primary",
          }}
        >
          {room.number}
        </Typography>
        {/* По этажам категория не видна из заголовка — подписываем у номера. */}
        {categoryName && (
          <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ mt: 0.25 }}>
            {categoryName}
          </Typography>
        )}
        <Stack direction="row" alignItems="center" gap={0.6} sx={{ mt: 0.5 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: offSale ? theme.palette.text.disabled : color, flexShrink: 0 }} />
          <Typography variant="caption" color="text.secondary" noWrap>
            {offSale ? "снят" : stateLabel}
          </Typography>
        </Stack>
      </Box>
    </Tooltip>
  );
};

export default HotelRoomsPage;
