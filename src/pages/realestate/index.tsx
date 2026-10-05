import React from "react";
import { Box, Button, Skeleton, Typography, useMediaQuery, type Theme } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import AddOutlined from "@mui/icons-material/AddOutlined";

import { REALESTATE_USE_MOCKS, getProjectUnits, getRealEstateProjects, realEstateKeys, type Project, type Unit } from "../../api/realestate";
import { ApiError, isModuleDisabled } from "../../api/client";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { useCanChecker } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { autoBoardView, boundsOf, buildBoard, priceScale, projectFacts, withProjectSections, withUnitLayout } from "./model/board";
import { downloadPriceList } from "./model/priceList";
import { useChessboardParams } from "./model/useChessboardParams";
import { countByStatus, countHolds, hasActiveFilters, matchesUnitFilters } from "./model/units";
import { useMinuteClock } from "./model/useMinuteClock";
import { Board, CompactNote, FloorGuide } from "./ui/Board";
import { COMPARE_LIMIT, CompareDialog, SelectionBar } from "./ui/Compare";
import { BoardToolbar, FilterBar, PriceLegend, ProjectKpis, ProjectSummary, ProjectTabs } from "./ui/Filters";
import { FloorList } from "./ui/FloorList";
import { RealEstateToastProvider, useRealEstateToast } from "./ui/toast";
import { UnitCardDialog, type QuickScreen } from "./ui/unit-card/UnitCardDialog";
import { UnitPreview } from "./ui/UnitPreview";
import { NewProjectWizard } from "./ui/wizard/NewProjectWizard";

/**
 * «Квартиры и шахматка» — модуль вертикали realestate (застройщик).
 * Перенесён из прототипа crm-building/frontend; данные пока на моках,
 * см. REALESTATE_USE_MOCKS в api/realestate.ts.
 */
export default function RealEstateChessboardPage() {
  const { t } = useT("realestate");
  usePageTitle(t("page.title"));
  return (
    <RealEstateToastProvider>
      {/* Лейаут приложения фиксирует высоту и режет overflow — страница скроллится сама, как «Сводка». */}
      <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
        <ChessboardPage />
      </Box>
    </RealEstateToastProvider>
  );
}

function ChessboardPage() {
  const { t } = useT("realestate");
  const toast = useRealEstateToast();
  const [params, updateParams] = useChessboardParams();
  const scope = useRealtyScope();
  const { can } = useCanChecker();
  const [wizardOpen, setWizardOpen] = React.useState(false);
  // «Новый ЖК» — только с правом на каталог: с одним realty.manage бэк отвечает 403.
  const canCreate = REALESTATE_USE_MOCKS || can("realty.catalog.manage");
  const onCreate = canCreate ? () => setWizardOpen(true) : undefined;
  const projectsQuery = useQuery({
    queryKey: realEstateKeys.projects(scope),
    queryFn: () => getRealEstateProjects(scope),
    staleTime: 5 * 60_000,
    enabled: scope.orgReady !== false,
  });

  const projects = projectsQuery.data;
  const project = projects?.find((p) => p.id === params.projectId) ?? projects?.[0];

  const wizard = (
    <NewProjectWizard
      open={wizardOpen}
      onClose={() => setWizardOpen(false)}
      onCreated={(projectId, info) => {
        setWizardOpen(false);
        updateParams({ project: projectId, unit: null });
        toast(t("wizard.done", { name: info.name }), t("wizard.doneHint", { count: info.units }));
      }}
    />
  );

  if (projectsQuery.isError) return <ErrorState error={projectsQuery.error} onRetry={() => void projectsQuery.refetch()} />;
  if (!projects) return <PageSkeleton />;
  if (!project) {
    return (
      <Box sx={{ p: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, textAlign: "center", border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" }}>
        <Typography sx={{ fontWeight: 600 }}>{t("page.noProjects")}</Typography>
        {onCreate && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
              {t("page.noProjectsHint")}
            </Typography>
            <Button variant="contained" startIcon={<AddOutlined />} onClick={onCreate}>
              {t("wizard.openHint")}
            </Button>
          </>
        )}
        {wizard}
      </Box>
    );
  }

  return (
    <>
      <ProjectChessboard
        key={project.id}
        project={project}
        projects={projects}
        onSelectProject={(id) => updateParams({ project: id, unit: null })}
        onCreateProject={onCreate}
      />
      {wizard}
    </>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useT("realestate");
  // Выключенный модуль правами не лечится — отдельный текст; обычный 403 — «Нет доступа».
  if (isModuleDisabled(error)) return <AccessDenied title={t("page.moduleOff")} description={t("page.moduleOffHint")} showBack={false} />;
  if (error instanceof ApiError && error.status === 403) return <AccessDenied />;
  return (
    <Box role="alert" sx={{ p: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, textAlign: "center", border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" }}>
      <Typography sx={{ fontWeight: 600 }}>{t("page.loadError")}</Typography>
      <Typography variant="body2" color="text.secondary">
        {error instanceof Error ? error.message : t("page.unknownError")}
      </Typography>
      <Button variant="outlined" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </Box>
  );
}

/** ЖК заведён, квартир ещё нет — вместо вечного скелетона загрузки. */
function EmptyProject({ name }: { name: string }) {
  const { t } = useT("realestate");
  return (
    <Box sx={{ p: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, textAlign: "center", border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" }}>
      <Typography sx={{ fontWeight: 600 }}>{t("page.emptyProject", { name })}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        {t("page.emptyProjectHint")}
      </Typography>
    </Box>
  );
}

function PageSkeleton() {
  return (
    <Box aria-busy>
      <Skeleton variant="rounded" height={32} sx={{ mb: 2, maxWidth: 560, borderRadius: "9px" }} />
      <Skeleton variant="rounded" height={480} sx={{ borderRadius: "14px" }} />
    </Box>
  );
}

function ProjectChessboard({
  project: baseProject,
  projects,
  onSelectProject,
  onCreateProject,
}: {
  project: Project;
  projects: Project[];
  onSelectProject: (projectId: string) => void;
  onCreateProject?: () => void;
}) {
  const toast = useRealEstateToast();
  const { t } = useT("realestate");
  const [params, updateParams] = useChessboardParams();
  const scope = useRealtyScope();
  const unitsQuery = useQuery({
    queryKey: realEstateKeys.units(scope, baseProject.id),
    queryFn: () => getProjectUnits(baseProject.id, scope),
    staleTime: 30_000,
  });
  const units = React.useMemo(
    () => (unitsQuery.data ? withProjectSections(baseProject, unitsQuery.data) : undefined),
    [baseProject, unitsQuery.data],
  );
  // Секции и первый жилой этаж сверяются с квартирами — данные ЖК бывают неполными.
  const project = React.useMemo(() => (units ? withUnitLayout(baseProject, units) : baseProject), [baseProject, units]);

  const [selected, setSelected] = React.useState<string[]>([]);
  const [selectMode, setSelectMode] = React.useState(false);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [preview, setPreview] = React.useState<{ unit: Unit; anchor: HTMLElement } | null>(null);
  const [startScreen, setStartScreen] = React.useState<QuickScreen | undefined>();
  const now = useMinuteClock();
  const { can } = useCanChecker();
  // Кнопки брони/КП при наведении — только тем, кому доступны сами команды.
  const canManage = REALESTATE_USE_MOCKS || can("realty.manage");

  const counts = React.useMemo(() => countByStatus(units ?? []), [units]);
  const board = React.useMemo(() => (units ? buildBoard(project, units) : null), [project, units]);
  const bounds = React.useMemo(() => (units?.length ? boundsOf(project, units) : null), [project, units]);
  const scale = React.useMemo(() => priceScale(units ?? []), [units]);
  // Телефон: сетка шириной в корпус не помещается — этажи списком (брейкпоинт sm темы = 360px, поэтому md).
  const isPhone = useMediaQuery((t: Theme) => t.breakpoints.down("md"));
  const facts = React.useMemo(() => (units && board ? projectFacts(project, board, units) : null), [project, board, units]);
  const visibleIds = React.useMemo(
    () => new Set(units?.filter((u) => matchesUnitFilters(u, params, now)).map((u) => u.id)),
    [units, params, now],
  );
  const holdCounts = React.useMemo(() => countHolds(units ?? [], now), [units, now]);
  const selectedIds = React.useMemo(() => new Set(selected), [selected]);
  const matches = React.useMemo(() => (search ? (units ?? []).filter((u) => u.number.includes(search)) : []), [units, search]);
  const highlightedIds = React.useMemo(() => new Set(matches.map((u) => u.id)), [matches]);

  const isVisible = React.useCallback((unit: Unit) => visibleIds.has(unit.id), [visibleIds]);
  const openUnit = React.useCallback(
    (unitId: string) => {
      setPreview(null);
      setStartScreen(undefined);
      updateParams({ unit: unitId });
    },
    [updateParams],
  );
  const quickAction = React.useCallback(
    (unitId: string, action: QuickScreen) => {
      setPreview(null);
      setStartScreen(action);
      updateParams({ unit: unitId });
    },
    [updateParams],
  );
  const toggleSelect = React.useCallback((unitId: string) => {
    setSelected((prev) => (prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]));
  }, []);
  const showPreview = React.useCallback((unit: Unit | null, anchor?: HTMLElement) => {
    setPreview(unit && anchor ? { unit, anchor } : null);
  }, []);

  const onSearch = (query: string) => {
    setSearch(query);
    const first = query ? units?.find((u) => u.number.includes(query)) : undefined;
    if (first) {
      // Прокрутить шахматку к первой найденной квартире.
      requestAnimationFrame(() =>
        document.querySelector(`[data-unit-id="${first.id}"]`)?.scrollIntoView?.({ block: "center", inline: "center", behavior: "smooth" }),
      );
    }
  };

  if (unitsQuery.isError) return <ErrorState error={unitsQuery.error} onRetry={() => void unitsQuery.refetch()} />;
  if (!units || !board || !facts) return <PageSkeleton />;
  if (!units.length || !bounds) {
    return (
      <Box>
        <ProjectTabs projects={projects} activeId={project.id} onSelect={onSelectProject} onCreate={onCreateProject} />
        <EmptyProject name={project.name} />
      </Box>
    );
  }

  // Вид выбирается по ширине корпуса, но его можно переключить вручную (?view=).
  const view = params.view === "auto" ? autoBoardView(board) : params.view;
  const selectedUnits = selected.map((id) => units.find((u) => u.id === id)).filter((u): u is Unit => Boolean(u));

  // Цифры шапки — счётчики ЖК с бэка; старый ответ без них — считаем по загруженным квартирам.
  const kpis = project.stats ?? { total: counts.all, free: counts.free, reserved: counts.reserved, sold: counts.sold };

  return (
    <Box sx={{ pb: selected.length ? 10 : 0 }}>
      <ProjectKpis stats={kpis} />
      <ProjectTabs
        projects={projects}
        activeId={project.id}
        onSelect={onSelectProject}
        onCreate={onCreateProject}
        onExport={() => toast(t("toast.priceListReady"), downloadPriceList(project, units))}
      />

      <Box component="section" sx={{ overflow: "hidden", border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper", p: { xs: 1.75, xl: 2.1 } }}>
        <ProjectSummary
          project={project}
          facts={facts}
          sectionNames={board.sections.map((s) => s.name)}
          counts={counts}
          status={params.status}
          onChange={updateParams}
        />

        <FilterBar filters={params} foundCount={visibleIds.size} holdCounts={holdCounts} onChange={updateParams} />
        <BoardToolbar
          filters={params}
          bounds={bounds}
          view={view}
          paint={params.paint}
          canReset={hasActiveFilters(params) || params.status !== "all"}
          search={search}
          searchMatches={matches.length}
          selectMode={selectMode}
          onChange={updateParams}
          onReset={() => updateParams({ status: null, rooms: null, feature: null, hold: null, price: null, area: null, floor: null })}
          onSearch={onSearch}
          onSearchSubmit={() => matches[0] && openUnit(matches[0].id)}
          onToggleSelectMode={() => setSelectMode((on) => !on)}
        />

        {params.paint === "price" && <PriceLegend scale={scale} />}
        {isPhone ? (
          <FloorList project={project} board={board} isVisible={isVisible} paint={params.paint} scale={scale} onOpen={openUnit} />
        ) : (
          <>
            {view === "compact" && params.paint === "status" && <CompactNote />}
            <Board
              project={project}
              board={board}
              view={view}
              paint={params.paint}
              scale={scale}
              isVisible={isVisible}
              selectedIds={selectedIds}
              highlightedIds={highlightedIds}
              selectMode={selectMode}
              onOpen={openUnit}
              onToggleSelect={toggleSelect}
              onPreview={showPreview}
              onQuickAction={canManage ? quickAction : undefined}
            />
            {view === "compact" && <FloorGuide board={board} />}
          </>
        )}
      </Box>

      {preview && !params.unitId && <UnitPreview unit={preview.unit} anchor={preview.anchor} />}

      <SelectionBar
        count={selected.length}
        onCompare={() => setCompareOpen(true)}
        onExport={() => toast(t("toast.selectedExported"), downloadPriceList(project, selectedUnits, "selected"))}
        onClear={() => {
          setSelected([]);
          setSelectMode(false);
        }}
      />
      {compareOpen && selectedUnits.length > 0 && (
        <CompareDialog
          units={selectedUnits}
          onClose={() => setCompareOpen(false)}
          onRemove={toggleSelect}
          onOpenUnit={(id) => {
            setCompareOpen(false);
            openUnit(id);
          }}
        />
      )}

      <UnitCardDialog
        project={project}
        unitId={params.unitId}
        startScreen={startScreen}
        onClose={() => updateParams({ unit: null })}
        onOpenUnit={openUnit}
        onCompare={(id) => {
          const next = selected.includes(id) ? selected : [...selected, id];
          setSelected(next);
          toast(
            t("toast.addedToCompare"),
            next.length >= 2 ? t("toast.addedToCompareHint", { count: next.length }) : t("toast.addedToComparePickMore"),
          );
          if (next.length > COMPARE_LIMIT) toast(t("toast.compareFirst", { limit: COMPARE_LIMIT }));
        }}
      />
    </Box>
  );
}
