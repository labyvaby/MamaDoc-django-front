/**
 * «График работы» поста: очередь сотрудников (по N дней подряд или по дням
 * недели), с какого числа, предпросмотр и галочка «Повторять этот график».
 * «Заполнить» ставит смены в пустые клетки — ручные не трогает; график
 * сохраняется у поста (StaffPost.rotation), с повтором пустые дни следующих
 * месяцев заполняются сами при открытии графика (HotelStaffPage).
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import dayjs, { type Dayjs } from "dayjs";

import type { HotelStaffPost, HotelStaffRotation } from "../api/hotel";
import { CustomDatePicker } from "../components/ui";
import type { RosterEmployee } from "./staffRosterDemo";
import { dayWord, rotationEmployeeOn, rotationLabel, WEEKDAY_SHORT } from "./staffRotation";

const D = (d: Dayjs) => d.format("YYYY-MM-DD");

export interface RotationApply {
  rotation: HotelStaffRotation;
  /** До какого дня включительно заполнять: конец месяца, с повтором — конец следующего. */
  to: string;
}

export const StaffRotationDialog: React.FC<{
  post: HotelStaffPost | null;
  month: Dayjs;
  employees: RosterEmployee[];
  busy: boolean;
  onClose: () => void;
  onApply: (apply: RotationApply) => void;
  onClear: (post: HotelStaffPost) => void;
}> = ({ post, month, employees, busy, onClose, onApply, onClear }) => {
  const todayStr = D(dayjs());
  const monthStart = D(month.startOf("month"));
  const [mode, setMode] = React.useState<HotelStaffRotation["mode"]>("cycle");
  const [memberIds, setMemberIds] = React.useState<number[]>([]);
  const [weekdays, setWeekdays] = React.useState<Record<number, number[]>>({});
  const [daysPerTurn, setDaysPerTurn] = React.useState(1);
  const [startDate, setStartDate] = React.useState(todayStr);
  const [repeat, setRepeat] = React.useState(true);

  React.useEffect(() => {
    if (!post) return;
    const r = post.rotation;
    setMode(r?.mode ?? "cycle");
    setMemberIds(r?.members.map((m) => m.employeeId) ?? []);
    setWeekdays(Object.fromEntries((r?.members ?? []).map((m) => [m.employeeId, m.weekdays])));
    setDaysPerTurn(r?.daysPerTurn ?? 1);
    // Начинаем с первого пустого дня в будущем: прошлое не переписываем — по нему уже посчитана зарплата.
    setStartDate(r?.startDate && r.startDate > todayStr ? r.startDate : monthStart > todayStr ? monthStart : todayStr);
    setRepeat(r?.repeat ?? true);
  }, [post, todayStr, monthStart]);

  const nameOf = (id: number) => employees.find((e) => e.id === id)?.fullName ?? `№${id}`;
  const rotation: HotelStaffRotation = {
    mode,
    startDate,
    daysPerTurn: mode === "cycle" ? daysPerTurn : 1,
    repeat,
    members: memberIds.map((employeeId) => ({ employeeId, weekdays: mode === "weekdays" ? (weekdays[employeeId] ?? []) : [] })),
  };
  const takenWeekdays = new Map<number, number>();
  for (const m of rotation.members) for (const d of m.weekdays) takenWeekdays.set(d, m.employeeId);
  const valid = memberIds.length > 0 && (mode === "cycle" || rotation.members.every((m) => m.weekdays.length > 0));
  const preview = Array.from({ length: 14 }, (_, i) => {
    const d = dayjs(startDate).add(i, "day");
    const id = rotationEmployeeOn(rotation, D(d));
    return { date: d, name: id == null ? null : nameOf(id) };
  });
  const fillTo = repeat ? D(month.add(1, "month").endOf("month")) : D(month.endOf("month"));
  const monthTitle = (m: Dayjs) => m.format("MMMM").replace(/^./, (c) => c.toUpperCase());

  return (
    <Dialog open={post != null} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>График работы · {post?.name}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode}
            onChange={(_, v: HotelStaffRotation["mode"] | null) => v && setMode(v)}
            sx={{ "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 600, flex: 1 } }}
          >
            <ToggleButton value="cycle">По очереди</ToggleButton>
            <ToggleButton value="weekdays">По дням недели</ToggleButton>
          </ToggleButtonGroup>

          <TextField
            select
            label={mode === "cycle" ? "Сотрудники — в порядке очереди" : "Сотрудники"}
            value={memberIds}
            onChange={(e) => setMemberIds(typeof e.target.value === "string" ? e.target.value.split(",").map(Number) : (e.target.value as number[]))}
            slotProps={{
              select: {
                multiple: true,
                renderValue: (v) => (
                  <Stack direction="row" gap={0.5} flexWrap="wrap">
                    {(v as number[]).map((id, i) => (
                      <Chip key={id} size="small" label={mode === "cycle" ? `${i + 1}. ${nameOf(id)}` : nameOf(id)} />
                    ))}
                  </Stack>
                ),
              },
            }}
            helperText={mode === "cycle" ? "Очередь идёт в порядке выбора: первый выходит первым" : "Каждому — свои дни недели, ниже"}
          >
            {employees.map((e) => (
              <MenuItem key={e.id} value={e.id}>
                {e.fullName}
              </MenuItem>
            ))}
          </TextField>

          {mode === "cycle" ? (
            <TextField select label="По сколько дней подряд каждый" value={daysPerTurn} onChange={(e) => setDaysPerTurn(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 7].map((n) => (
                <MenuItem key={n} value={n}>
                  {n === 1 ? "По одному дню (сутки)" : `По ${n} ${dayWord(n)}`}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <Stack gap={1}>
              {memberIds.map((id) => (
                <Stack key={id} direction="row" alignItems="center" gap={1} flexWrap="wrap">
                  <Typography variant="body2" fontWeight={600} sx={{ minWidth: 120 }}>
                    {nameOf(id)}
                  </Typography>
                  <ToggleButtonGroup
                    size="small"
                    value={weekdays[id] ?? []}
                    onChange={(_, v: number[]) => setWeekdays((w) => ({ ...w, [id]: v }))}
                    sx={{ "& .MuiToggleButton-root": { textTransform: "none", px: 1, minWidth: 40 } }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <ToggleButton key={d} value={d} disabled={takenWeekdays.has(d) && takenWeekdays.get(d) !== id}>
                        {WEEKDAY_SHORT[d]}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                </Stack>
              ))}
              {memberIds.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  Выберите сотрудников — и отметьте, кто в какие дни выходит
                </Typography>
              )}
            </Stack>
          )}

          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} alignItems={{ sm: "center" }}>
            <CustomDatePicker label="С какого дня" value={dayjs(startDate)} onChange={(v) => v && setStartDate(D(v))} slotProps={{ textField: { size: "small" } }} sx={{ width: 170 }} />
            <FormControlLabel control={<Checkbox checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />} label="Повторять этот график" />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
            {repeat
              ? "Пустые дни следующих месяцев заполнятся сами, когда кто-то откроет график. Смены, поставленные вручную, не трогаются."
              : `Заполнится только ${monthTitle(month)}; дальше — вручную или снова этой кнопкой.`}
          </Typography>

          {valid && (
            <Box sx={{ p: 1.5, borderRadius: "12px", bgcolor: "action.hover" }}>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.75 }}>
                {rotationLabel(rotation, nameOf)}
              </Typography>
              {/* Две колонки по семь дней: с фамилиями в семь колонок не влезало даже на компьютере. */}
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 2, rowGap: 0.25 }}>
                {preview.map((p) => (
                  <Stack key={D(p.date)} direction="row" alignItems="baseline" gap={0.75} sx={{ minWidth: 0, fontSize: 13, color: p.name ? "text.primary" : "text.disabled" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      {p.date.format("D")} {WEEKDAY_SHORT[p.date.day() || 7]}
                    </Typography>
                    <Box component="span" sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name ? p.name.split(" ").slice(0, 2).join(" ") : "—"}
                    </Box>
                  </Stack>
                ))}
              </Box>
            </Box>
          )}
          {startDate < todayStr && (
            <Alert severity="warning" variant="outlined">
              Дата начала в прошлом: смены встанут и в прошедшие дни, а по ним считается зарплата.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        {post?.rotation && (
          <Button color="error" disabled={busy} onClick={() => post && onClear(post)} sx={{ mr: "auto" }}>
            Убрать график
          </Button>
        )}
        <Button color="inherit" disabled={busy} onClick={onClose}>
          Отмена
        </Button>
        <Button variant="contained" disableElevation disabled={!valid || busy} onClick={() => onApply({ rotation, to: fillTo })}>
          {repeat ? `Заполнить ${monthTitle(month)} и ${monthTitle(month.add(1, "month"))}` : `Заполнить ${monthTitle(month)}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StaffRotationDialog;
