import React from "react";
import { Alert, Box, Button, Paper, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import CheckRounded from "@mui/icons-material/CheckRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import MapOutlined from "@mui/icons-material/MapOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import SupportAgentOutlined from "@mui/icons-material/SupportAgentOutlined";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import QRCode from "react-qr-code";
import { useParams } from "react-router";

import {
  getBookingByCode,
  type PublicBookingDetail,
  type PublicBookingPayment,
} from "../../api/publicBooking";
import { ApiError, isAbortError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";
import { PublicBookingShell, PAGE_GUTTER } from "./shell";
import { bookingCodeUrl, formatPrice } from "./format";
import { buildBookingIcs, downloadIcs } from "./ics";
import { useBookingNav } from "./orgSlug";
import { useBookingOrg } from "./useBookingOrg";
import { BOOKING_PRIMARY, BOOKING_RADIUS, BOOKING_SHADOW, BORDER, CTA_SHADOW, MUTED } from "./theme";

/** Статусы, при которых приём ещё состоится — только для них есть смысл в .ics. */
const CALENDAR_ELIGIBLE_STATUSES = new Set(["pending", "confirmed", "awaiting_payment"]);

/**
 * «Ваша запись» по коду подтверждения — то, куда ведёт QR из экрана успеха.
 *
 * Страница публичная и живёт по одному коду, поэтому персональных данных здесь
 * нет: бэк отдаёт дату, время, врача, филиал и услуги, но не ФИО и не телефон
 * пациента. Администратор сканирует тот же QR на ресепшене и видит ту же
 * карточку.
 */

/**
 * Статус записи — не голый чип, а карточка: заголовок говорит, что происходит,
 * пояснение — что будет дальше. Голый чип «Ожидает подтверждения» вопросов
 * больше ставил, чем снимал: пациент не знал, ждать ли звонка и нужно ли что-то
 * делать (заказчик, 24.09.2026). Обещаем только то, что реально происходит:
 * уведомлений о подтверждении нет ни у одной организации, подтверждает
 * администратор звонком. У `awaiting_payment` пояснения нет — его даёт блок
 * оплаты ниже.
 *
 * Палитра светлая, как у всей витрины (тёмной темы у /book нет): мягкая
 * подложка, рамка тем же тоном и сплошной кружок с иконкой.
 */
interface StatusTone {
  bg: string;
  border: string;
  solid: string;
  text: string;
}

const TONE: Record<"amber" | "green" | "red" | "blue" | "gray", StatusTone> = {
  amber: { bg: "#FFF6EA", border: "#FFE0B8", solid: "#F57C00", text: "#B54708" },
  green: { bg: "#ECFDF3", border: "#ABEFC6", solid: "#16A34A", text: "#067647" },
  red: { bg: "#FEF3F2", border: "#FECDCA", solid: "#D92D20", text: "#B42318" },
  blue: { bg: "#EAF3FF", border: "#DCEBFF", solid: BOOKING_PRIMARY, text: "#175CD3" },
  gray: { bg: "#F2F4F7", border: "#E4E7EC", solid: "#98A2B3", text: "#344054" },
};

/** Текст пояснения под заголовком — читаемый серый, а не бледная MUTED-подпись. */
const STATUS_BODY_COLOR = "#475467";

interface StatusView {
  tone: StatusTone;
  icon: React.ReactNode;
  titleKey: string;
  hintKey?: string;
  /** «Идёт процесс» — пульс вокруг иконки: запись ждёт действия клиники. */
  live?: boolean;
}

const STATUS_VIEW: Record<string, StatusView> = {
  pending: {
    tone: TONE.amber,
    icon: <SupportAgentOutlined />,
    titleKey: "byCode.statusTitlePending",
    hintKey: "byCode.statusHintPending",
    live: true,
  },
  awaiting_payment: {
    tone: TONE.amber,
    icon: <PaymentsOutlined />,
    titleKey: "my.statusAwaitingPayment",
  },
  confirmed: {
    tone: TONE.green,
    icon: <EventAvailableOutlined />,
    titleKey: "byCode.statusTitleConfirmed",
    hintKey: "byCode.statusHintConfirmed",
  },
  cancelled: {
    tone: TONE.red,
    icon: <CloseRounded />,
    titleKey: "byCode.statusTitleCancelled",
    hintKey: "byCode.statusHintCancelled",
  },
  completed: {
    tone: TONE.blue,
    icon: <TaskAltRounded />,
    titleKey: "byCode.statusTitleCompleted",
    hintKey: "byCode.statusHintCompleted",
  },
  no_show: {
    tone: TONE.gray,
    icon: <EventBusyOutlined />,
    titleKey: "byCode.statusTitleNoShow",
    hintKey: "byCode.statusHintNoShow",
  },
};

/** Кружок с иконкой статуса; `live` — мягкий пульс, пока ждём клинику. */
const StatusIcon: React.FC<{ tone: StatusTone; live?: boolean; children: React.ReactNode }> = ({
  tone,
  live,
  children,
}) => (
  <Box
    sx={{
      position: "relative",
      flexShrink: 0,
      width: 44,
      height: 44,
      borderRadius: "50%",
      bgcolor: tone.solid,
      color: "#FFFFFF",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 6px 14px ${alpha(tone.solid, 0.3)}`,
      "& svg": { fontSize: 24 },
      ...(live && {
        "&::after": {
          content: '""',
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `2px solid ${tone.solid}`,
          animation: "bookingStatusPulse 2.2s ease-out infinite",
        },
        "@keyframes bookingStatusPulse": {
          "0%": { transform: "scale(1)", opacity: 0.55 },
          "100%": { transform: "scale(1.55)", opacity: 0 },
        },
        "@media (prefers-reduced-motion: reduce)": {
          "&::after": { animation: "none", opacity: 0 },
        },
      }),
    }}
  >
    {children}
  </Box>
);

const StatusCard: React.FC<{
  status: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}> = ({ status, t }) => {
  const view = STATUS_VIEW[status];
  // Незнакомый статус — показываем как есть, нейтрально, но не прячем.
  const tone = view?.tone ?? TONE.gray;
  // Заголовок — рядом с иконкой, пояснение — под ними на всю ширину: в колонке
  // справа от кружка на телефоне оно рвалось на слова по одному в строке.
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: BOOKING_RADIUS,
        bgcolor: tone.bg,
        border: `1px solid ${tone.border}`,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <StatusIcon tone={tone} live={view?.live}>
          {view?.icon ?? <EventOutlined />}
        </StatusIcon>
        <Typography sx={{ minWidth: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: tone.text }}>
          {view ? t(view.titleKey) : status}
        </Typography>
      </Stack>
      {view?.hintKey && (
        <Typography sx={{ mt: 1.5, fontSize: 14, lineHeight: 1.55, color: STATUS_BODY_COLOR }}>
          {t(view.hintKey)}
        </Typography>
      )}
    </Box>
  );
};

function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return date;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
}

/** Сколько минут осталось у ссылки банка; null — срок неизвестен или прошёл. */
function minutesLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return null;
  const diff = Math.ceil((end - Date.now()) / 60000);
  return diff > 0 ? diff : null;
}

/**
 * Предоплата на карточке брони. Пока не оплачено — это главное на экране:
 * без оплаты бронь не подтвердится и время освободится через 15 минут.
 */
export const PaymentBlock: React.FC<{
  payment: PublicBookingPayment;
  t: (key: string, opts?: Record<string, unknown>) => string;
  /**
   * Без заголовка/пояснения — когда снаружи уже есть свой (см. `SuccessDialog`,
   * где оплата стала шапкой модалки и повторять «Оплатите предоплату» под
   * своим же заголовком незачем).
   */
  compact?: boolean;
}> = ({ payment, t, compact }) => {
  if (payment.status === "paid") {
    // Деньги дошли — главная хорошая новость экрана: крупно и зелёным, с суммой,
    // а не строкой-алертом, которую глаз пропускает.
    return (
      <Stack
        direction="row"
        spacing={1.75}
        alignItems="center"
        sx={{
          p: 2,
          borderRadius: BOOKING_RADIUS,
          border: `1px solid ${TONE.green.border}`,
          background: "linear-gradient(135deg, #F0FBF4 0%, #DCF5E5 100%)",
        }}
      >
        <Box
          sx={{
            flexShrink: 0,
            width: 48,
            height: 48,
            borderRadius: "50%",
            bgcolor: TONE.green.solid,
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 8px 18px ${alpha(TONE.green.solid, 0.35)}`,
            // Только масштаб и без fill-mode: если анимация не отыграет (фоновая
            // вкладка), кружок всё равно останется сплошным, а не прозрачным.
            animation: "bookingPaidPop 420ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            "@keyframes bookingPaidPop": {
              "0%": { transform: "scale(0.6)" },
              "100%": { transform: "scale(1)" },
            },
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        >
          <CheckRounded sx={{ fontSize: 30 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25, color: TONE.green.text }}>
            {t("byCode.payPaid")}
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 14, fontWeight: 500, color: "#2E7D4F" }}>
            {t("byCode.payPaidAmount", { amount: formatPrice(Number(payment.amount)) })}
          </Typography>
        </Box>
      </Stack>
    );
  }
  if (payment.status === "expired") {
    return <Alert severity="warning">{t("byCode.payExpired")}</Alert>;
  }
  if (payment.status === "failed") {
    return <Alert severity="error">{t("byCode.payFailed")}</Alert>;
  }

  const left = minutesLeft(payment.expiresAt);
  return (
    // Пока не оплачено, это единственное действие, которое имеет значение —
    // тёплый (warning) тон и заметная рамка отличают блок от рядовых фактов
    // записи ниже, чтобы кнопка не терялась (жалоба заказчика 08.09.2026).
    <Paper
      elevation={0}
      sx={(t) => ({
        p: 2,
        borderRadius: BOOKING_RADIUS,
        border: `1px solid ${alpha(t.palette.warning.main, 0.4)}`,
        bgcolor: alpha(t.palette.warning.main, 0.06),
      })}
    >
      <Stack spacing={1.25}>
        {!compact && (
          <>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{t("byCode.payTitle")}</Typography>
            <Typography sx={{ fontSize: 13, color: MUTED }}>{t("byCode.payHint")}</Typography>
          </>
        )}
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
          {t("byCode.payAmount", { amount: formatPrice(Number(payment.amount)) })}
        </Typography>
        {payment.paylinkUrl && (
          <Button
            href={payment.paylinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              width: "100%",
              py: 1.5,
              borderRadius: 99,
              bgcolor: BOOKING_PRIMARY,
              color: "#FFFFFF",
              fontWeight: 700,
              fontSize: 16,
              textTransform: "none",
              boxShadow: CTA_SHADOW,
              "&:hover": { bgcolor: BOOKING_PRIMARY },
            }}
          >
            {t("byCode.payButton")}
          </Button>
        )}
        {left != null && (
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "warning.dark", textAlign: "center" }}>
            {t("byCode.payExpiresIn", { minutes: left })}
          </Typography>
        )}
        {/* Оплату подтверждает только бэк — страница опрашивает его сама. */}
        <Typography sx={{ fontSize: 12, color: MUTED, textAlign: "center" }}>
          {t("byCode.payChecking")}
        </Typography>
      </Stack>
    </Paper>
  );
};

const Row: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <Stack direction="row" alignItems="flex-start" spacing={1}>
    <Box sx={{ color: MUTED, display: "flex", mt: "2px" }}>{icon}</Box>
    <Box sx={{ minWidth: 0 }}>{children}</Box>
  </Stack>
);

const BookingByCodePage: React.FC = () => {
  const { t } = useT("publicBooking");
  const { code = "" } = useParams<{ code: string }>();
  const { orgSlug, go } = useBookingNav();
  const { organization } = useBookingOrg();

  const [booking, setBooking] = React.useState<PublicBookingDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setNotFound(false);
    getBookingByCode(code, ctrl.signal)
      .then((b) => {
        if (!ctrl.signal.aborted) setBooking(b);
      })
      .catch((e) => {
        if (isAbortError(e) || ctrl.signal.aborted) return;
        // 404 — код неверный или бронь удалили; отличать эти случаи бэк не даёт.
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [code]);

  /**
   * Пока предоплата в статусе pending, опрашиваем ту же ручку: кнопка банка
   * «Я оплатил(а)» ничего не доказывает, признак оплаты один — status "paid".
   * Опрос останавливается сам, как только статус изменился.
   */
  const paymentStatus = booking?.payment?.status ?? null;
  React.useEffect(() => {
    if (paymentStatus !== "pending") return;
    const ctrl = new AbortController();
    const id = window.setInterval(() => {
      getBookingByCode(code, ctrl.signal)
        .then((b) => {
          if (!ctrl.signal.aborted) setBooking(b);
        })
        .catch(() => {
          /* сеть моргнула — повторим на следующем тике */
        });
    }, 5000);
    return () => {
      window.clearInterval(id);
      ctrl.abort();
    };
  }, [paymentStatus, code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // буфер недоступен (нет https / отказ) — код и так виден на экране
    }
  };

  const handleAddToCalendar = () => {
    if (!booking) return;
    const ics = buildBookingIcs(booking, organization?.name ?? "");
    downloadIcs(ics, `booking-${booking.confirmationCode}.ics`);
  };

  const maps = booking?.branch
    ? [
        { url: booking.branch.twoGisUrl, label: "2ГИС" },
        { url: booking.branch.yandexMapsUrl, label: t("byCode.yandexMaps") },
        { url: booking.branch.googleMapsUrl, label: t("byCode.googleMaps") },
      ].filter((m): m is { url: string; label: string } => Boolean(m.url))
    : [];

  const price = Number(booking?.totalPrice ?? 0);

  return (
    <PublicBookingShell heading={t("byCode.heading")} backTo="/book">
      <Stack spacing={2} sx={{ px: PAGE_GUTTER, py: 2, maxWidth: 560, mx: "auto", width: "100%" }}>
        {loading ? (
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: BOOKING_RADIUS, boxShadow: BOOKING_SHADOW }}>
            <Stack spacing={1.5}>
              <Skeleton width="40%" height={28} />
              <Skeleton width="70%" />
              <Skeleton width="60%" />
              <Skeleton variant="rounded" height={160} />
            </Stack>
          </Paper>
        ) : notFound || !booking ? (
          <>
            <Alert severity="warning">{t("byCode.notFound")}</Alert>
            <Button
              onClick={() => go("/book")}
              sx={{
                alignSelf: "flex-start",
                px: 3,
                py: 1.25,
                borderRadius: 99,
                bgcolor: BOOKING_PRIMARY,
                color: "#FFFFFF",
                fontWeight: 600,
                "&:hover": { bgcolor: BOOKING_PRIMARY },
              }}
            >
              {t("my.bookNow")}
            </Button>
          </>
        ) : (
          <Paper
            elevation={0}
            sx={{ p: { xs: 2, md: 2.5 }, borderRadius: BOOKING_RADIUS, boxShadow: BOOKING_SHADOW }}
          >
            <Stack spacing={2}>
              <StatusCard status={booking.status} t={t} />

              {/* ── Онлайн-предоплата: главный экран для неоплаченной брони ── */}
              {booking.payment && (
                <PaymentBlock payment={booking.payment} t={t} />
              )}

              <Row icon={<EventOutlined sx={{ fontSize: 20 }} />}>
                <Typography sx={{ fontSize: 18, fontWeight: 700 }}>
                  {formatDate(booking.date)}
                </Typography>
              </Row>
              <Row icon={<ScheduleOutlined sx={{ fontSize: 20 }} />}>
                <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
                  {booking.time}
                  <Box component="span" sx={{ ml: 1, fontSize: 13, fontWeight: 400, color: MUTED }}>
                    {t("byCode.duration", { minutes: booking.totalDurationMin })}
                  </Box>
                </Typography>
              </Row>

              {CALENDAR_ELIGIBLE_STATUSES.has(booking.status) && (
                <Button
                  onClick={handleAddToCalendar}
                  size="small"
                  startIcon={<CalendarMonthOutlined sx={{ fontSize: 16 }} />}
                  sx={{
                    alignSelf: "flex-start",
                    borderRadius: 99,
                    px: 1.5,
                    border: `1px solid ${BORDER}`,
                    color: "text.primary",
                    fontSize: 13,
                    textTransform: "none",
                  }}
                >
                  {t("byCode.addToCalendar")}
                </Button>
              )}

              {booking.doctor && (
                <Row icon={<PersonOutlineOutlined sx={{ fontSize: 20 }} />}>
                  <Typography sx={{ fontSize: 15 }}>{booking.doctor.fullName}</Typography>
                  {booking.doctor.specialty && (
                    <Typography sx={{ fontSize: 13, color: MUTED }}>
                      {booking.doctor.specialty}
                    </Typography>
                  )}
                </Row>
              )}

              <Row icon={<MedicalServicesOutlined sx={{ fontSize: 20 }} />}>
                <Typography sx={{ fontSize: 15 }}>
                  {booking.services.length > 0
                    ? booking.services.map((s) => s.name).join(", ")
                    : t("my.serviceOnVisit")}
                </Typography>
                {price > 0 && (
                  <Typography sx={{ fontSize: 13, color: MUTED }}>{formatPrice(price)}</Typography>
                )}
              </Row>

              {booking.branch && (
                <Row icon={<PlaceOutlined sx={{ fontSize: 20 }} />}>
                  <Typography sx={{ fontSize: 15 }}>{booking.branch.name}</Typography>
                  {booking.branch.address && (
                    <Typography sx={{ fontSize: 13, color: MUTED }}>
                      {booking.branch.address}
                    </Typography>
                  )}
                  {/* Телефон филиала: по нему переносят и уточняют запись —
                      он приходил в ответе, но не показывался. */}
                  {booking.branch.phones?.[0] && (
                    <Typography
                      component="a"
                      href={`tel:${booking.branch.phones[0].replace(/[^\d+]/g, "")}`}
                      sx={{
                        display: "inline-block",
                        mt: 0.5,
                        fontSize: 13,
                        color: BOOKING_PRIMARY,
                        textDecoration: "none",
                      }}
                    >
                      {booking.branch.phones[0]}
                    </Typography>
                  )}
                  {maps.length > 0 && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                      {maps.map((m) => (
                        <Button
                          key={m.label}
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="small"
                          startIcon={<MapOutlined sx={{ fontSize: 16 }} />}
                          sx={{
                            borderRadius: 99,
                            px: 1.5,
                            border: `1px solid ${BORDER}`,
                            color: "text.primary",
                            fontSize: 13,
                            textTransform: "none",
                          }}
                        >
                          {m.label}
                        </Button>
                      ))}
                    </Stack>
                  )}
                </Row>
              )}

              {/* Код и QR — то, что показывают на ресепшене. */}
              <Stack alignItems="center" spacing={1} sx={{ pt: 1, borderTop: `1px solid ${BORDER}` }}>
                <Typography sx={{ fontSize: 13, color: MUTED, pt: 1.5 }}>
                  {t("confirmationCode")}
                </Typography>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography sx={{ fontFamily: "monospace", fontSize: 20, fontWeight: 600 }}>
                    {booking.confirmationCode}
                  </Typography>
                  <Button
                    onClick={() => void handleCopy()}
                    size="small"
                    startIcon={<ContentCopyOutlined sx={{ fontSize: 16 }} />}
                    sx={{ minWidth: 0, textTransform: "none", color: BOOKING_PRIMARY }}
                  >
                    {copied ? t("copied") : t("byCode.copy")}
                  </Button>
                </Stack>
                <Box sx={{ p: 1.5, bgcolor: "#FFFFFF", borderRadius: 2, border: `1px solid ${BORDER}` }}>
                  {/* Не window.location.href: страницу могли открыть с тестового
                      стенда или локально, а QR показывают на ресепшене. */}
                  <QRCode value={bookingCodeUrl(booking.confirmationCode, orgSlug)} size={148} level="M" />
                </Box>
              </Stack>

              <Stack component="ul" sx={{ pl: 2, m: 0, gap: 0.5 }}>
                <Typography component="li" sx={{ fontSize: 12, color: MUTED }}>
                  {t("reminderOnTime")}
                </Typography>
                <Typography component="li" sx={{ fontSize: 12, color: MUTED }}>
                  {t("reminderCancel")}
                </Typography>
              </Stack>
            </Stack>
          </Paper>
        )}
      </Stack>
    </PublicBookingShell>
  );
};

export default BookingByCodePage;
