/**
 * «Кухня» → «Продукты»: справочник того, из чего готовят, — единица,
 * плановая цена и остаток на складе. По плановой цене считается «Докупить
 * на сумму», по остатку — сколько докупить. Бэк: /hotel/kitchen/ingredients/,
 * право hotel.kitchen.purchases.
 *
 * Продукт из рецептов или закупок бэк удалить не даст (409) — тогда его
 * скрывают (isActive=false): история закупок остаётся, в новые рецепты он
 * не предлагается. Поэтому в диалоге сначала «Скрыть», а «Удалить» — только
 * для продукта, который нигде не используется.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import SellOutlined from "@mui/icons-material/SellOutlined";
import EggOutlined from "@mui/icons-material/EggOutlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { useCan } from "../hooks/useCan";
import {
  createIngredient,
  deleteIngredient,
  listDishes,
  listIngredients,
  updateIngredient,
  type HotelIngredient,
} from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { FormField } from "./formField";
import { FieldIcon } from "./FieldIcon";
import { hasFieldErrors } from "./formRules";
import { DisabledReason, EmptyState, StatusPill, Surface, useHotelTableSx } from "./hotelUi";
import { formatQty, INGREDIENT_UNITS, KITCHEN_RULES, unitRu } from "./kitchenShared";

interface ProductForm {
  name: string;
  unit: string;
  price: string;
  stock: string;
  isActive: boolean;
}

const formFrom = (i: HotelIngredient | null): ProductForm =>
  i
    ? { name: i.name, unit: i.unit, price: String(Number(i.pricePerUnit)), stock: String(Number(i.stockQty)), isActive: i.isActive }
    : { name: "", unit: "kg", price: "", stock: "0", isActive: true };

export const KitchenProductsPanel: React.FC<{ propertyId: number }> = ({ propertyId }) => {
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const canEdit = useCan("hotel.kitchen.purchases");
  const ingredientsQuery = useQuery({
    queryKey: ["hotel", "kitchen", "ingredients", propertyId, "all"],
    queryFn: ({ signal }) => listIngredients(propertyId, signal, { includeInactive: true }),
  });
  const dishesQuery = useQuery({
    queryKey: ["hotel", "kitchen", "dishes", propertyId, "all"],
    queryFn: ({ signal }) => listDishes(propertyId, { includeInactive: true }, signal),
  });
  const [editing, setEditing] = React.useState<HotelIngredient | "new" | null>(null);

  // В каких блюдах продукт — видно в таблице и решает, можно ли его удалить.
  const usedIn = React.useMemo(() => {
    const map = new Map<number, string[]>();
    for (const d of dishesQuery.data ?? []) {
      for (const l of d.ingredients) map.set(l.ingredientId, [...(map.get(l.ingredientId) ?? []), d.name]);
    }
    return map;
  }, [dishesQuery.data]);

  const rows = [...(ingredientsQuery.data ?? [])].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "ru"),
  );

  if (ingredientsQuery.isError) {
    return (
      <Alert severity="error" variant="outlined">
        {getErrorMessage(ingredientsQuery.error, "Не удалось загрузить продукты")}
      </Alert>
    );
  }

  return (
    <>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Typography variant="body2" color="text.secondary">
          Плановая цена — для суммы закупки, остаток — чтобы не покупать лишнего.
        </Typography>
        {canEdit && (
          <Button variant="contained" disableElevation startIcon={<AddOutlined />} onClick={() => setEditing("new")}>
            Добавить продукт
          </Button>
        )}
      </Stack>
      {ingredientsQuery.isPending ? null : rows.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<EggOutlined />}
            title="Продуктов пока нет"
            description="Заведите продукты, из которых готовит кухня, — затем их можно добавить в рецепты блюд."
          />
        </Surface>
      ) : (
        <Surface padded={false} sx={{ overflow: "hidden" }}>
          <Box sx={{ overflowX: "auto" }}>
            <Table sx={tableSx}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ pl: 2.5 }}>Продукт</TableCell>
                  <TableCell align="right">Плановая цена</TableCell>
                  <TableCell align="right">На складе</TableCell>
                  <TableCell>В блюдах</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((i) => {
                  const dishes = usedIn.get(i.id) ?? [];
                  return (
                    <TableRow
                      key={i.id}
                      hover={canEdit}
                      onClick={canEdit ? () => setEditing(i) : undefined}
                      sx={{ cursor: canEdit ? "pointer" : "default", opacity: i.isActive ? 1 : 0.55 }}
                    >
                      <TableCell sx={{ pl: 2.5 }}>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Typography variant="body2" fontWeight={600}>
                            {i.name}
                          </Typography>
                          {!i.isActive && <StatusPill color={theme.palette.text.disabled} label="Скрыт" />}
                        </Stack>
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {Number(i.pricePerUnit).toLocaleString("ru-RU")} сом / {unitRu(i.unit)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {formatQty(i.stockQty)} {unitRu(i.unit)}
                      </TableCell>
                      <TableCell sx={{ color: dishes.length ? "text.secondary" : "text.disabled", maxWidth: 320 }}>
                        <Typography variant="body2" noWrap title={dishes.join(", ")}>
                          {dishes.length ? dishes.join(", ") : "нигде"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Surface>
      )}

      <ProductDialog
        target={editing}
        propertyId={propertyId}
        usedInDishes={editing && editing !== "new" ? (usedIn.get(editing.id) ?? []) : []}
        onClose={() => setEditing(null)}
      />
    </>
  );
};

const ProductDialog: React.FC<{
  target: HotelIngredient | "new" | null;
  propertyId: number;
  usedInDishes: string[];
  onClose: () => void;
}> = ({ target, propertyId, usedInDishes, onClose }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const ingredient = target && target !== "new" ? target : null;
  const [form, setForm] = React.useState<ProductForm>(() => formFrom(ingredient));
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (target == null) return;
    setForm(formFrom(ingredient));
    setShowErrors(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "kitchen"] });

  const handleSave = async () => {
    if (
      hasFieldErrors([
        [form.name, KITCHEN_RULES.name],
        [form.price, KITCHEN_RULES.price],
        [form.stock, KITCHEN_RULES.stock],
      ])
    ) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = { name: form.name.trim(), unit: form.unit, pricePerUnit: String(Number(form.price)), stockQty: String(Number(form.stock)) };
      if (ingredient) await updateIngredient(ingredient.id, { ...data, isActive: form.isActive });
      else await createIngredient({ propertyId, ...data });
      invalidate();
      enqueueSnackbar(ingredient ? "Продукт сохранён" : `Продукт «${data.name}» добавлен`, { variant: "success" });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось сохранить продукт"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!ingredient) return;
    setSaving(true);
    setError(null);
    try {
      await deleteIngredient(ingredient.id);
      invalidate();
      enqueueSnackbar(`Продукт «${ingredient.name}» удалён`, { variant: "success" });
      onClose();
    } catch (err) {
      // Закупки по продукту фронт не видит — бэк ответит 409, предлагаем скрыть.
      setError(getErrorMessage(err, "Не удалось удалить продукт"));
    } finally {
      setSaving(false);
    }
  };

  const deleteReason = usedInDishes.length
    ? `Продукт есть в рецептах (${usedInDishes.join(", ")}) — его можно только скрыть`
    : null;

  return (
    <Dialog open={target != null} onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>{ingredient ? ingredient.name : "Новый продукт"}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <FormField
            icon={<EggOutlined />}
            label="Название"
            placeholder="Яйца"
            value={form.name}
            onValueChange={(v) => set("name", v)}
            rules={KITCHEN_RULES.name}
            showErrors={showErrors}
            disabled={saving}
            autoFocus={!ingredient}
            fullWidth
          />
          <TextField
            select
            label="Единица"
            value={form.unit}
            onChange={(e) => set("unit", e.target.value)}
            disabled={saving}
            slotProps={{ input: { startAdornment: <FieldIcon icon={<StraightenOutlined />} /> } }}
            helperText={ingredient && usedInDishes.length ? "Рецепты хранят количество в этой единице — меняйте осторожно" : " "}
            fullWidth
          >
            {INGREDIENT_UNITS.map((u) => (
              <MenuItem key={u.value} value={u.value}>
                {u.label}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" gap={2}>
            <FormField
              icon={<SellOutlined />}
              label="Плановая цена"
              unit={`сом/${unitRu(form.unit)}`}
              value={form.price}
              onValueChange={(v) => set("price", v)}
              rules={KITCHEN_RULES.price}
              showErrors={showErrors}
              disabled={saving}
              sx={{ flex: 1 }}
            />
            <FormField
              icon={<Inventory2Outlined />}
              label="На складе"
              unit={unitRu(form.unit)}
              value={form.stock}
              onValueChange={(v) => set("stock", v)}
              rules={KITCHEN_RULES.stock}
              showErrors={showErrors}
              disabled={saving}
              sx={{ flex: 1 }}
            />
          </Stack>
          {ingredient && (
            <FormControlLabel
              control={<Switch checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} disabled={saving} />}
              label={
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    Используется
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Выключите, чтобы не предлагать в новых рецептах
                  </Typography>
                </Box>
              }
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {ingredient && (
          <DisabledReason reason={deleteReason}>
            <Button color="error" onClick={() => void handleDelete()} disabled={saving || deleteReason != null} sx={{ mr: "auto" }}>
              Удалить
            </Button>
          </DisabledReason>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" disableElevation onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Сохраняем…" : ingredient ? "Сохранить" : "Добавить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default KitchenProductsPanel;
