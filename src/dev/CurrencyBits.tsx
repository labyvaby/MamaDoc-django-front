/**
 * Мелочи «режима валют»: сумма в выбранной валюте рядом с основной
 * («≈ $85,76») и переключатель валюты показа. Показываются, только когда у
 * объекта есть курсы (useExchangeRates), иначе ничего не рисуют.
 */
import React from "react";
import { ButtonBase, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import { currencySign } from "./hotelReportFormat";
import { rateOf, useDisplayCurrency, useExchangeRates } from "./useExchangeRates";

const fmt = (n: number, currency: string) => {
  const sign = currencySign(currency);
  const text = n.toLocaleString("ru-RU", { maximumFractionDigits: n >= 100 ? 0 : 2 });
  return currency === "USD" || currency === "EUR" ? `${sign}${text}` : `${text} ${sign}`;
};

/** «≈ $85,76» — сумма базовой валюты в валюте показа; ничего, если пересчитывать не во что. */
export const CurrencyEquivalent: React.FC<{ propertyId: number | null | undefined; amount: number; baseCurrency?: string; prefix?: string }> = ({
  propertyId,
  amount,
  baseCurrency = "KGS",
  prefix = "≈ ",
}) => {
  const ratesQuery = useExchangeRates(propertyId, baseCurrency);
  const [display] = useDisplayCurrency();
  const state = ratesQuery.data;
  if (!state?.available || !display || display === state.baseCurrency) return null;
  const rate = rateOf(state, display);
  if (!rate) return null;
  return (
    <Tooltip title={`По курсу 1 ${display} = ${rate.toLocaleString("ru-RU")} ${currencySign(state.baseCurrency)}`}>
      <Typography component="span" variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {prefix}
        {fmt(amount / rate, display)}
      </Typography>
    </Tooltip>
  );
};

/** Переключатель валюты показа: «сом · $ · € · ₽» — запоминается на устройстве. */
export const DisplayCurrencySwitch: React.FC<{ propertyId: number | null | undefined; baseCurrency?: string }> = ({ propertyId, baseCurrency = "KGS" }) => {
  const theme = useTheme();
  const ratesQuery = useExchangeRates(propertyId, baseCurrency);
  const [display, setDisplay] = useDisplayCurrency();
  const state = ratesQuery.data;
  if (!state?.available || state.rates.length === 0) return null;
  const options = ["", ...state.rates.map((r) => r.currency)];
  return (
    <Stack direction="row" sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: "8px", overflow: "hidden" }}>
      {options.map((code) => {
        const active = (display || "") === code || (code === "" && !options.includes(display));
        return (
          <ButtonBase
            key={code || "base"}
            onClick={() => setDisplay(code)}
            title={code ? `Показывать суммы ещё и в ${code}` : "Только базовая валюта"}
            sx={{
              px: 0.9,
              py: 0.25,
              fontSize: 12,
              fontWeight: 700,
              color: active ? "primary.main" : "text.secondary",
              bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : "transparent",
            }}
          >
            {code ? currencySign(code) : currencySign(state.baseCurrency)}
          </ButtonBase>
        );
      })}
    </Stack>
  );
};
