import React from "react";
import { Box, ButtonBase, IconButton, Portal, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import CallOutlined from "@mui/icons-material/CallOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router";
import dayjs from "dayjs";

import type { BookingListItem, BookingSource } from "../../api/bookings";
import { useNewBookings } from "../../hooks/useNewBookings";
import { usePermissions } from "../../hooks/usePermissions";
import {
  PrepaymentChip,
  bookingTimeHint,
  bookingTimeRange,
  hasPrepayment,
} from "../../pages/bookings/meta";
import { subtleBg, subtleBorder } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { AppButton, AppCard, UserAvatar } from "../ui";

/**
 * «Пришла новая заявка» — из любого экрана CRM, а не только со страницы броней.
 *
 * Бейдж в сайдбаре показывает лишь число: чтобы понять, кто записался и на
 * когда, надо было уйти со своего экрана. Тост показывает саму заявку и ведёт
 * прямо в её карточку.
 *
 * Показываем только то, что пришло **при нас**: при первом ответе поллера
 * запоминаем текущие id как уже известные и молчим — иначе на каждом входе в
 * CRM вываливался бы тост о заявках, которые давно висят (их место — бейдж,
 * колокольчик и подсветка в списке).
 *
 * На странице броней тост тоже показываем. Казалось бы, там достаточно
 * подсветки строки, но список ограничен фильтрами: заявка на дату вне
 * выбранного периода (или под другим статусом) в него не попадает вовсе, и
 * приход остался бы незаметным именно на том экране, где его ждут.
 *
 * Заявки приходят пачками (поллер раз в 45 с), поэтому тост — **стек**
 * карточек, а не одна строка «и ещё N»: регистратор видит каждую пришедшую
 * заявку и может открыть любую, а не только первую. Больше `MAX_VISIBLE` на
 * экран не пускаем — остальное сворачивается в строку «смотреть все», иначе
 * стек закроет пол-экрана.
 *
 * Карточка **компактная**: имя, время и сумма — то, по чему решают, бросать ли
 * текущее дело. Остальное (источник, филиал, предоплата, телефон, кнопки)
 * раскрывается по наведению — тогда же встаёт таймер автозакрытия, так что
 * подробности не убегают из-под курсора. На тачскрине наводить нечем, там
 * карточка сразу развёрнута.
 */

/** Сколько карточек показываем одновременно; остальное — в свёрнутой строке. */
const MAX_VISIBLE = 3;
/** Сколько живёт карточка, пока на неё не навели мышь. */
const AUTO_HIDE_MS = 15_000;

const SOURCE_META: Record<BookingSource, { label: string; icon: React.ReactNode }> = {
  public: { label: "сайт клиники", icon: <LanguageOutlined /> },
  operator: { label: "operator.kg", icon: <BoltOutlined /> },
};

/** «только что» / «5 мин» — сколько заявка уже ждёт. */
function arrivedLabel(createdAt: string | undefined): string {
  if (!createdAt) return "только что";
  const created = dayjs(createdAt);
  if (!created.isValid()) return "только что";
  const minutes = dayjs().diff(created, "minute");
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин`;
  return created.format("HH:mm");
}

/** «Ещё 2 заявки» — счётчик свёрнутого хвоста. */
function pluralBookings(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "заявка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "заявки";
  return "заявок";
}

/**
 * Есть ли у устройства настоящее наведение. На тачскрине ховера нет, а тап по
 * карточке открывает заявку — раскрывать подробности там нечем, поэтому такие
 * карточки показываем развёрнутыми сразу.
 */
function useHasHover(): boolean {
  const [hasHover, setHasHover] = React.useState(true);
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => setHasHover(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return hasHover;
}

/**
 * Отсчёт до автозакрытия с паузой (наведение мыши, фокус с клавиатуры).
 *
 * Считаем не на rAF, а одним `setTimeout` с запоминанием остатка: полоска
 * прогресса — CSS-анимация, ей перерисовки React не нужны, а тост на каждом
 * кадре дёргал бы целое дерево карточек.
 */
function useAutoDismiss(paused: boolean, onDone: () => void): void {
  const remainingRef = React.useRef(AUTO_HIDE_MS);
  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;

  React.useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const id = window.setTimeout(() => doneRef.current(), remainingRef.current);
    return () => {
      window.clearTimeout(id);
      remainingRef.current = Math.max(remainingRef.current - (Date.now() - startedAt), 0);
    };
  }, [paused]);
}

// ── Карточка заявки ───────────────────────────────────────────────────────────

const MotionBox = motion.create(Box);

/** Пилюля-факт в раскрытой части: иконка + короткий текст. */
const Fact: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={0.625}
    sx={(t) => ({
      px: 0.875,
      py: 0.375,
      maxWidth: "100%",
      borderRadius: "7px",
      border: 1,
      borderColor: subtleBorder(t),
      bgcolor: subtleBg(t),
      "& .MuiSvgIcon-root": { fontSize: 14, color: "text.disabled" },
    })}
  >
    {icon}
    <Typography variant="caption" noWrap>
      {text}
    </Typography>
  </Stack>
);

interface ToastCardProps {
  booking: BookingListItem;
  onOpen: () => void;
  onDismiss: () => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ booking: b, onOpen, onDismiss }) => {
  const hasHover = useHasHover();
  const [active, setActive] = React.useState(false);
  // Таймер держим только настоящим наведением: на тачскрине карточка развёрнута
  // всегда, и вечно висящего тоста из этого получаться не должно.
  const paused = hasHover && active;
  useAutoDismiss(paused, onDismiss);
  const expanded = !hasHover || active;

  const source = SOURCE_META[b.source] ?? SOURCE_META.public;
  const hint = bookingTimeHint(b.date, b.time, b.status);
  const phone = formatPhoneDisplay(b.patientPhone);

  return (
    <MotionBox
      layout
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, x: 32, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 32, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocusCapture={() => setActive(true)}
      onBlurCapture={() => setActive(false)}
      sx={{ width: "100%", pointerEvents: "auto" }}
    >
      <AppCard
        variant="outlined"
        elevation={0}
        disableContentPadding
        sx={(t) => ({
          position: "relative",
          overflow: "hidden",
          borderColor: alpha(t.palette.primary.main, active ? 0.45 : 0.3),
          bgcolor: "background.paper",
          transition: "border-color .15s ease",
          // Тень — исключение из плоского стиля, и оно оправдано: тост висит
          // НАД произвольным экраном, и без отрыва от фона он читается как
          // часть страницы под ним.
          boxShadow: t.shadows[6],
        })}
      >
        {/* Свёрнутое состояние: кто, когда и на сколько */}
        <ButtonBase
          onClick={onOpen}
          sx={{
            display: "block",
            width: "100%",
            textAlign: "left",
            px: 1.5,
            py: 1.25,
            pr: 4.5,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <Box sx={{ position: "relative", flexShrink: 0, display: "flex" }}>
              <UserAvatar name={b.patientName} size={36} sx={{ borderRadius: "10px" }} />
              {/* Точка «новое» — вместо отдельной строки-шапки */}
              <Box
                sx={(t) => ({
                  position: "absolute",
                  top: -3,
                  right: -3,
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  border: `2px solid ${t.palette.background.paper}`,
                  animation: "newBookingPulse 2s ease-out infinite",
                  "@keyframes newBookingPulse": {
                    "0%": { boxShadow: `0 0 0 0 ${alpha(t.palette.primary.main, 0.5)}` },
                    "70%": { boxShadow: `0 0 0 6px ${alpha(t.palette.primary.main, 0)}` },
                    "100%": { boxShadow: `0 0 0 0 ${alpha(t.palette.primary.main, 0)}` },
                  },
                  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                })}
              />
            </Box>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" alignItems="baseline" spacing={0.75}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: "primary.onSurface", flexShrink: 0 }}
                >
                  Новая заявка
                </Typography>
                <Typography variant="caption" color="text.disabled" noWrap>
                  {arrivedLabel(b.createdAt)}
                </Typography>
                {/* Деньги уже пришли — это решает, за какую заявку браться
                    первой, поэтому метка видна и в свёрнутом виде; подробности
                    (сумма, «не подтверждена») — в раскрытой части. */}
                {b.prepaymentStatus === "paid" && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      fontWeight: 600,
                      color: b.prepaymentNeedsAttention ? "error.onSurface" : "success.onSurface",
                    }}
                  >
                    {b.prepaymentNeedsAttention ? "⚠ оплачена" : "оплачена"}
                  </Typography>
                )}
              </Stack>
              <Typography variant="body2" fontWeight={600} noWrap sx={{ letterSpacing: -0.1 }}>
                {b.patientName || "Без имени"}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {dayjs(b.date).format("DD.MM")}, {bookingTimeRange(b.time, b.totalDurationMin)}
                {b.doctorName ? ` · ${b.doctorName}` : ""}
              </Typography>
            </Box>

            <Box sx={{ textAlign: "right", flexShrink: 0 }}>
              <Typography variant="body2" fontWeight={700} noWrap>
                {formatKGS(b.totalPrice)}
              </Typography>
              {hint && (
                <Typography
                  variant="caption"
                  noWrap
                  component="div"
                  sx={{ color: hint.tone === "warning" ? "warning.onSurface" : "text.disabled" }}
                >
                  {hint.text}
                </Typography>
              )}
            </Box>
          </Stack>
        </ButtonBase>

        {/* Подробности и кнопки — по наведению */}
        <AnimatePresence initial={false}>
          {expanded && (
            <MotionBox
              key="details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              sx={{ overflow: "hidden" }}
            >
              <Box
                sx={(t) => ({
                  px: 1.5,
                  pt: 1.25,
                  pb: 1.5,
                  borderTop: 1,
                  borderColor: subtleBorder(t),
                })}
              >
                <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 1.25 }}>
                  <Fact icon={source.icon} text={source.label} />
                  {b.branchName && <Fact icon={<PlaceOutlined />} text={b.branchName} />}
                  {hasPrepayment(b) && b.prepaymentStatus && (
                    <PrepaymentChip
                      status={b.prepaymentStatus}
                      amount={b.prepaymentAmount}
                      needsAttention={b.prepaymentNeedsAttention}
                      expiresAt={b.prepaymentExpiresAt}
                    />
                  )}
                </Stack>

                <Stack direction="row" spacing={1}>
                  <AppButton
                    variant="contained"
                    size="small"
                    fullWidth
                    endIcon={<ArrowForwardOutlined />}
                    onClick={onOpen}
                  >
                    Открыть заявку
                  </AppButton>
                  {b.patientPhone && (
                    <AppButton
                      variant="outlined"
                      size="small"
                      component="a"
                      href={`tel:${b.patientPhone}`}
                      startIcon={<CallOutlined />}
                      sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                    >
                      {phone || "Позвонить"}
                    </AppButton>
                  )}
                </Stack>
              </Box>
            </MotionBox>
          )}
        </AnimatePresence>

        {/* Крестик поверх карточки: в свёрнутом виде отдельной строки под него нет */}
        <Tooltip title="Скрыть — заявка останется новой">
          <IconButton
            size="small"
            aria-label="Скрыть уведомление"
            onClick={onDismiss}
            sx={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 24,
              height: 24,
              borderRadius: "8px",
              color: "text.disabled",
              "&:hover": { color: "text.primary", bgcolor: (t) => subtleBg(t, true) },
              "& .MuiSvgIcon-root": { fontSize: 15 },
            }}
          >
            <CloseOutlined />
          </IconButton>
        </Tooltip>

        {/* Полоска автозакрытия: видно, сколько осталось и что наведение её держит */}
        <Box
          sx={(t) => ({
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 2,
            bgcolor: alpha(t.palette.primary.main, 0.12),
            overflow: "hidden",
          })}
        >
          <Box
            sx={{
              height: "100%",
              bgcolor: "primary.main",
              transformOrigin: "left center",
              animation: `newBookingCountdown ${AUTO_HIDE_MS}ms linear forwards`,
              animationPlayState: paused ? "paused" : "running",
              "@keyframes newBookingCountdown": {
                from: { transform: "scaleX(1)" },
                to: { transform: "scaleX(0)" },
              },
            }}
          />
        </Box>
      </AppCard>
    </MotionBox>
  );
};

// ── Стек ──────────────────────────────────────────────────────────────────────

export const NewBookingToast: React.FC = () => {
  const navigate = useNavigate();
  const { items, markSeen, enabled, isSuccess } = useNewBookings();

  const [queue, setQueue] = React.useState<BookingListItem[]>([]);
  /** id, о которых уже знаем: показывать по ним тост второй раз не нужно. */
  const knownRef = React.useRef<Set<number> | null>(null);

  // Смена организации/филиала — это другой поток заявок: знакомимся заново,
  // иначе первая же выдача нового филиала выглядела бы как пачка новых.
  const { activeOrganization, activeBranch } = usePermissions();
  React.useEffect(() => {
    knownRef.current = null;
    setQueue([]);
  }, [activeOrganization?.id, activeBranch?.id]);

  React.useEffect(() => {
    // Знакомимся только по настоящему ответу сервера: до него `items` пуст, и
    // если принять эту пустоту за «заявок нет», первая же выдача сойдёт за
    // пачку новых — тост вываливался бы о старых заявках на каждом входе.
    if (!enabled || !isSuccess) return;
    if (knownRef.current === null) {
      knownRef.current = new Set(items.map((b) => b.id));
      return;
    }
    const fresh = items.filter((b) => !knownRef.current!.has(b.id));
    items.forEach((b) => knownRef.current!.add(b.id));
    if (fresh.length === 0) return;
    // Свежие — в конец: стек прижат к нижнему углу, и последняя карточка
    // оказывается ближе всего к краю экрана, куда смотрят.
    setQueue((prev) => [...prev, ...fresh.filter((f) => !prev.some((p) => p.id === f.id))]);
  }, [items, enabled, isSuccess]);

  const dismiss = React.useCallback((id: number) => {
    // Закрытие тоста не считается разбором заявки: она остаётся новой в списке
    // и в колокольчике, пока карточку не откроют.
    setQueue((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const open = React.useCallback(
    (id: number) => {
      markSeen([id]);
      setQueue((prev) => prev.filter((b) => b.id !== id));
      navigate(`/bookings?open=${id}`);
    },
    [markSeen, navigate],
  );

  if (queue.length === 0) return null;

  const visible = queue.slice(-MAX_VISIBLE);
  const hidden = queue.length - visible.length;

  return (
    <Portal>
      <Box
        sx={(t) => ({
          position: "fixed",
          zIndex: t.zIndex.snackbar,
          right: { xs: 12, sm: 20 },
          bottom: { xs: 12, sm: 20 },
          left: { xs: 12, sm: "auto" },
          width: { xs: "auto", sm: 360 },
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 1,
          pointerEvents: "none",
        })}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {hidden > 0 && (
            <MotionBox
              key="rest"
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              sx={{ pointerEvents: "auto", alignSelf: "flex-end" }}
            >
              <ButtonBase
                onClick={() => {
                  setQueue([]);
                  navigate("/bookings");
                }}
                sx={(t) => ({
                  px: 1.5,
                  py: 0.75,
                  borderRadius: "10px",
                  border: 1,
                  borderColor: "divider",
                  bgcolor: "background.paper",
                  boxShadow: t.shadows[4],
                  "&:hover": { borderColor: alpha(t.palette.primary.main, 0.35) },
                })}
              >
                <Typography variant="caption" fontWeight={600}>
                  Ещё {hidden} {pluralBookings(hidden)} · смотреть все
                </Typography>
              </ButtonBase>
            </MotionBox>
          )}
          {visible.map((b) => (
            <ToastCard
              key={b.id}
              booking={b}
              onOpen={() => open(b.id)}
              onDismiss={() => dismiss(b.id)}
            />
          ))}
        </AnimatePresence>
      </Box>
    </Portal>
  );
};

export default NewBookingToast;
