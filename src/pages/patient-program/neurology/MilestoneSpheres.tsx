import React from "react";
import { Box, Button, Collapse, Divider, IconButton, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import dayjs from "dayjs";

import type { ProgramModuleRecord } from "../../../api/programs";
import { gendered, type Sex } from "./neuroCatalog";
import {
  SPHERES,
  inWindow,
  milestoneDef,
  milestoneLabel,
  normHint,
  sphereMilestones,
  stateText,
  type MilestoneMark,
  type MilestoneView,
} from "./neuroMilestones";
import { fmt, monthsOn } from "./neuroNorms";
import { LevelDot } from "./NeuroControls";
import { levelTextColor } from "./neuroUi";

const MilestoneLine: React.FC<{ view: MilestoneView; birthDate: string | null; sex: Sex }> = ({ view, birthDate, sex }) => {
  const theme = useTheme();
  const signal = view.level === "warn" || view.level === "bad" || view.level === "urgent";
  const note = view.note && view.state === "yes" ? ` — ${view.note}` : "";
  return (
    <Tooltip title={`${normHint(view.def)}${view.note && view.state !== "variant" ? `. ${gendered(view.note, sex)}` : ""}`} placement="top-start" enterDelay={400}>
      <Stack direction="row" gap={1} alignItems="baseline" sx={{ py: 0.4, minWidth: 0 }}>
        <Box sx={{ alignSelf: "center", display: "flex" }}>
          <LevelDot level={view.level} />
        </Box>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
          {milestoneLabel(view.def, sex)}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            flexShrink: 0,
            maxWidth: "45%",
            textAlign: "right",
            fontWeight: signal ? 700 : 500,
            color: signal ? levelTextColor(theme, view.level) : theme.palette.text.secondary,
          }}
        >
          {stateText(view, birthDate, sex)}
          {note}
        </Typography>
      </Stack>
    </Tooltip>
  );
};

interface MilestoneSpheresProps {
  views: ReadonlyMap<string, MilestoneView>;
  todayAge: number | null;
  birthDate: string | null;
  sex: Sex;
}

/**
 * Вехи по сферам (ТЗ §4): по умолчанию — вехи возраста и всё, что требует
 * внимания; освоенные вовремя — под «Все вехи». Цвет по §3.3–3.4 только у
 * отклонений, точка слева — всегда. Подсказка — норма и источник.
 */
export const MilestoneSpheres: React.FC<MilestoneSpheresProps> = ({ views, todayAge, birthDate, sex }) => {
  const [all, setAll] = React.useState(false);
  const groups = SPHERES.map((sphere) => {
    const list = sphereMilestones(sphere.value)
      .map((def) => views.get(def.code))
      .filter((view): view is MilestoneView => view != null);
    const shown = list.filter((view) => {
      // Освоена вовремя и без пояснения («проверьте дату», «уточните…») — под «Все вехи».
      const onTime = view.state === "yes" && view.level === "ok" && !view.note;
      return inWindow(view.def, todayAge) || (view.state !== "none" && !onTime);
    });
    return { sphere, list, shown };
  });
  const hidden = groups.reduce((sum, group) => sum + group.list.length - group.shown.length, 0);
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }} gap={1}>
        <Typography variant="subtitle2">Вехи по сферам</Typography>
        {hidden > 0 && (
          <Button
            size="small"
            onClick={() => setAll((value) => !value)}
            endIcon={<ExpandMoreOutlined sx={{ transform: all ? "rotate(180deg)" : "none", transition: "transform .2s" }} />}
            sx={{ textTransform: "none" }}
          >
            {all ? "Только вехи возраста" : `Все вехи · ещё ${hidden}`}
          </Button>
        )}
      </Stack>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, alignItems: "start" }}>
        {groups.map(({ sphere, list, shown }) => {
          const rows = all ? list : shown;
          // Пустую сферу не показываем, пока не раскрыты все вехи.
          if (!rows.length && !all && groups.some((group) => group.shown.length)) return null;
          return (
            <Box key={sphere.value} sx={{ border: 1, borderColor: "divider", borderRadius: "12px", px: 1.5, py: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                {sphere.label}
              </Typography>
              {rows.length ? (
                rows.map((view) => <MilestoneLine key={view.def.code} view={view} birthDate={birthDate} sex={sex} />)
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 0.4 }}>
                  Вех этого возраста нет
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// ── Откуда отметки ───────────────────────────────────────────────────────────

export interface MarkSourceRow {
  record: ProgramModuleRecord;
  marks: Record<string, MilestoneMark>;
  /** Осмотр или «Отметка вех развития». */
  exam: boolean;
}

function markWord(mark: MilestoneMark, birthDate: string | null, sex: Sex): string {
  if (mark.state === "yes") {
    const months = mark.since ? monthsOn(birthDate, mark.since) : null;
    return months != null ? `с ${fmt(months)} мес` : "есть";
  }
  if (mark.state === "no") return "ещё нет";
  if (mark.state === "lost") return "утрачен";
  return gendered("не ползал{а}", sex);
}

function reportedText(marks: Record<string, MilestoneMark>): string {
  const values = Object.values(marks).map((mark) => mark.reported);
  if (values.every(Boolean)) return "со слов родителей";
  if (!values.some(Boolean)) return "на приёме";
  return "со слов родителей и на приёме";
}

/** «Откуда отметки» (свёрнуто): дата, кто, со слов родителей или на приёме, какие вехи; нажатие — правка записи. */
export const MarkSources: React.FC<{
  rows: ReadonlyArray<MarkSourceRow>;
  birthDate: string | null;
  sex: Sex;
  canManage: boolean;
  onEdit: (row: MarkSourceRow) => void;
}> = ({ rows, birthDate, sex, canManage, onEdit }) => {
  const [open, setOpen] = React.useState(false);
  if (!rows.length) return null;
  return (
    <Box>
      <Button
        size="small"
        onClick={() => setOpen((value) => !value)}
        endIcon={<ExpandMoreOutlined sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />}
        sx={{ textTransform: "none", px: 0 }}
      >
        Откуда отметки · {rows.length}
      </Button>
      <Collapse in={open} unmountOnExit>
        <Stack divider={<Divider flexItem />} sx={{ border: 1, borderColor: "divider", borderRadius: "12px", overflow: "hidden", mt: 0.5 }}>
          {rows.map((row) => {
            const date = dayjs(row.record.occurredAt).format("DD.MM.YYYY");
            const items = Object.entries(row.marks)
              .map(([code, mark]) => {
                const def = milestoneDef(code);
                return def ? `${milestoneLabel(def, sex, true).toLowerCase()} — ${markWord(mark, birthDate, sex)}` : "";
              })
              .filter(Boolean);
            return (
              <Stack key={row.record.id} direction="row" gap={1} alignItems="flex-start" sx={{ px: 1.5, py: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {[date, row.exam ? row.record.title : "", row.record.createdByName ?? "", reportedText(row.marks)].filter(Boolean).join(" · ")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {items.join("; ")}
                  </Typography>
                </Box>
                {canManage && (
                  <IconButton size="small" aria-label={`Изменить отметки ${date}`} onClick={() => onEdit(row)}>
                    <EditOutlined fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            );
          })}
        </Stack>
      </Collapse>
    </Box>
  );
};
