import React from "react";
import { Box, MenuItem, TextField } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";

import { DEFECT_SEVERITIES, createAct, createDefect, createStage, type ActDetail, type DefectDetail } from "../../api/construction";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { FormDrawer } from "../realty-finance/shared";
import { isoDate, parseNumber, positiveAmount } from "./format";
import { useConstructionProjects, useContractorOptions, useRefreshConstruction, useStageGroups } from "./hooks";

const dateSlot = (error: boolean, helperText?: string) => ({ textField: { size: "small" as const, fullWidth: true, error, helperText } });

/** «＋ Этап» в график ЖК. */
export function NewStageDrawer({ open, projectId, projectName, onClose }: { open: boolean; projectId: number | null; projectName: string; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshConstruction();
  const { enqueueSnackbar } = useSnackbar();
  const groups = useStageGroups(open).data ?? [];
  const contractors = useContractorOptions(open);
  const [name, setName] = React.useState("");
  const [group, setGroup] = React.useState("");
  const [contractorId, setContractorId] = React.useState<number | "">("");
  const [start, setStart] = React.useState<Dayjs | null>(null);
  const [end, setEnd] = React.useState<Dayjs | null>(null);
  const [volume, setVolume] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const save = useMutation({
    mutationFn: () =>
      createStage(
        {
          projectId: projectId as number,
          name,
          group,
          contractorId: contractorId === "" ? null : contractorId,
          start: isoDate(start) as string,
          end: isoDate(end) as string,
          volume: parseNumber(volume),
          unit,
        },
        scope,
      ),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("schedule.form.created"), { variant: "success" });
      onClose();
    },
  });

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setGroup("");
    setContractorId("");
    setStart(dayjs());
    setEnd(null);
    setVolume("");
    setUnit("");
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  const startIso = isoDate(start);
  const endIso = isoDate(end);
  const invalid = {
    name: !name.trim(),
    group: !group,
    start: !startIso,
    end: !endIso || (startIso != null && endIso < startIso),
    volume: volume.trim() !== "" && (parseNumber(volume) == null || (parseNumber(volume) as number) < 0),
  };
  const hasErrors = Object.values(invalid).some(Boolean);

  return (
    <FormDrawer
      open={open && projectId != null}
      title={t("schedule.form.title", { project: projectName })}
      submitLabel={t("schedule.form.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!hasErrors) save.mutate();
      }}
    >
      <TextField size="small" label={t("schedule.form.name")} value={name} onChange={(e) => setName(e.target.value)} error={touched && invalid.name} helperText={touched && invalid.name ? t("common.required") : undefined} />
      <TextField select size="small" label={t("schedule.form.group")} value={group} onChange={(e) => setGroup(e.target.value)} error={touched && invalid.group} helperText={touched && invalid.group ? t("common.required") : undefined}>
        {groups.map((g) => (
          <MenuItem key={g.code} value={g.code}>
            {g.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label={t("schedule.form.contractor")}
        value={contractorId}
        onChange={(e) => setContractorId(e.target.value === "" ? "" : Number(e.target.value))}
        SelectProps={{ displayEmpty: true }}
        InputLabelProps={{ shrink: true }}
      >
        <MenuItem value="">{t("common.ownForces")}</MenuItem>
        {contractors.map((c) => (
          <MenuItem key={c.id} value={c.id} disabled={c.isBlocked}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        <CustomDatePicker label={t("schedule.form.start")} value={start} onChange={(v) => setStart(v as Dayjs | null)} slotProps={dateSlot(touched && invalid.start, touched && invalid.start ? t("common.required") : undefined)} />
        <CustomDatePicker
          label={t("schedule.form.end")}
          value={end}
          onChange={(v) => setEnd(v as Dayjs | null)}
          slotProps={dateSlot(touched && invalid.end, touched && invalid.end ? (endIso ? t("schedule.form.endBeforeStart") : t("common.required")) : undefined)}
        />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 1.5 }}>
        <TextField size="small" label={t("schedule.form.volume")} value={volume} inputMode="decimal" onChange={(e) => setVolume(e.target.value)} error={touched && invalid.volume} helperText={touched && invalid.volume ? t("common.number") : undefined} />
        <TextField size="small" label={t("schedule.form.unit")} value={unit} onChange={(e) => setUnit(e.target.value)} />
      </Box>
    </FormDrawer>
  );
}

export interface ActPreset {
  contractorId: number | null;
  projectId: number | null;
  subject: string;
}

/** «＋ Акт» — из реестра подрядчиков или из карточки этапа (предмет = этап). */
export function ActFormDrawer({ preset, onClose, onCreated }: { preset: ActPreset | null; onClose: () => void; onCreated?: (act: ActDetail) => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshConstruction();
  const { enqueueSnackbar } = useSnackbar();
  const open = preset != null;
  const contractors = useContractorOptions(open);
  const projects = useConstructionProjects(open).data ?? [];
  const [contractorId, setContractorId] = React.useState<number | "">("");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [period, setPeriod] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const save = useMutation({
    mutationFn: () => createAct({ contractorId: contractorId as number, projectId: projectId as number, period, amount: positiveAmount(amount) as string, subject }, scope),
    onSuccess: (act) => {
      refresh();
      enqueueSnackbar(t("act.created"), { variant: "success" });
      onClose();
      onCreated?.(act);
    },
  });

  React.useEffect(() => {
    if (!preset) return;
    setContractorId(preset.contractorId ?? "");
    setProjectId(preset.projectId ?? "");
    setPeriod(dayjs().locale("ru").format("MMMM YYYY"));
    setSubject(preset.subject);
    setAmount("");
    setTouched(false);
    save.reset();
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  const invalid = { contractor: contractorId === "", project: projectId === "", period: !period.trim(), subject: !subject.trim(), amount: positiveAmount(amount) == null };
  const hasErrors = Object.values(invalid).some(Boolean);
  const req = (bad: boolean) => (touched && bad ? t("common.required") : undefined);

  return (
    <FormDrawer
      open={open}
      title={t("act.formTitle")}
      submitLabel={t("act.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!hasErrors) save.mutate();
      }}
    >
      <TextField select size="small" label={t("act.contractor")} value={contractorId} onChange={(e) => setContractorId(Number(e.target.value))} error={touched && invalid.contractor} helperText={req(invalid.contractor)}>
        {contractors.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField select size="small" label={t("act.project")} value={projectId} onChange={(e) => setProjectId(Number(e.target.value))} error={touched && invalid.project} helperText={req(invalid.project)}>
        {projects.map((p) => (
          <MenuItem key={p.projectId} value={p.projectId}>
            {p.projectName}
          </MenuItem>
        ))}
      </TextField>
      <TextField size="small" label={t("act.subject")} value={subject} onChange={(e) => setSubject(e.target.value)} error={touched && invalid.subject} helperText={req(invalid.subject)} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        <TextField size="small" label={t("act.period")} value={period} onChange={(e) => setPeriod(e.target.value)} error={touched && invalid.period} helperText={req(invalid.period) ?? t("act.periodHint")} />
        <TextField
          size="small"
          label={t("act.amount")}
          value={amount}
          inputMode="decimal"
          onChange={(e) => setAmount(e.target.value)}
          error={touched && invalid.amount}
          helperText={touched && invalid.amount ? t("common.amountInvalid") : undefined}
        />
      </Box>
    </FormDrawer>
  );
}

export interface DefectPreset {
  projectId: number | null;
  contractorId: number | null;
  stageId: number | null;
  inspectionId: number | null;
}

/** «＋ Дефект» — из стройконтроля, карточки этапа или после проверки с замечаниями. */
export function DefectFormDrawer({ preset, onClose, onCreated }: { preset: DefectPreset | null; onClose: () => void; onCreated?: (defect: DefectDetail) => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshConstruction();
  const { enqueueSnackbar } = useSnackbar();
  const open = preset != null;
  const contractors = useContractorOptions(open);
  const projects = useConstructionProjects(open).data ?? [];
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [severity, setSeverity] = React.useState<string>("major");
  const [deadline, setDeadline] = React.useState<Dayjs | null>(null);
  const [contractorId, setContractorId] = React.useState<number | "">("");
  const [section, setSection] = React.useState("");
  const [floor, setFloor] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const save = useMutation({
    mutationFn: () =>
      createDefect(
        {
          projectId: projectId as number,
          title,
          category,
          severity,
          deadline: isoDate(deadline) as string,
          contractorId: contractorId === "" ? null : contractorId,
          stageId: preset?.stageId ?? null,
          inspectionId: preset?.inspectionId ?? null,
          section,
          floor: floor.trim() ? parseNumber(floor) : null,
          description,
        },
        scope,
      ),
    onSuccess: (defect) => {
      refresh();
      enqueueSnackbar(t("defect.created"), { variant: "success" });
      onClose();
      onCreated?.(defect);
    },
  });

  React.useEffect(() => {
    if (!preset) return;
    setProjectId(preset.projectId ?? "");
    setTitle("");
    setCategory("");
    setSeverity("major");
    setDeadline(dayjs().add(7, "day"));
    setContractorId(preset.contractorId ?? "");
    setSection("");
    setFloor("");
    setDescription("");
    setTouched(false);
    save.reset();
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  const floorBad = floor.trim() !== "" && (parseNumber(floor) == null || !Number.isInteger(parseNumber(floor)));
  const invalid = { project: projectId === "", title: !title.trim(), category: !category.trim(), deadline: !isoDate(deadline), floor: floorBad };
  const hasErrors = Object.values(invalid).some(Boolean);
  const req = (bad: boolean) => (touched && bad ? t("common.required") : undefined);

  return (
    <FormDrawer
      open={open}
      title={t("defect.formTitle")}
      submitLabel={t("defect.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!hasErrors) save.mutate();
      }}
    >
      <TextField select size="small" label={t("defect.project")} value={projectId} onChange={(e) => setProjectId(Number(e.target.value))} error={touched && invalid.project} helperText={req(invalid.project)}>
        {projects.map((p) => (
          <MenuItem key={p.projectId} value={p.projectId}>
            {p.projectName}
          </MenuItem>
        ))}
      </TextField>
      <TextField size="small" label={t("defect.title")} value={title} onChange={(e) => setTitle(e.target.value)} error={touched && invalid.title} helperText={req(invalid.title)} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        <TextField size="small" label={t("defect.category")} value={category} onChange={(e) => setCategory(e.target.value)} error={touched && invalid.category} helperText={req(invalid.category) ?? t("defect.categoryHint")} />
        <TextField select size="small" label={t("defect.severity")} value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {DEFECT_SEVERITIES.map((s) => (
            <MenuItem key={s} value={s}>
              {t(`defect.severity_${s}`)}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <CustomDatePicker label={t("defect.deadline")} value={deadline} onChange={(v) => setDeadline(v as Dayjs | null)} slotProps={dateSlot(touched && invalid.deadline, req(invalid.deadline))} />
      <TextField
        select
        size="small"
        label={t("defect.contractor")}
        value={contractorId}
        onChange={(e) => setContractorId(e.target.value === "" ? "" : Number(e.target.value))}
        SelectProps={{ displayEmpty: true }}
        InputLabelProps={{ shrink: true }}
      >
        <MenuItem value="">{t("common.ownForces")}</MenuItem>
        {contractors.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <TextField size="small" label={t("defect.section")} value={section} onChange={(e) => setSection(e.target.value)} />
        <TextField size="small" label={t("defect.floor")} value={floor} inputMode="numeric" onChange={(e) => setFloor(e.target.value)} error={touched && invalid.floor} helperText={touched && invalid.floor ? t("common.number") : undefined} />
      </Box>
      <TextField size="small" label={t("defect.description")} value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={3} />
    </FormDrawer>
  );
}
