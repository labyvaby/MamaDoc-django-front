import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";

import { AppCard } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FlowBreakdownRow = {
  key: string;
  label: string;
  amount: number;
  /** +1 — приход, −1 — расход */
  direction: 1 | -1;
};

type Props = {
  /** Подпись окна отчёта, напр. «за 19 июля» или «за 1 – 19 июл». */
  periodLabel: string;
  /** Приход за окно (сумма положительных потоков) */
  inflow: number;
  /** Расход за окно (сумма отрицательных потоков, положительное число) */
  outflow: number;
  breakdown: FlowBreakdownRow[];
  loading: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatSom(value: number): string {
  return (
    value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " с"
  );
}

function signedSom(value: number, direction: 1 | -1): string {
  return (direction > 0 ? "+ " : "− ") + formatSom(value);
}

// ── Shared breakdown block ────────────────────────────────────────────────────

type BreakdownBlockProps = {
  inflow: number;
  outflow: number;
  breakdown: FlowBreakdownRow[];
  loading: boolean;
  /** Палитра акцента: primary — безнал, success — наличные. */
  color?: "primary" | "success";
};

/**
 * Рейка приход/расход + разбивка по типам операций. Общий кусок карточек
 * «Безнал» (за выбранное окно) и «Наличные» (всегда за сегодня).
 */
export const FlowBreakdownBlock: React.FC<BreakdownBlockProps> = ({
  inflow,
  outflow,
  breakdown,
  loading,
  color = "primary",
}) => {
  const railTotal = inflow + outflow;
  const accent = `${color}.main`;

  return (
    <>
      {/* Рейка приход/расход */}
      <Box
        aria-hidden
        sx={(t) => ({
          mt: 1.75,
          height: 8,
          borderRadius: "4px",
          overflow: "hidden",
          display: "flex",
          bgcolor: subtleBg(t, true),
        })}
      >
        <Box
          sx={{
            width: railTotal > 0 ? `${(inflow / railTotal) * 100}%` : 0,
            bgcolor: accent,
            transition: "width .4s cubic-bezier(.22,1,.36,1)",
          }}
        />
        <Box
          sx={{
            width: railTotal > 0 ? `${(outflow / railTotal) * 100}%` : 0,
            bgcolor: accent,
            opacity: 0.35,
            transition: "width .4s cubic-bezier(.22,1,.36,1)",
          }}
        />
      </Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75, mb: 1.75 }}>
        <Typography variant="caption" color={accent} sx={{ fontVariantNumeric: "tabular-nums" }}>
          приход{" "}
          <Box component="span" fontWeight={600}>
            {loading ? "…" : formatSom(inflow)}
          </Box>
        </Typography>
        <Typography
          variant="caption"
          color={accent}
          sx={{ fontVariantNumeric: "tabular-nums", opacity: 0.75 }}
        >
          расход{" "}
          <Box component="span" fontWeight={600}>
            {loading ? "…" : `− ${formatSom(outflow)}`}
          </Box>
        </Typography>
      </Stack>

      {/* Разбивка по типам операций */}
      <Stack spacing={0.25} sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.25 }}>
        {breakdown.map((row) => {
          const empty = row.amount === 0;
          return (
            <Stack
              key={row.key}
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ py: 0.5 }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    flexShrink: 0,
                    bgcolor: empty ? "text.disabled" : accent,
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  {row.label}
                </Typography>
              </Stack>
              {loading ? (
                <Skeleton width={72} height={18} />
              ) : (
                <Typography
                  variant="body2"
                  fontWeight={empty ? 400 : 600}
                  sx={{
                    fontVariantNumeric: "tabular-nums",
                    color: empty ? "text.disabled" : accent,
                  }}
                >
                  {empty ? "—" : signedSom(row.amount, row.direction)}
                </Typography>
              )}
            </Stack>
          );
        })}
      </Stack>
    </>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Карточка «Безнал» — отчёт по безналичному потоку за выбранное окно
 * (день или период). Накопительного остатка у безнала нет намеренно:
 * деньги уходят в банк, «остаток на терминале» не существует физически.
 */
const FlowCard: React.FC<Props> = ({ periodLabel, inflow, outflow, breakdown, loading }) => {
  const net = inflow - outflow;

  return (
    <AppCard variant="outlined" elevation={0} disableContentPadding sx={{ minWidth: 0 }}>
      <Box sx={{ p: 2.5 }}>
        {/* Шапка: плашка + название */}
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={(t) => ({
              width: 40,
              height: 40,
              borderRadius: "10px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "primary.onSurface",
              bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
              "& .MuiSvgIcon-root": { fontSize: 20 },
            })}
          >
            <CreditCardOutlined />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" fontWeight={600} sx={{ letterSpacing: -0.15 }}>
              Безнал
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Оплаты картой через терминал
            </Typography>
          </Box>
        </Stack>

        {/* Итог за окно */}
        <Box sx={{ mt: 2 }}>
          {loading ? (
            <Skeleton variant="text" width="55%" height={44} />
          ) : (
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{
                letterSpacing: -0.8,
                fontVariantNumeric: "tabular-nums",
                color: "primary.main",
              }}
            >
              {(net < 0 ? "− " : "") + formatSom(Math.abs(net))}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            итого {periodLabel}
          </Typography>
        </Box>

        <FlowBreakdownBlock
          inflow={inflow}
          outflow={outflow}
          breakdown={breakdown}
          loading={loading}
        />
      </Box>
    </AppCard>
  );
};

export default FlowCard;
