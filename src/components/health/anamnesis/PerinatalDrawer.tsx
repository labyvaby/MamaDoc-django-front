import React from "react";
import { Box, Chip, IconButton, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import {
  updatePerinatal,
  type BirthPlace,
  type ComplicationCode,
  type ComplicationSeverity,
  type ConceptionKind,
  type DeliveryComplication,
  type HealthProfile,
  type MaternalDisease,
  type ObstetricAid,
  type PerinatalHistory,
  type PerinatalInformant,
  type PerinatalUpdate,
  type PregnancyInfectionCode,
  type Presentation,
  type PrenatalTestKind,
  type PrenatalTestResult,
  type Trimester,
} from "../../../api/health";
import { ChipGroup, Section } from "../../../pages/patient-program/vision/VisionControls";
import { pairGridSx } from "../../../pages/patient-program/vision/visionUi";
import { HealthDrawerShell } from "../HealthDrawerShell";
import { useHealthScope } from "../useHealth";
import { Choice, CountInput, ListWithNone, NumberInput, YesNo } from "./anamnesisControls";
import { decimalInRange, intInRange, numText } from "./anamnesisForm";
import { THRESHOLDS } from "./anamnesisRules";
import {
  BIRTH_PLACES,
  COMPLICATIONS,
  COMPLICATION_CODES,
  CONCEPTION,
  DELIVERY_COMPLICATIONS,
  INFECTIONS,
  INFECTION_CODES,
  MATERNAL_DISEASES,
  MATERNAL_DISEASE_CODES,
  OBSTETRIC_AIDS,
  PERINATAL_INFORMANTS,
  PRENATAL_TEST_KINDS,
  PRESENTATIONS,
  SEVERITY_LABELS,
  TOXICOSIS_SEVERITY_LABELS,
  type Option,
} from "./anamnesisTypes";
import { useApplyLifeAnamnesis } from "./useAnamnesis";
import { useFormReset } from "./useFormReset";

type Delivery = "natural" | "planned" | "emergency" | "cesarean" | "other" | "";

interface ComplicationRow {
  key: string;
  code: ComplicationCode;
  fromWeek: string;
  toWeek: string;
  trimester: Trimester | null;
  severity: ComplicationSeverity | null;
  note: string;
}

interface InfectionRow {
  key: string;
  code: PregnancyInfectionCode;
  week: string;
  trimester: Trimester | null;
  note: string;
}

interface TestRow {
  key: string;
  kind: PrenatalTestKind;
  week: string;
  result: PrenatalTestResult;
  note: string;
}

interface PerinatalForm {
  pregnancyNumber: string;
  birthNumber: string;
  conception: ConceptionKind;
  multiplePregnancy: boolean | null;
  fetusCount: string;
  fetusOrder: string;
  complications: ComplicationRow[] | null;
  infections: InfectionRow[] | null;
  maternalDiseases: MaternalDisease[] | null;
  prenatalTests: TestRow[] | null;
  motherSmoking: boolean | null;
  motherCigarettesPerDay: string;
  motherAlcohol: boolean | null;
  motherDrugs: boolean | null;
  gestationalAgeWeeks: string;
  gestationalAgeDays: string;
  delivery: Delivery;
  cesareanIndication: string;
  presentation: Presentation;
  obstetricAids: ObstetricAid[] | null;
  laborDurationHours: string;
  ruptureIntervalHours: string;
  deliveryComplications: DeliveryComplication[] | null;
  deliveryComplicationsNote: string;
  birthPlace: BirthPlace;
  informant: PerinatalInformant;
}

let rowKey = 0;
const nextKey = () => `r${++rowKey}`;

function toForm(p: PerinatalHistory, profile: HealthProfile): PerinatalForm {
  const delivery: Delivery =
    profile.deliveryType === "natural"
      ? "natural"
      : profile.deliveryType === "cesarean"
        ? p.cesareanKind || "cesarean"
        : profile.deliveryType === "other"
          ? "other"
          : "";
  return {
    pregnancyNumber: numText(p.pregnancyNumber),
    birthNumber: numText(p.birthNumber),
    conception: p.conception,
    multiplePregnancy: p.multiplePregnancy,
    fetusCount: numText(p.fetusCount),
    fetusOrder: numText(p.fetusOrder),
    complications: p.complications?.map((item) => ({
      key: nextKey(),
      code: item.code,
      fromWeek: numText(item.fromWeek),
      toWeek: numText(item.toWeek),
      trimester: item.trimester,
      severity: item.severity,
      note: item.note,
    })) ?? null,
    infections: p.infections?.map((item) => ({ key: nextKey(), code: item.code, week: numText(item.week), trimester: item.trimester, note: item.note })) ?? null,
    maternalDiseases: p.maternalDiseases,
    prenatalTests: p.prenatalTests?.map((item) => ({ key: nextKey(), kind: item.kind, week: numText(item.week), result: item.result, note: item.note })) ?? null,
    motherSmoking: p.motherSmoking,
    motherCigarettesPerDay: numText(p.motherCigarettesPerDay),
    motherAlcohol: p.motherAlcohol,
    motherDrugs: p.motherDrugs,
    gestationalAgeWeeks: numText(profile.gestationalAgeWeeks),
    gestationalAgeDays: numText(profile.gestationalAgeDays),
    delivery,
    cesareanIndication: p.cesareanIndication,
    presentation: p.presentation,
    obstetricAids: p.obstetricAids,
    laborDurationHours: numText(p.laborDurationHours),
    ruptureIntervalHours: numText(p.ruptureIntervalHours),
    deliveryComplications: p.deliveryComplications,
    deliveryComplicationsNote: p.deliveryComplicationsNote,
    birthPlace: p.birthPlace,
    // Откуда сведения — по умолчанию обменная карта.
    informant: p.informant || (p.exists ? "" : "exchange_card"),
  };
}

interface Built {
  payload: PerinatalUpdate | null;
  errors: string[];
}

function build(form: PerinatalForm): Built {
  const errors: string[] = [];
  const pregnancyNumber = intInRange(form.pregnancyNumber, 1, 20);
  const birthNumber = intInRange(form.birthNumber, 1, 20);
  if (pregnancyNumber != null && birthNumber != null && birthNumber > pregnancyNumber) errors.push("Родов не может быть больше, чем беременностей");
  const multiple = form.multiplePregnancy === true;
  const fetusCount = multiple ? intInRange(form.fetusCount, 2, 5) : null;
  const fetusOrder = multiple ? intInRange(form.fetusOrder, 1, 5) : null;
  if (fetusCount != null && fetusOrder != null && fetusOrder > fetusCount) errors.push("Номер плода больше числа плодов");
  const complications = form.complications?.map((row) => {
    const fromWeek = intInRange(row.fromWeek, 1, 42);
    const toWeek = intInRange(row.toWeek, 1, 42);
    if (fromWeek != null && toWeek != null && toWeek < fromWeek) errors.push(`${COMPLICATIONS[row.code].label}: «по» раньше «с»`);
    if (row.code === "other" && !row.note.trim()) errors.push("Опишите «другое» осложнение");
    const weeks = fromWeek != null || toWeek != null;
    return {
      code: row.code,
      fromWeek: fromWeek ?? (toWeek != null ? toWeek : null),
      toWeek: fromWeek != null ? toWeek : null,
      trimester: weeks ? null : row.trimester,
      severity: COMPLICATIONS[row.code].severities.length ? row.severity : null,
      note: row.note.trim(),
    };
  }) ?? null;
  const infections = form.infections?.map((row) => {
    const week = intInRange(row.week, 1, 42);
    if (row.code === "other" && !row.note.trim()) errors.push("Опишите «другую» инфекцию");
    return { code: row.code, week, trimester: week != null ? null : row.trimester, note: row.note.trim() };
  }) ?? null;
  const tests = form.prenatalTests?.map((row) => ({ kind: row.kind, week: intInRange(row.week, 1, 42), result: row.result, note: row.note.trim() })) ?? null;
  if (form.maternalDiseases?.some((item) => item.code === "other" && !item.note.trim())) errors.push("Опишите «другую» болезнь матери");
  const cesarean = form.delivery === "planned" || form.delivery === "emergency" || form.delivery === "cesarean";
  const payload: PerinatalUpdate = {
    pregnancyNumber,
    birthNumber,
    conception: form.conception,
    multiplePregnancy: form.multiplePregnancy,
    fetusCount,
    fetusOrder,
    complications,
    infections,
    maternalDiseases: form.maternalDiseases?.map((item) => ({ code: item.code, note: item.note.trim() })) ?? null,
    prenatalTests: tests,
    motherSmoking: form.motherSmoking,
    motherCigarettesPerDay: form.motherSmoking === true ? intInRange(form.motherCigarettesPerDay, 1, 60) : null,
    motherAlcohol: form.motherAlcohol,
    motherDrugs: form.motherDrugs,
    gestationalAgeWeeks: intInRange(form.gestationalAgeWeeks, 20, 45),
    gestationalAgeDays: intInRange(form.gestationalAgeDays, 0, 6),
    deliveryType: form.delivery === "natural" ? "natural" : cesarean ? "cesarean" : form.delivery === "other" ? "other" : "",
    cesareanKind: form.delivery === "planned" ? "planned" : form.delivery === "emergency" ? "emergency" : "",
    cesareanIndication: cesarean ? form.cesareanIndication.trim() : "",
    presentation: form.presentation,
    obstetricAids: form.obstetricAids,
    laborDurationHours: decimalInRange(form.laborDurationHours, 0, 72),
    ruptureIntervalHours: decimalInRange(form.ruptureIntervalHours, 0, 999),
    deliveryComplications: form.deliveryComplications,
    deliveryComplicationsNote: form.deliveryComplications?.includes("other") ? form.deliveryComplicationsNote.trim() : "",
    birthPlace: form.birthPlace,
    informant: form.informant,
  };
  const numbers: Array<number | null | undefined> = [
    pregnancyNumber,
    birthNumber,
    fetusCount,
    fetusOrder,
    payload.motherCigarettesPerDay,
    payload.gestationalAgeWeeks,
    payload.gestationalAgeDays,
    payload.laborDurationHours,
    payload.ruptureIntervalHours,
    ...(complications ?? []).flatMap((row) => [row.fromWeek, row.toWeek]),
    ...(infections ?? []).map((row) => row.week),
    ...(tests ?? []).map((row) => row.week),
  ];
  if (numbers.some((value) => typeof value === "number" && Number.isNaN(value))) {
    errors.push("Проверьте числа: недели 1–42, срок гестации 20–45 нед и 0–6 дн, часы и счётчики в допустимых границах");
  }
  return { payload: errors.length ? null : payload, errors };
}

const TRIMESTERS: Option<"1" | "2" | "3">[] = [
  { value: "1", label: "I" },
  { value: "2", label: "II" },
  { value: "3", label: "III" },
];

/** Строка осложнения или инфекции: срок, тяжесть, заметка. */
const TermRow: React.FC<{
  title: string;
  single?: boolean;
  from: string;
  to?: string;
  trimester: Trimester | null;
  severity?: { options: ReadonlyArray<ComplicationSeverity>; labels: Record<ComplicationSeverity, string>; value: ComplicationSeverity | null };
  note: string;
  noteRequired?: boolean;
  onChange: (patch: { from?: string; to?: string; trimester?: Trimester | null; severity?: ComplicationSeverity | null; note?: string }) => void;
  onRemove: () => void;
}> = ({ title, single, from, to = "", trimester, severity, note, noteRequired, onChange, onRemove }) => {
  const weeks = from !== "" || to !== "";
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: "10px", p: 1.25, display: "flex", flexDirection: "column", gap: 1 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Typography variant="body2" fontWeight={600}>
          {title}
        </Typography>
        <IconButton size="small" aria-label={`Убрать: ${title}`} onClick={onRemove}>
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Stack>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
        <TextField
          size="small"
          label={single ? "Неделя" : "С недели"}
          value={from}
          onChange={(event) => onChange({ from: event.target.value.replace(/[^\d]/g, "") })}
          inputProps={{ inputMode: "numeric" }}
          sx={{ width: 110 }}
        />
        {!single && (
          <TextField
            size="small"
            label="По неделю"
            value={to}
            onChange={(event) => onChange({ to: event.target.value.replace(/[^\d]/g, "") })}
            inputProps={{ inputMode: "numeric" }}
            sx={{ width: 110 }}
          />
        )}
        {!weeks && (
          <Stack direction="row" gap={0.75} alignItems="center">
            <Typography variant="caption" color="text.secondary">
              или триместр
            </Typography>
            <Choice<"1" | "2" | "3">
              options={TRIMESTERS}
              value={trimester ? (String(trimester) as "1" | "2" | "3") : ""}
              onChange={(value) => onChange({ trimester: value ? (Number(value) as Trimester) : null })}
            />
          </Stack>
        )}
      </Stack>
      {severity && (
        <Choice<ComplicationSeverity>
          options={severity.options.map((value) => ({ value, label: severity.labels[value] }))}
          value={severity.value ?? ""}
          onChange={(value) => onChange({ severity: value || null })}
          tone={(value) => (value === "mild" ? "success" : "warning")}
        />
      )}
      <TextField
        size="small"
        label={noteRequired ? "Что именно" : "Заметка"}
        value={note}
        onChange={(event) => onChange({ note: event.target.value })}
        required={noteRequired}
        error={noteRequired && !note.trim()}
        fullWidth
      />
    </Box>
  );
};

/** Кнопки каталога: нажатие добавляет строку; «нет» — подтверждённое отсутствие. */
function AddChips<T extends string>({
  options,
  onAdd,
  noneLabel,
  none,
  onNone,
}: {
  options: ReadonlyArray<Option<T>>;
  onAdd: (value: T) => void;
  noneLabel: string;
  none: boolean;
  onNone: () => void;
}) {
  return (
    <Stack direction="row" gap={0.75} flexWrap="wrap">
      <Chip
        size="small"
        label={noneLabel}
        clickable
        color={none ? "success" : "default"}
        variant={none ? "filled" : "outlined"}
        onClick={onNone}
        aria-pressed={none}
        sx={{ height: 30, borderRadius: "8px", fontWeight: none ? 600 : 400 }}
      />
      {options.map((option) => (
        <Chip
          key={option.value}
          size="small"
          label={`+ ${option.label}`}
          clickable
          variant="outlined"
          onClick={() => onAdd(option.value)}
          sx={{ height: 30, borderRadius: "8px" }}
        />
      ))}
    </Stack>
  );
}

const DELIVERY: Option<Exclude<Delivery, "">>[] = [
  { value: "natural", label: "Самостоятельные" },
  { value: "planned", label: "Плановое кесарево" },
  { value: "emergency", label: "Экстренное кесарево" },
  { value: "other", label: "Другое" },
];

export type PerinatalTab = "pregnancy" | "birth";

interface PerinatalDrawerProps {
  open: boolean;
  patientId: number;
  perinatal: PerinatalHistory;
  profile: HealthProfile;
  initialTab: PerinatalTab;
  onClose: () => void;
  /** «Сохранить и далее» — следующее окно с пустыми пунктами. */
  onNext?: () => void;
}

/** Окно «Беременность и роды» (ТЗ §5.1): две вкладки, сохраняются одним запросом. */
export const PerinatalDrawer: React.FC<PerinatalDrawerProps> = ({ open, patientId, perinatal, profile, initialTab, onClose, onNext }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const apply = useApplyLifeAnamnesis(patientId);
  const [tab, setTab] = React.useState<PerinatalTab>(initialTab);
  const [form, setForm] = React.useState<PerinatalForm>(() => toForm(perinatal, profile));
  const nextRef = React.useRef(false);

  useFormReset(open, initialTab, () => {
    setForm(toForm(perinatal, profile));
    setTab(initialTab);
  });

  const patch = (next: Partial<PerinatalForm>) => setForm((current) => ({ ...current, ...next }));
  const built = build(form);

  const mutation = useMutation({
    mutationFn: () => updatePerinatal(scope, patientId, built.payload as PerinatalUpdate),
    onSuccess: async (data) => {
      enqueueSnackbar("Сохранено", { variant: "success" });
      await apply(data);
      onClose();
      if (nextRef.current) onNext?.();
    },
  });
  const save = (next: boolean) => {
    nextRef.current = next;
    mutation.mutate();
  };

  const updateComplication = (key: string, change: Parameters<React.ComponentProps<typeof TermRow>["onChange"]>[0]) =>
    patch({
      complications: (form.complications ?? []).map((row) =>
        row.key === key
          ? {
              ...row,
              fromWeek: change.from ?? row.fromWeek,
              toWeek: change.to ?? row.toWeek,
              trimester: change.trimester !== undefined ? change.trimester : row.trimester,
              severity: change.severity !== undefined ? change.severity : row.severity,
              note: change.note ?? row.note,
            }
          : row,
      ),
    });
  const updateInfection = (key: string, change: Parameters<React.ComponentProps<typeof TermRow>["onChange"]>[0]) =>
    patch({
      infections: (form.infections ?? []).map((row) =>
        row.key === key
          ? { ...row, week: change.from ?? row.week, trimester: change.trimester !== undefined ? change.trimester : row.trimester, note: change.note ?? row.note }
          : row,
      ),
    });

  const labor = decimalInRange(form.laborDurationHours, 0, 72);
  const rupture = decimalInRange(form.ruptureIntervalHours, 0, 999);
  const parity = intInRange(form.birthNumber, 1, 20);
  const laborHint =
    labor != null && !Number.isNaN(labor)
      ? labor < (parity === 1 ? THRESHOLDS.rapidLaborPrimipara : THRESHOLDS.rapidLaborMultipara)
        ? "стремительные роды — фактор риска ЦНС"
        : labor > (parity != null && parity >= 2 ? THRESHOLDS.prolongedLaborMultipara : THRESHOLDS.prolongedLaborPrimipara)
          ? "затяжные роды — фактор риска ЦНС"
          : undefined
      : undefined;
  const ruptureHint =
    rupture != null && !Number.isNaN(rupture) && rupture >= THRESHOLDS.ruptureHours ? `безводный период ≥ ${THRESHOLDS.ruptureHours} ч — фактор ВУИ и сепсиса` : undefined;
  const cesarean = form.delivery === "planned" || form.delivery === "emergency" || form.delivery === "cesarean";
  const maternalCodes = form.maternalDiseases?.map((item) => item.code) ?? null;
  const maternalOther = form.maternalDiseases?.find((item) => item.code === "other");

  return (
    <HealthDrawerShell
      open={open}
      title="Беременность и роды"
      subtitle="По обменной карте и со слов родителей"
      pending={mutation.isPending}
      error={mutation.error}
      canSave={built.payload != null}
      saveLabel="Сохранить"
      onSave={() => save(false)}
      onClose={onClose}
      saveNextLabel={onNext ? "Сохранить и далее" : undefined}
      onSaveNext={onNext ? () => save(true) : undefined}
      width={600}
    >
      {built.errors.length > 0 && (
        <Typography variant="caption" color="warning.main">
          {built.errors.join(". ")}
        </Typography>
      )}
      <Tabs value={tab} onChange={(_, value: PerinatalTab) => setTab(value)} variant="fullWidth" sx={{ minHeight: 40, mt: -1 }}>
        <Tab value="pregnancy" label="Беременность" sx={{ minHeight: 40 }} />
        <Tab value="birth" label="Роды" sx={{ minHeight: 40 }} />
      </Tabs>
      {tab === "pregnancy" ? (
        <>
          <Box sx={pairGridSx}>
            <CountInput label="Какая беременность" value={form.pregnancyNumber} onChange={(value) => patch({ pregnancyNumber: value })} />
            <CountInput label="Какие роды" value={form.birthNumber} onChange={(value) => patch({ birthNumber: value })} />
          </Box>
          <Section title="Наступила">
            <Choice<Exclude<ConceptionKind, "">> options={CONCEPTION} value={form.conception} onChange={(value) => patch({ conception: value })} />
          </Section>
          <Section title="Многоплодная">
            <YesNo value={form.multiplePregnancy} onChange={(value) => patch({ multiplePregnancy: value })} yesTone="primary" />
          </Section>
          {form.multiplePregnancy === true && (
            <Box sx={pairGridSx}>
              <CountInput label="Сколько плодов" value={form.fetusCount} onChange={(value) => patch({ fetusCount: value })} min={2} max={5} />
              <CountInput label="Какой по счёту" value={form.fetusOrder} onChange={(value) => patch({ fetusOrder: value })} min={1} max={5} />
            </Box>
          )}
          <Section title="Осложнения беременности">
            <Stack gap={1}>
              <AddChips<ComplicationCode>
                options={COMPLICATION_CODES.map((code) => ({ value: code, label: COMPLICATIONS[code].label }))}
                noneLabel="Без осложнений"
                none={form.complications != null && form.complications.length === 0}
                onNone={() => patch({ complications: form.complications != null && form.complications.length === 0 ? null : [] })}
                onAdd={(code) =>
                  patch({
                    complications: [
                      ...(form.complications ?? []),
                      { key: nextKey(), code, fromWeek: "", toWeek: "", trimester: null, severity: COMPLICATIONS[code].severities[0] ?? null, note: "" },
                    ],
                  })
                }
              />
              {(form.complications ?? []).map((row) => {
                const meta = COMPLICATIONS[row.code];
                return (
                  <TermRow
                    key={row.key}
                    title={meta.label}
                    from={row.fromWeek}
                    to={row.toWeek}
                    trimester={row.trimester}
                    severity={
                      meta.severities.length
                        ? { options: meta.severities, labels: row.code === "toxicosis" ? TOXICOSIS_SEVERITY_LABELS : SEVERITY_LABELS, value: row.severity }
                        : undefined
                    }
                    note={row.note}
                    noteRequired={row.code === "other"}
                    onChange={(change) => updateComplication(row.key, change)}
                    onRemove={() => patch({ complications: (form.complications ?? []).filter((item) => item.key !== row.key) })}
                  />
                );
              })}
            </Stack>
          </Section>
          <Section title="Инфекции при беременности">
            <Stack gap={1}>
              <AddChips<PregnancyInfectionCode>
                options={INFECTION_CODES.map((code) => ({ value: code, label: INFECTIONS[code].label }))}
                noneLabel="Инфекций не было"
                none={form.infections != null && form.infections.length === 0}
                onNone={() => patch({ infections: form.infections != null && form.infections.length === 0 ? null : [] })}
                onAdd={(code) => patch({ infections: [...(form.infections ?? []), { key: nextKey(), code, week: "", trimester: null, note: "" }] })}
              />
              {(form.infections ?? []).map((row) => (
                <TermRow
                  key={row.key}
                  title={INFECTIONS[row.code].label}
                  single
                  from={row.week}
                  trimester={row.trimester}
                  note={row.note}
                  noteRequired={row.code === "other"}
                  onChange={(change) => updateInfection(row.key, change)}
                  onRemove={() => patch({ infections: (form.infections ?? []).filter((item) => item.key !== row.key) })}
                />
              ))}
            </Stack>
          </Section>
          <Section title="Хронические болезни матери">
            <ListWithNone
              options={MATERNAL_DISEASE_CODES.map((code) => ({ value: code, label: MATERNAL_DISEASES[code].label }))}
              value={maternalCodes}
              noneLabel="Здорова"
              onChange={(codes) =>
                patch({
                  maternalDiseases:
                    codes == null ? null : codes.map((code) => form.maternalDiseases?.find((item) => item.code === code) ?? { code, note: "" }),
                })
              }
            />
            {maternalOther && (
              <TextField
                size="small"
                label="Другая болезнь матери"
                value={maternalOther.note}
                onChange={(event) =>
                  patch({
                    maternalDiseases: (form.maternalDiseases ?? []).map((item) => (item.code === "other" ? { ...item, note: event.target.value } : item)),
                  })
                }
                required
                fullWidth
                sx={{ mt: 1 }}
              />
            )}
          </Section>
          <Section title="Курение при беременности">
            <YesNo value={form.motherSmoking} onChange={(value) => patch({ motherSmoking: value })} />
          </Section>
          {form.motherSmoking === true && (
            <NumberInput label="Сигарет в день" value={form.motherCigarettesPerDay} onChange={(value) => patch({ motherCigarettesPerDay: value })} />
          )}
          <Box sx={pairGridSx}>
            <Section title="Алкоголь">
              <YesNo value={form.motherAlcohol} onChange={(value) => patch({ motherAlcohol: value })} />
            </Section>
            <Section title="Наркотики">
              <YesNo value={form.motherDrugs} onChange={(value) => patch({ motherDrugs: value })} />
            </Section>
          </Box>
          <Section title="Обследования">
            <Stack gap={1}>
              <Stack direction="row" gap={0.75} flexWrap="wrap">
                {[
                  { kind: "screening" as const, week: "12", label: "Скрининг 12 нед: норма" },
                  { kind: "ultrasound" as const, week: "20", label: "УЗИ 20 нед: норма" },
                  { kind: "ultrasound" as const, week: "32", label: "УЗИ 32 нед: норма" },
                ].map((quick) => (
                  <Chip
                    key={quick.label}
                    size="small"
                    variant="outlined"
                    clickable
                    label={quick.label}
                    onClick={() =>
                      patch({ prenatalTests: [...(form.prenatalTests ?? []), { key: nextKey(), kind: quick.kind, week: quick.week, result: "normal", note: "" }] })
                    }
                    sx={{ height: 30, borderRadius: "8px" }}
                  />
                ))}
                <Chip
                  size="small"
                  variant="outlined"
                  clickable
                  label="+ Обследование"
                  onClick={() => patch({ prenatalTests: [...(form.prenatalTests ?? []), { key: nextKey(), kind: "other", week: "", result: "", note: "" }] })}
                  sx={{ height: 30, borderRadius: "8px", borderStyle: "dashed" }}
                />
              </Stack>
              {(form.prenatalTests ?? []).map((row) => (
                <Box key={row.key} sx={{ border: 1, borderColor: "divider", borderRadius: "10px", p: 1.25, display: "flex", flexDirection: "column", gap: 1 }}>
                  <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                    <Choice<PrenatalTestKind>
                      options={PRENATAL_TEST_KINDS}
                      value={row.kind}
                      onChange={(value) =>
                        patch({ prenatalTests: (form.prenatalTests ?? []).map((item) => (item.key === row.key ? { ...item, kind: value || "other" } : item)) })
                      }
                    />
                    <Box sx={{ flex: 1 }} />
                    <IconButton
                      size="small"
                      aria-label="Убрать обследование"
                      onClick={() => patch({ prenatalTests: (form.prenatalTests ?? []).filter((item) => item.key !== row.key) })}
                    >
                      <CloseOutlined fontSize="small" />
                    </IconButton>
                  </Stack>
                  <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                    <TextField
                      size="small"
                      label="Неделя"
                      value={row.week}
                      onChange={(event) =>
                        patch({
                          prenatalTests: (form.prenatalTests ?? []).map((item) =>
                            item.key === row.key ? { ...item, week: event.target.value.replace(/[^\d]/g, "") } : item,
                          ),
                        })
                      }
                      inputProps={{ inputMode: "numeric" }}
                      sx={{ width: 100 }}
                    />
                    <ChipGroup<"normal" | "abnormal">
                      options={[
                        { value: "normal", label: "Норма" },
                        { value: "abnormal", label: "Отклонение" },
                      ]}
                      selected={row.result ? [row.result] : []}
                      tone={(value) => (value === "normal" ? "success" : "error")}
                      onToggle={(value) =>
                        patch({
                          prenatalTests: (form.prenatalTests ?? []).map((item) =>
                            item.key === row.key ? { ...item, result: item.result === value ? "" : value } : item,
                          ),
                        })
                      }
                    />
                  </Stack>
                  <TextField
                    size="small"
                    label="Заметка"
                    value={row.note}
                    onChange={(event) =>
                      patch({ prenatalTests: (form.prenatalTests ?? []).map((item) => (item.key === row.key ? { ...item, note: event.target.value } : item)) })
                    }
                    fullWidth
                  />
                </Box>
              ))}
            </Stack>
          </Section>
        </>
      ) : (
        <>
          <Section title="Срок гестации">
            <Box sx={pairGridSx}>
              <NumberInput label="Недель" value={form.gestationalAgeWeeks} onChange={(value) => patch({ gestationalAgeWeeks: value })} />
              <NumberInput label="Дней" value={form.gestationalAgeDays} onChange={(value) => patch({ gestationalAgeDays: value })} />
            </Box>
          </Section>
          <Section title="Способ родов">
            <Choice<Exclude<Delivery, "">>
              options={DELIVERY}
              value={form.delivery === "cesarean" ? "" : form.delivery}
              onChange={(value) => patch({ delivery: value })}
            />
            {form.delivery === "cesarean" && (
              <Typography variant="caption" color="text.secondary">
                Кесарево сечение — укажите, плановое или экстренное
              </Typography>
            )}
          </Section>
          {cesarean && (
            <TextField
              size="small"
              label="Показание к кесареву сечению"
              value={form.cesareanIndication}
              onChange={(event) => patch({ cesareanIndication: event.target.value })}
              fullWidth
            />
          )}
          <Section title="Предлежание">
            <Choice<Exclude<Presentation, "">> options={PRESENTATIONS} value={form.presentation} onChange={(value) => patch({ presentation: value })} />
          </Section>
          <Section title="Акушерские пособия">
            <ListWithNone
              options={(Object.keys(OBSTETRIC_AIDS) as ObstetricAid[]).map((code) => ({ value: code, label: OBSTETRIC_AIDS[code].label }))}
              value={form.obstetricAids}
              noneLabel="Не применялись"
              onChange={(value) => patch({ obstetricAids: value })}
            />
          </Section>
          <Box sx={pairGridSx}>
            <NumberInput label="Длительность родов" suffix="ч" value={form.laborDurationHours} onChange={(value) => patch({ laborDurationHours: value })} helper={laborHint} />
            <NumberInput label="Безводный период" suffix="ч" value={form.ruptureIntervalHours} onChange={(value) => patch({ ruptureIntervalHours: value })} helper={ruptureHint} />
          </Box>
          <Section title="Осложнения родов">
            <ListWithNone
              options={(Object.keys(DELIVERY_COMPLICATIONS) as DeliveryComplication[]).map((code) => ({ value: code, label: DELIVERY_COMPLICATIONS[code].label }))}
              value={form.deliveryComplications}
              noneLabel="Без осложнений"
              onChange={(value) => patch({ deliveryComplications: value })}
            />
            {form.deliveryComplications?.includes("other") && (
              <TextField
                size="small"
                label="Другое осложнение"
                value={form.deliveryComplicationsNote}
                onChange={(event) => patch({ deliveryComplicationsNote: event.target.value })}
                fullWidth
                sx={{ mt: 1 }}
              />
            )}
          </Section>
          <Section title="Место родов">
            <Choice<Exclude<BirthPlace, "">> options={BIRTH_PLACES} value={form.birthPlace} onChange={(value) => patch({ birthPlace: value })} />
          </Section>
          <Section title="Откуда сведения">
            <Choice<Exclude<PerinatalInformant, "">> options={PERINATAL_INFORMANTS} value={form.informant} onChange={(value) => patch({ informant: value })} />
          </Section>
        </>
      )}
    </HealthDrawerShell>
  );
};
