/**
 * «График персонала» — то, что Viva ведёт в Google Sheets «График
 * персонала»: строка — день, колонки — посты (горничные по этажам, кухня,
 * ресепшен сутками), в ячейке — кто работает. Плюс «Зарплата»: смены по
 * ролям × ставка поста − авансы из расходов = к выплате, и «Посты и ставки».
 *
 * Данные — /v2/hotel/staff-posts/ и /staff-shifts/ (контракт —
 * docs/hotel-backend-tasks.md §1–2). Пока бэкенд их не отдаёт,
 * страница показывает пример по таблице отеля за сентябрь (staffRosterDemo.ts)
 * с честной пометкой; правки примера живут только в этой вкладке.
 */
import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Popover,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import AutoFixHighOutlined from "@mui/icons-material/AutoFixHighOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { ApiError, getErrorMessage } from "../api/client";
import { createExpense, createExpenseCategory, getExpenseCategories } from "../api/expenses";
import { listRooms, type HotelShiftOverlap, type HotelStaffPost, type HotelStaffRole, type HotelStaffShift, type HotelStaffShiftInput } from "../api/hotel";
import { useCan } from "../hooks/useCan";
import { usePageTitle } from "../hooks/usePageTitle";
import { usePermissions } from "../hooks/usePermissions";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { fmtMoney } from "./hotelReportFormat";
import { ReportKpi } from "./hotelReportUi";
import { computePayroll, employeeColor, findShiftOverlaps, STAFF_ROLE_EMOJI, STAFF_ROLE_LABELS, STAFF_ROLE_ORDER } from "./hotelStaffPayroll";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { FilterChip, HotelPage, HotelPageHeader, plural, Surface, useHotelTableSx } from "./hotelUi";
import { downloadXlsx } from "./hotelXlsx";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { initialsOf } from "./mockDemoData";
import type { RosterEmployee } from "./staffRosterDemo";
import { useHotelProperty } from "./useHotelProperty";
import { useAddDemoAdvance, useMonthAdvances, useRosterEmployees, useSaveShifts, useSaveStaffPost, useStaffPosts, useStaffShifts } from "./useStaffRoster";

type Tab = "grid" | "payroll" | "posts";
const D = (d: Dayjs) => d.format("YYYY-MM-DD");
const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const shiftTimeLabel = (p: HotelStaffPost) => {
  if (p.hours >= 24) return `сутки с ${p.startTime}`;
  const end = dayjs(`2000-01-01T${p.startTime}`).add(p.hours, "hour").format("HH:mm");
  return `${p.startTime}–${end}`;
};

export const HotelStaffPage: React.FC = () => {
  usePageTitle("График персонала");
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const canManage = useCan(["hotel.staff.manage", "hotel.manage"]);
  const canFinance = useCan(["finance.view", "finance.expense.view"]);
  // Зарплаты и ставки — не для всех: горничная видит график, но не чужие деньги.
  const canSeePay = canManage || canFinance;
  const [month, setMonth] = React.useState<Dayjs>(() => dayjs().startOf("month"));
  const [tab, setTab] = React.useState<Tab>("grid");

  const postsQuery = useStaffPosts(property?.id);
  const isDemo = postsQuery.data?.isDemo;
  const posts = React.useMemo(() => postsQuery.data?.posts ?? [], [postsQuery.data]);
  const from = D(month.startOf("month"));
  const to = D(month.endOf("month"));
  const shiftsQuery = useStaffShifts(property?.id, from, to, isDemo);
  const shifts = React.useMemo(() => shiftsQuery.data ?? [], [shiftsQuery.data]);
  const employeesQuery = useRosterEmployees(isDemo);
  const employees = React.useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);

  const monthTitle = month.format("MMMM YYYY").replace(/^./, (c) => c.toUpperCase());
  const people = new Set(shifts.map((s) => s.employeeId)).size;

  return (
    <HotelPage>
      <HotelPageHeader
        title="График персонала"
        subtitle={postsQuery.data ? `${monthTitle} · ${posts.length} ${plural(posts.length, "пост", "поста", "постов")} · ${people} ${plural(people, "сотрудник", "сотрудника", "сотрудников")} в графике` : undefined}
        info="Кто и где работает каждый день: горничные по этажам, кухня, ресепшен сутками. По графику считается зарплата: смены × ставка поста минус авансы из расходов."
        actions={
          <Stack direction="row" alignItems="center" sx={{ height: 40, borderRadius: "10px", border: (t) => `1px solid ${subtleBorder(t)}`, overflow: "hidden" }}>
            <IconButton onClick={() => setMonth((m) => m.subtract(1, "month"))} aria-label="Предыдущий месяц" sx={{ borderRadius: 0, height: "100%" }}>
              <ChevronLeftOutlined fontSize="small" />
            </IconButton>
            <Typography sx={{ px: 1.5, minWidth: 150, textAlign: "center", fontWeight: 700 }}>{monthTitle}</Typography>
            <IconButton onClick={() => setMonth((m) => m.add(1, "month"))} aria-label="Следующий месяц" sx={{ borderRadius: 0, height: "100%" }}>
              <ChevronRightOutlined fontSize="small" />
            </IconButton>
          </Stack>
        }
      />

      {isDemo && (
        <Alert severity="info" variant="outlined">
          Это пример по вашей таблице «График персонала» за сентябрь — чтобы было видно, как это будет работать. Сохранение включится после обновления
          сервера, сейчас правки живут только в этой вкладке.
        </Alert>
      )}

      <Stack direction="row" gap={1} flexWrap="wrap">
        <FilterChip label="График" active={tab === "grid"} onClick={() => setTab("grid")} />
        {canSeePay && <FilterChip label="Зарплата" active={tab === "payroll"} onClick={() => setTab("payroll")} />}
        {canSeePay && <FilterChip label="Посты и ставки" active={tab === "posts"} onClick={() => setTab("posts")} />}
      </Stack>

      {!property ? (
        propertyLoading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : (
          <HotelPropertyMissing />
        )
      ) : postsQuery.isError ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(postsQuery.error, "Не удалось загрузить график")}
        </Alert>
      ) : !postsQuery.data || shiftsQuery.isPending ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : tab === "grid" ? (
        <GridTab propertyId={property.id} isDemo={Boolean(isDemo)} month={month} posts={posts} shifts={shifts} employees={employees} canManage={canManage} />
      ) : tab === "payroll" && canSeePay ? (
        <PayrollTab isDemo={Boolean(isDemo)} month={month} posts={posts} shifts={shifts} employees={employees} branchId={property.branchId} currency={property.currency} canFinance={canFinance || Boolean(isDemo)} />
      ) : tab === "posts" && canSeePay ? (
        <PostsTab propertyId={property.id} isDemo={Boolean(isDemo)} posts={posts} currency={property.currency} canManage={canManage} />
      ) : (
        <GridTab propertyId={property.id} isDemo={Boolean(isDemo)} month={month} posts={posts} shifts={shifts} employees={employees} canManage={canManage} />
      )}
    </HotelPage>
  );
};

// ── График ──────────────────────────────────────────────────────────────────

const GridTab: React.FC<{
  propertyId: number;
  isDemo: boolean;
  month: Dayjs;
  posts: HotelStaffPost[];
  shifts: HotelStaffShift[];
  employees: RosterEmployee[];
  canManage: boolean;
}> = ({ propertyId, isDemo, month, posts, shifts, employees, canManage }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const { enqueueSnackbar } = useSnackbar();
  const save = useSaveShifts(propertyId, isDemo);
  const [highlight, setHighlight] = React.useState<number | null>(null);
  const [picker, setPicker] = React.useState<{ el: HTMLElement; post: HotelStaffPost; date: string } | null>(null);
  const [q, setQ] = React.useState("");
  const todayStr = D(dayjs());
  const days = React.useMemo(() => Array.from({ length: month.daysInMonth() }, (_, i) => month.date(i + 1)), [month]);

  const cell = React.useMemo(() => {
    const map = new Map<string, HotelStaffShift>();
    for (const s of shifts) map.set(`${s.postId}|${s.date}`, s);
    return map;
  }, [shifts]);
  const name = (id: number) => employees.find((e) => e.id === id)?.fullName ?? shifts.find((s) => s.employeeId === id)?.employeeName ?? `№${id}`;
  const counts = React.useMemo(() => {
    const m = new Map<number, number>();
    for (const s of shifts) if (s.status !== "absent") m.set(s.employeeId, (m.get(s.employeeId) ?? 0) + 1);
    return m;
  }, [shifts]);
  const byPost = (postId: number) => shifts.filter((s) => s.postId === postId).length;
  const overlaps = React.useMemo(() => findShiftOverlaps(shifts), [shifts]);
  const overlapPeople = React.useMemo(() => new Set(shifts.filter((s) => overlaps.has(s.id)).map((s) => s.employeeId)).size, [shifts, overlaps]);
  const timeOf = (s: HotelStaffShift) => `${dayjs(s.startsAt).format("D MMM HH:mm")}–${dayjs(s.endsAt).format("HH:mm")}`;

  const [overlapAsk, setOverlapAsk] = React.useState<{ inputs: HotelStaffShiftInput[]; message?: string; conflicts: HotelShiftOverlap[] } | null>(null);
  const apply = async (inputs: HotelStaffShiftInput[], message?: string, allowOverlap = false) => {
    if (inputs.length === 0) return;
    try {
      await save.mutateAsync({ shifts: inputs, allowOverlap });
      setOverlapAsk(null);
      if (message) enqueueSnackbar(message, { variant: "success" });
    } catch (err) {
      // Один человек в двух сменах одновременно — сервер спрашивает, правда ли так задумано.
      if (err instanceof ApiError && err.code === "SHIFT_OVERLAP") {
        setOverlapAsk({ inputs, message, conflicts: (err.details?.conflicts as HotelShiftOverlap[] | undefined) ?? [] });
        return;
      }
      enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить график"), { variant: "error" });
    }
  };

  const copyPrevDay = (date: string) => {
    const prev = D(dayjs(date).subtract(1, "day"));
    void apply(
      posts.map((p) => ({ postId: p.id, date, employeeId: cell.get(`${p.id}|${prev}`)?.employeeId ?? null })),
      `${dayjs(date).format("D MMMM")} — как накануне`,
    );
  };
  const fillFromWeekBefore = () => {
    const inputs: HotelStaffShiftInput[] = [];
    for (const d of days) {
      const date = D(d);
      const week = D(d.subtract(7, "day"));
      for (const p of posts) {
        if (cell.has(`${p.id}|${date}`)) continue;
        const src = cell.get(`${p.id}|${week}`);
        if (src) inputs.push({ postId: p.id, date, employeeId: src.employeeId });
      }
    }
    if (inputs.length === 0) {
      enqueueSnackbar("Пустых ячеек, которые можно заполнить по прошлой неделе, нет", { variant: "info" });
      return;
    }
    void apply(inputs, `Заполнено ${inputs.length} ${plural(inputs.length, "смена", "смены", "смен")} по прошлой неделе`);
  };

  const exportXlsx = async () => {
    await downloadXlsx(`График персонала ${month.format("MM.YYYY")}.xlsx`, [
      {
        name: "График",
        title: `График персонала — ${month.format("MMMM YYYY")}`,
        meta: posts.map((p) => `${p.name}: ${shiftTimeLabel(p)}, ставка ${fmtMoney(p.rate)}`),
        tables: [
          {
            columns: [{ header: "Дата", kind: "date" }, { header: "День" }, ...posts.map((p) => ({ header: p.name, width: 16 }))],
            rows: days.map((d) => [D(d), WEEKDAYS[d.day()], ...posts.map((p) => {
              const s = cell.get(`${p.id}|${D(d)}`);
              return s ? name(s.employeeId) : "";
            })]),
            totals: ["Смен", null, ...posts.map((p) => byPost(p.id))],
          },
        ],
      },
    ]);
  };

  const pickerShift = picker ? cell.get(`${picker.post.id}|${picker.date}`) : undefined;
  const sameDayOther = (employeeId: number, date: string, postId: number) => shifts.find((s) => s.employeeId === employeeId && s.date === date && s.postId !== postId);
  const needle = q.trim().toLowerCase();
  const pickerList = [...employees]
    .filter((e) => !needle || e.fullName.toLowerCase().includes(needle))
    .sort((a, b) => {
      const pa = picker ? shifts.filter((s) => s.employeeId === a.id && s.postId === picker.post.id).length : 0;
      const pb = picker ? shifts.filter((s) => s.employeeId === b.id && s.postId === picker.post.id).length : 0;
      return pb - pa || a.fullName.localeCompare(b.fullName, "ru");
    });

  if (posts.length === 0) {
    return (
      <Surface>
        <Typography color="text.secondary">Постов пока нет — добавьте их во вкладке «Посты и ставки»: этажи для горничных, кухню, ресепшен.</Typography>
      </Surface>
    );
  }

  return (
    <Stack gap={2}>
      <Dialog open={overlapAsk != null} onClose={() => setOverlapAsk(null)} maxWidth={false} fullWidth PaperProps={{ sx: { maxWidth: 520, borderRadius: "16px" } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Две смены одновременно</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Ставка за эти часы начислится дважды. Сохранить, если так и задумано (один человек на двух этажах), иначе выберите другого сотрудника.
          </Typography>
          <Stack gap={1}>
            {(overlapAsk?.conflicts ?? []).map((c) => (
              <Box key={c.employeeId} sx={{ p: 1.25, borderRadius: "10px", border: 1, borderColor: "divider" }}>
                <Typography variant="body2" fontWeight={700}>
                  {c.employeeName}
                </Typography>
                {c.shifts.map((x, i) => (
                  <Typography key={i} variant="caption" color="text.secondary" component="div">
                    {x.postName} · {dayjs(x.startsAt).format("D MMM HH:mm")}–{dayjs(x.endsAt).format("HH:mm")}
                  </Typography>
                ))}
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button color="inherit" onClick={() => setOverlapAsk(null)}>
            Отмена
          </Button>
          <Button
            variant="contained"
            color="warning"
            disableElevation
            disabled={save.isPending}
            onClick={() => overlapAsk && void apply(overlapAsk.inputs, overlapAsk.message, true)}
          >
            Сохранить внахлёст
          </Button>
        </DialogActions>
      </Dialog>
      {overlaps.size > 0 && (
        <Alert severity="warning" variant="outlined" icon={<WarningAmberRounded fontSize="inherit" />}>
          {overlapPeople} {plural(overlapPeople, "сотрудник стоит", "сотрудника стоят", "сотрудников стоят")} в двух сменах одновременно — такие ячейки
          обведены. Ставка за них начислится дважды: проверьте, что это правда (один человек на двух этажах), а не ошибка графика.
        </Alert>
      )}
      <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "center" }}>
        <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ flex: 1 }}>
          {[...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([id, count]) => {
              const active = highlight === id;
              const c = employeeColor(id);
              return (
                <ButtonBase
                  key={id}
                  onClick={() => setHighlight(active ? null : id)}
                  sx={{
                    gap: 0.75,
                    pl: 0.5,
                    pr: 1.25,
                    py: 0.5,
                    borderRadius: "999px",
                    border: `1px solid ${active ? c : subtleBorder(theme)}`,
                    bgcolor: active ? alpha(c, dark ? 0.2 : 0.1) : "background.paper",
                    fontSize: 13,
                  }}
                >
                  <Avatar sx={{ width: 22, height: 22, fontSize: 10, fontWeight: 800, bgcolor: alpha(c, dark ? 0.35 : 0.16), color: c }}>{initialsOf(name(id))}</Avatar>
                  <Typography variant="body2" fontWeight={600}>
                    {name(id)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {count}
                  </Typography>
                </ButtonBase>
              );
            })}
        </Stack>
        <Stack direction="row" gap={1}>
          {canManage && (
            <Button variant="outlined" startIcon={<AutoFixHighOutlined />} disabled={save.isPending} onClick={fillFromWeekBefore}>
              Заполнить пустые
            </Button>
          )}
          <Button variant="outlined" startIcon={<FileDownloadOutlined />} onClick={() => void exportXlsx()}>
            Excel
          </Button>
        </Stack>
      </Stack>

      <Surface padded={false} sx={{ overflow: "hidden" }}>
        <Box sx={{ overflow: "auto", maxHeight: { xs: "none", md: "calc(100vh - 330px)" } }}>
          <Table size="small" stickyHeader sx={{ minWidth: 220 + posts.length * 150, "& td, & th": { borderBottom: `1px solid ${subtleBorder(theme)}` } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ position: "sticky", left: 0, zIndex: 3, bgcolor: "background.paper", minWidth: 96, pl: 2 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    ДАТА
                  </Typography>
                </TableCell>
                {posts.map((p) => (
                  <TableCell key={p.id} sx={{ bgcolor: "background.paper", minWidth: 150, verticalAlign: "bottom" }}>
                    <Stack direction="row" alignItems="center" gap={0.75}>
                      <Box component="span" sx={{ fontSize: 15 }}>
                        {STAFF_ROLE_EMOJI[p.role]}
                      </Box>
                      <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{p.name}</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" component="div" noWrap>
                      {shiftTimeLabel(p)} · {fmtMoney(p.rate)}
                    </Typography>
                  </TableCell>
                ))}
                <TableCell sx={{ bgcolor: "background.paper", width: 44 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {days.map((d) => {
                const date = D(d);
                const weekend = d.day() === 0 || d.day() === 6;
                const today = date === todayStr;
                const rowBg = today ? alpha(theme.palette.primary.main, dark ? 0.14 : 0.06) : weekend ? subtleBg(theme) : "background.paper";
                return (
                  <TableRow key={date} sx={{ "&:hover .copy-day": { opacity: 1 } }}>
                    <TableCell
                      sx={{
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                        bgcolor: rowBg,
                        pl: 2,
                        boxShadow: today ? `inset 3px 0 0 ${theme.palette.primary.main}` : undefined,
                      }}
                    >
                      <Stack direction="row" alignItems="baseline" gap={0.75}>
                        <Typography sx={{ fontWeight: 800, fontSize: 15, fontVariantNumeric: "tabular-nums", width: 22 }}>{d.date()}</Typography>
                        <Typography variant="caption" color={weekend ? "error.main" : "text.secondary"} fontWeight={600}>
                          {WEEKDAYS[d.day()]}
                        </Typography>
                      </Stack>
                    </TableCell>
                    {posts.map((p) => {
                      const s = cell.get(`${p.id}|${date}`);
                      const c = s ? employeeColor(s.employeeId) : undefined;
                      const dim = highlight != null && s?.employeeId !== highlight;
                      const clash = s ? overlaps.get(s.id) : undefined;
                      return (
                        <TableCell key={p.id} sx={{ bgcolor: rowBg, p: 0.5 }}>
                          <Tooltip
                            disableInteractive
                            title={
                              clash && s
                                ? `Внахлёст: ${name(s.employeeId)} в это же время на «${clash.map((o) => o.postName).join("», «")}» (${clash.map(timeOf).join(", ")}). Ставка начислится дважды.`
                                : ""
                            }
                          >
                          <ButtonBase
                            disabled={!canManage}
                            onClick={(e) => {
                              setQ("");
                              setPicker({ el: e.currentTarget, post: p, date });
                            }}
                            sx={{
                              width: "100%",
                              justifyContent: "flex-start",
                              gap: 0.75,
                              px: 1,
                              py: 0.6,
                              borderRadius: "8px",
                              opacity: dim ? 0.3 : 1,
                              transition: "opacity .15s, background-color .15s",
                              ...(s && c
                                ? { bgcolor: alpha(c, dark ? 0.2 : 0.09), "&:hover": { bgcolor: alpha(c, dark ? 0.3 : 0.16) } }
                                : { color: "text.disabled", "&:hover": { bgcolor: "action.hover", color: "text.secondary" } }),
                              ...(clash ? { outline: `2px solid ${theme.palette.warning.main}`, outlineOffset: -2 } : {}),
                            }}
                          >
                            {s && c ? (
                              <>
                                <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: c, flexShrink: 0 }} />
                                <Typography variant="body2" fontWeight={600} noWrap>
                                  {name(s.employeeId)}
                                </Typography>
                                {s.status === "absent" && (
                                  <Typography variant="caption" color="error.main">
                                    не вышел
                                  </Typography>
                                )}
                                {clash && <WarningAmberRounded sx={{ fontSize: 15, color: "warning.main", ml: "auto", flexShrink: 0 }} />}
                              </>
                            ) : (
                              <Typography variant="body2">{canManage ? "+" : "—"}</Typography>
                            )}
                          </ButtonBase>
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                    <TableCell sx={{ bgcolor: rowBg, p: 0.25 }}>
                      {canManage && d.date() > 1 && (
                        <Tooltip title="Как накануне">
                          <IconButton className="copy-day" size="small" onClick={() => copyPrevDay(date)} sx={{ opacity: 0, transition: "opacity .15s" }}>
                            <ContentCopyOutlined sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell sx={{ position: "sticky", left: 0, zIndex: 1, bgcolor: "background.paper", pl: 2 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    СМЕН
                  </Typography>
                </TableCell>
                {posts.map((p) => (
                  <TableCell key={p.id} sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                    {byPost(p.id)}
                  </TableCell>
                ))}
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      </Surface>

      <Popover
        open={picker != null}
        anchorEl={picker?.el ?? null}
        onClose={() => setPicker(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { width: 280, borderRadius: "14px" } } }}
      >
        {picker && (
          <Box>
            <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
              <Typography sx={{ fontWeight: 800 }}>
                {picker.post.name} · {dayjs(picker.date).format("D MMMM, dd")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {shiftTimeLabel(picker.post)} · ставка {fmtMoney(picker.post.rate)}
              </Typography>
              <TextField
                size="small"
                fullWidth
                autoFocus
                placeholder="Найти сотрудника"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                sx={{ mt: 1 }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> } }}
              />
            </Box>
            <List dense sx={{ maxHeight: 280, overflow: "auto", py: 0 }}>
              {pickerList.map((e) => {
                const other = sameDayOther(e.id, picker.date, picker.post.id);
                const selected = pickerShift?.employeeId === e.id;
                return (
                  <ListItemButton
                    key={e.id}
                    selected={selected}
                    onClick={() => {
                      const p = picker;
                      setPicker(null);
                      void apply([{ postId: p.post.id, date: p.date, employeeId: e.id }]);
                    }}
                  >
                    <Avatar sx={{ width: 26, height: 26, fontSize: 11, fontWeight: 800, mr: 1.25, bgcolor: alpha(employeeColor(e.id), 0.16), color: employeeColor(e.id) }}>
                      {initialsOf(e.fullName)}
                    </Avatar>
                    <ListItemText
                      primary={e.fullName}
                      secondary={other ? `в этот день уже: ${other.postName}` : `${counts.get(e.id) ?? 0} ${plural(counts.get(e.id) ?? 0, "смена", "смены", "смен")} в месяце`}
                      slotProps={{ secondary: { sx: { color: other ? "warning.main" : undefined } } }}
                    />
                  </ListItemButton>
                );
              })}
              {pickerList.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
                  Никого не нашли
                </Typography>
              )}
            </List>
            {pickerShift && (
              <Box sx={{ p: 1, borderTop: `1px solid ${subtleBorder(theme)}` }}>
                <Button
                  fullWidth
                  color="error"
                  onClick={() => {
                    const p = picker;
                    setPicker(null);
                    void apply([{ postId: p.post.id, date: p.date, employeeId: null }]);
                  }}
                >
                  Снять смену
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Popover>
    </Stack>
  );
};

// ── Зарплата ────────────────────────────────────────────────────────────────

const PayrollTab: React.FC<{
  isDemo: boolean;
  month: Dayjs;
  posts: HotelStaffPost[];
  shifts: HotelStaffShift[];
  employees: RosterEmployee[];
  branchId: number | null;
  currency: string;
  canFinance: boolean;
}> = ({ isDemo, month, posts, shifts, employees, branchId, currency, canFinance }) => {
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const from = D(month.startOf("month"));
  const to = D(month.endOf("month"));
  const advancesQuery = useMonthAdvances(isDemo, branchId, from, to, canFinance);
  const names = React.useMemo(() => new Map(employees.map((e) => [e.id, e.fullName])), [employees]);
  const payroll = React.useMemo(() => computePayroll(shifts, advancesQuery.data ?? new Map(), names), [shifts, advancesQuery.data, names]);
  const [advanceFor, setAdvanceFor] = React.useState<{ id: number; name: string } | null>(null);
  const roleRates = STAFF_ROLE_ORDER.map((role) => {
    const rates = [...new Set(posts.filter((p) => p.role === role).map((p) => Number(p.rate)))];
    return rates.length ? `${STAFF_ROLE_LABELS[role]} ${rates.map((r) => fmtMoney(r)).join(" / ")}` : null;
  }).filter(Boolean);

  const exportXlsx = async () => {
    await downloadXlsx(`Зарплата ${month.format("MM.YYYY")}.xlsx`, [
      {
        name: "Зарплата",
        title: `Зарплата по графику — ${month.format("MMMM YYYY")}`,
        meta: [`Ставки за смену: ${roleRates.join(" · ")}`, `Валюта: ${currency}`],
        tables: [
          {
            columns: [
              { header: "Сотрудник", width: 22 },
              ...payroll.roles.map((r) => ({ header: `${STAFF_ROLE_LABELS[r]}, смен`, kind: "int" as const })),
              { header: "Всего смен", kind: "int" },
              { header: "Начислено", kind: "money" },
              { header: "Аванс", kind: "money" },
              { header: "К выплате", kind: "money" },
            ],
            rows: payroll.rows.map((r) => [r.name, ...payroll.roles.map((role) => r.byRole[role] ?? 0), r.shifts, r.earned, r.advance, r.toPay]),
            totals: ["Итого", ...payroll.roles.map((role) => payroll.rows.reduce((s, r) => s + (r.byRole[role] ?? 0), 0)), payroll.totals.shifts, payroll.totals.earned, payroll.totals.advance, payroll.totals.toPay],
          },
        ],
      },
    ]);
  };

  return (
    <Stack gap={2.5}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <ReportKpi label="Смен в месяце" value={payroll.totals.shifts} hint={`${payroll.rows.length} ${plural(payroll.rows.length, "сотрудник", "сотрудника", "сотрудников")}`} />
        <ReportKpi tone="info" label="Начислено" value={fmtMoney(payroll.totals.earned, currency)} hint="смены × ставка поста" />
        <ReportKpi tone="warning" label="Авансы" value={canFinance ? fmtMoney(payroll.totals.advance, currency) : "нет доступа"} hint="из расходов «Аванс»" />
        <ReportKpi tone="success" emphasis label="К выплате" value={fmtMoney(payroll.totals.toPay, currency)} hint="начислено − авансы" />
      </Box>
      {payroll.rows.some((r) => r.overlapShifts > 0) && (
        <Alert severity="warning" variant="outlined">
          В начислении есть смены внахлёст — за одни и те же часы на двух постах:{" "}
          {payroll.rows
            .filter((r) => r.overlapShifts > 0)
            .map((r) => `${r.name} — ${r.overlapShifts} (${fmtMoney(r.overlapAmount, currency)})`)
            .join(", ")}
          . Если это ошибка графика — исправьте его, сумма пересчитается.
        </Alert>
      )}

      <Surface padded={false} sx={{ overflow: "hidden" }}>
        <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} gap={1} sx={{ px: 2.5, pt: 2, pb: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>Расчёт по сотрудникам</Typography>
            <Typography variant="caption" color="text.secondary">
              Ставки за смену: {roleRates.join(" · ") || "—"}
            </Typography>
          </Box>
          <Button variant="outlined" startIcon={<FileDownloadOutlined />} onClick={() => void exportXlsx()} disabled={payroll.rows.length === 0}>
            Excel
          </Button>
        </Stack>
        <Box sx={{ overflowX: "auto" }}>
          <Table sx={{ ...tableSx, minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ pl: 2.5 }}>Сотрудник</TableCell>
                {payroll.roles.map((r) => (
                  <TableCell key={r} align="center" title={STAFF_ROLE_LABELS[r]}>
                    {STAFF_ROLE_EMOJI[r]} {STAFF_ROLE_LABELS[r]}
                  </TableCell>
                ))}
                <TableCell align="right">Всего</TableCell>
                <TableCell align="right">Начислено</TableCell>
                <TableCell align="right">Аванс</TableCell>
                <TableCell align="right">К выплате</TableCell>
                <TableCell sx={{ pr: 2.5 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {payroll.rows.map((r) => (
                <TableRow key={r.employeeId}>
                  <TableCell sx={{ pl: 2.5 }}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Avatar sx={{ width: 28, height: 28, fontSize: 11, fontWeight: 800, bgcolor: alpha(employeeColor(r.employeeId), 0.16), color: employeeColor(r.employeeId) }}>
                        {initialsOf(r.name)}
                      </Avatar>
                      <Typography variant="body2" fontWeight={700}>
                        {r.name}
                      </Typography>
                    </Stack>
                  </TableCell>
                  {payroll.roles.map((role) => (
                    <TableCell key={role} align="center" sx={{ fontVariantNumeric: "tabular-nums", color: r.byRole[role] ? "text.primary" : "text.disabled" }}>
                      {r.byRole[role] ?? "—"}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {r.shifts}
                    {r.overlapShifts > 0 && (
                      <Tooltip title={`${r.overlapShifts} ${plural(r.overlapShifts, "смена", "смены", "смен")} внахлёст с другой — ${fmtMoney(r.overlapAmount)} за те же часы`}>
                        <Typography component="span" variant="caption" sx={{ display: "block", color: "warning.main", fontWeight: 700 }}>
                          внахлёст {r.overlapShifts}
                        </Typography>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoney(r.earned)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: r.advance ? "warning.main" : "text.disabled" }}>
                    {r.advance ? fmtMoney(r.advance) : "—"}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", color: r.toPay < 0 ? "error.main" : "success.main" }}>
                    {fmtMoney(r.toPay)}
                  </TableCell>
                  <TableCell align="right" sx={{ pr: 2.5 }}>
                    {canFinance && (
                      <Button size="small" startIcon={<PaymentsOutlined sx={{ fontSize: 16 }} />} onClick={() => setAdvanceFor({ id: r.employeeId, name: r.name })}>
                        Аванс
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {payroll.rows.length > 0 && (
                <TableRow sx={{ "& td": { fontWeight: 800, bgcolor: subtleBg(theme), borderTop: `2px solid ${theme.palette.divider}` } }}>
                  <TableCell sx={{ pl: 2.5 }}>Итого</TableCell>
                  {payroll.roles.map((role) => (
                    <TableCell key={role} align="center">
                      {payroll.rows.reduce((s, r) => s + (r.byRole[role] ?? 0), 0)}
                    </TableCell>
                  ))}
                  <TableCell align="right">{payroll.totals.shifts}</TableCell>
                  <TableCell align="right">{fmtMoney(payroll.totals.earned)}</TableCell>
                  <TableCell align="right">{fmtMoney(payroll.totals.advance)}</TableCell>
                  <TableCell align="right">{fmtMoney(payroll.totals.toPay)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
        {payroll.rows.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }}>
            В этом месяце смен нет — расставьте людей во вкладке «График».
          </Typography>
        )}
      </Surface>

      <AdvanceDialog target={advanceFor} isDemo={isDemo} branchId={branchId} currency={currency} onClose={() => setAdvanceFor(null)} />
    </Stack>
  );
};

const AdvanceDialog: React.FC<{ target: { id: number; name: string } | null; isDemo: boolean; branchId: number | null; currency: string; onClose: () => void }> = ({
  target,
  isDemo,
  branchId,
  currency,
  onClose,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { activeOrganization } = usePermissions();
  const orgId = activeOrganization?.id ?? null;
  const canManageExpenses = useCan("finance.expense.manage");
  const addDemoAdvance = useAddDemoAdvance();
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<"cash" | "card">("cash");
  const [comment, setComment] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (target) {
      setAmount("");
      setComment("");
      setMethod("cash");
    }
  }, [target]);
  const categoriesQuery = useQuery({
    queryKey: ["finance", "expenseCategories", orgId],
    queryFn: ({ signal }) => getExpenseCategories(orgId ?? undefined, signal),
    enabled: target != null && !isDemo && orgId != null,
  });
  const advanceCategory = (categoriesQuery.data ?? []).find((c) => c.isActive && c.kind === "advance");
  const value = Number(amount.replace(",", "."));
  const blocked = !isDemo && !canManageExpenses;

  const submit = async () => {
    if (!target || !(value > 0)) return;
    setSaving(true);
    try {
      if (isDemo) {
        addDemoAdvance(target.id, value);
      } else {
        const category = advanceCategory ?? (await createExpenseCategory({ organizationId: orgId ?? undefined, name: "Аванс", kind: "advance" }));
        await createExpense({
          organizationId: orgId ?? undefined,
          branchId: branchId ?? undefined,
          categoryId: category.id,
          name: comment.trim() || `Аванс — ${target.name}`,
          ...(method === "cash" ? { cashAmount: value } : { cardAmount: value }),
          expenseDate: D(dayjs()),
          employeeId: target.id,
        });
        void queryClient.invalidateQueries({ queryKey: ["hotel", "staffAdvances"] });
        void queryClient.invalidateQueries({ queryKey: ["finance", "expenseCategories"] });
      }
      enqueueSnackbar(`Аванс ${fmtMoney(value, currency)} — ${target.name}`, { variant: "success" });
      onClose();
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось выдать аванс"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target != null} onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Аванс — {target?.name}</DialogTitle>
      <DialogContent>
        {blocked ? (
          <Alert severity="info" variant="outlined">
            Выдать аванс может сотрудник с правом на расходы.
          </Alert>
        ) : (
          <Stack gap={2} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label="Сумма"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{currency === "KGS" ? "сом" : currency}</InputAdornment> }, htmlInput: { inputMode: "decimal" } }}
            />
            <ToggleButtonGroup exclusive size="small" value={method} onChange={(_e, v: "cash" | "card" | null) => v && setMethod(v)}>
              <ToggleButton value="cash">Наличными из кассы</ToggleButton>
              <ToggleButton value="card">Переводом</ToggleButton>
            </ToggleButtonGroup>
            <TextField label="Комментарий" value={comment} onChange={(e) => setComment(e.target.value.slice(0, 200))} placeholder={`Аванс — ${target?.name ?? ""}`} />
            <Typography variant="caption" color="text.secondary">
              {isDemo
                ? "В примере аванс добавится только в этой вкладке."
                : "Запишется расходом «Аванс» на сотрудника — попадёт в отчёт смены, кассу и вычтется из зарплаты месяца."}
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        {!blocked && (
          <Button variant="contained" disableElevation disabled={saving || !(value > 0)} onClick={() => void submit()}>
            Выдать
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

// ── Посты и ставки ──────────────────────────────────────────────────────────

const ROLE_OPTIONS: HotelStaffRole[] = ["housekeeping", "reception", "kitchen", "maintenance", "other"];

const PostsTab: React.FC<{ propertyId: number; isDemo: boolean; posts: HotelStaffPost[]; currency: string; canManage: boolean }> = ({
  propertyId,
  isDemo,
  posts,
  currency,
  canManage,
}) => {
  const theme = useTheme();
  const [editing, setEditing] = React.useState<HotelStaffPost | "new" | null>(null);
  const roomsQuery = useQuery({
    queryKey: ["hotel", "rooms", propertyId],
    queryFn: ({ signal }) => listRooms({ propertyId }, signal),
  });
  const floors = React.useMemo(
    () => [...new Set((roomsQuery.data ?? []).map((r) => r.floor).filter(Boolean))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    [roomsQuery.data],
  );
  const roomsOnFloors = (fl: string[]) => (roomsQuery.data ?? []).filter((r) => fl.includes(r.floor)).length;

  return (
    <Stack gap={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", lg: "repeat(3, 1fr)" }, gap: 1.5 }}>
        {posts.map((p) => (
          <Surface key={p.id} sx={{ p: 2 }}>
            <Stack direction="row" alignItems="flex-start" gap={1.5}>
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.07),
                  flexShrink: 0,
                }}
              >
                {STAFF_ROLE_EMOJI[p.role]}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 16 }}>{p.name}</Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {STAFF_ROLE_LABELS[p.role]} · {shiftTimeLabel(p)}
                </Typography>
                {p.floors.length > 0 && (
                  <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.75 }}>
                    {p.floors.map((f) => (
                      <Chip key={f} size="small" label={`${f} этаж`} variant="outlined" />
                    ))}
                    <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
                      {roomsOnFloors(p.floors)} {plural(roomsOnFloors(p.floors), "номер", "номера", "номеров")}
                    </Typography>
                  </Stack>
                )}
              </Box>
              <Box sx={{ textAlign: "right" }}>
                <Typography sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(p.rate, currency)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  за смену
                </Typography>
              </Box>
            </Stack>
            {canManage && (
              <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
                <Button size="small" startIcon={<EditOutlined fontSize="small" />} onClick={() => setEditing(p)}>
                  Изменить
                </Button>
              </Stack>
            )}
          </Surface>
        ))}
        {canManage && (
          <ButtonBase
            onClick={() => setEditing("new")}
            sx={{
              minHeight: 120,
              borderRadius: "14px",
              border: `2px dashed ${subtleBorder(theme)}`,
              color: "text.secondary",
              gap: 1,
              "&:hover": { borderColor: theme.palette.primary.main, color: "primary.main" },
            }}
          >
            <AddOutlined />
            <Typography fontWeight={700}>Добавить пост</Typography>
          </ButtonBase>
        )}
      </Box>
      <PostDialog propertyId={propertyId} isDemo={isDemo} post={editing} floors={floors} currency={currency} onClose={() => setEditing(null)} />
    </Stack>
  );
};

const PostDialog: React.FC<{ propertyId: number; isDemo: boolean; post: HotelStaffPost | "new" | null; floors: string[]; currency: string; onClose: () => void }> = ({
  propertyId,
  isDemo,
  post,
  floors,
  currency,
  onClose,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const save = useSaveStaffPost(propertyId, isDemo);
  const editing = post && post !== "new" ? post : null;
  const [form, setForm] = React.useState({ name: "", role: "housekeeping" as HotelStaffRole, floors: [] as string[], startTime: "09:00", hours: "12", rate: "" });
  React.useEffect(() => {
    if (post === "new") setForm({ name: "", role: "housekeeping", floors: [], startTime: "09:00", hours: "12", rate: "" });
    else if (post) setForm({ name: post.name, role: post.role, floors: post.floors, startTime: post.startTime, hours: String(post.hours), rate: String(Number(post.rate)) });
  }, [post]);
  const hours = Number(form.hours);
  const valid = form.name.trim() !== "" && hours >= 1 && hours <= 24 && /^\d{2}:\d{2}$/.test(form.startTime) && Number(form.rate) >= 0 && form.rate !== "";

  const submit = async () => {
    try {
      await save.mutateAsync({
        id: editing?.id ?? null,
        data: {
          name: form.name.trim(),
          role: form.role,
          floors: form.role === "housekeeping" ? form.floors : [],
          startTime: form.startTime,
          hours,
          rate: Number(form.rate).toFixed(2),
        },
      });
      enqueueSnackbar(editing ? "Пост сохранён" : "Пост добавлен", { variant: "success" });
      onClose();
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить пост"), { variant: "error" });
    }
  };
  const archive = async () => {
    if (!editing) return;
    try {
      await save.mutateAsync({ id: editing.id, archive: true });
      enqueueSnackbar("Пост убран из графика — прошлые смены сохранены", { variant: "success" });
      onClose();
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось убрать пост"), { variant: "error" });
    }
  };

  return (
    <Dialog open={post != null} onClose={() => !save.isPending && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>{editing ? `Пост «${editing.name}»` : "Новый пост"}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          <TextField label="Название" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.slice(0, 60) }))} placeholder="Например: 2 этаж, Кухня, Ресепшн" />
          <TextField select label="Роль" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as HotelStaffRole }))}>
            {ROLE_OPTIONS.map((r) => (
              <MenuItem key={r} value={r}>
                {STAFF_ROLE_EMOJI[r]} {STAFF_ROLE_LABELS[r]}
              </MenuItem>
            ))}
          </TextField>
          {form.role === "housekeeping" && (
            <TextField
              select
              label="Этажи"
              value={form.floors}
              onChange={(e) => setForm((f) => ({ ...f, floors: typeof e.target.value === "string" ? e.target.value.split(",") : (e.target.value as string[]) }))}
              slotProps={{ select: { multiple: true, renderValue: (v) => (v as string[]).map((x) => `${x} этаж`).join(", ") } }}
              helperText="Уборка номеров этих этажей пойдёт горничной этого поста"
            >
              {floors.map((fl) => (
                <MenuItem key={fl} value={fl}>
                  {fl} этаж
                </MenuItem>
              ))}
            </TextField>
          )}
          <Stack direction="row" gap={1.5}>
            <TextField label="Начало" type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} sx={{ flex: 1 }} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField select label="Длительность" value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} sx={{ flex: 1 }}>
              {["8", "10", "12", "24"].map((h) => (
                <MenuItem key={h} value={h}>
                  {h === "24" ? "Сутки (24 ч)" : `${h} часов`}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Ставка за смену"
            value={form.rate}
            onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value.replace(/[^\d]/g, "").slice(0, 7) }))}
            slotProps={{ input: { endAdornment: <InputAdornment position="end">{currency === "KGS" ? "сом" : currency}</InputAdornment> }, htmlInput: { inputMode: "numeric" } }}
            helperText="Новая ставка — для новых смен; уже расставленные сохраняют свою"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        {editing && (
          <Button color="error" startIcon={<Inventory2Outlined fontSize="small" />} onClick={() => void archive()} disabled={save.isPending} sx={{ mr: "auto" }}>
            Убрать пост
          </Button>
        )}
        <Button onClick={onClose} disabled={save.isPending}>
          Отмена
        </Button>
        <Button variant="contained" disableElevation disabled={!valid || save.isPending} onClick={() => void submit()}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default HotelStaffPage;
