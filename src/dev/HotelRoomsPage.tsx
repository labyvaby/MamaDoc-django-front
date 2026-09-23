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
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "react-router";
import { useSnackbar } from "notistack";

import { usePageTitle } from "../hooks/usePageTitle";
import { useHotelProperty } from "./useHotelProperty";
import { getHotelCatalogs, listRoomTypes, listRooms, updateRoom, deleteRoom, type HotelRoom } from "../api/hotel";
import { ApiError, getErrorMessage } from "../api/client";
import { HOTEL_ROOM_STATE_LABELS, hotelRoomStateColor, type HotelRoomState } from "./hotelDisplay";

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

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Stack direction="row" alignItems="center" gap={1}>
          <HotelOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            Номера
          </Typography>
        </Stack>
        <Stack direction="row" gap={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<CategoryOutlined />}
            component={RouterLink}
            to="/room-categories"
          >
            Категории и тарифы
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddOutlined />}
            component={RouterLink}
            to="/rooms/new"
            disabled={!property || roomTypes.length === 0}
          >
            Добавить номер
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
        Номера Viva, сгруппированные по категориям. Новый номер сразу появляется в шахматке броней и в
        списке выбора при создании брони; нажмите на номер — откроется страница его редактирования
        (категория, код, питание, площадь и другие характеристики, состояние, продажа); ✕ на чипе —
        удаляет номер после подтверждения (если он уже фигурирует в бронях, предложат снять его с
        продажи). Сами категории, их цены и характеристики — в разделе «Категории и тарифы».
      </Alert>

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
        <Stack gap={2} sx={{ maxWidth: 640 }}>
          {roomTypes.length === 0 && (
            <Typography variant="body2" color="text.disabled">
              Категорий пока нет — сначала заведите их в разделе «Категории и тарифы», затем добавляйте номера.
            </Typography>
          )}
          {roomTypes.map((cat) => {
            const rooms = roomsByType.get(cat.id) ?? [];
            const totalPrice = Number(cat.totalPrice);
            return (
              <Paper key={cat.id} elevation={0} variant="outlined" sx={{ p: 1.75 }}>
                <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap" sx={{ mb: 1 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {cat.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {totalPrice.toLocaleString("ru-RU")} сом/ночь · до {cat.capacity} гостей
                  </Typography>
                </Stack>
                <Stack direction="row" flexWrap="wrap" gap={0.75}>
                  {rooms.length === 0 && (
                    <Typography variant="caption" color="text.disabled">
                      Номеров пока нет
                    </Typography>
                  )}
                  {rooms.map((room) => {
                    const offSale = room.status === "out_of_service";
                    const stateLabel = HOTEL_ROOM_STATE_LABELS[room.state as HotelRoomState] ?? room.state;
                    const chip = (
                      <Chip
                        key={room.id}
                        // Состояние — цветная точка (те же цвета, что в шахматке), «снят с продажи» —
                        // ещё и словом «снят» (зачёркнут только номер, слово — нет).
                        label={
                          <Stack component="span" direction="row" alignItems="center" gap={0.75}>
                            <Box
                              component="span"
                              sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: hotelRoomStateColor(room.state, theme), flexShrink: 0 }}
                            />
                            <Box component="span" sx={offSale ? { textDecoration: "line-through" } : undefined}>
                              {room.number}
                            </Box>
                            {offSale && (
                              <Typography component="span" variant="caption" color="text.secondary">
                                снят
                              </Typography>
                            )}
                          </Stack>
                        }
                        aria-label={`Номер ${room.number}, ${stateLabel}${offSale ? ", снят с продажи" : ""}. Нажмите, чтобы открыть редактирование; Delete — удалить`}
                        size="small"
                        onClick={() => navigate(`/rooms/${room.id}`)}
                        onDelete={() => askDelete(room)}
                        sx={offSale ? { opacity: 0.75 } : undefined}
                      />
                    );
                    const mealLabels = room.mealOptions.map((mo) => mealOptionChoices.find((c) => c.value === mo)?.label ?? mo);
                    const tooltipTitle =
                      `${stateLabel} · ` +
                      (offSale ? "Снят с продажи · " : "") +
                      (mealLabels.length === 0 ? "Нажмите, чтобы изменить" : `Питание: ${mealLabels.join(", ")} · нажмите, чтобы изменить`);
                    return (
                      <Tooltip key={room.id} title={tooltipTitle}>
                        {chip}
                      </Tooltip>
                    );
                  })}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
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
      </Stack>
    </Box>
  );
};

export default HotelRoomsPage;
