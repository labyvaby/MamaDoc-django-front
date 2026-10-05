import React from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { getLoadAnalytics } from "../../../api/load";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";
import { parseBackendError } from "../../../api/appointments";
import { DEFAULT_RANGE_PRESETS, type DateRange } from "../../../components/ui";
import { useT } from "../../../i18n/VerticalProvider";

import LoadFilters from "./LoadFilters";
import LoadKpiCards from "./LoadKpiCards";
import { LoadChart } from "./LoadChart";
import { LoadHeatmap } from "./LoadHeatmap";
import { LoadByEmployee } from "./LoadByEmployee";
import {
  availableGranularities,
  buildBuckets,
  fitGranularity,
  type LoadGranularity,
  type LoadMetric,
} from "./loadBuckets";

const GRANULARITIES: { value: LoadGranularity; label: string; dative: string }[] = [
  { value: "hourly", label: "Часы", dative: "часам" },
  { value: "daily", label: "Дни", dative: "дням" },
  { value: "weekly", label: "Недели", dative: "неделям" },
  { value: "monthly", label: "Месяцы", dative: "месяцам" },
];

// Тонкая карточка-обёртка в стиле гайда (плоская, на хайрлайне).
const Card: React.FC<{ title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; sx?: object }> = ({
  title,
  action,
  children,
  sx,
}) => (
  <Box
    sx={{
      border: "1px solid",
      borderColor: "divider",
      borderRadius: "14px",
      bgcolor: "background.paper",
      p: { xs: 1.5, sm: 2 },
      ...sx,
    }}
  >
    {(title || action) && (
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 1.5, gap: 1 }}
      >
        {typeof title === "string" ? (
          <Typography variant="subtitle2" fontWeight={600}>
            {title}
          </Typography>
        ) : (
          title
        )}
        {action}
      </Stack>
    )}
    {children}
  </Box>
);

export const LoadAnalyticsPage: React.FC = () => {
  const { t } = useT("load");
  usePageTitle("Нагрузка");
  const theme = useTheme();
  const { isSuperAdmin, activeOrganization, activeBranch } = usePermissions();

  const [range, setRange] = React.useState<DateRange>(() => {
    const [f, t] = DEFAULT_RANGE_PRESETS[0].range(); // Сегодня
    return { from: f, to: t };
  });
  const [employees, setEmployees] = React.useState<DjangoEmployeeListItem[]>([]);
  // Выбор разбивки запоминается: на коротком периоде показывается ближайшая
  // доступная, а на длинном снова выбранная.
  const [granularity, setGranularity] = React.useState<LoadGranularity>("hourly");
  const [metric, setMetric] = React.useState<LoadMetric>("count");

  const isSuper = isSuperAdmin();
  const needsOrg = isSuper && !activeOrganization;

  const branchId = activeBranch?.id ?? undefined;
  const organizationId = isSuper ? activeOrganization?.id ?? undefined : undefined;
  const employeeIds = employees.map((e) => e.id);
  const from = range.from.format("YYYY-MM-DD");
  const to = range.to.format("YYYY-MM-DD");
  const available = availableGranularities(range.from, range.to);
  const activeGranularity = fitGranularity(granularity, available);

  const query = useQuery({
    queryKey: djangoQueryKeys.reports.load({ from, to, branchId, employeeIds, organizationId }),
    queryFn: ({ signal }) =>
      getLoadAnalytics(
        { dateFrom: from, dateTo: to, branchId, employeeIds, organizationId },
        signal,
      ),
    enabled: !needsOrg && range.from.isValid() && range.to.isValid() && !range.from.isAfter(range.to),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const data = query.data;
  const daysCount = Math.max(1, range.to.diff(range.from, "day") + 1);
  const buckets = React.useMemo(
    () => (data ? buildBuckets(activeGranularity, data.hourly, data.daily) : []),
    [data, activeGranularity],
  );
  const granularityMeta = GRANULARITIES.find((g) => g.value === activeGranularity) ?? GRANULARITIES[0];
  const countTitles: Record<LoadGranularity, string> = {
    hourly: t("hourlyTitle"),
    daily: t("dailyTitle"),
    weekly: t("weeklyTitle"),
    monthly: t("monthlyTitle"),
  };
  const chartTitle =
    metric === "utilization" ? `Загрузка по ${granularityMeta.dative}` : countTitles[activeGranularity];

  // ── Handlers ──
  const toggleEmployee = (emp: { id: number; fullName: string }) => {
    setEmployees((prev) =>
      prev.some((e) => e.id === emp.id)
        ? prev.filter((e) => e.id !== emp.id)
        : [...prev, emp as DjangoEmployeeListItem],
    );
  };

  const rangeInvalid = range.from.isAfter(range.to);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        overflowY: "auto",
        px: theme.appLayout.page.paddingX,
        py: 2,
      }}
    >
      {needsOrg ? (
        <Alert severity="info">Выберите организацию, чтобы увидеть нагрузку.</Alert>
      ) : (
        <>
          <LoadFilters
            range={range}
            employees={employees}
            onRangeChange={setRange}
            onEmployeesChange={setEmployees}
          />

          {rangeInvalid && (
            <Alert severity="warning">Дата начала не может быть позже даты окончания.</Alert>
          )}
          {query.isError && !rangeInvalid && (
            <Alert severity="error">{parseBackendError(query.error)}</Alert>
          )}

          {query.isLoading || !data ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <LoadKpiCards kpi={data.kpi} daysCount={daysCount} />

              <Card
                title={
                  <Typography variant="subtitle2" fontWeight={600}>
                    {chartTitle}
                  </Typography>
                }
                action={
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={metric}
                      onChange={(_, v: LoadMetric | null) => v && setMetric(v)}
                    >
                      <ToggleButton value="count" sx={{ textTransform: "none", px: 1.5 }}>
                        {t("chartTooltipLabel")}
                      </ToggleButton>
                      <ToggleButton value="utilization" sx={{ textTransform: "none", px: 1.5 }}>
                        Загрузка
                      </ToggleButton>
                    </ToggleButtonGroup>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={activeGranularity}
                      onChange={(_, v: LoadGranularity | null) => v && setGranularity(v)}
                    >
                      {GRANULARITIES.map((g) => (
                        <ToggleButton
                          key={g.value}
                          value={g.value}
                          disabled={!available.includes(g.value)}
                          sx={{ textTransform: "none", px: 1.5 }}
                        >
                          {g.label}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Stack>
                }
                sx={{
                  height: { xs: 380, md: 360 },
                  minHeight: { xs: 380, md: 360 },
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <LoadChart
                    metric={metric}
                    buckets={buckets}
                    scheduleSpan={activeGranularity === "hourly" ? data.scheduleSpan ?? null : null}
                  />
                </Box>
              </Card>

              <Stack direction={{ xs: "column", lg: "row" }} spacing={2} useFlexGap>
                <Card title="Плотность: день недели × час" sx={{ flex: 2, minWidth: 0 }}>
                  <LoadHeatmap cells={data.heatmap} />
                </Card>
                <Card title={t("specialistsLoad")} sx={{ flex: 1, minWidth: { lg: 300 } }}>
                  <LoadByEmployee
                    rows={data.byEmployee}
                    selectedIds={employeeIds}
                    onToggle={toggleEmployee}
                  />
                </Card>
              </Stack>
            </>
          )}
        </>
      )}
    </Box>
  );
};

export default LoadAnalyticsPage;
