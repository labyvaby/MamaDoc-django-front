import React from "react";
import { Box, ButtonBase, Collapse, Stack, Typography } from "@mui/material";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";

import { getHealthChanges, type HealthChange } from "../../api/health";
import { DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import {
  ALLERGY_CATEGORIES,
  ALLERGY_SEVERITIES,
  ALLERGY_STATUSES,
  BLOOD_GROUPS,
  CONDITION_STATUSES,
  DELIVERY_TYPES,
  FAMILY_RELATIONS,
  HEALTH_GROUPS,
  PE_GROUPS,
  RH_FACTORS,
  type Option,
} from "./healthMeta";
import { useHealthScope } from "./useHealth";

const MODEL_LABELS: Record<string, string> = {
  health_profile: "Профиль",
  allergy: "Аллергия",
  condition: "Диагноз",
  measurement: "Замер",
  hospitalization: "Госпитализация",
  family_history: "Паспорт семьи",
  feeding_period: "Вскармливание",
  medication_course: "Препарат",
};

const ACTION_LABELS: Record<HealthChange["action"], string> = {
  create: "добавлено",
  update: "изменено",
  status: "сменён статус",
  delete: "удалено",
};

const FIELD_LABELS: Record<string, string> = {
  allergen: "аллерген",
  reaction: "реакция",
  severity: "тяжесть",
  status: "статус",
  title: "диагноз",
  diagnosis_code: "код",
  is_dispensary: "Д-учёт",
  next_control_on: "следующий контроль",
  health_group: "группа здоровья",
  birth_weight_g: "вес при рождении",
  gestational_age_weeks: "срок гестации",
  no_known_allergies: "аллергий нет",
  facility: "стационар",
  full_name: "ФИО",
  blood_group: "группа крови",
  rh_factor: "резус",
};

const VALUE_OPTIONS: Record<string, ReadonlyArray<Option<string>>> = {
  severity: ALLERGY_SEVERITIES,
  category: ALLERGY_CATEGORIES,
  relation: FAMILY_RELATIONS,
  health_group: HEALTH_GROUPS,
  pe_group: PE_GROUPS,
  blood_group: BLOOD_GROUPS,
  rh_factor: RH_FACTORS,
  delivery_type: DELIVERY_TYPES,
};

function valueText(model: string, field: string, value: unknown): string {
  if (value === true) return "да";
  if (value === false) return "нет";
  if (value == null || value === "") return "—";
  const text = String(value);
  const options = field === "status" ? (model === "allergy" ? ALLERGY_STATUSES : CONDITION_STATUSES) : VALUE_OPTIONS[field];
  const label = options?.find((option) => option.value === text)?.label;
  if (label) return label;
  if (/^d{4}-d{2}-d{2}$/.test(text)) return dayjs(text).format("DD.MM.YYYY");
  return text;
}

/** «аллерген: Амоксициллин; тяжесть: тяжёлая» — коротко, что поменялось. */
function describeChanges(model: string, changes: HealthChange["changes"]): string {
  return Object.entries(changes)
    .slice(0, 4)
    .map(([field, pair]) => {
      const label = FIELD_LABELS[field] ?? field.replaceAll("_", " ");
      const next = Array.isArray(pair) ? pair[1] : pair;
      return `${label}: ${valueText(model, field, next)}`;
    })
    .join("; ");
}

/** Журнал медпрофиля: кто и что менял (свёрнут по умолчанию). */
export const HealthChangesLog: React.FC<{ patientId: number }> = ({ patientId }) => {
  const { orgId, scope, ready } = useHealthScope();
  const [open, setOpen] = React.useState(false);
  const query = useQuery({
    queryKey: djangoQueryKeys.health.changes(patientId, orgId),
    queryFn: ({ signal }) => getHealthChanges(scope, patientId, { limit: 50 }, signal),
    enabled: ready && open,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const rows = query.data?.results ?? [];
  return (
    <Box>
      <ButtonBase onClick={() => setOpen((value) => !value)} sx={{ borderRadius: "8px", px: 0.5, gap: 0.75, color: "text.secondary" }}>
        <HistoryOutlined fontSize="small" />
        <Typography variant="body2" fontWeight={600}>
          История изменений медпрофиля
        </Typography>
        <ExpandMoreOutlined fontSize="small" sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </ButtonBase>
      <Collapse in={open} sx={{ flexShrink: 0 }}>
        <Stack gap={0.75} sx={{ mt: 1, pl: 0.5 }}>
          {query.isLoading && (
            <Typography variant="caption" color="text.secondary">
              Загрузка…
            </Typography>
          )}
          {!query.isLoading && rows.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              Изменений пока нет.
            </Typography>
          )}
          {rows.map((row) => (
            <Box key={row.id}>
              <Typography variant="caption" color="text.secondary">
                {dayjs(row.createdAt).format("DD.MM.YYYY HH:mm")}
                {row.actor ? ` · ${row.actor.fullName}` : ""}
              </Typography>
              <Typography variant="body2">
                <b>{MODEL_LABELS[row.model] ?? row.model}</b> — {ACTION_LABELS[row.action] ?? row.action}
                {Object.keys(row.changes).length ? `: ${describeChanges(row.model, row.changes)}` : ""}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
};
