import React from "react";
import { Box, Skeleton, Stack, Tooltip, Typography } from "@mui/material";

import type { CashlessMethodBreakdownRow } from "../../api/cashbox";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CashlessBreakdownItem = {
  key: string;
  name: string;
  /** Сумма строки; знак определяется вызывающим (нетто может быть отрицательным). */
  amount: number;
  count?: number;
  /** Расшифровка в тултипе: приход/возвраты/расходы/закупки. */
  details?: { label: string; amount: number }[];
  /** Строка «без способа» и «продажи товаров» — приглушённые, они не терминал. */
  muted?: boolean;
  /** Подпись под именем строки (почему способа нет). */
  hint?: string;
};

type Props = {
  items: CashlessBreakdownItem[];
  title?: string;
  loading?: boolean;
  /** Линия сверху — когда блок продолжает уже начатый список. */
  divider?: boolean;
  formatAmount: (value: number) => string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const NO_METHOD_LABEL = "Без способа";

const num = (s: string | null | undefined): number => {
  const n = parseFloat(s ?? "0");
  return Number.isNaN(n) ? 0 : n;
};

/**
 * Кассовый разрез → строки списка. Сумма строки — нетто способа
 * (приход − возвраты − расходы − закупки): именно она складывается с
 * продажами товаров в итог карточки «Безнал».
 */
export function cashboxBreakdownItems(
  rows: CashlessMethodBreakdownRow[] | undefined,
): CashlessBreakdownItem[] {
  return (rows ?? []).map((r) => {
    const income = num(r.income);
    const refunds = num(r.refunds);
    const expenses = num(r.expenses);
    const supplies = num(r.supplyExpenses);
    return {
      key: String(r.cashlessMethodId ?? "none"),
      name: r.cashlessMethodName ?? NO_METHOD_LABEL,
      amount: income - refunds - expenses - supplies,
      count: r.count,
      muted: r.cashlessMethodId == null,
      hint:
        r.cashlessMethodId == null
          ? "Безнал до появления справочника или проведённый мимо него"
          : undefined,
      details: [
        { label: "Приход", amount: income },
        { label: "Возвраты", amount: -refunds },
        { label: "Расходы", amount: -expenses },
        { label: "Закупки", amount: -supplies },
      ].filter((d) => d.amount !== 0),
    };
  });
}

/**
 * Продажи товаров способа не хранят вовсе, поэтому в разрез бэка не входят.
 * Показываем их отдельной строкой — иначе сумма списка не сойдётся с итогом
 * карточки и это выглядело бы как потерянные деньги.
 */
export function unattributedSalesItem(cardSales: number): CashlessBreakdownItem[] {
  if (cardSales === 0) return [];
  return [
    {
      key: "sales",
      name: "Продажи товаров",
      amount: cardSales,
      muted: true,
      hint: "Терминал в продаже не сохраняется",
    },
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Разрез безналичных денег по способам оплаты («Бакай карта», «Пост-терминал»).
 * Общий блок для карточки «Безнал», итогов смены и месячного отчёта: данные у
 * них разные, вид один.
 */
const CashlessMethodBreakdown: React.FC<Props> = ({
  items,
  title = "По способам",
  loading = false,
  divider = true,
  formatAmount,
}) => {
  if (!loading && items.length === 0) return null;

  return (
    <Stack
      spacing={0.25}
      sx={
        divider
          ? { borderTop: "1px solid", borderColor: "divider", pt: 1.25, mt: 1.25 }
          : undefined
      }
    >
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={600}
        sx={{ textTransform: "uppercase", letterSpacing: 0.3, mb: 0.25 }}
      >
        {title}
      </Typography>

      {loading
        ? Array.from({ length: 2 }).map((_, i) => (
            <Stack key={i} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
              <Skeleton width={120} height={18} />
              <Skeleton width={72} height={18} />
            </Stack>
          ))
        : items.map((item) => {
            const row = (
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1}
                sx={{ py: 0.5, minWidth: 0 }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    color={item.muted ? "text.disabled" : "text.secondary"}
                    noWrap
                  >
                    {item.name}
                    {item.count != null && (
                      <Box component="span" sx={{ color: "text.disabled" }}>
                        {" · "}
                        {item.count}
                      </Box>
                    )}
                  </Typography>
                  {item.hint && (
                    <Typography variant="caption" color="text.disabled" noWrap display="block">
                      {item.hint}
                    </Typography>
                  )}
                </Box>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                    color: item.muted ? "text.secondary" : "primary.main",
                  }}
                >
                  {formatAmount(item.amount)}
                </Typography>
              </Stack>
            );

            if (!item.details?.length) return <Box key={item.key}>{row}</Box>;

            return (
              <Tooltip
                key={item.key}
                placement="left"
                title={
                  <Stack spacing={0.25}>
                    {item.details.map((d) => (
                      <Typography key={d.label} variant="caption">
                        {d.label}: {formatAmount(d.amount)}
                      </Typography>
                    ))}
                  </Stack>
                }
              >
                <Box>{row}</Box>
              </Tooltip>
            );
          })}
    </Stack>
  );
};

export default CashlessMethodBreakdown;
