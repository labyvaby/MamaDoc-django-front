import React from "react";
import { Box, ButtonBase, Stack, Typography, useTheme } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";

import type { FamilyMember } from "../../../api/health";
import { AppButton } from "../../ui";
import { pedigreeClick, type AnamnesisActions, type AnamnesisModel } from "./anamnesisModel";
import { RELATION_META, relationTitle } from "./anamnesisTypes";
import { toneText } from "./anamnesisTone";
import { Fact, Panel } from "./anamnesisUi";
import { directionLabel } from "./familyDiseases";
import { GenealogyCalc } from "./HeredityPanel";
import { PedigreeChart } from "./PedigreeChart";
import { hundredths } from "./russian";

const GENERATIONS: ReadonlyArray<{ value: number; title: string }> = [
  { value: 0, title: "0 — прабабушки и прадедушки" },
  { value: 1, title: "I — бабушки и дедушки" },
  { value: 2, title: "II — родители, тёти и дяди" },
  { value: 3, title: "III — братья, сёстры, двоюродные" },
];

function healthLine(member: FamilyMember): string {
  if (member.healthStatus === "ill") return member.diseases.length ? member.diseases.map((disease) => disease.title).join(", ") : "есть болезни — список не указан";
  if (member.healthStatus === "healthy") return member.sex === "female" ? "здорова" : "здоров";
  return "нет сведений";
}

/** Вкладка «Наследственность» (ТЗ §4.3, §4.4): родословная во всю ширину, легенда, ИО по группам, родственники по поколениям. */
export const HeredityTab: React.FC<{ model: AnamnesisModel; actions: AnamnesisActions }> = ({ model, actions }) => {
  const theme = useTheme();
  const { genealogy, pedigree } = model;
  const social = model.input.social;
  const blood = model.input.family.filter((member) => RELATION_META[member.relation]?.blood);
  const nonBlood = model.input.family.filter((member) => !RELATION_META[member.relation]?.blood);
  const row = (member: FamilyMember) => {
    const content = (
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "220px minmax(0, 1fr)" }, gap: { xs: 0, md: 1.5 }, px: 1.25, py: 0.75, width: "100%", textAlign: "left" }}>
        <Typography variant="body2" fontWeight={600}>
          {relationTitle(member)}
          {member.birthDate ? <Typography component="span" variant="caption" color="text.secondary">{` · ${member.birthDate.slice(0, 4)} г. р.`}</Typography> : null}
        </Typography>
        <Typography variant="body2" color={member.healthStatus === "ill" ? "text.primary" : "text.secondary"}>
          {healthLine(member)}
          {member.vitalStatus === "deceased" ? ` · ${member.sex === "female" ? "умерла" : "умер"}${member.deathAge != null ? ` в ${member.deathAge} г.` : ""}` : ""}
        </Typography>
      </Box>
    );
    return actions.canManage ? (
      <ButtonBase key={member.id} onClick={() => actions.openMember(member)} sx={{ display: "block", borderRadius: "8px", "&:hover": { bgcolor: "action.hover" } }}>
        {content}
      </ButtonBase>
    ) : (
      <Box key={member.id}>{content}</Box>
    );
  };
  return (
    <Stack gap={2}>
      <Panel
        title="Родословная"
        caption="строится сама из «Паспорта семьи»"
        action={
          actions.canManage ? (
            <AppButton size="small" startIcon={<AddOutlined />} onClick={() => actions.openMember(null)}>
              Родственник
            </AppButton>
          ) : undefined
        }
      >
        <PedigreeChart layout={pedigree} onNode={actions.canManage ? pedigreeClick(actions, model) : undefined} maxWidth={960} />
        {pedigree.legend.length > 0 && (
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {pedigree.legend.map((line) => (
              <Typography key={line} component="li" variant="body2">
                {line}
              </Typography>
            ))}
          </Box>
        )}
        <Typography variant="caption" color="text.secondary">
          Квадрат — мужчина, круг — женщина, ромб — пол не указан; закрашено — есть болезнь; «?» — нет сведений; перечёркнут — умер; стрелка — ребёнок;
          двойная линия — кровнородственный брак; пунктир с «+» — внести родственника.
        </Typography>
      </Panel>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
        <Panel title="Индекс отягощённости">
          <GenealogyCalc genealogy={genealogy} explain={false} />
          {genealogy.groups.length > 0 && (
            <Box sx={{ display: "grid", gap: 0.25 }}>
              {genealogy.groups.map((group) => (
                <Box
                  key={group.group}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 48px 56px",
                    gap: 1,
                    fontSize: 13.5,
                    py: 0.25,
                    color: group.direction ? toneText(theme, "warn") : "text.primary",
                    fontWeight: group.direction ? 600 : 400,
                  }}
                >
                  <span>{directionLabel(group.group)}</span>
                  <span>{group.count}</span>
                  <span>{hundredths(group.index)}</span>
                </Box>
              ))}
              <Typography variant="caption" color="text.secondary">
                Больше 0,4 — направленность отягощённости (выделено).
              </Typography>
            </Box>
          )}
          {genealogy.genetic && (
            <Typography variant="body2" sx={{ color: toneText(theme, "warn") }}>
              Наследственное заболевание в семье — обсудить консультацию генетика.
            </Typography>
          )}
        </Panel>
        <Panel
          title="О семье"
          action={
            actions.canManage ? (
              <AppButton size="small" startIcon={<EditOutlined />} onClick={actions.openSocial}>
                Изменить
              </AppButton>
            ) : undefined
          }
        >
          <Fact
            label="Брак родителей кровнородственный"
            value={social?.parentsConsanguineous === true ? `да${social.consanguinityNote ? ` (${social.consanguinityNote})` : ""}` : social?.parentsConsanguineous === false ? "нет" : "—"}
            tone={social?.parentsConsanguineous ? "warn" : undefined}
          />
          <Fact
            label="Смерть детей до года в семье"
            value={social?.infantDeathInFamily === true ? `да${social.infantDeathNote ? ` (${social.infantDeathNote})` : ""}` : social?.infantDeathInFamily === false ? "нет" : "—"}
            tone={social?.infantDeathInFamily ? "warn" : undefined}
          />
        </Panel>
      </Box>
      <Panel title="Родственники по поколениям">
        {blood.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Кровные родственники не внесены — начните с матери и отца.
          </Typography>
        )}
        {GENERATIONS.map((generation) => {
          const list = blood.filter((member) => RELATION_META[member.relation].generation === generation.value);
          if (!list.length) return null;
          return (
            <Box key={generation.value}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {generation.title}
              </Typography>
              <Stack gap={0.25}>{list.map(row)}</Stack>
            </Box>
          );
        })}
        {nonBlood.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Не кровные
            </Typography>
            <Stack gap={0.25}>{nonBlood.map(row)}</Stack>
          </Box>
        )}
      </Panel>
    </Stack>
  );
};
