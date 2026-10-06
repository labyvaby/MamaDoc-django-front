/**
 * RegistryFeed — лента журнала: записи по дням, новые сверху.
 *
 * Отличие от списка регистратуры: полная ширина, липкая шапка дня с итогом дня
 * (сколько записей, выручка, долг) и раскрытие строки на месте вместо колонки
 * деталей справа.
 *
 * Месяц в клинике — это сотни записей, поэтому лента отдаёт дни порциями
 * (`DAYS_STEP`) и мемоизирует строку: без этого раскрытие одной записи
 * перерисовывало все восемьсот вместе с их чипами статусов, и клик подвисал.
 */
import React from "react";
import { Box, Button, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ArrowUpwardOutlined from "@mui/icons-material/ArrowUpwardOutlined";
import ArrowDownwardOutlined from "@mui/icons-material/ArrowDownwardOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import type { DjangoAppointment } from "../../../../api/appointments";
import { UserAvatar } from "../../../../components/ui/UserAvatar";
import AppointmentStatusChips from "../../../../components/appointments/AppointmentStatusChips";
import { subtleBg } from "../../../../theme";
import { useT } from "../../../../i18n/VerticalProvider";
import { formatAmount } from "./registryFormat";
import RegistryRowDetails, { type RegistryRowActions } from "./RegistryRowDetails";
import { moneyOf, type DayGroup, type LinesOf } from "./registryStats";
import { linesPriceDelta } from "../listFilters";

/**
 * Порция ленты — в записях, а не в днях.
 *
 * Раньше отдавалось «10 дней», но день в клинике — это 55 приёмов: первый
 * экран разворачивал 595 строк и 14 500 DOM-узлов, и любой клик по фильтру
 * подвешивал вкладку на секунды. Сотня строк рисуется мгновенно, остальное
 * подтягивается при прокрутке.
 */
const ROWS_STEP = 100;

interface Props extends RegistryRowActions {
  groups: DayGroup[];
  linesOf: LinesOf;
  openId: number | null;
  onToggle: (id: number) => void;
  canUpdate: boolean;
  canViewFinance: boolean;
  canManageFinance: boolean;
  /** Подпись счётчика в шапке дня: «14 приёмов» / «14 процедур». */
  countLabel: (count: number) => string;
  /** Что в правой колонке строки: деньги или расход материалов. */
  metric: RowMetric;
  /** Прибавлять ли к сумме строки товары приёма (галочка «С товарами»). */
  withProducts: boolean;
}

const durationMinutes = (appt: DjangoAppointment): number => {
  const start = dayjs(appt.scheduledAt);
  const end = dayjs(appt.endsAt);
  if (!start.isValid() || !end.isValid()) return 0;
  const minutes = end.diff(start, "minute");
  return minutes > 0 ? minutes : 0;
};

/**
 * Что показывает правая колонка строки.
 *
 * В процедурах полезнее расход материалов, чем сумма (её видно в раскрытии,
 * таблице и разрезах). Но состав услуги настроен не у всех клиник — если в
 * срезе списаний нет вовсе, колонка молча вернулась бы пустой, поэтому режим
 * выбирает страница по данным среза.
 */
export type RowMetric = "money" | "materials";

interface RowProps extends RegistryRowActions {
  appointment: DjangoAppointment;
  metric: RowMetric;
  /**
   * Не готовый массив строк, а функция: `linesOf(appt)` создаёт новый массив на
   * каждый рендер, и мемоизация строки переставала работать — props менялись
   * всегда. Функция же стабильна (useCallback у страницы процедур, константа у
   * приёмов).
   */
  linesOf: LinesOf;
  isOpen: boolean;
  onToggle: (id: number) => void;
  canUpdate: boolean;
  canViewFinance: boolean;
  canManageFinance: boolean;
  withProducts: boolean;
}

const RegistryRow: React.FC<RowProps> = React.memo(
  ({
    appointment: appt,
    linesOf,
    metric,
    isOpen,
    onToggle,
    canUpdate,
    canViewFinance,
    canManageFinance,
    withProducts,
    ...actions
  }) => {
    const { t } = useT("appointments");
    const theme = useTheme();

    const lines = React.useMemo(() => linesOf(appt), [linesOf, appt]);
    const first = lines[0] ?? appt.services[0];
    const employee = first?.employee ?? null;
    const rest = lines.length - 1;
    const money = moneyOf(appt, lines, withProducts);
    // Правка цены относительно прайса — по строкам среза, а не по чеку: в
    // процедурах правка цены врача не должна помечать строку медсестры.
    const priceDelta = canViewFinance ? linesPriceDelta(appt, lines) : 0;
    const duration = durationMinutes(appt);
    const hasMoney = money.accrued > 0;
    const materials = lines.reduce((count, line) => count + (line.consumptions?.length ?? 0), 0);

    return (
      <Box>
        <Box
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          onClick={() => onToggle(appt.id)}
          onKeyDown={(event: React.KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggle(appt.id);
            }
          }}
          sx={{
            display: "grid",
            // Телефон: строка 1 — время, аватар, пациент, сумма; строка 2 —
            // услуга; строка 3 — чипы статуса. Колонки minmax(0, …), иначе
            // длинное ФИО распирает строку шире экрана.
            gridTemplateColumns: {
              xs: "48px 26px minmax(0, 1fr) minmax(0, auto)",
              md: "56px 28px minmax(120px, 1.1fr) minmax(140px, 1.4fr) minmax(0, auto) 116px 24px",
            },
            alignItems: "center",
            columnGap: { xs: 1, md: 1.5 },
            rowGap: { xs: 0.25, md: 0.5 },
            px: { xs: 1.5, md: 2 },
            py: { xs: 0.85, md: 1.1 },
            cursor: "pointer",
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: isOpen ? subtleBg(theme, true) : "transparent",
            transition: "background-color .13s ease",
            "&:hover": { bgcolor: subtleBg(theme, isOpen) },
          }}
        >
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {dayjs(appt.scheduledAt).format("HH:mm")}
            </Typography>
            {duration > 0 && (
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                {t("journal.feed.minutes", { count: duration })}
              </Typography>
            )}
          </Box>

          <UserAvatar
            src={employee?.photoUrl}
            name={employee?.fullName}
            size={28}
            sx={{ borderRadius: "10px", fontSize: "0.62rem" }}
          />

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {appt.patient?.fullName ?? t("journal.feed.noPatient")}
            </Typography>
            <Typography variant="caption" color="text.disabled" noWrap display="block">
              {employee?.fullName ?? t("journal.details.noPerformer")}
            </Typography>
          </Box>

          {/* Явные строки на телефоне: услуга во второй, чипы в третьей, а
              сумма остаётся в первой строке справа от пациента. */}
          <Box
            sx={{
              minWidth: 0,
              gridColumn: { xs: "3 / -1", md: "auto" },
              gridRow: { xs: 2, md: "auto" },
            }}
          >
            <Typography variant="body2" color="text.secondary" noWrap>
              {first?.service?.name ?? "—"}
              {rest > 0 && <Box component="span" sx={{ color: "text.disabled" }}> +{rest}</Box>}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 0.5,
              justifyContent: { xs: "flex-start", md: "flex-end" },
              gridColumn: { xs: "1 / -1", md: "auto" },
              gridRow: { xs: 3, md: "auto" },
              minWidth: 0,
            }}
          >
            <AppointmentStatusChips appointment={appt} chipHeight={22} showPaymentMethodIcons={false} />
          </Box>

          {metric === "materials" ? (
            <Box sx={{ textAlign: "right", gridColumn: { xs: 4, md: "auto" }, gridRow: { xs: 1, md: "auto" } }}>
              <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {materials > 0 ? materials : "—"}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                {t("journal.feed.materials")}
              </Typography>
            </Box>
          ) : canViewFinance ? (
            <Box sx={{ textAlign: "right", gridColumn: { xs: 4, md: "auto" }, gridRow: { xs: 1, md: "auto" } }}>
              <Typography
                variant="body2"
                color={money.refunded > 0 ? "text.secondary" : undefined}
                sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
              >
                {hasMoney
                  ? formatAmount(money.accrued)
                  : money.refunded > 0
                  ? `−${formatAmount(money.refunded)}`
                  : "—"}
              </Typography>
              {money.refunded > 0 ? (
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                  {/* Частичный возврат: сумма приёма осталась, подписываем, сколько вернули. */}
                  {hasMoney
                    ? `${t("journal.feed.refund")} −${formatAmount(money.refunded)}`
                    : t("journal.feed.refund")}
                </Typography>
              ) : hasMoney && money.debt > 0 ? (
                <Typography variant="caption" color="warning.main" sx={{ fontSize: "0.65rem" }}>
                  {t("journal.feed.debtOf", { amount: formatAmount(money.debt) })}
                </Typography>
              ) : priceDelta !== 0 ? (
                <Tooltip
                  title={t(priceDelta > 0 ? "journal.feed.priceUpBy" : "journal.feed.priceDownBy", {
                    amount: formatAmount(Math.abs(priceDelta)),
                  })}
                >
                  <Typography
                    variant="caption"
                    color={priceDelta > 0 ? "success.main" : "error.main"}
                    sx={{
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.25,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {priceDelta > 0 ? (
                      <ArrowUpwardOutlined sx={{ fontSize: 11 }} />
                    ) : (
                      <ArrowDownwardOutlined sx={{ fontSize: 11 }} />
                    )}
                    {formatAmount(Math.abs(priceDelta))}
                  </Typography>
                </Tooltip>
              ) : hasMoney ? (
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                  {t("journal.summary.som")}
                </Typography>
              ) : null}
            </Box>
          ) : (
            <Box />
          )}

          <Box
            sx={{
              display: { xs: "none", md: "flex" },
              justifyContent: "center",
              color: isOpen ? "primary.onSurface" : "text.disabled",
              transform: isOpen ? "rotate(180deg)" : "none",
              transition: "transform .18s ease",
            }}
          >
            <ExpandMoreOutlined sx={{ fontSize: 18 }} />
          </Box>
        </Box>

        {isOpen && (
          <RegistryRowDetails
            appointment={appt}
            lines={lines}
            withProducts={withProducts}
            canUpdate={canUpdate}
            canViewFinance={canViewFinance}
            canManageFinance={canManageFinance}
            {...actions}
          />
        )}
      </Box>
    );
  },
);
RegistryRow.displayName = "RegistryRow";

export const RegistryFeed: React.FC<Props> = ({
  groups,
  linesOf,
  openId,
  onToggle,
  canUpdate,
  canViewFinance,
  canManageFinance,
  countLabel,
  metric,
  withProducts,
  ...actions
}) => {
  const { t } = useT("appointments");
  const [visibleRows, setVisibleRows] = React.useState(ROWS_STEP);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  // Смена среза (период, условия, фильтр) начинает ленту заново.
  React.useEffect(() => setVisibleRows(ROWS_STEP), [groups]);

  // Набираем дни целиком, пока не наберётся порция записей: день не режем —
  // иначе итог в шапке дня расходился бы с тем, что под ней видно.
  const { shown, hiddenRows } = React.useMemo(() => {
    const picked: DayGroup[] = [];
    let rows = 0;
    for (const group of groups) {
      if (rows >= visibleRows) break;
      picked.push(group);
      rows += group.items.length;
    }
    const total = groups.reduce((sum, group) => sum + group.items.length, 0);
    return { shown: picked, hiddenRows: total - rows };
  }, [groups, visibleRows]);

  // Догрузка при прокрутке: жать «Показать ещё» шесть раз подряд — не работа.
  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || hiddenRows <= 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleRows((rows) => rows + ROWS_STEP);
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hiddenRows]);

  return (
    <Stack gap={1.5}>
      <Paper elevation={0} variant="outlined" sx={{ overflow: "hidden" }}>
        {shown.map((group) => {
          const day = dayjs(group.iso);
          return (
            <Box key={group.iso}>
              <Stack
                direction="row"
                alignItems="center"
                gap={1.5}
                sx={{
                  position: "sticky",
                  top: 0,
                  zIndex: 3,
                  px: 2,
                  py: 1,
                  bgcolor: "background.default",
                  borderBottom: 1,
                  borderTop: 1,
                  borderColor: "divider",
                }}
              >
                <Typography variant="subtitle2" fontWeight={600}>
                  {day.format("D MMMM")}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {day.format("dddd")}
                </Typography>
                <Stack direction="row" gap={2} sx={{ ml: "auto" }} flexWrap="wrap" justifyContent="flex-end">
                  <Typography variant="caption" color="text.secondary">
                    {countLabel(group.items.length)}
                  </Typography>
                  {canViewFinance && (
                    <Typography variant="caption" color="text.secondary">
                      {t("journal.feed.dayRevenue")}{" "}
                      <Box
                        component="span"
                        sx={{ fontWeight: 600, color: "text.primary", fontVariantNumeric: "tabular-nums" }}
                      >
                        {formatAmount(group.money.paid)}
                      </Box>
                    </Typography>
                  )}
                  {canViewFinance && group.money.debt > 0 && (
                    <Typography variant="caption" sx={{ color: "warning.main" }}>
                      {t("journal.feed.dayDebt")}{" "}
                      <Box component="span" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {formatAmount(group.money.debt)}
                      </Box>
                    </Typography>
                  )}
                  {canViewFinance && group.money.refunded > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      {t("journal.feed.refund")}{" "}
                      <Box component="span" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        −{formatAmount(group.money.refunded)}
                      </Box>
                    </Typography>
                  )}
                </Stack>
              </Stack>

              {group.items.map((appt) => (
                <RegistryRow
                  key={appt.id}
                  appointment={appt}
                  linesOf={linesOf}
                  metric={metric}
                  isOpen={openId === appt.id}
                  onToggle={onToggle}
                  canUpdate={canUpdate}
                  canViewFinance={canViewFinance}
                  canManageFinance={canManageFinance}
                  withProducts={withProducts}
                  {...actions}
                />
              ))}
            </Box>
          );
        })}
      </Paper>

      {hiddenRows > 0 && (
        <Box ref={sentinelRef} sx={{ display: "flex", justifyContent: "center" }}>
          <Button variant="outlined" onClick={() => setVisibleRows((rows) => rows + ROWS_STEP)}>
            {t("journal.feed.showMore", { count: hiddenRows })}
          </Button>
        </Box>
      )}
    </Stack>
  );
};

export default RegistryFeed;
