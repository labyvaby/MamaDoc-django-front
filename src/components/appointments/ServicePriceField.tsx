import React from "react";
import { IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";

import { useCan } from "../../hooks/useCan";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";

/**
 * Цена и длительность строки услуги в формах приёма.
 *
 * Правка цены закрыта правом `appointments.price_override`: с 19.08.2026 бэк
 * отвечает 403 на любую цену, ушедшую от каталожной, — и на выделенной ручке,
 * и через `services[].unitPrice` в create/PATCH. Без права поле остаётся тем
 * же, чем было раньше, — подписью с ценой из прайса.
 *
 * Три случая бэк пропускает без права, и все три здесь достижимы:
 * эхо текущей цены (поле не трогали), ровно каталожная цена (кнопка сброса) и
 * пересчёт при смене услуги (её делает форма, обнуляя `value`).
 *
 * Пустой `value` значит «как в прайсе»: форма такую строку отправляет без
 * `unitPrice`, и цену снапшотит сам бэк.
 */
export interface ServicePriceFieldProps {
  /** Каталожная цена выбранной услуги. */
  basePrice: string | number;
  /** Цена строки; пустая строка — «как в прайсе». */
  value: string;
  onChange: (next: string) => void;
  baseDurationMinutes: number;
  durationValue: string;
  onDurationChange: (next: string) => void;
  /** Форма сохраняется или строка заблокирована по другой причине. */
  disabled?: boolean;
  /** Хвост подписи (в дровере записи там длительность услуги). */
  suffix?: React.ReactNode;
}

const num = (v: string | number): number => Number(v) || 0;

/** Отличается ли цена строки от каталожной. Пустая строка — не отличается. */
export function isPriceOverridden(value: string, basePrice: string | number): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return num(trimmed) !== num(basePrice);
}

export function isDurationOverridden(value: string, baseDurationMinutes: number): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && Number(trimmed) !== baseDurationMinutes;
}

const ServicePriceField: React.FC<ServicePriceFieldProps> = ({
  basePrice,
  value,
  onChange,
  baseDurationMinutes,
  durationValue,
  onDurationChange,
  disabled,
  suffix,
}) => {
  const { t } = useT("appointments");
  const canOverride = useCan("appointments.price_override");

  const overridden = isPriceOverridden(value, basePrice);
  const durationOverridden = isDurationOverridden(durationValue, baseDurationMinutes);
  // Поле раскрыто, пока цена отличается от каталожной: свернуть его обратно в
  // подпись значило бы спрятать причину, по которой сумма приёма не сходится
  // с прайсом.
  const [editing, setEditing] = React.useState(overridden || durationOverridden);
  React.useEffect(() => {
    if (overridden || durationOverridden) setEditing(true);
  }, [overridden, durationOverridden]);

  const effective = value.trim() ? value : String(basePrice);
  const invalid = value.trim() !== "" && (isNaN(Number(value)) || Number(value) < 0);
  const effectiveDuration = durationValue.trim()
    ? Number(durationValue)
    : baseDurationMinutes;
  const invalidDuration =
    durationValue.trim() !== "" &&
    (!Number.isInteger(Number(durationValue)) || Number(durationValue) <= 0);

  if (!canOverride || !editing) {
    return (
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          {t("addDrawer.priceLabel")} <strong>{formatKGS(effective)}</strong>
          {` · ${effectiveDuration} ${t("priceField.minutesShort")}`}
          {suffix}
        </Typography>
        {canOverride && (
          <Tooltip title={t("priceField.action")}>
            <span>
              <IconButton
                size="small"
                disabled={disabled}
                onClick={() => setEditing(true)}
                aria-label={t("priceField.action")}
                sx={{ p: 0.25 }}
              >
                <EditOutlined sx={{ fontSize: 15 }} />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>
    );
  }

  return (
    <Stack direction="row" spacing={0.75} alignItems="flex-start" flexWrap="wrap" useFlexGap>
      <TextField
        size="small"
        type="number"
        label={t("priceField.label")}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={String(basePrice)}
        error={invalid}
        helperText={
          invalid
            ? t("priceField.invalid")
            : overridden
            ? t("priceField.catalog", { price: formatKGS(basePrice) })
            : ""
        }
        inputProps={{ min: 0, step: "0.01" }}
        sx={{ maxWidth: 160 }}
      />
      <TextField
        size="small"
        type="number"
        label={t("priceField.durationLabel")}
        value={durationValue}
        disabled={disabled}
        onChange={(e) => onDurationChange(e.target.value)}
        placeholder={String(baseDurationMinutes)}
        error={invalidDuration}
        helperText={invalidDuration ? t("priceField.invalidDuration") : ""}
        inputProps={{ min: 1, step: 1 }}
        sx={{ maxWidth: 160 }}
      />
      {(overridden || durationOverridden) && (
        <Tooltip title={t("priceField.reset")}>
          <span>
            <IconButton
              size="small"
              disabled={disabled}
              onClick={() => {
                onChange("");
                onDurationChange("");
                setEditing(false);
              }}
              aria-label={t("priceField.reset")}
              sx={{ mt: 0.5, p: 0.25 }}
            >
              <RestartAltOutlined sx={{ fontSize: 17 }} />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Stack>
  );
};

export default ServicePriceField;
