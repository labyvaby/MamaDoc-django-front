import React from "react";
import { Alert, Box, MenuItem, TextField, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import {
  createSurgery,
  updateSurgery,
  type AllergyInput,
  type Anesthesia,
  type AnesthesiaTolerance,
  type BodySide,
  type Condition,
  type Hospitalization,
  type HospitalizationInput,
  type InjuryTreatment,
  type InjuryType,
  type Surgery,
  type SurgeryKind,
  type SurgeryOutcome,
  type SurgeryStatus,
  type TransfusionProduct,
} from "../../api/health";
import { ChipGroup, Section } from "../../pages/patient-program/vision/VisionControls";
import { pairGridSx, toggleIn } from "../../pages/patient-program/vision/visionUi";
import { AppButton } from "../ui";
import { AllergyDrawer } from "./AllergyDrawer";
import { HealthDrawerShell } from "./HealthDrawerShell";
import { HealthFilesField } from "./HealthFilesField";
import { HospitalizationDrawer } from "./HospitalizationDrawer";
import { stayPeriod } from "./illnessData";
import { PrecisionDateField } from "./PrecisionDateField";
import {
  ANESTHESIA_OPTIONS,
  BODY_PARTS,
  BODY_SIDES,
  FACILITY_PRESETS,
  INJURY_TYPES,
  OPERATION_PRESETS,
  OUTCOME_OPTIONS,
  PROCEDURE_PRESETS,
  SURGERY_KINDS,
  SURGERY_STATUSES,
  TOLERANCE_OPTIONS,
  TRANSFUSION_PRODUCTS,
  TREATMENTS,
  autoTitle,
  buildSurgeryPayload,
  emptySurgeryForm,
  hasPainRelief,
  surgeryFormProblem,
  surgeryToForm,
  type SurgeryForm,
} from "./surgeryData";
import { useHealthScope, useInvalidateHealth } from "./useHealth";

const NEW_TITLES: Record<SurgeryKind, string> = {
  operation: "Новая операция",
  injury: "Новая травма",
  procedure: "Новая процедура",
  transfusion: "Новое переливание",
};

const EMPTY_SUBTITLES: Record<SurgeryKind, string> = {
  operation: "Что сделали и когда",
  injury: "Вид травмы, часть тела и когда",
  procedure: "Что сделали и когда",
  transfusion: "Что переливали и когда",
};

const EDIT_TITLES: Record<SurgeryKind, string> = {
  operation: "Операция",
  injury: "Травма",
  procedure: "Процедура",
  transfusion: "Переливание",
};

/** Кнопки и поле: выбор кнопкой пишет текст в поле, повторное нажатие очищает. */
const PresetText: React.FC<{
  title: string;
  presets: ReadonlyArray<string>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  label?: string;
}> = ({ title, presets, value, onChange, placeholder, required, label }) => (
  <Section title={title}>
    <ChipGroup<string>
      label={title}
      options={presets.map((preset) => ({ value: preset, label: preset }))}
      selected={presets.filter((preset) => preset.toLowerCase() === value.trim().toLowerCase())}
      onToggle={(preset) => onChange(value.trim().toLowerCase() === preset.toLowerCase() ? "" : preset)}
    />
    <TextField
      size="small"
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      fullWidth
      sx={{ mt: 1.25 }}
    />
  </Section>
);

interface SurgeryDrawerProps {
  open: boolean;
  patientId: number;
  surgery: Surgery | null;
  /** Вид новой записи — от кнопки, которой открыли окно. */
  initialKind: SurgeryKind;
  birthDate?: string | null;
  hospitalizations: ReadonlyArray<Hospitalization>;
  /** Диагнозы — для окна госпитализации. */
  conditions: ReadonlyArray<Condition>;
  onClose: () => void;
}

/**
 * Операция, травма, процедура или переливание кнопками (ТЗ §5): вид можно
 * сменить, поля чужого вида при сохранении очищаются; название травмы и
 * переливания составляется само; осложнение наркоза предлагает внести аллергию.
 */
export const SurgeryDrawer: React.FC<SurgeryDrawerProps> = ({
  open,
  patientId,
  surgery,
  initialKind,
  birthDate,
  hospitalizations,
  conditions,
  onClose,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const [form, setForm] = React.useState<SurgeryForm>(() => emptySurgeryForm(initialKind));
  // У травмы и переливания название составляется само, пока врач его не поправил.
  const [titleTouched, setTitleTouched] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [stayInitial, setStayInitial] = React.useState<Partial<HospitalizationInput> | null>(null);
  const [allergy, setAllergy] = React.useState<Partial<AllergyInput> | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const next = surgery ? surgeryToForm(surgery) : emptySurgeryForm(initialKind);
    setForm(next);
    // Своё название сохранённой записи не перетираем.
    setTitleTouched(Boolean(surgery) && next.title !== autoTitle(next));
  }, [open, surgery, initialKind]);

  const patch = (next: Partial<SurgeryForm>) => setForm((current) => ({ ...current, ...next }));
  const kind = form.kind;
  const injury = kind === "injury";
  const transfusion = kind === "transfusion";
  const surgical = kind === "operation" || kind === "procedure";
  const title = surgical || titleTouched ? form.title : autoTitle(form);
  const problem = surgeryFormProblem(form, birthDate);

  const changeKind = (next: SurgeryKind) => {
    if (next === kind) return;
    const nextSurgical = next === "operation" || next === "procedure";
    if (!nextSurgical) setTitleTouched(false);
    // Из травмы в операцию название не переносим: «Перелом — предплечье» операцией не станет.
    patch(nextSurgical && !surgical ? { kind: next, title: "" } : { kind: next });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = buildSurgeryPayload({ ...form, title }, surgery ? "update" : "create");
      return surgery ? updateSurgery(scope, patientId, surgery.id, payload) : createSurgery(scope, patientId, payload);
    },
    onSuccess: async () => {
      enqueueSnackbar(surgery ? "Запись обновлена" : "Запись добавлена", { variant: "success" });
      await invalidate();
      onClose();
    },
  });

  const dateBlock = (
    <PrecisionDateField
      label="Когда — можно месяц или только год"
      value={form.performedOn}
      precision={form.datePrecision}
      birthDate={birthDate}
      required
      onChange={(performedOn, datePrecision) => patch({ performedOn, datePrecision })}
    />
  );

  const reasonBlock = (
    <TextField
      size="small"
      label={injury ? "Как случилось" : transfusion ? "Причина" : "Показание"}
      placeholder={injury ? "Например, упала с горки на площадке" : transfusion ? "Например, анемия новорождённого" : "Например, паховая грыжа справа"}
      value={form.reason}
      onChange={(event) => patch({ reason: event.target.value })}
      fullWidth
    />
  );

  const sideBlock = (
    <Section title="Сторона">
      <ChipGroup<BodySide>
        options={BODY_SIDES}
        selected={form.side ? [form.side] : []}
        onToggle={(value) => patch({ side: form.side === value ? "" : value })}
      />
    </Section>
  );

  // У травмы и переливания название составляется само — врач может поправить.
  const titleBlock = (
    <TextField
      size="small"
      label="Название"
      value={title}
      onChange={(event) => {
        setTitleTouched(true);
        patch({ title: event.target.value });
      }}
      helperText={titleTouched ? "Название своё — само больше не меняется" : "Составляется само — можно поправить"}
      fullWidth
    />
  );

  const facilityBlock = (
    <PresetText
      title={injury ? "Где оказывали помощь" : "Где делали"}
      presets={FACILITY_PRESETS}
      value={form.facility}
      onChange={(facility) => patch({ facility })}
      placeholder="Например, РДКБ, хирургическое отделение"
    />
  );

  const stayBlock = (
    <Section
      title="Госпитализация"
      action={
        <AppButton
          size="small"
          startIcon={<AddOutlined />}
          onClick={() =>
            setStayInitial({
              facility: form.facility.trim(),
              admittedOn: form.performedOn && form.datePrecision === "day" ? form.performedOn : "",
              diagnosisTitle: form.reason.trim(),
            })
          }
        >
          Добавить
        </AppButton>
      }
    >
      <TextField
        select
        size="small"
        value={form.hospitalizationId ?? ""}
        onChange={(event) => patch({ hospitalizationId: event.target.value === "" ? null : Number(event.target.value) })}
        fullWidth
        SelectProps={{ displayEmpty: true }}
      >
        <MenuItem value="">Не было</MenuItem>
        {hospitalizations.map((row) => (
          <MenuItem key={row.id} value={row.id}>
            {stayPeriod(row)} · {row.facility}
          </MenuItem>
        ))}
      </TextField>
    </Section>
  );

  const anesthesiaBlock = !transfusion && (
    <>
      <Section title="Обезболивание">
        <ChipGroup<Anesthesia>
          options={ANESTHESIA_OPTIONS}
          selected={form.anesthesia ? [form.anesthesia] : []}
          onToggle={(value) => patch({ anesthesia: form.anesthesia === value ? "" : value })}
        />
      </Section>
      {hasPainRelief(form.anesthesia) && (
        <Section title="Как перенёс">
          <ChipGroup<AnesthesiaTolerance>
            options={TOLERANCE_OPTIONS}
            selected={form.anesthesiaTolerance ? [form.anesthesiaTolerance] : []}
            tone={(value) => (value === "good" ? "success" : "error")}
            onToggle={(value) => patch({ anesthesiaTolerance: form.anesthesiaTolerance === value ? "" : value })}
          />
        </Section>
      )}
      {hasPainRelief(form.anesthesia) && form.anesthesiaTolerance === "complications" && (
        <>
          <TextField
            size="small"
            label="Что было"
            placeholder="Например, аллергическая реакция на препарат, долгое пробуждение"
            value={form.anesthesiaNotes}
            onChange={(event) => patch({ anesthesiaNotes: event.target.value })}
            required
            error={!form.anesthesiaNotes.trim()}
            fullWidth
          />
          <Alert
            severity="warning"
            action={
              <AppButton size="small" color="inherit" onClick={() => setAllergy({ category: "drug", reaction: form.anesthesiaNotes.trim() })}>
                Внести
              </AppButton>
            }
          >
            Осложнение обезболивания — добавить аллергию, чтобы её видели все? Препарат впишите в окне аллергии.
          </Alert>
        </>
      )}
    </>
  );

  return (
    <>
      <HealthDrawerShell
        open={open}
        title={surgery ? EDIT_TITLES[kind] : NEW_TITLES[kind]}
        subtitle={title.trim() || EMPTY_SUBTITLES[kind]}
        pending={mutation.isPending}
        error={mutation.error}
        canSave={!problem && !uploading}
        saveLabel={surgery ? "Сохранить" : "Добавить"}
        onSave={() => mutation.mutate()}
        onClose={onClose}
        footerStart={
          problem ? (
            <Typography variant="caption" color="text.secondary">
              {problem}
            </Typography>
          ) : undefined
        }
      >
        <Section title="Вид записи">
          <ChipGroup<SurgeryKind> options={SURGERY_KINDS} selected={[kind]} onToggle={changeKind} />
        </Section>

        {/* Порядок полей — как в ТЗ §5 для каждого вида. */}
        {surgical && (
          <>
            <PresetText
              title="Что сделали"
              label="Название"
              presets={kind === "operation" ? OPERATION_PRESETS : PROCEDURE_PRESETS}
              value={form.title}
              onChange={(next) => patch({ title: next })}
              placeholder={kind === "operation" ? "Например, грыжесечение паховой грыжи справа" : "Например, удаление занозы"}
              required
            />
            {dateBlock}
            {facilityBlock}
            <TextField size="small" label="Кто делал" value={form.surgeon} onChange={(event) => patch({ surgeon: event.target.value })} fullWidth />
            <Box sx={pairGridSx}>
              <TextField
                size="small"
                label="Часть тела"
                value={form.bodyPart}
                onChange={(event) => patch({ bodyPart: event.target.value })}
                fullWidth
              />
              {sideBlock}
            </Box>
            {reasonBlock}
          </>
        )}

        {injury && (
          <>
            <Section title="Вид травмы">
              <ChipGroup<InjuryType>
                options={INJURY_TYPES}
                selected={form.injuryType ? [form.injuryType] : []}
                tone={() => "warning"}
                onToggle={(value) => patch({ injuryType: form.injuryType === value ? "" : value })}
              />
            </Section>
            <PresetText
              title="Часть тела"
              presets={BODY_PARTS}
              value={form.bodyPart}
              onChange={(bodyPart) => patch({ bodyPart })}
              placeholder="Например, подбородок"
            />
            {sideBlock}
            {titleBlock}
            {dateBlock}
            {reasonBlock}
            {facilityBlock}
            <Section title="Лечение — можно несколько">
              <ChipGroup<InjuryTreatment>
                options={TREATMENTS}
                selected={form.treatments}
                onToggle={(value) => patch({ treatments: toggleIn(form.treatments, value) })}
              />
            </Section>
          </>
        )}

        {transfusion && (
          <>
            <Section title="Что переливали">
              <ChipGroup<TransfusionProduct>
                options={TRANSFUSION_PRODUCTS}
                selected={form.transfusionProduct ? [form.transfusionProduct] : []}
                tone={() => "error"}
                onToggle={(value) => patch({ transfusionProduct: form.transfusionProduct === value ? "" : value })}
              />
            </Section>
            {titleBlock}
            {dateBlock}
            {reasonBlock}
            {facilityBlock}
          </>
        )}

        {anesthesiaBlock}

        <TextField
          size="small"
          label={transfusion ? "Реакция на переливание" : injury ? "Осложнения травмы" : "Осложнения операции"}
          placeholder="Если были"
          value={form.complications}
          onChange={(event) => patch({ complications: event.target.value })}
          multiline
          fullWidth
        />

        {!transfusion && (
          <Section title="Исход">
            <ChipGroup<SurgeryOutcome>
              options={OUTCOME_OPTIONS}
              selected={form.outcome ? [form.outcome] : []}
              tone={(value) => (value === "recovered" ? "success" : value === "consequences" ? "warning" : "primary")}
              onToggle={(value) => patch({ outcome: form.outcome === value ? "" : value })}
            />
          </Section>
        )}

        {stayBlock}

        <Section title="Документы">
          <HealthFilesField
            patientId={patientId}
            value={form.attachments}
            onChange={(attachments) => patch({ attachments })}
            kinds={["discharge", "image", "other"]}
            defaultKind={injury ? "image" : "discharge"}
            onBusyChange={setUploading}
          />
        </Section>

        {surgery && (
          <Section title="Статус">
            <ChipGroup<SurgeryStatus>
              options={SURGERY_STATUSES}
              selected={[form.status]}
              tone={(value) => (value === "refuted" ? "warning" : "success")}
              onToggle={(value) => patch({ status: value })}
            />
            {form.status === "refuted" && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                Запись не удаляется: она останется зачёркнутой и в журнале, в подсказки не попадёт.
              </Typography>
            )}
          </Section>
        )}

        <TextField
          size="small"
          label="Заметка"
          value={form.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          multiline
          minRows={2}
          fullWidth
        />
      </HealthDrawerShell>
      <HospitalizationDrawer
        open={stayInitial != null}
        patientId={patientId}
        hospitalization={null}
        conditions={conditions}
        initial={stayInitial ?? undefined}
        onSaved={(row) => patch({ hospitalizationId: row.id })}
        onClose={() => setStayInitial(null)}
      />
      <AllergyDrawer
        open={allergy != null}
        patientId={patientId}
        allergy={null}
        initial={allergy ?? undefined}
        onClose={() => setAllergy(null)}
      />
    </>
  );
};
