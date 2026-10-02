/**
 * «Валюты и курсы» в настройках отеля: какие валюты принимаются и по какому
 * курсу к базовой. По этим курсам ресепшен принимает оплату в долларах,
 * евро, рублях, а суммы можно показывать в выбранной валюте («режим
 * валют»). Бэк: GET/PUT /hotel/properties/{id}/exchange-rates/
 * (контракт §5) — пока его нет, работает демо-режим: курсы хранятся на
 * этом устройстве (hotelDemoStore), и с ними уже принимается оплата в валюте.
 */
import React from "react";
import { Alert, Box, Button, Checkbox, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";

import { getErrorMessage } from "../api/client";
import { saveExchangeRates } from "../api/hotel";
import { useCan } from "../hooks/useCan";
import { currencySign } from "./hotelReportFormat";
import { COMMON_CURRENCIES, CURRENCY_NAMES, useExchangeRates } from "./useExchangeRates";
import { DEMO_KEYS, writeDemo } from "./hotelDemoStore";

export const ExchangeRatesSettingsCard: React.FC<{ propertyId: number; baseCurrency: string }> = ({ propertyId, baseCurrency }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan(["hotel.payments.manage", "hotel.manage"]);
  const query = useExchangeRates(propertyId, baseCurrency);
  const [draft, setDraft] = React.useState<Record<string, { on: boolean; rate: string }>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!query.data) return;
    const next: Record<string, { on: boolean; rate: string }> = {};
    for (const c of COMMON_CURRENCIES) {
      const r = query.data.rates.find((x) => x.currency === c);
      next[c] = { on: r != null, rate: r ? String(Number(r.rate)) : "" };
    }
    for (const r of query.data.rates) if (!next[r.currency]) next[r.currency] = { on: true, rate: String(Number(r.rate)) };
    setDraft(next);
  }, [query.data]);

  if (query.isPending) return null;
  const state = query.data;
  const unavailable = !state?.available;
  const demo = state?.demo ?? false;
  const enabled = Object.entries(draft).filter(([, v]) => v.on);
  const invalid = enabled.some(([, v]) => !(Number(v.rate.replace(",", ".")) > 0));

  const save = async () => {
    setSaving(true);
    try {
      const rates = enabled.map(([currency, v]) => ({ currency, rate: Number(v.rate.replace(",", ".")).toFixed(4) }));
      if (demo) {
        writeDemo(
          DEMO_KEYS.rates(propertyId),
          rates.map((r) => ({ ...r, updatedAt: new Date().toISOString(), updatedByName: "" })),
        );
      } else {
        await saveExchangeRates(propertyId, rates);
      }
      void queryClient.invalidateQueries({ queryKey: ["hotel", "exchangeRates", propertyId] });
      enqueueSnackbar("Курсы сохранены", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить курсы"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const lastUpdate = state?.rates.reduce<string | null>((acc, r) => (r.updatedAt && (!acc || r.updatedAt > acc) ? r.updatedAt : acc), null);

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
        Валюты и курсы
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        Гость может платить в другой валюте: ресепшен выберет её в оплате, сумма в {currencySign(baseCurrency)} посчитается по курсу ниже, а касса
        покажет доллары и евро отдельно. Курс — сколько {currencySign(baseCurrency)} за 1 единицу валюты.
      </Typography>
      {demo && (
        <Alert severity="info" variant="outlined" sx={{ mb: 1.5 }}>
          Демо-режим: курсы хранятся на этом устройстве, оплата в валюте записывается в сомах по курсу с пометкой. С обновлением сервера курсы
          будут общими для всех сотрудников.
        </Alert>
      )}
      <Stack gap={1}>
        {Object.entries(draft).map(([code, v]) => (
          <Stack key={code} direction="row" alignItems="center" gap={1.5}>
            <Checkbox
              checked={v.on}
              disabled={unavailable || !canManage}
              onChange={(e) => setDraft((d) => ({ ...d, [code]: { ...d[code], on: e.target.checked } }))}
              sx={{ p: 0.5 }}
            />
            <Box sx={{ width: 190 }}>
              <Typography variant="body2" fontWeight={600}>
                {code} · {currencySign(code)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {CURRENCY_NAMES[code] ?? code}
              </Typography>
            </Box>
            <TextField
              size="small"
              placeholder="Курс"
              value={v.rate}
              disabled={unavailable || !canManage || !v.on}
              onChange={(e) => setDraft((d) => ({ ...d, [code]: { ...d[code], rate: e.target.value.replace(/[^\d.,]/g, "").slice(0, 12) } }))}
              sx={{ width: 160 }}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{currencySign(baseCurrency)}</InputAdornment> }, htmlInput: { inputMode: "decimal" } }}
            />
          </Stack>
        ))}
      </Stack>
      {!unavailable && (
        <Stack direction="row" alignItems="center" gap={2} sx={{ mt: 1.5 }}>
          <Button variant="contained" disabled={!canManage || saving || invalid} onClick={() => void save()}>
            {saving ? "Сохранение…" : "Сохранить курсы"}
          </Button>
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary">
              Обновлено {dayjs(lastUpdate).format("D MMMM, HH:mm")}
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );
};

export default ExchangeRatesSettingsCard;
