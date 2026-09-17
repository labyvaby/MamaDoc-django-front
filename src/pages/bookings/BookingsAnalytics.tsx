import React from "react";
import {
  Alert,
  Box,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import dayjs from "dayjs";

import type { BookingListItem } from "../../api/bookings";
import { useT } from "../../i18n/VerticalProvider";
import {
  bookingFunnel,
  formatDurationMin,
  funnelBy,
  percentOf,
  reactionStats,
  type BookingFunnel,
} from "./bookingViews";

const SOURCE_LABEL: Record<string, string> = {
  public: "Сайт записи",
  operator: "operator.kg",
  odoctor: "odoctor.kg",
};

const Card: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <Box
    sx={{
      p: 2,
      borderRadius: "14px",
      border: 1,
      borderColor: "divider",
      bgcolor: "background.paper",
      minWidth: 0,
    }}
  >
    <Typography variant="subtitle2" fontWeight={700}>
      {title}
    </Typography>
    {hint && (
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
        {hint}
      </Typography>
    )}
    <Box sx={{ mt: 1.5 }}>{children}</Box>
  </Box>
);

/** Ступень воронки: подпись, число, доля от заявок и полоса одной меры. */
const FunnelStep: React.FC<{
  label: string;
  value: number;
  base: number;
  tooltip: string;
  strong?: boolean;
}> = ({ label, value, base, tooltip, strong }) => {
  const pct = percentOf(value, base);
  return (
    <Tooltip title={tooltip} placement="top-start">
      <Box sx={{ py: 0.75, cursor: "default" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="body2" fontWeight={strong ? 700 : 600}>
            {value}
            {pct != null && base !== value && (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                {pct}%
              </Typography>
            )}
          </Typography>
        </Stack>
        <Box
          sx={(t) => ({
            mt: 0.5,
            height: 10,
            borderRadius: "4px",
            bgcolor: alpha(t.palette.text.primary, t.palette.mode === "dark" ? 0.08 : 0.06),
            overflow: "hidden",
          })}
        >
          <Box
            sx={(t) => ({
              height: "100%",
              width: `${base > 0 ? Math.max((value / base) * 100, value > 0 ? 2 : 0) : 0}%`,
              borderRadius: "4px",
              bgcolor: strong ? t.palette.primary.main : alpha(t.palette.primary.main, 0.55),
              transition: "width .3s ease",
            })}
          />
        </Box>
      </Box>
    </Tooltip>
  );
};

/** Сколько записей потеряно и на каком шаге — строка «куда ушли». */
const LossRow: React.FC<{ label: string; value: number; hint?: string }> = ({ label, value, hint }) => (
  <Stack direction="row" justifyContent="space-between" sx={{ py: 0.35 }}>
    <Tooltip title={hint ?? ""}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={hint ? { textDecoration: "underline dotted", textDecorationColor: "divider", cursor: "help" } : undefined}
      >
        {label}
      </Typography>
    </Tooltip>
    <Typography variant="body2" fontWeight={600}>
      {value}
    </Typography>
  </Stack>
);

const FunnelTable: React.FC<{
  firstColumn: string;
  rows: { key: string; label: string; funnel: BookingFunnel }[];
}> = ({ firstColumn, rows }) => (
  <Box sx={{ overflowX: "auto" }}>
    <Table size="small" sx={{ "& td, & th": { whiteSpace: "nowrap", px: 1 } }}>
      <TableHead>
        <TableRow>
          <TableCell>{firstColumn}</TableCell>
          <TableCell align="right">Заявок</TableCell>
          <TableCell align="right">Подтверждено</TableCell>
          <TableCell align="right">Состоялось</TableCell>
          <TableCell align="right">
            <Tooltip title="Отмены, неявки и пропущенные регистратурой заявки">
              <span>Потеряно</span>
            </Tooltip>
          </TableCell>
          <TableCell align="right">
            <Tooltip title="Состоявшиеся визиты от всех заявок">
              <span>Конверсия</span>
            </Tooltip>
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r) => {
          const f = r.funnel;
          // Пропущенные — тоже потеря: визит в назначенное время не состоялся.
          const lost = f.cancelledBefore + f.cancelledAfter + f.noShow + f.missed;
          const conv = percentOf(f.completed, f.requests);
          return (
            <TableRow key={r.key}>
              <TableCell sx={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.label}
              </TableCell>
              <TableCell align="right">{f.requests}</TableCell>
              <TableCell align="right">{f.confirmed}</TableCell>
              <TableCell align="right">{f.completed}</TableCell>
              <TableCell align="right">{lost}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                {conv == null ? "—" : `${conv}%`}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </Box>
);

const Metric: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <Tooltip title={hint ?? ""}>
    <Box
      sx={{
        px: 1.5,
        py: 1,
        borderRadius: "10px",
        border: 1,
        borderColor: "divider",
        minWidth: 130,
        flex: "1 1 130px",
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>
        {value}
      </Typography>
    </Box>
  </Tooltip>
);

export interface BookingsAnalyticsProps {
  rows: BookingListItem[];
  loading: boolean;
  error: unknown;
  /** Выборка упёрлась в лимит страниц — цифры приблизительные. */
  truncated: boolean;
}

/**
 * Аналитика онлайн-записи за период (по времени поступления заявки): воронка
 * «заявка → подтверждение → визит», разрезы по специалистам и источникам и
 * время реакции регистратуры.
 */
const BookingsAnalytics: React.FC<BookingsAnalyticsProps> = ({ rows, loading, error, truncated }) => {
  const { t } = useT("bookings");
  const now = React.useMemo(() => dayjs(), [rows]);

  const funnel = React.useMemo(() => bookingFunnel(rows, now), [rows, now]);
  const byDoctor = React.useMemo(
    () =>
      funnelBy(
        rows,
        (b) => ({ key: String(b.doctorId ?? b.doctorName ?? "—"), label: b.doctorName || "—" }),
        now,
      ),
    [rows, now],
  );
  const bySource = React.useMemo(
    () =>
      funnelBy(rows, (b) => ({ key: b.source, label: SOURCE_LABEL[b.source] ?? b.source }), now),
    [rows, now],
  );
  const reaction = React.useMemo(() => reactionStats(rows), [rows]);

  if (error) {
    return (
      <Alert severity="error">{error instanceof Error ? error.message : "Ошибка загрузки"}</Alert>
    );
  }
  if (loading) {
    return (
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        <Skeleton variant="rounded" height={320} />
        <Skeleton variant="rounded" height={320} />
      </Box>
    );
  }
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
        За выбранный период заявок не поступало
      </Typography>
    );
  }

  const base = funnel.requests;
  const approx = truncated ? "≈ " : "";

  return (
    <Stack spacing={2} sx={{ pb: 2 }}>
      {truncated && (
        <Alert severity="info">
          Период слишком большой: посчитаны не все заявки, цифры приблизительные. Сузьте период.
        </Alert>
      )}

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        <Card
          title="Воронка"
          hint="От заявки до состоявшегося визита. Период — по времени поступления заявки."
        >
          <FunnelStep
            label="Заявок"
            value={base}
            base={base}
            strong
            tooltip="Заявки, дошедшие до регистратуры. Брошенные на онлайн-оплате сюда не входят."
          />
          <FunnelStep
            label="Подтверждено"
            value={funnel.confirmed}
            base={base}
            tooltip="Создана запись в CRM — включая те, что потом отменили или по которым была неявка."
          />
          <FunnelStep
            label="Визит состоялся"
            value={funnel.completed}
            base={base}
            strong
            tooltip="Оплачены полностью (или закрыты скидкой) после начала визита."
          />

          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5, mb: 0.5, fontWeight: 700 }}>
            Где остальные
          </Typography>
          <LossRow label="Ждут подтверждения" value={funnel.waiting} />
          <LossRow
            label="Пропущены регистратурой"
            value={funnel.missed}
            hint="Заявку не подтвердили до конца окна визита: висит необработанной или закрыта как неявка без приёма."
          />
          <LossRow label="Подтверждены, визит впереди" value={funnel.upcoming} />
          <LossRow label="Визит прошёл, запись не закрыта" value={funnel.unresolved} />
          <LossRow label="Отменены до подтверждения" value={funnel.cancelledBefore} />
          <LossRow label="Отменены после подтверждения" value={funnel.cancelledAfter} />
          <LossRow label="Неявка после подтверждения" value={funnel.noShow} />
          {funnel.abandonedPayment > 0 && (
            <LossRow label="Не оплатили онлайн-предоплату" value={funnel.abandonedPayment} />
          )}
        </Card>

        <Card
          title="Скорость реакции"
          hint="От поступления заявки до «Взять в работу». Если кнопку не нажали, отметку ставит подтверждение или отмена из списка."
        >
          {reaction.unsupported ? (
            <Typography variant="body2" color="text.secondary">
              Сервер пока не отдаёт время поступления заявки — считать не из чего.
            </Typography>
          ) : reaction.measured === 0 ? (
            <Typography variant="body2" color="text.secondary">
              За период ни одну заявку не брали в работу — измерять пока нечего. Отметка появится
              после «Взять», подтверждения или отмены заявки.
            </Typography>
          ) : (
            <>
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Metric
                  label="Медиана"
                  value={formatDurationMin(reaction.medianMin)}
                  hint="Половина заявок взята в работу быстрее этого времени"
                />
                <Metric
                  label="9 из 10 заявок"
                  value={formatDurationMin(reaction.p90Min)}
                  hint="90-й перцентиль: столько ждут самые долгие заявки"
                />
                <Metric
                  label="За 15 минут"
                  value={reaction.within15Pct == null ? "—" : `${reaction.within15Pct}%`}
                  hint="Доля заявок, взятых в работу в течение 15 минут"
                />
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                Измерено: {approx}
                {reaction.measured} · без отметки: {reaction.unclaimed}
              </Typography>

              {reaction.byEmployee.length > 0 && (
                <Box sx={{ overflowX: "auto", mt: 1.5 }}>
                  <Table size="small" sx={{ "& td, & th": { whiteSpace: "nowrap", px: 1 } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Сотрудник</TableCell>
                        <TableCell align="right">Взял заявок</TableCell>
                        <TableCell align="right">Медиана реакции</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {reaction.byEmployee.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{e.name}</TableCell>
                          <TableCell align="right">{e.count}</TableCell>
                          <TableCell align="right">{formatDurationMin(e.medianMin)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </>
          )}
        </Card>
      </Box>

      <Card title={t("analytics.bySpecialist")}>
        <FunnelTable firstColumn={t("specialistLabel")} rows={byDoctor} />
      </Card>

      {bySource.length > 1 && (
        <Card title="По источникам">
          <FunnelTable firstColumn="Источник" rows={bySource} />
        </Card>
      )}
    </Stack>
  );
};

export default BookingsAnalytics;
