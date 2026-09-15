import React from "react";
import { Box, Skeleton, Stack, Switch, TextField, Typography } from "@mui/material";
import dayjs from "dayjs";

import { CustomDatePicker } from "../../ui";
import IntakeSection from "./IntakeSection";
import { labQuestionFieldKind } from "./labQuestionFields";
import type { LabQuestion } from "../../../api/lab";

type Props = {
  questions: LabQuestion[];
  answers: Record<number, string>;
  loading: boolean;
  disabled: boolean;
  onAnswerChange: (questionId: number, value: string) => void;
};

/**
 * Строковое представление ответа BOOLEAN не подтверждено ExpressLab (как и
 * код пола в `basketCatalog.ts`) — используем `"true"`/`"false"`. Контракт
 * уточнится, менять придётся только эти два места.
 */
const BOOLEAN_TRUE = "true";
const BOOLEAN_FALSE = "false";

/** Заголовок вопроса с пометкой обязательности — все вопросы обязательны, признака необязательности в контракте ЛИС нет. */
function QuestionLabel({ title }: { title: string }) {
  return (
    <Typography variant="body2" color="text.secondary" fontWeight={600}>
      {title}
      <Typography component="span" color="error.main">
        {" *"}
      </Typography>
    </Typography>
  );
}

/**
 * Дополнительные вопросы ЛИС к выбранным анализам.
 *
 * Вид поля по `fieldType` — в `labQuestionFields.ts` (`labQuestionFieldKind`),
 * покрыт тестами там. Здесь — только рендер по уже вычисленному виду.
 *
 * `SELECT` рисуется текстовым полем с подсказкой из `defaultValue`: контракт
 * ЛИС не передаёт варианты выбора, а без них настоящий `<select>` нечем
 * заполнить (см. `lab-frontend-design.md`, план Task 9).
 */
const QuestionsSection: React.FC<Props> = ({ questions, answers, loading, disabled, onAnswerChange }) => {
  // Вопросы есть лишь у части анализов (в зеркале — у ~170 из 2 400), и
  // пустая секция с надписью «вопросов нет» на каждом приёме только занимала
  // место и заставляла гадать, когда она вообще работает. Пока грузим —
  // показываем скелет, чтобы дровер не прыгал; нет вопросов — нет секции.
  if (!loading && questions.length === 0) return null;
  return (
    <IntakeSection title="Дополнительные вопросы" loading={loading}>
      {loading ? (
        <Stack spacing={1}>
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
        </Stack>
      ) : questions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Дополнительных вопросов нет
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {questions.map((question) => {
            const value = answers[question.id] ?? "";
            const kind = labQuestionFieldKind(question.fieldType);

            return (
              <Box
                key={question.id}
                sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: 1 }}
              >
                <Stack spacing={0.5}>
                  <QuestionLabel title={question.title} />

                  {kind === "date" && (
                    <CustomDatePicker
                      value={value ? dayjs(value) : null}
                      onChange={(next) =>
                        onAnswerChange(question.id, next && next.isValid() ? next.format("YYYY-MM-DD") : "")
                      }
                      disabled={disabled}
                      slotProps={{ textField: { size: "small", fullWidth: true } }}
                    />
                  )}

                  {kind === "boolean" && (
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Switch
                        size="small"
                        checked={value === BOOLEAN_TRUE}
                        onChange={(e) =>
                          onAnswerChange(question.id, e.target.checked ? BOOLEAN_TRUE : BOOLEAN_FALSE)
                        }
                        disabled={disabled}
                      />
                      <Typography variant="body2">
                        {value === BOOLEAN_TRUE ? "Да" : "Нет"}
                      </Typography>
                    </Stack>
                  )}

                  {kind === "integer" && (
                    <TextField
                      size="small"
                      fullWidth
                      type="number"
                      value={value}
                      onChange={(e) => onAnswerChange(question.id, e.target.value)}
                      disabled={disabled}
                    />
                  )}

                  {kind === "text" && (
                    <TextField
                      size="small"
                      fullWidth
                      value={value}
                      onChange={(e) => onAnswerChange(question.id, e.target.value)}
                      disabled={disabled}
                      helperText={
                        question.fieldType === "SELECT"
                          ? `Значение по умолчанию в ЛИС: ${question.defaultValue || "не задано"}`
                          : undefined
                      }
                    />
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </IntakeSection>
  );
};

export default QuestionsSection;
