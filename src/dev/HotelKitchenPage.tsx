/**
 * «Кухня» — во сколько какие блюда готовить и сколько продуктов на это надо
 * купить (mockDemoData.ts: getKitchenDayPlan). Порции считаются от занятых
 * на дату номеров — та же «реальная» связка с бронями, что у выручки на
 * странице «Отчёты», а не оторванные случайные числа.
 *
 * Плановое количество продукта не редактируется (это норма расхода по
 * рецепту), а факт закупки — редактируется всегда, в том числе повторно:
 * если сотрудник купил 10 сосисок вместо 5, нужный по плану, запись можно
 * открыть и поправить в любой момент (setKitchenPurchase перезаписывает, а
 * не только создаёт).
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
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
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { Navigate } from "react-router";

import { CustomDatePicker } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  getKitchenDayPlan,
  getKitchenPurchase,
  setKitchenPurchase,
  clearKitchenPurchase,
  subscribeKitchenPurchases,
  getKitchenPurchasesSnapshot,
  isVivaActive,
  MEAL_LABELS,
  type MealType,
  type KitchenShoppingItem,
} from "./mockDemoData";

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

interface EditTarget {
  item: KitchenShoppingItem;
  purchasedQty: string;
  actualPricePerUnit: string;
  purchasedBy: string;
}

export const HotelKitchenPage: React.FC = () => {
  usePageTitle("Кухня");
  const theme = useTheme();
  React.useSyncExternalStore(subscribeKitchenPurchases, getKitchenPurchasesSnapshot);

  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const [edit, setEdit] = React.useState<EditTarget | null>(null);

  // После хуков (Rules of Hooks) — страница доступна только Viva, у
  // остальных организаций такой кухни нет.
  if (!isVivaActive()) return <Navigate to="/" replace />;

  const dateStr = date.format("YYYY-MM-DD");
  const plan = React.useMemo(() => getKitchenDayPlan(dateStr), [dateStr]);
  const isToday = dateStr === dayjs().format("YYYY-MM-DD");

  const openEdit = (item: KitchenShoppingItem) => {
    const existing = getKitchenPurchase(dateStr, item.ingredient);
    setEdit({
      item,
      purchasedQty: String(existing?.purchasedQty ?? item.neededQty),
      actualPricePerUnit: String(existing?.actualPricePerUnit ?? item.pricePerUnit),
      purchasedBy: existing?.purchasedBy ?? "",
    });
  };

  const saveEdit = () => {
    if (!edit) return;
    const qty = Number(edit.purchasedQty);
    const price = Number(edit.actualPricePerUnit);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) return;
    setKitchenPurchase(dateStr, edit.item.ingredient, {
      purchasedQty: qty,
      actualPricePerUnit: price,
      purchasedBy: edit.purchasedBy.trim() || undefined,
    });
    setEdit(null);
  };

  const totalPlanned = plan.shoppingList.reduce((sum, i) => sum + i.plannedAmount, 0);
  const purchasedCount = plan.shoppingList.filter((i) => getKitchenPurchase(dateStr, i.ingredient)).length;

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

      <Alert severity="info" variant="outlined" sx={{ mb: 2.5, fontSize: "0.8rem" }}>
        Порции и норма продуктов посчитаны от {plan.occupiedRooms} занятых на эту дату номеров. Плановое
        количество — норма расхода по рецепту, не редактируется. «Куплено» — то, что реально ввёл
        сотрудник, и его всегда можно поправить.
      </Alert>

      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
        Расписание готовки
      </Typography>
      <Paper elevation={0} variant="outlined" sx={{ overflow: "hidden", mb: 3 }}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Время</TableCell>
                <TableCell>Приём пищи</TableCell>
                <TableCell>Блюдо</TableCell>
                <TableCell align="right">Порций</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {MEAL_ORDER.flatMap((meal) =>
                plan.dishes
                  .filter((d) => d.meal === meal)
                  .map((dish, idx) => (
                    <TableRow key={dish.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{dish.time}</TableCell>
                      <TableCell>
                        {idx === 0 && (
                          <Chip
                            label={MEAL_LABELS[meal]}
                            size="small"
                            sx={{ fontWeight: 600, bgcolor: alpha(theme.palette.primary.main, 0.14), color: "primary.main" }}
                          />
                        )}
                      </TableCell>
                      <TableCell>{dish.name}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {dish.portions}
                      </TableCell>
                    </TableRow>
                  )),
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Закупка продуктов
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Куплено: {purchasedCount} из {plan.shoppingList.length} · План на сумму:{" "}
          {totalPlanned.toLocaleString("ru-RU")} сом
        </Typography>
      </Stack>
      <Paper elevation={0} variant="outlined" sx={{ overflow: "hidden" }}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Продукт</TableCell>
                <TableCell align="right">Нужно</TableCell>
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
                const purchase = getKitchenPurchase(dateStr, item.ingredient);
                const deviationQty = purchase ? purchase.purchasedQty - item.neededQty : 0;
                const deviationPercent = purchase ? Math.round((deviationQty / item.neededQty) * 100) : 0;
                const deviationColor =
                  !purchase || Math.abs(deviationPercent) <= 10
                    ? theme.palette.text.secondary
                    : deviationPercent > 0
                    ? theme.palette.warning.main
                    : theme.palette.error.main;
                return (
                  <TableRow key={item.ingredient} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{item.ingredient}</TableCell>
                    <TableCell align="right">
                      {item.neededQty} {item.unit}
                    </TableCell>
                    <TableCell align="right">{item.pricePerUnit.toLocaleString("ru-RU")}</TableCell>
                    <TableCell align="right">
                      {purchase ? (
                        <Chip
                          icon={<CheckCircleOutlined fontSize="small" />}
                          label={`${purchase.purchasedQty} ${item.unit}`}
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
                      {purchase ? purchase.actualPricePerUnit.toLocaleString("ru-RU") : "—"}
                    </TableCell>
                    <TableCell align="right" sx={{ color: deviationColor, fontWeight: 600 }}>
                      {purchase ? `${deviationQty > 0 ? "+" : ""}${deviationQty.toFixed(1)} ${item.unit}` : "—"}
                    </TableCell>
                    <TableCell>{purchase?.purchasedBy || "—"}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" gap={0.5} justifyContent="flex-end">
                        <Button size="small" variant={purchase ? "outlined" : "contained"} startIcon={<EditOutlined fontSize="small" />} onClick={() => openEdit(item)}>
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

      <Dialog open={edit != null} onClose={() => setEdit(null)} maxWidth="xs" fullWidth>
        {edit && (
          <>
            <DialogTitle>{edit.item.ingredient}</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ mt: 0.5 }}>
                <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                  По плану нужно {edit.item.neededQty} {edit.item.unit} по {edit.item.pricePerUnit.toLocaleString("ru-RU")} сом.
                  Ниже — сколько купили на самом деле; запись всегда можно открыть и поправить.
                </Alert>
                <TextField
                  label={`Куплено, ${edit.item.unit}`}
                  type="number"
                  value={edit.purchasedQty}
                  onChange={(e) => setEdit({ ...edit, purchasedQty: e.target.value })}
                  slotProps={{ htmlInput: { min: 0, step: "0.1" } }}
                  autoFocus
                  fullWidth
                />
                <TextField
                  label="Цена за единицу, сом (факт)"
                  type="number"
                  value={edit.actualPricePerUnit}
                  onChange={(e) => setEdit({ ...edit, actualPricePerUnit: e.target.value })}
                  slotProps={{ htmlInput: { min: 0 } }}
                  fullWidth
                />
                <TextField
                  label="Кто купил"
                  placeholder="Необязательно"
                  value={edit.purchasedBy}
                  onChange={(e) => setEdit({ ...edit, purchasedBy: e.target.value })}
                  fullWidth
                />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              {getKitchenPurchase(dateStr, edit.item.ingredient) && (
                <Button
                  color="error"
                  sx={{ mr: "auto" }}
                  onClick={() => {
                    clearKitchenPurchase(dateStr, edit.item.ingredient);
                    setEdit(null);
                  }}
                >
                  Убрать отметку
                </Button>
              )}
              <Button onClick={() => setEdit(null)}>Отмена</Button>
              <Button variant="contained" onClick={saveEdit}>
                Сохранить
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default HotelKitchenPage;
