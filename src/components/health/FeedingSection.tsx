import React from "react";
import { Box, ButtonBase, Stack, Typography, alpha, useTheme } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import { updateHealthProfile, type FeedingPeriod, type FeedingType } from "../../api/health";
import { AppButton, CustomDatePicker } from "../ui";
import { FeedingDrawer } from "./FeedingDrawer";
import { healthErrorText } from "./healthForms";
import { FEEDING_SWITCH_REASONS, FEEDING_TYPES, ageLabel, formatDate, optionLabel } from "./healthMeta";
import { useHealthScope, useInvalidateHealth } from "./useHealth";

const NEXT_TYPE: Record<FeedingType, FeedingType> = {
  breast: "mixed",
  mixed: "formula",
  formula: "general",
  general: "general",
};

interface FeedingSectionProps {
  patientId: number;
  birthDate: string | null;
  canManage: boolean;
  /** Периоды от ранних к поздним; текущий — последний. */
  feeding: ReadonlyArray<FeedingPeriod>;
  complementaryFeedingOn: string | null;
}

/** «Вскармливание»: периоды с причиной перевода и первый прикорм. */
export const FeedingSection: React.FC<FeedingSectionProps> = ({ patientId, birthDate, canManage, feeding, complementaryFeedingOn }) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const [drawer, setDrawer] = React.useState<{ open: boolean; period: FeedingPeriod | null }>({ open: false, period: null });
  const current = feeding[feeding.length - 1] ?? null;
  const [firstFoodDraft, setFirstFoodDraft] = React.useState<Dayjs | null>(null);
  React.useEffect(() => {
    setFirstFoodDraft(complementaryFeedingOn ? dayjs(complementaryFeedingOn) : null);
  }, [complementaryFeedingOn]);

  const firstFood = useMutation({
    mutationFn: (date: string | null) => updateHealthProfile(scope, patientId, { complementaryFeedingOn: date }),
    onSuccess: async () => {
      enqueueSnackbar("Первый прикорм отмечен", { variant: "success" });
      await invalidate();
    },
    onError: (error) => enqueueSnackbar(healthErrorText(error), { variant: "error" }),
  });

  const tone = (type: FeedingType) =>
    type === "breast" ? theme.palette.success.main : type === "general" ? theme.palette.info.main : theme.palette.warning.main;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1 }}>
        <Box>
          <Typography variant="subtitle2">Вскармливание</Typography>
          <Typography variant="caption" color="text.secondary">
            {current
              ? `Сейчас: ${optionLabel(FEEDING_TYPES, current.feedingType).toLowerCase()} с ${formatDate(current.startedOn)}`
              : "Не отмечено"}
          </Typography>
        </Box>
        {canManage && (
          <AppButton
            size="small"
            variant="outlined"
            startIcon={<AddOutlined />}
            onClick={() => setDrawer({ open: true, period: null })}
          >
            {current ? "Перевод" : "Отметить"}
          </AppButton>
        )}
      </Stack>
      {feeding.length > 0 && (
        <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="stretch" sx={{ mb: 1.5 }}>
          {feeding.map((period) => {
            const color = tone(period.feedingType);
            const age = ageLabel(birthDate, period.startedOn);
            return (
              <ButtonBase
                key={period.id}
                disabled={!canManage}
                onClick={() => setDrawer({ open: true, period })}
                sx={{
                  display: "block",
                  textAlign: "left",
                  px: 1.25,
                  py: 0.75,
                  borderRadius: "10px",
                  border: 1,
                  borderColor: alpha(color, 0.4),
                  bgcolor: alpha(color, period === current ? 0.16 : 0.06),
                }}
              >
                <Typography variant="body2" fontWeight={700} sx={{ color }}>
                  {optionLabel(FEEDING_TYPES, period.feedingType)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  с {formatDate(period.startedOn)}
                  {age ? ` · ${age}` : ""}
                </Typography>
                {period.switchReason && (
                  <Typography variant="caption" color="warning.main" display="block">
                    {optionLabel(FEEDING_SWITCH_REASONS, period.switchReason)}
                  </Typography>
                )}
              </ButtonBase>
            );
          })}
        </Stack>
      )}
      <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "center" }}>
        <Stack direction="row" gap={0.75} alignItems="center">
          <RestaurantOutlined fontSize="small" color="action" />
          <Typography variant="body2">
            Первый прикорм:{" "}
            <b>
              {complementaryFeedingOn
                ? `${formatDate(complementaryFeedingOn)}${ageLabel(birthDate, complementaryFeedingOn) ? ` · в ${ageLabel(birthDate, complementaryFeedingOn)}` : ""}`
                : "не отмечен"}
            </b>
          </Typography>
        </Stack>
        {canManage && (
          <Box sx={{ maxWidth: 220 }}>
            {/* Сохраняется по выбору в календаре, а не на каждую цифру ввода. */}
            <CustomDatePicker
              label="Дата прикорма"
              value={firstFoodDraft}
              onChange={(value) => setFirstFoodDraft(value as Dayjs | null)}
              minDate={birthDate ? dayjs(birthDate) : undefined}
              maxDate={dayjs()}
              onAccept={(value) => {
                const date = value as Dayjs | null;
                if (date && date.isValid() && birthDate && date.isBefore(dayjs(birthDate), "day")) {
                  enqueueSnackbar("Прикорм не может быть раньше рождения", { variant: "warning" });
                  return;
                }
                firstFood.mutate(date && date.isValid() ? date.format("YYYY-MM-DD") : null);
              }}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
          </Box>
        )}
      </Stack>
      <FeedingDrawer
        open={drawer.open}
        patientId={patientId}
        birthDate={birthDate}
        period={drawer.period}
        suggestedType={current ? NEXT_TYPE[current.feedingType] : "breast"}
        onClose={() => setDrawer({ open: false, period: null })}
      />
    </Box>
  );
};
