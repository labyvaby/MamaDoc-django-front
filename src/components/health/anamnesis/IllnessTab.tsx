import React from "react";
import { Box, Link, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getMedications } from "../../../api/health";
import { DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../../api/queryKeys";
import { useHealthScope } from "../useHealth";
import type { AnamnesisActions, AnamnesisModel } from "./anamnesisModel";
import { HOUSEHOLD_INFECTIONS, TB_PLACES } from "./anamnesisTypes";
import { Panel } from "./anamnesisUi";
import { SensitiveCard } from "./SensitiveCard";
import { dateText, lowerFirst } from "./russian";

const SectionLink: React.FC<{ actions: AnamnesisActions; type: string; title: string }> = ({ actions, type, title }) =>
  actions.openSection && actions.hasSection?.(type) ? (
    <Link component="button" variant="caption" fontWeight={600} underline="hover" onClick={() => actions.openSection?.(type)}>
      Открыть «{title}»
    </Link>
  ) : null;

const Lines: React.FC<{ lines: string[]; empty: string }> = ({ lines, empty }) =>
  lines.length ? (
    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
      {lines.map((line, index) => (
        <Typography key={`${line}-${index}`} component="li" variant="body2">
          {line}
        </Typography>
      ))}
    </Box>
  ) : (
    <Typography variant="body2" color="text.secondary">
      {empty}
    </Typography>
  );

/**
 * Вкладка «Болезни и аллергии» (ТЗ §4.3): только чтение со ссылками на разделы;
 * здесь же «Эпиданамнез» (закрытые сведения) с правкой.
 */
export const IllnessTab: React.FC<{ model: AnamnesisModel; actions: AnamnesisActions; patientId: number }> = ({ model, actions, patientId }) => {
  const { orgId, scope, ready } = useHealthScope();
  const medications = useQuery({
    queryKey: djangoQueryKeys.health.medications(patientId, orgId),
    queryFn: ({ signal }) => getMedications(scope, patientId, signal),
    enabled: ready,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const input = model.input;
  const allergies = input.allergies.map((allergy) => [allergy.allergen, allergy.reaction ? lowerFirst(allergy.reaction) : ""].filter(Boolean).join(" — "));
  const conditions = [...input.conditions]
    .sort((a, b) => (b.diagnosedOn ?? "").localeCompare(a.diagnosedOn ?? ""))
    .map((condition) => [condition.diagnosedOn ? dateText(condition.diagnosedOn) : "", condition.diagnosisCode, condition.title].filter(Boolean).join(" · "));
  const antibiotics = (medications.data ?? [])
    .filter((course) => course.kind === "antibiotic")
    .map((course) => `${dateText(course.startedOn)}${course.endedOn ? `–${dateText(course.endedOn)}` : ""} · ${course.drug}${course.reaction ? ` · реакция: ${course.reaction}` : ""}`);
  const schedule = input.vaccinations?.schedule ?? [];
  const overdue = schedule.filter((slot) => slot.status === "overdue");
  const surgeries = input.surgeries;
  return (
    <Stack gap={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
        <Panel title="Аллергии" action={<SectionLink actions={actions} type="allergies" title="Аллергии" />}>
          <Lines lines={allergies} empty={input.profile?.noKnownAllergies ? "Аллергий нет (подтверждено врачом)" : "Аллергии не уточнены"} />
        </Panel>
        <Panel title="Болезни" action={<SectionLink actions={actions} type="conditions" title="Диагнозы" />}>
          <Lines lines={conditions} empty="Диагнозов в медкарте нет" />
        </Panel>
        <Panel title="Операции, травмы, переливания крови">
          {surgeries ? (
            <Lines
              lines={surgeries.items.filter((item) => item.status !== "refuted").map((item) => `${dateText(item.performedOn)} · ${item.title}`)}
              empty={[surgeries.noneOperations && "операций", surgeries.noneInjuries && "травм", surgeries.noneTransfusions && "переливаний"].filter(Boolean).length ? "Не было" : "Не внесено"}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Ведутся в разделе «Операции и травмы»; в абзац попадут, когда раздел появится в книжке.
            </Typography>
          )}
        </Panel>
        <Panel title="Курсы антибиотиков" action={<SectionLink actions={actions} type="medications" title="Препараты" />}>
          <Lines lines={antibiotics} empty={medications.isLoading ? "Загрузка…" : "Курсов антибиотиков не внесено"} />
        </Panel>
        {actions.canSeeVaccinations && (
          <Panel title="Прививки" action={<SectionLink actions={actions} type="vaccination" title="Прививки и пробы" />}>
            {schedule.length ? (
              overdue.length ? (
                <Lines lines={overdue.map((slot) => `${slot.vaccineName} — срок ${dateText(slot.scheduledDate)}`)} empty="" />
              ) : (
                <Typography variant="body2">Прививки по календарю — просрочек нет.</Typography>
              )
            ) : (
              <Typography variant="body2" color="text.secondary">
                Календарь прививок не составлен.
              </Typography>
            )}
          </Panel>
        )}
      </Box>
      {actions.canSeeSensitive && (
        <SensitiveCard
          title="Эпиданамнез"
          sensitive={input.sensitive}
          canEdit={actions.canManage}
          onEdit={actions.openSensitive}
          rows={(s) => [
            {
              label: "Контакт с туберкулёзом",
              value:
                s.tbContact === "no"
                  ? "не было"
                  : s.tbContact === "yes"
                    ? [
                        "был",
                        TB_PLACES.find((option) => option.value === s.tbContactPlace)?.label.toLowerCase() ?? "",
                        s.tbContactFrom ? `с ${dateText(s.tbContactFrom)}` : "",
                        s.tbContactTo ? `по ${dateText(s.tbContactTo)}` : "",
                        s.tbSourceBacillary ? "источник — бактериовыделитель" : "",
                        s.tbPreventiveTherapy === true ? "превентивная терапия проведена" : s.tbPreventiveTherapy === false ? "без превентивной терапии" : "",
                      ]
                        .filter(Boolean)
                        .join(", ")
                    : "",
              tone: s.tbContact === "yes" ? "bad" : undefined,
            },
            {
              label: "Инфекции в окружении",
              value:
                s.householdInfections == null
                  ? ""
                  : s.householdInfections.length
                    ? s.householdInfections.map((code) => HOUSEHOLD_INFECTIONS.find((option) => option.value === code)?.label ?? code).join(", ")
                    : "нет",
              tone: s.householdInfections?.length ? "warn" : undefined,
            },
            { label: "Заметка", value: s.notes },
          ]}
        />
      )}
      <Typography variant="caption" color="text.secondary">
        Сведения на {dayjs(model.at).format("DD.MM.YYYY")}; раздел их только читает — правка в своих разделах книжки.
      </Typography>
    </Stack>
  );
};
