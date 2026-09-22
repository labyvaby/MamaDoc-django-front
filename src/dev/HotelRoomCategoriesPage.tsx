/**
 * «Категории и тарифы» Viva — самостоятельная страница отеля: пункт сайдбара во
 * вкладке «Организация», а не раздел «Настроек» (рельса SettingsLayout здесь нет).
 * Маршрут /room-categories гейтит hotel.manage (PAGE_PERMISSIONS.hotelRoomCategories,
 * см. App.tsx, accessPermissions.ts).
 * Вынесена из «Номера» (HotelRoomsPage.tsx): там остались только сами номера, а
 * категории — типы номеров с ценой за ночь, которые в интерфейсе называют
 * тарифами, — смотрятся здесь.
 *
 * Здесь только список категорий и их тарифов (цена за ночь, гости, характеристики)
 * без самих номеров — ни счётчика, ни перечня: номера живут на странице «Номера»
 * (HotelRoomsPage.tsx). Добавление («Добавить категорию» → /room-categories/new)
 * и правка («Изменить» → /room-categories/:categoryId) — отдельная страница-форма
 * HotelRoomCategoryFormPage.tsx, а не диалог.
 *
 * Реальный бэкенд (src/api/hotel.ts): GET /hotel/room-types/ и справочник
 * характеристик GET /hotel/catalogs/amenities/ (см. hotel-viva-frontend-api.md
 * §4.2, §6). totalPrice считает бэкенд (basePrice + Σ extraPrice отмеченных
 * характеристик) — фронт его не пересчитывает.
 */
import React from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography, useTheme } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";

import { usePageTitle } from "../hooks/usePageTitle";
import { useHotelProperty } from "./useHotelProperty";
import { getHotelCatalogs, listRoomTypes } from "../api/hotel";

export const HotelRoomCategoriesPage: React.FC = () => {
  usePageTitle("Категории и тарифы");
  const theme = useTheme();
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
  // Ошибку загрузки не выдаём за «Категорий пока нет»: при сбое сети это увело бы человека заводить дубли.
  const loadError = catalogsQuery.isError || roomTypesQuery.isError;
  const retryLoad = () => {
    void catalogsQuery.refetch();
    void roomTypesQuery.refetch();
  };

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack spacing={2}>
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
          to="/room-categories/new"
          disabled={!property}
        >
          Добавить категорию
        </Button>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
        Категория (тариф) — цена за ночь и набор характеристик. Цена задаётся без характеристик: каждая
        отмеченная характеристика добавляет свою наценку сверху, итог считает бэкенд и показан в списке.
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
          Не удалось загрузить категории.
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
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: cat.amenities.length > 0 ? 1.25 : 0 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {cat.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      до {cat.capacity} гостей
                    </Typography>
                  </Box>
                  {/* Цена за ночь (тариф) — главное значение карточки, поэтому крупно, а не мелким серым. */}
                  <Stack direction="row" alignItems="center" gap={1.5}>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                        {totalPrice.toLocaleString("ru-RU")} сом
                        <Typography component="span" variant="caption" color="text.secondary">
                          {" "}
                          / ночь
                        </Typography>
                      </Typography>
                      {totalPrice !== basePrice && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          база {basePrice.toLocaleString("ru-RU")}
                        </Typography>
                      )}
                    </Box>
                    <Button
                      size="small"
                      startIcon={<EditOutlined fontSize="small" />}
                      component={RouterLink}
                      to={`/room-categories/${cat.id}`}
                    >
                      Изменить
                    </Button>
                  </Stack>
                </Stack>
                {cat.amenities.length > 0 && (
                  <Stack direction="row" flexWrap="wrap" gap={0.5}>
                    {cat.amenities.map((key) => {
                      const def = amenitiesCatalog.find((a) => a.key === key);
                      const extra = def ? Number(def.extraPrice) : 0;
                      const label = def ? (extra > 0 ? `${def.label} +${extra.toLocaleString("ru-RU")}` : def.label) : key;
                      return <Chip key={key} label={label} size="small" variant="outlined" sx={{ height: 22, fontSize: "0.75rem" }} />;
                    })}
                  </Stack>
                )}
              </Paper>
            );
          })}
        </Stack>
      )}
      </Stack>
    </Box>
  );
};

export default HotelRoomCategoriesPage;
