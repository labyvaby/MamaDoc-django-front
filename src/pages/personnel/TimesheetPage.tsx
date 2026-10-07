import React from "react";
import { Box, Button, ButtonBase, IconButton, MenuItem, Skeleton, TextField, Tooltip, Typography, alpha, useTheme } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";

import { closeTimesheet, fillTimesheet, getTimesheet, isWeekend, nextMark, personnelKeys, setTimesheetCell, type Timesheet, type TimesheetRow } from "../../api/personnel";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { cardSx } from "../estate-dashboard/format";
import { ConfirmDialog, EmptyNote } from "../realty-finance/shared";
import { KpiCards, ScreenError } from "../realty-sales/shared";
import { currentMonth, markTone, monthLabel, shiftMonth } from "./format";
import { useDepartments, useRefreshPersonnel } from "./hooks";

/**
 * «Табель» застройщика (AIVIO, гайд `frontend-hr-ops.md` §2): сетка
 * «сотрудник × день» с отметками Я/В/О/Б/К/Н, точки СКУД, автозаполнение по
 * графику и по СКУД, закрытие месяца. Месяц — `?month=`. Правка —
 * `personnel.manage` (есть у HR и прораба). Закрытый месяц только читается.
 */
export default function TimesheetPage() {
  const { t } = useT("personnel");
  usePageTitle(t("timesheet.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <TimesheetScreen />
    </Box>
  );
}

function TimesheetScreen() {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refresh = useRefreshPersonnel();
  const { enqueueSnackbar } = useSnackbar();
  const canEdit = useCan("personnel.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(searchParams.get("month") ?? "") ? (searchParams.get("month") as string) : currentMonth();
  const [deptId, setDeptId] = React.useState<number | "">("");
  const [closing, setClosing] = React.useState(false);
  const dept = deptId === "" ? null : deptId;
  const key = personnelKeys.timesheet(scope, month, dept);
  const departments = useDepartments().data ?? [];

  const sheet = useQuery({ queryKey: key, queryFn: ({ signal }) => getTimesheet(month, dept, scope, signal), enabled: scope.orgReady !== false, staleTime: 30_000, placeholderData: keepPreviousData });
  const onError = (error: unknown) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" });

  // Ячейка: ответ — обновлённая строка, подменяем её в кэше без перечитывания всей сетки.
  const cell = useMutation({
    mutationFn: ({ row, day }: { row: TimesheetRow; day: number }) => setTimesheetCell(row.employeeId, `${month}-${String(day).padStart(2, "0")}`, nextMark(row.marks[String(day)]), scope),
    onSuccess: (fresh) => {
      queryClient.setQueryData<Timesheet>(key, (prev) => (prev ? { ...prev, rows: prev.rows.map((r) => (r.employeeId === fresh.employeeId ? { ...r, ...fresh, name: fresh.name || r.name, position: fresh.position || r.position } : r)) } : prev));
      void queryClient.invalidateQueries({ queryKey: personnelKeys.summary(scope) });
    },
    onError,
  });
  const fill = useMutation({
    mutationFn: (source: "schedule" | "acs") => fillTimesheet(month, source, scope),
    onSuccess: ({ filled }) => {
      refresh();
      enqueueSnackbar(filled > 0 ? t("timesheet.filled", { count: filled }) : t("timesheet.filledNone"), { variant: filled > 0 ? "success" : "info" });
    },
    onError,
  });
  const close = useMutation({
    mutationFn: () => closeTimesheet(month, scope),
    onSuccess: () => {
      setClosing(false);
      refresh();
      enqueueSnackbar(t("timesheet.closed"), { variant: "success" });
    },
  });

  const setMonth = (next: string) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("month", next);
        return p;
      },
      { replace: true },
    );

  if (sheet.error) return <ScreenError error={sheet.error} title={t("timesheet.loadError")} onRetry={() => void sheet.refetch()} />;

  const s = sheet.data && sheet.data.month === month ? sheet.data : null;
  const editable = canEdit && s != null && !s.closed;
  const busy = cell.isPending || fill.isPending;

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton size="small" aria-label={t("common.prev")} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeftOutlined />
          </IconButton>
          <Typography sx={{ minWidth: 150, textAlign: "center", fontWeight: 700 }}>{monthLabel(month)}</Typography>
          <IconButton size="small" aria-label={t("common.next")} onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRightOutlined />
          </IconButton>
        </Box>
        {s?.closed && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary", fontSize: "0.8125rem" }}>
            <LockOutlined fontSize="small" />
            {t("timesheet.closedBadge", { date: s.closedAt ? dayjs(s.closedAt).format("DD.MM.YYYY") : "" })}
          </Box>
        )}
        <Box sx={{ ml: "auto", display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <TextField
            select
            size="small"
            value={deptId}
            onChange={(e) => setDeptId(e.target.value === "" ? "" : Number(e.target.value))}
            SelectProps={{ displayEmpty: true }}
            sx={{ minWidth: 180, "& .MuiInputBase-root": { height: 32, fontSize: "0.875rem" } }}
            inputProps={{ "aria-label": t("common.allDepartments") }}
          >
            <MenuItem value="">{t("common.allDepartments")}</MenuItem>
            {departments.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </TextField>
          <Button size="small" onClick={() => navigate("/personnel/acs")} sx={{ whiteSpace: "nowrap" }}>
            {t("timesheet.acs")} →
          </Button>
          {editable && (
            <>
              <Button size="small" variant="outlined" onClick={() => fill.mutate("schedule")} disabled={busy} sx={{ whiteSpace: "nowrap" }}>
                {t("timesheet.autofill")}
              </Button>
              <Button size="small" variant="outlined" onClick={() => fill.mutate("acs")} disabled={busy} sx={{ whiteSpace: "nowrap" }}>
                {t("timesheet.fromAcs")}
              </Button>
              <Button size="small" variant="contained" startIcon={<LockOutlined />} onClick={() => setClosing(true)} disabled={busy} sx={{ whiteSpace: "nowrap" }}>
                {t("timesheet.close")}
              </Button>
            </>
          )}
        </Box>
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "filled", label: t("timesheet.kpi.filled"), value: `${s.filledPct}%`, hint: s.filledOn ? t("timesheet.kpi.filledHint", { date: dayjs(s.filledOn).format("DD.MM") }) : null, tone: s.filledPct < 90 ? "warning" : null },
                { key: "workdays", label: t("timesheet.kpi.workdays"), value: String(s.workdays), hint: t("timesheet.kpi.workdaysHint", { days: s.days }) },
                { key: "absence", label: t("timesheet.kpi.absence"), value: t("timesheet.kpi.absenceValue", { vacation: s.vacationDays, sick: s.sickDays }) },
                { key: "absent", label: t("timesheet.kpi.absent"), value: String(s.absentDays), tone: s.absentDays > 0 ? "error" : null },
              ]
            : null
        }
      />

      <Box sx={{ ...cardSx, overflow: "hidden" }}>
        {!s ? (
          <Box sx={{ p: 2 }}>
            <Skeleton variant="rounded" height={360} />
          </Box>
        ) : s.rows.length === 0 ? (
          <EmptyNote text={t("timesheet.empty")} />
        ) : (
          <Grid sheet={s} editable={editable} busy={busy} onCell={(row, day) => cell.mutate({ row, day })} />
        )}
        <Typography sx={{ px: 2, py: 1, fontSize: "0.72rem", color: "text.secondary", borderTop: 1, borderColor: "divider" }}>{t("timesheet.legend")}</Typography>
      </Box>

      <ConfirmDialog
        open={closing}
        title={t("timesheet.closeTitle", { month: monthLabel(month) })}
        text={t("timesheet.closeText")}
        confirmLabel={t("timesheet.close")}
        busy={close.isPending}
        error={close.error}
        danger
        onConfirm={() => close.mutate()}
        onClose={() => setClosing(false)}
      />
    </>
  );
}

const NAME_W = 220;
const DAY_W = 30;
const SUM_W = 40;

function Grid({ sheet, editable, busy, onCell }: { sheet: Timesheet; editable: boolean; busy: boolean; onCell: (row: TimesheetRow, day: number) => void }) {
  const { t } = useT("personnel");
  const theme = useTheme();
  const days = Array.from({ length: sheet.days }, (_, i) => i + 1);
  const today = dayjs().format("YYYY-MM") === sheet.month ? dayjs().date() : null;
  const sticky = { position: "sticky" as const, left: 0, zIndex: 1, bgcolor: "background.paper", borderRight: 1, borderColor: "divider" };
  const head = (label: React.ReactNode, w: number, weekend = false, isToday = false, key?: React.Key) => (
    <Box key={key} sx={{ width: w, flexShrink: 0, textAlign: "center", fontSize: "0.68rem", fontWeight: 700, color: isToday ? "primary.main" : weekend ? "text.disabled" : "text.secondary", py: 0.75 }}>{label}</Box>
  );
  const tip = (row: TimesheetRow, day: number) => {
    const acs = row.acsTimes[String(day)];
    const parts = [acs ? t("timesheet.acsHint", { in: acs.checkIn ?? "—", out: acs.checkOut ?? t("timesheet.acsHere") }) : null, editable ? t("timesheet.cellHint") : null].filter(Boolean);
    return parts.join(" · ");
  };
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box sx={{ minWidth: NAME_W + days.length * DAY_W + SUM_W * 4 }}>
        <Box sx={{ display: "flex", borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ ...sticky, width: NAME_W, flexShrink: 0, px: 2, py: 0.75, fontSize: "0.72rem", fontWeight: 700, color: "text.secondary" }}>{t("timesheet.employee")}</Box>
          {days.map((d) => head(d, DAY_W, isWeekend(sheet.month, d), d === today, d))}
          {head(t("timesheet.worked"), SUM_W)}
          {head(t("timesheet.vacation"), SUM_W)}
          {head(t("timesheet.sick"), SUM_W)}
          {head(t("timesheet.hours"), SUM_W)}
        </Box>
        {sheet.rows.map((row) => (
          <Box key={row.employeeId} sx={{ display: "flex", alignItems: "stretch", borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}>
            <Box sx={{ ...sticky, width: NAME_W, flexShrink: 0, px: 2, py: 0.5, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                {row.name}
              </Typography>
              <Typography noWrap sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                {row.position || "—"}
              </Typography>
            </Box>
            {days.map((d) => {
              const mark = row.marks[String(d)];
              const tone = markTone(mark);
              const weekend = isWeekend(sheet.month, d);
              const acs = row.acsDays.includes(d);
              const title = tip(row, d);
              const content = (
                <ButtonBase
                  disabled={!editable || busy}
                  onClick={() => onCell(row, d)}
                  aria-label={`${row.name}, ${d}: ${mark ?? "—"}`}
                  sx={{
                    width: DAY_W,
                    flexShrink: 0,
                    position: "relative",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: tone ? `${tone}.main` : "text.disabled",
                    bgcolor: tone ? alpha(theme.palette[tone].main, 0.1) : weekend ? theme.palette.action.hover : "transparent",
                    borderLeft: 1,
                    borderColor: "divider",
                    "&.Mui-disabled": { color: tone ? `${tone}.main` : "text.disabled" },
                  }}
                >
                  {mark ?? ""}
                  {acs && <Box component="span" sx={{ position: "absolute", top: 3, right: 3, width: 4, height: 4, borderRadius: "50%", bgcolor: "info.main" }} />}
                </ButtonBase>
              );
              return title ? (
                <Tooltip key={d} title={title} disableInteractive>
                  <Box sx={{ display: "flex" }}>{content}</Box>
                </Tooltip>
              ) : (
                <Box key={d} sx={{ display: "flex" }}>
                  {content}
                </Box>
              );
            })}
            {[row.worked, row.vacation, row.sick, row.hours].map((v, i) => (
              <Box key={i} sx={{ width: SUM_W, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", borderLeft: 1, borderColor: "divider" }}>
                {v || "—"}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
