import React from "react";
import { Box, Grid, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import BookOnlineOutlined from "@mui/icons-material/BookOnlineOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";

import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import { DeltaChip, MetricTile } from "./MetricTile";
import { DashCard, WidgetError, type WidgetProps } from "./widgetKit";
import { num } from "./widgetUtils";
import { useDashboardData } from "./DashboardData";

// ── Свободны сегодня ──────────────────────────────────────────────────────────

/**
 * Загрузка специалистов прямо сейчас: сколько из них свободно на сегодня.
 * Раздел `load` агрегата считается так же, как `/scheduling/availability/summary/`,
 * который кормит бейджи «свободны N/M» в расписании, — цифры на двух экранах
 * сойдутся. «Свободен» — есть хотя бы одно свободное окно сегодня.
 *
 * Периода не имеет: вопрос всегда про сегодня — «кого можно занять сейчас».
 */
export const AvailabilityWidget: React.FC<WidgetProps> = () => {
  const data = useDashboardData();
  const s = data.sections.load;
  const loading = data.isLoading("load");
  const error = data.error("load");

  const free = s?.overallFreeEmployeeCount ?? 0;
  const total = s?.overallEmployeeCount ?? 0;
  const busy = Math.max(0, total - free);
  const loadPercent = total > 0 ? Math.round((busy / total) * 100) : null;

  return (
    <DashCard title="Свободны сегодня" subheader="на текущий день" href="/schedule" linkLabel="Расписание">
      {error ? (
        <WidgetError error={error} />
      ) : (
        <Grid container spacing={1.25}>
          <Grid item xs={6}>
            <MetricTile
              label="Свободных специалистов"
              href="/schedule"
              value={total ? `${free} из ${total}` : "—"}
              icon={<EventAvailableOutlined />}
              tone={total > 0 && free === 0 ? "warning" : "neutral"}
              loading={loading}
              hint={total === 0 ? "график на сегодня не заполнен" : undefined}
              title="Свободен — у специалиста есть хотя бы одно незанятое окно на сегодня"
            />
          </Grid>
          <Grid item xs={6}>
            <MetricTile
              label="Занятость"
              href="/schedule"
              value={loadPercent == null ? "—" : `${loadPercent}%`}
              icon={<TrendingUpOutlined />}
              tone={loadPercent != null && loadPercent >= 90 ? "warning" : "neutral"}
              loading={loading}
              hint={total ? `занято ${busy} из ${total}` : undefined}
              title="Доля специалистов, у которых на сегодня не осталось свободных окон"
            />
          </Grid>
        </Grid>
      )}
    </DashCard>
  );
};

// ── Заявки с витрины ──────────────────────────────────────────────────────────

/**
 * Брони, ожидающие подтверждения, — деньги, которые вот-вот утекут: заявка
 * пришла, но никто её не взял. Счётчики «на сейчас», от периода не зависят;
 * прошедшие даты включены осознанно — pending на вчера это «висяк».
 *
 * На агрегате v2 рядом — чем кончились брони на даты периода: сколько дошли до
 * приёма и до оплаты.
 */
export const BookingsWidget: React.FC<WidgetProps> = ({ range }) => {
  const data = useDashboardData();
  const b = data.sections.bookings;
  const loading = data.isLoading("bookings");
  const error = data.error("bookings");
  const pending = b?.pendingCount ?? 0;
  const overdue = b?.overdueCount ?? 0;
  const hasFunnel = b?.total != null;

  return (
    <DashCard title="Заявки с витрины" subheader="ждут ответа" href="/bookings" linkLabel="Онлайн-запись">
      {error ? (
        <WidgetError error={error} />
      ) : (
        <Grid container spacing={1.25}>
          <Grid item xs={6} lg={hasFunnel ? 4 : 6}>
            <MetricTile
              label="Ждут подтверждения"
              href="/bookings"
              value={pending}
              icon={<BookOnlineOutlined />}
              tone={pending > 0 ? "warning" : "neutral"}
              loading={loading}
              title="Заявка с публичной витрины, которую ещё никто не подтвердил"
            />
          </Grid>
          <Grid item xs={6} lg={hasFunnel ? 4 : 6}>
            <MetricTile
              label="Из них просрочено"
              href="/bookings"
              value={overdue}
              icon={<EventAvailableOutlined />}
              tone={overdue > 0 ? "error" : "neutral"}
              loading={loading}
              hint={overdue > 0 ? "дата визита уже прошла" : undefined}
              title="Заявка на прошедшую дату, которую так и не подтвердили — ответа никто не получил"
            />
          </Grid>
          {hasFunnel && (
            <Grid item xs={12} lg={4}>
              <MetricTile
                label="Дошли до оплаты"
                href="/bookings"
                value={b!.total ? `${Math.round(num(b!.conversionRate))}%` : "—"}
                icon={<TrendingUpOutlined />}
                hint={
                  b!.total
                    ? `${b!.paid ?? 0} из ${b!.total} · в приём ${b!.materialized ?? 0}`
                    : "броней на даты периода нет"
                }
                title={`Брони на даты периода (${range.label}): сколько превратились в приём и сколько из них оплачено`}
              />
            </Grid>
          )}
        </Grid>
      )}
    </DashCard>
  );
};

// ── Сравнение филиалов ────────────────────────────────────────────────────────

/**
 * Деньги по филиалам за период — где идёт, а где просело. Строки отсортированы
 * по выручке: лидер сверху, отстающий — внизу, его и надо разбирать.
 *
 * На агрегате — все доступные филиалы без лимита и с базой сравнения. На
 * прежних ручках — по запросу на филиал, поэтому первые 8 и без базы.
 *
 * ⚠ Оплата проживания в отеле, объект которого не привязан к филиалу, в строки
 * не попадает: у отельных организаций сумма строк бывает меньше общей выручки.
 */
export const BranchesWidget: React.FC<WidgetProps> = ({ range }) => {
  const data = useDashboardData();
  const { prev } = data;
  const loading = data.isLoading("branches");
  const error = data.error("branches");

  const rows = React.useMemo(
    () =>
      (data.branches ?? [])
        .map((b) => {
          const m = b.money;
          const income = num(m.netIncome);
          const cash = num(m.cashIncome);
          const card = num(m.cardIncome);
          return {
            id: b.branchId,
            name: b.branchName,
            income,
            prevIncome: m.baseline ? num(m.baseline.netIncome) : undefined,
            payments: m.paymentCount,
            avgCheck: m.paymentCount > 0 ? income / m.paymentCount : 0,
            cardShare: cash + card > 0 ? Math.round((card / (cash + card)) * 100) : null,
            unpaid: m.unpaidPastAmount != null ? num(m.unpaidPastAmount) : null,
          };
        })
        .sort((a, b) => b.income - a.income),
    [data.branches],
  );

  const best = rows.reduce((max, r) => Math.max(max, r.income), 0);
  const totalIncome = rows.reduce((acc, r) => acc + r.income, 0);

  return (
    <DashCard
      title="Филиалы"
      subheader={`${range.label} · всего ${formatKGS(totalIncome)}`}
      href="/cashbox"
      linkLabel="Касса"
    >
      {error ? (
        <WidgetError error={error} />
      ) : (
        <Box>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              px: 1,
              pb: 0.75,
              color: "text.disabled",
              fontSize: "0.7rem",
              fontWeight: 600,
              display: { xs: "none", sm: "flex" },
            }}
          >
            <Box sx={{ flex: 1 }}>Филиал</Box>
            <Box sx={{ width: 56, textAlign: "right" }}>Доля</Box>
            <Box sx={{ width: 64, textAlign: "right", display: { xs: "none", md: "block" } }}>
              Безнал
            </Box>
            <Box sx={{ width: 96, textAlign: "right" }}>Средний чек</Box>
            <Box sx={{ width: 190, textAlign: "right" }}>Выручка</Box>
          </Stack>
          {loading && rows.length === 0 && (
            <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>
              Загружаем…
            </Typography>
          )}
          {rows.map((r) => {
            const share = totalIncome > 0 ? Math.round((r.income / totalIncome) * 100) : 0;
            return (
              <Box
                key={r.id}
                sx={(t) => ({
                  px: 1,
                  py: 0.875,
                  borderRadius: "8px",
                  "&:hover": { bgcolor: subtleBg(t) },
                })}
              >
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {r.name}
                    </Typography>
                    {/* Полоса от лучшего филиала: соотношение читается глазом
                        быстрее колонки чисел. */}
                    <Box
                      sx={(t) => ({
                        mt: 0.5,
                        height: 4,
                        borderRadius: "4px",
                        bgcolor: subtleBg(t, true),
                        overflow: "hidden",
                      })}
                    >
                      <Box
                        sx={(t) => ({
                          width: `${best > 0 ? Math.round((r.income / best) * 100) : 0}%`,
                          height: "100%",
                          borderRadius: "4px",
                          bgcolor: alpha(
                            t.palette.primary.main,
                            t.palette.mode === "dark" ? 0.8 : 0.6,
                          ),
                          transition: "width .3s ease",
                        })}
                      />
                    </Box>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      width: 56,
                      textAlign: "right",
                      color: "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                      display: { xs: "none", sm: "block" },
                    }}
                  >
                    {share}%
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      width: 64,
                      textAlign: "right",
                      color: "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                      display: { xs: "none", md: "block" },
                    }}
                  >
                    {r.cardShare == null ? "—" : `${r.cardShare}%`}
                  </Typography>
                  <Tooltip title={`${r.payments} оплат`} arrow>
                    <Typography
                      variant="caption"
                      sx={{
                        width: 96,
                        textAlign: "right",
                        color: "text.secondary",
                        fontVariantNumeric: "tabular-nums",
                        display: { xs: "none", sm: "block" },
                      }}
                    >
                      {formatKGS(r.avgCheck)}
                    </Typography>
                  </Tooltip>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="flex-end"
                    spacing={0.75}
                    sx={{ width: { xs: "auto", sm: 190 }, flexShrink: 0 }}
                  >
                    {r.prevIncome !== undefined && (r.income > 0 || r.prevIncome > 0) && (
                      <DeltaChip
                        delta={{
                          current: r.income,
                          previous: r.prevIncome,
                          baselineLabel: prev.label,
                        }}
                      />
                    )}
                    <Tooltip
                      arrow
                      title={
                        r.unpaid ? `Не получено за прошедшие визиты: ${formatKGS(r.unpaid)}` : ""
                      }
                    >
                      <Typography
                        sx={{
                          fontWeight: 700,
                          fontSize: "0.9rem",
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatKGS(r.income)}
                      </Typography>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Box>
            );
          })}

          {data.source === "legacy" && data.branchTotal > rows.length && rows.length > 0 && (
            <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>
              показаны первые {rows.length} из {data.branchTotal} филиалов
            </Typography>
          )}
        </Box>
      )}
    </DashCard>
  );
};
