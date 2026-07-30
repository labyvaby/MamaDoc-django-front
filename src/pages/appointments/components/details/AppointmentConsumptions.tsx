import React from "react";
import { Avatar, Box, Chip, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";

import {
  APPOINTMENT_CONSUMPTIONS_ENABLED,
  billableConsumptionsTotal,
  consumptionLineTotal,
  type AppointmentServiceLine,
} from "../../../../api/appointments";
import { formatKGS, formatQuantity } from "../../../../utility/format";
import { useT } from "../../../../i18n/VerticalProvider";

export interface AppointmentConsumptionsProps {
  services: AppointmentServiceLine[];
}

/**
 * Расходники услуг приёма: что уйдёт со склада при завершении.
 *
 * Отдельно от товаров визита (`AppointmentProductLines`) намеренно: со склада
 * они списываются как расход услуги, а не как продажа. В деньгах расходники
 * разные: бесплатный входит в цену услуги (сумму не показываем — её нет),
 * платный (`billable`) оплачивается сверх неё, и его сумма уже включена в
 * `totalAmount` приёма — её и показываем.
 *
 * Нехватка остатка — предупреждение, а не ошибка: бэк завершает приём и уводит
 * остаток в минус, блокировать завершение нельзя.
 */
const AppointmentConsumptions: React.FC<AppointmentConsumptionsProps> = ({ services }) => {
  const { t } = useT("appointments");
  const theme = useTheme();

  if (!APPOINTMENT_CONSUMPTIONS_ENABLED) return null;

  const lines = services.filter((sl) => (sl.consumptions?.length ?? 0) > 0);
  if (lines.length === 0) return null;

  const shortages = lines.flatMap((sl) => sl.consumptions.filter((c) => c.shortage));
  const extraCharge = billableConsumptionsTotal(lines);

  return (
    <Box>
      {/* Заголовок и цена — своей строкой; поясняющий текст — под ними на всю
          ширину. Раньше все три жили в одной row-Stack: цена (flexShrink: 0)
          отжимала подсказку до полоски в 85px, и предложение переносилось по
          одному-два слова — на узких экранах читалось как каша из строк. */}
      <Stack
        direction="row"
        alignItems="baseline"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 0.25 }}
      >
        <Typography variant="caption" color="text.secondary">
          {t("consumptions.title")}
        </Typography>
        {extraCharge > 0 && (
          <Typography variant="caption" fontWeight={600} sx={{ flexShrink: 0 }}>
            {t("consumptions.billableTotal")}:{" "}
            {t("consumptions.extra", { amount: formatKGS(extraCharge) })}
          </Typography>
        )}
      </Stack>
      <Typography variant="caption" color="text.disabled" display="block" sx={{ mb: 0.5 }}>
        {t("consumptions.hint")}
      </Typography>

      {shortages.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            p: 1.25,
            mb: 1,
            borderRadius: 1.5,
            borderColor: "warning.main",
            bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === "dark" ? 0.14 : 0.07),
          }}
        >
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <WarningAmberOutlined sx={{ fontSize: 18, color: "warning.main", mt: 0.125 }} />
            <Box sx={{ minWidth: 0 }}>
              {shortages.map((c) => (
                <Typography key={c.id} variant="caption" display="block" color="text.primary">
                  {t("consumptions.shortageLine", {
                    name: c.name,
                    required: formatQuantity(c.quantity),
                    stock: formatQuantity(c.stockOnHand),
                    resulting: formatQuantity(c.resultingStock),
                  })}
                </Typography>
              ))}
            </Box>
          </Stack>
        </Paper>
      )}

      <Stack spacing={1}>
        {lines.map((sl) => (
          <Box key={sl.id}>
            {/* Название услуги: расходник без него читается как «товар из ниоткуда». */}
            <Typography variant="caption" color="text.disabled" display="block" sx={{ mb: 0.25 }}>
              {sl.service?.name ?? "—"}
            </Typography>
            <Stack spacing={0.75}>
              {sl.consumptions.map((c) => {
                const lineTotal = consumptionLineTotal(c);
                const hasChips = c.billable || !c.autoWriteOff || c.resultingStock !== null;
                return (
                  <Paper
                    key={c.id}
                    variant="outlined"
                    sx={{
                      p: 1.25,
                      pl: 1.5,
                      borderRadius: 1.5,
                      bgcolor: "background.paper",
                      ...(c.shortage && { borderColor: "warning.main" }),
                    }}
                  >
                    {/* Аватар+текст своей строкой, чипы — под ними отдельной
                        строкой с переносом. Раньше чипы (фикс. ширины) стояли
                        справа в одной row с текстом: на узком экране текстовому
                        блоку оставалось ~60px, и название/количество/сумма
                        разваливались по одному слову на строку. */}
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <Avatar
                        variant="rounded"
                        sx={{
                          width: 32,
                          height: 32,
                          bgcolor: "action.selected",
                          color: "text.secondary",
                          flexShrink: 0,
                        }}
                      >
                        <ScienceOutlined sx={{ fontSize: 18 }} />
                      </Avatar>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {c.name}
                          </Typography>
                          {c.source === "manual" && (
                            <Tooltip title={t("consumptions.manual")}>
                              <EditNoteOutlined
                                sx={{ fontSize: 16, color: "text.disabled", flexShrink: 0 }}
                              />
                            </Tooltip>
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {t("consumptions.quantity", {
                            quantity: formatQuantity(c.quantity),
                            unit: c.unit ? ` ${c.unit}` : "",
                          })}
                          {" · "}
                          {c.stockOnHand === null
                            ? t("consumptions.stockUnknown")
                            : t("consumptions.stock", { stock: formatQuantity(c.stockOnHand) })}
                        </Typography>
                        {/* Сумму показываем только когда цена известна: у платной
                            строки без unitPrice «+ 0 сом» врал бы про чек. */}
                        {lineTotal > 0 && (
                          <Typography
                            variant="caption"
                            color="primary.onSurface"
                            fontWeight={600}
                            display="block"
                          >
                            {t("consumptions.extra", { amount: formatKGS(lineTotal) })}
                          </Typography>
                        )}

                        {hasChips && (
                          <Stack
                            direction="row"
                            spacing={0.75}
                            flexWrap="wrap"
                            useFlexGap
                            sx={{ mt: 0.75 }}
                          >
                            {c.billable && (
                              <Tooltip title={t("consumptions.billableHint")}>
                                <Chip
                                  label={t("consumptions.billable")}
                                  size="small"
                                  color="primary"
                                  sx={{ borderRadius: "7px" }}
                                />
                              </Tooltip>
                            )}

                            {!c.autoWriteOff ? (
                              <Chip
                                label={t("consumptions.noWriteOff")}
                                size="small"
                                variant="outlined"
                                sx={{ borderRadius: "7px" }}
                              />
                            ) : (
                              c.resultingStock !== null && (
                                <Chip
                                  label={t("consumptions.afterCompletion", {
                                    resulting: formatQuantity(c.resultingStock),
                                  })}
                                  size="small"
                                  variant="outlined"
                                  color={c.shortage ? "warning" : "default"}
                                  sx={{ borderRadius: "7px" }}
                                />
                              )
                            )}
                          </Stack>
                        )}
                      </Box>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

export default AppointmentConsumptions;
