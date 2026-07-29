import React from "react";
import {
  Autocomplete,
  Box,
  ButtonBase,
  Collapse,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";

// parseRelatedQuantity — общий парсер decimal-количества (> 0, до 3 знаков):
// у расходника приёма та же семантика, что у состава услуги в справочнике.
import { parseRelatedQuantity } from "../../api/catalog";
import type { DjangoProduct } from "../../api/warehouse";
import { formatQuantity } from "../../utility/format";
import { useT } from "../../i18n/VerticalProvider";
import type { ConsumptionRow } from "./consumptionRows";

const productFilter = createFilterOptions<DjangoProduct>({
  matchFrom: "any",
  stringify: (p) => `${p.name} ${p.barcode} ${p.price}`,
});

interface Props {
  rows: ConsumptionRow[];
  /** Каталог товаров для добавления новых расходников. */
  options: DjangoProduct[];
  onChange: (rows: ConsumptionRow[]) => void;
  disabled?: boolean;
  showErrors?: boolean;
}

/**
 * Редактор расходников одной строки услуги в форме приёма.
 *
 * По умолчанию свёрнут в одну строку-сводку: расходники подставляются из состава
 * услуги автоматически, и в форме с несколькими услугами развёрнутый список
 * забивал бы всё поле зрения. Разворачивается кликом, когда их правят руками.
 *
 * ⚠ Правка любого значения делает строку `manual` на бэке — автопересчёт по
 * количеству услуги для неё выключается. Поэтому вызывающий отправляет
 * `consumptions` только после реального изменения.
 */
const ConsumptionRowsEditor: React.FC<Props> = ({
  rows,
  options,
  onChange,
  disabled,
  showErrors,
}) => {
  const { t } = useT("appointments");
  const [expanded, setExpanded] = React.useState(false);

  const usedIds = new Set(rows.map((r) => r.productId));
  const available = options.filter((p) => !usedIds.has(p.id));

  const patchRow = (index: number, patch: Partial<ConsumptionRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const summary =
    rows.length === 0
      ? t("consumptions.title")
      : rows
          .map(
            (r) =>
              `${r.name} ${t("consumptions.quantity", {
                quantity: formatQuantity(r.quantity),
                unit: r.unit ? ` ${r.unit}` : "",
              })}`,
          )
          .join(", ");

  return (
    <Box>
      <ButtonBase
        onClick={() => setExpanded((v) => !v)}
        sx={{
          width: 1,
          justifyContent: "flex-start",
          gap: 0.5,
          borderRadius: 1,
          px: 0.5,
          py: 0.25,
        }}
      >
        <ScienceOutlined sx={{ fontSize: 15, color: "text.disabled", flexShrink: 0 }} />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flex: 1, minWidth: 0, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {summary}
        </Typography>
        <ExpandMoreOutlined
          sx={{
            fontSize: 16,
            color: "text.disabled",
            flexShrink: 0,
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}
        />
      </ButtonBase>

      <Collapse in={expanded} unmountOnExit>
        <Stack spacing={0.5} sx={{ pt: 0.5 }}>
          {rows.map((row, index) => {
            const invalid = showErrors && parseRelatedQuantity(row.quantity) === null;
            return (
              <Stack
                key={row.lineId ?? `new-${row.productId}`}
                direction="row"
                alignItems="flex-start"
                spacing={0.5}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" display="block" noWrap>
                    {row.name}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {row.stockOnHand === null
                      ? t("consumptions.stockUnknown")
                      : t("consumptions.stock", {
                          stock: formatQuantity(row.stockOnHand),
                        })}
                  </Typography>
                </Box>
                <TextField
                  value={row.quantity}
                  onChange={(e) => patchRow(index, { quantity: e.target.value })}
                  disabled={disabled}
                  size="small"
                  error={invalid}
                  helperText={invalid ? t("consumptions.quantityError") : row.unit || " "}
                  inputProps={{ inputMode: "decimal", style: { textAlign: "right" } }}
                  sx={{ width: 88, flexShrink: 0 }}
                />
                <Tooltip
                  title={
                    row.autoWriteOff
                      ? t("consumptions.hint")
                      : t("consumptions.noWriteOff")
                  }
                >
                  <Switch
                    checked={row.autoWriteOff}
                    onChange={(e) => patchRow(index, { autoWriteOff: e.target.checked })}
                    disabled={disabled}
                    size="small"
                  />
                </Tooltip>
                <Tooltip title={t("consumptions.remove")}>
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      disabled={disabled}
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      sx={{ p: 0.25, mt: 0.5 }}
                    >
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            );
          })}

          <Autocomplete<DjangoProduct>
            options={available}
            disabled={disabled}
            filterOptions={productFilter}
            getOptionLabel={(p) => p.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            // Пикер добавления значения не держит: выбор сразу уходит строкой.
            value={null}
            blurOnSelect
            clearOnBlur
            onChange={(_, p) => {
              if (!p) return;
              onChange([
                ...rows,
                {
                  lineId: null,
                  productId: p.id,
                  name: p.name,
                  unit: p.unit,
                  quantity: "1",
                  autoWriteOff: true,
                  // Остаток филиала знает только бэк — до перезагрузки приёма
                  // не выдумываем число (ноль читался бы как нехватка).
                  stockOnHand: null,
                  source: "manual",
                },
              ]);
            }}
            renderOption={(props, p) => (
              <li {...props} key={p.id}>
                <Stack>
                  <Typography variant="body2">{p.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t("consumptions.stock", { stock: formatQuantity(p.stock) })} {p.unit}
                  </Typography>
                </Stack>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={t("consumptions.addProduct")}
                size="small"
                fullWidth
              />
            )}
          />
        </Stack>
      </Collapse>
    </Box>
  );
};

export default ConsumptionRowsEditor;
