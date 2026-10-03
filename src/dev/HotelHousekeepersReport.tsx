/**
 * «Горничные» — нагрузка уборки по «Графику персонала»: на каждый день
 * выезды (уборка после выезда) и проживающие (текущая уборка) на этажах
 * поста и кому это досталось; итог по горничным за месяц и открытые задачи
 * сейчас. Расчёт — hotelHousekeepingLoad.ts. Рядом с планом — факт с сервера
 * (GET /reports/housekeeping/): сколько уборок горничная закрыла и сколько в
 * среднем шла уборка. Нет права на отчёт — колонки факта просто не видны.
 */
import React from "react";
import { Alert, Avatar, Box, Button, CircularProgress, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import AutorenewOutlined from "@mui/icons-material/AutorenewOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";

import { getHousekeepingReport, listHousekeepingTasks, listRooms, type HotelHousekeepingReportRow } from "../api/hotel";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { computeHousekeepingLoad } from "./hotelHousekeepingLoad";
import { fmtInt } from "./hotelReportFormat";
import { fetchAllReservations } from "./hotelReportData";
import { ReportEmpty, ReportKpi, ReportLink, ReportSection, type ReportNav } from "./hotelReportUi";
import { employeeColor } from "./hotelStaffPayroll";
import { plural, Surface, useHotelTableSx } from "./hotelUi";
import { downloadXlsx } from "./hotelXlsx";
import { initialsOf } from "./mockDemoData";
import { useRosterEmployees, useStaffPosts, useStaffShifts } from "./useStaffRoster";

const D = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");

export const HotelHousekeepersReport: React.FC<{ propertyId: number; nav: ReportNav }> = ({ propertyId, nav }) => {
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const navigate = useNavigate();
  const monthParam = nav.param("month");
  const month = (monthParam && dayjs(`${monthParam}-01`).isValid() ? dayjs(`${monthParam}-01`) : dayjs()).startOf("month");
  const from = D(month);
  const to = D(month.endOf("month"));
  const setMonth = (m: dayjs.Dayjs) => nav.setParams({ month: m.format("YYYY-MM") });

  const postsQuery = useStaffPosts(propertyId);
  const isDemo = postsQuery.data?.isDemo;
  const shiftsQuery = useStaffShifts(propertyId, from, to, isDemo);
  const employeesQuery = useRosterEmployees(isDemo);
  const roomsQuery = useQuery({ queryKey: ["hotel", "rooms", propertyId], queryFn: ({ signal }) => listRooms({ propertyId }, signal) });
  const reservationsQuery = useQuery({
    queryKey: ["hotel", "reports", "hkLoad", propertyId, from, to],
    queryFn: ({ signal }) => fetchAllReservations({ propertyId, from, to: D(dayjs(to).add(1, "day")) }, signal),
  });
  const tasksQuery = useQuery({
    queryKey: ["hotel", "housekeepingTasks", propertyId, "report-open"],
    queryFn: ({ signal }) => listHousekeepingTasks({ propertyId }, signal),
  });

  const factsQuery = useQuery({
    queryKey: ["hotel", "reports", "housekeeping", propertyId, from, to],
    queryFn: ({ signal }) => getHousekeepingReport({ propertyId, from, to }, signal),
    retry: false,
  });
  const facts = factsQuery.data;
  // «Без горничной в графике» (план) и «без исполнителя» (факт) — разные строки, null не сопоставляем.
  const factOf = (employeeId: number | null): HotelHousekeepingReportRow | undefined =>
    employeeId == null ? undefined : facts?.rows.find((r) => r.employeeId === employeeId);
  const fmtMinutes = (m: number | null | undefined) => (m == null ? "—" : `${m.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} мин`);

  const names = React.useMemo(() => new Map((employeesQuery.data ?? []).map((e) => [e.id, e.fullName])), [employeesQuery.data]);
  const load = React.useMemo(
    () =>
      computeHousekeepingLoad({
        from,
        to,
        reservations: reservationsQuery.data?.rows ?? [],
        rooms: roomsQuery.data ?? [],
        posts: postsQuery.data?.posts ?? [],
        shifts: shiftsQuery.data ?? [],
        names,
      }),
    [from, to, reservationsQuery.data, roomsQuery.data, postsQuery.data, shiftsQuery.data, names],
  );
  const openByAssignee = React.useMemo(() => {
    const m = new Map<number, number>();
    for (const t of tasksQuery.data ?? []) if (t.assignedToId != null) m.set(t.assignedToId, (m.get(t.assignedToId) ?? 0) + 1);
    return m;
  }, [tasksQuery.data]);

  const loading = postsQuery.isPending || shiftsQuery.isPending || roomsQuery.isPending || reservationsQuery.isPending;
  const monthTitle = month.format("MMMM YYYY").replace(/^./, (c) => c.toUpperCase());
  const total = load.totals.checkouts + load.totals.stayovers;
  const chart = load.days.map((d) => ({ ...d, label: dayjs(d.date).format("D") }));
  // Закрывали уборки, но в графике месяца их нет (или задачи без исполнителя) — тоже показываем.
  const factOnly = (facts?.rows ?? []).filter((r) => r.done > 0 && (r.employeeId == null || !load.people.some((p) => p.employeeId === r.employeeId)));

  const exportXlsx = async () => {
    await downloadXlsx(`Горничные ${month.format("MM.YYYY")}.xlsx`, [
      {
        name: "Горничные",
        title: `Нагрузка горничных — ${month.format("MMMM YYYY")}`,
        meta: ["По графику персонала и броням: выезды — уборка после выезда, проживающие — текущая уборка."],
        summary: [
          { label: "Уборок после выезда", value: load.totals.checkouts, kind: "int" },
          { label: "Текущих уборок", value: load.totals.stayovers, kind: "int" },
          { label: "Без горничной в графике", value: load.totals.uncovered, kind: "int" },
          ...(facts ? [{ label: "Убрано по факту", value: facts.totals.done, kind: "int" as const }] : []),
        ],
        tables: [
          {
            title: "По горничным",
            columns: [
              { header: "Горничная", width: 24 },
              { header: "Этажи" },
              { header: "Смен", kind: "int" },
              { header: "После выезда", kind: "int" },
              { header: "Текущих", kind: "int" },
              { header: "Всего", kind: "int" },
              { header: "Убрано (факт)", kind: "int" },
              { header: "Среднее время, мин" },
            ],
            rows: [
              ...load.people.map((p) => [
                p.name,
                p.floors.join(", "),
                p.shifts,
                p.checkouts,
                p.stayovers,
                p.checkouts + p.stayovers,
                factOf(p.employeeId)?.done ?? 0,
                factOf(p.employeeId)?.avgMinutes ?? "",
              ]),
              ...factOnly.map((r) => [r.employeeName || "Без исполнителя", "", null, null, null, null, r.done, r.avgMinutes ?? ""]),
            ],
            totals: ["Итого", null, null, load.totals.checkouts, load.totals.stayovers, total, facts?.totals.done ?? null, facts?.totals.avgMinutes ?? ""],
          },
          {
            title: "По дням",
            columns: [{ header: "Дата", kind: "date" }, { header: "После выезда", kind: "int" }, { header: "Текущих", kind: "int" }, { header: "Без горничной", kind: "int" }],
            rows: load.days.map((d) => [d.date, d.checkouts, d.stayovers, d.uncovered]),
          },
        ],
      },
    ]);
  };

  return (
    <Stack gap={2.5}>
      <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
        <Stack direction="row" alignItems="center" sx={{ height: 40, borderRadius: "10px", border: `1px solid ${subtleBorder(theme)}`, overflow: "hidden" }}>
          <IconButton onClick={() => setMonth(month.subtract(1, "month"))} aria-label="Предыдущий месяц" sx={{ borderRadius: 0, height: "100%" }}>
            <ChevronLeftOutlined fontSize="small" />
          </IconButton>
          <Typography sx={{ px: 1.5, minWidth: 150, textAlign: "center", fontWeight: 700 }}>{monthTitle}</Typography>
          <IconButton onClick={() => setMonth(month.add(1, "month"))} aria-label="Следующий месяц" sx={{ borderRadius: 0, height: "100%" }}>
            <ChevronRightOutlined fontSize="small" />
          </IconButton>
        </Stack>
        <Box sx={{ flex: 1 }} />
        <ReportLink label="График персонала" onClick={() => navigate("/hotel-staff")} />
        <ReportLink label="Задачи уборки" onClick={() => navigate("/housekeeping")} />
        <Button variant="outlined" startIcon={<FileDownloadOutlined />} disabled={loading} onClick={() => void exportXlsx()}>
          Excel
        </Button>
      </Stack>

      {isDemo && (
        <Alert severity="info" variant="outlined">
          Горничные и этажи — из примера «Графика персонала» по вашей таблице; брони и выезды — настоящие. С обновлением сервера здесь будет ваш график.
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3, 1fr)", lg: facts ? "repeat(5, 1fr)" : "repeat(4, 1fr)" }, gap: 1.5 }}>
            <ReportKpi icon={<LogoutOutlined />} tone="warning" label="После выезда" value={fmtInt(load.totals.checkouts)} hint="уборок за месяц" />
            <ReportKpi icon={<AutorenewOutlined />} tone="info" label="Текущие" value={fmtInt(load.totals.stayovers)} hint="у проживающих" />
            <ReportKpi icon={<CleaningServicesOutlined />} tone="success" emphasis label="Всего уборок" value={fmtInt(total)} hint={`${load.people.filter((p) => p.employeeId != null).length} горничных`} />
            <ReportKpi
              icon={<ReportProblemOutlined />}
              tone="error"
              label="Без горничной"
              value={fmtInt(load.totals.uncovered)}
              goodWhenUp={false}
              hint={load.totals.uncovered ? "этаж не закрыт в графике" : "все этажи закрыты"}
              onClick={load.totals.uncovered ? () => navigate("/hotel-staff") : undefined}
            />
            {facts && (
              <ReportKpi
                icon={<CleaningServicesOutlined />}
                tone="success"
                label="Убрано по факту"
                value={fmtInt(facts.totals.done)}
                hint={facts.totals.avgMinutes != null ? `в среднем ${fmtMinutes(facts.totals.avgMinutes)}` : "закрытые задачи уборки"}
              />
            )}
          </Box>

          <ReportSection title="Уборки по дням" subtitle="Выезды и проживающие на этажах — сколько работы у горничных каждый день">
            <Box sx={{ height: 240, mx: -1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={subtleBorder(theme)} />
                  <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11.5, fill: theme.palette.text.secondary }} width={32} axisLine={false} tickLine={false} />
                  <RechartsTooltip
                    cursor={{ fill: subtleBg(theme, true) }}
                    contentStyle={{ borderRadius: 10, border: `1px solid ${subtleBorder(theme)}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, fontSize: 13 }}
                    labelFormatter={(_l, payload) => {
                      const d = (payload?.[0]?.payload as { date?: string } | undefined)?.date;
                      return d ? dayjs(d).format("D MMMM, dd") : "";
                    }}
                    formatter={(value?: number | string, name?: string | number) => [value ?? 0, name === "checkouts" ? "После выезда" : "Текущие"]}
                  />
                  <Legend formatter={(v: string) => (v === "checkouts" ? "После выезда" : "Текущие")} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="checkouts" stackId="a" fill={theme.palette.warning.main} maxBarSize={22} />
                  <Bar dataKey="stayovers" stackId="a" fill={alpha(theme.palette.info.main, 0.75)} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </ReportSection>

          <Surface padded={false} sx={{ overflow: "hidden" }}>
            {load.people.length === 0 && factOnly.length === 0 ? (
              <ReportEmpty>В этом месяце нет горничных в графике и уборок по броням</ReportEmpty>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table sx={{ ...tableSx, minWidth: 760 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ pl: 2.5 }}>Горничная</TableCell>
                      <TableCell>Этажи</TableCell>
                      <TableCell align="right">Смен</TableCell>
                      <TableCell align="right">После выезда</TableCell>
                      <TableCell align="right">Текущих</TableCell>
                      <TableCell align="right">Всего</TableCell>
                      <TableCell align="right">За смену</TableCell>
                      {facts && (
                        <>
                          <TableCell align="right">Убрано</TableCell>
                          <TableCell align="right">Ср. время</TableCell>
                        </>
                      )}
                      <TableCell align="right" sx={{ pr: 2.5 }}>
                        Открыто сейчас
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {load.people.map((p) => {
                      const all = p.checkouts + p.stayovers;
                      const none = p.employeeId == null;
                      const c = none ? theme.palette.error.main : employeeColor(p.employeeId as number);
                      return (
                        <TableRow key={p.employeeId ?? "none"}>
                          <TableCell sx={{ pl: 2.5 }}>
                            <Stack direction="row" alignItems="center" gap={1}>
                              <Avatar sx={{ width: 28, height: 28, fontSize: 11, fontWeight: 800, bgcolor: alpha(c, 0.16), color: c }}>{none ? "!" : initialsOf(p.name)}</Avatar>
                              <Typography variant="body2" fontWeight={700} color={none ? "error.main" : "text.primary"}>
                                {p.name}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ color: "text.secondary" }}>{p.floors.length ? p.floors.map((f) => `${f} эт.`).join(", ") : "—"}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {p.shifts || "—"}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {p.checkouts}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {p.stayovers}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                            {all}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: "text.secondary" }}>
                            {p.shifts ? (all / p.shifts).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : "—"}
                          </TableCell>
                          {facts && (
                            <>
                              <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "success.main" }}>
                                {factOf(p.employeeId)?.done || "—"}
                              </TableCell>
                              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: "text.secondary" }}>
                                {fmtMinutes(factOf(p.employeeId)?.avgMinutes)}
                              </TableCell>
                            </>
                          )}
                          <TableCell align="right" sx={{ pr: 2.5, fontVariantNumeric: "tabular-nums" }}>
                            {p.employeeId != null && openByAssignee.get(p.employeeId)
                              ? `${openByAssignee.get(p.employeeId)} ${plural(openByAssignee.get(p.employeeId) ?? 0, "задача", "задачи", "задач")}`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {factOnly.map((r) => (
                      <TableRow key={`fact-${r.employeeId ?? "none"}`}>
                        <TableCell sx={{ pl: 2.5 }}>
                          <Typography variant="body2" fontWeight={700} color={r.employeeId == null ? "text.secondary" : "text.primary"}>
                            {r.employeeName || "Без исполнителя"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            нет в графике месяца
                          </Typography>
                        </TableCell>
                        <TableCell colSpan={6} sx={{ color: "text.disabled" }}>
                          —
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "success.main" }}>
                          {r.done}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: "text.secondary" }}>
                          {fmtMinutes(r.avgMinutes)}
                        </TableCell>
                        <TableCell align="right" sx={{ pr: 2.5 }}>
                          —
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Surface>
        </>
      )}
    </Stack>
  );
};

export default HotelHousekeepersReport;
