import React from "react";
import { Box, ButtonBase, Chip, Collapse, Divider, FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import MonitorHeartOutlined from "@mui/icons-material/MonitorHeartOutlined";
import { useQuery } from "@tanstack/react-query";

import { getConditions, getHospitalizations, type Condition, type Hospitalization } from "../../api/health";
import { DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { subtleBg } from "../../theme/uiHelpers";
import { AppButton } from "../ui";
import { ConditionDrawer } from "./ConditionDrawer";
import { HealthSectionCard } from "./HealthSectionCard";
import { HospitalizationDrawer } from "./HospitalizationDrawer";
import { CONDITION_STATUSES, controlState, formatDate, onDispensary, optionLabel } from "./healthMeta";
import { useHealthScope, usePatientHealth } from "./useHealth";

const CONTROL_TONE = { overdue: "error", soon: "warning", planned: "default" } as const;

const ConditionRow: React.FC<{ condition: Condition; canManage: boolean; onEdit: (condition: Condition) => void }> = ({
  condition,
  canManage,
  onEdit,
}) => {
  const current = condition.status === "active" || condition.status === "remission";
  const control = controlState(condition);
  const observed = onDispensary(condition);
  const meta = [
    condition.diagnosedOn ? `с ${formatDate(condition.diagnosedOn)}` : "",
    condition.resolvedOn ? `снят ${formatDate(condition.resolvedOn)}` : "",
    condition.responsibleDoctor?.fullName ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
  const content = (
    <Stack
      direction="row"
      gap={1.25}
      alignItems="flex-start"
      sx={(theme) => ({
        width: "100%",
        textAlign: "left",
        p: 1.5,
        borderRadius: "12px",
        border: 1,
        borderColor: observed && control === "overdue" ? "error.light" : "divider",
        bgcolor: current ? subtleBg(theme) : "transparent",
        opacity: condition.status === "refuted" ? 0.6 : 1,
      })}
    >
      <MonitorHeartOutlined fontSize="small" color={observed ? "primary" : "disabled"} sx={{ mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
          {condition.diagnosisCode && (
            <Typography variant="body2" fontWeight={700} color="text.secondary">
              {condition.diagnosisCode}
            </Typography>
          )}
          <Typography variant="body2" fontWeight={700} sx={{ textDecoration: condition.status === "refuted" ? "line-through" : undefined }}>
            {condition.title}
          </Typography>
          {condition.isFirstDiagnosis && <Chip size="small" color="info" label="впервые" sx={{ height: 20 }} />}
          {condition.status !== "active" && (
            <Chip size="small" variant="outlined" label={optionLabel(CONDITION_STATUSES, condition.status)} sx={{ height: 20 }} />
          )}
        </Stack>
        {observed && (
          <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
            <Chip size="small" color="primary" variant="outlined" label="Д-учёт" sx={{ height: 20 }} />
            {condition.controlIntervalMonths && (
              <Typography variant="caption" color="text.secondary">
                контроль раз в {condition.controlIntervalMonths} мес.
              </Typography>
            )}
            {condition.nextControlOn && control && (
              <Chip
                size="small"
                color={CONTROL_TONE[control]}
                label={`${control === "overdue" ? "просрочен" : "следующий"} ${formatDate(condition.nextControlOn)}`}
                sx={{ height: 20 }}
              />
            )}
          </Stack>
        )}
        {meta && (
          <Typography variant="caption" color="text.secondary" display="block">
            {meta}
          </Typography>
        )}
      </Box>
    </Stack>
  );
  return canManage ? (
    <ButtonBase onClick={() => onEdit(condition)} sx={{ display: "block", width: "100%", borderRadius: "12px" }}>
      {content}
    </ButtonBase>
  ) : (
    content
  );
};

const HospitalizationRow: React.FC<{ row: Hospitalization; canManage: boolean; onEdit: (row: Hospitalization) => void }> = ({
  row,
  canManage,
  onEdit,
}) => {
  const period = row.dischargedOn
    ? `${formatDate(row.admittedOn)} — ${formatDate(row.dischargedOn)}`
    : `с ${formatDate(row.admittedOn)}, не выписан`;
  const content = (
    <Stack direction="row" gap={1.25} alignItems="flex-start" sx={{ width: "100%", textAlign: "left", py: 1 }}>
      <LocalHospitalOutlined fontSize="small" color="action" sx={{ mt: 0.25 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600}>
          {row.facility}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {[period, row.conditionTitle ?? row.diagnosisTitle].filter(Boolean).join(" · ")}
        </Typography>
      </Box>
    </Stack>
  );
  return canManage ? (
    <ButtonBase onClick={() => onEdit(row)} sx={{ display: "block", width: "100%", borderRadius: "10px" }}>
      {content}
    </ButtonBase>
  ) : (
    content
  );
};

interface ConditionsSectionProps {
  patientId: number;
  canManage: boolean;
  title?: string;
}

/** Лист заключительных диагнозов: «впервые», Д-учёт со сроками, госпитализации. */
export const ConditionsSection: React.FC<ConditionsSectionProps> = ({ patientId, canManage, title = "Диагнозы и наблюдение" }) => {
  const { orgId, scope, ready } = useHealthScope();
  const summary = usePatientHealth(patientId);
  const [showRefuted, setShowRefuted] = React.useState(false);
  const [resolvedOpen, setResolvedOpen] = React.useState(false);
  const [conditionDrawer, setConditionDrawer] = React.useState<{ open: boolean; condition: Condition | null }>({
    open: false,
    condition: null,
  });
  const [hospitalDrawer, setHospitalDrawer] = React.useState<{ open: boolean; row: Hospitalization | null }>({
    open: false,
    row: null,
  });

  const all = useQuery({
    queryKey: djangoQueryKeys.health.conditions(patientId, { status: "all" }, orgId),
    queryFn: ({ signal }) => getConditions(scope, patientId, { status: "all" }, signal),
    enabled: ready && showRefuted,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const hospitalizations = useQuery({
    queryKey: djangoQueryKeys.health.hospitalizations(patientId, orgId),
    queryFn: ({ signal }) => getHospitalizations(scope, patientId, signal),
    enabled: ready,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const conditions = showRefuted ? all.data ?? [] : summary.data?.conditions ?? [];
  const current = conditions.filter((row) => row.status === "active" || row.status === "remission");
  const past = conditions.filter((row) => row.status === "resolved" || row.status === "refuted");
  const observed = conditions.filter(onDispensary);
  const overdue = observed.filter((row) => controlState(row) === "overdue").length;
  const stays = hospitalizations.data ?? [];
  const editCondition = (condition: Condition) => setConditionDrawer({ open: true, condition });

  const subheader =
    [
      observed.length ? `на Д-учёте: ${observed.length}` : "",
      overdue ? `просрочен контроль: ${overdue}` : "",
      stays.length ? `госпитализаций: ${stays.length}` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "Заключительные диагнозы, диспансерное наблюдение и госпитализации";

  return (
    <>
      <HealthSectionCard
        title={title}
        subheader={subheader}
        loading={summary.isLoading}
        error={summary.isError}
        actions={
          canManage ? (
            <>
              <AppButton variant="outlined" size="small" startIcon={<LocalHospitalOutlined />} onClick={() => setHospitalDrawer({ open: true, row: null })}>
                Госпитализация
              </AppButton>
              <AppButton variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setConditionDrawer({ open: true, condition: null })}>
                Диагноз
              </AppButton>
            </>
          ) : undefined
        }
      >
        <Stack gap={1}>
          {current.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Текущих диагнозов нет.
            </Typography>
          )}
          {current.map((condition) => (
            <ConditionRow key={condition.id} condition={condition} canManage={canManage} onEdit={editCondition} />
          ))}
          {past.length > 0 && (
            <>
              <ButtonBase
                onClick={() => setResolvedOpen((value) => !value)}
                sx={{ alignSelf: "flex-start", borderRadius: "8px", px: 0.5, gap: 0.5, color: "text.secondary" }}
              >
                <ExpandMoreOutlined fontSize="small" sx={{ transform: resolvedOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                <Typography variant="caption" fontWeight={600}>
                  Снятые диагнозы: {past.length}
                </Typography>
              </ButtonBase>
              <Collapse in={resolvedOpen} sx={{ flexShrink: 0 }}>
                <Stack gap={1}>
                  {past.map((condition) => (
                    <ConditionRow key={condition.id} condition={condition} canManage={canManage} onEdit={editCondition} />
                  ))}
                </Stack>
              </Collapse>
            </>
          )}
          <FormControlLabel
            sx={{ m: 0, alignSelf: "flex-start" }}
            control={<Switch size="small" checked={showRefuted} onChange={(event) => setShowRefuted(event.target.checked)} />}
            label={<Typography variant="caption">Показать ошибочно внесённые</Typography>}
          />
          {stays.length > 0 && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Госпитализации
              </Typography>
              {stays.map((row) => (
                <HospitalizationRow key={row.id} row={row} canManage={canManage} onEdit={(item) => setHospitalDrawer({ open: true, row: item })} />
              ))}
            </>
          )}
        </Stack>
      </HealthSectionCard>
      <ConditionDrawer
        open={conditionDrawer.open}
        patientId={patientId}
        condition={conditionDrawer.condition}
        onClose={() => setConditionDrawer({ open: false, condition: null })}
      />
      <HospitalizationDrawer
        open={hospitalDrawer.open}
        patientId={patientId}
        hospitalization={hospitalDrawer.row}
        conditions={summary.data?.conditions ?? []}
        onClose={() => setHospitalDrawer({ open: false, row: null })}
      />
    </>
  );
};
