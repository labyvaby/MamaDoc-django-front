import React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import CheckOutlined from "@mui/icons-material/CheckOutlined";

import { BOOKING_SHADOW, TILE_RADIUS, stepTone } from "../theme";
import { useT } from "../../../i18n/VerticalProvider";

export type BookingStep = 1 | 2 | 3;

/**
 * Индикатор шагов записи «Дата → Время → Услуги».
 *
 * Шаги здесь не переключают экраны: все блоки видны сразу, а индикатор
 * показывает, что уже выбрано. Пройденный шаг зелёный с галочкой, текущий —
 * синий с подсветкой, будущий — серый контур.
 */
export const StepIndicator: React.FC<{ current: BookingStep }> = ({ current }) => {
  const { t } = useT("publicBooking");
  const steps = [t("stepDate"), t("stepTime"), t("stepServices")];

  return (
    <Paper
      elevation={0}
      sx={{ px: 1.75, py: 1.25, borderRadius: TILE_RADIUS, border: "none", boxShadow: BOOKING_SHADOW }}
    >
      <Stack direction="row" alignItems="center">
        {steps.map((label, index) => {
          const num = index + 1;
          const done = num < current;
          const active = num === current;
          return (
            <React.Fragment key={label}>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexShrink: 0 }}>
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    transition: "all .2s",
                    ...(active
                      ? {
                          bgcolor: stepTone.active,
                          color: "#FFFFFF",
                          boxShadow: `0 0 0 3px ${stepTone.active}26`,
                        }
                      : done
                        ? { bgcolor: stepTone.done, color: "#FFFFFF" }
                        : {
                            bgcolor: "#FFFFFF",
                            color: stepTone.idle.text,
                            border: `2px solid ${stepTone.idle.border}`,
                          }),
                  }}
                >
                  {done ? <CheckOutlined sx={{ fontSize: 13 }} /> : num}
                </Box>
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    color: active ? stepTone.active : done ? stepTone.done : stepTone.idle.text,
                  }}
                >
                  {label}
                </Typography>
              </Stack>
              {index < steps.length - 1 && (
                <Box
                  sx={{
                    flexGrow: 1,
                    height: 2,
                    mx: 1.25,
                    borderRadius: 999,
                    transition: "background-color .2s",
                    bgcolor: done ? stepTone.done : stepTone.idle.line,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </Stack>
    </Paper>
  );
};
