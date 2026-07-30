import React from "react";
import {
  Autocomplete,
  Box,
  Chip,
  IconButton,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import {
  parseRelatedQuantity,
  SERVICE_RELATED_PRODUCTS_MAX,
  SERVICE_RELATED_PRODUCTS_MULTI_ENABLED,
} from "../../api/catalog";
import type { DjangoProduct } from "../../api/warehouse";
import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme";
import { billableTotal, type RelatedProductRow } from "./relatedProductRows";
import { useT } from "../../i18n/VerticalProvider";

// Поиск товара по названию, штрихкоду и цене (как в форме приёма).
const productFilter = createFilterOptions<DjangoProduct>({
  matchFrom: "any",
  stringify: (p) => `${p.name} ${p.barcode} ${p.price}`,
});

type Props = {
  options: DjangoProduct[];
  loading?: boolean;
  /** Состав услуги; при выключенном мульти-флаге используется только первая строка. */
  value: RelatedProductRow[];
  onChange: (value: RelatedProductRow[]) => void;
  disabled?: boolean;
  /** Подсвечивать ошибки количества (после первой попытки сохранить). */
  showErrors?: boolean;
};

/**
 * Состав расходников услуги (общий для форм создания и редактирования):
 * товар + количество на одну услугу + тумблер автосписания со склада при оплате
 * или завершении приёма + платность (входит товар в цену услуги или
 * оплачивается сверх неё).
 *
 * Одиночный режим (`SERVICE_RELATED_PRODUCTS_MULTI_ENABLED = false`) оставлен
 * как откат на старый контракт бэка: там ни количество, ни платность передать
 * нечем, поэтому и полей нет — иначе форма обещала бы то, чего бэк не сохранит.
 */
const RelatedProductsPicker: React.FC<Props> = ({
  options,
  loading,
  value,
  onChange,
  disabled,
  showErrors,
}) => {
  const { t } = useT("services");
  const multi = SERVICE_RELATED_PRODUCTS_MULTI_ENABLED;

  const shared = {
    loading,
    filterOptions: productFilter,
    getOptionLabel: (p: DjangoProduct) => `${p.name} — ${formatKGS(p.price)}`,
    isOptionEqualToValue: (a: DjangoProduct, b: DjangoProduct) => a.id === b.id,
    noOptionsText: t("relatedProducts.noOptions"),
    disabled,
    renderOption: (props: React.HTMLAttributes<HTMLLIElement>, p: DjangoProduct) => (
      <li {...props} key={p.id}>
        <Stack>
          <Typography variant="body2">{p.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t("relatedProducts.optionCaption", { price: formatKGS(p.price), stock: p.stock, unit: p.unit })}
          </Typography>
        </Stack>
      </li>
    ),
  };

  if (!multi) {
    return (
      <Stack spacing={0.5}>
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          {t("relatedProducts.singleLabel")}
        </Typography>
        <Autocomplete
          {...shared}
          options={options}
          value={value[0]?.product ?? null}
          onChange={(_, p) =>
            onChange(
              p ? [{ product: p, quantity: "1", autoWriteOff: true, billable: false }] : [],
            )
          }
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={t("relatedProducts.singlePlaceholder")}
              helperText={t("relatedProducts.singleHelper")}
            />
          )}
        />
      </Stack>
    );
  }

  const usedIds = new Set(value.map((row) => row.product.id));
  const available = options.filter((p) => !usedIds.has(p.id));
  const limitReached = value.length >= SERVICE_RELATED_PRODUCTS_MAX;

  const addProduct = (product: DjangoProduct) => {
    if (limitReached || usedIds.has(product.id)) return;
    // billable: false по умолчанию — товар считается включённым в цену услуги,
    // платность включают осознанно (иначе услуга молча подорожает).
    onChange([...value, { product, quantity: "1", autoWriteOff: true, billable: false }]);
  };

  const patchRow = (index: number, patch: Partial<RelatedProductRow>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const extraCharge = billableTotal(value);

  return (
    <Stack spacing={1}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between">
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          {t("relatedProducts.multiLabel")}
        </Typography>
        {value.length > 0 && (
          <Typography variant="caption" color={limitReached ? "warning.main" : "text.secondary"}>
            {t("relatedProducts.counter", { count: value.length, max: SERVICE_RELATED_PRODUCTS_MAX })}
          </Typography>
        )}
      </Stack>

      {value.map((row, index) => {
        const quantity = parseRelatedQuantity(row.quantity);
        const invalid = showErrors && quantity === null;
        const lineTotal = row.billable ? row.product.price * (quantity ?? 0) : 0;
        return (
          <Paper
            key={row.product.id}
            variant="outlined"
            sx={(t) => ({ p: 1.25, borderRadius: "10px", bgcolor: subtleBg(t) })}
          >
            <Stack direction="row" alignItems="flex-start" spacing={1}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {row.product.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {t("relatedProducts.rowCaption", {
                    price: formatKGS(row.product.price),
                    stock: row.product.stock,
                    unit: row.product.unit,
                  })}
                </Typography>
                {/* Платность видна суммой, а не только чипом: «+9 000 сом»
                    читается однозначнее, чем слово «Платно». */}
                {row.billable && quantity !== null && (
                  <Typography variant="caption" color="primary.onSurface" fontWeight={600}>
                    {t("relatedProducts.extraToPrice", { amount: formatKGS(lineTotal) })}
                  </Typography>
                )}
              </Box>
              <Tooltip
                title={
                  row.billable
                    ? t("relatedProducts.billableToggleOn")
                    : t("relatedProducts.billableToggleOff")
                }
              >
                <Chip
                  label={row.billable ? t("relatedProducts.billableChip") : t("relatedProducts.includedChip")}
                  size="small"
                  onClick={() => patchRow(index, { billable: !row.billable })}
                  disabled={disabled}
                  color={row.billable ? "primary" : "default"}
                  variant={row.billable ? "filled" : "outlined"}
                  sx={{ flexShrink: 0, mt: 0.25, borderRadius: "7px" }}
                />
              </Tooltip>
              <TextField
                value={row.quantity}
                onChange={(e) => patchRow(index, { quantity: e.target.value })}
                disabled={disabled}
                size="small"
                error={invalid}
                helperText={invalid ? t("relatedProducts.quantityError") : row.product.unit || " "}
                inputProps={{ inputMode: "decimal", style: { textAlign: "right" } }}
                sx={{ width: 104, flexShrink: 0 }}
              />
              <Tooltip
                title={
                  row.autoWriteOff
                    ? t("relatedProducts.autoWriteOffOn")
                    : t("relatedProducts.autoWriteOffOff")
                }
              >
                <Switch
                  checked={row.autoWriteOff}
                  onChange={(e) => patchRow(index, { autoWriteOff: e.target.checked })}
                  disabled={disabled}
                  size="small"
                  sx={{ mt: 0.5 }}
                />
              </Tooltip>
              <IconButton
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                disabled={disabled}
                size="small"
                sx={{ mt: 0.5 }}
                aria-label={t("relatedProducts.remove", { name: row.product.name })}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Paper>
        );
      })}

      <Autocomplete
        {...shared}
        options={available}
        disabled={disabled || limitReached}
        // Пикер добавления: сам он значения не держит — выбор сразу уходит
        // строкой в состав, поэтому value всегда null.
        value={null}
        blurOnSelect
        clearOnBlur
        onChange={(_, p) => {
          if (p) addProduct(p);
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={
              limitReached
                ? t("relatedProducts.limitReached", { max: SERVICE_RELATED_PRODUCTS_MAX })
                : t("relatedProducts.addPlaceholder")
            }
            helperText={
              value.length === 0
                ? t("relatedProducts.addHelperEmpty")
                : t("relatedProducts.addHelperNonEmpty")
            }
          />
        )}
      />

      {extraCharge > 0 && (
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography variant="caption" color="text.secondary">
            {t("relatedProducts.extraInVisit")}
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            + {formatKGS(extraCharge)}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
};

export default RelatedProductsPicker;
