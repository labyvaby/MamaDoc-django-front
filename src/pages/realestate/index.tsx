import React from "react";
import { Box, Button, Skeleton, Typography, useMediaQuery, type Theme } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { REALESTATE_USE_MOCKS, getProjectUnits, getRealEstateProjects, realEstateKeys, type Project, type Unit } from "../../api/realestate";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useCanChecker } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { autoBoardView, boundsOf, buildBoard, priceScale, projectFacts, withProjectSections, withUnitLayout } from "./model/board";
import { downloadPriceList } from "./model/priceList";
import { useChessboardParams } from "./model/useChessboardParams";
import { countByStatus, countHolds, hasActiveFilters, matchesUnitFilters } from "./model/units";
import { useMinuteClock } from "./model/useMinuteClock";
import { Board, CompactNote, FloorGuide } from "./ui/Board";
import { COMPARE_LIMIT, CompareDialog, SelectionBar } from "./ui/Compare";
import { BoardToolbar, FilterBar, PriceLegend, ProjectSummary, ProjectTabs } from "./ui/Filters";
import { FloorList } from "./ui/FloorList";
import { RealEstateToastProvider, useRealEstateToast } from "./ui/toast";
import { UnitCardDialog, type QuickScreen } from "./ui/unit-card/UnitCardDialog";
import { UnitPreview } from "./ui/UnitPreview";

/**
 * «Квартиры и шахматка» — модуль вертикали realestate (застройщик).
 * Перенесён из прототипа crm-building/frontend; данные пока на моках,
 * см. REALESTATE_USE_MOCKS в api/realestate.ts.
 */
export default function RealEstateChessboardPage() {
  usePageTitle("Квартиры и шахматка");
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
  const [params, updateParams] = useChessboardParams();
  const organizationId = useApiOrgId();
  const projectsQuery = useQuery({
    queryKey: realEstateKeys.projects(organizationId),
    queryFn: () => getRealEstateProjects(organizationId),
    staleTime: 5 * 60_000,
  });

  const projects = projectsQuery.data;
  const project = projects?.find((p) => p.id === params.projectId) ?? projects?.[0];

  if (projectsQuery.isError) return <ErrorState error={projectsQuery.error} onRetry={() => void projectsQuery.refetch()} />;
  if (!projects) return <PageSkeleton />;
  if (!project) {
    return (
      <Box sx={{ p: 5, textAlign: "center", color: "text.secondary", border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" }}>
        Нет жилых комплексов
      </Box>
    );
  }

  return (
    <ProjectChessboard key={project.id} project={project} projects={projects} onSelectProject={(id) => updateParams({ project: id, unit: null })} />
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Box role="alert" sx={{ p: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, textAlign: "center", border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" }}>
      <Typography sx={{ fontWeight: 600 }}>Не удалось загрузить данные</Typography>
      <Typography variant="body2" color="text.secondary">
        {error instanceof Error ? error.message : "Неизвестная ошибка"}
      </Typography>
      <Button variant="outlined" onClick={onRetry}>
        Повторить
      </Button>
    </Box>
  );
}

/** ЖК заведён, квартир ещё нет — вместо вечного скелетона загрузки. */
function EmptyProject({ name }: { name: string }) {
  return (
    <Box sx={{ p: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, textAlign: "center", border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" }}>
      <Typography sx={{ fontWeight: 600 }}>В ЖК «{name}» пока нет квартир</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        Шахматка появится, как только квартиры будут заведены в системе.
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

function ProjectChessboard({ project: baseProject, projects, onSelectProject }: { project: Project; projects: Project[]; onSelectProject: (projectId: string) => void }) {
  const toast = useRealEstateToast();
  const [params, updateParams] = useChessboardParams();
  const organizationId = useApiOrgId();
  const unitsQuery = useQuery({
    queryKey: realEstateKeys.units(organizationId, baseProject.id),
    queryFn: () => getProjectUnits(baseProject.id, organizationId),
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
        <ProjectTabs projects={projects} activeId={project.id} onSelect={onSelectProject} />
        <EmptyProject name={project.name} />
      </Box>
    );
  }

  // Вид выбирается по ширине корпуса, но его можно переключить вручную (?view=).
  const view = params.view === "auto" ? autoBoardView(board) : params.view;
  const selectedUnits = selected.map((id) => units.find((u) => u.id === id)).filter((u): u is Unit => Boolean(u));

  return (
    <Box sx={{ pb: selected.length ? 10 : 0 }}>
      <ProjectTabs
        projects={projects}
        activeId={project.id}
        onSelect={onSelectProject}
        onExport={() => toast("Отчёт подготовлен", downloadPriceList(project, units))}
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
        onExport={() => toast("Выбранные квартиры выгружены", downloadPriceList(project, selectedUnits, "selected"))}
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
            "Квартира добавлена к сравнению",
            next.length >= 2 ? `выбрано ${next.length} — нажмите «Сравнить» внизу` : "выберите ещё хотя бы одну на шахматке",
          );
          if (next.length > COMPARE_LIMIT) toast("Сравниваются первые 4 квартиры");
        }}
      />
    </Box>
  );
}
