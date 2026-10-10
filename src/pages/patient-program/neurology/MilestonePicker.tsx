import React from "react";
import { Box, Button, Chip, Stack, Typography, alpha, useTheme } from "@mui/material";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../../../components/ui";
import { gendered, type Sex } from "./neuroCatalog";
import {
  SPHERES,
  buildPicture,
  evaluateMilestones,
  inWindow,
  milestoneLabel,
  monthChoices,
  normHint,
  sphereMilestones,
  stateText,
  type MarkSource,
  type MilestoneDef,
  type MilestoneMark,
  type MilestoneView,
} from "./neuroMilestones";
import { fmt, monthsOn, neuroAge, sinceDate, type AgeContext } from "./neuroNorms";
import { LevelDot } from "./NeuroControls";
import { levelTextColor } from "./neuroUi";

interface MilestonePickerProps {
  /** Отметки других записей (без этой) — картина «до этой записи». */
  sources: ReadonlyArray<MarkSource>;
  /** Отметки этой записи. */
  marks: Readonly<Record<string, MilestoneMark>>;
  onChange: (marks: Record<string, MilestoneMark>) => void;
  ages: AgeContext;
  /** Дата записи (ISO). */
  at: string;
  sex: Sex;
  reported: boolean;
}

const chipSx = { height: 30, borderRadius: "8px" } as const;

/**
 * Вехи возраста (ТЗ §5): неосвоенные и неотмеченные вехи окна возраста и все
 * жёлтые и красные — по сферам, с подсказкой нормы, «Есть» / «Ещё нет»; после
 * «Есть» — кнопки месяцев, «свой срок» и «не помню». «Все вехи» — остальные,
 * в том числе освоенные: правка срока и «Утрачен».
 */
export const MilestonePicker: React.FC<MilestonePickerProps> = ({ sources, marks, onChange, ages, at, sex, reported }) => {
  const theme = useTheme();
  const [showAll, setShowAll] = React.useState(false);
  const [ask, setAsk] = React.useState<string | null>(null);
  const [custom, setCustom] = React.useState<ReadonlySet<string>>(new Set());
  const base = React.useMemo(() => evaluateMilestones(buildPicture(sources), ages, at), [sources, ages, at]);
  const effective = React.useMemo(() => {
    const own: MarkSource = { recordId: -1, at, createdAt: "9999-12-31T00:00:00Z", marks: { ...marks } };
    return evaluateMilestones(buildPicture([...sources, own]), ages, at);
  }, [sources, marks, ages, at]);
  const age = neuroAge(ages, at);
  const ageAt = age.months;
  const offset = age.corrected && age.passport != null && age.months != null ? age.passport - age.months : 0;
  const birthDate = ages.birthDate;

  const isPrimary = (def: MilestoneDef): boolean => {
    const view = base.get(def.code);
    if (marks[def.code]) return true;
    if (!view) return false;
    if (ageAt == null) return view.state !== "yes";
    if (view.state !== "yes" && inWindow(def, ageAt)) return true;
    return (view.state === "no" || view.state === "lost") && view.level !== "unknown";
  };
  const groups = SPHERES.map((sphere) => {
    const defs = sphereMilestones(sphere.value);
    return { sphere, primary: defs.filter(isPrimary), rest: defs.filter((def) => !isPrimary(def)) };
  });
  const restCount = groups.reduce((sum, group) => sum + group.rest.length, 0);

  const set = (code: string, mark: MilestoneMark | null) => {
    const next = { ...marks };
    if (mark) next[code] = mark;
    else delete next[code];
    onChange(next);
    setAsk(null);
  };
  const toggle = (code: string, state: MilestoneMark["state"], since: string | null = null) =>
    set(code, marks[code]?.state === state ? null : { state, since: state === "yes" ? since : null, reported });

  const row = (def: MilestoneDef) => {
    const code = def.code;
    const before = base.get(code) as MilestoneView;
    const view = effective.get(code) as MilestoneView;
    const mark = marks[code];
    const achieved = before.state === "yes";
    const choices = monthChoices(def, age.passport, offset);
    const sinceMonths = mark?.state === "yes" && mark.since ? monthsOn(birthDate, mark.since) : null;
    const showCustom = custom.has(code) || (mark?.state === "yes" && mark.since != null && !choices.includes(sinceMonths ?? -1));
    const button = (label: string, active: boolean, onClick: () => void, tone: "primary" | "warning" | "error" | "success" = "primary") => (
      <Chip
        size="small"
        clickable
        label={label}
        color={active ? tone : "default"}
        variant={active ? "filled" : "outlined"}
        onClick={onClick}
        aria-pressed={active}
        sx={{ ...chipSx, fontWeight: active ? 600 : 400 }}
      />
    );
    return (
      <Box key={code} sx={{ py: 1, borderTop: 1, borderColor: "divider" }}>
        <Stack direction="row" gap={1} alignItems="baseline">
          <Box sx={{ alignSelf: "center", display: "flex" }}>
            <LevelDot level={view.level} />
          </Box>
          <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }}>
            {milestoneLabel(def, sex)}
          </Typography>
          <Typography
            variant="caption"
            sx={{ flexShrink: 0, fontWeight: 600, color: view.level === "unknown" ? "text.secondary" : levelTextColor(theme, view.level) }}
          >
            {stateText(view, birthDate, sex)}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ pl: 2 }}>
          {normHint(def)}
        </Typography>
        <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ pl: 2, mt: 0.75 }}>
          {button(achieved ? "Изменить срок" : "Есть", mark?.state === "yes", () => toggle(code, "yes", achieved ? before.entry?.mark.since ?? null : null), "success")}
          {button(
            "Ещё нет",
            mark?.state === "no",
            () => (achieved && mark?.state !== "no" ? setAsk(ask === code ? null : code) : toggle(code, "no")),
            "warning",
          )}
          {achieved && button("Утрачен", mark?.state === "lost", () => toggle(code, "lost"), "error")}
          {code === "crawls" && button(gendered("Не ползал{а} — сразу начал{а} ходить", sex), mark?.state === "skipped", () => toggle(code, "skipped"))}
        </Stack>
        {ask === code && (
          <Box sx={{ ml: 2, mt: 1, p: 1.25, borderRadius: "10px", bgcolor: alpha(theme.palette.warning.main, 0.1) }}>
            <Typography variant="body2" fontWeight={600}>
              Навык утрачен или отметка была ошибочной?
            </Typography>
            <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 0.75 }}>
              <Button size="small" variant="contained" color="error" onClick={() => set(code, { state: "lost", since: null, reported })} sx={{ textTransform: "none" }}>
                Утрачен — регресс
              </Button>
              <Button size="small" variant="outlined" onClick={() => set(code, { state: "no", since: null, reported })} sx={{ textTransform: "none" }}>
                Ошибка в отметке
              </Button>
              <Button size="small" onClick={() => setAsk(null)} sx={{ textTransform: "none" }}>
                Отмена
              </Button>
            </Stack>
          </Box>
        )}
        {mark?.state === "yes" && (
          <Box sx={{ pl: 2, mt: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              С какого возраста, мес{age.corrected ? " (паспортный)" : ""}
            </Typography>
            <Stack direction="row" gap={0.5} flexWrap="wrap">
              {birthDate &&
                choices.map((months) => (
                  <Chip
                    key={months}
                    size="small"
                    clickable
                    label={fmt(months)}
                    color={sinceMonths === months && !showCustom ? "success" : "default"}
                    variant={sinceMonths === months && !showCustom ? "filled" : "outlined"}
                    onClick={() => {
                      setCustom((current) => new Set([...current].filter((item) => item !== code)));
                      set(code, { ...mark, since: sinceDate(birthDate, months) });
                    }}
                    sx={{ height: 28, minWidth: 40, borderRadius: "7px" }}
                  />
                ))}
              <Chip
                size="small"
                clickable
                label="свой срок"
                variant={showCustom ? "filled" : "outlined"}
                color={showCustom ? "success" : "default"}
                onClick={() => setCustom((current) => new Set([...current, code]))}
                sx={{ height: 28, borderRadius: "7px", borderStyle: showCustom ? undefined : "dashed" }}
              />
              <Chip
                size="small"
                clickable
                label="не помню"
                variant={mark.since == null && !showCustom ? "filled" : "outlined"}
                color={mark.since == null && !showCustom ? "success" : "default"}
                onClick={() => {
                  setCustom((current) => new Set([...current].filter((item) => item !== code)));
                  set(code, { ...mark, since: null });
                }}
                sx={{ height: 28, borderRadius: "7px" }}
              />
            </Stack>
            {showCustom && (
              <Box sx={{ mt: 1, maxWidth: 240 }}>
                <CustomDatePicker
                  label="С какой даты"
                  value={mark.since ? dayjs(mark.since) : null}
                  maxDate={dayjs(at)}
                  minDate={birthDate ? dayjs(birthDate) : undefined}
                  onChange={(value) => {
                    const date = value as Dayjs | null;
                    if (date && date.isValid()) set(code, { ...mark, since: date.format("YYYY-MM-DD") });
                  }}
                  slotProps={{ textField: { size: "small", fullWidth: true } }}
                />
              </Box>
            )}
            {view.note && view.level !== "unknown" && (
              <Typography variant="caption" display="block" sx={{ mt: 0.5, color: levelTextColor(theme, view.level), fontWeight: 600 }}>
                {view.note}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    );
  };

  const anyPrimary = groups.some((group) => group.primary.length);
  return (
    <Stack gap={1.5}>
      {ageAt == null && (
        <Typography variant="caption" color="text.secondary">
          {ages.birthDate ? "Ребёнок младше срока доношенности — нормы по возрасту не считаются." : "Нет даты рождения — нормы по возрасту не считаются."}
        </Typography>
      )}
      {!anyPrimary && (
        <Typography variant="body2" color="text.secondary">
          Вех этого возраста без отметки нет — остальные в «Все вехи».
        </Typography>
      )}
      {groups.map(({ sphere, primary, rest }) => {
        const list = showAll ? [...primary, ...rest] : primary;
        if (!list.length) return null;
        return (
          <Box key={sphere.value}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              {sphere.label}
            </Typography>
            {list.map(row)}
          </Box>
        );
      })}
      {restCount > 0 && (
        <Button
          onClick={() => setShowAll((value) => !value)}
          endIcon={<ExpandMoreOutlined sx={{ transform: showAll ? "rotate(180deg)" : "none", transition: "transform .2s" }} />}
          sx={{ alignSelf: "flex-start", textTransform: "none", px: 0 }}
        >
          {showAll ? "Только вехи возраста" : `Все вехи — ещё ${restCount}`}
        </Button>
      )}
    </Stack>
  );
};
