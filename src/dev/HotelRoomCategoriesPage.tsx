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
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";

import { usePageTitle } from "../hooks/usePageTitle";
import { PricingSectionTabs } from "./PricingSectionTabs";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { getHotelCatalogs, listRoomTypes, listRooms } from "../api/hotel";
import { DisabledReason, EmptyState, HotelPage, HotelPageHeader, plural, Surface } from "./hotelUi";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";

export const HotelRoomCategoriesPage: React.FC = () => {
  usePageTitle("Категории и тарифы");
  const theme = useTheme();
  const { property, isLoading: propertyLoading, missingReason } = useHotelProperty();

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

  // Тот же ключ, что у «Номеров» и формы брони — обычно уже в кэше.
  const roomsQuery = useQuery({
    queryKey: ["hotel", "rooms", property?.id],
    queryFn: ({ signal }) => listRooms({ propertyId: property!.id }, signal),
    enabled: property != null,
  });
  const roomCounts = React.useMemo(() => {
    const map = new Map<number, number>();
    // Только номера в продаже — то же число, что на «Номерах», в отчёте и над шахматкой.
    for (const r of roomsQuery.data ?? []) if (r.status !== "out_of_service") map.set(r.roomTypeId, (map.get(r.roomTypeId) ?? 0) + 1);
    return map;
  }, [roomsQuery.data]);

  const loading = propertyLoading || catalogsQuery.isLoading || roomTypesQuery.isLoading;
  // Ошибку загрузки не выдаём за «Категорий пока нет»: при сбое сети это увело бы человека заводить дубли.
  const loadError = catalogsQuery.isError || roomTypesQuery.isError;
  const retryLoad = () => {
    void catalogsQuery.refetch();
    void roomTypesQuery.refetch();
  };

  const prices = roomTypes.map((c) => Number(c.totalPrice));
  const priceRange =
    prices.length > 0
      ? `${Math.min(...prices).toLocaleString("ru-RU")} – ${Math.max(...prices).toLocaleString("ru-RU")} сом за ночь`
      : undefined;

  return (
    <HotelPage>
      <PricingSectionTabs />
      <HotelPageHeader
        title="Категории и тарифы"
        subtitle={roomTypes.length > 0 ? `${roomTypes.length} ${plural(roomTypes.length, "категория", "категории", "категорий")} · ${priceRange}` : undefined}
        info="Категория (тариф) — цена за ночь и набор характеристик. Базовая цена задаётся без характеристик: каждая отмеченная характеристика добавляет свою наценку, итог считает бэкенд."
        actions={
          <DisabledReason reason={loading ? "Загружаем категории…" : !property ? missingReason : null}>
            <Button
              variant="contained"
              disableElevation
              startIcon={<AddOutlined />}
              component={RouterLink}
              to="/room-categories/new"
              disabled={loading || !property}
            >
              Добавить категорию
            </Button>
          </DisabledReason>
        }
      />

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
          Не удалось загрузить категории.
        </Alert>
      ) : (
        roomTypes.length === 0 ? (
          <Surface>
            <EmptyState
              icon={<CategoryOutlined />}
              title="Категорий пока нет"
              description="Категория — это тип номера с ценой за ночь и характеристиками. Заведите первую, затем добавьте в неё номера."
              action={
                <Button variant="contained" disableElevation startIcon={<AddOutlined />} component={RouterLink} to="/room-categories/new">
                  Добавить категорию
                </Button>
              }
            />
          </Surface>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 2, alignItems: "start" }}>
            {roomTypes.map((cat) => {
              const totalPrice = Number(cat.totalPrice);
              const basePrice = Number(cat.basePrice);
              const roomCount = roomCounts.get(cat.id) ?? 0;
              const facts = [`до ${cat.capacity} гостей`, cat.bedType, cat.roomLayout].filter(Boolean);
              return (
                <Box
                  key={cat.id}
                  component={RouterLink}
                  to={`/room-categories/${cat.id}`}
                  sx={{
                    display: "block",
                    color: "inherit",
                    textDecoration: "none",
                    borderRadius: "14px",
                    "&:hover .cat-card, &:focus-visible .cat-card": { borderColor: "text.secondary", bgcolor: subtleBg(theme) },
                    "&:hover .cat-edit, &:focus-visible .cat-edit": { opacity: 1 },
                  }}
                >
                <Surface
                  className="cat-card"
                  sx={{ height: "100%", display: "flex", flexDirection: "column", gap: 2, transition: "border-color .15s, background-color .15s" }}
                >
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <Typography sx={{ fontSize: 17, fontWeight: 700 }} noWrap>
                          {cat.name}
                        </Typography>
                        {cat.isLuxury && (
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
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                        {facts.join(" · ")}
                      </Typography>
                    </Box>
                    <EditOutlined className="cat-edit" sx={{ fontSize: 18, color: "text.secondary", opacity: 0.4, transition: "opacity .15s", flexShrink: 0 }} />
                  </Stack>

                  <Stack direction="row" alignItems="flex-end" justifyContent="space-between" gap={2}>
                    <Box>
                      <Stack direction="row" alignItems="baseline" gap={0.75}>
                        <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                          {totalPrice.toLocaleString("ru-RU")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" fontWeight={600}>
                          сом / ночь
                        </Typography>
                      </Stack>
                      {totalPrice !== basePrice && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                          база {basePrice.toLocaleString("ru-RU")} + характеристики {(totalPrice - basePrice).toLocaleString("ru-RU")}
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {roomCount} {plural(roomCount, "номер", "номера", "номеров")} в продаже
                    </Typography>
                  </Stack>

                  {cat.amenities.length > 0 && (
                    <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ pt: 2, borderTop: `1px solid ${subtleBorder(theme)}` }}>
                      {cat.amenities.map((key) => {
                        const def = amenitiesCatalog.find((a) => a.key === key);
                        const extra = def ? Number(def.extraPrice) : 0;
                        return (
                          <Box
                            key={key}
                            component="span"
                            sx={{ px: 1, py: 0.25, borderRadius: "6px", bgcolor: subtleBg(theme, true), fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap" }}
                          >
                            {def?.label ?? key}
                            {extra > 0 && (
                              <Box component="span" sx={{ color: "text.secondary", ml: 0.5 }}>
                                +{extra.toLocaleString("ru-RU")}
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </Stack>
                  )}
                </Surface>
                </Box>
              );
            })}
          </Box>
        )
      )}
    </HotelPage>
  );
};

export default HotelRoomCategoriesPage;
