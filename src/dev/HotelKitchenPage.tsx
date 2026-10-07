/**
 * «Кухня» — во сколько какие блюда готовить и сколько продуктов на это надо
 * купить. Реальный бэкенд — GET /hotel/kitchen/day-plan/ (см. src/api/hotel.ts)
 * одним вызовом отдаёт блюда+порции+список закупки. Порции считает бэк: гости,
 * у кого приём пищи блюда входит в питание брони (mealGuests), × portionsPerGuest;
 * старый сервер — все проживающие (occupiedGuests).
 *
 * Три числа на продукт, не два: «Нужно по рецепту» (весь расход) — норма,
 * не редактируется; «Есть на складе» — то, что уже лежит на кухне с прошлой
 * закупки, редактируется отдельно через PATCH /hotel/kitchen/stock/ (это
 * переучёт, а не сегодняшняя покупка); «Докупить» = нужно − остаток, считает
 * бэкенд. Факт закупки (сколько купили и почём) — upsert по (дата,
 * ингредиент): POST /hotel/kitchen/purchases/ перезаписывает, а не только
 * создаёт, поэтому запись можно открыть и поправить в любой момент. «Купил»
 * теперь не свободный текст — бэкенд сам подставляет текущего сотрудника
 * (purchasedByName), поле для ручного ввода убрано.
 */
import React from "react";
import ShoppingBasketOutlined from "@mui/icons-material/ShoppingBasketOutlined";
import SellOutlined from "@mui/icons-material/SellOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import { FormField } from "./formField";
import { hasFieldErrors } from "./formRules";
import { KITCHEN_RULES, unitRu } from "./kitchenShared";
import { KitchenMenuPanel } from "./KitchenMenuPanel";
import { KitchenProductsPanel } from "./KitchenProductsPanel";
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
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EditOutlined from "@mui/icons-material/EditOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { Navigate, useNavigate } from "react-router";
import { useInHouse } from "./useInHouse";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../hooks/usePageTitle";
import { useCan } from "../hooks/useCan";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { DateStepper, EmptyState, HotelPage, HotelPageHeader, MetricTile, plural, SectionLabel, StatusPill, Surface, useHotelTableSx } from "./hotelUi";
import { useIsVivaActive, MEAL_LABELS, MEAL_SERVING_WINDOW, type MealType } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { getKitchenDayPlan, upsertPurchase, deletePurchase, updateStock, type HotelShoppingLine } from "../api/hotel";
import { getErrorMessage } from "../api/client";

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

interface PurchaseEditTarget {
  item: HotelShoppingLine;
  purchasedQty: string;
  actualPricePerUnit: string;
}

interface StockEditTarget {
  ingredientId: number;
  name: string;
  unit: string;
  qty: string;
}

export const HotelKitchenPage: React.FC = () => {
  usePageTitle("Кухня");
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const vivaActive = useIsVivaActive();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const queryClient = useQueryClient();
  // Страница открыта по hotel.kitchen.view; закупки и остатки бэк пишет только
  // по hotel.kitchen.purchases — без него таблица только для чтения.
  const canPurchase = useCan("hotel.kitchen.purchases");

  // «План на день» — то, что было; «Меню» и «Продукты» — справочники, из
  // которых бэк считает план (раньше их мог менять только разработчик).
  const [tab, setTab] = React.useState<"plan" | "menu" | "products">("plan");
  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const dateStr = date.format("YYYY-MM-DD");

  const planQuery = useQuery({
    queryKey: ["hotel", "kitchen", "dayPlan", property?.id, dateStr],
    queryFn: ({ signal }) => getKitchenDayPlan(property!.id, dateStr, signal),
    enabled: property != null,
  });
  const plan = planQuery.data;

  const invalidatePlan = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "kitchen", "dayPlan", property?.id, dateStr] });

  const [purchaseEdit, setPurchaseEdit] = React.useState<PurchaseEditTarget | null>(null);
  const [purchaseSaving, setPurchaseSaving] = React.useState(false);
  const [purchaseError, setPurchaseError] = React.useState<string | null>(null);

  const [stockEdit, setStockEdit] = React.useState<StockEditTarget | null>(null);
  const [stockSaving, setStockSaving] = React.useState(false);
  const [stockError, setStockError] = React.useState<string | null>(null);

  // Порции сервер считает и по броням, где гость не заехал; пока их не отметили «Незаезд» — предупреждаем.
  const inHouse = useInHouse(property?.id, dateStr, property != null).data;
  const navigate = useNavigate();

  // После хуков (Rules of Hooks) — страница доступна только Viva, у
  // остальных организаций такой кухни нет.
  if (!vivaActive) return <Navigate to="/" replace />;

  const isToday = dateStr === dayjs().format("YYYY-MM-DD");

  const openPurchaseEdit = (item: HotelShoppingLine) => {
    setPurchaseError(null);
    setPurchaseEdit({
      item,
      purchasedQty: String(Number(item.purchase?.purchasedQty ?? item.toBuyQty)),
      actualPricePerUnit: String(Number(item.purchase?.actualPricePerUnit ?? item.pricePerUnit)),
    });
  };

  const savePurchaseEdit = async () => {
    if (!purchaseEdit || !property) return;
    const qty = Number(purchaseEdit.purchasedQty);
    const price = Number(purchaseEdit.actualPricePerUnit);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) return;
    setPurchaseSaving(true);
    setPurchaseError(null);
    try {
      await upsertPurchase({
        propertyId: property.id,
        date: dateStr,
        ingredientId: purchaseEdit.item.ingredientId,
        purchasedQty: String(qty),
        actualPricePerUnit: String(price),
      });
      invalidatePlan();
      setPurchaseEdit(null);
    } catch (err) {
      setPurchaseError(getErrorMessage(err, "Не удалось сохранить закупку"));
    } finally {
      setPurchaseSaving(false);
    }
  };

  const clearPurchase = async () => {
    if (!purchaseEdit?.item.purchase) return;
    setPurchaseSaving(true);
    setPurchaseError(null);
    try {
      await deletePurchase(purchaseEdit.item.purchase.id);
      invalidatePlan();
      setPurchaseEdit(null);
    } catch (err) {
      setPurchaseError(getErrorMessage(err, "Не удалось убрать отметку"));
    } finally {
      setPurchaseSaving(false);
    }
  };

  const openStockEdit = (item: HotelShoppingLine) => {
    setStockError(null);
    setStockEdit({ ingredientId: item.ingredientId, name: item.ingredientName, unit: item.unit, qty: String(Number(item.inStockQty)) });
  };

  const saveStockEdit = async () => {
    if (!stockEdit || !property) return;
    const qty = Number(stockEdit.qty);
    if (!Number.isFinite(qty) || qty < 0) return;
    setStockSaving(true);
    setStockError(null);
    try {
      await updateStock(property.id, [{ ingredientId: stockEdit.ingredientId, stockQty: String(qty) }]);
      invalidatePlan();
      setStockEdit(null);
    } catch (err) {
      setStockError(getErrorMessage(err, "Не удалось сохранить остаток"));
    } finally {
      setStockSaving(false);
    }
  };

  // Порции, «Нужно», «Докупить» и суммы — как есть от бэка: он считает
  // round(гостей с этим питанием × порций на гостя) без минимума. Фронт
  // ничего не пересчитывает. noGuests — только для подсказки и чтобы не
  // предлагать «Купил» на меню, по которому готовить не для кого.
  const noGuests = plan != null && plan.occupiedGuests === 0;
  const totalPlanned = plan ? Number(plan.plannedTotal) : 0;
  const totalPortions = plan ? plan.dishes.reduce((sum, d) => sum + d.portions, 0) : 0;
  // Новый сервер считает порции по питанию в бронях (mealGuests): «без питания» не ест,
  // завтрак — у ночевавших. Гости есть, а порций ноль — значит, их тарифы без питания.
  const mealGuests = plan?.mealGuests && Object.keys(plan.mealGuests).length > 0 ? plan.mealGuests : null;
  const noMeals = mealGuests != null && plan != null && plan.occupiedGuests > 0 && totalPortions === 0;
  const guestsWord = (n: number) => `${n} ${plural(n, "гостя", "гостей", "гостей")}`;
  const purchasedCount = plan ? plan.shoppingList.filter((i) => i.purchase).length : 0;

  const toBuyCount = plan ? plan.shoppingList.filter((i) => Number(i.toBuyQty) > 0).length : 0;

  return (
    <HotelPage>
      <HotelPageHeader
        title="Кухня"
        subtitle={
          tab === "plan" && plan
            ? mealGuests
              ? MEAL_ORDER.map((m) => `${MEAL_LABELS[m].toLowerCase()} на ${guestsWord(mealGuests[m] ?? 0)}`).join(" · ").replace(/^./, (c) => c.toUpperCase())
              : `Меню и закупка на ${guestsWord(plan.occupiedGuests)}`
            : tab === "menu"
              ? "Блюда и рецепты — по ним считаются порции и закупка"
              : tab === "products"
                ? "Из чего готовит кухня: цены и остатки"
                : undefined
        }
        info={
          <>
            Порции считаются по питанию в бронях: блюдо готовится на гостей (взрослые и дети), у кого его приём пищи входит в
            тариф или бронь — полупансион это завтрак и ужин, полный пансион и «всё включено» — все три; гости «без питания» в порции не
            входят. Завтрак на дату — для тех, кто ночевал в ночь перед ней. Порций = гостей × порций на гостя у блюда. «Нужно» и «Докупить» не
            редактируются: «Докупить» = нужно минус то, что есть на складе. «На складе» и «Куплено» — ввод
            сотрудника, их всегда можно поправить.
          </>
        }
        actions={tab === "plan" ? <DateStepper value={date} onChange={setDate} /> : undefined}
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 40, mt: -1, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 } }}>
        <Tab value="plan" label="План на день" />
        <Tab value="menu" label="Меню" />
        <Tab value="products" label="Продукты" />
      </Tabs>

      {/* Сервер сам не считает незаезды и ранние выезды — просто говорим, сколько гостей не вошло в порции. */}
      {tab === "plan" && plan && plan.noShowGuests !== undefined && (plan.noShowGuests > 0 || (plan.departedGuests ?? 0) > 0) && (
        <Alert severity="info" variant="outlined">
          В порции не вошли:{" "}
          {[
            plan.noShowGuests > 0 ? `${plan.noShowGuests} ${plural(plan.noShowGuests, "гость не заехал", "гостя не заехали", "гостей не заехали")}` : "",
            (plan.departedGuests ?? 0) > 0
              ? `${plan.departedGuests} ${plural(plan.departedGuests ?? 0, "гость уже выехал", "гостя уже выехали", "гостей уже выехали")}`
              : "",
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </Alert>
      )}

      {/* Старый сервер: незаезды сидят в порциях — подсказываем закрыть день. */}
      {tab === "plan" && plan && plan.noShowGuests === undefined && (inHouse?.missedGuests ?? 0) > 0 && (
        <Alert
          severity="warning"
          variant="outlined"
          // На телефоне кнопка в правой колонке сжималась до переноса по слову — уходит под текст.
          sx={{ flexWrap: { xs: "wrap", md: "nowrap" }, "& .MuiAlert-action": { width: { xs: "100%", md: "auto" }, ml: { xs: 0, md: "auto" }, pl: { xs: "36px", md: 2 }, pt: { xs: 0, md: "4px" } } }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate("/reception")}>
              На ресепшен
            </Button>
          }
        >
          В порции посчитаны {inHouse!.missedGuests} {plural(inHouse!.missedGuests, "гость", "гостя", "гостей")}, которые не заехали. Отметьте
          незаезд на ресепшене («Закрыть день») — и план пересчитается.
        </Alert>
      )}

      {!property && !propertyLoading ? (
        <HotelPropertyMissing />
      ) : tab === "menu" && property ? (
        <KitchenMenuPanel propertyId={property.id} />
      ) : tab === "products" && property ? (
        <KitchenProductsPanel propertyId={property.id} />
      ) : !plan ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : noGuests && purchasedCount === 0 ? (
        // Пустой день — одна строка, а не меню и таблица закупки из нулей.
        // Если на этот день уже что-то отмечено купленным, таблицу показываем
        // (ниже), чтобы отметку можно было поправить или убрать.
        <Surface>
          <EmptyState
            icon={<RestaurantOutlined />}
            title={isToday ? "Сегодня готовить нечего" : "На эту дату готовить нечего"}
            description="Гостей нет — ни блюд, ни закупки. Выберите другую дату, чтобы посмотреть меню и список продуктов."
          />
        </Surface>
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
            <MetricTile
              label="Гостей"
              value={plan.occupiedGuests}
              hint={`в ${plan.occupiedRooms} ${plural(plan.occupiedRooms, "номере", "номерах", "номерах")} · ${isToday ? "сегодня" : "на выбранную дату"}`}
            />
            <MetricTile label="Блюд в меню" value={plan.dishes.length} hint={noGuests ? "готовить не для кого" : `${totalPortions} порций всего`} />
            <MetricTile
              label="Куплено"
              value={`${purchasedCount} / ${plan.shoppingList.length}`}
              hint={toBuyCount > 0 ? `${toBuyCount} ${plural(toBuyCount, "позицию", "позиции", "позиций")} докупить` : "всего хватает"}
              accent={purchasedCount === plan.shoppingList.length ? theme.palette.success.main : undefined}
            />
            <MetricTile label="Докупить на сумму" value={`${totalPlanned.toLocaleString("ru-RU")} сом`} hint="по плановым ценам" />
          </Box>

          {noMeals && (
            <Surface sx={{ py: 1.75, bgcolor: "transparent", borderStyle: "dashed" }}>
              <Typography variant="body2" color="text.secondary">
                Гостей {plan.occupiedGuests}, но питание в их бронях не включено — по тарифам готовить не нужно. Если отель кормит
                всех, укажите питание в тарифном плане или в брони.
              </Typography>
            </Surface>
          )}

          {noGuests && (
            <Surface sx={{ py: 1.75, bgcolor: "transparent", borderStyle: "dashed" }}>
              <Typography variant="body2" color="text.secondary">
                На эту дату гостей нет — готовить и закупать ничего не нужно. Меню ниже показано для справки.
              </Typography>
            </Surface>
          )}

          <Box>
            <SectionLabel>Расписание готовки</SectionLabel>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
              {MEAL_ORDER.map((meal) => {
                const window = MEAL_SERVING_WINDOW[meal];
                const dishes = plan.dishes.filter((d) => d.meal === meal);
                return (
                  <Surface key={meal}>
                    <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1.5 }}>
                      <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{MEAL_LABELS[meal]}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {window.from} – {window.to}
                      </Typography>
                    </Stack>
                    {mealGuests && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: -1, mb: 1 }}>
                        {(mealGuests[meal] ?? 0) > 0 ? `на ${guestsWord(mealGuests[meal] ?? 0)} с питанием` : "по броням — никому"}
                      </Typography>
                    )}
                    {dishes.length === 0 ? (
                      <Typography variant="body2" color="text.disabled">
                        Блюд нет
                      </Typography>
                    ) : (
                      dishes.map((dish, i) => (
                        <Stack
                          key={dish.dishId}
                          direction="row"
                          justifyContent="space-between"
                          gap={1}
                          sx={{ py: 0.9, borderTop: i === 0 ? "none" : `1px solid ${subtleBorder(theme)}` }}
                        >
                          <Typography variant="body2">{dish.name}</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                            {dish.portions} порц.
                          </Typography>
                        </Stack>
                      ))
                    )}
                  </Surface>
                );
              })}
            </Box>
          </Box>

          <Box>
          <SectionLabel>Закупка продуктов</SectionLabel>
          <Surface padded={false} sx={{ overflow: "hidden" }}>
            <Box sx={{ overflowX: "auto" }}>
              <Table sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 2.5 }}>Продукт</TableCell>
                    <TableCell align="right">Нужно</TableCell>
                    <TableCell align="right">На складе</TableCell>
                    <TableCell align="right">Докупить</TableCell>
                    <TableCell align="right">План, сом/ед</TableCell>
                    <TableCell align="right">Куплено</TableCell>
                    <TableCell align="right">Факт, сом/ед</TableCell>
                    <TableCell align="right">Отклонение</TableCell>
                    <TableCell>Купил</TableCell>
                    <TableCell align="right" sx={{ pr: 2 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {plan.shoppingList.map((item) => {
                    const purchase = item.purchase;
                    const toBuyQty = Number(item.toBuyQty);
                    const deviationQty = purchase ? Number(purchase.purchasedQty) - toBuyQty : 0;
                    const deviationBase = toBuyQty || 1;
                    const deviationPercent = purchase ? Math.round((deviationQty / deviationBase) * 100) : 0;
                    const deviationColor =
                      !purchase || Math.abs(deviationPercent) <= 10
                        ? theme.palette.text.secondary
                        : deviationPercent > 0
                        ? theme.palette.warning.main
                        : theme.palette.error.main;
                    const num = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;
                    return (
                      <TableRow key={item.ingredientId}>
                        <TableCell sx={{ pl: 2.5, fontWeight: 600 }}>{item.ingredientName}</TableCell>
                        <TableCell align="right" sx={{ ...num, color: "text.secondary" }}>
                          {Number(item.neededQty)} {unitRu(item.unit)}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title={canPurchase ? "Поправить остаток на складе" : ""}>
                            <Box
                              component="button"
                              type="button"
                              disabled={!canPurchase}
                              onClick={() => openStockEdit(item)}
                              sx={{
                                ...num,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 0.5,
                                px: 0.75,
                                py: 0.25,
                                border: 0,
                                borderRadius: "6px",
                                bgcolor: "transparent",
                                color: "text.primary",
                                font: "inherit",
                                fontSize: 14,
                                cursor: canPurchase ? "pointer" : "default",
                                textDecoration: canPurchase ? "underline dotted" : "none",
                                textUnderlineOffset: 3,
                                "&:hover": canPurchase ? { bgcolor: subtleBg(theme, true) } : undefined,
                              }}
                            >
                              {Number(item.inStockQty)} {unitRu(item.unit)}
                            </Box>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right" sx={num}>
                          {toBuyQty > 0 ? (
                            <Typography variant="body2" fontWeight={700} sx={num}>
                              {toBuyQty} {unitRu(item.unit)}
                            </Typography>
                          ) : (
                            <Typography variant="body2" color="success.main" fontWeight={600}>
                              Хватает
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ ...num, color: "text.secondary" }}>
                          {Number(item.pricePerUnit).toLocaleString("ru-RU")}
                        </TableCell>
                        <TableCell align="right">
                          {purchase ? (
                            <StatusPill color={theme.palette.success.main} label={`${Number(purchase.purchasedQty)} ${unitRu(item.unit)}`} />
                          ) : (
                            <Typography variant="body2" color="text.disabled" sx={{ whiteSpace: "nowrap" }}>
                              —
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right" sx={num}>
                          {purchase ? Number(purchase.actualPricePerUnit).toLocaleString("ru-RU") : "—"}
                        </TableCell>
                        <TableCell align="right" sx={{ ...num, color: deviationColor, fontWeight: 600 }}>
                          {purchase ? `${deviationQty > 0 ? "+" : ""}${deviationQty.toFixed(1)} ${unitRu(item.unit)}` : "—"}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap", color: purchase?.purchasedByName ? "text.primary" : "text.disabled" }}>
                          {purchase?.purchasedByName || "—"}
                        </TableCell>
                        <TableCell align="right" sx={{ pr: 2 }}>
                          {!canPurchase ? null : purchase ? (
                            <Tooltip title="Изменить закупку">
                              <IconButton size="small" onClick={() => openPurchaseEdit(item)} aria-label={`Изменить закупку: ${item.ingredientName}`}>
                                <EditOutlined sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                          ) : noGuests ? null : (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<CheckCircleOutlined sx={{ fontSize: 16 }} />}
                              onClick={() => openPurchaseEdit(item)}
                              sx={{ whiteSpace: "nowrap", borderRadius: "8px" }}
                            >
                              Купил
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Surface>
          </Box>
        </>
      )}

      <Dialog open={purchaseEdit != null} onClose={() => (purchaseSaving ? null : setPurchaseEdit(null))} maxWidth="xs" fullWidth>
        {purchaseEdit && (
          <>
            <DialogTitle>{purchaseEdit.item.ingredientName}</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ mt: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  По плану докупить <b>{Number(purchaseEdit.item.toBuyQty)} {unitRu(purchaseEdit.item.unit)}</b> по{" "}
                  {Number(purchaseEdit.item.pricePerUnit).toLocaleString("ru-RU")} сом (нужно {Number(purchaseEdit.item.neededQty)}, на складе{" "}
                  {Number(purchaseEdit.item.inStockQty)}). Укажите, сколько купили на самом деле.
                </Typography>
                {purchaseError && <Alert severity="error">{purchaseError}</Alert>}
                <FormField
                  icon={<ShoppingBasketOutlined />}
                  label="Куплено"
                  unit={unitRu(purchaseEdit.item.unit)}
                  value={purchaseEdit.purchasedQty}
                  onValueChange={(purchasedQty) => setPurchaseEdit({ ...purchaseEdit, purchasedQty })}
                  rules={KITCHEN_RULES.qty}
                  autoFocus
                  disabled={purchaseSaving}
                  fullWidth
                />
                <FormField
                  icon={<SellOutlined />}
                  label="Цена за единицу (факт)"
                  unit="сом"
                  value={purchaseEdit.actualPricePerUnit}
                  onValueChange={(actualPricePerUnit) => setPurchaseEdit({ ...purchaseEdit, actualPricePerUnit })}
                  rules={KITCHEN_RULES.price}
                  disabled={purchaseSaving}
                  fullWidth
                />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              {purchaseEdit.item.purchase && (
                <Button color="error" sx={{ mr: "auto" }} disabled={purchaseSaving} onClick={() => void clearPurchase()}>
                  Убрать отметку
                </Button>
              )}
              <Button onClick={() => setPurchaseEdit(null)} disabled={purchaseSaving}>
                Отмена
              </Button>
              <Button
                variant="contained"
                onClick={() => void savePurchaseEdit()}
                disabled={
                  purchaseSaving ||
                  hasFieldErrors([
                    [purchaseEdit.purchasedQty, KITCHEN_RULES.qty],
                    [purchaseEdit.actualPricePerUnit, KITCHEN_RULES.price],
                  ])
                }
              >
                {purchaseSaving ? "Сохраняем…" : "Сохранить"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog open={stockEdit != null} onClose={() => (stockSaving ? null : setStockEdit(null))} maxWidth="xs" fullWidth>
        {stockEdit && (
          <>
            <DialogTitle>Остаток на складе — {stockEdit.name}</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ mt: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Сколько продукта физически есть на кухне прямо сейчас — общий остаток, не привязан к дню.
                  Поправьте после переучёта или новой партии.
                </Typography>
                {stockError && <Alert severity="error">{stockError}</Alert>}
                <FormField
                  icon={<Inventory2Outlined />}
                  label="Остаток"
                  unit={unitRu(stockEdit.unit)}
                  value={stockEdit.qty}
                  onValueChange={(qty) => setStockEdit({ ...stockEdit, qty })}
                  rules={KITCHEN_RULES.stock}
                  autoFocus
                  disabled={stockSaving}
                  fullWidth
                />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setStockEdit(null)} disabled={stockSaving}>
                Отмена
              </Button>
              <Button
                variant="contained"
                onClick={() => void saveStockEdit()}
                disabled={stockSaving || hasFieldErrors([[stockEdit.qty, KITCHEN_RULES.stock]])}
              >
                {stockSaving ? "Сохраняем…" : "Сохранить"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </HotelPage>
  );
};

export default HotelKitchenPage;
