import React from "react";
import { Box, Divider, IconButton, Stack, Typography } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import dayjs from "dayjs";

import type { ProgramModuleRecord } from "../../../api/programs";
import { EXAM_TYPES, optionLabel, type Sex } from "./neuroCatalog";
import { conclusionLabel, type NeuroExam } from "./neuroData";
import { ageFor, ageText, levelRank, neuroAge, type AgeContext } from "./neuroNorms";
import { examFindings } from "./neuroSignals";
import { LevelChip } from "./NeuroControls";

const MAX_CHIPS = 4;

/**
 * Вкладка «Осмотры» (ТЗ §4): строки осмотров — дата, возраст, вид, врач,
 * цветные метки блоков по возрасту на дату осмотра, заключения с кодами;
 * нажатие — правка.
 */
export const NeuroHistory: React.FC<{
  exams: ReadonlyArray<NeuroExam>;
  ages: AgeContext;
  sex: Sex;
  canManage: boolean;
  onEdit: (record: ProgramModuleRecord) => void;
}> = ({ exams, ages, sex, canManage, onEdit }) => {
  if (!exams.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Осмотров пока нет.
      </Typography>
    );
  }
  return (
    <Stack divider={<Divider flexItem />} sx={{ border: 1, borderColor: "divider", borderRadius: "12px", overflow: "hidden" }}>
      {exams.map((exam) => {
        const at = exam.record.occurredAt;
        const age = neuroAge(ages, at);
        const findings = examFindings(exam, { age: ageFor(ages, at), date: at, sex, ages, corrected: age.corrected })
          .filter((item) => item.level !== "unknown")
          .sort((a, b) => levelRank(b.level) - levelRank(a.level));
        const conclusions = exam.conclusions.map((code) => conclusionLabel(code, sex)).filter(Boolean);
        const extra = exam.conclusionNote || (!exam.structured ? exam.conclusion : "");
        const date = dayjs(at).format("DD.MM.YYYY");
        const ageLine = age.passport == null ? "" : `${ageText(age.passport)}${age.corrected && age.months != null ? ` (скорр. ${ageText(age.months)})` : ""}`;
        return (
          <Stack
            key={exam.record.id}
            direction={{ xs: "column", md: "row" }}
            gap={1}
            alignItems={{ md: "center" }}
            sx={{ px: 1.5, py: 1.25, cursor: canManage ? "pointer" : "default", "&:hover": canManage ? { bgcolor: "action.hover" } : undefined }}
            onClick={canManage ? () => onEdit(exam.record) : undefined}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600}>
                {exam.record.title || optionLabel(EXAM_TYPES, exam.examType)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {[date, ageLine, exam.record.createdByName ?? "", exam.record.status === "missed" ? "пропущен" : ""].filter(Boolean).join(" · ")}
              </Typography>
              {(conclusions.length > 0 || extra) && (
                <Typography variant="caption" display="block">
                  {[...conclusions, extra].filter(Boolean).join("; ")}
                </Typography>
              )}
              {!exam.structured && exam.recommendation && (
                <Typography variant="caption" color="text.secondary" display="block">
                  Рекомендации: {exam.recommendation}
                </Typography>
              )}
            </Box>
            <Stack direction="row" gap={0.5} flexWrap="wrap" alignItems="center" justifyContent={{ md: "flex-end" }} sx={{ maxWidth: { md: "55%" } }}>
              {findings.slice(0, MAX_CHIPS).map((item) => (
                <LevelChip key={item.key} level={item.level} label={item.text} />
              ))}
              {findings.length > MAX_CHIPS && (
                <Typography variant="caption" color="text.secondary">
                  + ещё {findings.length - MAX_CHIPS}
                </Typography>
              )}
              {canManage && (
                <IconButton
                  size="small"
                  aria-label={`Изменить осмотр ${date}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(exam.record);
                  }}
                >
                  <EditOutlined fontSize="small" />
                </IconButton>
              )}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
};
