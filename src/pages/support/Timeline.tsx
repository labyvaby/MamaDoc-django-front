import React from "react";
import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import AutorenewRounded from "@mui/icons-material/AutorenewRounded";
import BlockRounded from "@mui/icons-material/BlockRounded";
import FiberNewRounded from "@mui/icons-material/FiberNewRounded";
import LockOutlined from "@mui/icons-material/LockOutlined";
import SupportAgentRounded from "@mui/icons-material/SupportAgentRounded";
import { motion, useReducedMotion } from "framer-motion";

import type { SupportComment, SupportEvent } from "../../api/support";
import { formatDateTime, STATUS_LABEL, STATUS_TONE, toneColors } from "../../support/meta";

const MotionBox = motion(Box);

type Item =
  | { kind: "comment"; at: number; comment: SupportComment }
  | { kind: "event"; at: number; event: SupportEvent };

const time = (iso: string) => new Date(iso).getTime();

/** Собирает переписку и историю в одну ленту по времени. */
function merge(comments: SupportComment[], events: SupportEvent[]): Item[] {
  const items: Item[] = [
    ...comments.map((comment): Item => ({ kind: "comment", at: time(comment.createdAt), comment })),
    ...events.map((event): Item => ({ kind: "event", at: time(event.createdAt), event })),
  ];
  // При равном времени событие раньше комментария: «статус сменён» → «вот почему».
  return items.sort((a, b) => a.at - b.at || (a.kind === "event" ? -1 : 1));
}

function describeEvent(event: SupportEvent): { text: string; icon: React.ReactElement } {
  const to = event.toStatus ? STATUS_LABEL[event.toStatus] : "";
  switch (event.kind) {
    case "created":
      return { text: `${event.actorName} создал(а) обращение`, icon: <FiberNewRounded /> };
    case "voided":
      return { text: `Обращение аннулировано · ${event.actorName}`, icon: <BlockRounded /> };
    case "reopened":
      return { text: `${event.actorName}: «Не помогло» — возвращено в работу`, icon: <AutorenewRounded /> };
    default:
      return { text: `Статус: ${to}`, icon: <ArrowForwardRounded /> };
  }
}

const EventRow: React.FC<{ event: SupportEvent; index: number }> = ({ event, index }) => {
  const reduceMotion = useReducedMotion();
  const { text, icon } = describeEvent(event);
  const tone = event.toStatus ? STATUS_TONE[event.toStatus] : "neutral";
  // Причину показываем только там, где её нет отдельным комментарием.
  const showReason = event.reason && (event.kind === "voided" || event.kind === "reopened");
  return (
    <MotionBox
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      sx={{ display: "flex", flexDirection: "column", alignItems: "center", my: 1.25, px: 1 }}
    >
      <Box
        sx={(t) => {
          const c = toneColors(t, tone);
          return {
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.25,
            py: 0.4,
            borderRadius: "999px",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: c.text,
            bgcolor: c.soft,
            border: `1px solid ${c.border}`,
            "& svg": { fontSize: 15 },
          };
        }}
      >
        {icon}
        {text}
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25 }}>
        {formatDateTime(event.createdAt)}
      </Typography>
      {showReason && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, maxWidth: 420, textAlign: "center" }}>
          «{event.reason}»
        </Typography>
      )}
    </MotionBox>
  );
};

const CommentBubble: React.FC<{ comment: SupportComment; index: number }> = ({ comment, index }) => {
  const reduceMotion = useReducedMotion();
  const mine = comment.mine;
  const internal = comment.internal;
  return (
    <MotionBox
      initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      sx={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", my: 1 }}
    >
      <Box sx={{ maxWidth: { xs: "92%", md: "82%" }, minWidth: 0 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            mb: 0.4,
            justifyContent: mine ? "flex-end" : "flex-start",
            color: "text.secondary",
          }}
        >
          {comment.isSupport && !internal && (
            <SupportAgentRounded sx={{ fontSize: 16, color: "primary.main" }} />
          )}
          {internal && <LockOutlined sx={{ fontSize: 15, color: "warning.main" }} />}
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {mine ? "Вы" : comment.authorName}
            {internal ? " · внутренняя заметка" : ""}
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {formatDateTime(comment.createdAt)}
          </Typography>
        </Box>
        <Box
          sx={(t) => {
            const dark = t.palette.mode === "dark";
            if (internal) {
              return {
                px: 1.75,
                py: 1.1,
                borderRadius: "14px",
                border: `1px dashed ${alpha(t.palette.warning.main, 0.6)}`,
                bgcolor: alpha(t.palette.warning.main, dark ? 0.12 : 0.08),
              };
            }
            if (mine) {
              return {
                px: 1.75,
                py: 1.1,
                borderRadius: "16px 16px 4px 16px",
                color: t.palette.primary.contrastText,
                background: `linear-gradient(135deg, ${t.palette.primary.main}, ${alpha(t.palette.primary.main, 0.82)})`,
                boxShadow: `0 6px 16px ${alpha(t.palette.primary.main, 0.25)}`,
              };
            }
            return {
              px: 1.75,
              py: 1.1,
              borderRadius: "16px 16px 16px 4px",
              border: `1px solid ${t.palette.divider}`,
              bgcolor: comment.isSupport
                ? alpha(t.palette.primary.main, dark ? 0.12 : 0.06)
                : alpha(t.palette.text.primary, dark ? 0.06 : 0.03),
            };
          }}
        >
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>
            {comment.body}
          </Typography>
        </Box>
      </Box>
    </MotionBox>
  );
};

export interface TimelineProps {
  comments: SupportComment[];
  events: SupportEvent[];
}

/**
 * Лента обращения: история статусов и переписка. Ответ разработчика у автора
 * всегда подписан «Поддержка MamaDoc» — настоящее имя видят только
 * разработчики. Внутренние заметки приходят только им и выделены пунктиром.
 */
export const Timeline: React.FC<TimelineProps> = ({ comments, events }) => {
  const items = React.useMemo(() => merge(comments, events), [comments, events]);
  return (
    <Box sx={{ position: "relative" }}>
      {items.map((item, index) =>
        item.kind === "event" ? (
          <EventRow key={`e${item.event.id}`} event={item.event} index={index} />
        ) : (
          <CommentBubble key={`c${item.comment.id}`} comment={item.comment} index={index} />
        ),
      )}
    </Box>
  );
};

export default Timeline;
