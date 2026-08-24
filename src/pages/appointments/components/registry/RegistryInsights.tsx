/**
 * RegistryInsights — разрезы среза: кто, что, когда и чем закрыт чек.
 *
 * Считаются из тех же загруженных записей, что и лента, — отдельных запросов и
 * отчётного эндпоинта не требуется. Для «Всех процедур» четвёртой карточкой
 * идёт списание материалов вместо структуры оплаты: медсестре важнее расход
 * склада, чем разбивка по способам оплаты.
 */
import React from "react";
import { Box, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import { UserAvatar } from "../../../../components/ui/UserAvatar";
import { formatQuantity } from "../../../../utility/format";
import { useT } from "../../../../i18n/VerticalProvider";
import { subtleBg } from "../../../../theme";
import { formatAmount } from "./registryFormat";
import { paymentAccent } from "./registryTypes";
import type { RegistrySlices } from "./registryStats";

interface Props {
  slices: RegistrySlices;
  total: number;
  canViewFinance: boolean;
  /** «Исполнители» / «Медсёстры». */
  performersTitle: string;
  /** «Топ услуг» / «Топ процедур». */
  servicesTitle: string;
  /** Показать карточку списания материалов вместо структуры оплаты. */
  showConsumptions: boolean;
}

const WEEK_DAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 08:00 … 20:00

const InsightCard: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <Paper elevation={0} variant="outlined" sx={{ p: 1.75 }}>
    <Stack direction="row" alignItems="baseline" gap={1} sx={{ mb: 1.5 }}>
      <Typography variant="subtitle2" fontWeight={600}>
        {title}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.disabled" sx={{ ml: "auto" }}>
          {hint}
        </Typography>
      )}
    </Stack>
    {children}
  </Paper>
);

const BarRow: React.FC<{
  label: React.ReactNode;
  value: string;
  ratio: number;
  color?: string;
}> = ({ label, value, ratio, color }) => {
  const theme = useTheme();
  return (
    // На телефоне трек уезжает под строку во всю ширину: рядом с именем и
    // суммой от него оставалось 40px, и сравнивать было нечего.
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr) auto",
          md: "minmax(0, 140px) 1fr 80px",
        },
        alignItems: "center",
        columnGap: 1.25,
        rowGap: 0.5,
        py: { xs: 0.75, md: 0.5 },
      }}
    >
      <Box sx={{ minWidth: 0, overflow: "hidden", order: { xs: 0, md: 0 } }}>{label}</Box>
      <Box
        sx={{
          height: 8,
          borderRadius: "4px",
          bgcolor: subtleBg(theme, true),
          overflow: "hidden",
          gridColumn: { xs: "1 / -1", md: "auto" },
          order: { xs: 2, md: 0 },
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${Math.max(2, Math.round(ratio * 100))}%`,
            borderRadius: "4px",
            bgcolor: color ?? "primary.main",
          }}
        />
      </Box>
      <Typography
        variant="caption"
        sx={{
          textAlign: "right",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          minWidth: { xs: 0, md: 80 },
          order: { xs: 1, md: 0 },
        }}
      >
        {value}
      </Typography>
    </Box>
  );
};

export const RegistryInsights: React.FC<Props> = ({
  slices,
  total,
  canViewFinance,
  performersTitle,
  servicesTitle,
  showConsumptions,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();

  const employeeMax = Math.max(
    1,
    ...slices.employees.map((item) => (canViewFinance ? item.accrued : item.visits)),
  );
  const serviceMax = Math.max(
    1,
    ...slices.services.map((item) => (canViewFinance ? item.sum : item.count)),
  );
  const consumptionMax = Math.max(1, ...slices.consumptions.map((item) => item.quantity));

  const heatMap = new Map(slices.heat.map((cell) => [`${cell.dow}-${cell.hour}`, cell.count]));

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
        gap: 1.5,
      }}
    >
      <InsightCard
        title={performersTitle}
        hint={canViewFinance ? t("journal.insights.byRevenue") : t("journal.insights.byCount")}
      >
        {slices.employees.slice(0, 8).map((item) => (
          <BarRow
            key={item.id}
            label={
              <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
                <UserAvatar name={item.name} size={20} sx={{ borderRadius: "7px", fontSize: "0.55rem" }} />
                <Typography variant="caption" noWrap>
                  {item.name}
                </Typography>
              </Stack>
            }
            value={canViewFinance ? formatAmount(item.accrued) : String(item.visits)}
            ratio={(canViewFinance ? item.accrued : item.visits) / employeeMax}
          />
        ))}
        {slices.employees.length === 0 && (
          <Typography variant="body2" color="text.disabled">
            {t("journal.empty.title")}
          </Typography>
        )}
      </InsightCard>

      <InsightCard
        title={servicesTitle}
        hint={canViewFinance ? t("journal.insights.byRevenue") : t("journal.insights.byCount")}
      >
        {slices.services.slice(0, 8).map((item) => (
          <BarRow
            key={item.name}
            label={
              <Tooltip title={item.name}>
                <Typography variant="caption" noWrap>
                  {item.name}
                </Typography>
              </Tooltip>
            }
            value={canViewFinance ? formatAmount(item.sum) : String(item.count)}
            ratio={(canViewFinance ? item.sum : item.count) / serviceMax}
          />
        ))}
        {slices.services.length === 0 && (
          <Typography variant="body2" color="text.disabled">
            {t("journal.empty.title")}
          </Typography>
        )}
      </InsightCard>

      <InsightCard title={t("journal.insights.peakHours")} hint={t("journal.insights.peakHint")}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `28px repeat(${HOURS.length}, 1fr)`,
            gap: "3px",
          }}
        >
          <Box />
          {HOURS.map((hour) => (
            <Typography
              key={`h-${hour}`}
              variant="caption"
              sx={{ textAlign: "center", fontSize: "0.6rem", color: "text.disabled" }}
            >
              {hour}
            </Typography>
          ))}
          {WEEK_DAYS.map((label, index) => {
            const dow = (index + 1) % 7; // dayjs: 0 — воскресенье
            return (
              <React.Fragment key={label}>
                <Typography variant="caption" sx={{ fontSize: "0.65rem", color: "text.disabled" }}>
                  {label}
                </Typography>
                {HOURS.map((hour) => {
                  const count = heatMap.get(`${dow}-${hour}`) ?? 0;
                  const intensity = slices.heatMax > 0 ? count / slices.heatMax : 0;
                  return (
                    <Tooltip
                      key={`${dow}-${hour}`}
                      title={t("journal.insights.heatCell", { day: label, hour, count })}
                      enterDelay={200}
                    >
                      <Box
                        sx={{
                          height: 20,
                          borderRadius: "3px",
                          bgcolor: count
                            ? alpha(theme.palette.primary.main, 0.14 + intensity * 0.7)
                            : subtleBg(theme, true),
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </React.Fragment>
            );
          })}
        </Box>
      </InsightCard>

      {showConsumptions ? (
        <InsightCard title={t("journal.insights.consumptions")} hint={t("journal.insights.consumptionsHint")}>
          {slices.consumptions.slice(0, 8).map((item) => (
            <BarRow
              key={item.name}
              label={
                <Typography variant="caption" noWrap>
                  {item.name}
                </Typography>
              }
              value={`${formatQuantity(item.quantity)} ${item.unit}`}
              ratio={item.quantity / consumptionMax}
              color={theme.palette.teal.main}
            />
          ))}
          {slices.consumptions.length === 0 && (
            <Typography variant="body2" color="text.disabled">
              {t("journal.insights.noConsumptions")}
            </Typography>
          )}
        </InsightCard>
      ) : (
        <InsightCard
          title={t("journal.insights.paymentMix")}
          hint={t("journal.insights.records", { count: total })}
        >
          <Stack direction="row" sx={{ height: 12, borderRadius: "6px", overflow: "hidden", mb: 1.5 }}>
            {slices.payments.map((item) => (
              <Box
                key={item.status}
                sx={{
                  flex: item.count,
                  bgcolor:
                    item.status === "unknown"
                      ? "divider"
                      : paymentAccent(item.status, theme) ?? theme.palette.text.disabled,
                }}
              />
            ))}
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 0.75 }}>
            {slices.payments.map((item) => (
              <Stack key={item.status} direction="row" alignItems="center" gap={0.75}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "2px",
                    bgcolor:
                      item.status === "unknown"
                        ? "divider"
                        : paymentAccent(item.status, theme) ?? theme.palette.text.disabled,
                  }}
                />
                <Typography variant="caption" color="text.secondary" noWrap>
                  {item.status === "unknown"
                    ? t("journal.insights.paymentUnknown")
                    : t(`journal.payFilter.${item.status}`)}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ ml: "auto", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                >
                  {total > 0 ? Math.round((item.count / total) * 100) : 0}%
                </Typography>
              </Stack>
            ))}
          </Box>
        </InsightCard>
      )}
    </Box>
  );
};

export default RegistryInsights;
