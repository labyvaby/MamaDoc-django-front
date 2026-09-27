import React from "react";
import { Autocomplete, Box, MenuItem, TextField, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import type { DjangoUnitOfMeasure } from "../../api/warehouse";
import { draftProductName, isVariantDraft, type CategoryOption, type NewProductDraft } from "./newProductDraft";

export interface NewProductFieldsProps {
  draft: NewProductDraft;
  onChange: (patch: Partial<NewProductDraft>) => void;
  /** Справочник категорий (розница); пусто — категория свободной строкой. */
  categories: CategoryOption[];
  /** Подсказки к свободной категории — уже заведённые значения (клиника). */
  legacyCategories: string[];
  units: DjangoUnitOfMeasure[];
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
  problem,
  disabled,
}) => {
  const category = categories.find((option) => option.id === draft.categoryId) ?? null;
  const variant = isVariantDraft(draft, category);
  const showAxes = Boolean(category?.matrix || draft.color || draft.size);
  const activeUnits = units.filter((unit) => unit.isActive || unit.id === draft.unitId);
  const finalName = variant ? `${draft.name.trim()}, ${draft.color.trim()}, ${draft.size.trim()}` : draftProductName(draft);

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
        // Три ряда: категория и цена · оси варианта · штрихкод, артикул, единица.
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" },
        gap: 1,
      })}
    >
      {categories.length > 0 ? (
        <TextField
          select
          size="small"
          label="Категория"
          value={draft.categoryId ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ categoryId: e.target.value === "" ? null : Number(e.target.value) })}
          sx={{ gridColumn: { xs: "1 / -1", md: "span 2" }, minWidth: 0 }}
          SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } }}
        >
          <MenuItem value="">
            <em>Без категории</em>
          </MenuItem>
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
          sx={{ gridColumn: { xs: "1 / -1", md: "span 2" }, minWidth: 0 }}
          renderInput={(params) => <TextField {...params} label="Категория" />}
        />
      )}
      <TextField
        size="small"
        label="Цена продажи"
        value={draft.price}
        disabled={disabled}
        onChange={(e) => onChange({ price: e.target.value })}
        inputProps={{ inputMode: "decimal", style: { textAlign: "right" } }}
        sx={{ minWidth: 0 }}
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
            sx={{ minWidth: 0, gridColumnStart: 1 }}
            renderInput={(params) => <TextField {...params} label="Цвет" />}
          />
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

      <Typography
        variant="caption"
        color={problem ? "error.main" : "text.secondary"}
        sx={{ gridColumn: "1 / -1", lineHeight: 1.4 }}
      >
        {problem
          ? problem
          : variant
            ? `Вариант модели «${draft.name.trim()}»: «${finalName}». Модель, цвет и размер, которых нет, заведутся сами.`
            : `Новая карточка «${finalName}» появится в каталоге вместе с приходом.`}
      </Typography>
    </Box>
  );
};

export default NewProductFields;
