import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";

import type { LabInstrument } from "../../../api/lab";
import { formatKGS } from "../../../utility/format";

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
 * Read-only список пробирок для медсестры: что взять, сколько и по какой
 * инструкции — именно медсестра, а не регистратор, отвечает на вопрос «какую
 * пробирку брать», поэтому инструкция ("instruction") показана рядом с
 * названием, а не спрятана в тултип.
 *
 * Цена — только когда клиника берёт с пациента отдельную плату за пробирки
 * (`chargeTubes`): иначе строка с ценой намекала бы на доплату, которой на
 * самом деле нет.
 */
const InstrumentsSection: React.FC<Props> = ({ instruments, loading, chargeTubes }) => {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" fontWeight={600}>
        Пробирки
      </Typography>

      {loading ? (
        <Stack spacing={1}>
          <Skeleton variant="rounded" height={48} />
          <Skeleton variant="rounded" height={48} />
        </Stack>
      ) : instruments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Пробирки не требуются
        </Typography>
      ) : (
        <Stack spacing={1}>
          {instruments.map((item) => (
            <Box
              key={item.id}
              sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: 1 }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
                <Typography variant="body2" fontWeight={600}>
                  {item.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {item.count} шт
                  {chargeTubes ? ` · ${formatKGS(money(item.price) * item.count)}` : null}
                </Typography>
              </Stack>
              {item.instruction && (
                <Typography variant="caption" color="text.secondary">
                  {item.instruction}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

export default InstrumentsSection;
