import React from "react";
import {
  Autocomplete,
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
  groupLabQuestions,
  labQuestionFieldKind,
  labQuestionOptions,
  type LabQuestionGroup,
  type LabQuestionOption,
} from "./labQuestionFields";
import type { LabQuestion } from "../../../api/lab";

type Props = {
  questions: LabQuestion[];
  /** Ответы по `lisQuestionId` — один на вопрос, сколько бы анализов его ни задавали. */
  answers: Record<number, string>;
  /** Название анализа по его id — под вопросом перечисляются анализы, которым он нужен. */
  testTitleById: ReadonlyMap<number, string>;
  loading: boolean;
  disabled: boolean;
  onAnswerChange: (lisQuestionId: number, value: string) => void;
};

/** Заголовок вопроса с пометкой обязательности — все вопросы обязательны, признака необязательности в контракте ЛИС нет. */
function QuestionLabel({ title }: { title: string }) {
  return (
    <Typography variant="body2" sx={{ lineHeight: 1.3, flex: 1, minWidth: 0 }}>
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
  /** Подпись поля для выпадающего списка; у кнопок подпись рисует родитель. */
  label?: string;
  onChange: (value: string) => void;
}> = ({ options, value, disabled, label, onChange }) => {
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
        sx={{
          flexWrap: "wrap",
          flexShrink: 0,
          "& .MuiToggleButton-root": {
            px: 1.5,
            py: 0.5,
            textTransform: "none",
          },
        }}
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
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required
          placeholder="Выберите из списка"
        />
      )}
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
  // Один вопрос — одно поле, даже если его задают несколько анализов
  // корзины: у заказа ответ на вопрос один (`groupLabQuestions`). Под
  // вопросом — чьи он, чтобы регистратор понимал, о чём спрашивает
  // лаборатория.
  const groups: LabQuestionGroup[] = React.useMemo(
    () => groupLabQuestions(questions),
    [questions]
  );
  // Подпись «чьи вопросы» — один раз на группу с одинаковым набором
  // анализов, а не под каждым вопросом.
  const ownerGroups = React.useMemo(() => {
    const byOwners = new Map<
      string,
      { owners: string; items: LabQuestionGroup[] }
    >();
    for (const group of groups) {
      const owners = group.testIds
        .map((id) => testTitleById.get(id) ?? "Анализ")
        .join(", ");
      const bucket = byOwners.get(owners);
      if (bucket) bucket.items.push(group);
      else byOwners.set(owners, { owners, items: [group] });
    }
    return [...byOwners.values()];
  }, [groups, testTitleById]);

  const unanswered = groups.filter(
    (g) => !(answers[g.lisQuestionId] ?? "").trim()
  ).length;

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
          {ownerGroups.map(({ owners, items }) => (
            <Stack key={owners} spacing={1}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600 }}
              >
                {owners}
              </Typography>
              {items.map(({ lisQuestionId, question }) => {
                const value = answers[lisQuestionId] ?? "";
                const kind = labQuestionFieldKind(question);
                const options =
                  kind === "choice" ? labQuestionOptions(question) : [];

                if (kind === "choice" && options.length <= INLINE_CHOICE_MAX) {
                  return (
                    <Stack
                      key={lisQuestionId}
                      direction="row"
                      alignItems="center"
                      gap={1.5}
                    >
                      <QuestionLabel title={question.title} />
                      <ChoiceField
                        options={options}
                        value={value}
                        disabled={disabled}
                        onChange={(next) => onAnswerChange(lisQuestionId, next)}
                      />
                    </Stack>
                  );
                }
                if (kind === "choice") {
                  return (
                    <ChoiceField
                      key={lisQuestionId}
                      label={question.title}
                      options={options}
                      value={value}
                      disabled={disabled}
                      onChange={(next) => onAnswerChange(lisQuestionId, next)}
                    />
                  );
                }
                if (kind === "date") {
                  return (
                    <CustomDatePicker
                      key={lisQuestionId}
                      label={question.title}
                      value={value ? dayjs(value) : null}
                      onChange={(next) =>
                        onAnswerChange(
                          lisQuestionId,
                          next && next.isValid()
                            ? next.format("YYYY-MM-DD")
                            : ""
                        )
                      }
                      disabled={disabled}
                      slotProps={{
                        textField: {
                          size: "small",
                          fullWidth: true,
                          required: true,
                        },
                      }}
                    />
                  );
                }
                return (
                  <TextField
                    key={lisQuestionId}
                    size="small"
                    fullWidth
                    required
                    label={question.title}
                    type={kind === "integer" ? "number" : undefined}
                    value={value}
                    onChange={(e) =>
                      onAnswerChange(lisQuestionId, e.target.value)
                    }
                    disabled={disabled}
                    placeholder={
                      kind === "text"
                        ? question.defaultValue || undefined
                        : undefined
                    }
                  />
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
