import React from "react";
import { Alert, Box, Button, Chip, Paper, Skeleton, Stack, Typography } from "@mui/material";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import MapOutlined from "@mui/icons-material/MapOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import QRCode from "react-qr-code";
import { useNavigate, useParams } from "react-router";

import { getBookingByCode, type PublicBookingDetail } from "../../api/publicBooking";
import { ApiError, isAbortError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";
import { PublicBookingShell, PAGE_GUTTER } from "./shell";
import { bookingCodeUrl, formatPrice } from "./format";
import { BOOKING_PRIMARY, BOOKING_RADIUS, BOOKING_SHADOW, BORDER, MUTED } from "./theme";

/**
 * «Ваша запись» по коду подтверждения — то, куда ведёт QR из экрана успеха.
 *
 * Страница публичная и живёт по одному коду, поэтому персональных данных здесь
 * нет: бэк отдаёт дату, время, врача, филиал и услуги, но не ФИО и не телефон
 * пациента. Администратор сканирует тот же QR на ресепшене и видит ту же
 * карточку.
 */

const STATUS_KEYS: Record<string, string> = {
  pending: "my.statusPending",
  confirmed: "my.statusConfirmed",
  awaiting_payment: "my.statusAwaitingPayment",
  cancelled: "my.statusCancelled",
  completed: "my.statusCompleted",
  no_show: "my.statusNoShow",
};

const STATUS_COLOR: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  pending: "warning",
  confirmed: "success",
  awaiting_payment: "warning",
  cancelled: "error",
  completed: "info",
  no_show: "default",
};

function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return date;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
}

const Row: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <Stack direction="row" alignItems="flex-start" spacing={1}>
    <Box sx={{ color: MUTED, display: "flex", mt: "2px" }}>{icon}</Box>
    <Box sx={{ minWidth: 0 }}>{children}</Box>
  </Stack>
);

const BookingByCodePage: React.FC = () => {
  const { t } = useT("publicBooking");
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // буфер недоступен (нет https / отказ) — код и так виден на экране
    }
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
              onClick={() => navigate("/book")}
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
              <Chip
                size="small"
                label={STATUS_KEYS[booking.status] ? t(STATUS_KEYS[booking.status]) : booking.status}
                color={STATUS_COLOR[booking.status] ?? "default"}
                sx={{ alignSelf: "flex-start" }}
              />

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
                  <QRCode value={bookingCodeUrl(booking.confirmationCode)} size={148} level="M" />
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
