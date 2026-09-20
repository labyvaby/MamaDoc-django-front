/**
 * «Кухня» — во сколько какие блюда готовить и сколько продуктов на это надо
 * купить. Реальный бэкенд — GET /hotel/kitchen/day-plan/ (см. src/api/hotel.ts)
 * одним вызовом отдаёт блюда+порции+список закупки; occupiedRooms из того же
 * источника, что дашборд, не оторванные случайные числа.
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
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import InventoryOutlined from "@mui/icons-material/InventoryOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { Navigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CustomDatePicker } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { useIsVivaActive, MEAL_LABELS, MEAL_SERVING_WINDOW, type MealType } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
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
  const vivaActive = useIsVivaActive();
  const { property } = useHotelProperty();
  const queryClient = useQueryClient();

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

  const totalPlanned = plan ? plan.shoppingList.reduce((sum, i) => sum + Number(i.plannedAmount), 0) : 0;
  const purchasedCount = plan ? plan.shoppingList.filter((i) => i.purchase).length : 0;

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Кухня
        </Typography>

        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton size="small" onClick={() => setDate((d) => d.subtract(1, "day"))}>
            <ChevronLeftOutlined fontSize="small" />
          </IconButton>
          <CustomDatePicker
            label="Дата"
            value={date}
            onChange={(v) => v && setDate(v)}
            slotProps={{ textField: { size: "small" } }}
            sx={{ width: 150 }}
          />
          <IconButton size="small" onClick={() => setDate((d) => d.add(1, "day"))}>
            <ChevronRightOutlined fontSize="small" />
          </IconButton>
          {!isToday && (
            <Button size="small" onClick={() => setDate(dayjs())}>
              Сегодня
            </Button>
          )}
        </Stack>
      </Stack>

      {!plan ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <>
          <Alert severity="info" variant="outlined" sx={{ mb: 2.5, fontSize: "0.8rem" }}>
            Порции и норма продуктов посчитаны от {plan.occupiedRooms} занятых на эту дату номеров. «Нужно по
            рецепту» и «Докупить» не редактируются напрямую — «Докупить» = нужно минус то, что уже есть на
            складе. И «Есть на складе», и «Куплено» — реальный ввод сотрудника, оба всегда можно поправить.
          </Alert>

          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Расписание готовки
          </Typography>
          <Paper elevation={0} variant="outlined" sx={{ overflow: "hidden", mb: 3 }}>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Приём пищи</TableCell>
                    <TableCell>Время подачи</TableCell>
                    <TableCell>Блюдо</TableCell>
                    <TableCell align="right">Порций</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {MEAL_ORDER.flatMap((meal) => {
                    const window = MEAL_SERVING_WINDOW[meal];
                    return plan.dishes
                      .filter((d) => d.meal === meal)
                      .map((dish, idx) => (
                        <TableRow key={dish.dishId} hover>
                          <TableCell>
                            {idx === 0 && (
                              <Chip
                                label={MEAL_LABELS[meal]}
                                size="small"
                                sx={{ fontWeight: 600, bgcolor: alpha(theme.palette.primary.main, 0.14), color: "primary.main" }}
                              />
                            )}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {idx === 0 && `${window.from} – ${window.to}`}
                          </TableCell>
                          <TableCell>{dish.name}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {dish.portions}
                          </TableCell>
                        </TableRow>
                      ));
                  })}
                </TableBody>
              </Table>
            </Box>
          </Paper>

          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Закупка продуктов
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Куплено: {purchasedCount} из {plan.shoppingList.length} · Докупить на сумму:{" "}
              {totalPlanned.toLocaleString("ru-RU")} сом
            </Typography>
          </Stack>
          <Paper elevation={0} variant="outlined" sx={{ overflow: "hidden" }}>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Продукт</TableCell>
                    <TableCell align="right">Нужно по рецепту</TableCell>
                    <TableCell align="right">Есть на складе</TableCell>
                    <TableCell align="right">Докупить</TableCell>
                    <TableCell align="right">Цена/ед план</TableCell>
                    <TableCell align="right">Куплено</TableCell>
                    <TableCell align="right">Цена/ед факт</TableCell>
                    <TableCell align="right">Отклонение</TableCell>
                    <TableCell>Купил</TableCell>
                    <TableCell align="right">Действие</TableCell>
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
                    return (
                      <TableRow key={item.ingredientId} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{item.ingredientName}</TableCell>
                        <TableCell align="right">
                          {Number(item.neededQty)} {item.unit}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            color="inherit"
                            startIcon={<InventoryOutlined fontSize="small" />}
                            onClick={() => openStockEdit(item)}
                            sx={{ fontWeight: 600, minWidth: 0 }}
                          >
                            {Number(item.inStockQty)} {item.unit}
                          </Button>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {toBuyQty > 0 ? (
                            `${toBuyQty} ${item.unit}`
                          ) : (
                            <Typography variant="body2" color="success.main" fontWeight={600}>
                              Хватает
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">{Number(item.pricePerUnit).toLocaleString("ru-RU")}</TableCell>
                        <TableCell align="right">
                          {purchase ? (
                            <Chip
                              icon={<CheckCircleOutlined fontSize="small" />}
                              label={`${Number(purchase.purchasedQty)} ${item.unit}`}
                              size="small"
                              sx={{
                                bgcolor: alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.25 : 0.14),
                                color: theme.palette.success.main,
                                fontWeight: 600,
                              }}
                            />
                          ) : (
                            <Typography variant="body2" color="text.disabled">
                              Не куплено
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {purchase ? Number(purchase.actualPricePerUnit).toLocaleString("ru-RU") : "—"}
                        </TableCell>
                        <TableCell align="right" sx={{ color: deviationColor, fontWeight: 600 }}>
                          {purchase ? `${deviationQty > 0 ? "+" : ""}${deviationQty.toFixed(1)} ${item.unit}` : "—"}
                        </TableCell>
                        <TableCell>{purchase?.purchasedByName || "—"}</TableCell>
                        <TableCell align="right">
                          <Stack direction="row" gap={0.5} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant={purchase ? "outlined" : "contained"}
                              startIcon={<EditOutlined fontSize="small" />}
                              onClick={() => openPurchaseEdit(item)}
                            >
                              {purchase ? "Изменить" : "Отметить купленным"}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </>
      )}

      <Dialog open={purchaseEdit != null} onClose={() => (purchaseSaving ? null : setPurchaseEdit(null))} maxWidth="xs" fullWidth>
        {purchaseEdit && (
          <>
            <DialogTitle>{purchaseEdit.item.ingredientName}</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ mt: 0.5 }}>
                <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                  Докупить: {Number(purchaseEdit.item.toBuyQty)} {purchaseEdit.item.unit} (нужно {Number(purchaseEdit.item.neededQty)}
                  , на складе {Number(purchaseEdit.item.inStockQty)}) по {Number(purchaseEdit.item.pricePerUnit).toLocaleString("ru-RU")} сом.
                  Ниже — сколько купили на самом деле; запись всегда можно открыть и поправить.
                </Alert>
                {purchaseError && <Alert severity="error">{purchaseError}</Alert>}
                <TextField
                  label={`Куплено, ${purchaseEdit.item.unit}`}
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
                <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                  Сколько продукта физически есть на кухне прямо сейчас — общий остаток, не привязан к
                  конкретному дню. Поправьте после переучёта или получения новой партии.
                </Alert>
                {stockError && <Alert severity="error">{stockError}</Alert>}
                <TextField
                  label={`Остаток, ${stockEdit.unit}`}
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
    </Box>
  );
};

export default HotelKitchenPage;
