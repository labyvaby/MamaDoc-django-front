import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddPhotoAlternateOutlined from "@mui/icons-material/AddPhotoAlternateOutlined";
import BlockRounded from "@mui/icons-material/BlockRounded";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import CloseRounded from "@mui/icons-material/CloseRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import ForkRightRounded from "@mui/icons-material/ForkRightRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import TerminalRounded from "@mui/icons-material/TerminalRounded";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import {
  addSupportComment,
  changeSupportStatus,
  getSupportTicket,
  markSupportTicketRead,
  reopenSupportTicket,
  uploadSupportAttachment,
  voidSupportTicket,
  type SupportTicketDetail,
  type TicketStatus,
} from "../../api/support";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useSupportSummary } from "../../support/useSupport";
import { ReasonDialog } from "../../components/ui/ReasonDialog";
import {
  CATEGORY_LABEL,
  formatBytes,
  formatDateTime,
  STAFF_STATUS_FLOW,
  STATUS_HINT,
  STATUS_LABEL,
  STATUS_NEEDS_COMMENT,
  STATUS_TONE,
  toneColors,
} from "../../support/meta";
import { AttachmentThumb, CategoryBubble, ImageLightbox, ImpactPill, StatusPill } from "../../support/ui";
import DiagnosticsView from "./DiagnosticsView";
import Timeline from "./Timeline";

const MotionBox = motion(Box);

type PendingStatus = { status: TicketStatus; comment: string } | null;

export interface TicketDetailProps {
  ticketId: number;
  /** Показать крестик закрытия (в панели-выдвижке). */
  onClose?: () => void;
}

const Section: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <Box sx={{ mb: 2 }}>
    <Typography
      variant="caption"
      sx={{ display: "block", mb: 0.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "text.secondary" }}
    >
      {title}
    </Typography>
    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>
      {children}
    </Typography>
  </Box>
);

/**
 * Обращение целиком: текст, снимок экрана, переписка и действия.
 *
 * Автору доступны: комментарий, «Не помогло» (после «Решена», 14 дней),
 * аннулирование (пока заявка не в работе) и приложить изображение.
 * Разработчику — смена статуса, внутренние заметки и технические данные.
 * Удалить обращение нельзя никому.
 */
export const TicketDetail: React.FC<TicketDetailProps> = ({ ticketId, onClose }) => {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [text, setText] = React.useState("");
  const [internal, setInternal] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [techOpen, setTechOpen] = React.useState(false);
  const [dialog, setDialog] = React.useState<"void" | "reopen" | null>(null);
  const [pending, setPending] = React.useState<PendingStatus>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const detailKey = djangoQueryKeys.support.detail(ticketId);
  const query = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) => getSupportTicket(ticketId, signal),
    refetchInterval: 30_000,
  });
  const detail = query.data;
  // «Разработчик» определяет бэкенд (сводка), а не статус обращения: у аннулированного
  // canChangeStatus ложно, но технические данные разработчику всё равно нужны.
  const isStaff = useSupportSummary().data?.isStaff ?? false;

  // Сменили обращение — композитор и диалоги чистые.
  React.useEffect(() => {
    setText("");
    setInternal(false);
    setTechOpen(false);
    setDialog(null);
    setPending(null);
    setActionError(null);
  }, [ticketId]);

  const refreshLists = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [...djangoQueryKeys.support.all, "list"] });
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.support.summary });
  }, [queryClient]);

  const accept = React.useCallback(
    (next: SupportTicketDetail) => {
      queryClient.setQueryData(detailKey, next);
      setActionError(null);
      refreshLists();
    },
    [queryClient, detailKey, refreshLists],
  );
  const fail = (err: Error) => setActionError(err.message || "Не удалось выполнить действие.");

  // Автор открыл обращение с новым ответом — снимаем отметку и бейдж.
  const readMutation = useMutation({ mutationFn: () => markSupportTicketRead(ticketId), onSuccess: refreshLists });
  const markRead = readMutation.mutate;
  React.useEffect(() => {
    if (detail?.ticket.mine && detail.ticket.unread) markRead();
  }, [detail?.ticket.mine, detail?.ticket.unread, markRead]);

  // Новое сообщение — прокрутить ленту вниз.
  const messageCount = (detail?.comments.length ?? 0) + (detail?.events.length ?? 0);
  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [messageCount, reduceMotion]);

  const commentMutation = useMutation({
    mutationFn: (body: { text: string; internal: boolean }) => addSupportComment(ticketId, body.text, body.internal),
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: detailKey });
      refreshLists();
    },
    onError: fail,
  });
  const statusMutation = useMutation({
    mutationFn: (input: { status: TicketStatus; comment: string }) =>
      changeSupportStatus(ticketId, input.status, input.comment),
    onSuccess: (next) => {
      setText("");
      setPending(null);
      accept(next);
    },
    onError: fail,
  });
  const voidMutation = useMutation({
    mutationFn: (reason: string) => voidSupportTicket(ticketId, reason),
    onSuccess: (next) => {
      setDialog(null);
      accept(next);
    },
    onError: (err: Error) => {
      setDialog(null);
      fail(err);
    },
  });
  const reopenMutation = useMutation({
    mutationFn: (comment: string) => reopenSupportTicket(ticketId, comment),
    onSuccess: (next) => {
      setDialog(null);
      accept(next);
    },
    onError: (err: Error) => {
      setDialog(null);
      fail(err);
    },
  });
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadSupportAttachment(ticketId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey });
      refreshLists();
    },
    onError: fail,
  });

  if (query.isLoading) {
    return (
      <Box sx={{ p: 2.5 }}>
        <Skeleton variant="rounded" height={56} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="text" width="60%" height={32} />
        <Skeleton variant="rounded" height={120} sx={{ borderRadius: 2, my: 2 }} />
        <Skeleton variant="rounded" height={90} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }
  if (query.isError || !detail) {
    return (
      <Box sx={{ p: 2.5 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void query.refetch()}>
              Повторить
            </Button>
          }
        >
          Не удалось открыть обращение. Возможно, оно недоступно в вашем филиале.
        </Alert>
      </Box>
    );
  }

  const { ticket } = detail;
  const author = ticket.mine;
  const busy =
    commentMutation.isPending ||
    statusMutation.isPending ||
    voidMutation.isPending ||
    reopenMutation.isPending ||
    uploadMutation.isPending;

  const sendComment = () => {
    const body = text.trim();
    if (!body || busy) return;
    commentMutation.mutate({ text: body, internal: isStaff && internal });
  };

  const requestStatus = (status: TicketStatus) => {
    if (status === ticket.status || busy) return;
    if (STATUS_NEEDS_COMMENT.includes(status)) {
      // Для отклонения и уточнения автору нужно объяснение — просим его в диалоге.
      setPending({ status, comment: text.trim() });
      return;
    }
    statusMutation.mutate({ status, comment: text.trim() });
  };

  const hint = author || !isStaff ? STATUS_HINT[ticket.status] : null;
  const screenshots = detail.attachments.filter((a) => a.kind === "screenshot");
  const files = detail.attachments.filter((a) => a.kind === "file");
  const place = [ticket.organizationName, ticket.branchName].filter(Boolean).join(" · ");

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* ── Шапка ─────────────────────────────────────────────── */}
      <Box
        sx={(t) => {
          const c = toneColors(t, STATUS_TONE[ticket.status]);
          return {
            position: "relative",
            px: { xs: 2, md: 2.5 },
            py: 1.75,
            borderBottom: 1,
            borderColor: "divider",
            background: `linear-gradient(135deg, ${c.softer}, transparent 65%)`,
            flexShrink: 0,
          };
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <CategoryBubble category={ticket.category} size={44} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 800, letterSpacing: 0.8, fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}
              >
                {ticket.number}
              </Typography>
              <StatusPill status={ticket.status} />
              {ticket.impact && <ImpactPill impact={ticket.impact} />}
              {ticket.reopenCount > 0 && (
                <Chip size="small" icon={<ReplayRounded />} label={`возвращено ${ticket.reopenCount}`} sx={{ height: 22 }} />
              )}
            </Stack>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.25, wordBreak: "break-word" }}>
              {ticket.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {CATEGORY_LABEL[ticket.category]} · {ticket.authorName}
              {ticket.authorRole ? ` (${ticket.authorRole})` : ""} · {formatDateTime(ticket.createdAt)}
            </Typography>
            {(isStaff || detail.ticket.organizationName) && place && (
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5, color: "text.secondary" }}>
                <BusinessOutlined sx={{ fontSize: 14 }} />
                <Typography variant="caption">{place}</Typography>
                {ticket.pagePath && (
                  <>
                    <ForkRightRounded sx={{ fontSize: 14, ml: 1 }} />
                    <Typography variant="caption" sx={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>
                      {ticket.pagePath}
                    </Typography>
                  </>
                )}
              </Stack>
            )}
          </Box>
          {onClose && (
            <IconButton onClick={onClose} aria-label="Закрыть" edge="end">
              <CloseRounded />
            </IconButton>
          )}
        </Stack>
      </Box>

      {/* ── Лента ─────────────────────────────────────────────── */}
      <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 2, md: 2.5 }, py: 2 }}>
        {hint && (
          <MotionBox
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            sx={(t) => {
              const c = toneColors(t, STATUS_TONE[ticket.status]);
              return {
                mb: 2,
                px: 1.75,
                py: 1.1,
                borderRadius: "12px",
                color: c.text,
                bgcolor: c.soft,
                border: `1px solid ${c.border}`,
              };
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {hint}
            </Typography>
          </MotionBox>
        )}

        {detail.description && <Section title={ticket.category === "bug" ? "Что случилось" : "Описание"}>{detail.description}</Section>}
        {detail.steps && <Section title="Что делали">{detail.steps}</Section>}
        {detail.expected && <Section title={ticket.category === "idea" ? "Зачем это нужно" : "Что ожидали"}>{detail.expected}</Section>}

        {(screenshots.length > 0 || files.length > 0 || detail.canAttach) && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ display: "block", mb: 0.75, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "text.secondary" }}
            >
              Снимки и файлы
            </Typography>
            <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" alignItems="flex-start">
              {[...screenshots, ...files].map((attachment) => (
                <Box key={attachment.id} sx={{ width: { xs: "100%", sm: "auto" } }}>
                  <AttachmentThumb
                    attachmentId={attachment.id}
                    label={attachment.kind === "screenshot" ? "Снимок экрана" : attachment.name}
                    onOpen={setLightbox}
                  />
                  <Typography variant="caption" color="text.disabled">
                    {attachment.kind === "screenshot" ? "Снимок экрана" : attachment.name} · {formatBytes(attachment.size)}
                  </Typography>
                </Box>
              ))}
              {detail.canAttach && (
                <>
                  <ButtonBase
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadMutation.isPending}
                    sx={{
                      width: { xs: "100%", sm: 120 },
                      height: 96,
                      flexDirection: "column",
                      gap: 0.5,
                      borderRadius: 2,
                      border: 1,
                      borderStyle: "dashed",
                      borderColor: "divider",
                      color: "text.secondary",
                      transition: "border-color .2s, color .2s, background-color .2s",
                      "&:hover": { borderColor: "primary.main", color: "primary.main", bgcolor: (t) => alpha(t.palette.primary.main, 0.05) },
                    }}
                  >
                    {uploadMutation.isPending ? <CircularProgress size={20} /> : <AddPhotoAlternateOutlined />}
                    <Typography variant="caption">Добавить изображение</Typography>
                  </ButtonBase>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadMutation.mutate(file);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
            </Stack>
          </Box>
        )}

        {/* Для разработчиков: технические данные */}
        {isStaff && (
          <Box
            sx={{
              mb: 2,
              borderRadius: "14px",
              border: 1,
              borderColor: "divider",
              overflow: "hidden",
              bgcolor: (t) => alpha(t.palette.text.primary, t.palette.mode === "dark" ? 0.04 : 0.02),
            }}
          >
            <ButtonBase
              onClick={() => setTechOpen((open) => !open)}
              sx={{ width: "100%", justifyContent: "space-between", px: 1.5, py: 1.1, textAlign: "left" }}
            >
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <TerminalRounded fontSize="small" color="action" />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Для разработчиков
                </Typography>
                {detail.similarCount ? (
                  <Chip
                    size="small"
                    color="warning"
                    label={`ещё ${detail.similarCount} с такой же ошибкой`}
                    sx={{ height: 22, fontWeight: 600 }}
                  />
                ) : null}
                {!detail.hasDiagnostics && <Chip size="small" label="без технических данных" sx={{ height: 22 }} />}
              </Stack>
              <ExpandMoreRounded
                sx={{ transition: "transform .2s ease", transform: techOpen ? "rotate(180deg)" : "none", color: "text.secondary" }}
              />
            </ButtonBase>
            <Collapse in={techOpen} unmountOnExit>
              <Box sx={{ px: 1.5, pb: 1.5 }}>
                {detail.hasDiagnostics ? <DiagnosticsView ticketId={ticketId} /> : <Alert severity="info">Снимок не приложен.</Alert>}
              </Box>
            </Collapse>
          </Box>
        )}

        <Timeline comments={detail.comments} events={detail.events} />
      </Box>

      {/* ── Действия и ответ ──────────────────────────────────── */}
      <Box
        sx={{
          flexShrink: 0,
          borderTop: 1,
          borderColor: "divider",
          px: { xs: 1.5, md: 2.5 },
          pt: 1.25,
          pb: "calc(10px + env(safe-area-inset-bottom))",
          bgcolor: "background.paper",
        }}
      >
        <Collapse in={Boolean(actionError)}>
          <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 1, borderRadius: "10px" }}>
            {actionError}
          </Alert>
        </Collapse>

        {isStaff && (
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
            {STAFF_STATUS_FLOW.filter((status) => status !== "planned" || ticket.category === "idea").map((status) => {
              const selected = status === ticket.status;
              return (
                <ButtonBase
                  key={status}
                  onClick={() => requestStatus(status)}
                  disabled={busy || selected}
                  sx={(t) => {
                    const c = toneColors(t, STATUS_TONE[status]);
                    return {
                      px: 1.25,
                      py: 0.5,
                      borderRadius: "999px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      border: `1px solid ${selected ? c.border : t.palette.divider}`,
                      color: selected ? c.text : t.palette.text.secondary,
                      bgcolor: selected ? c.soft : "transparent",
                      transition: "all .15s ease",
                      "&:hover": { borderColor: c.border, color: c.text },
                      "&.Mui-disabled": { opacity: selected ? 1 : 0.5 },
                    };
                  }}
                >
                  {STATUS_LABEL[status]}
                </ButtonBase>
              );
            })}
            <Tooltip title="Удалить нельзя — только аннулировать, запись останется в истории">
              <span>
                <ButtonBase
                  onClick={() => setDialog("void")}
                  disabled={busy || ticket.status === "voided"}
                  sx={{
                    px: 1.25,
                    py: 0.5,
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    border: 1,
                    borderColor: "divider",
                    color: "text.secondary",
                    "&:hover": { borderColor: "error.main", color: "error.main" },
                  }}
                >
                  Аннулировать
                </ButtonBase>
              </span>
            </Tooltip>
          </Stack>
        )}

        {!isStaff && (detail.canReopen || detail.canVoid) && (
          <Stack direction="row" spacing={1} sx={{ mb: 1 }} useFlexGap flexWrap="wrap">
            {detail.canReopen && (
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={<ReplayRounded />}
                onClick={() => setDialog("reopen")}
                disabled={busy}
                sx={{ textTransform: "none", borderRadius: "10px" }}
              >
                Не помогло
              </Button>
            )}
            {detail.canVoid && (
              <Button
                size="small"
                color="inherit"
                startIcon={<BlockRounded />}
                onClick={() => setDialog("void")}
                disabled={busy}
                sx={{ textTransform: "none", borderRadius: "10px", color: "text.secondary" }}
              >
                Аннулировать
              </Button>
            )}
          </Stack>
        )}

        {detail.canComment ? (
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                isStaff && internal
                  ? "Внутренняя заметка — автор её не увидит"
                  : isStaff
                    ? "Ответ автору (подпись: «Поддержка MamaDoc»)"
                    : "Написать в поддержку…"
              }
              multiline
              minRows={1}
              maxRows={5}
              fullWidth
              size="small"
              slotProps={{ htmlInput: { maxLength: 5000 } }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  sendComment();
                }
              }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "14px",
                  ...(isStaff && internal ? { bgcolor: (t) => alpha(t.palette.warning.main, 0.08) } : {}),
                },
              }}
            />
            <Tooltip title="Отправить (Ctrl+Enter)">
              <span>
                <IconButton
                  onClick={sendComment}
                  disabled={!text.trim() || busy}
                  aria-label="Отправить"
                  sx={{
                    width: 40,
                    height: 40,
                    color: "primary.contrastText",
                    bgcolor: "primary.main",
                    "&:hover": { bgcolor: "primary.dark", transform: "scale(1.06)" },
                    "&.Mui-disabled": { bgcolor: "action.disabledBackground" },
                    transition: "transform .15s ease",
                  }}
                >
                  {commentMutation.isPending ? <CircularProgress size={18} color="inherit" /> : <SendRounded fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Обращение аннулировано — переписка закрыта.
          </Typography>
        )}

        <AnimatePresence initial={false}>
          {isStaff && detail.canComment && (
            <MotionBox
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              sx={{ overflow: "hidden" }}
            >
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
                <Switch size="small" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                <Typography variant="caption" color="text.secondary">
                  Внутренняя заметка (видна только разработчикам)
                </Typography>
              </Stack>
            </MotionBox>
          )}
        </AnimatePresence>
      </Box>

      <ReasonDialog
        open={dialog === "void"}
        title="Аннулировать обращение"
        description="Обращение останется в истории — удалить его нельзя. Укажите, почему оно больше не нужно."
        label="Причина"
        confirmText="Аннулировать"
        loading={voidMutation.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => voidMutation.mutate(reason)}
      />
      <ReasonDialog
        open={dialog === "reopen"}
        title="Не помогло"
        description="Расскажите, что осталось не так. Обращение вернётся разработчикам в работу."
        label="Что не помогло"
        confirmText="Вернуть в работу"
        loading={reopenMutation.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={(comment) => reopenMutation.mutate(comment)}
      />
      <ReasonDialog
        open={pending !== null}
        title={pending ? `Статус: ${STATUS_LABEL[pending.status]}` : ""}
        description="Сообщение увидит автор обращения. Подпись — «Поддержка MamaDoc»."
        label={pending?.status === "needs_info" ? "Что нужно уточнить" : "Почему отклонено"}
        confirmText="Сменить статус"
        loading={statusMutation.isPending}
        onCancel={() => setPending(null)}
        onConfirm={(comment) => pending && statusMutation.mutate({ status: pending.status, comment })}
      />
      <ImageLightbox src={lightbox} open={lightbox !== null} onClose={() => setLightbox(null)} />
    </Box>
  );
};

export default TicketDetail;
