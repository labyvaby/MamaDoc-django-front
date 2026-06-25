import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Rating,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import StarRounded from "@mui/icons-material/StarRounded";
import StarBorderRounded from "@mui/icons-material/StarBorderRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import { useParams } from "react-router";

import { getRateContext, postRate, type RateContext } from "../../api/reviews";
import { ApiError } from "../../api/client";

const Shell: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Box
    sx={{
      minHeight: "100dvh",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      p: 2,
      bgcolor: "background.default",
    }}
  >
    <Paper
      elevation={3}
      sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3, width: "100%", maxWidth: 440 }}
    >
      {children}
    </Paper>
  </Box>
);

const PublicRatePage: React.FC = () => {
  const { token = "" } = useParams<{ token: string }>();

  const [ctx, setCtx] = React.useState<RateContext | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    getRateContext(token, controller.signal)
      .then((data) => {
        if (!cancelled) setCtx(data);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token]);

  const submitRating = async (value: number) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const next = await postRate(token, { rating: value });
      setCtx(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить оценку");
    } finally {
      setSubmitting(false);
    }
  };

  const submitComment = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const next = await postRate(token, { comment: comment.trim() });
      setCtx(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить комментарий");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render states ──
  if (loading) {
    return (
      <Shell>
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress />
        </Stack>
      </Shell>
    );
  }

  if (notFound) {
    return (
      <Shell>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          Ссылка недействительна
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Возможно, отзыв уже оставлен или срок действия ссылки истёк.
        </Typography>
      </Shell>
    );
  }

  if (!ctx) {
    return (
      <Shell>
        <Alert severity="error">{error ?? "Ошибка загрузки"}</Alert>
      </Shell>
    );
  }

  const header = (
    <Box sx={{ textAlign: "center", mb: 3 }}>
      <Typography variant="h6" fontWeight={800}>
        {ctx.clinicName}
      </Typography>
      {ctx.doctorName && (
        <Typography variant="body2" color="text.secondary">
          Приём: {ctx.doctorName}
        </Typography>
      )}
    </Box>
  );

  // Завершено / промоутер → благодарность (+ кнопка 2ГИС).
  if (ctx.completed) {
    return (
      <Shell>
        {header}
        <Box sx={{ textAlign: "center" }}>
          {ctx.rating != null && (
            <Rating value={ctx.rating} readOnly size="large" sx={{ mb: 2 }} />
          )}
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Спасибо за отзыв!
          </Typography>
          {ctx.redirectTo2Gis && ctx.gisUrl && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Будем благодарны, если поделитесь оценкой на 2ГИС.
              </Typography>
              <Button
                variant="contained"
                size="large"
                href={ctx.gisUrl}
                target="_blank"
                rel="noopener noreferrer"
                endIcon={<OpenInNewRounded />}
              >
                Оставить отзыв на 2ГИС
              </Button>
            </>
          )}
        </Box>
      </Shell>
    );
  }

  // Шаг 2 — комментарий (оценка ниже порога).
  if (ctx.needComment) {
    return (
      <Shell>
        {header}
        <Box sx={{ textAlign: "center", mb: 2 }}>
          {ctx.rating != null && (
            <Rating value={ctx.rating} readOnly size="large" sx={{ mb: 1 }} />
          )}
          <Typography variant="subtitle1" fontWeight={700}>
            Что мы могли бы улучшить?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Ваш отзыв поможет нам стать лучше.
          </Typography>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          fullWidth
          multiline
          minRows={4}
          placeholder="Расскажите, что пошло не так..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={submitting}
          sx={{ mb: 2 }}
        />
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={submitComment}
          disabled={submitting || !comment.trim()}
          startIcon={submitting ? <CircularProgress size={18} /> : undefined}
        >
          Отправить
        </Button>
      </Shell>
    );
  }

  // Шаг 1 — оценка звёздами.
  return (
    <Shell>
      {header}
      <Box sx={{ textAlign: "center" }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Оцените ваш визит
        </Typography>
        {error && (
          <Alert severity="error" sx={{ my: 2 }}>
            {error}
          </Alert>
        )}
        <Rating
          size="large"
          value={ctx.rating ?? null}
          disabled={submitting}
          onChange={(_, value) => value && submitRating(value)}
          icon={<StarRounded fontSize="inherit" />}
          emptyIcon={<StarBorderRounded fontSize="inherit" />}
          sx={{ fontSize: "3rem", mt: 1 }}
        />
        {submitting && (
          <Box sx={{ mt: 2 }}>
            <CircularProgress size={22} />
          </Box>
        )}
      </Box>
    </Shell>
  );
};

export default PublicRatePage;
