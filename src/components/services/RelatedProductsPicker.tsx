import React from "react";
import { Autocomplete, Chip, Stack, TextField, Typography } from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";

import { SERVICE_RELATED_PRODUCTS_MULTI_ENABLED } from "../../api/catalog";
import type { DjangoProduct } from "../../api/warehouse";
import { formatKGS } from "../../utility/format";

// Поиск товара по названию, штрихкоду и цене (как в форме приёма).
const productFilter = createFilterOptions<DjangoProduct>({
  matchFrom: "any",
  stringify: (p) => `${p.name} ${p.barcode} ${p.price}`,
});

type Props = {
  options: DjangoProduct[];
  loading?: boolean;
  /** Выбранные товары; при выключенном мульти-флаге используется первый. */
  value: DjangoProduct[];
  onChange: (value: DjangoProduct[]) => void;
  disabled?: boolean;
};

/**
 * Пикер сопутствующих товаров услуги (общий для форм создания и редактирования).
 * Состояние всегда список; одиночный режим — пока бэк держит один FK
 * (`SERVICE_RELATED_PRODUCTS_MULTI_ENABLED`), чтобы форма не давала выбрать
 * несколько товаров и молча потерять лишние при сохранении.
 */
const RelatedProductsPicker: React.FC<Props> = ({
  options,
  loading,
  value,
  onChange,
  disabled,
}) => {
  const multi = SERVICE_RELATED_PRODUCTS_MULTI_ENABLED;

  const shared = {
    options,
    loading,
    filterOptions: productFilter,
    getOptionLabel: (p: DjangoProduct) => `${p.name} — ${formatKGS(p.price)}`,
    isOptionEqualToValue: (a: DjangoProduct, b: DjangoProduct) => a.id === b.id,
    noOptionsText: "Товары не найдены",
    disabled,
    renderOption: (props: React.HTMLAttributes<HTMLLIElement>, p: DjangoProduct) => (
      <li {...props} key={p.id}>
        <Stack>
          <Typography variant="body2">{p.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {formatKGS(p.price)} · остаток {p.stock} {p.unit}
          </Typography>
        </Stack>
      </li>
    ),
  };

  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" color="text.secondary" fontWeight={600}>
        {multi ? "Сопутствующие товары" : "Сопутствующий товар"}
      </Typography>
      {multi ? (
        <Autocomplete
          {...shared}
          multiple
          disableCloseOnSelect
          value={value}
          onChange={(_, v) => onChange(v)}
          renderTags={(val, getTagProps) =>
            val.map((opt, idx) => (
              <Chip {...getTagProps({ index: idx })} key={opt.id} label={opt.name} size="small" />
            ))
          }
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={value.length === 0 ? "Например: Гель для УЗИ" : ""}
              helperText="Необязательно: товары со склада, связанные с услугой"
            />
          )}
        />
      ) : (
        <Autocomplete
          {...shared}
          value={value[0] ?? null}
          onChange={(_, v) => onChange(v ? [v] : [])}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Например: Гель для УЗИ"
              helperText="Необязательно: товар со склада, связанный с услугой"
            />
          )}
        />
      )}
    </Stack>
  );
};

export default RelatedProductsPicker;
