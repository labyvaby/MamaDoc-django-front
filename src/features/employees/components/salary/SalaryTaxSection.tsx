import React from "react";
import { alpha, Box, ButtonBase, Stack, Typography } from "@mui/material";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import WorkOutline from "@mui/icons-material/WorkOutline";
import HistoryEduOutlined from "@mui/icons-material/HistoryEduOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import PersonOffOutlined from "@mui/icons-material/PersonOffOutlined";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import { AnimatePresence, motion } from "framer-motion";

import type { TaxBaseMode, TaxRegime, TaxSettings } from "../../../../api/payroll";
import { AppButton } from "../../../../components/ui";
import { subtleBg } from "../../../../theme/uiHelpers";
import { NumberField, SalarySection } from "../DjangoSalarySettings";
import { AnimatedNumber } from "./AnimatedNumber";
import {
  isWithholding,
  previewTaxes,
  regimeRates,
  toNumber,
  type SalaryTaxValue,
} from "./salaryCardModel";

const REGIMES: {
  key: TaxRegime;
  title: string;
  text: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "employment",
    title: "Трудовой договор",
    text: "Удерживаем подоходный налог и Соцфонд, платим взнос работодателя",
    icon: <WorkOutline />,
  },
  {
    key: "civil",
    title: "Договор ГПХ",
    text: "Те же удержания по ставкам, заданным для ГПХ",
    icon: <HistoryEduOutlined />,
  },
  {
    key: "patent",
    title: "ИП на патенте",
    text: "Платит налоги сам — из зарплаты ничего не удерживаем",
    icon: <StorefrontOutlined />,
  },
  {
    key: "unofficial",
    title: "Без оформления",
    text: "Налогов и взносов нет",
    icon: <PersonOffOutlined />,
  },
];

const BASES: { key: TaxBaseMode; title: string; text: string }[] = [
  { key: "official", title: "Официальная зарплата", text: "по договору, в месяц" },
  { key: "earnings", title: "Всё начисленное", text: "все суммы месяца" },
];

const pct = (value: string) => `${toNumber(value).toLocaleString("ru-RU")}%`;

type Props = {
  value: SalaryTaxValue;
  onChange: (value: SalaryTaxValue) => void;
  settings: TaxSettings;
  disabled?: boolean;
  canManageSettings?: boolean;
  onEditSettings?: () => void;
  /** Начислено за текущий месяц — для превью при базе «всё начисленное». */
  monthEarnings?: number | null;
};

/** Режим оформления, база налогов и живой расчёт удержаний по ставкам КР. */
const SalaryTaxSection: React.FC<Props> = ({
  value,
  onChange,
  settings,
  disabled = false,
  canManageSettings = false,
  onEditSettings,
  monthEarnings,
}) => {
  const rates = regimeRates(settings, value.regime);
  const withholding = isWithholding(value.regime);
  const deduction = toNumber(settings.standardDeduction);
  const base =
    value.taxBase === "official" ? toNumber(value.officialSalary) : monthEarnings ?? 0;
  const preview = previewTaxes(base, rates, deduction);
  const baseUnknown = value.taxBase === "earnings" && monthEarnings == null;

  return (
    <Stack spacing={2.25}>
      <SalarySection
        icon={<AccountBalanceOutlined />}
        title="Налоги и Соцфонд"
        subtitle="Как сотрудник оформлен — от этого зависят удержания"
      />

      <Box
        role="radiogroup"
        aria-label="Налоговый режим"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.25 }}
      >
        {REGIMES.map((regime) => {
          const selected = regime.key === value.regime;
          return (
            <ButtonBase
              key={regime.key}
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange({ ...value, regime: regime.key })}
              sx={(t) => ({
                position: "relative",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-start",
                gap: 1.25,
                p: 1.5,
                textAlign: "left",
                borderRadius: "14px",
                border: 1.5,
                borderColor: selected ? "primary.main" : "divider",
                bgcolor: selected
                  ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.14 : 0.07)
                  : subtleBg(t),
                boxShadow: selected ? `0 0 0 4px ${alpha(t.palette.primary.main, 0.12)}` : "none",
                transition: "border-color .2s ease, background-color .2s ease, box-shadow .25s ease, transform .2s ease",
                "&:hover": { transform: disabled ? "none" : "translateY(-1px)" },
                opacity: disabled && !selected ? 0.6 : 1,
              })}
            >
              <Box
                sx={(t) => ({
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: selected ? "primary.contrastText" : "primary.onSurface",
                  bgcolor: selected
                    ? "primary.main"
                    : alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
                  transition: "background-color .2s ease, color .2s ease",
                  "& .MuiSvgIcon-root": { fontSize: 19 },
                })}
              >
                {regime.icon}
              </Box>
              <Box sx={{ minWidth: 0, pr: 2 }}>
                <Typography variant="body2" fontWeight={600}>
                  {regime.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, display: "block" }}>
                  {regime.text}
                </Typography>
              </Box>
              <AnimatePresence>
                {selected && (
                  <Box
                    component={motion.div}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    sx={{ position: "absolute", top: 8, right: 8, color: "primary.main", display: "flex" }}
                  >
                    <CheckCircleRounded sx={{ fontSize: 20 }} />
                  </Box>
                )}
              </AnimatePresence>
            </ButtonBase>
          );
        })}
      </Box>

      <AnimatePresence initial={false} mode="wait">
        {withholding ? (
          <motion.div
            key="withholding"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <Stack spacing={1.75}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                  С чего считать налоги
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                  {BASES.map((b) => {
                    const selected = value.taxBase === b.key;
                    return (
                      <ButtonBase
                        key={b.key}
                        disabled={disabled}
                        onClick={() => onChange({ ...value, taxBase: b.key })}
                        sx={(t) => ({
                          display: "block",
                          textAlign: "left",
                          p: 1.25,
                          borderRadius: "12px",
                          border: 1.5,
                          borderColor: selected ? "primary.main" : "divider",
                          bgcolor: selected
                            ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.14 : 0.07)
                            : "background.paper",
                          transition: "border-color .2s ease, background-color .2s ease",
                        })}
                      >
                        <Typography variant="body2" fontWeight={600}>{b.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{b.text}</Typography>
                      </ButtonBase>
                    );
                  })}
                </Box>
              </Box>

              {value.taxBase === "official" && (
                <Box sx={{ maxWidth: 280 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Официальная зарплата
                  </Typography>
                  <NumberField
                    value={value.officialSalary}
                    onChange={(v) => onChange({ ...value, officialSalary: v })}
                    unit="с/мес"
                    step={1000}
                    disabled={disabled}
                  />
                </Box>
              )}

              <TaxBreakdown
                preview={preview}
                settings={settings}
                regime={value.regime}
                baseUnknown={baseUnknown}
                baseCaption={
                  value.taxBase === "official"
                    ? "Официальная зарплата"
                    : "Начислено в этом месяце"
                }
              />
            </Stack>
          </motion.div>
        ) : (
          <motion.div
            key="none"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <Box sx={(t) => ({ p: 1.5, borderRadius: "12px", bgcolor: subtleBg(t), border: 1, borderColor: "divider" })}>
              <Typography variant="body2" color="text.secondary">
                {value.regime === "patent"
                  ? "ИП на патенте сам платит единый налог — в отчёте ЗП удержаний не будет."
                  : "Сотрудник не оформлен — в отчёте ЗП «на руки» равно начисленному."}
              </Typography>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
        gap={1}
        sx={(t) => ({ p: 1.25, borderRadius: "12px", border: "1px dashed", borderColor: "divider", bgcolor: subtleBg(t) })}
      >
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          Ставки организации: ПН {pct(settings.employment.incomeTax)}, Соцфонд{" "}
          {pct(settings.employment.socialEmployee)} работника +{" "}
          {pct(settings.employment.socialEmployer)} работодателя
          {deduction > 0 && `, вычет ${deduction.toLocaleString("ru-RU")} с`}
        </Typography>
        {canManageSettings && onEditSettings && (
          <AppButton
            size="small"
            variant="outlined"
            startIcon={<TuneOutlined fontSize="small" />}
            onClick={onEditSettings}
            sx={{ flexShrink: 0 }}
          >
            Ставки налогов
          </AppButton>
        )}
      </Stack>
    </Stack>
  );
};

/** Лесенка «база → удержания → на руки» + взнос работодателя сверху. */
const TaxBreakdown: React.FC<{
  preview: ReturnType<typeof previewTaxes>;
  settings: TaxSettings;
  regime: TaxRegime;
  baseUnknown: boolean;
  baseCaption: string;
}> = ({ preview, settings, regime, baseUnknown, baseCaption }) => {
  const rates = regimeRates(settings, regime);
  if (!rates) return null;
  const rows: { label: string; value: number; tone?: "minus" | "plus" | "total" }[] = [
    { label: baseCaption, value: preview.base },
    { label: `Соцфонд работника · ${pct(rates.socialEmployee)}`, value: preview.socialEmployee, tone: "minus" },
    { label: `Подоходный налог · ${pct(rates.incomeTax)}`, value: preview.incomeTax, tone: "minus" },
    { label: "Удержим из зарплаты", value: preview.withheld, tone: "total" },
  ];
  return (
    <Box
      sx={(t) => ({
        p: 1.75,
        borderRadius: "14px",
        border: 1,
        borderColor: alpha(t.palette.primary.main, 0.25),
        background: `linear-gradient(135deg, ${alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08)} 0%, ${alpha(t.palette.primary.main, 0.02)} 100%)`,
      })}
    >
      {baseUnknown ? (
        <Typography variant="body2" color="text.secondary">
          База — всё начисленное за месяц: налоги посчитаются в отчёте ЗП по итогам месяца
          ({pct(rates.socialEmployee)} Соцфонд + {pct(rates.incomeTax)} ПН, {pct(rates.socialEmployer)} — взнос работодателя).
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {rows.map((row) => (
            <Stack
              key={row.label}
              direction="row"
              justifyContent="space-between"
              alignItems="baseline"
              sx={{
                ...(row.tone === "total" && { pt: 0.75, mt: 0.25, borderTop: 1, borderColor: "divider" }),
              }}
            >
              <Typography
                variant="body2"
                color={row.tone === "total" ? "text.primary" : "text.secondary"}
                fontWeight={row.tone === "total" ? 600 : 400}
              >
                {row.label}
              </Typography>
              <Typography
                variant="body2"
                fontWeight={row.tone === "total" ? 700 : 600}
                sx={{
                  fontVariantNumeric: "tabular-nums",
                  color: row.tone === "minus" ? "error.main" : "text.primary",
                }}
              >
                {row.tone === "minus" && "− "}
                <AnimatedNumber value={row.value} countUpOnMount={false} /> с
              </Typography>
            </Stack>
          ))}
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ pt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Сверху платит организация: Соцфонд работодателя · {pct(rates.socialEmployer)}
            </Typography>
            <Typography variant="caption" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums", color: "warning.main" }}>
              + <AnimatedNumber value={preview.socialEmployer} countUpOnMount={false} /> с
            </Typography>
          </Stack>
        </Stack>
      )}
    </Box>
  );
};

export default SalaryTaxSection;
