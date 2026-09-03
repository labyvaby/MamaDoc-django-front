/**
 * RegistrySummaryBar — сводка периода: плитки-показатели слева, пульс месяца
 * справа.
 *
 * Плитки одновременно фильтры: клик по «Долгу» оставляет в ленте только
 * незакрытые счета. Столбик пульса — день месяца, разделённый на оплаченное и
 * долг; клик сужает срез до этого дня.
 *
 * Без права `finance.view` деньги не показываем вовсе: плитки считают записи
 * (всего / оплачено / со скидкой), пульс рисует количество приёмов.
 */
import React from "react";
import { Box, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import { subtleBg } from "../../../../theme";
import { useT } from "../../../../i18n/VerticalProvider";
import { getStatusAccent } from "../../../../config/appointmentStatuses";
import { formatAmount } from "./registryFormat";
import type { PulseBucket } from "./registryStats";
import type { RegistryTileKey } from "./registryTypes";

/**
 * Плитка сводки. `key` задан — плитка работает фильтром (статус оплаты или
 * флаг оси цены); null — просто показатель (набор плиток задаёт профиль
 * модуля, см. RegistryJournalView).
 */
export interface SummaryTile {
  key: RegistryTileKey | null;
  label: string;
  value: string;
  unit?: string;
  hint: string;
  /** Акцент активного состояния: "paid" | "debt" | "primary". */
  accent?: "paid" | "debt" | "primary";
}

interface Props {
  tiles: SummaryTile[];
  pulse: PulseBucket[];
  /**
   * Активна ли плитка и что делает клик — решает журнал: ключ может быть
   * статусом оплаты (одиночный выбор) или флагом цены (мультивыбор).
   */
  isTileActive: (key: RegistryTileKey) => boolean;
  onToggleTile: (key: RegistryTileKey) => void;
  /** Выбранная корзина пульса: день месяца или месяц года. */
  selectedBucket: string | null;
  onSelectBucket: (key: string | null) => void;
  canViewFinance: boolean;
  /** Подпись пульса: «Пульс месяца» / «Пульс года». */
  pulseTitle: string;
}

export const RegistrySummaryBar: React.FC<Props> = ({
  tiles,
  pulse,
  isTileActive,
  onToggleTile,
  selectedBucket,
  onSelectBucket,
  canViewFinance,
  pulseTitle,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();

  const debtAccent = getStatusAccent("debt", theme);
  const accentColor = (accent: SummaryTile["accent"]): string =>
    accent === "paid"
      ? getStatusAccent("paid", theme).main
      : accent === "debt"
      ? debtAccent.main
      : theme.palette.primary.main;

  // Плотная шкала (месяц по дням) на узком экране подписывается через одну
  // пятёрку; год из 12 столбиков помещается целиком.
  const dense = pulse.length > 14;

  const pulseMax = Math.max(
    1,
    ...pulse.map((bucket) => (canViewFinance ? bucket.paid + bucket.debt : bucket.visits)),
  );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          lg: "minmax(0, 1.05fr) minmax(0, 1fr)",
        },
        gap: 1.5,
      }}
    >
      {/* Карточки в одной сетке равны по высоте: плитки тянем на всю высоту,
          иначе под ними оставалась пустая полоса под карточку пульса. */}
      <Paper
        elevation={0}
        variant="outlined"
        sx={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
      >
        {/* ⚠ Ломаем сетку по md (768), а не по sm: в теме sm = 360px, и телефон
            в него попадает — четыре плитки уезжали за край экрана.
            minmax(0, 1fr), а не 1fr: иначе колонка не сжимается ниже длины
            подписи («начислено 1,3 млн»), и карточка распирает страницу. */}
        <Box
          sx={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0, 1fr))",
              md: "repeat(4, minmax(0, 1fr))",
            },
          }}
        >
          {tiles.map((tile, index) => {
            const active = tile.key != null && isTileActive(tile.key);
            const accent = accentColor(tile.accent);
            return (
              <Box
                key={tile.label}
                component={tile.key ? "button" : "div"}
                type={tile.key ? "button" : undefined}
                aria-pressed={tile.key ? active : undefined}
                onClick={tile.key ? () => onToggleTile(tile.key as RegistryTileKey) : undefined}
                sx={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  textAlign: "left",
                  font: "inherit",
                  color: "inherit",
                  border: 0,
                  borderRight: {
                    xs: index % 2 === 0 ? 1 : 0,
                    md: index < tiles.length - 1 ? 1 : 0,
                  },
                  borderBottom: { xs: index < 2 ? 1 : 0, md: 0 },
                  borderColor: "divider",
                  bgcolor: active ? alpha(accent, theme.palette.mode === "dark" ? 0.16 : 0.08) : "transparent",
                  cursor: tile.key ? "pointer" : "default",
                  px: 1.75,
                  py: 1.5,
                  transition: "background-color .15s ease",
                  "&:hover": tile.key
                    ? {
                        bgcolor: active
                          ? alpha(accent, theme.palette.mode === "dark" ? 0.22 : 0.12)
                          : subtleBg(theme),
                      }
                    : undefined,
                  "&::before": active
                    ? {
                        content: '""',
                        position: "absolute",
                        insetBlock: 0,
                        left: 0,
                        width: 2,
                        bgcolor: accent,
                      }
                    : undefined,
                }}
              >
                <Typography variant="caption" color="text.secondary" display="block" noWrap>
                  {tile.label}
                </Typography>
                <Typography
                  noWrap
                  sx={{
                    mt: 0.25,
                    fontSize: { xs: "1.15rem", md: "1.3rem" },
                    fontWeight: 600,
                    letterSpacing: "-0.6px",
                    lineHeight: 1.2,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {tile.value}
                  {tile.unit && (
                    <Box
                      component="span"
                      sx={{ ml: 0.5, fontSize: "0.75rem", fontWeight: 500, color: "text.disabled" }}
                    >
                      {tile.unit}
                    </Box>
                  )}
                </Typography>
                <Typography variant="caption" color="text.disabled" display="block" noWrap>
                  {tile.hint}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Paper>

      <Paper elevation={0} variant="outlined" sx={{ px: 1.75, py: 1.25 }}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {pulseTitle}
          </Typography>
          {canViewFinance && (
            <Stack direction="row" gap={1.5} sx={{ ml: "auto" }}>
              <Stack direction="row" alignItems="center" gap={0.5}>
                <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: alpha(theme.palette.primary.main, 0.85) }} />
                <Typography variant="caption" color="text.disabled">
                  {t("journal.pulse.paid")}
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" gap={0.5}>
                <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: debtAccent.main }} />
                <Typography variant="caption" color="text.disabled">
                  {t("journal.pulse.debt")}
                </Typography>
              </Stack>
            </Stack>
          )}
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridAutoFlow: "column",
            gridAutoColumns: "1fr",
            gap: { xs: "2px", md: "3px" },
            alignItems: "end",
            height: { xs: 68, md: 78 },
          }}
        >
          {pulse.map((bucket, index) => {
            const total = canViewFinance ? bucket.paid + bucket.debt : bucket.visits;
            const height = Math.round((total / pulseMax) * 100);
            const active = selectedBucket === bucket.key;
            const tooltip = canViewFinance
              ? t("journal.pulse.tooltipMoney", {
                  date: bucket.fullLabel,
                  count: bucket.visits,
                  amount: formatAmount(bucket.paid + bucket.debt),
                })
              : t("journal.pulse.tooltipVisits", {
                  date: bucket.fullLabel,
                  count: bucket.visits,
                });
            return (
              <Tooltip key={bucket.key} title={tooltip} enterDelay={200}>
                <Box
                  component="button"
                  type="button"
                  aria-pressed={active}
                  aria-label={tooltip}
                  onClick={() => onSelectBucket(active ? null : bucket.key)}
                  sx={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    // ⚠ У <button> свои UA-стили: align-items и padding 1px 6px.
                    // На узком экране столбик шириной 12px этот padding съедал
                    // целиком, и шкала оставалась пустой — гасим оба.
                    alignItems: "stretch",
                    height: "100%",
                    p: 0,
                    pb: "15px",
                    border: 0,
                    borderRadius: "4px",
                    bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : "transparent",
                    cursor: "pointer",
                    transition: "background-color .12s ease",
                    "&:hover": { bgcolor: active ? alpha(theme.palette.primary.main, 0.14) : subtleBg(theme, true) },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      width: "100%",
                      height: `${Math.max(total > 0 ? 3 : 1, height)}%`,
                      borderRadius: "3px",
                      overflow: "hidden",
                      bgcolor: total > 0 ? "transparent" : "divider",
                    }}
                  >
                    {canViewFinance ? (
                      <>
                        {bucket.debt > 0 && (
                          <Box sx={{ flex: bucket.debt, bgcolor: debtAccent.main, minHeight: 2 }} />
                        )}
                        {bucket.paid > 0 && (
                          <Box
                            sx={{
                              flex: bucket.paid,
                              bgcolor: alpha(theme.palette.primary.main, 0.85),
                              minHeight: 2,
                            }}
                          />
                        )}
                      </>
                    ) : (
                      bucket.visits > 0 && (
                        <Box sx={{ flex: 1, bgcolor: alpha(theme.palette.primary.main, 0.85) }} />
                      )
                    )}
                  </Box>
                  {/* На телефоне 31 подпись сливается в кашу: печатаем каждую
                      пятую и выбранный столбик, шкала остаётся читаемой. */}
                  <Typography
                    component="span"
                    sx={{
                      position: "absolute",
                      bottom: 1,
                      left: 0,
                      right: 0,
                      textAlign: "center",
                      fontSize: "0.6rem",
                      fontVariantNumeric: "tabular-nums",
                      color: active ? "primary.onSurface" : bucket.muted ? "text.disabled" : "text.secondary",
                      fontWeight: active ? 600 : 400,
                      display: {
                        xs: dense && !active && index % 5 !== 0 ? "none" : "block",
                        md: "block",
                      },
                    }}
                  >
                    {bucket.label}
                  </Typography>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      </Paper>
    </Box>
  );
};

export default RegistrySummaryBar;
