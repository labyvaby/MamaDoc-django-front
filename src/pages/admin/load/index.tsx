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
import dayjs, { type Dayjs } from "dayjs";

import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { getLoadAnalytics } from "../../../api/load";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";
import { parseBackendError } from "../../../api/appointments";

import LoadFilters, { presetRange, type LoadPreset } from "./LoadFilters";
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

  const [preset, setPreset] = React.useState<LoadPreset>("today");
  const initial = presetRange("today");
  const [dateFrom, setDateFrom] = React.useState<Dayjs>(initial[0]);
  const [dateTo, setDateTo] = React.useState<Dayjs>(initial[1]);
  const [employees, setEmployees] = React.useState<DjangoEmployeeListItem[]>([]);
  const [chartMode, setChartMode] = React.useState<LoadChartMode>("hourly");

  const isSuper = isSuperAdmin();
  const needsOrg = isSuper && !activeOrganization;

  const branchId = activeBranch?.id ?? undefined;
  const organizationId = isSuper ? activeOrganization?.id ?? undefined : undefined;
  const employeeIds = employees.map((e) => e.id);
  const from = dateFrom.format("YYYY-MM-DD");
  const to = dateTo.format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: djangoQueryKeys.reports.load({ from, to, branchId, employeeIds, organizationId }),
    queryFn: ({ signal }) =>
      getLoadAnalytics(
        { dateFrom: from, dateTo: to, branchId, employeeIds, organizationId },
        signal,
      ),
    enabled: !needsOrg && dateFrom.isValid() && dateTo.isValid() && !dateFrom.isAfter(dateTo),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const data = query.data;
  const daysCount = Math.max(1, dateTo.diff(dateFrom, "day") + 1);

  // ── Handlers ──
  const handlePreset = (p: LoadPreset) => {
    setPreset(p);
    const [f, t] = presetRange(p);
    setDateFrom(f);
    setDateTo(t);
    if (p === "today") setChartMode("hourly");
  };
  const handleDateFrom = (d: Dayjs | null) => {
    if (!d) return;
    setPreset("custom");
    setDateFrom(d.startOf("day"));
  };
  const handleDateTo = (d: Dayjs | null) => {
    if (!d) return;
    setPreset("custom");
    setDateTo(d.endOf("day"));
  };
  const toggleEmployee = (emp: { id: number; fullName: string }) => {
    setEmployees((prev) =>
      prev.some((e) => e.id === emp.id)
        ? prev.filter((e) => e.id !== emp.id)
        : [...prev, emp as DjangoEmployeeListItem],
    );
  };

  const rangeInvalid = dateFrom.isAfter(dateTo);

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
            preset={preset}
            dateFrom={dateFrom}
            dateTo={dateTo}
            employees={employees}
            onPreset={handlePreset}
            onDateFrom={handleDateFrom}
            onDateTo={handleDateTo}
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
                    <ToggleButton value="daily" sx={{ textTransform: "none", px: 1.5 }}>
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
