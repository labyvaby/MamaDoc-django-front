/**
 * «Ждут подтверждения» (r4 §18): черновики правил цены, которые сервер сам
 * предложил по событиям календаря с высоким спросом. Черновик выключен и цену
 * не меняет, пока его не включат. «Отклонить» удаляет черновик — автоматика это
 * событие больше не предложит (кнопка «Цена в один клик» в событиях вернёт его).
 */
import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { Link as RouterLink } from "react-router";

import { getErrorMessage } from "../api/client";
import { confirmPricingRule, deletePricingRule, type HotelPricingRule } from "../api/hotel";
import { formatHotelDate } from "./mockDemoData";
import { Surface } from "./hotelUi";

export const PricingRuleDraftsBlock: React.FC<{ drafts: HotelPricingRule[]; canManage: boolean }> = ({ drafts, canManage }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [rejecting, setRejecting] = React.useState<number | null>(null);
  if (drafts.length === 0) return null;
  const tone = theme.palette.warning.main;

  const run = async (rule: HotelPricingRule, action: "confirm" | "reject") => {
    setBusyId(rule.id);
    try {
      if (action === "confirm") await confirmPricingRule(rule.id);
      else await deletePricingRule(rule.id);
      void queryClient.invalidateQueries({ queryKey: ["hotel", "pricingRules"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "cityEvents"] });
      enqueueSnackbar(action === "confirm" ? `«${rule.name}» включено — цены на эти даты изменились` : `«${rule.name}» отклонено`, { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, action === "confirm" ? "Не удалось включить правило" : "Не удалось отклонить"), { variant: "error" });
    } finally {
      setBusyId(null);
      setRejecting(null);
    }
  };

  return (
    <Surface padded={false} sx={{ overflow: "hidden", borderColor: alpha(tone, 0.4) }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, bgcolor: alpha(tone, theme.palette.mode === "dark" ? 0.14 : 0.07) }}>
        <AutoAwesomeOutlined fontSize="small" sx={{ color: tone }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700}>
            Ждут подтверждения · {drafts.length}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Наценки на события с высоким спросом. Пока не включите, цены не меняются.
          </Typography>
        </Box>
      </Stack>
      {drafts.map((r) => {
        const value = Number(r.adjustmentValue);
        const dates = r.conditions.dateFrom
          ? r.conditions.dateTo && r.conditions.dateTo !== r.conditions.dateFrom
            ? `${formatHotelDate(r.conditions.dateFrom)} – ${formatHotelDate(r.conditions.dateTo)}`
            : formatHotelDate(r.conditions.dateFrom)
          : "";
        const busy = busyId === r.id;
        return (
          <Stack
            key={r.id}
            direction={{ xs: "column", md: "row" }}
            alignItems={{ md: "center" }}
            gap={1.25}
            sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, borderTop: 1, borderColor: "divider" }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
                {r.name}{" "}
                <Box component="span" sx={{ color: value > 0 ? "warning.dark" : "success.main", fontWeight: 800, whiteSpace: "nowrap" }}>
                  {value > 0 ? "+" : ""}
                  {value}
                  {r.adjustmentType === "percent" ? "%" : " сом"}
                </Box>
              </Typography>
              {dates && (
                <Typography variant="caption" color="text.secondary">
                  {dates}
                </Typography>
              )}
            </Box>
            {canManage && (
              <Stack direction="row" gap={1} sx={{ flexShrink: 0 }}>
                {rejecting === r.id ? (
                  <>
                    <Button size="small" color="inherit" onClick={() => setRejecting(null)} disabled={busy}>
                      Не отклонять
                    </Button>
                    <Button size="small" color="error" variant="outlined" onClick={() => void run(r, "reject")} disabled={busy}>
                      {busy ? "Отклоняем…" : "Да, больше не предлагать"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="small" component={RouterLink} to={`/pricing-rules/${r.id}`} disabled={busy}>
                      Изменить
                    </Button>
                    <Button size="small" color="inherit" onClick={() => setRejecting(r.id)} disabled={busy}>
                      Отклонить
                    </Button>
                    <Button size="small" variant="contained" disableElevation onClick={() => void run(r, "confirm")} disabled={busy}>
                      {busy ? "Включаем…" : "Включить"}
                    </Button>
                  </>
                )}
              </Stack>
            )}
          </Stack>
        );
      })}
    </Surface>
  );
};

export default PricingRuleDraftsBlock;
