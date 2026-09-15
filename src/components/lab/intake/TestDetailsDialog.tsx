import React from "react";
import {
  Alert,
  Chip,
  Dialog,
  Divider,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { getLabTestCard, type LabTestCard } from "../../../api/lab";
import { formatKGS } from "../../../utility/format";

interface Props {
  /** Анализ, который открыли; `null` — диалог закрыт. */
  testId: number | null;
  onClose: () => void;
}

function money(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <Stack direction="row" justifyContent="space-between" gap={2}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" sx={{ textAlign: "right" }}>
      {children}
    </Typography>
  </Stack>
);

const Block: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <Stack spacing={0.5}>
    <Typography variant="body2" color="text.secondary" fontWeight={500}>
      {title}
    </Typography>
    <Typography variant="body2">{children}</Typography>
  </Stack>
);

/**
 * Подробности одного анализа.
 *
 * Список каталога отдаёт только название и цену — показания, подготовка и
 * вопросы живут в карточке (`GET /lab/tests/<id>/`) и грузятся, когда анализ
 * открывают. Регистратору это нужно ровно в двух случаях: пациент спрашивает
 * «а что это», и надо отличить два похожих названия друг от друга — оба раза
 * по одному анализу, а не по всему каталогу сразу.
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

  return (
    <Dialog
      open={testId != null}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: fullScreen ? {} : { borderRadius: "12px" } }}
    >
      <Stack sx={{ minHeight: 0 }}>
        <Stack
          direction="row"
          alignItems="flex-start"
          spacing={1}
          sx={{ pl: 2, pr: 1, py: 1.5 }}
        >
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
            {card?.title ?? "Анализ"}
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Закрыть">
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>

        <Divider />

        <Stack spacing={2} sx={{ p: 2, overflowY: "auto" }}>
          {loading && (
            <Stack spacing={1}>
              <Skeleton variant="text" />
              <Skeleton variant="text" width="70%" />
              <Skeleton variant="rounded" height={64} />
            </Stack>
          )}

          {failed && (
            <Alert severity="warning">
              Не удалось загрузить карточку анализа. Попробуйте ещё раз.
            </Alert>
          )}

          {card && (
            <>
              <Stack direction="row" gap={0.75} flexWrap="wrap">
                {card.biomaterial && (
                  <Chip size="small" variant="outlined" label={card.biomaterial} />
                )}
                {card.requiresDoctor && (
                  <Chip size="small" color="warning" variant="outlined" label="Нужно направление врача" />
                )}
                {card.questions.length > 0 && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Вопросы при приёме: ${card.questions.length}`}
                  />
                )}
              </Stack>

              <Stack spacing={0.75}>
                <Row label="Цена">{formatKGS(money(card.priceStandard))}</Row>
                {money(card.priceExpress) > 0 && (
                  <Row label="Экспресс">{formatKGS(money(card.priceExpress))}</Row>
                )}
                <Row label="Срок">
                  {card.requiredDay > 0
                    ? `${card.requiredDay} дн.`
                    : "в день сдачи"}
                </Row>
              </Stack>

              {(card.indications || card.notice || card.preparation) && <Divider />}

              {card.indications && (
                <Block title="Показания">{card.indications}</Block>
              )}
              {card.notice && <Block title="Примечание">{card.notice}</Block>}
              {card.preparation?.text && (
                <Block title="Подготовка пациента">{card.preparation.text}</Block>
              )}

              {card.questions.length > 0 && (
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    О чём спросят при приёме
                  </Typography>
                  <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2.5 }}>
                    {card.questions.map((question) => (
                      <Typography
                        key={question.id}
                        component="li"
                        variant="body2"
                      >
                        {question.title}
                      </Typography>
                    ))}
                  </Stack>
                </Stack>
              )}
            </>
          )}
        </Stack>
      </Stack>
    </Dialog>
  );
};

export default TestDetailsDialog;
