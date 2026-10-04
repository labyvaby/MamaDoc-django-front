import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Skeleton,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ArrowDownwardOutlined from "@mui/icons-material/ArrowDownwardOutlined";
import ArrowUpwardOutlined from "@mui/icons-material/ArrowUpwardOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";

import { ApiError, isModuleDisabled } from "../../api/client";
import {
  edoKeys,
  getEdoApprovers,
  getEdoTemplates,
  resetEdoTemplateRoute,
  setEdoTemplateRoute,
  updateEdoApprover,
  updateEdoTemplate,
  type EdoApprover,
  type EdoTemplate,
} from "../../api/edo";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { useCanChecker } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";

const cardSx = { border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" } as const;

/**
 * «Шаблоны»: типы документов ЭДО и маршруты согласования (роли по порядку),
 * плюс кто стоит за каждой ролью. Смотреть — edo.view, менять —
 * edo.templates.manage.
 */
export default function EdoTemplatesPage() {
  const { t } = useT("edo");
  usePageTitle(t("page.templates"));
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { can } = useCanChecker();
  const canEdit = can("edo.templates.manage");
  const [showInactive, setShowInactive] = React.useState(false);
  const [editing, setEditing] = React.useState<EdoTemplate | null>(null);
  const enabled = scope.orgReady !== false;

  const templates = useQuery({
    queryKey: edoKeys.templates(scope, showInactive),
    queryFn: ({ signal }) => getEdoTemplates(scope, showInactive, signal),
    enabled,
  });
  const approvers = useQuery({ queryKey: edoKeys.approvers(scope), queryFn: ({ signal }) => getEdoApprovers(scope, signal), enabled });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: edoKeys.all });
  const failed = (error: unknown) => enqueueSnackbar(error instanceof Error ? error.message : t("action.failed"), { variant: "error" });
  const toggle = useMutation({
    mutationFn: (tpl: EdoTemplate) => updateEdoTemplate(tpl.id, { isActive: !tpl.isActive }, scope),
    onSuccess: (_, tpl) => {
      enqueueSnackbar(t("templates.toggled", { name: tpl.name, state: tpl.isActive ? t("templates.disabled") : t("templates.enabled") }), { variant: "success" });
      refresh();
    },
    onError: failed,
  });
  const reset = useMutation({
    mutationFn: (tpl: EdoTemplate) => resetEdoTemplateRoute(tpl.id, scope),
    onSuccess: (_, tpl) => {
      enqueueSnackbar(t("templates.resetDone", { name: tpl.name }), { variant: "success" });
      refresh();
    },
    onError: failed,
  });

  const error = templates.error ?? approvers.error;
  if (error) {
    if (isModuleDisabled(error)) return <AccessDenied title={t("page.moduleOff")} description={t("page.moduleOffHint")} showBack={false} />;
    if (error instanceof ApiError && error.status === 403) return <AccessDenied />;
    return <Alert severity="error">{error instanceof Error ? error.message : t("page.loadError")}</Alert>;
  }

  const roleName = (role: string) => {
    const approver = approvers.data?.find((a) => a.role === role);
    return approver ? approver.position || approver.name || role : role;
  };

  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <Box sx={{ mb: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Typography sx={{ flex: 1, fontSize: "0.875rem", color: "text.secondary" }}>{t("page.templatesSubtitle")}</Typography>
        <FormControlLabel control={<Switch size="small" checked={showInactive} onChange={(_, on) => setShowInactive(on)} />} label={t("templates.showInactive")} />
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 360px" }, alignItems: "start" }}>
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          {!templates.data ? (
            <Skeleton variant="rounded" height={320} />
          ) : templates.data.length === 0 ? (
            <Typography sx={{ p: 3, color: "text.secondary" }}>{t("templates.empty")}</Typography>
          ) : (
            templates.data.map((tpl) => (
              <Box key={tpl.id} sx={{ px: 2, py: 1.5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, borderBottom: 1, borderColor: "divider", opacity: tpl.isActive ? 1 : 0.6 }}>
                <Box sx={(th) => ({ px: 1, py: 0.5, borderRadius: "8px", fontWeight: 700, fontSize: "0.75rem", bgcolor: subtleBg(th, true) })}>{tpl.short}</Box>
                <Box sx={{ minWidth: 200, flex: "1 1 220px" }}>
                  <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>{tpl.name}</Typography>
                  <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                    {[tpl.groupLabel, tpl.requiresEsign ? t("templates.esign") : null, t("templates.colUsage") + ": " + tpl.usageCount, tpl.routeCustomized ? t("templates.customized") : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                </Box>
                <Box sx={{ flex: "2 1 260px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5, fontSize: "0.75rem" }}>
                  {(tpl.routeSteps.length ? tpl.routeSteps.map((s) => s.position || roleName(s.role)) : tpl.route.map(roleName)).map((label, i, all) => (
                    <React.Fragment key={`${label}-${i}`}>
                      <Box component="span" sx={(th) => ({ px: 0.75, py: 0.25, borderRadius: "6px", bgcolor: subtleBg(th) })}>
                        {label}
                      </Box>
                      {i < all.length - 1 && (
                        <Box component="span" aria-hidden sx={{ color: "text.disabled" }}>
                          →
                        </Box>
                      )}
                    </React.Fragment>
                  ))}
                </Box>
                {canEdit && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Tooltip title={t("templates.editRoute")}>
                      <IconButton size="small" aria-label={t("templates.editRoute")} onClick={() => setEditing(tpl)}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {tpl.routeCustomized && (
                      <Tooltip title={t("templates.resetRoute")}>
                        <IconButton size="small" aria-label={t("templates.resetRoute")} disabled={reset.isPending} onClick={() => reset.mutate(tpl)}>
                          <RestartAltOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Switch size="small" checked={tpl.isActive} disabled={toggle.isPending} onChange={() => toggle.mutate(tpl)} inputProps={{ "aria-label": t("templates.colActive") }} />
                  </Box>
                )}
              </Box>
            ))
          )}
        </Box>
        <ApproversCard approvers={approvers.data} canEdit={canEdit} />
      </Box>

      {editing && approvers.data && <RouteDialog template={editing} approvers={approvers.data} onClose={() => setEditing(null)} />}
    </Box>
  );
}

function ApproversCard({ approvers, canEdit }: { approvers: EdoApprover[] | undefined; canEdit: boolean }) {
  const { t } = useT("edo");
  return (
    <Box sx={{ ...cardSx, p: 2 }}>
      <Typography component="h2" sx={{ fontWeight: 700 }}>
        {t("templates.approvers")}
      </Typography>
      <Typography sx={{ mb: 1.5, fontSize: "0.8125rem", color: "text.secondary" }}>{t("templates.approversHint")}</Typography>
      {!approvers ? <Skeleton variant="rounded" height={160} /> : approvers.map((approver) => <ApproverRow key={approver.role} approver={approver} canEdit={canEdit} />)}
    </Box>
  );
}

function ApproverRow({ approver, canEdit }: { approver: EdoApprover; canEdit: boolean }) {
  const { t } = useT("edo");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [name, setName] = React.useState(approver.name);
  const [position, setPosition] = React.useState(approver.position);
  React.useEffect(() => {
    setName(approver.name);
    setPosition(approver.position);
  }, [approver.name, approver.position]);
  const save = useMutation({
    mutationFn: () => updateEdoApprover(approver.role, { name: name.trim(), position: position.trim() }, scope),
    onSuccess: () => {
      enqueueSnackbar(t("templates.approverSaved"), { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: edoKeys.all });
    },
    onError: (error) => enqueueSnackbar(error instanceof Error ? error.message : t("action.failed"), { variant: "error" }),
  });
  const dirty = name.trim() !== approver.name || position.trim() !== approver.position;
  return (
    <Box sx={{ py: 1, borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}>
      <Typography sx={{ fontSize: "0.7rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>{approver.role}</Typography>
      {canEdit ? (
        <Box sx={{ mt: 0.75, display: "grid", gap: 1 }}>
          <TextField size="small" label={t("templates.approverPosition")} value={position} onChange={(e) => setPosition(e.target.value)} />
          <TextField size="small" label={t("templates.approverName")} value={name} onChange={(e) => setName(e.target.value)} />
          {dirty && (
            <Button size="small" variant="contained" disabled={save.isPending} onClick={() => save.mutate()} sx={{ justifySelf: "end" }}>
              {t("templates.save")}
            </Button>
          )}
        </Box>
      ) : (
        <Typography sx={{ fontSize: "0.8125rem" }}>
          <b>{approver.position}</b>
          {approver.name ? ` · ${approver.name}` : ""}
        </Typography>
      )}
    </Box>
  );
}

/** Маршрут шаблона — список ролей по порядку: добавить, убрать, поднять, опустить. */
function RouteDialog({ template, approvers, onClose }: { template: EdoTemplate; approvers: EdoApprover[]; onClose: () => void }) {
  const { t } = useT("edo");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [route, setRoute] = React.useState<string[]>(template.route);
  const save = useMutation({
    mutationFn: () => setEdoTemplateRoute(template.id, route, scope),
    onSuccess: () => {
      enqueueSnackbar(t("templates.routeSaved"), { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: edoKeys.all });
      onClose();
    },
  });
  const move = (index: number, delta: number) =>
    setRoute((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  const label = (role: string) => {
    const approver = approvers.find((a) => a.role === role);
    return approver ? `${approver.position || role}${approver.name ? ` · ${approver.name}` : ""}` : role;
  };
  return (
    <Dialog open onClose={save.isPending ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 520 } }}>
      <DialogTitle>{t("templates.routeTitle", { name: template.name })}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.25, pt: "8px !important" }}>
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("templates.routeHint")}</Typography>
        {route.map((role, index) => (
          <Box key={`${role}-${index}`} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ width: 20, fontWeight: 700, color: "text.secondary" }}>{index + 1}</Typography>
            <TextField select size="small" value={role} onChange={(e) => setRoute((prev) => prev.map((r, i) => (i === index ? e.target.value : r)))} sx={{ flex: 1 }}>
              {approvers.map((approver) => (
                <MenuItem key={approver.role} value={approver.role}>
                  {label(approver.role)}
                </MenuItem>
              ))}
            </TextField>
            <IconButton size="small" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("templates.moveUp")}>
              <ArrowUpwardOutlined fontSize="small" />
            </IconButton>
            <IconButton size="small" disabled={index === route.length - 1} onClick={() => move(index, 1)} aria-label={t("templates.moveDown")}>
              <ArrowDownwardOutlined fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => setRoute((prev) => prev.filter((_, i) => i !== index))} aria-label={t("templates.removeStep")}>
              <DeleteOutlineOutlined fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Button startIcon={<AddOutlined />} onClick={() => setRoute((prev) => [...prev, approvers[0]?.role ?? ""])} disabled={!approvers.length} sx={{ justifySelf: "start" }}>
          {t("templates.addStep")}
        </Button>
        {save.isError && <Alert severity="error">{save.error instanceof Error ? save.error.message : ""}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          {t("dialog.cancel")}
        </Button>
        <Button variant="contained" disabled={save.isPending} onClick={() => save.mutate()}>
          {t("templates.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
