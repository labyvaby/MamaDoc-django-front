import React from "react";
import { Box, Chip, FormControlLabel, InputAdornment, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";

import { ChipGroup, DiopterField, NormalOrText, Section } from "./VisionControls";
import { ACUITY_CHOICES, ALIGNMENTS, BINOCULAR, COLOR_VISION, COMPLAINTS, DEVIATION_ANGLES } from "./visionCatalog";
import { toggleExclusive, type ExamForm, type RefractionInput } from "./visionData";
import { pairGridSx } from "./visionUi";

type RefractionSide = "refractionRight" | "refractionLeft";

interface VisionFullExamProps {
  form: ExamForm;
  patch: (next: Partial<ExamForm>) => void;
}

const mm = { endAdornment: <InputAdornment position="end">мм</InputAdornment> };

/** Поля полного осмотра офтальмолога: всё кнопками или короткими полями. */
export const VisionFullExam: React.FC<VisionFullExamProps> = ({ form, patch }) => {
  const setRefraction = (side: RefractionSide, key: keyof RefractionInput, value: string) =>
    patch({ [side]: { ...form[side], [key]: value } } as Partial<ExamForm>);
  const correctedSelect = (key: "acuityRightCorrected" | "acuityLeftCorrected", label: string) => (
    <TextField
      select
      size="small"
      label={label}
      value={form[key]}
      onChange={(event) => patch({ [key]: event.target.value } as Partial<ExamForm>)}
      fullWidth
    >
      <MenuItem value="">—</MenuItem>
      {ACUITY_CHOICES.map((choice) => (
        <MenuItem key={choice.value} value={choice.value}>
          {choice.label}
        </MenuItem>
      ))}
    </TextField>
  );
  return (
    <Stack gap={2.25} sx={{ pt: 1 }}>
      <Section title="Жалобы">
        <ChipGroup
          options={COMPLAINTS}
          selected={form.complaints}
          onToggle={(value) => patch({ complaints: toggleExclusive(form.complaints, value, "none") })}
        />
      </Section>
      <Section title="Острота с коррекцией">
        <Box sx={pairGridSx}>
          {correctedSelect("acuityRightCorrected", "OD с коррекцией")}
          {correctedSelect("acuityLeftCorrected", "OS с коррекцией")}
        </Box>
      </Section>
      <Section
        title="Рефракция"
        action={
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch size="small" checked={form.cycloplegia} onChange={(event) => patch({ cycloplegia: event.target.checked })} />
            }
            label={<Typography variant="caption">в циклоплегии</Typography>}
          />
        }
      >
        <Stack gap={1}>
          {(["refractionRight", "refractionLeft"] as const).map((side) => (
            <Box
              key={side}
              sx={{
                display: "grid",
                gap: 1,
                alignItems: "center",
                gridTemplateColumns: { xs: "1fr", md: "36px repeat(3, minmax(0, 1fr))" },
              }}
            >
              <Typography variant="body2" fontWeight={700}>
                {side === "refractionRight" ? "OD" : "OS"}
              </Typography>
              <DiopterField label="Сфера" value={form[side].sph} onChange={(value) => setRefraction(side, "sph", value)} />
              <DiopterField label="Цилиндр" value={form[side].cyl} onChange={(value) => setRefraction(side, "cyl", value)} />
              <TextField
                size="small"
                label="Ось, °"
                value={form[side].axis}
                onChange={(event) => setRefraction(side, "axis", event.target.value)}
                inputProps={{ inputMode: "numeric" }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Stack direction="row" gap={0.25}>
                        {[90, 180].map((axis) => (
                          <Chip
                            key={axis}
                            size="small"
                            label={axis}
                            onClick={() => setRefraction(side, "axis", String(axis))}
                            sx={{ height: 22 }}
                          />
                        ))}
                      </Stack>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
          ))}
        </Stack>
      </Section>
      <Section title="Положение глаз">
        <Stack gap={1}>
          <ChipGroup
            options={ALIGNMENTS}
            selected={form.alignmentKind ? [form.alignmentKind] : []}
            onToggle={(value) =>
              patch({
                alignmentKind: form.alignmentKind === value ? "" : value,
                alignmentAngle: value === "ortho" ? null : form.alignmentAngle,
              })
            }
          />
          {form.alignmentKind && form.alignmentKind !== "ortho" && (
            <ChipGroup
              options={DEVIATION_ANGLES}
              selected={form.alignmentAngle ? [form.alignmentAngle] : []}
              onToggle={(value) => patch({ alignmentAngle: form.alignmentAngle === value ? null : value })}
            />
          )}
          <FormControlLabel
            sx={{ m: 0 }}
            control={<Switch size="small" checked={form.nystagmus} onChange={(event) => patch({ nystagmus: event.target.checked })} />}
            label={<Typography variant="body2">Нистагм</Typography>}
          />
        </Stack>
      </Section>
      <Box sx={pairGridSx}>
        <Section title="Бинокулярное зрение">
          <ChipGroup
            options={BINOCULAR}
            selected={form.binocular ? [form.binocular] : []}
            onToggle={(value) => patch({ binocular: form.binocular === value ? "" : value })}
          />
        </Section>
        <Section title="Цветоощущение">
          <ChipGroup
            options={COLOR_VISION}
            selected={form.colorVision ? [form.colorVision] : []}
            onToggle={(value) => patch({ colorVision: form.colorVision === value ? "" : value })}
          />
        </Section>
      </Box>
      <NormalOrText
        title="Передний отрезок"
        normal={form.anteriorNormal}
        text={form.anteriorText}
        onNormal={(normal) => patch({ anteriorNormal: normal })}
        onText={(text) => patch({ anteriorText: text })}
      />
      <NormalOrText
        title="Глазное дно"
        normal={form.fundusNormal}
        text={form.fundusText}
        onNormal={(normal) => patch({ fundusNormal: normal })}
        onText={(text) => patch({ fundusText: text })}
      />
      <Box sx={pairGridSx}>
        <Section title="Внутриглазное давление">
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <ChipGroup
              options={[{ value: "normal", label: "В норме" }]}
              selected={form.iopNormal ? ["normal"] : []}
              tone={() => "success"}
              onToggle={() => patch({ iopNormal: !form.iopNormal })}
            />
            <TextField size="small" label="OD" value={form.iopRight} onChange={(event) => patch({ iopRight: event.target.value })} sx={{ width: 84 }} inputProps={{ inputMode: "decimal" }} />
            <TextField size="small" label="OS" value={form.iopLeft} onChange={(event) => patch({ iopLeft: event.target.value })} sx={{ width: 84 }} inputProps={{ inputMode: "decimal" }} />
          </Stack>
        </Section>
        <Section title="Длина глаза (ПЗО)">
          <Stack direction="row" gap={1}>
            <TextField size="small" label="OD" value={form.axialRight} onChange={(event) => patch({ axialRight: event.target.value })} InputProps={mm} inputProps={{ inputMode: "decimal" }} />
            <TextField size="small" label="OS" value={form.axialLeft} onChange={(event) => patch({ axialLeft: event.target.value })} InputProps={mm} inputProps={{ inputMode: "decimal" }} />
          </Stack>
        </Section>
      </Box>
    </Stack>
  );
};
