import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  Step,
  StepButton,
  Stepper,
  Typography,
  useMediaQuery,
  type Theme,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ProjectCreateError, createProjectWithUnits, realEstateKeys } from "../../../../api/realestate";
import { useApiOrgId } from "../../../../hooks/useApiOrgId";
import { usePermissions } from "../../../../hooks/usePermissions";
import { useT } from "../../../../i18n/VerticalProvider";
import { formatDateRu } from "../../../../utility/format";
import { clearFormDraft, readFormDraft, writeFormDraft } from "../../../../utility/formDraft";
import { autoBoardView, buildBoard, priceScale, type BoardPaint } from "../../model/board";
import { formatArea, formatMoney, formatRooms } from "../../model/units";
import {
  WIZARD_STEPS,
  bulkUnitsBody,
  firstInvalidStep,
  initialWizardState,
  planUnits,
  previewBoardData,
  projectBody,
  validateStep,
  wizardTotals,
  type PlannedUnit,
  type WizardState,
  type WizardStep,
} from "../../model/wizard";
import { Board } from "../Board";
import { Pill } from "../Filters";
import { FloorList } from "../FloorList";
import { FloorsStep, PricesStep, ProjectStep, SectionsStep } from "./WizardSteps";

interface Draft {
  state: WizardState;
  step: WizardStep;
  savedAt: number;
}

/** Черновик живёт сутки; ключ — по организации, у суперпользователя их несколько. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const draftKey = (organizationId: number | undefined) => `mamadoc:realestate:new-project:${organizationId ?? "session"}`;

const noop = () => {};
const EMPTY_IDS: ReadonlySet<string> = new Set();
const allVisible = () => true;

/**
 * Мастер «Новый ЖК» — Drawer справа (конвенция форм создания). Логика —
 * `model/wizard.ts`, здесь только шаги, черновик и запрос.
 */
export function NewProjectWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string, info: { name: string; units: number }) => void;
}) {
  const { t } = useT("realestate");
  const organizationId = useApiOrgId();
  const { activeBranch } = usePermissions();
  const queryClient = useQueryClient();
  const isPhone = useMediaQuery((theme: Theme) => theme.breakpoints.down("md"));

  const [state, setState] = React.useState<WizardState>(() => initialWizardState(t("wizard.sections.defaultName", { n: 1 })));
  const [step, setStep] = React.useState<WizardStep>("project");
  const [restoredAt, setRestoredAt] = React.useState<number | null>(null);
  /** Шаги, с которых пытались уйти, — ошибки показываем только после попытки. */
  const [attempted, setAttempted] = React.useState<ReadonlySet<WizardStep>>(new Set());
  const [paint, setPaint] = React.useState<BoardPaint>("status");

  // Черновик: поднимаем при открытии, пишем на каждое изменение.
  React.useEffect(() => {
    if (!open) return;
    const draft = readFormDraft<Draft>(draftKey(organizationId), DRAFT_TTL_MS);
    if (draft) {
      setState(draft.state);
      setStep(WIZARD_STEPS.includes(draft.step) ? draft.step : "project");
      setRestoredAt(draft.savedAt);
    }
    // Только при открытии: дальше черновик — отражение состояния, а не его источник.
  }, [open, organizationId]);

  const dirty = React.useRef(false);
  const change = (next: WizardState) => {
    dirty.current = true;
    setState(next);
  };
  React.useEffect(() => {
    if (open && dirty.current) writeFormDraft(draftKey(organizationId), { state, step });
  }, [open, organizationId, state, step]);

  const reset = () => {
    clearFormDraft(draftKey(organizationId));
    dirty.current = false;
    setState(initialWizardState(t("wizard.sections.defaultName", { n: 1 })));
    setStep("project");
    setAttempted(new Set());
    setRestoredAt(null);
    mutation.reset();
  };

  const planned = React.useMemo(() => planUnits(state), [state]);

  const mutation = useMutation({
    mutationFn: () => createProjectWithUnits(projectBody(state), (ids) => bulkUnitsBody(planned, ids), organizationId),
    onSuccess: async ({ projectId, created }) => {
      await queryClient.invalidateQueries({ queryKey: realEstateKeys.projects(organizationId) });
      const info = { name: state.name.trim(), units: created };
      reset();
      onCreated(projectId, info);
    },
  });

  const index = WIZARD_STEPS.indexOf(step);
  const issues = validateStep(state, step);
  const showIssues = attempted.has(step) && issues.length > 0;

  const goNext = () => {
    setAttempted((prev) => new Set(prev).add(step));
    if (issues.length) return;
    const next = WIZARD_STEPS[index + 1];
    if (next) setStep(next);
  };
  const goTo = (target: WizardStep) => {
    const targetIndex = WIZARD_STEPS.indexOf(target);
    if (targetIndex <= index) return setStep(target);
    // Вперёд — только через проверенные шаги: остановимся на первом с ошибкой.
    const blocker = WIZARD_STEPS.slice(0, targetIndex).find((s) => validateStep(state, s).length > 0);
    if (blocker) {
      setAttempted((prev) => new Set(prev).add(blocker));
      setStep(blocker);
    } else setStep(target);
  };
  const create = () => {
    const invalid = firstInvalidStep(state);
    if (invalid) {
      setAttempted((prev) => new Set(prev).add(invalid));
      setStep(invalid);
      return;
    }
    mutation.mutate();
  };

  const busy = mutation.isPending;
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={close}
      PaperProps={{ sx: { width: { xs: "100vw", md: 920 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: { xs: 2, md: 3 }, pt: 2, pb: 1 }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
          {t("wizard.title")}
        </Typography>
        {isPhone && (
          <Typography variant="body2" color="text.secondary">
            {t("wizard.stepOf", { current: index + 1, total: WIZARD_STEPS.length })} · {t(`wizard.steps.${step}`)}
          </Typography>
        )}
        <IconButton aria-label={t("wizard.close")} onClick={close} disabled={busy} sx={{ ml: "auto" }}>
          <CloseOutlined />
        </IconButton>
      </Box>

      {!isPhone && (
        <Stepper nonLinear activeStep={index} sx={{ px: 3, pb: 2 }}>
          {WIZARD_STEPS.map((s) => (
            <Step key={s} completed={WIZARD_STEPS.indexOf(s) < index}>
              <StepButton onClick={() => goTo(s)} disabled={busy}>
                {t(`wizard.steps.${s}`)}
              </StepButton>
            </Step>
          ))}
        </Stepper>
      )}

      <Box sx={{ flex: 1, overflowY: "auto", px: { xs: 2, md: 3 }, py: 1 }}>
        {restoredAt && (
          <Alert
            severity="info"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={reset}>
                {t("wizard.startOver")}
              </Button>
            }
          >
            {t("wizard.draftRestored", { date: formatDateRu(new Date(restoredAt)) })}
          </Alert>
        )}

        {step === "project" && <ProjectStep state={state} onChange={change} branchName={activeBranch?.name ?? null} />}
        {step === "sections" && <SectionsStep state={state} onChange={change} />}
        {step === "floors" && <FloorsStep state={state} onChange={change} />}
        {step === "prices" && <PricesStep state={state} onChange={change} />}
        {step === "review" && <ReviewStep state={state} planned={planned} paint={paint} onPaint={setPaint} isPhone={isPhone} />}

        {showIssues && (
          <Alert severity="error" sx={{ mt: 2 }}>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {issues.map((issue) => (
                <li key={`${issue.code}|${JSON.stringify(issue.params ?? {})}`}>{t(`wizard.errors.${issue.code}`, issue.params)}</li>
              ))}
            </Box>
          </Alert>
        )}
        {mutation.isError && <CreateErrorAlert error={mutation.error} planned={planned} />}
      </Box>

      <Box sx={{ display: "flex", gap: 1, px: { xs: 2, md: 3 }, py: 1.5, borderTop: 1, borderColor: "divider" }}>
        {index > 0 && (
          <Button onClick={() => setStep(WIZARD_STEPS[index - 1]!)} disabled={busy}>
            {t("wizard.back")}
          </Button>
        )}
        <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1.5 }}>
          {busy && (
            <Typography variant="body2" color="text.secondary" role="status">
              {t("wizard.creating")}
            </Typography>
          )}
          {step === "review" ? (
            <Button variant="contained" onClick={create} disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {t("wizard.create")}
            </Button>
          ) : (
            <Button variant="contained" onClick={goNext}>
              {t("wizard.next")}
            </Button>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}

function ReviewStep({
  state,
  planned,
  paint,
  onPaint,
  isPhone,
}: {
  state: WizardState;
  planned: PlannedUnit[];
  paint: BoardPaint;
  onPaint: (paint: BoardPaint) => void;
  isPhone: boolean;
}) {
  const { t } = useT("realestate");
  const totals = React.useMemo(() => wizardTotals(planned), [planned]);
  const preview = React.useMemo(() => previewBoardData(state, planned), [state, planned]);
  const board = React.useMemo(() => buildBoard(preview.project, preview.units), [preview]);
  const scale = React.useMemo(() => priceScale(preview.units), [preview]);

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 2, md: 4 } }}>
        <Fact label={t("wizard.review.units")} value={String(totals.units)} />
        <Fact label={t("wizard.review.area")} value={formatArea(totals.area)} />
        <Fact label={t("wizard.review.total")} value={formatMoney(totals.price)} />
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 1.5 }}>
          {totals.byRooms.map(({ rooms, count }) => (
            <Typography key={rooms} variant="body2" color="text.secondary">
              {formatRooms(rooms)} — {count}
            </Typography>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Typography sx={{ fontWeight: 600, mr: "auto" }}>{t("wizard.review.preview")}</Typography>
        <Pill active={paint === "status"} onClick={() => onPaint("status")}>
          {t("wizard.review.paintStatus")}
        </Pill>
        <Pill active={paint === "price"} onClick={() => onPaint("price")}>
          {t("wizard.review.paintPrice")}
        </Pill>
      </Box>

      {isPhone ? (
        <FloorList project={preview.project} board={board} isVisible={allVisible} paint={paint} scale={scale} onOpen={noop} />
      ) : (
        <Board
          project={preview.project}
          board={board}
          view={autoBoardView(board)}
          paint={paint}
          scale={scale}
          isVisible={allVisible}
          selectedIds={EMPTY_IDS}
          highlightedIds={EMPTY_IDS}
          selectMode={false}
          onOpen={noop}
          onToggleSelect={noop}
          onPreview={noop}
        />
      )}
    </Box>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
    </Box>
  );
}

/** Ошибка создания: строки bulk переводим в «кв. №, корпус, этаж» — индекс в запросе людям ничего не скажет. */
function CreateErrorAlert({ error, planned }: { error: unknown; planned: PlannedUnit[] }) {
  const { t } = useT("realestate");
  const failure = error instanceof ProjectCreateError ? error : null;
  return (
    <Alert severity="error" sx={{ mt: 2 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {t("wizard.failed")}
      </Typography>
      {failure ? (
        <>
          <Typography variant="body2">
            {failure.projectLeft ? t("wizard.failedProjectLeft", { id: failure.projectLeft }) : t("wizard.failedRolledBack")}
          </Typography>
          {failure.rows.length > 0 ? (
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2 }}>
              {failure.rows.slice(0, 10).map((row) => {
                const unit = planned[row.index];
                return (
                  <li key={`${row.index}-${row.field}`}>
                    {unit
                      ? t("wizard.rowError", { number: unit.number, section: unit.sectionName, floor: unit.floor, message: row.message })
                      : row.message}
                  </li>
                );
              })}
            </Box>
          ) : (
            <Typography variant="body2">{failure.message}</Typography>
          )}
        </>
      ) : (
        <Typography variant="body2">{error instanceof Error ? error.message : String(error)}</Typography>
      )}
    </Alert>
  );
}
