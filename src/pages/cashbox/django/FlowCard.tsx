import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";

import { AppCard } from "../../../components/ui";
import { FlowBreakdownBlock, type FlowBreakdownRow } from "./FlowBreakdown";
import { formatSom } from "./money";

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  /** Подпись окна отчёта, напр. «за 19 июля» или «за 1 – 19 июл». */
  periodLabel: string;
  /** Приход за окно (сумма положительных потоков) */
  inflow: number;
  /** Расход за окно (сумма отрицательных потоков, положительное число) */
  outflow: number;
  /** Разрез по типам операций: оплаты, продажи, возвраты, расходы, закупки. */
  breakdown: FlowBreakdownRow[];
  loading: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Карточка «Безнал» — отчёт по безналичному потоку за выбранное окно
 * (день или период). Накопительного остатка у безнала нет намеренно:
 * деньги уходят в банк, «остаток на терминале» не существует физически.
 */
const FlowCard: React.FC<Props> = ({
  periodLabel,
  inflow,
  outflow,
  breakdown,
  loading,
}) => {
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
          storageKey="mamadoc:cashbox:cardFlowExpanded"
        />
      </Box>
    </AppCard>
  );
};

export default FlowCard;
