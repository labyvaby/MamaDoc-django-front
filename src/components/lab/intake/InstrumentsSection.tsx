import React from "react";
import {
  Box,
  Chip,
  Collapse,
  Divider,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import type { LabInstrument } from "../../../api/lab";
import { formatKGS } from "../../../utility/format";
import { tubeAppearance, type TubeAppearance } from "../../../utility/labTubes";
import IntakeSection from "./IntakeSection";

type Props = {
  instruments: LabInstrument[];
  loading: boolean;
  chargeTubes: boolean;
};

function money(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Значок пробирки: крышка сверху, стекло снизу, оба в цвете каталога.
 *
 * Рисуется разметкой, а не иконочным шрифтом: нужен ровно один силуэт, зато
 * в произвольном цвете, а цветов у крышек десяток.
 */
const TubeGlyph: React.FC<{ look: TubeAppearance }> = ({ look }) => (
  <Box
    aria-hidden
    sx={{
      width: 22,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
    }}
  >
    <Box
      sx={{
        height: 10,
        borderRadius: "3px 3px 1px 1px",
        bgcolor: look.cap,
      }}
    />
    <Box
      sx={{
        height: 26,
        borderRadius: "1px 1px 10px 10px",
        bgcolor: look.body,
        border: 1,
        borderColor: look.cap,
        borderTop: 0,
        opacity: 0.9,
      }}
    />
  </Box>
);

/**
 * Одна пробирка набора.
 *
 * Порядок чтения выстроен под стол забора: сначала цвет крышки и сколько
 * штук, потом под какие анализы, и только потом — длинная инструкция ЛИС.
 * Инструкция свёрнута не для красоты: у трёх пробирок это три абзаца
 * сплошного текста, из-за которых состав набора уезжает за экран, а именно
 * состав нужен каждый раз, тогда как инструкция — когда пробирка незнакомая.
 */
const TubeCard: React.FC<{ item: LabInstrument; chargeTubes: boolean }> = ({
  item,
  chargeTubes,
}) => {
  const [open, setOpen] = React.useState(false);
  const look = tubeAppearance(item.title, item.instruction);
  const tests = item.tests ?? [];

  return (
    <Paper
      variant="outlined"
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "12px",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      {/* Цветная ось пробирки — тот же приём, что у оси специалиста в форме
          приёма (`ServiceGroupShell`): цвет ведёт взгляд по карточке. */}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: look.cap,
        }}
      />

      <Stack
        direction="row"
        spacing={1.5}
        alignItems="flex-start"
        sx={{ pl: 2, pr: 1.5, py: 1.25 }}
      >
        <TubeGlyph look={look} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="baseline"
            gap={1}
          >
            <Typography variant="body2" fontWeight={600}>
              {item.title}
            </Typography>
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
            >
              {item.count} шт
              {chargeTubes
                ? ` · ${formatKGS(money(item.price) * item.count)}`
                : null}
            </Typography>
          </Stack>

          <Typography variant="caption" sx={{ color: look.cap, fontWeight: 600 }}>
            {look.label}
          </Typography>

          {tests.length > 0 && (
            <Stack
              direction="row"
              flexWrap="wrap"
              gap={0.5}
              alignItems="center"
              sx={{ mt: 1 }}
            >
              <Typography variant="caption" color="text.secondary">
                Под анализы:
              </Typography>
              {tests.map((title) => (
                <Chip
                  key={title}
                  label={title}
                  size="small"
                  variant="outlined"
                  sx={{ maxWidth: "100%", height: 22 }}
                />
              ))}
            </Stack>
          )}

          {item.instruction && (
            <>
              <Divider sx={{ my: 1 }} />
              <Stack
                direction="row"
                alignItems="center"
                gap={0.5}
                onClick={() => setOpen((was) => !was)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setOpen((was) => !was);
                  }
                }}
                sx={{ cursor: "pointer", userSelect: "none", width: "fit-content" }}
              >
                <Typography variant="caption" color="primary" fontWeight={600}>
                  {open ? "Свернуть инструкцию" : "Инструкция по пробирке"}
                </Typography>
                <ExpandMoreIcon
                  fontSize="small"
                  color="primary"
                  sx={{
                    transition: "transform .2s",
                    transform: open ? "rotate(180deg)" : "none",
                  }}
                />
              </Stack>
              <Collapse in={open} unmountOnExit>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.75 }}
                >
                  {item.instruction}
                </Typography>
              </Collapse>
            </>
          )}
        </Box>
      </Stack>
    </Paper>
  );
};

/**
 * Read-only список пробирок для медсестры: что взять, сколько, под какие
 * анализы и по какой инструкции — именно медсестра, а не регистратор,
 * отвечает на вопрос «какую пробирку брать».
 *
 * Цена — только когда клиника берёт с пациента отдельную плату за пробирки
 * (`chargeTubes`): иначе строка с ценой намекала бы на доплату, которой на
 * самом деле нет.
 */
const InstrumentsSection: React.FC<Props> = ({
  instruments,
  loading,
  chargeTubes,
}) => {
  const total = instruments.reduce((sum, item) => sum + item.count, 0);

  return (
    <IntakeSection
      title="Пробирки"
      loading={loading}
      action={
        instruments.length > 0 ? (
          <Typography variant="caption" color="text.secondary">
            всего {total} шт
          </Typography>
        ) : null
      }
    >
      {loading ? (
        <Stack spacing={1}>
          <Skeleton variant="rounded" height={72} />
          <Skeleton variant="rounded" height={72} />
        </Stack>
      ) : instruments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Пробирки не требуются
        </Typography>
      ) : (
        <Stack spacing={1}>
          {instruments.map((item) => (
            <TubeCard key={item.id} item={item} chargeTubes={chargeTubes} />
          ))}
        </Stack>
      )}
    </IntakeSection>
  );
};

export default InstrumentsSection;
