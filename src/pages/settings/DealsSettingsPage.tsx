import React from "react";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import ArrowUpwardOutlined from "@mui/icons-material/ArrowUpwardOutlined";
import ArrowDownwardOutlined from "@mui/icons-material/ArrowDownwardOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SettingsLayout } from "./SettingsLayout";
import { AppButton, ConfirmDialog } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useCanChecker } from "../../hooks/useCan";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { useT } from "../../i18n/VerticalProvider";
import {
  createDealSource,
  createLostReason,
  createPipeline,
  createStage,
  deleteDealSource,
  deleteLostReason,
  deletePipeline,
  deleteStage,
  getDealSources,
  getLostReasons,
  getPipelines,
  getStageDealsCount,
  reorderStages,
  updateDealSource,
  updateLostReason,
  updatePipeline,
  updateStage,
  type DealDictionaryItem,
  type DealPipeline,
  type DealStage,
  type DealStageKind,
} from "../../api/deals";
import { dealsErrorMessage } from "../deals/meta";

/** Палитра для новых этапов — те же оттенки, что засевает бэк. */
const STAGE_COLORS = ["#3B82F6", "#8B5CF6", "#F59E0B", "#06B6D4", "#22C55E", "#EF4444", "#10B981"];

const KINDS: DealStageKind[] = ["open", "won", "lost"];

type Toast = { text: string; severity: "success" | "error" } | null;

/**
 * Настройка воронки: этапы, справочники причин потери и источников.
 *
 * Этапы не зашиты в код — их задаёт организация; зашита только типология
 * (`open`/`won`/`lost`), потому что по терминальным этапам считается конверсия.
 * Отсюда ограничения бэка, которые тут отражены в UI: второй `won`/`lost` в
 * воронке создать нельзя, удалить терминальный этап нельзя вовсе, а этап со
 * сделками удаляется только с указанием, куда их перенести.
 */
const DealsSettingsPage: React.FC = () => {
  const { t } = useT("deals");
  const theme = useTheme();
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const { can, loading: permLoading } = useCanChecker();
  const canManage = can("deals.manage");

  usePageTitle(t("settings.title"));

  const [toast, setToast] = React.useState<Toast>(null);
  const [activePipelineId, setActivePipelineId] = React.useState<number | null>(null);
  const [stageDialog, setStageDialog] = React.useState<{ stage: DealStage | null } | null>(null);
  const [pipelineDialog, setPipelineDialog] = React.useState<{ pipeline: DealPipeline | null } | null>(
    null,
  );
  const [confirmStage, setConfirmStage] = React.useState<DealStage | null>(null);
  const [confirmPipeline, setConfirmPipeline] = React.useState<DealPipeline | null>(null);
  /** Этап со сделками: бэк не даст удалить, пока не скажем, куда их перенести. */
  const [moveStage, setMoveStage] = React.useState<{ stage: DealStage; count: number } | null>(null);

  const fail = (error: unknown) =>
    setToast({ text: dealsErrorMessage(error, t("settings.saveError")), severity: "error" });
  const ok = () => setToast({ text: t("settings.saved"), severity: "success" });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.deals.all });
  };

  /* Архивные воронки и этапы тоже показываем: иначе архивацию нельзя отменить —
     запись просто исчезает из настроек. */
  const pipelinesQuery = useQuery({
    queryKey: [...djangoQueryKeys.deals.pipelines(orgId), "all"],
    queryFn: ({ signal }) => getPipelines(orgId, true, signal),
    enabled: canManage && !permLoading,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const pipelines = React.useMemo(() => pipelinesQuery.data ?? [], [pipelinesQuery.data]);

  const activePipeline = React.useMemo(
    () =>
      pipelines.find((p) => p.id === activePipelineId) ??
      pipelines.find((p) => p.isDefault) ??
      pipelines[0] ??
      null,
    [pipelines, activePipelineId],
  );

  const sourcesQuery = useQuery({
    queryKey: djangoQueryKeys.deals.sources(orgId),
    queryFn: ({ signal }) => getDealSources(orgId, signal),
    enabled: canManage && !permLoading,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const lostReasonsQuery = useQuery({
    queryKey: djangoQueryKeys.deals.lostReasons(orgId),
    queryFn: ({ signal }) => getLostReasons(orgId, signal),
    enabled: canManage && !permLoading,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const pipelineMutation = useMutation({
    mutationFn: async (action:
      | { kind: "create"; name: string }
      | { kind: "update"; id: number; payload: { name?: string; isDefault?: boolean; isActive?: boolean } }
      | { kind: "delete"; id: number }): Promise<void> => {
      if (action.kind === "create") {
        await createPipeline({ name: action.name }, orgId);
        return;
      }
      if (action.kind === "update") {
        await updatePipeline(action.id, action.payload, orgId);
        return;
      }
      await deletePipeline(action.id, orgId);
    },
    onSuccess: () => {
      ok();
      invalidate();
    },
    onError: fail,
  });

  const stageMutation = useMutation({
    mutationFn: async (action:
      | { kind: "create"; payload: { pipelineId: number; name: string; color: string; kind: DealStageKind; slaDays: number | null } }
      | { kind: "update"; id: number; payload: Partial<{ name: string; color: string; slaDays: number | null; isActive: boolean }> }
      | { kind: "delete"; id: number; moveToStageId?: number }
      | { kind: "reorder"; pipelineId: number; stageIds: number[] }): Promise<void> => {
      if (action.kind === "create") {
        await createStage(action.payload, orgId);
        return;
      }
      if (action.kind === "update") {
        await updateStage(action.id, action.payload, orgId);
        return;
      }
      if (action.kind === "delete") {
        await deleteStage(action.id, action.moveToStageId, orgId);
        return;
      }
      await reorderStages(action.pipelineId, action.stageIds, orgId);
    },
    onSuccess: () => {
      ok();
      invalidate();
    },
    onError: (error) => {
      /* Этап со сделками: вместо ошибки открываем диалог переноса — бэк уже
         сказал, сколько там карточек, второй запрос не нужен. */
      const count = getStageDealsCount(error);
      if (count != null && confirmStage) {
        setMoveStage({ stage: confirmStage, count });
        return;
      }
      fail(error);
    },
  });

  const dictMutation = useMutation({
    mutationFn: async (action:
      | { dict: "source" | "reason"; kind: "create"; name: string }
      | { dict: "source" | "reason"; kind: "update"; id: number; payload: { name?: string; isActive?: boolean } }
      | { dict: "source" | "reason"; kind: "delete"; id: number }): Promise<void> => {
      const isSource = action.dict === "source";
      if (action.kind === "create") {
        await (isSource
          ? createDealSource({ name: action.name }, orgId)
          : createLostReason({ name: action.name }, orgId));
        return;
      }
      if (action.kind === "update") {
        await (isSource
          ? updateDealSource(action.id, action.payload, orgId)
          : updateLostReason(action.id, action.payload, orgId));
        return;
      }
      await (isSource ? deleteDealSource(action.id, orgId) : deleteLostReason(action.id, orgId));
    },
    onSuccess: () => {
      ok();
      invalidate();
    },
    onError: fail,
  });

  /**
   * Порядок этапов уходит целиком: бэк отклоняет неполный список (400 с
   * перечислением недостающих id), чтобы не возникло промежуточного состояния
   * с дублями `order`.
   */
  const moveStageBy = (stage: DealStage, delta: -1 | 1) => {
    if (!activePipeline) return;
    const ids = [...activePipeline.stages].sort((a, b) => a.order - b.order).map((s) => s.id);
    const from = ids.indexOf(stage.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    stageMutation.mutate({ kind: "reorder", pipelineId: activePipeline.id, stageIds: ids });
  };

  const stages = React.useMemo(
    () => [...(activePipeline?.stages ?? [])].sort((a, b) => a.order - b.order),
    [activePipeline],
  );

  /** Куда можно перенести сделки при удалении этапа — любой другой этап воронки. */
  const moveTargets = stages.filter((s) => s.id !== moveStage?.stage.id);

  if (permLoading) return null;

  return (
    <SettingsLayout>
      {!canManage ? (
        <Alert severity="info" variant="outlined">
          {t("settings.needsOrg")}
        </Alert>
      ) : (
        <Stack gap={3}>
          <Box>
            <Typography variant="h6">{t("settings.title")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("settings.description")}
            </Typography>
          </Box>

          {/* Воронки */}
          <Stack gap={1}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle2">{t("settings.pipelines")}</Typography>
              <AppButton
                size="small"
                startIcon={<AddOutlined />}
                onClick={() => setPipelineDialog({ pipeline: null })}
              >
                {t("settings.pipelineAdd")}
              </AppButton>
            </Stack>

            <Stack direction="row" gap={1} flexWrap="wrap">
              {pipelines.map((p) => (
                <Chip
                  key={p.id}
                  label={p.isDefault ? `${p.name} · ${t("settings.pipelineDefault")}` : p.name}
                  variant={activePipeline?.id === p.id ? "filled" : "outlined"}
                  color={activePipeline?.id === p.id ? "primary" : "default"}
                  onClick={() => setActivePipelineId(p.id)}
                  // Архивная воронка остаётся видимой, но приглушённой.
                  sx={{ opacity: p.isActive ? 1 : 0.5 }}
                />
              ))}
              {pipelines.length === 0 && !pipelinesQuery.isLoading ? (
                <Typography variant="body2" color="text.disabled">
                  {t("settings.empty")}
                </Typography>
              ) : null}
            </Stack>

            {activePipeline ? (
              <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap" sx={{ mt: 0.5 }}>
                <TextField
                  size="small"
                  label={t("settings.pipelineName")}
                  defaultValue={activePipeline.name}
                  key={`name-${activePipeline.id}`}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (!name || name === activePipeline.name) return;
                    pipelineMutation.mutate({ kind: "update", id: activePipeline.id, payload: { name } });
                  }}
                  sx={{ minWidth: 220 }}
                />
                <Stack direction="row" alignItems="center" gap={0.5}>
                  <Switch
                    size="small"
                    checked={activePipeline.isDefault}
                    disabled={activePipeline.isDefault}
                    onChange={() =>
                      pipelineMutation.mutate({
                        kind: "update",
                        id: activePipeline.id,
                        payload: { isDefault: true },
                      })
                    }
                  />
                  <Tooltip title={t("settings.pipelineDefaultHint")}>
                    <Typography variant="body2">{t("settings.pipelineDefault")}</Typography>
                  </Tooltip>
                </Stack>
                <Stack direction="row" alignItems="center" gap={0.5}>
                  <Switch
                    size="small"
                    checked={activePipeline.isActive}
                    onChange={(e) =>
                      pipelineMutation.mutate({
                        kind: "update",
                        id: activePipeline.id,
                        payload: { isActive: e.target.checked },
                      })
                    }
                  />
                  <Typography variant="body2">
                    {activePipeline.isActive ? t("settings.stageActive") : t("settings.pipelineArchive")}
                  </Typography>
                </Stack>
                <Box sx={{ flex: 1 }} />
                <AppButton
                  size="small"
                  variant="text"
                  color="error"
                  startIcon={<DeleteOutlined />}
                  onClick={() => setConfirmPipeline(activePipeline)}
                >
                  {t("settings.pipelineDelete")}
                </AppButton>
              </Stack>
            ) : null}
          </Stack>

          <Divider />

          {/* Этапы выбранной воронки */}
          <Stack gap={1}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle2">{t("settings.stages")}</Typography>
              <AppButton
                size="small"
                startIcon={<AddOutlined />}
                disabled={!activePipeline}
                onClick={() => setStageDialog({ stage: null })}
              >
                {t("settings.stageAdd")}
              </AppButton>
            </Stack>

            <Typography variant="caption" color="text.secondary">
              {t("settings.stageTerminalHint")}
            </Typography>

            <Stack gap={0.5}>
              {stages.map((stage, i) => (
                <Stack
                  key={stage.id}
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={{
                    px: 1.25,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: subtleBg(theme),
                    opacity: stage.isActive ? 1 : 0.55,
                  }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      bgcolor: stage.color,
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                    noWrap
                    onClick={() => setStageDialog({ stage })}
                  >
                    {stage.name}
                  </Typography>

                  {stage.kind !== "open" ? (
                    <Chip size="small" variant="outlined" label={t(`kind.${stage.kind}`)} />
                  ) : null}

                  {stage.slaDays != null ? (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {t("settings.stageSla")}: {stage.slaDays}
                    </Typography>
                  ) : null}

                  <Tooltip title={t("settings.stageUp")}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={i === 0 || stageMutation.isPending}
                        onClick={() => moveStageBy(stage, -1)}
                      >
                        <ArrowUpwardOutlined fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={t("settings.stageDown")}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={i === stages.length - 1 || stageMutation.isPending}
                        onClick={() => moveStageBy(stage, 1)}
                      >
                        <ArrowDownwardOutlined fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>

                  {/* Терминальные этапы бэк удалять не даёт — кнопку прячем,
                      чтобы не предлагать заведомо отклонённое действие. */}
                  {stage.kind === "open" ? (
                    <Tooltip title={t("settings.stageDelete")}>
                      <IconButton size="small" onClick={() => setConfirmStage(stage)}>
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Box sx={{ width: 34 }} />
                  )}
                </Stack>
              ))}
              {stages.length === 0 ? (
                <Typography variant="body2" color="text.disabled">
                  {t("settings.empty")}
                </Typography>
              ) : null}
            </Stack>
          </Stack>

          <Divider />

          <DictionarySection
            title={t("settings.sources")}
            addLabel={t("settings.sourceAdd")}
            items={sourcesQuery.data ?? []}
            busy={dictMutation.isPending}
            onCreate={(name) => dictMutation.mutate({ dict: "source", kind: "create", name })}
            onRename={(id, name) =>
              dictMutation.mutate({ dict: "source", kind: "update", id, payload: { name } })
            }
            onToggle={(id, isActive) =>
              dictMutation.mutate({ dict: "source", kind: "update", id, payload: { isActive } })
            }
            onDelete={(id) => dictMutation.mutate({ dict: "source", kind: "delete", id })}
          />

          <Divider />

          <DictionarySection
            title={t("settings.lostReasons")}
            addLabel={t("settings.lostReasonAdd")}
            items={lostReasonsQuery.data ?? []}
            busy={dictMutation.isPending}
            onCreate={(name) => dictMutation.mutate({ dict: "reason", kind: "create", name })}
            onRename={(id, name) =>
              dictMutation.mutate({ dict: "reason", kind: "update", id, payload: { name } })
            }
            onToggle={(id, isActive) =>
              dictMutation.mutate({ dict: "reason", kind: "update", id, payload: { isActive } })
            }
            onDelete={(id) => dictMutation.mutate({ dict: "reason", kind: "delete", id })}
          />
        </Stack>
      )}

      <StageDialog
        open={stageDialog != null}
        stage={stageDialog?.stage ?? null}
        // Второй won/lost бэк не примет — предлагаем только свободные типы.
        availableKinds={KINDS.filter(
          (k) => k === "open" || !stages.some((s) => s.kind === k && s.id !== stageDialog?.stage?.id),
        )}
        busy={stageMutation.isPending}
        onClose={() => setStageDialog(null)}
        onSubmit={(payload) => {
          if (stageDialog?.stage) {
            stageMutation.mutate({
              kind: "update",
              id: stageDialog.stage.id,
              payload: { name: payload.name, color: payload.color, slaDays: payload.slaDays },
            });
          } else if (activePipeline) {
            stageMutation.mutate({
              kind: "create",
              payload: { ...payload, pipelineId: activePipeline.id },
            });
          }
          setStageDialog(null);
        }}
      />

      <PipelineDialog
        open={pipelineDialog != null}
        busy={pipelineMutation.isPending}
        onClose={() => setPipelineDialog(null)}
        onSubmit={(name) => {
          pipelineMutation.mutate({ kind: "create", name });
          setPipelineDialog(null);
        }}
      />

      {/* Этап со сделками: спрашиваем, куда их перенести — иначе бэк откажет. */}
      <Dialog open={moveStage != null} onClose={() => setMoveStage(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 1 }}>{t("settings.stageMoveTitle")}</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2">
              {t("settings.stageMoveBody", {
                name: moveStage?.stage.name ?? "",
                count: moveStage?.count ?? 0,
              })}
            </Typography>
            <TextField
              select
              size="small"
              label={t("settings.stageMoveTarget")}
              defaultValue=""
              onChange={(e) => {
                const target = Number(e.target.value);
                if (!moveStage || !target) return;
                stageMutation.mutate({
                  kind: "delete",
                  id: moveStage.stage.id,
                  moveToStageId: target,
                });
                setMoveStage(null);
                setConfirmStage(null);
              }}
            >
              {moveTargets.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <AppButton variant="text" onClick={() => setMoveStage(null)}>
            Отмена
          </AppButton>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmStage != null && moveStage == null}
        title={t("settings.stageDelete")}
        message={t("settings.stageDeleteConfirm", { name: confirmStage?.name ?? "" })}
        confirmText={t("settings.stageDelete")}
        loading={stageMutation.isPending}
        onConfirm={() => {
          if (confirmStage) stageMutation.mutate({ kind: "delete", id: confirmStage.id });
        }}
        onClose={() => setConfirmStage(null)}
      />

      <ConfirmDialog
        open={confirmPipeline != null}
        title={t("settings.pipelineDelete")}
        message={t("settings.pipelineDeleteConfirm", { name: confirmPipeline?.name ?? "" })}
        confirmText={t("settings.pipelineDelete")}
        loading={pipelineMutation.isPending}
        onConfirm={() => {
          if (confirmPipeline) pipelineMutation.mutate({ kind: "delete", id: confirmPipeline.id });
          setConfirmPipeline(null);
        }}
        onClose={() => setConfirmPipeline(null)}
      />

      <Snackbar
        open={toast != null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast?.severity ?? "info"} variant="filled" onClose={() => setToast(null)}>
          {toast?.text}
        </Alert>
      </Snackbar>
    </SettingsLayout>
  );
};

type StagePayload = { name: string; color: string; kind: DealStageKind; slaDays: number | null };

const StageDialog: React.FC<{
  open: boolean;
  stage: DealStage | null;
  availableKinds: DealStageKind[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: StagePayload) => void;
}> = ({ open, stage, availableKinds, busy, onClose, onSubmit }) => {
  const { t } = useT("deals");
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState(STAGE_COLORS[0]);
  const [kind, setKind] = React.useState<DealStageKind>("open");
  const [sla, setSla] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setName(stage?.name ?? "");
    setColor(stage?.color ?? STAGE_COLORS[0]);
    setKind(stage?.kind ?? "open");
    setSla(stage?.slaDays != null ? String(stage.slaDays) : "");
  }, [open, stage]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsed = sla.trim() === "" ? null : Number(sla);
    onSubmit({
      name: trimmed,
      color,
      kind,
      slaDays: parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null,
    });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>
        {stage ? t("settings.stageName") : t("settings.stageAdd")}
      </DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 0.5 }}>
          <TextField
            size="small"
            label={t("settings.stageName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            fullWidth
          />

          <Stack direction="row" gap={0.75} flexWrap="wrap">
            {STAGE_COLORS.map((c) => (
              <Box
                key={c}
                onClick={() => setColor(c)}
                role="button"
                aria-label={`${t("settings.stageColor")} ${c}`}
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  bgcolor: c,
                  cursor: "pointer",
                  outline: color === c ? "2px solid" : "none",
                  outlineColor: "text.primary",
                  outlineOffset: 2,
                }}
              />
            ))}
          </Stack>

          {/* Тип этапа меняется только при создании: у существующего его смена
              переопределила бы, по чему считается конверсия. */}
          <TextField
            select
            size="small"
            label={t("settings.stageKind")}
            value={kind}
            onChange={(e) => setKind(e.target.value as DealStageKind)}
            disabled={stage != null}
            fullWidth
          >
            {availableKinds.map((k) => (
              <MenuItem key={k} value={k}>
                {t(`kind.${k}`)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            label={t("settings.stageSla")}
            value={sla}
            onChange={(e) => setSla(e.target.value)}
            helperText={t("settings.stageSlaHint")}
            inputProps={{ inputMode: "numeric" }}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={busy}>
          Отмена
        </AppButton>
        <AppButton onClick={submit} loading={busy} disabled={!name.trim()}>
          Сохранить
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

const PipelineDialog: React.FC<{
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}> = ({ open, busy, onClose, onSubmit }) => {
  const { t } = useT("deals");
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (open) setName("");
  }, [open]);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>{t("settings.pipelineAdd")}</DialogTitle>
      <DialogContent>
        <TextField
          size="small"
          label={t("settings.pipelineName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          fullWidth
          sx={{ mt: 0.5 }}
        />
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={busy}>
          Отмена
        </AppButton>
        <AppButton onClick={() => onSubmit(name.trim())} loading={busy} disabled={!name.trim()}>
          Сохранить
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

/** Справочник организации: переименование по месту, архивация, удаление. */
const DictionarySection: React.FC<{
  title: string;
  addLabel: string;
  items: DealDictionaryItem[];
  busy: boolean;
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onToggle: (id: number, isActive: boolean) => void;
  onDelete: (id: number) => void;
}> = ({ title, addLabel, items, busy, onCreate, onRename, onToggle, onDelete }) => {
  const { t } = useT("deals");
  const theme = useTheme();
  const [adding, setAdding] = React.useState("");

  return (
    <Stack gap={1}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">{title}</Typography>
      </Stack>

      <Stack gap={0.5}>
        {items.map((item) => (
          <Stack
            key={item.id}
            direction="row"
            alignItems="center"
            gap={1}
            sx={{
              px: 1.25,
              py: 0.75,
              borderRadius: 2,
              bgcolor: subtleBg(theme),
              opacity: item.isActive ? 1 : 0.55,
            }}
          >
            <TextField
              variant="standard"
              defaultValue={item.name}
              key={`${item.id}-${item.name}`}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== item.name) onRename(item.id, name);
              }}
              sx={{ flex: 1, minWidth: 0 }}
              InputProps={{ disableUnderline: true }}
            />
            <Switch
              size="small"
              checked={item.isActive}
              onChange={(e) => onToggle(item.id, e.target.checked)}
            />
            {/* Удаление отклоняется бэком, если значение уже используется —
                тогда остаётся архивация переключателем слева. */}
            <Tooltip title={t("settings.dictInUse")}>
              <IconButton size="small" onClick={() => onDelete(item.id)} disabled={busy}>
                <DeleteOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ))}
      </Stack>

      <Stack direction="row" gap={1} alignItems="center">
        <TextField
          size="small"
          placeholder={addLabel}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && adding.trim()) {
              onCreate(adding.trim());
              setAdding("");
            }
          }}
          sx={{ minWidth: 240 }}
        />
        <AppButton
          size="small"
          startIcon={<AddOutlined />}
          disabled={!adding.trim() || busy}
          onClick={() => {
            onCreate(adding.trim());
            setAdding("");
          }}
        >
          {addLabel}
        </AppButton>
      </Stack>
    </Stack>
  );
};

export default DealsSettingsPage;
