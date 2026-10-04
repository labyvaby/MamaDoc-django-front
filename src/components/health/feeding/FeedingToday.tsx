import React from "react";
import { Box, ButtonBase, Stack, Typography, alpha, useTheme } from "@mui/material";
import PauseCircleOutlineRounded from "@mui/icons-material/PauseCircleOutlineRounded";
import ScheduleRounded from "@mui/icons-material/ScheduleRounded";

import { READINESS_TEXT } from "./feedingNorms";
import type { FeedingToday as Plan, Suggestion } from "./feedingAdvice";
import type { FoodProduct } from "./feedingCatalog";
import { FeedingPanel, NoticeLine } from "./FeedingParts";

/** Продукт-кнопка: открывает окно отметки с ним (если можно отмечать). */
const ProductButton: React.FC<{ item: Suggestion; strong?: boolean; canManage: boolean; onPick: (product: FoodProduct) => void }> = ({
  item,
  strong = false,
  canManage,
  onPick,
}) => {
  const theme = useTheme();
  const sx = {
    display: "inline-flex",
    alignItems: "center",
    px: strong ? 1.5 : 1.1,
    py: strong ? 0.5 : 0.25,
    borderRadius: "999px",
    fontSize: strong ? 15 : 13,
    fontWeight: strong ? 700 : 600,
    color: theme.palette.primary.onSurface,
    bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.22 : 0.11),
    border: `1px dashed ${alpha(theme.palette.primary.main, 0.55)}`,
    lineHeight: 1.4,
  } as const;
  if (!canManage) {
    return (
      <Box component="span" sx={sx}>
        {item.name}
      </Box>
    );
  }
  return (
    <ButtonBase
      onClick={() => onPick(item.product)}
      title="Отметить, что дали"
      sx={{ ...sx, "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.2) } }}
    >
      {item.name}
    </ButtonBase>
  );
};

interface FeedingTodayProps {
  plan: Plan;
  /** «8 мес · скорр. 6 мес». */
  ageText: string;
  canManage: boolean;
  onPick: (product: FoodProduct) => void;
}

/** «Сегодня» (§3.8): одна фраза — что дать дальше, сколько, или почему пауза. */
export const FeedingToday: React.FC<FeedingTodayProps> = ({ plan, ageText, canManage, onPick }) => {
  const theme = useTheme();
  return (
    <FeedingPanel title={`Сегодня · ${ageText}`} caption="рекомендация, врач подтверждает">
      {plan.kind === "suggest" && plan.main ? (
        <Stack gap={1}>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">
              Можно ввести:
            </Typography>
            <ProductButton item={plan.main} strong canManage={canManage} onPick={onPick} />
          </Stack>
          {plan.main.product.note && (
            <Typography variant="caption" color="text.secondary">
              {plan.main.product.name}: {plan.main.product.note}
            </Typography>
          )}
          <Typography variant="body2">{plan.detail}</Typography>
          {plan.more.length > 0 && (
            <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
              <Typography variant="body2" color="text.secondary">
                Ещё можно:
              </Typography>
              {plan.more.map((item) => (
                <ProductButton key={item.product.code} item={item} canManage={canManage} onPick={onPick} />
              ))}
            </Stack>
          )}
        </Stack>
      ) : plan.kind === "pause" ? (
        <Stack direction="row" gap={1} alignItems="flex-start">
          <PauseCircleOutlineRounded sx={{ color: theme.palette.warning.main, mt: "1px" }} />
          <Typography variant="body2" fontWeight={500}>
            {plan.text}
          </Typography>
        </Stack>
      ) : (
        <Stack gap={0.75}>
          <Stack direction="row" gap={1} alignItems="flex-start">
            <ScheduleRounded sx={{ color: theme.palette.text.secondary, mt: "1px" }} fontSize="small" />
            <Typography variant="body2" fontWeight={500}>
              {plan.text}
            </Typography>
          </Stack>
          {plan.detail && (
            <Typography variant="body2" color="text.secondary">
              {plan.detail}
            </Typography>
          )}
        </Stack>
      )}
      {plan.readiness && <NoticeLine tone="on">{READINESS_TEXT}</NoticeLine>}
      {plan.hints.length > 0 && (
        <Stack gap={0.5} sx={{ pt: 0.25 }}>
          {plan.hints.map((hint) => (
            <NoticeLine key={hint} tone="muted">
              {hint}
            </NoticeLine>
          ))}
        </Stack>
      )}
    </FeedingPanel>
  );
};
