import React from "react";
import {
  Alert,
  Box,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { getRecordsSummary } from "../../api/vaccinations";
import PeriodStepper from "../../components/vaccinations/PeriodStepper";
import { periodBounds, periodLabel } from "../../components/vaccinations/periodStep";
import { TotalTile } from "./TotalTile";
import { formatCount, formatMoney } from "./totalsFormat";
import { toBars, yearMonths, type BarDatum } from "./dashboardData";

type Props = {
  branchId: number | null;
  orgId?: number;
};

/** Карточка-раздел дашборда. */
const Panel: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", p: 1.75, minWidth: 0, bgcolor: "background.paper" }}>
    <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1} sx={{ mb: 1.25 }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {title}
      </Typography>
      {note && (
        <Typography variant="caption" color="text.secondary">
          {note}
        </Typography>
      )}
    </Stack>
    {children}
  </Box>
);

/**
 * Горизонтальные полосы одного цвета: подпись слева, полоса, значение у конца.
 * Вся строка — зона наведения с подсказкой.
 */
const Bars: React.FC<{ data: BarDatum[]; empty?: string; labelWidth?: number }> = ({ data, empty, labelWidth = 150 }) => {
  const theme = useTheme();
  const main = theme.palette.primary.main;
  if (data.every((d) => d.value === 0)) {
    return (
      <Typography variant="body2" color="text.secondary">
        {empty ?? "Нет данных за период"}
      </Typography>
    );
  }
  return (
    <Stack spacing={0.5}>
      {data.map((d) => (
        <Tooltip key={d.key} title={d.hint ?? ""} placement="top-start" disableInteractive disableHoverListener={!d.hint}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: `${labelWidth}px 1fr`,
              alignItems: "center",
              gap: 1,
              py: 0.25,
              borderRadius: "6px",
              "&:hover": { bgcolor: alpha(main, 0.06) },
            }}
          >
            <Typography variant="body2" noWrap title={d.label} color={d.value ? "text.primary" : "text.secondary"}>
              {d.label}
            </Typography>
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  height: 14,
                  width: `${Math.max(d.share * 100, d.value ? 2 : 0)}%`,
                  maxWidth: "calc(100% - 84px)",
                  bgcolor: main,
                  borderRadius: "0 4px 4px 0",
                  transition: "width .3s ease",
                }}
              />
              <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {formatCount(d.value)}
                {d.pct && (
                  <Box component="span" sx={{ color: "text.secondary", fontWeight: 400, ml: 0.75 }}>
                    {d.pct}
                  </Box>
                )}
              </Typography>
            </Stack>
          </Box>
        </Tooltip>
      ))}
    </Stack>
  );
};

/** Столбики по месяцам года: высота — число прививок, подсказка — сумма. */
const MonthColumns: React.FC<{ months: ReturnType<typeof yearMonths> }> = ({ months }) => {
  const theme = useTheme();
  const main = theme.palette.primary.main;
  const max = Math.max(1, ...months.map((m) => m.count));
  const current = dayjs().format("YYYY-MM");
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "2px", alignItems: "end", height: 150 }}>
      {months.map((m) => (
        <Tooltip
          key={m.key}
          title={`${m.label}: ${formatCount(m.count)} прив. · ${formatMoney(m.amount)}`}
          placement="top"
          disableInteractive
        >
          <Stack alignItems="center" justifyContent="flex-end" sx={{ height: "100%", cursor: "default", "&:hover .bar": { opacity: 0.8 } }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
              {m.count || ""}
            </Typography>
            <Box
              className="bar"
              sx={{
                width: "70%",
                height: `${(m.count / max) * 100}px`,
                minHeight: m.count ? 3 : 0,
                bgcolor: main,
                borderRadius: "4px 4px 0 0",
              }}
            />
            <Box sx={{ width: "100%", height: "1px", bgcolor: "divider" }} />
            <Typography
              variant="caption"
              color={m.key === current ? "primary.main" : "text.secondary"}
              fontWeight={m.key === current ? 700 : 400}
              sx={{ mt: 0.25 }}
            >
              {m.label}
            </Typography>
          </Stack>
        </Tooltip>
      ))}
    </Box>
  );
};

/**
 * «Дашборд» прививок: итоги месяца или года — сколько сделано и на какую
 * сумму, какие вакцины, возраст и пол детей, по году — динамика по месяцам.
 */
const DashboardTab: React.FC<Props> = ({ branchId, orgId }) => {
  const [mode, setMode] = React.useState<"month" | "year">("month");
  const [month, setMonth] = React.useState(() => dayjs().format("YYYY-MM"));
  const [orgWide, setOrgWide] = React.useState(false);
  const bounds = periodBounds(month, mode);
  const scopeBranch = orgWide ? undefined : (branchId ?? undefined);

  const filters = { branchId: scopeBranch, dateFrom: bounds.from, dateTo: bounds.to, organizationId: orgId };
  const query = useQuery({
    queryKey: djangoQueryKeys.vaccinations.recordsSummary({ ...filters, view: "dashboard" }),
    queryFn: ({ signal }) => getRecordsSummary(filters, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
  const s = query.data;

  const vaccineBars = s
    ? toBars(
        s.byVaccine.map((v) => ({
          key: String(v.vaccineId),
          label: v.vaccineName,
          value: v.count,
          hint: Number(v.amount) > 0 ? formatMoney(v.amount) : "бесплатно / в другом месте",
        })),
        s.count,
      )
    : [];
  const ageBars = s
    ? toBars(
        s.byAge
          .filter((b) => b.key !== "unknown" || b.count > 0)
          .map((b) => ({ key: b.key, label: b.label, value: b.count })),
        s.count,
      )
    : [];
  const sexKids = s ? s.bySex.reduce((n, b) => n + b.count, 0) : 0;
  const sexBars = s
    ? toBars(
        s.bySex
          .filter((b) => b.key !== "unknown" || b.count > 0)
          .map((b) => ({ key: b.key, label: b.label, value: b.count })),
        sexKids,
      )
    : [];

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Stack direction="row" gap={1.5} alignItems="center" flexWrap="wrap" sx={{ mb: 1.5, flexShrink: 0 }}>
        <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)}>
          <ToggleButton value="month" sx={{ textTransform: "none", px: 1.5 }}>
            Месяц
          </ToggleButton>
          <ToggleButton value="year" sx={{ textTransform: "none", px: 1.5 }}>
            Год
          </ToggleButton>
        </ToggleButtonGroup>
        <PeriodStepper value={month} onChange={setMonth} mode={mode} />
        {branchId != null && (
          <ToggleButtonGroup exclusive size="small" value={orgWide ? "org" : "branch"} onChange={(_, v) => v && setOrgWide(v === "org")}>
            <ToggleButton value="branch" sx={{ textTransform: "none", px: 1.5 }}>
              Филиал
            </ToggleButton>
            <ToggleButton value="org" sx={{ textTransform: "none", px: 1.5 }}>
              Организация
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5 }}>
        {query.error ? (
          <Alert severity="error">{query.error instanceof Error ? query.error.message : "Не удалось загрузить итоги"}</Alert>
        ) : !s ? (
          <Stack spacing={1}>
            <Skeleton variant="rounded" height={64} />
            <Skeleton variant="rounded" height={220} />
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <Stack direction="row" gap={1} flexWrap="wrap">
              <TotalTile
                label={`Прививок за ${periodLabel(month, mode).toLowerCase()}`}
                value={formatCount(s.count)}
                hint={`у нас ${s.ours} · в другом месте ${s.external}`}
              />
              <TotalTile label="Детей" value={formatCount(s.patients)} hint={s.patients ? `≈ ${(s.count / s.patients).toFixed(1).replace(".", ",")} прививки на ребёнка` : undefined} />
              <TotalTile label="Сумма" value={formatMoney(s.amount)} hint="по прививкам у нас, со скидкой" accent />
              <TotalTile label="Вакцин в ходу" value={formatCount(s.byVaccine.length)} />
            </Stack>

            {mode === "year" && (
              <Panel title="По месяцам" note="число прививок; наведите — сумма">
                <MonthColumns months={yearMonths(Number(month.slice(0, 4)), s.byMonth)} />
              </Panel>
            )}

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.4fr 1fr" }, gap: 1.5 }}>
              <Panel title="Вакцины" note="прививок и доля от всех; наведите — сумма">
                <Bars data={vaccineBars} labelWidth={190} />
              </Panel>
              <Stack spacing={1.5}>
                <Panel title="Возраст детей" note="на день прививки">
                  <Bars data={ageBars} />
                </Panel>
                <Panel title="Пол детей" note={`детей: ${formatCount(sexKids)}`}>
                  <Bars data={sexBars} />
                </Panel>
              </Stack>
            </Box>
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default DashboardTab;
