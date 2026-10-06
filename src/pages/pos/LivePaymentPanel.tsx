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

import type { PosQuote } from "../../api/pos";
import type { DiscountKind } from "../../api/promotions";
import { QUICK_DISCOUNT_PERCENTS, normalizeManualDiscount, normalizeManualPercent } from "./discountInput";
import { POS_LAYOUT, POS_RADIUS, posColors } from "./layout";
import { PosAmount } from "./ui";

/**
 * Правая панель оплаты «живой» кассы — макет Monogram (Figma, «Касса»,
 * правая колонка 340px). Визуально повторяет мок `PaymentPanel.tsx`, но
 * данные и правила берёт с сервера: скидки, бонусы, промокод и сертификат
 * лишь записываются в `Benefits`, а суммы считает `quote/`.
 */

export type Benefits = {
  /** Ручная скидка на чек суммой, в сомах. Вместе с процентом не бывает — одно из двух. */
  discount: string;
  /** Ручная скидка на чек процентом. */
  discountPercent: string;
  discountKindId: number | null;
  clientDiscount: boolean;
  bonuses: boolean;
  promotions: boolean;
  promoCode: string;
  certificateCode: string;
};
export const emptyBenefits: Benefits = {
  discount: "0",
  discountPercent: "0",
  discountKindId: null,
  clientDiscount: false,
  bonuses: false,
  promotions: false,
  promoCode: "",
  certificateCode: "",
};

/**
 * К какому полю панели относится ошибка расчёта чека. Сервер проверяет
 * промокод и сертификат на `quote/`, и такую ошибку уместнее показать под
 * самим полем, а не общим баннером над чеком.
 */
export const inlineQuoteErrorField = (
  message: string | null | undefined
): "promo" | "certificate" | null => {
  if (!message) return null;
  if (/промокод/i.test(message)) return "promo";
  if (/сертификат/i.test(message)) return "certificate";
  return null;
};

/** Кнопка «Применить» — обводка акцентом; применённое состояние заливается акцентом. */
const ApplyButton: React.FC<{
  applied?: boolean;
  appliedLabel?: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  width?: number;
}> = ({ applied, appliedLabel, disabled, onClick, width }) => {
  const c = posColors(useTheme());
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      sx={{
        width,
        minHeight: { xs: 44, md: 0 },
        px: "14px",
        py: "4px",
        gap: "6px",
        flexShrink: 0,
        borderRadius: `${POS_RADIUS.pill}px`,
        border: `1px solid ${c.accent}`,
        bgcolor: applied ? c.accent : "transparent",
        color: applied ? c.onAccent : c.accentText,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        "&.Mui-disabled": { opacity: 0.45 },
      }}
    >
      {applied ? <CheckOutlined sx={{ fontSize: 12 }} /> : null}
      {applied ? appliedLabel ?? "Применено" : "Применить"}
    </ButtonBase>
  );
};

/** Карточка со списанием или включаемым правилом: «Бонусы», «Акции». */
const RedemptionCard: React.FC<{
  title: string;
  hint: string;
  applied: boolean;
  appliedLabel?: React.ReactNode;
  disabled?: boolean;
  onToggle: () => void;
}> = ({ title, hint, applied, appliedLabel, disabled, onToggle }) => {
  const c = posColors(useTheme());
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
      <ApplyButton applied={applied} appliedLabel={appliedLabel} disabled={disabled} onClick={onToggle} />
    </Box>
  );
};

/** Применённый код — чип вместо поля ввода; клик снимает код. */
const AppliedChip: React.FC<{ label: string; disabled?: boolean; onClear: () => void }> = ({ label, disabled, onClear }) => {
  const c = posColors(useTheme());
  return (
    <ButtonBase
      onClick={onClear}
      disabled={disabled}
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
        "&.Mui-disabled": { opacity: 0.45 },
      }}
    >
      {label}
    </ButtonBase>
  );
};

/** Ошибка под полем — плашка в тонах ошибки, как в макете. */
const FieldError: React.FC<{ text: string }> = ({ text }) => {
  const c = posColors(useTheme());
  return (
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
      {text}
    </Box>
  );
};

/** Поле ручной скидки на чек — проценты или сомы; обводка акцентом, пока в нём есть значение. */
const DiscountField: React.FC<{
  value: string;
  unit: "%" | "сом";
  label: string;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}> = ({ value, unit, label, placeholder = "0", disabled, onChange }) => {
  const c = posColors(useTheme());
  const active = Number(value) > 0;
  return (
    <InputBase
      value={value === "0" ? "" : value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      inputProps={{ inputMode: "decimal", "aria-label": label, style: { textAlign: "right" } }}
      endAdornment={<Box component="span" sx={{ pl: "4px", color: c.textDim }}>{unit}</Box>}
      sx={{
        flex: 1,
        minWidth: 0,
        // Тема задаёт InputBase minHeight 40, поэтому одной height мало.
        height: { xs: 44, md: 32 },
        minHeight: { xs: 44, md: 32 },
        px: "12px",
        bgcolor: c.page,
        border: `1px solid ${active ? c.accent : c.hairline}`,
        borderRadius: `${POS_RADIUS.pill}px`,
        fontSize: 12,
        fontWeight: 600,
        color: c.text,
        "& input::placeholder": { color: c.textDim, opacity: 1 },
        "&.Mui-disabled": { opacity: 0.45 },
      }}
    />
  );
};

/** Поле-«таблетка» с кнопкой «Применить»: промокод. */
const CodeField: React.FC<{
  label: string;
  placeholder: string;
  applied: string;
  disabled?: boolean;
  error: string | null;
  onApply: (value: string) => void;
}> = ({ label, placeholder, applied, disabled, error, onApply }) => {
  const c = posColors(useTheme());
  const [input, setInput] = React.useState(applied);
  React.useEffect(() => {
    setInput(applied);
  }, [applied]);
  const submit = () => onApply(input.trim());
  return (
    <Stack gap="6px">
      <Typography sx={{ fontSize: 12, lineHeight: 1.2, textTransform: "uppercase", color: c.textDim }}>{label}</Typography>
      {applied && !error ? (
        <AppliedChip label={applied} disabled={disabled} onClear={() => onApply("")} />
      ) : (
        <Stack gap="5px">
          <Stack direction="row" gap="5px">
            <InputBase
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder={placeholder}
              disabled={disabled}
              inputProps={{ "aria-label": label, autoComplete: "off" }}
              sx={{
                flex: 1,
                minWidth: 0,
                height: { xs: 44, md: 40 },
                minHeight: { xs: 44, md: 40 },
                boxSizing: "border-box",
                px: "14px",
                display: "flex",
                alignItems: "center",
                bgcolor: c.page,
                border: `1px solid ${error ? c.danger : c.hairline}`,
                borderRadius: `${POS_RADIUS.pill}px`,
                fontSize: 12,
                color: c.text,
                "& input": { height: "100%", boxSizing: "border-box", py: 0 },
                "& input::placeholder": { color: c.textDim, opacity: 1 },
              }}
            />
            <ButtonBase
              onClick={submit}
              disabled={disabled}
              sx={{
                height: { xs: 44, md: 40 },
                boxSizing: "border-box",
                px: "14px",
                flexShrink: 0,
                borderRadius: `${POS_RADIUS.pill}px`,
                bgcolor: c.tile,
                border: `1px solid ${c.hairline}`,
                color: c.text,
                fontSize: 12,
                fontWeight: 700,
                "&.Mui-disabled": { opacity: 0.45 },
              }}
            >
              Применить
            </ButtonBase>
          </Stack>
          {error ? <FieldError text={error} /> : null}
        </Stack>
      )}
    </Stack>
  );
};

/** Строка блока итогов. */
const SummaryLine: React.FC<{ label: string; value: React.ReactNode; tone?: "discount" | "bonus" | "cashback" | "certificate" }> = ({ label, value, tone }) => {
  const c = posColors(useTheme());
  const toneColor = tone === "discount" ? c.discount : tone === "bonus" ? c.bonus : tone === "cashback" ? c.cashback : tone === "certificate" ? c.certificate : c.textSoft;
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between">
      <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textDim }}>{label}</Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: toneColor }}>
        {value}
      </Typography>
    </Stack>
  );
};

const amount = (value: string | undefined) => (value === undefined ? 0 : Number(value));

export function LivePaymentPanel({
  actions,
  canPromoCode,
  benefits,
  onChange,
  quote,
  quoteError = null,
  busy,
  onCheckout,
  discountPercent,
  bonuses,
  hasClient,
  locked,
  discountKinds,
  discountMode,
  maxPercent = 100,
  lineDiscounts = [],
  lineDiscountIgnored = false,
  certificatesTotal = 0,
  hidePayButton = false,
  payDisabledReason = null,
}: {
  actions: Record<string, boolean>;
  /**
   * Поле промокода: право «Акции» и правило организации `promo_codes`.
   * Не передано — решает только `actions.promotions`, как раньше.
   */
  canPromoCode?: boolean;
  benefits: Benefits;
  onChange: (value: Benefits) => void;
  quote?: PosQuote;
  /** Ошибка `quote/` — промокод и сертификат показываем под своим полем. */
  quoteError?: string | null;
  busy: boolean;
  onCheckout: () => void;
  discountPercent: number;
  bonuses: number;
  hasClient: boolean;
  locked: boolean;
  discountKinds: DiscountKind[];
  discountMode: "manual" | "kinds" | "both";
  /** Лимит ручной скидки процентом — `max_discount_percent` организации; сервер проверяет его же. */
  maxPercent?: number;
  /** Скидки, заданные кассиром на отдельные позиции чека. */
  lineDiscounts?: Array<{ id: string; name: string; label: string; amount: number }>;
  /** Сервер вернул итог без скидок на позиции (старый бэкенд) — предупреждаем. */
  lineDiscountIgnored?: boolean;
  /** Сумма продаваемых в этом чеке сертификатов (входит в «ИТОГО»). */
  certificatesTotal?: number;
  /** Телефон: кнопку оплаты держит липкая панель внизу страницы. */
  hidePayButton?: boolean;
  /** Почему оплатить нельзя (например, бэкенд не поддерживает сертификаты в чеке). */
  payDisabledReason?: string | null;
}) {
  const c = posColors(useTheme());
  const [kindsOpen, setKindsOpen] = React.useState(false);
  const patch = (value: Partial<Benefits>) => onChange({ ...benefits, ...value });
  const frozen = locked || busy;

  const errorField = inlineQuoteErrorField(quoteError);
  const promoError = errorField === "promo" ? quoteError : null;
  const certificateError = errorField === "certificate" ? quoteError : null;

  const selectedKind = discountKinds.find((kind) => kind.id === benefits.discountKindId) ?? null;
  const manualPercent = Number(benefits.discountPercent) || 0;
  const manualActive = manualPercent > 0 || Number(benefits.discount) > 0;
  // Ручная скидка — процентом или суммой, не обеими сразу; вид из справочника с ними тоже не сочетается.
  // Соседнее поле сбрасываем, только когда в этом появилось значение: лишний символ в пустом поле
  // не должен убирать уже введённую скидку.
  const setManualPercent = (value: string) =>
    patch({ discountPercent: value, discountKindId: null, ...(Number(value) > 0 ? { discount: "0" } : {}) });
  const setManualSum = (value: string) =>
    patch({ discount: value, discountKindId: null, ...(Number(value) > 0 ? { discountPercent: "0" } : {}) });
  const showKinds = discountMode !== "manual" && discountKinds.length > 0;
  const showManual = discountMode !== "kinds";
  const showDiscountCard = actions.client_discount || (actions.discount && (showKinds || showManual));

  const cardSx = {
    p: "12px",
    borderRadius: `${POS_RADIUS.card}px`,
    bgcolor: c.card,
    border: `1px solid ${c.hairline}`,
  } as const;

  const lineDiscountTotal = lineDiscountIgnored
    ? 0
    : Math.min(
        lineDiscounts.reduce((total, line) => total + line.amount, 0),
        amount(quote?.discount)
      );
  const summary = [
    {
      label: lineDiscountTotal > 0 ? "Скидка на чек" : "Скидка",
      value: Math.round((amount(quote?.discount) - lineDiscountTotal) * 100) / 100,
      tone: "discount" as const,
    },
    { label: "Бонусы", value: amount(quote?.bonuses), tone: "bonus" as const },
    { label: "Сертификат", value: amount(quote?.certificateAmount), tone: "certificate" as const },
  ].filter((line) => line.value > 0);

  return (
    <Box
      sx={{
        // Планшет — две колонки с панелью поуже, десктоп — макет 340.
        width: { xs: "100%", md: 300, lg: POS_LAYOUT.paymentPanelWidth },
        flexShrink: 0,
        minHeight: 0,
        px: { xs: "12px", md: "10px" },
        py: "16px",
        bgcolor: c.page,
        borderLeft: { xs: "none", md: `1px solid ${c.outline}` },
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "16px",
        overflowY: { xs: "visible", md: "auto" },
      }}
    >
      <Stack gap="12px">
        <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, textTransform: "uppercase", color: c.textDim }}>
          Оплата
        </Typography>

        <Stack gap="8px">
          {showDiscountCard && (
            <Box sx={{ ...cardSx, display: "flex", flexDirection: "column", gap: "10px" }}>
              {actions.client_discount && (
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap="8px">
                  <Stack gap="2px" sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: c.text }}>Скидка клиента</Typography>
                    <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textDim }}>
                      {hasClient ? `${discountPercent}% от суммы` : "Выберите покупателя"}
                    </Typography>
                  </Stack>
                  <ApplyButton
                    applied={benefits.clientDiscount}
                    appliedLabel={`${discountPercent}%`}
                    disabled={frozen || !hasClient || !discountPercent}
                    onClick={() =>
                      // Сервер не складывает скидку клиента с видом из справочника — переключаем.
                      patch({ clientDiscount: !benefits.clientDiscount, discountKindId: null })
                    }
                    width={97}
                  />
                </Stack>
              )}

              {actions.client_discount && actions.discount && (showKinds || showManual) && (
                <Box sx={{ height: "1px", bgcolor: c.hairline }} />
              )}

              {actions.discount && showKinds && (
                <Stack gap="5px">
                  <ButtonBase
                    onClick={() => setKindsOpen((open) => !open)}
                    disabled={frozen || manualActive}
                    sx={{
                      px: "12px",
                      py: "6px",
                      minHeight: { xs: 44, md: 0 },
                      justifyContent: "space-between",
                      borderRadius: `${POS_RADIUS.card}px`,
                      bgcolor: selectedKind ? c.accentBg : c.page,
                      border: `1px solid ${selectedKind ? c.accent : c.hairline}`,
                      color: selectedKind ? c.text : c.textDim,
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      "&.Mui-disabled": { opacity: 0.45 },
                    }}
                  >
                    {selectedKind ? `${selectedKind.name}  ·  ${Number(selectedKind.percent)}%` : "Другая скидка"}
                    <ExpandMoreOutlined
                      sx={{ fontSize: 16, transition: "transform .15s", transform: kindsOpen ? "rotate(180deg)" : "none" }}
                    />
                  </ButtonBase>

                  <Collapse in={kindsOpen} unmountOnExit>
                    <Stack gap="2px" sx={{ p: "4px", borderRadius: `${POS_RADIUS.card}px`, bgcolor: c.page, border: `1px solid ${c.hairline}` }}>
                      {discountKinds.map((kind) => {
                        const selected = kind.id === benefits.discountKindId;
                        return (
                          <ButtonBase
                            key={kind.id}
                            onClick={() => {
                              patch({ discount: "0", discountPercent: "0", clientDiscount: false, discountKindId: selected ? null : kind.id });
                              setKindsOpen(false);
                            }}
                            sx={{
                              px: "8px",
                              py: "6px",
                              minHeight: { xs: 44, md: 0 },
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
                                flexShrink: 0,
                                borderRadius: `${POS_RADIUS.chip}px`,
                                bgcolor: selected ? c.accent : c.card,
                                color: selected ? c.onAccent : c.textSoft,
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: 1.1,
                                textAlign: "center",
                              }}
                            >
                              {Number(kind.percent)}%
                            </Box>
                            <Typography sx={{ fontSize: 12, fontWeight: 500, lineHeight: 1.2, color: c.textSoft }}>{kind.name}</Typography>
                          </ButtonBase>
                        );
                      })}
                    </Stack>
                  </Collapse>
                </Stack>
              )}

              {actions.discount && showManual && (
                <Stack gap="6px">
                  {/* Quote refetches after every edit. Keep the inputs and chips enabled
                      during that request (`locked`, not `frozen`), or only the first digit is accepted. */}
                  <Stack direction="row" alignItems="center" gap="8px">
                    <Typography sx={{ flexShrink: 0, fontSize: 12, lineHeight: 1.2, whiteSpace: "nowrap", color: c.textDim }}>
                      {showKinds ? "Своя скидка" : "Скидка на чек"}
                    </Typography>
                    <DiscountField
                      value={benefits.discountPercent}
                      unit="%"
                      label="Скидка на чек, проценты"
                      // Лимит организации — в подсказке поля: отдельная строка под него съела бы место у кнопки оплаты.
                      placeholder={maxPercent < 100 ? `до ${maxPercent}` : "0"}
                      disabled={locked || selectedKind !== null}
                      onChange={(value) => setManualPercent(normalizeManualPercent(value, maxPercent))}
                    />
                    <DiscountField
                      value={benefits.discount}
                      unit="сом"
                      label="Скидка на чек, сумма в сомах"
                      disabled={locked || selectedKind !== null}
                      onChange={(value) => setManualSum(normalizeManualDiscount(value))}
                    />
                  </Stack>

                  <Stack direction="row" gap="6px">
                    {QUICK_DISCOUNT_PERCENTS.map((percent) => {
                      const selected = manualPercent === percent;
                      return (
                        <ButtonBase
                          key={percent}
                          onClick={() => setManualPercent(selected ? "0" : String(percent))}
                          disabled={locked || selectedKind !== null || percent > maxPercent}
                          aria-pressed={selected}
                          sx={{
                            flex: 1,
                            height: { xs: 44, md: 26 },
                            borderRadius: `${POS_RADIUS.pill}px`,
                            bgcolor: selected ? c.accent : c.page,
                            border: `1px solid ${selected ? c.accent : c.hairline}`,
                            color: selected ? c.onAccent : c.textSoft,
                            fontSize: 12,
                            fontWeight: 700,
                            "&.Mui-disabled": { opacity: 0.45 },
                          }}
                        >
                          {percent}%
                        </ButtonBase>
                      );
                    })}
                  </Stack>
                </Stack>
              )}
            </Box>
          )}

          {actions.promotions && (
            <RedemptionCard
              title="Акции"
              hint={
                !benefits.promotions
                  ? "автоматические скидки по акциям"
                  : busy
                    ? "Проверяем подходящие акции…"
                    : quote?.promotionApplied
                      ? "Акция применена к этому чеку"
                      : quote
                        ? "Нет подходящих акций или скидка меньше уже выбранной"
                        : "автоматические скидки по акциям"
              }
              applied={Boolean(benefits.promotions && quote?.promotionApplied)}
              appliedLabel="Применена"
              disabled={frozen}
              onToggle={() => patch({ promotions: !benefits.promotions })}
            />
          )}

          {actions.bonus && (
            <RedemptionCard
              title="Бонусы"
              hint={hasClient ? `доступно ${bonuses} сом` : "Выберите покупателя"}
              applied={benefits.bonuses}
              appliedLabel={<PosAmount value={quote ? amount(quote.bonuses) : bonuses} negative />}
              disabled={frozen || !hasClient || bonuses <= 0}
              onToggle={() => patch({ bonuses: !benefits.bonuses })}
            />
          )}
        </Stack>

        {(canPromoCode ?? actions.promotions) && (
          <CodeField
            label="Промокод"
            placeholder="Введите промокод"
            applied={benefits.promoCode}
            disabled={locked}
            error={promoError}
            onApply={(promoCode) => patch({ promoCode })}
          />
        )}

        {/* Сертификат выбирают способом оплаты «Сертификат» в окне оплаты; здесь — только снять. */}
        {benefits.certificateCode && (
          <Stack gap="6px" sx={{ ...cardSx, borderColor: certificateError ? c.danger : c.accent, bgcolor: c.accentBg }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap="8px">
              <Stack gap="2px" sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: c.text }}>Оплата сертификатом</Typography>
                <Typography noWrap sx={{ fontSize: 13, lineHeight: 1.3, color: c.textDim, fontFamily: "monospace", letterSpacing: ".08em" }}>
                  {benefits.certificateCode}
                </Typography>
              </Stack>
              <ButtonBase
                onClick={() => patch({ certificateCode: "" })}
                disabled={locked}
                sx={{
                  minHeight: { xs: 44, md: 30 },
                  px: "14px",
                  flexShrink: 0,
                  borderRadius: `${POS_RADIUS.pill}px`,
                  border: `1px solid ${c.hairline}`,
                  bgcolor: c.card,
                  color: c.textSoft,
                  fontSize: 12,
                  fontWeight: 700,
                  "&.Mui-disabled": { opacity: 0.45 },
                }}
              >
                Снять
              </ButtonBase>
            </Stack>
            {certificateError ? <FieldError text={certificateError} /> : null}
          </Stack>
        )}
      </Stack>

      <Stack gap="10px" sx={{ ...cardSx, border: "none", flexShrink: 0 }}>
        <Stack gap="4px" sx={{ pb: "10px", borderBottom: `1px solid ${c.hairline}` }}>
          <SummaryLine label="Подытог" value={quote ? <PosAmount value={amount(quote.subtotal)} /> : "—"} />
          {lineDiscountTotal > 0 && (
            <>
              <SummaryLine label="Скидки на товары" value={<PosAmount value={lineDiscountTotal} negative />} tone="discount" />
              <Stack gap="3px" sx={{ pl: "10px", ml: "2px", borderLeft: `2px solid ${c.hairline}` }}>
                {lineDiscounts.map((line) => (
                  <Stack key={line.id} direction="row" alignItems="center" justifyContent="space-between" gap="8px">
                    <Typography noWrap sx={{ minWidth: 0, fontSize: 12, lineHeight: 1.3, color: c.textDim }}>
                      {line.name}
                      {line.label ? <Box component="span" sx={{ color: c.discount }}> · −{line.label}</Box> : null}
                    </Typography>
                    <Typography sx={{ flexShrink: 0, fontSize: 12, lineHeight: 1.3, color: c.discount }}>
                      <PosAmount value={line.amount} negative />
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </>
          )}
          {summary.map((line) => (
            <SummaryLine key={line.label} label={line.label} value={<PosAmount value={line.value} negative />} tone={line.tone} />
          ))}
          {certificatesTotal > 0 && (
            <SummaryLine label="Подарочные сертификаты" value={<>+<PosAmount value={certificatesTotal} /></>} />
          )}
          {lineDiscountIgnored && (
            <Typography sx={{ mt: "4px", p: "8px", borderRadius: `${POS_RADIUS.tile}px`, bgcolor: c.dangerBg, color: c.danger, fontSize: 12, lineHeight: 1.35 }}>
              Сервер не применил скидку на товар — итог посчитан без неё. Уберите скидку с позиции или обновите бэкенд кассы.
            </Typography>
          )}
        </Stack>

        <Stack gap="16px">
          <Stack direction="row" alignItems="flex-end" justifyContent="space-between">
            <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5, color: c.text }}>ИТОГО</Typography>
            <Typography sx={{ fontSize: 32, fontWeight: 900, lineHeight: 1.2, color: c.text, whiteSpace: "nowrap" }}>
              {quote ? <PosAmount value={amount(quote.due)} /> : "—"}
            </Typography>
          </Stack>

          {payDisabledReason ? (
            <Typography sx={{ p: "8px", borderRadius: `${POS_RADIUS.tile}px`, bgcolor: c.dangerBg, color: c.danger, fontSize: 12, lineHeight: 1.35 }}>
              {payDisabledReason}
            </Typography>
          ) : null}

          {actions.sell && !hidePayButton && (
            <ButtonBase
              onClick={onCheckout}
              // Не даём пробить чек дороже, чем показано в строках.
              disabled={busy || !quote || lineDiscountIgnored || Boolean(payDisabledReason)}
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
                "&.Mui-disabled": { opacity: 0.45 },
              }}
            >
              Принять оплату
            </ButtonBase>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
