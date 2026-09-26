import React from "react";
import {
  Alert,
  Box,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../../../api/client";
import type { Program } from "../../../api/programs";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { getPriceQuote, intakeEnrollment, type IntakeResult } from "../../../api/registry";
import { AppButton } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { usePermissions } from "../../../hooks/usePermissions";
import { useT } from "../../../i18n/VerticalProvider";
import {
  buildIntakePayload,
  existingRepresentativeIds,
  FORM_STEPS,
  initialIntakeState,
  STEPS,
  toAmount,
  validateStep,
  type ExistingPerson,
  type IntakeState,
  type StepErrors,
  type StepKey,
} from "./intakeState";
import { programTemplateIds } from "../registryConstants";
import { ChildStep } from "./steps/ChildStep";
import { DocumentsStep } from "./steps/DocumentsStep";
import { PaymentStep } from "./steps/PaymentStep";
import { ProgramStep } from "./steps/ProgramStep";
import { RepresentativesStep } from "./steps/RepresentativesStep";

export interface IntakeWizardProps {
  open: boolean;
  scope: ActiveScope;
  /** Карточка, с которой открыли мастер (из карточки пациента). */
  initialPatient?: ExistingPerson | null;
  onClose: () => void;
  onDone: (result: IntakeResult | null) => void;
}

/**
 * Постановка на учёт: ребёнок → представители → программа и врач → оплата
 * → документы. Всё до документов уходит одним запросом (бэк создаёт всё или
 * ничего); документы привязываются к уже созданному подключению.
 */
export const IntakeWizard: React.FC<IntakeWizardProps> = ({ open, scope, initialPatient = null, onClose, onDone }) => {
  const { t } = useT("registry");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { activeBranch } = usePermissions();
  const [state, setState] = React.useState<IntakeState>(() => initialIntakeState(initialPatient));
  const [step, setStep] = React.useState<StepKey>("child");
  const [errors, setErrors] = React.useState<StepErrors>({});
  const [result, setResult] = React.useState<IntakeResult | null>(null);
  const [program, setProgram] = React.useState<Program | undefined>(undefined);

  React.useEffect(() => {
    if (!open) return;
    const fresh = initialIntakeState(initialPatient);
    fresh.program.branchId = activeBranch?.id ?? null;
    setState(fresh);
    setStep("child");
    setErrors({});
    setResult(null);
  }, [open, initialPatient, activeBranch?.id]);

  const quoteParams = {
    packageId: state.program.packageId ?? 0,
    patientId: state.child.existing?.id ?? null,
    representativeIds: existingRepresentativeIds(state),
  };
  const quote = useQuery({
    queryKey: djangoQueryKeys.programs.priceQuote(scope, quoteParams),
    queryFn: ({ signal }) => getPriceQuote(scope, quoteParams, signal),
    enabled: open && state.program.packageId != null && scope.isReady && scope.orgReady,
  });
  const price = state.program.priceAmount.trim()
    ? toAmount(state.program.priceAmount)
    : quote.data
      ? Number(quote.data.priceAmount)
      : null;

  const submit = useMutation({
    mutationFn: () => intakeEnrollment(scope, buildIntakePayload(state)),
    onSuccess: (data) => {
      setResult(data);
      setStep("documents");
      enqueueSnackbar(t("wizard.done"), { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["django", "programs"] });
      void queryClient.invalidateQueries({ queryKey: ["django", "patients"] });
    },
  });

  const update = React.useCallback(
    <K extends keyof IntakeState>(key: K) =>
      (next: IntakeState[K]) => setState((current) => ({ ...current, [key]: next })),
    [],
  );
  const setChild = React.useMemo(() => update("child"), [update]);
  const setRepresentatives = React.useMemo(() => update("representatives"), [update]);
  const setProgramState = React.useMemo(() => update("program"), [update]);
  const setPayment = React.useMemo(() => update("payment"), [update]);

  const index = STEPS.indexOf(step);
  const isLastFormStep = step === FORM_STEPS[FORM_STEPS.length - 1];
  const validate = (key: StepKey) => validateStep(key, state, { price: price ?? undefined });

  const goNext = () => {
    const found = validate(step);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (isLastFormStep) {
      submit.mutate();
      return;
    }
    setStep(STEPS[index + 1]);
  };
  const goBack = () => {
    setErrors({});
    setStep(STEPS[Math.max(index - 1, 0)]);
  };
  const close = () => {
    if (submit.isPending) return;
    if (result) onDone(result);
    else onClose();
  };

  const childCardNumber = state.child.mode === "existing" ? state.child.existing?.cardNumber ?? "" : "";

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={close}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 720 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Typography variant="h6" fontWeight={600}>
          {t("wizard.title")}
        </Typography>
        <IconButton onClick={close} aria-label={t("wizard.close")} edge="end">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Box sx={{ px: 2.5, pb: 1.5 }}>
        <Stepper activeStep={index} alternativeLabel={!isMobile} orientation="horizontal">
          {STEPS.map((key) => (
            <Step key={key} completed={result != null ? key !== "documents" : STEPS.indexOf(key) < index}>
              <StepLabel>{isMobile && key !== step ? "" : t(`wizard.steps.${key}`)}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2 }}>
        {step === "child" && <ChildStep scope={scope} value={state.child} errors={errors} onChange={setChild} />}
        {step === "representatives" && (
          <RepresentativesStep
            scope={scope}
            value={state.representatives}
            errors={errors}
            childId={state.child.existing?.id ?? null}
            onChange={setRepresentatives}
          />
        )}
        {step === "program" && (
          <ProgramStep
            scope={scope}
            value={state.program}
            errors={errors}
            childCardNumber={childCardNumber}
            quote={quote.data}
            onChange={setProgramState}
            onProgramLoaded={setProgram}
          />
        )}
        {step === "payment" && (
          <PaymentStep
            scope={scope}
            branchId={state.program.branchId}
            price={price}
            value={state.payment}
            errors={errors}
            onChange={setPayment}
          />
        )}
        {step === "documents" && result && (
          <DocumentsStep
            scope={scope}
            enrollmentId={result.enrollment.id}
            patientId={result.patientId}
            templateIds={programTemplateIds(program)}
          />
        )}
        {submit.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {t("errors.intake")}: {getErrorMessage(submit.error)}
          </Alert>
        )}
      </Box>
      <Divider />
      <Stack direction="row" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        {step === "documents" ? (
          <>
            <span />
            <AppButton variant="contained" onClick={close}>
              {t("wizard.documents.skip")}
            </AppButton>
          </>
        ) : (
          <>
            <AppButton variant="text" onClick={index === 0 ? close : goBack} disabled={submit.isPending}>
              {index === 0 ? t("wizard.close") : t("wizard.back")}
            </AppButton>
            <AppButton variant="contained" onClick={goNext} disabled={submit.isPending}>
              {isLastFormStep ? t("wizard.finish") : t("wizard.next")}
            </AppButton>
          </>
        )}
      </Stack>
    </Drawer>
  );
};
