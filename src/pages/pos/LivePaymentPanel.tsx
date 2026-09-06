import {
  Box,
  Button,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { PosQuote } from "../../api/pos";
import { posColors } from "./layout";
import { PosAmount } from "./ui";

export type Benefits = {
  discount: string;
  clientDiscount: boolean;
  bonuses: boolean;
  promotions: boolean;
  promoCode: string;
  certificateCode: string;
};
export const emptyBenefits: Benefits = {
  discount: "0",
  clientDiscount: false,
  bonuses: false,
  promotions: false,
  promoCode: "",
  certificateCode: "",
};

export function LivePaymentPanel({
  actions,
  benefits,
  onChange,
  quote,
  busy,
  onCheckout,
  discountPercent,
  bonuses,
  hasClient,
  locked,
}: {
  actions: Record<string, boolean>;
  benefits: Benefits;
  onChange: (value: Benefits) => void;
  quote?: PosQuote;
  busy: boolean;
  onCheckout: () => void;
  discountPercent: number;
  bonuses: number;
  hasClient: boolean;
  locked: boolean;
}) {
  const c = posColors(useTheme());
  const patch = (value: Partial<Benefits>) =>
    onChange({ ...benefits, ...value });
  const card = {
    p: 1.5,
    borderRadius: "12px",
    bgcolor: c.card,
    border: `1px solid ${c.hairline}`,
  };
  const apply = (active: boolean, disabled: boolean, callback: () => void) => (
    <Button
      size="small"
      variant={active ? "contained" : "outlined"}
      onClick={callback}
      disabled={disabled || locked || busy}
      sx={{ borderRadius: "20px", minWidth: 95 }}
    >
      {active ? "Отменить" : "Применить"}
    </Button>
  );
  return (
    <Stack
      sx={{
        width: { xs: "100%", lg: 320 },
        flexShrink: 0,
        minHeight: 0,
        p: 1.5,
        borderLeft: `1px solid ${c.outline}`,
        bgcolor: c.page,
      }}
      gap={1.4}
    >
      <Typography fontSize={12} color="text.secondary">
        ОПЛАТА
      </Typography>
      <Stack
        gap={1.4}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: { xs: "visible", lg: "auto" },
          pb: 0.5,
        }}
      >
        {actions.client_discount && (
          <Box sx={card}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Box>
                <Typography fontWeight={700} fontSize={14}>
                  Скидка клиента
                </Typography>
                <Typography color="text.secondary" fontSize={12}>
                  {hasClient
                    ? `${discountPercent}% от суммы`
                    : "Выберите покупателя"}
                </Typography>
              </Box>
              {apply(
                benefits.clientDiscount,
                !hasClient || !discountPercent,
                () => patch({ clientDiscount: !benefits.clientDiscount })
              )}
            </Stack>
          </Box>
        )}
        {actions.discount && (
          <Box sx={card}>
            <Typography fontSize={14} fontWeight={700} mb={1}>
              Другая скидка
            </Typography>
            <TextField
              size="small"
              label="Скидка, %"
              value={benefits.discount}
              onChange={(event) => patch({ discount: event.target.value })}
              disabled={locked}
              inputProps={{ inputMode: "decimal" }}
              fullWidth
            />
          </Box>
        )}
        {actions.promotions && (
          <Box sx={card}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography fontSize={14} fontWeight={700}>
                Действующие акции
              </Typography>
              {apply(benefits.promotions, false, () =>
                patch({ promotions: !benefits.promotions })
              )}
            </Stack>
          </Box>
        )}
        {actions.bonus && (
          <Box sx={card}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Box>
                <Typography fontWeight={700} fontSize={14}>
                  Бонусы
                </Typography>
                <Typography color="text.secondary" fontSize={12}>
                  доступно {bonuses} сом
                </Typography>
              </Box>
              {apply(benefits.bonuses, !hasClient || bonuses <= 0, () =>
                patch({ bonuses: !benefits.bonuses })
              )}
            </Stack>
          </Box>
        )}
        {actions.promotions && (
          <TextField
            size="small"
            label="Промокод"
            value={benefits.promoCode}
            onChange={(event) => patch({ promoCode: event.target.value })}
            disabled={locked}
            helperText="Проверяется сервером при расчёте"
          />
        )}
        {actions.certificate && (
          <TextField
            size="small"
            label="Код сертификата"
            value={benefits.certificateCode}
            onChange={(event) => patch({ certificateCode: event.target.value })}
            disabled={locked}
            helperText="Остаток проверяется по коду"
          />
        )}
      </Stack>
      <Stack sx={{ ...card, flexShrink: 0 }} gap={1.5}>
        {(
          [
            ["Подытог", quote?.subtotal],
            ["Скидка", quote?.discount],
            ["Бонусами", quote?.bonuses],
            ["Сертификатом", quote?.certificateAmount],
          ] as const
        ).map(([label, value]) => (
          <Stack key={label} direction="row" justifyContent="space-between">
            <Typography fontSize={13} color="text.secondary">
              {label}
            </Typography>
            <Typography fontSize={13} fontWeight={700}>
              {value !== undefined ? <PosAmount value={Number(value)} /> : "—"}
            </Typography>
          </Stack>
        ))}
        <Divider />
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Typography fontWeight={700} fontSize={14}>
            ИТОГО
          </Typography>
          <Typography fontSize={30} fontWeight={900}>
            {quote ? <PosAmount value={Number(quote.due)} /> : "—"}
          </Typography>
        </Stack>
        {actions.sell && (
          <Button
            variant="contained"
            fullWidth
            onClick={onCheckout}
            disabled={busy || !quote}
            sx={{
              py: 1.7,
              bgcolor: c.accent,
              color: c.onAccent,
              borderRadius: "14px",
              fontWeight: 700,
            }}
          >
            Принять оплату{" "}
            <Box
              component="span"
              sx={{
                ml: 1,
                opacity: 0.6,
                border: "1px solid",
                borderRadius: 1,
                px: 0.4,
              }}
            >
              F5
            </Box>
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
