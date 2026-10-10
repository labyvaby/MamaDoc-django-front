import React from "react";
import { Box, Button, Chip, IconButton, Link, Stack, TextField, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../../../components/ui";
import {
  ACTIVE_SPEECH,
  BABBLE,
  BEHAVIOR,
  BODY_SIDES,
  CK_RESULTS,
  CLONUS,
  COMPLAINTS,
  CONTACT,
  CRY,
  EYES,
  FACE,
  FINGER_NOSE,
  FONTANELLE_STATES,
  GAIT,
  HEAD_SHAPES,
  HEADACHE_FREQUENCY,
  HEADACHE_KINDS,
  HEARING,
  INTELLECT,
  INVOLUNTARY,
  MOOD,
  NPR_GROUPS,
  NPR_SPHERES,
  NYSTAGMUS,
  OBLIGATORY,
  ONR_LEVELS,
  PARESIS,
  POSTURE,
  QUESTIONNAIRE,
  REFLEX_STATES,
  ROMBERG,
  SCREENS,
  SEIZURE_KINDS,
  SENSORY,
  SLEEP_HOURS,
  SLEEP_PROBLEMS,
  SMALL_FONTANELLE,
  SPEECH,
  SPHERE_GRADES,
  STRABISMUS,
  STUDY_KINDS,
  STUDY_RESULTS,
  SUCKING,
  SUTURES,
  SYMMETRY,
  TENDON_LEVELS,
  TONE_PARTS,
  TONE_PATTERNS,
  TONE_SCORES,
  TONE_STATES,
  TONGUE,
  UNDERSTANDING,
  optionLabel,
  type Sex,
} from "./neuroCatalog";
import {
  allowedBlocks,
  blocksForAge,
  emptyCranial,
  emptyFontanelle,
  emptyHead,
  emptyMotor,
  emptyNpr,
  emptyPsyche,
  emptySeizures,
  emptySleep,
  emptyTone,
  filledBlocks,
  toggleExclusive,
  toggleSpeech,
  type CranialData,
  type FullBlock,
  type HeadData,
  type MotorData,
  type NeuroExamForm,
  type NprData,
  type PsycheData,
  type ReflexMark,
  type SleepData,
  type ToneData,
} from "./neuroData";
import {
  FADING_REFLEXES,
  LEVEL_WORD,
  REACTIONS,
  babinskiLevel,
  clonusLevel,
  enuresisLevel,
  fmt,
  nprGroupLevel,
  rangeText,
  reflexLevel,
  seizuresLevel,
  sleepLevel,
  sleepNorm,
  spheresLevel,
  tendonLevel,
  toneLevel,
  toneScoreLevel,
  toneStateLevel,
  worst,
  zhurbaLevel,
  type AgeContext,
  type NeuroLevel,
  type ReflexDef,
} from "./neuroNorms";
import { fontanelleText, type HeadInfo } from "./neuroSignals";
import { Block, BlockTitle, ChipGroup, MultiRow, NumberField, Row, YesNoRow } from "./NeuroControls";
import { LEVEL_TONE, pairGridSx } from "./neuroUi";

type Patch = (next: Partial<NeuroExamForm>) => void;

const BLOCK_TITLES: Record<FullBlock, string> = {
  complaints: "Жалобы",
  tone: "Тонус подробно",
  reflexes: "Безусловные рефлексы и установочные реакции",
  tendon: "Сухожильные и патологические рефлексы",
  cranial: "Черепные нервы",
  head: "Голова и родничок",
  motor: "Движения",
  psyche: "Психоэмоциональная сфера",
  speech: "Речь — заключение",
  npr: "Оценка НПР",
  sleep: "Сон и экраны",
  seizures: "Приступы",
  enuresis: "Энурез и головная боль",
  studies: "Результаты обследований",
};

interface FullExamProps {
  form: NeuroExamForm;
  patch: Patch;
  /** Возраст для норм на дату осмотра. */
  age: number | null;
  ages: AgeContext;
  sex: Sex;
  /** Дата осмотра (ISO). */
  at: string;
  /** По прежним осмотрам родничок уже закрыт. */
  fontanelleClosed: boolean;
  head: HeadInfo | null;
  canViewHealth: boolean;
  onOpenGrowth?: () => void;
  /** Родничок уже есть в быстром осмотре — здесь не повторяем его кнопки. */
  quickFontanelle?: boolean;
}

const until = (age: number | null, limit: number) => age == null || age < limit;
const from = (age: number | null, limit: number) => age == null || age >= limit;

// ── Тонус ────────────────────────────────────────────────────────────────────

const ToneBlock: React.FC<FullExamProps> = ({ form, patch, age }) => {
  const tone = form.tone ?? emptyTone();
  const set = (next: Partial<ToneData>) => patch({ tone: { ...tone, ...next } });
  const states = TONE_STATES.filter((item) => item.value !== "physiological" || until(age, 4) || tone.state === "physiological");
  const score = TONE_SCORES.find((item) => item.value === tone.score);
  return (
    <Block>
      <BlockTitle title={BLOCK_TITLES.tone} level={toneLevel(tone, age)} />
      <Row label="Вид" options={states} value={tone.state} onChange={(state) => set({ state })} level={(value) => toneStateLevel(value, age)} />
      {tone.state === "high" && <Row label="Повышен — каких мышц" options={TONE_PATTERNS} value={tone.pattern} onChange={(pattern) => set({ pattern })} />}
      <Row
        label="Распределение"
        options={SYMMETRY}
        value={tone.symmetry === "asym" ? null : tone.symmetry}
        onChange={(symmetry) => set({ symmetry })}
        level={(value) => (value === "equal" ? "ok" : "bad")}
        hint={tone.symmetry === "asym" ? "Отмечена асимметрия — уточните, где тонус выше" : undefined}
      />
      <MultiRow label="Где" options={TONE_PARTS} value={tone.parts} onChange={(parts) => set({ parts: parts as ToneData["parts"] })} />
      {(until(age, 12) || tone.score != null) && (
        <Row
          label="Баллы (Журба–Мастюкова)"
          options={TONE_SCORES}
          value={tone.score}
          onChange={(value) => set({ score: value })}
          level={(value) => toneScoreLevel(value)}
          hint={score ? `${score.value} — ${score.hint}` : "3 — симметричный, легко преодолевается; 0 — опистотонус, поза эмбриона или лягушки"}
        />
      )}
    </Block>
  );
};

// ── Рефлексы ─────────────────────────────────────────────────────────────────

const SIDE_CHOICES = BODY_SIDES.map((item) => ({ value: item.value, label: `слабее ${item.value}` }));

const ReflexRow: React.FC<{ def: ReflexDef; mark: ReflexMark | undefined; age: number | null; onChange: (mark: ReflexMark | null) => void }> = ({
  def,
  mark,
  age,
  onChange,
}) => {
  const options = def.code === "atnr" ? [...REFLEX_STATES, OBLIGATORY] : REFLEX_STATES;
  const hint = def.kind === "fading" ? `угасает ${rangeText(def.fade)}; тревожно после ${fmt(def.alarmAfter)}` : `появляется ${def.appears} мес`;
  return (
    <Stack direction={{ xs: "column", md: "row" }} gap={{ xs: 0.5, md: 1.5 }} alignItems={{ md: "flex-start" }}>
      <Box sx={{ minWidth: { md: 180 }, maxWidth: { md: 180 } }}>
        <Typography variant="body2">{def.label}</Typography>
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      </Box>
      <Stack gap={0.75} sx={{ flex: 1, minWidth: 0 }}>
        <ChipGroup
          label={def.label}
          options={options}
          selected={mark ? [mark.state] : []}
          tone={(state) => LEVEL_TONE[reflexLevel(def.code, { state, side: null }, age)]}
          onToggle={(state) => onChange(mark?.state === state ? null : { state, side: state === "asym" ? mark?.side ?? null : null })}
        />
        {mark?.state === "asym" && (
          <ChipGroup
            label={`${def.label}: где слабее`}
            options={SIDE_CHOICES}
            selected={mark.side ? [mark.side] : []}
            tone={() => "error"}
            onToggle={(side) => onChange({ ...mark, side: mark.side === side ? null : side })}
          />
        )}
      </Stack>
    </Stack>
  );
};

const ReflexesBlock: React.FC<FullExamProps> = ({ form, patch, age }) => {
  const set = (code: string, mark: ReflexMark | null) => {
    const next = { ...form.reflexes };
    if (mark) next[code] = mark;
    else delete next[code];
    patch({ reflexes: next });
  };
  const level = worst(...Object.entries(form.reflexes).map(([code, mark]) => reflexLevel(code, mark, age)));
  return (
    <Block>
      <BlockTitle title={BLOCK_TITLES.reflexes} level={level} note="сроки — врачу подтвердить" />
      <Typography variant="caption" color="text.secondary" fontWeight={700}>
        Должны угаснуть
      </Typography>
      {FADING_REFLEXES.map((def) => (
        <ReflexRow key={def.code} def={def} mark={form.reflexes[def.code]} age={age} onChange={(mark) => set(def.code, mark)} />
      ))}
      <Typography variant="caption" color="text.secondary" fontWeight={700}>
        Должны появиться
      </Typography>
      {REACTIONS.map((def) => (
        <ReflexRow key={def.code} def={def} mark={form.reflexes[def.code]} age={age} onChange={(mark) => set(def.code, mark)} />
      ))}
      <Typography variant="caption" color="text.secondary">
        Сосательный рефлекс отмечается в черепных нервах: «сосание и глотание».
      </Typography>
    </Block>
  );
};

// ── Сухожильные ──────────────────────────────────────────────────────────────

const TendonBlock: React.FC<FullExamProps> = ({ form, patch, age }) => {
  const tendon = form.tendon ?? { level: null, symmetry: null };
  const babinski = form.babinski ?? { right: false, left: false };
  const selected = [babinski.right ? "right" : "", babinski.left ? "left" : ""].filter(Boolean);
  const level = worst(
    tendonLevel(tendon.level, tendon.symmetry),
    clonusLevel(form.clonus),
    babinskiLevel(babinski, age),
    form.meningeal ? "urgent" : form.meningeal === false ? "ok" : null,
  );
  return (
    <Block>
      <BlockTitle title={BLOCK_TITLES.tendon} level={level} />
      <Row
        label="Сухожильные"
        options={TENDON_LEVELS}
        value={tendon.level}
        onChange={(value) => patch({ tendon: { ...tendon, level: value } })}
        level={(value) => (value === "normal" ? "ok" : "unknown")}
        hint="Без асимметрии — без цвета: оценку даёт врач в заключении"
      />
      <Row
        label="Симметрия"
        options={SYMMETRY}
        value={tendon.symmetry}
        onChange={(value) => patch({ tendon: { ...tendon, symmetry: value } })}
        level={(value) => (value === "equal" ? "ok" : "bad")}
      />
      <Row label="Клонус стоп" options={CLONUS} value={form.clonus} onChange={(clonus) => patch({ clonus })} level={(value) => clonusLevel(value)} />
      <MultiRow
        label="Симптом Бабинского"
        options={[
          { value: "right", label: "справа" },
          { value: "left", label: "слева" },
        ]}
        value={selected}
        onChange={(value) => patch({ babinski: { right: value.includes("right"), left: value.includes("left") } })}
        level={() => (age != null && age < 24 && babinski.right === babinski.left ? "unknown" : "bad")}
      />
      <YesNoRow
        label="Менингеальные знаки"
        value={form.meningeal}
        onChange={(meningeal) => patch({ meningeal })}
        yesLevel="urgent"
        noLevel="ok"
        hint={form.meningeal ? "Срочно: в стационар или к неврологу в тот же день" : undefined}
      />
    </Block>
  );
};

// ── Черепные нервы ───────────────────────────────────────────────────────────

const CranialBlock: React.FC<FullExamProps> = ({ form, patch, age }) => {
  const cranial = form.cranial ?? emptyCranial();
  const set = (next: Partial<CranialData>) => patch({ cranial: { ...cranial, ...next } });
  const level = worst(
    cranial.tongue === "fasciculations" ? "bad" : null,
    cranial.sucking === "weak" && age != null && age < 1 ? "bad" : null,
    cranial.sunset ? "bad" : null,
  );
  return (
    <Block>
      <BlockTitle title={BLOCK_TITLES.cranial} level={level} />
      <Row label="Глазные щели и зрачки" options={EYES} value={cranial.eyes} onChange={(eyes) => set({ eyes })} level={(value) => (value === "equal" ? "ok" : "unknown")} />
      <Row
        label="Косоглазие"
        options={STRABISMUS}
        value={cranial.strabismus}
        onChange={(strabismus) => set({ strabismus })}
        level={(value) => (value === "none" ? "ok" : value === "intermittent" && until(age, 4) ? "ok" : "unknown")}
        hint={
          cranial.strabismus === "constant"
            ? "Постоянное косоглазие — оценка и наблюдение в разделе «Зрение»"
            : cranial.strabismus === "intermittent"
              ? "Непостоянное допустимо до 3–4 мес"
              : undefined
        }
      />
      <Row label="Нистагм" options={NYSTAGMUS} value={cranial.nystagmus} onChange={(nystagmus) => set({ nystagmus })} level={(value) => (value === "none" ? "ok" : "unknown")} />
      <YesNoRow label="«Заходящее солнце»" value={cranial.sunset ? true : null} onChange={(value) => set({ sunset: value === true })} yesLevel="bad" />
      <Row label="Лицо" options={FACE} value={cranial.face} onChange={(face) => set({ face })} level={(value) => (value === "symmetric" ? "ok" : "unknown")} />
      <Row label="Слух" options={HEARING} value={cranial.hearing} onChange={(hearing) => set({ hearing })} level={(value) => (value === "reacts" ? "ok" : "unknown")} />
      {(until(age, 12) || cranial.sucking) && (
        <Row
          label="Сосание и глотание"
          options={SUCKING}
          value={cranial.sucking}
          onChange={(sucking) => set({ sucking })}
          level={(value) => (value === "active" ? "ok" : value === "weak" && age != null && age < 1 ? "bad" : "unknown")}
        />
      )}
      {(until(age, 12) || cranial.cry) && <Row label="Крик" options={CRY} value={cranial.cry} onChange={(cry) => set({ cry })} level={(value) => (value === "loud" ? "ok" : "unknown")} />}
      <Row
        label="Язык"
        options={TONGUE}
        value={cranial.tongue}
        onChange={(tongue) => set({ tongue })}
        level={(value) => (value === "midline" ? "ok" : value === "fasciculations" ? "bad" : "unknown")}
        hint={cranial.tongue === "fasciculations" ? "Признак спинальной мышечной атрофии" : undefined}
      />
    </Block>
  );
};

// ── Голова ───────────────────────────────────────────────────────────────────

/** Родничок: размер a × b и состояние — общий с быстрым осмотром. */
export const FontanelleFields: React.FC<{
  head: HeadData | null;
  onChange: (head: HeadData) => void;
  levelOf: (state: HeadData["fontanelle"]) => NeuroLevel;
  withClosedDate?: boolean;
  birthDate: string | null;
  at: string;
}> = ({ head, onChange, levelOf, withClosedDate = false, birthDate, at }) => {
  const current = head ?? emptyHead();
  const f = current.fontanelle ?? emptyFontanelle();
  const set = (next: Partial<typeof f>) => onChange({ ...current, fontanelle: { ...f, ...next } });
  const mean = f.a != null && f.b != null ? (f.a + f.b) / 2 : null;
  return (
    <Stack gap={1}>
      <Row
        label="Большой родничок"
        options={FONTANELLE_STATES}
        value={f.state}
        onChange={(state) => set({ state, closedOn: state === "closed" ? f.closedOn : null })}
        level={(state) => levelOf({ ...f, state })}
      />
      {f.state !== "closed" && (
        <Box sx={{ ...pairGridSx, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <NumberField label="a" unit="см" value={f.a} onChange={(a) => set({ a })} step={0.5} min={0} max={6} />
          <NumberField label="b" unit="см" value={f.b} onChange={(b) => set({ b })} step={0.5} min={0} max={6} />
        </Box>
      )}
      {f.state !== "closed" && (
        <Typography variant="caption" color="text.secondary">
          {mean != null ? `Средний размер (a + b) / 2 = ${fmt(mean)} см (AFP 2003)` : "Размер — по желанию"}
        </Typography>
      )}
      {withClosedDate && f.state === "closed" && (
        <Box sx={{ maxWidth: 260 }}>
          <CustomDatePicker
            label="Закрылся"
            value={f.closedOn ? dayjs(f.closedOn) : null}
            minDate={birthDate ? dayjs(birthDate) : undefined}
            maxDate={dayjs(at)}
            onChange={(value) => {
              const date = value as Dayjs | null;
              set({ closedOn: date && date.isValid() ? date.format("YYYY-MM-DD") : null });
            }}
            slotProps={{ textField: { size: "small", fullWidth: true } }}
          />
        </Box>
      )}
    </Stack>
  );
};

const HeadBlock: React.FC<FullExamProps & { fontanelleLevelOf: (state: HeadData["fontanelle"]) => NeuroLevel }> = (props) => {
  const { form, patch, age, ages, head, canViewHealth, onOpenGrowth, at, fontanelleLevelOf, quickFontanelle } = props;
  const current = form.head ?? emptyHead();
  const set = (next: Partial<HeadData>) => patch({ head: { ...current, ...next } });
  const fontanelle = current.fontanelle ?? emptyFontanelle();
  return (
    <Block>
      <BlockTitle title={BLOCK_TITLES.head} level={fontanelleLevelOf(current.fontanelle)} note={fontanelleText(current, ages.birthDate) || undefined} />
      <Row label="Форма" options={HEAD_SHAPES} value={current.shape} onChange={(shape) => set({ shape })} level={(value) => (value === "normal" ? "ok" : "unknown")} />
      {quickFontanelle ? (
        <>
          <Typography variant="caption" color="text.secondary">
            Большой родничок — состояние и размер отмечаются выше, в быстром осмотре.
          </Typography>
          {fontanelle.state === "closed" && (
            <Box sx={{ maxWidth: 260 }}>
              <CustomDatePicker
                label="Родничок закрылся"
                value={fontanelle.closedOn ? dayjs(fontanelle.closedOn) : null}
                minDate={ages.birthDate ? dayjs(ages.birthDate) : undefined}
                maxDate={dayjs(at)}
                onChange={(value) => {
                  const date = value as Dayjs | null;
                  set({ fontanelle: { ...fontanelle, closedOn: date && date.isValid() ? date.format("YYYY-MM-DD") : null } });
                }}
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </Box>
          )}
        </>
      ) : (
        <FontanelleFields head={current} onChange={(next) => patch({ head: next })} levelOf={fontanelleLevelOf} withClosedDate birthDate={ages.birthDate} at={at} />
      )}
      {(until(age, 3) || current.smallFontanelle) && (
        <Row label="Малый родничок" options={SMALL_FONTANELLE} value={current.smallFontanelle} onChange={(smallFontanelle) => set({ smallFontanelle })} hint="Закрывается к 2 мес" />
      )}
      <Row label="Швы" options={SUTURES} value={current.sutures} onChange={(sutures) => set({ sutures })} level={(value) => (value === "normal" ? "ok" : "unknown")} />
      <Typography variant="body2" color="text.secondary">
        {!canViewHealth
          ? "Окружность головы — в «Росте»: нет доступа к медкарте."
          : head
            ? `Окружность головы ${fmt(head.latest.cm)} см (${dayjs(head.latest.at).format("DD.MM.YYYY")}) — ${head.level === "unknown" ? "без оценки" : LEVEL_WORD[head.level]}, из «Роста».`
            : "Замеров окружности головы в «Росте» нет."}{" "}
        {canViewHealth && onOpenGrowth && (
          <Link component="button" type="button" onClick={onOpenGrowth} underline="hover">
            Внести замер
          </Link>
        )}
      </Typography>
    </Block>
  );
};

// ── Движения ─────────────────────────────────────────────────────────────────

const MotorBlock: React.FC<FullExamProps> = ({ form, patch, age }) => {
  const motor = form.motor ?? emptyMotor();
  const set = (next: Partial<MotorData>) => patch({ motor: { ...motor, ...next } });
  const coordination = motor.coordination ?? { fingerNose: null, romberg: null, clumsy: false };
  const level: NeuroLevel = motor.paresis == null ? "unknown" : motor.paresis === "none" ? "ok" : "bad";
  return (
    <Block>
      <BlockTitle title={BLOCK_TITLES.motor} level={level} />
      <Row label="Парез" options={PARESIS} value={motor.paresis} onChange={(paresis) => set({ paresis })} level={(value) => (value === "none" ? "ok" : "bad")} />
      {(motor.paresis === "mono" || motor.paresis === "hemi") && (
        <Row label="Сторона" options={BODY_SIDES} value={motor.paresisSide} onChange={(paresisSide) => set({ paresisSide })} level={() => "bad"} />
      )}
      <MultiRow label="Непроизвольные движения" options={INVOLUNTARY} value={motor.involuntary} onChange={(involuntary) => set({ involuntary })} />
      {motor.involuntary.includes("tremor_cry") && (
        <Typography variant="caption" color="text.secondary">
          Тремор подбородка и рук при плаче до 3 мес — норма.
        </Typography>
      )}
      {(from(age, 12) || motor.gait) && <Row label="Походка" options={GAIT} value={motor.gait} onChange={(gait) => set({ gait })} level={(value) => (value === "normal" ? "ok" : "unknown")} />}
      {(from(age, 36) || motor.coordination) && (
        <>
          <Row
            label="Пальценосовая проба"
            options={FINGER_NOSE}
            value={coordination.fingerNose}
            onChange={(fingerNose) => set({ coordination: { ...coordination, fingerNose } })}
            level={(value) => (value === "ok" ? "ok" : "unknown")}
          />
          <Row
            label="Поза Ромберга"
            options={ROMBERG}
            value={coordination.romberg}
            onChange={(romberg) => set({ coordination: { ...coordination, romberg } })}
            level={(value) => (value === "stable" ? "ok" : "unknown")}
          />
          <YesNoRow label="Неловкость" value={coordination.clumsy ? true : null} onChange={(value) => set({ coordination: { ...coordination, clumsy: value === true } })} />
        </>
      )}
      <YesNoRow label="Кривошея" value={motor.torticollis ? true : null} onChange={(value) => set({ torticollis: value === true })} />
      <Row label="Осанка" options={POSTURE} value={motor.posture} onChange={(posture) => set({ posture })} hint="Подробно — в «Опорно-двигательной»" />
    </Block>
  );
};

// ── Психоэмоциональная сфера ─────────────────────────────────────────────────

const PsycheBlock: React.FC<FullExamProps & { showAll: boolean }> = ({ form, patch, age, showAll }) => {
  const psyche = form.psyche ?? emptyPsyche();
  const set = (next: Partial<PsycheData>) => patch({ psyche: { ...psyche, ...next } });
  const dev = psyche.devAge ?? { cognitive: null, motor: null, speech: null };
  const young = until(age, 60);
  const old = from(age, 60);
  const questionnaire = showAll || form.questionnaire != null || age == null || (age >= 16 && age <= 30);
  return (
    <Block>
      <BlockTitle
        title={BLOCK_TITLES.psyche}
        level={form.questionnaire === "positive" ? "bad" : form.questionnaire === "negative" ? "ok" : "unknown"}
        note="по форме 030-ПО/у"
      />
      {young && (
        <>
          <Row label="Гуление и лепет" options={BABBLE} value={psyche.babble} onChange={(babble) => set({ babble })} />
          <Row label="Понимание речи" options={UNDERSTANDING} value={psyche.understanding} onChange={(understanding) => set({ understanding })} />
          <Row label="Активная речь" options={ACTIVE_SPEECH} value={psyche.activeSpeech} onChange={(activeSpeech) => set({ activeSpeech })} />
          <YesNoRow label="Коммуникативные нарушения" value={psyche.communication} onChange={(communication) => set({ communication })} noLevel="ok" />
          <YesNoRow label="Эмоциональные нарушения" value={psyche.emotional} onChange={(emotional) => set({ emotional })} noLevel="ok" />
          <YesNoRow label="Когнитивные нарушения" value={psyche.cognitive} onChange={(cognitive) => set({ cognitive })} noLevel="ok" />
          <Row label="Сенсорное развитие" options={SENSORY} value={psyche.sensory} onChange={(sensory) => set({ sensory })} />
          <Box>
            <Typography variant="body2" sx={{ mb: 0.75 }}>
              «Возраст развития», мес
            </Typography>
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
              <NumberField label="Познавательная" value={dev.cognitive} onChange={(cognitive) => set({ devAge: { ...dev, cognitive } })} step={1} min={0} max={84} />
              <NumberField label="Моторика" value={dev.motor} onChange={(motor) => set({ devAge: { ...dev, motor } })} step={1} min={0} max={84} />
              <NumberField label="Речь" value={dev.speech} onChange={(speech) => set({ devAge: { ...dev, speech } })} step={1} min={0} max={84} />
            </Box>
          </Box>
        </>
      )}
      {old && (
        <>
          <Row label="Доступность контакту" options={CONTACT} value={psyche.contact} onChange={(contact) => set({ contact })} />
          <Row label="Фон настроения" options={MOOD} value={psyche.mood} onChange={(mood) => set({ mood })} />
          <Row label="Интеллект" options={INTELLECT} value={psyche.intellect} onChange={(intellect) => set({ intellect })} />
          <YesNoRow label="Когнитивные нарушения" value={psyche.cognitiveDisorders} onChange={(cognitiveDisorders) => set({ cognitiveDisorders })} noLevel="ok" />
          <YesNoRow label="Нарушения учебных навыков" value={psyche.learningDisorders} onChange={(learningDisorders) => set({ learningDisorders })} noLevel="ok" />
        </>
      )}
      <MultiRow label="Особенности поведения" options={BEHAVIOR} value={psyche.behavior} onChange={(behavior) => set({ behavior })} />
      {questionnaire && (
        <Row
          label="Анкета родителей (вне CRM)"
          options={QUESTIONNAIRE}
          value={form.questionnaire}
          onChange={(value) => patch({ questionnaire: value })}
          level={(value) => (value === "positive" ? "bad" : value === "negative" ? "ok" : "unknown")}
          hint="Анкета на риск нарушений развития в 16–30 мес проводится вне CRM. Положительная: в 1 г 6 мес — к неврологу, в 2 года — к психиатру."
        />
      )}
    </Block>
  );
};

// ── Речь ─────────────────────────────────────────────────────────────────────

const SpeechBlock: React.FC<FullExamProps> = ({ form, patch }) => {
  const regression = form.speech.includes("regression");
  const normal = form.speech.length === 1 && form.speech[0] === "normal";
  const level: NeuroLevel = !form.speech.length ? "unknown" : regression ? "urgent" : normal ? "ok" : "warn";
  return (
    <Block>
      <BlockTitle title={BLOCK_TITLES.speech} level={level} />
      <ChipGroup
        label="Заключение по речи"
        options={SPEECH}
        selected={form.speech}
        tone={(value) => (value === "normal" ? "success" : value === "regression" ? "error" : "warning")}
        onToggle={(value) => patch(toggleSpeech(form, value))}
      />
      {form.speech.includes("onr") && <Row label="Уровень ОНР" options={ONR_LEVELS} value={form.onrLevel} onChange={(onrLevel) => patch({ onrLevel })} />}
      <Typography variant="caption" color="text.secondary">
        Пункт с кодом МКБ-10 сразу добавляется в заключение осмотра — его можно убрать. Регресс речи — срочно, как утрата навыка.
      </Typography>
    </Block>
  );
};

// ── Оценка НПР ───────────────────────────────────────────────────────────────

const NprBlock: React.FC<FullExamProps & { showAll: boolean }> = ({ form, patch, age, showAll }) => {
  const npr = form.npr ?? emptyNpr();
  const set = (next: Partial<NprData>) => patch({ npr: { ...npr, ...next } });
  const spheres = npr.spheres ?? {};
  const deviations = NPR_SPHERES.filter((item) => spheres[item.value] === "deviation").map((item) => item.label);
  const showZhurba = showAll || until(age, 12) || npr.zhurba != null;
  const showGroup = showAll || until(age, 36) || npr.group != null;
  const showSpheres = showAll || age == null || (age >= 48 && age < 84) || Object.keys(spheres).length > 0;
  const level = worst(zhurbaLevel(npr.zhurba), nprGroupLevel(npr.group), spheresLevel(spheres));
  return (
    <Block>
      <BlockTitle title={BLOCK_TITLES.npr} level={level} />
      {showZhurba && (
        <Box sx={{ maxWidth: 280 }}>
          <NumberField
            label="Журба–Мастюкова, баллы"
            value={npr.zhurba}
            onChange={(zhurba) => set({ zhurba: zhurba == null ? null : Math.round(zhurba) })}
            step={1}
            min={0}
            max={30}
            status={zhurbaLevel(npr.zhurba) === "urgent" ? "bad" : (zhurbaLevel(npr.zhurba) as "ok" | "warn" | "bad" | "unknown")}
            hint={npr.zhurba != null ? `${LEVEL_WORD[zhurbaLevel(npr.zhurba)]}: 27–30 — норма, 23–26 — риск, 22 и меньше — задержка` : "до 1 года; 0–30"}
          />
        </Box>
      )}
      {showGroup && (
        <Row
          label="Группа НПР (до 3 лет)"
          options={NPR_GROUPS}
          value={npr.group}
          onChange={(group) => set({ group })}
          level={(value) => nprGroupLevel(value)}
          hint="I — норма или опережение; II — отставание на 1 эпикризный срок; III — на 2; IV — на 3"
        />
      )}
      {showSpheres && (
        <>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            Пять сфер, 4–6 лет
          </Typography>
          {NPR_SPHERES.map((sphere) => (
            <Row
              key={sphere.value}
              label={sphere.label[0].toUpperCase() + sphere.label.slice(1)}
              options={SPHERE_GRADES}
              value={spheres[sphere.value] ?? null}
              onChange={(grade) => {
                const next = { ...spheres };
                if (grade) next[sphere.value] = grade;
                else delete next[sphere.value];
                set({ spheres: next });
              }}
              level={(grade) => (grade === "norm" ? "ok" : "warn")}
            />
          ))}
          {Object.keys(spheres).length > 0 && (
            <Typography variant="body2" fontWeight={600}>
              {deviations.length ? `НПР с отклонениями в: ${deviations.join(", ")}` : "НПР соответствует возрасту"}
            </Typography>
          )}
        </>
      )}
    </Block>
  );
};

// ── Сон и экраны ─────────────────────────────────────────────────────────────

const SleepBlock: React.FC<FullExamProps> = ({ form, patch, age }) => {
  const sleep = form.sleep ?? emptySleep();
  const set = (next: Partial<SleepData>) => patch({ sleep: { ...sleep, ...next } });
  const norm = sleepNorm(age);
  return (
    <Block>
      <BlockTitle title={BLOCK_TITLES.sleep} level={sleepLevel(sleep.hours, age)} note={norm ? `норма ВОЗ — ${norm[0]}–${norm[1]} ч` : "с 5 лет — без оценки"} />
      <Row label="Сон за сутки, ч" options={SLEEP_HOURS} value={sleep.hours} onChange={(hours) => set({ hours })} level={(value) => sleepLevel(value, age)} />
      <Box sx={{ maxWidth: 220 }}>
        <NumberField label="Своё число" unit="ч" value={sleep.hours} onChange={(hours) => set({ hours })} step={0.5} min={4} max={22} />
      </Box>
      <MultiRow label="Трудности" options={SLEEP_PROBLEMS} value={sleep.problems} onChange={(problems) => set({ problems })} />
      <Row
        label="Экраны в день"
        options={SCREENS}
        value={form.screens}
        onChange={(screens) => patch({ screens })}
        hint="ВОЗ: до 2 лет — без экранов, в 2–4 года — не больше 1 ч в день"
      />
    </Block>
  );
};

// ── Приступы ─────────────────────────────────────────────────────────────────

const SeizuresBlock: React.FC<FullExamProps> = ({ form, patch }) => {
  const seizures = form.seizures ?? emptySeizures();
  const marked = seizures.kinds.length > 0 || seizures.lastOn != null || seizures.frequency.trim() !== "";
  const [open, setOpen] = React.useState(marked);
  const set = (next: Partial<typeof seizures>) => patch({ seizures: { ...seizures, ...next } });
  return (
    <Block>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <BlockTitle title={BLOCK_TITLES.seizures} level={seizuresLevel(seizures.kinds)} note={marked ? undefined : "не отмечено"} />
        {!marked && (
          <Button size="small" onClick={() => setOpen((value) => !value)} sx={{ textTransform: "none", mb: 1 }} endIcon={<ExpandMoreOutlined sx={{ transform: open ? "rotate(180deg)" : "none" }} />}>
            {open ? "Свернуть" : "Отметить"}
          </Button>
        )}
      </Stack>
      {(open || marked) && (
        <>
          <MultiRow
            label="Какие"
            options={SEIZURE_KINDS}
            value={seizures.kinds}
            onChange={(kinds) => set({ kinds })}
            level={(kind) => (kind === "afebrile" || kind === "unclear" ? "bad" : "warn")}
          />
          <Box sx={pairGridSx}>
            <CustomDatePicker
              label="Последний"
              value={seizures.lastOn ? dayjs(seizures.lastOn) : null}
              maxDate={dayjs()}
              onChange={(value) => {
                const date = value as Dayjs | null;
                set({ lastOn: date && date.isValid() ? date.format("YYYY-MM-DD") : null });
              }}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
            <TextField size="small" label="Частота" value={seizures.frequency} onChange={(event) => set({ frequency: event.target.value })} />
          </Box>
        </>
      )}
    </Block>
  );
};

// ── Энурез и головная боль ───────────────────────────────────────────────────

const EnuresisBlock: React.FC<FullExamProps & { showAll: boolean }> = ({ form, patch, age, showAll }) => {
  const headache = form.headache ?? { kind: null, frequency: null };
  return (
    <Block>
      <BlockTitle title={BLOCK_TITLES.enuresis} level={enuresisLevel(form.enuresis, age)} />
      {(showAll || from(age, 60) || form.enuresis != null) && (
        <YesNoRow
          label="Энурез"
          value={form.enuresis}
          onChange={(enuresis) => patch({ enuresis })}
          yesLevel={enuresisLevel(true, age)}
          noLevel="ok"
          hint={form.enuresis ? (age != null && age < 60 ? "До 5 лет — норма" : "С 5 лет можно ставить F98.0") : undefined}
        />
      )}
      {(showAll || from(age, 36) || headache.kind || headache.frequency) && (
        <>
          <Row label="Головная боль" options={HEADACHE_KINDS} value={headache.kind} onChange={(kind) => patch({ headache: { ...headache, kind } })} />
          <Row label="Как часто" options={HEADACHE_FREQUENCY} value={headache.frequency} onChange={(frequency) => patch({ headache: { ...headache, frequency } })} />
        </>
      )}
    </Block>
  );
};

// ── Обследования ─────────────────────────────────────────────────────────────

const StudiesBlock: React.FC<FullExamProps> = ({ form, patch, age, fontanelleClosed }) => {
  const studies = form.studies;
  const set = (index: number, next: Partial<(typeof studies)[number]>) => patch({ studies: studies.map((item, i) => (i === index ? { ...item, ...next } : item)) });
  const closed = fontanelleClosed || form.head?.fontanelle?.state === "closed";
  const level = worst(...studies.map((item): NeuroLevel => (item.result === "above3x" ? "urgent" : item.result === "normal" ? "ok" : "unknown")));
  return (
    <Block>
      <BlockTitle title={BLOCK_TITLES.studies} level={level} />
      {until(age, 2) && (
        <Typography variant="caption" color="text.secondary">
          По 211н нейросонография — всем в 1 мес.
        </Typography>
      )}
      {studies.map((study, index) => (
        <Box key={`${study.kind}-${index}`} sx={{ borderLeft: 2, borderColor: "divider", pl: 1.25 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
            <Typography variant="body2" fontWeight={600}>
              {optionLabel(STUDY_KINDS, study.kind) || study.kind}
            </Typography>
            <IconButton size="small" aria-label="Убрать обследование" onClick={() => patch({ studies: studies.filter((_, i) => i !== index) })}>
              <DeleteOutlineOutlined fontSize="small" />
            </IconButton>
          </Stack>
          {study.kind === "nsg" && closed && (
            <Typography variant="caption" color="warning.main" display="block">
              Родничок закрыт — нейросонография неинформативна: ультразвук не проходит через кость.
            </Typography>
          )}
          <Stack gap={1} sx={{ mt: 0.5 }}>
            <ChipGroup
              label="Результат"
              options={study.kind === "ck" ? CK_RESULTS : STUDY_RESULTS}
              selected={study.result ? [study.result] : []}
              tone={(value) => (value === "normal" ? "success" : value === "above3x" ? "error" : "warning")}
              onToggle={(result) => set(index, { result: study.result === result ? null : result })}
            />
            <Box sx={pairGridSx}>
              <CustomDatePicker
                label="Дата"
                value={study.on ? dayjs(study.on) : null}
                maxDate={dayjs()}
                onChange={(value) => {
                  const date = value as Dayjs | null;
                  set(index, { on: date && date.isValid() ? date.format("YYYY-MM-DD") : null });
                }}
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
              <TextField size="small" label="Пояснение" value={study.note} onChange={(event) => set(index, { note: event.target.value })} />
            </Box>
            {study.result === "above3x" && (
              <Typography variant="caption" color="error.main" fontWeight={600}>
                КФК выше трёх норм — срочно (AAP 2013).
              </Typography>
            )}
          </Stack>
        </Box>
      ))}
      <Stack direction="row" gap={0.5} flexWrap="wrap">
        {STUDY_KINDS.map((kind) => (
          <Chip
            key={kind.value}
            size="small"
            icon={<AddOutlined />}
            label={kind.label}
            variant="outlined"
            clickable
            onClick={() => patch({ studies: [...studies, { kind: kind.value, on: null, result: null, note: "" }] })}
            sx={{ height: 28, borderRadius: "7px" }}
          />
        ))}
      </Stack>
    </Block>
  );
};

// ── Полный осмотр ────────────────────────────────────────────────────────────

/**
 * «Полный осмотр невролога» (ТЗ §5): блоки по возрасту на дату осмотра,
 * остальные — кнопкой «Все блоки». У каждой находки цвет виден сразу.
 */
export const NeuroFullExam: React.FC<FullExamProps & { fontanelleLevelOf: (state: HeadData["fontanelle"]) => NeuroLevel }> = (props) => {
  const { form, patch, age, fontanelleClosed } = props;
  const [showAll, setShowAll] = React.useState(false);
  const byAge = blocksForAge(age, fontanelleClosed);
  const filled = filledBlocks(form);
  const allowed = allowedBlocks(age);
  const shown = allowed.filter((block) => showAll || byAge.includes(block) || filled.includes(block));
  const hidden = allowed.length - shown.length;
  const blockProps = { ...props, showAll };
  return (
    <Stack gap={1.5}>
      {shown.map((block) => {
        switch (block) {
          case "complaints":
            return (
              <Block key={block}>
                <BlockTitle title={BLOCK_TITLES.complaints} />
                <ChipGroup label="Жалобы" options={COMPLAINTS} selected={form.complaints} onToggle={(value) => patch({ complaints: toggleExclusive(form.complaints, value, "none") })} />
              </Block>
            );
          case "tone":
            return <ToneBlock key={block} {...blockProps} />;
          case "reflexes":
            return <ReflexesBlock key={block} {...blockProps} />;
          case "tendon":
            return <TendonBlock key={block} {...blockProps} />;
          case "cranial":
            return <CranialBlock key={block} {...blockProps} />;
          case "head":
            return <HeadBlock key={block} {...blockProps} />;
          case "motor":
            return <MotorBlock key={block} {...blockProps} />;
          case "psyche":
            return <PsycheBlock key={block} {...blockProps} />;
          case "speech":
            return <SpeechBlock key={block} {...blockProps} />;
          case "npr":
            return <NprBlock key={block} {...blockProps} />;
          case "sleep":
            return <SleepBlock key={block} {...blockProps} />;
          case "seizures":
            return <SeizuresBlock key={block} {...blockProps} />;
          case "enuresis":
            return <EnuresisBlock key={block} {...blockProps} />;
          default:
            return <StudiesBlock key={block} {...blockProps} />;
        }
      })}
      {hidden > 0 && (
        <Button onClick={() => setShowAll(true)} endIcon={<ExpandMoreOutlined />} sx={{ alignSelf: "flex-start", textTransform: "none", px: 0 }}>
          Все блоки — ещё {hidden}
        </Button>
      )}
    </Stack>
  );
};
