import React from "react";
import { Box, InputAdornment, Stack, TextField, Typography } from "@mui/material";

import { CashlessMethodSelect, DiscountInput } from "../../ui";
import type { DjangoCashlessMethod } from "../../../api/cashlessMethods";
import { formatKGS } from "../../../utility/format";
import IntakeSection from "./IntakeSection";

type Props = {
  total: number;
  /**
   * Сумма анализов ДО скидки (`basketTotals().testsGross`) — база для
   * `DiscountInput` в режиме ввода скидки в сомах. Раньше (Task 8) базой
   * служил `total`, но он уже уменьшен на скидку и при `chargeTubes` включает
   * пробирки: скидка в сомах считалась бы от неверной величины и разошлась
   * бы с бэкендом (422 «сумма не совпадает»). См. закрытие пробела в
   * `labTotals.ts`.
   */
  testsGross: number;
  paidCash: string;
  paidCard: string;
  cashlessMethodId: number | null;
  discountPercent: number;
  disabled: boolean;
  onCashChange: (value: string) => void;
  onCardChange: (value: string) => void;
  onCashlessMethodChange: (id: number | null) => void;
  onDiscountChange: (percent: number) => void;
  /**
   * План задачи (Task 8) не включал эти три поля в пропсы секции, но без
   * готового списка `CashlessMethodSelect` (тот же план требует использовать
   * именно его) нечем заполнить — а `useCashlessMethods` сам ходит в API и по
   * правилу «секции не знают про API» обязан жить в дровере (Task 10),
   * который и передаёт сюда уже готовый результат хука.
   */
  cashlessMethods: DjangoCashlessMethod[];
  cashlessMethodsLoading: boolean;
  cashlessMethodsFailed: boolean;
};

// Скрываем спиннеры у type=number — тот же приём, что в DiscountInput и
// соседних дроверах (DjangoAddExpenseDrawer, DjangoSaleFormDrawer).
const noSpinnersSx = {
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
} as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Строка оплаты в поле — деньги парсим терпимо к запятой, как в остальных формах. */
function toAmount(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Оплата: наличные, карта, способ безнала, скидка и сверка «к оплате / внесено».
 *
 * `total` — уже посчитанная бэкендозеркальной `basketTotals` итоговая сумма
 * (тесты за вычетом скидки плюс пробирки, если клиника берёт за них плату) —
 * используется только для строки «К оплате». Базой для `DiscountInput`
 * служит отдельный `testsGross` (сумма анализов до скидки, без пробирок): в
 * процентном режиме база сокращается при обратной конвертации и её выбор не
 * влияет на итоговый процент, а в режиме ввода скидки в сомах база обязана
 * быть именно `testsGross` — иначе скидка считается от суммы, уже
 * уменьшенной на неё же (и увеличенной на пробирки), и расходится с
 * бэкендом (`server/apps/lab/basket.py`).
 *
 * Разницу («К оплате / Внесено / Разница») показываем всегда, а не только
 * когда она не ноль, — регистратор должен увидеть цифры раньше, чем текст
 * причины блокировки кнопки (`intakeBlockReason`). Сама блокировка — не
 * забота секции, только показ того, из чего она складывается.
 */
const PaymentSection: React.FC<Props> = ({
  total,
  testsGross,
  paidCash,
  paidCard,
  cashlessMethodId,
  discountPercent,
  disabled,
  onCashChange,
  onCardChange,
  onCashlessMethodChange,
  onDiscountChange,
  cashlessMethods,
  cashlessMethodsLoading,
  cashlessMethodsFailed,
}) => {
  const cash = toAmount(paidCash);
  const card = toAmount(paidCard);
  const paid = round2(cash + card);
  const diff = round2(total - paid);

  return (
    <IntakeSection title="Оплата">

        <Stack direction="row" spacing={2}>
          <Stack flex={1} spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Наличные
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="number"
              value={paidCash}
              onChange={(e) => onCashChange(e.target.value)}
              disabled={disabled}
              placeholder="0"
              inputProps={{ min: 0, step: "any" }}
              InputProps={{
                endAdornment: <InputAdornment position="end">сом</InputAdornment>,
              }}
              sx={noSpinnersSx}
            />
          </Stack>
          <Stack flex={1} spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Карта
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="number"
              value={paidCard}
              onChange={(e) => onCardChange(e.target.value)}
              disabled={disabled}
              placeholder="0"
              inputProps={{ min: 0, step: "any" }}
              InputProps={{
                endAdornment: <InputAdornment position="end">сом</InputAdornment>,
              }}
              sx={noSpinnersSx}
            />
          </Stack>
        </Stack>

        {/* Способ безнала нужен только когда есть сумма картой — как в оплате
            продаж и расходов. */}
        {card > 0 && (
          <CashlessMethodSelect
            methods={cashlessMethods}
            value={cashlessMethodId ?? ""}
            onChange={(v) => onCashlessMethodChange(v === "" ? null : v)}
            loading={cashlessMethodsLoading}
            loadFailed={cashlessMethodsFailed}
            disabled={disabled}
          />
        )}

        <Box>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Скидка
          </Typography>
          <DiscountInput
            total={testsGross}
            amount={round2((testsGross * discountPercent) / 100)}
            defaultType="percent"
            disabled={disabled}
            onAmountChange={(amount) => {
              const percent = testsGross > 0 ? round2((amount / testsGross) * 100) : 0;
              onDiscountChange(Math.min(100, Math.max(0, percent)));
            }}
          />
        </Box>

        <Stack spacing={0.5} sx={{ pt: 1, borderTop: "1px dashed", borderColor: "divider" }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              К оплате
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {formatKGS(total)}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              Внесено
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {formatKGS(paid)}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              Разница
            </Typography>
            <Typography
              variant="body2"
              fontWeight={700}
              color={diff === 0 ? "success.main" : "error.main"}
            >
              {formatKGS(diff)}
            </Typography>
          </Stack>
        </Stack>
    </IntakeSection>
  );
};

export default PaymentSection;
