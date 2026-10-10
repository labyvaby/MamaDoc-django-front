import React from "react";
import { Box, Divider, IconButton, Stack, Typography } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import dayjs from "dayjs";

import type { ProgramModuleRecord } from "../../../api/programs";
import { ROW_ACTIONS_CLASS, ShowAllButton, rowActionSx, rowActionsHostSx } from "../../../components/ui";
import { EXAM_TYPES, optionLabel } from "./orthoCatalog";
import { conclusionLabels, isFutureExam, type OrthoExam } from "./orthoData";
import { ageMonths, ageText, ageWeeks } from "./orthoNorms";
import { examSummary } from "./orthoSummary";
import { SummaryChips } from "./OrthoLatest";

const MAX_CHIPS = 4;
/** Сколько последних осмотров видно сразу. */
const LIMIT = 5;

/** Все осмотры, от новых к старым: дата, возраст, вид, врач, главные находки цветом. */
export const OrthoHistory: React.FC<{
  exams: OrthoExam[];
  birthDate: string | null;
  canManage: boolean;
  onEdit: (record: ProgramModuleRecord) => void;
}> = ({ exams, birthDate, canManage, onEdit }) => {
  const [all, setAll] = React.useState(false);
  const shown = all ? exams : exams.slice(0, LIMIT);
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        История осмотров
      </Typography>
      <Stack divider={<Divider flexItem />} sx={{ border: 1, borderColor: "divider", borderRadius: "12px", overflow: "hidden" }}>
        {shown.map((exam) => {
          const at = exam.record.occurredAt;
          const age = { months: ageMonths(birthDate, at), weeks: ageWeeks(birthDate, at) };
          const legacy = [exam.legacyPosture && `Осанка: ${exam.legacyPosture}`, exam.legacyFeet && `Стопы: ${exam.legacyFeet}`].filter(Boolean);
          const conclusions = conclusionLabels(exam.conclusions);
          const date = dayjs(at).format("DD.MM.YYYY");
          return (
            <Stack
              key={exam.record.id}
              direction={{ xs: "column", md: "row" }}
              gap={1}
              alignItems={{ md: "center" }}
              sx={{ px: 1.5, py: 1.25, ...rowActionsHostSx }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600}>
                  {exam.record.title || optionLabel(EXAM_TYPES, exam.examType)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {[date, ageText(age.months), exam.record.createdByName ?? "", exam.record.status === "missed" ? "пропущен" : ""]
                    .filter(Boolean)
                    .join(" · ")}
                  {isFutureExam(exam.record) && (
                    <Box component="span" sx={{ color: "warning.main" }}>
                      {" · дата в будущем — не считается последним осмотром"}
                    </Box>
                  )}
                </Typography>
                {(conclusions.length > 0 || legacy.length > 0) && (
                  <Typography variant="caption" display="block">
                    {[...conclusions, ...legacy].join("; ")}
                  </Typography>
                )}
              </Box>
              <Stack direction="row" gap={0.5} flexWrap="wrap" alignItems="center" justifyContent={{ md: "flex-end" }} sx={{ maxWidth: { md: "55%" } }}>
                {/* сначала отклонения, норма — одним чипом: важное видно без раскрытия */}
                <SummaryChips items={examSummary(exam, age)} max={MAX_CHIPS} />
                {canManage && (
                  <IconButton
                    size="small"
                    className={ROW_ACTIONS_CLASS}
                    aria-label={`Изменить осмотр ${date}`}
                    onClick={() => onEdit(exam.record)}
                    sx={rowActionSx}
                  >
                    <EditOutlined fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            </Stack>
          );
        })}
      </Stack>
      <ShowAllButton total={exams.length} limit={LIMIT} expanded={all} onToggle={() => setAll((value) => !value)} />
    </Box>
  );
};
