/**
 * «Настройки» → «Категории и тарифы» для Viva — вкладка рельса SettingsLayout.tsx,
 * видна только vertical==="hotel" (useVisibleSettingsTabs), маршрут
 * /settings/room-categories гейтит hotel.manage (см. App.tsx, accessPermissions.ts).
 * Вынесена из «Номера» (HotelRoomsSettingsPage.tsx): там остались только сами
 * номера, а категории — типы номеров с ценой за ночь, которые в интерфейсе
 * называют тарифами, — смотрятся здесь.
 *
 * Здесь только список. Добавление («Добавить категорию» → /settings/room-categories/new)
 * и правка («Изменить» → /settings/room-categories/:categoryId) — отдельная страница-форма
 * HotelRoomCategoryFormPage.tsx, а не диалог.
 *
 * Реальный бэкенд (src/api/hotel.ts): GET /hotel/room-types/ и справочник
 * характеристик GET /hotel/catalogs/amenities/ (см. hotel-viva-frontend-api.md
 * §4.2, §6). totalPrice считает бэкенд (basePrice + Σ extraPrice отмеченных
 * характеристик) — фронт его не пересчитывает.
 */
import React from "react";
import { Alert, Button, Chip, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";

import { usePageTitle } from "../hooks/usePageTitle";
import { SettingsLayout } from "../pages/settings/SettingsLayout";
import { useHotelProperty } from "./useHotelProperty";
import { getHotelCatalogs, listRoomTypes } from "../api/hotel";

export const HotelRoomCategoriesSettingsPage: React.FC = () => {
  usePageTitle("Категории и тарифы");
  const { property } = useHotelProperty();

  const catalogsQuery = useQuery({
    queryKey: ["hotel", "catalogs", property?.id],
    queryFn: ({ signal }) => getHotelCatalogs(property!.id, signal),
    enabled: property != null,
  });
  const amenitiesCatalog = catalogsQuery.data?.amenities ?? [];

  const roomTypesQuery = useQuery({
    queryKey: ["hotel", "roomTypes", property?.id],
    queryFn: ({ signal }) => listRoomTypes(property!.id, {}, signal),
    enabled: property != null,
  });
  const roomTypes = roomTypesQuery.data ?? [];

  const loading = catalogsQuery.isLoading || roomTypesQuery.isLoading;

  return (
    <SettingsLayout>
      <Stack spacing={2} sx={{ height: "100%" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Stack direction="row" alignItems="center" gap={1}>
          <CategoryOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            Категории и тарифы
          </Typography>
        </Stack>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddOutlined />}
          component={RouterLink}
          to="/settings/room-categories/new"
          disabled={!property}
        >
          Добавить категорию
        </Button>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
        Категория (тариф) — тип номера с ценой за ночь. Цена категории — это номер «без ничего»: каждая
        отмеченная характеристика добавляет свою наценку сверху, итог считает бэкенд и показан в карточке
        категории и в «Изменить». Сами номера заводятся в разделе «Номера» — они привязываются к категории
        и сразу появляются в шахматке броней и в списке выбора при создании брони.
      </Alert>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : !property ? (
        <Alert severity="warning" variant="outlined">
          Не найден объект размещения для текущего филиала.
        </Alert>
      ) : (
        <Stack gap={2} sx={{ maxWidth: 640 }}>
          {roomTypes.length === 0 && (
            <Typography variant="body2" color="text.disabled">
              Категорий пока нет — начните с «Добавить категорию».
            </Typography>
          )}
          {roomTypes.map((cat) => {
            const totalPrice = Number(cat.totalPrice);
            const basePrice = Number(cat.basePrice);
            return (
              <Paper key={cat.id} elevation={0} variant="outlined" sx={{ p: 1.75 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5} sx={{ mb: cat.amenities.length > 0 ? 1 : 0 }}>
                  <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
                    <Typography variant="body2" fontWeight={600}>
                      {cat.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {totalPrice.toLocaleString("ru-RU")} сом/ночь
                      {totalPrice !== basePrice && ` (база ${basePrice.toLocaleString("ru-RU")})`} · до {cat.capacity} гостей ·
                      номеров: {cat.roomsCount}
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    startIcon={<EditOutlined fontSize="small" />}
                    component={RouterLink}
                    to={`/settings/room-categories/${cat.id}`}
                  >
                    Изменить
                  </Button>
                </Stack>
                {cat.amenities.length > 0 && (
                  <Stack direction="row" flexWrap="wrap" gap={0.5}>
                    {cat.amenities.map((key) => {
                      const def = amenitiesCatalog.find((a) => a.key === key);
                      const extra = def ? Number(def.extraPrice) : 0;
                      const label = def ? (extra > 0 ? `${def.label} +${extra.toLocaleString("ru-RU")}` : def.label) : key;
                      return <Chip key={key} label={label} size="small" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />;
                    })}
                  </Stack>
                )}
              </Paper>
            );
          })}
        </Stack>
      )}
      </Stack>
    </SettingsLayout>
  );
};

export default HotelRoomCategoriesSettingsPage;
