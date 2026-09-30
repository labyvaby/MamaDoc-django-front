/**
 * «Кухня» → «Меню»: блюда завтрака, обеда и ужина с рецептами. Раньше меню
 * заводил только бэкенд-разработчик — из интерфейса его было не поменять.
 *
 * Блюдо: название, приём пищи, «порций на гостя» (0,9 — девять гостей из
 * десяти берут блюдо) и рецепт — сколько каждого продукта уходит на порцию.
 * По ним бэк считает «Расписание готовки» и «Закупку продуктов» на дату.
 * Скрытое блюдо (isActive=false) в план не попадает, но рецепт сохраняется —
 * удобно для сезонного меню. Бэк: /hotel/kitchen/dishes/, право
 * hotel.kitchen.menu; рецепт в PATCH заменяется целиком.
 */
import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import RestaurantMenuOutlined from "@mui/icons-material/RestaurantMenuOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import ScaleOutlined from "@mui/icons-material/ScaleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { useCan } from "../hooks/useCan";
import { subtleBorder } from "../theme/uiHelpers";
import {
  createDish,
  deleteDish,
  listDishes,
  listIngredients,
  updateDish,
  type HotelDish,
  type HotelIngredient,
} from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { FormField } from "./formField";
import { fieldError, focusFirstFieldError, hasFieldErrors } from "./formRules";
import { DRAWER_WIDTH, DrawerFooter, DrawerHeader, DrawerSection, StatusPill, Surface } from "./hotelUi";
import { MEAL_LABELS, MEAL_SERVING_WINDOW, type MealType } from "./mockDemoData";
import { formatQty, KITCHEN_RULES, unitRu } from "./kitchenShared";

const MEALS: MealType[] = ["breakfast", "lunch", "dinner"];

interface RecipeRow {
  key: number;
  ingredientId: number | null;
  qty: string;
}

interface DishForm {
  name: string;
  meal: MealType;
  portions: string;
  isActive: boolean;
  recipe: RecipeRow[];
}

let rowKey = 0;
const nextKey = () => ++rowKey;

const formFromDish = (dish: HotelDish | null, meal: MealType): DishForm =>
  dish
    ? {
        name: dish.name,
        meal: dish.meal,
        portions: String(Number(dish.portionsPerGuest)),
        isActive: dish.isActive,
        recipe: dish.ingredients.map((l) => ({ key: nextKey(), ingredientId: l.ingredientId, qty: String(Number(l.qtyPerPortion)) })),
      }
    : { name: "", meal, portions: "1", isActive: true, recipe: [{ key: nextKey(), ingredientId: null, qty: "" }] };

export const KitchenMenuPanel: React.FC<{ propertyId: number }> = ({ propertyId }) => {
  const theme = useTheme();
  const canEdit = useCan("hotel.kitchen.menu");
  const dishesQuery = useQuery({
    queryKey: ["hotel", "kitchen", "dishes", propertyId, "all"],
    queryFn: ({ signal }) => listDishes(propertyId, { includeInactive: true }, signal),
  });
  const ingredientsQuery = useQuery({
    queryKey: ["hotel", "kitchen", "ingredients", propertyId, "all"],
    queryFn: ({ signal }) => listIngredients(propertyId, signal, { includeInactive: true }),
  });
  const [editing, setEditing] = React.useState<{ dish: HotelDish | null; meal: MealType } | null>(null);

  const dishes = dishesQuery.data ?? [];
  const ingredients = ingredientsQuery.data ?? [];

  if (dishesQuery.isError) {
    return (
      <Alert severity="error" variant="outlined">
        {getErrorMessage(dishesQuery.error, "Не удалось загрузить меню")}
      </Alert>
    );
  }

  return (
    <>
      {!canEdit && (
        <Alert severity="info" variant="outlined">
          Меню меняет сотрудник с правом «Кухня: меню». Здесь его можно посмотреть.
        </Alert>
      )}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2, alignItems: "start" }}>
        {MEALS.map((meal) => {
          const list = dishes.filter((d) => d.meal === meal).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
          const window = MEAL_SERVING_WINDOW[meal];
          return (
            <Surface key={meal}>
              <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{MEAL_LABELS[meal]}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {window.from} – {window.to}
                </Typography>
              </Stack>
              {dishesQuery.isPending ? (
                <Typography variant="body2" color="text.disabled">
                  Загружаем…
                </Typography>
              ) : list.length === 0 ? (
                <Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>
                  Блюд нет
                </Typography>
              ) : (
                list.map((dish, i) => (
                  <Box
                    key={dish.id}
                    component={canEdit ? "button" : "div"}
                    type={canEdit ? "button" : undefined}
                    onClick={canEdit ? () => setEditing({ dish, meal }) : undefined}
                    sx={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      font: "inherit",
                      color: "inherit",
                      bgcolor: "transparent",
                      border: 0,
                      borderTop: i === 0 ? "none" : `1px solid ${subtleBorder(theme)}`,
                      py: 1,
                      px: 0.5,
                      mx: -0.5,
                      borderRadius: 0,
                      cursor: canEdit ? "pointer" : "default",
                      opacity: dish.isActive ? 1 : 0.55,
                      "&:hover": canEdit ? { bgcolor: "action.hover" } : undefined,
                    }}
                  >
                    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {dish.name}
                      </Typography>
                      {dish.isActive ? (
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                          {formatQty(dish.portionsPerGuest)} на гостя
                        </Typography>
                      ) : (
                        <StatusPill color={theme.palette.text.disabled} label="Скрыто" />
                      )}
                    </Stack>
                    <Typography variant="caption" color={dish.ingredients.length ? "text.secondary" : "warning.main"} component="div" noWrap>
                      {dish.ingredients.length
                        ? dish.ingredients.map((l) => `${l.ingredientName} ${formatQty(l.qtyPerPortion)} ${unitRu(l.unit)}`).join(" · ")
                        : "Рецепт не заполнен — продукты для блюда не посчитаются"}
                    </Typography>
                  </Box>
                ))
              )}
              {canEdit && (
                <Button size="small" startIcon={<AddOutlined />} onClick={() => setEditing({ dish: null, meal })} sx={{ mt: 1 }}>
                  Добавить блюдо
                </Button>
              )}
            </Surface>
          );
        })}
      </Box>
      <DishDrawer
        open={editing != null}
        dish={editing?.dish ?? null}
        meal={editing?.meal ?? "breakfast"}
        propertyId={propertyId}
        ingredients={ingredients}
        onClose={() => setEditing(null)}
      />
    </>
  );
};

const DishDrawer: React.FC<{
  open: boolean;
  dish: HotelDish | null;
  meal: MealType;
  propertyId: number;
  ingredients: HotelIngredient[];
  onClose: () => void;
}> = ({ open, dish, meal, propertyId, ingredients, onClose }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canProducts = useCan("hotel.kitchen.purchases");
  const [form, setForm] = React.useState<DishForm>(() => formFromDish(dish, meal));
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(formFromDish(dish, meal));
    setShowErrors(false);
    setError(null);
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dish?.id]);

  const byId = React.useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  // В рецепт — только активные продукты; уже стоящий в рецепте скрытый оставляем видимым.
  const options = ingredients.filter((i) => i.isActive || form.recipe.some((r) => r.ingredientId === i.id));
  const set = <K extends keyof DishForm>(key: K, value: DishForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setRow = (key: number, patch: Partial<RecipeRow>) =>
    setForm((f) => ({ ...f, recipe: f.recipe.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  // Пустая строка рецепта (продукт не выбран и количества нет) — просто не сохраняется.
  const filledRows = form.recipe.filter((r) => r.ingredientId != null || r.qty.trim() !== "");
  const duplicate = new Set<number>();
  const seen = new Set<number>();
  for (const r of filledRows) {
    if (r.ingredientId == null) continue;
    if (seen.has(r.ingredientId)) duplicate.add(r.ingredientId);
    seen.add(r.ingredientId);
  }
  const recipeInvalid =
    filledRows.some((r) => r.ingredientId == null || fieldError(r.qty, KITCHEN_RULES.perPortion) != null) || duplicate.size > 0;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "kitchen"] });

  const handleSave = async () => {
    const invalid = hasFieldErrors([
      [form.name, KITCHEN_RULES.name],
      [form.portions, KITCHEN_RULES.portions],
    ]);
    if (invalid || recipeInvalid) {
      setShowErrors(true);
      focusFirstFieldError();
      return;
    }
    const recipe = filledRows.map((r) => ({ ingredientId: r.ingredientId!, qtyPerPortion: String(Number(r.qty)) }));
    setSaving(true);
    setError(null);
    try {
      if (dish) {
        await updateDish(dish.id, {
          name: form.name.trim(),
          meal: form.meal,
          portionsPerGuest: String(Number(form.portions)),
          isActive: form.isActive,
          ingredients: recipe,
        });
      } else {
        await createDish({
          propertyId,
          name: form.name.trim(),
          meal: form.meal,
          portionsPerGuest: String(Number(form.portions)),
          ingredients: recipe,
        });
      }
      invalidate();
      enqueueSnackbar(dish ? "Блюдо сохранено" : `Блюдо «${form.name.trim()}» добавлено в меню`, { variant: "success" });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось сохранить блюдо"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!dish) return;
    setSaving(true);
    setError(null);
    try {
      await deleteDish(dish.id);
      invalidate();
      enqueueSnackbar(`Блюдо «${dish.name}» удалено`, { variant: "success" });
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setError(getErrorMessage(err, "Не удалось удалить блюдо"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={() => !saving && onClose()}
      PaperProps={{ sx: { width: DRAWER_WIDTH, maxWidth: "100vw", display: "flex", flexDirection: "column", backgroundImage: "none" } }}
    >
      <DrawerHeader title={dish ? dish.name : "Новое блюдо"} subtitle={MEAL_LABELS[form.meal]} onClose={() => !saving && onClose()} />
      <Box sx={{ px: 3, py: 3, flex: 1, overflowY: "auto" }}>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}
          <DrawerSection label="Блюдо" first>
            <FormField
              icon={<RestaurantMenuOutlined />}
              label="Название"
              placeholder="Омлет с зеленью"
              value={form.name}
              onValueChange={(v) => set("name", v)}
              rules={KITCHEN_RULES.name}
              showErrors={showErrors}
              disabled={saving}
              autoFocus={!dish}
              fullWidth
            />
            <Stack direction="row" gap={0.75} flexWrap="wrap">
              {MEALS.map((m) => (
                <Chip
                  key={m}
                  label={MEAL_LABELS[m]}
                  color={form.meal === m ? "primary" : "default"}
                  variant={form.meal === m ? "filled" : "outlined"}
                  onClick={() => set("meal", m)}
                  disabled={saving}
                />
              ))}
            </Stack>
            <FormField
              icon={<GroupsOutlined />}
              label="Порций на гостя"
              value={form.portions}
              onValueChange={(v) => set("portions", v)}
              rules={KITCHEN_RULES.portions}
              showErrors={showErrors}
              disabled={saving}
              helperText="1 — каждому гостю по порции, 0,5 — берёт каждый второй"
              fullWidth
            />
            {dish && (
              <FormControlLabel
                control={<Switch checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} disabled={saving} />}
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      В меню
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Выключите, чтобы убрать из плана готовки, не теряя рецепт
                    </Typography>
                  </Box>
                }
              />
            )}
          </DrawerSection>

          <DrawerSection label="Рецепт на одну порцию">
            {ingredients.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Продуктов пока нет. {canProducts ? "Добавьте их на вкладке «Продукты»." : "Их заводит сотрудник с правом на закупки."}
              </Typography>
            ) : (
              <Stack gap={1.5}>
                {form.recipe.map((row) => {
                  const ingredient = row.ingredientId != null ? byId.get(row.ingredientId) : undefined;
                  const rowTouched = row.ingredientId != null || row.qty.trim() !== "";
                  const missingIngredient = showErrors && rowTouched && row.ingredientId == null;
                  const isDuplicate = row.ingredientId != null && duplicate.has(row.ingredientId);
                  return (
                    <Stack key={row.key} direction="row" gap={1} alignItems="flex-start">
                      <Autocomplete<HotelIngredient>
                        options={options}
                        value={ingredient ?? null}
                        onChange={(_, value) => setRow(row.key, { ingredientId: value?.id ?? null })}
                        getOptionLabel={(o) => `${o.name}${o.isActive ? "" : " (скрыт)"}`}
                        isOptionEqualToValue={(o, v) => o.id === v.id}
                        disabled={saving}
                        noOptionsText="Нет такого продукта"
                        sx={{ flex: 1.6, minWidth: 0 }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Продукт"
                            error={missingIngredient || isDuplicate}
                            helperText={missingIngredient ? "Выберите продукт" : isDuplicate ? "Уже есть в рецепте" : " "}
                          />
                        )}
                      />
                      <FormField
                        icon={<ScaleOutlined />}
                        label="На порцию"
                        unit={ingredient ? unitRu(ingredient.unit) : undefined}
                        value={row.qty}
                        onValueChange={(v) => setRow(row.key, { qty: v })}
                        rules={rowTouched ? KITCHEN_RULES.perPortion : { kind: "decimal", maxDecimals: 3 }}
                        showErrors={showErrors}
                        disabled={saving}
                        helperText=" "
                        sx={{ flex: 1, minWidth: 0 }}
                      />
                      <Tooltip title="Убрать из рецепта">
                        <span>
                          <IconButton
                            onClick={() => setForm((f) => ({ ...f, recipe: f.recipe.filter((r) => r.key !== row.key) }))}
                            disabled={saving}
                            aria-label="Убрать продукт из рецепта"
                            sx={{ mt: 1 }}
                          >
                            <CloseOutlined fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  );
                })}
                <Box>
                  <Button
                    size="small"
                    startIcon={<AddOutlined />}
                    onClick={() => setForm((f) => ({ ...f, recipe: [...f.recipe, { key: nextKey(), ingredientId: null, qty: "" }] }))}
                    disabled={saving}
                  >
                    Добавить продукт
                  </Button>
                </Box>
                {filledRows.length === 0 && (
                  <Typography variant="caption" color="warning.main">
                    Без рецепта блюдо будет в плане готовки, но продукты на него не посчитаются.
                  </Typography>
                )}
              </Stack>
            )}
          </DrawerSection>
        </Stack>
      </Box>
      <DrawerFooter
        summary={
          dish && (
            <Button color="error" startIcon={<DeleteOutlineOutlined />} onClick={() => setConfirmDelete(true)} disabled={saving}>
              Удалить
            </Button>
          )
        }
      >
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button
          variant="contained"
          disableElevation
          onClick={() => void handleSave()}
          disabled={saving}
          sx={{ px: 3, borderRadius: "10px", fontWeight: 700 }}
        >
          {saving ? "Сохраняем…" : dish ? "Сохранить" : "Добавить блюдо"}
        </Button>
      </DrawerFooter>

      <Dialog open={confirmDelete} onClose={() => !saving && setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить блюдо?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            «{dish?.name}» пропадёт из меню вместе с рецептом. Если блюдо нужно убрать на время, лучше выключите «В меню».
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)} disabled={saving}>
            Отмена
          </Button>
          <Button color="error" variant="contained" disableElevation onClick={() => void handleDelete()} disabled={saving}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
};

export default KitchenMenuPanel;
