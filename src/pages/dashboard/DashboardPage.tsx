import React from "react";
import {
  Alert,
  Box,
  Grid,
  CircularProgress,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useIsFetching, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import CheckOutlined from "@mui/icons-material/CheckOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";

import { PageHeader, SegmentedTabs, cascadeContainer, cascadeItem } from "../../components/ui";
import { getBranches } from "../../api/organization";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { useCanChecker } from "../../hooks/useCan";
import { useActiveScope } from "../../hooks/useActiveScope";
import { usePermissions } from "../../hooks/usePermissions";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { PERIOD_TABS, resolvePeriod, type PeriodKey } from "./period";
import {
  DEFAULT_LAYOUT,
  availableWidgets,
  loadLayout,
  resolveSpan,
  saveLayout,
  visibleWidgets,
  type DashboardLayout,
  type WidgetId,
} from "./layout";
import { LayoutEditor } from "./LayoutEditor";
import {
  AppointmentsWidget,
  EmptyDashboard,
  MonthWidget,
  MoneyWidget,
  ReviewsWidget,
  TasksWidget,
} from "./widgets";
import {
  AvailabilityWidget,
  BookingsWidget,
  BranchesWidget,
} from "./operationsWidgets";
import { exportDashboardXlsx } from "./exportDashboardXlsx";
import { StaffWidget } from "./StaffWidget";
import type { WidgetProps } from "./widgetKit";

const PERIOD_STORAGE_KEY = "mamadoc:dashboard:period";

const MotionGrid = motion(Grid);

const WIDGET_COMPONENT: Record<WidgetId, React.FC<WidgetProps>> = {
  money: MoneyWidget,
  appointments: AppointmentsWidget,
  availability: AvailabilityWidget,
  bookings: BookingsWidget,
  branches: BranchesWidget,
  month: MonthWidget,
  staff: StaffWidget,
  tasks: TasksWidget,
  reviews: ReviewsWidget,
};

/**
 * Сводка — общий главный экран.
 *
 * Экран один на всех, состав блоков определяется правами: денежные видит
 * держатель `finance.view`, отчётные — `reports.view`, и так далее. Отдельного
 * права на саму страницу нет намеренно: заводить код на бэке ради оболочки,
 * которая сама по себе ничего не показывает, незачем — пустой экран закрыт
 * заглушкой EmptyDashboard.
 *
 * Поверх прав работают личные настройки: любой блок можно спрятать и
 * переставить, выбор хранится в браузере пользователя (задача #232).
 *
 * ⚠ Данные берутся из существующих агрегатов CRM (`/cashbox/summary/`,
 * `/reports/monthly/`, `/appointments/day-counts/`, `/tasks/summary/`,
 * `/reviews/stats/`, `/scheduling/availability/summary/`, `/bookings/`) — ни
 * одной новой ручки на бэке не требуется. Когда появятся вьюхи аналитического
 * слоя, блоки переедут на них по одному.
 */
export const DashboardPage: React.FC = () => {
  const { can, loading: permsLoading } = useCanChecker();
  const { activeOrganization, activeBranch } = usePermissions();
  const scope = useActiveScope();

  const [period, setPeriod] = React.useState<PeriodKey>(() => {
    const saved = localStorage.getItem(PERIOD_STORAGE_KEY);
    return saved === "today" || saved === "week" || saved === "month" ? saved : "today";
  });

  const handlePeriod = (key: PeriodKey) => {
    setPeriod(key);
    localStorage.setItem(PERIOD_STORAGE_KEY, key);
  };

  const range = React.useMemo(() => resolvePeriod(period), [period]);

  // Каскад проигрываем только если вкладка видима на момент монтирования.
  // В фоновой вкладке браузер замораживает requestAnimationFrame, анимация не
  // стартует — и блоки навсегда застревают в состоянии `hidden` (opacity 0),
  // то есть пользователь возвращается на пустой экран. Дроверы этим не болеют:
  // их открывают руками. Дашборд же открывают в фоне и по ссылке.
  const [animateOnMount] = React.useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );

  // Время последнего обновления: пока что-то грузится — показываем это, иначе
  // отметку времени. По контексту ErkinAI §8 у каждого блока должно быть видно,
  // насколько свежие данные; на существующих ручках это время ответа.
  const fetching = useIsFetching();
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (fetching === 0) setUpdatedAt(dayjs().format("HH:mm"));
  }, [fetching]);

  // Филиалы нужны, чтобы понять, есть ли что сравнивать: блок сравнения не
  // имеет смысла при единственной точке.
  const branchesQuery = useQuery({
    queryKey: [...djangoQueryKeys.organization.branches, scope.organizationId ?? null],
    queryFn: () => getBranches(scope.organizationId),
    enabled: scope.orgReady && can("finance.view"),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const [layout, setLayout] = React.useState<DashboardLayout>(() => loadLayout());
  const [editing, setEditing] = React.useState(false);

  const updateLayout = (next: DashboardLayout) => {
    setLayout(next);
    saveLayout(next);
  };

  const ctx = React.useMemo(
    () => ({ can, period, branchCount: branchesQuery.data?.length ?? 1 }),
    [can, period, branchesQuery.data],
  );

  const shown = visibleWidgets(layout, ctx);
  const available = availableWidgets(ctx);
  const hasAnything = available.length > 0;

  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportDashboardXlsx({
        range,
        periodKey: period,
        scope,
        organizationName: activeOrganization?.name ?? "",
        branchName:
          activeBranch?.name !== activeOrganization?.name ? activeBranch?.name : undefined,
        // В файл кладём то, на что есть права, а не то, что сейчас на экране:
        // спрятанный блок — это выбор вида, а не запрет на данные.
        allow: {
          money: can(PAGE_PERMISSIONS.cashbox),
          appointments: can(PAGE_PERMISSIONS.appointments),
          reports: can(PAGE_PERMISSIONS.reports),
          tasks: can(PAGE_PERMISSIONS.tasks),
          reviews: can(PAGE_PERMISSIONS.reviews),
          branches: can(PAGE_PERMISSIONS.cashbox) && (branchesQuery.data?.length ?? 0) > 1,
        },
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Не удалось выгрузить файл");
    } finally {
      setExporting(false);
    }
  };

  if (permsLoading) {
    return <LinearProgress />;
  }

  // Филиал показываем, только если он назван иначе, чем организация: у части
  // клиник единственный филиал носит то же имя, и подпись превращалась в
  // «Мама Доктор · Мама Доктор».
  const scopeLabel = [
    activeOrganization?.name,
    activeBranch?.name !== activeOrganization?.name ? activeBranch?.name : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const widgetProps = { range, periodKey: period, scope };

  return (
    // Свой скролл-контейнер обязателен: лейаут приложения (`childrenBoxProps`
    // в App.tsx) фиксирует высоту и ставит `overflow: hidden`, поэтому страница
    // без него просто обрезается — на «Месяце» нижние карточки были недоступны.
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pr: { md: 0.5 } }}>
      <PageHeader
        title="Сводка"
        actions={
          <Stack direction="row" alignItems="center" spacing={1.5}>
            {updatedAt && !editing && (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                обновлено в {updatedAt}
              </Typography>
            )}
            {!editing && (
              <SegmentedTabs
                tabs={PERIOD_TABS}
                value={period}
                onChange={handlePeriod}
                layoutId="dashboard-period"
              />
            )}
            {!editing && (
              <Tooltip title="Выгрузить в Excel" arrow>
                {/* span — чтобы подсказка работала и на выключенной кнопке:
                    MUI не вешает события на disabled-элемент. */}
                <span>
                  <IconButton
                    onClick={handleExport}
                    disabled={exporting || !hasAnything}
                    sx={{ borderRadius: "10px" }}
                    aria-label="Выгрузить сводку в Excel"
                  >
                    {exporting ? (
                      <CircularProgress size={20} />
                    ) : (
                      <FileDownloadOutlined />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            )}
            <Tooltip title={editing ? "Готово" : "Настроить состав"} arrow>
              <IconButton
                onClick={() => setEditing((v) => !v)}
                sx={{ borderRadius: "10px" }}
                aria-label={editing ? "Завершить настройку" : "Настроить состав блоков"}
              >
                {editing ? <CheckOutlined /> : <TuneOutlined />}
              </IconButton>
            </Tooltip>
          </Stack>
        }
      />

      {exportError && (
        <Alert
          severity="error"
          variant="outlined"
          onClose={() => setExportError(null)}
          sx={{ borderRadius: "10px", mb: 2 }}
        >
          {exportError}
        </Alert>
      )}

      {scopeLabel && !editing && (
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          {scopeLabel}
        </Typography>
      )}

      {editing ? (
        <LayoutEditor
          layout={layout}
          available={available}
          onChange={updateLayout}
          onReset={() => updateLayout(DEFAULT_LAYOUT)}
        />
      ) : shown.length === 0 ? (
        <EmptyDashboard hasHidden={layout.hidden.length > 0} onShowAll={() => setEditing(true)} />
      ) : (
        // Каскад появления по гайду §6: один аккуратный момент на загрузку,
        // без микро-анимаций внутри плиток.
        <MotionGrid
          container
          spacing={2}
          alignItems="stretch"
          variants={cascadeContainer}
          initial={animateOnMount ? "hidden" : false}
          animate="show"
        >
          {shown.map((w) => {
            const Widget = WIDGET_COMPONENT[w.id];
            return (
              <MotionGrid
                item
                key={w.id}
                xs={12}
                md={resolveSpan(w, layout) === 12 ? 12 : 6}
                lg={resolveSpan(w, layout)}
                variants={cascadeItem}
              >
                <Widget {...widgetProps} />
              </MotionGrid>
            );
          })}
        </MotionGrid>
      )}
    </Box>
  );
};


export default DashboardPage;
