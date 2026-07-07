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

import LoadFilters from "./LoadFilters";
import LoadKpiCards from "./LoadKpiCards";
import { LoadChart, type LoadChartMode } from "./LoadChart";
import { LoadHeatmap } from "./LoadHeatmap";
import { LoadByEmployee } from "./LoadByEmployee";

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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
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
  usePageTitle("Нагрузка");
  const theme = useTheme();
  const { isSuperAdmin, activeOrganization, activeBranch } = usePermissions();

  const [range, setRange] = React.useState<DateRange>(() => {
    const [f, t] = DEFAULT_RANGE_PRESETS[0].range(); // Сегодня
    return { from: f, to: t };
  });
  const [employees, setEmployees] = React.useState<DjangoEmployeeListItem[]>([]);
  const [chartMode, setChartMode] = React.useState<LoadChartMode>("hourly");

  const isSuper = isSuperAdmin();
  const needsOrg = isSuper && !activeOrganization;

  const branchId = activeBranch?.id ?? undefined;
  const organizationId = isSuper ? activeOrganization?.id ?? undefined : undefined;
  const employeeIds = employees.map((e) => e.id);
  const from = range.from.format("YYYY-MM-DD");
  const to = range.to.format("YYYY-MM-DD");
  const singleDay = range.from.isSame(range.to, "day");

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

  // ── Handlers ──
  const handleRangeChange = (r: DateRange) => {
    setRange(r);
    // Один день → почасовой график осмысленнее подневного.
    if (r.from.isSame(r.to, "day")) setChartMode("hourly");
  };
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
            onRangeChange={handleRangeChange}
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
                    {chartMode === "hourly" ? "Приёмы по часам" : "Приёмы по дням"}
                  </Typography>
                }
                action={
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={chartMode}
                    onChange={(_, v) => v && setChartMode(v)}
                  >
                    <ToggleButton value="hourly" sx={{ textTransform: "none", px: 1.5 }}>
                      Часы
                    </ToggleButton>
                    <ToggleButton value="daily" disabled={singleDay} sx={{ textTransform: "none", px: 1.5 }}>
                      Дни
                    </ToggleButton>
                  </ToggleButtonGroup>
                }
                sx={{
                  height: { xs: 300, md: 340 },
                  minHeight: { xs: 300, md: 340 },
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <LoadChart mode={chartMode} hourly={data.hourly} daily={data.daily} />
                </Box>
              </Card>

              <Stack direction={{ xs: "column", lg: "row" }} spacing={2} useFlexGap>
                <Card title="Плотность: день недели × час" sx={{ flex: 2, minWidth: 0 }}>
                  <LoadHeatmap cells={data.heatmap} />
                </Card>
                <Card title="Нагрузка по врачам" sx={{ flex: 1, minWidth: { lg: 300 } }}>
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
