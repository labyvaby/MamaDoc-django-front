import React from "react";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";

import type { FamilyMember } from "../../../api/health";
import { AppButton } from "../../ui";
import type { AnamnesisActions, AnamnesisModel } from "./anamnesisModel";
import { orDash } from "./anamnesisTone";
import { CLIMATE, EDUCATION, EMPLOYMENT, FAMILY_COMPOSITION, HABITS, HOUSING, INCOME, PETS, SANITARY, type Option } from "./anamnesisTypes";
import { Fact, Panel, ToneChip } from "./anamnesisUi";
import { SensitiveCard } from "./SensitiveCard";
import { dateText, fullYears, lowerFirst, plural } from "./russian";

const label = <T extends string>(options: ReadonlyArray<Option<T>>, value: T | ""): string =>
  options.find((option) => option.value === value)?.label ?? "";

const STATE_CHIP = {
  risk: { label: "риск", tone: "warn" },
  ok: { label: "нет риска", tone: "ok" },
  unknown: { label: "неизвестно", tone: "neutral" },
} as const;

const FROM_WHOM: Record<string, string> = {
  mother: "со слов матери",
  father: "со слов отца",
  other_representative: "со слов представителя",
  medical_record: "по медицинским документам",
};

function parentLine(member: FamilyMember, at: string): string {
  const age = fullYears(member.birthDate, at);
  const habits =
    member.habits == null ? "привычки не указаны" : member.habits.length ? member.habits.map((habit) => label(HABITS, habit).toLowerCase()).join(", ") : "привычек нет";
  return [
    age != null ? `${age} ${plural(age, "год", "года", "лет")}` : "",
    lowerFirst(label(EDUCATION, member.education)),
    lowerFirst(label(EMPLOYMENT, member.employment)),
    member.occupation,
    member.hasOccupationalHazards ? `профвредности${member.occupationalHazards ? `: ${member.occupationalHazards}` : ""}` : "",
    habits,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Вкладка «Семья и быт» (ТЗ §4.3): восемь параметров, родители, быт, дата и источник. */
export const FamilyTab: React.FC<{ model: AnamnesisModel; actions: AnamnesisActions }> = ({ model, actions }) => {
  const s = model.input.social;
  const parents = (["mother", "father"] as const).map((relation) => ({
    relation,
    member: model.input.family.find((member) => member.relation === relation) ?? null,
  }));
  const edit = actions.canManage ? (
    <AppButton size="small" startIcon={<EditOutlined />} onClick={actions.openSocial}>
      Изменить
    </AppButton>
  ) : undefined;
  return (
    <Stack gap={2}>
      <Panel title="Восемь параметров социального анамнеза" caption={model.social.restricted ? "часть сведений закрыта" : undefined} action={edit}>
        <Stack gap={0.5}>
          {model.social.params.map((param) => (
            <Box key={param.index} sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr) auto", md: "260px 120px minmax(0, 1fr)" }, gap: 1, alignItems: "baseline" }}>
              <Typography variant="body2">
                {param.index}. {param.title}
              </Typography>
              <Box>
                <ToneChip label={STATE_CHIP[param.state].label} tone={STATE_CHIP[param.state].tone} dot={param.state !== "unknown"} dense />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}>
                {param.reason}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Panel>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
        <Panel title="Родители" caption="из «Паспорта семьи»">
          <Stack gap={0.5}>
            {parents.map(({ relation, member }) => (
              <ButtonBase
                key={relation}
                disabled={!actions.canManage}
                onClick={() => actions.openMember(member, member ? null : { relation, line: "", sex: relation === "mother" ? "female" : "male" })}
                sx={{ justifyContent: "flex-start", textAlign: "left", borderRadius: "8px", px: 1, py: 0.75, "&:hover": { bgcolor: "action.hover" } }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    {relation === "mother" ? "Мать" : "Отец"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {member ? parentLine(member, model.at) : "не внесён(а) — нажмите, чтобы добавить"}
                  </Typography>
                </Box>
              </ButtonBase>
            ))}
          </Stack>
        </Panel>
        <Panel title="Быт" action={edit}>
          <Box>
            <Fact label="Состав семьи" value={orDash(s ? label(FAMILY_COMPOSITION, s.familyComposition).toLowerCase() : "")} />
            <Fact
              label="Жильё"
              value={orDash(s?.housing ? `${label(HOUSING, s.housing).toLowerCase()}${s.rooms ? `, ${s.rooms} ${plural(s.rooms, "комната", "комнаты", "комнат")}` : ""}` : "")}
            />
            <Fact label="Материальная обеспеченность" value={orDash(s ? label(INCOME, s.income).toLowerCase() : "")} tone={s?.income === "insufficient" ? "warn" : undefined} />
            <Fact label="Климат в семье" value={orDash(s ? label(CLIMATE, s.familyClimate).toLowerCase() : "")} tone={s?.familyClimate && s.familyClimate !== "favorable" ? "warn" : undefined} />
            <Fact label="Ребёнок желанный" value={orDash(s?.childWanted === true ? "да" : s?.childWanted === false ? "нет" : "")} />
            <Fact label="Санитарные условия" value={orDash(s ? label(SANITARY, s.sanitary).toLowerCase() : "")} />
            <Fact label="Дома курят" value={orDash(s?.smokingAtHome === true ? "да" : s?.smokingAtHome === false ? "нет" : "")} tone={s?.smokingAtHome ? "warn" : undefined} />
            <Fact label="Животные" value={orDash(s?.pets == null ? "" : s.pets.length ? s.pets.map((pet) => label(PETS, pet).toLowerCase()).join(", ") : "нет")} />
            <Fact
              label="Сведения собраны"
              value={orDash([s?.assessedOn ? dateText(s.assessedOn) : "", s?.informant ? FROM_WHOM[s.informant] ?? "" : ""].filter(Boolean).join(", "))}
            />
          </Box>
        </Panel>
      </Box>
      {actions.canSeeSensitive && (
        <SensitiveCard
          title="Закрытые сведения о семье"
          sensitive={model.input.sensitive}
          canEdit={actions.canManage}
          onEdit={actions.openSensitive}
          rows={(sensitive) => [
            {
              label: "Асоциальное поведение",
              value: sensitive.asocialFamily === true ? `да${sensitive.asocialNote ? `: ${sensitive.asocialNote}` : ""}` : sensitive.asocialFamily === false ? "нет" : "",
              tone: sensitive.asocialFamily ? "bad" : undefined,
            },
          ]}
        />
      )}
    </Stack>
  );
};
