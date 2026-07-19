import React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import LockOpenOutlined from "@mui/icons-material/LockOpenOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { useQuery } from "@tanstack/react-query";

import { AppCard } from "../../../components/ui";
import {
  getCashboxShifts,
  getCashboxShiftSummary,
  getCurrentShift,
  parseBackendError,
} from "../../../api/cashboxShifts";
import { getCashboxSummary, type CashboxSummary } from "../../../api/cashbox";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../api/queryKeys";
import { formatSom } from "./FlowCard";
import ShiftOpenDialog from "./shifts/ShiftOpenDialog";
import ShiftCloseDialog from "./shifts/ShiftCloseDialog";

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

function shiftMoment(iso: string): string {
  const d = dayjs(iso).locale("ru");
  return d.isSame(dayjs(), "day") ? d.format("HH:mm") : d.format("D MMM HH:mm");
}

type BreakdownRow = {
  key: string;
  label: string;
  amount: number;
  /** +1 — приход, −1 — расход */
  direction: 1 | -1;
};

const RowLine: React.FC<{ row: BreakdownRow; loading?: boolean }> = ({ row, loading }) => {
  const empty = row.amount === 0;
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 0.5 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            flexShrink: 0,
            bgcolor: empty ? "text.disabled" : row.direction > 0 ? "success.main" : "error.main",
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
            color: empty ? "text.disabled" : row.direction > 0 ? "success.main" : "error.main",
          }}
        >
          {empty ? "—" : (row.direction > 0 ? "+ " : "− ") + formatSom(row.amount)}
        </Typography>
      )}
    </Stack>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  /** Карточка живёт в рамках ОДНОГО кассового ящика — филиал обязателен. */
  branchId: number | undefined;
  branchName: string | undefined;
  /** Нужен суперпользователю и мульти-орг пользователю (открытие смены). */
  organizationId: number | undefined;
  enabled: boolean;
  canOpen: boolean;
  canClose: boolean;
  /**
   * finance.view_history: остаток «по учёту» (накопительно, независимо от
   * смен) — для ролей-надзора (управляющий/бухгалтер/суперадмин) и клиник,
   * не ведущих смены.
   */
  canViewHistory: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Карточка «Наличные» — операционное состояние кассового ящика филиала.
 *
 * Источник данных — смена кассы (cashbox-shifts), НЕ фильтр периода:
 * наличные отвечают на вопрос «сколько денег лежит в ящике сейчас»,
 * поэтому выбор дня/периода на странице эту карточку не трогает.
 */
const CashShiftCard: React.FC<Props> = ({
  branchId,
  branchName,
  organizationId,
  enabled,
  canOpen,
  canClose,
  canViewHistory,
}) => {
  const [openDialog, setOpenDialog] = React.useState(false);
  const [closeDialog, setCloseDialog] = React.useState(false);

  const branchSelected = branchId != null;
  const queriesEnabled = enabled && branchSelected;

  // Текущая открытая смена филиала (404 → null — смены нет).
  const shiftQuery = useQuery({
    queryKey: djangoQueryKeys.shifts.current({
      branchId: branchId ?? null,
      organizationId: organizationId ?? null,
    }),
    queryFn: ({ signal }) => getCurrentShift({ branchId: branchId!, organizationId }, signal),
    enabled: queriesEnabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: queriesEnabled ? 30_000 : false,
  });

  const shift = shiftQuery.data ?? null;
  const shiftOpen = shift?.status === "open";

  // Живые агрегаты открытой смены — из них считается «сейчас в кассе».
  const summaryQuery = useQuery({
    queryKey: shift ? djangoQueryKeys.shifts.summary(shift.id) : ["django", "shifts", "none"],
    queryFn: ({ signal }) => getCashboxShiftSummary(shift!.id, signal),
    enabled: queriesEnabled && shiftOpen,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: queriesEnabled && shiftOpen ? 30_000 : false,
  });
  const summary = summaryQuery.data ?? null;

  // Когда смены нет — показываем остаток последней закрытой («сколько
  // должно лежать перед открытием»).
  const lastClosedQuery = useQuery({
    queryKey: djangoQueryKeys.shifts.list({
      branchId: branchId ?? null,
      organizationId: organizationId ?? null,
      status: "closed",
      last: 1,
    }),
    queryFn: ({ signal }) =>
      getCashboxShifts({ branchId, organizationId, status: "closed", pageSize: 1 }, signal),
    enabled: queriesEnabled && !shiftQuery.isLoading && !shiftOpen,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const lastClosed = lastClosedQuery.data?.results?.[0] ?? null;

  // Остаток «по учёту» — накопительный summary до сегодня. Не зависит от
  // смен и не требует филиала (без филиала — по всем доступным). Бэкенд
  // разрешает накопительный запрос только при finance.view_history, поэтому
  // без права запрос выключен (день-онли роли не ловят 403).
  const accountingQuery = useQuery({
    queryKey: djangoQueryKeys.cashbox.summary({
      organizationId: organizationId ?? null,
      branchId: branchId ?? null,
      view: "cashAccountingBalance",
    }),
    queryFn: ({ signal }) =>
      getCashboxSummary(
        { organizationId, branchId, dateTo: dayjs().format("YYYY-MM-DD") },
        signal,
      ),
    enabled: enabled && canViewHistory,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: enabled && canViewHistory ? 60_000 : false,
  });
  const accountingCash = accountingQuery.data ? cashNet(accountingQuery.data) : null;

  const breakdown: BreakdownRow[] = [
    { key: "payment", label: "Оплаты приёмов", amount: num(summary?.cashIncome), direction: 1 },
    { key: "sale", label: "Продажи товаров", amount: num(summary?.salesCash), direction: 1 },
    { key: "refund", label: "Возвраты", amount: num(summary?.cashRefunds), direction: -1 },
    { key: "expense", label: "Расходы", amount: num(summary?.cashExpenses), direction: -1 },
    { key: "supply", label: "Закупки товара", amount: num(summary?.supplyCash), direction: -1 },
  ];

  const shiftError = shiftQuery.error ? parseBackendError(shiftQuery.error) : null;

  return (
    <AppCard variant="outlined" elevation={0} disableContentPadding sx={{ minWidth: 0 }}>
      <Box sx={{ p: 2.5 }}>
        {/* Шапка: плашка + название + статус смены */}
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
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
          <Box sx={{ minWidth: 0, mr: "auto" }}>
            <Typography variant="body1" fontWeight={600} sx={{ letterSpacing: -0.15 }}>
              Наличные
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" noWrap>
              {branchName ? `Кассовый ящик · ${branchName}` : "Деньги в кассовом ящике"}
            </Typography>
          </Box>
          {branchSelected && !shiftQuery.isLoading && (
            <Chip
              size="small"
              icon={shiftOpen ? <LockOpenOutlined /> : <LockOutlined />}
              label={
                shiftOpen ? `Смена открыта · ${shiftMoment(shift!.openedAt)}` : "Смена не открыта"
              }
              sx={(t) => ({
                height: 24,
                borderRadius: "7px",
                fontWeight: 500,
                fontSize: "0.72rem",
                color: shiftOpen ? "success.main" : "text.secondary",
                bgcolor: shiftOpen
                  ? alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.18 : 0.1)
                  : "transparent",
                border: shiftOpen ? 0 : 1,
                borderColor: "divider",
                "& .MuiSvgIcon-root": { fontSize: 14 },
              })}
            />
          )}
        </Stack>

        {/* ── Филиал не выбран ── */}
        {!branchSelected && canViewHistory && (
          <Box sx={{ mt: 2 }}>
            {accountingQuery.isLoading ? (
              <Skeleton variant="text" width="55%" height={44} />
            ) : (
              <Typography
                variant="h4"
                fontWeight={700}
                sx={{
                  letterSpacing: -0.8,
                  fontVariantNumeric: "tabular-nums",
                  color: (accountingCash ?? 0) < 0 ? "error.main" : "text.primary",
                }}
              >
                {accountingCash == null ? "—" : formatSom(accountingCash)}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" display="block">
              остаток по учёту · все доступные филиалы
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1.25 }}>
              Выберите филиал, чтобы видеть кассовый ящик и работать со сменой.
            </Typography>
          </Box>
        )}
        {!branchSelected && !canViewHistory && (
          <Box
            sx={{
              mt: 2,
              border: "1px dashed",
              borderColor: "divider",
              borderRadius: "10px",
              px: 2,
              py: 2.5,
            }}
          >
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Выберите филиал, чтобы видеть состояние кассового ящика: деньги лежат в
              конкретной кассе, а не «во всех сразу».
            </Typography>
          </Box>
        )}

        {/* ── Загрузка ── */}
        {branchSelected && shiftQuery.isLoading && (
          <Box sx={{ mt: 2 }}>
            <Skeleton variant="text" width="55%" height={44} />
            <Skeleton variant="text" width="40%" height={18} />
          </Box>
        )}

        {/* ── Ошибка ── */}
        {branchSelected && !shiftQuery.isLoading && shiftError && (
          <Typography variant="body2" color="error.main" sx={{ mt: 2 }}>
            {shiftError}
          </Typography>
        )}

        {/* ── Смена не открыта ── */}
        {branchSelected && !shiftQuery.isLoading && !shiftError && !shiftOpen && (
          <>
            <Box sx={{ mt: 2 }}>
              {lastClosedQuery.isLoading || (!lastClosed && accountingQuery.isLoading) ? (
                <Skeleton variant="text" width="55%" height={44} />
              ) : (
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{
                    letterSpacing: -0.8,
                    fontVariantNumeric: "tabular-nums",
                    color:
                      lastClosed || accountingCash != null
                        ? (lastClosed ? num(lastClosed.actualCash) : (accountingCash ?? 0)) < 0
                          ? "error.main"
                          : "text.primary"
                        : "text.disabled",
                  }}
                >
                  {lastClosed
                    ? formatSom(num(lastClosed.actualCash))
                    : accountingCash != null
                      ? formatSom(accountingCash)
                      : "—"}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" display="block">
                {lastClosed
                  ? `остаток при закрытии ${shiftMoment(lastClosed.closedAt ?? lastClosed.openedAt)}`
                  : accountingCash != null
                    ? "остаток по учёту (смены в филиале не ведутся)"
                    : "смен в этом филиале ещё не было"}
              </Typography>
              {/* Сверка с учётом: физический пересчёт vs данные системы */}
              {lastClosed && accountingCash != null && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.5, fontVariantNumeric: "tabular-nums" }}
                >
                  по учёту:{" "}
                  <Box component="span" sx={{ fontWeight: 600, color: "text.primary" }}>
                    {formatSom(accountingCash)}
                  </Box>
                </Typography>
              )}
            </Box>
            {canOpen && (
              <Button
                variant="outlined"
                color="success"
                size="small"
                startIcon={<LockOpenOutlined />}
                onClick={() => setOpenDialog(true)}
                sx={{ mt: 2 }}
              >
                Открыть смену
              </Button>
            )}
          </>
        )}

        {/* ── Смена открыта: мини-отчёт ── */}
        {branchSelected && !shiftQuery.isLoading && !shiftError && shiftOpen && (
          <>
            <Box sx={{ mt: 2 }}>
              {summaryQuery.isLoading ? (
                <Skeleton variant="text" width="55%" height={44} />
              ) : (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography
                    variant="h4"
                    fontWeight={700}
                    sx={{
                      letterSpacing: -0.8,
                      fontVariantNumeric: "tabular-nums",
                      color: num(summary?.expectedCash) < 0 ? "error.main" : "text.primary",
                    }}
                  >
                    {formatSom(num(summary?.expectedCash ?? shift!.openingCash))}
                  </Typography>
                  {summaryQuery.isFetching && <CircularProgress size={14} />}
                </Stack>
              )}
              <Typography variant="caption" color="text.secondary">
                сейчас в кассе (расчётно)
              </Typography>
            </Box>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1.25, mb: 1.75, fontVariantNumeric: "tabular-nums" }}
            >
              при открытии:{" "}
              <Box component="span" sx={{ fontWeight: 600, color: "text.primary" }}>
                {formatSom(num(shift!.openingCash))}
              </Box>
              {shift!.openedByName ? ` · открыл(а) ${shift!.openedByName}` : ""}
            </Typography>

            {/* Составляющие ящика — сумма строк сходится с «сейчас в кассе» */}
            <Stack spacing={0.25} sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.25 }}>
              {breakdown.map((row) => (
                <RowLine key={row.key} row={row} loading={summaryQuery.isLoading} />
              ))}
            </Stack>

            {canClose && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<LockOutlined />}
                onClick={() => setCloseDialog(true)}
                sx={{ mt: 2 }}
              >
                Закрыть смену
              </Button>
            )}
          </>
        )}
      </Box>

      {/* Диалоги открытия/закрытия — сами инвалидируют queries смен */}
      {branchSelected && (
        <>
          <ShiftOpenDialog
            open={openDialog}
            organizationId={organizationId}
            branches={branchName != null ? [{ id: branchId!, name: branchName }] : []}
            defaultBranchId={branchId}
            onClose={() => setOpenDialog(false)}
            onOpened={() => setOpenDialog(false)}
          />
          <ShiftCloseDialog
            open={closeDialog}
            shift={shift}
            summary={summary}
            onClose={() => setCloseDialog(false)}
            onClosed={() => setCloseDialog(false)}
          />
        </>
      )}
    </AppCard>
  );
};

export default CashShiftCard;
