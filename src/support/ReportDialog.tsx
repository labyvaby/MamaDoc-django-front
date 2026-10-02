import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Collapse,
  Drawer,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddPhotoAlternateOutlined from "@mui/icons-material/AddPhotoAlternateOutlined";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import SupportAgentRounded from "@mui/icons-material/SupportAgentRounded";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router";

import {
  createSupportTicket,
  type CreateTicketInput,
  type SupportTicketDetail,
  type TicketCategory,
  type TicketImpact,
} from "../api/support";
import { djangoQueryKeys } from "../api/queryKeys";
import { usePermissions } from "../hooks/usePermissions";
import { clearProblem, getFrontendBuild, screenLabel } from "./diagnosticsRecorder";
import { CATEGORY_HINT, CATEGORY_LABEL, CATEGORY_TONE, IMPACT_LABEL, IMPACT_TONE, toneColors } from "./meta";
import { fileToScreenshot, SUPPORT_IGNORE_ATTR, type Screenshot } from "./screenshot";
import type { ReportSession } from "./types";
import { CATEGORY_ICON, ImageLightbox } from "./ui";

const MotionBox = motion(Box);

const CATEGORIES: TicketCategory[] = ["bug", "idea", "question"];
const IMPACTS: TicketImpact[] = ["blocked", "degraded", "minor"];

/** Подсказки полей по категории: форма «меняется» вместе с выбором. */
const FIELDS: Record<
  TicketCategory,
  { title: string; titlePh: string; body: string; bodyPh: string; extra?: string; extraPh?: string }
> = {
  bug: {
    title: "Коротко: что случилось",
    titlePh: "Например: не сохраняется приём",
    body: "Подробнее",
    bodyPh: "Что вы увидели и что должно было произойти",
    extra: "Что вы делали перед этим",
    extraPh: "Например: открыл регистратуру → нажал «Записать»",
  },
  idea: {
    title: "Что улучшить",
    titlePh: "Например: тёмная тема в кассе",
    body: "Опишите идею",
    bodyPh: "Как это должно работать, с вашими словами",
    extra: "Зачем это нужно",
    extraPh: "Какую проблему это решит и как часто она у вас возникает",
  },
  question: {
    title: "Ваш вопрос",
    titlePh: "Например: как вернуть оплату?",
    body: "Подробности",
    bodyPh: "Что вы хотели сделать и на каком шаге остановились",
  },
};

export interface ReportDialogProps {
  open: boolean;
  session: ReportSession | null;
  onClose: () => void;
}

interface FormState {
  category: TicketCategory;
  title: string;
  description: string;
  steps: string;
  expected: string;
  impact: TicketImpact;
  attachShot: boolean;
  customShot: Screenshot | null;
}

const initialForm = (session: ReportSession): FormState => ({
  category: session.category,
  title: session.auto.title,
  description: session.auto.description,
  steps: session.auto.steps,
  expected: "",
  impact: session.problem ? "degraded" : "degraded",
  // Ошибку снимок экрана сопровождает по умолчанию; пожелание и вопрос — по желанию.
  attachShot: session.category === "bug" && session.screenshot !== null,
  customShot: null,
});

const fieldSx = {
  "& .MuiOutlinedInput-root": { borderRadius: "12px" },
};

/**
 * Форма обращения: выезжает справа (на телефоне — снизу, на весь экран).
 *
 * Категория выбирается тремя карточками, и поля под ними перестраиваются.
 * Ошибка приходит заполненной (см. autoDescription), снимок экрана и
 * технические данные уже приложены — человеку остаётся проверить и отправить.
 * Технический снимок пользователю не показывается: он ничего не скажет,
 * поэтому видна одна строка «приложено автоматически».
 */
export const ReportDialog: React.FC<ReportDialogProps> = ({ open, session, onClose }) => {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const wide = useMediaQuery(theme.breakpoints.up("xl"));
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { activeOrganization } = usePermissions();

  const [form, setForm] = React.useState<FormState | null>(null);
  const [done, setDone] = React.useState<SupportTicketDetail | null>(null);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const titleRef = React.useRef<HTMLInputElement | null>(null);

  // Каждое открытие — чистая форма с новой заготовкой.
  React.useEffect(() => {
    if (open && session) {
      setForm(initialForm(session));
      setDone(null);
      setError(null);
    }
  }, [open, session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Фокус на заголовок — без прокрутки: иначе панель открывалась бы уже
  // «съехавшей» вниз и верх формы (категории) прятался под шапку.
  React.useEffect(() => {
    if (!open || !session) return;
    const timer = window.setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 380);
    return () => window.clearTimeout(timer);
  }, [open, session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: (input: CreateTicketInput) => createSupportTicket(input, activeOrganization?.id ?? null),
    onSuccess: (detail) => {
      setDone(detail);
      clearProblem();
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.support.all });
    },
    onError: (err: Error) => setError(err.message || "Не удалось отправить обращение."),
  });

  if (!session || !form) {
    return (
      <Drawer open={false} onClose={onClose} anchor="right">
        <span />
      </Drawer>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const shot = form.customShot ?? session.screenshot;
  const tone = toneColors(theme, CATEGORY_TONE[form.category]);
  const copy = FIELDS[form.category];
  const autoFilled = form.category === "bug" && Boolean(session.auto.title);
  const titleError = !form.title.trim();
  const bodyError = form.category !== "bug" && !form.description.trim();
  const canSubmit = !titleError && !bodyError && !mutation.isPending;

  const switchCategory = (category: TicketCategory) => {
    setForm((prev) => {
      if (!prev) return prev;
      const next: FormState = { ...prev, category };
      // Пожелание и вопрос не наследуют заготовку ошибки — она про сбой.
      if (category !== "bug" && prev.category === "bug" && prev.title === session.auto.title) {
        next.title = "";
        next.description = "";
        next.steps = "";
      }
      if (category === "bug" && prev.category !== "bug" && !prev.title && !prev.description) {
        next.title = session.auto.title;
        next.description = session.auto.description;
        next.steps = session.auto.steps;
      }
      next.attachShot = category === "bug" ? shot !== null : prev.attachShot && shot !== null;
      return next;
    });
  };

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    const bug = form.category === "bug";
    mutation.mutate({
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      steps: bug ? form.steps.trim() : "",
      expected: bug ? "" : form.expected.trim(),
      impact: bug ? form.impact : "",
      pagePath: session.route,
      screenshot: form.attachShot && shot ? shot.dataUrl : null,
      diagnostics: bug ? session.diagnostics : null,
      appVersion: getFrontendBuild(),
      userAgent: navigator.userAgent,
      screen: screenLabel(),
    });
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const converted = await fileToScreenshot(file);
    if (!converted) {
      setError("Не удалось прочитать файл. Подойдёт изображение PNG, JPEG или WebP.");
      return;
    }
    setError(null);
    setForm((prev) => (prev ? { ...prev, customShot: converted, attachShot: true } : prev));
  };

  const width = phone ? "100%" : wide ? 680 : 560;

  return (
    <>
      <Drawer
        anchor={phone ? "bottom" : "right"}
        open={open}
        onClose={mutation.isPending ? undefined : onClose}
        // Атрибут исключает всю панель (вместе с затемнением) из снимков экрана.
        slotProps={{ root: { [SUPPORT_IGNORE_ATTR]: "" } as object }}
        PaperProps={{
          sx: {
            width,
            height: phone ? "94dvh" : "100%",
            maxHeight: "100dvh",
            borderRadius: phone ? "20px 20px 0 0" : "20px 0 0 20px",
            backgroundImage: "none",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          },
        }}
      >
        {/* ── Шапка ─────────────────────────────────────────────── */}
        <Box
          sx={{
            position: "relative",
            // overflow: hidden делает шапку сжимаемой во flex-колонке — без
            // flexShrink: 0 длинная форма наезжала бы на неё.
            flexShrink: 0,
            px: { xs: 2, md: 3 },
            pt: { xs: 2, md: 2.5 },
            pb: 2,
            overflow: "hidden",
            background: `linear-gradient(135deg, ${alpha(tone.main, 0.2)} 0%, ${alpha(tone.main, 0.04)} 70%)`,
            transition: "background .4s ease",
          }}
        >
          {!reduceMotion && (
            <MotionBox
              aria-hidden
              animate={{ x: [0, 18, 0], y: [0, -10, 0] }}
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
              sx={{
                position: "absolute",
                right: -40,
                top: -50,
                width: 180,
                height: 180,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${alpha(tone.main, 0.3)}, transparent 68%)`,
                pointerEvents: "none",
              }}
            />
          )}
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ position: "relative" }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: "30%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                background: `linear-gradient(135deg, ${tone.main}, ${alpha(tone.main, 0.7)})`,
                boxShadow: `0 8px 20px ${alpha(tone.main, 0.4)}`,
              }}
            >
              <SupportAgentRounded />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Сообщить разработчикам
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Мы сами приложим всё нужное — вам остаётся написать пару слов.
              </Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Закрыть" disabled={mutation.isPending}>
              <CloseRounded />
            </IconButton>
          </Stack>
        </Box>

        {/* ── Тело ──────────────────────────────────────────────── */}
        <Box sx={{ flex: 1, overflowY: "auto", px: { xs: 2, md: 3 }, py: 2 }}>
          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <SuccessView
                key="done"
                detail={done}
                onClose={onClose}
                onOpen={() => {
                  onClose();
                  navigate(`/support?ticket=${done.ticket.id}`);
                }}
              />
            ) : (
              <MotionBox
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -8 }}
              >
                {/* Категории */}
                <LayoutGroup id="support-report-category">
                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, mb: 2.5 }}>
                    {CATEGORIES.map((category) => {
                      const selected = category === form.category;
                      const c = toneColors(theme, CATEGORY_TONE[category]);
                      const Icon = CATEGORY_ICON[category];
                      return (
                        <ButtonBase
                          key={category}
                          onClick={() => switchCategory(category)}
                          aria-pressed={selected}
                          sx={{
                            position: "relative",
                            flexDirection: "column",
                            gap: 0.5,
                            px: 1,
                            py: 1.5,
                            borderRadius: "14px",
                            border: 1,
                            borderColor: selected ? c.border : "divider",
                            color: selected ? c.text : "text.secondary",
                            transition: "color .2s ease, border-color .2s ease, transform .15s ease",
                            "&:hover": { transform: "translateY(-1px)", borderColor: c.border },
                            "&:active": { transform: "scale(0.97)" },
                          }}
                        >
                          {selected && (
                            <MotionBox
                              layoutId="category-bg"
                              transition={{ type: "spring", stiffness: 420, damping: 34 }}
                              sx={{
                                position: "absolute",
                                inset: 0,
                                borderRadius: "14px",
                                background: `linear-gradient(160deg, ${c.soft}, ${c.softer})`,
                              }}
                            />
                          )}
                          <Icon sx={{ position: "relative", fontSize: 26 }} />
                          <Typography
                            variant="body2"
                            sx={{ position: "relative", fontWeight: 700, lineHeight: 1.15, fontSize: "0.82rem" }}
                          >
                            {CATEGORY_LABEL[category]}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              position: "relative",
                              display: { xs: "none", sm: "block" },
                              lineHeight: 1.2,
                              textAlign: "center",
                              opacity: 0.85,
                            }}
                          >
                            {CATEGORY_HINT[category]}
                          </Typography>
                        </ButtonBase>
                      );
                    })}
                  </Box>
                </LayoutGroup>

                <Collapse in={autoFilled} unmountOnExit>
                  <Chip
                    icon={<AutoAwesomeRounded />}
                    label="Заполнено автоматически — проверьте и поправьте, если нужно"
                    size="small"
                    sx={{
                      mb: 1.5,
                      height: "auto",
                      py: 0.5,
                      "& .MuiChip-label": { whiteSpace: "normal" },
                      color: tone.text,
                      bgcolor: tone.soft,
                      "& .MuiChip-icon": { color: tone.text },
                    }}
                  />
                </Collapse>

                {/* Поля — перестраиваются по категории */}
                <AnimatePresence mode="popLayout" initial={false}>
                  <MotionBox
                    key={form.category}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Stack spacing={2}>
                      <TextField
                        label={copy.title}
                        placeholder={copy.titlePh}
                        value={form.title}
                        onChange={(e) => set("title", e.target.value)}
                        error={titleError && Boolean(error)}
                        slotProps={{ htmlInput: { maxLength: 200 } }}
                        fullWidth
                        inputRef={titleRef}
                        sx={fieldSx}
                      />
                      <TextField
                        label={copy.body}
                        placeholder={copy.bodyPh}
                        value={form.description}
                        onChange={(e) => set("description", e.target.value)}
                        error={bodyError && Boolean(error)}
                        multiline
                        minRows={form.category === "question" ? 4 : 3}
                        maxRows={10}
                        slotProps={{ htmlInput: { maxLength: 8000 } }}
                        fullWidth
                        sx={fieldSx}
                      />
                      {form.category === "bug" && (
                        <>
                          <TextField
                            label={copy.extra}
                            placeholder={copy.extraPh}
                            value={form.steps}
                            onChange={(e) => set("steps", e.target.value)}
                            multiline
                            minRows={2}
                            maxRows={6}
                            slotProps={{ htmlInput: { maxLength: 8000 } }}
                            fullWidth
                            sx={fieldSx}
                          />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                              Насколько это мешает работать?
                            </Typography>
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                              {IMPACTS.map((impact) => {
                                const c = toneColors(theme, IMPACT_TONE[impact]);
                                const selected = form.impact === impact;
                                return (
                                  <ButtonBase
                                    key={impact}
                                    onClick={() => set("impact", impact)}
                                    aria-pressed={selected}
                                    sx={{
                                      px: 1.5,
                                      py: 0.75,
                                      borderRadius: "999px",
                                      border: 1,
                                      borderColor: selected ? c.border : "divider",
                                      bgcolor: selected ? c.soft : "transparent",
                                      color: selected ? c.text : "text.secondary",
                                      fontSize: "0.82rem",
                                      fontWeight: selected ? 700 : 500,
                                      transition: "all .18s ease",
                                      "&:hover": { borderColor: c.border },
                                    }}
                                  >
                                    {IMPACT_LABEL[impact]}
                                  </ButtonBase>
                                );
                              })}
                            </Stack>
                          </Box>
                        </>
                      )}
                      {copy.extra && form.category !== "bug" && (
                        <TextField
                          label={copy.extra}
                          placeholder={copy.extraPh}
                          value={form.expected}
                          onChange={(e) => set("expected", e.target.value)}
                          multiline
                          minRows={2}
                          maxRows={6}
                          slotProps={{ htmlInput: { maxLength: 8000 } }}
                          fullWidth
                          sx={fieldSx}
                        />
                      )}
                    </Stack>
                  </MotionBox>
                </AnimatePresence>

                {/* Приложения */}
                <Box
                  sx={{
                    mt: 2.5,
                    p: 1.5,
                    borderRadius: "14px",
                    border: 1,
                    borderColor: "divider",
                    bgcolor: (t) => alpha(t.palette.text.primary, t.palette.mode === "dark" ? 0.04 : 0.02),
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                    {form.category === "bug" ? "Приложено автоматически" : "Приложения"}
                  </Typography>

                  <Stack spacing={1.25}>
                    {form.category === "bug" && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <CheckBadge />
                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                          Технические данные — страница, последние действия и ошибки
                        </Typography>
                        <Tooltip title="Без ваших паролей, значений полей и содержимого карточек. Их видят только разработчики.">
                          <ShieldOutlined fontSize="small" sx={{ color: "text.disabled" }} />
                        </Tooltip>
                      </Stack>
                    )}

                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      {shot ? (
                        <ButtonBase
                          onClick={() => setLightbox(shot.dataUrl)}
                          aria-label="Посмотреть снимок экрана"
                          sx={{
                            width: { xs: 96, sm: 132 },
                            flexShrink: 0,
                            borderRadius: "10px",
                            overflow: "hidden",
                            border: 1,
                            borderColor: "divider",
                            opacity: form.attachShot ? 1 : 0.4,
                            filter: form.attachShot ? "none" : "grayscale(1)",
                            transition: "opacity .25s ease, filter .25s ease",
                          }}
                        >
                          <Box component="img" src={shot.dataUrl} alt="Снимок экрана" sx={{ width: "100%", display: "block" }} />
                        </ButtonBase>
                      ) : (
                        <Box
                          sx={{
                            width: { xs: 96, sm: 132 },
                            height: 76,
                            flexShrink: 0,
                            borderRadius: "10px",
                            border: 1,
                            borderStyle: "dashed",
                            borderColor: "divider",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "text.disabled",
                            textAlign: "center",
                            px: 0.5,
                          }}
                        >
                          <Typography variant="caption">Снимок не получился</Typography>
                        </Box>
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Снимок экрана
                          </Typography>
                          <Switch
                            size="small"
                            checked={form.attachShot && shot !== null}
                            disabled={shot === null}
                            onChange={(e) => set("attachShot", e.target.checked)}
                            inputProps={{ "aria-label": "Приложить снимок экрана" }}
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.35 }}>
                          На снимке могут быть данные клиентов. Его увидите только вы и разработчики.
                        </Typography>
                        <Button
                          size="small"
                          startIcon={<AddPhotoAlternateOutlined />}
                          onClick={() => fileRef.current?.click()}
                          sx={{ mt: 0.5, ml: -0.75, textTransform: "none" }}
                        >
                          {shot ? "Заменить своим файлом" : "Приложить свой файл"}
                        </Button>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          hidden
                          onChange={(e) => {
                            void pickFile(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </Box>
                    </Stack>
                  </Stack>
                </Box>

                <Collapse in={Boolean(error)}>
                  <Alert severity="error" sx={{ mt: 2, borderRadius: "12px" }}>
                    {error}
                  </Alert>
                </Collapse>
              </MotionBox>
            )}
          </AnimatePresence>
        </Box>

        {/* ── Подвал ────────────────────────────────────────────── */}
        {!done && (
          <Box
            sx={{
              flexShrink: 0,
              px: { xs: 2, md: 3 },
              py: 1.5,
              borderTop: 1,
              borderColor: "divider",
              display: "flex",
              gap: 1.5,
              justifyContent: "flex-end",
              pb: "calc(12px + env(safe-area-inset-bottom))",
              bgcolor: "background.paper",
            }}
          >
            <Button onClick={onClose} disabled={mutation.isPending} sx={{ textTransform: "none" }}>
              Отмена
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                if (!canSubmit) {
                  setError(
                    titleError
                      ? "Напишите хотя бы коротко, о чём обращение."
                      : "Опишите подробнее — так мы быстрее поймём.",
                  );
                  return;
                }
                submit();
              }}
              disabled={mutation.isPending}
              endIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: "12px",
                px: 2.5,
                background: `linear-gradient(135deg, ${tone.main}, ${alpha(tone.main, 0.78)})`,
                boxShadow: `0 8px 20px ${alpha(tone.main, 0.35)}`,
                "&:hover": { boxShadow: `0 10px 26px ${alpha(tone.main, 0.5)}` },
              }}
            >
              {mutation.isPending ? "Отправляем…" : "Отправить"}
            </Button>
          </Box>
        )}
      </Drawer>
      <ImageLightbox src={lightbox} open={lightbox !== null} onClose={() => setLightbox(null)} />
    </>
  );
};

const CheckBadge: React.FC = () => (
  <Box
    sx={{
      width: 22,
      height: 22,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      bgcolor: (t) => alpha(t.palette.success.main, 0.18),
      color: "success.main",
      flexShrink: 0,
    }}
  >
    <CheckRounded sx={{ fontSize: 15 }} />
  </Box>
);

/** Финальный экран: нарисованная галочка, номер обращения и разлетающиеся искры. */
const SuccessView: React.FC<{
  detail: SupportTicketDetail;
  onClose: () => void;
  onOpen: () => void;
}> = ({ detail, onClose, onOpen }) => {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const green = theme.palette.success.main;
  const sparks = Array.from({ length: 14 }, (_, i) => i);
  return (
    <MotionBox
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      sx={{ textAlign: "center", py: { xs: 4, md: 6 }, px: 1 }}
    >
      <Box sx={{ position: "relative", width: 104, height: 104, mx: "auto", mb: 3 }}>
        {!reduceMotion &&
          sparks.map((i) => {
            const angle = (i / sparks.length) * Math.PI * 2;
            return (
              <MotionBox
                key={i}
                aria-hidden
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={{ opacity: 0, x: Math.cos(angle) * 86, y: Math.sin(angle) * 86, scale: 0.3 }}
                transition={{ duration: 0.9, delay: 0.25, ease: "easeOut" }}
                sx={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: i % 2 ? 8 : 6,
                  height: i % 2 ? 8 : 6,
                  ml: -0.5,
                  mt: -0.5,
                  borderRadius: "50%",
                  bgcolor: i % 3 === 0 ? theme.palette.warning.main : i % 3 === 1 ? green : theme.palette.info.main,
                }}
              />
            );
          })}
        <MotionBox
          initial={{ scale: 0.3, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(135deg, ${green}, ${alpha(green, 0.7)})`,
            boxShadow: `0 14px 34px ${alpha(green, 0.45)}`,
          }}
        >
          <svg width="54" height="54" viewBox="0 0 54 54" fill="none" aria-hidden>
            <motion.path
              d="M13 28l10 10 19-22"
              stroke="#fff"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
            />
          </svg>
        </MotionBox>
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
        Спасибо, мы всё получили
      </Typography>
      <Typography
        variant="h6"
        sx={{ fontWeight: 700, mb: 1.5, color: "primary.onSurface", letterSpacing: 0.5 }}
      >
        {detail.ticket.number}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mx: "auto", mb: 3 }}>
        Ответ появится в разделе «Поддержка». Когда разработчики ответят, на пункте меню загорится отметка.
      </Typography>
      <Stack direction="row" spacing={1.5} justifyContent="center">
        <Button onClick={onClose} sx={{ textTransform: "none" }}>
          Закрыть
        </Button>
        <Button variant="contained" onClick={onOpen} sx={{ textTransform: "none", borderRadius: "12px" }}>
          Открыть обращение
        </Button>
      </Stack>
    </MotionBox>
  );
};

export default ReportDialog;
