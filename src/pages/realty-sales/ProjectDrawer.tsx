import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  LinearProgress,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";

import {
  deleteCatalogProject,
  deletePromotion,
  deleteSection,
  deleteUnitLayout,
  getCatalogProject,
  getCatalogProjects,
  getPromotions,
  getUnitLayouts,
  realtyCatalogKeys,
  unsavedFields,
  type CatalogProject,
  type CatalogSection,
  type Promotion,
  type UnitLayout,
} from "../../api/realtyCatalog";
import { realEstateKeys } from "../../api/realestate";
import { useCan } from "../../hooks/useCan";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatDateRu, formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { compactMoney } from "../estate-dashboard/format";
import { PromotionDrawer, ProjectEditDrawer, SectionDrawer, UnitLayoutDrawer } from "./CatalogForms";
import { roomsKey } from "./catalogFormat";

type Editing =
  // Снимок ЖК на момент открытия: фоновая перезагрузка не сотрёт начатую правку.
  | { kind: "project"; item: CatalogProject }
  | { kind: "section"; item: CatalogSection | null }
  | { kind: "layout"; item: UnitLayout | null }
  | { kind: "promotion"; item: Promotion | null };

type Removing =
  | { kind: "project"; name: string }
  | { kind: "section"; id: number; name: string }
  | { kind: "layout"; id: number; name: string }
  | { kind: "promotion"; id: number; name: string };

/**
 * Карточка ЖК — шторка `?project=<id>` каталога. Факты и счётчики — всем с
 * `realty.view`; правка ЖК, секций и планировок — `realty.catalog.manage`
 * (вместе с `realty.manage`), акции — `realty.manage`. Удаление с квартирами
 * или сделками бэк не даёт (409) — показываем его сообщение.
 */
export function ProjectDrawer({ projectId, onClose }: { projectId: number | null; onClose: () => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("realty.manage");
  const canCatalog = useCan("realty.catalog.manage") && canManage;
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [removing, setRemoving] = React.useState<Removing | null>(null);
  const open = projectId != null;

  React.useEffect(() => {
    setEditing(null);
    setRemoving(null);
  }, [projectId]);

  const project = useQuery({
    queryKey: realtyCatalogKeys.project(scope, projectId ?? 0),
    queryFn: ({ signal }) => getCatalogProject(projectId as number, scope, signal),
    enabled: open && scope.orgReady !== false,
    staleTime: 30_000,
  });
  const unitLayouts = useQuery({
    queryKey: realtyCatalogKeys.unitLayouts(scope, projectId ?? 0),
    queryFn: ({ signal }) => getUnitLayouts(projectId as number, scope, signal),
    enabled: open && scope.orgReady !== false,
    staleTime: 60_000,
  });
  const promotions = useQuery({
    queryKey: realtyCatalogKeys.promotions(scope, projectId),
    queryFn: ({ signal }) => getPromotions(projectId, scope, signal),
    enabled: open && scope.orgReady !== false,
    staleTime: 60_000,
  });
  // ЖК для выбора в акции — тот же кэш, что у селекта каталога.
  const allFilters = React.useMemo(() => ({ sort: "popular" as const }), []);
  const projects = useQuery({
    queryKey: realtyCatalogKeys.projects(scope, allFilters),
    queryFn: ({ signal }) => getCatalogProjects(allFilters, scope, signal),
    enabled: open && canManage && scope.orgReady !== false,
    staleTime: 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: realtyCatalogKeys.all });
    // Секции и цены видны на шахматке — её кэш тоже устарел.
    void queryClient.invalidateQueries({ queryKey: realEstateKeys.all });
  };
  const saved = () => {
    setEditing(null);
    refresh();
    enqueueSnackbar(t("catalog.drawer.saved"), { variant: "success" });
  };

  const remove = useMutation({
    mutationFn: async (target: Removing) => {
      const id = projectId as number;
      if (target.kind === "project") await deleteCatalogProject(id, scope);
      else if (target.kind === "section") await deleteSection(id, target.id, scope);
      else if (target.kind === "layout") await deleteUnitLayout(id, target.id, scope);
      else await deletePromotion(target.id, scope);
    },
    onSuccess: (_, target) => {
      setRemoving(null);
      refresh();
      enqueueSnackbar(target.kind === "project" ? t("catalog.drawer.deleted") : t("catalog.drawer.itemDeleted"), { variant: "success" });
      if (target.kind === "project") onClose();
    },
    onError: (error) => {
      setRemoving(null);
      enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" });
    },
  });

  const data = project.data;
  const counters = data
    ? ([
        ["total", data.total, null],
        ["free", data.free, "success.main"],
        ["reserved", data.reserved, "warning.main"],
        ["sold", data.sold, null],
      ] as const)
    : null;
  const facts: [string, React.ReactNode][] = data
    ? (
        [
          ["address", [data.address, data.district].filter(Boolean).join(" · ")],
          ["class", data.className],
          ["queue", data.queue],
          ["stage", data.stage],
          ["deadline", data.deadlineLabel],
          ["finish", data.finish],
          ["promo", data.promo],
          [
            "manager",
            data.manager && (
              <>
                {data.manager}
                {data.managerPhone && (
                  <Box component="a" href={`tel:${data.managerPhone}`} sx={{ ml: 0.75, color: "primary.main", textDecoration: "none" }}>
                    {formatPhoneDisplay(data.managerPhone)}
                  </Box>
                )}
              </>
            ),
          ],
          ["seller", data.sellerInfo],
          ["escrow", data.escrowBank],
          ["permit", data.permit],
          ["cadastral", data.cadastral],
          ["landPlot", data.landPlot],
        ] as [string, React.ReactNode][]
      ).filter(([, value]) => Boolean(value))
    : [];

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { width: { xs: "100vw", sm: 600 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
      >
        <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{data?.statusLabel || t("catalog.drawer.title")}</Typography>
            {data ? (
              <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.2rem" }}>
                {data.name}
              </Typography>
            ) : (
              <Skeleton width={240} height={32} />
            )}
          </Box>
          {canCatalog && data && (
            <Tooltip title={t("catalog.drawer.edit")}>
              <IconButton aria-label={t("catalog.drawer.edit")} onClick={() => setEditing({ kind: "project", item: data })}>
                <EditOutlined />
              </IconButton>
            </Tooltip>
          )}
          <IconButton aria-label={t("common.close")} onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gap: 2.25, alignContent: "start" }}>
          {project.isError && <Alert severity="error">{project.error instanceof Error ? project.error.message : t("catalog.loadError")}</Alert>}
          {!data && !project.isError && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={64} />)}
          {data && counters && (
            <>
              <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                {counters.map(([key, value, color]) => (
                  <Box key={key} sx={{ px: 1.25, py: 1, border: 1, borderColor: "divider", borderRadius: "10px" }}>
                    <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {t(`catalog.drawer.${key}`)}
                    </Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", color: color ?? "text.primary", fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={Math.max(0, Math.min(100, data.progress))}
                  aria-label={t("catalog.card.readiness", { pct: data.progress })}
                  sx={(th) => ({ flex: 1, height: 6, borderRadius: 3, bgcolor: subtleBg(th, true), "& .MuiLinearProgress-bar": { borderRadius: 3 } })}
                />
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, whiteSpace: "nowrap" }}>{t("catalog.card.readiness", { pct: data.progress })}</Typography>
              </Box>

              <Section title={t("catalog.drawer.facts")}>
                <Box sx={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", rowGap: 0.75, columnGap: 1.5 }}>
                  {facts.map(([key, value]) => (
                    <React.Fragment key={key}>
                      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t(`catalog.drawer.${key}`)}</Typography>
                      <Typography sx={{ fontSize: "0.875rem", minWidth: 0, overflowWrap: "anywhere" }}>{value}</Typography>
                    </React.Fragment>
                  ))}
                </Box>
              </Section>

              {data.roomStats.length > 0 && (
                <Section title={t("catalog.drawer.roomStats")}>
                  <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) 0.8fr 1fr 1fr", columnGap: 1, rowGap: 0.5, fontSize: "0.8125rem" }}>
                    {(["roomsCol", "freeCol", "areaCol", "priceCol"] as const).map((key) => (
                      <Typography key={key} sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                        {t(`catalog.drawer.${key}`)}
                      </Typography>
                    ))}
                    {data.roomStats.map((stat) => (
                      <React.Fragment key={stat.rooms}>
                        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{t(`catalog.rooms.${roomsKey(stat.rooms)}`)}</Typography>
                        <Typography sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>
                          {stat.free} / {stat.total}
                        </Typography>
                        <Typography sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>
                          {stat.minArea === stat.maxArea ? stat.minArea : `${stat.minArea}–${stat.maxArea}`} м²
                        </Typography>
                        <Typography sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>{stat.minPrice > 0 ? compactMoney(stat.minPrice, t) : "—"}</Typography>
                      </React.Fragment>
                    ))}
                  </Box>
                </Section>
              )}

              <Divider />
              <Section title={t("catalog.drawer.sections")} onAdd={canCatalog ? () => setEditing({ kind: "section", item: null }) : undefined}>
                {data.sections.length === 0 && <Muted>{t("catalog.drawer.noSections")}</Muted>}
                {data.sections.map((section) => (
                  <ItemRow
                    key={section.id}
                    title={section.name}
                    meta={[t("catalog.drawer.sectionMeta", { from: section.startFloor, to: section.startFloor + section.floors - 1, progress: section.progress }), section.deadlineLabel].filter(Boolean).join(" · ")}
                    onEdit={canCatalog ? () => setEditing({ kind: "section", item: section }) : undefined}
                    onDelete={canCatalog ? () => setRemoving({ kind: "section", id: section.id, name: section.name }) : undefined}
                  />
                ))}
              </Section>

              <Section title={t("catalog.drawer.unitLayouts")} onAdd={canCatalog ? () => setEditing({ kind: "layout", item: null }) : undefined}>
                {unitLayouts.data?.length === 0 && <Muted>{t("catalog.drawer.noUnitLayouts")}</Muted>}
                {unitLayouts.data?.map((layout) => (
                  <ItemRow
                    key={layout.id}
                    title={layout.code}
                    meta={[layout.description, t("catalog.drawer.unitCount", { count: layout.unitCount })].filter(Boolean).join(" · ")}
                    onEdit={canCatalog ? () => setEditing({ kind: "layout", item: layout }) : undefined}
                    onDelete={canCatalog ? () => setRemoving({ kind: "layout", id: layout.id, name: layout.code }) : undefined}
                  />
                ))}
              </Section>

              <Section title={t("catalog.drawer.promotions")} onAdd={canManage ? () => setEditing({ kind: "promotion", item: null }) : undefined}>
                {promotions.data?.length === 0 && <Muted>{t("catalog.drawer.noPromotions")}</Muted>}
                {promotions.data?.map((promo) => (
                  <ItemRow
                    key={promo.id}
                    title={promo.title}
                    meta={[
                      promo.projectId == null && t("catalog.drawer.promotionAll"),
                      promo.validUntil && t("catalog.drawer.promotionUntil", { date: formatDateRu(promo.validUntil) }),
                      promo.maxDiscount != null && promo.maxDiscount > 0 && `≤ ${formatKGS(promo.maxDiscount)}`,
                      !promo.isActive && t("catalog.drawer.promotionInactive"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    onEdit={canManage ? () => setEditing({ kind: "promotion", item: promo }) : undefined}
                    onDelete={canManage ? () => setRemoving({ kind: "promotion", id: promo.id, name: promo.title }) : undefined}
                  />
                ))}
              </Section>
            </>
          )}
        </Box>

        {data && (
          <Box sx={{ px: 2.5, py: 1.5, display: "flex", gap: 1, borderTop: 1, borderColor: "divider" }}>
            <Button variant="contained" startIcon={<ApartmentOutlined />} onClick={() => navigate(`/realestate/chessboard?project=${data.id}`)}>
              {t("catalog.card.chessboard")}
            </Button>
            {canCatalog && (
              <Button color="error" startIcon={<DeleteOutlineOutlined />} onClick={() => setRemoving({ kind: "project", name: data.name })} sx={{ ml: "auto" }}>
                {t("catalog.drawer.delete")}
              </Button>
            )}
          </Box>
        )}
      </Drawer>

      {canCatalog && (
        <ProjectEditDrawer
          project={editing?.kind === "project" ? editing.item : null}
          onClose={() => setEditing(null)}
          onSaved={(fresh, patch) => {
            queryClient.setQueryData(realtyCatalogKeys.project(scope, fresh.id), fresh);
            const lost = unsavedFields(patch, fresh);
            setEditing(null);
            refresh();
            if (lost.length) enqueueSnackbar(t("catalog.drawer.notSaved", { fields: lost.map((key) => t(`catalog.forms.${fieldLabel[key] ?? key}`)).join(", ") }), { variant: "warning" });
            else enqueueSnackbar(t("catalog.drawer.saved"), { variant: "success" });
          }}
        />
      )}
      {canCatalog && projectId != null && (
        <>
          <SectionDrawer
            open={editing?.kind === "section"}
            projectId={projectId}
            section={editing?.kind === "section" ? editing.item : null}
            onClose={() => setEditing(null)}
            onSaved={saved}
          />
          <UnitLayoutDrawer
            open={editing?.kind === "layout"}
            projectId={projectId}
            layout={editing?.kind === "layout" ? editing.item : null}
            onClose={() => setEditing(null)}
            onSaved={saved}
          />
        </>
      )}
      {canManage && (
        <PromotionDrawer
          open={editing?.kind === "promotion"}
          promotion={editing?.kind === "promotion" ? editing.item : null}
          projects={(projects.data ?? []).map((p) => ({ id: p.id, name: p.name }))}
          defaultProjectId={projectId}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}

      <Dialog open={removing != null} onClose={remove.isPending ? undefined : () => setRemoving(null)} maxWidth={false} PaperProps={{ sx: { width: 440, maxWidth: "calc(100vw - 32px)" } }}>
        <DialogTitle>{removing?.kind === "project" ? t("catalog.drawer.deleteTitle", { name: removing.name }) : t("catalog.drawer.deleteItemTitle", { name: removing?.name ?? "" })}</DialogTitle>
        <DialogContent>
          <Typography>{removing?.kind === "project" ? t("catalog.drawer.deleteText") : t("catalog.drawer.deleteItemText")}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoving(null)} disabled={remove.isPending}>
            {t("common.cancel")}
          </Button>
          <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => removing && remove.mutate(removing)}>
            {t("catalog.drawer.deleteItem")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Ключ PATCH → подпись поля формы для предупреждения «сервер не сохранил». */
const fieldLabel: Record<string, string> = {
  defaultReservationAmount: "reservationAmount",
};

function Section({ title, onAdd, children }: { title: string; onAdd?: () => void; children: React.ReactNode }) {
  const { t } = useT("realtySales");
  return (
    <Box>
      <Box sx={{ mb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ flex: 1, fontWeight: 700, fontSize: "0.9rem" }}>{title}</Typography>
        {onAdd && (
          <Button size="small" startIcon={<AddOutlined />} onClick={onAdd}>
            {t("catalog.drawer.add")}
          </Button>
        )}
      </Box>
      {children}
    </Box>
  );
}

function ItemRow({ title, meta, onEdit, onDelete }: { title: string; meta: string; onEdit?: () => void; onDelete?: () => void }) {
  const { t } = useT("realtySales");
  return (
    <Box sx={{ py: 0.75, display: "flex", alignItems: "center", gap: 1, borderTop: 1, borderColor: "divider" }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{title}</Typography>
        {meta && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{meta}</Typography>}
      </Box>
      {onEdit && (
        <Tooltip title={t("catalog.drawer.editItem")}>
          <IconButton size="small" aria-label={`${t("catalog.drawer.editItem")}: ${title}`} onClick={onEdit}>
            <EditOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {onDelete && (
        <Tooltip title={t("catalog.drawer.deleteItem")}>
          <IconButton size="small" aria-label={`${t("catalog.drawer.deleteItem")}: ${title}`} onClick={onDelete} sx={{ color: "error.main" }}>
            <DeleteOutlineOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{children}</Typography>;
}
