import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";

import type { MarkerResult, PerinatalHistory } from "../../../api/health";
import { AppButton } from "../../ui";
import { termText } from "./anamnesisFactors";
import type { AnamnesisActions, AnamnesisModel } from "./anamnesisModel";
import {
  BIRTH_PLACES,
  COMPLICATIONS,
  CONCEPTION,
  DELIVERY_COMPLICATIONS,
  INFECTIONS,
  MATERNAL_DISEASES,
  OBSTETRIC_AIDS,
  PERINATAL_INFORMANTS,
  PRENATAL_TEST_KINDS,
  PRESENTATIONS,
  SEVERITY_LABELS,
  TOXICOSIS_SEVERITY_LABELS,
  type Option,
} from "./anamnesisTypes";
import { Fact, Panel } from "./anamnesisUi";
import { orDash } from "./anamnesisTone";
import { PregnancyTimeline } from "./PregnancyTimelineChart";
import { SensitiveCard } from "./SensitiveCard";
import { decimal, gestationText } from "./russian";

const label = <T extends string>(options: ReadonlyArray<Option<T>>, value: T | ""): string =>
  options.find((option) => option.value === value)?.label ?? "";

const yesNo = (value: boolean | null, yes = "да", no = "нет"): string => (value === true ? yes : value === false ? no : "");

/** Список с отметкой «нет»: null — «—», [] — слово «нет». */
const listText = (items: string[] | null, none: string): string => (items == null ? "" : items.length ? items.join("\n") : none);

function complicationLines(p: PerinatalHistory): string[] | null {
  if (!p.complications) return null;
  return p.complications.map((item) => {
    const meta = COMPLICATIONS[item.code];
    const name = item.code === "other" ? item.note || meta.label : meta.label;
    const severity = item.severity ? (item.code === "toxicosis" ? TOXICOSIS_SEVERITY_LABELS : SEVERITY_LABELS)[item.severity] : "";
    const note = item.code !== "other" && item.note ? item.note : "";
    return [name, [severity, termText(item)].filter(Boolean).join(", "), note].filter(Boolean).join(" — ");
  });
}

function infectionLines(p: PerinatalHistory): string[] | null {
  if (!p.infections) return null;
  return p.infections.map((item) => {
    const name = item.code === "other" ? item.note || "другая" : INFECTIONS[item.code].label;
    return [name, termText(item), item.code !== "other" ? item.note : ""].filter(Boolean).join(" — ");
  });
}

const MARKER_WORD: Record<Exclude<MarkerResult, "">, string> = { negative: "отрицательный", positive: "положительный" };

/** Вкладка «Беременность и роды» (ТЗ §4.3): ось крупнее, все списки, роды подробно. */
export const PregnancyTab: React.FC<{ model: AnamnesisModel; actions: AnamnesisActions }> = ({ model, actions }) => {
  const p = model.input.perinatal;
  const profile = model.input.profile;
  if (!p) return null;
  const edit = (tab: "pregnancy" | "birth") =>
    actions.canManage ? (
      <AppButton size="small" startIcon={<EditOutlined />} onClick={() => actions.openPerinatal(tab)}>
        Изменить
      </AppButton>
    ) : undefined;
  const habits = [
    p.motherSmoking === true ? `курение${p.motherCigarettesPerDay ? ` (${p.motherCigarettesPerDay} в день)` : ""}` : "",
    p.motherAlcohol === true ? "алкоголь" : "",
    p.motherDrugs === true ? "наркотики" : "",
  ].filter(Boolean);
  const habitsKnown = p.motherSmoking != null || p.motherAlcohol != null || p.motherDrugs != null;
  const delivery =
    profile?.deliveryType === "natural"
      ? "самостоятельные"
      : profile?.deliveryType === "cesarean"
        ? `кесарево сечение${p.cesareanKind === "planned" ? ", плановое" : p.cesareanKind === "emergency" ? ", экстренное" : ""}`
        : profile?.deliveryType === "other"
          ? "другое"
          : "";
  return (
    <Stack gap={2}>
      {!model.timeline.empty && <PregnancyTimeline layout={model.timeline} minWidth={720} />}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
        <Panel title="Беременность" action={edit("pregnancy")}>
          <Box>
            <Fact label="Какая беременность" value={orDash(p.pregnancyNumber)} />
            <Fact label="Какие роды" value={orDash(p.birthNumber)} />
            <Fact label="Наступила" value={orDash(label(CONCEPTION, p.conception).toLowerCase())} />
            <Fact
              label="Многоплодная"
              value={orDash(
                p.multiplePregnancy === true
                  ? `да${p.fetusCount ? `, плодов: ${p.fetusCount}` : ""}${p.fetusOrder ? `, по счёту: ${p.fetusOrder}` : ""}`
                  : yesNo(p.multiplePregnancy),
              )}
            />
            <Fact label="Осложнения" value={orDash(listText(complicationLines(p), "без осложнений"))} />
            <Fact label="Инфекции" value={orDash(listText(infectionLines(p), "не было"))} />
            <Fact
              label="Хронические болезни матери"
              value={orDash(
                listText(
                  p.maternalDiseases?.map((item) => (item.code === "other" ? item.note : `${MATERNAL_DISEASES[item.code].nominative}${item.note ? ` (${item.note})` : ""}`)) ?? null,
                  "нет",
                ),
              )}
            />
            <Fact label="Привычки матери" value={orDash(habits.length ? habits.join(", ") : habitsKnown ? "нет" : "")} tone={habits.length ? "warn" : undefined} />
            <Fact
              label="Обследования"
              value={orDash(
                listText(
                  p.prenatalTests?.map((test) =>
                    [
                      `${label(PRENATAL_TEST_KINDS, test.kind)}${test.week != null ? ` ${test.week} нед` : ""}`,
                      test.result === "normal" ? "норма" : test.result === "abnormal" ? "отклонение" : "",
                      test.note,
                    ]
                      .filter(Boolean)
                      .join(" — "),
                  ) ?? null,
                  "не проводились",
                ),
              )}
            />
            <Fact label="Откуда сведения" value={orDash(label(PERINATAL_INFORMANTS, p.informant))} />
          </Box>
        </Panel>
        <Panel title="Роды" action={edit("birth")}>
          <Box>
            <Fact label="Срок гестации" value={orDash(gestationText(profile?.gestationalAgeWeeks ?? null, profile?.gestationalAgeDays ?? null))} />
            <Fact label="Способ" value={orDash(delivery)} />
            {p.cesareanIndication && <Fact label="Показание" value={p.cesareanIndication} />}
            <Fact label="Предлежание" value={orDash(label(PRESENTATIONS, p.presentation).toLowerCase())} tone={p.presentation === "breech" ? "warn" : undefined} />
            <Fact label="Пособия" value={orDash(listText(p.obstetricAids?.map((aid) => OBSTETRIC_AIDS[aid].label.toLowerCase()) ?? null, "не применялись"))} />
            <Fact label="Длительность родов" value={orDash(p.laborDurationHours != null ? `${decimal(p.laborDurationHours)} ч` : "")} />
            <Fact label="Безводный период" value={orDash(p.ruptureIntervalHours != null ? `${decimal(p.ruptureIntervalHours)} ч` : "")} />
            <Fact
              label="Осложнения родов"
              value={orDash(
                listText(
                  p.deliveryComplications?.map((code) => (code === "other" ? p.deliveryComplicationsNote || "другое" : DELIVERY_COMPLICATIONS[code].label.toLowerCase())) ?? null,
                  "без осложнений",
                ),
              )}
            />
            <Fact label="Место родов" value={orDash(label(BIRTH_PLACES, p.birthPlace).toLowerCase())} />
          </Box>
        </Panel>
      </Box>
      {actions.canSeeSensitive && (
        <SensitiveCard
          title="Закрытые сведения — маркёры у матери"
          sensitive={model.input.sensitive}
          canEdit={actions.canManage}
          onEdit={actions.openSensitive}
          rows={(s) => [
            { label: "HBsAg", value: s.motherHbsag ? MARKER_WORD[s.motherHbsag] : "", tone: s.motherHbsag === "positive" ? "bad" : undefined },
            { label: "Анти-HCV", value: s.motherHcv ? MARKER_WORD[s.motherHcv] : "", tone: s.motherHcv === "positive" ? "bad" : undefined },
            { label: "ВИЧ", value: s.motherHiv ? MARKER_WORD[s.motherHiv] : "", tone: s.motherHiv === "positive" ? "bad" : undefined },
            { label: "Сифилис", value: s.motherSyphilis ? MARKER_WORD[s.motherSyphilis] : "", tone: s.motherSyphilis === "positive" ? "bad" : undefined },
          ]}
        />
      )}
      {!p.exists && (
        <Typography variant="body2" color="text.secondary">
          Беременность и роды ещё не заполнены.
        </Typography>
      )}
    </Stack>
  );
};
