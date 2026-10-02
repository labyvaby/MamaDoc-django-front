/**
 * «Касса» — сверка оплат и возвратов отеля за день: что приняли, кто, каким
 * способом. Бэк: GET /hotel/payments/ (право hotel.payments.manage); итоги по
 * способам оплаты бэк считает по всему фильтру, а не по загруженной странице,
 * поэтому они не меняются от «Показать ещё». День считается в часовом поясе
 * объекта: from — включительно, to — исключительно.
 *
 * Это реестр для сверки, а не закрытие смены: сущности смены (finance) у
 * отеля пока нет, и новые оплаты после сверки не блокируются. Поэтому
 * статуса «смена закрыта» здесь нет намеренно.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import { Navigate } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { usePageTitle } from "../hooks/usePageTitle";
import { getErrorMessage } from "../api/client";
import { listPaymentRegister, type HotelPayment, type HotelPaymentRegisterTotal } from "../api/hotel";
import { DateStepper, EmptyState, HotelPage, HotelPageHeader, MetricTile, SectionLabel, StatusPill, Surface, useHotelTableSx } from "./hotelUi";
import { useIsVivaActive } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { ReservationDetailsDialog } from "./ReservationDetailsDialog";
import { exportPaymentsXlsx } from "./hotelListsXlsx";
import { fetchPaymentRegister } from "./hotelReportData";

const PAGE = 50;
const unit = (currency: string) => (currency === "KGS" || !currency ? "сом" : currency);
const money = (v: string | number, currency = "KGS") => `${Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${unit(currency)}`;

export const HotelCashPage: React.FC = () => {
  usePageTitle("Касса");
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const vivaActive = useIsVivaActive();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const [accepter, setAccepter] = React.useState<number | "">("");
  const [openId, setOpenId] = React.useState<number | null>(null);
  // Принявшие за день — собираем из ответа без фильтра, чтобы выбор не «схлопывался»
  // до одного человека после его выбора.
  const [accepters, setAccepters] = React.useState<Map<number, string>>(new Map());
  const [exporting, setExporting] = React.useState(false);

  const from = date.format("YYYY-MM-DD");
  const to = date.add(1, "day").format("YYYY-MM-DD");

  React.useEffect(() => {
    setAccepter("");
    setAccepters(new Map());
  }, [from, property?.id]);

  const query = useInfiniteQuery({
    queryKey: ["hotel", "paymentRegister", property?.id, from, accepter],
    queryFn: ({ pageParam, signal }) =>
      listPaymentRegister({ propertyId: property!.id, from, to, acceptedById: accepter === "" ? undefined : accepter, limit: PAGE, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((s, p) => s + p.results.length, 0);
      return loaded < last.count ? loaded : undefined;
    },
    enabled: property != null,
    placeholderData: undefined,
  });
  const first = query.data?.pages[0];
  const rows: HotelPayment[] = React.useMemo(() => query.data?.pages.flatMap((p) => p.results) ?? [], [query.data]);

  React.useEffect(() => {
    if (accepter !== "" || rows.length === 0) return;
    setAccepters((cur) => {
      const next = new Map(cur);
      for (const r of rows) if (r.acceptedById != null) next.set(r.acceptedById, r.acceptedByName || `№${r.acceptedById}`);
      return next.size === cur.size ? cur : next;
    });
  }, [rows, accepter]);

  if (!vivaActive) return <Navigate to="/" replace />;

  const totals: HotelPaymentRegisterTotal[] = first?.totals ?? [];
  const currencies = [...new Set(totals.map((t) => t.currency))];
  // Итог дня по каждой валюте отдельно — разные валюты не складываем.
  const net = (cur: string, key: "payments" | "refunds" | "net") => totals.filter((t) => t.currency === cur).reduce((s, t) => s + Number(t[key]), 0);
  const isToday = date.isSame(dayjs(), "day");

  // В файл — все операции дня (все страницы), а не только показанные.
  const handleExport = async () => {
    if (!property) return;
    setExporting(true);
    try {
      const all = await fetchPaymentRegister(property.id, from, to, undefined, 20, accepter === "" ? undefined : accepter);
      await exportPaymentsXlsx({
        date: from,
        propertyName: property.name,
        accepterLabel: accepter === "" ? "все" : accepters.get(accepter) ?? `№${accepter}`,
        payments: all.rows,
        totals: all.totals,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <HotelPage>
      <HotelPageHeader
        title="Касса"
        subtitle={first ? `${first.count} ${first.count === 1 ? "операция" : "операций"} за ${isToday ? "сегодня" : date.format("D MMMM")}` : undefined}
        info={
          <>
            Все оплаты и возвраты за день с итогами по способам оплаты — для сверки кассы в конце смены. Итоги считаются по всем
            операциям дня, а не по тем, что показаны на странице. Это сверка, а не закрытие смены: новые оплаты после неё
            принимаются как обычно.
          </>
        }
        actions={
          <>
            <DateStepper value={date} onChange={setDate} disableFuture />
            <Button variant="outlined" startIcon={<FileDownloadOutlined />} disabled={exporting || !first || first.count === 0} onClick={() => void handleExport()}>
              {exporting ? "Готовим…" : "Excel"}
            </Button>
          </>
        }
      />

      {!property && !propertyLoading ? (
        <HotelPropertyMissing />
      ) : query.isError ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(query.error, "Не удалось загрузить оплаты")}
        </Alert>
      ) : !first ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <>
          {currencies.length === 0 ? (
            <Surface>
              <EmptyState icon={<PaymentsOutlined />} title="Оплат за этот день нет" description={accepter !== "" ? "Попробуйте другого сотрудника или все." : "Когда гости заплатят, здесь появятся итоги и операции."} />
            </Surface>
          ) : (
            currencies.map((cur) => (
              <Box key={cur}>
                <SectionLabel>Итоги дня{currencies.length > 1 ? `, ${unit(cur)}` : ""}</SectionLabel>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
                  <MetricTile label="Принято" value={money(net(cur, "payments"), cur)} accent={theme.palette.success.main} />
                  <MetricTile label="Возвраты" value={money(net(cur, "refunds"), cur)} accent={net(cur, "refunds") > 0 ? theme.palette.error.main : undefined} />
                  <MetricTile label="Итого в кассе" value={money(net(cur, "net"), cur)} hint="принято минус возвраты" />
                </Box>
                <Surface padded={false} sx={{ overflow: "hidden", mt: 2 }}>
                  <Table sx={tableSx} size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ pl: 2.5 }}>Способ оплаты</TableCell>
                        <TableCell align="right">Принято</TableCell>
                        <TableCell align="right">Возвраты</TableCell>
                        <TableCell align="right" sx={{ pr: 2.5 }}>
                          Итого
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {totals
                        .filter((t) => t.currency === cur)
                        .map((t) => (
                          <TableRow key={`${t.method}-${t.cashlessMethodId ?? 0}`}>
                            <TableCell sx={{ pl: 2.5, fontWeight: 600 }}>
                              {t.methodLabel || t.method}
                              {t.cashlessMethodName ? <Typography component="span" variant="body2" color="text.secondary"> · {t.cashlessMethodName}</Typography> : null}
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{money(t.payments, cur)}</TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: Number(t.refunds) > 0 ? "error.main" : "text.disabled" }}>
                              {Number(t.refunds) > 0 ? `−${money(t.refunds, cur)}` : "—"}
                            </TableCell>
                            <TableCell align="right" sx={{ pr: 2.5, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{money(t.net, cur)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </Surface>
              </Box>
            ))
          )}

          {(first.count > 0 || accepter !== "") && (
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 1.25 }} flexWrap="wrap">
                <SectionLabel sx={{ mb: 0 }}>Операции</SectionLabel>
                {accepters.size > 1 || accepter !== "" ? (
                  <TextField
                    select
                    size="small"
                    label="Принял"
                    value={accepter}
                    onChange={(e) => setAccepter(e.target.value === "" ? "" : Number(e.target.value))}
                    sx={{ minWidth: 220 }}
                    slotProps={{ input: { startAdornment: <PersonOutlineOutlined fontSize="small" sx={{ mr: 1, color: "text.disabled" }} /> } }}
                  >
                    <MenuItem value="">Все сотрудники</MenuItem>
                    {[...accepters.entries()].map(([id, name]) => (
                      <MenuItem key={id} value={id}>
                        {name}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}
              </Stack>
              <Surface padded={false} sx={{ overflow: "hidden" }}>
                <Box sx={{ overflowX: "auto" }}>
                  <Table sx={tableSx}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ pl: 2.5 }}>Время</TableCell>
                        <TableCell>Бронь</TableCell>
                        <TableCell>Способ</TableCell>
                        <TableCell>Принял</TableCell>
                        <TableCell>Комментарий</TableCell>
                        <TableCell align="right" sx={{ pr: 2.5 }}>
                          Сумма
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((p) => {
                        const refund = p.kind === "refund";
                        return (
                          <TableRow key={p.id} hover onClick={() => setOpenId(p.reservationId)} sx={{ cursor: "pointer" }}>
                            <TableCell sx={{ pl: 2.5, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{dayjs(p.acceptedAt || p.createdAt).format("HH:mm")}</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>№{p.reservationId}</TableCell>
                            <TableCell>
                              {p.methodLabel || p.method}
                              {p.cashlessMethodName ? ` · ${p.cashlessMethodName}` : ""}
                              {refund && (
                                <Box component="span" sx={{ ml: 1, verticalAlign: "middle" }}>
                                  <StatusPill color={theme.palette.error.main} label="Возврат" />
                                </Box>
                              )}
                            </TableCell>
                            <TableCell>{p.acceptedByName || "—"}</TableCell>
                            <TableCell sx={{ color: p.note ? "text.primary" : "text.disabled", maxWidth: 260 }}>
                              <Typography variant="body2" noWrap title={p.note}>
                                {p.note || "—"}
                              </Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ pr: 2.5, fontVariantNumeric: "tabular-nums", fontWeight: 700, whiteSpace: "nowrap", color: refund ? "error.main" : "text.primary" }}>
                              {refund ? "−" : "+"}
                              {money(p.amount, p.currency)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
                {query.hasNextPage && (
                  <Box sx={{ px: 2.5, py: 1.5, borderTop: 1, borderColor: "divider" }}>
                    <Button size="small" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                      {query.isFetchingNextPage ? "Загружаем…" : `Показать ещё (${first.count - rows.length})`}
                    </Button>
                  </Box>
                )}
              </Surface>
            </Box>
          )}
        </>
      )}

      <ReservationDetailsDialog reservationId={openId} onClose={() => setOpenId(null)} />
    </HotelPage>
  );
};

export default HotelCashPage;
