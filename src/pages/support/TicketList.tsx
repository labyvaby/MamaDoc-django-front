import React from "react";
import { Box, Button, CircularProgress, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import ChatBubbleOutlineRounded from "@mui/icons-material/ChatBubbleOutlineRounded";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import RocketLaunchOutlined from "@mui/icons-material/RocketLaunchOutlined";
import { motion, useReducedMotion } from "framer-motion";

import type { SupportTicket } from "../../api/support";
import { formatRelative, STATUS_TONE, toneColors } from "../../support/meta";
import { CategoryBubble, ImpactPill, StatusPill } from "../../support/ui";

const MotionBox = motion(Box);

export interface TicketCardProps {
  ticket: SupportTicket;
  selected: boolean;
  /** Показать организацию, филиал и автора (разработчик и руководитель). */
  showPlace: boolean;
  index: number;
  onSelect: (id: number) => void;
}

/**
 * Карточка обращения. Слева — цветная полоса статуса, у обращений с новым
 * ответом (или ждущих реакции разработчика) — пульсирующая точка. Карточка
 * приподнимается при наведении, выбранная подсвечена в цвет акцента.
 */
export const TicketCard: React.FC<TicketCardProps> = React.memo(({ ticket, selected, showPlace, index, onSelect }) => {
  const reduceMotion = useReducedMotion();
  const place = [ticket.organizationName, ticket.branchName].filter(Boolean).join(" · ");
  return (
    <MotionBox
      // Без layout-анимации позиции: при открытии обращения сетка меняет число
      // колонок одновременно со сворачиванием шапки, и карточки «прыгали».
      // Наведение ловит неподвижная обёртка: поднимается только карточка внутри,
      // иначе у нижнего края она уезжала из-под курсора и дрожала.
      className="support-card"
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.035, 0.35), ease: [0.22, 1, 0.36, 1] }}
    >
      <Box
        component="button"
        type="button"
        onClick={() => onSelect(ticket.id)}
        aria-current={selected}
        sx={(t) => {
          const c = toneColors(t, STATUS_TONE[ticket.status]);
          return {
            position: "relative",
            display: "flex",
            gap: 1.5,
            width: "100%",
            textAlign: "left",
            p: 1.5,
            pl: 2,
            borderRadius: "14px",
            border: `1px solid ${selected ? t.palette.primary.main : t.palette.divider}`,
            bgcolor: selected ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.14 : 0.06) : "background.paper",
            color: "text.primary",
            cursor: "pointer",
            font: "inherit",
            overflow: "hidden",
            transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease, background-color .18s ease",
            "&::before": {
              content: '""',
              position: "absolute",
              left: 0,
              top: 10,
              bottom: 10,
              width: 3,
              borderRadius: "0 3px 3px 0",
              bgcolor: c.main,
              opacity: selected || ticket.unread ? 1 : 0.55,
            },
            // Только там, где есть настоящее наведение: на телефоне «hover»
            // залипает после касания и карточка оставалась приподнятой.
            "@media (hover: hover)": {
              ".support-card:hover > &": {
                transform: "translateY(-2px)",
                borderColor: selected ? t.palette.primary.main : c.border,
                boxShadow: `0 10px 26px ${alpha(c.main, t.palette.mode === "dark" ? 0.2 : 0.14)}`,
              },
            },
            "&:active": { transform: "translateY(0) scale(0.995)" },
            "&:focus-visible": { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
          };
        }}
      >
        <CategoryBubble category={ticket.category} size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 800, letterSpacing: 0.6, fontFamily: "ui-monospace, Menlo, Consolas, monospace", color: "text.secondary" }}
            >
              {ticket.number}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: "nowrap" }}>
              {formatRelative(ticket.updatedAt)}
            </Typography>
            {ticket.unread && <PulseDot />}
          </Stack>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              lineHeight: 1.3,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              wordBreak: "break-word",
            }}
          >
            {ticket.title}
          </Typography>
          {ticket.preview && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.25,
                lineHeight: 1.4,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                wordBreak: "break-word",
              }}
            >
              {ticket.preview}
            </Typography>
          )}
          <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
            <StatusPill status={ticket.status} />
            {ticket.impact && ticket.status !== "voided" && <ImpactPill impact={ticket.impact} />}
            {ticket.reopenCount > 0 && (
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, color: "warning.main" }}>
                <ReplayRounded sx={{ fontSize: 14 }} />
                <Typography variant="caption">{ticket.reopenCount}</Typography>
              </Box>
            )}
            {ticket.commentsCount > 0 && (
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, color: "text.secondary" }}>
                <ChatBubbleOutlineRounded sx={{ fontSize: 14 }} />
                <Typography variant="caption">{ticket.commentsCount}</Typography>
              </Box>
            )}
            {ticket.hasScreenshot && <ImageOutlined sx={{ fontSize: 15, color: "text.disabled" }} />}
          </Stack>
          {showPlace && (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.75, color: "text.secondary", minWidth: 0 }}>
              <BusinessOutlined sx={{ fontSize: 14, flexShrink: 0 }} />
              <Typography variant="caption" noWrap>
                {place} · {ticket.mine ? "вы" : ticket.authorName}
              </Typography>
            </Stack>
          )}
        </Box>
      </Box>
    </MotionBox>
  );
});
TicketCard.displayName = "TicketCard";

const PulseDot: React.FC = () => {
  const reduceMotion = useReducedMotion();
  return (
    <Box
      aria-label="Есть новое"
      sx={{ position: "relative", width: 9, height: 9, flexShrink: 0 }}
      role="img"
    >
      <Box sx={{ position: "absolute", inset: 0, borderRadius: "50%", bgcolor: "error.main" }} />
      {!reduceMotion && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0.7, scale: 1 }}
          animate={{ opacity: 0, scale: 2.8 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
          style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#f44336" }}
        />
      )}
    </Box>
  );
};

export const TicketListSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <Stack spacing={1.25}>
    {Array.from({ length: rows }).map((_, i) => (
      <Box key={i} sx={{ display: "flex", gap: 1.5, p: 1.5, border: 1, borderColor: "divider", borderRadius: "14px" }}>
        <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: "30%", flexShrink: 0 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="30%" height={14} />
          <Skeleton width="75%" height={20} />
          <Skeleton width="95%" height={14} />
          <Skeleton variant="rounded" width={96} height={22} sx={{ mt: 1, borderRadius: 2 }} />
        </Box>
      </Box>
    ))}
  </Stack>
);

export const TicketsEmpty: React.FC<{
  filtered: boolean;
  /** Нет — без кнопки «Сообщить» (у роли нет support.create). */
  onReport?: () => void;
  onReset: () => void;
}> = ({ filtered, onReport, onReset }) => {
  const reduceMotion = useReducedMotion();
  return (
    <Box sx={{ textAlign: "center", py: { xs: 5, md: 8 }, px: 2 }}>
      <MotionBox
        animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        sx={(t) => ({
          width: 96,
          height: 96,
          mx: "auto",
          mb: 2.5,
          borderRadius: "32%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: t.palette.primary.main,
          background: `linear-gradient(135deg, ${alpha(t.palette.primary.main, 0.2)}, ${alpha(t.palette.primary.main, 0.05)})`,
          border: `1px solid ${alpha(t.palette.primary.main, 0.3)}`,
          boxShadow: `0 18px 40px ${alpha(t.palette.primary.main, 0.2)}`,
        })}
      >
        <RocketLaunchOutlined sx={{ fontSize: 46 }} />
      </MotionBox>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        {filtered ? "Ничего не нашли" : "Обращений пока нет"}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mx: "auto", mb: 2.5 }}>
        {filtered
          ? "Попробуйте изменить фильтры или поиск."
          : "Что-то не работает или есть идея, как сделать удобнее? Напишите — мы соберём всё нужное сами."}
      </Typography>
      {(filtered || onReport) && (
        <Button
          variant="contained"
          onClick={filtered ? onReset : onReport}
          sx={{ textTransform: "none", fontWeight: 700, borderRadius: "12px", px: 2.5 }}
        >
          {filtered ? "Сбросить фильтры" : "Сообщить о проблеме"}
        </Button>
      )}
    </Box>
  );
};

/** Невидимая «стража» внизу списка: как только появляется на экране — грузим следующую страницу. */
export const LoadMore: React.FC<{
  visible: boolean;
  loading: boolean;
  onLoad: () => void;
}> = ({ visible, loading, onLoad }) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const node = ref.current;
    if (!node || !visible || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoad();
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, onLoad]);
  if (!visible) return null;
  return (
    <Box ref={ref} sx={{ display: "flex", justifyContent: "center", py: 2 }}>
      {loading ? (
        <CircularProgress size={22} />
      ) : (
        <Button size="small" onClick={onLoad} sx={{ textTransform: "none" }}>
          Показать ещё
        </Button>
      )}
    </Box>
  );
};
