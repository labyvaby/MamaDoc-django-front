import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
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

import {
  getRateContext,
  postMapClick,
  postRate,
  type MapPlatform,
  type RateContext,
} from "../../api/reviews";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";
import { canSubmit, initialForm, tagOptions, toSubmit, type RateForm } from "./rateForm";

const MAP_LABELS: Record<MapPlatform, string> = {
  "2gis": "2ГИС",
  yandex: "Яндекс Картах",
  google: "Google Maps",
};

const Shell: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Box
    sx={{
      minHeight: "100dvh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      p: 2,
      bgcolor: "background.default",
    }}
  >
    <Paper
      variant="outlined"
      sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: "14px", width: "100%", maxWidth: 460 }}
    >
      {children}
    </Paper>
  </Box>
);

const Stars: React.FC<{
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  large?: boolean;
}> = ({ label, value, onChange, large = false }) => (
  <Stack spacing={0.5} alignItems="center">
    <Typography variant={large ? "subtitle1" : "body2"} fontWeight={600} textAlign="center">
      {label}
    </Typography>
    <Rating
      value={value}
      onChange={(_, v) => onChange(v)}
      icon={<StarRounded fontSize="inherit" />}
      emptyIcon={<StarBorderRounded fontSize="inherit" />}
      sx={{ fontSize: large ? 48 : 34 }}
    />
  </Stack>
);

type Screen = "loading" | "missing" | "failed" | "form" | "done";

const PublicRatePage: React.FC = () => {
  const { t } = useT("reviews");
  const { token = "" } = useParams<{ token: string }>();
  const [ctx, setCtx] = React.useState<RateContext | null>(null);
  const [form, setForm] = React.useState<RateForm | null>(null);
  const [screen, setScreen] = React.useState<Screen>("loading");
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const ctrl = new AbortController();
    getRateContext(token, ctrl.signal)
      .then((data) => {
        setCtx(data);
        setForm(initialForm(data));
        setScreen(data.answered ? "done" : "form");
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof ApiError && e.status === 404) {
          setScreen("missing");
          return;
        }
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
        setScreen("failed");
      });
    return () => ctrl.abort();
  }, [token]);

  const set = <K extends keyof RateForm>(key: K, value: RateForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const submit = async () => {
    if (!ctx || !form || !canSubmit(form)) return;
    setSaving(true);
    setError(null);
    try {
      const next = await postRate(token, toSubmit(ctx, form));
      setCtx(next);
      setForm(initialForm(next));
      setEditing(false);
      setScreen("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSaving(false);
    }
  };

  const openMap = (platform: MapPlatform, url: string) => {
    postMapClick(token, platform).catch(() => undefined);
    window.open(url, "_blank", "noopener");
  };

  if (screen === "loading") {
    return (
      <Shell>
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      </Shell>
    );
  }
  if (screen === "missing") {
    return (
      <Shell>
        <Alert severity="info">Ссылка недействительна или устарела.</Alert>
      </Shell>
    );
  }
  if (screen === "failed" || !ctx || !form) {
    return (
      <Shell>
        <Alert severity="error">{error ?? "Ошибка загрузки"}</Alert>
      </Shell>
    );
  }

  if (screen === "done" && !editing) {
    const happy = ctx.rating === 5;
    return (
      <Shell>
        <Stack spacing={2} alignItems="center" textAlign="center">
          <Typography variant="h6" fontWeight={700}>
            Спасибо за отзыв!
          </Typography>
          <Typography color="text.secondary">
            {happy
              ? ctx.maps.length > 0
                ? "Нам очень приятно. Будем рады, если вы поделитесь впечатлением на картах:"
                : "Нам очень приятно. Ждём вас снова!"
              : "Нам жаль, что не всё прошло хорошо. Мы обязательно разберёмся."}
          </Typography>
          {ctx.maps.map((m) => (
            <Button
              key={m.platform}
              fullWidth
              size="large"
              variant="contained"
              endIcon={<OpenInNewRounded />}
              onClick={() => openMap(m.platform, m.url)}
            >
              Оставить отзыв в {MAP_LABELS[m.platform]}
            </Button>
          ))}
          {ctx.canEdit && (
            <Button variant="text" onClick={() => setEditing(true)}>
              Изменить ответ
            </Button>
          )}
        </Stack>
      </Shell>
    );
  }

  if (!ctx.canEdit) {
    return (
      <Shell>
        <Alert severity="info">Срок ответа по этой ссылке истёк.</Alert>
      </Shell>
    );
  }

  const options = tagOptions(ctx, form.rating);
  const low = form.rating != null && form.rating < 5;
  return (
    <Shell>
      <Stack spacing={2.5}>
        <Box textAlign="center">
          <Typography variant="h6" fontWeight={700}>
            {t("public.rateYourVisit")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {ctx.clinicName}
          </Typography>
        </Box>
        <Stars label="Общая оценка" value={form.rating} onChange={(v) => set("rating", v)} large />
        {ctx.hasDoctor && (
          <Stars
            label={ctx.doctorName ? `${t("public.doctorLabel")} ${ctx.doctorName}` : t("public.doctorLabel")}
            value={form.doctorRating}
            onChange={(v) => set("doctorRating", v)}
          />
        )}
        <Stars
          label={t("public.registryLabel")}
          value={form.registryRating}
          onChange={(v) => set("registryRating", v)}
        />
        {options.length > 0 && (
          <Box>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              {low ? t("public.wrongLabel") : t("public.likedLabel")}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {options.map((tag) => {
                const on = form.tags.includes(tag);
                return (
                  <Chip
                    key={tag}
                    label={tag}
                    clickable
                    color={on ? "primary" : "default"}
                    variant={on ? "filled" : "outlined"}
                    onClick={() =>
                      set("tags", on ? form.tags.filter((x) => x !== tag) : [...form.tags, tag])
                    }
                  />
                );
              })}
            </Stack>
          </Box>
        )}
        {form.rating != null && (
          <TextField
            multiline
            minRows={3}
            fullWidth
            value={form.comment}
            onChange={(e) => set("comment", e.target.value)}
            label={low ? "Что было не так?" : "Комментарий (необязательно)"}
            inputProps={{ maxLength: 2000 }}
          />
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Button
          size="large"
          variant="contained"
          disabled={!canSubmit(form) || saving}
          onClick={submit}
        >
          {saving ? <CircularProgress size={22} color="inherit" /> : "Отправить"}
        </Button>
      </Stack>
    </Shell>
  );
};

export default PublicRatePage;
