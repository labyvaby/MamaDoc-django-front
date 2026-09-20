import React from "react";
import {
  Autocomplete,
  Box,
  Chip,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";

import { CustomDatePicker } from "../../ui";
import IntakeSection from "./IntakeSection";
import {
  INLINE_CHOICE_MAX,
  labQuestionFieldKind,
  labQuestionOptions,
  type LabQuestionOption,
} from "./labQuestionFields";
import type { LabQuestion } from "../../../api/lab";

type Props = {
  questions: LabQuestion[];
  answers: Record<number, string>;
  /** Название анализа по его id — вопросы группируются под анализом, к которому относятся. */
  testTitleById: ReadonlyMap<number, string>;
  loading: boolean;
  disabled: boolean;
  onAnswerChange: (questionId: number, value: string) => void;
};

/** Заголовок вопроса с пометкой обязательности — все вопросы обязательны, признака необязательности в контракте ЛИС нет. */
function QuestionLabel({ title }: { title: string }) {
  return (
    <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
      {title}
      <Typography component="span" color="error.main">
        {" *"}
      </Typography>
    </Typography>
  );
}

/**
 * Выбор одного варианта. Коротких перечней большинство — Да/Нет,
 * Женский/Мужской, Первичная/Вторичная — они рисуются кнопками в ряд:
 * видно все варианты разом, ответ в один клик. Длинные (страны, коды
 * исследований) — списком с поиском.
 */
const ChoiceField: React.FC<{
  options: LabQuestionOption[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}> = ({ options, value, disabled, onChange }) => {
  if (options.length <= INLINE_CHOICE_MAX) {
    return (
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value || null}
        disabled={disabled}
        onChange={(_e, next: string | null) => {
          // Повторный клик по выбранному MUI трактует как снятие — ответ
          // обязателен, снимать его незачем.
          if (next != null) onChange(next);
        }}
        sx={{ flexWrap: "wrap", "& .MuiToggleButton-root": { px: 1.5, textTransform: "none" } }}
      >
        {options.map((option) => (
          <ToggleButton key={option.value} value={option.value}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    );
  }
  const selected = options.find((option) => option.value === value) ?? null;
  return (
    <Autocomplete
      size="small"
      fullWidth
      options={options}
      value={selected}
      disabled={disabled}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(a, b) => a.value === b.value}
      onChange={(_e, next) => onChange(next?.value ?? "")}
      noOptionsText="Ничего не найдено"
      renderInput={(params) => <TextField {...params} placeholder="Выберите из списка" />}
    />
  );
};

/**
 * Обязательные поля ЛИС к выбранным анализам.
 *
 * У части анализов (бакпосевы, пренатальные скрининги, ПЦР на инфекции)
 * ЛИС не примет заказ без ответов: беременность, контроль до/после
 * лечения, данные второго участника. В её собственном интерфейсе это
 * жёлтая плашка «Обязательно заполнить все поля!» — здесь то же самое,
 * но под названием анализа, чтобы регистратор понимал, о чём именно
 * спрашивает лаборатория.
 *
 * Вид поля по вопросу — в `labQuestionFields.ts` (`labQuestionFieldKind`,
 * `labQuestionOptions`), покрыт тестами там. Здесь — только рендер по уже
 * вычисленному виду.
 */
const QuestionsSection: React.FC<Props> = ({
  questions,
  answers,
  testTitleById,
  loading,
  disabled,
  onAnswerChange,
}) => {
  // Группы в порядке первого появления анализа среди вопросов — ЛИС отдаёт
  // вопросы по анализам подряд, порядок корзины здесь ни к чему.
  const groups = React.useMemo(() => {
    const byTest = new Map<number, LabQuestion[]>();
    for (const question of questions) {
      const bucket = byTest.get(question.testId);
      if (bucket) bucket.push(question);
      else byTest.set(question.testId, [question]);
    }
    return [...byTest.entries()];
  }, [questions]);

  const unanswered = questions.filter((q) => !(answers[q.id] ?? "").trim()).length;

  // Вопросы есть лишь у части анализов (в зеркале — у ~40 из 2 400), и
  // пустая секция с надписью «вопросов нет» на каждом приёме только занимала
  // место и заставляла гадать, когда она вообще работает. Пока грузим —
  // показываем скелет, чтобы дровер не прыгал; нет вопросов — нет секции.
  if (!loading && questions.length === 0) return null;
  return (
    <IntakeSection
      title="Обязательные поля лаборатории"
      loading={loading}
      action={
        !loading && (
          <Chip
            size="small"
            color={unanswered > 0 ? "warning" : "success"}
            variant="outlined"
            label={unanswered > 0 ? `Не заполнено: ${unanswered}` : "Заполнено"}
          />
        )
      }
    >
      {loading ? (
        <Stack spacing={1}>
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Typography variant="caption" color="text.secondary">
            Лаборатория не примет заказ, пока эти поля пусты.
          </Typography>
          {groups.map(([testId, testQuestions]) => (
            <Stack key={testId} spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {testTitleById.get(testId) ?? "Анализ"}
              </Typography>
              {testQuestions.map((question) => {
                const value = answers[question.id] ?? "";
                const kind = labQuestionFieldKind(question);

                return (
                  <Box
                    key={question.id}
                    sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: 1 }}
                  >
                    <Stack spacing={0.75}>
                      <QuestionLabel title={question.title} />

                      {kind === "date" && (
                        <CustomDatePicker
                          value={value ? dayjs(value) : null}
                          onChange={(next) =>
                            onAnswerChange(
                              question.id,
                              next && next.isValid() ? next.format("YYYY-MM-DD") : "",
                            )
                          }
                          disabled={disabled}
                          slotProps={{ textField: { size: "small", fullWidth: true } }}
                        />
                      )}

                      {kind === "choice" && (
                        <ChoiceField
                          options={labQuestionOptions(question)}
                          value={value}
                          disabled={disabled}
                          onChange={(next) => onAnswerChange(question.id, next)}
                        />
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
                          placeholder={question.defaultValue || undefined}
                        />
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          ))}
        </Stack>
      )}
    </IntakeSection>
  );
};

export default QuestionsSection;
