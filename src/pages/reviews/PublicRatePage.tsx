import React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import StarRounded from "@mui/icons-material/StarRounded";
import FavoriteRounded from "@mui/icons-material/FavoriteRounded";
import HandshakeRounded from "@mui/icons-material/HandshakeRounded";
import LinkOffRounded from "@mui/icons-material/LinkOffRounded";
import ScheduleRounded from "@mui/icons-material/ScheduleRounded";
import LockOutlined from "@mui/icons-material/LockOutlined";
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
import {
  canSubmit,
  initialForm,
  tagOptions,
  toSubmit,
  type RateForm,
} from "./rateForm";
import {
  CARD,
  CLAY,
  LINE,
  MUTED,
  PAPER,
  TEAL,
  rateTheme,
  useRateFonts,
} from "./public/theme";
import {
  Card,
  Display,
  Eyebrow,
  MapCard,
  Medallion,
  RatingRow,
  Reveal,
  SectionTitle,
  Shell,
  StarPicker,
  TagPill,
} from "./public/ui";

type Screen = "loading" | "missing" | "failed" | "form" | "done";

/** Короткий экран-сообщение: медаль, заголовок, текст. */
const Notice: React.FC<{
  icon: React.ReactNode;
  title: string;
  text?: string;
  tone?: "happy" | "calm" | "quiet";
}> = ({ icon, title, text, tone = "quiet" }) => (
  <Shell>
    <Stack
      spacing={2.5}
      alignItems="center"
      textAlign="center"
      sx={{ my: "auto", py: 6 }}
    >
      <Medallion tone={tone} icon={icon} />
      <Reveal order={2}>
        <Display size={28} center>
          {title}
        </Display>
      </Reveal>
      {text && (
        <Reveal order={3}>
          <Typography sx={{ color: MUTED, fontSize: 16, maxWidth: 340 }}>
            {text}
          </Typography>
        </Reveal>
      )}
    </Stack>
  </Shell>
);

const PublicRatePage: React.FC = () => {
  useRateFonts();
  return (
    <ThemeProvider theme={rateTheme}>
      <RateFlow />
    </ThemeProvider>
  );
};

const RateFlow: React.FC = () => {
  const { t } = useT("reviews");
  const { token = "" } = useParams<{ token: string }>();
  const [ctx, setCtx] = React.useState<RateContext | null>(null);
  const [form, setForm] = React.useState<RateForm | null>(null);
  const [screen, setScreen] = React.useState<Screen>("loading");
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [opened, setOpened] = React.useState<MapPlatform[]>([]);

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
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSaving(false);
    }
  };

  const openMap = (platform: MapPlatform, url: string) => {
    // Окно открываем синхронно по нажатию — иначе iOS его заблокирует.
    window.open(url, "_blank", "noopener");
    setOpened((list) => (list.includes(platform) ? list : [...list, platform]));
    postMapClick(token, platform).catch(() => undefined);
  };

  if (screen === "loading") {
    return (
      <Shell>
        <Box sx={{ my: "auto", display: "flex", justifyContent: "center" }}>
          <CircularProgress sx={{ color: TEAL }} />
        </Box>
      </Shell>
    );
  }
  if (screen === "missing") {
    return (
      <Notice
        icon={<LinkOffRounded />}
        title="Ссылка не найдена"
        text="Возможно, она устарела или в ней опечатка. Попросите прислать новую ссылку."
      />
    );
  }
  if (screen === "failed" || !ctx || !form) {
    return (
      <Notice
        icon={<LinkOffRounded />}
        title="Не получилось открыть"
        text={error ?? "Проверьте интернет и обновите страницу."}
      />
    );
  }

  const editLink = ctx.canEdit && (
    <Button
      variant="text"
      onClick={() => setEditing(true)}
      sx={{ color: TEAL, fontSize: 15 }}
    >
      Изменить ответ
    </Button>
  );

  if (screen === "done" && !editing) {
    const happy = ctx.rating === 5;
    if (happy) {
      return (
        <Shell>
          <Stack spacing={2.5} textAlign="center" sx={{ my: "auto", py: 4 }}>
            <Medallion tone="happy" icon={<StarRounded />} />
            <Reveal order={2}>
              <Display size={30} center>
                Спасибо, это очень приятно!
              </Display>
            </Reveal>
            <Reveal order={3}>
              <Typography sx={{ color: MUTED, fontSize: 16 }}>
                {ctx.maps.length > 0
                  ? "Расскажите о нас на картах — одна минута, а другим проще сделать выбор."
                  : "Будем рады видеть вас снова."}
              </Typography>
            </Reveal>
            {ctx.maps.length > 0 && (
              <Stack spacing={1.25} sx={{ pt: 1 }}>
                {ctx.maps.map((m, i) => (
                  <Reveal key={m.platform} order={4 + i}>
                    <MapCard
                      platform={m.platform}
                      opened={opened.includes(m.platform)}
                      onOpen={() => openMap(m.platform, m.url)}
                    />
                  </Reveal>
                ))}
              </Stack>
            )}
            <Reveal order={8}>{editLink}</Reveal>
          </Stack>
        </Shell>
      );
    }
    return (
      <Shell>
        <Stack
          spacing={2.5}
          alignItems="center"
          textAlign="center"
          sx={{ my: "auto", py: 4 }}
        >
          <Medallion tone="calm" icon={<HandshakeRounded />} />
          <Reveal order={2}>
            <Display size={30} center>
              Спасибо, что рассказали
            </Display>
          </Reveal>
          <Reveal order={3}>
            <Typography sx={{ color: MUTED, fontSize: 16, maxWidth: 360 }}>
              Нам жаль, что не всё прошло хорошо. Ответ уже у нас — мы
              разберёмся.
            </Typography>
          </Reveal>
          <Reveal order={4}>
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              sx={{ color: MUTED }}
            >
              <LockOutlined sx={{ fontSize: 16 }} />
              <Typography sx={{ fontSize: 13 }}>
                Ваш ответ не публикуется
              </Typography>
            </Stack>
          </Reveal>
          <Reveal order={5}>{editLink}</Reveal>
        </Stack>
      </Shell>
    );
  }

  if (!ctx.canEdit) {
    return (
      <Notice
        icon={<ScheduleRounded />}
        title="Срок ответа истёк"
        text="По этой ссылке ответить уже нельзя. Спасибо, что заглянули!"
      />
    );
  }

  const options = tagOptions(ctx, form.rating);
  const picked = form.rating != null;
  const tone = form.rating === 5 ? "good" : "bad";
  const tagsTitle =
    form.rating === 5
      ? t("public.likedLabel")
      : form.rating === 4
      ? t("public.improveLabel")
      : t("public.wrongLabel");
  const ready = canSubmit(form);

  const stickyBar = (
    <Box
      sx={{
        position: "sticky",
        bottom: 0,
        zIndex: 2,
        px: 2.5,
        pt: 3,
        pb: "calc(16px + env(safe-area-inset-bottom))",
        background: `linear-gradient(to top, ${PAPER} 62%, rgba(245,239,230,0))`,
      }}
    >
      <Box sx={{ maxWidth: 440, mx: "auto" }}>
        {error && (
          <Typography
            role="alert"
            sx={{ color: CLAY, fontSize: 14, mb: 1, textAlign: "center" }}
          >
            {error}
          </Typography>
        )}
        <Button
          fullWidth
          size="large"
          variant="contained"
          disabled={!ready || saving}
          onClick={submit}
          sx={{
            py: 1.6,
            fontSize: 17,
            boxShadow: ready ? "0 14px 28px -14px rgba(30,91,85,0.9)" : "none",
            "&.Mui-disabled": { bgcolor: "#E7DFD2", color: "#9A9186" },
          }}
        >
          {saving ? (
            <CircularProgress size={24} color="inherit" />
          ) : ready ? (
            editing ? (
              "Сохранить"
            ) : (
              "Отправить"
            )
          ) : (
            "Сначала поставьте оценку"
          )}
        </Button>
      </Box>
    </Box>
  );

  return (
    <Shell footer={stickyBar}>
      <Reveal>
        <Eyebrow>{ctx.clinicName}</Eyebrow>
      </Reveal>
      <Reveal order={1}>
        <Box sx={{ mt: 1.5 }}>
          <Display>{t("public.howWasVisit")}</Display>
        </Box>
      </Reveal>
      <Reveal order={2}>
        <Box sx={{ mt: 3.5 }}>
          <StarPicker
            label="Общая оценка"
            value={form.rating}
            onChange={(v) => set("rating", v)}
            size={52}
            showWord
          />
        </Box>
      </Reveal>

      {picked && (
        <Stack spacing={3.5} sx={{ mt: 4 }}>
          <Reveal>
            <Card>
              {ctx.hasDoctor && (
                <>
                  <RatingRow
                    title={t("public.doctorShort")}
                    caption={ctx.doctorName}
                    value={form.doctorRating}
                    onChange={(v) => set("doctorRating", v)}
                  />
                  <Divider sx={{ borderColor: LINE }} />
                </>
              )}
              <RatingRow
                title={t("public.registryLabel")}
                value={form.registryRating}
                onChange={(v) => set("registryRating", v)}
              />
            </Card>
          </Reveal>

          {options.length > 0 && (
            <Reveal order={1}>
              <SectionTitle>{tagsTitle}</SectionTitle>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {options.map((tag) => {
                  const on = form.tags.includes(tag);
                  return (
                    <TagPill
                      key={tag}
                      label={tag}
                      on={on}
                      tone={tone}
                      onToggle={() =>
                        set(
                          "tags",
                          on
                            ? form.tags.filter((x) => x !== tag)
                            : [...form.tags, tag]
                        )
                      }
                    />
                  );
                })}
              </Stack>
            </Reveal>
          )}

          <Reveal order={2}>
            <TextField
              multiline
              minRows={3}
              fullWidth
              value={form.comment}
              onChange={(e) => set("comment", e.target.value)}
              placeholder={
                form.rating === 5
                  ? "Пара слов от вас — по желанию"
                  : "Расскажите, что случилось"
              }
              inputProps={{ maxLength: 2000, "aria-label": "Комментарий" }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: CARD,
                  borderRadius: "18px",
                  fontSize: 16,
                  "& fieldset": { borderColor: LINE },
                },
              }}
            />
            {form.rating !== 5 && (
              <Stack
                direction="row"
                spacing={0.75}
                alignItems="center"
                sx={{ mt: 1, color: MUTED }}
              >
                <LockOutlined sx={{ fontSize: 15 }} />
                <Typography sx={{ fontSize: 13 }}>
                  Ответ не публикуется — его прочитают только сотрудники
                </Typography>
              </Stack>
            )}
          </Reveal>
        </Stack>
      )}

      {!picked && (
        <Reveal order={3}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mt: 5, color: MUTED }}
          >
            <FavoriteRounded sx={{ fontSize: 16, color: "#D98F7A" }} />
            <Typography sx={{ fontSize: 14 }}>
              Это займёт меньше минуты
            </Typography>
          </Stack>
        </Reveal>
      )}
    </Shell>
  );
};

export default PublicRatePage;
