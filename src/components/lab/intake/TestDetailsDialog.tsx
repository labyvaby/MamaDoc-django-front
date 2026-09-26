import React from "react";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  Divider,
  IconButton,
  Skeleton,
  Stack,
  Typography,
  alpha,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import HelpOutlineOutlined from "@mui/icons-material/HelpOutlineOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import NoFoodOutlined from "@mui/icons-material/NoFoodOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";

import { getLabTestCard, type LabTestCard } from "../../../api/lab";
import { formatKGS } from "../../../utility/format";
import { InfoTile } from "../../ui";
import { subtleBg } from "../../../theme/uiHelpers";
import { parseNotice, splitLisBullets } from "./labTestCardText";

interface Props {
  /** Анализ, который открыли; `null` — диалог закрыт. */
  testId: number | null;
  onClose: () => void;
}

function money(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Секция карточки с заметным заголовком: значок в тонированной плашке (как
 * у InfoTile) и жирное название. Регистратор ищет глазами нужный раздел — «подготовка»
 * или «показания», — заголовки должны читаться поверх плотного текста ЛИС.
 */
const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <Stack spacing={1.25}>
    <Stack direction="row" alignItems="center" gap={1.25}>
      <Box
        sx={(t) => ({
          width: 32,
          height: 32,
          borderRadius: "10px",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          color: "primary.onSurface",
          bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
          "& .MuiSvgIcon-root": { fontSize: 18 },
        })}
      >
        {icon}
      </Box>
      <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
        {title}
      </Typography>
    </Stack>
    <Box sx={{ pl: { xs: 0, sm: 5.5 } }}>{children}</Box>
  </Stack>
);

/** Текст ЛИС: список, если он там был склеен через « - », иначе абзац. */
const LisText: React.FC<{ text: string }> = ({ text }) => {
  const items = splitLisBullets(text);
  if (items.length < 2) {
    return (
      <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
        {items[0] ?? ""}
      </Typography>
    );
  }
  return (
    <Stack
      component="ul"
      spacing={0.5}
      sx={(t) => ({
        m: 0,
        pl: 2.25,
        "& li::marker": { color: t.palette.primary.main },
      })}
    >
      {items.map((item) => (
        <Typography key={item} component="li" variant="body2" sx={{ lineHeight: 1.6 }}>
          {item}
        </Typography>
      ))}
    </Stack>
  );
};

/**
 * Подробности одного анализа.
 *
 * Список каталога отдаёт только название и цену — показания, подготовка и
 * вопросы живут в карточке (`GET /lab/tests/<id>/`) и грузятся, когда анализ
 * открывают. Регистратору это нужно ровно в двух случаях: пациент спрашивает
 * «а что это», и надо отличить два похожих названия друг от друга — оба раза
 * по одному анализу, а не по всему каталогу сразу.
 *
 * Тексты ЛИС приходят простынёй: показания — пункты через « - »,
 * примечание — «Код: 1.2 Ежедн. *Гемоглобин (HGB), …». Здесь они
 * раскладываются в список и в набор плашек (`labTestCardText.ts`).
 */
const TestDetailsDialog: React.FC<Props> = ({ testId, onClose }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [card, setCard] = React.useState<LabTestCard | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (testId == null) return;
    const controller = new AbortController();
    setCard(null);
    setFailed(false);
    setLoading(true);
    getLabTestCard(testId, controller.signal)
      .then((data) => setCard(data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [testId]);

  const notice = card?.notice ? parseNotice(card.notice) : null;

  return (
    <Dialog
      open={testId != null}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth={false}
      PaperProps={{
        sx: fullScreen ? {} : { borderRadius: "14px", maxWidth: 760 },
      }}
    >
      <Stack sx={{ minHeight: 0 }}>
        <Stack
          direction="row"
          alignItems="flex-start"
          spacing={1}
          sx={{ pl: 3, pr: 1.5, pt: 2, pb: 1.5 }}
        >
          <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.25 }}>
              {card?.title ?? "Анализ"}
            </Typography>
            {card && (
              <Stack direction="row" gap={0.75} flexWrap="wrap">
                {card.biomaterial && (
                  <Chip size="small" variant="outlined" label={card.biomaterial} />
                )}
                {card.requiresDoctor && (
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    label="Нужно направление врача"
                  />
                )}
                {card.questions.length > 0 && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Вопросы при приёме: ${card.questions.length}`}
                  />
                )}
              </Stack>
            )}
          </Stack>
          <IconButton size="small" onClick={onClose} aria-label="Закрыть">
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>

        <Divider />

        <Stack spacing={3} sx={{ px: 3, py: 2.5, overflowY: "auto" }}>
          {loading && (
            <Stack spacing={1}>
              <Skeleton variant="rounded" height={64} />
              <Skeleton variant="text" />
              <Skeleton variant="text" width="70%" />
              <Skeleton variant="rounded" height={96} />
            </Stack>
          )}

          {failed && (
            <Alert severity="warning">
              Не удалось загрузить карточку анализа. Попробуйте ещё раз.
            </Alert>
          )}

          {card && (
            <>
              {/* Плитки фактов — InfoTile из общего набора (гайд §5.2):
                  то, что спрашивают первым, до показаний и подготовки. */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
                  gap: 1.25,
                }}
              >
                <InfoTile
                  icon={<PaymentsOutlined />}
                  label="Цена"
                  value={formatKGS(money(card.priceStandard))}
                />
                <InfoTile
                  icon={<BoltOutlined />}
                  label="Экспресс"
                  value={
                    money(card.priceExpress) > 0
                      ? formatKGS(money(card.priceExpress))
                      : "Не делается"
                  }
                  active={money(card.priceExpress) > 0}
                />
                <InfoTile
                  icon={<ScheduleOutlined />}
                  label="Срок готовности"
                  value={card.requiredDay > 0 ? `${card.requiredDay} дн.` : "В день сдачи"}
                />
              </Box>

              {card.indications && (
                <Section icon={<FactCheckOutlined />} title="Показания">
                  <LisText text={card.indications} />
                </Section>
              )}

              {notice && notice.analytes.length > 0 && (
                <Section icon={<ScienceOutlined />} title="Состав исследования">
                  <Stack spacing={1}>
                    {notice.meta && (
                      <Typography variant="caption" color="text.secondary">
                        {notice.meta}
                      </Typography>
                    )}
                    <Stack direction="row" gap={0.75} flexWrap="wrap">
                      {notice.analytes.map((item) => (
                        <Chip
                          key={item}
                          size="small"
                          label={item}
                          sx={(t) => ({
                            bgcolor: subtleBg(t, true),
                            border: 1,
                            borderColor: "divider",
                            color: "text.primary",
                            fontWeight: 500,
                          })}
                        />
                      ))}
                    </Stack>
                  </Stack>
                </Section>
              )}

              {notice && notice.rest && (
                <Section icon={<InfoOutlined />} title="Примечание">
                  <LisText text={notice.rest} />
                </Section>
              )}

              {card.preparation?.text && (
                <Section icon={<NoFoodOutlined />} title="Подготовка пациента">
                  <LisText text={card.preparation.text} />
                </Section>
              )}

              {card.questions.length > 0 && (
                <Section icon={<HelpOutlineOutlined />} title="О чём спросят при приёме">
                  <Stack
                    component="ul"
                    spacing={0.5}
                    sx={(t) => ({ m: 0, pl: 2.25, "& li::marker": { color: t.palette.primary.main } })}
                  >
                    {card.questions.map((question) => (
                      <Typography
                        key={question.id}
                        component="li"
                        variant="body2"
                        sx={{ lineHeight: 1.6 }}
                      >
                        {question.title}
                      </Typography>
                    ))}
                  </Stack>
                </Section>
              )}
            </>
          )}
        </Stack>
      </Stack>
    </Dialog>
  );
};

export default TestDetailsDialog;
