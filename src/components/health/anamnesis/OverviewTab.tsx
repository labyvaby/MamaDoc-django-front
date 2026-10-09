import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";

import { AppButton } from "../../ui";
import { pedigreeClick, type AnamnesisActions, type AnamnesisModel } from "./anamnesisModel";
import { AssessmentGauges } from "./AssessmentGauges";
import { HeredityPanel } from "./HeredityPanel";
import { AttentionList, FamilyLifePanel, NewbornPanel } from "./OverviewPanels";
import { ParagraphBlock } from "./ParagraphBlock";
import { PregnancyTimeline } from "./PregnancyTimelineChart";
import { RiskGroupsBlock } from "./RiskGroupsBlock";
import { birthSummaryLine } from "./anamnesisView";

interface OverviewTabProps {
  model: AnamnesisModel;
  actions: AnamnesisActions;
  paragraphRef: React.Ref<HTMLDivElement>;
  /** Абзац для заключения раскрыт целиком. */
  paragraphOpen: boolean;
  onParagraphOpenChange: (open: boolean) => void;
}

/** «Обзор» как в макете (ТЗ §4.2). */
export const OverviewTab: React.FC<OverviewTabProps> = ({ model, actions, paragraphRef, paragraphOpen, onParagraphOpenChange }) => {
  const summary = birthSummaryLine(model.input);
  return (
    <Stack gap={2}>
      <AssessmentGauges
        genealogy={model.genealogy}
        bio={model.bio}
        social={model.social}
        canManage={actions.canManage}
        onOpen={(kind) => actions.openAssessment(kind)}
        onConfirmHigh={() => actions.openAssessment("biological", true)}
      />
      <RiskGroupsBlock
        records={model.input.riskGroups}
        suggestions={model.suggestions}
        birthDate={model.input.birthDate}
        at={model.at}
        frequentIll={model.frequentIll}
        canManage={actions.canManage}
        onOpenRecord={(record) => actions.openRisk({ mode: "card", record })}
        onEstablish={(suggestion) => actions.openRisk({ mode: "establish", group: suggestion.group, source: "suggested" })}
        onDecline={(suggestion) => actions.openRisk({ mode: "decline", group: suggestion.group })}
        onAdd={() => actions.openRisk({ mode: "establish", group: null, source: "manual" })}
      />
      <AttentionList flags={model.flags} />
      <Box>
        <Stack direction="row" gap={1.25} alignItems="baseline" flexWrap="wrap" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Беременность и роды
          </Typography>
          {summary && (
            <Typography variant="body2" color="text.secondary">
              {summary}
            </Typography>
          )}
        </Stack>
        {model.timeline.empty ? (
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ border: 1, borderColor: "divider", borderRadius: "12px", px: 1.5, py: 1.25 }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              Беременность и роды не заполнены — ось построится по неделям сама.
            </Typography>
            {actions.canManage && (
              <AppButton size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => actions.openPerinatal("pregnancy")}>
                Заполнить
              </AppButton>
            )}
          </Stack>
        ) : (
          <PregnancyTimeline layout={model.timeline} maxWidth={860} />
        )}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
        <NewbornPanel input={model.input} />
        <FamilyLifePanel input={model.input} at={model.at} />
      </Box>
      <HeredityPanel genealogy={model.genealogy} layout={model.pedigree} onNode={actions.canManage ? pedigreeClick(actions, model) : undefined} />
      <ParagraphBlock ref={paragraphRef} paragraph={model.paragraph} expanded={paragraphOpen} onExpandedChange={onParagraphOpenChange} />
    </Stack>
  );
};
