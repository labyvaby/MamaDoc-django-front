import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import RadioButtonUncheckedRounded from "@mui/icons-material/RadioButtonUncheckedRounded";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { completeOnboarding, getOnboarding } from "../../api/health";
import { DJANGO_DETAIL_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { AppButton } from "../ui";
import { healthErrorText } from "./healthForms";
import { ONBOARDING_ITEMS, REQUIRED_ONBOARDING, formatDate } from "./healthMeta";
import { useHealthScope } from "./useHealth";

interface OnboardingChecklistCardProps {
  enrollmentId: number;
  canComplete: boolean;
  /** Компактно — для окна заключения. */
  dense?: boolean;
}

/**
 * Чек-лист первичного осмотра подключения: рождение, аллергии, группа
 * здоровья обязательны; закрытие уводит ребёнка из «Ожидают осмотра».
 */
export const OnboardingChecklistCard: React.FC<OnboardingChecklistCardProps> = ({ enrollmentId, canComplete, dense }) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { orgId, scope, ready } = useHealthScope();
  const query = useQuery({
    queryKey: djangoQueryKeys.health.onboarding(enrollmentId, orgId),
    queryFn: ({ signal }) => getOnboarding(scope, enrollmentId, signal),
    enabled: ready,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const complete = useMutation({
    mutationFn: () => completeOnboarding(scope, enrollmentId),
    onSuccess: async () => {
      enqueueSnackbar("Первичный осмотр закрыт", { variant: "success" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: djangoQueryKeys.health.onboarding(enrollmentId, orgId) }),
        queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.all }),
      ]);
    },
    onError: (error) => enqueueSnackbar(healthErrorText(error), { variant: "error" }),
  });

  const data = query.data;
  if (!data) return null;
  if (data.completedAt) {
    return dense ? null : (
      <Stack direction="row" gap={1} alignItems="center">
        <TaskAltOutlined fontSize="small" color="success" />
        <Typography variant="body2" color="text.secondary">
          Первичный осмотр закрыт {formatDate(data.completedAt)}
          {data.completedBy ? ` · ${data.completedBy.fullName}` : ""}
        </Typography>
      </Stack>
    );
  }

  const canClose = data.missing.length === 0;
  return (
    <Alert
      severity={canClose ? "success" : "warning"}
      icon={false}
      sx={{ "& .MuiAlert-message": { width: "100%" }, py: dense ? 0.5 : 1 }}
    >
      <Stack direction={{ xs: "column", md: "row" }} gap={1.5} justifyContent="space-between" alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="body2" fontWeight={700}>
            Первичный осмотр
          </Typography>
          <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
            {ONBOARDING_ITEMS.map((item) => {
              const done = data.checklist[item.value];
              const required = REQUIRED_ONBOARDING.includes(item.value);
              return (
                <Stack key={item.value} direction="row" gap={0.5} alignItems="center">
                  {done ? (
                    <CheckCircleRounded sx={{ fontSize: 16 }} color="success" />
                  ) : (
                    <RadioButtonUncheckedRounded sx={{ fontSize: 16 }} color={required ? "warning" : "disabled"} />
                  )}
                  <Typography variant="caption" color={done ? "text.primary" : "text.secondary"}>
                    {item.label}
                    {required ? "" : " (по желанию)"}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        </Box>
        {canComplete && (
          <AppButton
            variant="contained"
            size="small"
            color={canClose ? "success" : "inherit"}
            disabled={!canClose}
            loading={complete.isPending}
            onClick={() => complete.mutate()}
            sx={{ flexShrink: 0 }}
          >
            Закрыть осмотр
          </AppButton>
        )}
      </Stack>
    </Alert>
  );
};
