/**
 * Ресепшен: итог последнего ночного аудита (r3 §1, r4 §19) — какие незаезды
 * сервер закрыл сам, какие оставил людям и почему, и касса закрытого дня с
 * расхождением смен. Аудит выключен или ещё не запускался — строки нет.
 */
import React from "react";
import { Box, ButtonBase, Collapse, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import NightsStayOutlined from "@mui/icons-material/NightsStayOutlined";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { ApiError } from "../api/client";
import { listNightAudits, type HotelNightAuditCash, type HotelNightAuditEntry } from "../api/hotel";
import { fmtMoney } from "./hotelReportFormat";
import { plural, Surface } from "./hotelUi";

const SKIP_REASONS: Record<string, string> = {
  partly_arrived: "часть номеров уже заселена",
  later_arrival: "другой номер заезжает позже",
};

const Entries: React.FC<{ title: string; rows: HotelNightAuditEntry[]; onOpen: (id: number) => void; withReason?: boolean }> = ({ title, rows, onOpen, withReason }) =>
  rows.length === 0 ? null : (
    <Box>
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title}
      </Typography>
      {rows.map((r) => (
        <ButtonBase
          key={r.reservationId}
          component="div"
          onClick={() => onOpen(r.reservationId)}
          sx={{ display: "flex", width: "100%", gap: 1.5, py: 0.5, textAlign: "left", borderRadius: "6px", "&:hover": { bgcolor: "action.hover" } }}
        >
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
            №{r.number} · {r.guestName}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
            {withReason && r.reason ? `${SKIP_REASONS[r.reason] ?? r.reason} · ` : ""}заезд {dayjs(r.checkIn).format("D MMM")}
          </Typography>
        </ButtonBase>
      ))}
    </Box>
  );

const CashBlock: React.FC<{ cash: HotelNightAuditCash }> = ({ cash }) => {
  const theme = useTheme();
  const diff = cash.shiftsDifference == null ? null : Number(cash.shiftsDifference);
  const m = (v: string) => fmtMoney(v, cash.currency);
  const cell = (label: string, value: string, hint?: string, tone?: string) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums", color: tone }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary" component="div">
          {hint}
        </Typography>
      )}
    </Box>
  );
  return (
    <Box>
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Касса за день
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.5, mt: 0.75 }}>
        {cell("Поступило", m(cash.net), `${cash.paymentsCount} ${plural(cash.paymentsCount, "оплата", "оплаты", "оплат")} · наличными ${m(cash.cashIn)}, безнал ${m(cash.cashlessIn)}`)}
        {cell("Возвраты", m(String(Number(cash.refundsCash) + Number(cash.refundsCashless))), `наличными ${m(cash.refundsCash)}`)}
        {cell("Начислено", m(cash.accruedTotal), `номера ${m(cash.accruedRooms)}, услуги ${m(cash.accruedServices)}`)}
        {cell(
          "Смены кассы",
          diff == null ? "не закрывали" : diff === 0 ? "сошлось" : `${diff > 0 ? "излишек" : "недостача"} ${m(String(Math.abs(diff)))}`,
          cash.openShift ? "смена ещё открыта — её деньги не пересчитаны" : `${cash.shifts.length} ${plural(cash.shifts.length, "смена", "смены", "смен")}`,
          diff != null && diff !== 0 ? theme.palette.error.main : undefined,
        )}
      </Box>
    </Box>
  );
};

export const NightAuditSummary: React.FC<{ propertyId: number; onOpen: (reservationId: number) => void }> = ({ propertyId, onOpen }) => {
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const query = useQuery({
    queryKey: ["hotel", "nightAudits", propertyId, "latest"],
    queryFn: ({ signal }) => listNightAudits({ propertyId, limit: 1 }, signal),
    staleTime: 5 * 60_000,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 404 || err.status === 403)) && count < 1,
  });
  const audit = query.data?.results[0];
  // Свежий — за последние двое суток: старый итог на ресепшене только путает.
  if (!audit || dayjs().diff(dayjs(audit.businessDate), "day") > 2) return null;
  const diff = audit.cash?.shiftsDifference == null ? 0 : Number(audit.cash.shiftsDifference);
  const accent = audit.skipped.length > 0 || diff !== 0 ? theme.palette.warning.main : theme.palette.text.secondary;
  return (
    <Surface padded={false} sx={{ overflow: "hidden" }}>
      <ButtonBase
        component="div"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        sx={{ display: "flex", width: "100%", gap: 1.25, px: 2, py: 1.25, textAlign: "left", "&:hover": { bgcolor: "action.hover" } }}
      >
        <Box sx={{ color: accent, display: "flex" }}>
          <NightsStayOutlined fontSize="small" />
        </Box>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
          <b>Ночной аудит за {dayjs(audit.businessDate).format("D MMMM")}:</b> закрыто незаездов {audit.closed.length}
          {audit.skipped.length > 0 ? `, оставлено вам ${audit.skipped.length}` : ""}
          {audit.cash ? ` · касса ${fmtMoney(audit.cash.net, audit.cash.currency)}` : ""}
          {diff !== 0 ? (
            <Box component="span" sx={{ color: "error.main", fontWeight: 700 }}>
              {` · ${diff > 0 ? "излишек" : "недостача"} ${fmtMoney(Math.abs(diff), audit.cash?.currency)}`}
            </Box>
          ) : null}
        </Typography>
        <ExpandMoreRounded sx={{ color: "text.secondary", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Stack gap={2} sx={{ px: 2, pb: 2, pt: 0.5, borderTop: 1, borderColor: "divider", bgcolor: alpha(theme.palette.text.primary, 0.015) }}>
          <Entries title="Закрыты как незаезд" rows={audit.closed} onOpen={onOpen} />
          <Entries title="Оставлены вам" rows={audit.skipped} onOpen={onOpen} withReason />
          {audit.cash && <CashBlock cash={audit.cash} />}
        </Stack>
      </Collapse>
    </Surface>
  );
};

export default NightAuditSummary;
