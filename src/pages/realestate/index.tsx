import React from "react";
import { Box, Button, Skeleton, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { getProjectUnits, getRealEstateProjects, realEstateKeys, type Project, type Unit } from "../../api/realestate";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePageTitle } from "../../hooks/usePageTitle";
import { autoBoardView, boundsOf, buildBoard, withUnitLayout } from "./model/board";
import { downloadPriceList } from "./model/priceList";
import { useChessboardParams } from "./model/useChessboardParams";
import { countByStatus, hasActiveFilters, matchesUnitFilters } from "./model/units";
import { Board, CompactNote, FloorGuide } from "./ui/Board";
import { COMPARE_LIMIT, CompareDialog, SelectionBar } from "./ui/Compare";
import { BoardToolbar, FilterBar, KpiRow, ProjectTabs, StatusLegend } from "./ui/Filters";
import { RealEstateToastProvider, useRealEstateToast } from "./ui/toast";
import { UnitCardDialog } from "./ui/unit-card/UnitCardDialog";
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
    queryKey: realEstateKeys.projects(),
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

function PageSkeleton() {
  return (
    <Box aria-busy>
      <Box sx={{ mb: 2.25, display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, gap: 1.5 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={92} sx={{ borderRadius: "14px" }} />
        ))}
      </Box>
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
    queryKey: realEstateKeys.units(baseProject.id),
    queryFn: () => getProjectUnits(baseProject.id, organizationId),
    staleTime: 30_000,
  });
  const units = unitsQuery.data;
  // Бэк не отдаёт секции ЖК и первый жилой этаж — достраиваем по квартирам.
  const project = React.useMemo(() => (units ? withUnitLayout(baseProject, units) : baseProject), [baseProject, units]);

  const [selected, setSelected] = React.useState<string[]>([]);
  const [selectMode, setSelectMode] = React.useState(false);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [preview, setPreview] = React.useState<{ unit: Unit; anchor: HTMLElement } | null>(null);

  const counts = React.useMemo(() => countByStatus(units ?? []), [units]);
  const board = React.useMemo(() => (units ? buildBoard(project, units) : null), [project, units]);
  const bounds = React.useMemo(() => (units?.length ? boundsOf(project, units) : null), [project, units]);
  const visibleIds = React.useMemo(() => new Set(units?.filter((u) => matchesUnitFilters(u, params)).map((u) => u.id)), [units, params]);
  const selectedIds = React.useMemo(() => new Set(selected), [selected]);
  const matches = React.useMemo(() => (search ? (units ?? []).filter((u) => u.number.includes(search)) : []), [units, search]);
  const highlightedIds = React.useMemo(() => new Set(matches.map((u) => u.id)), [matches]);

  const isVisible = React.useCallback((unit: Unit) => visibleIds.has(unit.id), [visibleIds]);
  const openUnit = React.useCallback(
    (unitId: string) => {
      setPreview(null);
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
  if (!units || !board || !bounds) return <PageSkeleton />;

  // Вид выбирается по ширине корпуса, но его можно переключить вручную (?view=).
  const view = params.view === "auto" ? autoBoardView(board) : params.view;
  const selectedUnits = selected.map((id) => units.find((u) => u.id === id)).filter((u): u is Unit => Boolean(u));

  return (
    <Box sx={{ pb: selected.length ? 10 : 0 }}>
      <KpiRow counts={counts} />
      <ProjectTabs
        projects={projects}
        activeId={project.id}
        onSelect={onSelectProject}
        onExport={() => toast("Отчёт подготовлен", downloadPriceList(project, units))}
      />

      <Box component="section" sx={{ overflow: "hidden", border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper", p: { xs: 1.75, xl: 2.1 } }}>
        <Box sx={{ mb: 1.9, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2.25 }}>
          <div>
            <Typography component="h2" sx={{ fontSize: "0.95rem", fontWeight: 700 }}>
              Шахматка · ЖК «{project.name}»
            </Typography>
            <Typography sx={{ mt: 0.5, fontSize: "0.8125rem", lineHeight: 1.5, color: "text.secondary" }}>
              Нажмите на квартиру, чтобы открыть карточку и забронировать
            </Typography>
          </div>
          <StatusLegend value={params.status} counts={counts} onChange={updateParams} />
        </Box>

        <FilterBar filters={params} foundCount={visibleIds.size} onChange={updateParams} />
        <BoardToolbar
          filters={params}
          bounds={bounds}
          view={view}
          canReset={hasActiveFilters(params) || params.status !== "all"}
          search={search}
          searchMatches={matches.length}
          selectMode={selectMode}
          onChange={updateParams}
          onReset={() => updateParams({ status: null, rooms: null, feature: null, price: null, area: null, floor: null })}
          onSearch={onSearch}
          onSearchSubmit={() => matches[0] && openUnit(matches[0].id)}
          onToggleSelectMode={() => setSelectMode((on) => !on)}
        />

        {view === "compact" && <CompactNote />}
        <Board
          project={project}
          board={board}
          view={view}
          isVisible={isVisible}
          selectedIds={selectedIds}
          highlightedIds={highlightedIds}
          selectMode={selectMode}
          onOpen={openUnit}
          onToggleSelect={toggleSelect}
          onPreview={showPreview}
        />
        {view === "compact" && <FloorGuide board={board} />}
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
