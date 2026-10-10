import React from "react";
import { Box, ButtonBase, Chip, Collapse, FormControlLabel, Stack, Switch, Typography, alpha } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import MonitorHeartOutlined from "@mui/icons-material/MonitorHeartOutlined";

import type { ChronicStat, Condition } from "../../api/health";
import { subtleBg } from "../../theme/uiHelpers";
import { AppButton } from "../ui";
import { CONDITION_STATUSES, controlState, formatDate, onDispensary, optionLabel } from "./healthMeta";
import { chronicStatText, formatPrecisionDate, isCurrentCondition } from "./illnessData";

const CONTROL_TONE = { overdue: "error", soon: "warning", planned: "default" } as const;

/** Строка диагноза листа 112/у: код, название, «впервые», статус, Д-учёт и срок контроля. */
export const ConditionRow: React.FC<{
  condition: Condition;
  stat?: ChronicStat;
  canManage: boolean;
  onEdit: (condition: Condition) => void;
}> = ({ condition, stat, canManage, onEdit }) => {
  const current = isCurrentCondition(condition);
  const control = controlState(condition);
  const observed = onDispensary(condition);
  const since = formatPrecisionDate(condition.diagnosedOn, condition.datePrecision);
  const meta = [
    since ? `с ${since}` : "",
    condition.resolvedOn ? `снят ${formatDate(condition.resolvedOn)}` : "",
    condition.responsibleDoctor?.fullName ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
  const statLine = chronicStatText(stat);
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
      <MonitorHeartOutlined fontSize="small" color={observed ? "primary" : current ? "warning" : "disabled"} sx={{ mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
          {condition.diagnosisCode && (
            <Typography variant="body2" fontWeight={700} color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {condition.diagnosisCode}
            </Typography>
          )}
          <Typography
            variant="body2"
            fontWeight={700}
            sx={{ textDecoration: condition.status === "refuted" ? "line-through" : undefined, overflowWrap: "anywhere" }}
          >
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
        {statLine && current && (
          <Typography variant="caption" color="text.secondary" display="block">
            {statLine}
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

interface ChronicConditionsProps {
  /** Диагнозы вида «хронические»; при «показать ошибочно внесённые» — вместе с ними. */
  conditions: ReadonlyArray<Condition>;
  stats: ReadonlyArray<ChronicStat>;
  canManage: boolean;
  showRefuted: boolean;
  onToggleRefuted: (value: boolean) => void;
  onEdit: (condition: Condition) => void;
  /** Внести хронический диагноз сразу (на вкладке «Хронические»). */
  onAdd?: () => void;
}

/** Блок «Хронические и Д-учёт» (§3.5): действующие и в ремиссии, снятые свёрнуты, ошибочно внесённые — по переключателю. */
export const ChronicConditions: React.FC<ChronicConditionsProps> = ({
  conditions,
  stats,
  canManage,
  showRefuted,
  onToggleRefuted,
  onEdit,
  onAdd,
}) => {
  const [resolvedOpen, setResolvedOpen] = React.useState(false);
  const current = conditions.filter(isCurrentCondition);
  const past = conditions.filter((row) => !isCurrentCondition(row));
  const statFor = (condition: Condition) => stats.find((stat) => stat.conditionId === condition.id);
  const observed = current.filter(onDispensary).length;
  return (
    <Box
      sx={(theme) => ({
        p: 1.5,
        borderRadius: "14px",
        border: `1px solid ${alpha(theme.palette.warning.main, current.length ? 0.45 : 0.2)}`,
        bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === "dark" ? 0.06 : 0.035),
        minWidth: 0,
      })}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Хронические и Д-учёт
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {current.length
              ? [`действующих ${current.length}`, observed ? `на Д-учёте ${observed}` : ""].filter(Boolean).join(" · ")
              : "Действующих хронических диагнозов нет"}
          </Typography>
        </Box>
        {canManage && onAdd && (
          <AppButton size="small" startIcon={<AddOutlined />} onClick={onAdd} sx={{ flexShrink: 0 }}>
            Хронический
          </AppButton>
        )}
      </Stack>
      <Stack gap={1}>
        {current.map((condition) => (
          <ConditionRow key={condition.id} condition={condition} stat={statFor(condition)} canManage={canManage} onEdit={onEdit} />
        ))}
        {past.length > 0 && (
          <>
            <ButtonBase
              onClick={() => setResolvedOpen((value) => !value)}
              sx={{ alignSelf: "flex-start", borderRadius: "8px", px: 0.5, gap: 0.5, color: "text.secondary" }}
            >
              <ExpandMoreOutlined fontSize="small" sx={{ transform: resolvedOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              <Typography variant="caption" fontWeight={600}>
                {showRefuted ? "Снятые и ошибочно внесённые" : "Снятые диагнозы"}: {past.length}
              </Typography>
            </ButtonBase>
            <Collapse in={resolvedOpen} sx={{ flexShrink: 0 }}>
              <Stack gap={1}>
                {past.map((condition) => (
                  <ConditionRow key={condition.id} condition={condition} canManage={canManage} onEdit={onEdit} />
                ))}
              </Stack>
            </Collapse>
          </>
        )}
        <FormControlLabel
          sx={{ m: 0, alignSelf: "flex-start" }}
          control={<Switch size="small" checked={showRefuted} onChange={(event) => onToggleRefuted(event.target.checked)} />}
          label={<Typography variant="caption">Показать ошибочно внесённые</Typography>}
        />
      </Stack>
    </Box>
  );
};
