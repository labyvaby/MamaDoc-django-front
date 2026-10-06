import React from "react";
import { Autocomplete, Box, MenuItem, TextField, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import type { DjangoUnitOfMeasure } from "../../api/warehouse";
import { draftProductName, isVariantDraft, variantName, type CategoryOption, type NewProductDraft } from "./newProductDraft";

/** Значение пункта «новая категория» в выпадающем списке — не id справочника. */
const NEW_CATEGORY = "__new__";

export interface NewProductFieldsProps {
  draft: NewProductDraft;
  onChange: (patch: Partial<NewProductDraft>) => void;
  /** Справочник категорий (розница); пусто — категория свободной строкой. */
  categories: CategoryOption[];
  /** Подсказки к свободной категории — уже заведённые значения (клиника). */
  legacyCategories: string[];
  units: DjangoUnitOfMeasure[];
  /** Уже заведённые бренды организации — подсказки, чтобы не плодить написания. */
  brands?: string[];
  /** Уже заведённые сезоны организации — подсказки к полю «Сезон». */
  seasons?: string[];
  /**
   * Категория ещё не заведена (`newCategory`), но заведётся вариантной —
   * её оси подставляются сюда, чтобы строка уже сейчас считалась моделью.
   */
  pendingCategory?: CategoryOption | null;
  /** Размеры строки разложены отдельными строками — одиночное поле не нужно. */
  sizes?: string[];
  /** Текст проблемы черновика или null — см. draftProblem. */
  problem: string | null;
  disabled?: boolean;
}

/**
 * Поля карточки, которая заведётся вместе с приходом. Название — в самой
 * строке накладной; здесь то, без чего товар не продать: категория, цена
 * продажи, единица, штрихкод и артикул. В категории «цвет × размер»
 * появляются оси — тогда строка становится вариантом модели.
 */
export const NewProductFields: React.FC<NewProductFieldsProps> = ({
  draft,
  onChange,
  categories,
  legacyCategories,
  units,
  brands = [],
  seasons = [],
  pendingCategory = null,
  sizes,
  problem,
  disabled,
}) => {
  const category = categories.find((option) => option.id === draft.categoryId) ?? (draft.categoryId == null ? pendingCategory : null);
  const bySizes = Boolean(sizes?.length);
  // Разложенная по размерам строка — вариант, если категория вариантная: размер у каждой строки свой.
  const variant = bySizes ? Boolean(category?.matrix) : isVariantDraft(draft, category);
  const showAxes = Boolean(category?.matrix || draft.color || draft.size || bySizes);
  const activeUnits = units.filter((unit) => unit.isActive || unit.id === draft.unitId);
  const finalName = variant ? variantName(draft) : draftProductName(draft);
  const sizeList = (sizes ?? []).filter((size) => size.trim()).join(", ");

  return (
    <Box
      sx={(t) => ({
        mt: 1,
        p: 1,
        borderRadius: "10px",
        border: "1px dashed",
        borderColor: alpha(t.palette.success.main, 0.45),
        bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.08 : 0.04),
        display: "grid",
        // Три ряда: категория, бренд и цена · оси варианта · штрихкод, артикул, единица.
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" },
        gap: 1,
      })}
    >
      {categories.length > 0 ? (
        <TextField
          select
          size="small"
          label="Категория"
          // Категории ещё нет в справочнике — её имя из накладной; заведётся при проведении.
          value={draft.categoryId ?? (draft.newCategory.trim() ? NEW_CATEGORY : "")}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value;
            if (next === NEW_CATEGORY) return;
            onChange({ categoryId: next === "" ? null : Number(next), newCategory: "" });
          }}
          sx={{ gridColumn: { xs: "1 / -1", md: "span 1" }, minWidth: 0 }}
          SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } }}
        >
          <MenuItem value="">
            <em>Без категории</em>
          </MenuItem>
          {draft.newCategory.trim() && (
            <MenuItem value={NEW_CATEGORY}>
              {draft.newCategory.trim()}
              <Typography component="span" variant="caption" color="success.main" sx={{ ml: 1, fontWeight: 700 }}>
                новая — создастся при проведении
              </Typography>
            </MenuItem>
          )}
          {categories.map((option) => (
            <MenuItem key={option.id} value={option.id}>
              {option.label}
              {option.matrix && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  цвет × размер
                </Typography>
              )}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <Autocomplete<string, false, false, true>
          freeSolo
          size="small"
          options={legacyCategories}
          value={draft.category}
          disabled={disabled}
          onChange={(_, next) => onChange({ category: next ?? "" })}
          onInputChange={(_, next) => onChange({ category: next })}
          sx={{ gridColumn: { xs: "1 / -1", md: "span 1" }, minWidth: 0 }}
          renderInput={(params) => <TextField {...params} label="Категория" />}
        />
      )}
      <Autocomplete<string, false, false, true>
        freeSolo
        size="small"
        options={brands}
        value={draft.brand}
        disabled={disabled}
        onChange={(_, next) => onChange({ brand: next ?? "" })}
        onInputChange={(_, next) => onChange({ brand: next })}
        // Набрали «zara», а «Zara» уже заведена — берём заведённое написание.
        onBlur={() => {
          const known = brands.find((b) => b.toLowerCase() === draft.brand.trim().toLowerCase());
          if (known && known !== draft.brand) onChange({ brand: known });
        }}
        sx={{ minWidth: 0 }}
        renderInput={(params) => (
          <TextField {...params} label="Бренд" placeholder="Бренд поставщика" InputLabelProps={{ ...params.InputLabelProps, shrink: true }} />
        )}
      />
      <TextField
        size="small"
        label="Цена продажи"
        value={draft.price}
        disabled={disabled}
        onChange={(e) => onChange({ price: e.target.value })}
        inputProps={{ inputMode: "decimal", style: { textAlign: "right" }, "aria-label": "Цена продажи" }}
        sx={{ minWidth: 0 }}
      />

      <Autocomplete<string, false, false, true>
        freeSolo
        size="small"
        options={seasons}
        value={draft.season}
        disabled={disabled}
        onChange={(_, next) => onChange({ season: next ?? "" })}
        onInputChange={(_, next) => onChange({ season: next })}
        // Набрали «осень-зима 2026», а так уже заведено — берём заведённое написание.
        onBlur={() => {
          const known = seasons.find((s) => s.toLowerCase() === draft.season.trim().toLowerCase());
          if (known && known !== draft.season) onChange({ season: known });
        }}
        sx={{ minWidth: 0, gridColumnStart: 1 }}
        renderInput={(params) => (
          <TextField {...params} label="Сезон" placeholder="Осень-зима 2026" InputLabelProps={{ ...params.InputLabelProps, shrink: true }} />
        )}
      />
      {showAxes && (
        <>
          <Autocomplete<string, false, false, true>
            freeSolo
            size="small"
            options={category?.colors ?? []}
            value={draft.color}
            disabled={disabled}
            onChange={(_, next) => onChange({ color: next ?? "" })}
            onInputChange={(_, next) => onChange({ color: next })}
            sx={{ minWidth: 0 }}
            renderInput={(params) => (
              <TextField {...params} label="Цвет" placeholder={variant ? "Без цвета" : undefined} InputLabelProps={{ ...params.InputLabelProps, shrink: true }} />
            )}
          />
          {!bySizes && (
            <Autocomplete<string, false, false, true>
              freeSolo
              size="small"
              options={category?.sizes ?? []}
              value={draft.size}
              disabled={disabled}
              onChange={(_, next) => onChange({ size: next ?? "" })}
              onInputChange={(_, next) => onChange({ size: next })}
              sx={{ minWidth: 0 }}
              renderInput={(params) => <TextField {...params} label="Размер" />}
            />
          )}
        </>
      )}

      <TextField
        size="small"
        label="Штрихкод"
        placeholder="Сгенерируется"
        value={draft.barcode}
        disabled={disabled}
        onChange={(e) => onChange({ barcode: e.target.value })}
        InputLabelProps={{ shrink: true }}
        sx={{ minWidth: 0, gridColumnStart: 1 }}
      />
      {!variant && (
        <TextField
          size="small"
          label="Артикул"
          placeholder="Сгенерируется"
          value={draft.sku}
          disabled={disabled}
          onChange={(e) => onChange({ sku: e.target.value })}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 0 }}
        />
      )}
      {activeUnits.length > 0 && (
        <TextField
          select
          size="small"
          label="Ед. изм."
          value={draft.unitId ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ unitId: e.target.value === "" ? null : Number(e.target.value) })}
          sx={{ minWidth: 0 }}
        >
          <MenuItem value="">
            <em>шт</em>
          </MenuItem>
          {activeUnits.map((unit) => (
            <MenuItem key={unit.id} value={unit.id}>
              {unit.shortName}
            </MenuItem>
          ))}
        </TextField>
      )}

      <TextField
        size="small"
        label="Описание"
        placeholder="Что сказано о товаре в накладной"
        value={draft.description}
        disabled={disabled}
        onChange={(e) => onChange({ description: e.target.value })}
        multiline
        minRows={2}
        maxRows={6}
        InputLabelProps={{ shrink: true }}
        inputProps={{ maxLength: 4000 }}
        sx={{ gridColumn: "1 / -1", minWidth: 0 }}
      />

      <Typography
        variant="caption"
        color={problem ? "error.main" : "text.secondary"}
        sx={{ gridColumn: "1 / -1", lineHeight: 1.4 }}
      >
        {problem
          ? problem
          : bySizes
            ? variant
              ? `Модель «${draft.name.trim()}», ${draft.color.trim() || "без цвета"}: каждый размер (${sizeList || "—"}) заведётся вариантом. Модель, цвет и размеры, которых нет, заведутся сами.`
              : `Каждый размер (${sizeList || "—"}) — отдельная карточка «${draftProductName({ ...draft, size: sizes?.[0] ?? "" })}» и т. д. Чтобы завести их вариантами одной модели, выберите категорию «цвет × размер».`
            : variant
              ? `Вариант модели «${draft.name.trim()}»: «${finalName}». Модель, цвет и размер, которых нет, заведутся сами.`
              : `Новая карточка «${finalName}» появится в каталоге вместе с приходом.`}
      </Typography>
    </Box>
  );
};

export default NewProductFields;
