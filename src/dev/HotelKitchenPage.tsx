/**
 * «Кухня» — во сколько какие блюда готовить и сколько продуктов на это надо
 * купить. Реальный бэкенд — GET /hotel/kitchen/day-plan/ (см. src/api/hotel.ts)
 * одним вызовом отдаёт блюда+порции+список закупки. Порции — от числа гостей
 * (occupiedGuests × portionsPerGuest блюда), считает бэк.
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EditOutlined from "@mui/icons-material/EditOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { Navigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../hooks/usePageTitle";
import { useCan } from "../hooks/useCan";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { DateStepper, HotelPage, HotelPageHeader, MetricTile, plural, SectionLabel, StatusPill, Surface, useHotelTableSx } from "./hotelUi";
import { useIsVivaActive, MEAL_LABELS, MEAL_SERVING_WINDOW, type MealType } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { getKitchenDayPlan, upsertPurchase, deletePurchase, updateStock, type HotelShoppingLine } from "../api/hotel";
import { getErrorMessage } from "../api/client";

const UNIT_RU: Record<string, string> = {
  kg: "кг",
  g: "г",
  gr: "г",
  l: "л",
  ml: "мл",
  pcs: "шт",
  pc: "шт",
  piece: "шт",
  pieces: "шт",
  pack: "уп",
  bunch: "пучок",
};
/** «kg» → «кг»: справочник ингредиентов хранит единицы латиницей. */
const unitRu = (unit: string) => UNIT_RU[unit.trim().toLowerCase()] ?? unit;

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
  // round(гостей × порций на гостя) без минимума, при 0 гостей — 0. Фронт
  // ничего не пересчитывает. noGuests — только для подсказки и чтобы не
  // предлагать «Купил» на меню, по которому готовить не для кого.
  const noGuests = plan != null && plan.occupiedGuests === 0;
  const totalPlanned = plan ? Number(plan.plannedTotal) : 0;
  const totalPortions = plan ? plan.dishes.reduce((sum, d) => sum + d.portions, 0) : 0;
  const purchasedCount = plan ? plan.shoppingList.filter((i) => i.purchase).length : 0;

  const toBuyCount = plan ? plan.shoppingList.filter((i) => Number(i.toBuyQty) > 0).length : 0;

  return (
    <HotelPage>
      <HotelPageHeader
        title="Кухня"
        subtitle={plan ? `Меню и закупка на ${plan.occupiedGuests} ${plural(plan.occupiedGuests, "гостя", "гостей", "гостей")}` : undefined}
        info={
          <>
            Порции считаются от числа гостей на эту дату (взрослые и дети): гостей × порций на гостя у блюда. «Нужно» и «Докупить» не
            редактируются: «Докупить» = нужно минус то, что есть на складе. «На складе» и «Куплено» — ввод
            сотрудника, их всегда можно поправить.
          </>
        }
        actions={<DateStepper value={date} onChange={setDate} />}
      />

      {!property && !propertyLoading ? (
        <HotelPropertyMissing />
      ) : !plan ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
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
                <TextField
                  label={`Куплено, ${unitRu(purchaseEdit.item.unit)}`}
                  type="number"
                  value={purchaseEdit.purchasedQty}
                  onChange={(e) => setPurchaseEdit({ ...purchaseEdit, purchasedQty: e.target.value })}
                  slotProps={{ htmlInput: { min: 0, step: "0.1" } }}
                  autoFocus
                  disabled={purchaseSaving}
                  fullWidth
                />
                <TextField
                  label="Цена за единицу, сом (факт)"
                  type="number"
                  value={purchaseEdit.actualPricePerUnit}
                  onChange={(e) => setPurchaseEdit({ ...purchaseEdit, actualPricePerUnit: e.target.value })}
                  slotProps={{ htmlInput: { min: 0 } }}
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
              <Button variant="contained" onClick={() => void savePurchaseEdit()} disabled={purchaseSaving}>
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
                <TextField
                  label={`Остаток, ${unitRu(stockEdit.unit)}`}
                  type="number"
                  value={stockEdit.qty}
                  onChange={(e) => setStockEdit({ ...stockEdit, qty: e.target.value })}
                  slotProps={{ htmlInput: { min: 0, step: "0.1" } }}
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
              <Button variant="contained" onClick={() => void saveStockEdit()} disabled={stockSaving}>
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
