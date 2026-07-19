import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { useQuery } from "@tanstack/react-query";

import { AppCard } from "../../../components/ui";
import { getCashboxSummary, type CashboxSummary } from "../../../api/cashbox";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../api/queryKeys";
import { formatSom } from "./FlowCard";

// ── Helpers ───────────────────────────────────────────────────────────────────

const num = (s: string | null | undefined): number => {
  const n = parseFloat(s ?? "0");
  return Number.isNaN(n) ? 0 : n;
};

/** Наличный остаток по учёту: всё с начала записей до сегодня. */
function cashNet(s: CashboxSummary): number {
  return (
    num(s.cashIncome) +
    num(s.salesCashIncome) -
    num(s.cashRefunds) -
    num(s.cashExpenses) -
    num(s.supplyCashExpenses)
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  branchId: number | undefined;
  branchName: string | undefined;
  /** Нужен суперпользователю; для остальных бэкенд берёт scope из членства. */
  organizationId: number | undefined;
  enabled: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Карточка «Наличные» — текущий остаток по учёту (накопительно до сегодня).
 *
 * Не зависит ни от фильтра периода, ни от смен: это ответ на вопрос
 * «сколько наличных числится в кассе сейчас». Бэкенд открывает такой
 * запрос любому держателю finance.view (исторические даты — нет).
 */
const CashBalanceCard: React.FC<Props> = ({ branchId, branchName, organizationId, enabled }) => {
  const today = dayjs().format("YYYY-MM-DD");

  const balanceQuery = useQuery({
    queryKey: djangoQueryKeys.cashbox.summary({
      organizationId: organizationId ?? null,
      branchId: branchId ?? null,
      view: "cashBalanceNow",
      day: today,
    }),
    queryFn: ({ signal }) => getCashboxSummary({ organizationId, branchId, dateTo: today }, signal),
    enabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: enabled ? 60_000 : false,
  });

  const balance = balanceQuery.data ? cashNet(balanceQuery.data) : null;

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
              color: "success.onSurface",
              bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.16 : 0.1),
              "& .MuiSvgIcon-root": { fontSize: 20 },
            })}
          >
            <PaymentsOutlined />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" fontWeight={600} sx={{ letterSpacing: -0.15 }}>
              Наличные
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" noWrap>
              {branchName ? `Кассовый ящик · ${branchName}` : "Все доступные филиалы"}
            </Typography>
          </Box>
        </Stack>

        {/* Текущий остаток */}
        <Box sx={{ mt: 2 }}>
          {balanceQuery.isLoading ? (
            <Skeleton variant="text" width="55%" height={44} />
          ) : balanceQuery.isError ? (
            <Typography variant="body2" color="error.main">
              Не удалось загрузить остаток. Обновите страницу.
            </Typography>
          ) : (
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{
                letterSpacing: -0.8,
                fontVariantNumeric: "tabular-nums",
                color: (balance ?? 0) < 0 ? "error.main" : "success.main",
              }}
            >
              {balance == null ? "—" : formatSom(balance)}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" display="block">
            остаток по учёту на сейчас
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
            Не зависит от выбранного дня: считается по всем операциям с начала учёта.
          </Typography>
        </Box>
      </Box>
    </AppCard>
  );
};

export default CashBalanceCard;
