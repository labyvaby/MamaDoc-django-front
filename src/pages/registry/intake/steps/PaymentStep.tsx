import React from "react";
import { Alert, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

import { CashlessMethodSelect } from "../../../../components/ui";
import type { ActiveScope } from "../../../../hooks/useActiveScope";
import { useCashlessMethods } from "../../../../hooks/useCashlessMethods";
import { useT } from "../../../../i18n/VerticalProvider";
import { formatMoney } from "../../registryTabs";
import { toAmount, type PaymentState, type StepErrors } from "../intakeState";

const MONEY_RE = /^\d{0,10}(?:[.,]\d{0,2})?$/;

interface PaymentStepProps {
  scope: ActiveScope;
  branchId: number | null;
  /** Цена периода, если известна (ручная или цена услуги-взноса). */
  price: number | null;
  value: PaymentState;
  errors: StepErrors;
  onChange: (next: PaymentState) => void;
}

export const PaymentStep: React.FC<PaymentStepProps> = ({ scope, branchId, price, value, errors, onChange }) => {
  const { t } = useT("registry");
  const cardPart = toAmount(value.card);
  const cashless = useCashlessMethods(value.mode === "now" && cardPart > 0, {
    organizationId: scope.organizationId,
    branchId: branchId ?? undefined,
  });

  React.useEffect(() => {
    if (value.mode === "now" && !value.cash && !value.card && price != null && price > 0) {
      onChange({ ...value, cash: String(price) });
    }
    // Подставляем цену один раз, когда она стала известна.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price]);

  React.useEffect(() => {
    if (cardPart > 0 && value.cashlessMethodId == null && cashless.defaultMethodId !== "") {
      onChange({ ...value, cashlessMethodId: cashless.defaultMethodId });
    }
  }, [cardPart, cashless.defaultMethodId, value, onChange]);

  const money = (field: "cash" | "card", label: string) => (
    <TextField
      size="small"
      fullWidth
      label={label}
      value={value[field]}
      onChange={(e) => {
        if (MONEY_RE.test(e.target.value)) onChange({ ...value, [field]: e.target.value });
      }}
      inputProps={{ inputMode: "decimal" }}
    />
  );

  return (
    <Stack gap={2}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value.mode}
        onChange={(_, mode: PaymentState["mode"] | null) => mode && onChange({ ...value, mode })}
      >
        <ToggleButton value="now">{t("wizard.payment.now")}</ToggleButton>
        <ToggleButton value="later">{t("wizard.payment.later")}</ToggleButton>
      </ToggleButtonGroup>
      {value.mode === "later" ? (
        <Alert severity="info">{t("wizard.payment.laterHint")}</Alert>
      ) : (
        <>
          {price != null && (
            <Typography variant="body2">{t("wizard.payment.total", { amount: formatMoney(price) })}</Typography>
          )}
          <Stack direction="row" gap={1}>
            {money("cash", t("wizard.payment.cash"))}
            {money("card", t("wizard.payment.card"))}
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
          {errors.payment && <Alert severity="warning">{t(errors.payment)}</Alert>}
          <Typography variant="caption" color="text.secondary">
            {t("wizard.payment.noZReport")}
          </Typography>
        </>
      )}
    </Stack>
  );
};
