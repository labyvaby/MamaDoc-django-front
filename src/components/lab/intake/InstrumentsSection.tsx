import React from "react";
import {
  Box,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

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
 * Значок пробирки: крышка в её цвете, стекло чуть тонированное.
 *
 * Рисуется разметкой, а не иконкой: нужен один силуэт, зато в любом из
 * десятка цветов крышек. Мелкий — он опознавательный знак строки, а не
 * иллюстрация.
 */
const TubeGlyph: React.FC<{ look: TubeAppearance }> = ({ look }) => (
  <Box aria-hidden sx={{ width: 12, flexShrink: 0 }}>
    <Box sx={{ height: 5, borderRadius: "2px 2px 0 0", bgcolor: look.cap }} />
    <Box
      sx={{
        height: 17,
        borderRadius: "0 0 6px 6px",
        bgcolor: look.body,
        border: 1,
        borderTop: 0,
        borderColor: look.cap,
      }}
    />
  </Box>
);

/**
 * Одна пробирка — одна строка.
 *
 * Слева цвет крышки (значок и слово), потом название, под ним — под какие
 * анализы; справа количество. Инструкция ЛИС по пробирке — за значком
 * «i»: это три абзаца на каждую пробирку, и раскрытыми они уносили состав
 * набора за экран, а нужны только когда пробирка незнакомая.
 */
const TubeRow: React.FC<{ item: LabInstrument; chargeTubes: boolean }> = ({
  item,
  chargeTubes,
}) => {
  const look = tubeAppearance(item.title, item.instruction);
  const tests = item.tests ?? [];
  return (
    <Stack direction="row" alignItems="center" gap={1.25} sx={{ py: 1 }}>
      <TubeGlyph look={look} />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={500} noWrap>
          {item.title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <Box component="span" sx={{ color: look.cap, fontWeight: 600 }}>
            {look.label}
          </Box>
          {tests.length > 0 && ` · ${tests.join(", ")}`}
        </Typography>
      </Box>

      <Typography
        variant="body2"
        fontWeight={600}
        sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
      >
        {item.count} шт
        {chargeTubes ? ` · ${formatKGS(money(item.price) * item.count)}` : null}
      </Typography>

      {item.instruction ? (
        <Tooltip
          arrow
          placement="left"
          title={
            <Typography variant="caption" sx={{ display: "block", maxWidth: 360 }}>
              {item.instruction}
            </Typography>
          }
        >
          <IconButton size="small" aria-label="Инструкция по пробирке">
            <InfoOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Box sx={{ width: 34, flexShrink: 0 }} />
      )}
    </Stack>
  );
};

/**
 * Пробирки набора для медсестры: что взять, сколько, под какие анализы.
 *
 * Список строками с разделителями, а не карточками: пробирок в наборе две
 * или три, и карточка на каждую занимала пол-экрана, хотя нужного в ней —
 * цвет крышки, название и число.
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
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
        </Stack>
      ) : instruments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Пробирки не требуются
        </Typography>
      ) : (
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
          {instruments.map((item) => (
            <TubeRow key={item.id} item={item} chargeTubes={chargeTubes} />
          ))}
        </Stack>
      )}
    </IntakeSection>
  );
};

export default InstrumentsSection;
