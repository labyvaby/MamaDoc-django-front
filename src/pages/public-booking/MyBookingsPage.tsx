import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import EventOutlined from "@mui/icons-material/EventOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import { useNavigate } from "react-router";

import {
  cancelMyBooking,
  filterBookingsForPatient,
  getMyBookings,
  isBookingCancellable,
  isPatientTokenInvalid,
  splitBookingsByTime,
  type MyBooking,
} from "../../api/publicPatient";
import { isAbortError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";
import { usePatientSession } from "./PatientSession";
import { PatientAuthDialog } from "./booking/PatientAuthDialog";
import { PublicBookingShell, PAGE_GUTTER } from "./shell";
import { formatPrice } from "./format";
import { BOOKING_PRIMARY, BOOKING_RADIUS, BOOKING_SHADOW, BORDER, MUTED } from "./theme";

/**
 * «Мои записи» — история пациента по номеру телефона.
 *
 * ⚠ Записи не разделены по картам: бэк не отдаёт привязку записи к пациенту, а
 * `?patient_id=` игнорирует (тикет
 * `backend_ticket_booking_patient_cabinet_2026-08-05.md` §1). Поэтому здесь всё,
 * что оформлено на номер, включая записи детей. Как появится привязка — добавим
 * группировку, это одно место.
 *
 * Деление на предстоящие и прошедшие тоже клиентское: `?status=` бэк игнорирует.
 */

const STATUS_LABEL_KEYS: Record<string, string> = {
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
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
}

const BookingCard: React.FC<{
  booking: MyBooking;
  onCancel: (b: MyBooking) => void;
  onOpen: (b: MyBooking) => void;
  cancelling: boolean;
}> = ({ booking, onCancel, onOpen, cancelling }) => {
  const { t } = useT("publicBooking");
  const statusKey = STATUS_LABEL_KEYS[booking.status];
  const price = Number(booking.totalPrice ?? 0);

  return (
    <Paper
      elevation={0}
      sx={{ p: { xs: 2, md: 2.5 }, borderRadius: BOOKING_RADIUS, boxShadow: BOOKING_SHADOW }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            label={statusKey ? t(statusKey) : booking.status}
            color={STATUS_COLOR[booking.status] ?? "default"}
          />
          {/* Префикс короткий: с «Код подтверждения:» чип не влезал в 320 px и
              обрезал сам код — а его пациент показывает на ресепшене. */}
          <Chip
            size="small"
            variant="outlined"
            label={`${t("my.codeShort")}: ${booking.confirmationCode}`}
            sx={{ fontFamily: "monospace", maxWidth: "100%" }}
          />
        </Stack>

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <EventOutlined sx={{ fontSize: 18, color: MUTED }} />
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
              {formatDate(booking.date)}
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <ScheduleOutlined sx={{ fontSize: 18, color: MUTED }} />
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{booking.time}</Typography>
          </Stack>
        </Stack>

        {booking.doctor && (
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <PersonOutlineOutlined sx={{ fontSize: 18, color: MUTED }} />
            <Typography sx={{ fontSize: 14 }}>
              {booking.doctor.fullName}
              {booking.doctor.specialty ? ` · ${booking.doctor.specialty}` : ""}
            </Typography>
          </Stack>
        )}

        <Stack direction="row" alignItems="flex-start" spacing={0.75}>
          <MedicalServicesOutlined sx={{ fontSize: 18, color: MUTED, mt: "2px" }} />
          <Box>
            <Typography sx={{ fontSize: 14 }}>
              {booking.services.length > 0
                ? booking.services.map((s) => s.name).join(", ")
                : t("my.serviceOnVisit")}
            </Typography>
            {price > 0 && (
              <Typography sx={{ fontSize: 13, color: MUTED }}>{formatPrice(price)}</Typography>
            )}
          </Box>
        </Stack>

        {booking.branch?.address && (
          <Stack direction="row" alignItems="flex-start" spacing={0.75}>
            <PlaceOutlined sx={{ fontSize: 18, color: MUTED, mt: "2px" }} />
            <Typography sx={{ fontSize: 14 }}>
              {booking.branch.name}
              {booking.branch.address ? ` · ${booking.branch.address}` : ""}
            </Typography>
          </Stack>
        )}

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {/* Та же карточка, что открывается по QR: её показывают на ресепшене. */}
          <Button
            onClick={() => onOpen(booking)}
            size="small"
            sx={{
              borderRadius: 99,
              px: 2,
              border: `1px solid ${BORDER}`,
              color: "text.primary",
              textTransform: "none",
              fontWeight: 500,
            }}
          >
            {t("my.openCard")}
          </Button>
          {isBookingCancellable(booking) && (
            <Button
              onClick={() => onCancel(booking)}
              disabled={cancelling}
              size="small"
              sx={{
                borderRadius: 99,
                px: 2,
                border: `1px solid ${BORDER}`,
                color: "error.main",
                textTransform: "none",
                fontWeight: 500,
              }}
            >
              {cancelling ? t("my.cancelling") : t("my.cancelAction")}
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
};

const MyBookingsPage: React.FC = () => {
  const { t } = useT("publicBooking");
  const navigate = useNavigate();
  const { session, selectedPatient } = usePatientSession();
  const [items, setItems] = React.useState<MyBooking[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [authOpen, setAuthOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState<MyBooking | null>(null);
  const [cancellingId, setCancellingId] = React.useState<number | null>(null);

  const token = session?.token ?? null;

  // t не в зависимостях намеренно: useT отдаёт новую функцию на каждый рендер,
  // и от неё загрузчик пересоздавался бы, перезапуская эффект — тот обрывал
  // собственный запрос через AbortController и оставлял вечный спиннер.
  const tRef = React.useRef(t);
  tRef.current = t;

  const load = React.useCallback(
    (signal?: AbortSignal) => {
      if (!token) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      // limit с запасом: по умолчанию бэк отдаёт 20 записей, а история приёмов
      // за годы в клинике длиннее — «прошедшие» иначе молча обрезались бы.
      getMyBookings(token, { limit: 100 }, signal)
        .then((res) => {
          if (signal?.aborted) return;
          setItems(res.items);
        })
        .catch((e) => {
          if (isAbortError(e) || signal?.aborted) return;
          // Токен отозван — сессию почистит провайдер, здесь просто просим войти.
          setError(
            isPatientTokenInvalid(e) ? tRef.current("my.sessionExpired") : tRef.current("my.loadFailed"),
          );
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [token],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Вошёл, но карту ещё не выбрал (на номере их несколько) — просим выбрать:
  // от карты зависит, за кого будет следующая запись.
  React.useEffect(() => {
    if (session && !selectedPatient && session.patients.length > 1) setAuthOpen(true);
  }, [session, selectedPatient]);

  const handleCancel = async () => {
    if (!token || !confirming) return;
    setCancellingId(confirming.id);
    try {
      await cancelMyBooking(token, confirming.id);
      setConfirming(null);
      load();
    } catch {
      setError(t("my.cancelFailed"));
      setConfirming(null);
    } finally {
      setCancellingId(null);
    }
  };

  // Записи выбранной карты: на одном номере их часто несколько (дети записаны
  // на телефон родителя). Гостевые брони номера остаются видны при любой карте.
  const visible = React.useMemo(
    () => filterBookingsForPatient(items, selectedPatient?.id ?? null),
    [items, selectedPatient],
  );

  const { upcoming, past } = React.useMemo(() => splitBookingsByTime(visible), [visible]);

  // Диалог держим смонтированным независимо от состояния сессии: он переживает
  // вход и остаётся на шаге выбора карты, когда на номере их несколько.
  const authDialog = (
    <PatientAuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
  );

  if (!session) {
    return (
      <PublicBookingShell>
        <Stack spacing={2} alignItems="center" sx={{ py: 8, px: PAGE_GUTTER, textAlign: "center" }}>
          <PersonOutlineOutlined sx={{ fontSize: 48, color: MUTED }} />
          <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{t("my.signInTitle")}</Typography>
          <Typography sx={{ fontSize: 14, color: MUTED, maxWidth: 420 }}>
            {t("my.signInHint")}
          </Typography>
          <Button
            onClick={() => setAuthOpen(true)}
            sx={{
              mt: 1,
              px: 3,
              py: 1.25,
              borderRadius: 99,
              bgcolor: BOOKING_PRIMARY,
              color: "#FFFFFF",
              fontWeight: 600,
              "&:hover": { bgcolor: BOOKING_PRIMARY },
            }}
          >
            {t("auth.signIn")}
          </Button>
        </Stack>
        {authDialog}
      </PublicBookingShell>
    );
  }

  return (
    <PublicBookingShell>
      {authDialog}
      <Stack spacing={2.5} sx={{ px: PAGE_GUTTER, py: 3 }}>
        <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{t("auth.myBookings")}</Typography>

        {error && <Alert severity="error">{error}</Alert>}

        {loading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        ) : visible.length === 0 ? (
          <Stack spacing={2} alignItems="center" sx={{ py: 6, textAlign: "center" }}>
            <EventOutlined sx={{ fontSize: 44, color: MUTED }} />
            <Typography sx={{ fontSize: 15, color: MUTED }}>{t("my.empty")}</Typography>
            <Button
              onClick={() => navigate("/book")}
              sx={{
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
          </Stack>
        ) : (
          <>
            {upcoming.length > 0 && (
              <Stack spacing={1.5}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: MUTED }}>
                  {t("my.upcoming")}
                </Typography>
                {upcoming.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    onCancel={setConfirming}
                    onOpen={(b) => navigate(`/book/b/${b.confirmationCode}`)}
                    cancelling={cancellingId === b.id}
                  />
                ))}
              </Stack>
            )}

            {past.length > 0 && (
              <Stack spacing={1.5}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: MUTED }}>
                  {t("my.past")}
                </Typography>
                {past.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    onCancel={setConfirming}
                    onOpen={(b) => navigate(`/book/b/${b.confirmationCode}`)}
                    cancelling={cancellingId === b.id}
                  />
                ))}
              </Stack>
            )}
          </>
        )}
      </Stack>

      <Dialog open={confirming != null} onClose={() => setConfirming(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t("my.cancelTitle")}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14 }}>
            {confirming
              ? t("my.cancelQuestion", {
                  date: formatDate(confirming.date),
                  time: confirming.time,
                })
              : ""}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(null)} disabled={cancellingId != null}>
            {t("my.keep")}
          </Button>
          <Button
            onClick={() => void handleCancel()}
            color="error"
            disabled={cancellingId != null}
            startIcon={cancellingId != null ? <CircularProgress size={14} /> : undefined}
          >
            {t("my.cancelAction")}
          </Button>
        </DialogActions>
      </Dialog>
    </PublicBookingShell>
  );
};

export default MyBookingsPage;
