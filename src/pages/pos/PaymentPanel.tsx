import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import CheckOutlined from "@mui/icons-material/CheckOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";

import { POS_LAYOUT, POS_RADIUS, posColors } from "./layout";
import type { PosDiscount } from "./types";
import { PosAmount } from "./ui";

/** Что из скидок и списаний применено к чеку. */
export type PosPaymentState = {
  clientDiscountApplied: boolean;
  extraDiscountId: string | null;
  bonusesApplied: boolean;
  cashbackApplied: boolean;
  promoCode: string | null;
  certificate: number | null;
};

/** Строки блока итогов — считает страница, панель только показывает. */
export type PosTotals = {
  subtotal: number;
  discount: number;
  bonuses: number;
  cashback: number;
  certificate: number;
  total: number;
};

type Props = {
  hasClient: boolean;
  clientDiscountPercent: number;
  bonusesAvailable: number;
  cashbackAvailable: number;
  discounts: PosDiscount[];
  state: PosPaymentState;
  totals: PosTotals;
  promoInput: string;
  onPromoInputChange: (value: string) => void;
  promoError: string | null;
  onApplyPromo: () => void;
  certificateInput: string;
  onCertificateInputChange: (value: string) => void;
  onApplyCertificate: () => void;
  onToggleClientDiscount: () => void;
  onSelectExtraDiscount: (id: string | null) => void;
  onToggleBonuses: () => void;
  onToggleCashback: () => void;
  onCheckout: () => void;
};

/** Кнопка «Применить» — обводка акцентом; применённое состояние заливается акцентом. */
const ApplyButton: React.FC<{ applied?: boolean; appliedLabel?: string; onClick: () => void; width?: number }> = ({
  applied,
  appliedLabel,
  onClick,
  width,
}) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        width,
        px: "14px",
        py: "4px",
        gap: "6px",
        borderRadius: `${POS_RADIUS.pill}px`,
        border: `1px solid ${c.accent}`,
        bgcolor: applied ? c.accent : "transparent",
        color: applied ? c.onAccent : c.accentText,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      {applied ? <CheckOutlined sx={{ fontSize: 12 }} /> : null}
      {applied ? appliedLabel : "Применить"}
    </ButtonBase>
  );
};

/** Карточка списания: «Бонусы», «Кешбэк». Применённая подсвечена акцентом. */
const RedemptionCard: React.FC<{
  title: string;
  hint: string;
  applied: boolean;
  appliedLabel: string;
  onToggle: () => void;
}> = ({ title, hint, applied, appliedLabel, onToggle }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Box
      sx={{
        p: "12px",
        borderRadius: `${POS_RADIUS.card}px`,
        bgcolor: applied ? c.accentBg : c.card,
        border: `1px solid ${applied ? c.accent : c.hairline}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
      }}
    >
      <Stack gap="2px" sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: c.text }}>{title}</Typography>
        <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textDim }}>{hint}</Typography>
      </Stack>
      <ApplyButton applied={applied} appliedLabel={appliedLabel} onClick={onToggle} />
    </Box>
  );
};

/** Применённый код — чип вместо поля ввода. */
const AppliedChip: React.FC<{ label: string; onClear: () => void }> = ({ label, onClear }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <ButtonBase
      onClick={onClear}
      sx={{
        alignSelf: "flex-start",
        px: "12px",
        py: "6px",
        borderRadius: `${POS_RADIUS.pill}px`,
        bgcolor: c.accentBg,
        border: `1px solid ${c.accent}`,
        color: c.accentText,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.2,
      }}
    >
      {label}
    </ButtonBase>
  );
};

/** Строка блока итогов. */
const SummaryLine: React.FC<{ label: string; value: React.ReactNode; tone?: "muted" | "positive" }> = ({ label, value, tone }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between">
      <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textDim }}>{label}</Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: tone === "positive" ? c.positive : c.textSoft }}>
        {value}
      </Typography>
    </Stack>
  );
};

/** Правая панель: скидки, бонусы, промокод, сертификат и итоги чека. */
export const PosPaymentPanel: React.FC<Props> = ({
  hasClient,
  clientDiscountPercent,
  bonusesAvailable,
  cashbackAvailable,
  discounts,
  state,
  totals,
  promoInput,
  onPromoInputChange,
  promoError,
  onApplyPromo,
  certificateInput,
  onCertificateInputChange,
  onApplyCertificate,
  onToggleClientDiscount,
  onSelectExtraDiscount,
  onToggleBonuses,
  onToggleCashback,
  onCheckout,
}) => {
  const theme = useTheme();
  const c = posColors(theme);
  const [discountListOpen, setDiscountListOpen] = React.useState(false);

  const extraDiscount = discounts.find((item) => item.id === state.extraDiscountId) ?? null;

  const fieldSx = {
    flex: 1,
    minWidth: 0,
    height: 32,
    px: "14px",
    display: "flex",
    alignItems: "center",
    bgcolor: c.page,
    border: `1px solid ${c.hairline}`,
    borderRadius: `${POS_RADIUS.pill}px`,
    fontSize: 12,
    color: c.text,
    "& input::placeholder": { color: c.textDim, opacity: 1 },
  } as const;

  const applyPillSx = {
    height: 32,
    px: "14px",
    flexShrink: 0,
    borderRadius: `${POS_RADIUS.pill}px`,
    bgcolor: c.tile,
    border: `1px solid ${c.hairline}`,
    color: c.text,
    fontSize: 12,
    fontWeight: 700,
  } as const;

  return (
    <Box
      sx={{
        width: POS_LAYOUT.paymentPanelWidth,
        flexShrink: 0,
        px: "10px",
        py: "16px",
        bgcolor: c.page,
        borderLeft: `1px solid ${c.outline}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "16px",
        overflowY: "auto",
      }}
    >
      <Stack gap="12px">
        <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, textTransform: "uppercase", color: c.textDim }}>
          Оплата
        </Typography>

        {!hasClient ? (
          <Box sx={{ p: "13px", borderRadius: `${POS_RADIUS.card}px`, bgcolor: c.card, border: `1px solid ${c.hairline}` }}>
            <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textDim }}>
              Скидки, бонусы и промокоды станут доступны после выбора клиента
            </Typography>
          </Box>
        ) : (
          <>
            <Stack gap="8px">
              <Box
                sx={{
                  p: "12px",
                  borderRadius: `${POS_RADIUS.card}px`,
                  bgcolor: c.card,
                  border: `1px solid ${c.hairline}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap="8px">
                  <Stack gap="2px" sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: c.text }}>Скидка клиента</Typography>
                    <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textDim }}>{clientDiscountPercent}% от суммы</Typography>
                  </Stack>
                  <ApplyButton
                    applied={state.clientDiscountApplied}
                    appliedLabel={`${clientDiscountPercent}%`}
                    onClick={onToggleClientDiscount}
                    width={97}
                  />
                </Stack>

                <Box sx={{ height: "1px", bgcolor: c.hairline }} />

                <Stack gap="5px">
                  <ButtonBase
                    onClick={() => setDiscountListOpen((open) => !open)}
                    sx={{
                      pl: "12px",
                      pr: "12px",
                      py: "6px",
                      justifyContent: "space-between",
                      borderRadius: `${POS_RADIUS.card}px`,
                      bgcolor: extraDiscount ? c.accentBg : c.page,
                      border: `1px solid ${extraDiscount ? c.accent : c.hairline}`,
                      color: extraDiscount ? c.text : c.textDim,
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1.2,
                    }}
                  >
                    {extraDiscount ? `${extraDiscount.label}  ·  ${extraDiscount.percent}%` : "Другая скидка"}
                    <ExpandMoreOutlined
                      sx={{ fontSize: 16, transition: "transform .15s", transform: discountListOpen ? "rotate(180deg)" : "none" }}
                    />
                  </ButtonBase>

                  <Collapse in={discountListOpen} unmountOnExit>
                    <Stack
                      gap="2px"
                      sx={{ p: "4px", borderRadius: `${POS_RADIUS.card}px`, bgcolor: c.page, border: `1px solid ${c.hairline}` }}
                    >
                      {discounts.map((discount) => {
                        const selected = discount.id === state.extraDiscountId;
                        return (
                          <ButtonBase
                            key={discount.id}
                            onClick={() => {
                              onSelectExtraDiscount(selected ? null : discount.id);
                              setDiscountListOpen(false);
                            }}
                            sx={{
                              px: "8px",
                              py: "6px",
                              gap: "10px",
                              justifyContent: "flex-start",
                              borderRadius: `${POS_RADIUS.tile}px`,
                              bgcolor: selected ? c.accentBg : "transparent",
                              "&:hover": { bgcolor: selected ? c.accentBg : c.tile },
                            }}
                          >
                            <Box
                              sx={{
                                width: 38,
                                py: "4px",
                                borderRadius: `${POS_RADIUS.chip}px`,
                                bgcolor: selected ? c.accent : c.card,
                                color: selected ? c.onAccent : c.textSoft,
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: 1.1,
                                textAlign: "center",
                              }}
                            >
                              {discount.percent}%
                            </Box>
                            <Typography sx={{ fontSize: 12, fontWeight: 500, lineHeight: 1.2, color: c.textSoft }}>
                              {discount.label}
                            </Typography>
                          </ButtonBase>
                        );
                      })}
                    </Stack>
                  </Collapse>
                </Stack>
              </Box>

              <RedemptionCard
                title="Бонусы"
                hint={`доступно ${bonusesAvailable} сом`}
                applied={state.bonusesApplied}
                appliedLabel={`-${bonusesAvailable} сом`}
                onToggle={onToggleBonuses}
              />
              <RedemptionCard
                title="Кешбэк"
                hint={`доступно ${cashbackAvailable} сом`}
                applied={state.cashbackApplied}
                appliedLabel={`-${cashbackAvailable} сом`}
                onToggle={onToggleCashback}
              />
            </Stack>

            <Stack gap="6px">
              <Typography sx={{ fontSize: 12, lineHeight: 1.2, textTransform: "uppercase", color: c.textDim }}>Промокод</Typography>
              {state.promoCode ? (
                <AppliedChip label={state.promoCode} onClear={onApplyPromo} />
              ) : (
                <Stack gap="5px">
                  <Stack direction="row" gap="5px">
                    <InputBase
                      value={promoInput}
                      onChange={(event) => onPromoInputChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onApplyPromo();
                      }}
                      placeholder="Введите промокод"
                      sx={fieldSx}
                    />
                    <ButtonBase onClick={onApplyPromo} sx={applyPillSx}>
                      Применить
                    </ButtonBase>
                  </Stack>
                  {promoError ? (
                    <Box
                      sx={{
                        alignSelf: "flex-start",
                        px: "8px",
                        py: "4px",
                        borderRadius: `${POS_RADIUS.pill}px`,
                        bgcolor: c.dangerBg,
                        color: c.danger,
                        fontSize: 12,
                        fontWeight: 600,
                        lineHeight: 1.2,
                      }}
                    >
                      {promoError}
                    </Box>
                  ) : null}
                </Stack>
              )}
            </Stack>

            <Stack gap="6px">
              <Typography sx={{ fontSize: 12, lineHeight: 1.2, textTransform: "uppercase", color: c.textDim }}>Сертификат</Typography>
              {state.certificate ? (
                <AppliedChip label={`${state.certificate} сом`} onClear={onApplyCertificate} />
              ) : (
                <Stack direction="row" gap="5px">
                  <InputBase
                    value={certificateInput}
                    onChange={(event) => onCertificateInputChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onApplyCertificate();
                    }}
                    placeholder="Введите сертификат"
                    sx={fieldSx}
                  />
                  <ButtonBase onClick={onApplyCertificate} sx={applyPillSx}>
                    Применить
                  </ButtonBase>
                </Stack>
              )}
            </Stack>
          </>
        )}
      </Stack>

      <Stack gap="10px" sx={{ p: "12px", borderRadius: `${POS_RADIUS.card}px`, bgcolor: c.card, flexShrink: 0 }}>
        <Stack gap="4px" sx={{ pb: "10px", borderBottom: `1px solid ${c.hairline}` }}>
          <SummaryLine label="Подытог" value={<PosAmount value={totals.subtotal} />} />
          {totals.discount > 0 ? <SummaryLine label="Скидка" value={<PosAmount value={totals.discount} negative />} /> : null}
          {totals.bonuses > 0 ? <SummaryLine label="Бонусы" value={<PosAmount value={totals.bonuses} negative />} tone="positive" /> : null}
          {totals.cashback > 0 ? <SummaryLine label="Кешбэк" value={<PosAmount value={totals.cashback} negative />} tone="positive" /> : null}
          {totals.certificate > 0 ? (
            <SummaryLine label="Сертификат" value={<PosAmount value={totals.certificate} negative />} tone="positive" />
          ) : null}
        </Stack>

        <Stack gap="16px">
          <Stack direction="row" alignItems="flex-end" justifyContent="space-between">
            <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5, color: c.text }}>ИТОГО</Typography>
            <Typography sx={{ fontSize: 32, fontWeight: 900, lineHeight: 1.2, color: c.text, whiteSpace: "nowrap" }}>
              <PosAmount value={totals.total} />
            </Typography>
          </Stack>

          <ButtonBase
            onClick={onCheckout}
            sx={{
              px: "20px",
              py: "16px",
              gap: "10px",
              borderRadius: `${POS_RADIUS.control}px`,
              bgcolor: c.accent,
              color: c.onAccent,
              fontSize: 16,
              fontWeight: 700,
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            Принять оплату
            <Box
              sx={{
                px: "6px",
                py: "4px",
                borderRadius: `${POS_RADIUS.chip}px`,
                border: "1px solid currentColor",
                opacity: 0.6,
                fontSize: 12,
                fontWeight: 400,
                lineHeight: 0.9,
              }}
            >
              F5
            </Box>
          </ButtonBase>
        </Stack>
      </Stack>
    </Box>
  );
};
