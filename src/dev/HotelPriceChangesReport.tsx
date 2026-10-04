/**
 * «Правки цен» (r4 §15): своя цена ночи, скидка, своя сумма номера — все
 * денежные правки за период одним списком, с тем, кто правил и почему.
 * Раньше их было видно только в истории каждой брони. Итог — насколько
 * правки изменили сумму броней за весь период (не только за страницу).
 */
import React from "react";
import { Alert, Box, Button, ButtonBase, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getPriceChangesReport, type HotelPriceChange } from "../api/hotel";
import { fmtInt, fmtMoney } from "./hotelReportFormat";
import { ReportControls, ReportEmpty, ReportKpi, ReportSection, ReportSkeleton, type ReportNav } from "./hotelReportUi";
import { plural, useHotelTableSx } from "./hotelUi";
import { formatHotelDateRange } from "./mockDemoData";
import { ReportPeriodPicker } from "./ReportPeriodPicker";

const KIND_LABELS: Record<HotelPriceChange["kind"], string> = {
  nights: "Своя цена ночей",
  discount: "Скидка",
  nights_discount: "Цена ночей и скидка",
  manual_total: "Своя сумма номера",
  other: "Правка цены",
};
const PAGE = 100;
const D = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");

const signed = (v: string | null, currency: string) => {
  const n = Number(v ?? 0);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtMoney(Math.abs(n), currency)}`;
};

function changeText(c: HotelPriceChange, currency: string): string {
  const parts: string[] = [];
  const changedNights = c.nights.filter((n) => n.oldPrice !== n.newPrice || n.oldDiscount !== n.newDiscount);
  if (changedNights.length === 1) {
    const n = changedNights[0];
    parts.push(`${dayjs(n.date).format("D MMM")}: ${fmtMoney(n.oldPrice, currency)} → ${fmtMoney(n.newPrice, currency)}`);
  } else if (changedNights.length > 1) parts.push(`${changedNights.length} ${plural(changedNights.length, "ночь", "ночи", "ночей")}`);
  if (c.oldDiscountPercent !== c.newDiscountPercent)
    parts.push(`скидка ${c.oldDiscountPercent ? `${Number(c.oldDiscountPercent)}%` : "нет"} → ${c.newDiscountPercent ? `${Number(c.newDiscountPercent)}%` : "нет"}`);
  if (c.oldAmount != null && c.newAmount != null) parts.push(`${fmtMoney(c.oldAmount, currency)} → ${fmtMoney(c.newAmount, currency)}`);
  return parts.join(" · ");
}

export const HotelPriceChangesReport: React.FC<{ propertyId: number; currency: string; nav: ReportNav }> = ({ propertyId, currency, nav }) => {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const tableSx = useHotelTableSx();
  const today = dayjs();
  const from = nav.param("from") ?? D(today.startOf("month"));
  const to = nav.param("to") ?? D(today);
  const userParam = nav.param("user");
  const userId = userParam ? Number(userParam) : undefined;
  const [limit, setLimit] = React.useState(PAGE);
  React.useEffect(() => setLimit(PAGE), [from, to, userId]);

  const query = useQuery({
    queryKey: ["hotel", "reports", "priceChanges", propertyId, from, to, userId ?? null, limit],
    queryFn: ({ signal }) => getPriceChangesReport({ propertyId, from, to, userId, limit }, signal),
    placeholderData: keepPreviousData,
  });
  // Сотрудники — из ответа без фильтра, чтобы выбор не «схлопывался» до одного человека.
  const allQuery = useQuery({
    queryKey: ["hotel", "reports", "priceChanges", propertyId, from, to, "users"],
    queryFn: ({ signal }) => getPriceChangesReport({ propertyId, from, to, limit: 500 }, signal),
    enabled: userId != null,
  });
  const report = query.data;
  const cur = report?.currency || currency;
  const people = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const r of (userId != null ? allQuery.data?.results : report?.results) ?? []) if (r.userId != null) m.set(r.userId, r.userName || `№${r.userId}`);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [report, allQuery.data, userId]);
  const total = Number(report?.totalDelta ?? 0);

  return (
    <Stack gap={2.5}>
      <ReportControls nav={nav} summary={<>{formatHotelDateRange(from, to)}{userId != null ? ` · ${people.find((p) => p[0] === userId)?.[1] ?? "сотрудник"}` : ""}</>}>
        <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "center" }}>
          <Box sx={{ flex: 1 }}>
            <ReportPeriodPicker from={from} to={to} onChange={(f, t) => nav.setParams({ from: f, to: t })} />
          </Box>
          <TextField
            select
            size="small"
            label="Кто правил"
            value={userId ?? ""}
            onChange={(e) => nav.setParams({ user: e.target.value === "" ? null : String(e.target.value) })}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Все сотрудники</MenuItem>
            {people.map(([id, name]) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </ReportControls>

      {query.isError ? (
        <Alert severity="error" variant="outlined">
          Не удалось загрузить правки цен
        </Alert>
      ) : !report ? (
        <ReportSkeleton kpis={3} block={240} />
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
            <ReportKpi icon={<EditNoteOutlined />} label="Правок" value={fmtInt(report.count)} hint="своя цена, скидка, своя сумма" />
            <ReportKpi
              emphasis
              tone={total < 0 ? "error" : "success"}
              icon={<TrendingDownOutlined />}
              label="Изменили сумму броней"
              value={signed(report.totalDelta, cur)}
              hint={total < 0 ? "скидки и снижения цены" : total > 0 ? "наценки сверх расчёта" : "в сумме без изменений"}
            />
            <ReportKpi icon={<PersonOutlineOutlined />} label="Сотрудников" value={fmtInt(new Set(report.results.map((r) => r.userId)).size)} hint="на этой странице" />
          </Box>

          {report.results.length === 0 ? (
            <ReportEmpty>За этот период цены вручную не меняли.</ReportEmpty>
          ) : (
            <ReportSection title="Правки" subtitle="Новые сверху. Строка открывает бронь." padded={false}>
              {phone ? (
                report.results.map((c, i) => (
                  <ButtonBase
                    key={c.id}
                    component="div"
                    onClick={() => nav.openReservation(c.reservationId)}
                    sx={{ display: "block", width: "100%", textAlign: "left", px: 2, py: 1.5, borderTop: i > 0 ? 1 : 0, borderColor: "divider" }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1.5}>
                      <Typography variant="body2" fontWeight={700} sx={{ minWidth: 0 }} noWrap>
                        №{c.reservationNumber} · {c.guestName}
                      </Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: Number(c.delta) < 0 ? "error.main" : "success.main" }}>
                        {signed(c.delta, cur)}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {dayjs(c.createdAt).format("D MMM, HH:mm")} · {c.userName || "—"} · {KIND_LABELS[c.kind]}
                      {c.roomNumber ? ` · номер ${c.roomNumber}` : ""}
                    </Typography>
                    <Typography variant="caption" component="div">
                      {changeText(c, cur)}
                    </Typography>
                    {c.reason && (
                      <Typography variant="caption" color="text.secondary" component="div" sx={{ fontStyle: "italic", overflowWrap: "anywhere" }}>
                        «{c.reason}»
                      </Typography>
                    )}
                  </ButtonBase>
                ))
              ) : (
                <Box sx={{ overflowX: "auto" }}>
                  <Table sx={tableSx}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ pl: 2.5 }}>Когда</TableCell>
                        <TableCell>Бронь</TableCell>
                        <TableCell>Кто</TableCell>
                        <TableCell>Что</TableCell>
                        <TableCell>Изменение</TableCell>
                        <TableCell>Причина</TableCell>
                        <TableCell align="right" sx={{ pr: 2.5 }}>
                          Разница
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {report.results.map((c) => (
                        <TableRow key={c.id} hover onClick={() => nav.openReservation(c.reservationId)} sx={{ cursor: "pointer" }}>
                          <TableCell sx={{ pl: 2.5, whiteSpace: "nowrap" }}>{dayjs(c.createdAt).format("D MMM, HH:mm")}</TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              №{c.reservationNumber} · {c.guestName}
                            </Typography>
                            {c.roomNumber && (
                              <Typography variant="caption" color="text.secondary">
                                номер {c.roomNumber}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{c.userName || "—"}</TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{KIND_LABELS[c.kind]}</TableCell>
                          <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{changeText(c, cur)}</TableCell>
                          <TableCell sx={{ maxWidth: 260, color: c.reason ? "text.primary" : "text.disabled" }}>
                            <Typography variant="body2" noWrap title={c.reason}>
                              {c.reason || "—"}
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ pr: 2.5, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: Number(c.delta) < 0 ? "error.main" : "success.main" }}>
                            {signed(c.delta, cur)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
              {report.count > report.results.length && (
                <Box sx={{ px: 2.5, py: 1.5, borderTop: 1, borderColor: "divider" }}>
                  <Button size="small" onClick={() => setLimit((l) => l + PAGE)} disabled={query.isFetching}>
                    {query.isFetching ? "Загружаем…" : `Показать ещё (${report.count - report.results.length})`}
                  </Button>
                </Box>
              )}
            </ReportSection>
          )}
        </>
      )}
    </Stack>
  );
};

export default HotelPriceChangesReport;
