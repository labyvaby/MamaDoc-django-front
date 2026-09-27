import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
} from "@mui/material";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";

import type { PriceQuote } from "../../../../api/registry";
import { CashlessMethodSelect, DiscountInput } from "../../../../components/ui";
import type { ActiveScope } from "../../../../hooks/useActiveScope";
import { useCashlessMethods } from "../../../../hooks/useCashlessMethods";
import { useT } from "../../../../i18n/VerticalProvider";
import { formatMoney } from "../../registryTabs";
import { paymentPreview, toAmount, type PaymentState, type StepErrors } from "../intakeState";

// Без стрелок у числовых полей — как в окне оплаты приёма.
const noSpinnersSx = {
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input[type=number]::-webkit-outer-spin-button": { WebkitAppearance: "none", margin: 0 },
  "& input[type=number]::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 },
};

const STATUS_COLOR = { paid: "success", partial: "warning", unpaid: "default" } as const;

export interface ContractControl {
  /** Название бланка договора; пусто — «Договор». */
  name: string;
  signed: boolean;
  printing: boolean;
  onPrint: () => void;
  onSigned: (signed: boolean) => void;
}

interface PaymentStepProps {
  scope: ActiveScope;
  branchId: number | null;
  /** Расчёт цены пакета с семейной скидкой; пока его нет — цена неизвестна. */
  quote?: PriceQuote;
  value: PaymentState;
  errors: StepErrors;
  onChange: (next: PaymentState) => void;
  /** Бланк договора программы; `null` — договор не настроен. */
  contract: ContractControl | null;
}

interface MoneyBoxProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onValue: (value: string) => void;
  onFull: () => void;
}

/** Поле суммы как в оплате приёма: подпись, «100%» и поле со значком. */
const MoneyBox: React.FC<MoneyBoxProps> = ({ label, icon, value, onValue, onFull }) => (
  <Stack flex={1} spacing={0.5} minWidth={0}>
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Button
        size="small"
        variant="text"
        onClick={onFull}
        sx={{ minWidth: "auto", px: 1, fontSize: "0.7rem", textTransform: "none" }}
      >
        100%
      </Button>
    </Stack>
    <Stack
      direction="row"
      alignItems="center"
      sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, bgcolor: "background.paper" }}
    >
      <Box px={1} display="flex">
        {icon}
      </Box>
      <TextField
        variant="standard"
        size="small"
        fullWidth
        type="number"
        value={value}
        onChange={(event) => onValue(event.target.value)}
        InputProps={{ disableUnderline: true }}
        inputProps={{ min: 0, inputMode: "decimal", "aria-label": label }}
        sx={{ py: 0.5, ...noSpinnersSx }}
        placeholder="0"
      />
    </Stack>
  </Stack>
);

/**
 * Оплата при постановке — как приём оплаты в «Приёмах»: стоимость и скидка
 * «% / с», договор (печать и подпись — до денег), наличные и безнал с «100%»,
 * итог, статус и долг. Пустые суммы — ребёнок встаёт на учёт с долгом.
 */
export const PaymentStep: React.FC<PaymentStepProps> = ({
  scope,
  branchId,
  quote,
  value,
  errors,
  onChange,
  contract,
}) => {
  const { t } = useT("registry");
  const price = quote ? Number(quote.priceAmount) : null;
  const preview = paymentPreview(value, price ?? 0);
  const cardPart = toAmount(value.card);
  const cashless = useCashlessMethods(cardPart > 0, {
    organizationId: scope.organizationId,
    branchId: branchId ?? undefined,
  });

  React.useEffect(() => {
    if (cardPart > 0 && value.cashlessMethodId == null && cashless.defaultMethodId !== "") {
      onChange({ ...value, cashlessMethodId: cashless.defaultMethodId });
    }
  }, [cardPart, cashless.defaultMethodId, value, onChange]);

  // Сумма не выходит за «к оплате» за вычетом второго способа — как в приёме.
  const setAmount = (field: "cash" | "card", raw: string) => {
    if (raw === "") {
      onChange({ ...value, [field]: "" });
      return;
    }
    const other = toAmount(field === "cash" ? value.card : value.cash);
    const next = Math.min(Math.max(0, Number(raw) || 0), Math.max(0, preview.payable - other));
    onChange({ ...value, [field]: String(next) });
  };
  const payAll = (field: "cash" | "card") =>
    onChange({
      ...value,
      cash: field === "cash" ? String(preview.payable) : "",
      card: field === "card" ? String(preview.payable) : "",
    });

  const money = (amount: number) => t("wizard.payment.amount", { amount: formatMoney(amount.toFixed(2)) });

  return (
    <Stack gap={1.5}>
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          bgcolor: (theme) => alpha(theme.palette.success.main, 0.04),
          border: "1px solid",
          borderColor: (theme) => alpha(theme.palette.success.main, 0.2),
          borderRadius: "14px",
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            <Box sx={{ flexShrink: 0 }}>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                {t("wizard.payment.cost")}
              </Typography>
              <Typography variant="h6" fontWeight={600} noWrap>
                {price == null ? "—" : money(price)}
              </Typography>
              {quote && quote.familyDiscountPercent > 0 && (
                <Typography variant="caption" color="text.secondary" display="block">
                  {t("wizard.payment.familyNote", {
                    percent: quote.familyDiscountPercent,
                    base: formatMoney(quote.basePriceAmount),
                  })}
                </Typography>
              )}
            </Box>
            <Box sx={{ flex: "1 1 180px", minWidth: 180 }}>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                {t("wizard.payment.discount")}
              </Typography>
              <DiscountInput
                total={price ?? 0}
                amount={value.discount}
                onAmountChange={(amount) => onChange({ ...value, discount: amount })}
                error={Boolean(errors.discount)}
                helperText={errors.discount ? t(errors.discount, { max: formatMoney(String(price ?? 0)) }) : ""}
                disabled={price == null}
              />
            </Box>
          </Stack>

          {contract && (
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: 1.5,
                bgcolor: (theme) => alpha(theme.palette.info.main, 0.08),
                border: "1px solid",
                borderColor: (theme) =>
                  errors.contract ? theme.palette.error.main : alpha(theme.palette.info.main, 0.25),
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
                <Stack direction="row" alignItems="center" gap={1} minWidth={0}>
                  <DescriptionOutlined fontSize="small" color="info" />
                  <Typography variant="body2" fontWeight={600}>
                    {contract.name}
                  </Typography>
                </Stack>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PrintOutlined />}
                  onClick={contract.onPrint}
                  disabled={contract.printing || price == null}
                  sx={{ textTransform: "none" }}
                >
                  {t("wizard.payment.printContract")}
                </Button>
              </Stack>
              <FormControlLabel
                sx={{ m: 0, mt: 0.5 }}
                control={
                  <Checkbox
                    size="small"
                    checked={contract.signed}
                    onChange={(event) => contract.onSigned(event.target.checked)}
                  />
                }
                label={<Typography variant="body2">{t("wizard.payment.contractSigned")}</Typography>}
              />
              <Typography variant="caption" color={errors.contract ? "error" : "text.secondary"} display="block">
                {t(errors.contract ?? "wizard.payment.contractHint")}
              </Typography>
            </Box>
          )}

          <Stack direction="row" spacing={2}>
            <MoneyBox
              label={t("wizard.payment.cash")}
              icon={<AccountBalanceWalletOutlined color="action" fontSize="small" />}
              value={value.cash}
              onValue={(raw) => setAmount("cash", raw)}
              onFull={() => payAll("cash")}
            />
            <MoneyBox
              label={t("wizard.payment.cashless")}
              icon={<CreditCardOutlined color="action" fontSize="small" />}
              value={value.card}
              onValue={(raw) => setAmount("card", raw)}
              onFull={() => payAll("card")}
            />
          </Stack>
          {cardPart > 0 && cashless.methods.length > 0 && (
            <CashlessMethodSelect
              methods={cashless.methods}
              value={value.cashlessMethodId ?? ""}
              onChange={(id) => onChange({ ...value, cashlessMethodId: id === "" ? null : id })}
              loading={cashless.isLoading}
              loadFailed={cashless.isError}
              label={t("wizard.payment.cashlessMethod")}
            />
          )}

          <Divider sx={{ my: 1 }} />

          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              {t("wizard.payment.totalDue")}
            </Typography>
            <Typography variant="h5" fontWeight={700} color="success.main">
              {price == null ? "—" : money(preview.payable)}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              {t("wizard.payment.status")}
            </Typography>
            <Chip
              size="small"
              label={t(`payment.${preview.state}`)}
              color={STATUS_COLOR[preview.state]}
              sx={{ fontWeight: 600 }}
            />
          </Stack>
          {price != null && preview.debt > 0 && (
            <Paper
              elevation={0}
              sx={{
                p: 1.5,
                bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
                border: "1px solid",
                borderColor: (theme) => alpha(theme.palette.error.main, 0.3),
                borderRadius: 1,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="error.main" fontWeight={600}>
                  {t("wizard.payment.debt")}
                </Typography>
                <Typography variant="h6" color="error.main" fontWeight={700}>
                  {money(preview.debt)}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {t("wizard.payment.laterHint")}
              </Typography>
            </Paper>
          )}
          {errors.payment && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {t(errors.payment)}
            </Alert>
          )}
        </Stack>
      </Paper>
      <Typography variant="caption" color="text.secondary">
        {t("wizard.payment.noZReport")}
      </Typography>
    </Stack>
  );
};
