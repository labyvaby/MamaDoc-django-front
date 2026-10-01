import React from "react";
import {
  Box,
  Button,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import dayjs from "dayjs";

import { CustomDatePicker } from "../../../../components/ui";
import { useT } from "../../../../i18n/VerticalProvider";
import { subtleBg } from "../../../../theme/uiHelpers";
import { formatArea, formatMoney, formatRooms } from "../../model/units";
import {
  WIZARD_LIMITS,
  cloneSection,
  floorsOfProject,
  nextRange,
  planUnits,
  pricePerSqmAt,
  resizeFloor,
  sectionFloors,
  type WizardFloorRange,
  type WizardSection,
  type WizardState,
  type WizardUnitType,
} from "../../model/wizard";

export interface StepProps {
  state: WizardState;
  onChange: (next: WizardState) => void;
}

const cardSx = { border: 1, borderColor: "divider", borderRadius: "12px", p: { xs: 1.5, md: 2 } } as const;

/**
 * Числовое поле: держит введённую строку, пока она не стала числом («64.» при
 * наборе 64.5), и не превращает пустое поле в 0 у пользователя на глазах.
 */
function NumField({
  value,
  onChange,
  label,
  decimals = false,
  suffix,
  width,
  helperText,
  required,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  decimals?: boolean;
  suffix?: string;
  width?: number | string;
  helperText?: string;
  required?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = React.useState(() => (Number.isFinite(value) && value !== 0 ? String(value) : ""));
  React.useEffect(() => {
    setText((current) => (Number(current.replace(",", ".")) === value || (current === "" && value === 0) ? current : String(value)));
  }, [value]);
  return (
    <TextField
      size="small"
      label={label}
      required={required}
      value={text}
      helperText={helperText}
      onChange={(event) => {
        const raw = event.target.value.replace(/\s/g, "");
        const pattern = decimals ? /^\d*([.,]\d{0,1})?$/ : /^\d*$/;
        if (!pattern.test(raw)) return;
        setText(raw);
        onChange(raw === "" ? 0 : Number(raw.replace(",", ".")));
      }}
      slotProps={{
        htmlInput: { inputMode: decimals ? "decimal" : "numeric", "aria-label": ariaLabel },
        input: suffix ? { endAdornment: <InputAdornment position="end">{suffix}</InputAdornment> } : undefined,
      }}
      sx={{ width }}
    />
  );
}

const toDate = (value: string | null) => (value ? dayjs(value) : null);
const fromDate = (value: dayjs.Dayjs | null) => (value?.isValid() ? value.format("YYYY-MM-DD") : null);

// ─── 1. ЖК ─────────────────────────────────────────────────────────────────

export function ProjectStep({ state, onChange, branchName }: StepProps & { branchName: string | null }) {
  const { t } = useT("realestate");
  return (
    <Box sx={{ display: "grid", gap: 2, maxWidth: 560 }}>
      <TextField
        size="small"
        required
        autoFocus
        label={t("wizard.project.name")}
        placeholder={t("wizard.project.namePlaceholder")}
        value={state.name}
        onChange={(event) => onChange({ ...state, name: event.target.value })}
        slotProps={{ htmlInput: { maxLength: WIZARD_LIMITS.nameMax } }}
      />
      <TextField
        size="small"
        label={t("wizard.project.address")}
        value={state.address}
        onChange={(event) => onChange({ ...state, address: event.target.value })}
        slotProps={{ htmlInput: { maxLength: WIZARD_LIMITS.nameMax } }}
      />
      <CustomDatePicker
        label={t("wizard.project.deadline")}
        value={toDate(state.deadline)}
        onChange={(value) => onChange({ ...state, deadline: fromDate(value as dayjs.Dayjs | null) })}
        disablePast
        slotProps={{ textField: { size: "small", sx: { maxWidth: 240 } } }}
      />
      <Typography variant="body2" color="text.secondary">
        {branchName ? t("wizard.project.branch", { name: branchName }) : t("wizard.project.branchNone")}
      </Typography>
    </Box>
  );
}

// ─── 2. Корпуса ────────────────────────────────────────────────────────────

export function SectionsStep({ state, onChange }: StepProps) {
  const { t } = useT("realestate");
  const update = (id: string, patch: Partial<WizardSection>) =>
    onChange({ ...state, sections: state.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const add = () => {
    const last = state.sections[state.sections.length - 1]!;
    onChange({ ...state, sections: [...state.sections, cloneSection(last, t("wizard.sections.defaultName", { n: state.sections.length + 1 }))] });
  };
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {t("wizard.sections.hint")}
      </Typography>
      {state.sections.map((section, index) => (
        <Box key={section.id} sx={{ ...cardSx, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.5 }}>
          <Typography sx={{ width: 24, pt: 1, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{index + 1}</Typography>
          <TextField
            size="small"
            required
            label={t("wizard.sections.name")}
            value={section.name}
            onChange={(event) => update(section.id, { name: event.target.value })}
            helperText={t("wizard.sections.nameHelper", { max: WIZARD_LIMITS.sectionNameMax })}
            slotProps={{ htmlInput: { maxLength: WIZARD_LIMITS.sectionNameMax } }}
            sx={{ width: { xs: "100%", md: 220 } }}
          />
          <CustomDatePicker
            label={t("wizard.sections.deadline")}
            value={toDate(section.deadline)}
            onChange={(value) => update(section.id, { deadline: fromDate(value as dayjs.Dayjs | null) })}
            disablePast
            slotProps={{
              textField: {
                size: "small",
                placeholder: t("wizard.sections.deadlineInherit"),
                helperText: section.deadline ? " " : t("wizard.sections.deadlineInherit"),
                sx: { width: { xs: "100%", md: 200 } },
              },
            }}
          />
          <Tooltip title={t("wizard.sections.remove")}>
            <span>
              <IconButton
                aria-label={t("wizard.sections.remove")}
                disabled={state.sections.length === 1}
                onClick={() => onChange({ ...state, sections: state.sections.filter((s) => s.id !== section.id) })}
                sx={{ ml: { md: "auto" } }}
              >
                <DeleteOutlineOutlined />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ))}
      {state.sections.length < WIZARD_LIMITS.sectionsMax && (
        <Button startIcon={<AddOutlined />} onClick={add} sx={{ justifySelf: "start" }}>
          {t("wizard.sections.add")}
        </Button>
      )}
    </Box>
  );
}

// ─── 3. Этажи и квартиры ───────────────────────────────────────────────────

const ROOM_OPTIONS = Array.from({ length: 7 }, (_, i) => i);

function UnitTypeEditor({ index, unit, onChange }: { index: number; unit: WizardUnitType; onChange: (unit: WizardUnitType) => void }) {
  const { t } = useT("realestate");
  const position = t("wizard.floors.position", { n: index + 1 });
  return (
    <Box sx={(theme) => ({ display: "grid", gap: 1, p: 1, borderRadius: "10px", bgcolor: subtleBg(theme), width: 118 })}>
      <Typography variant="caption" color="text.secondary">
        {position}
      </Typography>
      <TextField
        select
        size="small"
        label={t("wizard.floors.rooms")}
        value={unit.rooms}
        onChange={(event) => onChange({ ...unit, rooms: Number(event.target.value) })}
        slotProps={{ htmlInput: { "aria-label": `${position}: ${t("wizard.floors.rooms")}` } }}
      >
        {ROOM_OPTIONS.map((rooms) => (
          <MenuItem key={rooms} value={rooms}>
            {rooms === 0 ? t("wizard.floors.studio") : rooms}
          </MenuItem>
        ))}
      </TextField>
      <NumField
        decimals
        label={t("wizard.floors.area")}
        ariaLabel={`${position}: ${t("wizard.floors.area")}`}
        value={unit.area}
        onChange={(area) => onChange({ ...unit, area })}
      />
    </Box>
  );
}

function RangeEditor({
  range,
  canRemove,
  onChange,
  onRemove,
}: {
  range: WizardFloorRange;
  canRemove: boolean;
  onChange: (range: WizardFloorRange) => void;
  onRemove: () => void;
}) {
  const { t } = useT("realestate");
  const floors = Math.max(0, range.to - range.from + 1);
  return (
    <Box sx={{ display: "grid", gap: 1.25, py: 1.5, "&:not(:first-of-type)": { borderTop: 1, borderColor: "divider" } }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.25 }}>
        <NumField label={t("wizard.floors.from")} value={range.from} onChange={(from) => onChange({ ...range, from })} width={100} />
        <NumField label={t("wizard.floors.to")} value={range.to} onChange={(to) => onChange({ ...range, to })} width={100} />
        <NumField
          label={t("wizard.floors.perFloor")}
          value={range.units.length}
          onChange={(count) => onChange({ ...range, units: resizeFloor(range.units, count) })}
          width={150}
        />
        <Typography variant="body2" color="text.secondary">
          {t("wizard.floors.rangeSummary", { count: floors * range.units.length })}
        </Typography>
        {canRemove && (
          <Tooltip title={t("wizard.floors.removeRange")}>
            <IconButton aria-label={t("wizard.floors.removeRange")} onClick={onRemove} sx={{ ml: "auto" }}>
              <DeleteOutlineOutlined />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {range.units.map((unit, i) => (
          <UnitTypeEditor
            key={i}
            index={i}
            unit={unit}
            onChange={(next) => onChange({ ...range, units: range.units.map((u, j) => (j === i ? next : u)) })}
          />
        ))}
      </Box>
    </Box>
  );
}

export function FloorsStep({ state, onChange }: StepProps) {
  const { t } = useT("realestate");
  const planned = React.useMemo(() => planUnits(state), [state]);
  const updateSection = (id: string, ranges: WizardFloorRange[]) =>
    onChange({ ...state, sections: state.sections.map((s) => (s.id === id ? { ...s, ranges } : s)) });
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {t("wizard.floors.hint")}
      </Typography>
      {state.sections.map((section, index) => {
        const bounds = sectionFloors(section);
        const count = planned.filter((u) => u.sectionIndex === index).length;
        return (
          <Box key={section.id} component="section" aria-label={section.name} sx={cardSx}>
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 1 }}>
              <Typography sx={{ fontWeight: 600 }}>{section.name || t("wizard.sections.defaultName", { n: index + 1 })}</Typography>
              {bounds && (
                <Typography variant="body2" color="text.secondary">
                  {t("wizard.floors.sectionSummary", {
                    units: t("wizard.floors.rangeSummary", { count }),
                    from: bounds.startFloor,
                    to: bounds.startFloor + bounds.floors - 1,
                  })}
                </Typography>
              )}
            </Box>
            {section.ranges.map((range) => (
              <RangeEditor
                key={range.id}
                range={range}
                canRemove={section.ranges.length > 1}
                onChange={(next) => updateSection(section.id, section.ranges.map((r) => (r.id === range.id ? next : r)))}
                onRemove={() => updateSection(section.id, section.ranges.filter((r) => r.id !== range.id))}
              />
            ))}
            <Button size="small" startIcon={<AddOutlined />} onClick={() => updateSection(section.id, [...section.ranges, nextRange(section)])}>
              {t("wizard.floors.addRange")}
            </Button>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── 4. Нумерация и цены ───────────────────────────────────────────────────

export function PricesStep({ state, onChange }: StepProps) {
  const { t } = useT("realestate");
  const bounds = floorsOfProject(state);
  const sample = state.sections[0]?.ranges[0]?.units[0];
  const examples = React.useMemo(() => {
    const units = planUnits({ ...state, numbering: "bySection" });
    const byFloor = planUnits({ ...state, numbering: "byFloor" });
    const head = (list: typeof units) => [...list].sort((a, b) => a.number - b.number).slice(0, 3).map((u) => u.number).join(", ");
    return { bySection: `${head(units)}…`, byFloor: `${head(byFloor)}…` };
  }, [state]);
  const exampleAt = (floor: number) =>
    sample && bounds
      ? t("wizard.prices.example", {
          rooms: formatRooms(sample.rooms),
          area: formatArea(sample.area),
          floor,
          price: formatMoney(Math.round(sample.area * pricePerSqmAt(state, floor, bounds.lowest))),
        })
      : null;

  return (
    <Box sx={{ display: "grid", gap: 2.5, maxWidth: 640 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        <NumField
          required
          label={t("wizard.prices.base")}
          value={state.pricePerSqm}
          onChange={(pricePerSqm) => onChange({ ...state, pricePerSqm })}
          suffix={t("wizard.prices.perSqm")}
          width={260}
        />
        <NumField
          label={t("wizard.prices.floorStep")}
          value={state.floorStep}
          onChange={(floorStep) => onChange({ ...state, floorStep })}
          suffix={t("wizard.prices.perSqm")}
          helperText={t("wizard.prices.floorStepHelper")}
          width={260}
        />
      </Box>
      {state.pricePerSqm > 0 && bounds && (
        <Box sx={(theme) => ({ p: 1.5, borderRadius: "10px", bgcolor: subtleBg(theme), display: "grid", gap: 0.5 })}>
          <Typography variant="body2">{exampleAt(bounds.lowest)}</Typography>
          {bounds.highest > bounds.lowest && <Typography variant="body2">{exampleAt(bounds.highest)}</Typography>}
        </Box>
      )}
      <Box>
        <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{t("wizard.prices.numbering")}</Typography>
        <RadioGroup value={state.numbering} onChange={(event) => onChange({ ...state, numbering: event.target.value as WizardState["numbering"] })}>
          <FormControlLabel
            value="bySection"
            control={<Radio size="small" />}
            label={<NumberingLabel title={t("wizard.prices.bySection")} hint={t("wizard.prices.bySectionHint", { example: examples.bySection })} />}
            sx={{ alignItems: "flex-start", mb: 1, "& .MuiRadio-root": { pt: 0.25 } }}
          />
          <FormControlLabel
            value="byFloor"
            control={<Radio size="small" />}
            label={<NumberingLabel title={t("wizard.prices.byFloor")} hint={t("wizard.prices.byFloorHint", { example: examples.byFloor })} />}
            sx={{ alignItems: "flex-start", "& .MuiRadio-root": { pt: 0.25 } }}
          />
        </RadioGroup>
      </Box>
    </Box>
  );
}

function NumberingLabel({ title, hint }: { title: string; hint: string }) {
  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {hint}
      </Typography>
    </Box>
  );
}
