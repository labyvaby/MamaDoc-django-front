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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "react-router";
import { useSnackbar } from "notistack";

import { usePageTitle } from "../hooks/usePageTitle";
import { useHotelProperty } from "./useHotelProperty";
import { getHotelCatalogs, listRoomTypes, listRooms, updateRoom, deleteRoom, type HotelRoom } from "../api/hotel";
import { ApiError, getErrorMessage } from "../api/client";
import { HOTEL_ROOM_STATE_LABELS, HOTEL_ROOM_STATES, hotelRoomStateColor, type HotelRoomState } from "./hotelDisplay";
import { CountChip, EmptyState, HotelPage, HotelPageHeader, plural, Surface } from "./hotelUi";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";

export const HotelRoomsPage: React.FC = () => {
  usePageTitle("Номера");
  const theme = useTheme();
  const navigate = useNavigate();
  const { property } = useHotelProperty();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

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
  const roomTypes = roomTypesQuery.data ?? [];

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

  const invalidateRoomTypes = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "roomTypes", property?.id] });
  const invalidateRooms = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "rooms", property?.id] });

  // Удаление: сначала подтверждение. Если номер уже фигурировал в бронях (HAS_DEPENDENTS),
  // второй шаг предлагает снять его с продажи — раньше это делалось молча, хотя человек
  // нажал «удалить». Ошибки показываем внутри диалога, рядом с действием.
  type DeleteStep = "confirm" | "deactivate" | "blocked";
  const [deleteTarget, setDeleteTarget] = React.useState<{ room: HotelRoom; step: DeleteStep } | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteDialogError, setDeleteDialogError] = React.useState<string | null>(null);

  const askDelete = (room: HotelRoom) => {
    setDeleteDialogError(null);
    setDeleteTarget({ room, step: "confirm" });
  };
  const closeDelete = () => {
    if (!deleteBusy) setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { room } = deleteTarget;
    setDeleteBusy(true);
    setDeleteDialogError(null);
    try {
      await deleteRoom(room.id);
      invalidateRooms();
      invalidateRoomTypes();
      setDeleteTarget(null);
      enqueueSnackbar(`Номер ${room.number} удалён`, { variant: "success" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "HAS_DEPENDENTS") {
        // Номер уже в бронях — удалить нельзя. Уже снятому с продажи предлагать нечего.
        setDeleteTarget({ room, step: room.status === "out_of_service" ? "blocked" : "deactivate" });
      } else {
        setDeleteDialogError(getErrorMessage(err, "Не удалось удалить номер"));
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!deleteTarget) return;
    const { room } = deleteTarget;
    setDeleteBusy(true);
    setDeleteDialogError(null);
    try {
      await updateRoom(room.id, { status: "out_of_service" });
      invalidateRooms();
      setDeleteTarget(null);
      enqueueSnackbar(`Номер ${room.number} снят с продажи`, { variant: "success" });
    } catch (err) {
      setDeleteDialogError(getErrorMessage(err, "Не удалось снять номер с продажи"));
    } finally {
      setDeleteBusy(false);
    }
  };

  const loading = catalogsQuery.isLoading || roomTypesQuery.isLoading || roomsQuery.isLoading;
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
  const [stateFilter, setStateFilter] = React.useState<HotelRoomState | null>(null);

  return (
    <HotelPage>
      <HotelPageHeader
        title="Номера"
        subtitle={
          allRooms.length > 0
            ? `${allRooms.length} ${plural(allRooms.length, "номер", "номера", "номеров")} в ${roomTypes.length} ${plural(roomTypes.length, "категории", "категориях", "категориях")}` +
              (allRooms.length !== onSale.length ? ` · ${allRooms.length - onSale.length} снято с продажи` : "")
            : undefined
        }
        info={
          <>
            Номера сгруппированы по категориям. Новый номер сразу появляется в шахматке и в форме брони. Клик по
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
            <Button
              variant="contained"
              disableElevation
              startIcon={<AddOutlined />}
              component={RouterLink}
              to="/rooms/new"
              disabled={!property || roomTypes.length === 0}
            >
              Добавить номер
            </Button>
          </>
        }
      />

      {stateCounts.length > 0 && (
        <Stack direction="row" gap={1} flexWrap="wrap">
          <CountChip label="Все" count={onSale.length} active={stateFilter === null} onClick={() => setStateFilter(null)} />
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
        </Stack>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : !property ? (
        <Alert severity="warning" variant="outlined">
          Не найден объект размещения для текущего филиала.
        </Alert>
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
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 2, alignItems: "start" }}>
            {roomTypes.map((cat) => {
              const rooms = (roomsByType.get(cat.id) ?? []).filter((r) => stateFilter === null || r.state === stateFilter);
              if (stateFilter !== null && rooms.length === 0) return null;
              const totalRooms = roomsByType.get(cat.id)?.length ?? 0;
              return (
                <Surface key={cat.id} sx={{ display: "flex", flexDirection: "column" }}>
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 17, fontWeight: 700 }} noWrap>
                        {cat.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {totalRooms} {plural(totalRooms, "номер", "номера", "номеров")} · до {cat.capacity} гостей
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
                          onDelete={() => askDelete(room)}
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

      <Dialog open={deleteTarget != null} onClose={closeDelete} maxWidth="xs" fullWidth>
        <DialogTitle>
          {deleteTarget?.step === "confirm" && `Удалить номер ${deleteTarget.room.number}?`}
          {deleteTarget?.step === "deactivate" && `Номер ${deleteTarget.room.number} есть в бронях`}
          {deleteTarget?.step === "blocked" && `Номер ${deleteTarget.room.number} нельзя удалить`}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {deleteTarget?.step === "confirm" &&
              "Номер будет удалён из объекта и пропадёт из шахматки. Если он уже фигурирует в бронях, удалить его нельзя — тогда вам предложат снять его с продажи."}
            {deleteTarget?.step === "deactivate" &&
              "Удалить нельзя: номер уже фигурирует в бронях. Снять его с продажи вместо удаления? Существующие брони не пострадают, вернуть номер в продажу можно на странице номера."}
            {deleteTarget?.step === "blocked" &&
              "Номер уже фигурирует в бронях, поэтому удалить его нельзя. Он уже снят с продажи."}
          </Typography>
          {deleteDialogError && (
            <Alert severity="error" variant="outlined" sx={{ mt: 2, fontSize: "0.8rem" }}>
              {deleteDialogError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDelete} disabled={deleteBusy}>
            {deleteTarget?.step === "blocked" ? "Закрыть" : "Отмена"}
          </Button>
          {deleteTarget?.step === "confirm" && (
            <Button color="error" variant="contained" disabled={deleteBusy} onClick={() => void confirmDelete()}>
              {deleteBusy ? "Удаляем…" : "Удалить"}
            </Button>
          )}
          {deleteTarget?.step === "deactivate" && (
            <Button variant="contained" disabled={deleteBusy} onClick={() => void confirmDeactivate()}>
              {deleteBusy ? "Снимаем…" : "Снять с продажи"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </HotelPage>
  );
};

/**
 * Плитка номера: крупный номер, под ним состояние точкой и словом. Клик —
 * редактирование; корзина проявляется при наведении (раньше — ✕ на чипе,
 * который легко задеть). Снятый с продажи — пунктирная рамка и «снят».
 */
const RoomTile: React.FC<{ room: HotelRoom; mealLabels: string[]; onOpen: () => void; onDelete: () => void }> = ({
  room,
  mealLabels,
  onOpen,
  onDelete,
}) => {
  const theme = useTheme();
  const offSale = room.status === "out_of_service";
  const stateLabel = HOTEL_ROOM_STATE_LABELS[room.state as HotelRoomState] ?? room.state;
  const color = hotelRoomStateColor(room.state, theme);
  const tooltip = [stateLabel, offSale ? "Снят с продажи" : "", mealLabels.length ? `Питание: ${mealLabels.join(", ")}` : ""]
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
          if (e.key === "Delete") onDelete();
        }}
        aria-label={`Номер ${room.number}, ${stateLabel}${offSale ? ", снят с продажи" : ""}. Enter — открыть, Delete — удалить`}
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
          "&:hover .room-tile-delete, &:focus-visible .room-tile-delete": { opacity: 1 },
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
        <Stack direction="row" alignItems="center" gap={0.6} sx={{ mt: 0.5 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: offSale ? theme.palette.text.disabled : color, flexShrink: 0 }} />
          <Typography variant="caption" color="text.secondary" noWrap>
            {offSale ? "снят" : stateLabel}
          </Typography>
        </Stack>
        <IconButton
          className="room-tile-delete"
          size="small"
          aria-label={`Удалить номер ${room.number}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          sx={{ position: "absolute", top: 2, right: 2, opacity: 0, transition: "opacity .12s", color: "text.secondary", "&:hover": { color: "error.main" } }}
        >
          <DeleteOutlineOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Tooltip>
  );
};

export default HotelRoomsPage;
