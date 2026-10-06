import React from "react";
import { Box, Button, ButtonBase, Collapse, LinearProgress, MenuItem, Skeleton, TextField, Typography } from "@mui/material";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import ArrowOutwardOutlined from "@mui/icons-material/ArrowOutwardOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";

import {
  CATALOG_FEATURES,
  CATALOG_SORTS,
  getCatalogLayouts,
  getCatalogProjects,
  realtyCatalogKeys,
  type CatalogFeature,
  type CatalogFilters,
  type CatalogLayout,
  type CatalogProject,
  type CatalogSort,
} from "../../api/realtyCatalog";
import { realEstateKeys } from "../../api/realestate";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import { cardSx, compactMoney } from "../estate-dashboard/format";
import { NewProjectWizard } from "../realestate/ui/wizard/NewProjectWizard";
import { matchesProjectSearch, parseAmount, roomsKey } from "./catalogFormat";
import { ProjectDrawer } from "./ProjectDrawer";
import { ScreenError, SearchBox } from "./shared";
import { useIdParam } from "./useLeadParam";

type Tab = "objects" | "layouts";
const ROOMS = [0, 1, 2, 3, 4] as const;

/**
 * «Каталог объектов» застройщика (AIVIO, гайд `frontend-sales.md` §7):
 * ЖК с подбором по комнатам, цене, площади и особенностям (`GET /projects/`
 * с фильтрами), вкладка планировок (`/layouts/`), карточка ЖК — шторка
 * `?project=<id>`. «Квартиры» — шахматка. «＋ Добавить объект» — мастер
 * «Новый ЖК», только с `realty.catalog.manage`.
 */
export default function RealtyCatalogPage() {
  const { t } = useT("realtySales");
  usePageTitle(t("catalog.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <CatalogScreen />
    </Box>
  );
}

interface FilterDraft {
  projectId: string;
  rooms: string;
  priceMin: string;
  priceMax: string;
  areaMin: string;
  areaMax: string;
  feature: "" | CatalogFeature;
}

const EMPTY: FilterDraft = { projectId: "", rooms: "", priceMin: "", priceMax: "", areaMin: "", areaMax: "", feature: "" };

function CatalogScreen() {
  const { t } = useT("realtySales");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scope = useRealtyScope();
  const canCatalog = useCan("realty.catalog.manage");
  const [projectId, openProject] = useIdParam("project");
  const [tab, setTab] = React.useState<Tab>("objects");
  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY);
  const [sort, setSort] = React.useState<CatalogSort>("popular");
  const [more, setMore] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const applied = useDebouncedValue(draft);

  const priceBad = parseAmount(applied.priceMin) != null && parseAmount(applied.priceMax) != null && (parseAmount(applied.priceMin) as number) > (parseAmount(applied.priceMax) as number);
  const areaBad = parseAmount(applied.areaMin) != null && parseAmount(applied.areaMax) != null && (parseAmount(applied.areaMin) as number) > (parseAmount(applied.areaMax) as number);
  const filters = React.useMemo<CatalogFilters>(
    () => ({
      projectId: applied.projectId ? Number(applied.projectId) : null,
      rooms: applied.rooms !== "" ? Number(applied.rooms) : null,
      priceMin: priceBad ? null : parseAmount(applied.priceMin),
      priceMax: priceBad ? null : parseAmount(applied.priceMax),
      areaMin: areaBad ? null : parseAmount(applied.areaMin),
      areaMax: areaBad ? null : parseAmount(applied.areaMax),
      feature: applied.feature || null,
      sort,
    }),
    [applied, sort, priceBad, areaBad],
  );

  const enabled = scope.orgReady !== false;
  // Список ЖК для селекта — без фильтров (тот же ключ, что у пустого подбора).
  const allFilters = React.useMemo<CatalogFilters>(() => ({ sort: "popular" }), []);
  const all = useQuery({
    queryKey: realtyCatalogKeys.projects(scope, allFilters),
    queryFn: ({ signal }) => getCatalogProjects(allFilters, scope, signal),
    enabled,
    staleTime: 60_000,
  });
  const projects = useQuery({
    queryKey: realtyCatalogKeys.projects(scope, filters),
    queryFn: ({ signal }) => getCatalogProjects(filters, scope, signal),
    enabled: enabled && tab === "objects",
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const layoutParams = React.useMemo(() => ({ projectId: filters.projectId ?? null, rooms: filters.rooms ?? null }), [filters.projectId, filters.rooms]);
  const layouts = useQuery({
    queryKey: realtyCatalogKeys.layouts(scope, layoutParams),
    queryFn: ({ signal }) => getCatalogLayouts(layoutParams, scope, signal),
    enabled: enabled && tab === "layouts",
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const error = all.error ?? projects.error ?? layouts.error;
  if (error) {
    return (
      <ScreenError
        error={error}
        title={t("catalog.loadError")}
        onRetry={() => {
          void all.refetch();
          void projects.refetch();
          void layouts.refetch();
        }}
      />
    );
  }

  const set = (patch: Partial<FilterDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const shown = (projects.data ?? []).filter((p) => matchesProjectSearch(p, search));
  const hasFilters = JSON.stringify(draft) !== JSON.stringify(EMPTY) || search.trim() !== "";
  const units = shown.reduce((sum, p) => sum + p.available, 0);
  const selectSlot = { inputLabel: { shrink: true }, select: { displayEmpty: true } } as const;

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("catalog.subtitle")}</Typography>

      <Box sx={{ mb: 1.5, pr: 0.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
        {(["objects", "layouts"] as const).map((key) => (
          <ButtonBase key={key} aria-pressed={tab === key} onClick={() => setTab(key)} sx={(th) => ({ ...pillSx(th, tab === key), whiteSpace: "nowrap" })}>
            {t(`catalog.tabs.${key}`)}
          </ButtonBase>
        ))}
        <ButtonBase onClick={() => navigate("/realestate/chessboard")} sx={(th) => ({ ...pillSx(th, false), whiteSpace: "nowrap", gap: 0.5 })}>
          {t("catalog.tabs.units")}
          <ArrowOutwardOutlined sx={{ fontSize: 14 }} />
        </ButtonBase>
        {canCatalog && (
          <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setWizardOpen(true)} sx={{ ml: "auto", whiteSpace: "nowrap" }}>
            {t("catalog.add")}
          </Button>
        )}
      </Box>

      <Box sx={{ ...cardSx, p: { xs: 1.5, md: 2 }, mb: 1.5, display: "grid", gap: 1.5 }}>
        <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "minmax(220px, 1.3fr) 1fr 1fr 1.2fr" }, alignItems: "start" }}>
          <SearchBox value={search} onChange={setSearch} placeholder={t("catalog.filters.search")} />
          <TextField select size="small" label={t("catalog.filters.project")} value={draft.projectId} onChange={(e) => set({ projectId: e.target.value })} slotProps={selectSlot}>
            <MenuItem value="">{t("catalog.filters.projectAll")}</MenuItem>
            {(all.data ?? []).map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label={t("catalog.filters.rooms")} value={draft.rooms} onChange={(e) => set({ rooms: e.target.value })} slotProps={selectSlot}>
            <MenuItem value="">{t("catalog.filters.roomsAll")}</MenuItem>
            {ROOMS.map((rooms) => (
              <MenuItem key={rooms} value={String(rooms)}>
                {t(`catalog.rooms.${rooms}`)}
              </MenuItem>
            ))}
          </TextField>
          <RangeFields
            label={t("catalog.filters.price")}
            min={draft.priceMin}
            max={draft.priceMax}
            bad={priceBad}
            onChange={(min, max) => set({ priceMin: min, priceMax: max })}
          />
        </Box>
        <Collapse in={more} unmountOnExit>
          <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "1.2fr 1fr 2fr" } }}>
            <RangeFields label={t("catalog.filters.area")} min={draft.areaMin} max={draft.areaMax} bad={areaBad} onChange={(min, max) => set({ areaMin: min, areaMax: max })} />
            <TextField
              select
              size="small"
              label={t("catalog.filters.feature")}
              value={draft.feature}
              onChange={(e) => set({ feature: e.target.value as FilterDraft["feature"] })}
              slotProps={selectSlot}
            >
              <MenuItem value="">{t("catalog.filters.featureAll")}</MenuItem>
              {CATALOG_FEATURES.map((feature) => (
                <MenuItem key={feature} value={feature}>
                  {t(`catalog.features.${feature}`)}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Collapse>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Button size="small" startIcon={<TuneOutlined />} onClick={() => setMore((v) => !v)}>
            {more ? t("catalog.filters.less") : t("catalog.filters.more")}
          </Button>
          {hasFilters && (
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                setDraft(EMPTY);
                setSearch("");
              }}
            >
              {t("catalog.filters.reset")}
            </Button>
          )}
          {tab === "objects" && (
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1 }}>
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("catalog.filters.sort")}</Typography>
              <TextField select size="small" value={sort} onChange={(e) => setSort(e.target.value as CatalogSort)} inputProps={{ "aria-label": t("catalog.filters.sort") }} sx={{ minWidth: 190 }}>
                {CATALOG_SORTS.map((key) => (
                  <MenuItem key={key} value={key}>
                    {t(`catalog.sort.${key}`)}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          )}
        </Box>
      </Box>

      {tab === "objects" ? (
        <>
          <Box sx={{ mb: 1.25, display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
            {projects.data ? (
              <>
                <Typography sx={{ fontWeight: 700 }}>{t("catalog.found", { count: shown.length })}</Typography>
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("catalog.matching", { count: units })}</Typography>
              </>
            ) : (
              <Skeleton width={260} />
            )}
          </Box>
          {!projects.data ? (
            <CardsSkeleton />
          ) : shown.length === 0 ? (
            <Empty text={(all.data?.length ?? 0) === 0 ? t("catalog.noProjects") : t("catalog.empty")} />
          ) : (
            <CardGrid>
              {shown.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  filtered={hasFilters}
                  onOpen={() => openProject(project.id)}
                  onChessboard={() => navigate(`/realestate/chessboard?project=${project.id}`)}
                />
              ))}
            </CardGrid>
          )}
        </>
      ) : !layouts.data ? (
        <CardsSkeleton />
      ) : layouts.data.length === 0 ? (
        <Empty text={t("catalog.layouts.empty")} />
      ) : (
        <CardGrid>
          {[...layouts.data]
            .sort((a, b) => a.minPrice - b.minPrice)
            .map((layout) => (
              <LayoutCard
                key={layout.id}
                layout={layout}
                onOpen={() =>
                  navigate(`/realestate/chessboard?project=${layout.projectId}${layout.representativeUnitId != null ? `&unit=${layout.representativeUnitId}` : ""}`)
                }
              />
            ))}
        </CardGrid>
      )}

      <ProjectDrawer projectId={projectId} onClose={() => openProject(null)} />
      {canCatalog && (
        <NewProjectWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onCreated={(id) => {
            setWizardOpen(false);
            void queryClient.invalidateQueries({ queryKey: realtyCatalogKeys.all });
            void queryClient.invalidateQueries({ queryKey: realEstateKeys.all });
            openProject(Number(id));
          }}
        />
      )}
    </>
  );
}

function RangeFields({ label, min, max, bad, onChange }: { label: string; min: string; max: string; bad: boolean; onChange: (min: string, max: string) => void }) {
  const { t } = useT("realtySales");
  return (
    <Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
        <TextField size="small" label={label} placeholder={t("catalog.filters.priceFrom")} value={min} onChange={(e) => onChange(e.target.value, max)} inputMode="decimal" error={bad} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" placeholder={t("catalog.filters.priceTo")} value={max} onChange={(e) => onChange(min, e.target.value)} inputMode="decimal" error={bad} inputProps={{ "aria-label": `${label} — ${t("catalog.filters.priceTo")}` }} />
      </Box>
      {bad && <Typography sx={{ mt: 0.25, fontSize: "0.72rem", color: "error.main" }}>{t("catalog.filters.invalidRange")}</Typography>}
    </Box>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" } }}>{children}</Box>;
}

function CardsSkeleton() {
  return (
    <CardGrid>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} variant="rounded" height={320} sx={{ borderRadius: "14px" }} />
      ))}
    </CardGrid>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Box sx={{ ...cardSx, py: 6, textAlign: "center" }}>
      <Typography sx={{ color: "text.secondary" }}>{text}</Typography>
    </Box>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "primary" | "success" | null }) {
  return (
    <Box
      component="span"
      sx={(th) => ({
        display: "inline-flex",
        alignItems: "center",
        px: 0.9,
        py: 0.25,
        borderRadius: "999px",
        fontSize: "0.72rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
        color: tone ? `${tone}.main` : "text.secondary",
        bgcolor: subtleBg(th, true),
      })}
    >
      {children}
    </Box>
  );
}

function ProjectCard({ project, filtered, onOpen, onChessboard }: { project: CatalogProject; filtered: boolean; onOpen: () => void; onChessboard: () => void }) {
  const { t } = useT("realtySales");
  const facts = [
    project.floors ? t("catalog.card.floors", { count: project.floors }) : null,
    project.finish || null,
    project.sections.length ? t("catalog.card.sections", { count: project.sections.length }) : null,
  ].filter(Boolean) as string[];
  return (
    <Box sx={{ ...cardSx, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Box sx={(th) => ({ px: 2, pt: 1.75, pb: 1.5, bgcolor: subtleBg(th) })}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          {project.statusLabel && <Chip tone="primary">{project.statusLabel}</Chip>}
          {project.promo && <Chip tone="success">{project.promo}</Chip>}
          {project.badge && <Chip>{project.badge}</Chip>}
        </Box>
        <Box sx={{ mt: 1.25, display: "flex", alignItems: "center", gap: 1 }}>
          <LinearProgress
            variant="determinate"
            value={Math.max(0, Math.min(100, project.progress))}
            aria-label={t("catalog.card.readiness", { pct: project.progress })}
            sx={(th) => ({ flex: 1, height: 6, borderRadius: 3, bgcolor: subtleBg(th, true), "& .MuiLinearProgress-bar": { borderRadius: 3 } })}
          />
          <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap" }}>{t("catalog.card.readiness", { pct: project.progress })}</Typography>
        </Box>
      </Box>
      <Box sx={{ p: 2, display: "grid", gap: 1.25, flex: 1, alignContent: "start" }}>
        <Box>
          {(project.queue || project.className) && (
            <Typography sx={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "primary.main" }}>
              {[project.queue, project.className].filter(Boolean).join(" · ")}
            </Typography>
          )}
          <Typography component="h3" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {project.name}
          </Typography>
          {(project.address || project.district) && (
            <Typography sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: "0.8125rem", color: "text.secondary" }}>
              <PlaceOutlined sx={{ fontSize: 15 }} />
              {[project.address, project.district].filter(Boolean).join(" · ")}
            </Typography>
          )}
        </Box>
        {facts.length > 0 && (
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {facts.map((fact) => (
              <Chip key={fact}>{fact}</Chip>
            ))}
          </Box>
        )}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 1, py: 1.25, borderTop: 1, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("catalog.card.priceFrom")}</Typography>
            <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{project.priceFrom > 0 ? formatKGS(project.priceFrom) : "—"}</Typography>
            {project.pricePerSqm > 0 && <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("catalog.card.perSqm", { price: formatKGS(project.pricePerSqm) })}</Typography>}
          </Box>
          <Box sx={{ pl: 1.5, borderLeft: 1, borderColor: "divider" }}>
            <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("catalog.card.onSale")}</Typography>
            <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{filtered ? project.available : project.free}</Typography>
            <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("catalog.card.freeUnits")}</Typography>
          </Box>
        </Box>
        {project.stage && (
          <Typography sx={{ fontSize: "0.8125rem" }}>
            {project.stage}
          </Typography>
        )}
        {project.deadlineLabel && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("catalog.card.deadline", { date: project.deadlineLabel })}</Typography>}
        {project.roomStats.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", border: 1, borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
            {project.roomStats.map((stat, i) => (
              <Box key={stat.rooms} sx={{ px: 1.25, py: 0.75, borderTop: i >= 2 ? 1 : 0, borderLeft: i % 2 ? 1 : 0, borderColor: "divider", minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                  {t(`catalog.rooms.${roomsKey(stat.rooms)}`)}
                </Typography>
                <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                  {stat.free > 0 ? `${compactMoney(stat.minPrice, t)} · ${stat.free}` : t("catalog.card.none")}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
      <Box sx={{ px: 2, pb: 2, display: "flex", gap: 1 }}>
        <Button variant="contained" size="small" onClick={onOpen} sx={{ flex: 1 }}>
          {t("catalog.card.details")}
        </Button>
        <Button variant="outlined" size="small" startIcon={<ApartmentOutlined />} onClick={onChessboard}>
          {t("catalog.card.chessboard")}
        </Button>
      </Box>
    </Box>
  );
}

function LayoutCard({ layout, onOpen }: { layout: CatalogLayout; onOpen: () => void }) {
  const { t } = useT("realtySales");
  const [from, to] = [layout.floors[0], layout.floors[layout.floors.length - 1]];
  const area = layout.minArea === layout.maxArea ? `${layout.minArea} м²` : `${layout.minArea}–${layout.maxArea} м²`;
  const tags = [
    layout.corner && t("catalog.layouts.corner"),
    layout.panoramic && t("catalog.layouts.panoramic"),
    layout.terrace ? t("catalog.layouts.terrace") : layout.hasBalcony && t("catalog.layouts.balcony"),
    ...layout.orientations,
  ].filter(Boolean) as string[];
  return (
    <Box sx={{ ...cardSx, p: 2, display: "grid", gap: 1, alignContent: "start", minWidth: 0 }}>
      {layout.images[0] && <Box component="img" src={layout.images[0]} alt={layout.code} sx={{ width: "100%", height: 160, objectFit: "contain", borderRadius: "10px" }} />}
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
          {t(`catalog.roomsShort.${roomsKey(layout.rooms)}`)} · {area}
        </Typography>
        <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: "text.secondary" }}>{layout.code}</Typography>
      </Box>
      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
        {[
          layout.projectName,
          from != null && (from === to ? t("catalog.layouts.floor", { floor: from }) : t("catalog.layouts.floors", { from, to })),
        ]
          .filter(Boolean)
          .join(" · ")}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {layout.minPrice === layout.maxPrice ? formatKGS(layout.minPrice) : t("catalog.layouts.priceRange", { from: compactMoney(layout.minPrice, t), to: compactMoney(layout.maxPrice, t) })}
      </Typography>
      {tags.length > 0 && (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {tags.map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </Box>
      )}
      <Box sx={{ mt: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ flex: 1, fontSize: "0.8125rem", color: layout.free > 0 ? "success.main" : "text.secondary" }}>
          {t("catalog.layouts.units", { free: layout.free, total: layout.total })}
        </Typography>
        <Button size="small" variant="outlined" onClick={onOpen}>
          {t("catalog.layouts.open")}
        </Button>
      </Box>
    </Box>
  );
}
