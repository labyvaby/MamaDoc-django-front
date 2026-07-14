import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
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
  kind: "cash" | "card";
  /** Остаток на конец периода (накопительно с начала учёта), null — грузится */
  closing: number | null;
  /** Остаток на начало периода, null — грузится */
  opening: number | null;
  /** Приход за период (сумма положительных потоков) */
  inflow: number;
  /** Расход за период (сумма отрицательных потоков, положительное число) */
  outflow: number;
  breakdown: FlowBreakdownRow[];
  /** Подпись даты остатка, напр. «на 8 июл 2026» */
  closingLabel: string;
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

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Карточка денежного потока (наличные / безнал): остаток на дату, рейка
 * приход-расход за период и разбивка по типам операций.
 */
const FlowCard: React.FC<Props> = ({
  kind,
  closing,
  opening,
  inflow,
  outflow,
  breakdown,
  closingLabel,
  loading,
}) => {
  const isCash = kind === "cash";
  const paletteKey = isCash ? "success" : "primary";
  const railTotal = inflow + outflow;
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
              color: `${paletteKey}.onSurface`,
              bgcolor: alpha(
                t.palette[paletteKey].main,
                t.palette.mode === "dark" ? 0.16 : 0.1,
              ),
              "& .MuiSvgIcon-root": { fontSize: 20 },
            })}
          >
            {isCash ? <PaymentsOutlined /> : <CreditCardOutlined />}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" fontWeight={600} sx={{ letterSpacing: -0.15 }}>
              {isCash ? "Наличные" : "Безнал"}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              {isCash ? "Деньги в кассовом ящике" : "Оплаты картой через терминал"}
            </Typography>
          </Box>
        </Stack>

        {/* Остаток на дату */}
        <Box sx={{ mt: 2 }}>
          {loading || closing == null ? (
            <Skeleton variant="text" width="55%" height={44} />
          ) : (
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{
                letterSpacing: -0.8,
                fontVariantNumeric: "tabular-nums",
                color: closing < 0 ? "error.main" : "text.primary",
              }}
            >
              {formatSom(closing)}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            остаток {closingLabel}
          </Typography>
        </Box>

        {/* На начало периода + поток за период */}
        <Stack
          direction="row"
          spacing={2}
          sx={{ mt: 1.25, mb: 1.75, flexWrap: "wrap", rowGap: 0.5 }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
            на начало периода:{" "}
            {loading || opening == null ? "…" : (
              <Box component="span" sx={{ fontWeight: 600, color: "text.primary" }}>
                {formatSom(opening)}
              </Box>
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
            за период:{" "}
            <Box
              component="span"
              sx={{ fontWeight: 600, color: net < 0 ? "error.main" : "success.main" }}
            >
              {loading ? "…" : signedSom(Math.abs(net), net < 0 ? -1 : 1)}
            </Box>
          </Typography>
        </Stack>

        {/* Рейка приход/расход */}
        <Box
          aria-hidden
          sx={(t) => ({
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
              bgcolor: "success.main",
              transition: "width .4s cubic-bezier(.22,1,.36,1)",
            }}
          />
          <Box
            sx={{
              width: railTotal > 0 ? `${(outflow / railTotal) * 100}%` : 0,
              bgcolor: "error.main",
              opacity: 0.85,
              transition: "width .4s cubic-bezier(.22,1,.36,1)",
            }}
          />
        </Box>
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75, mb: 1.75 }}>
          <Typography variant="caption" color="success.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
            приход{" "}
            <Box component="span" fontWeight={600}>
              {loading ? "…" : formatSom(inflow)}
            </Box>
          </Typography>
          <Typography variant="caption" color="error.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
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
                      bgcolor: empty
                        ? "text.disabled"
                        : row.direction > 0
                          ? "success.main"
                          : "error.main",
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
                      color: empty
                        ? "text.disabled"
                        : row.direction > 0
                          ? "success.main"
                          : "error.main",
                    }}
                  >
                    {empty ? "—" : signedSom(row.amount, row.direction)}
                  </Typography>
                )}
              </Stack>
            );
          })}
        </Stack>
      </Box>
    </AppCard>
  );
};

export default FlowCard;
