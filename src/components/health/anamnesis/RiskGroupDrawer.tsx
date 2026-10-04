import React from "react";
import { Alert, Box, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import ReportGmailerrorredOutlined from "@mui/icons-material/ReportGmailerrorredOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useSnackbar } from "notistack";

import {
  createRiskGroup,
  createRiskGroupReview,
  updateRiskGroup,
  type RiskGroup,
  type RiskGroupRecord,
  type RiskReviewDecision,
} from "../../../api/health";
import { ChipGroup, Section } from "../../../pages/patient-program/vision/VisionControls";
import { AppButton } from "../../ui";
import { HealthDrawerShell } from "../HealthDrawerShell";
import { useHealthScope } from "../useHealth";
import { Choice, DateInput } from "./anamnesisControls";
import { factorLabel, factorText, type Factor } from "./anamnesisFactors";
import { groupFactors, reviewPlan, reviewTerms } from "./anamnesisRules";
import { RISK_GROUP_META, RISK_GROUP_ORDER, RISK_STATUS_LABELS, REVIEW_DECISIONS, type AnamnesisInput } from "./anamnesisTypes";
import { Fact } from "./anamnesisUi";
import { dateText } from "./russian";
import { useApplyLifeAnamnesis } from "./useAnamnesis";
import { useFormReset } from "./useFormReset";

export type RiskDrawerState =
  | { mode: "establish"; group: RiskGroup | null; source: "suggested" | "manual" }
  | { mode: "decline"; group: RiskGroup }
  | { mode: "card"; record: RiskGroupRecord }
  | { mode: "review"; record: RiskGroupRecord };

interface RiskGroupDrawerProps {
  open: boolean;
  patientId: number;
  state: RiskDrawerState | null;
  input: AnamnesisInput;
  /** Текущие факторы ребёнка. */
  factors: Factor[];
  at: string;
  frequentIll?: boolean;
  onState: (state: RiskDrawerState) => void;
  onClose: () => void;
}

const today = () => dayjs().format("YYYY-MM-DD");

/** Окно группы риска (ТЗ §5.7): поставить, не ставить, карточка с пересмотрами, пересмотр. */
export const RiskGroupDrawer: React.FC<RiskGroupDrawerProps> = ({ open, patientId, state, input, factors, at, frequentIll, onState, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const apply = useApplyLifeAnamnesis(patientId);
  const [group, setGroup] = React.useState<RiskGroup | null>(null);
  const [date, setDate] = React.useState<string | null>(today());
  const [basis, setBasis] = React.useState<string[]>([]);
  const [note, setNote] = React.useState("");
  const [decision, setDecision] = React.useState<RiskReviewDecision | "">("");
  const [outcomeConditionId, setOutcomeConditionId] = React.useState<number | "">("");
  const [outcomeNote, setOutcomeNote] = React.useState("");

  const groupFactorList = React.useMemo(() => (group ? groupFactors(group, factors) : []), [group, factors]);

  const stateKey = state ? `${state.mode}:${"record" in state ? state.record.id : state.group ?? ""}` : "";
  useFormReset(open, stateKey, () => {
    if (!state) return;
    setDate(today());
    setNote("");
    setDecision("");
    setOutcomeConditionId("");
    setOutcomeNote("");
    if (state.mode === "establish" || state.mode === "decline") {
      setGroup(state.group);
      const current = state.group ? groupFactors(state.group, factors).map((factor) => factor.code) : [];
      setBasis(state.mode === "decline" || (state.mode === "establish" && state.source === "suggested") ? current : []);
    } else {
      setGroup(state.record.group);
      setBasis([]);
    }
  });

  const done = async (data: Awaited<ReturnType<typeof createRiskGroup>>, text: string) => {
    enqueueSnackbar(text, { variant: "success" });
    await apply(data);
    onClose();
  };
  const create = useMutation({
    mutationFn: (status: "active" | "declined") =>
      createRiskGroup(scope, patientId, {
        group: group as RiskGroup,
        status,
        establishedOn: (status === "declined" ? today() : date) as string,
        basis: status === "declined" ? groupFactorList.map((factor) => factor.code) : basis,
        basisNote: note.trim(),
        source: state?.mode === "establish" ? state.source : "suggested",
      }),
    onSuccess: (data, status) => done(data, status === "active" ? "Группа риска поставлена" : "Предложение отклонено"),
  });
  const update = useMutation({
    mutationFn: (status: "refuted" | "active") => updateRiskGroup(scope, patientId, (state as { record: RiskGroupRecord }).record.id, { status }),
    onSuccess: (data, status) => done(data, status === "refuted" ? "Группа отмечена как ошибочная" : "Группа снова в работе"),
  });
  const review = useMutation({
    mutationFn: () =>
      createRiskGroupReview(scope, patientId, (state as { record: RiskGroupRecord }).record.id, {
        reviewedOn: date as string,
        decision: decision as RiskReviewDecision,
        note: note.trim(),
        outcomeConditionId: decision === "realized" && outcomeConditionId !== "" ? outcomeConditionId : null,
        outcomeNote: decision === "realized" ? outcomeNote.trim() : "",
      }),
    onSuccess: (data) => done(data, decision === "keep" ? "Пересмотр записан" : decision === "remove" ? "Группа снята" : "Отмечено: реализовалась"),
  });
  const pending = create.isPending || update.isPending || review.isPending;
  const error = create.error ?? update.error ?? review.error;
  if (!state) return null;

  const birth = input.birthDate;
  const futureDate = date != null && dayjs(date).isAfter(dayjs(), "day");
  const beforeBirth = date != null && birth != null && dayjs(date).isBefore(dayjs(birth), "day");

  if (state.mode === "establish") {
    const busy = new Set(input.riskGroups.filter((record) => record.status === "active").map((record) => record.group));
    const choices = RISK_GROUP_ORDER.filter((code) => !busy.has(code) || code === group);
    const plan = birth && date ? reviewTerms(birth).filter((term) => dayjs(term.date).isAfter(dayjs(date), "day")).slice(0, 5) : [];
    return (
      <HealthDrawerShell
        open={open}
        title={group ? `Поставить: ${RISK_GROUP_META[group].short}` : "Группа риска"}
        subtitle={[group ? RISK_GROUP_META[group].label : "", state.source === "suggested" ? "по предложению системы" : "вручную"].filter(Boolean).join(" · ")}
        pending={pending}
        error={error}
        canSave={group != null && date != null && !futureDate && !beforeBirth && (basis.length > 0 || note.trim().length > 0)}
        saveLabel="Поставить"
        onSave={() => create.mutate("active")}
        onClose={onClose}
      >
        {state.group == null && (
          <Section title="Группа">
            <Choice<RiskGroup>
              options={choices.map((code) => ({ value: code, label: RISK_GROUP_META[code].label }))}
              value={group ?? ""}
              onChange={(value) => {
                setGroup(value || null);
                setBasis([]);
              }}
              tone={() => "warning"}
            />
          </Section>
        )}
        <DateInput label="Дата установки" value={date} onChange={setDate} helper={futureDate ? "Дата ещё не наступила" : beforeBirth ? "Раньше рождения" : "Можно раньше — например, дата патронажа"} />
        {group && (
          <Section title="Основание">
            {groupFactorList.length ? (
              <Stack>
                {groupFactorList.map((factor) => (
                  <FormControlLabel
                    key={factor.code}
                    control={
                      <Checkbox
                        size="small"
                        checked={basis.includes(factor.code)}
                        onChange={(event) =>
                          setBasis((current) => (event.target.checked ? [...current, factor.code] : current.filter((code) => code !== factor.code)))
                        }
                      />
                    }
                    label={<Typography variant="body2">{factorText(factor)}</Typography>}
                  />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Факторов этой группы в данных нет — укажите своё основание.
              </Typography>
            )}
          </Section>
        )}
        <TextField size="small" label="Своё основание, заметка" value={note} onChange={(event) => setNote(event.target.value)} multiline minRows={2} fullWidth />
        {plan.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            Плановые пересмотры: {plan.map((term) => `${term.label} (${dateText(term.date)})`).join(", ")}, дальше раз в год.
          </Typography>
        )}
      </HealthDrawerShell>
    );
  }

  if (state.mode === "decline") {
    return (
      <HealthDrawerShell
        open={open}
        title={`Не ставить: ${RISK_GROUP_META[state.group].short}`}
        subtitle="Предложение уйдёт в историю; снова появится только при новом факторе"
        pending={pending}
        error={error}
        canSave
        saveLabel="Не ставить"
        onSave={() => create.mutate("declined")}
        onClose={onClose}
      >
        <Section title="Сработавшие факторы">
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {groupFactorList.map((factor) => (
              <Typography key={factor.code} component="li" variant="body2">
                {factorText(factor)}
              </Typography>
            ))}
          </Box>
        </Section>
        <TextField
          size="small"
          label="Причина (необязательно)"
          placeholder="Например: скрининги и УЗИ без отклонений"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          multiline
          minRows={2}
          fullWidth
        />
      </HealthDrawerShell>
    );
  }

  const record = state.record;
  const plan = reviewPlan(record, birth, at, { frequentIll });

  if (state.mode === "review") {
    const established = record.establishedOn != null && date != null && dayjs(date).isBefore(dayjs(record.establishedOn), "day");
    const conditions = input.conditions;
    return (
      <HealthDrawerShell
        open={open}
        title={`Пересмотр: ${RISK_GROUP_META[record.group].short}`}
        subtitle={plan.next ? `Плановый срок — ${plan.next.label}, ${dateText(plan.next.date)}` : undefined}
        pending={pending}
        error={error}
        canSave={Boolean(decision) && date != null && !futureDate && !established}
        saveLabel="Записать пересмотр"
        onSave={() => review.mutate()}
        onClose={onClose}
      >
        <DateInput label="Дата пересмотра" value={date} onChange={setDate} helper={futureDate ? "Дата ещё не наступила" : established ? "Раньше установки группы" : undefined} />
        {plan.removalHint && (
          <Alert severity="info" variant="outlined">
            Подсказка системы: {plan.removalHint}. Снимает врач.
          </Alert>
        )}
        <Section title="Решение">
          <ChipGroup<RiskReviewDecision>
            options={REVIEW_DECISIONS}
            selected={decision ? [decision] : []}
            tone={(value) => (value === "keep" ? "warning" : value === "remove" ? "success" : "error")}
            onToggle={(value) => setDecision(decision === value ? "" : value)}
          />
        </Section>
        {decision === "realized" && (
          <>
            <TextField
              select
              size="small"
              label="Диагноз (необязательно)"
              value={outcomeConditionId}
              onChange={(event) => setOutcomeConditionId(event.target.value === "" ? "" : Number(event.target.value))}
              fullWidth
            >
              <MenuItem value="">
                <em>без диагноза</em>
              </MenuItem>
              {conditions.map((condition) => (
                <MenuItem key={condition.id} value={condition.id}>
                  {[condition.diagnosisCode, condition.title, condition.diagnosedOn ? dateText(condition.diagnosedOn) : ""].filter(Boolean).join(" · ")}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" label="Исход" value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} fullWidth />
          </>
        )}
        <TextField size="small" label="Заметка" value={note} onChange={(event) => setNote(event.target.value)} multiline minRows={2} fullWidth />
      </HealthDrawerShell>
    );
  }

  // Карточка группы
  const closed = record.status === "removed" || record.status === "realized";
  const decisionLabel = (value: RiskReviewDecision) => REVIEW_DECISIONS.find((option) => option.value === value)?.label ?? value;
  return (
    <HealthDrawerShell
      open={open}
      title={RISK_GROUP_META[record.group].label}
      subtitle={`Группа риска · ${RISK_STATUS_LABELS[record.status]}`}
      pending={pending}
      error={error}
      canSave={record.status === "active" || closed}
      saveLabel={closed ? "Вернуть в работу" : "Пересмотр"}
      onSave={() => (closed ? update.mutate("active") : onState({ mode: "review", record }))}
      onClose={onClose}
      footerStart={
        record.status !== "refuted" && record.status !== "declined" ? (
          <AppButton color="error" startIcon={<ReportGmailerrorredOutlined />} onClick={() => update.mutate("refuted")}>
            Ошибочно внесена
          </AppButton>
        ) : undefined
      }
    >
      <Box>
        <Fact label="Состояние" value={RISK_STATUS_LABELS[record.status]} tone={record.status === "realized" ? "bad" : record.status === "active" ? "warn" : "neutral"} />
        <Fact
          label="Установлена"
          value={
            record.establishedOn
              ? `${dateText(record.establishedOn)}${record.establishedBy ? `, ${record.establishedBy.fullName}` : ""}`
              : "перенесено из профиля здоровья"
          }
        />
        <Fact label="Как" value={record.source === "suggested" ? "по предложению системы" : record.source === "manual" ? "вручную" : "перенесено"} />
        {record.closedOn && <Fact label={record.status === "realized" ? "Реализовалась" : "Снята"} value={dateText(record.closedOn)} />}
        {record.outcomeCondition && (
          <Fact label="Диагноз" value={[record.outcomeCondition.diagnosisCode, record.outcomeCondition.title].filter(Boolean).join(" · ")} />
        )}
        {record.outcomeNote && <Fact label="Исход" value={record.outcomeNote} />}
        {record.status === "active" && plan.next && (
          <Fact
            label="Следующий пересмотр"
            value={`${plan.next.label}, ${dateText(plan.next.date)}${plan.state === "overdue" ? " — просрочен" : plan.state === "soon" ? " — скоро" : ""}`}
            tone={plan.state === "overdue" ? "bad" : plan.state === "soon" ? "warn" : undefined}
          />
        )}
      </Box>
      <Section title="Основание">
        {record.basis.length || record.basisNote ? (
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {record.basis.map((code) => (
              <Typography key={code} component="li" variant="body2">
                {code === "sensitive" ? "основание: сведения с ограниченным доступом" : factorLabel(code)}
              </Typography>
            ))}
            {record.basisNote && (
              <Typography component="li" variant="body2">
                {record.basisNote}
              </Typography>
            )}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Не указано
          </Typography>
        )}
      </Section>
      <Section title="Пересмотры">
        {record.reviews.length ? (
          <Stack gap={0.5}>
            {[...record.reviews]
              .sort((a, b) => a.reviewedOn.localeCompare(b.reviewedOn))
              .map((item) => (
                <Typography key={item.id} variant="body2">
                  {dateText(item.reviewedOn)} — {decisionLabel(item.decision).toLowerCase()}
                  {item.note ? ` · ${item.note}` : ""}
                  {item.reviewedBy ? ` · ${item.reviewedBy.fullName}` : ""}
                </Typography>
              ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Пересмотров ещё не было
          </Typography>
        )}
      </Section>
      {record.status === "active" && plan.terms.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          Плановые пересмотры: {plan.terms.slice(0, 5).map((term) => `${term.label} (${dateText(term.date)})`).join(", ")}, дальше раз в год.
        </Typography>
      )}
    </HealthDrawerShell>
  );
};
